"use strict";
// Small original line icons share Trencitos' rail geometry and warm accent.
const ShellIcons = (() => {
  const paths = {
    rooms: '<rect x="6" y="4" width="20" height="21" rx="6"/><path d="M6 15h20M12 4v11M20 4v11M11 25l-3 4m13-4 3 4"/><circle cx="11" cy="20" r="1"/><circle cx="21" cy="20" r="1"/>',
    play: '<path d="M10 7v18l17-9Z"/><path class="icon-accent" d="M4 4v24"/>',
    more: '<path d="M5 8h22M5 16h22M5 24h22"/><path class="icon-accent" d="M5 8h6M5 16h10M5 24h6"/>',
    user: '<circle cx="16" cy="10" r="6"/><path d="M6 29v-4a10 10 0 0 1 20 0v4Z"/>',
    friends: '<circle cx="12" cy="11" r="5"/><path d="M3 28v-3a9 9 0 0 1 18 0v3ZM23 6a5 5 0 0 1 0 10m2 4a8 8 0 0 1 4 7"/>',
    bell: '<path d="M7 22h18l-3-4v-7a6 6 0 0 0-12 0v7ZM13 26a3 3 0 0 0 6 0M16 3v2"/>',
    globe: '<circle cx="16" cy="16" r="12"/><ellipse cx="16" cy="16" rx="5" ry="12"/><path d="M4 16h24"/>',
    settings: '<path d="m13 3-1 4-4 2-4-1-2 5 3 3v4l-2 3 4 4 4-2 4 1 2 4 5-1 1-4 3-3 4 1 2-5-3-3-1-4 2-3-4-4-3 2-4-1Z" transform="translate(0 -1) scale(.96)"/><circle cx="16" cy="16" r="5"/>',
    history: '<path d="M6 5h19v23H6ZM11 11h9m-9 5h9m-9 5h5"/><path class="icon-accent" d="M3 9h6M3 16h6M3 23h6"/>',
    book: '<path d="M16 8v21M16 8C12 4 6 4 3 5v21c4-1 9-1 13 3 4-4 9-4 13-3V5c-3-1-9-1-13 3Z"/>',
    help: '<circle cx="16" cy="16" r="12"/><path d="M12 11a4 4 0 1 1 6 4c-2 1-2 2-2 4m0 5h.01"/>',
    trophy: '<path d="M9 4h14v9a7 7 0 0 1-14 0ZM9 7H4v5a6 6 0 0 0 6 6m13-11h5v5a6 6 0 0 1-6 6M16 20v7m-6 2h12"/>',
    edit: '<path d="m22 3 7 7-17 17-9 2 2-9ZM18 7l7 7"/>',
    info: '<circle cx="16" cy="16" r="12"/><path d="M16 15v9m0-15h.01"/>',
    briefcase: '<rect x="3" y="9" width="26" height="19" rx="3"/><path d="M11 9V4h10v5M3 17c8 6 18 6 26 0M16 18v5"/>',
    shield: '<path d="m16 3 12 5v9c0 6-6 11-12 13C10 28 4 23 4 17V8ZM11 16l4 4 7-8"/>',
    chevron: '<path d="m12 6 10 10-10 10"/>',
    close: '<path d="m8 8 16 16M24 8 8 24"/>',
    back: '<path d="M27 16H5m10-10L5 16l10 10"/>',
    bot: '<rect x="5" y="9" width="22" height="19" rx="4"/><path d="M16 4v5M2 16v7m28-7v7M11 16h1m8 0h1m-10 7h10"/><circle class="icon-accent" cx="16" cy="3" r="1"/>',
    plus: '<path d="M16 5v22M5 16h22"/>',
    map: '<path d="m3 8 9-4 9 4 8-4v21l-8 4-9-4-9 4ZM12 4v21m9-17v21"/>',
    send: '<path d="m3 4 26 12-26 12 5-12ZM8 16h21"/>',
    discord: '<path d="M10 7c-2 0-5 2-6 3L2 24c4 3 6 4 9 4l1-3m8 0 1 3c3 0 5-1 9-4l-2-14c-1-1-4-3-6-3l-1 3a25 25 0 0 0-10 0ZM9 23c5 3 9 3 14 0"/><ellipse cx="11" cy="18" rx="2" ry="3"/><ellipse cx="21" cy="18" rx="2" ry="3"/>',
    youtube: '<rect x="2" y="6" width="28" height="20" rx="6"/><path d="m13 11 8 5-8 5Z"/>',
    reddit: '<ellipse cx="16" cy="20" rx="12" ry="8"/><path d="m16 12 3-8 7 2M5 15a3 3 0 1 0-2 5m24-5a3 3 0 1 1 2 5M11 23c3 2 7 2 10 0"/><circle cx="28" cy="6" r="2"/><circle cx="11" cy="18" r="1"/><circle cx="21" cy="18" r="1"/>',
    instagram: '<rect x="3" y="3" width="26" height="26" rx="7"/><circle cx="16" cy="16" r="6"/><circle cx="24" cy="8" r="1"/>',
    facebook: '<path d="M19 29V17h5l1-6h-6V8c0-2 1-3 3-3h3V1h-5c-5 0-7 3-7 7v3H9v6h4v12"/>',
    x: '<path d="m4 4 19 24h5L9 4ZM27 4l-9 11M4 28l10-12"/>',
  };
  const svg = name => `<svg viewBox="0 0 32 32" aria-hidden="true" class="shell-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.info}</svg>`;
  function mount(root = document) { for (const el of root.querySelectorAll('[data-icon]')) if (!el.querySelector('.shell-icon')) el.insertAdjacentHTML('afterbegin', svg(el.dataset.icon)); }
  return { svg, mount };
})();
