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

## Fase 84 — Jembatan operasional harian  ◑ BACKEND SELESAI 17 Agustus 2026

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

**Yang ternyata SUDAH ADA** — diperiksa sebelum membangun, supaya tidak lahir
layar kembar:

- `NetworkAccessJob` + layar `/noc/access-jobs` = padanan "MikroTik Sync
  Failures" ALUS. Sudah lengkap: `attempts`, `lastError`, status.
- `PppoePollRun` per router + kegagalannya sudah tampil di `/noc/pppoe`.
- `ScheduledTask` + `ScheduledTaskRun` + layar `/settings/scheduler`.

Jadi isi fase ini menyusut, dan yang tersisa justru yang paling menipu.

**Yang DIKERJAKAN:** `src/lib/system-status.ts` + `-service.ts`.

Layar penjadwal menampilkan `lastStatus` hijau `SUCCESS` untuk tugas yang sudah
enam jam tidak berjalan — sebab status menjawab "bagaimana hasil jalan
terakhir", bukan "apakah ia masih hidup". Worker yang mati diam-diam tidak
menghasilkan kegagalan; ia berhenti menghasilkan apa pun.

**Kesegaran** diukur sebagai kelipatan interval, bukan angka mutlak — telat
sepuluh menit itu gawat bagi tugas dua menit dan bukan apa-apa bagi tugas
harian. Dengan lantai toleransi 180 detik supaya tugas tercepat tidak berkedip
merah sepanjang hari, dan tugas yang sengaja dimatikan tidak dihitung gagal.

Kegagalan router dihitung **beruntun**, bukan seumur hidup: `pppoe.poll` punya
214 kegagalan sepanjang hidupnya dan sedang sehat sempurna.

`scripts/_cek-kesehatan.ts` menjawabnya dari terminal sekarang juga, dalam
**WITA** — bukan UTC jam server.

**Sisa untuk Luna:** layar `/settings/status` + kartu dasbor. Kontraknya di
HANDOFF §45.

**Selesai bila:** dasbor menjawab "worker jalan atau tidak" sekali pandang.

---

## Fase 85 — Kesetaraan layar inti  ◑ KONTRAK SIAP (HANDOFF §46) — layar milik Luna

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

## Fase 86 — Berkas & log per pelanggan  ✅ BACKEND SELESAI 17 Agustus 2026

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

## Fase 87 — Portal pelanggan (web + PWA)  ✅ BACKEND SELESAI 17 Agustus 2026

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

## Fase 88 — Telemetri OLT/ONU  ✅ 88a SELESAI 17 Agustus 2026 · 88b belum diputuskan

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

## Fase 89 — Job center penagihan, terpasang MATI  ✅ GLADI SELESAI 17 Agustus 2026

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

## Fase 90 — SOP Alur Kerja versi CRM  ✅ SELESAI 17 Agustus 2026 — [SOP-ALUR-KERJA.md](SOP-ALUR-KERJA.md)

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


---

## Keadaan seluruh rencana, 17 Agustus 2026

| Fase | Keadaan |
|---|---|
| 83 Rekonsiliasi & tambang data | ✅ selesai |
| 84 Jembatan operasional harian | ✅ backend · layar Luna (§45) |
| 85 Kesetaraan layar inti | ◑ kontrak siap (§46) · layar Luna |
| 86 Berkas & log per pelanggan | ✅ backend · layar Luna (§46) |
| 87 Portal pelanggan | ✅ backend · layar Luna (§46) |
| 88a Telemetri ONU dari data sinkron | ✅ selesai · layar Luna (§46) |
| 88b Pembacaan OLT langsung | ✅ selesai 18 Agu — semua vendor |
| 89 Gladi penagihan (MATI) | ✅ selesai · dibandingkan 18 Agu |
| 90 SOP versi CRM | ✅ selesai |
| 91 Brankas kredensial perangkat | ✅ selesai & terverifikasi 18 Agu |

**Yang menahan cutover** — diperbarui 18 Agustus 2026:

1. ~~Ekspor nominal tagihan ALUS lalu `--banding`.~~ ✅ **Selesai 18 Agustus.**
   Hasilnya di [REKONSILIASI-TAGIHAN-AGUSTUS.md](REKONSILIASI-TAGIHAN-AGUSTUS.md):
   tidak ada tagihan ganda, tetapi ada **63 langganan senilai Rp12.679.000**
   yang CRM akan tagih dan ALUS tidak. Termasuk dua akun bertanda "Free" yang
   akan menerima tagihan. **Ini sekarang penahan cutover nomor satu**, dan
   jawabannya per pelanggan, bukan per angka.
2. Layar-layar Luna (§45, §46, §49, §50, §51).
3. ~~Lima langganan tanpa tanggal mulai tagih.~~ ✅ **Selesai.** Diperiksa 18
   Agustus: 1.715 dari 1.715 langganan punya profil tagihan, nol nonaktif.
4. **55 posisi ONU salah format** — lihat Fase 92 di bawah. Menahan telemetri,
   bukan menahan penagihan.
5. Koordinat 6 POP — menahan lapisan site di peta, bukan menahan cutover.

**Yang masih di luar rencana ini:** SUPERPOP/rak, fiber core & OTDR, Legal &
Compliance, checkpoint ODP berevidence, dokumen IRF/DO/STO terpisah, lokasi
absen ber-geofence, lembur, arus kas, perubahan modal, rasio keuangan.

---

## Fase 88b — daya optik ONU  ✅ SELESAI 18 Agustus 2026 — C300, C600, dan HSGQ semuanya terbaca

Pemilik jaringan menanyakan kenapa daya ONU belum kelihatan di halaman
pelanggan. Panel Fase 88a memang **sengaja mengatakannya** lewat daftar
`belumDiketahui` — tetapi pertanyaannya wajar, dan penyelidikannya menghasilkan
temuan yang layak dicatat supaya orang berikutnya tidak mengulang langkah yang
sama.

### Yang sudah dicoret

- **LibreNMS tidak punya datanya.** Ia menyimpan enam sensor `dbm`, tetapi
  seluruhnya milik SFP+ router `PRM_NAGABASUKIH_D` — uplink, bukan ONU.
- **OID ZXA10 yang lazim tidak ada di perangkat ini.** `3902.1012.*` menjawab
  *No Such Object*; cabang yang hidup pada C600 adalah **`3902.1082`** dan
  `3902.3`.
- **`1082.30.40.2.*` bukan pembacaan hidup.** Ia tampak menjanjikan — 1.480
  baris, contoh nilai `-4509` — tetapi kolom tetangganya berisi
  `_DEFAULT_ALARM_PROFILE` dan sebagian besar nilainya `2147483647`. Itu tabel
  **ambang alarm**, bukan daya terima. Nyaris terpakai kalau tidak diperiksa
  kolom sebelahnya.

### Yang sudah terbukti bisa

- **SNMP dari VPS ke OLT jalan.** `snmpwalk` tersedia, community tersimpan di
  LibreNMS (v2c, port 161), pohon MIB terbaca penuh.
- **Ada jalur telnet per-OLT yang selama ini tidak dipakai**, tersimpan sejak
  impor Fase 81:

  | OLT | telnet | snmp |
  |---|---|---|
  | ZTE-C300-102-Pesagi | `172.30.10.6:23` | 1610 |
  | ZTE-C600-100-Kecicang | `:231` | 1612 |
  | ZTE-C600-104-Abang | `:232` | 1613 |
  | HSGQ-102-SerayaBarat | `:1024` | 1615 |
  | HSGQ-102-SerayaTengah | `:1025` | 1616 |

### HASIL (malam yang sama): C300 tembus lewat SNMP

Vendor tidak bisa ditanya, jadi jalannya dibalik: OID klasik ZXA10 yang kemarin
gagal ternyata **dicoba di perangkat yang salah** — di C300 Pesagi ia hidup,
lengkap dengan tabel nama ONU berisi username pelanggan. Rumus indeks
diverifikasi terhadap indeks yang sungguh diamati, penyandian nilai
diverifikasi lewat sebaran 352 ONU, dan ujian akhirnya: **24 pelanggan
berbayar dibaca langsung dari OLT produksi, nama di perangkat cocok dengan
pppoeUsername seluruhnya.** Satu langsung ketahuan WASPADA (−26,02 dBm).

`bacaDayaOnuAction` siap dipakai Luna (§47). Dibaca saat diminta — satu klik
satu GET, tanpa penyapuan. C600 dan HSGQ ditutup dengan bukti: keduanya memang
tidak memancarkan DDM lewat SNMP; jalannya CLI telnet, menunggu kredensial.

### Jalan yang tersisa untuk C600 + HSGQ, berurutan menurut ongkosnya

1. **Tanya vendor sistem lama** OID atau perintah yang mereka pakai. Mereka
   sudah memecahkannya — halaman OLT-nya menampilkan RX dBm per ONU. Ini jalan
   termurah, dan menanyakannya bukan aib.
2. **Baca CLI lewat telnet** (`show pon power onu-rx` pada ZTE). Cara yang
   lazim untuk ZTE, dan hampir pasti yang dipakai sistem lama — port telnetnya
   ikut dicatat per-OLT, dan itu tidak dicatat kalau tidak dipakai.
3. **Cari MIB ZTE resmi** untuk C600 V2.0.0 dan C300 V2.1.0, lalu lewat SNMP.

### Dua prasyarat yang mudah terlewat

**Kredensial OLT belum pernah disimpan.** `OltDevice.credentialRef` kelimanya
masih berisi `LIBRENMS_API_TOKEN` — penanda sementara dari Fase 81, bukan
kredensial OLT. Membaca CLI menuntut user/password yang belum kita punya, dan
menyimpannya menuntut keputusan: **nama env var per OLT, bukan nilainya di
basis data** (pola Fase 13).

**Membaca 1.698 ONU lewat CLI berarti membuka sesi ke perangkat produksi
berulang kali.** Harus dibatasi lajunya dan dijadwalkan jarang — OLT yang sibuk
melayani permintaan pembacaan adalah OLT yang tidak sedang melayani pelanggan.

---

## Fase 91 — Brankas kredensial perangkat  ✅ SELESAI & TERVERIFIKASI DI PRODUKSI 18 Agustus 2026

Diminta pemilik jaringan: *"fitur untuk login telnet / ssh untuk device juga
dong, biar bisa auto add lewat crm, ga nambah file env supaya NOC ku gampang
add device nanti, jadi team IT ga repot ngoding lagi."*

Masalahnya nyata. Pola Fase 13 menyimpan **nama** env var di
`OltDevice.credentialRef` dan nilainya di `.env`. Aman, tetapi berarti setiap
perangkat baru menuntut orang menyunting berkas di server lalu menyalakan ulang
container — NOC tidak bisa, jadi tim IT yang dipanggil, setiap kali.

### Yang dibangun

Sandi disimpan di basis data dalam keadaan **tersegel AES-256-GCM**; kuncinya
satu-satunya ada di `DEVICE_CRED_KEY`. NOC menambah perangkat dari layar; IT
cukup memasang satu kunci sekali seumur sistem.

- `src/lib/rahasia-perangkat.ts` — segel/buka, IV acak per catatan, tag GCM
  menangkap catatan yang diutak-atik langsung di basis data.
- `src/lib/kredensial-perangkat-service.ts` — **brankas dibaca dulu, env var
  jadi cadangan.** Lima OLT yang sudah berjalan tidak perlu disentuh, dan
  isian NOC langsung berlaku tanpa menunggu siapa pun.
- `DeviceCredential` di skema, `onDelete: Cascade` ke `NetworkDevice`.
- Rute `/noc/devices/[id]/kredensial` — kerangka berfungsi; tampilan ke Luna
  lewat HANDOFF §50.
- `scripts/_pindah-kredensial-ke-brankas.ts` — memindahkan `OLT_*_CRED` yang
  ada. Bawaannya lapor-saja.

### Keputusan yang menahan diri

- **Uji kredensial hanya MASUK, tidak menjalankan perintah apa pun.** Sampai di
  prompt sudah membuktikan kredensialnya benar, dan itu menghapus seluruh kelas
  galat "perintah tidak dikenal" dari jalur diagnosis. Dinding baca-saja utuh.
- **Sandi tidak pernah kembali ke layar.** `loadKredensial` mengembalikan
  metadata saja. Kotak sandi di form selalu kosong — bukan disembunyikan,
  memang tidak ada nilainya untuk dikirim.
- **`DEVICE_CRED_KEY` opsional, bukan wajib.** Tanpa kunci aplikasi tetap
  menyala dan OLT lama tetap jalan; hanya penambahan baru yang tertahan.

### Terbukti di produksi, 18 Agustus 2026

Keenam OLT pindah ke brankas dan **keenamnya lolos uji login** — bukan
diasumsikan, ditekan satu per satu dan `lastVerifiedAt` tercatat:

| OLT | Port | Terbukti |
|---|---|---|
| 192.168.100.10 HSGQ Kecicang | 1023 | 09.20 |
| 192.168.100.11 HSGQ SerayaBarat | 1024 | 09.21 |
| 192.168.100.12 HSGQ SerayaTengah | 1025 | 09.21 |
| 192.168.100.30 ZTE C300 Pesagi | 23 | 08.48 |
| 192.168.100.60 ZTE C600 Kecicang | 231 | 09.15 |
| 192.168.100.61 ZTE C600 Abang | 232 | 09.21 |

Lolosnya ketiga HSGQ sekaligus menjawab pertanyaan yang sempat menggantung:
apakah klien telnet benar-benar memakai port tersimpan, atau diam-diam jatuh
ke 23. Kalau yang kedua, ketiga HSGQ pasti gagal — 23 bukan port telnet HSGQ.
Port tersimpan dipakai apa adanya.

### Pelajaran yang mahal

Deploy pertama gagal senyap **dua kali berturut-turut**, dan keduanya gagal
dengan sopan — tidak ada galat, hanya hasil yang salah:

1. **Citra `tools` tidak ikut terbangun.** `docker compose up -d --build` hanya
   membangun layanan yang tidak berprofil, jadi `tools` tetap memakai
   `schema.prisma` lama dan `prisma db push` menjawab *"already in sync"*
   padahal tabelnya belum pernah ada. Obatnya `docker compose build tools`
   secara eksplisit.
2. **Skrip pindah mencari `level: "ADMIN"`** yang tidak ada di proyek ini
   (`STAFF | SUPERVISOR | OWNER`), lalu berhenti tanpa memindahkan apa pun.
   Keluarannya rapi, hanya exit code-nya 1. Sekarang memakai `USER_LEVELS`
   supaya kesalahan yang sama gagal saat kompilasi.

### Yang tersisa

Baris `OLT_*_CRED` boleh dihapus dari `.env` — satu per satu, dan uji ulang
perangkat itu sesudah tiap penghapusan. Sekaligus berarti tidak tahu yang mana
yang meleset kalau ada yang meleset.


---

## Fase 92 — Posisi ONU yang salah format  ◇ DIUSULKAN, belum dikerjakan

Ditemukan 18 Agustus 2026 saat membuktikan Fase 88b. Pembacaan daya optik
berhasil di lima dari enam OLT; yang gagal ternyata bukan salah perangkat.

**55 langganan menyimpan `onuPosition` dengan format vendor yang keliru.**
ZTE memakai `slot/pon/onu:idx` (mis. `1/2/14:11`), HSGQ memakai `pon:idx`
(mis. `1:10`). Yang tersimpan tertukar:

| OLT | Vendor | Langganan | Salah format |
|---|---|---|---|
| 192.168.100.10 | HSGQ | 138 | **49** bergaya ZTE |
| 192.168.100.30 | ZTE c300 | 347 | **5** bergaya HSGQ |
| 192.168.100.60 | ZTE c600 | 306 | **1** bergaya HSGQ |

Akibatnya bukan galat yang kelihatan: pembacaan mereka menjawab
`TAK_TERBACA — ONU mungkin tidak dikenal atau sedang mati`. Kalimat itu **benar
secara harfiah dan menyesatkan secara praktis** — ONU-nya hidup, alamatnya yang
salah. Seorang NOC yang membacanya akan mengirim teknisi ke lokasi pelanggan
untuk memeriksa perangkat yang sebenarnya sehat.

### Yang perlu diputuskan sebelum dikerjakan

Posisi yang benar tidak bisa ditebak dari yang salah — `1/16/13:2` tidak bisa
diterjemahkan menjadi `pon:idx` tanpa tahu ONU itu sebenarnya di mana. Jalannya
membaca daftar ONU dari tiap OLT lewat CLI, lalu mencocokkan dengan
`pppoeUsername` di basis data.

Itu **menulis ke basis data kita berdasarkan pembacaan perangkat** — dinding
baca-saja tetap utuh, tetapi 55 baris berubah. Perlu persetujuan pemilik dulu,
dan sebaiknya lapor-saja dulu seperti skrip lain.

### Yang TIDAK boleh dilakukan

Menghapus posisi yang salah supaya "bersih". Posisi keliru masih menyimpan
petunjuk PON mana pelanggan itu berada; menghapusnya membuang informasi dan
menukar satu kesalahan dengan kekosongan.