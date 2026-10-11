// Google Identity Services (token model) + Google Drive API v3.
// Scope terbatas: drive.appdata (folder tersembunyi app) dan drive.file (hanya file buatan Ruto AI).
import { CONFIG } from './config.js';

let gisP = null; let token = null; let expiresAt = 0;
export const isConfigured = () => Boolean(CONFIG.GOOGLE_CLIENT_ID);
export const hasToken = () => Boolean(token) && Date.now() < expiresAt - 30_000;

export function preload() {
  if (!isConfigured()) return Promise.resolve();
  return (gisP ??= new Promise((res, rej) => {
    if (window.google?.accounts?.oauth2) return res();
    const s = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true });
    s.onload = () => res();
    s.onerror = () => { gisP = null; rej(new Error('gis')); };
    document.head.append(s);
  }));
}

export async function getToken({ prompt = '' } = {}) {
  if (hasToken() && !prompt) return token;
  await preload();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: CONFIG.GOOGLE_SCOPES,
      callback: (r) => {
        if (r.error) return reject(Object.assign(new Error(r.error), { code: 'auth' }));
        token = r.access_token; expiresAt = Date.now() + Number(r.expires_in) * 1000; resolve(token);
      },
      error_callback: (e) => reject(Object.assign(new Error(e?.type ?? 'popup'), { code: 'auth' })),
    });
    client.requestAccessToken({ prompt });
  });
}

export function revoke() {
  const t = token; token = null; expiresAt = 0;
  if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t, () => {});
}

async function api(url, init = {}) {
  if (!hasToken()) throw Object.assign(new Error('auth'), { code: 'auth' });
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } });
  if (res.status === 401) { token = null; throw Object.assign(new Error('auth'), { code: 'auth' }); }
  if (!res.ok) throw Object.assign(new Error(`drive ${res.status}`), { code: 'drive', status: res.status });
  return res;
}

export async function userInfo() {
  const r = await api('https://www.googleapis.com/oauth2/v3/userinfo');
  return r.json();
}

const D = 'https://www.googleapis.com/drive/v3/files';
const U = 'https://www.googleapis.com/upload/drive/v3/files';

export async function listAppData() {
  const out = []; let pageToken = '';
  do {
    const q = new URLSearchParams({
      spaces: 'appDataFolder', pageSize: '1000',
      fields: 'nextPageToken,files(id,name,modifiedTime,appProperties)',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const j = await (await api(`${D}?${q}`)).json();
    out.push(...(j.files ?? [])); pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

function multipart(meta, body, mime) {
  const b = `ruto${crypto.randomUUID()}`;
  const blob = new Blob([
    `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`,
    body, `\r\n--${b}--`,
  ]);
  return { body: blob, headers: { 'content-type': `multipart/related; boundary=${b}` } };
}

export async function putAppData(name, obj, existingId, appProperties = {}) {
  const meta = existingId ? { appProperties } : { name, parents: ['appDataFolder'], appProperties };
  const mp = multipart(meta, JSON.stringify(obj), 'application/json');
  const url = existingId ? `${U}/${existingId}?uploadType=multipart&fields=id` : `${U}?uploadType=multipart&fields=id`;
  return (await api(url, { method: existingId ? 'PATCH' : 'POST', ...mp })).json();
}
export const getAppData = async (id) => (await api(`${D}/${id}?alt=media`)).json();
export const deleteFile = (id) => api(`${D}/${id}`, { method: 'DELETE' }).catch((e) => { if (e.status !== 404) throw e; });

let folderId = null;
async function appFolder() {
  if (folderId) return folderId;
  const q = new URLSearchParams({ q: "name='Ruto AI' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id)', spaces: 'drive' });
  const j = await (await api(`${D}?${q}`)).json();
  if (j.files?.[0]) return (folderId = j.files[0].id);
  const c = await (await api(`${D}?fields=id`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ruto AI', mimeType: 'application/vnd.google-apps.folder' }),
  })).json();
  return (folderId = c.id);
}
// File unggahan pengguna → Drive pengguna (scope drive.file), bukan server Ruto AI.
export async function uploadUserFile(blob, name) {
  const parent = await appFolder();
  const mp = multipart({ name, parents: [parent] }, blob, blob.type || 'application/octet-stream');
  return (await (await api(`${U}?uploadType=multipart&fields=id`, { method: 'POST', ...mp })).json()).id;
}
export const downloadUserFile = async (id) => (await api(`${D}/${id}?alt=media`)).blob();
