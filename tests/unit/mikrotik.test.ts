import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPppoe,
  parseRouterOsUptime,
  readCredential,
  MikrotikError,
} from "@/lib/mikrotik";

describe("parseRouterOsUptime", () => {
  test("membaca format lengkap 1w2d03:04:05", () => {
    assert.equal(
      parseRouterOsUptime("1w2d03:04:05"),
      604800 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5
    );
  });

  test("membaca jam:menit:detik saja", () => {
    assert.equal(parseRouterOsUptime("00:10:00"), 600);
  });

  test("nilai kosong menghasilkan null, BUKAN nol", () => {
    // Membedakan "tidak tahu" dari "baru saja naik" — 0 akan berbohong.
    assert.equal(parseRouterOsUptime(undefined), null);
    assert.equal(parseRouterOsUptime(""), null);
  });

  test("nilai tak dikenali menghasilkan null", () => {
    assert.equal(parseRouterOsUptime("entah berapa"), null);
  });
});

describe("classifyPppoe", () => {
  const secrets = [
    { name: "pel-001", disabled: "false" },
    { name: "pel-002", disabled: "false" },
    { name: "pel-003", disabled: "true" },
  ];

  test("Aktif = ada di /ppp/active", () => {
    const { counts } = classifyPppoe([{ name: "pel-001" }], secrets);
    assert.equal(counts.online, 1);
  });

  test("Offline = punya secret, diizinkan, tapi tidak tersambung", () => {
    const { counts } = classifyPppoe([{ name: "pel-001" }], secrets);
    assert.equal(counts.offline, 1, "pel-002 harus terhitung offline");
  });

  test("Disable dibaca dari disabled='true' (string, bukan boolean)", () => {
    const { sessions, counts } = classifyPppoe([], secrets);
    const p3 = sessions.find((s) => s.username === "pel-003");
    assert.equal(p3?.status, "DISABLED");
    assert.equal(counts.disabled, 1);
    assert.equal(counts.offline, 2, "dua secret lain yang tidak tersambung");
  });

  test("sesi aktif tanpa secret tetap dihitung ONLINE", () => {
    // Kalau dibuang, angka di layar tidak akan cocok dengan kenyataan router.
    const { sessions, counts } = classifyPppoe(
      [{ name: "dial-sementara" }],
      secrets
    );
    assert.equal(counts.total, 4);
    assert.equal(
      sessions.find((s) => s.username === "dial-sementara")?.status,
      "ONLINE"
    );
  });

  test("membawa IP, MAC, dan uptime dari sesi aktif", () => {
    const { sessions } = classifyPppoe(
      [
        {
          name: "pel-001",
          address: "10.20.0.11",
          "caller-id": "AA:BB:CC:00:00:01",
          uptime: "01:00:00",
        },
      ],
      secrets
    );
    const s = sessions.find((x) => x.username === "pel-001");
    assert.equal(s?.address, "10.20.0.11");
    assert.equal(s?.callerId, "AA:BB:CC:00:00:01");
    assert.equal(s?.uptimeSeconds, 3600);
  });
});

describe("readCredential", () => {
  test("menolak env var yang belum di-set", () => {
    assert.throws(
      () => readCredential("ENV_YANG_PASTI_TIDAK_ADA_12345"),
      MikrotikError
    );
  });

  test("menolak isi yang bukan user:password", () => {
    process.env.UJI_CRED_SALAH = "tanpapemisah";
    assert.throws(() => readCredential("UJI_CRED_SALAH"), MikrotikError);
  });

  test("memisahkan user dan password pada titik dua PERTAMA", () => {
    // Password boleh mengandung titik dua.
    process.env.UJI_CRED_BENAR = "monitor:rahasia:dengan:titikdua";
    const c = readCredential("UJI_CRED_BENAR");
    assert.equal(c.user, "monitor");
    assert.equal(c.password, "rahasia:dengan:titikdua");
  });
});
