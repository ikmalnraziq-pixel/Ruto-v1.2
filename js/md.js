// Renderer Markdown mini yang aman: semua input di-escape lebih dulu, hanya tag whitelist yang dihasilkan.
import { esc } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function inline(src) {
  const codes = [];
  let s = src.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, __, c) => {
    codes.push(`<code>${esc(c.trim())}</code>`); return `\u0001${codes.length - 1}\u0001`;
  });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/gi, (_, txt, url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${txt}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+?)([.,;:!?)]*)(?=\s|$)/g, (_, pre, url, tail) =>
    `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>${tail}`);
  s = s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`);
  s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_\w])_(?!\s)(.+?)(?<!\s)_(?![_\w])/g, '$1<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => codes[+i]);
}

function codeBlock(code, lang) {
  const label = esc(lang || 'text');
  return `<div class="code bezel"><div class="core"><div class="code__bar"><span class="code__lang">${label}</span>` +
    `<button type="button" class="chip" data-act="copy-code">${icon('copy')}<span>${esc(t('copy'))}</span></button></div>` +
    `<pre><code>${esc(code)}</code></pre></div></div>`;
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function list(lines, i) {
  const items = [];
  for (let m; i < lines.length && (m = lines[i].match(LIST)); i++) {
    items.push({ ind: m[1].replace(/\t/g, '    ').length, ol: /\d/.test(m[2]), text: m[3] });
  }
  let html = ''; const stack = [];
  const tag = (x) => (x.ol ? 'ol' : 'ul');
  for (const it of items) {
    while (stack.length && it.ind < stack.at(-1).ind) html += `</li></${tag(stack.pop())}>`;
    if (!stack.length || it.ind > stack.at(-1).ind) { html += `<${tag(it)}><li>${inline(it.text)}`; stack.push(it); }
    else html += `</li><li>${inline(it.text)}`;
  }
  while (stack.length) html += `</li></${tag(stack.pop())}>`;
  return [html, i];
}

export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m = line.match(/^\s*(```|~~~)\s*([\w+#.-]*)\s*$/);
    if (m) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(m[1])) buf.push(lines[i++]);
      i++; out.push(codeBlock(buf.join('\n'), m[2])); continue;
    }
    if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*$/))) { const n = Math.min(m[1].length + 1, 6); out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
    if (HR.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`); continue;
    }
    if (LIST.test(line)) { const [h, ni] = list(lines, i); out.push(h); i = ni; continue; }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = cells(line); i += 2; const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(`<div class="tablewrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>` +
        rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>');
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|#{1,6}\s|>)/.test(lines[i]) && !LIST.test(lines[i]) && !HR.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}
export { SAFE_URL };
