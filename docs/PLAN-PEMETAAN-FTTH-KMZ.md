# Rencana — Pemetaan FTTH: POP, MS/ODC, ODP, dan Pelanggan PPPoE

**Tanggal:** 2026-08-12
**Status:** SELESAI (2026-08-12). Fase 35, 36, 38, dan 39 sudah di `main`.
Seluruh keputusan D1–D5 terjawab. Sisa pekerjaan hanya lapisan visual di
frontend — lihat `HANDOFF-BACKEND-KE-FRONTEND.md` §5b.
**Pertanyaan asal:** bisakah pemetaan POP, MS/ODC, ODP, dan pelanggan PPPoE
dilakukan lewat berkas KMZ dan input manual?

**Jawaban singkat: bisa, dan sebagian besar fondasinya sudah ada.** Yang benar-benar
kurang cuma empat hal, dan satu di antaranya menuntut keputusan bisnis lebih dulu
karena berisiko menimpa data pelanggan yang salah.

---

## 1. Yang SUDAH ada (diperiksa langsung ke kode, bukan asumsi)

| Kemampuan | Status | Letak |
|---|---|---|
| Peta interaktif MapLibre | ✅ ada | `src/components/network-map.tsx` (Luna) |
| Perakitan data peta: ODP + pelanggan + kaskade ODP | ✅ ada | `src/lib/noc-map.ts` (Fase 23) |
| Okupansi ODP dihitung dari `OdpPort` sebenarnya | ✅ ada | `occupancyOf()` |
| Impor **KML** dengan pratinjau sebelum diterapkan | ✅ ada | `src/lib/ftth-kml.ts` (Fase 26) |
| Ekspor ODP ke KML | ✅ ada | `exportOdpKml()` |
| Deteksi titik bergeser (`moveMeters`) sebelum disetujui | ✅ ada | `previewKmlImport()` |
| Koordinat POP dan ODC | ✅ ada | `NetworkSite.latitude/longitude`, `type` sudah memuat `POP`, `MINI_POP`, `ODC` |
| Koordinat pelanggan | ✅ ada | `Customer.latitude/longitude` |
| Kaitan pelanggan → ODP | ✅ ada | `OdpPort.subscriptionId` → `Subscription` → `Customer` |
| CRUD manual ODP | ✅ ada | `saveOdp()` di `src/lib/ftth.ts` |
| CRUD manual site (POP/ODC) | ✅ ada | `saveNetworkSite`, halaman `/noc/sites` |

**Konsekuensi penting: tidak ada model baru yang dibutuhkan.** POP memakai
`NetworkSite` yang sudah punya koordinat, sedangkan MS/ODC memakai `Odp` dengan
`parentId = null` — lihat D2, yang dikoreksi setelah melihat sistem pembanding.
Menambah model terpisah hanya akan melahirkan dua sumber kebenaran untuk hal
yang sama.

## 2. Yang BELUM ada

### 2.1 KMZ belum didukung — baru KML mentah

KMZ adalah arsip ZIP berisi `doc.kml` beserta ikon/overlay. Parser sekarang
menerima XML apa adanya, jadi berkas KMZ akan ditolak.

Node punya `zlib` bawaan, dan entri ZIP FTTH pada praktiknya memakai metode
`deflate` atau `stored`. Membaca central directory lalu meng-inflate `doc.kml`
bisa ditulis sekitar 80 baris tanpa dependensi baru — sejalan dengan kebiasaan
repo ini (test runner pun dipilih karena alasan yang sama). Alternatifnya
menambah pustaka ZIP; itu keputusan D4 di bawah.

### 2.2 Parser hanya membaca titik, dan buta terhadap folder

`parseKml()` hanya mengambil `<Point>`. Dua akibatnya:

- **`<Folder>` diabaikan.** Padahal KMZ dari surveyor hampir selalu menata
  titiknya per folder: `POP`, `ODC`, `ODP`, `HOME PASS`. Folder itulah petunjuk
  paling andal untuk menentukan sebuah titik jenisnya apa.
- **`<LineString>` diabaikan.** Rute kabel — feeder, distribusi, drop core —
  tidak terbaca sama sekali. Lihat keputusan D1.

### 2.3 Impor hanya menyasar ODP

`applyKmlImport()` mencocokkan nama placemark ke kode ODP dan hanya menulis ke
tabel `Odp`. POP, ODC, dan pelanggan belum punya jalur impor.

### 2.4 POP dan ODC belum tampil di peta

`loadNetworkMap()` merakit ODP dan pelanggan saja. Datanya sudah ada di
`NetworkSite`, hanya belum ikut dirakit dan belum punya lapisan di peta.

---

## 3. Keputusan yang perlu diambil sebelum implementasi

Lima hal ini menentukan bentuk kodenya, dan menebaknya sendiri berisiko.

### D1 — Rute kabel (LineString) disimpan atau tidak?

KMZ FTTH biasanya memuat jalur kabel, bukan cuma titik. Pilihannya:

- **(a) Diabaikan.** Peta tetap berisi titik saja. Paling murah, dan cukup bila
  tujuannya sekadar tahu posisi perangkat.
- **(b) Disimpan sebagai lapisan visual.** Model baru `FiberRoute` berisi
  geometri, nama, dan jenis (feeder/distribusi/drop). Tampil di peta, tetapi
  **bukan sumber kebenaran** — tidak dipakai menghitung apa pun.
- **(c) Disimpan sebagai data jaringan sungguhan** yang terhubung ke ODC/ODP dan
  ikut menghitung panjang kabel serta rugi-rugi. Paling berguna, paling mahal,
  dan menuntut kualitas data KMZ yang konsisten.

**Saranku (b).** Nilainya besar untuk teknisi di lapangan, tetapi tidak menaruh
beban kebenaran pada berkas yang digambar manual oleh surveyor.

### D2 — "MS" itu apa persisnya? ✅ TERJAWAB (2026-08-12)

**MS = ODC.** Sebutan internalnya "master switch" atau rumah kabel: splitter
dari OLT menuju ODP/distribution point. Satu tipe sudah cukup, tidak ada
tingkat tambahan.

**Tetapi screenshot sistem pembanding mengoreksi rancangan awal saya.** Di sana
MS disimpan pada tabel yang SAMA dengan ODP — baris `AS` berketerangan
"MS Abiansoan", `Parent = None`, kapasitas 0, dan tetap punya Group (PON port).
Artinya MS bukan "site", melainkan simpul distribusi yang kebetulan berada di
puncak kaskade.

Rancangan yang benar untuk kita: **MS/ODC adalah `Odp` dengan `parentId = null`**,
bukan `NetworkSite`. Alasannya:

- MS punya port, optic power, dan induk PON — persis seperti ODP. `NetworkSite`
  tidak memiliki satu pun dari itu.
- `Odp.parentId` dan kaskadenya SUDAH ada sejak Fase 13, dan `loadNetworkMap()`
  sudah menggambar garis kaskade induk→anak.
- Menaruhnya di `NetworkSite` akan memaksa peta menggabungkan dua tabel untuk
  menggambar satu rantai yang sebenarnya sejenis.

`NetworkSite` tetap dipakai untuk **POP** dan lokasi fisik (SPOP/BPOP pada
sistem pembanding), yang memang bukan simpul distribusi.

Yang perlu ditambahkan hanyalah penanda peran pada `Odp` — mis. `role` bernilai
`MS | ODP` — supaya peta bisa membedakan ikonnya, seperti pembanding yang
memakai warna berbeda untuk "Parent ODP" dan "ODP/Dispoint".

### D2-lama — pertanyaan asli (diarsipkan)

Di dokumenmu tertulis "MS/ODC". Kalau **MS** hanyalah sebutan lain untuk ODC di
operasimu, `NetworkSite.type = ODC` sudah cukup. Kalau MS adalah tingkat yang
**berbeda** (misalnya Metro Switch atau Main Splitter yang berada di atas ODC),
perlu satu nilai tipe tambahan dan hierarkinya harus disepakati:

```
POP → MS? → ODC → ODP → Pelanggan
```

Ini menentukan apakah `Odp.siteId` cukup, atau butuh rantai induk yang lebih
panjang.

### D3 — Kunci pencocokan pelanggan ✅ TERJAWAB SEBAGIAN (2026-08-12)

**Titik pelanggan diinput manual, tidak diimpor dari KMZ.** Ini menghapus
risiko terbesar dalam rencana ini: tidak ada pencocokan nama yang bisa salah
menimpa koordinat rumah pelanggan lain.

Impor KMZ karena itu menyasar POP, MS/ODC, dan ODP saja. Bila kelak impor
pelanggan tetap diinginkan, pertanyaan di bawah kembali berlaku.

### D3-lama — pertanyaan asli (diarsipkan)

Impor ODP mencocokkan nama placemark ke kode ODP, dan itu aman karena kode ODP
unik serta dikendalikan sendiri. Untuk pelanggan tidak sesederhana itu: nama
placemark di KMZ surveyor umumnya berupa **nama orang**, dan nama orang tidak
unik.

Salah cocok di sini berarti **koordinat rumah pelanggan A tertimpa titik rumah
pelanggan B**. Akibatnya nyata: teknisi datang ke alamat yang salah.

Pilihan kunci:

- `pppoeUsername` — unik dan dikendalikan sendiri, tetapi jarang tertulis di KMZ.
- `customerNumber` — unik, dan bisa diminta ke surveyor untuk ditulis di nama
  placemark atau di deskripsi.
- Nama pelanggan — **tidak disarankan sebagai kunci tunggal**.

**Saranku:** wajibkan kode di nama placemark dengan pola yang bisa dipakai
mesin, mis. `CST-00123 | Budi Santoso`. Yang tidak memuat kode masuk daftar
"tidak tercocokkan" dan **tidak** diterapkan otomatis.

### D4 — Boleh menambah dependensi untuk membaca ZIP?

- **(a) Tanpa dependensi**, pakai `zlib` bawaan Node. ~80 baris, dan hanya
  mendukung metode kompresi yang lazim.
- **(b) Pakai pustaka ZIP** yang matang. Lebih tahan terhadap KMZ aneh, tetapi
  menambah dependensi pertama untuk urusan ini.

**Saranku (a)**, sejalan dengan kebiasaan repo, dengan pesan galat yang jelas
bila menemui metode kompresi yang tidak didukung.

### D5 — Impor boleh menimpa koordinat yang sudah ada?

- Hanya mengisi yang masih kosong (paling aman), atau
- Boleh menimpa, tetapi setiap pergeseran melebihi ambang tertentu (mis. 50 m)
  wajib dikonfirmasi satu per satu.

`moveMeters` sudah dihitung importer sekarang, jadi ambang ini murah dipasang.

---

## 3b. Temuan dari sistem pembanding (screenshot 2026-08-12)

Peta pembanding menyatukan dua hal yang di CRM kita masih terpisah: **status
PPPoE langsung** dan **topologi ODP**. Pelanggan offline digambar merah di atas
jaringan ODP, lengkap dengan hitungan "38 customer offline", pemilih router,
dan waktu sinkronisasi terakhir.

Kita sudah punya kedua bahannya — `PppoeSession` (ONLINE/OFFLINE/DISABLED,
1.708 baris) dan `loadNetworkMap()` — tetapi **belum pernah disatukan**.
Menyatukannya jauh lebih murah daripada membangun apa pun dari nol, dan
nilainya untuk NOC lebih besar daripada impor KMZ itu sendiri.

Satu hal yang benar-benar belum ada bahannya: **LOS (loss of signal)**. Itu
status optik ONU yang hanya bisa dibaca dari OLT lewat SNMP/telnet, sedangkan
kita baru menarik data dari MikroTik. Ini pekerjaan tersendiri, bukan bagian
dari pemetaan KMZ.

## 4. Usulan pemecahan fase

| Fase | Isi | Bergantung |
|---|---|---|
| **35** | Dukungan KMZ + parser sadar folder. `parseKmz()` membongkar ZIP, `parseKml()` mengembalikan folder tiap placemark. Tanpa perubahan skema. | — |
| **36** | Impor multi-entity: POP, ODC, ODP. Jenis ditebak dari nama folder, tetap bisa ditimpa petugas di layar pratinjau. Pratinjau MATCH/NEW/DUPLICATE dipertahankan apa adanya. | 35, D2 |
| **37** | Impor titik pelanggan, dengan kunci pencocokan hasil D3 dan aturan penimpaan hasil D5. Yang tidak tercocokkan dilaporkan, bukan ditebak. | 36, D3, D5 |
| **37b** | Lapisan status PPPoE di peta: pelanggan offline/disabled diwarnai, hitungan offline, pemilih router, dan waktu sinkron terakhir. Menyatukan `PppoeSession` dengan `loadNetworkMap()`. | — (bisa jalan lebih dulu) |
| **38** | POP/ODC/MS masuk `loadNetworkMap()` sebagai lapisan tersendiri; ekspor KML diperluas ke seluruh jenis titik, bukan ODP saja. | 36 |
| **39** | *(hanya bila D1 = b atau c)* Rute kabel: model, impor LineString, dan lapisan peta. | 35, D1 |

Input manual **tidak jadi fase tersendiri** karena CRUD-nya sudah ada untuk ODP
dan site. Yang kurang hanyalah pemilih koordinat di peta (klik untuk menaruh
titik) — itu pekerjaan frontend, dan cukup ditulis sebagai kontrak: form
mengirim `latitude`/`longitude`, server memvalidasi rentangnya seperti yang
sudah dilakukan `coordinateRejection()`.

## 5. Prinsip yang dipertahankan

1. **Pratinjau sebelum menerapkan, selalu.** Kekuatan importer sekarang justru
   di situ — petugas melihat MATCH/NEW/DUPLICATE dan jarak pergeseran sebelum
   apa pun tersimpan. Impor multi-entity tidak boleh menghilangkan itu.
2. **Yang tidak tercocokkan dilaporkan, tidak ditebak.** Menebak berarti
   menimpa data pelanggan yang salah.
3. **Tidak ada sumber kebenaran kedua.** POP dan ODC memakai `NetworkSite` yang
   sudah ada; okupansi tetap dihitung dari `OdpPort`, bukan dari berkas KMZ.
4. **Berkas KMZ adalah masukan, bukan otoritas.** Digambar manual oleh manusia
   di lapangan, jadi selalu diperlakukan sebagai usulan yang perlu disetujui.

## 6. Yang saya butuhkan untuk mulai

Jawaban D1–D5. Yang paling mendesak **D2** (apa itu MS) dan **D3** (kunci
pencocokan pelanggan) — keduanya menentukan bentuk skema dan tidak enak diubah
setelah data masuk.
