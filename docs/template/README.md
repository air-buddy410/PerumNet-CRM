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
adalah kontraknya — importer mencocokkan kolom lewat JUDULNYA, bukan urutannya,
jadi menyisipkan kolom baru aman tetapi mengganti nama kolom lama tidak.
Penjaganya ada di `tests/unit/employee-import.test.ts` ("judul template cocok
dengan yang diharapkan pembaca").

## Yang perlu diketahui HRD saat mengisi

**Kolom NIK boleh dikosongkan.** Sistem menerbitkannya sendiri: delapan angka
diawali 1 (`10000001`, `10000002`, …). Nomornya baru terbit saat impor
diterapkan, dan ditampilkan setelah selesai.

**Kolom "NIK Atasan" menerima NIK *atau* nama lengkap persis.** Ini penting
untuk pengisian PERTAMA: saat itu belum ada seorang pun yang punya NIK, jadi
kolom itu mustahil diisi dengan nomor. Tulis saja nama atasannya persis seperti
tertulis di kolom Nama Lengkap.

Kalau ada **dua orang bernama sama** di berkas yang sama, rujukan namanya
ditolak dan diminta memakai NIK — bukan diambil salah satu. Mengambil yang
pertama berarti separuh tim melapor kepada orang yang salah, dan tidak ada yang
akan menyadarinya.

**Baris contoh (baris 4) harus dihapus.** Kalau ikut terkirim, impor
menolaknya dengan pesan jelas — bukan diam-diam membuat pegawai fiktif.

**Hapus baris yang sudah pernah diimpor sebelum mengirim ulang?** Tidak perlu.
Orang yang sudah terdaftar dilewati, ditandai "sudah terdaftar" di pratinjau.
Impor **hanya membuat, tidak pernah mengubah** data yang sudah ada — perbaikan
pada pegawai yang sudah masuk dilakukan lewat CRM, bukan dengan mengirim ulang
berkas.

**Satu baris bermasalah menahan seluruh berkas.** Tidak ada impor separuh
jalan: impor separuh jauh lebih sulit dibereskan daripada impor yang ditolak.

### Cara membuat ulang

`scripts/_buat-template-pegawai.py` (butuh `openpyxl`). Templatenya sendiri
di-commit supaya HRD bisa langsung mengunduh tanpa menjalankan apa pun.
