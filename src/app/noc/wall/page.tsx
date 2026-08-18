import type { Metadata } from "next";
import { loadNocWall } from "@/lib/noc-wall";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import NocWall from "@/components/noc-wall";

export const metadata: Metadata = { title: "Status Jaringan" };
export const dynamic = "force-dynamic";

export default async function NocWallPage() {
  await requirePermission(PERMISSIONS.NOC_VIEW);
  const wall = await loadNocWall();

  return (
    <NocWall
      snapshot={{
        ...wall,
        diperbaruiPada: wall.diperbaruiPada.toISOString(),
      }}
    />
  );
}
