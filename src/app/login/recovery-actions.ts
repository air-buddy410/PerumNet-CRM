"use server";

import { requestAccountRecovery } from "@/lib/account-recovery";

// Aksi ini dipanggil TANPA LOGIN — memang harus, sebab yang memakainya adalah
// orang yang tidak bisa masuk. Karena itu seluruh pagarnya ada di dalam
// requestAccountRecovery(): jeda per alamat, batas per jam, dan jawaban yang
// selalu sama supaya formulir ini tidak bisa dipakai memeriksa alamat siapa
// saja yang terdaftar.

export async function requestRecoveryAction(formData: FormData) {
  return requestAccountRecovery(String(formData.get("email") ?? ""));
}
