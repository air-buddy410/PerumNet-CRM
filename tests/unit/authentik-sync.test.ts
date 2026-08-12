import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  divisionGroupName,
  isCrmOwnedGroup,
  divisionCodeOfGroup,
  planGroupSync,
  CRM_GROUP_PREFIX,
  type AkUser,
  type AkGroup,
} from "@/lib/authentik-sync";

const u = (pk: number, email: string, username = email.split("@")[0]): AkUser => ({
  pk,
  email,
  username,
});
const g = (pk: string, name: string, users: number[] = []): AkGroup => ({ pk, name, users });

describe("penamaan grup", () => {
  test("kode divisi menjadi nama grup berawalan", () => {
    assert.equal(divisionGroupName("MKT"), "crm-divisi-mkt");
    assert.equal(CRM_GROUP_PREFIX, "crm-divisi-");
  });

  test("grup milik CRM dikenali, grup lain tidak", () => {
    assert.equal(isCrmOwnedGroup("crm-divisi-mkt"), true);
    // Grup milik IT untuk keperluan mereka sendiri.
    assert.equal(isCrmOwnedGroup("authentik Admins"), false);
    assert.equal(isCrmOwnedGroup("vpn-users"), false);
  });

  test("kode divisi dibaca kembali dari nama grup", () => {
    assert.equal(divisionCodeOfGroup("crm-divisi-fin"), "FIN");
    assert.equal(divisionCodeOfGroup("authentik Admins"), null);
    // Awalan tanpa kode bukan grup divisi yang sah.
    assert.equal(divisionCodeOfGroup("crm-divisi-"), null);
  });
});

describe("planGroupSync — penambahan & pembuatan grup", () => {
  test("grup dibuat untuk SETIAP divisi, termasuk yang masih kosong", () => {
    // Aplikasi lain mengikat kebijakannya ke grup; grup yang baru muncul
    // setelah anggota pertama masuk membuat kebijakan itu menggantung.
    const plan = planGroupSync(["MKT", "FIN"], [], [], []);
    assert.deepEqual(plan.groupsToCreate.sort(), ["crm-divisi-fin", "crm-divisi-mkt"]);
  });

  test("anggota baru ditambahkan ke grup divisinya", () => {
    const plan = planGroupSync(
      ["MKT"],
      [{ email: "teguh@p.id", divisionCode: "MKT" }],
      [u(1, "teguh@p.id")],
      [g("gm", "crm-divisi-mkt", [])]
    );
    assert.equal(plan.totalAdd, 1);
    assert.equal(plan.changes[0].add[0].pk, 1);
    assert.equal(plan.groupsToCreate.length, 0);
  });

  test("yang sudah menjadi anggota tidak ditambahkan lagi", () => {
    const plan = planGroupSync(
      ["MKT"],
      [{ email: "teguh@p.id", divisionCode: "MKT" }],
      [u(1, "teguh@p.id")],
      [g("gm", "crm-divisi-mkt", [1])]
    );
    assert.equal(plan.totalAdd, 0);
    assert.equal(plan.totalRemove, 0);
  });

  test("pindah divisi = keluar dari yang lama, masuk ke yang baru", () => {
    const plan = planGroupSync(
      ["MKT", "FIN"],
      [{ email: "teguh@p.id", divisionCode: "FIN" }],
      [u(1, "teguh@p.id")],
      [g("gm", "crm-divisi-mkt", [1]), g("gf", "crm-divisi-fin", [])]
    );
    const mkt = plan.changes.find((c) => c.divisionCode === "MKT")!;
    const fin = plan.changes.find((c) => c.divisionCode === "FIN")!;
    assert.equal(mkt.remove[0].pk, 1);
    assert.equal(fin.add[0].pk, 1);
  });

  test("pencocokan email tidak membedakan huruf besar-kecil", () => {
    const plan = planGroupSync(
      ["MKT"],
      [{ email: "Teguh@Perum.ID", divisionCode: "mkt" }],
      [u(1, "teguh@perum.id")],
      [g("gm", "crm-divisi-mkt", [])]
    );
    assert.equal(plan.totalAdd, 1);
  });
});

describe("planGroupSync — PAGAR: grup di luar CRM tidak pernah disentuh", () => {
  test("grup milik IT diabaikan sepenuhnya", () => {
    // Grup `vpn-users` memuat orang CRM, tetapi bukan urusan CRM.
    const plan = planGroupSync(
      ["MKT"],
      [{ email: "teguh@p.id", divisionCode: "MKT" }],
      [u(1, "teguh@p.id")],
      [g("gv", "vpn-users", [1]), g("gm", "crm-divisi-mkt", [1])]
    );
    assert.equal(
      plan.changes.some((c) => c.groupName === "vpn-users"),
      false,
      "grup di luar awalan CRM tidak boleh muncul di rencana"
    );
    assert.equal(plan.totalRemove, 0);
  });

  test("grup admin IdP tidak ikut dihitung", () => {
    const plan = planGroupSync([], [], [u(1, "admin@p.id")], [g("ga", "authentik Admins", [1])]);
    assert.equal(plan.changes.length, 0);
    assert.equal(plan.totalRemove, 0);
  });
});

describe("planGroupSync — PAGAR: orang di luar CRM tidak pernah dikeluarkan", () => {
  test("anggota grup CRM yang tak dikenal DILAPORKAN, bukan dikeluarkan", () => {
    // Akun layanan, admin IdP, atau konsultan luar bisa saja sengaja ditaruh
    // di grup itu. Menyapunya karena "tidak ada di CRM" adalah kerusakan yang
    // menyamar sebagai kerapian.
    const plan = planGroupSync(
      ["MKT"],
      [], // CRM tidak mengenal siapa pun
      [u(9, "konsultan@luar.id", "konsultan")],
      [g("gm", "crm-divisi-mkt", [9])]
    );
    assert.equal(plan.totalRemove, 0, "tidak boleh ada yang dikeluarkan");
    const w = plan.warnings.find((x) => x.kind === "UNKNOWN_MEMBER");
    assert.ok(w, "harus ada peringatan anggota tak dikenal");
    assert.equal(w.kind === "UNKNOWN_MEMBER" && w.username, "konsultan");
  });

  test("orang CRM yang salah grup TETAP dikeluarkan — pagar tidak kebablasan", () => {
    // Pagar hanya melindungi yang di luar CRM. Kalau tidak, pindah divisi
    // tidak pernah benar-benar mencabut akses yang lama.
    const plan = planGroupSync(
      ["MKT", "FIN"],
      [{ email: "teguh@p.id", divisionCode: "FIN" }],
      [u(1, "teguh@p.id")],
      [g("gm", "crm-divisi-mkt", [1]), g("gf", "crm-divisi-fin", [1])]
    );
    const mkt = plan.changes.find((c) => c.divisionCode === "MKT")!;
    assert.equal(mkt.remove.length, 1);
  });

  test("anggota yang tidak ada di daftar pengguna tidak dikeluarkan", () => {
    // Data tidak lengkap bukan dasar untuk mencabut akses.
    const plan = planGroupSync(["MKT"], [], [], [g("gm", "crm-divisi-mkt", [77])]);
    assert.equal(plan.totalRemove, 0);
  });
});

describe("planGroupSync — peringatan", () => {
  test("akun CRM tanpa pengguna Authentik dilaporkan", () => {
    const plan = planGroupSync(
      ["MKT"],
      [{ email: "baru@p.id", divisionCode: "MKT" }],
      [],
      [g("gm", "crm-divisi-mkt", [])]
    );
    const w = plan.warnings.find((x) => x.kind === "NO_IDP_USER");
    assert.notEqual(w, undefined);
    assert.equal(plan.totalAdd, 0);
  });

  test("akun CRM tanpa divisi dilaporkan, tidak dimasukkan ke grup mana pun", () => {
    const plan = planGroupSync(
      ["MKT"],
      [{ email: "belum@p.id", divisionCode: null }],
      [u(1, "belum@p.id")],
      [g("gm", "crm-divisi-mkt", [])]
    );
    assert.equal(plan.totalAdd, 0);
    assert.equal(plan.warnings.some((x) => x.kind === "NO_DIVISION"), true);
  });

  test("divisi yang tidak ada di daftar sah dilewati tanpa menerbitkan grup", () => {
    // Itu keadaan data CRM yang harus diperbaiki di CRM, bukan diterbitkan.
    const plan = planGroupSync(
      ["MKT"],
      [{ email: "x@p.id", divisionCode: "ENTAH" }],
      [u(1, "x@p.id")],
      []
    );
    assert.equal(plan.groupsToCreate.includes("crm-divisi-entah"), false);
    assert.equal(plan.totalAdd, 0);
  });
});

describe("PAGAR: grup bernama sama dengan kode divisi TAPI tanpa awalan", () => {
  test("grup IT bernama persis 'MKT' tidak diadopsi sebagai grup divisi", () => {
    // Kasus yang benar-benar menguji filter nama — bukan sekadar grup dengan
    // nama tak berkaitan, yang memang tidak pernah cocok karena rencananya
    // disusun dari daftar divisi. IT bisa saja menamai grupnya "MKT" untuk
    // keperluan sendiri; mengadopsinya berarti menyapu anggotanya.
    const plan = planGroupSync(
      ["MKT"],
      [{ email: "teguh@p.id", divisionCode: "MKT" }],
      [u(1, "teguh@p.id"), u(2, "orang-it@p.id", "orang-it")],
      [g("git", "MKT", [2])] // grup IT, TANPA awalan crm-divisi-
    );

    // Grup CRM-nya belum ada, jadi harus dibuat — bukan memakai grup IT itu.
    assert.equal(plan.groupsToCreate.includes("crm-divisi-mkt"), true);
    const change = plan.changes.find((c) => c.divisionCode === "MKT")!;
    assert.equal(change.groupPk, null, "tidak boleh memakai pk grup milik IT");
    assert.equal(plan.totalRemove, 0, "anggota grup IT tidak boleh disentuh");
  });
});
