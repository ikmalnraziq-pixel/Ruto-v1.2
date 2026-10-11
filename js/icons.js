// Ikon garis ultra-tipis (stroke 1.25) bergaya Phosphor Light — tanpa library.
const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrowUpRight: '<path d="M7 17L17 7M8.5 7H17v8.5"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2.5"/>',
  copy: '<rect x="8.5" y="8.5" width="10.5" height="10.5" rx="2.5"/><path d="M15.5 8.5V7A2 2 0 0013.5 5H7A2 2 0 005 7v6.5A2 2 0 007 15.5h1.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  refresh: '<path d="M18.5 12A6.5 6.5 0 1112 5.5c1.8 0 3.4.7 4.6 1.9L19 9.5M19 5v4.5h-4.5"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l.9 12h8.2L17 7M10 11v5M14 11v5"/>',
  pencil: '<path d="M5 19l.9-3.8 9.6-9.6a1.8 1.8 0 012.5 0l.4.4a1.8 1.8 0 010 2.5L8.8 18.1 5 19zM14 7.2l2.8 2.8"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2"/>',
  key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5L19 4M16 7l2.5 2.5M14 9l2 2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/><path d="M4 4l16 16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 01-.6-8.96A6 6 0 0117.7 8.4 4.8 4.8 0 0117 18H7z"/>',
  cloudCheck: '<path d="M7 18a4.5 4.5 0 01-.6-8.96A6 6 0 0117.7 8.4 4.8 4.8 0 0117 18H7z"/><path d="M9.5 13l2 2 3.5-3.5"/>',
  cloudX: '<path d="M7 18a4.5 4.5 0 01-.6-8.96A6 6 0 0117.7 8.4 4.8 4.8 0 0117 18H7z"/><path d="M10 12.5l4 4M14 12.5l-4 4"/>',
  device: '<rect x="6" y="3.5" width="12" height="17" rx="3"/><path d="M10.5 17.5h3"/>',
  paperclip: '<path d="M19 11.5l-7 7a4.5 4.5 0 01-6.4-6.4l7.6-7.6a3 3 0 014.2 4.2l-7.5 7.5a1.5 1.5 0 01-2.1-2.1l6.8-6.8"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.6-3.6 3.6-5.5 7-5.5s6.4 1.9 7 5.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
  shield: '<path d="M12 3l7 2.5v6c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5v-6L12 3z"/><path d="M9 12l2 2 4-4"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  chat: '<path d="M5 6.5A2.5 2.5 0 017.5 4h9A2.5 2.5 0 0119 6.5v6a2.5 2.5 0 01-2.5 2.5H11l-4 3.5V15h-.5A1.5 1.5 0 015 13.5v-7z"/>',
  sidebar: '<rect x="3.5" y="5" width="17" height="14" rx="3.5"/><path d="M9.5 5v14"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/>',
  sparkle: '<path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8L12 4z"/>',
  file: '<path d="M7 3.5h6.5L18 8v11.5a1 1 0 01-1 1H7a1 1 0 01-1-1v-15a1 1 0 011-1zM13.5 3.5V8H18"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="M5 17l4.5-4.5 3 3 2.5-2.5L19 16"/>',
  google: '<path d="M19.5 12.2c0 4-2.8 7.3-7.5 7.3A7.5 7.5 0 1112 4.5c2 0 3.7.7 5 2M12 12h7.5"/>',
  logout: '<path d="M10 4H6.5A1.5 1.5 0 005 5.5v13A1.5 1.5 0 006.5 20H10M15 8l4 4-4 4M19 12H9"/>',
  chevronDown: '<path d="M7 10l5 5 5-5"/>',
  external: '<path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 01-1 1H6a1 1 0 01-1-1V8a1 1 0 011-1h4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>',
};
export const icon = (name, cls = '') =>
  `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name] ?? ''}</svg>`;
export function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = icon(el.dataset.icon, el.className);
    el.replaceWith(tpl.content);
  });
}
