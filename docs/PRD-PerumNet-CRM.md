# PRODUCT REQUIREMENTS DOCUMENT

## PerumNet ISP CRM & Operations Management System

**Nama Produk:** PerumNet CRM  
**Versi Dokumen:** 1.2  
**Status:** Draft Terintegrasi  
**Platform:** Web Application dan Progressive Web App  
**Pemilik Produk:** PerumNet  

**Target Pengguna:**

- Management.
- Super Admin.
- Marketing.
- Sales.
- Customer Service.
- Finance.
- Warehouse.
- Operational.
- Technician.
- Project.
- Network Operation Center.
- IT/DevOps.

---

# 1. Ringkasan Produk

PerumNet CRM adalah aplikasi terintegrasi yang dirancang khusus untuk kebutuhan perusahaan Internet Service Provider.

Sistem tidak hanya berfungsi sebagai CRM pelanggan, tetapi juga menjadi pusat pengelolaan:

- Marketing campaign.
- Lead dan calon pelanggan.
- Sales pipeline.
- Survey jaringan.
- Quotation dan sales order.
- Pelanggan dan layanan internet.
- Work order instalasi dan maintenance.
- Stock dan perangkat jaringan.
- Perangkat yang dibawa teknisi.
- Perangkat yang terpasang di pelanggan.
- Inventory proyek.
- Infrastruktur jaringan ISP.
- POP, ODP, ODC, backbone, tower, dan perangkat aktif.
- Network monitoring.
- Incident dan outage management.
- Maintenance jaringan.
- IP address management.
- Change management.
- Server dan aplikasi internal.
- Deployment aplikasi.
- Backup dan disaster recovery.
- Petty cash.
- Reimbursement.
- Cash advance.
- Purchase dan supplier.
- Approval.
- Reporting.
- Audit trail.

Sistem harus menerapkan prosedur ketat sehingga setiap perangkat, transaksi, pekerjaan, perubahan jaringan, dan aktivitas pengguna memiliki:

- Tujuan.
- Penanggung jawab.
- Lokasi.
- Referensi.
- Status.
- Bukti.
- Approval.
- Riwayat perubahan.
- Audit trail.

Stock, saldo keuangan, status layanan, konfigurasi jaringan, dan status infrastruktur tidak boleh diubah tanpa transaksi atau workflow resmi.

---

# 2. Latar Belakang

## 2.1 Permasalahan Stock dan Perangkat

Permasalahan utama:

- Jumlah stock sistem berbeda dengan stock fisik.
- Modem atau ONT keluar tanpa tujuan jelas.
- Perangkat dibawa teknisi tanpa pencatatan.
- Perangkat dipasang di pelanggan tetapi tidak terhubung dengan data pelanggan.
- Perangkat digunakan untuk proyek tanpa referensi proyek.
- Barang rusak, hilang, atau dikembalikan tanpa status jelas.
- Tidak diketahui siapa yang terakhir memegang perangkat.
- Serial number dan MAC address tidak tercatat konsisten.
- Work order selesai tetapi barang sisa belum dikembalikan.
- Proyek selesai tetapi material belum direkonsiliasi.
- Stock dapat diedit manual tanpa jejak transaksi.

## 2.2 Permasalahan Petty Cash

Permasalahan utama:

- Pengeluaran tidak memiliki bukti.
- Pengeluaran tidak memiliki kategori dan cost center.
- Pengeluaran Sales, Marketing, Project, NOC, dan Operational bercampur.
- Reimbursement bercampur dengan pengeluaran langsung.
- Uang muka tidak diselesaikan tepat waktu.
- Saldo sistem berbeda dengan uang tunai fisik.
- Tidak diketahui penerima dan tujuan dana.
- Approval tidak konsisten.
- Transaksi dapat diubah tanpa audit.
- Sulit mengetahui biaya aktual per pelanggan, pekerjaan, proyek, atau gangguan.

## 2.3 Permasalahan Sales dan CRM

Permasalahan utama:

- Lead tidak memiliki Sales owner.
- Follow-up tidak tercatat.
- Lead terlambat ditindaklanjuti.
- Sumber pelanggan tidak diketahui.
- Survey dan quotation tidak terhubung.
- Diskon diberikan tanpa approval.
- Revisi quotation tidak terdokumentasi.
- Proses dari lead sampai pelanggan aktif tidak terintegrasi.
- Target dan conversion rate sulit diukur.
- Komisi Sales sulit diverifikasi.

## 2.4 Permasalahan NOC

Permasalahan utama:

- Gangguan jaringan dicatat melalui chat tanpa tiket resmi.
- Tidak ada sistem terpusat untuk outage dan incident.
- Tidak diketahui durasi gangguan secara akurat.
- Tidak ada relasi antara alarm, perangkat, POP, pelanggan, dan tiket.
- Maintenance jaringan tidak terjadwal dengan baik.
- Perubahan konfigurasi perangkat tidak terdokumentasi.
- Tidak ada riwayat downtime setiap perangkat.
- Eskalasi gangguan tidak memiliki SLA.
- Tidak ada database IP address yang terpusat.
- Tidak ada dokumentasi jalur backbone dan dependensi jaringan.
- Gangguan berulang sulit dianalisis.
- Informasi gangguan kepada Customer Service tidak konsisten.

## 2.5 Permasalahan IT/DevOps

Permasalahan utama:

- Server, aplikasi, domain, dan layanan internal belum terdokumentasi dalam satu sistem.
- Akun layanan dan akses server tidak dikelola secara terpusat.
- Deployment aplikasi tidak memiliki approval dan change record.
- Tidak ada pemisahan jelas antara development, staging, dan production.
- Backup tidak selalu diverifikasi.
- Tidak ada riwayat deployment dan rollback.
- Incident aplikasi belum terhubung dengan incident NOC.
- Sertifikat SSL, domain, dan lisensi dapat kedaluwarsa tanpa peringatan.
- Perubahan database tidak terdokumentasi.
- Tidak ada inventory aplikasi dan dependency.
- Akses user yang sudah tidak bekerja berisiko tetap aktif.

---

# 3. Tujuan Produk

PerumNet CRM bertujuan untuk:

1. Mengelola calon pelanggan sampai menjadi pelanggan aktif.
2. Memisahkan fungsi Marketing dan Sales.
3. Mengelola perangkat dari pembelian sampai penghentian penggunaan.
4. Memastikan setiap perangkat memiliki lokasi dan penanggung jawab.
5. Mengurangi selisih stock fisik dan sistem.
6. Mengelola work order instalasi, gangguan, dan maintenance.
7. Mengelola proyek dan material proyek.
8. Mengontrol petty cash dan reimbursement.
9. Mengontrol cash advance dan penyelesaiannya.
10. Mengelola infrastruktur jaringan ISP.
11. Mengelola alarm, incident, outage, dan maintenance.
12. Menghubungkan gangguan jaringan dengan pelanggan terdampak.
13. Mengelola IP address, VLAN, POP, ODP, ODC, dan perangkat jaringan.
14. Mengelola change request konfigurasi jaringan.
15. Mengelola server, aplikasi, deployment, backup, dan akses.
16. Memberikan dashboard real-time kepada Management.
17. Menyediakan audit trail untuk aktivitas sensitif.
18. Menjadi sumber data utama perusahaan.

---

# 4. Indikator Keberhasilan

Target setelah tiga sampai enam bulan:

- Selisih stock berada di bawah 1%.
- Seluruh serialized device memiliki serial number unik.
- Seluruh perangkat keluar memiliki tujuan dan penanggung jawab.
- Tidak ada stock negatif.
- Tidak ada saldo petty cash negatif.
- Minimal 98% transaksi pengeluaran memiliki bukti.
- Seluruh cash advance memiliki settlement date.
- Seluruh lead memiliki Sales owner.
- Lead baru ditindaklanjuti sesuai SLA.
- Seluruh incident memiliki PIC dan timeline.
- Durasi outage dapat dihitung otomatis.
- Seluruh network change memiliki approval dan rollback plan.
- Seluruh IP address tercatat dan tidak duplikat.
- Seluruh deployment production memiliki change record.
- Seluruh backup kritikal memiliki status verifikasi.
- Sertifikat dan domain memiliki expiry reminder.
- Management dapat melihat performa setiap divisi.
- Tidak ada transaksi posted yang dapat dihapus.

---

# 5. Ruang Lingkup Produk

Modul utama:

1. Executive Dashboard.
2. Marketing Campaign.
3. Lead Management.
4. Sales Management.
5. Sales Pipeline.
6. Survey Management.
7. Quotation dan Sales Order.
8. Customer CRM.
9. Customer Subscription.
10. Customer Support.
11. Operational Work Order.
12. Inventory dan Warehouse.
13. Device and Asset Tracking.
14. Technician Custody.
15. Project Management.
16. Project Inventory.
17. Purchase dan Supplier.
18. Petty Cash.
19. Reimbursement.
20. Cash Advance.
21. Network Inventory.
22. Network Monitoring.
23. Incident dan Outage Management.
24. Network Maintenance.
25. Network Change Management.
26. IP Address Management.
27. Capacity Management.
28. Server dan Application Inventory.
29. IT Service Desk.
30. Deployment Management.
31. Backup dan Disaster Recovery.
32. Access dan Credential Governance.
33. Approval Management.
34. Stock Opname.
35. Petty Cash Closing.
36. Notification.
37. Reporting.
38. User, Role, dan Permission.
39. Audit Log.
40. Integration Management.

---

# 6. Struktur Divisi dan Role

## 6.1 Super Admin

Tanggung jawab:

- Mengelola konfigurasi.
- Mengelola user, role, dan permission.
- Mengelola approval workflow.
- Mengelola master data.
- Mengakses audit log.
- Membuka kembali periode melalui prosedur khusus.

Super Admin tidak digunakan untuk aktivitas harian.

## 6.2 Management

Tanggung jawab:

- Melihat dashboard perusahaan.
- Melihat performa Sales dan Marketing.
- Melihat kesehatan jaringan.
- Melihat incident dan outage.
- Melihat inventory dan petty cash.
- Melihat project budget versus actual.
- Menyetujui transaksi bernilai tinggi.
- Menyetujui major network change.
- Menyetujui production change berisiko tinggi.
- Melihat risiko operasional.

## 6.3 Marketing

Tanggung jawab:

- Membuat campaign.
- Mengelola channel promosi.
- Mengumpulkan lead.
- Mencatat sumber lead.
- Mengukur campaign performance.
- Menyerahkan lead kepada Sales.
- Mengajukan biaya Marketing.

Marketing tidak bertanggung jawab melakukan closing.

## 6.4 Sales Manager

Tanggung jawab:

- Menentukan target Sales.
- Membagikan lead.
- Memantau pipeline.
- Menyetujui diskon sesuai limit.
- Melihat conversion rate.
- Memantau forecast.
- Mengelola aturan komisi.

## 6.5 Sales

Tanggung jawab:

- Mengelola lead.
- Melakukan follow-up.
- Membuat opportunity.
- Mengajukan survey.
- Membuat quotation.
- Mengajukan diskon.
- Melakukan negosiasi.
- Mengubah lead menjadi pelanggan.
- Memantau proses instalasi.
- Mencatat aktivitas Sales.

Sales tidak dapat:

- Mengubah stock.
- Mengeluarkan perangkat.
- Mengaktifkan layanan secara manual.
- Menyetujui transaksi sendiri.
- Mengubah harga master.

## 6.6 Customer Service

Tanggung jawab:

- Mengelola data pelanggan.
- Mencatat keluhan.
- Membuat customer ticket.
- Melihat incident yang memengaruhi pelanggan.
- Menginformasikan status gangguan.
- Memantau instalasi dan maintenance.
- Membantu upgrade, downgrade, suspend, dan terminasi.

## 6.7 Finance

Tanggung jawab:

- Mengelola petty cash.
- Memverifikasi pengeluaran.
- Memproses reimbursement.
- Memproses cash advance.
- Melakukan closing.
- Memeriksa project cost.
- Memverifikasi pembayaran pelanggan.
- Memproses komisi Sales.

## 6.8 Warehouse

Tanggung jawab:

- Menerima barang.
- Memasukkan serial number.
- Menyimpan barang.
- Mengeluarkan barang berdasarkan request.
- Memproses pengembalian.
- Melakukan transfer stock.
- Melakukan stock opname.
- Memproses repair dan RMA.

## 6.9 Operational Coordinator

Tanggung jawab:

- Membuat work order.
- Menjadwalkan pekerjaan.
- Menugaskan teknisi.
- Menyetujui kebutuhan material.
- Memverifikasi hasil instalasi.
- Menutup work order.

## 6.10 Technician

Tanggung jawab:

- Melaksanakan work order.
- Menerima perangkat.
- Melakukan scan perangkat.
- Memasang atau mengganti perangkat.
- Mengunggah foto.
- Mengisi checklist.
- Mengembalikan barang.
- Melaporkan perangkat rusak atau hilang.

## 6.11 Project Manager

Tanggung jawab:

- Membuat proyek.
- Membuat Bill of Materials.
- Mengajukan material dan biaya.
- Menugaskan tim.
- Memantau inventory proyek.
- Melakukan rekonsiliasi proyek.

## 6.12 NOC Manager

Tanggung jawab:

- Mengawasi kesehatan jaringan.
- Mengelola SLA incident.
- Menentukan severity.
- Mengatur eskalasi.
- Menyetujui network change.
- Menjadwalkan maintenance.
- Menganalisis gangguan berulang.
- Menyusun laporan uptime dan availability.
- Mengelola kapasitas jaringan.

## 6.13 NOC Engineer

Tanggung jawab:

- Memantau perangkat dan link.
- Menerima alarm.
- Membuat incident ticket.
- Melakukan troubleshooting awal.
- Menghubungkan incident dengan perangkat dan pelanggan terdampak.
- Melakukan eskalasi.
- Menjalankan change yang disetujui.
- Membuat incident timeline.
- Mengisi root cause.
- Memverifikasi pemulihan layanan.

NOC Engineer tidak dapat menutup incident besar tanpa verifikasi.

## 6.14 IT Manager atau DevOps Lead

Tanggung jawab:

- Mengelola server dan aplikasi.
- Menyetujui deployment production.
- Menentukan standar environment.
- Mengelola backup dan disaster recovery.
- Mengatur akses sistem.
- Mengelola domain, SSL, dan lisensi.
- Mengawasi keamanan aplikasi.
- Mengelola roadmap teknologi internal.

## 6.15 Developer

Tanggung jawab:

- Mengembangkan aplikasi.
- Membuat pull request.
- Menjalankan testing.
- Membuat release note.
- Menyelesaikan bug.
- Menyiapkan database migration.
- Membuat rollback plan.
- Tidak dapat melakukan deployment production tanpa approval.

## 6.16 DevOps Engineer

Tanggung jawab:

- Mengelola CI/CD.
- Mengelola deployment.
- Mengelola container dan server.
- Mengelola monitoring aplikasi.
- Menjalankan backup.
- Mengelola environment variable dan secret.
- Menjalankan rollback.
- Mendokumentasikan infrastructure change.

## 6.17 IT Support

Tanggung jawab:

- Menangani perangkat kerja.
- Menangani akun internal.
- Menangani ticket IT.
- Mengelola laptop, desktop, printer, dan software license.
- Melakukan onboarding dan offboarding akses.

---

# 7. Prinsip Utama Sistem

## 7.1 Transaction-Based System

Stock dan saldo hanya berubah melalui transaksi resmi.

## 7.2 Immutable Posted Transaction

Transaksi posted tidak dapat diedit atau dihapus.

Koreksi menggunakan reversal.

## 7.3 Segregation of Duties

Pembuat transaksi tidak boleh menyetujui transaksi sendiri.

## 7.4 Mandatory Evidence

Bukti dapat berupa:

- Nota.
- Invoice.
- Foto perangkat.
- Foto instalasi.
- Screenshot monitoring.
- Log file.
- Berita acara.
- Tanda tangan.
- Backup report.
- Test result.
- Release note.

## 7.5 Change Control

Perubahan jaringan dan production harus memiliki:

- Change request.
- Tujuan.
- Risiko.
- Dampak.
- Jadwal.
- PIC.
- Approval.
- Implementation plan.
- Testing plan.
- Rollback plan.
- Hasil pelaksanaan.

## 7.6 Traceability

Setiap aktivitas dapat ditelusuri dari awal sampai akhir.

Contoh:

`Lead → Customer → Subscription → Work Order → Device → Incident`

`Alarm → Incident → Root Cause → Change Request → Resolution`

`Application Issue → Development Task → Deployment → Verification`

---

# 8. Marketing Management

Data campaign:

- Campaign ID.
- Nama campaign.
- Channel.
- Periode.
- Budget.
- Target audience.
- Area.
- PIC.
- Target lead.
- Actual lead.
- Cost per lead.
- Status.

Alur:

`Campaign → Lead → Sales Assignment → Opportunity → Customer`

Biaya Marketing wajib dikaitkan dengan campaign dan cost center.

---

# 9. Lead dan Sales Management

## 9.1 Data Lead

- Lead ID.
- Nama.
- Perusahaan.
- Telepon.
- Email.
- Alamat.
- Koordinat.
- Jenis pelanggan.
- Sumber.
- Campaign.
- Paket yang diminati.
- Estimasi bandwidth.
- Sales owner.
- Next follow-up.
- Status.
- Catatan.

## 9.2 Status Lead

- New.
- Assigned.
- Contacted.
- Follow-up.
- Interested.
- Survey Required.
- Quotation Required.
- Unreachable.
- Not Interested.
- Converted.
- Lost.

## 9.3 Sales Activity

- Phone call.
- WhatsApp.
- Email.
- Meeting.
- Site visit.
- Presentation.
- Survey request.
- Quotation sent.
- Negotiation.
- Contract signing.

## 9.4 Sales Pipeline

- New Lead.
- Initial Contact.
- Qualified.
- Survey Scheduled.
- Survey Completed.
- Quotation.
- Negotiation.
- Waiting Decision.
- Won.
- Lost.
- Installation Process.
- Activated.

---

# 10. Survey Management

Data survey:

- Lead atau customer.
- Alamat.
- Koordinat.
- Kontak.
- Paket.
- Kebutuhan bandwidth.
- Jadwal.
- Teknisi.
- Titik jaringan terdekat.
- POP, ODP, ODC, atau tower.
- Estimasi kabel.
- Estimasi material.
- Estimasi biaya.
- Signal level jika wireless.
- Optical power jika fiber.
- Foto.
- Feasibility result.

Status:

- Draft.
- Submitted.
- Scheduled.
- Assigned.
- In Progress.
- Completed.
- Feasible.
- Feasible with Additional Cost.
- Not Feasible.
- Cancelled.

---

# 11. Quotation dan Sales Order

Quotation berisi:

- Paket.
- Biaya instalasi.
- Perangkat tambahan.
- Biaya pembangunan jaringan.
- Biaya bulanan.
- Masa kontrak.
- Diskon.
- Pajak.
- Masa berlaku.

Quotation diterima tidak dapat diedit.

Revisi harus membuat versi baru.

Sales order menghasilkan:

- Customer.
- Subscription.
- Installation request.
- Work order.
- Material request.

---

# 12. Customer CRM

Data pelanggan:

- Customer ID.
- Nama.
- Perusahaan.
- Telepon.
- Email.
- Alamat.
- Koordinat.
- Jenis pelanggan.
- Area.
- POP.
- Sales owner.
- Source.
- Status.

Jenis pelanggan:

- Residential.
- Business.
- Hotel.
- Villa.
- Corporate.
- Reseller.
- Government.
- Internal.

---

# 13. Subscription dan Layanan Internet

Data:

- Service ID.
- Customer.
- Paket.
- Harga.
- Download speed.
- Upload speed.
- Aktivasi.
- Billing cycle.
- POP.
- ODP, ODC, tower, atau access node.
- VLAN.
- PPPoE username.
- IP address.
- Perangkat.
- Masa kontrak.
- Status.

Status:

- Draft.
- Waiting Installation.
- Active.
- Isolated.
- Suspended.
- Terminated.

---

# 14. Customer Support Ticket

Jenis tiket:

- Internet down.
- Slow connection.
- Intermittent.
- High latency.
- Wi-Fi issue.
- Billing inquiry.
- Relocation.
- Upgrade.
- Device issue.
- Complaint.
- Request.

Status:

- New.
- Assigned.
- In Progress.
- Waiting Customer.
- Escalated to NOC.
- Escalated to Operational.
- Resolved.
- Closed.

Customer ticket dapat dihubungkan dengan:

- Subscription.
- Work order.
- Network incident.
- Device.
- Technician.
- NOC Engineer.

---

# 15. Inventory dan Warehouse

## 15.1 Item Master

Data:

- Item code.
- Nama.
- Kategori.
- Brand.
- Model.
- Unit.
- Tracking type.
- Minimum stock.
- Reorder point.
- Harga rata-rata.
- Supplier.
- Foto.

## 15.2 Serialized Item

Data:

- Serial number.
- MAC address.
- QR code.
- Kondisi.
- Status.
- Lokasi.
- Penanggung jawab.
- Nilai perolehan.
- Garansi.

## 15.3 Status Perangkat

- Available.
- Reserved.
- Waiting Handover.
- In Technician Custody.
- In Project Custody.
- Installed at Customer.
- Installed at POP.
- Returned.
- Under Inspection.
- Damaged.
- Under Repair.
- RMA.
- Lost.
- Scrapped.

Status tidak dapat diubah manual.

---

# 16. Alur Perangkat

## 16.1 Goods Receipt

1. Purchase order dibuat.
2. Barang diterima.
3. Barang diperiksa.
4. Serial number dimasukkan.
5. Duplikasi ditolak.
6. Goods receipt diposting.
7. Stock bertambah.

## 16.2 Stock Issue

Perangkat hanya keluar jika memiliki:

- Work order.
- Project.
- POP installation.
- Network maintenance.
- IT asset request.
- PIC.
- Approval.
- Handover confirmation.

## 16.3 Installation

Perangkat pelanggan wajib terhubung ke:

- Customer ID.
- Service ID.
- Work order.
- Teknisi.
- Lokasi.
- Foto.
- Tanda tangan.

## 16.4 Return

Barang tidak digunakan wajib dikembalikan.

## 16.5 Lost dan Damaged

Wajib memiliki:

- Kronologi.
- Berita acara.
- Approval.
- Status final.
- Pembebanan jika diperlukan.

---

# 17. Technician Custody

Setiap teknisi memiliki virtual inventory.

Sistem menampilkan:

- Perangkat dibawa.
- Work order terkait.
- Lama custody.
- Barang outstanding.
- Barang overdue.
- Barang wajib dikembalikan.

Teknisi dengan custody overdue dapat diblokir menerima barang baru.

---

# 18. Operational Work Order

Jenis:

- New Installation.
- Troubleshooting.
- Device Replacement.
- Device Retrieval.
- Relocation.
- Upgrade.
- Preventive Maintenance.
- Backbone Maintenance.
- POP Maintenance.
- Survey.
- Project Task.
- Incident Field Support.

Work order tidak dapat ditutup jika:

- Material belum dipertanggungjawabkan.
- Checklist belum lengkap.
- Foto belum ada.
- Pelanggan belum memberikan konfirmasi.
- Biaya belum selesai.

---

# 19. Project Management

Data:

- Project ID.
- Nama proyek.
- Customer atau lokasi.
- Project Manager.
- Budget.
- Bill of Materials.
- Tim.
- Timeline.
- Status.

Proyek tidak dapat ditutup sebelum:

- Material direkonsiliasi.
- Cash advance diselesaikan.
- Biaya diverifikasi.
- Dokumentasi diserahkan.
- Hasil pekerjaan diterima.

---

# 20. Purchase dan Supplier

Modul mencakup:

- Supplier.
- Purchase request.
- Purchase order.
- Goods receipt.
- Invoice matching.
- Supplier performance.
- Emergency purchase.

Sistem memberikan peringatan jika:

- Barang diterima melebihi PO.
- Serial number duplikat.
- Harga berbeda.
- Barang rusak.
- Model tidak sesuai.

---

# 21. Stock Opname

Alur:

1. Membuat session.
2. Menentukan lokasi.
3. Menentukan cut-off.
4. Scan atau hitung barang.
5. Sistem menghitung variance.
6. Alasan wajib.
7. Supervisor memverifikasi.
8. Management menyetujui.
9. Adjustment diposting.

---

# 22. Petty Cash

Cashbook:

- Petty Cash Kantor.
- Operational.
- Project.
- Sales.
- Marketing.
- NOC.
- IT/DevOps.

Jenis transaksi:

- Cash top-up.
- Direct expense.
- Reimbursement.
- Cash advance.
- Settlement.
- Cash refund.
- Cash transfer.
- Correction.
- Reversal.

---

# 23. Direct Expense

Pengeluaran wajib dikaitkan dengan salah satu:

- Work order.
- Project.
- Customer.
- Lead.
- Opportunity.
- Campaign.
- Network incident.
- Network maintenance.
- Change request.
- IT ticket.
- Deployment.
- Server atau aplikasi.

Data wajib:

- Tanggal.
- Penerima.
- Jumlah.
- Tujuan.
- Kategori.
- Cost center.
- Referensi.
- Bukti.
- Approver.

---

# 24. Reimbursement

Aturan:

- Bukti wajib.
- Nota tidak dapat digunakan dua kali.
- Sistem mendeteksi kemungkinan duplikasi.
- Pengguna tidak dapat menyetujui klaim sendiri.
- Klaim paid tidak dapat diedit.
- Klaim di luar batas waktu memerlukan approval tambahan.

---

# 25. Cash Advance

Cash advance digunakan untuk:

- Perjalanan teknisi.
- Pembelian material.
- Proyek.
- Emergency outage.
- Maintenance jaringan.
- Event Sales atau Marketing.
- Pembelian kebutuhan IT darurat.

Cash advance overdue memblokir pengajuan baru.

---

# 26. Cost Center

Cost center:

- General and Administration.
- Operational.
- Network Operation Center.
- Network Maintenance.
- Backbone.
- POP Operation.
- Customer Installation.
- Customer Maintenance.
- Project.
- Marketing.
- Sales.
- Warehouse.
- IT.
- Software Development.
- DevOps.
- Cloud Infrastructure.
- Security.
- Management.

---

# 27. Petty Cash Closing

Daily closing membandingkan:

`Cash Variance = Physical Cash - System Balance`

Jika ada selisih:

- Alasan wajib.
- Bukti wajib.
- Supervisor review.
- Masuk variance report.

Monthly closing mengunci periode.

---

# 28. Network Inventory

Modul Network Inventory mencatat seluruh elemen jaringan.

## 28.1 Site dan Infrastruktur

Jenis site:

- Head Office.
- Data Center.
- POP.
- Mini POP.
- Tower.
- ODC.
- ODP.
- Distribution Point.
- Customer Site.
- Relay Site.
- Colocation.

Data site:

- Site ID.
- Nama.
- Alamat.
- Koordinat.
- Area.
- PIC.
- Status.
- Foto.
- Akses lokasi.
- Sumber listrik.
- Backup power.
- Provider upstream.
- Kapasitas.

## 28.2 Perangkat Jaringan

Jenis perangkat:

- Router.
- Core router.
- Distribution switch.
- Access switch.
- OLT.
- ONU atau ONT.
- Wireless backhaul.
- Access point.
- Firewall.
- Server.
- UPS.
- PDU.
- NVR.
- CCTV.
- Environmental sensor.

Data perangkat:

- Device ID.
- Hostname.
- Vendor.
- Model.
- Serial number.
- MAC address.
- Management IP.
- Site.
- Rack.
- U position.
- Firmware.
- Warranty.
- Status.
- Monitoring status.
- Owner.
- Criticality.

## 28.3 Link dan Circuit

Data:

- Link ID.
- Source.
- Destination.
- Media.
- Capacity.
- Provider.
- Circuit ID.
- VLAN.
- IP subnet.
- Primary atau backup.
- Status.
- SLA.
- Utilization.
- Latency.
- Packet loss.

---

# 29. IP Address Management

IPAM mengelola:

- Public IPv4.
- Private IPv4.
- IPv6.
- Subnet.
- VLAN.
- Gateway.
- DHCP pool.
- PPPoE pool.
- Management IP.
- Customer static IP.
- Reserved IP.

Business rules:

1. IP tidak dapat duplikat.
2. IP harus terhubung dengan perangkat atau layanan.
3. Subnet memiliki owner dan tujuan.
4. Penggunaan IP dicatat.
5. IP release memiliki tanggal.
6. Perubahan subnet memerlukan approval.
7. Public IP memiliki riwayat assignment.

---

# 30. Network Monitoring

Sistem menerima atau mengintegrasikan data:

- Device up/down.
- Interface status.
- Link utilization.
- Latency.
- Packet loss.
- CPU.
- Memory.
- Temperature.
- Optical power.
- Voltage.
- UPS battery.
- BGP status.
- OSPF neighbor.
- PPPoE session.
- Customer session.
- Internet gateway health.

Monitoring dapat berasal dari:

- SNMP.
- Syslog.
- ICMP.
- API.
- MikroTik.
- Ruijie.
- UniFi.
- Zabbix.
- LibreNMS.
- The Dude.
- Prometheus.
- Grafana.
- RADIUS.

---

# 31. Alarm Management

Severity:

- Informational.
- Warning.
- Minor.
- Major.
- Critical.

Alarm memiliki:

- Alarm ID.
- Source.
- Device.
- Interface.
- Site.
- Timestamp.
- Severity.
- Message.
- Acknowledgement.
- Assigned PIC.
- Related incident.
- Clear time.

Alarm dapat otomatis membuat incident berdasarkan rule tertentu.

Duplicate alarm harus dikelompokkan untuk mencegah alarm flooding.

---

# 32. Incident dan Outage Management

## 32.1 Jenis Incident

- Device down.
- Link down.
- High latency.
- Packet loss.
- Power outage.
- Fiber cut.
- Wireless interference.
- Upstream provider outage.
- Core network issue.
- Authentication failure.
- DNS issue.
- DDoS atau security issue.
- Application outage.
- Database issue.

## 32.2 Severity Incident

### P1 — Critical

- Core network down.
- Banyak pelanggan terdampak.
- Seluruh area tidak dapat mengakses internet.
- Service kritikal berhenti.

### P2 — Major

- Satu POP atau backbone terganggu.
- Banyak pelanggan terdampak.
- Ada jalur cadangan tetapi kualitas menurun.

### P3 — Minor

- Gangguan terbatas.
- Pelanggan atau perangkat tertentu terdampak.

### P4 — Informational

- Tidak ada dampak langsung.
- Perlu pemantauan atau tindakan terjadwal.

## 32.3 Data Incident

- Incident ID.
- Judul.
- Severity.
- Detection time.
- Acknowledgement time.
- Assigned time.
- Restoration time.
- Closure time.
- Device atau link.
- Area.
- Pelanggan terdampak.
- PIC.
- Timeline.
- Root cause.
- Resolution.
- Preventive action.
- Related change.
- Related work order.

## 32.4 Status Incident

- Detected.
- Acknowledged.
- Assigned.
- Investigating.
- Identified.
- Mitigating.
- Monitoring.
- Resolved.
- Root Cause Review.
- Closed.

Incident tidak dapat ditutup tanpa:

- Timeline.
- Root cause atau preliminary cause.
- Resolution.
- Dampak.
- Verifikasi recovery.

---

# 33. Outage Communication

Saat outage terjadi, sistem dapat memberikan informasi kepada:

- Management.
- Customer Service.
- Operational.
- Sales.
- Pelanggan terdampak.

Informasi:

- Area terdampak.
- Waktu mulai.
- Status.
- Estimasi pemulihan.
- Penyebab jika telah diketahui.
- Waktu pemulihan.
- Nomor incident.

Customer Service hanya melihat informasi yang telah disetujui untuk komunikasi eksternal.

---

# 34. Network Maintenance

Jenis maintenance:

- Preventive.
- Corrective.
- Emergency.
- Firmware upgrade.
- Fiber maintenance.
- Power maintenance.
- Tower maintenance.
- Capacity upgrade.
- Security hardening.

Data:

- Maintenance ID.
- Site atau perangkat.
- Tujuan.
- Risiko.
- Jadwal.
- PIC.
- Pelanggan terdampak.
- Downtime estimasi.
- Material.
- Work order.
- Approval.
- Hasil.
- Dokumentasi.

---

# 35. Network Change Management

Jenis change:

- Standard change.
- Normal change.
- Emergency change.
- Major change.

Contoh:

- Perubahan routing.
- Perubahan firewall.
- VLAN baru.
- Upgrade firmware.
- Migrasi link.
- Perubahan IP.
- Upgrade kapasitas.
- Perubahan QoS.
- Perubahan DNS.
- Perubahan PPPoE atau RADIUS.

Setiap change memiliki:

- Change ID.
- Tujuan.
- Alasan.
- Perangkat terdampak.
- Service terdampak.
- Risiko.
- Implementation plan.
- Test plan.
- Rollback plan.
- Maintenance window.
- PIC.
- Approver.
- Hasil.
- Evidence.

Emergency change harus direview setelah implementasi.

---

# 36. Capacity Management

Sistem menampilkan:

- Link utilization.
- Peak utilization.
- Bandwidth growth.
- Port utilization.
- Public IP usage.
- OLT port utilization.
- Power capacity.
- Rack capacity.
- Storage capacity.
- Server CPU dan memory growth.

Threshold dapat dikonfigurasi, misalnya:

- 70% warning.
- 85% major.
- 95% critical.

Sistem memberikan rekomendasi upgrade berdasarkan tren.

---

# 37. NOC Shift Management

Data shift:

- Jadwal.
- Engineer bertugas.
- Handover.
- Open incident.
- Alarm belum selesai.
- Maintenance berjalan.
- Risiko yang perlu dipantau.

Setiap pergantian shift wajib memiliki digital handover note.

---

# 38. Server dan Application Inventory

## 38.1 Server Inventory

Data:

- Server ID.
- Hostname.
- Environment.
- Operating system.
- IP address.
- Provider.
- Region.
- CPU.
- RAM.
- Storage.
- Owner.
- Purpose.
- Backup policy.
- Monitoring status.
- Criticality.
- Expiry.

Environment:

- Development.
- Testing.
- Staging.
- Production.
- Disaster Recovery.

## 38.2 Application Inventory

Data:

- Application ID.
- Nama aplikasi.
- Repository.
- Owner.
- Business owner.
- Environment.
- Domain.
- Technology stack.
- Database.
- Dependency.
- Deployment method.
- SLA.
- Backup.
- Monitoring.
- Status.

---

# 39. IT Service Desk

Jenis tiket:

- Laptop issue.
- Account request.
- Password reset.
- Email issue.
- Printer issue.
- Software installation.
- Access request.
- VPN issue.
- Application bug.
- Server issue.
- Security incident.
- New employee onboarding.
- Employee offboarding.

Status:

- New.
- Assigned.
- In Progress.
- Waiting User.
- Waiting Vendor.
- Resolved.
- Closed.

---

# 40. Access Management

Permintaan akses wajib memiliki:

- Requester.
- User penerima.
- Sistem.
- Role.
- Alasan.
- Durasi.
- Approver.
- Expiry date.

Jenis akses:

- Server.
- Database.
- Repository.
- Cloud.
- Network device.
- CRM.
- Monitoring.
- Email.
- VPN.
- Domain.
- Billing.

Aturan:

1. Akses production memerlukan approval.
2. Akses sementara memiliki expiry.
3. Offboarding menonaktifkan akses.
4. Privileged access direview berkala.
5. Shared account harus diminimalkan.
6. Password atau secret tidak disimpan dalam catatan biasa.

---

# 41. Development Management

Data development task:

- Task ID.
- Project.
- Module.
- Requirement.
- Priority.
- Developer.
- Branch.
- Pull request.
- Test result.
- Reviewer.
- Status.

Status:

- Backlog.
- Ready.
- In Development.
- Code Review.
- Testing.
- Ready for Deployment.
- Deployed.
- Verified.
- Closed.

---

# 42. Deployment Management

Setiap deployment memiliki:

- Deployment ID.
- Application.
- Version.
- Environment.
- Change request.
- Release note.
- Commit atau tag.
- Database migration.
- Deployment plan.
- Testing result.
- Rollback plan.
- Approver.
- Executor.
- Start time.
- End time.
- Result.

Production deployment tidak dapat dilakukan jika:

- Testing belum selesai.
- Approval belum tersedia.
- Rollback plan kosong.
- Backup yang diwajibkan belum tersedia.
- Maintenance window belum ditentukan.

---

# 43. CI/CD dan Environment

Sistem mendokumentasikan:

- Repository.
- Branch strategy.
- Build pipeline.
- Test pipeline.
- Deployment pipeline.
- Artifact.
- Environment.
- Release.
- Rollback.

Environment production harus terpisah dari development dan staging.

---

# 44. Backup dan Disaster Recovery

Data backup:

- Backup ID.
- Server atau aplikasi.
- Jenis backup.
- Jadwal.
- Lokasi.
- Retention.
- Encryption.
- Status.
- Verification result.
- Restore test.

Jenis:

- Database backup.
- File backup.
- Configuration backup.
- VM snapshot.
- Network configuration backup.
- Offsite backup.

Business rules:

1. Backup kritikal harus otomatis.
2. Backup harus memiliki retention.
3. Restore test dilakukan berkala.
4. Backup gagal menghasilkan alert.
5. Backup production harus terenkripsi.
6. Network configuration backup dilakukan setelah change penting.

---

# 45. Domain, SSL, License, dan Subscription

Data:

- Nama aset.
- Jenis.
- Provider.
- Owner.
- Tanggal pembelian.
- Expiry date.
- Auto renewal.
- Cost.
- Payment method.
- Reminder.
- Status.

Jenis:

- Domain.
- SSL certificate.
- Cloud subscription.
- VPS.
- Software license.
- Monitoring license.
- Email service.
- API subscription.

---

# 46. IT Asset Management

Aset:

- Laptop.
- Desktop.
- Monitor.
- Printer.
- Smartphone.
- UPS.
- Server.
- License.
- Peripheral.

Setiap aset memiliki:

- Asset tag.
- Serial number.
- User.
- Department.
- Location.
- Purchase date.
- Warranty.
- Condition.
- Status.
- Handover document.

---

# 47. Sales Target dan Commission

Target berdasarkan:

- Individu.
- Tim.
- Area.
- Produk.
- Paket.
- Jumlah pelanggan.
- Monthly recurring revenue.
- Installation revenue.

Komisi hanya eligible jika:

- Lead memiliki Sales owner.
- Pelanggan telah aktif.
- Pembayaran awal terverifikasi.
- Tidak terjadi pembatalan dalam periode tertentu.

---

# 48. Approval Matrix

Approval dapat dikonfigurasi berdasarkan:

- Modul.
- Nilai transaksi.
- Severity.
- Risiko.
- Divisi.
- Jabatan.
- Environment.

Contoh petty cash:

| Nilai | Approval |
|---|---|
| Sampai Rp500.000 | Supervisor |
| Rp500.001–Rp2.000.000 | Supervisor dan Finance |
| Di atas Rp2.000.000 | Supervisor, Finance, dan Management |

Contoh network change:

| Change | Approval |
|---|---|
| Standard Change | NOC Manager |
| Normal Change | NOC Manager dan Head of Operation |
| Major Change | NOC Manager, IT/Operation Head, Management |
| Emergency Change | NOC Manager atau Duty Manager, lalu post-review |

Contoh deployment:

| Environment | Approval |
|---|---|
| Development | Developer Lead |
| Staging | Developer Lead atau DevOps |
| Production Minor | IT Manager atau DevOps Lead |
| Production Major | IT Manager dan Management |

---

# 49. Dashboard

## 49.1 Executive Dashboard

- Pelanggan aktif.
- Monthly recurring revenue.
- Sales pipeline.
- Target Sales.
- Open incident.
- Network availability.
- Outage duration.
- Work order overdue.
- Inventory value.
- Stock variance.
- Petty cash balance.
- Cash variance.
- Project budget versus actual.
- Production system health.
- Backup compliance.

## 49.2 NOC Dashboard

- Device up/down.
- Link status.
- Open alarm.
- Critical incident.
- Outage area.
- Customer impact.
- Link utilization.
- High latency.
- Packet loss.
- Scheduled maintenance.
- Change calendar.
- Engineer on shift.
- SLA countdown.

## 49.3 IT/DevOps Dashboard

- Application health.
- Server health.
- Deployment status.
- Open IT ticket.
- Backup status.
- SSL expiry.
- Domain expiry.
- License expiry.
- Security alert.
- Failed pipeline.
- Production change.
- Resource utilization.

## 49.4 Warehouse Dashboard

- Available stock.
- Reserved stock.
- Pending return.
- Low stock.
- Damaged device.
- Stock variance.
- Perangkat tanpa lokasi.

## 49.5 Finance Dashboard

- Saldo cashbook.
- Expense pending.
- Reimbursement.
- Cash advance.
- Cash variance.
- Pengeluaran per cost center.

## 49.6 Sales Dashboard

- Target.
- Achievement.
- Lead baru.
- Follow-up overdue.
- Pipeline.
- Quotation.
- Closing.
- Estimated commission.

---

# 50. Notification

Notifikasi mencakup:

## Sales dan CRM

- Lead baru.
- Follow-up overdue.
- Quotation expired.
- Survey selesai.
- Pelanggan aktif.

## Inventory

- Low stock.
- Barang belum dikembalikan.
- Perangkat overdue.
- Warranty expiry.
- Stock variance.

## Finance

- Cash advance jatuh tempo.
- Expense tanpa bukti.
- Petty cash hampir habis.
- Cash variance.

## NOC

- Device down.
- Link down.
- Critical alarm.
- Incident SLA mendekati batas.
- Maintenance dimulai.
- Change gagal.
- Outage pulih.
- Capacity threshold terlewati.

## IT/DevOps

- Deployment gagal.
- Backup gagal.
- Server resource tinggi.
- SSL akan kedaluwarsa.
- Domain akan kedaluwarsa.
- License akan kedaluwarsa.
- Production incident.
- Access akan kedaluwarsa.

---

# 51. Audit Log

Audit log mencatat:

- Login dan logout.
- Login gagal.
- Pembuatan dan perubahan data.
- Approval dan rejection.
- Posting dan reversal.
- Stock movement.
- Lead assignment.
- Perubahan Sales owner.
- Alarm acknowledgement.
- Incident update.
- Network change.
- Configuration change.
- Deployment.
- Rollback.
- Access grant dan revoke.
- Backup result.
- Export data.
- Perubahan role.
- Perubahan permission.
- Perubahan konfigurasi sistem.

Audit log tidak dapat dihapus melalui aplikasi.

---

# 52. Reporting

## 52.1 Sales dan Marketing

- Lead report.
- Lead source.
- Campaign performance.
- Sales pipeline.
- Sales forecast.
- Conversion.
- Quotation.
- Target.
- Commission.
- Customer acquisition cost.

## 52.2 Inventory

- Current stock.
- Stock movement.
- Stock by location.
- Stock by technician.
- Stock by project.
- Device history.
- Lost device.
- Damaged device.
- Stock variance.
- Inventory valuation.

## 52.3 Finance

- Cashbook ledger.
- Expense by category.
- Expense by cost center.
- Reimbursement.
- Cash advance.
- Cash variance.
- Project cost.
- NOC expense.
- IT expense.

## 52.4 NOC

- Network availability.
- Device uptime.
- Link uptime.
- Incident report.
- Incident by severity.
- Mean Time to Acknowledge.
- Mean Time to Repair.
- Root cause.
- Repeat incident.
- Outage duration.
- Customer impact.
- Capacity utilization.
- Maintenance report.
- Change success rate.
- SLA performance.

## 52.5 IT/DevOps

- Server availability.
- Application availability.
- Deployment frequency.
- Deployment success rate.
- Failed deployment.
- Rollback report.
- Backup compliance.
- Restore test.
- IT ticket SLA.
- Access review.
- SSL and domain expiry.
- License utilization.
- Infrastructure cost.

---

# 53. Business Rules Kritis

1. Stock tidak boleh negatif.
2. Saldo petty cash tidak boleh negatif.
3. Serial number harus unik.
4. Perangkat hanya memiliki satu lokasi aktif.
5. Perangkat hanya memiliki satu custodian aktif.
6. Perangkat tidak keluar tanpa transaksi.
7. Work order tidak ditutup jika material outstanding.
8. Project tidak ditutup jika material dan biaya belum direkonsiliasi.
9. Expense wajib memiliki kategori dan cost center.
10. Posted transaction tidak dapat diedit.
11. Koreksi menggunakan reversal.
12. Pembuat transaksi tidak dapat menyetujui sendiri.
13. Cash advance overdue memblokir pengajuan baru.
14. Lead wajib memiliki Sales owner.
15. Lost opportunity wajib memiliki alasan.
16. Quotation accepted tidak dapat diedit.
17. Sales tidak dapat mengaktifkan layanan.
18. IP address tidak boleh duplikat.
19. Network incident wajib memiliki severity.
20. Incident besar wajib memiliki root cause review.
21. Major change wajib memiliki rollback plan.
22. Network change tidak dapat dilaksanakan tanpa approval.
23. Emergency change wajib melalui post-review.
24. Production deployment wajib memiliki change record.
25. Production deployment wajib memiliki rollback plan.
26. Developer tidak dapat menyetujui deployment sendiri.
27. Backup kritikal wajib diverifikasi.
28. Akses production wajib memiliki approval.
29. Temporary access wajib memiliki expiry date.
30. Offboarding wajib mencabut seluruh akses.
31. Shared credential tidak boleh dicatat di kolom biasa.
32. Seluruh aktivitas sensitif masuk audit log.

---

# 54. Permission

Permission mencakup:

- View.
- Create.
- Edit Draft.
- Submit.
- Approve.
- Reject.
- Assign.
- Acknowledge.
- Execute.
- Post.
- Reverse.
- Close.
- Export.
- View Financial Value.
- View Network Configuration.
- View Credential Metadata.
- Manage Configuration.
- View Audit Log.

Contoh pembatasan:

- Sales hanya melihat lead sesuai wilayah atau assignment.
- Teknisi hanya melihat work order terkait.
- NOC Engineer melihat konfigurasi sesuai permission.
- Customer Service tidak dapat mengubah perangkat jaringan.
- Developer tidak dapat mengakses database production tanpa approval.
- Finance tidak dapat mengubah incident.
- Warehouse tidak dapat menyetujui stock adjustment sendiri.

---

# 55. Kebutuhan Mobile

Fitur mobile:

- Scan QR dan barcode.
- Melihat lead.
- Mencatat Sales visit.
- Melihat work order.
- Menerima perangkat.
- Mengunggah foto.
- Mengambil koordinat.
- Melihat incident.
- Acknowledge alarm.
- Mengisi incident update.
- Melihat maintenance.
- Menyetujui request.
- Membuat expense.
- Mengunggah nota.
- Melakukan cash advance settlement.
- Menerima notifikasi.

Tahap awal menggunakan Progressive Web App.

---

# 56. Integrasi Potensial

## Jaringan

- MikroTik.
- RADIUS.
- Ruijie.
- UniFi.
- SNMP.
- Syslog.
- Zabbix.
- LibreNMS.
- The Dude.
- Prometheus.
- Grafana.

## CRM dan Pelanggan

- Billing.
- Payment gateway.
- WhatsApp.
- Email.
- Customer portal.

## IT/DevOps

- GitHub.
- GitLab.
- Docker.
- Kubernetes.
- Vercel.
- Cloudflare.
- VPS provider.
- Sentry.
- Uptime monitoring.
- CI/CD pipeline.

## Finance

- Accounting system.
- Bank statement.
- E-invoice.
- Tax system.

---

# 57. Non-Functional Requirements

## Security

- HTTPS wajib.
- Password menggunakan secure hashing.
- Two-factor authentication untuk role sensitif.
- Session timeout.
- Rate limiting.
- Role-based access control.
- Audit log permanen.
- Backup terenkripsi.
- Secrets tidak disimpan dalam plaintext.
- Pembatasan akses berdasarkan environment.
- Optional IP restriction.
- Security review berkala.

## Performance

- Halaman utama maksimal tiga detik.
- Pencarian perangkat maksimal dua detik.
- Monitoring dashboard diperbarui mendekati real-time.
- Scan QR memberikan respons langsung.
- Sistem mendukung minimal 100 pengguna aktif pada fase awal.

## Availability

- Target uptime aplikasi 99,5% pada fase awal.
- Backup database harian.
- Incremental backup sesuai kebutuhan.
- Disaster recovery procedure.
- Monitoring aplikasi 24 jam.

## Data Retention

- Audit log minimal lima tahun.
- Incident dan change history minimal lima tahun.
- Riwayat perangkat tidak dihapus.
- Transaksi keuangan mengikuti kebijakan perusahaan.
- Deployment dan access log disimpan sesuai kebijakan keamanan.

---

# 58. MVP

Modul MVP:

1. Authentication.
2. User, role, dan permission.
3. Audit log.
4. Marketing campaign dasar.
5. Lead management.
6. Sales activity.
7. Sales pipeline.
8. Survey.
9. Quotation.
10. Customer.
11. Subscription.
12. Customer ticket.
13. Work order.
14. Item master.
15. Warehouse.
16. Serialized device.
17. Goods receipt.
18. Stock issue.
19. Technician custody.
20. Device installation.
21. Device return.
22. Stock transfer.
23. Stock adjustment.
24. Stock opname.
25. Project dasar.
26. Petty cash.
27. Reimbursement.
28. Cash advance.
29. Approval workflow.
30. Network site inventory.
31. Network device inventory.
32. Basic IPAM.
33. Manual alarm dan incident.
34. Outage management.
35. Network maintenance.
36. Network change request.
37. Server inventory.
38. Application inventory.
39. IT service ticket.
40. Deployment record.
41. Backup record.
42. Dashboard.
43. Reporting.
44. Notification.

Fitur monitoring otomatis dan CI/CD integration dapat dikembangkan setelah MVP stabil.

---

# 59. Tahapan Pengembangan

## Phase 1 — Foundation

- Authentication.
- Role dan permission.
- Approval.
- Master data.
- Audit log.
- Notification framework.

## Phase 2 — Sales dan CRM

- Marketing.
- Lead.
- Sales pipeline.
- Survey.
- Quotation.
- Customer.
- Subscription.

## Phase 3 — Inventory dan Operational

- Warehouse.
- Device tracking.
- Technician custody.
- Work order.
- Installation.
- Return.
- Stock opname.

## Phase 4 — Finance dan Project

- Petty cash.
- Expense.
- Reimbursement.
- Cash advance.
- Project.
- Project costing.
- Reconciliation.

## Phase 5 — NOC

- Network inventory.
- Site.
- Device.
- Link.
- IPAM.
- Alarm.
- Incident.
- Outage.
- Maintenance.
- Change management.
- NOC dashboard.

## Phase 6 — IT/DevOps

- Server inventory.
- Application inventory.
- IT ticket.
- Access request.
- Development task.
- Deployment.
- Backup.
- Domain dan SSL.
- IT/DevOps dashboard.

## Phase 7 — Integrasi

- Billing.
- MikroTik.
- RADIUS.
- Monitoring.
- WhatsApp.
- GitHub atau GitLab.
- CI/CD.
- Accounting.
- Customer portal.

---

# 60. Struktur Menu

## Dashboard

- Executive Dashboard.
- Sales Dashboard.
- Operational Dashboard.
- Inventory Dashboard.
- Finance Dashboard.
- NOC Dashboard.
- IT/DevOps Dashboard.

## Marketing

- Campaigns.
- Marketing Activities.
- Marketing Expenses.
- Campaign Reports.

## Sales

- Leads.
- Lead Assignment.
- Activities.
- Opportunities.
- Pipeline.
- Surveys.
- Quotations.
- Sales Orders.
- Installation Monitoring.
- Targets.
- Commissions.

## CRM

- Customers.
- Customer Locations.
- Subscriptions.
- Customer Devices.
- Customer Tickets.
- Customer History.

## Operations

- Work Orders.
- Technician Schedule.
- Material Requests.
- Installation.
- Maintenance.
- Device Retrieval.

## Projects

- Project List.
- Project Team.
- Bill of Materials.
- Project Inventory.
- Project Expenses.
- Reconciliation.

## Inventory

- Item Master.
- Devices.
- Warehouses.
- Locations.
- Goods Receipt.
- Stock Issue.
- Stock Return.
- Stock Transfer.
- Technician Custody.
- Stock Adjustment.
- Stock Opname.
- Repair.
- RMA.

## Finance

- Cashbooks.
- Expenses.
- Reimbursements.
- Cash Advances.
- Settlements.
- Cash Transfers.
- Daily Closing.
- Monthly Closing.

## NOC

- NOC Dashboard.
- Network Map.
- Sites.
- Network Devices.
- Links and Circuits.
- IP Address Management.
- VLAN Management.
- Alarms.
- Incidents.
- Outages.
- Maintenance.
- Network Changes.
- Capacity.
- Shift Handover.
- NOC Reports.

## IT/DevOps

- IT Dashboard.
- IT Tickets.
- IT Assets.
- Servers.
- Applications.
- Environments.
- Repositories.
- Development Tasks.
- Deployments.
- Backups.
- Restore Tests.
- Access Requests.
- Domains.
- SSL Certificates.
- Licenses.
- Cloud Resources.
- IT Reports.

## Purchase

- Suppliers.
- Purchase Requests.
- Purchase Orders.
- Goods Receipts.

## Approval

- Pending Approvals.
- Approval History.
- Approval Configuration.

## Reports

- Marketing.
- Sales.
- CRM.
- Operational.
- Inventory.
- Project.
- Finance.
- NOC.
- IT/DevOps.
- Audit.

## Settings

- Users.
- Roles.
- Permissions.
- Categories.
- Cost Centers.
- Approval Matrix.
- Products.
- Packages.
- SLA.
- Severity.
- Notification Rules.
- Company Settings.
- Integrations.

---

# 61. Hubungan Data Utama

`Marketing Campaign → Lead → Sales → Opportunity → Survey → Quotation → Customer`

`Customer → Subscription → Work Order → Device → Technician`

`Customer Ticket → Incident → NOC Engineer → Work Order → Resolution`

`Alarm → Device → Site → Incident → Outage → Customer Impact`

`Network Incident → Change Request → Implementation → Recovery`

`Project → Material Request → Stock Issue → Project Inventory → Reconciliation`

`Expense → Cost Center → Project/Incident/Change/Deployment`

`Server → Application → Deployment → Monitoring → Incident`

`Development Task → Pull Request → Testing → Deployment → Verification`

`Employee → Access Request → Approval → Access Grant → Expiry/Revoke`

`Application → Backup → Verification → Restore Test`

---

# 62. Acceptance Criteria Utama

## Sales dan CRM

- Setiap lead memiliki owner.
- Lead overdue ditampilkan.
- Riwayat aktivitas tersimpan.
- Quotation memiliki version history.
- Lead dapat dikonversi menjadi customer.
- Sales tidak dapat mengaktifkan layanan manual.

## Inventory

- Serial number duplikat ditolak.
- Perangkat tidak keluar tanpa transaksi.
- Stock negatif ditolak.
- Work order tidak ditutup jika barang outstanding.
- Riwayat perangkat dapat dilihat lengkap.
- Stock opname menghasilkan variance report.

## Petty Cash

- Saldo tidak dapat diedit langsung.
- Saldo negatif ditolak.
- Expense memiliki kategori dan cost center.
- Reimbursement memiliki bukti.
- Cash advance memiliki settlement date.
- Posted transaction tidak dapat dihapus.

## NOC

- Alarm dapat dihubungkan dengan incident.
- Incident memiliki severity dan PIC.
- Durasi outage dihitung otomatis.
- Pelanggan terdampak dapat diidentifikasi.
- Major incident memiliki timeline dan root cause.
- Change memiliki implementation dan rollback plan.
- IP address duplikat ditolak.
- Shift handover dapat didokumentasikan.

## IT/DevOps

- Server dan aplikasi memiliki owner.
- Production deployment memerlukan approval.
- Deployment memiliki version dan release note.
- Rollback dapat dicatat.
- Backup memiliki status dan verification result.
- SSL dan domain memiliki expiry reminder.
- Access request memiliki approval dan expiry.
- Offboarding dapat mencabut akses.

## Security dan Audit

- Seluruh aktivitas sensitif tercatat.
- Pembuat tidak dapat menyetujui transaksi sendiri.
- Permission membatasi akses.
- Export tercatat.
- Audit log tidak dapat dihapus.

---

# 63. Kesimpulan

PerumNet CRM menjadi sumber data utama untuk seluruh kegiatan perusahaan.

Alur utama perusahaan:

`Marketing menghasilkan Lead`

`Sales melakukan Follow-up dan Closing`

`Operational melakukan Survey, Instalasi, dan Pekerjaan Lapangan`

`Warehouse mengontrol Barang dan Perangkat`

`NOC memantau Jaringan, Alarm, Incident, dan Outage`

`IT/DevOps mengelola Aplikasi, Server, Deployment, Backup, dan Akses`

`Finance mengontrol Petty Cash dan Pengeluaran`

`Project Manager mengontrol Material dan Biaya Proyek`

`Management mengontrol Approval, Risiko, dan Kinerja`

Prinsip utama sistem:

- Tidak ada lead tanpa penanggung jawab.
- Tidak ada perangkat tanpa lokasi.
- Tidak ada perangkat tanpa custodian.
- Tidak ada stock keluar tanpa tujuan.
- Tidak ada pengeluaran tanpa kategori dan bukti.
- Tidak ada incident tanpa PIC.
- Tidak ada outage tanpa timeline.
- Tidak ada perubahan jaringan tanpa change record.
- Tidak ada deployment production tanpa approval.
- Tidak ada akses sistem tanpa owner dan expiry.
- Tidak ada backup kritikal tanpa verifikasi.
- Tidak ada transaksi posted yang dapat dihapus.
- Tidak ada aktivitas sensitif tanpa audit trail.

Dengan implementasi sistem ini, PerumNet dapat mengurangi kehilangan perangkat, selisih stock, kesalahan pembukuan, downtime yang tidak terdokumentasi, perubahan konfigurasi tanpa kontrol, serta risiko pengelolaan aplikasi dan server.
