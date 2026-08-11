# PRD — NOC Tools di PerumNet CRM

**Tanggal:** 2026-08-11
**Versi:** 1.0 (draft, belum disetujui)
**Rujukan:** [FEATURE-GAP-ANALYSIS-HELPDESK-V2.md](FEATURE-GAP-ANALYSIS-HELPDESK-V2.md) §7.4 · [PRD-PerumNet-CRM.md](PRD-PerumNet-CRM.md) §NOC

## 0. Keputusan yang Sudah Diambil

1. **Tidak menggabung** project `MonitoringNOC-PerumNet` ke CRM. NOC Tools dibangun **baru** di dalam CRM.
2. **NOC menjadi satu kesatuan** — peran `noc_manager` dan `noc_engineer` dilebur jadi satu.
3. Fitur yang dituju mengikuti sistem pembanding: **peta yang menampilkan pelanggan PPPoE nyata beserta statusnya, sampai kapasitas ODP terlihat di peta**.

### Konsekuensi keputusan 2 yang harus disadari

Peran `noc_manager` saat ini memegang tiga kewenangan yang tidak dimiliki `noc_engineer`:

| Kewenangan | Dampak bila dilebur |
|---|---|
| `incidents.close` | Insiden P1/P2 saat ini hanya bisa ditutup NOC Manager + wajib preventive action. Setelah dilebur, **siapa pun di NOC bisa menutupnya** |
| `changes.review` | Reviewer network change ≠ eksekutor (SoD). Setelah dilebur, **satu orang bisa mereview perubahannya sendiri** |
| `approvals.act` sebagai step `noc_manager` | Approval matrix `network_change` merujuk peran ini — **rujukannya harus dialihkan atau step-nya dihapus** |

Rekomendasiku: lebur perannya, **tapi pertahankan SoD pada change management** — reviewer tetap harus orang yang berbeda dari eksekutor, cukup tidak lagi harus "manager". Ini mempertahankan kontrol tanpa hierarki. Kalau kamu tetap ingin SoD dihapus juga, sebutkan eksplisit.

## 1. Yang Sudah Ada (tidak dibangun ulang)

| Sudah ada | Isi |
|---|---|
| `NetworkSite`, `NetworkDevice`, `NetworkLink` | Inventaris jaringan |
| `Subnet`, `IPAddress` | IPAM anti-duplikat |
| `OltDevice`, `PonPort`, `Odp`, `OdpPort` | Rantai FTTH lengkap (Fase 13) — **`Odp` sudah punya `portCapacity`, `portUsed`, `opticPowerDbm`, `parentId`, `latitude`, `longitude`; `OdpPort` sudah menyimpan port bernomor tertaut `subscriptionId`** |
| `NetworkAlarm` | Alarm + dedup anti-flooding, auto-clear |
| `Incident` + update + dampak pelanggan | Lifecycle insiden |
| `NetworkAccessJob` | Antrian perintah ke router, auditable & retryable (Fase 10) |
| `/noc/ftth/tools` | IP calculator, burst calculator |

**Poin penting:** pertanyaan "pelanggan PPPoE nyata muncul di peta sampai kapasitas ODP" **secara data sudah terjawab** — `OdpPort.subscriptionId` mengikat pelanggan ke port fisik, dan `Odp` punya koordinat. Yang belum ada adalah **petanya** dan **sumber status PPPoE-nya**.

## 2. Yang Dibangun

### N1 — Peta Jaringan Terpadu (inti permintaan)

Satu peta yang menampilkan berlapis:

- **ODP** sebagai titik, diwarnai menurut **okupansi port** (`portUsed / portCapacity`): hijau longgar, kuning hampir penuh, merah penuh.
- **Pelanggan** sebagai titik, diwarnai menurut **status PPPoE**: online, offline, isolir.
- **Garis relasi** ODP → pelanggan yang tersambung ke port-nya.
- **Kaskade ODP** (`parentId`) sebagai garis antar-ODP.
- Klik ODP → panel samping: denah port bernomor, siapa di port berapa, optic power, ODP induk.
- Filter: site, OLT, PON port, status pelanggan, ambang okupansi.

**Sumber data seluruhnya dari model yang sudah ada.** Tidak ada model baru untuk lapisan ini kecuali koordinat pelanggan — `Customer` sudah punya `latitude`/`longitude`.

### N2 — Monitor PPPoE

Status sesi PPPoE per pelanggan, diambil dari MikroTik.

```prisma
model PppoeSession {
  id             String    @id @default(cuid())
  routerId       String                 // NetworkDevice (MikroTik)
  subscriptionId String?                // tertaut bila username dikenali
  username       String
  callerId       String?                // MAC
  address        String?                // IP yang diberikan
  uptimeSeconds  Int?
  status         String                 // ONLINE|OFFLINE|DISABLED
  lastSeenAt     DateTime
  updatedAt      DateTime  @updatedAt

  @@unique([routerId, username])
  @@index([status])
}

model PppoePollRun {              // jejak setiap penarikan data
  id         String   @id @default(cuid())
  routerId   String
  startedAt  DateTime @default(now())
  finishedAt DateTime?
  status     String   @default("RUNNING") // RUNNING|SUCCESS|FAILED
  onlineCount   Int   @default(0)
  offlineCount  Int   @default(0)
  disabledCount Int   @default(0)
  error      String?
}
```

Ringkasan **Total / Aktif / Offline / Disable** persis seperti sistem pembanding, plus daftar router.

### N3 — Probe / Monitoring Realtime

```prisma
model ProbeTarget {
  id           String   @id @default(cuid())
  name         String
  address      String                   // IP/host
  kind         String                   // DEVICE|SITE|UPSTREAM
  networkDeviceId String?
  intervalSec  Int      @default(60)
  isActive     Boolean  @default(true)
  lastStatus   String?                  // UP|DOWN|UNKNOWN
  lastLatencyMs Int?
  lastCheckedAt DateTime?
}

model ProbeResult {                     // append-only, dipangkas berkala
  id        String   @id @default(cuid())
  targetId  String
  checkedAt DateTime @default(now())
  status    String
  latencyMs Int?
  @@index([targetId, checkedAt])
}
```

Halaman monitor: filter semua/offline/down/online, auto-refresh, dan **alarm suara opsional**. Probe yang DOWN melewati ambang menaikkan `NetworkAlarm` yang sudah ada — bukan mekanisme alarm baru.

### N4 — Import/Export KML

Impor titik ODP dari KML/KMZ hasil survei lapangan, ekspor kembali untuk dipakai di Google Earth. Impor **wajib mode pratinjau**: tampilkan berapa titik baru, berapa cocok dengan ODP yang ada, berapa ditolak — sebelum apa pun disimpan.

### N5 — Penyederhanaan Peran NOC

- Role `noc_manager` + `noc_engineer` → satu role **`noc`**.
- Permission digabung; `incidents.close` masuk ke role `noc`.
- Approval matrix `network_change` yang merujuk step `noc_manager` dialihkan ke `noc`.
- **SoD dipertahankan**: reviewer change ≠ eksekutor (lihat §0).

## 3. Aturan Non-Negotiable

1. **Monitoring bersifat baca saja.** Halaman monitor tidak boleh punya jalur tulis ke perangkat. Semua perintah ke router tetap lewat `NetworkAccessJob` (Fase 10) yang auditable dan retryable.
2. **Kredensial router tidak pernah plaintext.** Mengikuti keputusan Fase 13 — referensi ke secret store / nama env var, bukan nilai.
3. **Poller berjalan sebagai worker terpisah**, bukan di dalam request. Loop monitoring yang macet tidak boleh menahan operasi bisnis.
4. **`portUsed` tetap turunan** dari `OdpPort` (Fase 13). Peta membaca, tidak pernah menulis balik.
5. **Data posisi pelanggan adalah data pribadi.** Peta pelanggan dibatasi permission, dan aksesnya masuk audit log.
6. Kegagalan polling adalah **state yang terlihat**, bukan log yang tenggelam.

## 4. Fase

| Fase | Isi | Bergantung pada |
|---|---|---|
| **22** | Peleburan peran NOC + pengalihan approval matrix | — |
| **23** | N1 Peta jaringan terpadu (ODP + okupansi + pelanggan) | data Fase 13 |
| **24** | N2 Monitor PPPoE + adapter MikroTik baca-saja | kredensial router |
| **25** | N3 Probe realtime + integrasi ke NetworkAlarm | — |
| **26** | N4 Import/Export KML | N1 |

Fase 23 bisa dikerjakan **tanpa kredensial apa pun** — seluruh datanya sudah ada di database kita. Fase 24 yang butuh akses router.

## 5. Asumsi yang BELUM Terverifikasi

Dokumen ini disusun saat tool pembaca halaman sedang tidak bisa dipakai, jadi hal berikut **diasumsikan** dari nama menu dan pemetaan ronde sebelumnya — bukan dari melihat halamannya:

1. **`/pppoe-map` menggambar apa** — titik pelanggan offline satu per satu, atau agregat per ODP? Ini menentukan apakah N1 perlu menyimpan koordinat per pelanggan atau cukup mewarisi koordinat ODP.
2. **`/probe` mengambil status dari mana** — ping langsung dari server aplikasi, atau membaca dari MikroTik/SNMP? Menentukan bentuk `ProbeTarget`.
3. **Apakah status PPPoE mereka ditarik berkala atau realtime**, dan berapa intervalnya (`/pppoe-monitor` menyebut refresh 180 detik, `/distrouter` 60 detik — kemungkinan itu refresh tampilan, bukan interval polling).
4. **Bagaimana username PPPoE dipetakan ke pelanggan** — lewat field `pppoe` di record pelanggan (kita sudah punya `Subscription.pppoeUsername`), atau lewat tabel perantara.

Keempatnya perlu dikonfirmasi sebelum Fase 24 dikerjakan. Fase 22 dan 23 tidak terpengaruh.
