import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, actor, makeUser, tag, ensureMasterData, resetTransactionalData } from "./fixtures";
import { listAccountCandidates, createAccountsFromMailboxes } from "@/lib/account-provision-service";
import { MAILCOW_CODE } from "@/lib/mailserver";
import { PERMISSIONS } from "@/lib/constants";
import type { Fetcher } from "@/lib/mailcow";

// Pembuatan akun massal dari kotak surat. Yang diuji di sini bukan cuma "bisa
// membuat akun", melainkan batas-batasnya: apa yang TIDAK boleh terjadi
// otomatis, dan apa yang harus tetap diputuskan manusia.

const ENV = "MAILCOW_PROV_KEY";

let IT: ReturnType<typeof actor>;
let BUKAN_IT: ReturnType<typeof actor>;
let roleId: string;
let divNoc: string;
let divMkt: string;

/** Mailserver palsu berisi campuran alamat orang dan alamat fungsi. */
function fakeMailserver(emails: string[]): Fetcher {
  return async (url) => {
    if (url.includes("/get/status/version")) {
      return new Response(JSON.stringify({ version: "2026-08" }), { status: 200 });
    }
    if (url.includes("/get/mailbox/all")) {
      const rows = emails.map((username) => ({ username, tags: [], active: "1" }));
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
}

async function setupIntegration() {
  process.env[ENV] = "kunci-uji";
  await db.integration.upsert({
    where: { code: MAILCOW_CODE },
    update: { isEnabled: true, baseUrl: "https://mail.test.local", credentialRef: ENV },
    create: {
      code: MAILCOW_CODE,
      name: "Mailserver mailcow",
      category: "ITOPS",
      provider: "MAILCOW",
      baseUrl: "https://mail.test.local",
      authType: "API_KEY",
      credentialRef: ENV,
      isEnabled: true,
      webhookToken: "prov-token",
    },
  });
}

describe("menyiapkan akun CRM dari kotak surat", () => {
  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    await setupIntegration();
    divNoc = (await db.division.upsert({ where: { code: "NOC" }, update: {}, create: { code: "NOC", name: "NOC" } })).id;
    divMkt = (await db.division.upsert({ where: { code: "MKT" }, update: {}, create: { code: "MKT", name: "Marketing" } })).id;
    roleId = (await db.role.findFirstOrThrow({ where: { code: "management" } })).id;
    IT = actor((await makeUser(tag("it").toLowerCase(), "IT")).id, "it");
    const lain = await makeUser(tag("gudang").toLowerCase(), "GUDANG");
    BUKAN_IT = actor(lain.id, "gudang");
    BUKAN_IT.permissions = new Set([PERMISSIONS.INVENTORY_VIEW]);
  });
  after(async () => {
    await resetTransactionalData();
    delete process.env[ENV];
    await db.$disconnect();
  });

  describe("daftar calon", () => {
    test("izin: yang tidak boleh membuat user tidak bisa melihat calonnya", async () => {
      const r = await listAccountCandidates(BUKAN_IT, fakeMailserver(["a@perumnet.id"]));
      assert.equal(r.ok, false);
    });

    test("ALAMAT FUNGSI tidak tercentang, tapi TETAP DITAMPILKAN", async () => {
      // Ini bedanya usulan dan penyaring. Kalau disembunyikan, seorang
      // karyawan yang kebetulan beralamat sales@ hilang dari daftar dan tidak
      // ada yang tahu. IT harus bisa membalikkan dugaan saya.
      const r = await listAccountCandidates(
        IT,
        fakeMailserver(["helpdesk@perumnet.id", "no-reply@perumnet.id", "wayan_budiarta@perumnet.id"])
      );
      assert.equal(r.ok, true);
      const c = r.ok ? r.data.candidates : [];
      assert.equal(c.length, 3, "semuanya tetap tampil");

      const helpdesk = c.find((x) => x.email.startsWith("helpdesk"))!;
      assert.equal(helpdesk.suggestedSelected, false);
      assert.notEqual(helpdesk.sharedReason, null, "alasannya ikut, bukan cuma ya/tidak");

      const orang = c.find((x) => x.email.startsWith("wayan"))!;
      assert.equal(orang.suggestedSelected, true);
      assert.equal(orang.suggestedName, "Wayan Budiarta");
      assert.equal(orang.username, "wayan_budiarta");
    });

    test("DIVISI diusulkan dari data HRD, bukan dari tag mailcow", async () => {
      // Membacanya dari mailcow akan membalik arah otoritas: siapa pun yang
      // bisa mengedit tag ikut menentukan divisi — dan divisi menentukan grup
      // Authentik serta akses ke aplikasi lain.
      await db.employee.create({
        data: {
          employeeNo: "10000501",
          fullName: "Ratna Suari",
          jobTitle: "Staf Marketing",
          employeeType: "FULL_TIME",
          joinedAt: new Date("2026-01-06"),
          divisionId: divMkt,
        },
      });
      const r = await listAccountCandidates(IT, fakeMailserver(["ratna_suari@perumnet.id"]));
      const c = r.ok ? r.data.candidates[0] : null;
      assert.equal(c?.employee?.employeeNo, "10000501");
      assert.equal(c?.suggestedDivisionId, divMkt);
    });

    test("NAMA PEGAWAI KEMBAR tidak ditautkan ke siapa pun", async () => {
      // Menautkan ke salah satunya berarti memberi akun kepada orang yang
      // salah, dan tidak ada di layar yang menunjukkan itu terjadi.
      for (const no of ["10000601", "10000602"]) {
        await db.employee.create({
          data: {
            employeeNo: no,
            fullName: "Dwi Pranata",
            employeeType: "FULL_TIME",
            joinedAt: new Date("2026-01-06"),
            divisionId: divNoc,
          },
        });
      }
      const r = await listAccountCandidates(IT, fakeMailserver(["dwi_pranata@perumnet.id"]));
      const c = r.ok ? r.data.candidates[0] : null;
      assert.equal(c?.employee, null, "kembar harus dibiarkan dipilih manusia");
      assert.equal(c?.suggestedDivisionId, null);
    });

    test("username yang BENTROK diberi angka, bukan menggagalkan", async () => {
      const ada = await makeUser("bentrok", "HRD");
      await db.user.update({ where: { id: ada.id }, data: { username: "rusdi_hakim" } });
      const r = await listAccountCandidates(IT, fakeMailserver(["rusdi_hakim@perumnet.id"]));
      assert.equal(r.ok && r.data.candidates[0].username, "rusdi_hakim2");
    });

    test("kotak surat yang SUDAH punya akun tidak muncul lagi sebagai calon", async () => {
      const ada = await makeUser("sudahada", "HRD");
      await db.user.update({ where: { id: ada.id }, data: { email: "sudah_punya@perumnet.id" } });
      const r = await listAccountCandidates(
        IT,
        fakeMailserver(["sudah_punya@perumnet.id", "orang_baru@perumnet.id"])
      );
      const emails = r.ok ? r.data.candidates.map((c) => c.email) : [];
      assert.equal(emails.includes("sudah_punya@perumnet.id"), false);
      assert.equal(emails.includes("orang_baru@perumnet.id"), true);
      assert.equal(r.ok && r.data.alreadyHaveAccount >= 1, true);
    });
  });

  describe("pembuatan akun", () => {
    // Tiap tes memakai alamat sendiri, jadi tidak ada pembersihan di antaranya.
    // Menghapus user di sela-sela justru terbentur foreign key: akun yang sudah
    // dibuat langsung dirujuk AuditLog dan tautan pegawainya.

    test("izin ditegakkan di jalur pembuatan juga, bukan cuma di daftar", async () => {
      const r = await createAccountsFromMailboxes(BUKAN_IT, [
        { email: "x@perumnet.id", name: "X", username: "x", level: "STAFF", divisionId: divNoc, roleIds: [roleId], employeeId: null },
      ]);
      assert.equal(r.ok, false);
      assert.equal(await db.user.count({ where: { email: "x@perumnet.id" } }), 0);
    });

    test("akun terbuat dan pegawainya tertaut", async () => {
      const emp = await db.employee.create({
        data: {
          employeeNo: "10000701",
          fullName: "Satria Wibawa",
          employeeType: "FULL_TIME",
          joinedAt: new Date("2026-01-06"),
          divisionId: divNoc,
        },
      });
      const r = await createAccountsFromMailboxes(IT, [
        {
          email: "satria_wibawa@perumnet.id",
          name: "Satria Wibawa",
          username: "satria_wibawa",
          level: "STAFF",
          divisionId: divNoc,
          roleIds: [roleId],
          employeeId: emp.id,
        },
      ]);
      assert.equal(r.ok, true, r.ok ? "" : r.error);
      assert.equal(r.ok && r.data.created[0].linkedEmployeeNo, "10000701");

      const akun = await db.user.findFirst({
        where: { email: "satria_wibawa@perumnet.id" },
        select: { username: true, divisionId: true, mustChangePassword: true, roles: true, employee: { select: { employeeNo: true } } },
      });
      assert.equal(akun!.username, "satria_wibawa");
      assert.equal(akun!.divisionId, divNoc);
      assert.equal(akun!.roles.length, 1);
      assert.equal(akun!.employee?.employeeNo, "10000701");
      assert.equal(akun!.mustChangePassword, true);
    });

    test("PERAN wajib dipilih — tidak ada peran bawaan", async () => {
      // Peran adalah kewenangan sebenarnya. Kalau ada nilai bawaan, tiga puluh
      // akun bisa terbit dengan hak akses yang tidak pernah diputuskan siapa pun.
      const r = await createAccountsFromMailboxes(IT, [
        { email: "tanpa_peran@perumnet.id", name: "Tanpa Peran", username: "tanpa_peran", level: "STAFF", divisionId: divNoc, roleIds: [], employeeId: null },
      ]);
      assert.equal(r.ok, false);
      assert.match(r.ok ? "" : r.error, /minimal satu peran/);
      assert.equal(await db.user.count({ where: { email: "tanpa_peran@perumnet.id" } }), 0);
    });

    test("Staff tanpa divisi ditolak — aturan yang sama dengan form satuan", async () => {
      const r = await createAccountsFromMailboxes(IT, [
        { email: "tanpa_divisi@perumnet.id", name: "Tanpa Divisi", username: "tanpa_divisi", level: "STAFF", divisionId: null, roleIds: [roleId], employeeId: null },
      ]);
      assert.equal(r.ok, false);
      assert.match(r.ok ? "" : r.error, /wajib punya divisi/);
    });

    test("SATU baris bermasalah menahan SELURUHNYA", async () => {
      // Pembuatan separuh jalan menyisakan pertanyaan "yang mana tadi yang
      // sudah jadi?", dan jawabannya harus dicari manual satu per satu.
      const r = await createAccountsFromMailboxes(IT, [
        { email: "sah_satu@perumnet.id", name: "Sah Satu", username: "sah_satu", level: "STAFF", divisionId: divNoc, roleIds: [roleId], employeeId: null },
        { email: "rusak@perumnet.id", name: "Rusak", username: "rusak", level: "RAJA", divisionId: divNoc, roleIds: [roleId], employeeId: null },
      ]);
      assert.equal(r.ok, false);
      assert.equal(await db.user.count({ where: { email: "sah_satu@perumnet.id" } }), 0);
    });

    test("username kembar DI DALAM satu pilihan ditolak", async () => {
      const r = await createAccountsFromMailboxes(IT, [
        { email: "a@perumnet.id", name: "A", username: "sama", level: "STAFF", divisionId: divNoc, roleIds: [roleId], employeeId: null },
        { email: "b@perumnet.id", name: "B", username: "sama", level: "STAFF", divisionId: divNoc, roleIds: [roleId], employeeId: null },
      ]);
      assert.equal(r.ok, false);
      assert.match(r.ok ? "" : r.error, /dipakai dua kali/);
    });

    test("email yang sudah dipakai akun lain ditolak", async () => {
      await createAccountsFromMailboxes(IT, [
        { email: "sudah@perumnet.id", name: "Sudah", username: "sudah", level: "STAFF", divisionId: divNoc, roleIds: [roleId], employeeId: null },
      ]);
      const r = await createAccountsFromMailboxes(IT, [
        { email: "sudah@perumnet.id", name: "Lagi", username: "lagi", level: "STAFF", divisionId: divNoc, roleIds: [roleId], employeeId: null },
      ]);
      assert.equal(r.ok, false);
      assert.match(r.ok ? "" : r.error, /Sudah ada akun/);
    });

    test("pegawai yang SUDAH tertaut akun lain tidak bisa ditaut lagi", async () => {
      const emp = await db.employee.create({
        data: { employeeNo: "10000801", fullName: "Sudah Tertaut", employeeType: "FULL_TIME", joinedAt: new Date("2026-01-06") },
      });
      await createAccountsFromMailboxes(IT, [
        { email: "pertama@perumnet.id", name: "Pertama", username: "pertama", level: "STAFF", divisionId: divNoc, roleIds: [roleId], employeeId: emp.id },
      ]);
      const r = await createAccountsFromMailboxes(IT, [
        { email: "kedua@perumnet.id", name: "Kedua", username: "kedua", level: "STAFF", divisionId: divNoc, roleIds: [roleId], employeeId: emp.id },
      ]);
      assert.equal(r.ok, false);
      assert.match(r.ok ? "" : r.error, /sudah tertaut/);
      assert.equal(await db.user.count({ where: { email: "kedua@perumnet.id" } }), 0);
    });

    test("setiap akun tercatat di AuditLog beserta asalnya", async () => {
      await createAccountsFromMailboxes(IT, [
        { email: "tercatat@perumnet.id", name: "Tercatat", username: "tercatat", level: "STAFF", divisionId: divNoc, roleIds: [roleId], employeeId: null },
      ]);
      const log = await db.auditLog.findFirst({
        where: { action: "USER_CREATE", description: { contains: "tercatat@perumnet.id" } },
        orderBy: { createdAt: "desc" },
      });
      assert.notEqual(log, null);
      assert.match(log!.description, /dari kotak surat/);
    });
  });
});
