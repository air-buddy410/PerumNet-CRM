import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  deviceTypeFromOs,
  vendorFromOs,
  hostnameOf,
  isUp,
  uptimeText,
  shouldSkip,
} from "@/lib/librenms";

// Nilai-nilai di berkas ini disalin apa adanya dari enam perangkat PerumNet
// yang benar-benar dipantau, bukan dikarang.

describe("deviceTypeFromOs", () => {
  test("routeros adalah router", () => {
    assert.equal(deviceTypeFromOs("routeros", "prm_nagabasukih_d"), "ROUTER");
  });

  test("zxa10 adalah OLT", () => {
    assert.equal(deviceTypeFromOs("zxa10", "zxan"), "OLT");
  });

  test("parks-switch dengan sysName 'olt' tetap dikenali OLT", () => {
    // Firmware HSGQ menyamar sebagai perangkat Parks sehingga LibreNMS salah
    // mengenalinya. Tanpa aturan ini, dua OLT kita tercatat sebagai switch.
    assert.equal(deviceTypeFromOs("parks-switch", "olt"), "OLT");
  });

  test("parks-switch tanpa petunjuk sysName tetap switch", () => {
    assert.equal(deviceTypeFromOs("parks-switch", "sw-lantai2"), "ACCESS_SWITCH");
  });

  test("os yang tidak dikenal jadi OTHER, bukan ditebak", () => {
    assert.equal(deviceTypeFromOs("entahapa", null), "OTHER");
    assert.equal(deviceTypeFromOs(null, null), "OTHER");
  });
});

describe("vendorFromOs", () => {
  test("merek diturunkan dari os", () => {
    assert.equal(vendorFromOs("routeros", null), "MikroTik");
    assert.equal(vendorFromOs("zxa10", "zxan"), "ZTE");
  });

  test("HSGQ dibedakan dari Parks lewat sysName", () => {
    assert.equal(vendorFromOs("parks-switch", "olt"), "HSGQ");
    assert.equal(vendorFromOs("parks-switch", "sw-01"), "Parks");
  });

  test("yang tidak diketahui jadi null, bukan string kosong", () => {
    assert.equal(vendorFromOs("generic", null), null);
  });
});

describe("hostnameOf", () => {
  test("sysName yang bermakna dipakai", () => {
    assert.equal(
      hostnameOf({ device_id: 2, hostname: "192.168.100.1", sysName: "prm_nagabasukih_d" }),
      "PRM_NAGABASUKIH_D"
    );
  });

  test("nama bawaan pabrik TIDAK dipakai — tiga OLT bernama sama tak bisa dibedakan", () => {
    // Ketiga OLT ZTE melaporkan sysName "zxan". Memakainya membuat perangkat
    // kedua dan ketiga menabrak keunikan hostname, lalu impor berhenti.
    const a = hostnameOf({ device_id: 1, hostname: "192.168.100.60", sysName: "zxan" });
    const b = hostnameOf({ device_id: 5, hostname: "192.168.100.61", sysName: "zxan" });
    assert.notEqual(a, b);
    assert.equal(a, "192.168.100.60");
  });

  test("sysName 'olt' juga nama bawaan — kedua HSGQ tidak boleh bertabrakan", () => {
    const a = hostnameOf({ device_id: 4, hostname: "192.168.100.11", sysName: "olt" });
    const b = hostnameOf({ device_id: 6, hostname: "192.168.100.12", sysName: "olt" });
    assert.notEqual(a, b);
  });

  test("sysName kosong jatuh ke alamat IP", () => {
    assert.equal(hostnameOf({ device_id: 9, hostname: "10.0.0.1", sysName: null }), "10.0.0.1");
  });
});

describe("isUp", () => {
  test("angka maupun teks sama-sama diterima", () => {
    assert.equal(isUp(1), true);
    assert.equal(isUp("1"), true);
    assert.equal(isUp("up"), true);
    assert.equal(isUp(0), false);
    assert.equal(isUp("0"), false);
  });

  test("kosong berarti TIDAK hidup, bukan dianggap hidup", () => {
    // Kalau ragu, jangan laporkan perangkat sebagai sehat.
    assert.equal(isUp(null), false);
    assert.equal(isUp(undefined), false);
    assert.equal(isUp(""), false);
  });
});

describe("uptimeText", () => {
  test("detik menjadi kalimat yang bisa dibaca", () => {
    assert.equal(uptimeText(8_582_907), "99 hari 8 jam");
    assert.equal(uptimeText(7_200), "2 jam 0 menit");
  });

  test("nol atau tidak masuk akal jadi null", () => {
    assert.equal(uptimeText(0), null);
    assert.equal(uptimeText(null), null);
    assert.equal(uptimeText("bukan angka"), null);
  });
});

describe("shouldSkip", () => {
  test("perangkat yang dinonaktifkan atau diabaikan tidak ikut", () => {
    // Operator sengaja mengeluarkannya dari pemantauan; menariknya ke CRM
    // memunculkannya kembali seakan-akan masih diawasi.
    assert.equal(shouldSkip({ device_id: 1, hostname: "x", disabled: 1 }), true);
    assert.equal(shouldSkip({ device_id: 1, hostname: "x", ignore: true }), true);
  });

  test("perangkat biasa ikut", () => {
    assert.equal(shouldSkip({ device_id: 1, hostname: "x", disabled: 0, ignore: 0 }), false);
    assert.equal(shouldSkip({ device_id: 1, hostname: "x" }), false);
  });
});
