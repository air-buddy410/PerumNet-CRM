# Template input data

## Template-Data-Pegawai.xlsx

Untuk HRD mengisi data pegawai, lalu diimpor ke CRM.

**Kolom dan nilainya mengikuti kode**, bukan karangan: dropdown pada Jenjang
Jabatan, Status Kepegawaian, Pola Kerja, dan Aktif diambil dari `JOB_LEVELS`,
`EMPLOYEE_TYPES`, dan `WORK_PATTERNS` di `src/lib/constants.ts`. Labelnya
Indonesia supaya HRD tidak perlu tahu kode internalnya; pemetaan kembali ke
kode dilakukan saat impor.

**Kolom `Cek` menegakkan aturan yang sama dengan server.** Rumusnya mencerminkan
`contractRejection()` di `src/lib/employment.ts`:

| Yang ditangkap | Kenapa |
|---|---|
| Kolom wajib kosong | Ditolak `saveEmployee()` |
| `Kontrak` tanpa tanggal berakhir | Ditolak — kontrak wajib punya batas |
| Tanggal kontrak pada jenis bukan-Kontrak | **Paling berbahaya.** Penyapu Fase 42 membekukan akun berdasarkan `contractEndAt`; tanggal yang tertinggal pada karyawan tetap akan membekukan orang yang masih bekerja |
| Berakhir ≤ Mulai | Kontrak nol hari bukan kontrak |

Menjaga keduanya sejalan itu disengaja: kalau template lebih longgar dari
server, HRD baru tahu datanya salah setelah mengisi dua ratus baris.

**Kalau kolom di template berubah, importer harus ikut berubah.** Nama kolom
adalah kontraknya.

### Cara membuat ulang

`scripts/_buat-template-pegawai.py` (butuh `openpyxl`). Templatenya sendiri
di-commit supaya HRD bisa langsung mengunduh tanpa menjalankan apa pun.
