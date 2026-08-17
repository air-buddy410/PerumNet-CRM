import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bolehMintaReboot, AKSI_REBOOT_ONU } from "@/lib/onu-reboot";

describe("bolehMintaReboot", () => {
  test("tanpa posisi ONU tidak bisa diantrekan", () => {
    const h = bolehMintaReboot({ adaPosisiOnu: false, sudahAdaAntrean: false });
    assert.equal(h.boleh, false);
    assert.match(h.boleh === false ? h.alasan : "", /belum punya posisi ONU/);
  });

  test("antrean kembar ditolak — satu klik berulang tidak menumpuk", () => {
    const h = bolehMintaReboot({ adaPosisiOnu: true, sudahAdaAntrean: true });
    assert.equal(h.boleh, false);
    assert.match(h.boleh === false ? h.alasan : "", /masih dalam antrean/);
  });

  test("permintaan yang wajar boleh masuk antrean", () => {
    assert.deepEqual(bolehMintaReboot({ adaPosisiOnu: true, sudahAdaAntrean: false }), { boleh: true });
  });

  test("action-nya string tetap, bukan enum yang butuh migrasi", () => {
    assert.equal(AKSI_REBOOT_ONU, "ONU_REBOOT");
  });
});
