import { verifyCardToken } from "@/lib/employee-card-service";

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

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            PerumNet
          </p>
          <h1 className="mt-1 text-lg font-semibold text-slate-700">
            Verifikasi Kartu Pegawai
          </h1>
        </div>

        <div className="card overflow-hidden p-0">
          <div
            className={`px-5 py-4 text-center text-sm font-semibold text-white ${
              hasil.valid ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            {hasil.valid ? "KARTU BERLAKU" : "KARTU TIDAK BERLAKU"}
          </div>

          {hasil.valid ? (
            <div className="space-y-4 p-6 text-center">
              {hasil.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hasil.photoUrl}
                  alt={`Foto ${hasil.employeeName}`}
                  className="mx-auto h-32 w-32 rounded-full object-cover ring-4 ring-emerald-100"
                />
              ) : (
                <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-400 ring-4 ring-slate-50">
                  Tanpa foto
                </div>
              )}
              <div>
                <p className="text-lg font-semibold text-slate-800">{hasil.employeeName}</p>
                {hasil.jobTitle && <p className="text-sm text-slate-500">{hasil.jobTitle}</p>}
              </div>
              <p className="font-mono text-xs tracking-wider text-slate-400">
                {hasil.cardNumber}
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
