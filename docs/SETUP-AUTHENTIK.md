# Pemasangan Authentik — Persiapan Fase 45

**Tanggal:** 2026-08-12
**Untuk:** dipasang sendiri di VPS lokal (jaringan MikroTik distribusi)
**Hasil akhir yang dibutuhkan:** Issuer URL + Client ID untuk CRM

---

## 0. Sebelum mulai — dua hal yang menentukan

### 0.1 Authentik harus punya nama host tetap dan HTTPS

Alur OIDC memantulkan peramban antara CRM dan Authentik. Peramban itu berjalan
di laptop/HP pegawai, jadi **Authentik harus bisa dijangkau dari tempat mereka
bekerja** — bukan hanya dari dalam jaringan distribusi.

Karena kamu sudah punya Cloudflare Tunnel, itu jalan paling bersih: arahkan
`auth.perumnet.id` ke Authentik lewat tunnel, tanpa perlu IP publik dan tanpa
membuka port apa pun di MikroTik.

**Jangan** memakai IP + port (`https://10.x.x.x:9443`) sebagai issuer. Nilai itu
tertanam di token dan di konfigurasi setiap aplikasi; menggantinya belakangan
berarti mendaftar ulang semuanya.

### 0.2 Authentik JANGAN ditaruh di belakang proxy yang butuh Authentik

Terdengar sepele, tapi ini kesalahan yang sering terjadi: memasang
Authentik Proxy Provider di depan Authentik sendiri. Kalau Authentik mati atau
salah konfigurasi, tidak ada jalan masuk untuk memperbaikinya.

---

## 1. Pemasangan

Ikuti **dokumentasi resmi** di `https://docs.goauthentik.io/docs/install-config/`
— ambil `docker-compose.yml` langsung dari sana, jangan dari catatan lama
(termasuk catatan ini). Berkas itu berubah antar versi.

Yang perlu kamu siapkan sendiri saat mengisi `.env` Authentik:

| Isian | Catatan |
|---|---|
| `PG_PASS` | password PostgreSQL Authentik — acak, panjang |
| `AUTHENTIK_SECRET_KEY` | kunci rahasia aplikasi — acak, panjang |
| `AUTHENTIK_EMAIL__*` | arahkan ke SMTP AWS-mu, supaya reset password bisa jalan |

Authentik butuh **PostgreSQL dan Redis sendiri** — jangan disatukan dengan
database CRM. Keduanya sudah ikut di compose resminya.

Setelah container jalan, buka `https://auth.perumnet.id/if/flow/initial-setup/`
untuk membuat akun admin pertama.

---

## 2. Yang harus kamu lakukan SEBELUM menyentuh CRM

### 2.1 Backup database Authentik, dan uji pemulihannya

Kalau database Authentik hilang, **semua orang kehilangan akses ke semua
aplikasi sekaligus** — bukan hanya CRM. Ini satu-satunya komponen di seluruh
sistemmu yang kegagalannya menghentikan segalanya.

Backup harian `pg_dump` sudah cukup, tapi **sekali saja coba pulihkan ke
container kosong** untuk memastikan backup-nya benar-benar bisa dipakai.

### 2.2 Samakan alamat email

CRM mencocokkan akun lewat **email**. Sebelum Fase 45 dinyalakan, pastikan
alamat email tiap orang di Authentik sama persis dengan yang ada di CRM.

Yang tidak cocok tidak akan bisa masuk — dan gejalanya membingungkan karena
login-nya berhasil di sisi Authentik, tapi CRM tidak mengenalinya.

Sinkronisasi mailbox di `/it/mailboxes` (Fase 44) bisa dipakai untuk melihat
selisih alamat lebih dulu.

---

## 3. Membuat Application + Provider untuk CRM

Di Authentik: **Applications → Providers → Create → OAuth2/OpenID Provider**.

| Isian | Nilai |
|---|---|
| Name | `PerumNet CRM` |
| Authorization flow | `default-provider-authorization-explicit-consent` (atau implicit bila tidak ingin layar persetujuan) |
| Client type | **Confidential** |
| Redirect URIs | `https://<alamat-crm>/api/auth/callback/oidc` |
| Scopes | `openid`, `profile`, `email` |
| Subject mode | biarkan bawaan (`Based on the User's hashed ID`) |

Lalu **Applications → Create**, tautkan ke Provider di atas. **Slug**-nya yang
menentukan Issuer URL, jadi pakai sesuatu yang stabil: `perumnet-crm`.

### Redirect URI harus persis

Termasuk `https://`, nama host, dan tanpa garis miring di akhir. Authentik
mencocokkannya karakter per karakter — satu beda, login gagal dengan pesan
yang tidak menjelaskan apa-apa.

Kalau CRM diakses lewat lebih dari satu alamat (mis. domain publik dan
`localhost` saat pengembangan), daftarkan **semuanya** sebagai baris terpisah.

---

## 4. Yang saya butuhkan darimu

Setelah Application dibuat, kirim **dua** ini:

1. **Issuer URL** — bentuknya:
   `https://auth.perumnet.id/application/o/perumnet-crm/`
2. **Client ID**

Keduanya bisa dilihat di halaman Provider, bagian "OpenID Configuration
Issuer" dan "Client ID".

### Client Secret JANGAN dikirim ke saya

Kamu sendiri yang menaruhnya di `.env` server CRM:

```
OIDC_CLIENT_SECRET=<nilai dari Authentik>
```

Yang masuk database CRM tetap hanya **nama variabelnya**, sama seperti API key
mailcow dan kredensial MikroTik. Saya tidak perlu — dan tidak boleh — melihat
nilainya.

### Cara cepat memastikan Issuer-nya benar

Buka di peramban:

```
https://auth.perumnet.id/application/o/perumnet-crm/.well-known/openid-configuration
```

Kalau keluar JSON berisi `authorization_endpoint`, `token_endpoint`, dan
`jwks_uri`, berarti sudah benar. Kalau 404, slug aplikasinya berbeda.

---

## 5. Yang akan saya kerjakan di Fase 45

Supaya kamu tahu apa yang berubah:

- Login lewat Authentik saat `AUTH_PROVIDER=OIDC`. Saklar itu **sudah ada**
  sejak Fase 34 — sampai diubah, tidak ada yang bergeser sedikit pun.
- Pencocokan akun lewat email, dengan **id akun Authentik disimpan** sebagai
  penaut tetap. Jadi ketika seseorang ganti alamat email, tautannya tidak
  putus dan riwayatnya tidak hilang.
- Halaman profil otomatis menyembunyikan form ganti password —
  `passwordChangeAvailable()` sudah dihormati frontend sejak Fase 34.
- Sesi tetap memakai `sessionEpoch`, sehingga mencabut akses seseorang tetap
  langsung menutup sesinya di semua perangkat.

### Akun darurat lokal — wajib, bukan opsional

Kalau Authentik mati dan **tidak ada jalan masuk lain**, tidak ada seorang pun
bisa masuk CRM — termasuk untuk memperbaiki Authentik-nya.

Jadi Fase 45 akan tetap menyediakan satu jalur login lokal untuk akun darurat,
dan **setiap pemakaiannya tercatat di audit log**. Ini bukan celah yang saya
tinggalkan; ini pintu keluar kebakaran yang memang harus ada, dan
pemakaiannya harus terlihat.

---

## 6. Setelah CRM jalan — aplikasi berikutnya

Urutan yang saya sarankan:

1. **CRM** (Fase 45) — paling banyak dipakai, paling cepat terasa manfaatnya
2. **mailcow** — jadikan klien Authentik juga, sehingga password benar-benar
   satu. Ini yang membuat "1 pintu" jadi nyata, bukan sekadar "1 password yang
   diketik di banyak tempat"
3. **LibreNMS**, **captive portal**, dan aplikasi lain (Fase 46)

Jangan pindahkan semuanya sekaligus. Setiap aplikasi yang dipindah adalah satu
kesempatan mengunci orang di luar; pindahkan satu, pakai beberapa hari,
baru lanjut.

---

## Ringkasan checklist

- [ ] Authentik jalan di `auth.perumnet.id` lewat Cloudflare Tunnel, HTTPS
- [ ] Akun admin pertama dibuat
- [ ] SMTP AWS terhubung (untuk reset password)
- [ ] Backup `pg_dump` harian **dan sudah diuji pulih**
- [ ] Email tiap orang di Authentik sama persis dengan di CRM
- [ ] Application `perumnet-crm` + OAuth2/OIDC Provider dibuat
- [ ] Redirect URI: `https://<alamat-crm>/api/auth/callback/oidc`
- [ ] Scope `openid profile email` aktif
- [ ] `.well-known/openid-configuration` mengembalikan JSON
- [ ] `OIDC_CLIENT_SECRET` ditaruh di `.env` server CRM **oleh kamu sendiri**
- [ ] **Issuer URL + Client ID dikirim ke saya** → Fase 45 mulai
