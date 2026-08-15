import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseOdpBlocks, roleOf, statusOf, parseDbm, normalizeOdpCode } from "@/lib/odp-import";

const H = ["KODE ODP/MS", "Tipe", "Status", "Redaman Input", "Kordinat ODP", "Master Spliter", "Kordinat MS", "Port MS", "OLT", "PIU", "Port ODP", "Port 1", "Port 2"];
const baris = (u: Record<number, string> = {}) => {
  const r = ["BSM 01DC01", "ODP", "Aktif", "-5", "-8.459547, 115.604957", "MS BSM 040101", "-8.4600, 115.6050", "3", "C600 Kecicang", "1/2/1", "16", "", ""];
  for (const [i, v] of Object.entries(u)) r[Number(i)] = v;
  return r;
};
const sheet = (...rows: string[][]) => parseOdpBlocks([[H, ...rows]]);

describe("parseDbm", () => {
  test("nilai NEGATIF dipertahankan — daya optik selalu di bawah nol", () => {
    // Membuang tandanya mengubah "sinyal lemah" jadi "sinyal kuat".
    assert.equal(parseDbm("-5"), -5);
    assert.equal(parseDbm("-11.5 dBm"), -11.5);
    assert.equal(parseDbm("-7,2"), -7.2);
  });

  test("angka di luar rentang optik ditolak", () => {
    assert.equal(parseDbm("100"), null);
    assert.equal(parseDbm("-99"), null);
    assert.equal(parseDbm("bagus"), null);
  });
});

describe("roleOf", () => {
  test("Master Splitter dikenali dari Tipe maupun dari kodenya", () => {
    assert.equal(roleOf("MS", "BSM 01"), "MS");
    assert.equal(roleOf("Master Spliter", "X"), "MS");
    assert.equal(roleOf("", "MS BSM 040101"), "MS");
    assert.equal(roleOf("", "BSM 01DC01"), "ODP");
  });
});

describe("statusOf", () => {
  test("kosong dianggap aktif, rencana dibedakan", () => {
    assert.equal(statusOf(""), "ACTIVE");
    assert.equal(statusOf("Aktif"), "ACTIVE");
    assert.equal(statusOf("Plan ODP"), "PLANNED");
    assert.equal(statusOf("Nonaktif"), "INACTIVE");
  });
});

describe("parseOdpBlocks", () => {
  test("baris sehat terbaca lengkap", () => {
    const h = sheet(baris());
    assert.equal(h.issues.length, 0);
    const odp = h.rows.find((r) => r.code === "BSM 01DC01")!;
    assert.equal(odp.role, "ODP");
    assert.equal(odp.latitude, -8.459547);
    assert.equal(odp.opticPowerDbm, -5);
    assert.equal(odp.parentRef, "MS BSM 040101");
    assert.equal(odp.portCapacity, 16);
  });

  test("Master Splitter yang cuma disebut sebagai induk TETAP dilahirkan", () => {
    // Tanpa ini hierarki OLT → MS → ODP putus di tengah: 126 dari 183 rujukan
    // MS pada berkas asli tidak punya barisnya sendiri.
    const h = sheet(baris());
    const ms = h.rows.find((r) => r.code === "MS BSM 040101");
    assert.ok(ms, "MS induk seharusnya dibuat");
    assert.equal(ms!.role, "MS");
    assert.equal(ms!.latitude, -8.46);
  });

  test("nama pelanggan pada kolom port terbaca; angka tidak", () => {
    const h = sheet(baris({ 11: "I Ketut Marsa", 12: "3" }));
    const odp = h.rows.find((r) => r.code === "BSM 01DC01")!;
    assert.deepEqual(odp.occupants, [{ portNumber: 1, customerName: "I Ketut Marsa" }]);
  });

  test("koordinat rusak jadi CATATAN — ODP tetap dibuat", () => {
    // Tiangnya nyata meski titiknya salah ketik; menolaknya berarti
    // kehilangan seluruh kapasitas dan hierarkinya demi satu sel.
    const h = sheet(baris({ 4: "dekat pura" }));
    const odp = h.rows.find((r) => r.code === "BSM 01DC01")!;
    assert.equal(odp.latitude, null);
    assert.match(odp.notes.join(" "), /tidak terbaca/);
    assert.equal(h.issues.length, 0);
  });

  test("kode ODP yang mirip TIDAK digabungkan", () => {
    assert.notEqual(normalizeOdpCode("BSS 011204"), normalizeOdpCode("BBS 011204"));
  });

  test("ODP yang sama di dua blok dibaca sekali, yang pertama menang", () => {
    const h = parseOdpBlocks([[H, baris()], [H, baris({ 3: "-20" })]]);
    assert.equal(h.rows.filter((r) => r.code === "BSM 01DC01").length, 1);
    assert.equal(h.rows.find((r) => r.code === "BSM 01DC01")!.opticPowerDbm, -5);
  });

  test("blok tanpa kolom kode dilewati, tidak menggagalkan blok lain", () => {
    const h = parseOdpBlocks([[["Lokasi", "Status"], ["Amlapura", "ok"]], [H, baris()]]);
    assert.equal(h.ignoredBlocks, 1);
    assert.ok(h.rows.some((r) => r.code === "BSM 01DC01"));
  });
});
