import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import TicketWall, {
  type TicketWallItem,
  type TicketWallSnapshot,
  type TicketWallStep,
} from "@/components/ticket-wall";

export const metadata = { title: "Ticket Wall Dashboard" };

const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "PENDING", "SOLVED", "CLOSED"] as const;
const APP_TIME_ZONE = "Asia/Makassar";

function todayInputValue() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validDateInput(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rangeFromSearchParams(fromValue?: string, toValue?: string) {
  const defaultDate = todayInputValue();
  const fromInput = validDateInput(fromValue) ? fromValue! : defaultDate;
  const toInput = validDateInput(toValue) ? toValue! : fromInput;
  const from = validDateInput(fromInput)!;
  const to = validDateInput(toInput)!;
  if (from.getTime() > to.getTime()) {
    return {
      fromInput: toInput,
      toInput: fromInput,
      from: to,
      to: new Date(from.getTime() + 86400e3),
    };
  }
  return {
    fromInput,
    toInput,
    from,
    to: new Date(to.getTime() + 86400e3),
  };
}

function maskPhone(phone: string | null | undefined) {
  const value = phone?.trim() ?? "";
  if (!value) return null;
  if (value.length <= 4) return "••••";
  const visiblePrefix = value.slice(0, Math.min(2, value.length - 4));
  return `${visiblePrefix}${"•".repeat(Math.max(2, value.length - visiblePrefix.length - 4))}${value.slice(-4)}`;
}

function splitTags(tags: string | null) {
  return [...new Set((tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function workflowSnapshot(
  workflow: { name: string; steps: Array<{ id: string; name: string; order: number }> } | null,
  progress: Array<{ stepId: string; doneAt: Date | null }>
) {
  if (!workflow || workflow.steps.length === 0) return null;
  const progressByStep = new Map(progress.map((item) => [item.stepId, item]));
  const firstIncomplete = workflow.steps.findIndex((step) => !progressByStep.get(step.id)?.doneAt);
  const completed = workflow.steps.filter((step) => Boolean(progressByStep.get(step.id)?.doneAt)).length;
  const steps: TicketWallStep[] = workflow.steps.map((step, index) => ({
    id: step.id,
    label: step.name,
    state: progressByStep.get(step.id)?.doneAt
      ? "DONE"
      : index === firstIncomplete
        ? "CURRENT"
        : "PENDING",
  }));
  return {
    name: workflow.name,
    percentage: Math.round((completed / workflow.steps.length) * 100),
    steps,
  };
}

const WORK_ORDER_TYPE_LABELS: Record<string, string> = {
  NEW_INSTALLATION: "Instalasi Baru",
  TROUBLESHOOTING: "Troubleshoot",
  DEVICE_REPLACEMENT: "Penggantian Perangkat",
  DEVICE_RETRIEVAL: "Penarikan Perangkat",
  MAINTENANCE: "Maintenance",
};

export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    status?: string;
    category?: string;
    tag?: string;
    engineer?: string;
  }>;
}) {
  const user = await requirePermission(PERMISSIONS.CTICKETS_VIEW);
  const sp = await searchParams;
  const range = rangeFromSearchParams(sp.from, sp.to);
  const seesAllTickets = user.permissions.has(PERMISSIONS.CTICKETS_MANAGE);
  const canSeeWorkOrders = user.permissions.has(PERMISSIONS.WORK_ORDERS_VIEW);
  const technicianOnly =
    canSeeWorkOrders &&
    user.permissions.has(PERMISSIONS.WORK_ORDERS_EXECUTE) &&
    !user.permissions.has(PERMISSIONS.WORK_ORDERS_CREATE) &&
    !user.permissions.has(PERMISSIONS.WORK_ORDERS_CLOSE) &&
    !user.roles.some((role) => ["super_admin", "management"].includes(role.code));

  const dateFilter = {
    OR: [
      { scheduledAt: { gte: range.from, lt: range.to } },
      { scheduledAt: null, createdAt: { gte: range.from, lt: range.to } },
    ],
  };

  const [tickets, workOrders] = await Promise.all([
    db.customerTicket.findMany({
      where: seesAllTickets
        ? dateFilter
        : {
            AND: [
              dateFilter,
              {
                OR: [
                  { assigneeId: user.id },
                  { members: { some: { userId: user.id } } },
                  { createdById: user.id },
                ],
              },
            ],
          },
      include: {
        customer: true,
        category: { include: { workflow: { include: { steps: { orderBy: { order: "asc" } } } } } },
        assignee: true,
        progress: true,
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    }),
    canSeeWorkOrders
      ? db.workOrder.findMany({
          where: {
            scheduledAt: { gte: range.from, lt: range.to },
            ...(technicianOnly ? { technicianId: user.id } : {}),
          },
          include: { customer: true, technician: true },
          orderBy: { scheduledAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const statusCounts = Object.fromEntries(TICKET_STATUSES.map((status) => [status, 0]));
  const items: TicketWallItem[] = tickets.map((ticket) => {
    statusCounts[ticket.status] = (statusCounts[ticket.status] ?? 0) + 1;
    return {
      kind: "TICKET",
      id: ticket.id,
      number: ticket.ticketNumber,
      title: ticket.title,
      customerName: ticket.customer.name,
      maskedPhone: maskPhone(ticket.customer.phone),
      categoryName: ticket.category.name,
      tags: splitTags(ticket.tags),
      status: ticket.status,
      priority: ticket.priority,
      engineerName: ticket.assignee?.name ?? null,
      assignedAt: null,
      scheduledAt: ticket.scheduledAt?.toISOString() ?? null,
      createdAt: ticket.createdAt.toISOString(),
      href: `/helpdesk/tickets/${ticket.id}`,
      workflow: workflowSnapshot(ticket.category.workflow, ticket.progress),
    };
  });

  for (const workOrder of workOrders) {
    items.push({
      kind: "WORK_ORDER",
      id: workOrder.id,
      number: workOrder.woNumber,
      title: workOrder.description,
      customerName: workOrder.customer?.name ?? null,
      maskedPhone: maskPhone(workOrder.customer?.phone),
      categoryName: WORK_ORDER_TYPE_LABELS[workOrder.type] ?? workOrder.type,
      tags: ["Work Order"],
      status: workOrder.status,
      priority: null,
      engineerName: workOrder.technician?.name ?? null,
      assignedAt: null,
      scheduledAt: workOrder.scheduledAt?.toISOString() ?? null,
      createdAt: workOrder.createdAt.toISOString(),
      href: `/operations/work-orders/${workOrder.id}`,
      workflow: null,
    });
  }

  const snapshot: TicketWallSnapshot = {
    generatedAt: new Date().toISOString(),
    from: range.fromInput,
    to: range.toInput,
    statusCounts,
    totalCount: items.length,
    items,
  };

  return (
    <TicketWall
      snapshot={snapshot}
      initialFilters={{
        status: sp.status ?? "ALL",
        category: sp.category ?? "ALL",
        tag: sp.tag ?? "ALL",
        engineer: sp.engineer ?? "ALL",
      }}
    />
  );
}
