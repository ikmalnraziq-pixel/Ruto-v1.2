// Ruto AI — konfigurasi publik (aman ditaruh di sisi klien).
// Isi GOOGLE_CLIENT_ID dengan OAuth 2.0 Client ID (tipe "Web application") dari Google Cloud Console.
// Tambahkan origin tempat app di-hosting ke "Authorized JavaScript origins".
export const CONFIG = {
  GOOGLE_CLIENT_ID: '515719669122-dak879idj84g566dj9n2vr7q5s1oijh9.apps.googleusercontent.com',
  // Scope minimal sesuai PRD: appdata (folder tersembunyi app) + file (hanya file buatan Ruto AI).
  GOOGLE_SCOPES: [
    'openid', 'profile', 'email',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.file',
  ].join(' '),
  PBKDF2_ITERATIONS: 600_000,
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  SYNC_DEBOUNCE_MS: 2500,
};
