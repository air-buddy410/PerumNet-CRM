import { db } from "@/lib/db";
import { fetchPppoeState, MikrotikError, type Fetcher, type PppoeCounts } from "@/lib/mikrotik";

// ── Poller PPPoE (Fase 24, PRD-NOC-TOOLS N2) ────────────────────
// Menarik keadaan PPPoE dari router dan menyimpannya. Read-only terhadap
// router; satu-satunya yang ditulis adalah database kita sendiri.
//
// Kegagalan polling menjadi state yang terlihat (PppoePollRun.status = FAILED
// beserta pesannya), bukan log yang tenggelam.

export interface PollResult {
  ok: boolean;
  runId: string;
  counts?: PppoeCounts;
  matched?: number;
  error?: string;
}

export async function pollRouter(
  routerId: string,
  opts: { fetcher?: Fetcher } = {}
): Promise<PollResult> {
  const router = await db.mikrotikRouter.findUnique({
    where: { id: routerId },
    include: { networkDevice: { select: { hostname: true } } },
  });
  if (!router) return { ok: false, runId: "", error: "Router tidak ditemukan." };

  const run = await db.pppoePollRun.create({
    data: { routerId: router.id, status: "RUNNING" },
  });

  try {
    const { sessions, counts } = await fetchPppoeState({
      baseUrl: router.managementUrl,
      credentialRef: router.credentialRef,
      fetcher: opts.fetcher,
    });

    // Username PPPoE dicocokkan ke langganan lewat Subscription.pppoeUsername
    // yang sudah ada sejak Fase 2 — tidak perlu tabel pemetaan tersendiri.
    const usernames = sessions.map((s) => s.username);
    const subs = usernames.length
      ? await db.subscription.findMany({
          where: { pppoeUsername: { in: usernames } },
          select: { id: true, pppoeUsername: true },
        })
      : [];
    const subByUsername = new Map(
      subs.filter((s) => s.pppoeUsername).map((s) => [s.pppoeUsername!, s.id])
    );

    const now = new Date();
    let matched = 0;
    for (const session of sessions) {
      const subscriptionId = subByUsername.get(session.username) ?? null;
      if (subscriptionId) matched++;
      const payload = {
        subscriptionId,
        callerId: session.callerId,
        address: session.address,
        uptimeSeconds: session.uptimeSeconds,
        status: session.status,
        // lastSeenAt hanya bergerak saat benar-benar online, sehingga bisa
        // dipakai menjawab "sudah berapa lama pelanggan ini tidak muncul".
        ...(session.status === "ONLINE" ? { lastSeenAt: now } : {}),
      };
      await db.pppoeSession.upsert({
        where: { routerId_username: { routerId: router.id, username: session.username } },
        update: payload,
        create: { routerId: router.id, username: session.username, ...payload },
      });
    }

    // Sesi yang hilang dari router (secret dihapus) tidak boleh tertinggal
    // sebagai ONLINE selamanya.
    if (usernames.length) {
      await db.pppoeSession.updateMany({
        where: { routerId: router.id, username: { notIn: usernames }, status: { not: "OFFLINE" } },
        data: { status: "OFFLINE", address: null, uptimeSeconds: null },
      });
    }

    await db.$transaction([
      db.pppoePollRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          totalCount: counts.total,
          onlineCount: counts.online,
          offlineCount: counts.offline,
          disabledCount: counts.disabled,
          matchedCount: matched,
        },
      }),
      db.mikrotikRouter.update({
        where: { id: router.id },
        data: { lastPolledAt: new Date() },
      }),
    ]);

    return { ok: true, runId: run.id, counts, matched };
  } catch (error) {
    const message =
      error instanceof MikrotikError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Polling gagal.";
    await db.pppoePollRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message },
    });
    return { ok: false, runId: run.id, error: message };
  }
}

/** Menarik semua router yang polling-nya aktif. Dipakai worker berkala. */
export async function pollAllRouters(opts: { fetcher?: Fetcher } = {}): Promise<PollResult[]> {
  const routers = await db.mikrotikRouter.findMany({
    where: { isPollingEnabled: true },
    select: { id: true },
  });
  const results: PollResult[] = [];
  for (const r of routers) {
    results.push(await pollRouter(r.id, opts));
  }
  return results;
}

/** Ringkasan untuk halaman monitor. */
export async function pppoeSummary() {
  const [byStatus, routers, lastRuns] = await Promise.all([
    db.pppoeSession.groupBy({ by: ["status"], _count: { _all: true } }),
    db.mikrotikRouter.findMany({
      include: { networkDevice: { select: { hostname: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.pppoePollRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { router: { include: { networkDevice: { select: { hostname: true } } } } },
    }),
  ]);

  const count = (status: string) =>
    byStatus.find((b) => b.status === status)?._count._all ?? 0;

  return {
    total: byStatus.reduce((sum, b) => sum + b._count._all, 0),
    online: count("ONLINE"),
    offline: count("OFFLINE"),
    disabled: count("DISABLED"),
    routers,
    lastRuns,
  };
}
