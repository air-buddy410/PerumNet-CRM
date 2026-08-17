import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { segel, buka, periksaMasukan, kunciSiap, RahasiaError, ENV_KUNCI, PORT_BAWAAN } from "@/lib/rahasia-perangkat";

const KUNCI_UJI = "a".repeat(64);
let simpanan: string | undefined;
before(() => { simpanan = process.env[ENV_KUNCI]; process.env[ENV_KUNCI] = KUNCI_UJI; });
after(() => { if (simpanan === undefined) delete process.env[ENV_KUNCI]; else process.env[ENV_KUNCI] = simpanan; });

describe("segel & buka", () => {
  test("apa yang disegel bisa dibuka utuh", () => {
    const s = segel("admin:sandi rahasia:dengan titik dua");
    assert.equal(buka(s), "admin:sandi rahasia:dengan titik dua");
  });

  test("teks yang sama menghasilkan cipher BERBEDA tiap kali", () => {
    // Nonce acak per catatan. Tanpa ini, dua perangkat bersandi sama terlihat
    // sama di basis data — dan itu memberi tahu penebak lebih dari yang perlu.
    const a = segel("sandi-sama");
    const b = segel("sandi-sama");
    assert.notEqual(a.cipher, b.cipher);
    assert.notEqual(a.iv, b.iv);
    assert.equal(buka(a), buka(b));
  });

  test("catatan yang DIUBAH di basis data gagal dibuka, bukan diam-diam salah", () => {
    // Inilah gunanya GCM. Tanpa segel, sandi yang diutak-atik akan terpakai
    // sebagai sandi keliru — dan menumpuk hitungan percobaan gagal di perangkat
    // sungguhan sampai akunnya terkunci.
    const s = segel("sandi-asli");
    const rusak = { ...s, cipher: Buffer.from("sandi-palsu").toString("base64") };
    assert.throws(() => buka(rusak), RahasiaError);
  });

  test("kunci yang berbeda tidak bisa membuka", () => {
    const s = segel("rahasia");
    process.env[ENV_KUNCI] = "b".repeat(64);
    assert.throws(() => buka(s), RahasiaError);
    process.env[ENV_KUNCI] = KUNCI_UJI;
  });

  test("tanpa kunci: galatnya memberi tahu cara membuatnya, tanpa mengutip apa pun", () => {
    delete process.env[ENV_KUNCI];
    assert.equal(kunciSiap(), false);
    try {
      segel("x");
      assert.fail("seharusnya melempar");
    } catch (e) {
      assert.match((e as Error).message, /openssl rand -hex 32/);
    }
    process.env[ENV_KUNCI] = KUNCI_UJI;
  });

  test("kunci sepanjang salah ditolak, dan panjangnya disebut TANPA isinya", () => {
    process.env[ENV_KUNCI] = "abcd";
    try {
      segel("x");
      assert.fail("seharusnya melempar");
    } catch (e) {
      const pesan = (e as Error).message;
      assert.match(pesan, /32 bita/);
      assert.doesNotMatch(pesan, /abcd/);
    }
    process.env[ENV_KUNCI] = KUNCI_UJI;
  });
});

describe("periksaMasukan", () => {
  test("protokol di luar TELNET/SSH ditolak", () => {
    assert.match(periksaMasukan({ protokol: "HTTP", port: 80, username: "a", sandi: "b" })!, /tidak dikenal/);
  });

  test("port di luar jangkauan ditolak", () => {
    assert.ok(periksaMasukan({ protokol: "SSH", port: 0, username: "a", sandi: "b" }));
    assert.ok(periksaMasukan({ protokol: "SSH", port: 70000, username: "a", sandi: "b" }));
    assert.equal(periksaMasukan({ protokol: "SSH", port: null, username: "a", sandi: "b" }), null);
  });

  test("pesan galat TIDAK PERNAH mengutip sandinya", () => {
    const p = periksaMasukan({ protokol: "SALAH", port: 23, username: "admin", sandi: "sandi-sangat-rahasia" });
    assert.doesNotMatch(p!, /sandi-sangat-rahasia/);
  });

  test("port bawaan tiap protokol", () => {
    assert.equal(PORT_BAWAAN.TELNET, 23);
    assert.equal(PORT_BAWAAN.SSH, 22);
  });
});
