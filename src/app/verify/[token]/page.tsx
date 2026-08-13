import { verifyCardToken } from "@/lib/employee-card-service";
import { EmployeeCardPreview } from "@/components/employee-card-preview";

// ── Halaman verifikasi kartu pegawai (Fase 50) ──────────────────
//
// Dibuka TANPA LOGIN, biasanya oleh pelanggan yang memindai QR di kartu orang
// yang berdiri di depan pintunya. Karena itu satu pertanyaan yang dijawab
// halaman ini: "orang ini benar dari PerumNet atau bukan?"
//
// Isinya sudah disaring publicVerification() — nama, jabatan, foto, nomor
// kartu, dan tidak lebih. Kartu dipakai di tempat umum sepanjang hari; anggap
// semua yang bisa dipindai darinya akan dilihat orang asing.
//
// Kartu yang TIDAK berlaku tetap dijawab, bukan didiamkan: justru itu yang
// perlu diketahui pelanggan. Tapi jawabannya tidak menyebut nama siapa pun —
// kartu kedaluwarsa milik siapa bukan urusan orang yang memindainya.

export const metadata = { title: "Verifikasi Kartu Pegawai · PerumNet" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const hasil = await verifyCardToken(token);

  const publicCard = hasil.valid
    ? {
        fullName: hasil.employeeName ?? "PerumNet",
        jobTitle: hasil.jobTitle,
        divisionName: null,
        employeeNo: null,
        cardNumber: hasil.cardNumber ?? "—",
        photoUrl: hasil.photoUrl,
        qrSvg: null,
      }
    : null;

  return (
    <main className="employee-card-verify-page">
      <div className="employee-card-verify-wrap">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            PerumNet
          </p>
          <h1 className="mt-1 text-lg font-semibold text-slate-700">
            Verifikasi Kartu Pegawai
          </h1>
        </div>

        <div className="employee-card-verify-status card overflow-hidden p-0">
          <div
            className={`px-5 py-4 text-center text-sm font-semibold text-white ${
              hasil.valid ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            {hasil.valid ? "KARTU BERLAKU" : "KARTU TIDAK BERLAKU"}
          </div>

          {publicCard ? (
            <div className="employee-card-verify-content">
              <EmployeeCardPreview data={publicCard} mode="public" />
              <p className="employee-card-verify-note">
                Balik kartu untuk melihat sisi belakang. Halaman ini hanya menampilkan data publik yang diperlukan untuk verifikasi.
              </p>
            </div>
          ) : (
            <div className="space-y-3 p-6 text-center">
              <p className="text-sm text-slate-600">{hasil.reason}</p>
              <p className="text-xs leading-relaxed text-slate-500">
                Jangan memberikan akses atau data apa pun kepada pemegang kartu ini.
                Bila Anda ragu, hubungi PerumNet melalui nomor resmi yang Anda kenal —
                bukan nomor yang diberikan orang tersebut.
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
          Halaman ini hanya menampilkan keterangan seperlunya untuk memastikan
          identitas petugas. Data pribadi lain tidak ditampilkan.
        </p>
      </div>
    </main>
  );
}
