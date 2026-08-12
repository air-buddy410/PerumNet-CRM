import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  divisionTag,
  isDivisionTag,
  parseTags,
  applyDivisionTag,
  compareMailboxes,
  summarize,
  DIVISION_TAG_PREFIX,
} from "@/lib/mailbox-tag";

describe("divisionTag / isDivisionTag", () => {
  test("kode divisi menjadi tag huruf kecil berawalan", () => {
    assert.equal(divisionTag("MKT"), "divisi-mkt");
    assert.equal(divisionTag("  it  "), "divisi-it");
  });

  test("awalannya memang divisi-", () => {
    assert.equal(DIVISION_TAG_PREFIX, "divisi-");
  });

  test("tag milik IT tidak dikira milik CRM", () => {
    assert.equal(isDivisionTag("vip"), false);
    assert.equal(isDivisionTag("no-quota-alert"), false);
    assert.equal(isDivisionTag("divisi-fin"), true);
  });
});

describe("parseTags", () => {
  test("satu tag divisi terbaca kodenya dalam huruf besar", () => {
    const r = parseTags(["divisi-mkt"]);
    assert.equal(r.code, "MKT");
    assert.deepEqual(r.foreign, []);
  });

  test("tag lain dipisahkan, bukan dibuang", () => {
    const r = parseTags(["vip", "divisi-fin", "arsip-2025"]);
    assert.equal(r.code, "FIN");
    assert.deepEqual(r.foreign, ["vip", "arsip-2025"]);
  });

  test("tag divisi GANDA tidak ditebak — code jadi null", () => {
    // Mailbox bertag dua divisi adalah keadaan yang harus dilihat manusia,
    // bukan dirapikan diam-diam menjadi salah satunya.
    const r = parseTags(["divisi-mkt", "divisi-fin"]);
    assert.equal(r.code, null);
    assert.equal(r.divisionTags.length, 2);
  });

  test("tanpa tag divisi, code null dan tidak error", () => {
    const r = parseTags(["vip"]);
    assert.equal(r.code, null);
    assert.deepEqual(r.foreign, ["vip"]);
  });

  test("tag kosong dan spasi diabaikan", () => {
    const r = parseTags(["", "   ", "divisi-ops"]);
    assert.equal(r.code, "OPS");
    assert.deepEqual(r.foreign, []);
  });
});

describe("applyDivisionTag — tag milik IT wajib dipertahankan", () => {
  test("mengganti tag divisi tanpa menyentuh tag lain", () => {
    const out = applyDivisionTag(["vip", "divisi-mkt", "arsip"], "FIN");
    assert.deepEqual(out, ["vip", "arsip", "divisi-fin"]);
  });

  test("menambah tag divisi pada mailbox yang belum punya", () => {
    assert.deepEqual(applyDivisionTag(["vip"], "IT"), ["vip", "divisi-it"]);
  });

  test("null menghapus tag divisi saja", () => {
    assert.deepEqual(applyDivisionTag(["vip", "divisi-mkt"], null), ["vip"]);
  });

  test("tag divisi ganda diselesaikan jadi satu", () => {
    const out = applyDivisionTag(["divisi-mkt", "divisi-fin", "vip"], "OPS");
    assert.deepEqual(out, ["vip", "divisi-ops"]);
  });

  test("tidak pernah menghasilkan tag ganda untuk divisi yang sama", () => {
    const out = applyDivisionTag(["divisi-mkt"], "MKT");
    assert.deepEqual(out, ["divisi-mkt"]);
  });
});

describe("compareMailboxes", () => {
  const acc = (email: string, divisionCode: string | null) => ({ email, divisionCode });
  const mb = (email: string, tags: string[]) => ({ email, tags });

  test("tag sesuai divisi CRM → MATCHED, tidak ada aksi", () => {
    const [row] = compareMailboxes([acc("a@p.id", "MKT")], [mb("a@p.id", ["divisi-mkt"])]);
    assert.equal(row.state, "MATCHED");
    assert.equal(row.actionable, false);
  });

  test("tag berbeda → TAG_MISMATCH dan bisa didorong dari CRM", () => {
    const [row] = compareMailboxes([acc("a@p.id", "MKT")], [mb("a@p.id", ["divisi-fin"])]);
    assert.equal(row.state, "TAG_MISMATCH");
    assert.equal(row.crmDivisionCode, "MKT");
    assert.equal(row.tagDivisionCode, "FIN");
    assert.equal(row.actionable, true);
  });

  test("belum ada tag → TAG_MISSING", () => {
    const [row] = compareMailboxes([acc("a@p.id", "MKT")], [mb("a@p.id", ["vip"])]);
    assert.equal(row.state, "TAG_MISSING");
    assert.equal(row.actionable, true);
  });

  test("tag ganda → TAG_AMBIGUOUS, tetap bisa diluruskan dari CRM", () => {
    const [row] = compareMailboxes(
      [acc("a@p.id", "MKT")],
      [mb("a@p.id", ["divisi-mkt", "divisi-fin"])]
    );
    assert.equal(row.state, "TAG_AMBIGUOUS");
    assert.equal(row.actionable, true);
  });

  test("divisi kosong di CRM TIDAK bisa didorong — yang salah datanya", () => {
    // Mendorong "tanpa divisi" ke mailcow akan menghapus tag yang mungkin
    // benar. Yang perlu diperbaiki adalah divisi di CRM.
    const [row] = compareMailboxes([acc("a@p.id", null)], [mb("a@p.id", ["divisi-mkt"])]);
    assert.equal(row.state, "NO_DIVISION_IN_CRM");
    assert.equal(row.actionable, false);
  });

  test("mailbox tanpa akun CRM dilaporkan, bukan dianggap kesalahan", () => {
    // info@, billing@ dan mailbox bersama lain jatuh ke sini.
    const [row] = compareMailboxes([], [mb("info@p.id", [])]);
    assert.equal(row.state, "NO_CRM_ACCOUNT");
    assert.equal(row.actionable, false);
  });

  test("akun CRM tanpa mailbox dilaporkan; membuat mailbox bukan efek samping", () => {
    const [row] = compareMailboxes([acc("baru@p.id", "IT")], []);
    assert.equal(row.state, "NO_MAILBOX");
    assert.equal(row.actionable, false);
  });

  test("pencocokan tidak membedakan huruf besar-kecil", () => {
    const [row] = compareMailboxes([acc("Teguh@Perum.ID", "MKT")], [mb("teguh@perum.id", ["divisi-mkt"])]);
    assert.equal(row.state, "MATCHED");
    assert.equal(row.email, "teguh@perum.id");
  });

  test("satu akun tidak muncul dua kali saat mailbox-nya ada", () => {
    const rows = compareMailboxes([acc("a@p.id", "MKT")], [mb("a@p.id", ["divisi-mkt"])]);
    assert.equal(rows.length, 1);
  });

  test("hasil diurutkan supaya daftarnya stabil antar-muat", () => {
    const rows = compareMailboxes(
      [acc("z@p.id", "IT"), acc("a@p.id", "IT")],
      [mb("z@p.id", ["divisi-it"]), mb("a@p.id", ["divisi-it"])]
    );
    assert.deepEqual(rows.map((r) => r.email), ["a@p.id", "z@p.id"]);
  });
});

describe("summarize", () => {
  test("menghitung yang perlu ditindak, bukan seluruh baris", () => {
    const rows = compareMailboxes(
      [
        { email: "ok@p.id", divisionCode: "MKT" },
        { email: "beda@p.id", divisionCode: "MKT" },
        { email: "nomb@p.id", divisionCode: "IT" },
      ],
      [
        { email: "ok@p.id", tags: ["divisi-mkt"] },
        { email: "beda@p.id", tags: ["divisi-fin"] },
        { email: "info@p.id", tags: [] },
      ]
    );
    const s = summarize(rows);
    assert.equal(s.total, 4);
    assert.equal(s.matched, 1);
    assert.equal(s.actionable, 1);
    assert.equal(s.noCrmAccount, 1);
    assert.equal(s.noMailbox, 1);
  });
});
