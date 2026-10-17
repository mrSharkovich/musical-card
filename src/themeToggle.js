import {icon} from './icons.js';

const KEY = 'mc-theme';
const COLORS = {light: '#DCE4DA', dark: '#111726'};

export const currentTheme = () =>
  document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

export function setTheme(theme) {
  const value = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', value);
  try { localStorage.setItem(KEY, value); } catch { /* хранилище может быть недоступно */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[value]);
  document.querySelectorAll('[data-theme-toggle]').forEach(syncButton);
}

function syncButton(button) {
  const dark = currentTheme() === 'dark';
  button.innerHTML = icon(dark ? 'sun' : 'moon', 18);
  button.setAttribute('aria-label', dark ? 'Светлая тема' : 'Тёмная тема');
  button.title = dark ? 'Светлая тема' : 'Тёмная тема';
}

/** Кнопка переключения темы (HTML-строка); иконка выставляется в syncThemeButtons. */
export const themeButton = (extra = '') =>
  `<button type="button" class="icon-btn ${extra}" data-theme-toggle aria-label="Сменить тему">${icon(currentTheme() === 'dark' ? 'sun' : 'moon', 18)}</button>`;

export function syncThemeButtons(root = document) {
  root.querySelectorAll('[data-theme-toggle]').forEach(syncButton);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[currentTheme()]);
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-theme-toggle]')) setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
});
