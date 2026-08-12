# PRD Frontend UX — PerumNet CRM

Status: frontend MVP dan kontrak handoff
Pemilik: PerumNet Product & Engineering
Sumber requirement: `docs/PRD-PerumNet-CRM.md`

## 1. Tujuan

Menyediakan antarmuka CRM operasional yang konsisten, cepat dipahami, dan dapat dipakai pada desktop, tablet, serta mobile. Visual NOC dark-teal yang telah disetujui dipertahankan, sementara konten, route, permission, dan workflow tetap menggunakan CRM asli.

Hasil yang dituju:

- navigasi permission-scoped yang mudah dipindai;
- sidebar expanded, collapsed icon-only, dan drawer yang memiliki perilaku jelas;
- pencarian menu/route sebagai MVP;
- snapshot notifikasi in-app yang jujur terhadap ketersediaan data;
- profil pegawai yang membedakan data akun, Employee, akses, kontak, dan identity;
- tidak ada teks keluar card, overlap, tombol terpotong, atau horizontal overflow halaman;
- handoff yang dapat langsung dipakai Opus untuk menyediakan kontrak backend.

## 2. Persona dan kebutuhan

| Persona | Kebutuhan utama |
| --- | --- |
| Staff operasional | Membuka menu yang diizinkan, membaca aktivitas, dan mengakses profil tanpa mempelajari struktur sistem. |
| Sales/CRM | Berpindah cepat antara lead, pipeline, survey, quotation, pelanggan, dan subscription. |
| Gudang/teknisi | Mengenali inventory, perangkat, custody, work order, dan ticket melalui ikon yang bermakna. |
| Finance/management | Membaca status transaksi, approval, notifikasi, dan audit-sensitive state tanpa affordance edit palsu. |
| NOC/IT/HRD | Mengakses modul khusus dengan route dan permission yang sudah diberikan. |
| Administrator | Memakai navigasi penuh dan memahami kapan kontrol akses/password dikelola sistem terpusat. |

## 3. Prinsip dan batas frontend-only

Frontend menggunakan `groups` yang sudah dibentuk oleh layout berdasarkan permission user aktif. Frontend tidak menentukan atau memperluas akses.

Perubahan pada scope ini tidak boleh menyentuh:

- `src/lib/**`, Prisma/schema/migration, database, middleware, auth/session, API route, atau server action;
- aturan approval, immutable posted transaction, stock/saldo, audit trail, dan business rule;
- perubahan Opus yang sudah ada di worktree.

Frontend boleh membaca DTO melalui server component/layout dan memakai action existing yang memang sudah disediakan. Jika kontrak belum tersedia, UI harus menampilkan state pending/empty/error yang jujur, bukan fake data atau optimistic persistence.

## 4. Responsive behavior

Viewport acceptance:

- desktop: 1440×900 dan 1920×1080;
- tablet landscape: 1024×768;
- tablet portrait: 768×1024;
- mobile: 390×844 dan 360×800.

| Mode | Behavior |
| --- | --- |
| Desktop lebar (≥1200px) | Sidebar expanded 264px atau collapsed sekitar 76px. Preferensi collapsed disimpan di `localStorage`. Topbar menampilkan breadcrumb, search rata kanan tepat sebelum notification, dan profile. |
| Tablet | Sidebar tidak dipaksa menyempit. Navigasi dibuka sebagai drawer penuh melalui tombol menu dengan backdrop dan Escape. |
| Mobile | Drawer penuh dengan target sentuh minimal 38px. Search berubah menjadi tombol icon yang membuka field/popover full-width. Topbar tidak boleh memaksa teks panjang berada dalam satu baris. |

Semua mode wajib memiliki `min-width: 0` pada container yang dapat menyusut, wrapping/ellipsis untuk teks panjang, scroll horizontal terkontrol untuk tabel, dan tidak memiliki horizontal overflow pada `body`.

## 5. Dynamic navigation dan icon registry

`SidebarNav` menerima `NavGroup[]` hasil permission filtering dari layout. Group multi-item tetap dapat dibuka/tutup dan otomatis terbuka ketika route aktif berada di dalamnya.

Icon dipilih berdasarkan `href`, bukan satu icon berulang untuk seluruh group. Contoh mapping:

- `/dashboard` → dashboard;
- `/notifications` → bell;
- `/sales/leads`, `/sales/pipeline`, `/sales/surveys`, `/sales/quotations` → target, branch, map, receipt;
- `/crm/customers`, `/crm/subscriptions`, `/crm/terminations` → users, network, ban;
- inventory → stock, transfer, slot, request, return, router, recovery, warehouse, opname;
- Helpdesk/Billing/Finance → ticket, dispatch, invoice, payment, cashbook, closing;
- NOC/IT/HRD/Approval/Settings → siren, server, calendar, approval, settings sesuai makna modul.

Mode collapsed tetap menyediakan `aria-label`, `title`, active state, dan icon group. Tablet/mobile tidak memakai mode collapsed agar keterbacaan dan target sentuh tetap terjaga.

## 6. Sidebar, drawer, dan motion

- expanded: 264px;
- collapsed: 76px, icon-only, transisi lebar sekitar 200–220ms;
- kontrol minimize/expand berada setelah info admin di bagian paling bawah sidebar agar tidak mengganggu logo;
- group expand/collapse: fade/slide ringan sekitar 200–220ms;
- drawer mobile/tablet: backdrop, close button, Escape, close setelah navigasi;
- semua motion harus dinonaktifkan/diperpendek ketika `prefers-reduced-motion: reduce` aktif;
- focus ring harus terlihat pada tombol, link, input, dropdown, dan close control.

State collapsed memakai key `perumnet-crm.sidebar-collapsed`. Nilai ini hanya presentational dan tidak berpengaruh pada permission atau route.

## 7. Peta jaringan dan basemap

Fungsi jaringan pada `/noc/map` sudah tersedia sebagai peta SVG relatif berbasis data database nyata: ODP, customer, cascade ODP, koneksi customer, occupancy, status subscription, filter permission-scoped, detail port, legenda, dan missing-coordinate state.

Basemap geografis fase berikutnya menggunakan **MapLibre GL JS 5.24.0** dengan style/vector tiles dari server internal. Default style URL adalah `/maps/style.json` dan dapat dioverride melalui `NEXT_PUBLIC_MAP_STYLE_URL`. Frontend tidak boleh mengarah ke Google Maps, Mapbox, atau public OSM tile.

Behavior MapLibre:

- pan, zoom, navigation control, fit-to-data, dan attribution dari style internal;
- overlay GeoJSON untuk ODP, customer, cascade, dan customer-to-ODP link;
- warna marker mengikuti occupancy ODP dan status subscription;
- klik ODP/customer membuka popup; popup ODP menyediakan akses ke detail ODP;
- data tetap berasal dari `src/lib/noc-map.ts`, tanpa business rule atau query baru di frontend;
- jika style/tile internal belum tersedia atau gagal dimuat, SVG jaringan mandiri tetap ditampilkan dengan pesan status yang jujur;
- geocoding, current location, realtime tracking, dan entity search bukan bagian fase ini.

Dependency Opus/infrastruktur: sediakan style JSON, vector tile source internal, TLS/CORS yang sesuai, dan attribution/licensing. CRM frontend tidak membuat tile, tidak menyimpan token provider, dan tidak mengubah loader data maps.

## 8. Search MVP

Search pada tahap MVP hanya mencari menu/route yang tersedia dalam `groups` user aktif. Search tidak boleh menampilkan route yang tidak lolos permission.

Behavior:

- filter label, group, dan path;
- klik hasil menavigasikan ke route;
- `Enter` memilih hasil pertama;
- `Escape` menutup popover dan membersihkan state mobile;
- `Ctrl/Cmd + K` memfokuskan search;
- empty state untuk query tanpa hasil;
- mobile memakai popover full-width;
- tidak ada data entity palsu.

Pada desktop dan tablet, field search diratakan ke kanan dan ditempatkan tepat sebelum tombol notification. Pada mobile, trigger icon mempertahankan urutan yang sama dan membuka field full-width agar judul, notification, dan profile tidak bertumpuk.

Entity search untuk pelanggan, tiket, invoice, perangkat, dan entity lain adalah fase berikutnya setelah Opus menyediakan endpoint read-only permission-scoped.

## 9. Notification dropdown MVP

Topbar memiliki tombol bell terpisah dari profile control. Dropdown menampilkan maksimal lima notifikasi terbaru milik user aktif, dengan unread indicator, module, waktu, body singkat, dan link internal yang sudah divalidasi.

Behavior:

- buka/tutup melalui tombol bell;
- klik item menjalankan flow mark-read existing dan membuka link internal;
- tandai semua dibaca menggunakan action existing;
- link “Lihat semua” menuju `/notifications`;
- klik luar, Escape, dan navigasi menutup dropdown;
- snapshot hanya pada page load, tanpa polling/WebSocket;
- empty, error, dan data lebih dari lima ditampilkan secara jujur.

Kategori event yang diharapkan mengikuti PRD utama: Sales/CRM, Inventory, Finance, NOC, IT/DevOps, approval, dan event operasional yang relevan.

## 10. Profile employee data

Halaman `/profile` dibagi menjadi:

1. Identitas akun: nama, username, email, avatar.
2. Data pegawai: NIK/no. pegawai, nama lengkap, jabatan, jenis karyawan, tanggal bergabung, atasan.
3. Role dan level akses: read-only dan tetap mengikuti RBAC.
4. Kontak: nama tampilan dan nomor telepon. Validasi UI sudah disiapkan; persistence menunggu action profile ter-audit dari Opus.
5. Status akun dan source autentikasi.
6. Password: state “akun email terpusat / menunggu integrasi”; tidak memakai `changePasswordAction` lokal sebagai pengganti mailserver.

Email, username, role, divisi, NIK, dan jabatan tidak dapat diedit dari halaman profil. CRM tidak boleh menyimpan, menampilkan, atau mengirim password mailserver sebagai nilai biasa.

## 11. Identity terpusat dan password

SMTP hanya menyediakan pengiriman email, bukan autentikasi atau perubahan password. Opus harus menentukan interface resmi mailserver/LDAP/identity provider.

Frontend hanya mengaktifkan tombol perubahan password jika `auth.passwordChangeAvailable === true` dari kontrak backend. Setelah perubahan password, backend perlu menangani session invalidation, audit log, dan error contract aman. Sampai kontrak tersedia, UI menampilkan status pending dan tidak mengirim password ke CRM.

## 12. Accessibility, performance, dan overflow

- icon-only button selalu memiliki `aria-label` dan tooltip/title;
- active route memakai `aria-current="page"`;
- drawer memakai `aria-expanded`, `aria-controls`, backdrop, dan Escape;
- dropdown memiliki label dan focus state yang terlihat;
- status tidak hanya dibedakan melalui warna; gunakan teks, dot, atau icon;
- tidak menambah dependency browser/Playwright hanya untuk scope ini;
- komponen search dan notification dipisahkan dari shell agar rerender dan ownership tetap jelas;
- tabel lebar memakai wrapper `overflow-x-auto`, bukan mendorong halaman;
- semua card/panel/form/table mengizinkan child menyusut (`min-width: 0`);
- heading, label, body, dan data panjang harus wrap atau ellipsis sesuai konteks;
- motion ringan dan menghormati reduced motion.

## 13. DTO dan handoff untuk Opus

### Notification

```ts
type NotificationPreview = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  module: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

type NotificationMenuData = {
  unreadCount: number;
  items: NotificationPreview[];
  hasMore: boolean;
};
```

Opus menyediakan loader hanya untuk user aktif, memvalidasi `href` sebagai link internal, menjaga limit, dan mempertahankan action `markRead` serta `markAllRead`. Endpoint/action harus tidak membocorkan notifikasi lintas user atau divisi.

### Entity search fase berikutnya

```ts
type SearchResult = {
  id: string;
  type: string;
  module: string;
  title: string;
  subtitle: string | null;
  href: string;
};
```

Endpoint harus permission-scoped, read-only, memiliki limit, aman dari cross-division leakage, dan mengembalikan link internal yang tervalidasi.

### Profile dan identity

```ts
type ProfileView = {
  user: {
    id: string;
    name: string;
    username: string;
    email: string;
    phone: string | null;
    roles: string[];
    level: string;
    divisionName: string | null;
    isActive: boolean;
  };
  employee: {
    employeeNo: string;
    fullName: string;
    jobTitle: string | null;
    employeeType: string;
    joinedAt: string;
    supervisorName: string | null;
  } | null;
  auth: {
    provider: "MAILSERVER" | "LOCAL";
    passwordChangeAvailable: boolean;
  };
};
```

Opus menangani query profile + relasi Employee, update nama/telepon, verifikasi/perubahan password melalui provider resmi, session invalidation, audit log, dan error contract yang tidak membocorkan credential atau detail sensitif.

## 14. QA dan acceptance criteria

### Route

- `/login`, `/dashboard`, `/notifications`, `/profile`;
- route representatif list, detail, form, table, dan print dari Sales, CRM, Inventory, Billing, Finance, NOC, IT, HRD, Approval, dan Settings;
- semua link navigation yang tersedia bagi user aktif;
- inventory yang saat ini memiliki sekitar 150 page files dan 89 navigation href.

### Interaksi

- sidebar expanded/collapsed pada desktop lebar;
- group submenu buka/tutup, active route, dan auto-open;
- drawer, backdrop, Escape, dan close-after-navigation;
- search query, `Ctrl/Cmd + K`, Enter, Escape, hasil, dan empty state;
- notification dropdown, unread state, open item, mark-read flow, mark-all, dan halaman semua;
- profile dropdown, Escape, klik luar, navigation close;
- profile contact validation dan state dependency backend;
- tombol dan dropdown tidak terpotong di viewport.

### Bukti

- tidak ada blank page/framework overlay;
- tidak ada error/warning relevan di console;
- tidak ada horizontal overflow;
- tidak ada teks keluar card;
- screenshot desktop, tablet, dan mobile;
- DOM/bounding-box check untuk tombol, card, tabel, dropdown, dan teks panjang;
- browser QA memakai in-app Browser dengan build/server bersih dan terisolasi dari proses Opus.

## 15. Risiko dan dependency

| Risiko/dependency | Mitigasi |
| --- | --- |
| Loader/action notification belum stabil | Tampilkan empty/error state dan jangan membuat data lokal palsu. |
| Entity search belum memiliki endpoint | MVP tetap menu/route search; entity search ditunda. |
| Mailserver belum memiliki interface perubahan password | Tombol disabled dan handoff `ProfileView.auth` menunggu provider resmi. |
| `CurrentUser` belum memuat phone/Employee | Profile page membaca data presentation secara read-only sampai DTO profile tersedia. |
| Build/dev server berbagi `.next` dengan Opus | Gunakan server/build bersih dan isolated untuk QA. |
| Route baru atau permission berubah | Icon registry memiliki fallback group icon; groups tetap menjadi source of truth. |
| Style/vector tile internal belum tersedia | Gunakan fallback SVG, tampilkan status dependency, dan jangan mengirim request ke provider publik. |
| Tabel/form lama mempunyai utility Tailwind yang beragam | Scoped design aliases, `min-width: 0`, wrapping, dan overflow wrapper diaudit per viewport. |

## 16. Definition of done frontend

Frontend dinyatakan selesai ketika perubahan hanya berada pada komponen/layout/style/profile/map/docs yang disepakati, seluruh batas backend tetap utuh, typecheck/build/test yang relevan lulus, dan bukti browser untuk enam viewport menunjukkan shell, menu, search, notification, profile, map, card, form, dan table tidak rusak.

## 17. Addendum audit responsive table (2026-08-12)

### Temuan audit aktual

Audit mobile terhadap screenshot menemukan dua masalah layout yang berbeda:

1. Rule global `overflow-wrap: anywhere` ikut diterapkan ke `th` dan `td`. Akibatnya kata seperti `KODE`, `STATUS`, `Aktif`, `WhatsApp`, dan nama item terpecah menjadi satu karakter per baris. Masalah ini tampak sebagai tabel rusak walaupun wrapper tabel sudah memiliki scroll.
2. Beberapa halaman memiliki tabel atau form di dalam wrapper bersarang yang mempertahankan lebar konten. Pada viewport 360–390px, pengukuran DOM menemukan `/helpdesk/categories` mencapai `scrollWidth` sekitar 640px dan `/finance/gl/accounts` sekitar 695px; pada tablet 1024px, `/finance/gl/accounts` masih terukur sekitar 1103px. Ini merupakan overflow halaman, bukan sekadar scroll tabel.
3. Pada `/inventory/returns` viewport 360px, judul `Pengembalian Material` memiliki `scrollWidth` lebih besar daripada lebar visual heading ketika tombol aksi masih berada pada baris yang sama. Page header harus menumpuk pada layar sempit.

### Kontrak responsive table

- Tabel non-print berada di dalam wrapper `.overflow-x-auto` atau `.overflow-auto` yang memiliki `width: 100%`, `max-width: 100%`, `min-width: 0`, dan `box-sizing: border-box`.
- Wrapper boleh melakukan horizontal scroll terkontrol pada mobile. Scroll tabel tidak boleh memperlebar `body` atau card induk.
- Tabel memakai `width: max-content` dan `min-width: 100%` agar kolom tetap memiliki lebar natural dan dapat digeser ketika total kolom lebih lebar daripada viewport.
- `th` dan `td` memakai `overflow-wrap: normal`, `word-break: normal`, dan `hyphens: none`. Pemenggalan kata arbitrer tidak boleh digunakan di dalam tabel; teks membungkus pada spasi secara natural.
- Link, button, badge, status, dan action cell memakai `white-space: nowrap` agar tidak berubah menjadi label vertikal. Konten deskriptif yang panjang tetap boleh membungkus pada batas kolomnya.
- Grid child, `.space-y-*`, form, card, dan panel yang berada di dalam layout CRM wajib memiliki `min-width: 0` bila dapat menerima konten tabel atau form.
- Form dengan layout dua kolom menumpuk menjadi satu kolom pada layar sempit, sehingga input, select, dan tombol tidak memaksa card melebar.
- Pada lebar sampai 480px, `.crm-page-header` menjadi vertikal. Judul mengambil lebar penuh, sedangkan tombol/badge aksi turun ke baris berikutnya dan tidak boleh lebih lebar daripada viewport.
- Tabel pada halaman print termination tetap memakai layout print khusus dan dikecualikan dari kontrak scroll mobile.

### Scope route audit screenshot

Acceptance scope prioritas mengikuti screenshot yang diberikan:

`/inventory/returns`, `/inventory/items`, `/inventory/warehouses`, `/helpdesk/categories`, `/finance/cashbooks`, `/finance/gl/accounts`, `/noc/alarms`, `/noc/pppoe`, `/channels/templates`, `/approval-rules`, `/settings/users`, `/settings/scheduler`, `/settings/master/packages`, dan `/audit-log`.

Sweep lanjutan mencakup `/login`, `/dashboard`, `/notifications`, `/profile`, route list/detail/form/table/print Sales, CRM, Inventory, Billing, Finance, NOC, IT, HRD, Approval, Settings, serta seluruh page file yang merender `<table>`. Tabel detail/report non-print yang sebelumnya belum memiliki wrapper wajib diberi wrapper. KML preview boleh mempertahankan wrapper `overflow-auto` yang sudah ada. Print termination tidak diubah.

### Bukti QA yang wajib diulang

QA dijalankan pada 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan 360×800 menggunakan production build/server yang terisolasi dari proses Opus.

Untuk setiap route yang diaudit, browser harus memeriksa:

- `document.documentElement.scrollWidth` dan `document.body.scrollWidth` tidak melebihi `innerWidth`;
- setiap tabel non-print memiliki ancestor scroll yang tetap berada di dalam card;
- right edge wrapper, card, heading, button, dropdown, dan form tidak melewati viewport;
- heading dan action pada PageHeader tidak overlap;
- header/row tabel tidak lagi pecah satu huruf per baris;
- horizontal scroll tabel tetap dapat digunakan untuk mencapai kolom/action yang berada di luar viewport awal;
- form satu/two-column, input, select, dan tombol tetap berada dalam card;
- tidak ada teks keluar card, blank page, framework overlay, atau console error/warning relevan.

Bukti akhir harus mencakup screenshot ulang desktop, tablet, dan mobile serta hasil DOM/bounding-box untuk card, wrapper, tabel, heading, tombol, dropdown, dan teks panjang. Jika satu bug ditemukan, bug diperbaiki lalu sweep pada route dan viewport terkait diulang sebelum hasil dinyatakan bersih.

### Batas perubahan dan handoff Opus

Perbaikan addendum ini frontend-only. Tidak ada perubahan pada backend, API, DTO, auth/session, RBAC, database, Prisma, Server Action, middleware, atau business rule. Kontrak notification, profile, centralized identity, entity search, dan maps pada bagian handoff tetap tidak berubah. Opus hanya perlu mempertahankan kontrak tersebut ketika menyediakan data/action backend; tidak ada endpoint baru yang dibutuhkan untuk memperbaiki responsive table.

## 18. UI Microcopy

Subjudul pada `PageHeader` dan `MasterCrud` adalah teks operasional untuk pengguna, bukan daftar referensi requirement. Subjudul harus menjelaskan fungsi halaman, alur kerja, status, atau batasan yang perlu dipahami staf dengan bahasa yang ringkas dan mudah dipindai.

- Referensi internal seperti `PRD §...`, `DESIGN-PHASE`, `gap`, `business rule`, `rule`, `Phase`, `NFR`, dan nomor section tidak boleh tampil pada subjudul UI produksi.
- Makna business rule tetap disampaikan secara langsung, misalnya stok berubah melalui transaksi resmi, transaksi posted tidak dapat diedit, approval diperlukan, atau audit log tidak dapat diubah.
- Nilai dinamis seperti jumlah data, status, total nominal, counter antrean, dan informasi permission tetap boleh ditampilkan setelah deskripsi utama.
- Istilah domain yang membantu pekerjaan seperti SLA, workflow, NOC, ODP, invoice, custody, rollback, dan backup tetap dipertahankan bila relevan.
- Judul halaman, route, permission, query, DTO, action, dan business rule tidak berubah akibat penyelarasan copy ini.

Acceptance untuk microcopy:

- Seluruh atribut JSX `subtitle` pada route aplikasi bebas dari referensi requirement internal.
- Subjudul tetap menjelaskan tujuan atau batasan halaman tanpa mengubah perilaku proses.
- Subjudul tidak keluar card, tidak overlap dengan action `PageHeader`, dan tetap terbaca pada desktop, tablet, serta mobile.
- Perubahan hanya berada pada frontend page copy dan dokumentasi UX; handoff notification, profile, identity, entity search, dan maps ke Opus tetap tidak berubah.

## 19. Ticket Wall Dashboard

### Tujuan dan route

`/helpdesk/dispatch` menjadi **Ticket Wall Dashboard** untuk layar TV ruang operasional. Route dan permission existing dipertahankan; label navigasi ditampilkan sebagai `Ticket Wall`.

Wallboard berfokus pada progres pekerjaan tim berdasarkan data `CustomerTicket` dan `WorkOrder` yang sudah tersedia. Tampilan utama berupa grid kartu pekerjaan, bukan board kolom per engineer.

### Visual fullscreen

- Presentation surface menggunakan dark-teal NOC yang kontras, modern, dan dapat dibaca dari jarak TV.
- Header menampilkan judul, jam WITA, indikator LIVE, waktu pembaruan terakhir, serta tombol fullscreen.
- Browser Fullscreen API digunakan pada root wallboard. Jika tidak tersedia, layout tetap memakai tinggi viewport dengan pesan yang jujur.
- Desktop/TV memakai tiga kolom kartu; tablet dua kolom; mobile satu kolom.
- Status summary memakai warna semantik sekaligus teks status sehingga warna bukan satu-satunya penanda.
- Animasi ringan wajib menghormati `prefers-reduced-motion`.

### Filter dan refresh

- Filter tanggal `Dari` dan `Sampai` default ke hari berjalan berdasarkan zona waktu `Asia/Makassar`.
- Filter tambahan: status, kategori, tag, dan engineer.
- Tombol `Terapkan`, `Reset`, dan `Refresh` harus memiliki target sentuh yang jelas dan tidak keluar viewport.
- Refresh otomatis dilakukan setiap 60 detik ketika tab terlihat; refresh berhenti sementara ketika tab tidak aktif.
- Ringkasan status mengikuti filter tanggal, kategori, tag, dan engineer. Filter status menyaring kartu tanpa menghilangkan distribusi status pada summary.

### Isi kartu pekerjaan

Kartu tiket menampilkan nomor, judul, pelanggan, nomor telepon termasking, kategori, tag, status, prioritas, engineer, dan jadwal bila tersedia. Nomor telepon pada TV Wall wajib dimasking dan hanya menampilkan awalan terbatas serta empat digit terakhir.

Kategori instalasi, troubleshoot, maintenance, outage, dan kategori lain berasal dari master `TicketCategory` atau tag aktual. Frontend tidak membuat enum kategori baru.

Jika kategori memiliki workflow, kartu menampilkan workflow name, step selesai/berjalan/menunggu, dan persentase yang dihitung dari `TicketStepProgress`. Jika workflow belum tersedia, kartu menampilkan `Progress workflow belum tersedia`; frontend tidak membuat progress buatan.

Work order ditampilkan dengan penanda `WO`, engineer, customer, jenis, status, jadwal, dan link detail. Work order tidak diberi persentase workflow jika sumber progress memang belum tersedia.

### View model internal

Komponen client menerima snapshot serializable dari route server. Bentuk minimumnya:

```ts
type TicketWallStep = {
  id: string;
  label: string;
  state: "DONE" | "CURRENT" | "PENDING";
};

type TicketWallItem = {
  kind: "TICKET" | "WORK_ORDER";
  id: string;
  number: string;
  title: string;
  customerName: string | null;
  maskedPhone: string | null;
  categoryName: string | null;
  tags: string[];
  status: string;
  priority: string | null;
  engineerName: string | null;
  assignedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  href: string | null;
  workflow: {
    name: string;
    percentage: number;
    steps: TicketWallStep[];
  } | null;
};

type TicketWallSnapshot = {
  generatedAt: string;
  from: string;
  to: string;
  statusCounts: Record<string, number>;
  totalCount: number;
  items: TicketWallItem[];
};
```

Snapshot tidak menjadi public API baru. Jika loader nantinya dipindahkan ke service/endpoint oleh Opus, endpoint harus permission-scoped, read-only, membatasi link internal, dan memakai bentuk data yang setara.

### Permission dan batas backend

- Akses route tetap memakai `ctickets.view`.
- Work order hanya dikirim jika user memiliki `work_orders.view` dan tetap mengikuti scope engineer/role yang sudah ada.
- Tidak ada permission baru, schema baru, action baru, atau endpoint baru untuk frontend TV Wall.
- Query route tidak boleh menampilkan tiket lintas scope user.
- Perubahan ini tidak menyentuh `src/lib/**`, Prisma, auth/session, RBAC, middleware, API route, Server Action, atau business rule.

### Handoff WFM

WFM adalah fase berikutnya. TV Wall saat ini hanya menggunakan assignment engineer, jadwal, status tiket, dan workflow progress yang sudah tersimpan.

WFM nantinya dapat menambahkan status kerja mulai/berhenti, durasi perjalanan, lokasi, GPS, dan tracking aktivitas engineer. Field tersebut tidak boleh dipalsukan atau ditampilkan sebagai placeholder aktif pada TV Wall sebelum kontrak WFM tersedia.

### Acceptance criteria TV Wall

- `/helpdesk/dispatch` menampilkan status summary Open, In Progress, Pending, Solved, Closed, dan Total.
- Filter tanggal, status, kategori, tag, dan engineer bekerja tanpa data palsu.
- Fullscreen dapat dibuka dan ditutup, dengan fallback saat browser tidak mendukungnya.
- Auto-refresh 60 detik tidak berjalan ketika tab tersembunyi.
- Kartu workflow menghitung persentase dari step yang selesai dan menampilkan state setiap step.
- Tiket tanpa workflow, tanpa engineer, tanpa jadwal, dan tanpa hasil filter memiliki state yang jujur.
- Nomor telepon selalu termasking.
- Kartu dapat membuka detail tiket/work order melalui link internal.
- Tidak ada horizontal overflow, teks keluar card, overlap, blank page, framework overlay, atau console error.
- QA dilakukan pada 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan 360×800.

## 20. Handoff Backend ke Frontend — 12 Agustus 2026

Bagian ini mencatat pekerjaan frontend yang mengikuti `docs/HANDOFF-BACKEND-KE-FRONTEND.md`. Implementasi hanya mengonsumsi kontrak yang sudah tersedia dari backend; tidak ada perubahan pada API, DTO, server action, database, auth, RBAC, atau `src/lib/**`.

### Integrasi kontrak siap pakai

- Notifikasi menggunakan `notificationMenuData(user.id)`, menampilkan maksimal lima item, unread count, module, waktu, `hasMore`, dan hanya membuka `href` internal yang tersedia.
- Search menggabungkan menu yang sudah permission-scoped dengan `GET /api/search?q=...`. Entity search berjalan mulai dua karakter, memakai debounce, membatalkan request lama, dan memiliki loading, empty, serta error state.
- Profile menggunakan `profileView(user.id)`. Nama dan telepon diedit melalui `updateContactAction`; email, username, role, divisi, NIK, dan jabatan tetap read-only.
- Password mengikuti provider aktual: `LOCAL` dapat menampilkan form jika `passwordChangeAvailable` true; `MAILSERVER` menampilkan identity terpusat dan tidak mengirim password melalui CRM.

### Status PPPoE pada peta

- `/noc/map` memiliki filter router dan `ONLINE`, `OFFLINE`, `DISABLED`, `UNKNOWN`.
- Summary memakai `linkCounts` untuk titik yang sedang terlihat dan menampilkan `lastSyncedAt`; nilai kosong disebut `belum tersedia`.
- Marker, garis koneksi, popup, legenda, MapLibre, dan SVG fallback memakai status link yang sama. `UNKNOWN` tidak boleh disamakan dengan offline.
- Popup pelanggan menampilkan nomor layanan, status subscription, status link, router, dan waktu terakhir terlihat.

### Recovery backoffice

- Daftar recovery menyediakan filter teknisi, pencarian nomor recovery/pelanggan/serial/MAC, ringkasan selesai/SLA/mismatch, dan penyaringan tugas teknisi.
- Checklist inspeksi memakai jawaban eksplisit `Ya`/`Tidak`; simpan baru aktif setelah seluruh butir dari `INSPECTION_CHECKLIST` terjawab. Nilai dikirim kompatibel sebagai `on`/`off`.
- Evidence menggunakan `ATTEMPT`, `PICKUP`, dan `INSPECTION`, multipart dengan JPG/PNG/WebP/PDF maksimal sesuai kontrak. Preview yang gagal menampilkan pesan jujur; file privat dibuka melalui `/api/files/<id>`.
- Tanda tangan memakai `signPickupAction` dan nama penanda tangan. UI tidak membuat signature canvas karena kontrak upload signature khusus belum tersedia.
- Form kunjungan mencoba geolocation browser secara opsional. Penolakan atau ketiadaan geolocation tidak memblokir penyimpanan kunjungan.
- Customer 360 menampilkan `Ajukan Terminasi` hanya jika user memiliki `termination.create`, subscription belum terminated, dan belum memiliki proses terminasi aktif.

### Portal teknisi

- `/portal/recoveries` dan `/portal/recoveries/[id]` memakai permission existing `device_recovery.pickup` dan menyaring recovery berdasarkan teknisi aktif yang ditugaskan.
- Kartu mobile menampilkan pelanggan, alamat, jadwal, SLA, status, dan progress perangkat. Detail menyediakan kunjungan, geolocation opsional, serial/MAC aktual, catatan mismatch, evidence, tanda tangan, dan konfirmasi pemutusan fisik.
- Portal material `/portal` tetap dipertahankan. Tidak ada status GPS, start/stop kerja, durasi perjalanan, atau tracking realtime yang dipalsukan; data tersebut menunggu fase WFM.

### Dependency dan handoff ke Opus

- Action recovery tetap harus menegakkan scope teknisi di server, bukan hanya melalui filter UI.
- Jika tanda tangan gambar wajib secara hukum/operasional, backend perlu menyediakan action upload signature yang mengembalikan `attachmentId`.
- Redirect action recovery yang masih menuju halaman backoffice perlu dievaluasi bila portal teknisi membutuhkan kembali ke detail portal setelah submit.
- Kontrak notification, profile, identity, search, dan maps tidak berubah karena pekerjaan frontend ini.

### Acceptance QA handoff

- Search: menu/entity, permission scope, debounce, cancellation, loading, empty, error, Enter, Escape, dan Ctrl/Cmd+K.
- Notification: loader resmi, unread state, maksimal lima item, link null aman, mark read/mark all, dan navigation close.
- Map: filter router/status, empat hitungan link, timestamp, popup, legenda, fallback, dan tidak ada request provider publik.
- Recovery: tri-state checklist, bukti valid/invalid, placeholder file gagal, geolocation non-blocking, filter serial/MAC/teknisi, dan terminasi permission-aware.
- Portal: hanya tugas teknisi aktif yang terlihat dan seluruh tombol/form tetap terbaca pada desktop, tablet, dan mobile.
- Viewport wajib: 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan 360×800. Bukti mencakup bounding-box, `document.scrollWidth`, console, screenshot, typecheck, test, build terisolasi, dan `git diff --check`.
