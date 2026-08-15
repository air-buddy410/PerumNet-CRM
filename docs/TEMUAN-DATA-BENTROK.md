# Temuan data bentrok — sumber spreadsheet PerumNet

Tanggal: 15 Agustus 2026
Sumber: `Salinan dari Items`, `Salinan dari 2026 Master Data Perumnet`,
`Salinan dari Alokasi Core` (Google Drive), plus data PPPoE langsung dari
router distribusi.

Dokumen ini mencatat **apa yang bentrok, bagaimana ketahuannya, dan keputusan
apa yang diambil.** Ia ditulis supaya keputusan-keputusan itu tidak perlu
diperdebatkan ulang setiap kali ada ekspor baru — dan supaya yang sengaja
DIBIARKAN tidak dikira terlewat.

Aturan yang dipegang di seluruh dokumen ini: **importir tidak menebak.**
Sebuah nilai hanya dipulihkan otomatis kalau ada lebih dari satu sinyal
independen yang menyetujuinya. Selebihnya dilaporkan ke manusia, dengan
usulan, supaya bisa diputuskan sekali lihat.

---

## 1. Cakupan data: sheet bukan basis pelanggan

Temuan paling menentukan, dan yang paling mengubah rencana.

| | Jumlah |
|---|---|
| Username PPPoE aktif di router | **1.718** |
| CID di sheet Master Data | 156 |
| CID yang benar-benar cocok dengan sesi PPPoE | **65** |

Dipecah per pola kode:

| Pola | Jumlah | Cocok dengan PPPoE |
|---|---|---|
| `PN26*` (registrasi 2026) | 68 | **65 (96%)** |
| `PN10*` (blok OLT) | 87 | **0 (0%)** |
| baris judul yang bocor jadi data | 1 | — |

**Kesimpulan:** sheet ini adalah *log registrasi 2026*, bukan master
pelanggan. 1.653 pelanggan (96%) ada di **Wifinetbill**, dan username
PPPoE-nya memakai skema lama berbasis area — `sryb_042532_mardika`,
`bgy07sugiana04`, `sry_1010008_suriyasih` — yang mendahului `PN26*`.

**Keputusan:** blok `PN10*` **tidak diimpor** (dinyatakan tidak terpakai lagi
oleh pemilik data). Importir dirancang berbasis alias nama kolom supaya ekspor
Wifinetbill nanti tinggal dipetakan, bukan ditulis ulang.

---

## 2. Katalog material (`Items`, 6 lembar)

### 2.1 Lembar saldo bukan lembar yang terlihat seperti saldo

Lembar keempat memuat **empat blok berdampingan** dalam satu tab:

| Kolom | Isi sebenarnya |
|---|---|
| `Item ID` \| `Amount` | salinan baris pergerakan — satu kode muncul berkali-kali |
| `Kode Material` \| *nama* \| `Stok` | **saldo berjalan yang sesungguhnya** |
| `Kode` \| `Barang` \| `Jumlah` | blok VLOOKUP, banyak `#N/A` |
| `Operasional` \| `Jumlah` | ringkasan buatan tangan |

Membaca blok pertama sebagai saldo membuat setiap barang tercatat berkali-kali
dengan angka berbeda, dan yang terbaca terakhir menang diam-diam.

**Keputusan:** lembar dikenali dari judulnya dengan syarat `mustNot` — lembar
pergerakan (`Item ID` + `Amount` + `DateTime`) dan lembar saldo
(`Kode Material` + `Stok`) tidak bisa saling tertukar.

### 2.2 Riwayat pergerakan tidak rekonsiliasi

| | |
|---|---|
| Baris pergerakan | 206 |
| Barang yang tercakup | 59 dari 172 |
| Saldo yang cocok dengan jumlah pergerakan | **12 dari 58** |
| Kolom `SN` terisi | **0 dari 206** |
| Variasi ejaan arah pada kolom Description | **12** untuk 3 konsep |

Ejaannya: `Stok Keluar` / `Stok keluar` / `stok keluar` / `Stok Kaluar` /
`Stok Out`, `Stok Awal` / `Awal Stok` / `Stok awal` / `Stock Awal`,
`Stok Masuk` / `New Stok` / `Stok Baru`. Dua baris malah berisi referensi
pekerjaan (`Instalasi Tiying Tali`, `Modem Kembali`).

Tandanya sendiri **cukup andal** — 114 dari 206 bernilai negatif dan arahnya
sesuai, kecuali 2 baris `Stok Keluar` yang bernilai positif. Tapi cakupannya
yang tidak cukup: log ini hanya mengenal sepertiga barang.

**Keputusan:** riwayat pergerakan **sengaja tidak diimpor**. Saldo awal
diambil dari lembar saldo sekali jalan, lewat `GOODS_RECEIPT` biasa agar tetap
punya nomor dokumen dan ledger. Jumlah baris yang dilewati dilaporkan di
pratinjau sebagai kalimat, bukan angka telanjang — tanpa penjelasan orang akan
mengira riwayatnya hilang.

### 2.3 Kode rusak: satu sinyal tidak pernah cukup

Sepuluh kode di lembar saldo tidak berbentuk `PREFIKS-0000`. Sembilan di
antaranya punya **tepat satu** kandidat setelah nomornya dinormalkan ke empat
digit — dan justru di situ jebakannya.

| Kode rusak | Nama di lembar saldo | Kandidat | Nama di katalog | Hasil |
|---|---|---|---|---|
| `ACC-005` | Compact Closure | `ACC-0005` | Compact Closure Outdoor | **dipulihkan** |
| `SER-006` | Polo Tosca | `SER-0006` | Polo Tosca S | **dipulihkan** |
| `SPL-000001` | NB Spliter PLC 1:16 | `SPL-0001` | NB Spliter PLC 1:16 | **dipulihkan** |
| `SPL-000003` | NB Splitter PLC 1:2 | `SPL-0003` | NB Splitter PLC 1:2 | **dipulihkan** |
| `PAT-000009` | **Pigtail Tipe ST** | `PAT-0009` | **Patch Core LC UPC** | ditolak — barang beda |
| `POL-005` | Tiang 9 Meter | `POL-0005` | Tiang 9 M 3 Dim 4 Inch | ditolak — nama tidak menguatkan |
| `SER 010` | **Baju Engginer** | `SER-0010` | Baju Engginer nagata XL | ditolak — lihat di bawah |
| `SER 011`, `SER 012` | Baju Engginer | `SER-0011/0012` | Baju Engginer Nagata L/M | ditolak — sama |
| `SPL-000000` | NB Spliter PLC 1:8 | — | tidak ada | ditolak |

Dua pelajaran, keduanya dari data nyata:

1. **`PAT-000009`** — nomornya menghasilkan kandidat tunggal, tetapi barangnya
   berbeda. Nomor saja tidak cukup; nama harus menguatkan.
2. **`SER 010`** — nomor **dan** nama sama-sama setuju dengan katalog, dan
   hasilnya **tetap salah**: pada lembar saldo yang sama, `SER-0010` sudah
   punya barisnya sendiri dan bernama **"Sepatu Kerja"**. Dua barang berbeda
   memperebutkan satu kode.

**Keputusan:** pemulihan otomatis butuh **tiga syarat sekaligus** — kandidat
tunggal, nama menguatkan, dan kode tujuan belum ditempati. Yang gagal tetap
ditolak, dengan usulan disertakan.

### 2.4 Kolom kondisi salah diisi

Tiga baris memuat jenis barang, bukan kondisi:

| Kode | Nama | Tertulis |
|---|---|---|
| `NET-0019` | Belden LAN CAT5E | `Kabel` |
| `ACC-0021` | Stiker Perumnet Besar | `Stiker` |
| `CAB-0026` | Mini Adss 6 Core | `Cable` |

**Keputusan:** dianggap `GOOD` dengan catatan. Tak satu pun menyiratkan barang
bekas, dan menahan seluruh berkas demi tiga sel salah ketik menukar risiko
kecil dengan biaya besar. Catatannya tetap muncul supaya ada yang membetulkan.

### 2.5 Yang MASIH harus manusia (18 masalah)

- **11 saldo untuk barang yang tidak ada di katalog** — `ACC-0004`, `ACC-0017`,
  `ACC-0018`, `ACC-0019`, `ELE-0025` (50 unit), `MOD-0008` (22 unit),
  `MOD-0015`, `MOOD-0011`, `MOOD-0012`, `NET-0029` (236 unit), `ODP-0001`,
  `MOD-0023`. `MOOD-*` hampir pasti salah ketik `MOD-*`, tapi menebaknya
  memindahkan stok ke barang yang salah.
- **3 konflik `SER 010/011/012`** — dua barang berbeda satu kode.
- **2 kode mirip tapi nama tidak cocok** — `PAT-000009`, `POL-005`.
- **1 tanpa kandidat** — `SPL-000000`.
- **1 harga janggal (catatan, tidak menahan)** — `SPL-0001` tertulis Rp102,
  hampir pasti kurang tiga angka nol. `ACC-0006` Rp450 mungkin memang wajar.

### 2.6 Hal lain yang dicatat tapi tidak menahan

- Kategori dan vendor di sumber berupa **hash buram** (`w6hwsyj`, `caabcab7`)
  dari aplikasi lama. Semuanya terpetakan — nol yatim. Hash **tidak** ikut
  tersimpan; yang masuk kode terbaca hasil turunan nama.
- Prefiks kode 94% konsisten dengan kategorinya; 13 baris menyimpang, 11 di
  antaranya `MKT-*` yang masuk kategori Accessories.
- 14 dari 273 item bermargin bukan 1,30×.
- Kolom `Description` sebenarnya berisi kondisi, bukan keterangan.
- Tab `Kode` (170 baris) adalah **tabel lookup** yang memberi nama ke blok
  saldo — bukan daftar nama tandingan. Tab `Items` yang otoritatif.

---

## 3. Data pelanggan (`Data Billing Baru`, 69 baris)

### 3.1 NIK memeriksa tanggal lahirnya sendiri

Susunan NIK adalah `PPRRSS DDMMYY NNNN`. Enam digit tengah **adalah tanggal
lahir**, dengan hari ditambah 40 untuk perempuan (aturan Dukcapil). Karena
nomornya membawa tanggalnya, kolom `Date of Birth` bisa diadu terhadapnya.

| | Jumlah |
|---|---|
| Cocok | 46 |
| **Bentrok** | **19** |
| NIK bukan 16 digit | 4 |

Contoh: NIK berakhiran `…7107860001` berarti lahir **31-07-1986**, sementara
kolomnya menulis **1982-06-10**.

**Keputusan:** **NIK yang menang.** Bukan lemparan koin — nomornya diterbitkan
Dukcapil dan tanggalnya terkunci di dalam struktur nomor itu sendiri,
sedangkan kolom di sebelahnya diketik ulang manusia dari formulir kertas.
Selisihnya **tidak disembunyikan**: catatan per-baris membawa **kedua** nilai,
sehingga peninjau bisa membalik keputusan ini per-orang tanpa menggali NIK-nya
sendiri.

Konsekuensi lanjutan: karena bagian tengah NIK **adalah** tanggal lahir,
menyamarkan bagian itu di layar lalu menampilkan tanggal lahir utuh di kolom
sebelahnya membatalkan seluruh gunanya. Karena itu `birthDate` ikut
dikosongkan oleh `redactCustomer()` — lihat `src/lib/customer-pii.ts`.

### 3.2 Password PPPoE bersama

Kolom `PPPOE Password` terisi 69 dari 69, tetapi hanya memuat **2 nilai unik**.
Artinya satu-dua password dipakai bersama seluruh pelanggan.

**Keputusan:** kolom ini **tidak punya jalan masuk** ke aplikasi. Bukan dibaca
lalu dibuang — ia tidak punya alias, tidak punya bidang, dan ada tes yang
menjaganya tetap begitu. Kredensial PPPoE datang dari MikroTik.

> Password bersama antar-pelanggan adalah masalah keamanan tersendiri yang
> berada di luar lingkup impor. Dicatat di sini supaya tidak hilang.

### 3.3 Nol depan nomor telepon dimakan spreadsheet

`85738941976` — spreadsheet memperlakukan kolom telepon sebagai angka dan
membuang nol pertamanya.

**Keputusan:** dipulihkan otomatis. Tidak ada nomor Indonesia sah yang diawali
`8` telanjang, jadi hanya satu bentuk yang mungkin dimaksud. Ini pemulihan,
bukan tebakan.

### 3.4 Karakter tak terlihat pada nomor telepon

Ditemukan U+00A0 (spasi tanpa pemutus), U+2011 (tanda hubung tanpa pemutus),
U+202A dan U+202C (penanda arah teks). Tidak kelihatan di layar, tetapi membuat
pencocokan nomor gagal diam-diam.

**Keputusan:** dibersihkan otomatis.

### 3.5 Kolom yang ada judulnya tapi kosong

`Merchant`, `NPWP`, `Sent Notif`, `ppn`, **`OLT`**, **`Distribution Router`**,
**`No port OLT`** — semuanya **0 dari 69**.

Tiga yang terakhir penting dicatat: rantai OLT → port PON → ODP → router
sempat dikira tersedia di sumber ini. **Tidak.** Yang benar-benar terisi hanya
`Distribution Point (ODP)` (68 dari 69, 38 kode unik).

### 3.6 Yang MASIH harus manusia (6 masalah)

- **4 NIK 17 digit** — mis. `51070302079800002`. Satu digit berlebih, tapi
  yang mana tidak bisa ditentukan.
- **1 CID kembar** — `PN260803532` muncul dua kali.
- **1 telepon tetap tidak sah** setelah normalisasi.

### 3.7 Paket

Sheet menyebut `Paket-175k`, `Paket-225k`, `Paket-275k`, `Paket-325k`. Nama
dan kecepatan sebenarnya diambil dari <https://perumnet.id> (15 Agustus 2026):

| Kode sheet | Paket | Kecepatan | Harga/bln | Registrasi |
|---|---|---|---|---|
| `Paket-175k` | Personal | 27 Mbps | Rp175.000 | Rp50.000 + wajib 3 bulan di awal |
| `Paket-225k` | Berdua | 47 Mbps | Rp225.000 | gratis |
| `Paket-275k` | Keluarga | 77 Mbps | Rp275.000 | gratis |
| `Paket-325k` | Natah | 107 Mbps | Rp325.000 | gratis |
| — | Banjar | 177 Mbps | Rp500.000 | gratis |

Dua catatan:

- Situs menyebut **satu** angka kecepatan per paket tanpa memisah unduh dan
  unggah; keduanya disamakan di seed. Kalau ternyata asimetris, itu koreksi
  satu baris.
- Kewajiban **3 bulan di muka** pada paket Personal adalah aturan komersial
  yang tidak bisa diungkapkan model `Package`. Ia dicatat di `description` dan
  **harus ditegakkan saat penagihan** — bukan oleh master paket.

Empat paket karangan dari seed awal (`HOME-10`…`BIZ-100`) **dinonaktifkan,
bukan dihapus**, dan hanya setelah dipastikan belum dipakai satu langganan pun.

---

## 4. Alokasi core (`Alokasi Core`, tab `Alokasi Core 144`)

Belum diimpor — model fiber belum dibangun. Dicatat sekarang supaya tidak
hilang.

Isinya **splice matrix backbone yang dikerjakan manual di spreadsheet**:
segment Kecicang–Pesagi, 144 core, 12 tube dengan warna standar G.652, tiap
core punya next-hop, dan sebagian menuju port PON OLT langsung
(`C600 1/17/6`).

Kesalahan yang sudah terlihat:

- **`TUBE 5 - CORE 5` muncul dua kali** (FO ID 52 dan 53) — satunya semestinya
  `CORE 4`.
- Urutan `TUBE 6` melompat: `CORE 6` di posisi FO ID 64, `CORE 5` di 65.

Nomor core ganda dalam satu tube adalah hal yang seharusnya **ditolak
constraint database**, bukan lolos diam-diam. Ini argumen terkuat untuk
memindahkannya keluar dari spreadsheet.

---

## 5. Ringkasan keputusan

| Bentrok | Keputusan | Dasarnya |
|---|---|---|
| Riwayat pergerakan vs saldo | pakai saldo, sekali jalan | log hanya mencakup 59 dari 172 barang; 12 dari 58 cocok |
| Kode item rusak | pulihkan bila **3 syarat** terpenuhi | `PAT-000009` dan `SER 010` membuktikan 1–2 syarat tidak cukup |
| Kondisi salah isi | anggap `GOOD` + catatan | tak satu pun menyiratkan barang bekas |
| NIK vs tanggal lahir | **NIK menang**, selisih dicatat | NIK terbitan Dukcapil; kolomnya diketik ulang manusia |
| Nol depan telepon hilang | pulihkan | hanya satu bentuk yang mungkin |
| Password PPPoE | **tidak diimpor** | kredensial dari MikroTik; password bersama |
| Blok `PN10*` | tidak diimpor | 0% cocok dengan PPPoE; dinyatakan tidak terpakai |
| Paket | ambil dari perumnet.id | sheet hanya menyebut harga di namanya |
| Nama item berbeda antara aplikasi & berkas | **laporkan, jangan timpa** | sumber memuat dua daftar nama untuk kode sama |

## 6. Berkas terkait

| Berkas | Isi |
|---|---|
| [`src/lib/item-import.ts`](../src/lib/item-import.ts) | parser katalog + aturan pemulihan kode |
| [`src/lib/customer-import.ts`](../src/lib/customer-import.ts) | parser pelanggan + aturan NIK |
| [`src/lib/customer-pii.ts`](../src/lib/customer-pii.ts) | penyamaran NIK, telepon, email, tanggal lahir |
| [`scripts/_cek-katalog.ts`](../scripts/_cek-katalog.ts) | menjalankan parser katalog atas ekspor asli |
| [`scripts/_cek-pelanggan.ts`](../scripts/_cek-pelanggan.ts) | menjalankan parser pelanggan atas ekspor asli |
| [`docs/BANDING-PRD-WAREHOUSE.md`](BANDING-PRD-WAREHOUSE.md) | banding CRM kita vs PRD pembanding |
