# Tes

```bash
npm test          # sekali jalan
npm run test:watch
```

**Nol dependensi baru.** Memakai test runner bawaan Node (`node:test`) dijalankan
lewat `tsx` yang sudah ada sebagai devDependency. Tidak ada Jest, tidak ada
Vitest, tidak ada konfigurasi tambahan — alias `@/lib/...` diselesaikan `tsx`
dari `tsconfig.json`.

## Apa yang ada di sini

`tests/unit/` — fungsi murni, tanpa database, tanpa jaringan. Cepat (±200 ms)
dan deterministik, jadi aman dijalankan kapan saja termasuk di CI.

Yang ditutup saat ini:

| Berkas | Menjaga |
|---|---|
| `kml.test.ts` | Urutan koordinat KML (`lng,lat` — bukan sebaliknya), penolakan koordinat di luar bumi, pelaporan placemark rusak, escaping XML, round-trip ekspor→impor |
| `mikrotik.test.ts` | Klasifikasi PPPoE (Aktif/Offline/Disable), sesi tanpa secret, parsing uptime RouterOS, pemisahan kredensial pada titik dua pertama |
| `noc-map.test.ts` | Ambang okupansi ODP, arah proyeksi peta (utara di atas, timur di kanan), skala seragam, titik tunggal tidak membagi nol |
| `documents.test.ts` | Kunci periode penomoran dokumen, pengambilan urutan tertinggi |
| `billing.test.ts` | Pembulatan PPN half-up dan presisi BigInt pada nominal besar |

## Yang BELUM ada, dan alasannya

**Tes integrasi berbasis database belum ditulis.** Sebagian besar aturan bisnis
kita hidup di service layer yang menyentuh database — reservasi stok, transfer
tiga langkah, IRF, isolir, alokasi slot. Aturan-aturan itu sudah diverifikasi
lewat skrip sekali-pakai saat tiap fase dibangun, tetapi skrip itu tidak
disimpan, sehingga **tidak ada yang menjaganya dari regresi sekarang**.

Menjalankannya terhadap database dev akan merusak data dev, jadi tes integrasi
butuh database sendiri lebih dulu. Resepnya:

```bash
# 1. Buat database tes terpisah
docker exec perumnet-postgres psql -U perumnet -d postgres \
  -c "CREATE DATABASE perumnet_test;"

# 2. Siapkan skema + seed di sana
DATABASE_URL="postgresql://perumnet:perumnet@localhost:5433/perumnet_test" \
  npx prisma db push && \
DATABASE_URL="postgresql://perumnet:perumnet@localhost:5433/perumnet_test" \
  npm run db:seed
```

Berkas tes integrasi harus menimpa `DATABASE_URL` **sebelum** meng-import modul
apa pun yang menyentuh Prisma, karena klien dibuat saat modul dimuat:

```ts
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
const { createDraftTransaction } = await import("@/lib/inventory");
```

Dan wajib melewati dirinya sendiri bila `TEST_DATABASE_URL` tidak di-set,
supaya `npm test` tetap aman dijalankan siapa pun tanpa merusak apa pun.

## Aturan menulis tes di sini

1. **Uji aturan, bukan implementasi.** Nama tes menjelaskan janji yang dijaga
   ("nilai kosong menghasilkan null, BUKAN nol"), bukan nama fungsinya.
2. **Kunci hal yang mahal kalau bergeser** — pembulatan uang, arah koordinat,
   ambang alarm. Di situlah bug diam-diam bersembunyi.
3. **Jangan tulis asersi yang selalu benar.** Sudah pernah terjadi di repo ini:
   asersi yang mencocokkan properti yang tidak ada pada tipe akan lolos untuk
   semua nilai dan tidak menjaga apa pun.
