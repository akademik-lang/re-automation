# RE Automation - Certificate Downloader

Automation script untuk download certificate dari Mandiri Belajar dengan auto-rename berdasarkan nama mahasiswa.

## Prerequisites

- Node.js (v18 atau lebih baru)
- npm

## Installation

```bash
npm install
npx playwright install chromium
```

## Usage

```bash
npm start
```

Script akan:
1. Login ke portal Mandiri Belajar
2. Mengakses halaman certificate
3. Extract semua data mahasiswa dari tabel
4. Download certificate untuk setiap mahasiswa
5. Rename file dengan nama mahasiswa (format: Nama_Mahasiswa.pdf)

## Output

Semua certificate akan disimpan di folder `downloads/`

## Configuration

Edit file `download-certificates.js` untuk mengubah:
- `USERNAME` dan `PASSWORD` untuk kredensial login
- `CERT_URL` untuk URL certificate page yang berbeda
- `headless: false` ke `headless: true` untuk run di background

## Notes

- Script menggunakan Playwright untuk browser automation
- Default browser: Chromium
- Delay 1 detik antar download untuk avoid server overload
