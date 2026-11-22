# PRODUCT REQUIREMENTS DOCUMENT (PRD)
# MONETRA TRACKER

**Versi:** 2.0  
**Status:** Final — Product Planning  
**Platform:** Responsive Web Application + PWA  
**Deployment:** Vercel  
**Database & Backend:** Supabase (PostgreSQL)  
**Authentication:** Google OAuth  
**Target Pengguna:** Keluarga

---

## 1. PRODUCT OVERVIEW

### 1.1 Nama Produk

MONETRA Tracker

### 1.2 Deskripsi Produk

Monetra Tracker adalah aplikasi pengelolaan keuangan keluarga berbasis web yang memungkinkan anggota keluarga mencatat pemasukan, pengeluaran, mengelola dompet pribadi, membuat anggaran, memantau transaksi, serta melihat laporan keuangan secara terstruktur.

Aplikasi menggunakan sistem Family Workspace yang memungkinkan beberapa anggota keluarga berada dalam satu ruang pengelolaan keuangan dengan pengaturan hak akses dan privasi masing-masing.

Aplikasi dirancang menggunakan Progressive Web App (PWA) sehingga dapat diakses melalui browser, diinstal pada perangkat, dan mendukung penggunaan offline.

Data akan disimpan secara permanen pada Supabase PostgreSQL dan disinkronisasikan dengan penyimpanan lokal ketika koneksi internet tersedia.

### 1.3 Latar Belakang

Pengelolaan keuangan keluarga sering dilakukan secara manual menggunakan catatan pribadi, spreadsheet, atau aplikasi pesan.

Beberapa permasalahan yang ingin diselesaikan:

- Pencatatan pemasukan dan pengeluaran tidak terorganisasi.
- Riwayat transaksi sulit ditemukan.
- Anggota keluarga kesulitan memantau kondisi keuangan.
- Tidak ada pemisahan yang jelas antara keuangan pribadi dan keluarga.
- Pengeluaran sulit dikontrol.
- Data berisiko hilang ketika aplikasi ditutup atau perangkat berganti.
- Pencatatan terganggu ketika tidak tersedia koneksi internet.

### 1.4 Solusi

Family Finance Tracker menyediakan satu platform terintegrasi untuk mengelola keuangan keluarga dengan fitur:

- Penyimpanan data permanen di cloud.
- Login menggunakan Google.
- Pengelolaan anggota keluarga.
- Dompet pribadi.
- Pencatatan pemasukan dan pengeluaran.
- Pengaturan privasi transaksi.
- Pengelolaan anggaran.
- Transaksi berulang.
- Laporan keuangan.
- Export laporan.
- Offline mode dan sinkronisasi otomatis.

---

## 2. PRODUCT GOALS

Tujuan utama pengembangan:

1. Memudahkan keluarga mencatat seluruh aktivitas keuangan.
2. Menyediakan penyimpanan data permanen.
3. Memungkinkan akses data dari berbagai perangkat.
4. Memberikan kontrol privasi kepada setiap anggota.
5. Mempermudah pemantauan pemasukan dan pengeluaran.
6. Membantu keluarga mengontrol anggaran.
7. Menyediakan laporan keuangan secara otomatis.
8. Mendukung pencatatan ketika perangkat tidak terhubung ke internet.

### 2.1 Success Metrics

| Indikator | Target |
|---|---|
| Penyimpanan transaksi | Permanen di Supabase setelah berhasil disinkronkan |
| Sinkronisasi offline | Berjalan ketika koneksi kembali tersedia |
| Privasi | Tidak ada akses tanpa izin |
| Perhitungan saldo | Akurat berdasarkan ledger transaksi |
| Responsivitas | Mobile, tablet, desktop |
| Authentication | Google OAuth |
| Offline | PWA dapat dibuka dan digunakan untuk fitur yang didukung |

---

## 3. TARGET USERS

Target pengguna adalah keluarga yang ingin mengelola keuangan secara bersama dengan tetap mempertahankan privasi keuangan pribadi.

### 3.1 User Roles

**Owner**
- Membuat dan mengelola keluarga.
- Mengundang anggota.
- Mengelola role anggota.
- Melihat seluruh transaksi keluarga.
- Mengelola seluruh pengaturan keluarga.
- Mengelola transaksi anggota.

**Admin**
- Melihat seluruh transaksi keluarga.
- Mengelola transaksi.
- Mengelola kategori dan anggaran.
- Mengelola anggota sesuai kewenangannya.
- Tidak dapat mengambil alih atau menghapus Owner.

**Member**
- Membuat pemasukan dan pengeluaran.
- Mengelola dompet pribadi.
- Mengelola transaksi miliknya.
- Melihat transaksi Shared.
- Mengakses laporan sesuai hak akses.

### 3.2 Family Workspace

- Setiap keluarga memiliki satu ruang kerja.
- Satu pengguna dapat bergabung dengan beberapa keluarga.
- Setiap keluarga mempunyai data terisolasi.
- Owner dapat mengundang anggota melalui email.
- Setiap anggota memiliki membership dan role.
- Dompet dimiliki secara personal.

---

## 4. FUNCTIONAL REQUIREMENTS

### 4.1 Authentication

Metode login menggunakan Google OAuth melalui Supabase Auth.

Fitur:
- Login menggunakan Google.
- Logout.
- Session management.
- Pembuatan profil otomatis.
- Pengelolaan profil.
- Onboarding keluarga.
- Pemilihan Family Workspace.

Ketentuan:
- Google Client Secret tidak boleh berada di frontend.
- Session harus menggunakan mekanisme aman.
- Pengguna hanya dapat mengakses keluarga yang memiliki membership aktif.

### 4.2 Family Management

Fitur:
- Membuat keluarga.
- Mengubah nama keluarga.
- Melihat anggota keluarga.
- Mengundang anggota melalui email.
- Menerima undangan.
- Membatalkan undangan.
- Mengubah role anggota.
- Mengeluarkan anggota.

Ketentuan undangan:
- Menggunakan token unik.
- Token memiliki masa berlaku.
- Token hanya dapat digunakan sekali.
- Email penerima harus sesuai dengan akun yang menerima undangan.

### 4.3 Dashboard

Dashboard menampilkan:

- Total saldo.
- Total pemasukan.
- Total pengeluaran.
- Sisa anggaran.
- Grafik pemasukan dan pengeluaran.
- Pengeluaran berdasarkan kategori.
- Transaksi terbaru.
- Ringkasan keuangan bulanan.

Dashboard dibagi menjadi:

**Personal Dashboard:** menampilkan transaksi dan saldo milik pengguna.

**Family Dashboard:** menampilkan transaksi Shared yang dapat diakses anggota.

Owner dan Admin dapat melihat seluruh transaksi keluarga.

### 4.4 Transaction Management

Jenis transaksi:

- Income.
- Expense.

Data transaksi:

- ID transaksi.
- Judul.
- Nominal.
- Kategori.
- Dompet.
- Tanggal transaksi.
- Catatan.
- Pembuat transaksi.
- Visibilitas.
- Status sinkronisasi.

Fitur:
- Tambah transaksi.
- Edit transaksi.
- Hapus transaksi.
- Detail transaksi.
- Pencarian.
- Filter tanggal.
- Filter kategori.
- Filter dompet.
- Filter anggota.
- Pengaturan visibilitas.

Penghapusan menggunakan soft delete.

### 4.5 Transaction Visibility

Setiap transaksi memiliki dua jenis visibilitas.

**Private**
- Hanya pembuat yang dapat melihat.
- Owner dan Admin dapat melihat sesuai kewenangan.
- Tidak terlihat oleh Member lain.

**Shared**
- Dapat dilihat seluruh anggota keluarga.
- Tetap memiliki identitas pembuat.
- Tidak otomatis memberikan akses ke detail dompet pribadi.

Ketentuan:
- Default transaksi adalah Private.
- Creator dapat mengubah visibilitas transaksi.
- Visibilitas berlaku pada dashboard, laporan, pencarian, API, dan export.

### 4.6 Personal Wallet

Setiap anggota dapat memiliki beberapa dompet pribadi.

Jenis dompet:
- Cash.
- Bank.
- E-wallet.
- Savings.
- Other.

Fitur:
- Membuat dompet.
- Mengedit dompet.
- Mengarsipkan dompet.
- Mengatur saldo awal.
- Melihat saldo.
- Melihat transaksi dompet.
- Transfer antar-dompet.

Ketentuan:
- Satu dompet memiliki satu pemilik.
- Dompet tidak otomatis dibagikan.
- Transfer membutuhkan pemeriksaan izin pada kedua dompet.
- Transfer tidak dihitung sebagai pemasukan atau pengeluaran.
- Saldo dihitung berdasarkan saldo awal, transaksi, dan transfer.

### 4.7 Category Management

Kategori pemasukan:
- Gaji.
- Bisnis.
- Investasi.
- Bonus.
- Hadiah.
- Lainnya.

Kategori pengeluaran:
- Makanan.
- Transportasi.
- Belanja.
- Tagihan.
- Pendidikan.
- Kesehatan.
- Hiburan.
- Rumah tangga.
- Lainnya.

Fitur:
- Membuat kategori.
- Mengedit kategori.
- Mengatur ikon.
- Mengatur warna.
- Mengarsipkan kategori.

### 4.8 Budget Management

Fitur:
- Membuat anggaran.
- Mengatur batas pengeluaran.
- Anggaran berdasarkan kategori.
- Anggaran berdasarkan anggota.
- Melihat penggunaan anggaran.
- Peringatan anggaran hampir habis.
- Peringatan anggaran terlampaui.

Anggaran mendukung periode bulanan dan rentang tanggal khusus.

Perhitungan anggaran harus mengikuti hak akses dan cakupan data yang ditentukan.

### 4.9 Recurring Transactions

Mendukung dua metode:

**Automatic**
- Sistem membuat transaksi otomatis.
- Jadwal harian, mingguan, bulanan, dan tahunan.
- Memiliki tanggal mulai dan berakhir.
- Dapat diaktifkan atau dinonaktifkan.

**Reminder**
- Sistem membuat pengingat.
- Pengguna mencatat transaksi secara manual.
- Tidak otomatis menambah pengeluaran atau pemasukan.

Sistem harus mencegah eksekusi transaksi berulang lebih dari satu kali untuk jadwal yang sama.

### 4.10 Financial Reports

Jenis laporan:
- Laporan pemasukan.
- Laporan pengeluaran.
- Laporan saldo.
- Perbandingan bulanan.
- Pengeluaran berdasarkan kategori.
- Aktivitas anggota.
- Laporan dompet.

Filter:
- Harian.
- Mingguan.
- Bulanan.
- Tahunan.
- Rentang tanggal.
- Kategori.
- Anggota.
- Dompet.

Laporan wajib mengikuti aturan visibilitas transaksi.

### 4.11 Export

Format export:
- PDF.
- Excel.
- CSV.

Export harus mengikuti periode, filter, dan hak akses pengguna.

### 4.12 Offline Mode (PWA)

Aplikasi harus dapat diinstal melalui browser sebagai Progressive Web App.

Fitur offline:
- Membuka aplikasi tanpa internet setelah aplikasi pernah dimuat.
- Melihat data yang sudah tersimpan lokal.
- Menambahkan transaksi secara offline.
- Mengedit transaksi yang sudah tersimpan lokal.
- Menyimpan operasi ke antrean lokal.
- Menampilkan status sinkronisasi.
- Menyinkronkan perubahan ketika internet tersedia.

Teknologi:
- Service Worker.
- Web App Manifest.
- IndexedDB.
- TanStack Query.
- Background Sync jika didukung browser.
- Mekanisme sinkronisasi fallback.

Batasan:
- Login pertama membutuhkan internet.
- Membuat keluarga membutuhkan internet.
- Mengundang anggota membutuhkan internet.
- Data yang belum pernah diunduh tidak tersedia offline.
- Fitur cloud tidak dapat dijalankan sepenuhnya tanpa internet.

---

## 5. OFFLINE ARCHITECTURE

Aplikasi menggunakan dua lapisan penyimpanan.

**Local Storage Layer**
- IndexedDB.
- Menyimpan data transaksi lokal.
- Menyimpan cache data.
- Menyimpan antrean sinkronisasi.
- Menyimpan status operasi.

**Cloud Storage Layer**
- Supabase PostgreSQL.
- Menyimpan data permanen.
- Menyimpan data keluarga.
- Menyimpan transaksi.
- Menyimpan dompet dan anggaran.

### 5.1 Offline Workflow

1. Pengguna membuka aplikasi.
2. Aplikasi mengambil data terakhir dari IndexedDB.
3. Pengguna mencatat transaksi.
4. Transaksi langsung disimpan ke IndexedDB.
5. Status menjadi Pending Sync.
6. Internet kembali tersedia.
7. Aplikasi mengirim transaksi ke Supabase.
8. Server melakukan validasi dan menyimpan data.
9. Status berubah menjadi Synced.

### 5.2 Sync Status

- Synced.
- Pending.
- Syncing.
- Failed.
- Conflict.

### 5.3 Sync Rules

- Setiap operasi memiliki UUID unik.
- Pengiriman ulang tidak boleh membuat transaksi ganda.
- Data lokal tidak dihapus sebelum server mengonfirmasi penyimpanan.
- Konflik perubahan harus dideteksi.
- Transaksi yang dihapus menggunakan soft delete.
- Server tetap melakukan validasi otorisasi.
- Perubahan transaksi harus dapat dilacak.

Konflik perubahan diselesaikan secara eksplisit menggunakan versioning dan conflict resolution. Strategi last-write-wins tidak boleh digunakan secara sembarangan untuk data keuangan.

---

## 6. TECHNOLOGY STACK

| Komponen | Teknologi |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Data Fetching | TanStack Query |
| Routing | TanStack Router |
| Runtime / Package Manager | Bun |
| Hosting | Vercel |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Backend Services | Supabase |
| Server-side Logic | Supabase Edge Functions |
| Access Control | PostgreSQL RLS |
| Offline Storage | IndexedDB |
| PWA | Service Worker |
| Charts | Chart.js |
| Export | PDF, Excel, CSV libraries |

PHP Native tidak digunakan dalam arsitektur MVP ini. Supabase menjadi backend utama agar integrasi dan deployment Vercel lebih sederhana.

### 6.1 Deployment Architecture

User Browser / PWA  
↓  
Vercel  
↓  
HTML, CSS, JavaScript  
↓  
TanStack Query / Router  
↓  
Supabase Auth / API  
↓  
PostgreSQL + RLS

IndexedDB berfungsi sebagai penyimpanan lokal dan antrean sinkronisasi.

Supabase Edge Functions digunakan untuk operasi sensitif dan Supabase Cron untuk pekerjaan terjadwal.

---

## 7. DATABASE DESIGN

Supabase menggunakan PostgreSQL.

### 7.1 Daftar Tabel

| No. | Tabel | Fungsi |
|---|---|---|
| 1 | profiles | Profil pengguna |
| 2 | families | Ruang keluarga |
| 3 | family_members | Keanggotaan |
| 4 | family_invitations | Undangan email |
| 5 | wallets | Dompet pribadi |
| 6 | categories | Kategori |
| 7 | transactions | Transaksi |
| 8 | transfers | Transfer |
| 9 | budgets | Anggaran |
| 10 | recurring_transactions | Jadwal rutin |
| 11 | recurring_executions | Riwayat eksekusi |
| 12 | audit_logs | Audit aktivitas |
| 13 | device_sync | Status sinkronisasi perangkat |

Supabase Auth mengelola identitas pengguna pada `auth.users`, sedangkan `profiles` menyimpan informasi profil tambahan.

### 7.2 Database Requirements

- UUID sebagai primary key.
- NUMERIC(19,2) untuk nominal keuangan.
- TIMESTAMPTZ untuk waktu.
- Foreign key untuk integritas relasi.
- Index untuk optimasi query.
- Soft delete untuk transaksi.
- Versioning untuk mendeteksi konflik.
- Client operation ID untuk mencegah duplikasi.
- Updated_at untuk pelacakan perubahan.

### 7.3 Row Level Security

RLS wajib diterapkan pada seluruh tabel sensitif.

Aturan:
- Pengguna hanya dapat mengakses keluarga dengan membership aktif.
- Member hanya dapat melihat transaksi Shared dan transaksi Private miliknya.
- Owner/Admin dapat melihat seluruh transaksi keluarga.
- Creator dapat mengedit dan menghapus transaksi sendiri.
- Owner/Admin dapat mengelola transaksi anggota.
- Pemilik dompet dapat mengakses dompet pribadinya.
- Transfer harus memvalidasi akses kedua dompet.

Gunakan `auth.uid()` untuk mengidentifikasi pengguna yang login.

Jangan menonaktifkan RLS untuk mempermudah pengembangan frontend.

---

## 8. USER INTERFACE & NAVIGATION

### 8.1 Halaman Aplikasi

| Halaman | Route |
|---|---|
| Login | /login |
| Onboarding | /onboarding |
| Dashboard | /dashboard |
| Transactions | /transactions |
| Add Transaction | /transactions/create |
| Categories | /categories |
| Wallets | /wallets |
| Budgets | /budgets |
| Recurring | /recurring |
| Reports | /reports |
| Family Members | /family/members |
| Settings | /settings |

### 8.2 Layout

Desktop:
- Sidebar navigation.
- Header.
- Dashboard cards.
- Grafik dan tabel transaksi.

Mobile:
- Bottom navigation.
- Tombol tambah transaksi.
- Tampilan responsif.
- Form transaksi yang mudah digunakan.

---

## 9. NON-FUNCTIONAL REQUIREMENTS

| Kategori | Persyaratan |
|---|---|
| Persistence | Data permanen di Supabase |
| Offline | PWA dan IndexedDB |
| Synchronization | Otomatis saat online |
| Responsive | Mobile, tablet, desktop |
| Security | RLS dan validasi server |
| Authentication | Google OAuth |
| Performance | Pagination dan query efisien |
| Reliability | Idempotent synchronization |
| Privacy | Isolasi keluarga dan transaksi |
| Backup | Backup dan recovery |
| Usability | Form sederhana |

---

## 10. SECURITY REQUIREMENTS

- Google Client Secret hanya berada di server.
- Supabase Secret Key tidak boleh berada di frontend.
- Gunakan Publishable Key pada frontend.
- Terapkan RLS.
- Validasi setiap operasi sensitif.
- Batasi akses berdasarkan membership dan role.
- Gunakan token undangan yang aman.
- Gunakan session management yang aman.
- Hindari penyimpanan informasi sensitif di browser.
- Data lokal harus diisolasi berdasarkan akun.
- Gunakan HTTPS.
- Terapkan audit log pada aktivitas penting.

---

## 11. SCOPE MVP

### P0 — Core Features

- Google Authentication.
- Family Workspace.
- Family Invitation.
- Role Management.
- Personal Wallet.
- Transaction Management.
- Income dan Expense.
- Private dan Shared Transaction.
- Category Management.
- Dashboard.
- Supabase Persistence.
- PWA.
- IndexedDB.
- Offline Transaction Queue.
- Automatic Synchronization.
- Security dan RLS.

### P1 — Extended Features

- Budget Management.
- Recurring Transactions.
- Transfer antar-dompet.
- Financial Reports.
- Export PDF.
- Export Excel.
- Export CSV.
- Audit Logs.
- Conflict Resolution.

### Future Development

- OCR struk belanja.
- Integrasi rekening bank.
- Integrasi e-wallet.
- Notifikasi WhatsApp.
- AI Financial Assistant.
- Prediksi pengeluaran.
- Target tabungan keluarga.

---

## 12. ACCEPTANCE CRITERIA

### Authentication
- Pengguna dapat login menggunakan Google.
- Pengguna dapat membuat keluarga.
- Owner dapat mengundang anggota.
- Anggota dapat menerima undangan.
- Role berjalan sesuai ketentuan.

### Financial Management
- Pengguna dapat mencatat pemasukan.
- Pengguna dapat mencatat pengeluaran.
- Transaksi dapat diatur Private atau Shared.
- Dompet pribadi dapat dibuat.
- Saldo dihitung secara akurat.
- Transfer tidak dihitung sebagai income atau expense.
- Anggaran dihitung dengan benar.
- Transaksi berulang tidak duplikat.

### Offline
- Website dapat dibuka secara offline setelah dimuat.
- Data yang tersimpan lokal dapat dilihat.
- Transaksi dapat dibuat ketika offline.
- Transaksi masuk ke antrean sinkronisasi.
- Sinkronisasi berjalan ketika online kembali.
- Tidak terjadi duplikasi.
- Konflik perubahan dapat dideteksi.
- Data tetap tersimpan setelah aplikasi ditutup.
- Data tersinkronisasi tersedia pada perangkat lain setelah login dan sinkronisasi.

### Security
- Member tidak dapat melihat transaksi Private anggota lain.
- Data keluarga tidak dapat diakses keluarga lain.
- Pengguna tidak dapat melewati RLS dengan mengubah frontend.
- Seluruh operasi sensitif memiliki validasi otorisasi.
- Data lokal tidak bocor ketika pengguna berganti akun.

---

## 13. DEVELOPMENT ROADMAP

| Tahap | Pekerjaan |
|---|---|
| 1 | Finalisasi PRD |
| 2 | Setup Supabase |
| 3 | Database Design dan Migration |
| 4 | RLS dan Security |
| 5 | UI/UX Design |
| 6 | Google Authentication |
| 7 | Family Workspace |
| 8 | Wallet Management |
| 9 | Transaction Management |
| 10 | Dashboard |
| 11 | PWA Implementation |
| 12 | IndexedDB dan Offline Sync |
| 13 | Budget dan Recurring |
| 14 | Reports dan Export |
| 15 | Testing |
| 16 | Deployment Vercel |

---

## 14. RISKS & MITIGATION

| Risiko | Mitigasi |
|---|---|
| Internet terputus | IndexedDB |
| Transaksi terkirim ganda | UUID dan idempotency |
| Konflik data | Versioning |
| Kebocoran transaksi | RLS |
| Perangkat hilang | Session security |
| Data lokal tertinggal | Sinkronisasi |
| Database bermasalah | Backup dan recovery |
| Transaksi rutin ganda | Unique execution identifier |

---

## 15. FINAL PRODUCT DECISIONS

| Komponen | Keputusan |
|---|---|
| Product Name | Family Finance Tracker |
| Platform | Responsive Web + PWA |
| Deployment | Vercel |
| Database | Supabase PostgreSQL |
| Authentication | Google OAuth |
| Frontend | HTML, CSS, JavaScript |
| Data Fetching | TanStack Query |
| Routing | TanStack Router |
| Package Manager | Bun |
| Offline Storage | IndexedDB |
| Offline Technology | Service Worker |
| Backend | Supabase |
| Access Control | RLS |
| Currency | IDR |
| Users | Family |
| Wallet Ownership | Personal |
| Transaction Visibility | Selective |
| Delete Permission | Creator, Owner, Admin |
| Recurring | Automatic + Reminder |
| Invitation | Email |
| Export | PDF, Excel, CSV |

---

## 16. PROJECT COMPLETION GOAL

Family Finance Tracker dinyatakan siap digunakan ketika:

1. Website berhasil di-deploy ke Vercel.
2. Pengguna dapat login menggunakan Google.
3. Data tersimpan secara permanen di Supabase.
4. Anggota keluarga dapat mengelola keuangan sesuai hak akses.
5. Transaksi Private dan Shared bekerja dengan benar.
6. Dompet pribadi dapat dikelola.
7. Dashboard dan laporan menampilkan data yang benar.
8. PWA dapat diinstal.
9. Aplikasi dapat digunakan secara offline untuk fitur yang didukung.
10. Transaksi offline berhasil disinkronkan ketika internet tersedia kembali.
11. Tidak terdapat kebocoran data antaranggota atau antarkeluarga.
12. Sistem berhasil melewati pengujian keamanan dan fungsional.

**Visi akhir:** Family Finance Tracker menjadi aplikasi pengelolaan keuangan keluarga yang aman, praktis, dapat diakses dari berbagai perangkat, menyimpan data secara permanen, dan tetap dapat digunakan meskipun tidak ada koneksi internet.

---

**END OF DOCUMENT**

*Family Finance Tracker — Product Requirements Document v2.0*