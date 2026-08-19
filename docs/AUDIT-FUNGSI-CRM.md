# Audit fungsi CRM — 19 Agustus 2026

Dikerjakan Opus, **baca-saja**: tidak ada baris yang ditulis, tidak ada
pekerjaan terjadwal yang dinyalakan, tidak ada perintah tulis ke OLT/SNMP,
tidak ada yang menyentuh ALUS. Seluruh angka di bawah berasal dari `count`
dan `groupBy` di basis data produksi `perumnet_crm`, plus pembacaan kode.

Tujuannya menjawab satu pertanyaan: **dari 174 halaman yang ada, mana yang
benar-benar berisi?**

---

## 1. Jawaban singkat

| | |
|---|---|
| Halaman (`page.tsx`) | **174** |
| Berkas service (`src/lib`) | **117** |
| Tabel di basis data | **141** |
| Tabel yang **berisi** | **58** |
| Tabel yang **kosong** | **83** |

Yang berisi terkumpul di **lima kelompok**. Sisanya — sales, helpdesk, IT ops,
keuangan, absensi, proyek, work order, opname, terminasi — nol baris.

**Itu bukan kerusakan.** Tetapi nol punya dua sebab yang berlawanan, dan
membedakannya adalah temuan terpenting audit ini. Lihat §3.

---

## 2. Lima kelompok yang hidup

### 2.1 Pelanggan & langganan

| Tabel | Baris |
|---|---|
| `Customer` | 1.715 |
| `Subscription` | 1.715 |
| `BillingProfile` | 1.715 |
| `Package` | 27 |
| `Area` | 3 |

Sebaran status langganan:

```
ACTIVE=1594 · ISOLATED=88 · INACTIVE=27 · PROSPECT=6
```

⚠️ Dua status terakhir **tidak dikenal kode**. Lihat §4.1 — ini bug.

### 2.2 NOC & FTTH

| Tabel | Baris | |
|---|---|---|
| `PppoeSession` | 1.736 | 1.715 tertaut langganan, **21 yatim**, 1.603 ONLINE |
| `PppoePollRun` | 3.791 | 3.377 SUKSES; gagal terakhir 18 Agu 21:21 |
| `Odp` | 577 | **576 berkoordinat** — tinggal 1 tanpa titik |
| `OdpPort` | 8.632 | terpakai **1.687** (19,5%) |
| `PonPort` | 88 | |
| `OltDevice` | 6 | |
| `NetworkDevice` | 7 | semuanya `ACTIVE` |
| `NetworkPort` | 817 | |
| `NetworkSite` | 6 | |
| `Subnet` | 24 | |
| `NetworkAlarm` | 13 | **0 terbuka** — semuanya sudah `clearedAt` |
| `ProbeTarget` | 7 | 7 aktif, **0 DOWN** |
| `ProbeResult` | 8.694 | |
| `MikrotikRouter` | 1 | `https://192.168.100.1` |

### 2.3 Gudang

| Tabel | Baris |
|---|---|
| `StockTransaction` | 4.034 (+4.034 baris) |
| `Item` | 293 |
| `StockLevel` | 285 |
| `Supplier` | 20 |
| `StockSlotType` | 12 |
| `Warehouse` | 5 |

### 2.4 Identitas & kepegawaian

| Tabel | Baris |
|---|---|
| `Permission` | 118 |
| `RolePermission` | 467 |
| `UserRole` | 32 |
| `User` | 24 |
| `Employee` | 23 |
| `Role` | 17 |
| `Division` | 12 |
| `EmployeeCard` | 2 |

Pegawai per divisi: FIN 7 · NOF 6 · NOC 3 · MGT 2 · MKT 2 · OAC 2 · SLS 1 ·
CS 0 · IT 0 · OPS 0 · PRJ 0 · WH 0.

### 2.5 Sistem

| Tabel | Baris |
|---|---|
| `ScheduledTaskRun` | 21.257 |
| `AuditLog` | 1.996 |
| `IntegrationEvent` | 1.056 |
| `Notification` | 80 |
| `DocumentSequence` | 36 |
| `ScheduledTask` | 12 |
| `Integration` | 2 |

---

## 3. Nol yang disengaja vs nol yang belum terisi

Ini yang paling mudah salah dibaca, dan akibat salahnya mahal.

### 3.1 Sengaja kosong — keuangan

`Invoice=0`, `InvoiceRun=0`, `Payment=0`, `JournalEntry=0`, `CashTransaction=0`,
`Merchant=0`, `DunningPolicy=0`, `ServiceSuspension=0`.

**Ini keadaan yang diinginkan, bukan pekerjaan yang tertinggal.** CRM tidak
menagih karena operasional masih di ALUS. Kalau keduanya berjalan, pelanggan
menerima tagihan dari dua sistem yang tidak saling tahu.

Penjaganya masih tegak — lima pekerjaan berjadwal tetap mati:

```
billing.dunning=f · channels.outbox=f · hrd.contract-lifecycle=f
network.access-jobs=f · termination.effective=f
```

Profil penagihan sudah siap untuk 1.715 langganan. **Satu `InvoiceRun` dan
tagihannya jadi nyata.** Jangan dijalankan untuk "menguji".

### 3.2 Belum dipakai — sisanya

Helpdesk (`CustomerTicket=0`), sales (`Lead`/`Quotation`/`Survey`/`Opportunity`
semuanya 0), IT ops (`ItAsset`/`ItTicket`/`Server`/`Deployment`/`BackupRecord`
= 0), absensi (`Attendance`/`Shift`/`LeaveRequest` = 0), proyek & work order,
opname & slot gudang, terminasi & penarikan perangkat, incident & maintenance
NOC, approval (`ApprovalRequest=0` walau `ApprovalRule=20` sudah terpasang).

Halamannya ada dan matang. Belum ada yang mengisi.

**Dashboard wajib membedakan keduanya.** Menampilkan "Invoice: 0" bersebelahan
dengan "Tiket: 0" tanpa keterangan membuat orang menyimpulkan CRM rusak — atau
lebih buruk, menyalakan penagihan untuk "memperbaiki" angkanya.

---

## 4. Temuan yang perlu diputuskan

### 4.1 BUG — 33 langganan memakai status yang tidak dikenal kode

`src/lib/constants.ts:382` mendaftar enam status:

```
DRAFT · WAITING_INSTALLATION · ACTIVE · ISOLATED · SUSPENDED · TERMINATED
```

Produksi memakai **`INACTIVE` (27 baris)** dan **`PROSPECT` (6 baris)** —
keduanya tidak ada di daftar itu. Datanya masuk lewat impor; kolomnya `String`,
jadi basis data menerimanya tanpa keluhan.

Akibatnya sudah saya telusuri sampai ke pemakainya:

| Tempat | Akibat |
|---|---|
| `crm/subscriptions/page.tsx:72` | dropdown filter dibangun dari `SUBSCRIPTION_STATUSES` → **33 langganan itu tidak bisa disaring** |
| `crm/subscriptions/[id]/page.tsx:47` | `SUBSCRIPTION_TRANSITIONS[sub.status] ?? []` → **tidak ada satu pun transisi ditawarkan**; ke-33 itu beku |
| `src/lib/crm.ts:829` | service menegakkan aturan yang sama, jadi permintaan yang dipaksakan pun ditolak |

Kabar baiknya: penjaganya **benar** — tidak ada lubang keamanan. Yang kurang
adalah kosakatanya.

### ✅ KEPUTUSAN 19 Agustus 2026: **biarkan**

Pemilik produk memutuskan **tidak** mengubah apa pun. Ke-33 langganan itu
memang tidak dioperasikan dari CRM, dan CRM masih baca-saja — jadi status yang
beku tidak menghalangi pekerjaan siapa pun hari ini.

Dua pilihan yang ditolak, dicatat supaya tidak dibahas ulang: menambah
`INACTIVE`/`PROSPECT` ke `SUBSCRIPTION_STATUSES` beserta transisinya, atau
memetakan keduanya ke status yang sudah ada saat impor.

**Yang harus diingat:** ini menunda, bukan menutup. Pada hari cutover — saat
CRM mulai bertindak keluar — ke-33 langganan ini tidak bisa diisolir, tidak
bisa diterminasi, dan tidak muncul di penyaringan mana pun. Siapa pun yang
merencanakan cutover harus membuka kembali bagian ini lebih dulu.

### 4.2 HANDOFF §39 sudah basi — dan menyuruh Luna membangun layar yang tidak perlu

§39 menulis "ODP berkoordinat **526** dari 577" dan menyuruh menampilkan
**"51 ODP tanpa titik sebagai daftar peringatan di samping peta"**.

Angka hari ini: **576 dari 577**. Yang tanpa koordinat tinggal **satu**.

Daftar peringatan untuk satu baris tidak sebanding dengan ruang layarnya.
Perintah "jangan taruh di koordinat tebakan" tetap berlaku dan tidak berubah.

### 4.3 Dashboard tidak memberi tahu apa pun

`src/app/(app)/dashboard/page.tsx` menampilkan empat kartu:

| Kartu | Nilai hari ini | Masalahnya |
|---|---|---|
| User Aktif | 24 | nyaris tidak pernah berubah |
| Role | 17 | tidak pernah berubah |
| Approval Pending | **0** | `ApprovalRequest` nol baris — selalu 0 |
| Aktivitas Audit Hari Ini | berubah | satu-satunya yang hidup |

Ditambah dua panel — "Menunggu Keputusan Anda" dan "Pengajuan Saya" — yang
keduanya **selalu kosong** karena bersumber dari tabel yang sama.

Jadi dari enam blok di dashboard, **satu** yang bergerak. Sementara itu 1.603
sesi PPPoE online, 88 pelanggan terisolir, dan 4.034 mutasi stok tidak muncul
di mana pun.

Loader penggantinya sudah saya buat: `src/lib/dashboard-service.ts`. Layarnya
bagian Luna — lihat HANDOFF §59.

### 4.4 Port FTTH terpakai 19,5%

1.687 dari 8.632. Angka ini sehat, tapi dicatat di sini karena mudah
disalahbaca sebagai "kapasitas hampir habis" kalau kelak hanya jumlah
terpakainya yang ditampilkan tanpa pembanding.

---

## 5. Yang TIDAK diaudit

Jujur soal batasnya:

- **Perilaku tiap halaman saat dibuka** belum diuji satu per satu; audit ini
  memeriksa data dan kode, bukan render 174 halaman di peramban.
- **Jalur tulis** tidak diuji sama sekali — itu justru yang dilarang.
- **RBAC per peran** belum diuji dengan login tiap peran; yang diperiksa hanya
  bahwa 118 permission dan 467 pemetaan role→permission terpasang.
- **Kebenaran angka gudang** (4.034 mutasi) tidak direkonsiliasi dengan
  workbook aslinya.

---

## 6. Ringkas untuk yang tergesa

1. CRM punya 174 halaman; **58 dari 141 tabel berisi**, terkumpul di lima
   kelompok: pelanggan, NOC/FTTH, gudang, identitas, sistem.
2. Keuangan nol **karena disengaja** — jangan "perbaiki".
3. **33 langganan beku** karena status `INACTIVE`/`PROSPECT` tidak dikenal kode
   (§4.1). Diputuskan 19 Agustus: **biarkan** — akan menggigit di hari cutover,
   bukan sekarang.
4. **Dashboard perlu diganti**; loader-nya sudah siap, layarnya tugas Luna.
5. §39 HANDOFF basi: ODP tanpa koordinat tinggal **1**, bukan 51.

---

## 7. Susulan — verifikasi lima bagian peta lama (19 Agustus)

Diperiksa terpisah atas permintaan pemilik produk. Hasilnya di HANDOFF §61.

Ringkasnya: **§49, §52.1, §52.2, §57b, dan §58 semuanya SUDAH selesai** —
judul bagiannya saja yang tidak pernah diperbarui, sehingga selama ini
terhitung sebagai pekerjaan yang menunggu. Yang benar-benar tersisa hanya
**§54** (naikkan `minzoom` ketiga lapisan garis ke 15; sekarang masih 10/10/12).

Ini pola yang sama dengan §4.2 dan dengan catatan CRM di `TUGAS-LUNA.md`:
**daftar pekerjaan yang dibaca dari judul bagian, bukan dari kode, terus
menghitung pekerjaan yang sudah selesai.** Judulnya kini ditandai ✅/⬜.

Sekalian diukur ulang: `loadNetworkMap({})` di produksi kini **562 ms** dan
**834,6 KB** — turun jauh dari catatan §52.3 (4,3 MB / 4,8 detik). 77% dari
sisa muatan itu adalah 1.687 baris pelanggan, dan sebagian besar isinya baru
dipakai setelah satu titik diklik. Memindahkannya ke pemuatan saat diklik
adalah pekerjaan backend yang masih terbuka — dicatat di §61.
