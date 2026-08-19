#!/usr/bin/env bash
# Cadangan harian CRM: basis data + volume lampiran.
#
# Sampai 19 Agustus 2026 CRM sama sekali tidak punya cadangan terjadwal —
# 1.715 pelanggan, 8.632 port ODP, 4.034 mutasi stok, dan nol cadangan otomatis.
# Yang ada hanyalah perintah manual di docs/DEPLOY.md, dan perintah itu menyebut
# nama database yang salah sehingga menghasilkan berkas kosong.
#
# Dipasang di jalur TETAP di VPS (~/deploy/crm/), bukan di dalam ~/apps/crm —
# folder aplikasi bisa berpindah, dan cron yang menunjuk ke folder lama gagal
# diam-diam. Berkas di repo ini sumber kebenarannya; kalau diubah, salin ulang.
#
# PEMASANGAN (sekali saja):
#   mkdir -p ~/deploy/crm ~/.local/state/perumnet-crm ~/backups/perumnet-crm
#   scp deploy/cadangkan-database.sh <vps>:~/deploy/crm/
#   chmod +x ~/deploy/crm/cadangkan-database.sh
#   crontab -e
#
# BARIS CRON (04:30 WITA — sengaja jauh dari enterprise 18:30, warehouse 02:30,
# dan noc 03:30, supaya empat pg_dump tidak berebut disk bersamaan):
#   30 4 * * * /usr/bin/flock -n /home/perumnet/.local/state/perumnet-crm/backup.lock \
#     /home/perumnet/deploy/crm/cadangkan-database.sh \
#     >> /home/perumnet/.local/state/perumnet-crm/backup.log 2>&1
#
# MEMULIHKAN basis data:
#   gunzip -c <berkas>.sql.gz | docker exec -i perumnet-crm-db-1 \
#     psql -U perumnet -d perumnet_crm
# MEMULIHKAN lampiran:
#   docker run --rm -v perumnet-crm_uploads:/v -v "$PWD":/in alpine \
#     tar xzf /in/<berkas>.tar.gz -C /v
#
# ── KENAPA SKRIP INI REWEL SOAL VERIFIKASI ────────────────────────────────
# Perintah lama gagal SENYAP: pg_dump mati, gzip di sisi kanan pipa tetap
# sukses, berkas lahir dengan nama & tanggal benar, dan `gzip -t` menyatakannya
# utuh — 30 bita, nol baris. Tiga penangkal dipakai di sini, dan ketiganya
# diuji dengan sengaja menggagalkan skripnya:
#   1. `set -o pipefail` — tanpa itu status pipa milik perintah TERAKHIR.
#   2. Hitung blok COPY sesudahnya; berkas kosong tetap "utuh" menurut gzip.
#   3. Tulis ke .part, beri nama akhir hanya SETELAH isinya terbukti. Tanpa
#      ini, `set -e` menghentikan skrip di baris pipa sebelum verifikasi
#      sempat jalan — dan meninggalkan .sql.gz kosong bertanggal hari ini,
#      yang bagi siapa pun yang melihat folder tampak seperti cadangan yang
#      berhasil. Lubang ini nyata: versi pertama skrip kembar di monitoring-noc
#      melakukannya, dan ketahuan justru oleh uji jalur-gagal.

set -euo pipefail

CONTAINER=perumnet-crm-db-1
VOLUME=perumnet-crm_uploads
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/perumnet-crm}"
SIMPAN=14

# Nama database & user diambil dari container — nilai yang SAMA yang dipakai
# Compose untuk membuatnya. Mengetiknya ulang di sini berarti dua sumber
# kebenaran yang bebas menyimpang, dan di repo ini sudah terbukti menyimpang.
DB_ENV=$(docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}')
DB_NAME=$(printf '%s' "$DB_ENV" | sed -n 's/^POSTGRES_DB=//p' | head -1)
DB_USER=$(printf '%s' "$DB_ENV" | sed -n 's/^POSTGRES_USER=//p' | head -1)
if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ]; then
  echo "[$(date -Is)] GAGAL: POSTGRES_DB/POSTGRES_USER tidak terbaca dari $CONTAINER" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F-%H%M)
DB_TUJUAN="$BACKUP_DIR/crm-$STAMP.sql.gz"
UP_TUJUAN="$BACKUP_DIR/uploads-$STAMP.tar.gz"
DB_PART="$DB_TUJUAN.part"
UP_PART="$UP_TUJUAN.part"

trap 'rm -f "$DB_PART" "$UP_PART"' EXIT

# ── Basis data ────────────────────────────────────────────────────────────
echo "[$(date -Is)] mencadangkan $DB_NAME (user $DB_USER)"
docker exec -i "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$DB_PART"

BLOK=$(gunzip -c "$DB_PART" | grep -c '^COPY ' || true)
echo "[$(date -Is)] basis data: $(stat -c%s "$DB_PART") bita · ${BLOK} blok COPY"
if [ "$BLOK" -lt 1 ]; then
  echo "[$(date -Is)] GAGAL: cadangan basis data tidak memuat satu pun blok COPY." >&2
  exit 1
fi

# Basis datanya sudah terbukti — amankan SEKARANG, sebelum menyentuh lampiran.
# Versi pertama skrip ini membuang dump yang sudah baik kalau lampiran gagal.
# Itu salah: kalau volume lampiran rusak seminggu, kita berakhir tanpa cadangan
# basis data sama sekali — kehilangan 1.715 pelanggan jauh lebih mahal daripada
# kehilangan empat lampiran. Yang gagal ditandai keras, bukan menyeret yang
# berhasil ikut hilang.
mv "$DB_PART" "$DB_TUJUAN"
trap 'rm -f "$UP_PART"' EXIT

# ── Lampiran (foto pegawai, tanda tangan, bukti pekerjaan) ────────────────
# Ini DATA, bukan cache. Tidak ada salinannya di tempat lain.
docker run --rm -v "$VOLUME":/v -v "$BACKUP_DIR":/out alpine \
  tar czf "/out/$(basename "$UP_PART")" -C /v . 2>/dev/null

BERKAS=$(tar tzf "$UP_PART" | grep -vc '/$' || true)
echo "[$(date -Is)] lampiran : $(stat -c%s "$UP_PART") bita · ${BERKAS} berkas"
if [ "$BERKAS" -lt 1 ]; then
  echo "[$(date -Is)] GAGAL: cadangan lampiran kosong — basis datanya TETAP tersimpan" >&2
  echo "[$(date -Is)]        di $DB_TUJUAN. Yang perlu diperiksa cuma volume $VOLUME." >&2
  exit 1
fi

mv "$UP_PART" "$UP_TUJUAN"
trap - EXIT

# Pangkas HANYA setelah cadangan hari ini terbukti berisi — supaya cadangan
# lama tidak pernah dihapus demi cadangan yang ternyata kosong.
find "$BACKUP_DIR" \( -name 'crm-*.sql.gz' -o -name 'uploads-*.tar.gz' \) \
  -type f -mtime +"$SIMPAN" -print -delete

echo "[$(date -Is)] selesai · $(ls -1 "$BACKUP_DIR"/crm-*.sql.gz 2>/dev/null | wc -l) cadangan basis data tersimpan"
