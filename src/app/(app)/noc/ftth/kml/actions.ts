"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { applyKmlImport, previewKmlImport } from "@/lib/ftth-kml";
import { readKmlSource } from "@/lib/kmz";
import type { ImportPointType } from "@/lib/ftth-point-type";

const MAX_BYTES = 4 * 1024 * 1024;

async function readKml(formData: FormData): Promise<{ xml: string } | { error: string }> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return { error: `Berkas terlalu besar (${Math.round(file.size / 1024)} KB, batas 4 MB).` };
    }
    // KMZ maupun KML sama-sama diterima. Jenisnya ditentukan dari ISI berkas,
    // bukan dari namanya — nama berkas dikendalikan pengunggah dan sering
    // salah, mis. arsip KMZ yang di-rename menjadi .kml.
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      return { xml: readKmlSource(buf) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Berkas tidak dapat dibaca." };
    }
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

  const unknownAs = (String(formData.get("unknownAs") ?? "") || null) as
    | ImportPointType
    | null;
  const preview = await previewKmlImport(read.xml, { unknownAs });
  const summary = [
    `${preview.counts.new} baru`,
    `${preview.counts.fill} diisi`,
    `${preview.counts.keep} dipertahankan`,
    `${preview.counts.skip} dilewati`,
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
            `Impor selesai: ${result.data?.created} titik baru, ${result.data?.filled} koordinat diisi, ${result.data?.skipped} dilewati. Koordinat yang sudah terisi tidak ditimpa.`
          )
        : "error=" + encodeURIComponent(result.error))
  );
}
