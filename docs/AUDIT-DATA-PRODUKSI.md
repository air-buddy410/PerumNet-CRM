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

## Empat ODP bentrok OLT — semuanya terjawab (16 Agustus 2026)

`JGS 05120101`, `SRY 05J4`, `SRY 0602`, `SSN 03DC01` bercerita lain sekali
dari `PSG 240102`. Bentuknya bukan campur aduk, melainkan **satu suara
membangkang melawan mayoritas yang bulat**:

| ODP | Mayoritas | Membangkang | Sebaran penghuni |
|---|---|---|---|
| JGS 05120101 | 6× Kecicang | 1× Abang | 75–375 m, semua Bebandem |
| SRY 05J4 | 5× Seraya Barat | 1× Seraya Tengah | 42–125 m, semua Yeh Kali |
| SRY 0602 | 7× Seraya Barat | 1× Seraya Tengah | 29–196 m, Pejongan |
| SSN 03DC01 | 15× ZTE C600 Kecicang | 1× HSGQ Kecicang | 72–310 m, Green Harmony |

Bandingkan dengan `PSG 240102`: penghuninya 3–3,8 km dari ODP dan menyebut
empat OLT sekaligus. Keempat ini rapat dan sedesa.

### Yang memutuskan: port PON menyebut nama dusunnya sendiri

Berkas ODP menyimpan port PON tiap ODP (`PIU`), dan operator menamai port
HSGQ di LibreNMS dengan nama daerah yang disuapinya:

- `SRY 05J4` → `Port 6` → port itu bernama **`YehKali`**, dan keenam
  penghuninya beralamat *Br. dinas yeh kali*
- `SRY 0602` → `Port 7` → port itu bernama **`Pejongan`**, dan enam dari
  delapan penghuninya beralamat *Br. Dinas pejongan*

Empat sumber yang saling bebas — catatan ODP, mayoritas pelanggan, jarak, dan
nama port yang ditulis operator — menunjuk hal yang sama. Yang membangkang
satu-satu itu catatan pelanggan yang basi, bukan ODP yang salah.

Keempatnya sudah tertaut ke port PON-nya.

### `SRY` — baris penampungan kedua

Ditemukan saat pemeriksaan silang. Kodenya telanjang tanpa nomor, dan
**keempat penghuninya akun `Free`**: kantor desa, bendesa, dan satu orang yang
tercatat dua kali. Semuanya beralamat *Seraya Tengah*, sedangkan catatan
ODP-nya menunjuk Seraya Barat `Port 1` (`Gerobog`).

Pola yang sama dengan `PSG 240102`: akun internal dan gratis ditumpuk di satu
baris. Tidak diubah — keputusan lapangan.

## Rantai OLT → PON → ODP kini utuh

`Odp.ponPortId` **549 dari 577 terisi**, sebelumnya nol. `Odp.siteId` naik
340 → 557.

Fase 81 menyimpulkan site tiap ODP dari pelanggannya dan berhenti di 340.
Jalan itu memutar: **berkas ODP menyebut sendiri OLT dan port PON tiap ODP**,
dan nilainya sudah tersimpan di `Odp.notes` sejak impor ODP — seluruh 577
punya, cuma belum pernah dibaca kembali.

Jumlah ODP per OLT cocok persis dengan tallinya di berkas — 172 Kecicang,
131 Abang, 114 Pesagi, 77 Seraya Barat, 55 Seraya Tengah.

### Satu kekeliruan saya sendiri yang ketahuan di tengah jalan

ZTE C600 menamai portnya `gpon_olt-1/16/1`. Sisipan `olt-` tidak tertangkap
`bacaPon`, sehingga seluruh port C600 jatuh ke penomoran berbasis urutan dan
**dua slot fisik — 16 dan 17 — tersimpan sebagai satu slot bernomor 1–32**.
Labelnya menyimpan kebenarannya, kolomnya tidak. Selama tertumpuk,
`PIU: 1/16/9` tidak bisa dicocokkan ke apa pun. Sudah dibetulkan, 32 baris
dipindahkan ke slot yang benar.

### OLT keenam yang hidup tetapi tidak bisa dipantau — DIPUTUSKAN, jangan dikejar

**`OLT HSGQ Kecicang` melayani 28 ODP dan 97 pelanggan. Ia hidup.** Yang tidak
ada hanyalah catatannya di LibreNMS, sebab **model OLT itu tidak mendukung
SNMP** — bukan firmware rusak, bukan perangkat mati, bukan sesuatu yang
menunggu diperbaiki. LibreNMS tidak akan pernah bisa menariknya.

Itulah satu-satunya sebab 28 ODP tidak bertaut port PON, dan itu **keadaan
tetap**. Pemilik jaringan sudah memutuskan membiarkannya (16 Agustus 2026).
Menjodohkannya ke OLT Kecicang yang lain berarti mengarang jalur serat.

Delapan di antaranya (`BBD 05`, `06`, `08`, `10`, `11`, `GMG 001`, `002`,
`004`) justru **seluruh** pelanggannya menyebut `ZTE C600 Kecicang`, bukan
HSGQ. Dua kemungkinan, dan keduanya masuk akal: pelanggannya dipindah dari
HSGQ ke C600 tanpa berkas ODP diperbarui, atau sebaliknya. Site-nya sama
(Kecicang) sehingga peta tidak terpengaruh; yang belum pasti hanya port
PON-nya.

Delapan ODP itu pun ikut dibiarkan. Karena keduanya sama-sama di Kecicang,
site mereka benar bagaimanapun juga; yang tidak diketahui hanya port PON-nya,
dan port itu memang tidak bisa dipantau.

**Jangan tampilkan 28 ODP ini sebagai galat atau "menunggu sinkron".** Mereka
lengkap sebagaimana mestinya — yang tidak ada cuma pemantauan port PON-nya,
dan itu batas perangkatnya, bukan lubang di data kita.

### Uji yang baru sekarang bisa dijalankan: kaskade

ODP kaskade disuapi ODP induknya, jadi keduanya HARUS berada di port PON yang
sama — itu keharusan fisik, bukan konvensi. Sebelum `ponPortId` terisi, tidak
ada yang bisa mengujinya.

**477 pasang induk–anak diperiksa, 0 berbeda.** Sisanya (99 pasang) salah satu
sisinya belum bertaut, hampir semuanya ODP HSGQ Kecicang.

Ini pemeriksaan yang berarti, bukan sekadar angka bagus: PIU tiap ODP ditulis
per baris di berkas sumber, sedangkan hubungan induk–anak berasal dari kolom
yang berbeda. Kalau pembacaan PIU keliru — meleset slot, salah membaca sisipan
`olt-`, atau salah menjodohkan nama OLT — ratusan pasang ini akan berselisih.
Tidak satu pun berselisih.

# Fase 83 — rekonsiliasi dengan sistem lama (17 Agustus 2026)

## Posisi ONU: jalur kedua yang membuktikan Fase 82

Sistem lama mencatat, untuk hampir tiap pelanggan, di mana ONU-nya duduk pada
OLT — dan nilai itu **dibaca dari perangkatnya**, bukan diketik orang.
**1.698 tersimpan.**

Itu memberi jalur kedua yang bebas menuju port PON:

```
jalur A  pelanggan → port ODP → ODP → (PIU di berkas) → port PON     ← catatan tertulis
jalur B  pelanggan → posisi ONU ────────────────────→ port PON       ← pembacaan perangkat
```

**1.503 sepakat, 34 berselisih pada 19 ODP — 97,8%.** Fase 82 dibangun dari
catatan tertulis; ini menguji hasilnya dengan sumber yang jenisnya sama sekali
lain, dan ia bertahan.

### Yang berselisih, dan polanya

| ODP | Berkas | Pembacaan ONU | Bacaan |
|---|---|---|---|
| `PSG 240102` | 2/5 | **1/6, 1/16, 16/4, 1/4** | penampungan — terkonfirmasi kelima kalinya |
| `SRY` | 1/1 | 1/4 (3), 1/6 | penampungan — terkonfirmasi |
| `PID` ×4 | 1/10 | **1/9** | — |
| `PSM` ×2 | 1/9 | **1/10** | ↑ **tertukar dengan PID** |
| `TMG` ×3 | 16/5 | 16/6 | segrup, bergeser satu |
| sisanya ×8 | — | ±1 port | tunggal |

`PID` dan `PSM` **saling tertukar** — dua kelompok yang PIU-nya bertukar tempat
di berkas sumber. Itu kekeliruan yang bisa dicari orang.

**Tidak ada tautan ODP yang diubah.** Bukan karena pembacaan perangkat kurang
dipercaya — justru sebaliknya — melainkan karena memindahkan ODP menyentuh
seluruh penghuninya sekaligus, sedangkan yang diketahui di sini cuma sebagian.
Itu keputusan lapangan.

## Kasus lama "27 pelanggan berbayar tanpa port ODP" — TERPECAHKAN

Aritmetikanya tutup sempurna:

| ODP | Menurut sistem lama | Kapasitas tercatat | Tidak kebagian |
|---|---|---|---|
| `GMG 001` | 30 | 16 | **14** |
| `BB 01` | 19 | 16 | **3** |
| `PSG 25 010102` | 19 | 16 | **3** |
| `PSG 240102` | 15 | 8 | **7** |
| | | | **27** |

Keempat ODP itu tercatat **penuh 100%**, dan **26 dari 27 pelanggan sedang
ONLINE** — mereka nyata, membayar, dan tersambung. Yang keliru bukan
pelanggannya, melainkan salah satu dari dua ini:

1. **kapasitas tercatat terlalu kecil** — mungkin ada splitter kedua di
   lokasi yang sama yang tidak punya barisnya sendiri, atau
2. **mereka sebenarnya di ODP kaskade anaknya**, dan sistem lama mencatat
   induknya.

`GMG 001` yang paling mencolok: 30 pelanggan pada 16 port, hampir dua kali
lipat. Ia juga salah satu ODP `OLT HSGQ Kecicang` yang tidak terpantau.

**Akibat yang perlu diketahui:** okupansi ODP di CRM **kurang 27** dari
kenyataan, dan untuk ke-27 orang itu CRM tidak bisa menjawab "dia di port
berapa". Ini pertanyaan lapangan — ukur ulang di keempat lokasi itu.

## Redaman: tidak ada yang bisa diisi, dan itu benar

Rencana semula "lengkapi 135 ODP tanpa redaman" **batal, dengan alasan**:

- **110** memang kosong juga di berkas sumber
- **23** punya nilai, tetapi **seluruhnya positif** (6–19) sedangkan kolomnya
  dBm daya terima yang normalnya negatif. `parseDbm` menolak nilai > 5, dan
  penolakan itu **benar** — angka segitu hampir pasti redaman dalam dB (rugi),
  bukan dBm (daya). Mengisinya akan mencampur dua besaran dalam satu kolom.
- **2** tidak ada di berkas (`NONE`, `SRY 05J1 (HITAM)`)

Catatan untuk suatu hari nanti: **31 nilai positif (1–5) sudah terlanjur
tersimpan** karena lolos batas `> 5`. Nilainya lebih kecil sehingga tidak
mustahil, tetapi asalnya sama mencurigakannya.

## Isolir date dan tags: sudah selesai / tidak dipakai

- `BillingProfile.isolirDay` ternyata **sudah terisi 1.679 dari 1.709**, 26
  ragam nilai. Tidak ada yang perlu dikerjakan.
- **Tags praktis tidak dipakai** di sistem lama — dari empat pelanggan terbaru,
  tiga berisi `-`. Dilewati.

## Empat pelanggan baru: masuk

`PN260816062`, `PN260815027`, `PN260815308`, `PN260815316` — lengkap dengan
NIK, tanggal lahir, telepon, email, koordinat, paket, dan PPPoE. **Tiga dapat
port ODP; yang keempat tidak**, sebab ODP-nya `PSG 240102` yang penuh — dan ia
berstatus PROSPECT, jadi memang belum perlu.

## Rekonsiliasi: 1.682 dari 1.711 cocok penuh

`scripts/_rekon-alus.ts` — **tidak menulis apa pun**, ke CRM maupun ke sistem
lama. Dijalankan berulang, bukan sekali.

```
Di keduanya   1.711    cocok penuh 1.682 · ada selisihnya 29
Hanya di CRM      4    (keempat pelanggan baru — salinan ALUS lebih tua)
Hanya di ALUS     0
Selisih          27 ODP · 2 ONU · 0 status · 0 harga
```

**Nol selisih status dan nol selisih harga pada 1.711 pelanggan.** Itu angka
yang menenangkan menjelang cutover.

### Yang paling layak ditindak: 21 pelanggan

Status penagihan sistem lama disandingkan dengan keadaan secret di router —
**dua sumbu berbeda**, dan justru perbedaannya yang informatif:

```
1.513  Active   → ONLINE      wajar
   64  Block    → DISABLED    wajar
   27  Inactive → DISABLED    wajar
   25  Active   → DISABLED    ← membayar tetapi diputus?
   21  Block    → ONLINE      ← DIBLOKIR TETAPI MASIH MENYALA
   21  Active   → OFFLINE     gangguan atau perangkat mati
```

**21 pelanggan diblokir di penagihan tetapi sambungannya masih menyala.** Itu
belum tentu salah — blokir bisa baru saja ditetapkan dan belum dieksekusi —
tetapi selama tidak ada yang menghitungnya, tidak ada yang tahu. Sekarang ada
yang menghitung, kapan pun diminta.

## Satu cacat di kode saya sendiri, yang hanya ketahuan lewat data sungguhan

Laporan pertama menampilkan I Wayan Wiastana **dua kali sekaligus**: "hanya di
sistem lama" DAN "hanya di CRM". Kedua barisnya terlihat benar, sebab CID-nya
di sistem lama berawalan dua LEFT-TO-RIGHT MARK yang tidak kelihatan mata.
`kunciOdp` sudah membersihkan tanda semacam itu — kode ODP `KCC‎ 1440701`
memaksanya sejak awal — tetapi `kunci` untuk nomor layanan belum. Sudah
disamakan, dan diuji.

Kalau tidak ketahuan, laporan akan menyimpulkan ada satu pelanggan hilang
sekaligus satu pelanggan liar, padahal tidak ada satu pun.

## Keadaan produksi sesudah Fase 83

```
Pelanggan          1.715      (+4)
Langganan          1.715      (+4)
Posisi ONU         1.698      baru
ODP bertaut PON      549
Port ODP terisi    1.687      (+3)
```

## Gladi penagihan menangkap dua hal yang tidak menghasilkan galat (17 Agustus 2026)

Keduanya jenis kekeliruan yang paling sulit ditemukan: **tidak ada yang gagal,
tidak ada pesan galat, dan layarnya terlihat normal.**

**1. Kolom yang keliru.** Gladi pertama menghitung 3 tagihan dari 1.594
pelanggan aktif. Sebabnya `Subscription.activatedAt` — kosong untuk seluruh
1.711 hasil impor, sebab impor mengisi profil tagihannya, bukan tanggal
aktifnya. Yang menentukan tagihan `BillingProfile.billingStartAt`. Kedua kolom
bertipe sama dan tes lulus dengan keduanya.

**2. Impor tanpa profil tagihan.** Empat pelanggan yang diimpor hari itu punya
langganan lengkap tetapi tanpa `BillingProfile` — artinya tidak akan pernah
ditagih, tanpa satu pun tanda. Sudah dibuatkan, dan peringatannya dipasang di
kepala `_impor-pelanggan.ts` supaya langkah keduanya tidak terlupa lagi.

Sesudah keduanya dibetulkan:

```
Periode 2026-08 · AKAN terbit 1.650 tagihan · Rp370.718.600
Dilewati 65 — 27 INACTIVE · 26 berharga nol (akun gratis) · 6 PROSPECT
              · 4 mulai ditagih setelah periode
```

Rata-rata Rp224.678, jatuh tepat di rentang paketnya (Rp175.000–300.000).

**Dua langganan sengaja dibiarkan tanpa profil** — `PN102052505` dan
`PN102062543` tidak ada di berkas tanggal penagihan sistem lama. Menebak
tanggalnya berarti menagih orang pada hari yang dikarang.

**Angka ini masuk akal, belum terbukti.** Yang membuktikan adalah perbandingan
per pelanggan dengan nominal tagihan sistem lama pada periode yang sama —
lihat `CUTOVER.md` bagian A.

## Dua tanggal mulai tagih yang rusak di sumbernya (17 Agustus 2026)

Dua langganan aktif tidak punya profil tagihan, dan penyebabnya ditelusuri ke
sistem lama:

| Nomor | Nama | Tanggal di sistem lama | ALUS |
|---|---|---|---|
| `PN102052505` | I Gede Wiyasa · S-PaketKeluarga Rp300.000 | **`0008-11-14`** — tahun 8 | `/customer/659` |
| `PN102062543` | Ida Bagus Pidada Ngurah · S-PaketPersonal Rp200.000 | **`2034-11-15`** — delapan tahun ke depan | `/customer/1011` |

Keduanya salah ketik. `0008` hampir pasti kehilangan dua digit di depan, dan
`2034` kemungkinan `2024` — tetapi **keduanya tidak ditebak**, sebab tanggal
mulai tagih menentukan pada hari apa orang ditagih dan sejak bulan mana. Salah
menebak berarti menagih orang untuk bulan yang tidak pernah ia langgani, atau
melewatkan berbulan-bulan yang seharusnya ditagih.

**Ini kekeliruan terpencil, bukan pola.** Dari 1.713 profil yang berhasil
masuk: nol bertanggal sebelum 2015, nol bertanggal lebih dari setahun ke depan.
Empat bertanggal Oktober–Desember 2026 dan itu wajar — pelanggan yang sudah
terdaftar tetapi belum mulai ditagih.

Penjaga impornya bekerja tepat: ia menolak keduanya alih-alih menyimpan tahun 8
sebagai tanggal yang sah.

**Yang perlu dilakukan:** betulkan tanggalnya **di sistem lama** — ia masih
sumber kebenaran sampai cutover. Sesudah itu satu perintah menariknya:

```bash
docker compose run --rm tools npx tsx scripts/_siapkan-profil-tagihan.ts tagih.tsv --terapkan
```

Selama belum dibetulkan, keduanya **tidak akan pernah ditagih CRM** — dan
seperti temuan sebelumnya, ketiadaan itu tidak menghasilkan galat apa pun.

## Alarm uji LibreNMS dihapus (17 Agustus 2026)

`ALM-202608-0001` — "Testing transport from LibreNMS", 14 Agustus, sisa
pengujian jalur webhook. Sudah ditutup, tanpa perangkat, tanpa insiden, tanpa
pembuat. Dihapus atas permintaan pemilik jaringan; tabel alarm kini kosong.

**Tidak akan terulang sendiri.** Pesan itu berasal dari uji transport manual di
LibreNMS, bukan dari aturan peringatan. Aturan yang hidup di LibreNMS tinggal
satu — **"Perangkat mati"** (critical), dan itu memang seharusnya ada.
