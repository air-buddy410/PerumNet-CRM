# Audit data produksi — 16 Agustus 2026

Seluruh data masuk hari ini dan belum pernah dilihat orang di layar. Ini
pemeriksaannya. **Hanya membaca; tidak satu pun baris diubah.**

## Yang bersih

| | |
|---|---|
| ODP | 577 · kapasitas seluruhnya 8 atau 16 · `portUsed` cocok dengan port terisi · jumlah baris port = kapasitas · koordinat seluruhnya di dalam Bali |
| Stok | nol saldo negatif · nol dokumen tanpa baris · nol kode item ganda · rekonsiliasi saldo-vs-dokumen nol selisih |
| Jaringan | nol perangkat tanpa site · nol `pppoeUsername` dipakai dua langganan |
| Langganan | nol tanpa paket · nol telepon ganda |

Tidak ada satu pun ODP yang kapasitasnya di luar 1:8 dan 1:16, dan itu penting
— aturan itu ditegaskan pemilik jaringan dan sekarang datanya menurutinya.

## Yang perlu ditindak

### 1. Telepon kosong untuk SELURUH 1.711 pelanggan

Kolomnya berisi `-` secara harfiah, bukan null — jadi ia tampak terisi sampai
seseorang mencoba menelepon. ALUS menyimpan nomor yang sebenarnya; halaman
detail pelanggannya menampilkan `085738146195` dan seterusnya.

Ini yang paling besar. CRM tanpa nomor telepon tidak bisa dipakai menagih,
memberi tahu gangguan, atau menghubungi siapa pun.

### 2. NIK dan tanggal lahir kosong seluruhnya

ALUS punya keduanya (`id_card` dan `Date of Birth` di halaman detail). Impor
kita tidak mengambilnya. Formulir NIK sudah siap sejak Fase 74 — yang belum
ada datanya.

### 3. Koordinat pelanggan kosong seluruhnya

ALUS menyimpan koordinat per pelanggan. Tanpa itu, peta hanya bisa menampilkan
ODP, bukan pelanggan — padahal rantai POP → MS → ODP → pelanggan itu yang
sejak awal diminta.

### 4. Dua puluh tujuh pelanggan berbayar tanpa port ODP

Berbeda dari 27 akun gratis — irisannya NOL. Ini pelanggan yang membayar
Rp175.000–300.000 sebulan dan tidak tercatat menempati port mana pun:
`PN100032527`, `PN100042537`, `PN100060005`, dan seterusnya. ODP-nya penuh
menurut catatan ALUS sendiri.

### 5. ODP berkode `NONE` menjadi induk 75 ODP

Satu baris ODP bernama harfiah `NONE`, tanpa koordinat, tanpa induk, dengan
delapan baris port kosong — dan **75 ODP menunjuk kepadanya sebagai induk.**
Itu simpul akar hasil impor, bukan perangkat yang berdiri di mana pun.
Berfungsi, tetapi akan muncul di peta dan daftar seolah ODP sungguhan.

### 6. Lima item sisa data contoh

`KBL-DROP1C`, `KLM-S`, `KON-SC`, `ONT-F609`, `RTR-AX2` — tanpa harga beli,
tanpa saldo, dan kodenya tidak mengikuti pola `PREFIKS-0000` seperti 288 item
hasil impor. Ini sisa seed pengembangan yang ikut terbawa.

Tiga item lain tanpa saldo (`MKT-0009`, `RAC-0015`, `SER-0002`) berasal dari
impor dan memang belum pernah bergerak — itu wajar.

### 7. `Modem F670L ZTE DB` punya dua kode

`MOD-0003` (saldo 1, 9 pergerakan) dan `MOD-0005` (saldo 25, 224 pergerakan).
Namanya sama persis. Bisa jadi dua varian yang namanya tidak dibedakan di
sumber — pola yang sama sudah terlihat pada `SER-0010/0011/0012` yang bertiga
bernama "Baju Engginer" padahal XL, L, dan M.

### 8. Sembilan sesi PPPoE masih yatim

Di luar tujuh yang sudah ditandai bukan langganan. Sudah diputuskan diabaikan
untuk sekarang.

## Yang TAMPAK janggal tetapi wajar

**79 nama pelanggan ganda.** `I Wayan Suarya` muncul empat kali dengan nomor
pelanggan berbeda. Dari ALUS terlihat orang yang sama memang bisa punya
beberapa langganan — `sryte_030030_villaatta` dan `sryte_072544_villabena`
keduanya atas nama I Wayan Suarya, dua vila berbeda. Nama Bali juga berulang
secara alami. Bukan duplikat sampai ada bukti lain.

**Empat gudang cabang tanpa saldo.** Kecicang, Abang, Seraya Tengah, Seraya
Barat terbentuk dari log pergerakan, tetapi log itu tidak pernah mencatat
perpindahan ke sana — jadi saldonya memang di gudang utama. Menunggu opname.

**Lima langganan berstatus PROSPECT.** Calon pelanggan, bukan cacat.
