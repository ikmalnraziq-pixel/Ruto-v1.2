// Sinkronisasi dua arah: IndexedDB (cache lokal) <-> Google Drive appDataFolder.
// Last-write-wins per item (updatedAt) + tombstone untuk penghapusan.
import * as db from './db.js';
import * as gg from './google.js';
import { byId } from './util.js';

const CFG = 'config.json';
const EMPTY_TOMB = () => ({ models: {}, keys: {}, convs: {} });
let running = null; let again = false;

export async function getTombs() { return (await db.get('meta', 'deleted'))?.v ?? EMPTY_TOMB(); }
export async function addTombstone(kind, id) {
  const v = await getTombs(); v[kind][id] = Date.now();
  await db.put('meta', { key: 'deleted', v });
}

export async function buildConfig() {
  const [models, keys, vault, prof, tombs] = await Promise.all([
    db.all('models'), db.all('keys'), db.get('meta', 'vault'), db.get('meta', 'profile'), getTombs(),
  ]);
  return {
    v: 1,
    vault: vault ? { id: vault.id, verifier: vault.verifier } : null,
    models: models.toSorted(byId), keys: keys.toSorted(byId),
    settings: { theme: prof?.theme ?? 'auto', lang: prof?.lang ?? 'id', at: prof?.settingsAt ?? 0 },
    deleted: tombs,
  };
}

function lww(a, b, tomb) {
  const m = new Map();
  for (const x of [...a, ...b]) { const c = m.get(x.id); if (!c || (x.updatedAt ?? 0) > (c.updatedAt ?? 0)) m.set(x.id, x); }
  for (const [id, ts] of Object.entries(tomb)) { const x = m.get(id); if (x && (x.updatedAt ?? 0) <= ts) m.delete(id); }
  return [...m.values()].toSorted(byId);
}
const mergeTomb = (a, b) => {
  const o = EMPTY_TOMB();
  for (const k of Object.keys(o)) { o[k] = { ...(a?.[k] ?? {}) }; for (const [id, ts] of Object.entries(b?.[k] ?? {})) o[k][id] = Math.max(o[k][id] ?? 0, ts); }
  return o;
};

async function mergeConfig(local, remote) {
  if (local.vault && remote.vault && local.vault.id !== remote.vault.id) return { conflict: true, merged: local };
  const tombs = mergeTomb(local.deleted, remote.deleted);
  const merged = {
    v: 1, vault: local.vault ?? remote.vault,
    models: lww(local.models, remote.models ?? [], tombs.models),
    keys: lww(local.keys, remote.keys ?? [], tombs.keys),
    settings: (remote.settings?.at ?? 0) > (local.settings.at ?? 0) ? remote.settings : local.settings,
    deleted: tombs,
  };
  if (!local.vault && remote.vault) await db.put('meta', { key: 'vault', id: remote.vault.id, verifier: remote.vault.verifier, createdAt: Date.now() });
  const [curM, curK] = await Promise.all([db.all('models'), db.all('keys')]);
  for (const x of curM) if (!merged.models.some((y) => y.id === x.id)) await db.del('models', x.id);
  for (const x of curK) if (!merged.keys.some((y) => y.id === x.id)) await db.del('keys', x.id);
  for (const x of merged.models) await db.put('models', x);
  for (const x of merged.keys) await db.put('keys', x);
  await db.put('meta', { key: 'deleted', v: tombs });
  const prof = (await db.get('meta', 'profile')) ?? { key: 'profile' };
  if (merged.settings.at > (prof.settingsAt ?? 0)) {
    await db.put('meta', { ...prof, key: 'profile', theme: merged.settings.theme, lang: merged.settings.lang, settingsAt: merged.settings.at });
  }
  return { conflict: false, merged };
}

async function ensureUploaded(msgs) {
  let changed = false;
  for (const m of msgs) for (const a of m.attachments ?? []) {
    if (a.driveId) continue;
    const rec = await db.get('blobs', a.id);
    if (!rec) continue;
    try { a.driveId = await gg.uploadUserFile(rec.blob, a.name); changed = true; } catch (e) { if (e.code === 'auth') throw e; }
  }
  return changed;
}

async function run(onChange) {
  if (!gg.hasToken()) await gg.getToken({ prompt: '' });
  const files = await gg.listAppData();
  const byName = new Map(files.map((f) => [f.name, f]));
  let touched = false; let vaultConflict = false;

  // 1) Konfigurasi (model, key terenkripsi, preferensi)
  const local = await buildConfig();
  const rc = byName.get(CFG);
  const remote = rc ? await gg.getAppData(rc.id) : { models: [], keys: [], deleted: EMPTY_TOMB() };
  const { conflict, merged } = await mergeConfig(local, remote);
  vaultConflict = conflict;
  if (!conflict) {
    const now = await buildConfig();
    if (!rc || JSON.stringify(now) !== JSON.stringify(remote)) await gg.putAppData(CFG, now, rc?.id, { updatedAt: String(Date.now()) });
    touched ||= JSON.stringify(now) !== JSON.stringify(local);
  }

  // 2) Percakapan
  const tombs = merged.deleted.convs ?? {};
  const locals = new Map((await db.all('convs')).map((c) => [c.id, c]));
  const seen = new Set();
  for (const f of files.filter((x) => x.name.startsWith('conv-'))) {
    const id = f.name.slice(5, -5); seen.add(id);
    const rts = Number(f.appProperties?.updatedAt ?? 0);
    const lc = locals.get(id);
    if (tombs[id] && tombs[id] >= rts) { await gg.deleteFile(f.id); if (lc) { await db.deleteConv(id); touched = true; } continue; }
    if (!lc || rts > lc.updatedAt) {
      const data = await gg.getAppData(f.id);
      await db.replaceConv(data.conv, data.msgs); touched = true;
    } else if (lc.updatedAt > rts) {
      const msgs = await db.byConv(id);
      if (await ensureUploaded(msgs)) for (const m of msgs) await db.put('msgs', m);
      await gg.putAppData(f.name, { conv: lc, msgs }, f.id, { updatedAt: String(lc.updatedAt) });
    }
  }
  for (const [id, lc] of locals) {
    if (seen.has(id)) continue;
    if (tombs[id] && tombs[id] >= lc.updatedAt) { await db.deleteConv(id); touched = true; continue; }
    const msgs = await db.byConv(id);
    if (await ensureUploaded(msgs)) for (const m of msgs) await db.put('msgs', m);
    await gg.putAppData(`conv-${id}.json`, { conv: lc, msgs }, null, { updatedAt: String(lc.updatedAt) });
  }
  if (touched) await onChange?.();
  return { at: Date.now(), vaultConflict };
}

export function syncNow(onChange) {
  if (running) { again = true; return running; }
  running = run(onChange).finally(async () => {
    running = null;
    if (again) { again = false; await syncNow(onChange).catch(() => {}); }
  });
  return running;
}
