# Ruto AI

Chatbot BYOK (Bring Your Own Key), static web app tanpa backend. Sesuai PRD v1.0.

## Menjalankan
Harus lewat HTTPS atau localhost (Web Crypto, Service Worker):

    python3 -m http.server 8080   # lalu buka http://localhost:8080

## Mengaktifkan Login Google (F4/F6)
1. Google Cloud Console → OAuth Client ID tipe "Web application".
2. Tambahkan origin hosting ke "Authorized JavaScript origins".
3. Isi `GOOGLE_CLIENT_ID` di `js/config.js`.
Scope yang diminta hanya `drive.appdata` dan `drive.file` (+ profil dasar).

## Catatan keamanan
- CSP ada di `index.html`. `connect-src` mengizinkan `https:` karena Base URL "Custom" bebas diisi pengguna;
  jika hanya memakai penyedia bawaan, persempit ke domain penyedia.
- Penyedia yang memblokir CORS dari browser butuh Base URL/proxy milik sendiri (risiko di PRD).

## Struktur
index.html · css/main.css · js/{main,ui,db,crypto,vault,providers,google,sync,md,i18n,icons,util,config}.js · sw.js · manifest.webmanifest
