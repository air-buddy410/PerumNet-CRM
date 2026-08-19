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
- `evaluateDunning`, `applyDueTerminations`, `hrd.contract-lifecycle` — masih
  ditahan **hanya** oleh `isEnabled=false`, jadi masih rentan pada lubang nomor
  1 di atas. Utang yang diakui, bukan sesuatu yang sudah beres.

## Membalikkannya nanti

Ketika CRM ini benar-benar menggantikan ALUS, ada **dua** yang harus dibuka,
bukan satu: nyalakan tugasnya lewat `/settings/scheduler` (halamannya sudah ada
dan tercatat di audit log), **dan** setel `OUTWARD_ACTIONS=ALLOWED` lalu
restart. Sebelum itu, pastikan ALUS berhenti melakukan hal yang sama, bukan
berjalan bersamaan.
