# Rencana memasukkan data nyata ke CRM

Tanggal: 15 Agustus 2026

**Sasaran akhir: setiap perangkat yang online punya datanya di CRM.**

Alat ukurnya sudah ada dan tidak perlu dibuat: halaman `/noc/pppoe` menghitung
sesi yang belum tertaut ke langganan. Angka itulah papan skornya.

| | Hari ini |
|---|---|
| Username PPPoE unik di router | **1.718** |
| Tertaut ke langganan | **0** |
| **Yatim** | **1.718** |

Prinsip yang dipegang: **yang bisa masuk, dimasukkan sekarang. Yang belum
bisa, ditunggu — bukan ditebak.** Sheet sumber tidak akan diperbaiki, jadi
importir menyediakan jalan keluar sadar (`allowPartial`) alih-alih menolak
seluruh berkas. Baris yang dilewati tercatat di hasil dan di audit log.

---

## Gelombang 1 — sekarang, tanpa menunggu apa pun

Semua sudah siap di backend. Yang menahan hanya halaman unggahnya.

### 1a. Katalog material

| | Jumlah |
|---|---|
| Material | **273** |
| Kategori | 19 |
| Vendor | 20 |
| Saldo awal | **154** baris |
| Nilai katalog | Rp494.205.803 |
| Dilewati | 18 baris bermasalah |

Menghasilkan satu dokumen `GOODS_RECEIPT` untuk saldo awal, lengkap dengan
nomor dan ledger.

### 1b. Pelanggan, langganan, dan ODP

| | Jumlah |
|---|---|
| Pelanggan | **64** |
| Langganan | **64** |
| ODP + portnya | **54** |
| Dilewati | 5 baris bermasalah |

Sesudah gelombang ini, sesi yatim turun dari **1.718 → sekitar 1.654**.
Kecil, tapi ia membuktikan seluruh rantai bekerja: sheet → pelanggan →
langganan → port ODP → sesi PPPoE yang hidup.

### Yang dilewati, dan kenapa dibiarkan

Sheet tidak akan diperbaiki. Baris berikut menunggu sampai datanya datang dari
sumber yang lebih baik — bukan ditebak sekarang:

**Katalog (18):**
- 11 saldo untuk barang yang tidak ada di katalog — termasuk `NET-0029`
  (236 unit) dan `ELE-0025` (50 unit). `MOOD-0011`/`MOOD-0012` hampir pasti
  salah ketik `MOD-`, tetapi menebaknya memindahkan stok ke barang yang salah.
- 3 konflik `SER 010/011/012` — dua barang berbeda memperebutkan satu kode.
- 2 kode mirip dengan nama yang tidak cocok (`PAT-000009`, `POL-005`).
- 1 tanpa kandidat sama sekali (`SPL-000000`).
- 1 `MOD-0023`.

**Pelanggan (5):** 4 NIK berjumlah 17 digit, 1 CID kembar (`PN260803532`).

Ini bukan utang teknis — ini **utang data**, dan pemiliknya bukan aplikasi.
Cara paling murah menutupnya bukan mengedit spreadsheet, melainkan menunggu
opname gudang pertama dan ekspor Wifinetbill.

---

## Gelombang 2 — begitu ekspor Wifinetbill ada

Ini yang benar-benar menutup sasaran.

**~1.653 pelanggan** dengan skema username lama (`sryb_042532_mardika`,
`bgy07sugiana04`, `sry_1010008_suriyasih`). Parser pelanggan **sudah siap**:
kolom dikenali lewat daftar alias, jadi ekspor dengan judul berbeda cukup
ditambahkan namanya di satu tempat di `src/lib/customer-import.ts`.

Yang perlu ada di ekspornya, diurut menurut kepentingan:

| Kolom | Untuk apa | Wajib? |
|---|---|---|
| Username PPPoE | **menautkan ke sesi yang hidup** | **ya** |
| Nama, telepon | identitas pelanggan | ya |
| Paket | harga & kecepatan langganan | ya |
| Alamat, koordinat | peta & penugasan teknisi | sebaiknya |
| NIK | identitas resmi; tanggal lahir ikut terbaca darinya | sebaiknya |
| Kode ODP | port & penelusuran gangguan | sebaiknya |
| Tanggal mulai tagihan | siklus penagihan | sebaiknya |

**Password PPPoE tidak perlu dan tidak akan dibaca.** Kredensial datang dari
MikroTik.

Sesudah gelombang ini, sesi yatim semestinya mendekati **nol**, dan monitor
PPPoE akhirnya bisa menjawab "pelanggan X sedang online".

---

## Gelombang 3 — menyusul, tidak menahan apa pun

### 3a. Kapasitas ODP sebenarnya

54 ODP dibuat dengan **8 port — angka dugaan**. Sumbernya tidak memuat
kapasitas sama sekali, dan angka itu hampir pasti terlalu kecil: ekspor 2026
hanya sebagian pelanggan tiang tersebut. Tiap ODP membawa catatan yang
menyebutnya.

Diperbaiki saat data ODP sebenarnya tersedia — kapasitas, koordinat tiang,
dan induk PON portnya.

### 3b. Alokasi core backbone

Tab `Alokasi Core 144` adalah splice matrix yang dikerjakan manual: segment
Kecicang–Pesagi, 144 core, 12 tube berwarna standar G.652, sebagian menuju
port PON OLT langsung.

**Menunggu model fiber dibangun** (`FiberCableSegment`, `FiberCore`,
`FiberClosure`, `FiberSplice`). Sheet-nya sendiri sudah memuat kesalahan yang
seharusnya ditolak constraint database: `TUBE 5 - CORE 5` muncul dua kali,
urutan `TUBE 6` melompat.

### 3c. Perangkat & serial

Kolom SN pada riwayat pergerakan stok **kosong 100%** (0 dari 206). Tidak ada
jejak serial di sumber mana pun. Perangkat terserialisasi akan mulai tercatat
dari transaksi baru di aplikasi, bukan dari impor.

---

## Yang sengaja TIDAK diimpor

| Data | Alasan |
|---|---|
| Password PPPoE | kredensial; datang dari MikroTik. Hanya 2 nilai unik untuk 69 pelanggan — masalah keamanan tersendiri |
| Blok `PN10*` (87 baris) | 0% cocok dengan sesi PPPoE; dinyatakan tidak terpakai lagi |
| Riwayat pergerakan stok (206 baris) | hanya mencakup 59 dari 172 barang; 12 dari 58 saldo cocok. Memutarnya ulang melahirkan saldo salah dengan tampilan riwayat yang meyakinkan |
| Nama sales dari sheet | data karyawan di aplikasi lebih benar. Julukan yang tidak cocok tepat satu orang dibiarkan kosong, tidak ditebak |
| Tab `Kode` (170 baris) | tabel lookup, bukan master; tab `Items` yang otoritatif |

---

## Urutan menjalankan

1. **Luna** menyelesaikan tiga halaman: §33 unggah katalog, §34 input NIK di
   form pelanggan, §35 unggah pelanggan.
2. Unggah katalog → centang "terapkan sebagian" → 273 material + 154 saldo.
3. Unggah pelanggan → centang "terapkan sebagian" → 64 pelanggan, 64
   langganan, 54 ODP.
4. Buka `/noc/pppoe`, catat angka sesi yatim. Itu garis dasarnya.
5. Minta ekspor Wifinetbill; tambahkan alias kolomnya; ulangi langkah 3.
   **Menjalankan ulang aman** — pelanggan dicocokkan lewat NIK atau telepon,
   langganan lewat nomor layanan, ODP lewat kodenya.
6. Sesudah stabil: opname gudang pertama menutup 18 baris katalog yang
   tertinggal, tanpa siapa pun perlu menyunting spreadsheet.

## Berkas terkait

| Berkas | Isi |
|---|---|
| [`TEMUAN-DATA-BENTROK.md`](TEMUAN-DATA-BENTROK.md) | tiap bentrok beserta dasar keputusannya |
| [`HANDOFF-BACKEND-KE-FRONTEND.md`](HANDOFF-BACKEND-KE-FRONTEND.md) | §33, §34, §35 — kontrak halaman |
| [`BANDING-PRD-WAREHOUSE.md`](BANDING-PRD-WAREHOUSE.md) | banding dengan PRD pembanding |
