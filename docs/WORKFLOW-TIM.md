# Aturan kerja tim — PerumNet CRM

**Berlaku sejak:** 2026-08-13. Aturan yang sama dipasang di semua aplikasi
PerumNet (lihat §6), supaya pindah aplikasi tidak berarti pindah kebiasaan.

---

## 1. Pembagian peran

| | **Luna** (OpenCode) | **Opus** (Claude Code) |
|---|---|---|
| Tanggung jawab | **FRONTEND** | **BACKEND · SERVER · DATABASE** |
| Yang dikerjakan | Halaman & komponen, design system, tata letak, responsif, aksesibilitas, teks antarmuka, state di sisi klien | Skema database & migrasi, service layer (aturan bisnis), server action, autentikasi & hak akses, worker/tugas berkala, integrasi luar, deploy |
| Berkas khas di repo ini | `src/app/**/page.tsx` (tampilan), `src/components/**`, `src/app/globals.css`, `tailwind.config.ts` | `prisma/schema.prisma`, `src/lib/*.ts`, `src/app/**/actions.ts`, `scripts/worker.ts`, `tests/**` |

Satu aturan yang menyelesaikan sebagian besar tabrakan: **yang menulis ke
database adalah Opus, yang menulis ke mata pengguna adalah Luna.**

## 2. Batas yang tidak boleh dilanggar

**Opus tidak mengubah berkas presentasi.** Tidak menyentuh `globals.css`,
`app-shell.tsx`, `nav.tsx`, atau komponen tampilan milik Luna. Kalau sebuah
fase butuh perubahan tampilan, tulis permintaannya di §5 — jangan kerjakan
sendiri. Halaman baru boleh dibuat Opus, tapi **hanya memakai kelas design
system yang sudah ada**, tidak menciptakan gaya baru.

**Luna tidak mengubah aturan bisnis.** Tidak menyentuh `prisma/schema.prisma`,
`src/lib/*.ts`, atau isi `actions.ts`. Kalau sebuah layar butuh data atau
perilaku yang belum ada, tulis permintaannya di §5 — jangan akali di sisi
klien. Validasi di form itu kenyamanan; **penegakannya tetap di service
layer**, dan yang kedua tidak boleh dilewati.

Alasannya bukan birokrasi: aturan yang ditegakkan di UI bisa dilewati lewat
request langsung, dan gaya yang ditambahkan di luar design system membuat
tampilan pecah di layar kecil. Keduanya sudah pernah terjadi di proyek ini.

## 3. Alur per fase (urutan yang sudah terbukti)

1. Baca dokumen desain/PRD fase itu — jangan mulai dari tebakan.
2. Buat branch sendiri.
3. Skema **ditambah**, bukan diubah; sertakan relasi balik.
4. `npx prisma validate` lalu `npx prisma db push`.
5. Konstanta & permission → seed.
6. Engine di `src/lib/*.ts`, selalu mengembalikan `{ok:true;id}` atau `{ok:false;error}`.
7. Server action tipis, dibungkus `requirePermission`.
8. Halaman UI memakai kelas design system yang ada; entri nav **ditambahkan**, tidak menata ulang.
9. `npx tsc --noEmit` + `npm run build`.
10. Skrip uji sementara di `scripts/_*.ts` — kasus positif **dan** negatif — dihapus setelah selesai.
11. Smoke HTTP/browser, termasuk **viewport 375 px**.
12. Perbarui README + dokumen rencana, lalu commit + PR.

## 4. Aturan yang mahal kalau dilanggar

Semuanya lahir dari kesalahan yang benar-benar terjadi, bukan dari teori.

- **Aturan bisnis ditegakkan di service layer, bukan UI.** Saldo dan stok hanya berubah lewat transaksi yang diposting.
- **Efek samping dokumen turunan menumpang transaksi posting** lewat opsi `afterPost` milik `postTransaction` — bukan transaksi terpisah sesudahnya.
- **Sebelum percaya sebuah tes, jalankan juga terhadap kode SEBELUM perbaikan.** Dua kali tes yang "lolos" ternyata tidak menguji apa pun.
- **`STATUS_LABELS` global tidak boleh memuat kunci yang artinya beda antar modul** (mis. `PARTIAL`); pakai peta ber-konteks seperti `recoveryStatusLabel()`.
- **JANGAN PERNAH `git reset --hard` di direktori kerja bersama.** Pada 2026-08-12 perintah itu menghapus 13 berkas Luna yang belum di-stage; tidak ada yang bisa dipulihkan. Untuk memindahkan commit pakai `git reset --soft` atau `git cherry-pick`.
- **Stage per-berkas, jangan `git add -A`** — direktori kerja ini dipakai dua agen sekaligus.
- **Jangan pakai `--delete-branch` saat merge PR.** Merge di remote, lalu `git checkout` + `git pull --ff-only` (keduanya menolak menimpa perubahan lokal).
- **Jalankan `npx prisma generate` setelah ganti branch.**
- **Pakai `NEXT_DIST_DIR` saat build** supaya tidak menimpa `.next` milik agen lain.

## 5. Papan permintaan antar-peran

Dua arah, dua berkas. Tulis permintaan di sini, jangan kerjakan wilayah orang lain.

- **Opus → Luna:** `docs/HANDOFF-BACKEND-KE-FRONTEND.md` — kontrak yang sudah siap dipakai (nama fungsi, nama field, batas perilaku).
- **Luna → Opus:** `docs/PERMINTAAN-FRONTEND-KE-BACKEND.md` — data/perilaku yang dibutuhkan layar tapi belum ada.

Format permintaan: **layar mana**, **butuh apa**, **kenapa tidak bisa diakali di sisi sendiri**.

## 6. Peta aplikasi PerumNet

Supaya tidak perlu menggali tiap kali membuka chat baru.

| App | Folder | Stack | Database |
|---|---|---|---|
| **CRM** (ini) | `APP-Perumnet/crm` | Next.js 15 + Prisma | PostgreSQL (Docker `perumnet-postgres`, port 5433) |
| **Monitoring NOC** | `APP-Perumnet/monitoring-noc` | Next.js + Drizzle + better-auth | pglite / SQLite |
| **Enterprise** | `APP-Perumnet/enterprise` | Next.js + Drizzle | libsql |
| **Captive Portal** | `APP-Perumnet/captive-portal` | Node (server.mjs) | berkas di `data/` |
| ~~PRTG PerumNet~~ | `APP-Perumnet/_arsip/prtg-lama` | — | **usang**, sudah dilanjutkan oleh Monitoring NOC |

Catatan penting soal PRTG: commit HEAD-nya (`83e1668`, Phase 3) ada di dalam
riwayat Monitoring NOC yang lanjut sampai Phase 8. Repo itu leluhur, bukan
proyek terpisah. **Tapi ada 8 berkas UI yang belum di-commit di sana** dan
belum pernah masuk git mana pun — jangan dihapus sebelum diputuskan.

Kelima folder di atas **sudah dipindahkan** ke dalam folder payung
`~/Dev Project/APP-Perumnet/` pada 2026-08-13. Tiap app tetap repo, database,
dan deploy sendiri — tidak ada monorepo, tidak ada paket bersama.

## 7. Keadaan yang sedang berjalan (CRM)

- Worker MikroTik (`npm run worker`) menarik sesi PPPoE dari router distribusi tiap ±60 detik.
- Koneksi router sempat putus 11–13 Agustus (111× `ECONNREFUSED` di port 8444), pulih 13 Agustus 04:41.
- **1.714 sesi PPPoE tertarik, 0 tertaut ke langganan** — karena tabel `Subscription` masih kosong. Monitor PPPoE belum bisa menjawab "pelanggan X online" sampai data pelanggan + `pppoeUsername` diimpor.
