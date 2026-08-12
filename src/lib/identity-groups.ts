import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { notifyPermission } from "@/lib/notify";
import { PERMISSIONS } from "@/lib/constants";
import {
  listUsers,
  listGroups,
  createGroup,
  addUserToGroup,
  removeUserFromGroup,
  probeConnection,
  baseUrlFromIssuer,
  type Fetcher,
  type AuthentikOptions,
  type AuthentikProbe,
} from "@/lib/authentik";
import { planGroupSync, type SyncPlan } from "@/lib/authentik-sync";
import { oidcConfig } from "@/lib/oidc";
import type { CurrentUser } from "@/lib/rbac";

// ── Penerbitan divisi ke grup Authentik (Fase 46) ───────────────
//
// Arahnya SATU: divisi di CRM → grup di Authentik. Tidak ada satu pun fungsi
// di modul ini yang menulis `User.divisionId` — grup IdP tidak pernah
// mengubah divisi di CRM, sama seperti tag mailcow pada Fase 44.
//
// Alamat Authentik DITURUNKAN dari OIDC_ISSUER, bukan dikonfigurasi terpisah.
// Dua alamat yang bisa berbeda pendapat tentang IdP mana yang dipakai adalah
// jenis kesalahan yang baru terasa saat sudah salah kamar.

type Result = { ok: true; id: string } | { ok: false; error: string };

export const AUTHENTIK_CODE = "authentik";

export interface AuthentikConfig {
  id: string;
  baseUrl: string;
  credentialRef: string;
  isEnabled: boolean;
  lastEventAt: Date | null;
}

export async function loadAuthentikIntegration(): Promise<AuthentikConfig | null> {
  const row = await db.integration.findFirst({ where: { provider: "AUTHENTIK" } });
  if (!row) return null;
  // baseUrl dari kolom bila diisi, kalau tidak diturunkan dari issuer OIDC.
  const derived = oidcConfig() ? baseUrlFromIssuer(oidcConfig()!.issuer) : null;
  return {
    id: row.id,
    baseUrl: row.baseUrl?.trim() || derived || "",
    credentialRef: row.credentialRef ?? "",
    isEnabled: row.isEnabled,
    lastEventAt: row.lastEventAt,
  };
}

/** Alasan sinkronisasi grup belum bisa dipakai, atau null bila siap. */
export function authentikBlocker(cfg: AuthentikConfig | null): string | null {
  if (!cfg) return "Integrasi Authentik belum didaftarkan.";
  if (!cfg.baseUrl) {
    return "Alamat Authentik tidak diketahui — isi baseUrl atau set OIDC_ISSUER.";
  }
  if (!cfg.credentialRef) return "Nama environment variable token API belum diisi.";
  if (!cfg.isEnabled) return "Integrasi Authentik masih dimatikan.";
  return null;
}

function clientOptions(cfg: AuthentikConfig, fetcher?: Fetcher): AuthentikOptions {
  return { baseUrl: cfg.baseUrl, credentialRef: cfg.credentialRef, fetcher };
}

async function logEvent(
  integrationId: string,
  eventType: string,
  status: "OK" | "ERROR",
  detail: string
): Promise<void> {
  try {
    await db.integrationEvent.create({
      data: { integrationId, direction: "OUT", eventType, status, detail: detail.slice(0, 500) },
    });
    if (status === "OK") {
      await db.integration.update({
        where: { id: integrationId },
        data: { lastEventAt: new Date() },
      });
    }
  } catch (e) {
    console.error("[identity-groups] gagal mencatat event:", e);
  }
}

export async function testAuthentikConnection(
  user: CurrentUser,
  fetcher?: Fetcher
): Promise<AuthentikProbe> {
  const cfg = await loadAuthentikIntegration();
  const blocker = authentikBlocker(cfg);
  if (blocker || !cfg) {
    return { ok: false, userCount: null, groupCount: null, error: blocker };
  }
  const probe = await probeConnection(clientOptions(cfg, fetcher));
  await logEvent(
    cfg.id,
    "AUTHENTIK_PROBE",
    probe.ok ? "OK" : "ERROR",
    probe.ok
      ? `${probe.userCount} pengguna · ${probe.groupCount} grup`
      : (probe.error ?? "tanpa keterangan")
  );
  await logAudit({
    userId: user.id,
    action: "AUTHENTIK_TEST",
    module: "integrations",
    entityType: "Integration",
    entityId: cfg.id,
    description: probe.ok
      ? `Uji koneksi Authentik berhasil — ${probe.userCount} pengguna, ${probe.groupCount} grup`
      : `Uji koneksi Authentik gagal: ${probe.error}`,
  });
  return probe;
}

export interface GroupSyncPreview {
  plan: SyncPlan | null;
  /** Nama divisi per kode, untuk ditampilkan tanpa query ulang. */
  divisionNames: Record<string, string>;
  error: string | null;
}

/**
 * Menghitung rencana sinkronisasi. HANYA MEMBACA — tidak ada satu pun
 * perubahan yang diterapkan, di CRM maupun di Authentik.
 */
export async function previewGroupSync(fetcher?: Fetcher): Promise<GroupSyncPreview> {
  const cfg = await loadAuthentikIntegration();
  const blocker = authentikBlocker(cfg);
  if (blocker || !cfg) return { plan: null, divisionNames: {}, error: blocker };

  const [divisions, accounts] = await Promise.all([
    db.division.findMany({ where: { isActive: true }, select: { code: true, name: true } }),
    // Akun beku dan yang diarsipkan sengaja IKUT: selama akunnya masih ada di
    // Authentik, keanggotaan grupnya tetap menentukan akses ke aplikasi lain,
    // dan justru itu yang perlu terlihat.
    db.user.findMany({
      select: { email: true, level: true, division: { select: { code: true } } },
    }),
  ]);

  try {
    const opts = clientOptions(cfg, fetcher);
    const [akUsers, akGroups] = await Promise.all([listUsers(opts), listGroups(opts)]);
    const plan = planGroupSync(
      divisions.map((d) => d.code),
      accounts.map((a) => ({
        email: a.email,
        divisionCode: a.division?.code ?? null,
        level: a.level,
      })),
      akUsers,
      akGroups
    );
    return {
      plan,
      divisionNames: Object.fromEntries(divisions.map((d) => [d.code, d.name])),
      error: null,
    };
  } catch (e) {
    return {
      plan: null,
      divisionNames: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Penyapu harian: memeriksa selisih antara divisi CRM dan grup Authentik,
 * lalu MEMBERI TAHU. Tidak menerapkan apa pun.
 *
 * Sengaja hanya memberi tahu, bukan menerapkan otomatis. Menerapkan berarti
 * mengeluarkan orang dari grup — dan mencabut akses seseorang ke aplikasi lain
 * adalah keputusan yang harus dilihat manusia lebih dulu, bukan efek samping
 * cron yang berjalan jam tiga pagi. Pola yang sama dipakai `recovery.sla`:
 * memperingatkan, tidak memvonis.
 */
export async function sweepGroupDrift(fetcher?: Fetcher): Promise<string> {
  const cfg = await loadAuthentikIntegration();
  const blocker = authentikBlocker(cfg);
  // Integrasi yang belum disiapkan bukan kegagalan — jangan bunyikan alarm
  // untuk sesuatu yang memang belum dipasang.
  if (blocker || !cfg) return `dilewati: ${blocker}`;

  const view = await previewGroupSync(fetcher);
  if (!view.plan) {
    await logEvent(cfg.id, "AUTHENTIK_DRIFT", "ERROR", view.error ?? "tanpa keterangan");
    throw new Error(`Tidak bisa memeriksa selisih grup: ${view.error}`);
  }

  const p = view.plan;
  const pending = p.groupsToCreate.length + p.totalAdd + p.totalRemove;
  const summary =
    `${p.groupsToCreate.length} grup belum ada · ${p.totalAdd} perlu ditambahkan · ` +
    `${p.totalRemove} perlu dikeluarkan`;

  if (pending === 0) return `selaras — ${summary}`;

  // Ditahan supaya tidak berbunyi tiap hari untuk selisih yang sama; orang
  // yang mengabaikan notifikasi berulang akan mengabaikan yang penting juga.
  const link = "/it/identity-groups";
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000);
  const recent = await db.notification.findFirst({
    where: { type: "AUTHENTIK_GROUP_DRIFT", link, createdAt: { gte: since } },
    select: { id: true },
  });
  if (!recent) {
    await notifyPermission(PERMISSIONS.INTEGRATIONS_MANAGE, {
      type: "AUTHENTIK_GROUP_DRIFT",
      title: "Grup Authentik belum selaras dengan divisi CRM",
      body:
        `${summary}.` +
        (p.totalRemove > 0
          ? ` ${p.totalRemove} orang akan KEHILANGAN akses grup — periksa dulu sebelum menerapkan.`
          : ""),
      link,
      module: "integrations",
    });
  }
  await logEvent(cfg.id, "AUTHENTIK_DRIFT", "OK", summary);
  return summary;
}

export interface ApplyResult {
  created: number;
  added: number;
  removed: number;
  failed: number;
  errors: string[];
}

/**
 * Menerapkan rencana ke Authentik.
 *
 * Rencananya DIHITUNG ULANG di sini, tidak menerima rencana dari pemanggil.
 * Rencana yang dikirim dari form bisa saja sudah basi — atau dikarang — dan
 * menerapkannya berarti mengeluarkan orang dari grup berdasarkan keadaan yang
 * sudah tidak berlaku.
 */
export async function applyGroupSync(
  user: CurrentUser,
  fetcher?: Fetcher
): Promise<ApplyResult> {
  const result: ApplyResult = { created: 0, added: 0, removed: 0, failed: 0, errors: [] };
  const cfg = await loadAuthentikIntegration();
  const blocker = authentikBlocker(cfg);
  if (blocker || !cfg) {
    result.failed = 1;
    result.errors.push(blocker!);
    return result;
  }

  const preview = await previewGroupSync(fetcher);
  if (!preview.plan) {
    result.failed = 1;
    result.errors.push(preview.error ?? "Rencana tidak bisa dihitung.");
    return result;
  }

  const opts = clientOptions(cfg, fetcher);
  const pkByName = new Map<string, string>();

  for (const change of preview.plan.changes) {
    let groupPk = change.groupPk;
    if (!groupPk) {
      try {
        const g = await createGroup(opts, change.groupName);
        groupPk = g.pk;
        pkByName.set(change.groupName, g.pk);
        result.created++;
      } catch (e) {
        result.failed++;
        result.errors.push(`buat grup ${change.groupName}: ${e instanceof Error ? e.message : e}`);
        continue;
      }
    }

    for (const u of change.add) {
      try {
        await addUserToGroup(opts, groupPk, u.pk);
        result.added++;
      } catch (e) {
        result.failed++;
        result.errors.push(`+${u.username}→${change.groupName}: ${e instanceof Error ? e.message : e}`);
      }
    }
    for (const u of change.remove) {
      try {
        await removeUserFromGroup(opts, groupPk, u.pk);
        result.removed++;
      } catch (e) {
        result.failed++;
        result.errors.push(`−${u.username}→${change.groupName}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  const summary =
    `${result.created} grup dibuat · ${result.added} ditambahkan · ` +
    `${result.removed} dikeluarkan${result.failed ? ` · ${result.failed} gagal` : ""}`;
  await logEvent(cfg.id, "AUTHENTIK_GROUP_SYNC", result.failed ? "ERROR" : "OK", summary);
  await logAudit({
    userId: user.id,
    action: "AUTHENTIK_GROUP_SYNC",
    module: "integrations",
    entityType: "Integration",
    entityId: cfg.id,
    description: `Menerbitkan divisi ke grup Authentik — ${summary}`,
    metadata: { errors: result.errors.slice(0, 10) },
  });
  return result;
}
