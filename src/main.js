import {api,linkFor} from './api.js';
import {newProject,applyCatalogTemplate,templates,formats,esc,setCatalog} from './model.js';
import {renderStage,scaleStage} from './stage.js';
import {CardAudio} from './audio.js';
import {mountEditor} from './editor.js';
import {$,toast,copy,safeColor,inkFor} from './ui.js';
import {API_BASE} from './config.js';
import {icon,brandMark,reel,flower} from './icons.js';
import {themeButton,syncThemeButtons} from './themeToggle.js';

const root=$('#app');
let cleanup=()=>{};
let galleryFilter='';
const catalogReady=api.getCatalog().then(setCatalog).catch(error=>{
  console.warn('Не удалось загрузить каталог:',error);
});

function header(){
  return `<header class="site-head"><a class="brand" href="#/">${brandMark(30)}<span>Музыкальная открытка</span></a>
  <nav aria-label="Основное меню"><a class="nav-link" href="#/templates">Шаблоны</a>${themeButton()}<button type="button" data-create class="btn primary">${icon('send',17)}<span>Написать открытку</span></button></nav></header>`;
}
function footer(){
  return `<footer class="site-footer"><b>Музыкальная открытка</b><span>Без регистрации</span><a href="/LICENSES.md" target="_blank" rel="noopener noreferrer">Авторы и лицензии встроенных материалов</a></footer>`;
}
const stampHTML=(color,text,rotate,ink='#FFFEFB')=>`<div class="stamp" style="transform:rotate(${rotate}deg)"><span style="background:${color};color:${ink}">${text}</span></div>`;
const tilt=i=>[-2.4,1.8,-1.2,2.4,-1.8,1.4,-1,2][i%8];

function coverHTML(t,i){
  const bg=safeColor(t.bg,'#FFFDF7');
  if(t.id==='blank')return `<span class="gallery-cover blank" style="--tilt:${tilt(i)}deg"><strong>чистый лист</strong><span class="muted small">4:5 · 1:1 · 9:16 · 16:9</span></span>`;
  return `<span class="gallery-cover" style="background:${bg};--tilt:${tilt(i)}deg"><span class="deco" aria-hidden="true">${esc(t.decoration||'♥')}</span><strong style="color:${inkFor(bg)}">${esc(t.name)}</strong></span>`;
}
function templateCard(t,i){
  return `<button type="button" class="gallery-card" data-new-template="${esc(t.id)}"><span class="pin"><span class="tape ${i%2?'':'blue'} center" aria-hidden="true"></span>${coverHTML(t,i)}</span><b>${esc(t.id==='blank'?'Начать с нуля':t.name)}</b><small>${t.id==='blank'?'выбрать формат ниже':'написать на этой →'}</small></button>`;
}

async function create(template='blank',format='4:5'){
  await catalogReady;
  const project=newProject('Моя открытка',format,'blank');
  try{
    if(template!=='blank'){
      const {template: selectedTemplate}=await api.getTemplate(template,format);
      applyCatalogTemplate(project,selectedTemplate);
    }
    const {editToken}=await api.create(project);location.hash=`#/edit/${editToken}`;
  }
  catch(e){toast(`Не удалось создать открытку: ${e.message}`);}
}

function landing(){
  const picks=templates.filter(t=>t.id!=='blank').slice(0,3);
  root.innerHTML=`${header()}<main class="site-container">
  <section class="hero">
    <div class="hero-copy">
      <span class="greeting" aria-hidden="true">дорогая Аня, …</span>
      <h1>Открытка, которую можно <span class="scribble">услышать<svg viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M4 12 C 60 2, 120 18, 180 8 S 270 6, 296 10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg></span></h1>
      <p>Подпишите от руки, наговорите пару тёплых слов, добавьте музыку — и отправьте ссылкой. Как настоящая почта, только приходит сразу.</p>
      <div class="hero-buttons"><button type="button" class="btn primary big" data-create>${icon('send',18)}Написать открытку</button><a class="btn light big" href="#/templates">Посмотреть шаблоны</a></div>
      <span class="hero-note">без регистрации · с телефона и компьютера</span>
    </div>
    <div class="hero-desk" aria-label="Пример открытки">
      <div class="desk-card one" aria-hidden="true"><span>Спасибо!</span></div>
      <div class="desk-card two" aria-hidden="true"><span>С Новым годом</span></div>
      <div class="demo-wrap" id="demo-wrap">
        <span class="tape blue center" aria-hidden="true"></span>
        <div class="demo-card" aria-hidden="true">
          ${flower(62)}
          <span class="card-stamp stamp"><span style="background:#C9372C">${icon('audio',24)}</span></span>
          <span class="postmark">17 · X<br>2026</span>
          <strong>С днём рождения, Аня!</strong>
          <em>Пусть этот год будет как любимая песня — тёплым, громким и с повтором лучших моментов.</em>
          <small>обнимаю, Лена</small>
        </div>
        <div class="demo-seal"><button type="button" class="wax-seal" id="demo-seal" aria-label="Сломать печать и посмотреть пример">${icon('play',34)}</button><span class="seal-label">так откроет её получатель</span></div>
      </div>
    </div>
  </section>
  </main>
  <section class="band"><span class="airmail airmail-edge" aria-hidden="true"></span><div class="band-inner">
    <h2 class="section-title">Как отправить <span class="hand">за четыре марки</span></h2>
    <div class="stamps">
      <article>${stampHTML('#C9372C','1',-4)}<h3>Выберите открытку</h3><p>Готовый шаблон или чистый лист. Меняйте всё: текст, фото, GIF, наклейки и рисунок.</p></article>
      <article>${stampHTML('#3E7B57','2',3)}<h3>Скажите пару слов</h3><p>Запишите голос прямо на сайте или загрузите запись с телефона.</p></article>
      <article>${stampHTML('#2F6B8F','3',-2)}<h3>Поставьте музыку</h3><p>Из подборки со свободными лицензиями или свою. Громкость голоса и музыки — по отдельности.</p></article>
      <article>${stampHTML('#E0A33A','4',5,'#1F2A44')}<h3>Запечатайте и отправьте</h3><p>Ссылка готова сразу. Можно назначить день и час, когда конверт откроется.</p></article>
    </div>
  </div></section>
  <main class="site-container">
    <section class="section">
      <div class="page-title"><h2 class="section-title" style="margin:0">Открытки на любой повод</h2><a class="btn light" href="#/templates">Все шаблоны ${icon('arrow',16)}</a></div>
      <div class="gallery-grid">${picks.map((t,i)=>templateCard(t,i)).join('')}${templateCard({id:'blank',name:'Пустой холст'},3)}</div>
    </section>
    <section class="paper feature-sheet"><span class="tape" aria-hidden="true"></span>
      <h2>ваша открытка умеет:</h2>
      <div class="feature-list">
        <article>${icon('check',28)}<div><h3>Ждать своего часа</h3><p>До назначенного времени по ссылке — запечатанный конверт и обратный отсчёт.</p></div></article>
        <article>${icon('check',28)}<div><h3>Звучать бережно</h3><p>Перед открытием подскажем прибавить звук или надеть наушники. Музыку можно приглушить под голос.</p></div></article>
        <article>${icon('check',28)}<div><h3>Дожидаться вас</h3><p>Черновик сохраняется сам. Секретная ссылка откроет его на любом устройстве — без регистрации.</p></div></article>
      </div>
    </section>
    <section class="envelope-cta"><span class="airmail" aria-hidden="true"></span><div class="inner">
      <div><span class="to">кому: тому, кто давно ждёт</span><h2>Напишите сегодня — пусть услышат ваш голос</h2></div>
      <button type="button" class="btn primary big" data-create>Написать открытку</button>
    </div></section>
  </main>${footer()}`;
  const seal=$('#demo-seal');
  seal.onclick=()=>{seal.classList.add('breaking');$('#demo-wrap').classList.add('revealed');};
}

function gallery(){
  const counts=new Map();
  templates.forEach(t=>(t.tags||[]).forEach(tag=>counts.set(tag,(counts.get(tag)||0)+1)));
  const tags=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([tag])=>tag);
  if(galleryFilter && !tags.includes(galleryFilter))galleryFilter='';
  const list=templates.filter(t=>t.id!=='blank' && (!galleryFilter || (t.tags||[]).includes(galleryFilter)));
  const blank=templates.find(t=>t.id==='blank')||{id:'blank',name:'Пустой холст'};
  root.innerHTML=`${header()}<main class="site-container gallery-page">
    <div class="page-title"><div><h1>Выберите открытку</h1><p>Каждый элемент шаблона можно изменить в редакторе.</p></div>
      <div class="filters" role="group" aria-label="Повод"><button type="button" class="chip" data-filter="" aria-pressed="${!galleryFilter}">Все</button>${tags.map(tag=>`<button type="button" class="chip" data-filter="${esc(tag)}" aria-pressed="${galleryFilter===tag}">${esc(tag)}</button>`).join('')}</div>
    </div>
    <div class="gallery-grid">${templateCard(blank,0)}${list.map((t,i)=>templateCard(t,i+1)).join('')}</div>
    <section class="paper format-pick"><span class="tape blue" aria-hidden="true"></span><h2>Чистый лист</h2><p>Выберите пропорции открытки — их можно поменять и позже.</p>
      <div class="format-row">${Object.entries(formats).map(([f,h])=>{const w=f==='16:9'?92:f==='9:16'?40:f==='1:1'?64:58;return `<button type="button" class="format-tile" data-new-format="${f}"><i style="width:${w}px;height:${Math.round(w*h/800)}px" aria-hidden="true"></i>${f}</button>`;}).join('')}</div>
    </section>
  </main>${footer()}`;
  root.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{galleryFilter=b.dataset.filter;gallery();}));
}

function notFound(message){
  root.innerHTML=`${header()}<main class="site-container error-page"><div class="paper"><span class="tape" aria-hidden="true"></span><h1>Письмо не дошло</h1><p>${esc(message)}</p><a class="btn primary" href="#/">На главную</a></div></main>${footer()}`;
}

function scaleViewer(p){const stage=$('#viewer-stage'),viewport=$('#viewer-viewport');if(stage&&viewport)scaleStage(stage,viewport,p);}
function showViewer(p,{preview=false,token='',credits=[]}={}){
  root.innerHTML=`<div class="viewer-page"><header class="viewer-head">
      <a href="${preview?`#/edit/${encodeURIComponent(token)}`:'#/'}" class="btn light">${icon('back',17)}<span>${preview?'В редактор':'На главную'}</span></a>
      <span class="title">${preview?'так её увидит получатель':'для вас музыкальная открытка'}</span>${themeButton()}
    </header>
    <main class="viewer-main">
      <div id="viewer-viewport" class="viewer-viewport"><div class="stage-shell"><div id="viewer-stage" class="stage"></div></div>
        <div class="unveil" id="unveil"><div class="unveil-content">
          <h1>Вам письмо со звуком!</h1>
          <button type="button" class="wax-seal" id="start-view" aria-label="Сломать печать: открыть и прослушать">${icon('play',36)}</button>
          <p class="hint">${icon('headphones',18)}<span>Прибавьте звук или наденьте наушники — и нажмите на печать</span></p>
        </div></div>
      </div>
      <div class="viewer-player" id="viewer-player"><span class="mini-reels" aria-hidden="true">${reel(30)}${reel(30)}</span>
        <button type="button" class="key main with-label" id="viewer-toggle" disabled>${icon('play',18)}<span>Слушать</span></button>
        <button type="button" class="key" id="viewer-replay" aria-label="Прослушать заново" disabled>${icon('replay',18)}</button>
        <span class="state" id="viewer-state">Голос и музыка звучат вместе</span>
      </div>
    </main></div>`;
  if(credits.length){
    const box=document.createElement('details');box.className='viewer-credits';
    const summary=document.createElement('summary');summary.textContent='Авторы и лицензии использованных материалов';box.append(summary);
    for(const credit of credits){
      const line=document.createElement('p');line.textContent=credit.text+' ';
      if(credit.licenseUrl && /^https:\/\/creativecommons\.org\/licenses\//.test(credit.licenseUrl)){
        const a=document.createElement('a');a.href=credit.licenseUrl;a.textContent=credit.license;
        a.rel='noopener noreferrer';a.target='_blank';line.append(a);
      }
      if(credit.sourceUrl && /^https:\/\//.test(credit.sourceUrl)){
        const source=document.createElement('a');source.href=credit.sourceUrl;
        source.textContent='Источник';source.rel='noopener noreferrer';source.target='_blank';
        line.append(' · ',source);
      }
      box.append(line);
    }
    document.querySelector('.viewer-main').append(box);
  }
  const stage=$('#viewer-stage');renderStage(stage,p);scaleViewer(p);
  const observer=new ResizeObserver(()=>scaleViewer(p));observer.observe($('#viewer-viewport'));
  const player=new CardAudio();let started=false;
  const toggle=$('#viewer-toggle'),replay=$('#viewer-replay'),state=$('#viewer-state'),deck=$('#viewer-player');
  const setUi=(playing,label)=>{
    deck.classList.toggle('is-playing',playing);
    toggle.innerHTML=`${icon(playing?'pause':'play',18)}<span>${label}</span>`;
    toggle.setAttribute('aria-label',label);
  };
  const done=()=>{setUi(false,'Ещё раз');state.textContent='Поздравление прозвучало';};
  $('#start-view').disabled=true;
  player.prepare(p).then(()=>{$('#start-view').disabled=false;}).catch(e=>toast(e.message));
  function reveal(){
    if(started)return;started=true;
    $('#start-view').classList.add('breaking');
    $('#viewer-viewport').classList.add('revealed');$('#unveil').classList.add('unveiled');
    toggle.disabled=false;replay.disabled=false;
  }
  function begin(){
    reveal();
    player.play(done);setUi(true,'Пауза');state.textContent='Звучит поздравление';
  }
  $('#start-view').onclick=begin;
  toggle.onclick=()=>{
    if(player.playing){player.pause();setUi(false,'Продолжить');state.textContent='На паузе';}
    else{reveal();player.play(done);setUi(true,'Пауза');state.textContent='Звучит поздравление';}
  };
  replay.onclick=()=>{player.stop();reveal();player.play(done);setUi(true,'Пауза');state.textContent='Звучит с начала';};
  cleanup=()=>{observer.disconnect();player.stop();};
}

function localInputValue(date){
  const shifted=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return shifted.toISOString().slice(0,16);
}
async function publishPage(token){
  await api.getProject(token);
  root.innerHTML=`${header()}<main class="site-container publish-wrap"><a href="#/edit/${encodeURIComponent(token)}" class="back-link">${icon('back',17)}Вернуться в редактор</a>
  <section class="paper publish-card"><span class="airmail" aria-hidden="true"></span><h1>Запечатываем конверт</h1><p>Выберите, когда получатель сможет открыть поздравление.</p>
    <form id="publish-form">
      <div class="radio-cards" role="radiogroup" aria-label="Когда открыть">
        <label class="radio-row"><input type="radio" name="access" value="now" checked /><span><b>Сразу</b><small>как только отправите ссылку</small></span></label>
        <label class="radio-row"><input type="radio" name="access" value="later" /><span><b>В назначенный час</b><small>до этого — страница ожидания</small></span></label>
      </div>
      <div class="scheduled-fields" id="schedule-fields" hidden><label>дата и время<input type="datetime-local" id="open-date" min="${localInputValue(new Date())}" /></label><p class="muted small">Время указывается в часовом поясе вашего устройства.</p></div>
      <button class="btn primary big wide" type="submit">${icon('send',18)}Запечатать и получить ссылку</button>
    </form><div id="publish-result" aria-live="polite"></div></section></main>${footer()}`;
  $('#publish-form').addEventListener('change',()=>{$('#schedule-fields').hidden=$('input[name=access]:checked').value==='now';});
  $('#publish-form').onsubmit=async e=>{
    e.preventDefault();const later=$('input[name=access]:checked').value==='later';let opensAt=null;
    if(later){const date=$('#open-date').value;if(!date||new Date(date).getTime()<=Date.now())return toast('Выберите дату и время в будущем');opensAt=new Date(date).toISOString();}
    try{const {publicId}=await api.publish(token,opensAt),link=linkFor('card',publicId);
      const canShare=typeof navigator.share==='function';
      $('#publish-result').innerHTML=`<div class="publish-result"><h2>Готово, запечатано!</h2><p class="muted">${later?'Открытка станет доступной после указанного времени.':'Открытка доступна сразу.'}</p>
        <div class="link-box"><input value="${esc(link)}" readonly aria-label="Публичная ссылка" /><button type="button" class="btn primary" id="copy-public">${icon('copy',16)}Скопировать</button></div>
        <div class="link-actions">${canShare?`<button type="button" class="btn light" id="share-public">${icon('share',16)}Поделиться</button>`:''}<a class="btn light" href="#/card/${encodeURIComponent(publicId)}">${icon('eye',16)}Проверить ссылку</a></div>
        <p class="hand muted" style="font-size:20px;margin:4px 0 0">вставьте ссылку в любой мессенджер — получатель нажмёт на печать и услышит вас</p></div>`;
      $('#copy-public').onclick=()=>copy(link);
      if(canShare)$('#share-public').onclick=()=>navigator.share({title:'Музыкальная открытка',url:link}).catch(()=>{});
    }catch(err){toast(err.message);}
  };
}

function plural(n,forms){const a=Math.abs(n)%100,b=a%10;return forms[a>10&&a<20?2:b>1&&b<5?1:b===1?0:2];}
async function publicPage(publicId){
  const res=await api.getCard(publicId);
  if(res.status==='scheduled'){
    const opens=new Date(res.opensAt);
    root.innerHTML=`${header()}<main class="wait-page"><div class="wait-content">
      <div class="envelope" aria-hidden="true"><span class="airmail"></span><span class="face"></span><svg class="flap" viewBox="0 0 320 210" preserveAspectRatio="none"><path d="M10 10L160 120L310 10" fill="none" stroke="var(--line)" stroke-width="1.5"/></svg><span class="to">для вас</span><span class="seal-small">${icon('clock',26)}</span></div>
      <h1>Ещё рано!</h1>
      <p>Открытка запечатана до<br><b>${esc(opens.toLocaleString('ru-RU',{dateStyle:'long',timeStyle:'short'}))}</b> (по вашему времени).</p>
      <div class="countdown" id="countdown" aria-live="off"></div>
      <button type="button" class="btn light" id="refresh-card">${icon('replay',16)}Проверить доступ</button>
    </div></main>${footer()}`;
    $('#refresh-card').onclick=()=>route();
    // Автопроверка только один раз, при переходе через нулевую отметку: если часы
    // устройства спешат относительно сервера, страница не уйдёт в бесконечный цикл.
    const alreadyDue=opens.getTime()<=Date.now();
    const tick=()=>{
      const left=opens.getTime()-Date.now();
      if(left<=0){
        clearInterval(timer);
        const node=$('#countdown');if(node)node.innerHTML='<p class="hand" style="font-size:24px">вот-вот откроется — нажмите «Проверить доступ»</p>';
        if(!alreadyDue)setTimeout(()=>{if($('#countdown'))route();},3000);
        return;
      }
      const d=Math.floor(left/864e5),h=Math.floor(left/36e5)%24,m=Math.floor(left/6e4)%60;
      const node=$('#countdown');if(!node)return;
      node.innerHTML=[[d,['день','дня','дней']],[h,['час','часа','часов']],[m,['минута','минуты','минут']]].map(([v,f])=>`<div>${v}<small>${plural(v,f)}</small></div>`).join('');
    };
    let timer=null;
    timer=setInterval(tick,15000);tick();
    cleanup=()=>clearInterval(timer);
    return;
  }
  if(res.status!=='ready'||!res.project)throw Error('Открытка недоступна');
  showViewer(res.project,{credits:res.credits||[]});
}
async function route(){
  cleanup();cleanup=()=>{};
  // Окно, открытое на прошлой странице (запись голоса, ссылка), не должно оставаться поверх новой.
  const dialog=document.querySelector('#dialog-overlay');
  if(dialog){if(typeof dialog.close==='function')dialog.close();else dialog.remove();}
  const [page,id]=location.hash.replace(/^#\/?/,'').split('/');
  try{
    await catalogReady;
    if(page==='templates')gallery();
    else if(page==='edit'&&id){const {project}=await api.getProject(id);cleanup=mountEditor(root,id,project);}
    else if(page==='preview'&&id){const {project}=await api.getProject(id);showViewer(project,{preview:true,token:id});}
    else if(page==='publish'&&id)await publishPage(id);
    else if(page==='card'&&id)await publicPage(id);
    else landing();
  }catch(err){notFound(err.message);}
  syncThemeButtons(root);
  window.scrollTo(0,0);
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
