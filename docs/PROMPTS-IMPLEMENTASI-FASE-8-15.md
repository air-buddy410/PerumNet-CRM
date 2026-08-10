# Prompt Implementasi Fase 8–15 — PerumNet CRM

**Tanggal:** 2026-08-10
**Rujukan:** [FEATURE-GAP-ANALYSIS-HELPDESK-V2.md](FEATURE-GAP-ANALYSIS-HELPDESK-V2.md) · [DESIGN-PHASE-8-BILLING-AND-BEYOND.md](DESIGN-PHASE-8-BILLING-AND-BEYOND.md) · [PRD-PerumNet-CRM.md](PRD-PerumNet-CRM.md) · [TECHNICAL-PLAN.md](TECHNICAL-PLAN.md)

> **STATUS: SUDAH DIJALANKAN (2026-08-10).**
> Fase 8–15 sudah diimplementasi dan ter-merge ke `main`. Prompt di bawah disimpan sebagai
> **arsip** — berguna bila suatu fase perlu dikerjakan ulang atau dijadikan pola untuk fase baru.
> Jangan menjalankan ulang tanpa instruksi eksplisit; menjalankannya di atas kode yang sudah ada
> berisiko menduplikasi model dan halaman.

## Cara Pakai

1. Jawab dulu **Prompt 0** (keputusan Product Owner). Delapan keputusan itu menentukan bentuk skema — kalau dilewati, hasilnya akan salah bentuk dan mahal diperbaiki.
2. Kerjakan **satu fase per sesi**. Jangan gabung dua fase.
3. Setiap sesi: tempel **Prompt Konteks** di bagian atas, lalu prompt fasenya.
4. Urutan 8 → 9 → 10 → 11 wajib berurutan (billing → payment → isolir → GL saling bergantung). Fase 12–15 boleh diacak sesuai prioritas bisnis.

---

## Prompt Konteks (tempel di awal setiap sesi)

```text
Kamu bekerja di repo PerumNet-CRM (Next.js 15 App Router + TypeScript + Prisma + Tailwind).

Baca dulu, jangan berasumsi:
- AGENTS.md
- docs/PRD-PerumNet-CRM.md
- docs/TECHNICAL-PLAN.md
- docs/DESIGN-PHASE-8-BILLING-AND-BEYOND.md  ← rancangan yang sedang dieksekusi
- docs/FEATURE-GAP-ANALYSIS-HELPDESK-V2.md   ← alasan di balik rancangan
- prisma/schema.prisma untuk model yang sudah ada

Aturan non-negotiable (dari AGENTS.md + PRD §7 & §53):
1. Saldo, stok, dan angka keuangan TIDAK PERNAH diedit langsung — hanya berubah lewat transaksi yang diposting.
2. Transaksi yang sudah diposting bersifat immutable. Koreksi = reversal, bukan edit atau hapus.
3. Setiap mutasi wajib lewat server action, wajib requirePermission(), wajib logAudit().
4. Segregation of duties: pembuat transaksi tidak boleh menyetujui transaksinya sendiri.
5. Uang disimpan sebagai BigInt rupiah bulat. Tidak ada float untuk uang.
6. Jangan menghapus atau menyederhanakan business rule yang sudah ada tanpa persetujuan eksplisit.

Batas kepemilikan kode:
- Layer frontend/responsive (globals.css, app-shell, sistem desain) dimiliki pihak lain.
  Kamu hanya boleh menambah halaman/komponen baru mengikuti pola yang sudah ada.
  JANGAN mengubah globals.css, app-shell, atau komponen layout global.

Cara kerja:
- Sebelum menulis kode, jelaskan dulu rencana perubahan dan daftar file yang akan dibuat/diubah. Tunggu persetujuan.
- Setelah skema berubah, jalankan migrasi Prisma dan perbarui seed bila perlu.
- Perbarui docs/TECHNICAL-PLAN.md di akhir fase (living document).
- Kalau ada requirement yang ambigu, berhenti dan tanya. Jangan menebak aturan bisnis.
```

---

## Prompt 0 — Keputusan Product Owner (kerjakan lebih dulu)

```text
Baca docs/DESIGN-PHASE-8-BILLING-AND-BEYOND.md §11.

Ajukan 8 keputusan berikut ke saya satu per satu, dengan rekomendasimu dan konsekuensi
teknis tiap opsi. Jangan mulai koding sebelum semuanya terjawab:

1. Merchant jadi entitas baru, atau dipetakan ke Division/Area yang sudah ada?
2. Sales mitra: User dengan role SALES, atau entitas SalesAgent tanpa akses sistem?
3. Skema komisi kolektor: persen per merchant, nominal per invoice, atau berjenjang?
4. Ambang isolir: hari lewat jatuh tempo, jumlah invoice tertunggak, atau mana yang lebih dulu tercapai?
5. Format nomor invoice: ikut format sistem lama, atau format baru?
6. PPN: per pelanggan atau per paket?
7. Payment gateway mana yang dipakai (Winpay / Duitku / Tripay / lainnya)?
8. Kebijakan retensi data identitas (KTP, NPWP, foto selfie absensi)?

Tulis hasilnya ke docs/DECISIONS-PHASE-8.md sebagai keputusan resmi, lalu perbarui
§11 di dokumen rancangan agar tidak ada lagi pertanyaan menggantung.
```

---

## Prompt Fase 8 — Billing & Invoice

```text
Implementasikan Fase 8 (Billing & Invoice) sesuai docs/DESIGN-PHASE-8-BILLING-AND-BEYOND.md §2.
Patuhi keputusan di docs/DECISIONS-PHASE-8.md.

Model baru: AddonService, SubscriptionAddon, BillingProfile, InvoiceRun, Invoice, InvoiceLine.

Aturan bisnis wajib:
- Constraint @@unique([subscriptionId, period, type]) pada Invoice. Generator bulanan
  HARUS idempoten — dijalankan dua kali untuk periode sama tidak boleh menghasilkan invoice ganda.
- Alur InvoiceRun: DRAFT → PREVIEW (hitung jumlah & total, belum menerbitkan) → POSTED (mengunci).
- Invoice POSTED immutable. Pembatalan = status VOID + invoice pengganti. Tidak ada delete.
- taxPercent dan taxAmount disimpan per invoice, bukan diambil dari master saat pelaporan.
- Perhitungan: subtotal = paket + add-on aktif − diskon; taxAmount dibulatkan ke rupiah bulat.
- Add-on yang aktif di tengah periode dihitung proporsional atau penuh — tanyakan ke saya dulu.

Yang dibangun:
- prisma: model + migrasi + seed contoh add-on
- lib/modules/billing/: service invoice generation, kalkulasi, penomoran
- Halaman: /billing/invoices (list + filter merchant/status/periode/plan), /billing/invoices/[id],
  /billing/runs (daftar batch), /billing/runs/new (preview sebelum posting),
  /settings/master/addons
- Permission baru: billing.view, billing.create, billing.post, billing.void, billing.export
- Export tabel: CSV minimal; Excel/PDF menyusul

Definition of done:
- Bisa generate invoice bulanan untuk semua langganan aktif, dijalankan ulang tanpa duplikat
- Invoice POSTED tidak bisa diedit lewat jalur manapun (termasuk server action)
- Semua mutasi tercatat di audit log
- Ada test untuk: idempotensi generator, kalkulasi pajak, penolakan edit invoice posted
```

---

## Prompt Fase 9 — Payment, Merchant & Kolektor

```text
Implementasikan Fase 9 sesuai docs/DESIGN-PHASE-8-BILLING-AND-BEYOND.md §3.
Prasyarat: Fase 8 selesai.

Model baru: Merchant, Payment, PaymentAllocation, PaymentGatewayTx.

Aturan bisnis wajib:
- Satu pembayaran bisa dialokasikan ke banyak invoice. Total PaymentAllocation WAJIB sama
  dengan Payment.amount — validasi di level transaksi database, tolak kalau tidak seimbang.
- Invoice berubah status otomatis berdasarkan akumulasi alokasi: OPEN → PARTIAL → PAID.
- Payment POSTED immutable. Pembatalan = REVERSED dengan reversalOfId, mengikuti pola
  yang sudah dipakai CashTransaction.
- Fee kolektor/mitra dicatat sebagai LIABILITAS (hutang fee), bukan pengurang pendapatan.
- Kasir hanya boleh menerima pembayaran ke cashbook yang di-assign kepadanya.

Integrasi gateway:
- Pakai framework Integration + IntegrationEvent yang sudah ada. Jangan bikin mekanisme baru.
- Webhook masuk lewat /api/integrations/[code]/webhook, wajib verifikasi signature per provider.
- Webhook harus idempoten — payload yang sama diterima dua kali tidak boleh menggandakan pembayaran.
- Semua payload mentah disimpan untuk audit dan replay.
- JANGAN commit kredensial gateway. Pakai environment variable.

Yang dibangun:
- Halaman: /billing/payments (+ new, [id]), /billing/gateway-transactions,
  /settings/master/merchants, /billing/my-transactions (rekap kasir sendiri)
- Rekap pembayaran per penerima, per cashbook, per merchant
- Permission: payments.view|create|post|reverse, merchants.view|manage

Definition of done:
- Bayar satu invoice, sebagian invoice, dan banyak invoice sekaligus semuanya benar
- Webhook ganda tidak menggandakan pembayaran
- Reversal mengembalikan status invoice ke kondisi sebelumnya
- Kasir tidak bisa memakai cashbook yang bukan miliknya
```

---

## Prompt Fase 10 — Isolir, Dunning & Integrasi MikroTik

```text
Implementasikan Fase 10 sesuai docs/DESIGN-PHASE-8-BILLING-AND-BEYOND.md §4.
Prasyarat: Fase 8 & 9 selesai.

Model baru: DunningPolicy, ServiceSuspension, NetworkAccessJob.

Aturan bisnis wajib — ini modul paling berbahaya, perlakukan dengan sangat hati-hati:
- UI TIDAK PERNAH memanggil router secara langsung. Alurnya selalu:
  evaluasi kebijakan → catat ServiceSuspension → antrikan NetworkAccessJob → worker eksekusi → catat hasil.
- Setiap job punya status, jumlah percobaan, dan pesan error. Kegagalan harus terlihat di UI,
  tidak boleh gagal diam-diam.
- Isolir dan pembukaan blokir wajib reversible dan tercatat lengkap di audit log
  (siapa/apa yang memicu, kebijakan mana, berapa tunggakan saat itu).
- Pembayaran yang ter-posting memicu pembukaan blokir lewat jalur yang sama secara terbalik.
- WAJIB ada mode dry-run: tampilkan daftar langganan yang AKAN diisolir beserta alasannya,
  tanpa mengeksekusi apapun. Ini harus dipakai sebelum eksekusi nyata.
- WAJIB ada kill switch untuk menghentikan seluruh eksekusi job.
- Kredensial router disimpan terenkripsi atau via secret store. JANGAN plaintext di database.

Yang dibangun:
- lib/modules/network/mikrotik/: adapter API MikroTik (enable/disable PPPoE secret, list active session)
- Worker/scheduler pemroses NetworkAccessJob dengan retry berjenjang
- Halaman: /billing/dunning (kebijakan), /billing/suspensions (riwayat + dry-run),
  /noc/access-jobs (monitor job + retry manual)
- Notifikasi pengingat jatuh tempo mengikuti reminderOffsets

Definition of done:
- Dry-run menghasilkan daftar yang benar tanpa efek samping apapun
- Job gagal terlihat jelas dan bisa diulang manual
- Isolir → bayar → buka blokir berjalan utuh dan tercatat
- Tidak ada satupun jalur kode yang memanggil router di luar worker
```

---

## Prompt Fase 11 — General Ledger & Laporan Keuangan

```text
Implementasikan Fase 11 sesuai docs/DESIGN-PHASE-8-BILLING-AND-BEYOND.md §5.
Prasyarat: Fase 8–10 selesai.

Model baru: Account (CoA), JournalEntry, JournalLine, PostingRule.

Aturan bisnis wajib:
- Jurnal bersifat APPEND-ONLY. Koreksi = jurnal balik. Tidak ada edit, tidak ada delete.
- Total debit HARUS sama dengan total kredit — validasi di level transaksi database, bukan hanya di UI.
- Pemetaan peristiwa → akun lewat tabel PostingRule, JANGAN hardcode kode akun di kode program.
- Cashbook yang sudah ada dijembatani ke Account lewat Account.cashbookId.
  Modul kas Fase 4 tidak boleh dibongkar — cukup ikut memposting jurnal.
- Semua laporan adalah QUERY DI ATAS JURNAL. Dilarang menyimpan saldo terhitung
  sebagai kolom yang bisa menyimpang dari jurnal.

Posting rule minimal (lihat tabel di §5 dokumen rancangan):
- Invoice diposting        → D: Piutang Usaha        K: Pendapatan + PPN Keluaran
- Pembayaran tunai/bank    → D: Kas/Bank             K: Piutang Usaha
- Pembayaran via mitra     → D: Kas Mitra            K: Piutang Usaha
- Komisi mitra diakui      → D: Beban Fee            K: Hutang Fee (mitra)
- Komisi dibayarkan        → D: Hutang Fee           K: Kas/Bank
- Pembayaran via gateway   → D: Kas/Bank + Beban Biaya Gateway   K: Piutang Usaha

Laporan yang dibangun:
buku besar, neraca saldo (saldo awal / pergerakan / saldo akhir), neraca, laba rugi,
arus kas (metode langsung DAN tidak langsung), perubahan modal, kas & bank,
rasio keuangan (current, quick, cash, DER, DAR, GPM, NPM, ROA, ROE,
perputaran piutang, perputaran persediaan), jurnal manual multi-baris dengan pihak terkait.

Definition of done:
- Neraca seimbang untuk seluruh rentang data uji
- Invoice & pembayaran otomatis menghasilkan jurnal yang benar
- Jurnal manual menolak input yang tidak seimbang
- Laba rugi dan arus kas konsisten dengan jurnal (uji silang)
```

---

## Prompt Fase 12 — Helpdesk Pelanggan & Dispatch

```text
Implementasikan Fase 12 sesuai docs/DESIGN-PHASE-8-BILLING-AND-BEYOND.md §6.

Model baru: TicketCategory, WorkflowTemplate, WorkflowStep, CustomerTicket,
TicketMember, TicketStepProgress, TicketPause.

Catatan penting: ini helpdesk PELANGGAN, terpisah dari ItTicket (internal IT) dan
Incident (gangguan NOC). Jangan digabung, tapi sediakan relasi bila satu tiket
pelanggan ternyata berakar pada satu incident NOC.

Aturan bisnis wajib:
- MTTR dihitung BERSIH dari durasi pause. Ini keunggulan atas sistem lama — jangan disederhanakan.
- SLA per kategori; tandai slaBreached saat terlampaui.
- Tiket bisa punya sub-tiket (parentId) dan banyak anggota selain assignee utama.
- Tiket tersambung ke WorkOrder supaya pemakaian material dari gudang ikut tercatat.
- Workflow per kategori memakai WorkflowTemplate yang bisa dikonfigurasi, bukan status hardcode.
- Notifikasi ke pelanggan multi-kanal, memakai preferensi kanal pelanggan.

Yang dibangun:
- Halaman: /support/tickets (+ new, [id]), /support/tickets/report (analitik MTTR & SLA
  per kategori dan per agen, resolution rate, ranking pelanggan dengan tiket terbanyak),
  /settings/master/ticket-categories, /settings/workflows
- Dispatch board /support/schedule: view di atas CustomerTicket + WorkOrder terjadwal hari ini,
  dikelompokkan per teknisi, mode tampilan layar besar (auto-refresh). Tidak perlu model baru.

Definition of done:
- MTTR benar saat tiket dijeda berkali-kali
- Workflow step bisa dikonfigurasi tanpa ubah kode
- Dispatch board menampilkan jadwal hari ini secara akurat
```

---

## Prompt Fase 13 — FTTH Port Management & Monitoring

```text
Implementasikan Fase 13 sesuai docs/DESIGN-PHASE-8-BILLING-AND-BEYOND.md §7.

Model baru: OltDevice, PonPort, Odp, OdpPort, ProbeTarget, PppoeSession.
Perluas model NOC yang sudah ada (NetworkSite, NetworkDevice) — jangan bikin hierarki paralel.

Aturan bisnis wajib:
- Rantai lengkap: OLT → PonPort → Odp → Odp anak → OdpPort → Subscription.
- OdpPort adalah sumber kebenaran okupansi. Odp.portUsed adalah TURUNAN, bukan angka
  yang diedit manual. Sistem lama salah di sini — jangan diulang.
- Satu OdpPort maksimal satu subscription aktif.
- Kredensial OLT/router JANGAN plaintext. Pakai referensi secret store atau enkripsi kolom.
- Monitoring bersifat read-only terhadap perangkat. Tidak ada aksi tulis dari halaman monitor.

Yang dibangun:
- Halaman: /noc/olt, /noc/odp (+ detail dengan denah port), /noc/odp/map (peta,
  import/export KML), /noc/pppoe-monitor, /noc/probe (monitoring realtime)
- Tools: /tools/ip-calculator, /tools/mac-vendor, /tools/burst-calculator
- Validasi saat aktivasi langganan: cek ketersediaan port ODP sebelum aktivasi

Definition of done:
- Bisa menelusuri dari pelanggan sampai port ODP dan port PON yang dipakainya
- portUsed selalu konsisten dengan jumlah OdpPort berstatus USED
- Aktivasi langganan ditolak bila port ODP penuh
```

---

## Prompt Fase 14 — HRD & Absensi

```text
Implementasikan Fase 14 sesuai docs/DESIGN-PHASE-8-BILLING-AND-BEYOND.md §8.

Model baru: Employee, AttendanceLocation, Shift, ShiftSchedule, Attendance,
LeaveRequest, OvertimeRequest.

Aturan bisnis wajib:
- Izin/cuti dan lembur memakai ApprovalRule engine yang SUDAH ADA (berjenjang:
  atasan → HRD). Jangan bikin mekanisme approve sendiri — ini keunggulan kita atas sistem lama.
- Clock in/out wajib validasi geofence: hitung jarak ke AttendanceLocation, simpan jaraknya.
- Foto selfie wajib, disimpan lewat model Attachment yang sudah ada.
- Attendance unik per (employee, date). Keterlambatan dihitung dari toleransi shift.
- Data absensi yang sudah dikunci per periode tidak bisa diedit — koreksi lewat penyesuaian bercatat.

Yang dibangun:
- Halaman: /hr/dashboard, /hr/employees, /hr/locations, /hr/shifts, /hr/schedule (grid
  karyawan × tanggal), /hr/attendance/daily, /hr/attendance/report (rekap + export),
  /hr/leave, /hr/overtime, /hr/my-attendance (self-service clock in/out + selfie),
  /hr/my-requests, /hr/my-team (approval atasan)

Privasi — wajib:
- Foto selfie dan data lokasi karyawan adalah data pribadi. Terapkan kebijakan retensi
  dari docs/DECISIONS-PHASE-8.md, batasi akses lewat permission, dan catat setiap akses
  ke data ini di audit log.

Definition of done:
- Clock in di luar radius ditolak dengan pesan jelas
- Approval izin berjenjang berjalan sesuai matrix
- Rekap bulanan cocok dengan absensi harian
```

---

## Prompt Fase 15 — Kanal Pelanggan (WA, App, Promo)

```text
Implementasikan Fase 15 sesuai docs/DESIGN-PHASE-8-BILLING-AND-BEYOND.md §9.

Yang dibangun:
- Perluas Notification: channel (IN_APP|EMAIL|WHATSAPP|PUSH) + preferensi kanal per pelanggan
- WA Gateway sebagai adapter Integration (BUKAN modul terpisah): template pesan,
  antrian kirim, status terkirim/gagal, rate limit, retry
- Model Announcement (promo/pengumuman): judul, badge, periode tayang, status
- Portal pelanggan: lihat tagihan, riwayat pembayaran, bayar via gateway, buat tiket,
  lihat status gangguan (sambungkan ke modul Outage yang sudah ada)

Aturan bisnis wajib — pengiriman massal itu tidak bisa dibatalkan:
- WAJIB ada preview penerima + jumlahnya sebelum kirim, dan konfirmasi eksplisit.
- WAJIB ada mode uji ke nomor terbatas sebelum blast.
- WAJIB hormati preferensi kanal pelanggan; pelanggan yang memilih None tidak dikirimi.
- Rate limit dan kill switch wajib ada sejak awal, bukan ditambahkan belakangan.
- Setiap pengiriman tercatat: siapa yang memicu, template apa, ke berapa penerima, hasilnya apa.

Definition of done:
- Blast tidak bisa dijalankan tanpa preview + konfirmasi
- Pelanggan dengan preferensi None tidak pernah menerima pesan
- Kegagalan kirim terlihat dan bisa diulang per penerima
```

---

## Prompt Pelengkap — Migrasi Data

```text
Bangun perkakas migrasi dari PERUMNET Helpdesk System v2.0.1 ke PerumNet CRM,
mengikuti pemetaan di docs/DESIGN-PHASE-8-BILLING-AND-BEYOND.md §10.

Penting: ekstraksi data dari sistem lama dikerjakan oleh tim PerumNet, bukan oleh kamu.
Kamu membangun sisi IMPOR-nya saja: parser file (CSV/JSON), validator, dan importer.

Aturan:
- Urutan impor wajib: master (akun, paket, merchant, site/OLT/ODP) → pelanggan & langganan
  → invoice → pembayaran → jurnal pembuka → historis (tiket, absensi).
- Setiap baris sumber dipetakan ke satu ID tujuan dan disimpan di tabel pemetaan,
  supaya impor bisa diulang tanpa duplikat dan bisa ditelusuri balik.
- Satu baris pelanggan sistem lama menjadi Customer + Subscription + BillingProfile.
- Saldo awal masuk lewat SATU jurnal pembuka, bukan diinjeksi ke kolom saldo.
- Password PPPoE dan kredensial perangkat jangan dipindahkan sebagai plaintext.
- Mode dry-run wajib: laporkan berapa baris valid, berapa ditolak, dan alasannya,
  tanpa menulis apapun ke database.
- Sediakan laporan rekonsiliasi: jumlah pelanggan, total piutang, dan saldo kas
  di sistem lama vs hasil impor. Selisih apapun harus dijelaskan sebelum go-live.
```

---

## Catatan

Prompt di atas sengaja menyebut aturan bisnis secara eksplisit karena itulah bagian yang
paling sering hilang saat implementasi berjalan cepat. Kalau ada prompt yang terasa
terlalu ketat untuk kondisi lapangan, ubah **dokumen rancangannya dulu**, baru prompt-nya —
jangan melonggarkan aturan diam-diam di tengah implementasi.

Tiga hal yang paling berisiko dan paling perlu diuji serius: **generator invoice** (salah
sedikit, 1.500 pelanggan salah tagih), **eksekusi isolir** (salah sedikit, pelanggan yang
sudah bayar ikut terputus), dan **blast WhatsApp** (tidak ada tombol undo).
