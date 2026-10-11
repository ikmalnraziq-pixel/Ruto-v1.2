export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ENT[c]);
export const uid = () => crypto.randomUUID();
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const toB64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] ?? '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
export const download = (name, blob) => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};
export const maskKey = (k) => {
  const s = k.trim();
  return s.length <= 8 ? '••••••••' : `${s.slice(0, 3)}••••••${s.slice(-4)}`;
};
export const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
export const dayGroup = (ts) => {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const day = 86400000;
  if (ts >= d.getTime()) return 'today';
  if (ts >= d.getTime() - day) return 'yesterday';
  if (ts >= d.getTime() - 7 * day) return 'week';
  return 'older';
};
export const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
