"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { applyKmlImport, previewKmlImport } from "@/lib/ftth-kml";

const MAX_BYTES = 4 * 1024 * 1024;

async function readKml(formData: FormData): Promise<{ xml: string } | { error: string }> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return { error: `Berkas terlalu besar (${Math.round(file.size / 1024)} KB, batas 4 MB).` };
    }
    if (/\.kmz$/i.test(file.name)) {
      return {
        error:
          "Berkas KMZ belum didukung — ekstrak dulu menjadi .kml, lalu unggah berkas KML-nya.",
      };
    }
    return { xml: await file.text() };
  }
  const pasted = String(formData.get("kml") ?? "").trim();
  if (!pasted) return { error: "Unggah berkas KML atau tempel isinya." };
  return { xml: pasted };
}

/** Pratinjau — tidak menyimpan apa pun. */
export async function previewKmlAction(formData: FormData): Promise<void> {
  await requirePermission(PERMISSIONS.FTTH_MANAGE);
  const read = await readKml(formData);
  if ("error" in read) {
    redirect("/noc/ftth/kml?error=" + encodeURIComponent(read.error));
  }

  const preview = await previewKmlImport(read.xml);
  const summary = [
    `${preview.counts.match} cocok`,
    `${preview.counts.new} baru`,
    `${preview.counts.duplicate} ganda`,
    `${preview.counts.rejected} ditolak`,
  ].join(" · ");

  // Isi berkas dibawa kembali lewat form agar tahap terapkan memakai data yang
  // SAMA PERSIS dengan yang barusan dilihat — bukan berkas yang mungkin berbeda.
  redirect(
    "/noc/ftth/kml?" +
      new URLSearchParams({ preview: read.xml.slice(0, 200000), ok: `Pratinjau: ${summary}` })
  );
}

export async function applyKmlAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.FTTH_MANAGE);
  const xml = String(formData.get("kml") ?? "");
  if (!xml.trim()) {
    redirect("/noc/ftth/kml?error=" + encodeURIComponent("Tidak ada data pratinjau."));
  }

  const result = await applyKmlImport(user, xml, {
    createMissing: String(formData.get("createMissing") ?? "") === "yes",
    defaultCapacity: Number(formData.get("defaultCapacity") ?? 8),
    siteId: String(formData.get("siteId") ?? "") || null,
  });

  revalidatePath("/noc/ftth");
  revalidatePath("/noc/map");
  redirect(
    "/noc/ftth/kml?" +
      (result.ok
        ? "ok=" +
          encodeURIComponent(
            `Impor selesai: ${result.data?.updated} koordinat diperbarui, ${result.data?.created} ODP baru, ${result.data?.skipped} dilewati.`
          )
        : "error=" + encodeURIComponent(result.error))
  );
}
