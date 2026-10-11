// Helper UI: toast, dialog native, konfirmasi/prompt, dialog PIN.
import { $, $$ } from './util.js';
import { t } from './i18n.js';
import * as vault from './vault.js';

export function toast(msg, kind = 'info') {
  const el = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  el.dataset.kind = kind;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4300);
}

export function openDialog(dlg, { locked = false } = {}) {
  dlg.dataset.locked = locked ? '1' : '';
  if (!dlg.open) dlg.showModal();
}
export const closeDialog = (dlg) => { if (dlg.open) dlg.close(); };

export function wireDialogs() {
  for (const dlg of $$('dialog')) {
    dlg.addEventListener('cancel', (e) => { if (dlg.dataset.locked) e.preventDefault(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg && !dlg.dataset.locked) dlg.close(); });
  }
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close]');
    if (c) c.closest('dialog')?.close();
  });
}

// Konfirmasi / prompt generik → Promise<true|false> atau Promise<string|null> bila ada input.
export function confirmBox({ title, text = '', ok = t('ok'), danger = false, input = null }) {
  const dlg = $('#dlgConfirm');
  $('#cfTitle').textContent = title;
  $('#cfText').textContent = text; $('#cfText').hidden = !text;
  $('#cfOkLabel').textContent = ok;
  $('#cfOk').className = `btn ${danger ? 'btn--danger' : 'btn--primary'}`;
  const field = $('#cfInput');
  $('#cfInputWrap').hidden = !input;
  if (input) { field.type = input.type ?? 'text'; field.value = input.value ?? ''; field.placeholder = input.placeholder ?? ''; }
  return new Promise((resolve) => {
    const form = $('#cfForm');
    const done = (v) => { form.onsubmit = null; $('#cfCancel').onclick = null; dlg.onclose = null; closeDialog(dlg); resolve(v); };
    form.onsubmit = (e) => { e.preventDefault(); done(input ? field.value.trim() : true); };
    $('#cfCancel').onclick = () => done(input ? null : false);
    dlg.onclose = () => resolve(input ? null : false);
    openDialog(dlg);
    if (input) setTimeout(() => { field.focus(); field.select(); }, 60);
  });
}

// Dialog PIN: mode 'create' (PIN baru + konfirmasi) atau 'unlock'.
export function pinDialog(mode) {
  const dlg = $('#dlgPin');
  const create = mode === 'create';
  $('#pinTitle').textContent = t(create ? 'pinCreateTitle' : 'pinUnlockTitle');
  $('#pinText').textContent = t(create ? 'pinCreateText' : 'pinUnlockText');
  $('#pinOk').textContent = t(create ? 'pinCreate' : 'pinUnlock');
  $('#pinConfirmWrap').hidden = !create;
  $('#pinInput').value = ''; $('#pinConfirm').value = ''; $('#pinErr').textContent = '';
  $('#pinInput').setAttribute('autocomplete', create ? 'new-password' : 'off');
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; $('#pinForm').onsubmit = null; dlg.onclose = null; closeDialog(dlg); resolve(v); };
    $('#pinForm').onsubmit = async (e) => {
      e.preventDefault();
      const pin = $('#pinInput').value;
      const err = $('#pinErr');
      if (create) {
        if (pin.length < 6) { err.textContent = t('pinShort'); return; }
        if (pin !== $('#pinConfirm').value) { err.textContent = t('pinMismatch'); return; }
        await vault.setup(pin); finish(true);
      } else if (await vault.unlock(pin)) finish(true);
      else err.textContent = t('pinWrong');
    };
    dlg.onclose = () => finish(false);
    openDialog(dlg);
    setTimeout(() => $('#pinInput').focus(), 80);
  });
}

export async function ensureUnlocked() {
  if (vault.isUnlocked()) return true;
  return pinDialog((await vault.getVault()) ? 'unlock' : 'create');
}
