"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { runQueuedJobs, retryJob } from "@/lib/dunning";

export async function runJobsAction(): Promise<void> {
  const user = await requirePermission(PERMISSIONS.NET_INVENTORY_MANAGE);
  const result = await runQueuedJobs(user);
  revalidatePath("/noc/access-jobs");
  redirect(
    "/noc/access-jobs?" +
      (result.ok
        ? "ok=" + encodeURIComponent(`Antrian dijalankan: ${result.data?.success} sukses, ${result.data?.failed} gagal.`)
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function retryJobAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.NET_INVENTORY_MANAGE);
  const result = await retryJob(user, String(formData.get("jobId") ?? ""));
  revalidatePath("/noc/access-jobs");
  redirect(
    "/noc/access-jobs?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Job dikembalikan ke antrian.")
        : "error=" + encodeURIComponent(result.error))
  );
}
