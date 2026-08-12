// ── Divisi CRM → Grup Authentik (Fase 46) ───────────────────────
// Modul MURNI: tidak menyentuh database maupun jaringan.
//
// Gunanya: divisi yang sudah dikelola di CRM diterbitkan ke Authentik sebagai
// keanggotaan grup, sehingga aplikasi lain (captive portal, LibreNMS) bisa
// berkata "hanya grup ini yang boleh masuk" tanpa siapa pun mengurus daftar
// anggotanya secara manual di dua tempat.
//
// Arahnya SATU, sama seperti tag mailcow (keputusan E2):
//
//     divisi di CRM  ──dorong──►  grup di Authentik
//
// Tidak ada fungsi di sini maupun di lapisan layanannya yang menulis
// `User.divisionId`. Grup Authentik tidak pernah mengubah divisi di CRM.
//
// ── Tiga pagar yang menentukan ─────────────────────────────────
//
// Menghapus orang dari grup berarti MENCABUT AKSESNYA ke aplikasi yang
// bersandar pada grup itu. Satu kesalahan di sini mengunci orang dari captive
// portal atau monitoring, dan gejalanya muncul jauh dari sebabnya. Karena itu:
//
//  1. CRM hanya menyentuh grup yang DIBUATNYA SENDIRI (berawalan tetap).
//     Grup lain milik IT — untuk keperluan mereka, dengan anggota yang mereka
//     tentukan — tidak boleh tersentuh sama sekali.
//
//  2. Pengguna Authentik yang TIDAK DIKENAL CRM tidak pernah dikeluarkan,
//     hanya dilaporkan. Akun layanan, admin IdP, dan konsultan luar bisa saja
//     sengaja ditaruh di grup itu; menyapunya karena "tidak ada di CRM" adalah
//     kerusakan yang tampak seperti kerapian.
//
//  3. Rencana dihitung lebih dulu dan ditampilkan, baru diterapkan.

/** Awalan grup yang dikelola CRM. Grup di luar ini tidak pernah disentuh. */
export const CRM_GROUP_PREFIX = "crm-divisi-";

export function divisionGroupName(divisionCode: string): string {
  return `${CRM_GROUP_PREFIX}${divisionCode.trim().toLowerCase()}`;
}

export function isCrmOwnedGroup(groupName: string): boolean {
  return groupName.trim().toLowerCase().startsWith(CRM_GROUP_PREFIX);
}

/** Kode divisi dari nama grup, atau null bila bukan grup milik CRM. */
export function divisionCodeOfGroup(groupName: string): string | null {
  const n = groupName.trim().toLowerCase();
  if (!n.startsWith(CRM_GROUP_PREFIX)) return null;
  const code = n.slice(CRM_GROUP_PREFIX.length);
  return code ? code.toUpperCase() : null;
}

// ── Bentuk data ─────────────────────────────────────────────────

export interface CrmAccount {
  email: string;
  /** null berarti belum berdivisi — bukan berarti harus dikeluarkan. */
  divisionCode: string | null;
}

export interface AkUser {
  pk: number;
  email: string;
  username: string;
}

export interface AkGroup {
  pk: string;
  name: string;
  /** pk pengguna yang menjadi anggota. */
  users: number[];
}

export interface GroupChange {
  groupName: string;
  divisionCode: string;
  /** null bila grupnya belum ada di Authentik. */
  groupPk: string | null;
  add: AkUser[];
  remove: AkUser[];
}

export type SyncWarning =
  /** Akun CRM berdivisi tetapi tidak punya pengguna Authentik dengan email itu. */
  | { kind: "NO_IDP_USER"; email: string; divisionCode: string }
  /** Anggota grup CRM yang tidak dikenal CRM — DILAPORKAN, tidak dikeluarkan. */
  | { kind: "UNKNOWN_MEMBER"; groupName: string; username: string; email: string }
  /** Akun CRM tanpa divisi; tidak ditambahkan ke grup mana pun. */
  | { kind: "NO_DIVISION"; email: string };

export interface SyncPlan {
  /** Grup yang perlu dibuat lebih dulu karena belum ada. */
  groupsToCreate: string[];
  changes: GroupChange[];
  warnings: SyncWarning[];
  /** Jumlah penambahan dan pengeluaran yang akan dilakukan. */
  totalAdd: number;
  totalRemove: number;
}

const norm = (e: string) => e.trim().toLowerCase();

/**
 * Menghitung rencana sinkronisasi. TIDAK mengubah apa pun.
 *
 * `divisions` adalah daftar kode divisi yang sah di CRM. Grup dihitung untuk
 * SETIAP divisi — termasuk yang belum ada anggotanya — supaya aplikasi lain
 * bisa mengikat kebijakannya ke grup yang pasti ada, alih-alih grup yang baru
 * muncul setelah orang pertama masuk divisi itu.
 */
export function planGroupSync(
  divisions: readonly string[],
  crmAccounts: readonly CrmAccount[],
  akUsers: readonly AkUser[],
  akGroups: readonly AkGroup[]
): SyncPlan {
  const warnings: SyncWarning[] = [];
  const userByEmail = new Map(akUsers.map((u) => [norm(u.email), u]));
  const userByPk = new Map(akUsers.map((u) => [u.pk, u]));
  const crmByEmail = new Map(crmAccounts.map((a) => [norm(a.email), a]));

  // Grup milik CRM yang sudah ada, dipetakan per kode divisi.
  const ownedGroups = new Map<string, AkGroup>();
  for (const g of akGroups) {
    const code = divisionCodeOfGroup(g.name);
    if (code) ownedGroups.set(code, g);
  }

  // Siapa yang SEHARUSNYA berada di tiap grup, menurut CRM.
  const expected = new Map<string, Set<number>>();
  for (const code of divisions) expected.set(code.toUpperCase(), new Set());

  for (const acc of crmAccounts) {
    const email = norm(acc.email);
    if (!acc.divisionCode) {
      warnings.push({ kind: "NO_DIVISION", email });
      continue;
    }
    const code = acc.divisionCode.toUpperCase();
    const target = expected.get(code);
    // Divisi yang tidak ada di daftar sah dilewati diam-diam: itu keadaan
    // data CRM yang harus diperbaiki di CRM, bukan diterbitkan ke IdP.
    if (!target) continue;

    const idp = userByEmail.get(email);
    if (!idp) {
      warnings.push({ kind: "NO_IDP_USER", email, divisionCode: code });
      continue;
    }
    target.add(idp.pk);
  }

  const groupsToCreate: string[] = [];
  const changes: GroupChange[] = [];

  for (const code of divisions.map((d) => d.toUpperCase())) {
    const groupName = divisionGroupName(code);
    const group = ownedGroups.get(code);
    if (!group) groupsToCreate.push(groupName);

    const should = expected.get(code) ?? new Set<number>();
    const current = new Set(group?.users ?? []);

    const add = [...should]
      .filter((pk) => !current.has(pk))
      .map((pk) => userByPk.get(pk)!)
      .filter(Boolean);

    const remove: AkUser[] = [];
    for (const pk of current) {
      if (should.has(pk)) continue;
      const idp = userByPk.get(pk);
      if (!idp) {
        // Anggota yang tidak ada di daftar pengguna yang kita tarik —
        // jangan dikeluarkan berdasarkan data yang tidak lengkap.
        continue;
      }
      if (!crmByEmail.has(norm(idp.email))) {
        // PAGAR KEDUA: bukan orang CRM. Akun layanan, admin IdP, konsultan.
        // Dilaporkan, tidak pernah dikeluarkan.
        warnings.push({
          kind: "UNKNOWN_MEMBER",
          groupName,
          username: idp.username,
          email: idp.email,
        });
        continue;
      }
      remove.push(idp);
    }

    if (add.length || remove.length || !group) {
      changes.push({ groupName, divisionCode: code, groupPk: group?.pk ?? null, add, remove });
    }
  }

  return {
    groupsToCreate,
    changes,
    warnings,
    totalAdd: changes.reduce((n, c) => n + c.add.length, 0),
    totalRemove: changes.reduce((n, c) => n + c.remove.length, 0),
  };
}

export const WARNING_LABELS: Record<SyncWarning["kind"], string> = {
  NO_IDP_USER: "Belum punya akun di Authentik",
  UNKNOWN_MEMBER: "Anggota grup di luar CRM — tidak dikeluarkan",
  NO_DIVISION: "Belum berdivisi di CRM",
};
