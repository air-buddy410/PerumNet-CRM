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

## Tes integrasi (`tests/integration/`)

Menyentuh database sungguhan dan menjalankan service layer apa adanya —
approval engine, mesin stok, penomoran dokumen. Inilah yang menjaga aturan
bisnis yang tidak bisa diuji tanpa database.

```bash
npm run test:integration      # menyiapkan skema lalu menjalankan
npm run test:all              # unit + integrasi
```

**Database terpisah, dan itu ditegakkan bukan disarankan.** URL-nya diturunkan
dari `DATABASE_URL` yang ada dengan mengganti nama database (`perumnet_dev` →
`perumnet_test`), sehingga kredensial tidak pernah tersalin ke repo. Sebelum
modul apa pun yang menyentuh Prisma di-import, `assertTestDatabase()` menolak
berjalan bila nama database tidak berakhiran `_test`. Tes ini MENGHAPUS data;
satu salah ketik environment tanpa penjaga itu akan menghabisi database dev.

| Berkas | Yang dijaga |
| --- | --- |
| `termination.test.ts` | Perangkat pelanggan tidak pernah ikut ditarik, persetujuan atomik, SoD, terminasi ganda, pembatalan, penguncian setelah berlaku |
| `recovery.test.ts` | Karantina tidak menambah stok, hanya LAYAK_DIGUNAKAN yang menambah dan selalu SECOND, port ODP menunggu pemutusan fisik, syarat vonis tidak kembali |
| `concurrency.test.ts` | PRD §19.2 — penarikan & inspeksi bersamaan, draft sampah, penomoran dokumen |

### Dua hal yang sudah pernah salah di sini

**Berkas tes berjalan paralel, database cuma satu.** Bawaan `node:test`
menjalankan tiap berkas di proses terpisah secara bersamaan, sehingga
`resetTransactionalData()` milik satu berkas menghapus data berkas lain di
tengah jalan. Seluruh suite ambruk begitu berkas ketiga ditambahkan. Karena
itu penjalannya memaksa `--test-concurrency=1`.

**Fixture yang tidak aman dijalankan berbarengan menutupi yang diuji.** Uji
penomoran sempat gagal bukan karena penomorannya, melainkan karena persiapan
master data ikut dijalankan paralel. Dalam uji konkurensi, buat persiapannya
BERURUTAN dan paralelkan hanya bagian yang benar-benar diuji.

## Aturan menulis tes di sini

1. **Uji aturan, bukan implementasi.** Nama tes menjelaskan janji yang dijaga
   ("nilai kosong menghasilkan null, BUKAN nol"), bukan nama fungsinya.
2. **Kunci hal yang mahal kalau bergeser** — pembulatan uang, arah koordinat,
   ambang alarm. Di situlah bug diam-diam bersembunyi.
3. **Jangan tulis asersi yang selalu benar.** Sudah pernah terjadi di repo ini:
   asersi yang mencocokkan properti yang tidak ada pada tipe akan lolos untuk
   semua nilai dan tidak menjaga apa pun.
