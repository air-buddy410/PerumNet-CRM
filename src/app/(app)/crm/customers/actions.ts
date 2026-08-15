"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import { previewCustomerImport, applyCustomerImport } from "@/lib/customer-import-service";

const schema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(2, "Nama minimal 2 karakter"),
  company: z.string().optional(),
  phone: z.string().min(5, "Telepon wajib diisi"),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  address: z.string().min(5, "Alamat wajib diisi"),
  customerType: z.string().min(1),
  areaId: z.string().optional(),
  salesOwnerId: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  notes: z.string().optional(),
});

export async function updateCustomerAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      `/crm/customers/${formData.get("customerId")}?error=` +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const { customerId, ...d } = parsed.data;
  const before = await db.customer.findUnique({ where: { id: customerId } });
  if (!before) {
    redirect("/crm/customers?error=" + encodeURIComponent("Customer tidak ditemukan."));
  }
  await db.customer.update({
    where: { id: customerId },
    data: {
      name: d.name,
      company: d.company || null,
      phone: d.phone,
      email: d.email || null,
      address: d.address,
      customerType: d.customerType,
      areaId: d.areaId || null,
      salesOwnerId: d.salesOwnerId || null,
      status: d.status,
      notes: d.notes || null,
    },
  });
  await logAudit({
    userId: user.id,
    action: "CUSTOMER_UPDATE",
    module: "customers",
    entityType: "Customer",
    entityId: customerId,
    description: `Mengubah data customer ${before.customerNumber} (${d.name})`,
  });
  revalidatePath("/crm/customers");
  redirect(
    `/crm/customers/${customerId}?ok=` + encodeURIComponent("Data customer tersimpan.")
  );
}

// ── Impor pelanggan & langganan (Fase 68) ───────────────────────
//
// Keduanya MENGEMBALIKAN nilai alih-alih redirect: hasil pratinjau adalah
// tabel yang harus dibaca dulu. Penerapan mengunggah ULANG berkasnya, bukan
// mengirim baris hasil pratinjau.

export async function previewCustomerImportAction(formData: FormData) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_CREATE);
  return previewCustomerImport(user, formData.get("file") as File);
}

export async function applyCustomerImportAction(formData: FormData) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_CREATE);
  const result = await applyCustomerImport(user, formData.get("file") as File);
  if (result.ok) {
    revalidatePath("/crm/customers");
    revalidatePath("/crm/subscriptions");
    revalidatePath("/noc/ftth");
  }
  return result;
}
