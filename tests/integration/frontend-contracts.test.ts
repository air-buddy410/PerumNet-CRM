import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  db,
  actor,
  tag,
  makeUser,
  makeDevice,
  makeCustomerWithService,
  ensureMasterData,
  resetTransactionalData,
} from "./fixtures";
import { notificationMenuData, NOTIFICATION_MENU_LIMIT } from "@/lib/notification-menu";
import { searchEntities, isSearchable } from "@/lib/search";
import { profileView, updateOwnContact } from "@/lib/profile";
import { PERMISSIONS } from "@/lib/constants";

// Kontrak untuk frontend (PRD Frontend §13). Yang dijaga bukan bentuk
// datanya — itu sudah dijamin TypeScript — melainkan dua hal yang tidak
// terlihat dari tipe: notifikasi tidak bocor antar user, dan pencarian tidak
// mengembalikan entity yang tidak boleh dilihat pemanggilnya.

async function notify(userId: string, over: Partial<{ title: string; link: string | null; readAt: Date | null; module: string }> = {}) {
  return db.notification.create({
    data: {
      userId,
      type: "TEST",
      title: over.title ?? "Notifikasi uji",
      body: "isi",
      link: over.link === undefined ? "/dashboard" : over.link,
      module: over.module ?? "test",
      readAt: over.readAt ?? null,
    },
  });
}

describe("kontrak frontend", () => {
  before(async () => { await resetTransactionalData(); await ensureMasterData(); });
  beforeEach(async () => { await resetTransactionalData(); await ensureMasterData(); });
  after(async () => { await resetTransactionalData(); await db.$disconnect(); });

  describe("dropdown notifikasi", () => {
    test("hanya menampilkan notifikasi milik user itu sendiri", async () => {
      const a = await makeUser(`n-a-${tag("U")}`, "A");
      const b = await makeUser(`n-b-${tag("U")}`, "B");
      await notify(a.id, { title: "punya A" });
      await notify(b.id, { title: "punya B" });
      await notify(b.id, { title: "punya B lagi" });

      const dataA = await notificationMenuData(a.id);
      assert.equal(dataA.items.length, 1);
      assert.equal(dataA.items[0].title, "punya A");
      assert.ok(
        !dataA.items.some((i) => i.title.includes("punya B")),
        "notifikasi user lain tidak boleh ikut"
      );
    });

    test("unreadCount menghitung yang belum dibaca saja", async () => {
      const u = await makeUser(`n-c-${tag("U")}`, "C");
      await notify(u.id);
      await notify(u.id);
      await notify(u.id, { readAt: new Date() });

      const data = await notificationMenuData(u.id);
      assert.equal(data.unreadCount, 2);
      assert.equal(data.items.length, 3, "yang sudah dibaca tetap tampil di daftar");
    });

    test("hasMore jujur ketika melebihi limit", async () => {
      const u = await makeUser(`n-d-${tag("U")}`, "D");
      for (let i = 0; i < NOTIFICATION_MENU_LIMIT + 2; i++) await notify(u.id);

      const data = await notificationMenuData(u.id);
      assert.equal(data.items.length, NOTIFICATION_MENU_LIMIT);
      assert.equal(data.hasMore, true);
    });

    test("hasMore false ketika pas atau kurang dari limit", async () => {
      const u = await makeUser(`n-e-${tag("U")}`, "E");
      for (let i = 0; i < NOTIFICATION_MENU_LIMIT; i++) await notify(u.id);
      const data = await notificationMenuData(u.id);
      assert.equal(data.hasMore, false, "tepat pada batas bukan berarti masih ada lagi");
    });

    test("link berbahaya di database menjadi null, bukan diteruskan", async () => {
      const u = await makeUser(`n-f-${tag("U")}`, "F");
      await notify(u.id, { link: "https://evil.com/pwn" });
      await notify(u.id, { link: "//evil.com" });
      await notify(u.id, { link: "/dashboard" });

      const data = await notificationMenuData(u.id);
      const hrefs = data.items.map((i) => i.href);
      assert.equal(hrefs.filter((h) => h === null).length, 2);
      assert.ok(hrefs.includes("/dashboard"));
    });
  });

  describe("pencarian entity", () => {
    test("query terlalu pendek tidak menyentuh database", async () => {
      const u = actor("x", "X");
      assert.equal(isSearchable("a"), false);
      assert.deepEqual(await searchEntities(u, "a"), []);
      assert.deepEqual(await searchEntities(u, "   "), []);
    });

    test("tanpa izin sama sekali → tidak ada hasil", async () => {
      const master = await ensureMasterData();
      const creator = await makeUser(`s-a-${tag("U")}`, "Pembuat");
      await makeCustomerWithService(creator.id, master.pkg.id, "CARI1");

      const nobody = actor("nobody", "Nobody", { permissions: new Set<string>() });
      assert.deepEqual(await searchEntities(nobody, "CARI1"), []);
    });

    test("izin per-modul menentukan jenis apa yang ikut dicari", async () => {
      const master = await ensureMasterData();
      const creator = await makeUser(`s-b-${tag("U")}`, "Pembuat");
      const { customer, subscription } = await makeCustomerWithService(creator.id, master.pkg.id, "CARI2");
      await makeDevice(master.item.id, "CARI2-SN-1", {
        subscriptionId: subscription.id,
        customerId: customer.id,
      });

      const csOnly = actor("cs", "CS", {
        permissions: new Set([PERMISSIONS.CUSTOMERS_VIEW]),
      });
      const hasil = await searchEntities(csOnly, "CARI2");
      assert.ok(hasil.length > 0, "pelanggan ketemu");
      assert.ok(
        hasil.every((r) => r.type === "customer"),
        "perangkat TIDAK ikut karena inventory.view tidak dipegang"
      );

      const gudang = actor("wh", "Gudang", {
        permissions: new Set([PERMISSIONS.INVENTORY_VIEW]),
      });
      const hasilGudang = await searchEntities(gudang, "CARI2");
      assert.ok(
        hasilGudang.every((r) => r.type === "device"),
        "sebaliknya, pelanggan tidak ikut"
      );
    });

    test("setiap hasil membawa tautan internal yang valid", async () => {
      const master = await ensureMasterData();
      const creator = await makeUser(`s-c-${tag("U")}`, "Pembuat");
      await makeCustomerWithService(creator.id, master.pkg.id, "CARI3");

      const u = actor("u", "U", { permissions: new Set([PERMISSIONS.CUSTOMERS_VIEW]) });
      const hasil = await searchEntities(u, "CARI3");
      assert.ok(hasil.length > 0);
      for (const r of hasil) {
        assert.ok(r.href.startsWith("/"), r.href);
        assert.ok(!r.href.startsWith("//"), r.href);
      }
    });

    test("batas keseluruhan dihormati", async () => {
      const master = await ensureMasterData();
      const creator = await makeUser(`s-d-${tag("U")}`, "Pembuat");
      for (let i = 0; i < 8; i++) {
        await makeDevice(master.item.id, `BANYAK-SN-${i}`);
      }
      const u = actor("u2", "U2", { permissions: new Set([PERMISSIONS.INVENTORY_VIEW]) });
      const hasil = await searchEntities(u, "BANYAK", 3);
      assert.ok(hasil.length <= 3, `dapat ${hasil.length}`);
    });
  });

  describe("profil", () => {
    test("memuat identitas, data pegawai, dan kontrak auth", async () => {
      const master = await ensureMasterData();
      const row = await makeUser(`p-a-${tag("U")}`, "Pegawai", {
        divisionId: master.division.id,
        roleId: master.role.id,
      });
      const atasan = await db.employee.create({
        data: { employeeNo: `EMP-${tag("E")}`, fullName: "Atasan", joinedAt: new Date() },
      });
      await db.employee.create({
        data: {
          userId: row.id,
          employeeNo: `EMP-${tag("E")}`,
          fullName: "Pegawai Lengkap",
          jobTitle: "Teknisi",
          employeeType: "FULL_TIME",
          joinedAt: new Date("2025-01-06"),
          supervisorId: atasan.id,
        },
      });

      const view = await profileView(row.id);
      assert.ok(view);
      assert.equal(view!.user.divisionName, "Divisi Uji");
      assert.deepEqual(view!.user.roles, ["Management"]);
      assert.equal(view!.employee?.jobTitle, "Teknisi");
      assert.equal(view!.employee?.supervisorName, "Atasan");
      // Fase 45 — nilai OIDC menyusul. Yang diuji bukan sekadar "salah satu
      // dari daftar", melainkan invarian yang benar-benar berarti: ganti
      // password hanya tersedia bila CRM memang pemilik kredensialnya.
      // Kalau invarian ini pernah bocor, orang bisa mengubah hash lokal lalu
      // merasa aman padahal kredensial yang dipakai tidak berubah.
      assert.ok(["LOCAL", "MAILSERVER", "OIDC"].includes(view!.auth.provider));
      // Fase 54 — invariannya DIPERLUAS, bukan dilonggarkan. Dulu berbunyi
      // "hanya saat LOCAL" karena saat itu CRM cuma bisa mengubah hash lokal.
      // Sekarang di mode MAILSERVER ia benar-benar mengubah kredensial yang
      // dipakai: diteruskan ke mailcow. Yang tetap dijaga tetap sama —
      // tombolnya menyala HANYA bila yang berubah adalah password yang
      // sungguh-sungguh dipakai untuk masuk.
      //
      // OIDC tetap false, dan itu intinya: di sana passwordnya memang bukan
      // milik CRM, jadi mengubah apa pun hanya memberi rasa aman palsu.
      assert.equal(
        view!.auth.passwordChangeAvailable,
        view!.auth.provider !== "OIDC",
        "ganti password menyala persis bila CRM memang bisa mengubah kredensial yang dipakai"
      );
    });

    test("tanpa data pegawai, employee bernilai null — bukan gagal", async () => {
      const row = await makeUser(`p-b-${tag("U")}`, "Tanpa Pegawai");
      const view = await profileView(row.id);
      assert.ok(view);
      assert.equal(view!.employee, null);
    });

    test("hanya nama dan telepon yang bisa diubah, dan tercatat di audit", async () => {
      const row = await makeUser(`p-c-${tag("U")}`, "Lama");
      const me = actor(row.id, "Lama");

      const ok = await updateOwnContact(me, { name: "Nama Baru", phone: "0812-3456-7890" });
      assert.ok(ok.ok, ok.ok ? "" : ok.error);

      const after = await db.user.findUnique({ where: { id: row.id } });
      assert.equal(after!.name, "Nama Baru");
      assert.equal(after!.phone, "0812-3456-7890");
      assert.equal(after!.username, row.username, "username tidak ikut berubah");
      assert.equal(after!.email, row.email, "email tidak ikut berubah");

      const audit = await db.auditLog.findFirst({
        where: { entityId: row.id, action: "PROFILE_CONTACT_UPDATE" },
      });
      assert.ok(audit, "perubahan tercatat");
      assert.match(audit!.description, /Lama.*Nama Baru/);
    });

    test("nama kosong dan telepon tidak masuk akal ditolak", async () => {
      const row = await makeUser(`p-d-${tag("U")}`, "Uji");
      const me = actor(row.id, "Uji");
      assert.equal((await updateOwnContact(me, { name: "  ", phone: null })).ok, false);
      assert.equal((await updateOwnContact(me, { name: "X", phone: "bukan-nomor" })).ok, false);
      assert.equal((await updateOwnContact(me, { name: "X", phone: "12" })).ok, false);
    });

    test("menyimpan tanpa perubahan ditolak, tidak membuat audit palsu", async () => {
      const row = await makeUser(`p-e-${tag("U")}`, "Tetap");
      const me = actor(row.id, "Tetap");
      const hasil = await updateOwnContact(me, { name: "Tetap", phone: null });
      assert.equal(hasil.ok, false);
      assert.equal(
        await db.auditLog.count({ where: { entityId: row.id, action: "PROFILE_CONTACT_UPDATE" } }),
        0
      );
    });
  });
});
