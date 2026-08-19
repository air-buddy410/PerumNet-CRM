# Mode baca-saja — JANGAN dinyalakan tanpa perintah pemilik

Ditetapkan 16 Agustus 2026 oleh pemilik jaringan.

**PerumNet masih memakai `perumnet.alus.co.id` untuk operasional sungguhan.**
CRM ini sudah memuat data produksi — 1.711 pelanggan, 577 ODP, 293 material,
4.034 dokumen stok — tetapi belum menjadi sistem yang dipakai. Selama itu
berlaku, ia TIDAK BOLEH bertindak keluar.

Kalau CRM ini mengisolir pelanggan atau mengirim pesan sementara ALUS juga
melakukannya, pelanggan menerima dua perlakuan dari dua sistem yang tidak
saling tahu. Yang paling mungkin terjadi: seseorang terputus dua kali, atau
menerima tagihan yang tidak dikenal siapa pun di kantor.

## Pekerjaan terjadwal yang DIMATIKAN

| Kode | Kalau hidup, ia |
|---|---|
| `channels.outbox` | mengirim pesan ke pelanggan |
| `network.access-jobs` | mengirim perintah isolir ke router |
| `billing.dunning` | mengantrikan isolir bagi penunggak |
| `termination.effective` | memberlakukan terminasi jatuh tempo |
| `hrd.contract-lifecycle` | membekukan lalu mengarsipkan akun pegawai |

Statusnya tersimpan di `ScheduledTask.isEnabled`, dan `syncTaskRegistry()`
sengaja tidak menimpanya — kode hanya pemilik nama dan deskripsi. Jadi deploy
biasa tidak akan menyalakannya kembali.

**Basis data BARU akan menyalakannya**, sebab `enabledByDefault` di
`src/lib/scheduler.ts` memang bernilai true untuk sebagian besar. Itu bawaan
yang benar untuk ISP yang sudah berjalan; yang tidak benar hanya untuk keadaan
sekarang. Kalau basis data pernah dibuat ulang, matikan lagi kelimanya.

## Yang tetap hidup, dan kenapa aman

`librenms.sync`, `pppoe.poll`, `probe.run`, `probe.prune` — seluruhnya MEMBACA
perangkat lalu menyimpan hasilnya. Tidak satu pun mengubah apa pun di luar
basis data ini.

`recovery.sla` dan `identity.group-drift` hanya memberi tahu; `group-drift`
bahkan menyatakannya sendiri: "TIDAK menerapkan apa pun". Pemberitahuannya
tertahan selama `channels.outbox` mati.

## Yang juga tidak boleh dijalankan

- Menerbitkan `InvoiceRun` — profil penagihan sudah siap untuk 1.709 langganan,
  dan angka Agustus akan sekitar Rp 370 juta. Satu perintah, dan tagihan itu
  nyata. Jangan sampai ada yang menjalankannya "sekadar mencoba".
- `postInvoiceRun`, `postTransaction` untuk barang yang bergerak sungguhan,
  dan aksi isolir manual dari halaman mana pun.

## Penjaga di kode (19 Agustus 2026)

Sampai tanggal itu, dokumen ini adalah **satu-satunya** yang menahan — commit
`a3a2c0c` tidak mengubah kode sama sekali. Dua lubangnya nyata:

1. `isEnabled=false` cuma data; **database baru menyalakannya kembali** karena
   empat dari lima tugas ber-`enabledByDefault: true`.
2. Gerbangnya cuma di `runDueTasks()`. **Tombol manual melewatinya sepenuhnya** —
   `runQueueAction`, `runJobsAction`, dan `postInvoiceRunAction` memanggil fungsi
   yang sama tanpa lewat penjadwal; yang menahan hanya izin RBAC.

Sekarang ada `src/lib/outward-guard.ts` dengan saklar `OUTWARD_ACTIONS`,
**bawaan `BLOCKED`** (salah ketik juga BLOCKED). Dipanggil dari dalam fungsi
domainnya, jadi jalur terjadwal dan jalur manual sama-sama menabraknya:

| Fungsi | Berkas |
|---|---|
| `runOutboundQueue()` | `src/lib/channels.ts` |
| `runQueuedJobs()` | `src/lib/dunning.ts` |
| `postInvoiceRun()` | `src/lib/billing.ts` |
| `suspendSubscription()` | `src/lib/dunning.ts` |
| `restoreSubscription()` | `src/lib/dunning.ts` |
| `applyDueTerminations()` | `src/lib/termination.ts` |
| `sweepEmploymentLifecycle()` | `src/lib/employment-lifecycle.ts` |

Empat baris terakhir ditambahkan **19 Agustus 2026 (susulan)** — lihat
§"Tiga jalur susulan" di bawah.

Polanya diambil dari `monitoring-noc/src/server/outward-guard.ts`.

### Koreksi: dua adaptornya ternyata masih rintisan

Diperiksa ke kode 19 Agustus 2026. Dokumen ini sempat menyiratkan CRM bisa
mengirim WhatsApp sungguhan dan perintah router sungguhan hari ini. **Tidak
bisa** — keduanya belum tersambung (§11.7):

- `defaultSender` (`channels.ts:234`) selalu mengembalikan
  *"Adapter gateway belum tersambung"*.
- `defaultExecutor` (`dunning.ts:125`) selalu mengembalikan
  *"Adapter MikroTik belum tersambung"*.

Jadi risiko sungguhan hari ini bukan pesan atau isolir, melainkan
**`postInvoiceRun`** — itu tulisan database yang berakibat nyata dan jalurnya
lengkap. Penjaganya tetap dipasang pada ketiganya justru karena adaptornya
belum ada: saat nanti disambungkan, ia lahir **di belakang** gerbang, bukan di
depannya.

### Yang sengaja TIDAK dijaga

- `postTransaction` (pergerakan stok) — pembukuan internal gudang, bukan
  tindakan terhadap pelanggan. Memblokirnya mematikan operasional gudang yang
  memang sedang dipakai.
- `sendMailSmtp` lewat `account-recovery.ts` — penerimanya `IT_SUPPORT_EMAIL`
  (internal), bukan pelanggan. Memblokirnya mematikan jalur pemulihan akun,
  termasuk bagi orang yang hendak memperbaiki keadaan.
- `freezeAccount()` dipanggil MANUAL dari `settings/users/actions.ts:323` —
  sengaja tetap jalan. Itu keputusan sadar seorang admin atas akun internal,
  bukan aksi keluar; memblokirnya hanya mematikan pekerjaan HRD tanpa
  melindungi siapa pun. Yang dijaga versi otomatisnya — lihat di bawah.

~~`evaluateDunning`, `applyDueTerminations`, `hrd.contract-lifecycle`~~ —
**lunas 19 Agustus 2026.** Ketiganya kini terjaga di kode.

## Tiga jalur susulan (19 Agustus 2026)

Utang yang diakui di atas sudah dibayar. Tapi ketiganya **tidak sekelas**, dan
tempat penjaganya berbeda-beda karena itu.

### `evaluateDunning` → dijaga di `suspendSubscription`, bukan di dirinya

Penjaganya sengaja **tidak** dipasang di `evaluateDunning`. Fungsi itu hanya
perulangan; yang benar-benar bertindak adalah `suspendSubscription`, dan ia
punya DUA pemanggil: penjadwal `billing.dunning`, dan **tombol isolir manual**
di `/billing/isolir`. Menjaga di `evaluateDunning` hanya menutup yang pertama —
dan yang kedua justru lebih mudah ditekan orang.

`restoreSubscription` ikut dijaga meski arahnya memulihkan. Alasannya konkret:
**88 langganan masuk lewat impor sudah berstatus `ISOLATED`.** Memulihkannya
dari CRM membuat CRM mengatakan ACTIVE sementara ALUS — yang sungguh memutus
mereka — tetap mengatakan isolir. Selisih itu lebih berbahaya daripada tidak
melakukan apa-apa, karena orang lalu memutuskan dari layar yang salah.

### `applyDueTerminations` → `attempted` wajib 0

Aksi baru: `subscription.terminate`. Tidak ada perintah yang dikirim keluar; ia
mengubah status langganan jadi `TERMINATED`. Akibatnya tetap mengenai
pelanggan — langganan TERMINATED hilang dari daftar, dari peta, dan dari
penyaringan, sementara ALUS masih melayani orang itu.

Satu hal yang menentukan bentuk kodenya: pemanggilnya di scheduler menjalankan
`assertNotTotalFailure(applied, attempted, summary)`. Kalau penjaganya
mengembalikan `attempted > 0` dengan `applied = 0`, tugas itu dinyatakan
**GAGAL TOTAL** dan jadi merah tiap jam. Penjaga yang bekerja dengan benar
tidak boleh terlihat seperti kerusakan — jadi ia mengembalikan `attempted: 0`,
dan ada tes khusus yang menjaganya tetap begitu.

### `hrd.contract-lifecycle` → yang dijaga OTOMATISNYA, bukan pembekuannya

Aksi baru: `hrd.account-lifecycle`. Ini **satu-satunya aksi di daftar yang
tidak menyentuh pelanggan** — ia membekukan dan mengarsipkan akun pegawai,
seluruhnya di dalam CRM. Tidak ada mailcow, tidak ada surel, tidak ada router;
sudah ditelusuri sampai `archiveAccount`.

Yang membuatnya masuk gerbang yang sama bukan "keluar"-nya, melainkan
**"otomatis"-nya**. Pembekuan menaikkan `sessionEpoch`, yang langsung
mengeluarkan orangnya dari sesi berjalan; pengarsipan menonaktifkan akunnya.
Tanggal kontraknya datang dari impor. Sistem yang masih demo tidak boleh
mengunci orang keluar atas dasar data yang belum pernah diperiksa siapa pun.

Ia juga satu-satunya tugas yang `enabledByDefault: true` **dan** berbahaya —
persis kasus lubang nomor 1. Database baru akan menyalakannya sendiri;
penjaganya yang menutup itu, karena keputusannya tidak lagi tinggal di
database.

## Membalikkannya nanti

Ketika CRM ini benar-benar menggantikan ALUS, ada **dua** yang harus dibuka,
bukan satu: nyalakan tugasnya lewat `/settings/scheduler` (halamannya sudah ada
dan tercatat di audit log), **dan** setel `OUTWARD_ACTIONS=ALLOWED` lalu
restart. Sebelum itu, pastikan ALUS berhenti melakukan hal yang sama, bukan
berjalan bersamaan.
