# Alias kode material

Kode material yang salah tulis di log pergerakan, dan kode mana sebenarnya
yang dimaksud. Dipakai oleh `scripts/_impor-gerak-stok.ts`.

**Ini catatan keputusan orang, bukan aturan yang boleh disimpulkan mesin.**
Menormalkan kode secara otomatis sempat dicoba dan salah pada kasus yang
justru paling penting:

- `PAT-000009` dinormalkan dari angkanya menjadi `PAT-0009`, yaitu "Patch Core
  LC UPC - LC UPC 10 M". Namanya "Pigtail Tipe ST", dan barang itu `PAT-0008`.
- `SPL-000000` menjadi `SPL-0000`, kode yang tidak pernah ada; namanya
  menunjuk `SPL-0002`.
- `ELE-0025` bernama "Flexible" yang di master `ACC-0036`, dan `ACC-0019`
  bernama "Closure 216 C" yang di master `CLS-0004` — prefiksnya pun berbeda.

## Isi berkas

Tujuh entri pertama beda pemisah saja; angkanya sama persis, jadi itu
pembersihan, bukan keputusan.

Enam entri berikutnya beda jumlah digit — `ACC-005` melawan `ACC-0005`.
Diputuskan pemilik jaringan pada 16 Agustus 2026: **samakan ke kode yang
digitnya lebih banyak**, mengikuti bentuk kode lain. Seluruhnya dicek namanya
lebih dulu, dan pada keenamnya nama di sumber merupakan awalan nama di master
(`Baju Engginer` → `Baju Engginer Nagata L`).

`SER 010/011/012` bernama sama persis bertiga di sumber; yang membedakannya
hanya digitnya, dan pemetaan ini yang menentukan mana XL, L, dan M.

## Yang TIDAK ada di sini

- 23 kode tanpa nama di lembar mana pun — diputuskan diabaikan.
- 7 kode yang NAMANYA sama persis dengan barang yang sudah ada tetapi kodenya
  berbeda. Menunggu keputusan; lihat tab "1. Nama sama" pada berkas kerja tim.
