import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decidingStep, type DecisionStepLike } from "@/lib/approval-decision";

const step = (o: Partial<DecisionStepLike> & { stepOrder: number; status: string }): DecisionStepLike => ({
  actedById: null,
  actedAt: null,
  note: null,
  ...o,
});

describe("decidingStep", () => {
  test("penolakan → langkah yang menolak, bukan yang menyetujui sebelumnya", () => {
    const steps = [
      step({ stepOrder: 1, status: "APPROVED", actedById: "supervisor", note: "lanjut" }),
      step({ stepOrder: 2, status: "REJECTED", actedById: "owner", note: "tidak setuju" }),
    ];
    assert.equal(decidingStep(steps, "REJECTED")?.actedById, "owner");
  });

  test("persetujuan berjenjang → langkah TERAKHIR yang memutuskan", () => {
    // Persetujuan langkah pertama belum menuntaskan apa pun; kalau yang
    // diambil langkah pertama, berita acara menyebut nama yang salah.
    const steps = [
      step({ stepOrder: 1, status: "APPROVED", actedById: "supervisor" }),
      step({ stepOrder: 2, status: "APPROVED", actedById: "owner" }),
    ];
    assert.equal(decidingStep(steps, "APPROVED")?.actedById, "owner");
  });

  test("urutan masukan acak tidak mengubah hasil", () => {
    const steps = [
      step({ stepOrder: 2, status: "APPROVED", actedById: "owner" }),
      step({ stepOrder: 1, status: "APPROVED", actedById: "supervisor" }),
    ];
    assert.equal(decidingStep(steps, "APPROVED")?.actedById, "owner");
  });

  test("satu langkah → langkah itu sendiri", () => {
    const steps = [step({ stepOrder: 1, status: "APPROVED", actedById: "manager", note: "ok" })];
    const d = decidingStep(steps, "APPROVED");
    assert.equal(d?.actedById, "manager");
    assert.equal(d?.note, "ok");
  });

  test("masih menunggu → tidak ada pemutus", () => {
    const steps = [step({ stepOrder: 1, status: "PENDING" })];
    assert.equal(decidingStep(steps, "PENDING"), null);
  });

  test("langkah tanpa pelaku diabaikan, tidak dipaksa jadi pemutus", () => {
    // Lebih baik kosong daripada menyebut nama yang salah di berita acara.
    const steps = [step({ stepOrder: 1, status: "APPROVED", actedById: null })];
    assert.equal(decidingStep(steps, "APPROVED"), null);
  });

  test("langkah tertunda tidak ikut dipilih meski nomornya lebih besar", () => {
    const steps = [
      step({ stepOrder: 1, status: "APPROVED", actedById: "supervisor" }),
      step({ stepOrder: 2, status: "PENDING" }),
    ];
    assert.equal(decidingStep(steps, "APPROVED")?.actedById, "supervisor");
  });

  test("daftar kosong tidak melempar", () => {
    assert.equal(decidingStep([], "APPROVED"), null);
    assert.equal(decidingStep([], "REJECTED"), null);
  });
});
