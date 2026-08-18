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

## Langkah berikutnya

`_gladi-tagih.ts` menerima `--banding <berkas.tsv>` berisi
`nomorLayanan<TAB>jumlah` dari sistem lama. Menjalankannya dengan 1.603 baris
bulanan Agustus murni akan menyebut **tepat pelanggan mana** yang berselisih,
bukan hanya totalnya.
