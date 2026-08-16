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

## Membalikkannya nanti

Ketika CRM ini benar-benar menggantikan ALUS, nyalakan kembali lewat
`/settings/scheduler` — halamannya sudah ada dan tercatat di audit log. Sebelum
itu, pastikan ALUS berhenti melakukan hal yang sama, bukan berjalan bersamaan.
