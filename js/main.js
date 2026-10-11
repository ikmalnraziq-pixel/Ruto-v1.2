// Ruto AI — bootstrap & logika aplikasi (ES Modules, tanpa bundler).
import { $, $$, esc, uid, debounce, toB64, download, maskKey, fmtBytes, dayGroup } from './util.js';
import { t, setLang, getLang, applyI18n } from './i18n.js';
import { icon, hydrateIcons } from './icons.js';
import { renderMarkdown } from './md.js';
import * as db from './db.js';
import * as vault from './vault.js';
import { decrypt } from './crypto.js';
import { PROVIDERS, testConnection, streamChat, validBaseUrl } from './providers.js';
import * as gg from './google.js';
import * as sync from './sync.js';
import { CONFIG } from './config.js';
import { toast, openDialog, closeDialog, wireDialogs, confirmBox, ensureUnlocked } from './ui.js';

const S = {
  profile: null, models: [], keys: [], convs: [], activeId: null, msgs: [], pending: [],
  modelId: null, search: '', stream: null, stick: true, sync: { state: 'local', at: 0 },
};
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktop = matchMedia('(min-width: 1024px)');
const coarse = matchMedia('(pointer: coarse)');
const vt = (fn) => (document.startViewTransition && !reduce ? document.startViewTransition(fn).updateCallbackDone : Promise.resolve(fn()));
let lastTs = 0; const nextTs = () => (lastTs = Math.max(Date.now(), lastTs + 1));
const conv = () => S.convs.find((c) => c.id === S.activeId) ?? null;
const activeModel = () => S.models.find((m) => m.id === S.modelId) ?? S.models[0] ?? null;
const keyOf = (m) => S.keys.find((k) => k.id === m.keyId);

/* ───────────── profil, tema, bahasa ───────────── */
async function saveProfile(patch = {}) {
  S.profile = { ...S.profile, ...patch };
  await db.put('meta', { key: 'profile', ...S.profile });
  try { localStorage.setItem('ruto-theme', S.profile.theme); localStorage.setItem('ruto-lang', S.profile.lang); } catch { /* abaikan */ }
}
function applyTheme() {
  const th = S.profile.theme; const r = document.documentElement;
  if (th === 'auto') r.removeAttribute('data-theme'); else r.dataset.theme = th;
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').content = dark ? '#050505' : '#eceef2';
  $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === th)));
}
function renderLangButtons() { $$('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()))); }
async function setTheme(th) {
  await saveProfile({ theme: th, settingsAt: Date.now() });
  await vt(() => { applyTheme(); renderMenuLabels(); });
  scheduleSync();
}
async function setLanguage(l) {
  await saveProfile({ lang: l, settingsAt: Date.now() });
  setLang(l); applyI18n(); renderAll(); renderLangButtons(); renderMenuLabels();
  if ($('#dlgSettings').open) renderSettings();
  scheduleSync();
}
function renderMenuLabels() {
  const th = { auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' }[S.profile.theme];
  $('#menuThemeLabel').textContent = `${t('menuTheme')}: ${t(th)}`;
  $('#menuLangLabel').textContent = `${t('menuLang')}: ${getLang() === 'id' ? 'Indonesia' : 'English'}`;
}

/* ───────────── data ───────────── */
async function loadData() {
  const [models, keys, convs] = await Promise.all([db.all('models'), db.all('keys'), db.all('convs')]);
  S.models = models.toSorted((a, b) => a.createdAt - b.createdAt);
  S.keys = keys.toSorted((a, b) => a.createdAt - b.createdAt);
  S.convs = convs;
  if (!S.models.some((m) => m.id === S.modelId)) S.modelId = S.models[0]?.id ?? null;
}
async function tomb(kind, id) { await sync.addTombstone(kind, id); }

/* ───────────── render: umum ───────────── */
function renderAll() {
  renderModelChip(); renderConvList(); renderAccount(); renderSync(); renderMenuLabels(); renderLangButtons();
  if (!S.msgs.length) renderWelcome(); $('#welcome').hidden = S.msgs.length > 0;
  renderComposerModel();
}
function renderModelChip() {
  const m = activeModel(); const chip = $('#modelChip');
  $('#modelChipLabel').textContent = m ? m.name : t('noModel');
  chip.toggleAttribute('data-empty', !m);
}
function renderComposerModel() { const m = activeModel(); $('#composerModel').textContent = m ? `${m.name} · ${m.modelId}` : ''; }
function renderAccount() {
  const p = S.profile; const g = p.type === 'google';
  const av = g && p.picture ? `<img src="${esc(p.picture)}" alt="" referrerpolicy="no-referrer">` : icon('user');
  $('#btnAccount').innerHTML = `<span class="avatar">${av}</span><span class="account__t"><strong>${esc(g ? (p.name || p.email) : t('guest'))}</strong><span>${esc(t(g ? 'googleSub' : 'guestSub'))}</span></span>`;
}
const SYNC_ICON = { local: 'device', ok: 'cloudCheck', syncing: 'cloud', error: 'cloudX', paused: 'cloud' };
const SYNC_KEY = { local: ['syncLocal', 'syncLocalTip'], ok: ['syncOk', 'syncOkTip'], syncing: ['syncSyncing', 'syncSyncingTip'], error: ['syncError', 'syncErrorTip'], paused: ['syncPaused', 'syncPausedTip'] };
function setSync(state, at = S.sync.at) { S.sync = { state, at }; renderSync(); }
function renderSync() {
  const st = S.profile?.type === 'google' ? S.sync.state : 'local';
  const [l, tip] = SYNC_KEY[st];
  $$('[data-sync]').forEach((el) => {
    el.dataset.state = st; el.title = t(tip); el.setAttribute('aria-label', `${t(l)}. ${t(tip)}`);
    el.innerHTML = `${icon(SYNC_ICON[st])}<span class="sync__label">${esc(t(l))}</span>`;
  });
}
function renderConvList() {
  const q = S.search.trim().toLowerCase(); const el = $('#convList');
  let list = S.convs.toSorted((a, b) => b.updatedAt - a.updatedAt);
  if (q) list = list.filter((c) => c.title.toLowerCase().includes(q) || (c.index ?? '').includes(q));
  if (!list.length) { el.innerHTML = `<p class="empty-note">${esc(t(q ? 'noResults' : 'noConvs'))}</p>`; return; }
  const groups = Object.groupBy(list, (c) => dayGroup(c.updatedAt));
  const label = { today: 'gToday', yesterday: 'gYesterday', week: 'gWeek', older: 'gOlder' };
  el.innerHTML = ['today', 'yesterday', 'week', 'older'].filter((g) => groups[g]).map((g) =>
    `<h3 class="conv-group">${esc(t(label[g]))}</h3>` + groups[g].map((c) =>
      `<div class="conv" ${c.id === S.activeId ? 'aria-current="true"' : ''}><button class="conv__main" type="button" data-act="open-conv" data-id="${c.id}">${esc(c.title)}</button>` +
      `<span class="conv__acts"><button class="icon-btn" type="button" data-act="rename-conv" data-id="${c.id}" aria-label="${esc(t('rename'))}">${icon('pencil')}</button>` +
      `<button class="icon-btn" type="button" data-act="del-conv" data-id="${c.id}" aria-label="${esc(t('delete'))}">${icon('trash')}</button></span></div>`).join('')).join('');
}
function renderWelcome() {
  const el = $('#welcome'); const m = activeModel(); const g = S.profile.type === 'google';
  const card = (ic, title, text, extra = '') => `<article class="bezel span-4 reveal"><div class="core card">${icon(ic)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${extra}</div></article>`;
  const storeExtra = g ? '' : `<button class="link" type="button" data-act="login-open">${esc(t('cardLoginCta'))}${icon('arrowUpRight')}</button>`;
  const hero = m
    ? `<span class="eyebrow">${esc(t('eyebrowByok'))}</span><h1 class="display" id="welcomeTitle">${esc(t('welcomeTitle'))}</h1><p class="lead">${esc(t('welcomeLead'))}</p>` +
      `<div class="kv"><span>${esc(t('activeModel'))}</span><strong>${esc(m.name)}</strong><span>${esc(m.modelId)}</span></div>` +
      `<div class="hero__cta"><button class="btn btn--primary" type="button" data-act="open-pop"><span>${esc(t('changeModel'))}</span><span class="btn__icon">${icon('arrowUpRight')}</span></button>` +
      `<button class="btn btn--ghost" type="button" data-act="add-model"><span>${esc(t('addModel'))}</span><span class="btn__icon">${icon('plus')}</span></button></div>`
    : `<span class="eyebrow">${esc(t('eyebrowByok'))}</span><h1 class="display" id="welcomeTitle">${esc(t('welcomeAddTitle'))}</h1><p class="lead">${esc(t('welcomeAddLead'))}</p>` +
      `<ol class="steps"><li>${esc(t('step1'))}</li><li>${esc(t('step2'))}</li><li>${esc(t('step3'))}</li></ol>` +
      `<div class="hero__cta"><button class="btn btn--primary" type="button" data-act="add-model"><span>${esc(t('addKeyCta'))}</span><span class="btn__icon">${icon('arrowUpRight')}</span></button></div>`;
  el.innerHTML = `<div class="bento"><article class="bezel span-8 reveal"><div class="core hero">${hero}</div></article>` +
    card('lock', t('cardPrivTitle'), t('cardPrivText')) +
    card(g ? 'cloud' : 'device', t('cardStoreTitle'), t(g ? 'cardStoreGoogle' : 'cardStoreGuest'), storeExtra) + '</div>';
  observeReveals(el);
}

/* ───────────── render: pesan ───────────── */
function attsHtml(m) {
  if (!m.attachments?.length) return '';
  return `<div class="msg__atts">${m.attachments.map((a) => a.kind === 'image'
    ? `<figure class="att att--img"><img data-att="${a.id}" alt="${esc(a.name)}"></figure>`
    : `<div class="att att--file">${icon('file')}<span>${esc(a.name)}</span></div>`).join('')}</div>`;
}
function msgHtml(m, { anim = true } = {}) {
  const st = S.stream?.id === m.id ? 'streaming' : m.error ? 'error' : 'done';
  const s = anim ? '' : ' data-static';
  if (m.role === 'user') return `<article class="msg msg--user" data-id="${m.id}"${s}>${attsHtml(m)}${m.content ? `<div class="bubble">${esc(m.content)}</div>` : ''}</article>`;
  const body = m.content ? renderMarkdown(m.content) : (st === 'streaming' ? '<div class="typing" aria-hidden="true"><span></span><span></span><span></span></div>' : '');
  const acts = st === 'streaming' ? '' :
    (m.content ? `<button class="chip" type="button" data-act="copy-msg">${icon('copy')}<span>${esc(t('copy'))}</span></button>` : '') +
    `<button class="chip" type="button" data-act="regen">${icon('refresh')}<span>${esc(t('regen'))}</span></button>`;
  return `<article class="msg msg--ai" data-id="${m.id}" data-state="${st}"${s}><header class="msg__head"><span class="msg__mark">${icon('sparkle')}</span><span>${esc(m.modelName ?? '')}</span></header>` +
    `<div class="md">${body}</div>${m.error ? `<div class="msg__err" role="alert">${esc(m.error)}</div>` : ''}${m.stopped ? `<p class="msg__stopped">${esc(t('stopped'))}</p>` : ''}<footer class="msg__acts">${acts}</footer></article>`;
}
function markLast() {
  $$('.msg--ai').forEach((el) => el.removeAttribute('data-last'));
  const last = S.msgs.at(-1);
  if (last?.role === 'assistant') $(`.msg[data-id="${last.id}"]`)?.setAttribute('data-last', '');
}
function renderChat() {
  const has = S.msgs.length > 0;
  $('#welcome').hidden = has;
  $('#messages').innerHTML = S.msgs.map((m) => msgHtml(m, { anim: false })).join('');
  if (!has) renderWelcome();
  markLast(); hydrateAtts();
}
function appendMessage(m) { $('#messages').insertAdjacentHTML('beforeend', msgHtml(m)); $('#welcome').hidden = true; markLast(); hydrateAtts(); stickScroll(); }
function replaceMessage(m) { const el = $(`.msg[data-id="${m.id}"]`); if (el) el.outerHTML = msgHtml(m, { anim: false }); markLast(); }
const nearBottom = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 220;
function stickScroll() { if (S.stick) scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); }

async function getAttBlob(a) {
  const rec = await db.get('blobs', a.id); if (rec) return rec.blob;
  if (a.driveId && gg.hasToken()) { try { const b = await gg.downloadUserFile(a.driveId); await db.put('blobs', { id: a.id, blob: b }); return b; } catch { /* abaikan */ } }
  return null;
}
async function hydrateAtts() {
  for (const img of $$('img[data-att]:not([src])')) {
    const a = S.msgs.flatMap((m) => m.attachments ?? []).find((x) => x.id === img.dataset.att);
    const blob = a && await getAttBlob(a);
    if (blob) img.src = URL.createObjectURL(blob);
  }
}

/* ───────────── model popover ───────────── */
function renderPop() {
  const pop = $('#modelPop'); const cur = activeModel();
  pop.innerHTML = S.models.length
    ? `<p class="pop__t">${esc(t('modelsPopTitle'))}</p>` + S.models.map((m) =>
        `<button class="opt" type="button" role="menuitemradio" aria-checked="${m.id === cur?.id}" data-act="pick-model" data-id="${m.id}"><span class="opt__t"><strong>${esc(m.name)}</strong><span>${esc(m.modelId)}</span></span>${m.id === cur?.id ? icon('check') : ''}</button>`).join('') +
      `<button class="opt" type="button" data-act="manage-models"><span class="opt__t"><strong>${esc(t('manageModels'))}</strong></span>${icon('sliders')}</button>`
    : `<div class="pop__empty"><p>${esc(t('noModelsPop'))}</p><button class="btn btn--primary btn--sm" type="button" data-act="add-model"><span>${esc(t('addKeyCta'))}</span><span class="btn__icon">${icon('plus')}</span></button></div>`;
}
async function setModel(id) {
  S.modelId = id; await db.put('meta', { key: 'lastModel', id });
  const c = conv(); if (c) { c.modelId = id; await db.put('convs', c); }
  renderModelChip(); renderComposerModel(); if (!S.msgs.length) renderWelcome();
}

/* ───────────── percakapan ───────────── */
async function openConv(id) {
  await vt(async () => {
    S.activeId = id;
    S.msgs = id ? (await db.byConv(id)).toSorted((a, b) => a.createdAt - b.createdAt) : [];
    const c = conv(); if (c?.modelId && S.models.some((m) => m.id === c.modelId)) S.modelId = c.modelId;
    S.stick = true; renderChat(); renderConvList(); renderModelChip(); renderComposerModel(); setSidebar(false);
    scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  });
}
const newChat = async () => { setMenu(false); await openConv(null); $('#composerInput').focus(); };
const titleFrom = (s) => (s.split('\n')[0].trim().slice(0, 48) || t('conversation'));
async function touchConv(c) {
  c.updatedAt = Date.now();
  c.index = `${c.title} ${S.msgs.map((m) => m.content).join(' ')}`.toLowerCase().slice(0, 6000);
  await db.put('convs', c); renderConvList();
}
async function renameConv(id) {
  const c = S.convs.find((x) => x.id === id); if (!c) return;
  const v = await confirmBox({ title: t('renameTitle'), ok: t('save'), input: { value: c.title } });
  if (!v) return; c.title = v.slice(0, 80); await touchConv(c); scheduleSync();
}
async function deleteConv(id) {
  const c = S.convs.find((x) => x.id === id); if (!c) return;
  if (!(await confirmBox({ title: t('delConvTitle'), text: t('delConvText', { title: c.title }), ok: t('delete'), danger: true }))) return;
  await db.deleteConv(id); await tomb('convs', id);
  S.convs = S.convs.filter((x) => x.id !== id);
  if (S.activeId === id) await openConv(null); else renderConvList();
  scheduleSync();
}

/* ───────────── chat: kirim, stream, ulangi ───────────── */
const TEXT_EXT = /\.(txt|md|json|csv|js|ts|jsx|tsx|py|html|css|xml|ya?ml|log|sql|sh|c|cpp|h|java|go|rs|rb|php)$/i;
function kindOf(f) {
  if (/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) return 'image';
  if (f.type === 'application/pdf') return 'pdf';
  if (f.type.startsWith('text/') || TEXT_EXT.test(f.name)) return 'text';
  return null;
}
function addFiles(files) {
  for (const f of files) {
    if (f.size > CONFIG.MAX_FILE_BYTES) { toast(t('fileTooBig', { name: f.name }), 'error'); continue; }
    const kind = kindOf(f); if (!kind) { toast(t('fileBad', { name: f.name }), 'error'); continue; }
    S.pending.push({ id: uid(), name: f.name, mime: f.type || 'text/plain', size: f.size, kind, blob: f, url: kind === 'image' ? URL.createObjectURL(f) : '' });
  }
  renderPending();
}
function renderPending() {
  const row = $('#attachRow'); row.hidden = !S.pending.length;
  row.innerHTML = S.pending.map((a) => `<div class="pend">${a.url ? `<img src="${a.url}" alt="">` : icon(a.kind === 'pdf' ? 'file' : 'file')}<span>${esc(a.name)}</span><button class="icon-btn" type="button" data-act="rm-pending" data-id="${a.id}" aria-label="${esc(t('remove'))}">${icon('x')}</button></div>`).join('');
}
function errText(e) {
  if (e.code === 'network') return t('errNetwork');
  if (e.status === 401 || e.status === 403) return `${t('errAuth')}${e.message ? ` — ${e.message}` : ''}`;
  if (e.status === 429) return t('errRate');
  if (e.name === 'OperationError') return t('errKey');
  return e.message || String(e);
}
async function prepare(hist) {
  const out = []; const recent = hist.length - 6;
  for (const [i, m] of hist.entries()) {
    let text = m.content ?? ''; const files = [];
    for (const a of m.attachments ?? []) {
      if (i < recent) { text += `\n[${t('attached')}: ${a.name}]`; continue; }
      const blob = await getAttBlob(a);
      if (!blob) { text += `\n[${a.name}: ${t('attMissing')}]`; continue; }
      if (a.kind === 'text') text += `\n\n[${a.name}]\n\`\`\`\n${await blob.text()}\n\`\`\``;
      else files.push({ kind: a.kind, mime: a.mime, name: a.name, b64: await toB64(blob) });
    }
    out.push({ role: m.role, text, files });
  }
  return out;
}
function setSendMode(mode) {
  const b = $('#btnSend'); b.dataset.mode = mode; b.setAttribute('aria-label', t(mode === 'stop' ? 'stop' : 'send'));
  b.querySelector('.send__core').innerHTML = icon(mode === 'stop' ? 'stop' : 'arrowUp');
}
async function send() {
  if (S.stream) { S.stream.ctrl.abort(); return; }
  const input = $('#composerInput'); const text = input.value.trim(); const atts = S.pending;
  if (!text && !atts.length) return;
  const model = activeModel();
  if (!model) { toast(t('needModel'), 'error'); openModelDialog(); return; }
  if (!(await ensureUnlocked())) return;
  let c = conv(); const now = Date.now();
  if (!c) {
    c = { id: uid(), title: titleFrom(text || atts[0].name), modelId: model.id, createdAt: now, updatedAt: now, index: '' };
    S.convs.push(c); S.activeId = c.id; await db.put('convs', c);
  }
  const um = { id: uid(), convId: c.id, role: 'user', content: text, createdAt: nextTs(),
    attachments: atts.map(({ id, name, mime, size, kind }) => ({ id, name, mime, size, kind })) };
  for (const a of atts) await db.put('blobs', { id: a.id, blob: a.blob });
  await db.put('msgs', um); S.msgs.push(um);
  input.value = ''; autosize(); S.pending = []; renderPending();
  S.stick = true; appendMessage(um); renderConvList();
  await generate(model);
}
async function generate(model) {
  const c = conv();
  let apiKey;
  try { const rec = keyOf(model); if (!rec) throw new Error(t('noKeyForModel')); apiKey = await vault.open(rec); }
  catch (e) { toast(errText(e), 'error'); return; }
  const am = { id: uid(), convId: c.id, role: 'assistant', content: '', modelName: model.name, createdAt: nextTs() };
  const ctrl = new AbortController(); S.stream = { ctrl, id: am.id };
  S.msgs.push(am); appendMessage(am); setSendMode('stop');
  const hist = S.msgs.filter((m) => m.id !== am.id && !(m.role === 'assistant' && !m.content));
  let raf = 0;
  const paint = () => { raf = 0; const el = $(`.msg[data-id="${am.id}"] .md`); if (el) el.innerHTML = renderMarkdown(am.content); stickScroll(); };
  try {
    const messages = await prepare(hist);
    await streamChat({
      provider: model.provider, baseUrl: model.baseUrl, apiKey, modelId: model.modelId, system: model.system, messages, signal: ctrl.signal,
      onDelta: (d) => { am.content += d; raf ||= requestAnimationFrame(paint); },
    });
  } catch (e) { if (e.name === 'AbortError') am.stopped = true; else am.error = errText(e); }
  cancelAnimationFrame(raf); S.stream = null; setSendMode('send');
  await db.put('msgs', am); replaceMessage(am); stickScroll();
  await touchConv(c); scheduleSync();
}
async function regenerate() {
  if (S.stream) return;
  const last = S.msgs.at(-1); if (last?.role !== 'assistant') return;
  const model = activeModel(); if (!model || !(await ensureUnlocked())) return;
  await db.del('msgs', last.id); S.msgs.pop(); $(`.msg[data-id="${last.id}"]`)?.remove();
  S.stick = true; await generate(model);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = Object.assign(document.createElement('textarea'), { value: text }); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
}
function autosize() { const i = $('#composerInput'); i.style.height = 'auto'; i.style.height = `${Math.min(i.scrollHeight, innerHeight * .4)}px`; }

/* ───────────── sidebar & menu ───────────── */
function syncInert() { $('#sidebar').inert = !desktop.matches && document.body.dataset.sidebar !== 'open'; }
function setSidebar(open) { document.body.dataset.sidebar = open ? 'open' : 'closed'; $('#btnSidebar').setAttribute('aria-expanded', String(open)); syncInert(); }
function setMenu(open) {
  document.body.dataset.menu = open ? 'open' : 'closed';
  $('#btnMenu').setAttribute('aria-expanded', String(open)); $('#menu').inert = !open;
  if (open) { setSidebar(false); setTimeout(() => $('#menu button')?.focus(), 80); }
}

/* ───────────── model & key: form ───────────── */
const F = { mode: 'model', model: null, key: null };
const provLabel = (k) => PROVIDERS[k.provider].label;
function fillSelects() {
  $('#mProvider').innerHTML = Object.entries(PROVIDERS).map(([id, p]) => `<option value="${id}">${esc(p.label)}</option>`).join('');
  $('#mKeySel').innerHTML = `<option value="">${esc(t('mNewKey'))}</option>` + S.keys.map((k) => `<option value="${k.id}">${esc(provLabel(k))} · ${esc(k.mask)}</option>`).join('');
}
function syncModelForm() {
  const model = F.mode === 'model';
  const sel = $('#mKeySel').value;
  $('#mKeySourceWrap').hidden = !(model && S.keys.length);
  $('#mNewKey').hidden = model && Boolean(sel);
  $('#mModelFields').hidden = !model;
  const prov = $('#mProvider').value;
  $('#mBaseWrap').hidden = prov !== 'custom';
  $('#mModelId').placeholder = PROVIDERS[prov].ph;
}
function openModelDialog({ mode = 'model', modelId = null, keyId = null } = {}) {
  F.mode = mode; F.model = modelId ? S.models.find((m) => m.id === modelId) : null;
  F.key = keyId ? S.keys.find((k) => k.id === keyId) : (F.model ? keyOf(F.model) : null);
  fillSelects();
  $('#mTitle').textContent = t(mode === 'key' ? (F.key ? 'mTitleEditKey' : 'mTitleKey') : (F.model ? 'mTitleEditModel' : 'mTitleModel'));
  const keyMode = mode === 'key' && F.key;
  $('#mKeySel').value = mode === 'model' ? (F.key?.id ?? S.keys[0]?.id ?? '') : '';
  $('#mProvider').value = keyMode ? F.key.provider : 'openai';
  $('#mBase').value = keyMode ? (F.key.baseUrl ?? '') : '';
  $('#mKey').value = ''; $('#mKey').type = 'password';
  $('#mKey').placeholder = keyMode ? t('mKeyKeep') : '';
  $('#mName').value = F.model?.name ?? ''; $('#mModelId').value = F.model?.modelId ?? ''; $('#mSystem').value = F.model?.system ?? '';
  $('#mTestMsg').textContent = ''; $('#mErr').textContent = ''; $('#modelIds').innerHTML = '';
  $('#mKeyEye').innerHTML = icon('eye');
  syncModelForm();
  $('#dlgSettings').open && closeDialog($('#dlgSettings')); setMenu(false);
  openDialog($('#dlgModel'));
}
function setTest(msg, ok) { const el = $('#mTestMsg'); el.textContent = msg; el.dataset.ok = ok === undefined ? '' : String(ok); }
async function resolveCreds() {
  const sel = $('#mKeySel').value; const err = $('#mErr'); err.textContent = '';
  if (F.mode === 'model' && sel) {
    if (!(await ensureUnlocked())) return null;
    const rec = S.keys.find((k) => k.id === sel);
    return { provider: rec.provider, baseUrl: rec.baseUrl, apiKey: await vault.open(rec) };
  }
  const provider = $('#mProvider').value; const baseUrl = provider === 'custom' ? $('#mBase').value.trim() : '';
  if (provider === 'custom' && !validBaseUrl(baseUrl)) { err.textContent = t('mErrBase'); return null; }
  let apiKey = $('#mKey').value.trim();
  if (!apiKey && F.mode === 'key' && F.key) { if (!(await ensureUnlocked())) return null; apiKey = await vault.open(F.key); }
  if (!apiKey) { err.textContent = t('mErrKey'); return null; }
  return { provider, baseUrl, apiKey };
}
async function runTest() {
  const btn = $('#mTest'); btn.disabled = true; setTest(t('mTesting'));
  try {
    const creds = await resolveCreds(); if (!creds) { setTest(''); return; }
    const r = await testConnection({ ...creds, signal: AbortSignal.timeout(15000) });
    $('#modelIds').innerHTML = r.models.slice(0, 300).map((id) => `<option value="${esc(id)}"></option>`).join('');
    setTest(r.models.length ? t('mTestOk', { n: r.models.length }) : t('mTestOk0'), true);
  } catch (e) { setTest(t('mTestFail', { e: errText(e) }), false); }
  finally { btn.disabled = false; }
}
async function saveModelForm(e) {
  e.preventDefault();
  const err = $('#mErr'); err.textContent = ''; const now = Date.now();
  const model = F.mode === 'model'; const sel = $('#mKeySel').value; const useExisting = model && sel;
  const name = $('#mName').value.trim(); const modelId = $('#mModelId').value.trim();
  if (model && !name) { err.textContent = t('mErrName'); $('#mName').focus(); return; }
  if (model && !modelId) { err.textContent = t('mErrModelId'); $('#mModelId').focus(); return; }
  let keyRec;
  if (useExisting) keyRec = S.keys.find((k) => k.id === sel);
  else {
    const provider = $('#mProvider').value; const baseUrl = provider === 'custom' ? $('#mBase').value.trim() : '';
    const plain = $('#mKey').value.trim(); const editing = F.mode === 'key' && F.key;
    if (provider === 'custom' && !validBaseUrl(baseUrl)) { err.textContent = t('mErrBase'); return; }
    if (!plain && !editing) { err.textContent = t('mErrKey'); $('#mKey').focus(); return; }
    if (!(await ensureUnlocked())) return;
    keyRec = plain
      ? { id: editing ? F.key.id : uid(), provider, baseUrl, mask: maskKey(plain), ...(await vault.seal(plain)), createdAt: editing ? F.key.createdAt : now, updatedAt: now }
      : { ...F.key, provider, baseUrl, updatedAt: now };
    await db.put('keys', keyRec);
  }
  let saved = null;
  if (model) {
    saved = { id: F.model?.id ?? uid(), name, modelId, system: $('#mSystem').value.trim(), keyId: keyRec.id, provider: keyRec.provider, baseUrl: keyRec.baseUrl, createdAt: F.model?.createdAt ?? now, updatedAt: now };
    await db.put('models', saved);
  }
  for (const m of S.models) if (m.keyId === keyRec.id && m.id !== saved?.id && (m.provider !== keyRec.provider || m.baseUrl !== keyRec.baseUrl)) await db.put('models', { ...m, provider: keyRec.provider, baseUrl: keyRec.baseUrl, updatedAt: now });
  await loadData();
  if (saved && !F.model) await setModel(saved.id);
  renderAll(); closeDialog($('#dlgModel')); toast(t('mSaved')); scheduleSync();
}
async function deleteModel(id) {
  const m = S.models.find((x) => x.id === id); if (!m) return;
  if (!(await confirmBox({ title: t('delModelTitle'), text: t('delModelText', { name: m.name }), ok: t('delete'), danger: true }))) return;
  await db.del('models', id); await tomb('models', id); await loadData(); renderAll(); renderSettings(); scheduleSync();
}
async function deleteKey(id) {
  const k = S.keys.find((x) => x.id === id); if (!k) return;
  const used = S.models.filter((m) => m.keyId === id);
  if (!(await confirmBox({ title: t('delKeyTitle'), text: t('delKeyText', { n: used.length }), ok: t('delete'), danger: true }))) return;
  for (const m of used) { await db.del('models', m.id); await tomb('models', m.id); }
  await db.del('keys', id); await tomb('keys', id); await loadData(); renderAll(); renderSettings(); scheduleSync();
}
async function revealKey(btn) {
  const row = btn.closest('.row'); const code = row.querySelector('code'); const rec = S.keys.find((k) => k.id === btn.dataset.id);
  if (btn.dataset.shown) { code.textContent = rec.mask; btn.innerHTML = icon('eye'); delete btn.dataset.shown; return; }
  if (!(await ensureUnlocked())) return;
  try { code.textContent = await vault.open(rec); } catch (e) { toast(errText(e), 'error'); return; }
  btn.innerHTML = icon('eyeOff'); btn.dataset.shown = '1';
  setTimeout(() => { if (btn.dataset.shown && btn.isConnected) { code.textContent = rec.mask; btn.innerHTML = icon('eye'); delete btn.dataset.shown; } }, 8000);
}

/* ───────────── pengaturan ───────────── */
function renderSettings() { renderModelsPanel(); renderAccountPanel(); applyTheme(); renderLangButtons(); }
function renderModelsPanel() {
  const rows = S.models.map((m) => {
    const k = keyOf(m);
    return `<li class="row"><div class="row__main"><strong>${esc(m.name)}</strong><span class="muted mono">${esc(m.modelId)} · ${esc(PROVIDERS[m.provider]?.label ?? m.provider)}${k ? ` · ${esc(k.mask)}` : ''}</span></div>` +
      `<div class="row__acts"><button class="icon-btn" type="button" data-act="edit-model" data-id="${m.id}" aria-label="${esc(t('edit'))}">${icon('pencil')}</button><button class="icon-btn" type="button" data-act="del-model" data-id="${m.id}" aria-label="${esc(t('delete'))}">${icon('trash')}</button></div></li>`;
  }).join('') || `<li class="row row--empty">${esc(t('modelsEmpty'))}</li>`;
  const keys = S.keys.map((k) => {
    const n = S.models.filter((m) => m.keyId === k.id).length;
    return `<li class="row"><div class="row__main"><strong>${esc(provLabel(k))}</strong><code>${esc(k.mask)}</code><span class="muted">${esc(t('usedBy', { n }))}</span></div>` +
      `<div class="row__acts"><button class="icon-btn" type="button" data-act="reveal-key" data-id="${k.id}" aria-label="${esc(t('reveal'))}">${icon('eye')}</button>` +
      `<button class="icon-btn" type="button" data-act="edit-key" data-id="${k.id}" aria-label="${esc(t('edit'))}">${icon('pencil')}</button><button class="icon-btn" type="button" data-act="del-key" data-id="${k.id}" aria-label="${esc(t('delete'))}">${icon('trash')}</button></div></li>`;
  }).join('') || `<li class="row row--empty">${esc(t('keysEmpty'))}</li>`;
  $('#panel-models').innerHTML =
    `<div class="group"><h3 class="group__t"><span>${esc(t('modelsTitle'))}</span><button class="btn btn--primary btn--sm" type="button" data-act="add-model"><span>${esc(t('addModel'))}</span><span class="btn__icon">${icon('plus')}</span></button></h3><ul class="rows plain">${rows}</ul></div>` +
    `<div class="group"><h3 class="group__t"><span>${esc(t('keysTitle'))}</span><button class="btn btn--ghost btn--sm" type="button" data-act="add-key"><span>${esc(t('addKey'))}</span><span class="btn__icon">${icon('key')}</span></button></h3><ul class="rows plain">${keys}</ul></div>`;
}
function renderAccountPanel() {
  const p = S.profile; const g = p.type === 'google';
  $('#panel-account').innerHTML = g
    ? `<div class="bezel"><div class="core acc-card"><span class="avatar">${p.picture ? `<img src="${esc(p.picture)}" alt="" referrerpolicy="no-referrer">` : icon('user')}</span><div class="row__main"><strong>${esc(p.name ?? '')}</strong><span class="muted">${esc(p.email ?? '')}</span></div></div></div>` +
      `<p class="muted">${esc(t('accScopes'))}</p><div class="btn-row"><button class="btn btn--primary btn--sm" type="button" data-act="sync-now"><span>${esc(t('accSyncNow'))}</span><span class="btn__icon">${icon('refresh')}</span></button>` +
      `<button class="btn btn--ghost btn--sm" type="button" data-act="disconnect"><span>${esc(t('accDisconnect'))}</span><span class="btn__icon">${icon('logout')}</span></button></div>` +
      `<p><a class="link" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">${esc(t('accManage'))}${icon('external')}</a></p>`
    : `<div class="bezel"><div class="core acc-card"><span class="avatar">${icon('user')}</span><div class="row__main"><strong>${esc(t('accGuestTitle'))}</strong><span class="muted">${esc(t('accGuestText'))}</span></div></div></div>` +
      `<div class="btn-row"><button class="btn btn--primary" type="button" data-act="login-google"><span>${esc(t('loginGoogle'))}</span><span class="btn__icon">${icon('arrowUpRight')}</span></button></div>`;
}
function selectTab(name) {
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
}
function openSettings(tab = 'models') { setMenu(false); renderSettings(); selectTab(tab); openDialog($('#dlgSettings')); }

/* ───────────── Google & sinkronisasi ───────────── */
function openLogin(locked) { $('#loginClose').hidden = locked; gg.preload().catch(() => {}); openDialog($('#dlgLogin'), { locked }); applyI18n($('#dlgLogin')); renderLangButtons(); }
async function loginGoogle() {
  if (!gg.isConfigured()) { toast(t('gNoClient'), 'error'); return; }
  try {
    setSync('syncing');
    await gg.getToken({ prompt: 'select_account' });
    const info = await gg.userInfo();
    await saveProfile({ type: 'google', name: info.name, email: info.email, picture: info.picture });
    closeDialog($('#dlgLogin')); closeDialog($('#dlgSettings')); renderAll();
    toast(t('gWelcome', { name: info.given_name || info.name || '' }));
    await runSync();
  } catch { setSync(S.profile.type === 'google' ? 'paused' : 'local'); toast(t('gFail'), 'error'); }
}
async function loginGuest() { await saveProfile({ type: 'guest' }); closeDialog($('#dlgLogin')); renderAll(); }
async function reloadFromDb() {
  const prof = await db.get('meta', 'profile'); if (prof) { const { key, ...rest } = prof; S.profile = { ...S.profile, ...rest }; }
  setLang(S.profile.lang); applyI18n(); applyTheme();
  await loadData();
  if (S.activeId && !conv()) { S.activeId = null; S.msgs = []; } else if (S.activeId) S.msgs = (await db.byConv(S.activeId)).toSorted((a, b) => a.createdAt - b.createdAt);
  renderAll(); renderChat();
}
async function runSync() {
  if (S.profile?.type !== 'google') return;
  setSync('syncing');
  try {
    const r = await sync.syncNow(reloadFromDb);
    setSync('ok', r.at); if (r.vaultConflict) toast(t('syncConflict'), 'error');
    if ($('#dlgSettings').open) renderSettings();
  } catch (e) { setSync(e.code === 'auth' ? 'paused' : 'error'); }
}
const scheduleSync = debounce(() => { if (S.profile?.type === 'google') runSync(); }, CONFIG.SYNC_DEBOUNCE_MS);
async function syncClick() {
  if (S.profile.type !== 'google') { openLogin(false); return; }
  if (S.sync.state === 'syncing') return;
  try { if (!gg.hasToken()) await gg.getToken({ prompt: '' }); } catch { toast(t('gFail'), 'error'); return; }
  await runSync();
}
async function disconnectGoogle() {
  gg.revoke(); await saveProfile({ type: 'guest', name: null, email: null, picture: null });
  setSync('local'); renderAll(); renderAccountPanel();
}

/* ───────────── data: ekspor, impor, kunci, hapus ───────────── */
async function exportBackup() {
  const cfg = await sync.buildConfig();
  if (!cfg.vault || (!cfg.keys.length && !cfg.models.length)) { toast(t('exportEmpty'), 'error'); return; }
  const body = JSON.stringify({ app: 'ruto-ai', kind: 'backup', version: 1, exportedAt: new Date().toISOString(), ...cfg }, null, 2);
  download(`ruto-ai-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([body], { type: 'application/json' }));
  toast(t('exported'));
}
async function importBackup(file) {
  let j; try { j = JSON.parse(await file.text()); } catch { toast(t('impBad'), 'error'); return; }
  if (j?.app !== 'ruto-ai' || !j.vault?.verifier || !Array.isArray(j.keys)) { toast(t('impBad'), 'error'); return; }
  const pin = await confirmBox({ title: t('impTitle'), text: t('impText'), ok: t('impOk'), input: { type: 'password', placeholder: t('impPh') } });
  if (!pin) return;
  if (!(await vault.check(j.vault, pin))) { toast(t('pinWrong'), 'error'); return; }
  const local = await vault.getVault(); const now = Date.now();
  if (!local) { await db.put('meta', { key: 'vault', id: j.vault.id, verifier: j.vault.verifier, createdAt: now }); await vault.unlock(pin); for (const k of j.keys) await db.put('keys', k); }
  else {
    if (!(await ensureUnlocked())) return;
    for (const k of j.keys) await db.put('keys', { ...k, ...(await vault.seal(await decrypt(k, pin))), updatedAt: now });
  }
  for (const m of j.models ?? []) await db.put('models', m);
  await loadData(); renderAll(); renderSettings(); toast(t('imported')); scheduleSync();
}
async function wipeAll() {
  if (!(await confirmBox({ title: t('wipeTitle'), text: t('wipeText'), ok: t('wipeOk'), danger: true }))) return;
  vault.lock(); gg.revoke();
  const d = await db.open(); d.close(); await new Promise((res) => { const r = indexedDB.deleteDatabase('ruto-ai'); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  try { localStorage.removeItem('ruto-theme'); localStorage.removeItem('ruto-lang'); } catch { /* abaikan */ }
  if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  location.reload();
}

/* ───────────── aksi (event delegation) ───────────── */
const A = {
  'new-chat': newChat,
  'open-conv': (el) => openConv(el.dataset.id),
  'rename-conv': (el) => renameConv(el.dataset.id),
  'del-conv': (el) => deleteConv(el.dataset.id),
  'add-model': () => openModelDialog(),
  'add-key': () => openModelDialog({ mode: 'key' }),
  'edit-model': (el) => openModelDialog({ modelId: el.dataset.id }),
  'edit-key': (el) => openModelDialog({ mode: 'key', keyId: el.dataset.id }),
  'del-model': (el) => deleteModel(el.dataset.id),
  'del-key': (el) => deleteKey(el.dataset.id),
  'reveal-key': revealKey,
  'copy-msg': async (el) => { const m = S.msgs.find((x) => x.id === el.closest('.msg').dataset.id); if (m) { await copyText(m.content); flash(el); } },
  'copy-code': async (el) => { await copyText(el.closest('.code').querySelector('code').textContent); flash(el); },
  regen: regenerate,
  'login-google': loginGoogle, 'login-guest': loginGuest, 'login-open': () => openLogin(false),
  'sync-now': runSync, disconnect: disconnectGoogle,
  export: exportBackup, import: () => $('#importInput').click(),
  lock: () => { vault.lock(); toast(t('locked')); },
  wipe: wipeAll,
  'open-pop': () => $('#modelPop').showPopover(),
  'pick-model': async (el) => { $('#modelPop').hidePopover(); await setModel(el.dataset.id); },
  'manage-models': () => { $('#modelPop').hidePopover(); openSettings('models'); },
  'rm-pending': (el) => { const i = S.pending.findIndex((a) => a.id === el.dataset.id); if (i >= 0) { URL.revokeObjectURL(S.pending[i].url); S.pending.splice(i, 1); renderPending(); } },
};
function flash(btn) {
  const span = btn.querySelector('span'); const old = span.textContent;
  span.textContent = t('copied'); setTimeout(() => { span.textContent = old; }, 1500);
}
function observeReveals(root = document) {
  const els = $$('.reveal:not(.in)', root);
  if (reduce || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  els.forEach((e) => io.observe(e));
}
const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });

function wire() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (el && A[el.dataset.act]) { e.preventDefault(); A[el.dataset.act](el); return; }
    const mi = e.target.closest('[data-menu]');
    if (mi) {
      const k = mi.dataset.menu;
      if (k === 'new') newChat(); else if (k === 'models') openSettings('models'); else if (k === 'account') openSettings('account'); else if (k === 'settings') openSettings('general');
      else if (k === 'theme') setTheme({ auto: 'light', light: 'dark', dark: 'auto' }[S.profile.theme]);
      else if (k === 'lang') setLanguage(getLang() === 'id' ? 'en' : 'id');
      return;
    }
    const th = e.target.closest('[data-theme-set]'); if (th) { setTheme(th.dataset.themeSet); return; }
    const lg = e.target.closest('[data-lang]'); if (lg) { setLanguage(lg.dataset.lang); return; }
    const tab = e.target.closest('[data-tab]'); if (tab) selectTab(tab.dataset.tab);
    const sy = e.target.closest('[data-sync]'); if (sy) syncClick();
  });
  $('#btnSidebar').addEventListener('click', () => setSidebar(document.body.dataset.sidebar !== 'open'));
  $('#btnSidebarClose').addEventListener('click', () => setSidebar(false));
  $('#scrim').addEventListener('click', () => setSidebar(false));
  $('#btnMenu').addEventListener('click', () => setMenu(document.body.dataset.menu !== 'open'));
  $('#btnNew').addEventListener('click', newChat);
  $('#btnAccount').addEventListener('click', () => openSettings('account'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (document.body.dataset.menu === 'open') setMenu(false); else if (document.body.dataset.sidebar === 'open') setSidebar(false); } });
  desktop.addEventListener('change', syncInert);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  $('#searchInput').addEventListener('input', debounce((e) => { S.search = e.target.value; renderConvList(); }, 120));
  const input = $('#composerInput');
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !coarse.matches) { e.preventDefault(); $('#composer').requestSubmit(); } });
  input.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files ?? [])]; if (f.length) { e.preventDefault(); addFiles(f); } });
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); send(); });
  $('#btnAttach').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
  $('#importInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackup(f); });

  const pop = $('#modelPop');
  pop.addEventListener('beforetoggle', (e) => {
    if (e.newState !== 'open') return;
    renderPop(); const r = $('#modelChip').getBoundingClientRect(); const w = Math.min(320, innerWidth * .92);
    pop.style.top = `${r.bottom + 12}px`; pop.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
  });
  $('#mKeySel').addEventListener('change', syncModelForm);
  $('#mProvider').addEventListener('change', syncModelForm);
  $('#mKeyEye').addEventListener('click', () => { const k = $('#mKey'); const show = k.type === 'password'; k.type = show ? 'text' : 'password'; $('#mKeyEye').innerHTML = icon(show ? 'eyeOff' : 'eye'); $('#mKeyEye').setAttribute('aria-label', t(show ? 'mKeyHide' : 'mKeyShow')); });
  $('#mTest').addEventListener('click', runTest);
  $('#modelForm').addEventListener('submit', saveModelForm);

  // Auto-scroll hanya berhenti oleh aksi pengguna (tanpa listener scroll).
  const probe = debounce(() => { S.stick = nearBottom(); }, 140);
  for (const ev of ['wheel', 'touchmove']) addEventListener(ev, () => { if (S.stream) { S.stick = false; probe(); } }, { passive: true });
  addEventListener('online', () => { toast(t('online')); scheduleSync(); });
  addEventListener('offline', () => toast(t('offline')));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.profile?.type === 'google' && Date.now() - S.sync.at > 60000 && gg.hasToken()) runSync(); });
}

/* ───────────── boot ───────────── */
async function init() {
  hydrateIcons(); wireDialogs(); wire();
  const prof = await db.get('meta', 'profile');
  const lsLang = (() => { try { return localStorage.getItem('ruto-lang'); } catch { return null; } })();
  S.profile = prof ? (({ key, ...r }) => r)(prof) : { id: uid(), type: null, theme: 'auto', lang: lsLang === 'en' ? 'en' : 'id' };
  setLang(S.profile.lang); applyI18n(); applyTheme();
  S.modelId = (await db.get('meta', 'lastModel'))?.id ?? null;
  await loadData(); setSendMode('send'); syncInert(); $('#menu').inert = true;
  renderAll(); observeReveals();
  if (!S.profile.type) openLogin(true);
  else if (S.profile.type === 'google') { setSync('paused'); gg.getToken({ prompt: '' }).then(() => runSync()).catch(() => setSync('paused')); }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init().catch((e) => { console.error('Ruto AI init error:', e?.name); toast(String(e?.message ?? e), 'error'); });
