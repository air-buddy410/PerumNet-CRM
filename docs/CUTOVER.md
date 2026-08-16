# Daftar periksa cutover — pindah dari sistem lama ke CRM

Disusun 17 Agustus 2026 (Fase 89). **Belum disetujui, belum dijadwalkan.**

Cutover adalah hari ketika CRM mulai menagih, mengisolir, dan mengirim pesan
kepada pelanggan sungguhan. Sebelum hari itu, tidak satu pun tombol di bawah
boleh ditekan.

Dokumen ini ditulis **sebelum** tanggalnya ditentukan, dan itu disengaja: yang
menentukan kesiapan adalah daftar ini, bukan sebaliknya.

---

## Prinsip yang mengatur seluruh daftar

**Satu arah, satu kali, dan bisa mundur.** Setiap langkah punya cara
membatalkannya, dan cara itu ditulis **sebelum** langkahnya dijalankan — bukan
dicari saat gagal.

**Tidak ada langkah yang menyentuh dua sistem sekaligus.** Sistem lama tidak
pernah ditulisi dari CRM, termasuk pada hari cutover. Yang berhenti di sana
dihentikan oleh orang, di sana.

---

## A. Sebelum hari-H — bisa dikerjakan kapan saja

- [ ] **Rekonsiliasi bersih.** `_rekon-alus.ts` menunjukkan nol selisih status
      dan nol selisih harga. *(17 Agustus: sudah nol pada 1.711 pelanggan.)*
- [ ] **Gladi penagihan cocok.** `_gladi-tagih.ts <periode> --banding <tsv>`
      menunjukkan seluruhnya cocok terhadap tagihan sistem lama pada periode
      yang sama. **Ini syarat yang paling menentukan** — selama angkanya belum
      cocok, tidak ada gunanya melanjutkan.
- [ ] **Tagihan berjalan diselesaikan.** Putuskan: tagihan periode berjalan
      diterbitkan di sistem lama sampai habis, dan CRM mulai dari periode
      berikutnya. Mencampur keduanya dalam satu periode akan menghasilkan
      tagihan ganda.
- [ ] **Piutang lama dipindahkan** sebagai saldo awal, bukan sebagai tagihan
      baru. Menerbitkannya ulang akan mengirimkannya dua kali kepada orang yang
      sama.
- [ ] **Nomor telepon diperiksa ulang.** Pesan akan benar-benar terkirim; nomor
      yang salah berarti pesan ke orang lain. *(1.684 dari 1.715 terisi.)*
- [ ] **`PORTAL_SESSION_SECRET` dan kredensial gateway WA disiapkan** di
      lingkungan produksi, tidak di dalam kode.
- [ ] **Cadangan basis data + berkas diuji PULIH**, bukan hanya dibuat.
      Cadangan yang belum pernah dipulihkan belum terbukti ada.
- [ ] **27 pelanggan tanpa port ODP diselesaikan** atau diputuskan dibiarkan
      dengan sadar (lihat `AUDIT-DATA-PRODUKSI.md`).
- [ ] **21 pelanggan diblokir-tapi-menyala ditinjau.** Setelah cutover, CRM
      akan bertindak atas status itu.

## B. Hari-H — urutannya mengikat

1. [ ] **Umumkan jendela pemeliharaan** kepada tim. Bukan kepada pelanggan —
       bagi mereka tidak ada yang berubah kalau ini berhasil.
2. [ ] **Hentikan penerbitan di sistem lama.** Dilakukan orang, di sana.
       Catat jam persisnya.
3. [ ] **Cadangkan** basis data CRM dan sistem lama. Keduanya, sebelum apa pun.
4. [ ] **Rekonsiliasi terakhir.** Kalau muncul selisih baru sejak pemeriksaan
       terakhir, **berhenti** dan selesaikan dulu.
5. [ ] **Impor sisa perubahan** dari sistem lama (`_impor-pelanggan.ts`,
       `_impor-onu.ts`).
6. [ ] **Gladi penagihan sekali lagi** pada data terakhir. Harus cocok.
7. [ ] Nyalakan penjadwal **satu per satu, dengan jeda**, dan periksa Status
       Sistem sesudah tiap satu:
       - [ ] `channels.outbox` — dengan **daftar penerima diuji ke nomor
             internal lebih dulu**
       - [ ] `billing.dunning`
       - [ ] `network.access-jobs` — **yang paling berisiko**, ia menyentuh
             router
       - [ ] `termination.effective`
       - [ ] `hrd.contract-lifecycle`
8. [ ] **Terbitkan satu periode**, lalu **berhenti dan periksa** sebelum
       mengirim apa pun: jumlah tagihan, totalnya, dan sepuluh sampel acak
       dibandingkan dengan sistem lama.
9. [ ] Baru kirim pemberitahuan.
10. [ ] **Nyalakan `PORTAL_TAGIHAN_AKTIF=1`** — dan tidak sebelum langkah 8
        lolos. Portal yang menampilkan tagihan salah akan dilihat 1.715 orang.

## C. Cara mundur

| Kalau gagal di | Yang dilakukan |
|---|---|
| Langkah 4–6 | Belum ada yang berubah. Batalkan, kembali ke sistem lama |
| Langkah 7 | Matikan lagi penjadwalnya. Antrean perintah router bisa dibatalkan dari `/noc/access-jobs` sebelum dieksekusi |
| Langkah 8 | Batalkan periode penagihannya. **Belum ada pesan terkirim** — itulah sebabnya pengiriman ditaruh sesudahnya |
| Langkah 9 | Tidak bisa ditarik kembali. Kirim ralat, dan tulis kejadiannya di sini |
| Langkah 10 | Kembalikan `PORTAL_TAGIHAN_AKTIF=0`; portal langsung menyebut sistem lama lagi |

**Titik tak-bisa-mundur adalah langkah 9**, bukan langkah 1. Seluruh urutan
disusun supaya titik itu jatuh selambat mungkin.

## D. Setelah cutover

- [ ] Perbarui `SOP-ALUR-KERJA.md` — hampir setiap `[SISTEM LAMA]` menjadi
      `[SEKARANG]` dalam satu hari.
- [ ] Perbarui `MODE-BACA-SAJA.md`, atau arsipkan dengan tanggal berakhirnya.
- [ ] Sistem lama dibuat **baca-saja**, jangan dimatikan. Ia masih memegang
      sejarah yang belum tentu semuanya terbawa.
- [ ] Jalankan rekonsiliasi harian selama dua minggu pertama.
- [ ] Tulis apa yang tidak berjalan sesuai rencana. Bagian ini yang akan
      dibaca orang saat cutover berikutnya, dan biasanya yang paling menolong.
