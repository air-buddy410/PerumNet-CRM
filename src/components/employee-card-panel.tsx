import { CARD_STATUS_LABELS } from "@/lib/employee-card";
import { Badge } from "@/components/ui";
import {
  issueCardAction,
  markCardLostAction,
  replaceCardAction,
  revokeCardAction,
  uploadEmployeePhotoAction,
} from "@/app/(app)/hrd/actions";
import { EmployeeCardPreview, type EmployeeCardPreviewData } from "@/components/employee-card-preview";
import { EmployeePhotoCropper } from "@/components/employee-photo-cropper";
import { formatUiDate } from "@/components/ui-formatters";

export type EmployeeCardView = {
  id: string;
  cardNumber: string;
  status: string;
  issuedAt: Date;
  expiresAt: Date | null;
  nfcUid: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  issuedByName: string | null;
  revokedByName: string | null;
  invalidReason: string | null;
  qrSvg: string | null;
};

function dateLabel(value: Date | null) {
  return formatUiDate(value);
}

export function EmployeeCardPanel({
  employeeId,
  employeeName,
  employeeNo,
  jobTitle,
  divisionName,
  photoAttachmentId,
  cards,
  canManage,
}: {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  jobTitle: string | null;
  divisionName: string | null;
  photoAttachmentId: string | null;
  cards: EmployeeCardView[];
  canManage: boolean;
}) {
  const activeCard = cards.find((card) => card.status === "ACTIVE") ?? null;
  const previewCard = activeCard ?? cards[0] ?? null;
  const previewData: EmployeeCardPreviewData | null = previewCard
    ? {
        fullName: employeeName,
        jobTitle,
        divisionName,
        employeeNo,
        cardNumber: previewCard.cardNumber,
        photoUrl: photoAttachmentId ? `/api/files/${photoAttachmentId}` : null,
        qrSvg: previewCard.qrSvg,
      }
    : null;

  return (
    <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="employee-card-title">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="employee-card-title" className="text-lg font-semibold text-slate-700">
            Foto dan kartu pegawai
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
            Foto resmi dan riwayat kartu dikelola HRD. Kartu lama tetap disimpan agar jejak penerbitan dapat ditelusuri.
          </p>
        </div>
        <span className="crm-badge is-neutral shrink-0">Dokumen HRD</span>
      </div>

      <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[9rem_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="employee-card-photo-frame">
            {photoAttachmentId ? (
              <img
                src={`/api/files/${photoAttachmentId}`}
                alt={`Foto resmi ${employeeName}`}
                className="employee-card-photo"
              />
            ) : (
              <span className="employee-card-photo-placeholder" aria-label="Foto resmi belum tersedia">
                {employeeName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          {canManage && (
            <p className="employee-card-photo-note">
              Gunakan panel crop di bawah untuk memilih bidang foto kartu.
            </p>
          )}
        </div>

        <div className="min-w-0">
          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="min-w-[720px] w-full">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Nomor kartu</th>
                  <th className="th">Status</th>
                  <th className="th">Diterbitkan</th>
                  <th className="th">Berlaku sampai</th>
                  <th className="th">NFC UID</th>
                  <th className="th">Penerbit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cards.length === 0 ? (
                  <tr>
                    <td className="td" colSpan={6}>Belum ada kartu pegawai.</td>
                  </tr>
                ) : (
                  cards.map((card) => (
                    <tr key={card.id}>
                      <td className="td whitespace-nowrap font-semibold text-slate-700">{card.cardNumber}</td>
                      <td className="td">
                        <Badge value={card.status} label={CARD_STATUS_LABELS[card.status as keyof typeof CARD_STATUS_LABELS] ?? card.status} />
                        {card.invalidReason && (
                          <span className="mt-1 block max-w-[220px] text-[11px] leading-relaxed text-amber-700">
                            {card.invalidReason}
                          </span>
                        )}
                      </td>
                      <td className="td whitespace-nowrap">
                        <span className="block">{dateLabel(card.issuedAt)}</span>
                        <span className="text-[11px] text-slate-400">{card.issuedByName ?? "—"}</span>
                      </td>
                      <td className="td whitespace-nowrap">{dateLabel(card.expiresAt)}</td>
                      <td className="td whitespace-nowrap font-mono text-[11px]">{card.nfcUid ?? "—"}</td>
                      <td className="td whitespace-nowrap text-[11px]">
                        {card.revokedAt ? `Diubah ${dateLabel(card.revokedAt)}` : "Masih aktif"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {cards.some((card) => card.revokedAt || card.revokeReason || card.revokedByName) && (
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Riwayat perubahan status ditampilkan pada detail kartu. Alasan pencabutan tidak dihapus.
            </p>
          )}
        </div>
      </div>

      {canManage && (
        <div className="employee-photo-cropper-panel mt-5 border-t border-slate-100 pt-5">
          <EmployeePhotoCropper
            employeeId={employeeId}
            action={uploadEmployeePhotoAction}
            currentPhoto={Boolean(photoAttachmentId)}
          />
        </div>
      )}

      {previewData && previewCard && (
        <div className="employee-card-preview-panel mt-6 border-t border-slate-100 pt-5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-700">Pratinjau kartu B4</h3>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                Sisi depan dan belakang memakai rasio ISO B4. Balik kartu untuk memeriksa informasi di sisi kedua.
              </p>
            </div>
            {previewCard.qrSvg && !previewCard.invalidReason ? (
              <a
                href={`/hrd/employees/${employeeId}/card/print`}
                className="btn-secondary shrink-0 justify-center text-xs"
              >
                Cetak dua sisi
              </a>
            ) : (
              <span
                className="employee-card-print-disabled shrink-0"
                aria-disabled="true"
                title={previewCard.invalidReason ?? "Menunggu QR verifikasi resmi dari server"}
              >
                {previewCard.invalidReason ? "Cetak tidak tersedia" : "Cetak menunggu QR"}
              </span>
            )}
          </div>
          <div className="mt-4 max-w-[25rem]">
            <EmployeeCardPreview data={previewData} />
          </div>
          {(!previewCard.qrSvg || previewCard.invalidReason) && (
            <p className="mt-3 text-xs leading-relaxed text-amber-700">
              {previewCard.invalidReason
                ? `${previewCard.invalidReason} Preview tetap dapat dibalik, tetapi kartu fisik belum dapat dicetak.`
                : "QR verifikasi resmi belum disediakan oleh loader backend. Preview tetap dapat dibalik, tetapi kartu fisik belum dapat dicetak."}
            </p>
          )}
        </div>
      )}

      {!previewData && (
        <div className="employee-card-empty mt-6 border-t border-slate-100 pt-5">
          Belum ada kartu untuk dipratinjau. Terbitkan kartu terlebih dahulu setelah data pegawai siap.
        </div>
      )}

      {canManage && (
        <div className="mt-6 grid min-w-0 gap-4 border-t border-slate-100 pt-5 lg:grid-cols-2">
          {!activeCard ? (
            <form action={issueCardAction} className="min-w-0 rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
              <input type="hidden" name="employeeId" value={employeeId} />
              <h3 className="text-sm font-semibold text-emerald-900">Terbitkan kartu</h3>
              <p className="mt-1 text-xs leading-relaxed text-emerald-800/80">Kartu hanya diterbitkan untuk data pegawai yang aktif.</p>
              <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`issue-expires-${employeeId}`}>Berlaku sampai</label>
                  <input id={`issue-expires-${employeeId}`} name="expiresAt" type="date" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor={`issue-nfc-${employeeId}`}>NFC UID (opsional)</label>
                  <input id={`issue-nfc-${employeeId}`} name="nfcUid" className="input" placeholder="Belum tersedia" />
                </div>
              </div>
              <button type="submit" className="btn-primary mt-4">Terbitkan kartu</button>
            </form>
          ) : (
            <form action={replaceCardAction} className="min-w-0 rounded-lg border border-amber-100 bg-amber-50/60 p-4">
              <input type="hidden" name="employeeId" value={employeeId} />
              <input type="hidden" name="cardId" value={activeCard.id} />
              <h3 className="text-sm font-semibold text-amber-900">Ganti kartu aktif</h3>
              <p className="mt-1 text-xs leading-relaxed text-amber-800/80">
                Kartu {activeCard.cardNumber} akan dimatikan sebelum kartu pengganti diterbitkan.
              </p>
              <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`replace-expires-${employeeId}`}>Berlaku sampai</label>
                  <input id={`replace-expires-${employeeId}`} name="expiresAt" type="date" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor={`replace-nfc-${employeeId}`}>NFC UID (opsional)</label>
                  <input id={`replace-nfc-${employeeId}`} name="nfcUid" className="input" placeholder="Belum tersedia" />
                </div>
              </div>
              <label className="label mt-3" htmlFor={`replace-reason-${employeeId}`}>Alasan penggantian</label>
              <textarea id={`replace-reason-${employeeId}`} name="reason" className="input min-h-20" minLength={3} required placeholder="Contoh: kartu rusak" />
              <button type="submit" className="btn-primary mt-4">Terbitkan pengganti</button>
            </form>
          )}

          {activeCard ? (
            <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/70 p-4">
              <h3 className="text-sm font-semibold text-slate-800">Tindakan kartu aktif</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Status akhir kartu tidak dapat dibalik. Isi alasan sebelum mengubahnya.</p>
              <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                <form action={markCardLostAction} className="min-w-0 rounded-lg border border-amber-100 bg-white p-3">
                  <input type="hidden" name="employeeId" value={employeeId} />
                  <input type="hidden" name="cardId" value={activeCard.id} />
                  <label className="label" htmlFor={`lost-reason-${employeeId}`}>Alasan kartu hilang</label>
                  <textarea id={`lost-reason-${employeeId}`} name="reason" className="input min-h-20" minLength={3} required />
                  <button type="submit" className="btn-secondary mt-3 w-full justify-center text-xs">Tandai hilang</button>
                </form>
                <form action={revokeCardAction} className="min-w-0 rounded-lg border border-rose-100 bg-white p-3">
                  <input type="hidden" name="employeeId" value={employeeId} />
                  <input type="hidden" name="cardId" value={activeCard.id} />
                  <label className="label" htmlFor={`revoke-reason-${employeeId}`}>Alasan pencabutan</label>
                  <textarea id={`revoke-reason-${employeeId}`} name="reason" className="input min-h-20" minLength={3} required />
                  <button type="submit" className="btn-danger mt-3 w-full justify-center text-xs">Cabut kartu</button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 items-center rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-xs leading-relaxed text-slate-500">
              Belum ada kartu aktif. Terbitkan kartu pertama dari panel di sebelah kiri.
            </div>
          )}
        </div>
      )}

      {!canManage && (
        <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
          Anda dapat melihat riwayat kartu, tetapi hanya HRD dengan akses kelola yang dapat mengunggah foto atau mengubah status kartu.
        </p>
      )}
    </section>
  );
}
