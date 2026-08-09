# Feature Gap Analysis — PERUMNET Helpdesk System v2.0.1 vs PerumNet CRM

**Tanggal:** 2026-08-10
**Sistem pembanding:** PERUMNET Helpdesk System v2.0.1 (Laravel, vendor "lubax"), sistem produksi pihak lain
**Sistem kita:** PerumNet-CRM (Next.js + Prisma, 60 model, branch `feat/phase-2-sales-crm`)

## 1. Metode & Batasan

Eksplorasi dilakukan **read-only**: hanya HTTP GET untuk membaca struktur halaman (judul, kolom tabel, label field, nama input, opsi dropdown, tombol). Tidak ada form yang di-submit, tidak ada create/edit/delete, tidak ada export/download, tidak ada trigger job.

**Data pribadi tidak dicatat.** Dokumen ini hanya berisi *struktur* — nama field, enum, dan alur. Nama pelanggan, alamat, nomor telepon, dan nama karyawan tidak dimasukkan.

**Route yang sengaja tidak dibuka** karena berisiko mengeksekusi aksi nyata:

| Route | Alasan |
|---|---|
| `/invoice/createinv` (Mounthly Invoice) | berpotensi generate tagihan massal |
| `/suminvoice/notification` (Jobs) | berpotensi kirim notifikasi ke pelanggan |
| `/wa/dashboard` | gateway WhatsApp |
| `/mikrotik-sync` | sinkronisasi ke router produksi |
| `/file/backup` | memicu proses backup |
| `/customer/trash` | berisi aksi restore/hapus permanen |

Konsekuensinya: detail internal enam fitur di atas **belum terverifikasi**, hanya disimpulkan dari nama menu dan konteks sekitarnya. Ditandai *(belum diverifikasi)* di bawah.

**Catatan hak cipta:** dokumen ini memetakan *kapabilitas fungsional*, bukan menyalin kode, markup, atau aset sistem tersebut. Implementasi di sisi kita harus ditulis sendiri.

## 2. Profil Sistem Target

- Stack: Laravel (blade + jQuery/DataTables + AdminLTE-like), v2.0.1, © 2024
- Skala operasional saat diamati: ~1.650 pelanggan (1.517 aktif, 108 blokir, 27 tidak aktif, 2 potensial), 1.051 invoice pending, 27 karyawan
- Struktur bisnis: **4 merchant/branch**, sebagian dikelola mitra BUMDES yang juga bertindak sebagai kolektor pembayaran dan sales
- Infrastruktur: 5 site/POP, 6 OLT (ZTE C300/C600, HSGQ), ODP berjenjang, PPPoE via MikroTik
- 20 grup menu, ~70 route

## 3. Peta Fitur Sistem Target

### 3.1 Customer
- List dengan filter: merchant, status, plan, tag/area; pencarian per-field (Name, Customer ID, Email, Address, Phone, ID Card, Billing Start, Isolir Date)
- Export: Copy / Excel / PDF / CSV / Print
- Kolom: Customer ID, Name, Address, Merchant, Plan, **Billing Start**, **Isolir Date**, Status, Invoice, Notif, App
- Status: `Potensial | Active | Inactive | Block | Company_Properti`
- Statistik inline: distribusi per plan, per status, new & deleted bulan ini
- Soft delete + Trash *(belum diverifikasi)*

**Field pelanggan (dari form Add New Customer):**

| Kelompok | Field |
|---|---|
| Identitas | `name`, `customer_id` (CID, ada opsi "Tanpa Rescode"), `contact_name`, `id_card` (KTP), `npwp`, `date_of_birth`, `phone`, `email` |
| Komersial | `id_status`, `id_plan`, `addons[]` (multi, dengan total harga live), `tax` (PPN %), `billing_start`, `isolir_date` (tanggal 00–28), `id_merchant`, `id_sale` |
| Teknis | `pppoe` (user), `password` (PPPoE), `id_olt`, `id_distpoint` (ODP), `id_distrouter` |
| Lokasi | `address`, `coordinate` (+ "Get From Maps" / "Current Location") |
| Notifikasi | `notification`: `None | Whatsapp | Email | Mobile App` |
| Lead/CRM | `lead_source` (WhatsApp, Phone Call, Email, Walk-in, Referral, Social Media, Website, Other), `expected_close_date`, `conversion_probability` (%), `lead_notes` |
| Lain | `note` |

Catatan penting: **satu record pelanggan = satu langganan**. Tidak ada entitas subscription terpisah — plan, PPPoE, ODP, dan tanggal isolir menempel langsung di pelanggan.

### 3.2 Billing & Invoice
- **Invoice List** — kolom: Invoice Date, Invoice No, CID, Billing Start, Name, Plan, Merchant, Address, Period, Due Date, **Tax**, Total Amount, Status, **Received By**, Transaction Date
- Filter: rentang tanggal invoice, merchant, plan, status (`Unpaid | Paid | Cancel`), tipe invoice (`Monthly Fee`), rentang tanggal pembayaran, penerima pembayaran
- **Customer Bill / Unpaid** — daftar pelanggan menunggak, dengan filter **jumlah invoice tertunggak (1–13+)** dan opsi menampilkan pelanggan terminated → ini basis aging & penentuan isolir
- **Payment / Transaction List** — rekap per penerima (amount, fee, payment), per **kas bank**, per merchant; kolom detail termasuk `Payment Fee`, `Selisih`, `Kasbank`, `Received By`
- **Bundle Payment Tracking** — pembayaran gabungan multi-invoice via payment gateway: Bundle Ref, Gateway, Status (`Pending | Paid | Expired/Canceled`), Total, Paid, **Payment URL**
- Gateway terintegrasi: **Winpay, Winpay2, Duitku, Duitku2, Tripay**
- Kas bank: multi-akun (bank BNI/BRI/BPD/BCA/Mandiri + kas per mitra BUMDES/UD)
- **Monthly Invoice generator** *(belum diverifikasi)* — pembuatan tagihan bulanan massal
- **Jobs / notification** *(belum diverifikasi)* — job pengiriman notifikasi tagihan

### 3.3 Akuntansi (double-entry penuh)
- **Chart of Accounts** — `akun_code`, `name`, `group`, `category`, **parent akun** (berjenjang), flag **akun pajak** + `tax_value`
- Kategori akun: Kas & Bank, Akun Piutang, Persediaan, Aktiva Lancar Lainnya, Aktiva Tetap, Depresiasi & Amortisasi, Aktiva Lainnya, Akun Hutang, Kewajiban Lancar Lainnya, Kewajiban Jangka Panjang, Ekuitas, Pendapatan, Pendapatan Lainnya
- **Jurnal Umum** (Date, Akun, Debet, Kredit) + General Transaction
- Laporan: **Buku Besar, Neraca Saldo, Neraca, Laba Rugi, Arus Kas, Perubahan Modal, Rasio Keuangan, Kas & Bank**
- **Contact** — master relasi non-pelanggan (Contact Id, Name, Type, Phone, Email, Address, Note)

### 3.4 Ticket / Helpdesk
- Kolom: Schedule, Ticket ID, Customer, Address, Merchant, Status, Category, Title, Tags, Created By, **Assign To**, Created At, Closed At, **Progress**, **MTTR**
- Status: `Open | Inprogress | Pending | Solve | Close`
- Kategori (16+): Router Problem, Weak Signal, Fiber Problem, Interference, Upstream Problem, Internal Maintenance, Billing, Information, New Client Installation, Change Wifi Password, Additional Installation, Device Relocation, Take Down, Relay Problem, Looping, Customer Terminate, Customer Relocation, C-Data Problem, CCTV Maintenance, Complaint Non-Teknis, Installation Problem, Development
- Tags: Follow Up, Project In House, NOC, Pasang Baru FO, Migrasi, Paralel, CCTV, Pasang Baru Wireless, Kabel Los, Troubleshoot, Outage, Ganti Password
- **Workflow per kategori** — tiap kategori tiket punya template workflow; detail tiket punya panel "Workflow Progress" dengan aksi **Mulai Workflow** dan step bernama
- **Sub-tiket**, **multi-member** (`assign_to` + `member[]`), **Hentikan Sementara** dengan alasan wajib
- **Kirim Notifikasi** ke pelanggan multi-channel: WhatsApp / Email / App (offline), dengan pesan opsional
- Tiket menyimpan `coordinate` dan `device_type`
- Group ticket, Ticket Report, master Ticket Category

### 3.5 Job Schedule / Dispatch
- **TV Wall** — papan tampil jadwal harian untuk ruang operasional
- List jadwal dengan filter status/kategori/tag
- Dashboard menampilkan jadwal per teknisi + progress harian per engineer

### 3.6 Jaringan / FTTH
- **Sites** (POP) — Name, Location, Description
- **ODP / Distribution Point** — Name, **Port Capacity**, **Port Used**, **Optic Power**, Site, **Parent** (berjenjang), **Group**, Description; ada master "Dist Group"
- **OLT** — Name, Vendor, Type, IP Address, **Telnet Port**, **RO Community**, **RW Community**, **SNMP Port**
- **Distribution Router** — monitor auto-refresh 60 detik, "Detail Users"
- **MikroTik Sync** *(belum diverifikasi)*
- **PPPoE Monitor** — Total / Aktif / Offline / Disable, auto-refresh 180 detik, router list
- **PPPoE Offline Map** — peta sebaran pelanggan offline
- **Network Monitor (probe)** — monitoring realtime, filter All/Offline/Down/Online, **alarm suara**, fullscreen, log, setup MikroTik
- **Map** — peta ODP / distribution point

### 3.7 Sales & Marketing
- **Sales** — master sales sebagai entitas terpisah dari user (Name, Email, **Sales Type**, Phone, Address); termasuk mitra BUMDES
- **Lead Summary & Pipeline** — performa per sales (Total, In Progress, Sukses, Gagal, **Conv. Rate**, breakdown), daftar lead dengan **Step Sekarang** + **Progress Workflow**, **peta koordinat lead potensial**
- **Template Workflow Lead** — step pipeline yang bisa dikonfigurasi (nama step, keterangan, urutan, preview stepper)
- **Promo & Pengumuman App** — konten promo untuk aplikasi pelanggan (Judul, Badge, Tanggal, Status)
- **Add-on Services** — layanan tambahan berbayar di luar plan

### 3.8 HRD / Absensi
- **Dashboard HRD** — tren kehadiran 14 hari (hadir/terlambat/absen), izin-cuti, pengajuan terbaru, "belum absen hari ini"
- **Karyawan** — Nama, Jabatan, **NIK/Employee ID**, **Supervisor** (hierarki), Join Date, Status
- **Lokasi Absen** — geofence titik absensi
- **Shift** — Jam Masuk, Jam Keluar, **Toleransi Terlambat**
- **Jadwal Shift**, **Absen Harian**, **Rekap Bulanan**
- **Izin / Cuti / Sakit** — jenis (Cuti, Sakit, Izin Lainnya), lampiran, approval (`Menunggu | Disetujui | Ditolak`), diproses oleh, catatan
- **Lembur** — jam mulai/selesai, durasi, alasan, approval
- Self-service: My Team, Pengajuan Saya, Absen & Jadwal Saya

### 3.9 Admin & Tools
- User Management (Privilege, Job Title, **Tiket Group**, **Bank Akun**), System Status, Application Logs
- WA Gateway *(belum diverifikasi)*, Backup Files *(belum diverifikasi)*
- Tools: **IP Calculator**, **MAC Vendor lookup**, **MikroTik Burst Calculator**

## 4. Gap Analysis

Legenda: ✅ sudah ada · 🟡 sebagian / beda bentuk · ❌ belum ada

### 4.1 Gap besar — belum ada sama sekali di CRM kita

| # | Fitur | Kondisi kita | Dampak |
|---|---|---|---|
| G1 | **Invoice & tagihan pelanggan** | ❌ tidak ada model `Invoice` | Tanpa ini CRM tidak bisa menggantikan sistem lama. Perlu: Invoice, InvoiceLine, periode, due date, PPN, status, nomor invoice |
| G2 | **Pembayaran & payment gateway** | ❌ | Perlu: Payment, mapping ke kas bank, payment fee, selisih, `received_by`, bundle payment multi-invoice, integrasi Winpay/Duitku/Tripay, payment URL & callback |
| G3 | **Isolir otomatis** | ❌ | `isolir_date` per pelanggan + aging tunggakan → suspend/blokir otomatis. Ini inti operasional ISP prabayar/pascabayar |
| G4 | **Generator tagihan bulanan** | ❌ | Batch job invoice bulanan untuk ~1.500 pelanggan |
| G5 | **Aging piutang** | ❌ | Daftar penunggak + jumlah bulan tertunggak (1–13+) |
| G6 | **Akuntansi double-entry** | 🟡 hanya kas (`Cashbook`, `CashTransaction`, `CashClosing`) | Perlu: CoA berjenjang, jurnal debet/kredit, buku besar, neraca saldo, neraca, laba rugi, arus kas, perubahan modal, rasio |
| G7 | **HRD & Absensi** | ❌ seluruh modul | Karyawan, supervisor, shift, jadwal, absen geofence, rekap, izin/cuti/sakit, lembur, approval |
| G8 | **Integrasi MikroTik / PPPoE** | 🟡 hanya field `pppoeUsername` di `Subscription` | Sync user PPPoE, enable/disable (isolir), monitor sesi aktif/offline, peta offline |
| G9 | **Monitoring jaringan realtime** | 🟡 ada `NetworkAlarm` tapi tanpa probe | Probe ping realtime, status online/down/offline, alarm suara, log |
| G10 | **Manajemen port ODP/OLT** | 🟡 ada `NetworkSite/Device/Link`, tanpa kapasitas port | Port capacity/used, optic power, hierarki parent ODP, OLT dengan SNMP/telnet |
| G11 | **WhatsApp gateway** | 🟡 ada `Integration` generik | Blast & notifikasi tagihan/tiket via WA |
| G12 | **Aplikasi pelanggan (mobile/portal)** | ❌ | Kolom "APP" di pelanggan, notif via Mobile App, promo & pengumuman ke app |
| G13 | **Add-on services** | ❌ | Layanan tambahan berbayar di atas paket, multi-select dengan total harga |
| G14 | **Merchant / branch + kolektor mitra** | 🟡 ada `Division`/`Area` | Merchant sebagai unit revenue, mitra BUMDES sebagai kolektor & sales, bagi hasil |
| G15 | **Job Schedule board / TV Wall** | 🟡 ada `WorkOrder` tanpa papan jadwal | Papan dispatch harian untuk ruang operasional |
| G16 | **Helpdesk pelanggan** | 🟡 `ItTicket` (internal IT) + `Incident` (NOC) | Tiket pelanggan dengan MTTR, workflow per kategori, sub-tiket, multi-member, pause beralasan, notifikasi ke pelanggan |
| G17 | **Workflow yang dapat dikonfigurasi** | ❌ | Template workflow untuk kategori tiket & untuk pipeline lead |
| G18 | **Sales sebagai master terpisah** | 🟡 `salesOwner` selalu `User` | Sales eksternal/mitra yang bukan user sistem |
| G19 | **Soft delete + Trash** | ❌ | Restore pelanggan terhapus |
| G20 | **Master Contact non-pelanggan** | ❌ | Vendor, mitra, kontak umum |
| G21 | **Tools teknis** | 🟡 IPAM lebih kuat, tapi tanpa kalkulator | IP calculator, MAC vendor, burst calculator |
| G22 | **Export tabel (Excel/PDF/CSV/Print)** | ❌ | Ada di hampir semua list mereka |
| G23 | **Data pajak & identitas** | ❌ | NPWP, KTP, PPN per pelanggan, akun pajak |

### 4.2 Kita sudah setara atau lebih baik

| Area | Milik kita |
|---|---|
| Approval | `ApprovalRule` / `ApprovalRequest` / `ApprovalStep` multi-level — mereka hanya approve sederhana di izin/lembur |
| Audit | `AuditLog` terstruktur — mereka hanya application log |
| Inventory | Warehouse, stock level, custody, opname, serialized device + movement, material usage — **tidak ada padanannya di sistem mereka** |
| Project | `Project` + `ProjectBomLine` — tidak ada di mereka |
| NOC | IPAM (`Subnet`/`IPAddress`), incident lifecycle + update + dampak pelanggan, maintenance, change request — jauh lebih matang |
| IT/DevOps | Server, application, deployment, backup record, access request, IT asset — tidak ada di mereka |
| Sales formal | Quotation & Survey sebagai entitas — mereka hanya field di pelanggan |
| RBAC | Role/Permission granular — mereka hanya "Privilege" |
| Integrasi | Framework `Integration` + webhook + `IntegrationEvent` |
| Model langganan | `Subscription` terpisah dari `Customer` — **lebih benar** daripada model mereka yang menempel jadi satu |

### 4.3 Perbedaan arsitektur yang penting untuk migrasi

1. **1 pelanggan = 1 langganan** di sistem mereka; kita memisahkan `Customer` dan `Subscription`. Saat migrasi, tiap record pelanggan mereka menjadi 1 `Customer` + 1 `Subscription`.
2. **Plan mereka = `Package` kita**, tapi plan mereka tidak menyimpan speed terstruktur (hanya kolom "Speed" bebas), sedangkan kita punya `downloadMbps`/`uploadMbps`.
3. **`isolir_date` adalah tanggal dalam bulan (00–28)**, bukan tanggal penuh — setara `billingCycleDay` kita, tapi dipakai untuk pemutusan, bukan penagihan.
4. **Kas bank mereka bercampur dengan akun akuntansi**; `Cashbook` kita berdiri sendiri dan perlu dijembatani ke CoA saat modul akuntansi dibangun.
5. **Merchant** mereka adalah unit bisnis + kolektor sekaligus; di kita perlu diputuskan apakah dipetakan ke `Division`, `Area`, atau entitas `Merchant` baru.

## 5. Rekomendasi Prioritas

**P0 — Tanpa ini CRM tidak bisa menggantikan sistem lama**
G1 Invoice · G2 Payment & gateway · G4 Generator bulanan · G5 Aging · G3 Isolir

**P1 — Inti operasional ISP**
G8 MikroTik/PPPoE sync · G10 Port ODP/OLT · G9 Monitoring realtime · G16 Helpdesk pelanggan · G15 Job schedule board

**P2 — Kelengkapan bisnis**
G6 Akuntansi double-entry · G7 HRD/Absensi · G11 WA gateway · G14 Merchant/kolektor · G13 Add-on

**P3 — Nilai tambah**
G12 App pelanggan · G17 Workflow konfigurabel · G18 Sales master · G19 Trash · G20 Contact · G21 Tools · G22 Export · G23 Pajak

## 6. Yang Belum Tereksplorasi

- Enam route terkunci di bagian 1 — perlu keputusan apakah aman dibuka
- Halaman detail pelanggan & detail invoice — sengaja tidak dibuka untuk menghindari membaca data pribadi
- Perilaku dinamis: apa yang terjadi saat invoice dibayar, bagaimana isolir dieksekusi, isi payload webhook gateway
- Struktur database sebenarnya — semua di sini disimpulkan dari lapisan UI

## 7. Pemetaan Lengkap (Ronde 2)

### 7.1 Chart of Accounts — terhubung ke operasional
Penomoran akun bergaya Accurate/Zahir: `1-10000 Kas Tunai` dengan anak `↳ 1-10040 COH Kecicang`, `↳ 1-10041 COH Abang`, dst. Akun yang teramati relevan: `1-10100 Piutang Usaha`, `4-40000 Pendapatan`, `2-20500 PPN Keluaran`, `2-20101 Hutang Fee`, `2-201011 Hutang <mitra>`, serta akun bank/kas per cabang & mitra.

**Ini temuan terpenting:** akuntansi bukan modul terpisah, tapi terjahit ke master data —
- **Merchant** punya `akun_code` (akun kas) + `hutang_akun_code` (**akun hutang fee**) + flag `payment_point`
- **User/kasir** punya `admin_fee`, `akuns[]` (bank akun yang boleh dipakai), dan `hutang_akun_code` (akun hutang fee kasir)

Artinya: pembayaran yang diterima kolektor/mitra otomatis membentuk **hutang fee** (komisi) sebagai liabilitas. Bagi hasil dengan BUMDES terbukukan langsung di GL, bukan dihitung manual.

### 7.2 Laporan Keuangan
| Laporan | Detail |
|---|---|
| Buku Besar | filter rentang tanggal + per akun (dropdown hierarkis) |
| Neraca Saldo | Saldo Awal / Pergerakan / Saldo Akhir (debit-kredit) + kolom Balance; export Excel & PDF |
| Neraca | per tanggal akhir |
| Laba Rugi | per periode |
| Arus Kas | **metode Langsung & Tidak Langsung** |
| Perubahan Modal | per periode |
| Rasio Keuangan | Snapshot: Current, Quick, Cash Ratio, DER, DAR · Kinerja: GPM, NPM, ROA, ROE, Perputaran Piutang, Perputaran Persediaan — masing-masing dengan indikator status |
| Kas & Bank | komposisi + grafik per akun + detail transaksi |
| Transaksi General | entri jurnal manual multi-baris, dengan **pihak terkait** (Contact/Customer/Employee), memo, indikator TOTAL & SELISIH |

### 7.3 Ticket Analytics
Laporan tiket berisi: per kategori (jumlah resolved, **Avg/Min/Max MTTR**, **SLA**), per agen (total assigned, resolved, **resolution rate**, avg MTTR), dan ranking pelanggan dengan tiket terbanyak. Ini bukan sekadar list — ada pengukuran kinerja layanan.

### 7.4 Master Jaringan (struktur field)
- **OLT**: `name`, `vendor` (ZTE, CDATA, HSGQ, Huawei, Fiberhome, VSOL, HIOSO), `type`, `ip`, telnet `port`/`user`/`password`, `community_ro`, `community_rw`, `snmp_port`
- **Distribution Point (ODP)**: `name`, `id_site`, `capacity`, `optic power`, `distpointgroup_id`, `parrent`, `coordinate`, `description`. **Dist Group = port PON pada OLT** (contoh: "OLT ZTE C300 Pesagi 1/2/1") — jadi ada rantai OLT → PON port → ODP → ODP anak → pelanggan
- **Site**: `name`, `location`, `coordinate`, `description`
- **Distribution Router**: `name`, `ip`, **`port` (API MikroTik)**, `web`, `user`, `password`, `note`
- **ODP Map**: peta dengan pewarnaan per group, **Import KML/KMZ** dan **Export KML**

### 7.5 Master Orang & Mitra
- **Sales**: entitas terpisah dengan login sendiri (`email`, `password`), `sale_type` (Full Time / Part Time / Fixed-Term Contract), join date, foto
- **User/Employee**: `job_title` (Network Engineer, NOC, Inventory, Accounting, Marketing, HRD, GA, Vendor), `privilege` (User, Admin, HRD, Management, Accounting, Marketing, Payment, NOC), `employee_type` (+ Probation), `groups[]` tiket (Management, NOC, Marketing, Accounting, Payment, Teknisi, Merchant, HRD), `supervisor_id`, `dashboard_preference`
- **Contact**: sebenarnya master **Supplier/Vendor** (`contact_id`, `category`: Supplier/Vendor/Other)

### 7.6 Absensi — detail operasional
- **Lokasi Absen**: koordinat + **radius geofence** + hitungan absen tercatat + peta
- **Absensi Harian**: Clock In/Out, **Terlambat**, **Lokasi In**, **Jarak** (dari titik geofence), **Foto In / Foto Out**
- **Self-service** (`/my-attendance`): Clock In/Out mandiri dengan **selfie wajib** + permintaan lokasi, kalender absensi, jadwal shift, cuti & lembur disetujui
- **Jadwal Shift**: grid karyawan × tanggal sebulan penuh, dengan tipe hari & catatan
- **Rekap Bulanan**: absensi, terlambat, cuti, sakit, libur, tanpa keterangan, **total jam kerja**, kalender per karyawan, export
- **My Team**: supervisor melihat anggota tim + pending izin/lembur yang perlu approval

### 7.7 Dashboard & Status
- **TV Wall** (`/schedule`): papan tiket harian untuk layar ruang operasional
- **System Status**: ringkasan tiket, keuangan, pelanggan, absensi hari ini, approval pending, HRD bulan ini, status **WhatsApp Gateway**, status **Payment Gateway (aktif/non-aktif per gateway)**, users per privilege, infrastruktur jaringan, dan **Mikrotik Sync Failures** — jadi kegagalan sync memang dilacak sebagai state
- **My Transaction**: kasir/kolektor melihat rekap penerimaannya sendiri (Payment Point, Tax %, Amount, Status)
