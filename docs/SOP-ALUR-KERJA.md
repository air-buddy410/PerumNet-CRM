# SOP Alur Kerja — PerumNet CRM

Versi 1.0 · 17 Agustus 2026 · zona waktu **Asia/Makassar**

Dokumen ini menggantikan *Alur Kerja Lengkap v1.0* (PDF) **sebagai panduan
kerja harian**. PDF itu ditulis dari PRD v4.0 yang aspirasional: rute yang
disebutnya (`/registrations`, `/warehouse`, `/superpop`, `/legal`,
`/fiber`) tidak ada di CRM kita maupun di sistem lama. Ia tetap disimpan
sebagai **acuan arsitektur** — prinsipnya bagus dan sebagiannya sudah kita
jalankan — tetapi tim tidak bisa bekerja dari dokumen yang menunjuk layar yang
tidak ada.

Di sini setiap alur menunjuk **rute yang sungguhan**, dan setiap bagian
ditandai:

| Tanda | Arti |
|---|---|
| **`[SEKARANG]`** | Bisa dikerjakan hari ini di CRM |
| **`[SISTEM LAMA]`** | Masih dikerjakan di `perumnet.alus.co.id` sampai cutover |
| **`[FASE X]`** | Belum dibangun; nomor fasenya di `RENCANA-FASE-83-DST.md` |
| **`[BELUM ADA]`** | Belum dibangun dan belum dijadwalkan |

---

## 0. Aturan yang mengatasi semuanya

**CRM sedang dalam MODE BACA-SAJA.** Selama operasional masih di sistem lama:

- CRM **tidak menerbitkan tagihan**, **tidak mengisolir**, **tidak mengirim
  pesan** ke pelanggan.
- Lima tugas berjadwal penulis sengaja dimatikan. Itu **bukan kerusakan** —
  layar Status Sistem menandainya abu, bukan merah.
- Yang berubah di sistem lama **tidak** otomatis masuk ke CRM. Selisihnya
  dihitung dengan `scripts/_rekon-alus.ts`, kapan pun diminta.

**Sistem lama tidak pernah ditulisi dari sini.** Seluruh pengambilan datanya
baca-saja.

**Jangan mengubah status langsung di basis data.** Perbaikan ditempuh lewat
permintaan, persetujuan, revisi, atau work order koreksi. Ini prinsip dari PDF
§22 yang kita pegang penuh.

---

## 1. Pelanggan baru — dari calon sampai menyala

| Langkah | Di mana | Keadaan |
|---|---|---|
| Calon masuk, dilacak sampai jadi | `/sales/leads`, `/sales/pipeline` | **`[SEKARANG]`** |
| Survei lokasi + koordinat | `/sales/surveys` | **`[SEKARANG]`** |
| Penawaran harga | `/sales/quotations` | **`[SEKARANG]`** |
| Persetujuan berjenjang | `/approvals` | **`[SEKARANG]`** |
| Daftar sebagai pelanggan | `/crm/customers` · impor massal `/crm/customers/import` | **`[SEKARANG]`** |
| Buat langganan + paket + PPPoE | `/crm/subscriptions/new` | **`[SEKARANG]`** |
| Jadwalkan pemasangan | `/operations/work-orders` | **`[SEKARANG]`** |
| Siapkan material | `/inventory/requests` → `/inventory/transactions` | **`[SEKARANG]`** |
| **Checkpoint ODP (QR, GPS, foto sebelum-sesudah)** | — | **`[BELUM ADA]`** |
| Tempati port ODP | `/noc/ftth/odp/[id]` | **`[SEKARANG]`** |
| Aktifkan di router | sistem lama | **`[SISTEM LAMA]`** |
| Profil tagihan | `/billing/profiles` | **`[SEKARANG]`**, tidak menagih |

> **Yang paling sering keliru:** pelanggan baru dibuat di sistem lama, bukan di
> CRM. Itu **benar** untuk sekarang — CRM menyusul lewat
> `scripts/_impor-pelanggan.ts`. Jangan membuat orang yang sama di dua tempat.

### Kalau ODP-nya penuh

Empat ODP tercatat penuh padahal masih menampung orang: `GMG 001`, `BB 01`,
`PSG 25 010102`, `PSG 240102` (lihat `AUDIT-DATA-PRODUKSI.md`). **Jangan
memaksa menambah port di CRM** — ukur di lapangan dulu, lalu betulkan
kapasitasnya sekali dengan alasan tertulis.

---

## 2. Gangguan — dari laporan sampai tutup

| Langkah | Di mana | Keadaan |
|---|---|---|
| Pelanggan melapor (telepon/WA) | `/helpdesk/tickets/new` | **`[SEKARANG]`** |
| Pelanggan melapor sendiri lewat portal | `/portal` | **`[FASE 87]`** — backend siap, layar menyusul |
| Kategori & alur tiket | `/helpdesk/categories` | **`[SEKARANG]`** |
| Bagikan ke teknisi | `/helpdesk/dispatch` | **`[SEKARANG]`** |
| Layar dinding ruang NOC | — | **`[FASE 85]`** |
| Lihat sambungan pelanggan | `/noc/pppoe`, `/noc/map` | **`[SEKARANG]`** |
| Naikkan jadi insiden | `/noc/incidents` | **`[SEKARANG]`** |
| Laporan & MTTR | — | **`[FASE 85]`** |

### Urutan memeriksa gangguan, dan alasannya

1. **Buka `/noc/map`, warnai dengan `linkStatus`.** Itu keadaan **dari
   router**, bukan dari tagihan. Pelanggan bisa `ACTIVE` di tagihan tetapi
   `DISABLED` di router, dan sebaliknya.
2. **Lihat tetangga di ODP yang sama.** Satu rumah padam itu urusan rumahnya;
   separuh ODP padam itu urusan seratnya.
3. **Lihat port PON-nya.** Kalau port PON padam, **jangan kirim teknisi ke
   rumah pelanggan** — masalahnya di OLT. Penilaian ini sudah dihitung
   (`onu-telemetry.ts`), layarnya **`[FASE 85]`**.

> **97 pelanggan pada `OLT HSGQ Kecicang` tidak bisa dipantau port PON-nya** —
> OLT itu hidup tetapi modelnya tidak mendukung SNMP. Untuk mereka, satu-satunya
> petunjuk adalah sesi PPPoE. Ini **keadaan tetap**, bukan gangguan.

---

## 3. Penagihan dan isolir

**Seluruhnya `[SISTEM LAMA]` sampai cutover.**

CRM sudah memuat mesinnya lengkap — `/billing/runs`, `/billing/invoices`,
`/billing/isolir`, `/billing/receivables` — tetapi **penjadwalnya dimatikan dan
`Invoice` masih nol baris.** Jangan menekan tombol apa pun di sana dengan
harapan "mencoba dulu".

Untuk melihat apa yang **akan** terjadi tanpa terjadi:

```bash
docker compose run --rm tools npx tsx scripts/_gladi-tagih.ts 2026-08
```

Daftar periksa pindahnya ada di [CUTOVER.md](CUTOVER.md).

---

## 4. Gudang dan perangkat

| Langkah | Di mana | Keadaan |
|---|---|---|
| Master barang, kategori, pemasok | `/inventory/items`, `/inventory/suppliers` | **`[SEKARANG]`** |
| Saldo per gudang | `/inventory/stock` | **`[SEKARANG]`** |
| Permintaan → pengeluaran → serah terima | `/inventory/requests` → `/inventory/transactions` | **`[SEKARANG]`** |
| Cetak dokumen A4 bertanda tangan | `/inventory/transactions/[id]/print` | **`[SEKARANG]`** |
| Perangkat berseri & custody | `/inventory/devices`, `/inventory/custody` | **`[SEKARANG]`** |
| Opname & selisih | `/inventory/opname` | **`[SEKARANG]`** |
| Penarikan perangkat setelah berhenti | `/inventory/device-recoveries` | **`[SEKARANG]`** |
| **Dokumen IRF / DO / STO terpisah** | — | **`[BELUM ADA]`** — sekarang satu jenis transaksi |

**Aturan yang tidak boleh dilanggar:** saldo, slot, status serial, dan buku
besar berubah dalam **satu transaksi**. Tidak boleh ada saldo negatif, dan satu
nomor seri tidak boleh aktif di dua tempat. Ini sudah dijaga kode; kalau suatu
hari ada yang melaporkan saldo negatif, itu **bug**, bukan keadaan yang perlu
diakali.

---

## 5. Jaringan dan FTTH

| Langkah | Di mana | Keadaan |
|---|---|---|
| Peta jaringan berlapis | `/noc/map` | **`[SEKARANG]`** |
| ODP, port, kaskade | `/noc/ftth` | **`[SEKARANG]`** |
| Perangkat & port (sinkron LibreNMS) | `/noc/devices` | **`[SEKARANG]`** |
| Sesi PPPoE | `/noc/pppoe` | **`[SEKARANG]`** |
| Antrean perintah ke router | `/noc/access-jobs` | **`[SEKARANG]`**, tidak dieksekusi |
| Impor/ekspor KML | `/noc/ftth/kml` | **`[SEKARANG]`** |
| Pemetaan PPPoE ↔ langganan | `/noc/pemetaan` | **`[SEKARANG]`** |
| Alarm, insiden, pemeliharaan | `/noc/alarms`, `/noc/incidents`, `/noc/maintenance` | **`[SEKARANG]`** |
| **Fiber backbone, core matrix, OTDR** | — | **`[BELUM ADA]`** |
| **SUPERPOP / rak data center** | — | **`[BELUM ADA]`** |

**Rantai yang sudah utuh:** OLT → port PON → ODP → pelanggan. 549 dari 577 ODP
tertaut ke port PON-nya.

**Yang menahan POP muncul di peta:** koordinat 6 site masih kosong. Begitu
diisi, lapisan site menyala tanpa perubahan kode.

---

## 6. Kepegawaian

`/hrd/employees`, `/hrd/attendance`, `/hrd/schedule`, `/hrd/requests`,
`/hrd/recap` — seluruhnya **`[SEKARANG]`**.

Belum ada: **lokasi absen ber-geofence** dan **lembur** (keduanya ada di sistem
lama). **`[BELUM ADA]`**

---

## 7. Keuangan

`/finance/gl/*` (jurnal, buku besar, neraca saldo, neraca, laba rugi),
`/finance/cashbooks`, `/finance/transactions`, `/finance/closings` —
**`[SEKARANG]`**.

Belum ada dibanding sistem lama: **arus kas**, **perubahan modal**, **rasio
keuangan**. **`[BELUM ADA]`**

Prinsip yang dipegang: **uang tidak boleh punya dua sumber kebenaran.** Semua
peristiwa keuangan menghasilkan satu jurnal; laporan diturunkan dari jurnal.
Jurnal bersifat tambah-saja — koreksi berarti jurnal balik, tidak pernah
menyunting yang lama.

---

## 8. Keamanan, berkas, dan jejak

**`[SEKARANG]`** seluruhnya, dan ini bagian yang paling sesuai dengan PDF §21.

- **Izin diperiksa di server**, selalu. Menu yang tersembunyi bukan pengaman.
- **Berkas privat** tidak pernah disajikan dari folder publik: hanya lewat
  `/api/files/[id]` yang memeriksa izin, memeriksa isi berkas dengan magic-byte,
  menjaga path traversal berlapis, dan menjawab **404 alih-alih 403** supaya
  keberadaan berkasnya tidak bocor.
- **Scan KTP butuh izin sendiri** (`customers.pii_view`), berbeda dari izin
  melihat pelanggan. NIK dan telepon juga disamarkan di daftar.
- **Pembukaan berkas beridentitas dicatat** — siapa membuka apa, kapan.
- **Kata sandi tidak pernah disimpan terbaca**, dan tidak pernah muncul di
  dokumen operasional. (Sistem lama menampilkannya di layar; kita tidak
  menirunya, dan tidak menyalinnya.)
- **Audit** mencatat pelaku, waktu, entitas, dan alasannya.

---

## 9. Ritme kerja

| Kapan | Siapa | Yang diperiksa |
|---|---|---|
| Tiap mulai kerja | semua | Tugas yang ditugaskan, pemberitahuan |
| **Tiap pagi** | NOC | **Status Sistem** — worker jalan? router tertarik? antrean bersih? |
| Harian | Helpdesk | Tiket terbuka, jadwal hari ini, tiket lewat SLA |
| Harian | NOC | Alarm, sesi offline, ODP bermasalah |
| Harian | Gudang | Permintaan tertunda, stok menipis |
| Mingguan | Manajemen | Corong penjualan, kinerja tim, insiden |
| **Mingguan** | siapa pun | **Rekonsiliasi dengan sistem lama** — `_rekon-alus.ts` |
| Bulanan | Keuangan | Tutup buku, opname sampel |

```bash
# dua perintah yang paling sering dipakai
docker compose run --rm tools npx tsx scripts/_cek-kesehatan.ts
docker compose run --rm tools npx tsx scripts/_rekon-alus.ts alus.json
```

**Angka di layar tidak diperbarui sendiri secara langsung.** Ia menyegar setelah
ada perubahan atau setelah halaman dimuat ulang. Seluruh metrik memakai
Asia/Makassar — **jam server UTC**, dan selisih itu pernah membuat kami salah
membaca sehari penuh.

---

## 10. Kalau ada yang salah

| Keadaan | Yang harus dilakukan |
|---|---|
| Stok kurang / seri bentrok | Batalkan, perbaiki dokumennya. Jangan paksa lewat |
| ODP salah / port bentrok | Ajukan perubahan ke NOC. **Jangan ganti diam-diam** |
| Pemasangan gagal | Catat alasannya, jadwalkan ulang |
| Penarikan perangkat gagal | Catat percobaannya. Hanya manajemen yang boleh menetapkan HILANG |
| Sinkron router gagal | Lihat `/noc/access-jobs`; ia bisa diulang |
| Berkas hilang dari penyimpanan | Laporkan. **Jangan hapus barisnya di basis data** |
| Angka CRM ≠ sistem lama | Jalankan rekonsiliasi. Sampai cutover, **sistem lama yang benar** |

---

## Yang belum ada, dan itu disengaja

Supaya tidak ada yang mencarinya: **SUPERPOP/rak**, **fiber core & OTDR**,
**Legal & Compliance**, **checkpoint ODP berevidence**, dan **dokumen IRF/DO/STO
terpisah** belum dibangun. Kelimanya ada di PDF v1.0 dan masih layak dibangun —
tetapi bukan bagian rencana Fase 83–90, dan tidak ada gunanya menulis SOP untuk
layar yang belum ada. Itu kekeliruan yang membuat PDF v1.0 tidak terpakai.

---

## Dokumen ini hidup

Perbarui ketika aturan bisnis, status, persetujuan, peran, atau kebijakan
keamanan berubah — dan **wajib diperbarui saat cutover**, sebab hampir setiap
`[SISTEM LAMA]` di atas akan berubah menjadi `[SEKARANG]` dalam satu hari.
