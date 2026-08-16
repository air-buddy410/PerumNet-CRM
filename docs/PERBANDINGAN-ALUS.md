# Perbandingan CRM kita ⇄ ALUS — 17 Agustus 2026

Hasil penelusuran seluruh menu ALUS (`perumnet.alus.co.id`, "PERUMNET Helpdesk
System" buatan lubax). **Hanya membaca — tidak satu tombol pun ditekan, tidak
satu form pun dikirim.** Seluruh halaman dipanen lewat GET.

Dokumen ini menjawab tiga pertanyaan: apa yang ALUS punya dan kita belum, apa
yang kita punya dan ALUS tidak, dan bagaimana SOP PDF (Alur Kerja Lengkap v1.0)
berdiri terhadap keduanya. Rencana pengerjaannya di
[RENCANA-FASE-83-DST.md](RENCANA-FASE-83-DST.md).

## Peta menu ALUS, dipetakan ke rute kita

| ALUS | Rute kita | Keadaan |
|---|---|---|
| Dashboard (tiket, pending invoice, status pelanggan, router, OLT live) | `/dashboard` | Ada, tanpa kartu OLT/ONU live |
| Customer list + trash + create | `/crm/customers`, `/settings/trash` | Setara |
| Customer detail (lihat bagian khusus di bawah) | `/crm/customers/[id]` | **Banyak celah** |
| Job Schedules: TV Wall + list | `/helpdesk/dispatch` | TV Wall belum ada |
| Ticket list (MTTR, group, report, kategori ber-workflow) | `/helpdesk/*` | Setara inti; MTTR & report belum |
| Plans | `/settings/master/packages` | Setara |
| Add-on Services | `/billing/addons` | Setara |
| Sites | `/noc/sites` | Setara |
| ODP / Dist Point + grup + Map (KML import/export, cluster) | `/noc/ftth`, `/noc/map`, `/noc/ftth/kml` | Setara — punya kita kini lebih dalam (lapisan OLT→PON→ODP) |
| OLT — **ONU list live per PON, unconfigured, dyinggasp, LOS, RX dBm, jarak, Configure, Reboot** | `/noc/devices` (sinkron LibreNMS) | **Celah besar: telemetri & provisioning ONU** |
| Distribution Router (PPP secrets, interface, queue, log, import profile, backup schedule) | `/noc/pppoe` (poll sesi) | Celah: tampilan interface/queue, backup config |
| MikroTik Sync (antrean kegagalan sinkron + retry) | — (hanya log worker) | **Celah: UI antrean kegagalan** |
| PPPoE Monitor (refresh 180 dtk) + PPPoE Offline Map | `/noc/pppoe`, `/noc/map` | Setara secara isi (poll kita 120 dtk) |
| Accounting: Merchant, Customer Bill, Invoice, Payment, **Monthly Invoice**, **Job Center**, Bundle Tracking (gateway + payment URL) | `/billing/*` lengkap | **Struktur setara — sengaja MATI (mode baca-saja)** |
| Marketing: Lead Summary ber-workflow, Template Workflow Lead, **Promo & Pengumuman App** | `/sales/leads`, `/sales/pipeline`, `/marketing/campaigns` | Workflow lead ALUS lebih terstruktur; Promo App butuh portal |
| Laporan keuangan: Akun, Jurnal, Buku Besar, Neraca Saldo, Neraca, Laba Rugi, **Arus Kas**, **Perubahan Modal**, **Rasio Keuangan**, Kas & Bank, General Transaction | `/finance/gl/*`, `/finance/cashbooks`, `/finance/transactions` | Hampir setara; kurang: arus kas, perubahan modal, rasio |
| HRD: dashboard, karyawan, **lokasi absen (geofence)**, shift, jadwal, absen harian, rekap, izin/cuti, **lembur** | `/hrd/*` | Setara inti; kurang: lokasi absen, lembur |
| Tools: IP calc, MAC vendor, burst calc | `/noc/ftth/tools` | Kalkulator kecil, prioritas rendah |
| Network Monitor (probe via scheduler MikroTik) | `/noc/probe` | Setara |
| Admin: System Status, User Management, Backup Files, **WA Gateway (multi-sesi + log pesan)**, Logs | `/settings/users`, `/it/backups`, `/audit-log` | **Celah: WhatsApp gateway** |
| **Portal pelanggan + Aplikasi mobile** | `/portal` kita = portal TEKNISI, bukan pelanggan | **Celah terbesar — lihat bawah** |

## Halaman detail pelanggan ALUS — pembanding paling padat

Satu layar ALUS memuat semua ini. Yang dicetak tebal belum ada di kita:

- Identitas + `User PPPOE` + password-nya, plan, billing start, merchant, sales, tags, `Notif by`
- `On Router Status` + tombol ke router, OLT, ODP-nya
- **Panel ONU live** — `ONU Detail 1/17/3:2`, grafik traffic, tombol **Reboot**
- Create/View **Ticket** dan **Invoice** dari halaman itu juga
- **Kirim WA** langsung ke pelanggan
- **Upload File + File List** — arsip berkas per pelanggan (KTP, form)
- **Customer Log** — riwayat perubahan per pelanggan (siapa mengubah apa)
- **Form Berlangganan** (cetak), **Show in Google Maps**, Manage Topology
- **Reset Password Portal Customer** dan **Logout Aplikasi Mobile**

## Aplikasi klien ALUS — terbukti ada, dua bentuk

Bukti dari dalam sistemnya sendiri:

1. **Portal web pelanggan** — tombol *Reset Password Portal Customer* di tiap
   detail pelanggan.
2. **Aplikasi mobile** — tombol *Logout Aplikasi Mobile*, kolom **App** di
   daftar pelanggan (status "Tidak Login App"), dan menu **Promo & Pengumuman
   App** di Marketing (konten promo yang tampil di aplikasi pelanggan).

Kita bisa membangun yang setara. Bentuk paling masuk akal untuk stack kita:
**portal web + PWA** (satu kode, bisa "dipasang" di HP), login per pelanggan,
berisi: status koneksi (dari `linkStatus` yang sudah kita punya), tagihan,
riwayat invoice, promo/pengumuman, dan lapor gangguan → masuk `helpdesk`.
Rinciannya Fase 87 di rencana.

## Yang KITA punya dan ALUS tidak

Arah sebaliknya penting supaya tidak ada yang mengira kita tertinggal total —
cakupan kita jauh lebih lebar:

- **Gudang & inventori penuh** — stok per gudang, serial, custody, opname,
  supplier, retur, recovery perangkat. ALUS tidak punya modul gudang sama sekali.
- **Approval berjenjang + aturan approval**
- **Proyek**, **work order operasional**, **IT asset/akses/mailserver/deployment**
- **NOC dalam** — LibreNMS sync, alarms, incidents, IPAM, links, maintenance,
  changes, KML, peta ber-lapisan OLT→PON→ODP (punya ALUS: ODP + pelanggan saja)
- **Terminasi ber-workflow + pemulihan perangkat**
- **Sales quotation & survey**, **kampanye marketing**, **tutup buku**
- **Audit log lintas modul** (ALUS: log per pelanggan + log user)
- **RBAC granular + masking PII** (ALUS menampilkan password PPPoE terang-terangan)

## Data di ALUS yang belum kita tambang

| Data | Di ALUS | Di kita | Tindakan |
|---|---|---|---|
| **Posisi ONU per pelanggan** (`1/17/3:2`) | 1.700 pelanggan | tidak ada kolomnya | Fase 83 — kolom baru + impor |
| Redaman ODP | per ODP | 442/577 terisi | Fase 83 — lengkapi 135 |
| Isolir date per pelanggan | kolom daftar | belum | Fase 83 |
| Tags pelanggan | ada | belum | Fase 83 (kalau dipakai tim) |
| `Notif by` (kanal notifikasi per pelanggan) | ada | belum | ikut Fase 87 (portal/WA) |
| Berkas per pelanggan (KTP, form) | File List | belum ada tempatnya | Fase 86 |
| 4 pelanggan baru (PN2608…) | ada | belum | Fase 83 |

## Angka dasbor ALUS hari ini (17 Agustus 2026) — patokan rekonsiliasi

```
Customer  : Active 1.579 · Blocked 76 · Inactive 27 · Potential 2  (= 1.684 + 27 + …)
CRM kita  : linkStatus ONLINE 1.576 · DISABLED 97 · OFFLINE 11
Router    : total 1.727 · active 1.605 · offline 22 · disabled 102
Pending Invoice: 689
```

`Blocked 76` (status penagihan) ≠ `DISABLED 97` (keadaan secret di router) —
dua sumbu berbeda. Menyandingkannya per pelanggan adalah pekerjaan Fase 83,
bukan sesuatu yang bisa disimpulkan dari agregat.

## SOP PDF vs kenyataan — ringkas

SOP "Alur Kerja Lengkap v1.0" ditulis dari **PRD v4.0 yang aspirasional**,
bukan dari aplikasi yang ada. Rute yang disebutnya (`/registrations`,
`/warehouse`, `/superpop`, `/legal`, `/fiber`) tidak ada di CRM kita maupun di
ALUS. Isinya bagus sebagai cita-cita arsitektur (gate server-side, snapshot,
segregation of duties, idempotency), tetapi tidak bisa dipakai tim sebagai SOP
harian hari ini.

| Bab SOP | Modul kita | Keadaan |
|---|---|---|
| Customer lifecycle, sales funnel, quote server | sales + crm | Sebagian — belum ada quote engine ber-snapshot & promo |
| Installation + ODP checkpoint (QR, GPS, foto) | operations/work-orders, noc/access-jobs | Belum ada modul checkpoint berevidence |
| Warehouse WO/IRF/DO/STO, slot, serial state | inventory | Inti ada; dokumen IRF/DO/STO & state slot belum |
| ODP health & maintenance | noc/maintenance | Ada, tanpa skor kondisi |
| SUPERPOP rack | — | Belum ada (celah lama yang sudah dicatat) |
| Fiber backbone, core matrix, OTDR | noc/links, ftth | Belum ada (celah lama yang sudah dicatat) |
| Legal & Compliance | — | Belum ada (celah lama yang sudah dicatat) |
| Project DATEK/commissioning | projects | Kerangka ada; audit template/punch/DATEK belum |
| Recovery perangkat | inventory/device-recoveries | **Sesuai** |
| Security, private file, audit | RBAC + audit-log + masking PII | **Sesuai** arah; private-file per pelanggan belum |
| Deployment gate | disiplin tes/deploy kita | Sesuai praktik, belum tertulis |

Keputusan yang diusulkan: **tulis ulang SOP versi CRM** (Fase 90) — memakai
rute yang sungguhan, menandai tiap alur `[SEKARANG]`, `[SETELAH CUTOVER]`,
atau `[FASE X]`, supaya jadi dokumen kerja tim, bukan dokumen cita-cita.
PDF v1.0 tetap disimpan sebagai referensi arsitektur.

## Batas yang menjaga semua ini

**Mode baca-saja tetap berlaku** (`MODE-BACA-SAJA.md`): selama operasional
masih di ALUS, CRM tidak menagih, tidak mengisolir, tidak mengirim pesan.
Semua fase di rencana dibangun *di belakang* batas itu — layar boleh setara,
tombol eksekusinya tetap mati sampai cutover diputuskan pemilik.
