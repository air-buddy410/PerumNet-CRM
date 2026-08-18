# Rekonsiliasi tagihan Agustus 2026 — ALUS vs CRM

Dipanen 18 Agustus 2026 dari `/invoice/table_invoice_list` di ALUS
(baca-saja, tidak ada yang disentuh), dibandingkan dengan
`scripts/_gladi-tagih.ts 2026-08` di produksi CRM.

## Koreksi: TIDAK ADA tagihan ganda

Dugaan sebelumnya — "1.641 tagihan tapi 1.606 CID unik, berarti ada pelanggan
tertagih dua kali" — **salah**, dan perlu dicoret supaya tidak dikejar orang
berikutnya.

Selisih 35 itu bukan duplikat. Setelah dipisah per jenis periode:

| Kelompok | Jumlah | Nilai |
|---|---|---|
| Bulanan Agustus murni (`M 082026`, bukan CANCEL) | **1.603** | Rp362.635.850 |
| Bayar di muka (`M` untuk periode setelah Agustus) | 14 | Rp5.500.000 |
| Jenis `G` (bukan Monthly Fee) | 24 | Rp4.597.880 |
| Dibatalkan (CANCEL) | 12 | Rp3.303.130 |

**Pada 1.603 tagihan bulanan Agustus murni, CID gandanya NOL.** Satu pelanggan
tepat satu tagihan bulanan.

Yang tampak seperti duplikat sebenarnya tiga hal yang sah:

- **Bayar di muka.** `PN102052624` punya 12 tagihan tertanggal 8 Agustus untuk
  periode 09/2026 sampai 07/2027. `PN102012525` punya satu tagihan Rp2.750.000
  yang mencakup 09/2026 sampai 10/2027 sekaligus.
- **Biaya jenis `G`** berdampingan dengan bulanan — `invoicetype` di ALUS hanya
  mengenal `1 = Monthly Fee`, sisanya bukan.
- **Batal lalu diterbitkan ulang.** Delapan pelanggan punya satu CANCEL dan
  satu tagihan pengganti di hari yang sama.

## Selisih yang NYATA: CRM akan menagih lebih banyak

| | Tagihan | Nilai |
|---|---|---|
| ALUS, bulanan Agustus murni | 1.603 | Rp362.635.850 |
| CRM, gladi 2026-08 | 1.652 | Rp371.218.600 |
| **Selisih** | **+49** | **+Rp8.582.750** |

CRM melewati 63 langganan dengan alasan yang tercatat: 27 INACTIVE, 26 harga
bulanan nol, 6 PROSPECT, 4 mulai ditagih setelah periode ini. ALUS tidak
menagih 116 dari 1.719 pelanggannya.

Jadi ada sekitar 50 pelanggan yang **ALUS pilih untuk tidak tagih tetapi CRM
akan tagih**. Sebelum cutover, tiap satunya harus punya jawaban: apakah ALUS
yang melewatkan penagihan, atau CRM yang belum tahu alasan pengecualiannya.

**Ini bukan pekerjaan yang boleh diselesaikan dengan menyamakan angka.** Kalau
CRM benar, ada pendapatan yang selama ini tidak tertagih. Kalau ALUS benar, CRM
akan menagih orang yang tidak seharusnya ditagih — dan itu kesalahan yang
sampai ke pelanggan.

## Siapa 63 pelanggan itu

Dibandingkan langganan demi langganan, 18 Agustus 2026. Dari 1.715 langganan
CRM, **116 tidak ditagih ALUS pada Agustus**:

| Kelompok | Jumlah | CRM juga melewati? |
|---|---|---|
| ACTIVE, berharga, profil tagihan aktif | **63** | **TIDAK — CRM akan menagih** |
| INACTIVE | 27 | ya |
| ACTIVE tapi harga bulanan nol | 25 | ya |
| PROSPECT harga nol | 1 | ya |

Jadi selisih yang perlu diputuskan adalah **63 langganan senilai
Rp12.679.000**. Menurut kapan mereka mulai ditagih:

- **43 baru (Juni–Agustus 2026), Rp7.725.000.** Kemungkinan besar wajar: ALUS
  belum menagih pelanggan yang baru pasang. Perlu dipastikan kapan siklus
  pertama mereka jatuh, bukan diasumsikan.
- **20 lama (2023–2025), Rp4.954.000.** Ini yang perlu dijawab satu per satu.
  Pelanggan yang aktif sejak 2023 tetapi tidak ditagih Agustus bukan hal yang
  bisa dijelaskan oleh waktu.

### Dua yang jelas keliru kalau CRM menagih

| CID | Nilai di CRM | Nama |
|---|---|---|
| `Free102Jay` | Rp800.000 | Nyoman Bagus Jaya Lasmana |
| `PN260721631` | Rp225.000 | Free Ni Komang Ayu Tri Sentosa |

Keduanya bertanda **Free** pada namanya, tetapi punya harga bulanan di CRM.
ALUS tidak menagih mereka. Kalau CRM terbit apa adanya, dua orang yang
dijanjikan layanan gratis akan menerima tagihan.

### Satu yang sengaja dibatalkan ALUS

`PN102202339` (Trisna Jaya, aktif sejak Maret 2023) punya **dua** tagihan
Agustus di ALUS dan **keduanya berstatus CANCEL**. Itu keputusan sadar
seseorang, bukan kelalaian. CRM tidak tahu keputusan itu dan akan menagih
Rp277.000.

## Arah sebaliknya: 4 pelanggan ALUS belum ada di CRM

`PN260817256` · `PN260817329` · `PN260817785` · `PN260817870`

Keempatnya CID Agustus 2026 — pelanggan yang dipasang belakangan dan belum
ikut terimpor. Perlu dimasukkan lewat `_impor-pelanggan.ts`, **dan ingat
langkah keduanya**: skrip itu tidak membuat `BillingProfile`, sehingga
pelanggan yang baru masuk tidak akan pernah ditagih tanpa
`_siapkan-profil-tagihan.ts`.

## Yang TIDAK boleh dilakukan

Menyamakan angka supaya cocok. Dari 63 itu, sebagian CRM yang benar (pendapatan
yang selama ini tidak tertagih) dan sebagian ALUS yang benar (orang yang memang
tidak boleh ditagih). Keduanya menuntut jawaban per pelanggan sebelum tagihan
pertama terbit — sesudahnya, kesalahan sudah sampai ke tangan orang.
