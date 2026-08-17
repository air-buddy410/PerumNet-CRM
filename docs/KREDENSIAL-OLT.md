# Memberikan login OLT ke CRM

Fase 88b. Dipakai untuk membaca daya optik ONU pada OLT yang **tidak**
memancarkannya lewat SNMP — C600 Kecicang, C600 Abang, dan kedua HSGQ.
(C300 Pesagi sudah terbaca lewat SNMP dan tidak butuh ini.)

## Aturan yang tidak boleh dilanggar

**Nilainya hanya di `.env` server.** Yang tersimpan di basis data cuma NAMA
variabelnya (`OltDevice.credentialRef`). Kalau suatu hari basis datanya
dicadangkan, disalin, atau bocor, tidak ada satu pun kredensial OLT di
dalamnya. Ini pola yang sama dengan MikroTik sejak Fase 13.

**Jangan pernah menempelkan kredensial ke chat, tiket, atau commit.** Ketik
langsung di server.

## Langkahnya

### 1. Masuk ke server dan buka `.env`

```bash
ssh perumnet@100.127.88.91
cd ~/apps/crm
nano .env
```

### 2. Tambahkan baris yang kamu punya

Bentuknya **`user:password`**. Isi yang kamu tahu saja — yang kosong akan
dilaporkan apa adanya, bukan menggagalkan yang lain.

```
OLT_KCC_CRED=namauser:katasandi
OLT_ABG_CRED=namauser:katasandi
OLT_SRYB_CRED=namauser:katasandi
OLT_SRYT_CRED=namauser:katasandi
OLT_PSG_CRED=namauser:katasandi
```

| Variabel | OLT | Pelanggan |
|---|---|---|
| `OLT_KCC_CRED` | ZTE-C600-100-Kecicang | 310 |
| `OLT_ABG_CRED` | ZTE-C600-104-Abang | 201 |
| `OLT_SRYB_CRED` | HSGQ-102-SerayaBarat | 491 |
| `OLT_SRYT_CRED` | HSGQ-102-SerayaTengah | 196 |
| `OLT_PSG_CRED` | ZTE-C300-102-Pesagi | 349 — sudah jalan lewat SNMP |

**Password memuat titik dua?** Tidak masalah — yang dipakai sebagai pemisah
hanya titik dua PERTAMA.

### 3. Terapkan ke kontainer

```bash
docker compose up -d app worker
```

### 4. Uji — tanpa kredensialnya pernah tampil

```bash
docker compose run --rm tools npx tsx scripts/_uji-login-olt.ts
```

Yang keluar hanya berhasil/gagal berikut sebabnya:

```
✓ ZTE-C600-100-Kecicang MASUK sebagai "admin" — jawaban: ZXA10 C600 …
✗ HSGQ-102-SerayaBarat  Env var OLT_SRYB_CRED belum di-set di proses ini.
✗ ZTE-C600-104-Abang    Kredensial ditolak oleh 192.168.100.61. Periksa isi env var-nya.
```

Satu OLT saja:

```bash
docker compose run --rm tools npx tsx scripts/_uji-login-olt.ts 192.168.100.60
```

## Yang sudah diperiksa dari sisi jaringan

Dari VPS, port telnet 23 **terbuka** ke `192.168.100.30` (C300) dan
`192.168.100.60` (C600 Kecicang). Yang lain belum dicoba karena kredensialnya
belum ada; kalau ternyata tertutup, uji di atas akan mengatakannya dengan
jelas ("tidak bisa menyambung") — beda dari kredensial yang ditolak.

## Kalau kredensialnya berubah

Ubah `.env`, lalu `docker compose up -d app worker`. Tidak ada yang perlu
diubah di basis data — yang tersimpan di sana cuma nama variabelnya.

## Setelah ini

Begitu uji login lolos, saya sambungkan pembacaan daya optik lewat CLI untuk
OLT tersebut. Perintah bacanya berbeda per vendor, jadi urutannya: kredensial
dulu, pembacaan menyusul — bukan sebaliknya.

---

## DEVICE_CRED_KEY — kunci brankas (Fase 91)

Sejak Fase 91, perangkat baru **tidak lagi perlu variabel env sendiri**. NOC
mengisi telnet/SSH dari layar; sandinya disegel AES-256-GCM dan disimpan di
tabel `DeviceCredential`. Yang ada di env tinggal **satu** kunci utama.

### Memasangnya (sekali seumur sistem)

Di **VPS produksi**, bukan di laptop:

```bash
openssl rand -hex 32
```

Tempel hasilnya ke `.env` di samping `docker-compose.yml`:

```
DEVICE_CRED_KEY=<hasil openssl tadi>
```

Lalu nyalakan ulang:

```bash
docker compose up -d app worker
```

### Aturan yang tidak boleh dilanggar

- **Kunci ini tidak pernah dikirim lewat chat, tiket, WhatsApp, atau commit.**
  Dia membuka SELURUH sandi perangkat sekaligus. Cukup ada di `.env` VPS dan
  di brankas sandi pribadi pemilik sistem.
- **Hilang kunci = hilang semua sandi tersegel.** Tidak ada pemulihan. Yang
  tersisa hanya mengisi ulang tiap perangkat dari layar. Simpan cadangannya
  sebelum menyentuh apa pun.
- **Jangan diganti selagi ada catatan di `DeviceCredential`.** Kunci baru tidak
  bisa membuka segel lama; semua kredensial akan terbaca rusak sekaligus.
- Tanpa kunci, aplikasi **tetap menyala**. Lima OLT lama tetap jalan lewat
  `OLT_*_CRED`; yang belum bisa hanya menambah perangkat baru dari layar.

### Hubungannya dengan OLT_*_CRED lama

Brankas dibaca **lebih dulu**, env var jadi cadangan. Jadi lima OLT yang sudah
berjalan tidak perlu disentuh sama sekali. Kalau nanti dipindah ke brankas,
barulah barisnya boleh dihapus dari `.env` — satu per satu, setelah tombol uji
di layar perangkat itu menjawab hijau.
