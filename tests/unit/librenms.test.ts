import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  deviceTypeFromOs,
  vendorFromOs,
  hostnameOf,
  isUp,
  uptimeText,
  shouldSkip,
  portKind,
  aliasOf,
  portNameOf,
  speedBps,
  speedText,
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

describe("port", () => {
  test("golongan port memakai bahasa operasional, bukan istilah SNMP", () => {
    assert.equal(portKind("gpon", "gpon_1/2/1"), "PON");
    assert.equal(portKind("other", "ONU8/41"), "ONU");
    assert.equal(portKind("ethernetCsmacd", "sfp-sfpplus1"), "ETHERNET");
    assert.equal(portKind("l2vlan", "vlan100"), "VLAN");
    assert.equal(portKind("ppp", "pppoe-out1"), "PPP");
  });

  test("port PON OLT HSGQ dikenali walau dinamai menurut daerah", () => {
    // Nilai asli dari 192.168.100.11 dan .12. Operator mengganti nama port
    // PON menjadi nama daerah atau master splitter yang disuapinya. ifType-nya
    // `other`, sama seperti ONU — hanya kecepatan yang memisahkan.
    assert.equal(portKind("other", "MsPuraPuseh", 2_500_000_000n), "PON");
    assert.equal(portKind("other", "Selalang&kalanganyar", 2_500_000_000n), "PON");
    assert.equal(portKind("other", "PON07", 2_500_000_000n), "PON");
    assert.equal(portKind("other", "XGE02", 10_000_000_000n), "ETHERNET");
  });

  test("ONU tetap ONU meski kecepatannya terisi", () => {
    // Pengaman urutan: nama dibaca lebih dulu daripada kecepatan, supaya
    // 671 ONU tidak berubah jadi PON kalau suatu hari perangkat mulai
    // melaporkan laju 2,5 Gbps pada mereka.
    assert.equal(portKind("other", "ONU8/9", 2_500_000_000n), "ONU");
  });

  test("ONU dikenali dari NAMANYA, sebab ifType-nya cuma 'other'", () => {
    // 690 dari 818 port kita bertipe `other`. Tanpa membaca namanya, seluruh
    // ONU pelanggan akan tercampur dengan port lain-lain yang tidak berarti.
    assert.equal(portKind("other", "ONU1/57"), "ONU");
    assert.notEqual(portKind("other", "entah"), "ONU");
  });

  test("ifAlias yang cuma salinan ifName TIDAK disimpan", () => {
    // Perangkat menyalin ifName ke ifAlias saat operator tidak mengisinya.
    // Menyimpannya membuat kolom keterangan tampak terisi 818 dari 818
    // padahal tak satu pun mengatakan sesuatu.
    assert.equal(aliasOf({ port_id: 1, device_id: 2, ifName: "ether13", ifAlias: "ether13" }), null);
    assert.equal(
      aliasOf({ port_id: 2, device_id: 2, ifName: "sfp-sfpplus1", ifAlias: "Uplink-2116-Master_Switch" }),
      "Uplink-2116-Master_Switch"
    );
  });

  test("port tanpa nama menghasilkan null, bukan nama karangan", () => {
    assert.equal(portNameOf({ port_id: 9, device_id: 2, ifName: "  ", ifDescr: null }), null);
    assert.equal(portNameOf({ port_id: 9, device_id: 2, ifName: null, ifDescr: "eth0" }), "eth0");
  });

  test("kecepatan kosong atau nol jadi null, bukan 0n", () => {
    assert.equal(speedBps(null), null);
    assert.equal(speedBps(0), null);
    assert.equal(speedBps("10000000000"), 10_000_000_000n);
  });

  test("kecepatan ditampilkan dalam satuan yang dipakai orang", () => {
    // Angka-angka ini yang benar-benar ada pada enam perangkat kita.
    assert.equal(speedText(10_000_000_000n), "10 Gbps");
    assert.equal(speedText(1_000_000_000n), "1 Gbps");
    assert.equal(speedText(100_000_000n), "100 Mbps");
    assert.equal(speedText(2_500_000_000n), "2.5 Gbps");
  });

  test("kecepatan tak dilaporkan tetap kosong, bukan '0 bps'", () => {
    // Nol pada LibreNMS artinya perangkat tidak melaporkan, dan itu bukan
    // hal yang sama dengan port yang kecepatannya memang nol.
    assert.equal(speedText(null), null);
    assert.equal(speedText(undefined), null);
    assert.equal(speedText(0n), null);
    assert.equal(speedText(-1), null);
  });
});
