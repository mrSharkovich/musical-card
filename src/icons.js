// Оригинальные иконки и иллюстрации проекта «Музыкальная открытка» (inline SVG).
// Нарисованы для этого проекта, распространяются по лицензии MIT вместе с кодом.
// Никаких сторонних наборов иконок, шрифтов-иконок и внешних файлов не используется.

const paths = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  send: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  templates: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  images: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 17l5-4 4 3 3-2 6 5"/>',
  shapes: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
  background: '<path d="M4 4h16v16H4z"/><path d="M4 15l16-8M4 20l16-8"/>',
  draw: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  audio: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  replay: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
};

const filled = {
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/>',
  stopFill: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>',
};

/** Иконка в виде строки SVG; aria-hidden, цвет — currentColor. */
export function icon(name, size = 20) {
  if (filled[name]) {
    return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${filled[name]}</svg>`;
  }
  const body = paths[name] || paths.plus;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export const ICON_NAMES = [...Object.keys(paths), ...Object.keys(filled)];

/** Логотип: почтовая марка с нотой. */
export function brandMark(size = 34) {
  return `<svg class="brand-mark" width="${size}" height="${Math.round(size * 38 / 34)}" viewBox="0 0 34 38" aria-hidden="true" focusable="false"><rect x="2" y="2" width="30" height="34" rx="2" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 2.4"/><rect x="6" y="6" width="22" height="26" rx="1" fill="var(--accent)"/><path d="M14 25V13l8-1.6v10" fill="none" stroke="var(--paper)" stroke-width="1.8"/><circle cx="12" cy="25" r="2.4" fill="var(--paper)"/><circle cx="20" cy="21.4" r="2.4" fill="var(--paper)"/></svg>`;
}

/** Катушка кассеты (вращается через CSS, когда звук играет). */
export function reel(size = 52) {
  return `<svg class="reel" width="${size}" height="${size}" viewBox="0 0 56 56" aria-hidden="true" focusable="false"><circle cx="28" cy="28" r="26" fill="#5B3A2A"/><circle cx="28" cy="28" r="14" fill="#F2EEE6"/><g stroke="#2A2F3B" stroke-width="3" stroke-linecap="round"><path d="M28 17v6M28 33v6M17 28h6M33 28h6"/></g><circle cx="28" cy="28" r="4" fill="#2A2F3B"/></svg>`;
}

/** Цветок-наклейка для оформления страниц. */
export function flower(size = 64, petals = '#F4A3A0') {
  return `<svg class="flower" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><g fill="${petals}"><circle cx="20" cy="10" r="7"/><circle cx="30" cy="18" r="7"/><circle cx="26" cy="30" r="7"/><circle cx="14" cy="30" r="7"/><circle cx="10" cy="18" r="7"/></g><circle cx="20" cy="21" r="5" fill="#FFC857"/></svg>`;
}
