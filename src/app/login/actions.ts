"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login } from "@/lib/auth";
import { safeInternalHref, isAppRoute } from "@/lib/internal-link";

const schema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect("/login?error=" + encodeURIComponent("Isi username dan password."));
  }

  const result = await login(parsed.data.identifier, parsed.data.password);
  if (!result.ok) {
    redirect("/login?error=" + encodeURIComponent(result.error));
  }

  // Tujuan setelah login datang dari URL, jadi ia dikendalikan siapa pun yang
  // bisa mengirimi seseorang tautan. `startsWith("/")` TIDAK CUKUP: "//evil.id"
  // lolos darinya, dan peramban membacanya sebagai host lain.
  //
  // Akibatnya bukan sekadar tersesat. Sejak login memakai password EMAIL,
  // sebuah tautan crm.perumnet.id/login?next=//tiruan.id mengantar orang yang
  // baru saja masuk ke halaman palsu — pada detik ketika ia paling percaya
  // bahwa ia sedang berada di dalam sistem.
  //
  // safeInternalHref() sudah menahan semua bentuknya dan dipakai untuk
  // notifikasi serta hasil pencarian; jalur ini yang terlewat.
  const next = formData.get("next");
  const tujuan = typeof next === "string" ? safeInternalHref(next) : null;
  redirect(tujuan && isAppRoute(tujuan) ? tujuan : "/dashboard");
}
