# Template input data

## Template-Data-Pegawai.xlsx

Untuk HRD mengisi data pegawai, lalu diimpor ke CRM.

**Kolom dan nilainya mengikuti kode**, bukan karangan: dropdown pada Jenjang
Jabatan, Status Kepegawaian, Pola Kerja, dan Aktif diambil dari `JOB_LEVELS`,
`EMPLOYEE_TYPES`, `WORK_PATTERNS`, `EDUCATION_LEVELS`, dan `BLOOD_TYPES`
di `src/lib/constants.ts`. Labelnya
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

## Kolom Divisi (ditambahkan Fase 52)

Nama divisi di dropdown **harus sama persis** dengan tabel `Division` di
database. Kalau daftar di sana berubah, `DIVISI` di
`scripts/_buat-template-pegawai.py` ikut diperbarui — impor mencocokkannya per
huruf, dan nama yang tidak dikenal **ditolak**, bukan dikosongkan diam-diam.
Kode divisi (`MKT`, `NOC`, …) juga diterima.

**Berkas yang sudah terlanjur diisi tanpa kolom ini tetap bisa diimpor.**
Importer mencocokkan kolom lewat judulnya, jadi HRD cukup menambahkan satu
kolom berjudul `Divisi` di mana saja — tidak perlu mengunduh ulang. Tapi kalau
kolomnya ada dan ada sel yang kosong, itu **ditolak**: sel kosong berarti
seseorang terlewat, dan pegawai tanpa divisi tidak bisa dibuatkan akun maupun
dilabeli kotak emailnya.

**Divisi bukan hak akses.** Ia menentukan kelompok, label kotak surat, dan
akses ke aplikasi PerumNet lain. Peran serta kewenangan di CRM tetap ditetapkan
IT — tidak bisa ditentukan dari berkas ini. Kalau bisa, spreadsheet berubah
menjadi penentu kewenangan.

Divisi dari berkas disimpan di `Employee.divisionId` (fakta kepegawaian) dan
**tidak pernah** menimpa `User.divisionId` (yang dibaca mesin akses). Perbedaan
keduanya dilaporkan sebagai catatan di pratinjau, bukan diselaraskan diam-diam.

### Cara membuat ulang

`scripts/_buat-template-pegawai.py` (butuh `openpyxl`). Templatenya sendiri
di-commit supaya HRD bisa langsung mengunduh tanpa menjalankan apa pun.

## Data diri (Fase 60)

Empat kolom terakhir sebelum `Cek` — Tempat Lahir, Tanggal Lahir, Pendidikan
Terakhir, Golongan Darah — **semuanya opsional.** Berkas yang sudah terlanjur
diisi sebelum kolom ini ada tetap bisa diimpor apa adanya.

**Golongan darah wajib menyebut tandanya.** `A` saja ditolak; yang diterima
`A+` atau `A−`. Ini satu-satunya tempat di importer yang menolak sesuatu yang
"jelas maksudnya", dan itu disengaja: pembanding umum di importer membuang
tanda hubung supaya "Non-Shift" cocok dengan "NON_SHIFT" — kalau golongan darah
ikut jalur itu, `A` dan `A−` menjadi teks yang sama persis dan orang yang
menulis `A` tercatat A-negatif. Golongan darah yang salah dipakai justru pada
saat tidak ada waktu memeriksanya ulang. Yang belum tahu memilih **Tidak
diketahui**, bukan mengosongkan atau menebak.

**Tanggal lahir diperiksa terhadap Tanggal Bergabung.** Lahir pada atau setelah
tanggal bergabung ditolak — bentuk salah ketik paling mungkin adalah dua kolom
tanggal yang tertukar, dan tanpa pemeriksaan ini ucapan ulang tahun muncul di
hari yang salah selamanya tanpa ada yang tahu sebabnya.

### Membangkitkan ulang berkasnya

```
python3 scripts/_buat-template-pegawai.py
```

Jalurnya relatif terhadap skrip. Sebelum Fase 60 ia menunjuk jalur mutlak ke
folder lama; setelah proyek dipindah ke `APP-Perumnet`, skrip tetap melaporkan
"tersimpan" sambil menulis ke tempat yang tidak dibaca siapa pun.
