# Memasang PerumNet CRM di server

Sampai sekarang CRM hanya pernah berjalan di laptop. Berkas ini yang membuatnya
bisa dipasang di VPS.

## Yang dibutuhkan di server

Docker dan Docker Compose. Tidak ada lagi — Node, npm, dan PostgreSQL semuanya
ikut di dalam kontainer.

## 1. Siapkan berkas rahasia

Di folder proyek pada server, buat berkas `.env`:

```
POSTGRES_USER=perumnet
POSTGRES_PASSWORD=<sandi panjang dan acak>
POSTGRES_DB=perumnet_crm

SESSION_SECRET=<acak, minimal 32 karakter>
APP_URL=https://crm.perumnet.id
APP_PORT=3300

AUTH_PROVIDER=MAILSERVER
MAILCOW_API_KEY=<kunci read-write dari mailcow>

SMTP_HOST=mail.perumnet.id
SMTP_PORT=587
SMTP_USER=admin@perumnet.id
SMTP_PASSWORD=<sandi surel admin@>
IT_SUPPORT_EMAIL=it@perumnet.id
```

Membangkitkan nilai acak:

```bash
openssl rand -base64 48
```

**Berkas ini tidak pernah ikut masuk citra Docker** — lihat `.dockerignore`.
Citra berpindah tangan (registry, VPS, laptop orang lain), dan apa pun yang ikut
di dalamnya ikut berpindah. Kredensial disuntikkan saat menjalankan.

## 2. Nyalakan

```bash
docker compose up -d --build
```

## 3. Siapkan skema database — SEKALI, oleh manusia

```bash
docker compose run --rm tools npx prisma db push
```

**Perhatikan `tools`, bukan `app`.** Citra runtime sengaja ramping — ia memuat
klien Prisma tetapi bukan CLI-nya, dan tidak memuat `tsx` sama sekali karena
keduanya devDependency. Menjalankan `npx prisma` di sana membuat npm mengunduh
versi terbaru dari internet, yang sudah tidak mendukung bentuk skema proyek ini.
Kegagalannya menyesatkan: ia bicara soal `url` di `schema.prisma`, seolah
skemanya yang salah.

Perintah ini **sengaja tidak dijalankan otomatis saat kontainer menyala.**
Kalau otomatis, setiap restart — termasuk restart otomatis saat kontainer mati —
ikut menyentuh skema database. Perubahan skema adalah hal yang dilakukan sadar,
sekali, oleh orang yang tahu sedang mengubah apa.

Lalu isi data awal, hanya pada pemasangan pertama:

```bash
docker compose run --rm tools npx tsx prisma/seed.ts
```

## 4. Periksa

```bash
curl -sS http://localhost:3300/api/health
```

Jawaban `{"status":"ok"}` berarti aplikasinya hidup **dan** databasenya
terjangkau. Databasenya ikut diperiksa dengan sengaja: proses yang hidup tapi
tidak bisa menyentuh database akan menjawab setiap permintaan dengan galat, dan
health check yang cuma bilang "proses jalan" akan menyatakannya sehat sepanjang
hari.

## Memperbarui versi

```bash
git pull
docker compose up -d --build
```

Bila ada perubahan skema, jalankan `db push` di atas **setelah** citranya
diperbarui.

## Yang harus diketahui sebelum menyentuh apa pun

**Baris `name: perumnet-crm` di `docker-compose.yml` jangan dihapus.** Tanpa itu
Compose menurunkan nama proyek dari nama folder. Ganti nama folder — atau
pindahkan, seperti yang sudah pernah terjadi ke `APP-Perumnet/` — dan Compose
membuat volume baru yang kosong. Database naik seolah-olah seluruh datanya
lenyap.

Di mesin pengembangan masih tersisa volume `prtgperumnet_perumnet-pgdata` dari
zaman foldernya bernama "PRTG PerumNet". Itu bekas kejadian yang sama.

**Volume `uploads` adalah data, bukan cache.** Isinya foto pegawai, bukti
pekerjaan, dan tanda tangan. Menghapusnya menghapus semuanya, dan tidak ada
salinannya di tempat lain.

**Port database sengaja tidak dipetakan ke host.** Yang perlu menghubunginya
hanya aplikasi, lewat jaringan internal Compose. Membuka 5432 berarti membuka
database ke seluruh jaringan tempat VPS itu berada.

## Cadangan

**Belum ada cadangan terjadwal untuk CRM.** Enterprise punya cron 18:30 dan
Warehouse 02:30; CRM tidak punya satu pun. Sampai itu dibuat, seluruh cadangan
di bawah ini dijalankan manusia — dan yang tidak dijalankan tidak ada.

Basis data. **Nama databasenya diambil dari `.env`, jangan diketik ulang:**

```bash
cd ~/apps/crm
set -a; . ./.env; set +a
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > cadangan-$(date +%F).sql.gz
```

### Periksa hasilnya. Perintah ini gagal tanpa bersuara.

```bash
zcat cadangan-$(date +%F).sql.gz | grep -c '^COPY '
```

Harus **puluhan** (141 pada 19 Agustus 2026, berkasnya ~1,9 MB). Nol berarti
cadangannya kosong.

Ini bukan kehati-hatian berlebih. Berkas ini sebelumnya menulis
`pg_dump -U perumnet perumnet`, sementara database produksinya bernama
`perumnet_crm`. Yang terjadi kalau perintah itu dijalankan:

```
pg_dump: error: ... FATAL: database "perumnet" does not exist
```

`pg_dump` gagal, **tetapi `gzip` di sisi kanan pipa tetap berhasil** — ia
memampatkan nol bita menjadi berkas 30 bita yang sah. Berkas itu muncul di
direktori dengan nama dan tanggal yang benar, dan **`gzip -t` menyatakannya
utuh**. Satu-satunya cara mengetahuinya adalah menghitung isinya.

Kalau kamu memakai `set -o pipefail`, kegagalannya terlihat. Kebanyakan orang
tidak, dan skrip cron biasanya juga tidak.

Kenapa namanya diambil dari `.env` sekarang: `POSTGRES_DB` adalah nilai yang
sama yang dipakai Compose untuk membuat database itu. Mengetiknya ulang di sini
berarti dua sumber kebenaran yang bebas menyimpang — dan sudah menyimpang.

Lampiran:

```bash
docker run --rm -v perumnet-crm_uploads:/data -v "$PWD":/keluar alpine \
  tar czf /keluar/uploads-$(date +%F).tar.gz -C /data .
```

Keduanya perlu. Basis data tanpa lampiran menyisakan kartu pegawai tanpa foto
dan berita acara tanpa tanda tangan.
