import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { cardInvalidReason } from "@/lib/employee-card";
import { loadEmployeeCards } from "@/lib/employee-card-service";
import {
  EmployeeCardPreview,
  EmployeeCardPrintButton,
  type EmployeeCardPreviewData,
} from "@/components/employee-card-preview";

export const metadata = { title: "Cetak Kartu Pegawai" };
export const dynamic = "force-dynamic";

function loaderQrSvg(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const qrSvg = (value as { qrSvg?: unknown }).qrSvg;
  return typeof qrSvg === "string" && qrSvg.trim() ? qrSvg : null;
}

export default async function EmployeeCardPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.HRD_VIEW);
  const { id } = await params;
  const employee = await db.employee.findUnique({
    where: { id },
    select: {
      id: true,
      employeeNo: true,
      fullName: true,
      jobTitle: true,
      isActive: true,
      photoAttachmentId: true,
      user: {
        select: {
          frozenAt: true,
          isActive: true,
          division: { select: { name: true } },
        },
      },
    },
  });
  if (!employee) notFound();

  const cards = await loadEmployeeCards(employee.id);
  const selected = cards.find((card) => card.status === "ACTIVE") ?? cards[0] ?? null;
  const now = new Date();
  const invalidReason = selected
    ? cardInvalidReason(
        {
          status: selected.status,
          expiresAt: selected.expiresAt,
          employeeActive: employee.isActive,
          userFrozenAt: employee.user?.frozenAt ?? null,
          userArchived: employee.user ? !employee.user.isActive : false,
        },
        now,
      )
    : "Belum ada kartu pegawai.";
  const qrSvg = selected ? loaderQrSvg(selected) : null;
  const canPrint = Boolean(selected && !invalidReason && qrSvg);
  const previewData: EmployeeCardPreviewData | null = selected
    ? {
        fullName: employee.fullName,
        jobTitle: employee.jobTitle,
        divisionName: employee.user?.division?.name ?? null,
        employeeNo: employee.employeeNo,
        cardNumber: selected.cardNumber,
        photoUrl: employee.photoAttachmentId ? `/api/files/${employee.photoAttachmentId}` : null,
        qrSvg,
      }
    : null;

  return (
    <main className={`employee-card-print-page ${canPrint ? "" : "is-print-locked"}`}>
      <style media="print">{"@page { size: B4 portrait; margin: 0; }"}</style>
      <div className="employee-card-print-toolbar">
        <Link href={`/hrd/employees/${employee.id}`} className="btn-secondary">
          Kembali ke detail
        </Link>
        {canPrint ? (
          <EmployeeCardPrintButton />
        ) : (
          <span className="employee-card-print-disabled" aria-disabled="true">
            Cetak belum tersedia
          </span>
        )}
      </div>

      <header className="employee-card-print-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">PerumNet HRD</p>
        <h1>Cetak kartu pegawai dua sisi</h1>
        <p>ISO B4 portrait · 250 × 353 mm · cetak duplex sisi panjang</p>
      </header>

      {previewData ? (
        <>
          {!canPrint && (
            <div className="employee-card-print-warning" role="status">
              <strong>Kartu belum dapat dicetak.</strong>
              <span>
                {invalidReason || "QR verifikasi resmi belum tersedia dari loader backend."}
                {!qrSvg && " Print akan aktif setelah QR verifikasi resmi tersedia."}
              </span>
            </div>
          )}
          <EmployeeCardPreview data={previewData} print />
        </>
      ) : (
        <div className="employee-card-print-empty">Belum ada kartu pegawai untuk dicetak.</div>
      )}
    </main>
  );
}
