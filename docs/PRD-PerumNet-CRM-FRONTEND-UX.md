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

`SidebarNav` menerima `NavGroup[]` hasil permission filtering dari layout. Semua group yang memiliki item, termasuk group dengan satu item, tetap dapat dibuka/tutup dan otomatis terbuka ketika route aktif berada di dalamnya.

Icon dipilih berdasarkan `href`, bukan satu icon berulang untuk seluruh group. Contoh mapping:

- `/dashboard` → dashboard;
- `/notifications` → bell;
- `/sales/leads`, `/sales/pipeline`, `/sales/surveys`, `/sales/quotations` → target, branch, map, receipt;
- `/crm/customers`, `/crm/subscriptions`, `/crm/terminations` → users, network, ban;
- inventory → stock, transfer, slot, request, return, router, recovery, warehouse, opname;
- Helpdesk/Billing/Finance → ticket, dispatch, invoice, payment, cashbook, closing;
- NOC/IT/HRD/Approval/Settings → siren, server, calendar, approval, settings sesuai makna modul.

Mode collapsed tetap menyediakan `aria-label`, `title`, active state, icon group, chevron parent, serta rail/indentasi submenu agar parent dan submenu tidak terlihat sebagai satu level. Tablet/mobile tidak memakai mode collapsed agar keterbacaan dan target sentuh tetap terjaga.

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

Basemap geografis menggunakan **MapLibre GL JS 5.24.0** sebagai renderer dengan style default di `/maps/style.json`. Style default memakai satu sumber raster OpenStreetMap dan dapat dioverride melalui `NEXT_PUBLIC_MAP_STYLE_URL`. Frontend tidak memakai Google Maps, Mapbox, atau provider tile lain.

Behavior MapLibre:

- pan, zoom, navigation control, fit-to-data, dan attribution OpenStreetMap melalui `AttributionControl`;
- kontrol tampilan eksplisit untuk memusatkan ulang data dan masuk/keluar fullscreen, dengan target sentuh dan keyboard yang aman;
- overlay GeoJSON untuk ODP, customer, cascade, dan customer-to-ODP link;
- warna marker mengikuti occupancy ODP dan status subscription;
- klik ODP/customer membuka popup; popup ODP menyediakan akses ke detail ODP;
- data tetap berasal dari `src/lib/noc-map.ts`, tanpa business rule atau query baru di frontend;
- jika style/tile basemap gagal dimuat, SVG jaringan mandiri tetap ditampilkan dengan pesan status yang jujur;
- geocoding, current location, realtime tracking, dan entity search bukan bagian fase ini.

Dependency peta: penggunaan tile OpenStreetMap harus mematuhi attribution dan kebijakan penggunaan OSM. CRM frontend tidak melakukan geocoding, tidak mengirim koordinat customer ke layanan pencarian publik, tidak menyimpan token provider, dan tidak mengubah loader data maps.

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
| Basemap OpenStreetMap gagal dimuat | Gunakan fallback SVG dan tampilkan status dependency secara jujur. |
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

## 31. Audit Total Responsive — Tabel, Microcopy, dan Hydration

Audit frontend production dilakukan pada 127 route statis dengan viewport 1440×900,
1920×1080, 1024×768, 768×1024, 390×844, dan 360×800. Dynamic route dengan ID
`demo` dianggap placeholder dan harus diuji ulang memakai ID data nyata.

### Temuan dan perbaikan

- Pada 14 halaman list, `TableControls` sebelumnya menjadi kolom kedua dari grid
  dua kolom. Akibatnya label `Tampilkan`, `Urutkan`, dan pagination menyempit hingga
  pecah satu karakter per baris. Tabel dan kontrol sekarang berada dalam
  `.crm-list-column` yang sama; panel form tetap berada di kolom kanan pada layar lebar.
- `.crm-list-column` wajib memiliki `min-width: 0`, lebar penuh, dan jarak vertikal
  yang konsisten. Kontrol tabel wajib berada di bawah card tabel, bukan di sampingnya.
- Tabel tetap memakai `width: max-content`, `min-width: 100%`, dan horizontal scroll
  terkontrol. Kolom action, badge, dan tombol tidak boleh menjadi teks vertikal.
- Copy produksi tidak boleh menampilkan nomor section PRD, `business rule`, `Phase`,
  `NFR`, atau istilah perencanaan internal. Constraint tetap dijelaskan secara
  operasional, misalnya bukti wajib sebelum posting, owner wajib sebelum status maju,
  dan persetujuan wajib sebelum write-off.
- Formatter UI memakai locale `id-ID` dan timezone `Asia/Makassar` yang eksplisit.
  Format tanggal client dan server tidak boleh bergantung pada timezone browser.
  `suppressHydrationWarning` tidak digunakan untuk menutupi mismatch.
- Judul topbar untuk `/profile` dan `/notifications` berasal dari route title override
  sehingga tidak fallback ke `Dashboard`.

### Acceptance dan bukti QA

Untuk setiap viewport, browser audit wajib memeriksa:

- `document.scrollWidth <= innerWidth`;
- right edge card, wrapper, heading, tombol, dropdown, form, logo, dan icon tidak
  melewati viewport atau parent card;
- `TableControls` memiliki parent `.crm-list-column` yang sama dengan card tabel;
- select, sorting, page size, dan pagination tetap dapat digunakan tanpa kehilangan
  filter/query;
- tidak ada teks satu karakter per baris di luar kebutuhan tabel dan tidak ada asset
  image dengan `naturalWidth === 0`;
- tidak ada framework overlay, React hydration error, blank page, atau console error
  relevan;
- screenshot desktop, tablet, dan mobile diambil ulang setelah setiap perbaikan.

Route production yang mengembalikan 404 tetapi memiliki source lokal,
`/finance/transactions/new`, `/inventory/transactions/new`, dan
`/it/identity-groups`, harus diverifikasi terhadap build/deployment aktif. Placeholder
dynamic `/demo` tidak dianggap sebagai defect. Berkas dirty atau untracked milik Opus
tidak boleh diubah untuk menutup gap deployment.

Perbaikan bagian ini frontend-only dan tidak mengubah API, DTO, `src/lib/**`, Prisma,
database, auth, RBAC, middleware, Server Action, atau business rule.

## 20. Handoff Backend ke Frontend — 12 Agustus 2026

Bagian ini mencatat pekerjaan frontend yang mengikuti `docs/HANDOFF-BACKEND-KE-FRONTEND.md`. Implementasi hanya mengonsumsi kontrak yang sudah tersedia dari backend; tidak ada perubahan pada API, DTO, server action, database, auth, RBAC, atau `src/lib/**`.

### Integrasi kontrak siap pakai

- Notifikasi menggunakan `notificationMenuData(user.id)`, menampilkan maksimal lima item, unread count, module, waktu, `hasMore`, dan hanya membuka `href` internal yang tersedia.
- Search menggabungkan menu yang sudah permission-scoped dengan `GET /api/search?q=...`. Entity search berjalan mulai dua karakter, memakai debounce, membatalkan request lama, dan memiliki loading, empty, serta error state.
- Profile menggunakan `profileView(user.id)`. Nama dan telepon diedit melalui `updateContactAction`; email, username, role, divisi, NIK, dan jabatan tetap read-only.
- Password mengikuti `auth.passwordChangeAvailable`: `LOCAL` dan `MAILSERVER` dapat menampilkan form bila nilainya `true`; perubahan MAILSERVER dijelaskan sebagai perubahan password email yang juga dipakai CRM dan webmail. `OIDC` menampilkan identity provider dan menyembunyikan form lokal.

### Status PPPoE pada peta

- `/noc/map` memiliki filter router dan `ONLINE`, `OFFLINE`, `DISABLED`, `UNKNOWN`.
- Summary memakai `linkCounts` untuk titik yang sedang terlihat dan menampilkan `lastSyncedAt`; nilai kosong disebut `belum tersedia`.
- Marker, garis koneksi, popup, legenda, MapLibre, dan SVG fallback memakai status link yang sama. `UNKNOWN` tidak boleh disamakan dengan offline.
- Popup pelanggan menampilkan nomor layanan, status subscription, status link, router, dan waktu terakhir terlihat.
- Lapisan site POP/Mini-POP, simpul MS/ODP, dan jalur feeder/distribution/drop/other ikut ditampilkan. Jalur dibedakan melalui warna dan ketebalan; panjang jalur selalu diberi label sebagai perkiraan geometri survey.
- `/noc/ftth` menggunakan pemilih koordinat MapLibre internal saat style tersedia. Input latitude/longitude manual tetap menjadi fallback ketika style atau tile internal belum tersedia.

### Recovery backoffice

- Daftar recovery menyediakan filter teknisi, pencarian nomor recovery/pelanggan/serial/MAC, ringkasan selesai/SLA/mismatch, dan penyaringan tugas teknisi.
- Checklist inspeksi memakai jawaban eksplisit `Ya`/`Tidak`; simpan baru aktif setelah seluruh butir dari `INSPECTION_CHECKLIST` terjawab. Nilai dikirim kompatibel sebagai `on`/`off`.
- Evidence menggunakan `ATTEMPT`, `PICKUP`, dan `INSPECTION`, multipart dengan JPG/PNG/WebP/PDF maksimal sesuai kontrak. Preview yang gagal menampilkan pesan jujur; file privat dibuka melalui `/api/files/<id>`.
- Tanda tangan memakai `signPickupAction`, nama penanda tangan, dan gambar PNG/JPG opsional melalui `signatureFile`; attachment yang tersedia dapat dibuka melalui `/api/files/<id>`.
- Form kunjungan mencoba geolocation browser secara opsional. Penolakan atau ketiadaan geolocation tidak memblokir penyimpanan kunjungan.
- Customer 360 menampilkan `Ajukan Terminasi` hanya jika user memiliki `termination.create`, subscription belum terminated, dan belum memiliki proses terminasi aktif.

### Portal teknisi

- `/portal/recoveries` dan `/portal/recoveries/[id]` memakai permission existing `device_recovery.pickup` dan menyaring recovery berdasarkan teknisi aktif yang ditugaskan.
- Kartu mobile menampilkan pelanggan, alamat, jadwal, SLA, status, dan progress perangkat. Detail menyediakan kunjungan, geolocation opsional, serial/MAC aktual, catatan mismatch, evidence, tanda tangan, upload gambar tanda tangan opsional, dan konfirmasi pemutusan fisik.
- Semua form aksi portal mengirim token `origin=portal`, bukan URL, agar redirect server kembali ke detail portal tanpa membuka open redirect.
- Portal material `/portal` tetap dipertahankan. Tidak ada status GPS, start/stop kerja, durasi perjalanan, atau tracking realtime yang dipalsukan; data tersebut menunggu fase WFM.

### Dependency dan handoff ke Opus

- Action recovery tetap harus menegakkan scope teknisi di server, bukan hanya melalui filter UI.
- Gambar tanda tangan tetap opsional sesuai kontrak Fase 48. Jika nanti diwajibkan secara hukum/operasional, validasi kewajiban perlu disepakati dan ditegakkan backend.
- Token redirect `origin` harus tetap dibatasi pada daftar server-side (`portal` atau `backoffice`); frontend tidak boleh mengirim URL tujuan.
- Kontrak notification, profile, identity, search, dan maps tidak berubah karena pekerjaan frontend ini.

### Acceptance QA handoff

- Search: menu/entity, permission scope, debounce, cancellation, loading, empty, error, Enter, Escape, dan Ctrl/Cmd+K.
- Notification: loader resmi, unread state, maksimal lima item, link null aman, mark read/mark all, dan navigation close.
- Map: filter router/status, empat hitungan link, timestamp, popup, legenda, POP/MS/ODP, routeType, coordinate picker, fallback, dan tidak ada request provider publik.
- Recovery: tri-state checklist, bukti valid/invalid, placeholder file gagal, geolocation non-blocking, filter serial/MAC/teknisi, upload tanda tangan opsional, origin portal, dan terminasi permission-aware.
- Portal: hanya tugas teknisi aktif yang terlihat, semua aksi kembali ke detail portal, dan seluruh tombol/form tetap terbaca pada desktop, tablet, dan mobile.
- Viewport wajib: 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan 360×800. Bukti mencakup bounding-box, `document.scrollWidth`, console, screenshot, typecheck, test, build terisolasi, dan `git diff --check`.

## 21. Audit Ulang Handoff Opus — 12 Agustus 2026

Pemeriksaan ulang terhadap `docs/HANDOFF-BACKEND-KE-FRONTEND.md` menemukan bahwa checklist Ya/Tidak, filter recovery teknisi dan serial/MAC, tombol terminasi Customer 360, portal recovery, data pegawai, akun beku, arsip, mailserver, dan mailbox sudah tersedia di checkout. Gap yang ditutup pada audit ulang ini adalah:

- seluruh form portal recovery mengirim token `origin=portal` agar redirect tetap berada di portal;
- upload gambar tanda tangan PNG/JPG opsional dipasang pada portal dan backoffice, beserta tautan attachment privat;
- visual peta memakai data `sites`, `routes`, dan `odps[].role` yang sudah tersedia, termasuk perbedaan POP/Mini-POP, MS/ODP, routeType, dan panjang jalur sebagai perkiraan;
- pemilih koordinat internal dipasang pada form ODP FTTH dengan input manual sebagai fallback.

Tidak ada perubahan pada API, DTO, action, `src/lib/**`, database, auth, RBAC, atau business rule. Keputusan provider identity (`LOCAL` versus `MAILSERVER`) tetap menjadi keputusan PO/infrastruktur; frontend mengikuti nilai `profileView().auth` yang aktual.

## 22. Audit Ulang Seluruh PRD Opus — Implementasi Frontend Tambahan

Audit lanjutan terhadap seluruh PRD/handoff Opus menutup empat kebutuhan frontend yang belum tersedia:

- `/hrd/employees/[id]` menampilkan identitas, data pekerjaan, kontrak, struktur atasan, status akun, frozen account, dan form perubahan dengan permission HRD yang sudah ada.
- `/noc/probe` memiliki refresh manual, refresh browser otomatis setiap 30 detik saat tab aktif, status waktu pembaruan, serta alarm suara opsional yang default-nya nonaktif. Alarm suara hanya berjalan setelah pengguna mengaktifkannya dan hanya memberi sinyal bila jumlah target DOWN bertambah.
- Grup `Portal Lapangan` selalu menyediakan `Portal Material`; `Penarikan Saya` tetap muncul hanya untuk user dengan permission `device_recovery.pickup`.
- `/inventory/transactions/[id]/print` menyediakan layout IRF A4 dengan rincian item/serial, gudang, custodian, tujuan, dan tanda tangan yang sudah tercatat. Link cetak muncul pada detail transaksi setelah IRF terbit.

### Batas kontrak dan pekerjaan tertunda

- Profile tetap menggunakan DTO `profileView` resmi; field HR tambahan tidak diambil langsung dari database pada halaman profile.
- UI OIDC/Authentik menunggu provider `OIDC`, URL IdP, dan kontrak redirect resmi dari Opus/infrastruktur.
- Upload gambar tanda tangan IRF dan lampiran vendor warehouse belum ditambahkan karena action/endpoint backend yang dibutuhkan belum tersedia. Tanda tangan IRF yang sudah memiliki nama tetap dicetak dengan aman.
- Tidak ada perubahan API, DTO, Server Action, `src/lib/**`, Prisma, database, auth/session, middleware, RBAC, atau business rule.

### Acceptance scope dan responsive QA

Route tambahan untuk sweep adalah `/hrd/employees`, `/hrd/employees/[id]`, `/noc/probe`, `/portal`, `/portal/recoveries`, `/inventory/transactions/[id]`, dan `/inventory/transactions/[id]/print`. Semua harus diperiksa pada 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan 360×800.

Browser QA memeriksa overflow horizontal, bounding-box heading/card/button/form, status refresh saat tab tersembunyi, toggle alarm default off, active navigation, permission filtering, dan print mode yang menyembunyikan app shell. Verifikasi kode meliputi typecheck, test suite, build production terisolasi, dan `git diff --check`.

## 23. Rencana Kartu Pegawai — Menunggu Keputusan Produk

`docs/PLAN-KARTU-PEGAWAI.md` berstatus rencana untuk direview, bukan kontrak implementasi. Audit frontend mencatat kebutuhan foto pegawai, kartu identitas, token QR buram, verifikasi publik, NFC, dan integrasi pengendali pintu sebagai backlog terpisah.

Belum ada UI yang dibuat untuk fitur tersebut karena keputusan berikut masih diperlukan:

- kebijakan foto dan siapa yang boleh melihatnya;
- izin menambah dependency encoder QR;
- jenis chip NFC dan model pengendali pintu;
- apakah NFC menambah atau menggantikan geofence;
- keputusan penggunaan verifikasi publik teknisi.

Frontend tidak boleh membuat QR berbasis NIK/nama, halaman publik, NFC, atau akses pintu sebelum DTO, permission, attachment contract, token lifecycle, dan keputusan keamanan dari Opus/PO tersedia. Data sensitif pegawai tetap mengikuti batas akses HRD dan RBAC yang sudah ada.

## 24. Audit Ulang PRD Opus — Perbaikan Frontend Kecil

Audit berikutnya terhadap handoff dan rencana Opus menemukan dua isu frontend yang dapat diperbaiki tanpa kontrak backend baru:

- seluruh group navigasi yang memiliki item, termasuk group dengan satu item, tetap memakai dropdown agar hirarki parent/submenu konsisten pada desktop collapsed, desktop expanded, tablet drawer, dan mobile;
- validasi nomor telepon di form profil mengikuti kontrak server: karakter telepon yang sah dan panjang 6–25 karakter.

`ProfileView` saat ini belum membawa alamat, pola kerja, jenjang jabatan, dan tanggal kontrak pegawai; frontend tidak melakukan direct query untuk melewati DTO resmi. Filter rentang tanggal arsip juga menunggu parameter loader backend. Kedua hal ini tetap menjadi dependency handoff ke Opus.

Fase kartu pegawai tetap ditunda sesuai keputusan produk. Tidak dibuat UI QR, foto publik, NFC, atau akses pintu sebelum K5/K6, permission, attachment contract, token lifecycle, dan kontrak keamanan tersedia.

## 25. Audit Seluruh Dokumen Opus — 12 Agustus 2026

Audit silang terhadap `HANDOFF-BACKEND-KE-FRONTEND.md`, `PLAN-IDENTITAS-DAN-DATA-PEGAWAI.md`, `PLAN-KARTU-PEGAWAI.md`, dan `SETUP-AUTHENTIK.md` menghasilkan status berikut:

- Portal teknisi `/portal/recoveries` dan `/portal/recoveries/[id]` sudah tersedia di checkout, termasuk permission existing, scope tugas teknisi, catatan kunjungan, bukti, tanda tangan, dan redirect `origin=portal`. Item lama pada handoff yang masih menulis “perlu dibuat” sudah tertutup oleh implementasi yang ada; tidak dibuat duplikasi.
- Arsip terpadu `/settings/trash` beserta entry navigasi permission-scoped sudah tersedia. Tidak ditambahkan filter rentang tanggal karena loader resmi belum menerima parameter tersebut.
- Detail data pegawai, akun beku, mailbox/mailserver, upload tanda tangan, redirect portal, serta lapisan FTTH pada peta sudah tersedia sesuai kontrak yang ada.
- Authentik/OIDC masih menunggu infrastruktur dan kontrak provider resmi. Frontend tidak menambah login flow, endpoint, atau redirect buatan.
- Alamat, pola kerja, jenjang jabatan, dan tanggal kontrak belum menjadi bagian dari DTO `profileView`; frontend tidak melakukan query langsung untuk melewati kontrak tersebut. Implementasi tetap berada pada halaman HRD yang memiliki data/action resmi.
- Kartu pegawai, QR publik, NFC, absensi kartu, dan akses pintu tetap backlog tertunda sesuai K5/K6. Tidak ada UI atau dependency baru sebelum keputusan keamanan, permission, attachment, dan token lifecycle tersedia.

Perbaikan frontend pada audit ini terbatas pada hirarki sidebar/accessibility dan validasi telepon yang sudah dicatat pada bagian 24. Tidak ada perubahan backend, API, DTO, auth/session, RBAC, database, Prisma, Server Action, middleware, atau business rule.

## 26. Handoff Opus — Profile, Arsip, dan Gambar Tanda Tangan Dokumen

Implementasi frontend berikut mengonsumsi kontrak Opus yang sudah tersedia. Scope tetap frontend-only: tidak ada perubahan API, DTO, Server Action, `src/lib/**`, auth/session, RBAC, database, Prisma, middleware, atau business rule.

### Profile dan identity terpusat

- `profileView()` sekarang ditampilkan dengan field read-only alamat, pola kerja, jenjang jabatan, mulai kontrak, dan berakhir kontrak.
- Nilai `SHIFT`, `NON_SHIFT`, `STAFF`, dan `LEADER` diterjemahkan ke label operasional Indonesia.
- Nama tampilan dan telepon tetap menjadi satu-satunya field kontak yang dapat diedit dari halaman profil.
- `LOCAL` dan `MAILSERVER` dapat menampilkan form password bila `passwordChangeAvailable` true. MAILSERVER mengubah password email melalui action resmi; `OIDC` tetap diperlakukan sebagai identity provider terpusat dan tidak menampilkan form lokal.

### Arsip dengan rentang tanggal

- `/settings/trash` menyediakan filter `Dari tanggal` dan `Sampai tanggal` di samping filter jenis entitas dan `Belum dipulihkan`.
- Tombol `Terapkan` mengirim parameter tanggal ke `listArchive({ from, to })`; `Reset tanggal` menghapus rentang tanggal tanpa menghilangkan filter jenis/status yang sedang dipilih.
- Tanggal akhir bersifat inklusif sesuai kontrak loader. Parameter kosong atau tidak valid diabaikan dengan aman dan tidak boleh merusak query.

### Gambar tanda tangan dokumen gudang

- Detail transaksi dan print IRF membaca tanda tangan melalui loader resmi `documentSignatures`.
- Setiap baris tanda tangan menampilkan peran, nama, waktu, status gambar, preview, dan tautan privat `/api/files/<attachmentId>` bila attachment tersedia.
- Upload hanya ditampilkan untuk baris tanda tangan yang sudah ada; frontend tidak membuat baris tanda tangan atau tanda tangan baru.
- Upload memakai `attachSignatureImageAction`, multipart `image/png` atau `image/jpeg`, dan `capture="environment"` untuk kamera mobile. IRF mengikuti permission stock create; DO mengikuti stock create; RECEIPT mengikuti stock receive.
- Jika baris tanda tangan atau gambar belum tersedia, UI menyampaikan status tersebut secara jujur. Preview yang gagal tetap menyediakan tautan privat untuk membuka file.
- Layout print A4 membatasi gambar agar tidak melewati tabel, kartu tanda tangan, atau batas halaman; nama penanda tangan tetap menjadi sumber identitas dokumen saat gambar tidak tersedia.

### Responsive dan print acceptance

- Panel tanda tangan memakai grid yang turun menjadi satu kolom pada mobile, dengan target tombol tetap dapat disentuh dan nama panjang tetap membungkus di dalam card.
- Detail transaksi, tabel arsip, preview signature, dan print IRF wajib diperiksa pada 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan 360×800.
- QA wajib memastikan tidak ada horizontal overflow, teks keluar card, tombol upload menabrak preview, file invalid merusak halaman, atau framework overlay.
- Mode print harus menyembunyikan app shell, mempertahankan rincian item/serial dan metadata transaksi, menampilkan gambar signature bila tersedia, serta tetap menyediakan tautan privat bila preview gagal.

Handoff notification, profile, identity, search, maps, recovery, dan portal lainnya tidak berubah; tambahan ini hanya memakai kontrak profile, archive, dan document-signature yang telah disediakan Opus.

## 28. Login, Reset Password, dan Kontrak Tabel

### Login dan permintaan reset password

- Field password login memiliki toggle mata yang hanya mengubah visibilitas nilai di input. Nilai password tidak disimpan ke `localStorage`, URL, log, atau state global.
- Link `Lupa password?` mengarah ke `/login/forgot-password`. Sampai action/backend resmi tersedia, halaman menampilkan status tertunda yang jujur dan tidak mengirim request palsu ke Mailcow.
- Kontrak yang dibutuhkan frontend adalah `{ email: string }` → `{ accepted: true, requestId?: string }`. Recipient tim IT harus berasal dari environment server, bukan hard-code frontend.
- Backend wajib memberikan response generik, rate limit, audit log, dan error aman tanpa mengungkap keberadaan akun, password, token reset, kredensial Mailcow, atau API key ke browser.

### Pagination dan sorting server-side

- List bertabel memakai query standar `page`, `pageSize`, `sort`, dan `direction`; ukuran halaman yang tersedia `10`, `20`, `50`, dan `100`, dengan default `20`.
- Filter, pencarian, sort, dan ukuran halaman harus dipertahankan saat berpindah halaman. Perubahan filter/sort/ukuran halaman mengembalikan halaman ke 1.
- Sort field memakai whitelist per halaman dan tie-breaker stabil. Loader memakai `count` + `skip` + `take`; frontend tidak melakukan slicing dataset besar.
- Kontrol tabel harus wrap pada mobile, header tetap dapat digeser secara horizontal, dan teks tidak boleh pecah satu karakter per baris.
- Tabel detail dokumen, line-item transaksi, dan halaman print tetap memakai layout khusus dan bukan target pagination list.
- Loader khusus seperti arsip harus menyediakan dukungan offset/page, limit, sort, dan `totalCount` sebelum kontrol server-side diterapkan penuh.

Status implementasi: halaman list model langsung yang sudah dimigrasikan memakai
`count` + `skip` + `take`, whitelist sorting, dan tie-breaker stabil. Detail/
print, report agregasi, snapshot Mailcow, arsip, serta tabel turunan multi-
sumber menunggu kontrak loader backend tersebut; frontend tidak mengambil
seluruh dataset lalu memotongnya di browser.

Migrasi direct-loader pada audit ini juga mencakup grid jadwal HRD, tabel sisa
stock/slot aktif, dan tabel ODP FTTH. Tabel utama memakai batas server-side;
daftar opsi pada form dan tabel pendukung tetap dipertahankan sebagai data
referensi operasional sampai Opus menyediakan loader pencarian/paginasi khusus.

Acceptance tambahan: login/forgot-password dan perwakilan list bertabel diperiksa pada 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan 360×800 tanpa overflow horizontal, teks keluar card, overlap kontrol, atau request Mailcow dari browser.

## 27. Handoff Opus — Divisi ke Grup Authentik

Frontend `/it/identity-groups` sudah tersedia untuk user dengan permission `integrations.manage` dan menggunakan kontrak loader/action Authentik yang disediakan Opus. Halaman ini tetap frontend-only dan tidak mengubah API, DTO, Server Action, `src/lib/**`, database, auth, RBAC, atau business rule.

- Pengaturan hanya meminta alamat Authentik dan **nama** environment variable token. Token API tidak boleh ditempelkan atau disimpan oleh UI CRM.
- Preview bersifat read-only dan menampilkan grup yang akan dibuat, anggota yang akan ditambahkan, anggota yang akan dikeluarkan, serta peringatan data yang perlu ditinjau.
- Daftar `Keluarkan` diberi penekanan visual terpisah karena dapat mencabut akses aplikasi lain. Tombol penerapan tidak mengirim plan dari browser; action server menghitung ulang keadaan terbaru.
- `UNKNOWN_MEMBER` bukan error: anggota yang tidak dikenali CRM tetap dipertahankan dan hanya dilaporkan. Arah sinkronisasi hanya CRM → Authentik.
- Jika konfigurasi, token server, atau koneksi belum siap, UI menampilkan blocker/error yang jujur tanpa angka atau data palsu.
- Navigasi permission-scoped menampilkan item `Grup Authentik` di group IT/DevOps; drawer tablet dan sidebar collapsed mempertahankan hierarki parent/submenu.
- Metric sinkronisasi ditampilkan 1 kolom di mobile, 2 kolom di tablet, dan 4 kolom di desktop; identifier grup tetap membungkus berdasarkan kata/hyphen tanpa pecah satu huruf per baris.

Acceptance QA tambahan mencakup preview tanpa perubahan, status konfigurasi, pengaturan tanpa token mentah, daftar add/remove/warning, konfirmasi penerapan, permission filtering, serta viewport 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan 360×800. Tidak boleh ada horizontal overflow, teks keluar card, tombol overlap, console error, atau framework overlay.

## 29. Handoff Opus — UI HRD, Mailserver, dan Reset

### Permintaan lupa password

- `/login/forgot-password` menggunakan `requestRecoveryAction` melalui server action resmi.
- Form hanya meminta satu alamat email dan menampilkan `message` generik dari server.
- Tidak ada token reset, form password baru, countdown, password, kredensial Mailcow, atau request Mailcow langsung dari browser.
- Loading, success, error aman, focus state, dan link kembali ke login harus tetap responsif pada desktop, tablet, dan mobile.

### Kartu pegawai dan foto resmi

- `/hrd/employees/[id]` menampilkan foto resmi, nomor kartu, status, tanggal terbit, masa berlaku, NFC UID, penerbit, dan riwayat kartu.
- Pengelolaan kartu memakai `hrd.manage` dan action resmi `uploadEmployeePhotoAction`, `issueCardAction`, `replaceCardAction`, `markCardLostAction`, serta `revokeCardAction`.
- Status memakai `CARD_STATUS_LABELS`; alasan kartu tidak berlaku memakai `cardInvalidReason`, termasuk akun beku, akun diarsipkan, pegawai nonaktif, dan tanggal kedaluwarsa.
- Kartu aktif tidak dapat diterbitkan ganda dari UI. Penggantian kartu selalu meminta alasan; kartu lama tetap terlihat dalam riwayat.
- QR dan print kartu ditahan sampai loader backend menyediakan `qrSvg` atau `verificationUrl` server-side. Frontend tidak mengambil `publicToken` langsung dan tidak membuat QR dari NIK/nama.

### Impor karyawan Excel

- `/hrd/employees/import` hanya tersedia bagi `hrd.manage`.
- File `.xlsx` yang sama ditahan di state client untuk `previewEmployeeImportAction` dan `applyEmployeeImportAction`.
- Preview membedakan `CREATE`, `LENGKAPI`, dan `SKIP`. Baris `LENGKAPI` hanya mengubah empat data diri yang diizinkan dan menampilkan `notes` per perubahan sebelum penerapan.
- Ringkasan dan hasil penerapan menampilkan jumlah pegawai yang dibuat, dilengkapi, dan dilewati; hasil `completed` juga menampilkan field yang berubah.
- Sel kosong berarti tidak ada keterangan dan tidak menghapus data yang sudah tersimpan.
- Tombol Terapkan hanya aktif ketika `ImportPlan.ok === true`; penerapan tetap membaca ulang file dan bersifat all-or-nothing.

### Akun CRM dari mailbox

- `/it/mailserver/accounts` hanya tersedia bagi `users.create`.
- Kandidat personal maupun shared/function selalu ditampilkan; `likelyShared` hanya memengaruhi centang awal dan `sharedReason` harus terlihat.
- IT wajib memilih level dan minimal satu role. Divisi yang diusulkan dari HRD dapat ditinjau; pegawai yang tidak cocok persis tetap dapat dibiarkan tanpa tautan.
- Pembuatan memakai `createAccountsAction` secara all-or-nothing. Password tidak pernah ditampilkan atau dikirim ke browser.

### Responsive acceptance

Semua halaman baru wajib diuji pada 1440×900, 1920×1080, 1024×768, 768×1024,
390×844, dan 360×800. Tidak boleh ada horizontal overflow, teks keluar card,
form atau tombol bertumpuk, field file menutupi konten, atau framework overlay.
Tabel preview menggunakan horizontal scroll terkontrol; form mailbox berubah
menjadi susunan field yang dapat dibaca pada layar sempit.

## 30. Kartu Pegawai Dua Sisi B4

- Detail HRD, halaman scan `/verify/[token]`, dan print kartu menggunakan komponen visual kartu yang sama dengan mode `hrd` dan `public`.
- Standar ukuran dikunci ke ISO B4 portrait: 250×353 mm. Preview layar mempertahankan rasio 250:353; print menghasilkan sisi depan dan belakang pada dua halaman B4 yang siap dicetak duplex sisi panjang.
- Preview dapat dibalik manual dengan tombol yang keyboard-accessible. Animasi `rotateY` dihentikan saat `prefers-reduced-motion` aktif.
- Sisi depan menampilkan logo, foto resmi, nama, jabatan, divisi, nomor pegawai pada mode HRD, dan nomor kartu. Sisi belakang menampilkan pola brand, Perum Network, website, nomor kartu, serta QR verifikasi resmi bila tersedia.
- Foto resmi pada sisi depan mempertahankan seluruh gambar tanpa crop menggunakan renderer yang sama pada detail HRD, hasil scan publik, dan print; ruang sisa mengikuti latar teal kartu.
- QR tidak boleh dibuat dari NIK, nama, atau data lain di browser. Bila loader belum menyediakan `qrSvg` server-side, UI menampilkan `QR belum tersedia` dan menahan print fisik.
- Halaman scan hanya memakai `PublicVerification`: nama, jabatan, foto, dan nomor kartu. Kartu tidak berlaku tidak menampilkan identitas pegawai.
- Foto gagal dimuat memiliki fallback initials; teks panjang dibatasi agar tidak melewati kartu. Preview dan print wajib bebas horizontal overflow pada desktop, tablet, dan mobile.

### Kontrak QR untuk Opus

`loadEmployeeCards()` perlu mengembalikan `qrSvg: string | null` yang dibuat server-side dari token privat, atau kontrak setara yang tidak mengirim `publicToken` ke browser. Frontend hanya menempelkan SVG terpercaya tersebut dan tidak melakukan query database atau membuat token/QR sendiri.

### Acceptance kartu

- Preview HRD dan scan publik memakai rasio B4 yang sama dan dapat dibalik manual.
- Print menampilkan dua sisi B4 tanpa clipping dan tombol print nonaktif bila kartu tidak aktif atau QR resmi belum tersedia.
- Data publik tidak membocorkan NIK, email, telepon, divisi, atau token privat.
- QA dilakukan pada 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan 360×800.

## 32. Handoff Opus — Data Diri, Foto Profil, dan Ulang Tahun

Frontend mengonsumsi field profile dan loader HRD yang sudah tersedia dari Opus.
Form HRD meneruskan lima field pegawai melalui wrapper action yang sudah ada;
validasi, audit, dan persistence tetap ditegakkan oleh service HRD dari Opus.
Tidak ada perubahan pada `src/lib/**`, API, database, auth, RBAC, middleware,
atau business rule.

### Data diri pegawai

- `/profile` menampilkan `birthPlace`, `birthDate`, `education`, dan
  `bloodType` sebagai data read-only.
- `/hrd/employees/[id]` menampilkan empat field yang sama pada panel Data diri
  untuk user dengan permission `hrd.view`.
- Label pendidikan dan golongan darah memakai mapping resmi dari
  `EDUCATION_LEVELS` dan `BLOOD_TYPES`; kode yang belum dikenal tetap tampil
  sebagai fallback. `UNKNOWN` ditampilkan sebagai “Tidak diketahui”.
- Tanggal lahir tidak menjadi filter daftar pegawai dan umur tidak ditampilkan.
- Golongan darah adalah data kesehatan: tidak ditampilkan pada daftar pegawai,
  ekspor, kartu pegawai, atau verifikasi kartu publik.
- Form create/edit HRD menyediakan `divisionId`, `birthPlace`, `birthDate`,
  `education`, dan `bloodType`. Pilihan pendidikan dan golongan darah memakai
  konstanta resmi; nilai kosong berarti tidak diisi, bukan tebakan.
- Divisi dimuat dari master divisi resmi, termasuk divisi nonaktif yang masih
  terpasang pada data lama agar penyimpanan ulang tidak menghilangkan pilihan.
- Golongan darah tetap hanya terlihat pada form/detail HRD dan profil pegawai;
  tidak tampil di daftar, ekspor, kartu pegawai, atau verifikasi publik.

### Foto profil aplikasi

- Foto profil aplikasi memakai `user.avatarUrl` dan terpisah dari foto resmi
  kartu pegawai. Jika belum ada, UI menampilkan inisial nama dan tidak jatuh ke
  foto resmi kartu.
- Upload memakai `uploadAvatarAction`, field multipart `avatar`, dan hapus
  memakai `removeAvatarAction`.
- Browser menolak file kosong, format selain JPG/PNG/WebP, dan file di atas
  5 MB sebelum upload. Input mendukung kamera mobile.
- UI menjelaskan bahwa foto ini hanya untuk tampilan aplikasi; pemrosesan
  persegi, WebP, dan penghapusan EXIF tetap menjadi tanggung jawab server.

### Ulang tahun dashboard

- Dashboard memanggil `birthdaysToday()` secara paralel dengan metrik lain.
- Panel hanya ditampilkan bila ada pegawai aktif yang berulang tahun hari itu.
- Kartu menampilkan nama, jabatan/divisi, foto profil atau inisial, dan ucapan
  dari backend. Umur dan tahun lahir tidak ditampilkan.
- Tampilan kartu ulang tahun menggunakan grid responsif dan wrapping aman pada
  1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan 360×800.

Status handoff: field profile, avatar action, birthday loader, dan form pegawai
lima field sudah terhubung. Service HRD tetap menjadi sumber validasi dan audit.

## 33. Crop foto kartu dan pengingat password awal

### Crop foto kartu pegawai (§31)

- Panel HRD menyediakan crop foto dengan rasio kartu dari `cardPhotoAspect()`.
- Area crop dapat digeser melalui pointer/touch atau tombol panah keyboard, serta
  diperbesar, diperkecil, dan direset tanpa mengubah rasio kartu.
- Form mengirim `cropX`, `cropY`, `cropWidth`, dan `cropHeight` dalam nilai
  ternormalisasi yang dipakai action upload resmi.
- Validasi memakai `cropRejection`, `CARD_CROP_MIN_WIDTH`, dan
  `CARD_CROP_MIN_HEIGHT`; foto JPG, PNG, WebP, dan kamera mobile didukung.
- Crop yang melewati batas foto atau tidak memenuhi resolusi minimum tidak dapat
  disimpan. Pemrosesan foto dan aturan bisnis tetap berada di backend.
- Tampilan crop harus responsif, tidak overflow, memiliki focus state, dan
  menghormati `prefers-reduced-motion`.

### Password awal dari tim IT

- `mustChangePassword` adalah sumber kebenaran dari server.
- Saat flag aktif, login tetap diizinkan tetapi banner dan item keamanan pada
  lonceng terus mengarahkan user ke `/profile#password-title`.
- Peringatan keamanan tidak dapat dihapus melalui `Tandai semua dibaca` dan
  bukan baris `Notification` palsu di database.
- Banner dan item keamanan hilang setelah revalidasi membaca flag `false` dari
  server setelah perubahan password berhasil.
- UI tidak menerima atau menyimpan password, hash, maupun riwayat password.
- Provider `LOCAL`, `MAILSERVER`, dan `OIDC` tetap mengikuti kontrak profil dan
  kebijakan password masing-masing.

### Acceptance tambahan

- Crop foto diuji pada foto portrait, landscape, grup, resolusi kecil, dan file
  invalid pada enam viewport CRM.
- Banner dan notifikasi tetap terlihat saat notifikasi biasa telah dibaca dan
  tidak mengganggu dropdown, profile menu, atau layout mobile.
- Opus memastikan provisioning password default, termasuk jalur Mailcow,
  mengaktifkan `mustChangePassword`, login pertama tidak menghapusnya, dan hanya
  perubahan password yang berhasil yang boleh menonaktifkannya.

## 34. Handoff Opus — Koordinat Site dan Impor Katalog Material

### Koordinat site NOC

- `/noc/sites` menampilkan `FtthCoordinatePicker` dengan nilai latitude dan
  longitude yang sudah tersimpan.
- User dapat memilih titik dari peta internal atau mengisi kedua nilai secara
  manual. Saat form edit dibuka, koordinat lama dipertahankan sampai user
  mengubahnya.
- Jika hanya satu nilai diisi, UI memberi peringatan agar pasangan koordinat
  dilengkapi. Mengosongkan keduanya adalah tindakan sadar untuk menghapus
  lokasi; rentang, urutan, dan `(0,0)` tetap divalidasi oleh backend.
- Peta internal boleh gagal dimuat tanpa menghilangkan input manual. Layout
  harus tetap terbaca dan tidak membuat form melebar pada enam viewport CRM.

### Impor katalog material

- `/inventory/items/import` hanya tersedia untuk `items.manage` dan hanya
  menampilkan gudang aktif. File `.xlsx` asli disimpan di state client dan
  dikirim ulang untuk preview serta apply.
- Preview membedakan `CREATE`, `LENGKAPI`, dan `SKIP` untuk kategori, vendor,
  dan material. `notes` adalah peringatan operasional yang ditampilkan per
  baris; `issues` menampilkan nomor baris dan nama kolom serta menahan tombol
  penerapan.
- Preview merangkum jumlah kategori, vendor, material, dan saldo awal. Riwayat
  pergerakan yang tidak lengkap ditampilkan sebagai dilewati, bukan dianggap
  sebagai saldo baru. Saldo awal dijelaskan sebagai dokumen `GOODS_RECEIPT`
  pada gudang yang dipilih.
- Hasil penerapan merangkum kategori/vendor yang dibuat, material baru,
  material yang dilengkapi, material yang dilewati, nomor dokumen saldo awal,
  dan jumlah unit saldo awal. Tidak ada tabel preview yang dikirim kembali
  sebagai sumber penerapan.

### Item Master

- `/inventory/items` menampilkan vendor utama, harga beli, harga jual, dan
  kondisi material. Nilai kondisi `GOOD` ditampilkan sebagai “Baik” dan
  `SECOND` sebagai “Layak pakai ulang”; nilai rupiah memakai `formatRupiah`.
- Empat field katalog dapat diedit user dengan `items.manage` melalui
  `saveItemAction`: vendor utama, harga beli, harga jual, dan kondisi.
- Harga dikirim sebagai teks rupiah; nilai kosong hanya menghapus data bila
  operator memang mengosongkannya. Supplier nonaktif tetap tersedia sebagai
  pilihan saat item lama sedang diedit agar asal pemasok tidak hilang.
- Tabel memakai horizontal scroll terkontrol, wrapping berdasarkan kata, dan
  kolom tambahan tidak boleh membuat card atau viewport melebar.

### Acceptance responsive

- QA dilakukan pada 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan
  360×800.
- Tidak boleh ada koordinat yang hilang saat edit, warning parsial yang tidak
  terlihat, preview impor keluar card, status pecah satu huruf per baris,
  tombol apply aktif ketika ada issue, atau horizontal overflow.

## 35. Guard Upload Browser dan Handoff PII Customer

### Guard upload lampiran operasional

- Form lampiran operasional memeriksa ukuran file di browser sebelum Server Action dikirim. Batas default adalah `5 * 1024 * 1024` byte (5 MB).
- Ukuran yang melewati batas menampilkan pesan inline, mencegah submit, mempertahankan file yang dipilih, dan mengembalikan fokus ke input file. Pesan dapat dibaca oleh assistive technology melalui status alert.
- Guard digunakan pada foto resmi kartu pegawai, bukti recovery, tanda tangan recovery, gambar tanda tangan dokumen gudang, dokumentasi proyek, foto/bukti work order, foto/bukti survey, dan bukti transaksi finance. Validasi avatar profile yang sudah ada tetap dipertahankan.
- Import Excel pegawai/katalog dan import KML tidak memakai guard lampiran generik karena masing-masing memiliki aturan ukuran, tipe, dan parsing tersendiri.
- Pemeriksaan MIME, magic byte, permission, dan batas server tetap menjadi validasi final. Browser guard hanya mengurangi upload yang jelas terlalu besar dan tidak menggantikan pemeriksaan backend.
- Error harus tetap berada di dalam form/card, tidak menutupi tombol, dan bekerja pada desktop, tablet, mobile, pointer, keyboard, serta kamera mobile.

### Status dependency Customer PII

- `updateCustomerAction` dan jalur data raw PII sudah tersedia secara permission-scoped. Form customer menampilkan NIK dan tanggal lahir hanya untuk user dengan `customers.pii_view`.
- Pengeditan field identitas hanya aktif bersama `customers.edit`; user tanpa izin edit tetap dapat melihat data bila memang memiliki izin lihat PII.
- NIK divalidasi 16 digit di browser dan server. Bila NIK lengkap, tanggal lahir yang diturunkan ditampilkan sebagai pemeriksaan kenyamanan sebelum simpan.
- User tanpa akses PII tidak menerima nilai raw atau nilai masking di dalam form identitas. Backend tetap menjadi penjaga final dan mempertahankan field yang tidak dikirim.

### Acceptance dan bukti QA

- File tepat 5 MB diterima oleh guard; file di atas 5 MB ditolak sebelum action dikirim. File invalid tetap ditangani oleh validasi backend secara aman tanpa blank page.
- Semua route upload operasional diaudit pada 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan 360×800.
- Bukti QA mencakup static scan input file, pesan error inline, focus state, tidak ada teks keluar card, tidak ada tombol tertutup, dan tidak ada horizontal overflow.

## 36. Impor pelanggan dan penerapan sebagian

### Impor pelanggan, subscription, dan ODP

- `/crm/customers/import` hanya tampil untuk user yang memiliki `customers.create`
  dan `subscriptions.create`.
- Satu file `.xlsx` dipakai ulang untuk preview dan apply; frontend tidak pernah
  mengirim tabel hasil preview sebagai sumber perubahan.
- Preview menjelaskan bahwa satu unggahan dapat membuat ODP, pelanggan, dan
  subscription sekaligus, lalu menampilkan ringkasan jumlah pelanggan baru,
  pelanggan yang dilengkapi, pelanggan yang dilewati, ODP, subscription, dan
  baris kosong.
- Tabel pelanggan membedakan `CREATE`, `LENGKAPI`, dan `SKIP`, serta menampilkan
  perubahan, alasan, dan `notes` per baris.
- `unknownSales` ditampilkan sebagai informasi karena tidak menahan penerapan.
  Paket yang tidak memiliki padanan master ditampilkan sebagai blocker dan tetap
  menggagalkan penerapan sebagian.
- ODP baru selalu diberi peringatan bahwa kapasitas 8 port adalah dugaan yang
  harus diverifikasi di lapangan.
- Hasil penerapan menampilkan ODP yang dibuat, pelanggan baru, pelanggan yang
  dilengkapi, jumlah subscription, port ODP tertaut, dan baris bermasalah yang
  benar-benar dilewati.

### Penerapan sebagian

- Impor katalog dan impor pelanggan menyediakan checkbox penerapan sebagian
  yang bawaan-nya tidak aktif.
- Saat ada `issues`, operator dapat memilih “Terapkan sebagian — lewati N baris
  bermasalah”; pilihan tersebut dikirim sebagai `allowPartial=1` dan tercatat
  oleh backend.
- Paket customer yang belum memiliki padanan master tetap memblokir penerapan,
  meskipun mode sebagian dipilih.
- `skippedIssues` wajib terlihat setelah penerapan; baris yang dilewati tidak
  boleh disembunyikan dari operator.
- UI menjelaskan bahwa menjalankan ulang berkas yang sama aman karena pencocokan
  memakai kode atau identifier yang stabil.

### Acceptance responsive

- QA route impor dilakukan pada 1440×900, 1920×1080, 1024×768, 768×1024,
  390×844, dan 360×800.
- Tabel preview menggunakan horizontal scroll terkontrol, notes dan issues
  membungkus berdasarkan kata, checkbox partial tetap dapat disentuh, dan tidak
  ada tombol yang keluar card atau viewport.

## 37. Supplier dan port perangkat NOC

### Master pemasok

- `/inventory/suppliers` tersedia untuk user dengan `items.manage` dan menyediakan tambah, ubah, aktifkan, serta nonaktifkan pemasok melalui action resmi.
- Daftar menampilkan kode, nama, kontak, website, alamat/catatan, jumlah item terhubung, dan status aktif. Teks panjang tetap membungkus di dalam cell atau dapat digeser melalui wrapper tabel.
- Pemasok tetap dapat dilengkapi dari Impor Katalog. Menonaktifkan pemasok tidak menghapus riwayat pembelian.

### Panel port perangkat

- `/noc/devices` menyediakan panel port pada perangkat yang dipilih tanpa membuat route detail baru.
- Ringkasan memisahkan PON, Ethernet, ONU, VLAN, PPP, dan port lainnya. Tampilan awal hanya merender PON dan Ethernet; ONU serta kelompok port lain dibuka melalui tautan terkontrol agar daftar ONU tidak memenuhi halaman.
- Angka ONU ditulis sebagai “ONU online” dan tidak boleh dibaca sebagai jumlah
  pelanggan atau inventaris perangkat terpasang.
- Setiap port menampilkan nama, alias operator bila tersedia, jenis, status operasional, status admin, kecepatan Mbps/Gbps, dan waktu sinkronisasi terakhir.
- Panel bersifat read-only dan mengikuti permission `noc.view`. Data perangkat atau port yang kosong/tidak tersedia ditampilkan sebagai state informatif.

### Dependency Customer PII

- NIK dan tanggal lahir customer sudah tersedia setelah kontrak server-side Opus §41.1 selesai. UI tetap permission-aware: raw hanya untuk `customers.pii_view`, edit hanya dengan `customers.edit`, dan nilai masking tidak pernah dikirim kembali.

### Acceptance responsive §37

- QA dilakukan pada 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan 360×800.
- Halaman Pemasok dan panel port tidak boleh menyebabkan horizontal overflow, teks keluar card, status pecah satu huruf per baris, atau kontrol tabel menyempit vertikal.
- Daftar port default tidak menampilkan seluruh ONU sekaligus; filter ONU dan port lainnya tetap dapat dibuka dan ditutup tanpa kehilangan query tabel utama.

## 38. Topologi garis peta POP–OLT–MS/ODC–ODP–customer

### Aturan visual jaringan

- `/noc/map` menggambar relasi jaringan yang memang tersedia sebagai garis solid:
  POP atau ODC ke OLT, OLT ke ODP melalui PON, ODC ke MS/ODP melalui `siteId`,
  MS/ODP ke induknya melalui `parentId`, dan site ke site melalui `NetworkLink`.
- `FiberRoute` tetap menjadi jalur visual solid berdasarkan geometri survey yang
  tersimpan. Jalur ini tidak diperlakukan sebagai sumber kebenaran relasi node.
- Garis ODP ke customer selalu putus-putus dan warnanya mengikuti status link
  PPPoE (`ONLINE`, `OFFLINE`, `DISABLED`, atau `UNKNOWN`).
- Relasi tanpa endpoint atau koordinat lengkap tidak digambar. Frontend tidak
  membuat garis berdasarkan titik terdekat, jarak, atau dugaan operator.
- Garis solid dan putus-putus tidak menggantikan marker: OLT, ODC, MS, ODP, POP,
  dan customer tetap dapat dibedakan melalui marker serta popup.

### Grouping dan zoom

- Titik infrastruktur (POP, ODC, OLT, MS, ODP) dan customer memakai cluster yang
  terpisah agar jumlah pelanggan tidak bercampur dengan simpul jaringan.
- Klik cluster memakai expansion zoom MapLibre dan transisi sekitar 420 ms. Saat
  `prefers-reduced-motion` aktif, durasi menjadi 0 ms.
- Opacity garis topology meningkat bertahap ketika zoom mendekat. Garis customer
  disembunyikan saat zoom jauh dan muncul saat detail sudah terbaca, sehingga
  grouping tetap bersih.
- Fit-to-data menghitung titik infrastruktur dan customer yang sedang terlihat;
  filter site, OLT, okupansi, status subscription, router, status link, dan ODP
  terpilih tetap dipertahankan.

### Fallback dan acceptance

- SVG fallback memakai aturan yang sama: relasi jaringan solid, ODP → customer
  putus-putus, marker jenis simpul berbeda, dan tidak ada koneksi buatan ketika
  relasi atau koordinat kosong.
- QA topology wajib mencakup POP dengan OLT, OLT–PON–MS/ODP, MS sebagai parent,
  ODC melalui `siteId`, status customer keempat jenis, serta relasi/koordinat
  yang tidak lengkap.
- QA dilakukan pada 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan
  360×800. Peta tidak boleh memiliki garis palsu, popup/legenda/marker keluar
  viewport, atau horizontal overflow.
- Implementasi hanya memperluas query baca pada page `/noc/map` dan renderer
  frontend. Tidak ada perubahan aplikasi referensi, `src/lib/**`, schema,
  database, API, Server Action, auth, RBAC, atau business rule.

## 39. Handoff Opus §41 — Customer, Pemasok, dan NetworkPort

### Daftar customer dan filter operasional

- `/crm/customers` menyediakan filter server-side untuk status customer, paket,
  ODP, serta ketersediaan username PPPoE.
- Filter disimpan pada query URL dan tetap dipertahankan ketika operator
  mengganti sorting, jumlah data per halaman, atau berpindah halaman.
- Query relasi subscription memakai whitelist nilai filter dan tetap mengikuti
  permission `customers.view`; frontend tidak mengambil dataset besar lalu
  menyaringnya di browser.
- Copy halaman menjelaskan kesiapan pemantauan PPPoE tanpa menampilkan data
  teknis sebagai istilah perencanaan internal.

### Data identitas customer — kontrak siap dan UI aktif

- Form NIK dan tanggal lahir hanya menerima data raw untuk user dengan
  `customers.pii_view`, dan pengeditan memerlukan `customers.edit`.
- NIK memakai validasi 16 digit, tanggal format `YYYY-MM-DD`, serta pemeriksaan
  tanggal yang diturunkan dari NIK sebelum form dikirim.
- Field yang tidak ditampilkan tidak dikirim. Backend tetap mempertahankan nilai
  yang tidak dikirim dan menolak atau mengabaikan nilai masking pada action.

### Master pemasok

- `/inventory/suppliers` memakai `saveSupplierAction` dan
  `toggleSupplierAction` untuk tambah, ubah, aktifkan, dan menonaktifkan
  pemasok dengan permission `items.manage`.
- Form tampil sebagai panel samping pada desktop dan turun setelah tabel pada
  tablet/mobile. Tabel tetap memakai pagination, sorting, dan horizontal scroll
  terkontrol.
- Pemasok dinonaktifkan, bukan dihapus, agar riwayat pembelian tetap dapat
  ditelusuri. Import Katalog tetap tersedia sebagai jalur pelengkapan massal.

### Panel NetworkPort

- `/noc/devices` menggunakan ringkasan port per perangkat dan detail port dari
  loader resmi Opus. Tampilan awal hanya PON dan Ethernet.
- ONU, VLAN, PPP, dan port lainnya dibuka melalui filter terkontrol; daftar ONU
  besar tidak dirender pada tampilan awal.
- Kecepatan yang tidak dilaporkan ditampilkan sebagai “—”, bukan nol. Alias,
  status operasional, status admin, jenis port, dan waktu sinkronisasi tetap
  terlihat dengan wrapping aman.

### Acceptance responsive §39

- QA wajib mencakup 1440×900, 1920×1080, 1024×768, 768×1024, 390×844, dan
  360×800.
- Filter, form pemasok, tabel, panel port, badge, dan action tidak boleh keluar
  card, bertumpuk, atau memicu horizontal overflow.

## 40. Follow-up Handoff Opus §41.4–§41.6

### Item Master

- Form `/inventory/items` mengirim `supplierId`, `purchaseCost`, `salePrice`,
  dan `condition` melalui action resmi yang sudah divalidasi Opus.
- Supplier aktif dan nonaktif tetap dapat ditampilkan; supplier nonaktif diberi
  penanda agar item lama tidak kehilangan asal pemasok.
- Field harga memakai input teks numerik yang aman untuk rupiah dan tetap dapat
  dikosongkan secara sengaja. Tabel mempertahankan `formatRupiah`.

### NetworkPort

- Ringkasan dan filter memakai label “ONU online”. Angka ini berasal dari port
  yang sedang dilaporkan LibreNMS, bukan jumlah pelanggan atau inventaris.
- Ringkasan perangkat menggunakan `loadRingkasanPort(deviceId)` agar hanya
  membaca data perangkat yang sedang dipilih; default PON/Ethernet dan filter
  ONU terkontrol tetap dipertahankan.

### Acceptance follow-up

- Desktop, tablet, dan mobile tetap tidak boleh mengalami form melebar,
  horizontal overflow, teks keluar card, atau status port yang pecah.
- Edit item dengan supplier aktif, supplier nonaktif, harga kosong, harga
  rupiah, serta kondisi `GOOD`/`SECOND` harus menghasilkan submit ke action
  resmi tanpa input palsu.

## 41. Impor Pemetaan — Handoff Opus §42

### Alur dan permission

- `/noc/pemetaan` tersedia untuk user dengan permission `ftth.manage` dan
  muncul di grup NOC sebagai “Impor Pemetaan”.
- Workbook keputusan tim hanya menerima `.xlsx` dengan batas 5 MB. Pratinjau
  memakai `previewPemetaanAction`; penerapan memakai `applyPemetaanAction` dan
  mengunggah ulang file asli, bukan data tabel hasil pratinjau.

### Status keputusan

- `SIAP` berarti keputusan dapat diterapkan.
- `LEWAT` berarti keadaan sudah sesuai dan tidak diubah.
- `TOLAK` berarti keputusan tidak dapat diterapkan dan harus tetap terlihat
  beserta alasannya.
- `masalah[]` ditampilkan terpisah berdasarkan nama lembar dan nomor baris.
- `dilewati` berarti baris sengaja dikosongkan oleh tim, bukan kegagalan.
- Tombol penerapan hanya aktif jika setidaknya ada satu baris `SIAP`; backend
  tetap hanya menerapkan baris `SIAP`.

### Acceptance responsive

- Ringkasan, error, tabel keputusan, dan hasil penerapan tidak boleh keluar
  card atau viewport pada 1440×900, 1920×1080, 1024×768, 768×1024, 390×844,
  dan 360×800.
- Tabel memakai horizontal scroll terkontrol; kunci dan pesan panjang
  membungkus berdasarkan kata, bukan satu huruf per baris.

## 43. Handoff Opus §43 — Customer di Peta

- `/noc/map` menampilkan customer dengan koordinat sendiri dan customer yang
  mewarisi koordinat ODP. Customer yang mewarisi titik diberi outline amber
  dan keterangan `Lokasi mengikuti ODP (perkiraan)`.
- Warna isi marker dan garis customer tetap mengikuti `linkStatus` dari
  router, bukan status subscription. Status subscription hanya menjadi detail
  informasi pada popup.
- Clustering customer dan infrastruktur tetap dipisahkan agar ribuan titik
  customer tidak bercampur dengan simpul jaringan. Saat zoom-in, cluster dapat
  diurai dan titik individual tetap dapat dibuka.
- Customer yang tidak terlacak melalui port ODP belum ditampilkan pada peta;
  UI menyampaikan batas cakupan ini tanpa membuat angka hard-code karena DTO
  belum menyediakan counter khususnya.
- Garis ODP–customer untuk koordinat customer yang berbeda tetap digambar,
  termasuk garis yang jauh dari ODP, agar anomali data dapat ditemukan oleh
  tim lapangan.
- MapLibre dan fallback SVG memakai warna status, pembeda lokasi warisan,
  popup, legenda, serta aturan responsive yang sama.

## 44. Handoff Opus §44 — Nama OLT dan Urutan Filter Peta

- Label OLT pada filter, marker, popup, dan garis topology memakai nama
  operasional `OltDevice.name`. Jika nama belum tersedia, UI memakai hostname
  sebagai fallback; hostname tetap dipertahankan sebagai identitas sinkronisasi
  LibreNMS.
- Urutan filter peta mengikuti alur kerja operator: Site → Router → OLT →
  Okupansi ODP → Status pelanggan → Status koneksi.
- Relasi OLT → PON → ODP tetap memakai data relasi resmi. ODP yang belum punya
  port PON tidak dibuatkan garis perkiraan dan tidak ditampilkan sebagai error.
- OLT yang belum terpantau karena modelnya tidak mendukung SNMP tetap diberi
  status operasional yang jujur bila datanya tersedia; frontend tidak membuat
  status sinkronisasi atau port PON palsu.
- Responsive acceptance tetap berlaku pada enam viewport: filter dapat wrap,
  label panjang tidak keluar card, dan perubahan filter mempertahankan query
  URL yang sudah ada.
