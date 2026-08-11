// ── Penentu "siapa yang memutuskan" (Fase 29) ───────────────────
// Modul MURNI: tidak menyentuh database.
//
// Approval engine tidak punya callback, jadi modul pemakainya menjemput
// sendiri hasil keputusan (pola yang sama dipakai write-off perangkat dan
// stock opname). Saat menjemput, gampang sekali salah mencatat SIAPA yang
// memutuskan: yang menekan tombol "terapkan keputusan" belum tentu approver.
// Aturan pemilihannya dipisah ke sini supaya bisa diuji langsung.

export interface DecisionStepLike {
  stepOrder: number;
  status: string; // PENDING | APPROVED | REJECTED
  actedById: string | null;
  actedAt: Date | null;
  note: string | null;
}

/**
 * Langkah approval yang menjadi dasar keputusan akhir.
 *
 *  - DITOLAK  → langkah yang menolak. Penolakan menghentikan seluruh request,
 *               jadi hanya ada satu.
 *  - DISETUJUI→ langkah TERAKHIR yang menyetujui. Pada rule berjenjang,
 *               persetujuan langkah pertama belum memutuskan apa pun; yang
 *               menuntaskan adalah yang terakhir.
 *
 * Mengembalikan null bila belum ada keputusan atau datanya tidak lengkap —
 * pemanggil harus menyiapkan nilai cadangan, bukan menebak nama orang.
 */
export function decidingStep<T extends DecisionStepLike>(
  steps: T[],
  requestStatus: string
): T | null {
  if (requestStatus === "REJECTED") {
    return steps.find((s) => s.status === "REJECTED" && s.actedById) ?? null;
  }
  if (requestStatus === "APPROVED") {
    const approved = steps.filter((s) => s.status === "APPROVED" && s.actedById);
    if (!approved.length) return null;
    return approved.reduce((last, s) => (s.stepOrder > last.stepOrder ? s : last));
  }
  return null;
}
