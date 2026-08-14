# Rencana — LibreNMS & peta jaringan berkoordinat

**Ditulis 14 Agustus 2026 · status: RENCANA, belum dikerjakan**

Seluruh isi bagian 1 diperiksa langsung ke kode dan ke basis data produksi,
bukan diingat.

---

## Ringkasan satu paragraf

Peta **bukan pekerjaan kode** — modelnya, pengimpor KMZ-nya, dan komponen
petanya sudah ada dan sudah jalan. Yang kosong adalah datanya. LibreNMS memang
pekerjaan baru, tetapi sebagian besar bukan menulis kode juga: ia aplikasi
tersendiri yang dipasang, lalu disambungkan lewat jalur webhook yang kerangkanya
sudah berdiri. Yang benar-benar menahan keduanya adalah hal yang sama:
**tabel pelanggan dan langganan masih kosong.**

---

## 1. Yang SUDAH ada

### 1.1 Model data — lengkap

| Model | Isi yang relevan |
|---|---|
| `NetworkSite` | `type` sudah memuat `POP`, `MINI_POP`, `ODC`, `ODP`, `TOWER`, `DATA_CENTER`; punya `latitude`/`longitude`, `areaId`, `picId` |
| `NetworkDevice` | `deviceType` memuat `OLT`, `CORE_ROUTER`, `DIST_SWITCH`, dst; punya `managementIp`, `criticality`, tertaut ke site |
| `Odp` | `role` = **MS \| ODP** pada satu tabel yang sama, `parentId` untuk kaskade, `ponPortId`, `portCapacity`/`portUsed`, `opticPowerDbm`, `latitude`/`longitude` |
| `Customer` | `latitude`/`longitude` + `address` |
| `OdpPort` | menautkan langganan ke port fisik |
| `NetworkAlarm`, `Incident`, `NetworkMaintenance` | sudah ada dan saling tertaut |

**Tidak ada satu pun kolom koordinat yang perlu ditambahkan.** Semua yang
diminta — pelanggan, ODP, MS/ODC, POP — sudah punya tempatnya.

### 1.2 Peta — sudah ada

- `maplibre-gl` sudah terpasang.
- `src/components/network-map.tsx` — komponen peta dengan lapisan.
- `src/components/ftth-coordinate-picker.tsx` — pemilih koordinat.
- Halaman `/noc/map` sudah memakainya.

### 1.3 Impor & ekspor KMZ — sudah ada

`src/lib/ftth-kml.ts`: `previewKmlImport()`, `applyKmlImport()`,
`exportFtthKml()`. Pembaca ZIP-nya sendiri sudah ada di `src/lib/kmz.ts`.

### 1.4 Kerangka integrasi monitoring — sudah ada

- `LIBRENMS` sudah terdaftar di `INTEGRATION_PROVIDERS`.
- `src/lib/integrations.ts` sudah punya `MonitoringAlert` — payload generik yang
  mencocokkan `deviceHostname` → `NetworkDevice.hostname` dan `siteCode` →
  `NetworkSite.siteCode`, lalu menerbitkan `NetworkAlarm`.
- Jalur masuknya bertoken (`webhookToken`), dan setiap kejadian tercatat di
  `IntegrationEvent`.

Artinya LibreNMS **tidak perlu adapter khusus untuk mengirim alarm** — cukup
dipetakan ke bentuk generik yang sudah diterima.

### 1.5 Keadaan produksi — hampir seluruhnya kosong

| Tabel | Baris | Berkoordinat |
|---|---|---|
| `NetworkSite` | 1 | 0 |
| `NetworkDevice` | 1 | — |
| `Odp` (MS + ODP) | **0** | 0 |
| `Customer` | **0** | 0 |
| `Subscription` | **0** | — |
| `PppoeSession` | **1.718** | — |

Router distribusi terjangkau di `https://10.10.222.1:8444` lewat jaringan
internal, dan penarikan sesi PPPoE berjalan normal.

---

## 2. Yang sebenarnya menahan

**1.718 sesi PPPoE tidak tertaut ke siapa pun.** Tanpa `Customer` dan
`Subscription`, tidak ada yang bisa menjawab "pelanggan X online?", tidak ada
titik pelanggan untuk digambar di peta, dan alarm LibreNMS tidak bisa
diterjemahkan menjadi "berapa pelanggan terdampak".

Ini bukan pekerjaan yang bisa diselesaikan dengan menulis kode. Ia data.

---

## 3. LibreNMS

### 3.1 Apa yang sebenarnya dikerjakan

LibreNMS adalah aplikasi PHP + MySQL yang berdiri sendiri. Kita **tidak
membuatnya** — kita memasang, lalu menyambungkan. Pembagiannya:

| Bagian | Sifat |
|---|---|
| Pasang LibreNMS di VPS (Docker) | operasional, bukan koding |
| Nyalakan SNMP di perangkat | operasional, di Winbox/OLT |
| LibreNMS menemukan perangkat | otomatis, setelah SNMP hidup |
| Alarm LibreNMS → CRM | **koding kecil** — pemetaan payload |
| Daftar perangkat CRM ↔ LibreNMS | **koding** — perlu keputusan D2 |
| Grafik trafik di halaman CRM | **koding**, tahap paling akhir |

### 3.2 Prasyarat yang harus dipastikan lebih dulu

1. **SNMP hidup di router distribusi** dan komunitasnya diketahui. Saya tidak
   bisa memastikannya dari sini — perlu dicek di Winbox: `/snmp print`.
2. **SNMP hidup di OLT.** Ini yang paling berharga: dari OLT-lah datang redaman
   optik dan status ONT per pelanggan.
3. **VPS bisa mencapai perangkat di port 161/UDP.** Satu jaringan bukan jaminan
   — firewall MikroTik sering menutup SNMP dari subnet server.
4. **Kredensial SNMP tidak pernah masuk ke basis data CRM.** Mengikuti pola
   `credentialRef` yang sudah berlaku: yang tersimpan hanya NAMA variabel
   lingkungannya.

### 3.3 Yang perlu dikoding, berurutan

**L1 — Alarm LibreNMS masuk sebagai NetworkAlarm.**
Transport-nya sudah ada. Yang dibuat: pemetaan dari bentuk alert LibreNMS ke
`MonitoringAlert`, plus penanganan `RESOLVED` supaya alarm menutup sendiri.
Kecil, dan langsung terasa.

**L2 — Perangkat CRM dan LibreNMS saling kenal.**
Dicocokkan lewat `hostname`. Perlu keputusan D2 soal siapa sumber kebenarannya.

**L3 — Ringkasan status di halaman perangkat.**
CRM menanyakan LibreNMS: naik/turun, uptime, beban port. Baca saja, tanpa
menyimpan ulang.

**L4 — Grafik trafik.**
Paling akhir, dan paling boleh ditunda.

---

## 4. Peta

Kode sudah ada. Yang belum ada isinya. Jadi urutannya terbalik dari kebiasaan:

**P1 — Masukkan POP dan ODC sebagai `NetworkSite` berkoordinat.**
Jumlahnya sedikit dan berubah jarang. Bisa lewat formulir, tidak perlu impor.

**P2 — Impor MS dan ODP dari KMZ yang sudah dipegang tim lapangan.**
Mesinnya sudah ada. Yang perlu diperiksa: apakah KMZ yang dipegang tim memuat
folder per jenis, karena pengurainya masih buta terhadap folder
(lihat `PLAN-PEMETAAN-FTTH-KMZ.md` §2.2).

**P3 — Masukkan pelanggan berikut koordinatnya.**
Terbesar dan paling lama. Sekaligus menyelesaikan 1.718 sesi PPPoE yang
menggantung, karena `Subscription.pppoeUsername` yang menautkannya.

**P4 — Lapisan peta per jenis + rantai POP → ODC → ODP → pelanggan.**
Baru berguna setelah P1–P3 ada isinya. Sebagian frontend, jadi Luna.

---

## 5. Keputusan yang perlu diambil

### D1 — LibreNMS menyatu ke CRM, atau ke `monitoring-noc`?

`monitoring-noc` adalah aplikasi NOC, dan LibreNMS adalah alat NOC. Tetapi
`NetworkDevice`, `NetworkAlarm`, `Incident`, dan petanya ada di **CRM**.

- **Ke CRM** — alarm langsung bertemu perangkat, site, dan pelanggan yang sudah
  termodelkan; tidak ada data yang perlu digandakan. Tetapi menambah beban pada
  aplikasi yang sudah besar.
- **Ke monitoring-noc** — sesuai pembagian peran, tetapi ia punya basis data
  sendiri, sehingga perangkat dan site harus digandakan atau ditanyakan lintas
  aplikasi. Dua salinan daftar perangkat adalah sumber perbedaan yang mahal.

**Saran: ke CRM**, karena di sanalah alarm bisa dijawab dengan "berapa
pelanggan terdampak" — dan itu satu-satunya pertanyaan yang benar-benar penting
saat jaringan bermasalah.

### D2 — Siapa sumber kebenaran daftar perangkat?

- **CRM** — perangkat didaftarkan HRD/IT, LibreNMS menyusul. Rapi, tetapi
  perangkat baru tidak terpantau sampai ada yang mendaftarkannya.
- **LibreNMS** — penemuan otomatis lewat SNMP, CRM menarik hasilnya. Tidak ada
  yang terlewat, tetapi CRM ikut kemasukan perangkat yang bukan miliknya.

**Saran: CRM sebagai sumber kebenaran, penemuan LibreNMS dilaporkan sebagai
"perangkat belum terdaftar"** — terlihat, tetapi tidak masuk sendiri.

### D3 — Koordinat pelanggan diambil dari mana?

Pilihan: diketik teknisi saat pemasangan, diambil dari ponsel teknisi, atau
diimpor dari KMZ tim lapangan. Menentukan apakah perlu ada tombol "ambil lokasi
saya" di halaman pemasangan.

### D4 — Peta pelanggan boleh dilihat siapa?

Titik rumah pelanggan adalah data pribadi. Sekarang `/noc/map` berada di balik
izin NOC. Perlu diputuskan apakah lapisan pelanggan mengikuti izin yang sama
atau lebih ketat lagi.

---

## 6. Urutan yang disarankan

1. **Cek SNMP** di router dan OLT (§3.2) — menentukan apakah LibreNMS layak
   dikerjakan sekarang atau menunggu.
2. **P1: POP + ODC berkoordinat.** Sedikit, cepat, dan langsung membuat peta
   berisi.
3. **L1: alarm LibreNMS masuk ke CRM.** Terasa paling cepat dari sisi NOC.
4. **P2: impor MS + ODP dari KMZ.**
5. **P3: pelanggan + langganan** — yang terbesar, dan yang membuka semuanya.
6. **L2–L4 dan P4** menyusul setelahnya.

Nomor 1 mendahului segalanya: kalau SNMP belum hidup, seluruh bagian LibreNMS
berhenti sebelum dimulai.
