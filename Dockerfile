# ── Citra produksi PerumNet CRM (Fase 57) ──────────────────────
#
# Tiga tahap, dan pemisahannya bukan sekadar rapi:
#
#   deps    — hanya bergantung pada package*.json, jadi lapisan npm ci
#             dipakai ulang selama daftar dependensi tidak berubah. Mengubah
#             satu baris kode tidak memicu unduh ulang seluruh dependensi.
#   builder — membangun aplikasi.
#   runner  — HANYA hasil bangunannya. Tidak ada kode sumber, tidak ada
#             devDependencies, tidak ada perkakas build.
#
# Dua hal yang sengaja TIDAK dilakukan:
#
#   1. Tidak ada `prisma migrate` maupun `db push` di dalam citra. Mengubah
#      skema database saat kontainer menyala berarti setiap kali kontainer
#      dijalankan ulang — termasuk saat autoscale atau restart otomatis —
#      skema ikut disentuh. Itu dijalankan sadar oleh manusia, sekali, lewat
#      perintah tersendiri.
#   2. Tidak ada kredensial apa pun. Semuanya disuntikkan saat menjalankan.

ARG NODE_VERSION=22-alpine

# ── deps ────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# Prisma butuh openssl untuk mesin kuerinya; tanpa ini generate gagal dengan
# pesan yang tidak menunjuk penyebabnya.
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
RUN npm ci

# ── builder ─────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Klien Prisma dibangkitkan dari skema, bukan diambil dari node_modules yang
# tersalin — klien basi menghasilkan galat yang terlihat seperti masalah
# database ("column does not exist") padahal cuma kliennya tertinggal.
RUN npx prisma generate

# DATABASE_URL palsu: `next build` menyentuh modul yang membuat PrismaClient,
# dan pembuatannya menuntut variabel ini ADA — bukan menyambung. Tidak ada
# database yang dihubungi saat membangun.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runner ──────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3300
ENV HOSTNAME=0.0.0.0

# Berjalan sebagai pengguna biasa, bukan root. Kalau suatu saat ada celah yang
# memungkinkan menulis berkas, bedanya besar.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Skema dan klien Prisma dibutuhkan saat berjalan — juga oleh perintah
# migrasi yang dijalankan manusia lewat `docker compose run`.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Lampiran ditulis ke sini. Dijadikan volume di compose; dibuat di sini supaya
# pemiliknya benar sejak awal, bukan root.
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3300

# Health check memakai jalur yang memang tidak butuh login. Menunjuk halaman
# berlogin akan selalu "sehat" karena pengalihan ke /login pun HTTP 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3300/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
