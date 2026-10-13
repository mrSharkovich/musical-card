import {api,linkFor} from './api.js';
import {newProject,templates,formats,esc} from './model.js';
import {renderStage,scaleStage} from './stage.js';
import {CardAudio} from './audio.js';
import {mountEditor} from './editor.js';
import {$,toast,modal,copy} from './ui.js';
import {API_BASE} from './config.js';

const root=$('#app');
let cleanup=()=>{};
function header(){return `<header class="site-head"><a class="brand" href="#/">♪ Музыкальная открытка</a><nav><a href="#/templates">Шаблоны</a><button data-create class="btn primary">Создать открытку</button></nav></header>`;}
function footer(){return `<footer class="site-footer">Музыкальная открытка · Без регистрации · Все встроенные оформления созданы для проекта</footer>`;}
async function create(template='blank',format='4:5'){
  const project=newProject('Моя открытка',format,template);
  try{const {editToken}=await api.create(project);location.hash=`#/edit/${editToken}`;}
  catch(e){toast(`Не удалось создать открытку: ${e.message}`);}
}
function landing(){
  root.innerHTML=`${header()}<main class="site-container"><section class="hero"><div><div class="eyebrow">Личное поздравление с музыкой и голосом</div><h1>Открытка, которую можно не только увидеть, но и услышать</h1><p>Добавьте фото, пожелания, рисунки и стикеры. Запишите голос, подберите мелодию и отправьте открытку по ссылке.</p><div class="hero-buttons"><button class="btn primary big" data-create>Создать открытку</button><a class="btn light big" href="#/templates">Посмотреть шаблоны</a></div><p class="muted small">Без регистрации · На телефоне и компьютере</p></div><div class="hero-picture"><div class="decor-card"><span class="heartmark">♥</span><h2>С Днём рождения!</h2><p>Ты делаешь каждый день светлее</p><span class="notes">♫ ✦ ♡</span></div></div></section><h2>Как это работает</h2><div class="feature-grid"><article><b>01 · Оформите</b><p>Расположите текст, фотографии, GIF и декоративные элементы на холсте.</p></article><article><b>02 · Добавьте звук</b><p>Запишите голосовое поздравление и выберите фоновую музыку.</p></article><article><b>03 · Поделитесь</b><p>Создайте ссылку, которая откроется сразу или в выбранное время.</p></article></div></main>${footer()}`;
}
function gallery(){
  root.innerHTML=`${header()}<main class="site-container gallery-page"><div class="page-title"><h1>Выберите оформление</h1><p>Все шаблоны состоят из редактируемых элементов.</p></div><div class="gallery-grid">${templates.map(t=>`<button class="gallery-card" data-new-template="${t.id}"><div class="gallery-cover" style="background:${t.bg}"><span>${t.decoration}</span><strong>${t.id==='blank'?'Начните с чистого холста':esc(t.name)}</strong></div><b>${esc(t.name)}</b><small>Использовать шаблон →</small></button>`).join('')}</div><section class="format-pick"><h2>Начать с пустого холста</h2><p>Выберите пропорции открытки.</p><div class="row-wrap">${Object.keys(formats).map(f=>`<button class="btn light" data-new-format="${f}">${f}</button>`).join('')}</div></section></main>${footer()}`;
}
function notFound(message){root.innerHTML=`${header()}<main class="site-container error-page"><h1>Не удалось открыть страницу</h1><p>${esc(message)}</p><a class="btn primary" href="#/">На главную</a></main>${footer()}`;}
function scaleViewer(p){const stage=$('#viewer-stage'),viewport=$('#viewer-viewport');if(stage&&viewport)scaleStage(stage,viewport,p);}
function showViewer(p,{preview=false,token=''}={}){
  root.innerHTML=`<div class="viewer-page"><header class="viewer-head"><a href="${preview?`#/edit/${encodeURIComponent(token)}`:'#/'}" class="btn light">${preview?'← В редактор':'♪ На главную'}</a><span>${preview?'Предпросмотр':'Для вас музыкальная открытка'}</span></header><main class="viewer-main"><div id="viewer-viewport" class="viewer-viewport"><div class="stage-shell"><div id="viewer-stage" class="stage"></div></div><div class="unveil" id="unveil"><div class="unveil-content"><div class="play-disc">▶</div><h1>Для вас приготовлено поздравление!</h1><p>Подключите наушники или настройте громкость на устройстве.</p><button class="btn primary big" id="start-view">Открыть и прослушать</button></div></div></div><div class="viewer-player"><button class="btn light" id="viewer-toggle" disabled>▶ Воспроизвести заново</button><span class="muted">Голос и музыка запускаются одновременно</span></div></main></div>`;
  const stage=$('#viewer-stage');renderStage(stage,p);scaleViewer(p);
  const observer=new ResizeObserver(()=>scaleViewer(p));observer.observe($('#viewer-viewport'));
  const player=new CardAudio();let started=false;
  $('#start-view').disabled=true;
  player.prepare(p).then(()=>{$('#start-view').disabled=false;}).catch(e=>toast(e.message));
  function begin(){
    $('#unveil').classList.add('unveiled');started=true;
    player.play(()=>{$('#viewer-toggle').textContent='▶ Воспроизвести заново';});
    $('#viewer-toggle').disabled=false;$('#viewer-toggle').textContent='Ⅱ Пауза';
  }
  $('#start-view').onclick=begin;
  $('#viewer-toggle').onclick=()=>{
    if(player.playing){player.pause();$('#viewer-toggle').textContent='▶ Продолжить';}
    else{if(!started)$('#unveil').classList.add('unveiled');player.play(()=>{$('#viewer-toggle').textContent='▶ Снова';});$('#viewer-toggle').textContent='Ⅱ Пауза';}
  };
  cleanup=()=>{observer.disconnect();player.stop();};
}
async function publishPage(token){
  const {project:p}=await api.getProject(token);
  root.innerHTML=`${header()}<main class="site-container publish-wrap"><a href="#/edit/${encodeURIComponent(token)}" class="back-link">← Вернуться в редактор</a><section class="publish-card"><h1>Публикация открытки</h1><p>Выберите, когда получатель сможет открыть поздравление.</p><form id="publish-form"><label class="radio-row"><input type="radio" name="access" value="now" checked /> Доступна сразу</label><label class="radio-row"><input type="radio" name="access" value="later" /> Открыть по времени</label><div class="scheduled-fields" id="schedule-fields" hidden><label>Дата и время<input type="datetime-local" id="open-date" /></label><p class="muted">Время интерпретируется в часовом поясе вашего устройства.</p></div><button class="btn primary wide" type="submit">Создать публичную ссылку</button></form><div id="publish-result"></div></section></main>${footer()}`;
  $('#publish-form').addEventListener('change',()=>{$('#schedule-fields').hidden=$('input[name=access]:checked').value==='now';});
  $('#publish-form').onsubmit=async e=>{
    e.preventDefault();const later=$('input[name=access]:checked').value==='later';let opensAt=null;
    if(later){const date=$('#open-date').value;if(!date||new Date(date).getTime()<=Date.now())return toast('Выберите дату и время в будущем');opensAt=new Date(date).toISOString();}
    try{const {publicId}=await api.publish(token,opensAt),link=linkFor('card',publicId);
      $('#publish-result').innerHTML=`<hr><h2>Открытка опубликована</h2><p>${later?'Она станет доступной после указанного времени.':'Она доступна сразу.'}</p><input value="${esc(link)}" readonly aria-label="Публичная ссылка"/><button class="btn primary wide" id="copy-public">Скопировать ссылку</button><a class="btn light wide" href="#/card/${encodeURIComponent(publicId)}">Проверить ссылку</a>`;
      $('#copy-public').onclick=()=>copy(link);
    }catch(err){toast(err.message);}
  };
}
async function publicPage(publicId){
  const res=await api.getCard(publicId);
  if(res.status==='scheduled'){
    root.innerHTML=`${header()}<main class="wait-page"><div class="wait-content"><div class="gift-sign">♡</div><h1>Для вас приготовлен сюрприз!</h1><p>Открытка станет доступна ${new Date(res.opensAt).toLocaleString('ru-RU',{dateStyle:'long',timeStyle:'short'})} (по вашему времени).</p><button class="btn light" id="refresh-card">Проверить доступ</button></div></main>${footer()}`;
    $('#refresh-card').onclick=()=>route();return;
  }
  if(res.status!=='ready'||!res.project)throw Error('Открытка недоступна');
  showViewer(res.project);
}
async function route(){
  cleanup();cleanup=()=>{};
  const [page,id]=location.hash.replace(/^#\/?/,'').split('/');
  try{
    if(page==='templates')gallery();
    else if(page==='edit'&&id){const {project}=await api.getProject(id);cleanup=mountEditor(root,id,project);}
    else if(page==='preview'&&id){const {project}=await api.getProject(id);showViewer(project,{preview:true,token:id});}
    else if(page==='publish'&&id)await publishPage(id);
    else if(page==='card'&&id)await publicPage(id);
    else landing();
  }catch(err){notFound(err.message);}
  if(!API_BASE && ['edit','publish','card'].includes(page))console.info('Демо-режим: данные доступны только в этом браузере; серверная защита времени пока отсутствует.');
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-create],[data-new-template],[data-new-format]');if(!b)return;
  if(b.hasAttribute('data-create'))create();
  else if(b.dataset.newTemplate)create(b.dataset.newTemplate);
  else if(b.dataset.newFormat)create('blank',b.dataset.newFormat);
});
window.addEventListener('hashchange',route);
route();
