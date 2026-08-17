import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bacaKredensialOlt, OltTelnetError } from "@/lib/olt-telnet";

describe("bacaKredensialOlt", () => {
  test("penanda sementara Fase 81 DITOLAK dengan alasan yang benar", () => {
    // Kalau lolos, sambungan mencoba masuk memakai token pemantauan sebagai
    // password dan gagal dengan pesan "password salah" — menyesatkan orang
    // memeriksa kredensial, padahal yang salah penunjuknya.
    assert.throws(
      () => bacaKredensialOlt("LIBRENMS_API_TOKEN"),
      (e: Error) => e instanceof OltTelnetError && /penanda sementara/.test(e.message)
    );
  });

  test("credentialRef kosong ditolak sebelum menyentuh jaringan", () => {
    assert.throws(() => bacaKredensialOlt(null), OltTelnetError);
    assert.throws(() => bacaKredensialOlt("   "), OltTelnetError);
  });

  test("env var yang belum diisi disebut NAMANYA supaya bisa dicari", () => {
    assert.throws(
      () => bacaKredensialOlt("OLT_TIDAK_ADA_CRED"),
      (e: Error) => /OLT_TIDAK_ADA_CRED/.test(e.message)
    );
  });

  test("bentuk user:password diurai; password boleh memuat titik dua", () => {
    process.env.OLT_UJI_CRED = "admin:sandi:dengan:titikdua";
    const k = bacaKredensialOlt("OLT_UJI_CRED");
    assert.equal(k.user, "admin");
    assert.equal(k.password, "sandi:dengan:titikdua");
    delete process.env.OLT_UJI_CRED;
  });

  test("isi tanpa titik dua ditolak, dan pesannya TIDAK mengutip isinya", () => {
    process.env.OLT_UJI2_CRED = "cumapassword";
    try {
      bacaKredensialOlt("OLT_UJI2_CRED");
      assert.fail("seharusnya melempar");
    } catch (e) {
      assert.ok(e instanceof OltTelnetError);
      // Mengutip isinya berarti menaruh rahasia di log.
      assert.doesNotMatch((e as Error).message, /cumapassword/);
    }
    delete process.env.OLT_UJI2_CRED;
  });
});
