# Rencana Fase 83–90 — menuju setara ALUS, lalu melampauinya

Disusun 17 Agustus 2026 dari [PERBANDINGAN-ALUS.md](PERBANDINGAN-ALUS.md) dan
SOP PDF v1.0. Fase terakhir yang selesai: 82 (rantai OLT→PON→ODP).

**Aturan yang mengikat semua fase:**

1. **Mode baca-saja** — tidak ada penagihan, isolir, atau kirim pesan sampai
   cutover. Fitur eksekusi dibangun MATI (flag/scheduler off), dan dinyalakan
   satu per satu hanya oleh keputusan pemilik.
2. **ALUS tidak disentuh** — semua pengambilan data dari ALUS bersifat GET
   baca-saja. Tidak pernah ada tulis ke sana.
3. Frontend milik Luna, backend milik Opus. Tiap fase yang menyentuh layar
   ditutup dengan kontrak di HANDOFF + berkas perintah siap salin.
4. Gaya visual yang sekarang TIDAK diubah. Yang diadopsi dari ALUS adalah
   *fungsi dan alur*, bukan rupanya.
5. Urutan fase = urutan pengerjaan, tetapi tiap fase berdiri sendiri dan
   dimulai hanya setelah pemilik bilang gas.

---

## Fase 83 — Rekonsiliasi & tambang data ALUS  ✅ SELESAI 17 Agustus 2026

Menutup selisih data antara dua sistem selagi ALUS masih jadi sumber kebenaran.

**Isi:**
- **Posisi ONU per pelanggan** — kolom baru `Subscription.onuPosition`
  (teks `slot/port:onuId` apa adanya), impor 1.700 nilai dari data mentah,
  cocokkan slot/port-nya dengan `ponPortId` ODP pelanggan sebagai uji silang.
- Lengkapi **redaman** 135 ODP yang belum terisi, **isolir date**, dan
  **tags** pelanggan (kalau tim memang memakainya — tanya dulu).
- **Impor 4 pelanggan baru** (`PN260816062`, `PN260815027`, `PN260815308`,
  `PN260815316`) + langganannya.
- **Skrip rekonsiliasi berulang** `scripts/_rekon-alus.ts`: bandingkan
  pelanggan/status/plan/harga/ODP/PPPoE kita vs ekspor ALUS, keluarkan selisih
  sebagai laporan — dijalankan kapan pun sebelum cutover untuk tahu posisi.
  Termasuk menyandingkan `Blocked` ALUS vs `DISABLED` router per pelanggan.
- Selesaikan sisa lama bila pemilik setuju: 27 pelanggan berbayar tanpa port
  ODP, 23 kode material tanpa nama.

**Hasilnya** (rinci di [AUDIT-DATA-PRODUKSI.md](AUDIT-DATA-PRODUKSI.md)):

- **1.698 posisi ONU** tersimpan. Pemeriksaan silangnya terhadap tautan PON
  Fase 82: **1.503 sepakat, 34 berselisih — 97,8%.** `PID` dan `PSM` ternyata
  saling tertukar di berkas sumber.
- **Kasus lama "27 pelanggan tanpa port ODP" terpecahkan**, aritmetikanya tutup
  sempurna: empat ODP menampung lebih banyak orang daripada kapasitas
  tercatatnya (30/16, 19/16, 19/16, 15/8 = 27 tak kebagian). 26 dari 27 sedang
  ONLINE — mereka nyata; kapasitas tercatatnya yang keliru.
- **Empat pelanggan baru masuk**, tiga dapat port.
- **Redaman: batal dengan alasan.** 110 memang kosong di sumbernya, 23 sisanya
  positif 6–19 pada kolom dBm yang normalnya negatif — itu dB rugi, bukan dBm
  daya. Penolakan `parseDbm` benar.
- **Isolir date sudah terisi** 1.679/1.709 sejak dulu; **tags tidak dipakai**.
- **Rekonsiliasi: 1.682 dari 1.711 cocok penuh, NOL selisih status, NOL selisih
  harga.** Yang layak ditindak: **21 pelanggan diblokir di penagihan tetapi
  sambungannya masih menyala.**

Alat yang ditinggalkan, dipakai berulang sampai cutover:
`scripts/_rekon-alus.ts` (tidak menulis apa pun), `scripts/_impor-pelanggan.ts`
(penambahan kecil yang terus terjadi), `scripts/_impor-onu.ts`.

---

## Fase 84 — Jembatan operasional harian  `[Opus, sedikit Luna]`

Hal-hal kecil yang tiap hari dilihat orang di ALUS dan belum ada di kita.

**Isi:**
- **Antrean kegagalan sinkron MikroTik** — tabel + layar berisi kegagalan
  worker (koneksi putus, secret tak ketemu), dengan hitungan percobaan,
  status, dan catatan. ALUS: menu "MikroTik Sync". Punya kita selama ini cuma
  log worker yang tidak dibaca siapa pun.
- **System Status** — halaman kesehatan: worker hidup/mati, poll terakhir per
  router, antrean gagal, ruang disk VPS.
- Kartu dasbor: status OLT/ONU ringkas (dari data sinkron yang ada, bukan
  telemetri live — itu Fase 88).

**Selesai bila:** kegagalan sinkron terlihat di layar tanpa membuka log, dan
dasbor menjawab "worker jalan atau tidak" sekali pandang.

---

## Fase 85 — Kesetaraan layar inti  `[Luna, kontrak dari Opus]`

Menyamakan *kepadatan informasi* layar-layar yang dipakai tiap hari, tanpa
mengubah gaya.

**Isi (per layar, dibandingkan langsung dengan ALUS):**
- **Detail pelanggan**: tampilkan PPPoE user + On Router Status + tautan ke
  router/OLT/ODP-nya (semua datanya sudah ada), posisi ONU (setelah Fase 83),
  tombol buka tiket dari situ, riwayat perubahan per pelanggan (dari audit
  log — backend menyediakan query per-entitas), "Show in Google Maps".
- **Daftar pelanggan**: ringkasan per paket (Plan Group ALUS), kolom isolir
  date, penyaring merchant/status/paket setara ALUS.
- **TV Wall** untuk helpdesk/dispatch — layar penuh berisi tiket berjalan,
  dirancang untuk monitor ruangan.
- **Laporan tiket + MTTR** di helpdesk.
- Urutan navigasi & pola penyaring (`Filter` + `Reset`) konsisten di semua
  daftar — pola yang sama sudah diminta pemilik di peta.
- Animasi/transisi: ikuti yang sudah ada di app kita; jangan meniru gaya ALUS.

**Selesai bila:** orang yang tiap hari memakai ALUS bisa menjawab pertanyaan
yang sama dari layar kita tanpa membuka ALUS.

---

## Fase 86 — Berkas & log per pelanggan  `[Opus → Luna]`

Prasyarat backend untuk bagian Fase 85 yang butuh tabel baru.

**Isi:**
- Model `CustomerFile` — unggah KTP/form berlangganan/foto rumah, disimpan
  privat (bukan public folder), diunduh lewat endpoint ber-permission,
  magic-byte diperiksa, ukuran dibatasi, audit tiap unduh. (Prinsip private
  file dari SOP PDF §21 — diambil yang masuk akal sekarang.)
- Query audit per-entitas (`Customer`, `Subscription`) untuk riwayat per
  pelanggan di layar.
- Cetak **Form Berlangganan** dari data CRM (pola print yang sudah ada di
  terminations/[id]/print).

**Selesai bila:** satu pelanggan bisa dibuka lengkap: identitas, berkas,
riwayat perubahan, tanpa membuka ALUS.

---

## Fase 87 — Portal pelanggan (web + PWA)  `[Opus kontrak & backend, Luna UI]`

Jawaban untuk "app alus punya login untuk client side, kita bisa buat yang
mirip?" — bisa, dan lebih dulu web + PWA supaya satu kode.

**Isi backend:**
- Realm auth TERPISAH dari staf (tabel `CustomerAccount`, sesi sendiri,
  rate-limit sendiri) — login nomor layanan + password; reset password oleh
  admin (padanan "Reset Password Portal Customer" ALUS) dan
  "logout semua perangkat".
- API portal, semuanya read-only di era baca-saja: status koneksi
  (`linkStatus` + lastSeen), paket & harga, **tagihan: selama belum cutover
  tampilkan "tagihan dikelola di sistem lama" + nominal & jatuh tempo dari
  data rekonsiliasi** — tidak mengarang invoice.
- **Lapor gangguan** → membuat tiket `helpdesk` (satu-satunya tulis dari
  portal; masuk antrean staf, bukan aksi jaringan).
- **Promo & pengumuman** — model konten + penargetan, padanan "Promo &
  Pengumuman App" ALUS; yang menulis kontennya tim marketing lewat CRM.

**Isi Luna:** halaman portal (login, beranda status, tagihan, promo, lapor
gangguan), PWA manifest + installable, gaya mengikuti app kita.

**Selesai bila:** satu pelanggan uji bisa login, melihat status koneksinya
yang sungguhan, dan tiketnya sampai ke helpdesk.

---

## Fase 88 — Telemetri OLT/ONU  `[Opus]`

Yang paling dikagumi orang dari ALUS: panel ONU live (RX dBm, jarak,
dyinggasp, LOS). Bertahap:

- **88a — dari yang sudah ada:** LibreNMS sudah mem-poll kelima OLT SNMP;
  tarik metrik port PON (status, lalu lintas) ke layar perangkat + panel ONU
  di detail pelanggan sejauh data sinkron memungkinkan.
- **88b — pembacaan langsung (opsional, putuskan setelah 88a):** worker
  telnet/SNMP ke OLT ZTE untuk daftar ONU + optical per ONU. HSGQ Kecicang
  tetap di luar jangkauan (tanpa SNMP — keputusan 16 Agustus).
- **Aksi ONU (reboot/configure): TIDAK dibangun sekarang.** Itu tulis ke
  jaringan; barangnya masuk daftar setelah-cutover.

**Selesai bila (88a):** detail pelanggan menampilkan keadaan ONU terakhir
yang diketahui + kapan terakhir dilihat.

---

## Fase 89 — Job center penagihan, terpasang MATI  `[Opus, nyala = keputusan pemilik]`

Padanan "Notification & Job Center" ALUS (Buat Invoice / Kirim Notifikasi /
Jalankan Isolir) memakai modul billing kita yang sudah ada (`runs`, `isolir`,
`outbox`, scheduler yang sekarang off):

- Gladi bersih di data salinan: jalankan billing run + isolir + notifikasi
  dalam **mode simulasi** (dry-run yang menghasilkan laporan "apa yang AKAN
  terjadi", tanpa menulis apa pun keluar).
- **Gateway WhatsApp**: integrasi kirim via penyedia (padanan WA Gateway
  ALUS), dibangun dan diuji ke nomor internal saja, default MATI.
- **Daftar periksa cutover** — dokumen langkah pindah dari ALUS: data apa
  di-freeze, invoice berjalan diapakan, urutan menyalakan scheduler, cara
  mundur kalau gagal.

**Selesai bila:** simulasi satu siklus penagihan penuh menghasilkan angka yang
cocok dengan ALUS pada data yang sama, dan daftar periksa cutover disetujui
pemilik. **Menyalakannya bukan bagian fase ini.**

---

## Fase 90 — SOP Alur Kerja versi CRM  `[Opus menulis, pemilik menetapkan]`

Tulis ulang SOP PDF v1.0 menjadi `docs/SOP-ALUR-KERJA.md` yang menunjuk rute
dan modul yang sungguhan:

- Tiap alur ditandai `[SEKARANG]` / `[SETELAH CUTOVER]` / `[FASE X]`.
- Bab yang modulnya belum ada (SUPERPOP rack, fiber core/OTDR, Legal) ditulis
  satu paragraf jujur: belum dibangun, dan masuk backlog terpisah — bukan
  fase 83–90 ini.
- Prinsip yang diambil dari PDF dan sudah kita jalankan ditulis sebagai
  aturan: gate server-side, snapshot harga, approval beda orang, idempotensi
  impor, private file, audit.
- Ritme harian/mingguan (PDF §23) disesuaikan ke menu kita.

**Selesai bila:** tim bisa menjalankan satu hari kerja penuh hanya dengan
membaca SOP ini, dan tiap kalimatnya menunjuk layar yang benar-benar ada.

---

## Yang sengaja TIDAK direncanakan sekarang

- **Aplikasi mobile native** — PWA dulu (Fase 87); native dinilai sesudahnya.
- **Aksi tulis ke jaringan** (reboot ONU, edit secret, configure) — setelah
  cutover, daftar terpisah.
- **SUPERPOP / fiber core & OTDR / Legal** — celah lama, backlog terpisah,
  jangan mencampurnya dengan kesetaraan ALUS.
- Kalkulator kecil (IP calc, MAC vendor, burst) — kapan saja sebagai selingan.

## Urutan yang disarankan & alasannya

```
83 (data dulu — semua layar berikutnya butuh datanya)
→ 84 (operasional harian, kecil dan langsung terasa)
→ 85+86 (layar inti; 86 menyuplai backend 85)
→ 87 (portal — nilai baru yang ALUS-nya sendiri sudah punya)
→ 88a (telemetri dari data sinkron)
→ 89 (gladi penagihan, MATI)
→ 90 (SOP ditulis saat kenyataannya sudah stabil)
```
