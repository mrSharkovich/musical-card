
// Панели двух ссылок Musical Card. Собственные HTML/CSS/SVG (MIT); внешних библиотек нет.
// Секретный адрес передаётся только обработчикам, не встраивается в свёрнутую HTML-разметку.
import {esc} from './model.js';
import {icon} from './icons.js';
import {modal,toast} from './ui.js';

export function renderPublishedLinks(publicUrl, publicId) {
  return `<section class="recipient-link-panel" aria-labelledby="recipient-link-title">
    <div class="link-panel-title">${icon('send',22)}<div><h3 id="recipient-link-title">Для получателя</h3>
      <p>Эту ссылку можно отправить друзьям и близким. Она открывает открытку, но не позволяет её редактировать.</p></div></div>
    <div class="link-box"><input value="${esc(publicUrl)}" readonly aria-label="Ссылка для получателя" />
      <button type="button" class="btn primary" id="copy-public">${icon('copy',16)}Скопировать</button></div>
    <div class="link-actions"><button type="button" class="btn primary" id="share-public">${icon('share',16)}Отправить открытку</button>
      <a class="btn light" href="#/card/${encodeURIComponent(publicId)}">${icon('eye',16)}Открыть как получатель</a></div>
    <p class="recipient-link-hint">${icon('check',16)}Отправляйте именно эту ссылку, а не адрес из строки браузера.</p>
  </section>`;
}

/**
 * Панель ключа. По умолчанию свёрнута; секрет не помещаем в HTML до нажатия "Показать".
 * expanded=true только в явно открытых пользователем диалогах автора.
 */
export function renderAuthorKeyPanel({expanded=false}={}) {
  return `<details class="author-key-panel" data-author-key ${expanded?'open':''}>
    <summary data-key-summary>${icon('key',22)}<span><strong>Ключ автора</strong><small>Только для вас — не отправляйте получателю</small></span></summary>
    <div class="author-key-body">
      <p>По этому адресу можно изменять и удалять открытку. Любой, кому попадёт ключ, получит доступ автора.</p>
      <div class="author-key-label">Ваш ключ (по умолчанию скрыт)
        <span class="author-key-row"><input data-key-value type="text" readonly autocomplete="off" spellcheck="false" placeholder="Ссылка скрыта ••••••••" aria-label="Секретный ключ автора" />
          <button type="button" class="btn light" data-key-toggle aria-pressed="false">Показать</button></span>
      </div>
      <button type="button" class="btn light wide" data-key-copy>${icon('copy',16)}Скопировать мой ключ</button>
      <p class="author-key-note">${icon('key',16)}Храните ключ в надёжном месте. Кнопка «Отправить открытку» выше никогда не использует этот адрес.</p>
      <p class="key-saved-message" data-key-saved hidden role="status">Ключ отмечен как сохранённый.</p>
    </div>
  </details>`;
}

async function copyAuthorKey(editUrl, onSaved) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API недоступен');
    await navigator.clipboard.writeText(editUrl);
    onSaved();
    toast('Секретный ключ скопирован. Сохраните его в надёжном месте');
    return;
  } catch (_) {
    // HTTP на телефоне часто не даёт доступ к Clipboard API. Не считаем ключ сохранённым
    // до явного подтверждения ручного копирования.
    const dialog=modal('Сохраните секретный ключ',
      `<p>Автоматическое копирование недоступно. Выделите адрес, скопируйте его вручную и сохраните у себя. Никому его не отправляйте.</p>
       <input value="${esc(editUrl)}" readonly aria-label="Секретный ключ для ручного копирования" />
       <button type="button" class="btn primary wide" data-confirm-key-saved>Я сохранил(а) ключ</button>`);
    const input=dialog.querySelector('input');
    input.addEventListener('focus',()=>input.select());input.focus();
    dialog.querySelector('[data-confirm-key-saved]').onclick=()=>{
      onSaved();toast('Ключ отмечен как сохранённый');dialog.close();
    };
  }
}

export function attachAuthorKeyPanel(host, editUrl, {onSaved=()=>{}}={}) {
  if (!host) throw new Error('Панель секретного ключа не найдена');
  const input=host.querySelector('[data-key-value]');
  const toggle=host.querySelector('[data-key-toggle]');
  const saved=host.querySelector('[data-key-saved]');
  host.addEventListener('toggle',()=>{
    if (!host.open) {
      input.value='';toggle.textContent='Показать';toggle.setAttribute('aria-pressed','false');
    }
  });
  toggle.addEventListener('click',()=>{
    const reveal=toggle.getAttribute('aria-pressed')!=='true';
    input.value=reveal?editUrl:'';
    toggle.textContent=reveal?'Скрыть':'Показать';
    toggle.setAttribute('aria-pressed',String(reveal));
  });
  host.querySelector('[data-key-copy]').addEventListener('click',()=>copyAuthorKey(editUrl,()=>{
    saved.hidden=false;
    onSaved();
  }));
}
