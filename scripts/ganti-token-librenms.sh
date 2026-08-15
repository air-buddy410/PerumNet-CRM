#!/usr/bin/env bash
# Mengganti token API LibreNMS pada deployment VPS.
#
#   ./scripts/ganti-token-librenms.sh
#
# Tokennya DIMINTA secara interaktif dan tidak pernah muncul di layar maupun
# di riwayat perintah. Itu inti keberadaan skrip ini: token yang diketik
# langsung di baris perintah akan tersimpan di ~/.bash_history, terbaca oleh
# siapa pun yang bisa masuk ke mesin, dan tetap di sana setelah dirotasi.
#
# Jalankan DARI DALAM ~/apps/crm di VPS.

set -euo pipefail

ENV_FILE=".env"
VAR="LIBRENMS_API_TOKEN"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Tidak menemukan $ENV_FILE — jalankan dari dalam ~/apps/crm." >&2
  exit 1
fi

# -s: tidak menggema ke layar.
read -rsp "Tempel token LibreNMS yang baru (tidak akan terlihat): " TOKEN
echo

if [[ -z "${TOKEN// }" ]]; then
  echo "Token kosong — tidak ada yang diubah." >&2
  exit 1
fi

# Cadangkan dulu. Berkas .env memuat seluruh rahasia deployment; menimpanya
# tanpa salinan berarti satu salah ketik menjatuhkan aplikasinya.
CADANGAN="${ENV_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$CADANGAN"
chmod 600 "$CADANGAN"

if grep -q "^${VAR}=" "$ENV_FILE"; then
  # Ditulis lewat berkas sementara, bukan `sed -i`, supaya token tidak pernah
  # menjadi bagian dari baris perintah yang terlihat di `ps`.
  TMP="$(mktemp)"
  chmod 600 "$TMP"
  grep -v "^${VAR}=" "$ENV_FILE" > "$TMP"
  printf '%s=%s\n' "$VAR" "$TOKEN" >> "$TMP"
  mv "$TMP" "$ENV_FILE"
  echo "→ $VAR diperbarui (cadangan: $CADANGAN)"
else
  printf '%s=%s\n' "$VAR" "$TOKEN" >> "$ENV_FILE"
  echo "→ $VAR ditambahkan (cadangan: $CADANGAN)"
fi
unset TOKEN

echo "→ memuat ulang worker…"
docker compose up -d worker >/dev/null

echo "→ memaksa sinkron berjalan sekarang…"
docker exec perumnet-crm-db-1 psql -U perumnet -d perumnet_crm -q -c \
  "UPDATE \"ScheduledTask\" SET \"lastRunAt\" = now() - interval '20 minutes' WHERE code='librenms.sync';" >/dev/null

sleep 35
echo "── hasil ──"
docker logs --tail 40 perumnet-crm-worker-1 2>&1 | grep -i 'librenms.sync' | tail -2

echo
echo "Bila berhasil, HAPUS token lama di nms.perumnet.id → API Settings."
echo "Cadangan .env lama ada di $CADANGAN — hapus setelah yakin."
