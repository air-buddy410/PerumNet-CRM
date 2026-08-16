# Audit data produksi — 16 Agustus 2026

> **Temuan 1–3 sudah ditutup hari itu juga.** Identitas pelanggan ditarik dari
> sistem lama: telepon 0 → 1.684, NIK 0 → 1.345, tanggal lahir 0 → 1.687,
> email 0 → 1.176, koordinat 0 → 1.631. Uraian di bawah dibiarkan apa adanya
> sebagai catatan bagaimana masalahnya ditemukan.

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


## Penutupan temuan 1–3 (16 Agustus 2026, malam)

Ditarik dari sistem lama lewat `scripts/_impor-identitas.ts`. Yang terjadi di
sepanjang jalan, sebab keduanya nyaris lolos:

**Regex pengambil rusak.** `\s*` ikut melahap baris baru, jadi ketika "Id Card"
kosong ia mengambil label berikutnya — 227 pelanggan sempat tercatat ber-NIK
`"Plan :"`. Tanpa diperiksa, cakupan NIK akan terlihat 100% padahal yang sah
1.417. Ketahuan karena angkanya terlalu bagus, bukan karena ada yang gagal.

**Satu koordinat dipakai 59 pelanggan.** Lima belas angka di belakang koma:
itu pusat peta yang tersimpan ketika operator membuka formulir tanpa menggeser
penanda. Ditolak — peta kosong terlihat belum selesai, peta dengan 59 penanda
bertumpuk terlihat SELESAI dan berbohong meyakinkan.

**372 pelanggan yang NIK dan tanggal lahirnya berselisih di sumbernya.**
Diputuskan pemilik jaringan: NIK menang, sebab NIK disalin dari kartu
sedangkan tanggal diketik dari ingatan. Dipasang sebagai pilihan `nikMenang`,
bukan bawaan.

Sesudahnya: nol NIK bertentangan dengan tanggal lahirnya, nol NIK ganda, nol
koordinat di luar Bali, nol titik dipakai lebih dari lima pelanggan.

Sisa yang memang tidak ada di sumbernya: 227 pelanggan tanpa NIK, 55 NIK tak
berbentuk, dan empat pelanggan baru yang belum ada di CRM (`PN260816062`,
`PN260815027`, `PN260815308`, `PN260815316`).

## PSG 240102 — ditelusuri sampai tuntas (16 Agustus 2026)

Tiga pemeriksaan yang saling bebas menunjuk baris ini, dan itulah yang membuat
kesimpulannya bisa dipegang:

1. **Jarak** — lima penghuninya berada 3,0–3,8 km dari ODP-nya, sedangkan
   median seluruh pelanggan hanya 94 m.
2. **Alamat** — tiga di antaranya beralamat **Bungaya**, padahal ODP-nya di
   Pesagi.
3. **OLT** — menurut pelanggannya ODP ini disuapi **empat OLT berbeda**
   sekaligus, yang mustahil secara fisik.

### ODP-nya sendiri NYATA dan benar tempatnya

Catatannya menyimpan asalnya: *"OLT menurut berkas: OLT ZTE C300 Pesagi ·
PIU: 1/2/5"*. Koordinatnya berada di dalam sebaran ODP Pesagi, dan ia menjadi
induk empat ODP kaskade (`DC01`, `DC03`, `DC04`, `DC07`). Jadi yang salah
bukan ODP-nya, melainkan daftar penghuninya.

### Delapan penghuninya berasal dari empat desa

| Port | Pelanggan | Alamat |
|---|---|---|
| 1 | Perumnet Office | kantor sendiri, INACTIVE |
| 2 | I Gede Sudarma | Jalan raya Peladung |
| 3 | I Wayan Yukem | Br. dinas Pasiatin |
| 4 | Ni Nyoman Manis | Bungaya |
| 5 | I Ketut Lunas | Bungaya |
| 6 | I Komang Sumastra | Bungaya |
| 7 | Free Supratman | Tempajang |
| 8 | I Nengah Mahadipa | Bungaya |

Kantor sendiri dan satu akun gratis ikut di dalamnya. Pola itu — akun internal,
akun gratis, dan pelanggan dari desa yang berjauhan menumpuk di satu ODP —
adalah pola **tempat pembuangan**: port yang diisi ketika ODP sebenarnya tidak
diketahui.

### Ke mana yang tiga orang Bungaya seharusnya

| Pelanggan | ODP Bungaya terdekat | Jarak | Port kosong di sana |
|---|---|---|---|
| I Ketut Lunas | BGY 07 | **61 m** | 0 — penuh |
| Ni Nyoman Manis | BGY 07 | **195 m** | 0 — penuh |
| I Komang Sumastra | BGY 08 | **200 m** | 8 |

`BGY 01` (13 kosong), `BGY 06` (8 kosong), dan `BGY 02` (12 kosong) berada di
lingkungan yang sama, jadi ketiganya bisa ditampung tanpa pasang ODP baru.

Dua sisanya bukan Bungaya: Sudarma beralamat Peladung (4,4 km dari ODP Bungaya
terdekat) dan Yukem beralamat Pasiatin (6,3 km) — "Pesiatin" kebetulan juga
nama salah satu port PON pada OLT Seraya Barat, jadi ia kemungkinan pelanggan
Seraya.

### Akibat yang tidak kelihatan

ODP ini tercatat **8/8 penuh**. Selama delapan portnya dipakai orang yang
bukan penghuninya, pelanggan Pesagi yang sungguhan akan ditolak dari ODP yang
sebenarnya masih punya tempat.

**Tidak ada yang diubah.** Pemindahan port adalah keputusan lapangan, dan CRM
sedang dalam mode baca-saja.
