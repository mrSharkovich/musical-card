// Обычный (не модульный) скрипт: подключается в <head>, чтобы тема применялась
// до первой отрисовки и страница не «мигала». Внешних ресурсов и eval нет — подходит под CSP script-src 'self'.
(function () {
  var stored = null;
  try { stored = localStorage.getItem('mc-theme'); } catch (e) { /* приватный режим */ }
  var system = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  var theme = stored === 'dark' || stored === 'light' ? stored : system;
  document.documentElement.setAttribute('data-theme', theme);
})();
