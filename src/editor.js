import {api,linkFor} from './api.js';
import {applyTemplate,applyCatalogTemplate,templates,melodies,backgrounds,stickers,formats,uid,esc,clamp} from './model.js';
import {renderStage,scaleStage} from './stage.js';
import {CardAudio} from './audio.js';
import {$,$$,toast,modal,copy} from './ui.js';
import {MAX_IMAGE_MB,MAX_AUDIO_MB} from './config.js';
import {icon,reel} from './icons.js';
import {themeButton,syncThemeButtons,setTheme,currentTheme} from './themeToggle.js';

// Шрифты текста: подписи для меню (значения проверяет сервер, см. TEXT_FONTS в schemas.py).
const FONT_OPTIONS=[['hand','От руки (Caveat)'],['round','Округлый (Nunito)'],['script','Каллиграфия (Pacifico)'],['serif','С засечками'],['sans','Без засечек'],['mono','Моноширинный']];

const menu=[['templates','Шаблоны'],['text','Текст'],['images','Изображения'],['shapes','Элементы'],['background','Фоны'],['draw','Рисование'],['layers','Слои'],['audio','Аудио']];
const formatOptions=p=>Object.keys(formats).map(f=>`<option value="${f}" ${p.format===f?'selected':''}>${f}</option>`).join('');
const UPLOAD_RIGHTS_NOTICE_KEY_PREFIX='mc:upload-rights-notice-disabled:';
const VOICE_RIGHTS_NOTICE_KEY_PREFIX='mc:voice-rights-notice-disabled:';
export function mountEditor(root,token,p,{onEditLinkCopied=()=>{},onProjectDeleted=()=>{}}={}){
  let tool='templates',selected=null,zoom=1,scale=1,panX=0,panY=0,gesture=null,saveTimer=null,changeNumber=0,recording=null;
  let saveFlight=Promise.resolve();
  const mobile=matchMedia('(max-width:750px)').matches;
  let libraryOpen=!mobile;
  let propertiesOpen=!mobile;
  const player=new CardAudio();
  root.innerHTML=`<div class="editor-shell">
    <header class="editor-top">
      <a href="#/" class="back" aria-label="На главную">${icon('back',22)}</a>
      <input class="project-name" id="project-name" aria-label="Название проекта" value="${esc(p.name)}" />
      <span class="save-state" id="save-state" aria-live="polite">Сохранено</span>
      <span class="top-spacer"></span>
      <button type="button" class="btn light" data-top="undo" title="Отменить" aria-label="Отменить">${icon('undo',18)}</button>
      <button type="button" class="btn light" data-top="redo" title="Повторить" aria-label="Повторить">${icon('redo',18)}</button>
      <span class="desktop-only">${themeButton()}</span>
      <button type="button" class="btn light desktop-only" data-top="link" aria-label="Ссылка редактирования">${icon('link',17)}<span class="label wide-only">Ссылка редактирования</span></button>
      <button type="button" class="btn danger desktop-only" data-top="delete" title="Удалить открытку и связанные материалы" aria-label="Удалить открытку">${icon('trash',17)}<span class="label wide-only">Удалить</span></button>
      <button type="button" class="btn light" data-top="preview" aria-label="Просмотр">${icon('eye',18)}<span class="label">Просмотр</span></button>
      <button type="button" class="btn primary" data-top="publish" aria-label="Отправить">${icon('send',18)}<span class="label">Отправить</span></button>
      <button type="button" class="btn light only-mobile" data-top="more" aria-label="Ещё действия">${icon('more',18)}</button>
    </header>
    <div class="editor-middle">
      <nav class="editor-rail" aria-label="Инструменты">
        ${menu.map(([key,name])=>`<button type="button" class="rail-btn" data-tool="${key}" title="${name}" aria-label="${name}">${icon(key,22)}<small>${name}</small></button>`).join('')}
      </nav>
      <aside class="library" id="library"></aside>
      <main class="workspace">
        <div class="workspace-top"><span>Холст: <select id="format">${formatOptions(p)}</select></span><button type="button" class="icon-button edit-selected" id="edit-selected" aria-label="Редактировать выбранный элемент" title="Редактировать выбранный элемент" disabled>${icon('draw',18)}</button><span class="hint">Перетаскивайте объекты • дважды нажмите текст для редактирования</span></div>
        <div class="viewport" id="viewport"><div class="stage-shell"><div class="stage" id="stage"></div></div></div>
        <div class="zoom-controls"><button type="button" class="icon-button" data-zoom="out" aria-label="Уменьшить">${icon('minus',18)}</button><output id="zoom-label">100%</output><button type="button" class="icon-button" data-zoom="in" aria-label="Увеличить">${icon('plus',18)}</button><button type="button" class="btn light" data-zoom="fit">${icon('fit',16)}Уместить</button></div>
      </main>
      <aside class="properties" id="properties"></aside>
    </div>
    <footer class="audio-panel" id="audio-panel"></footer>
  </div>`;
  const stage=$('#stage',root),viewport=$('#viewport',root),library=$('#library',root),properties=$('#properties',root),stageShell=stage.parentElement;
  const undoStack=[],redoStack=[];
  const snapshot=()=>JSON.stringify(p);
  function commit(before){if(before!==snapshot()){undoStack.push(before);if(undoStack.length>60)undoStack.shift();redoStack.length=0;dirty();}}
  function saveQueued(){
    const data=structuredClone(p);
    saveFlight=saveFlight.catch(()=>{}).then(()=>api.saveProject(token,data));
    return saveFlight;
  }
  function setSaveStatus(value){const node=$('#save-state',root);if(node)node.textContent=value;}
  function dirty(){
    p.updatedAt=new Date().toISOString();changeNumber++;
    setSaveStatus('Сохраняется…');clearTimeout(saveTimer);
    const revision=changeNumber;
    saveTimer=setTimeout(async()=>{
      try{await saveQueued();if(revision===changeNumber)setSaveStatus('Сохранено');}
      catch(e){setSaveStatus('Ошибка сохранения');toast(e.message);}
    },600);
  }
  async function flush(){clearTimeout(saveTimer);await saveQueued();setSaveStatus('Сохранено');}
  function applyPan(){
    const maxX=Math.max(0,(stageShell.offsetWidth-viewport.clientWidth)/2);
    const maxY=Math.max(0,(stageShell.offsetHeight-viewport.clientHeight)/2);
    panX=clamp(panX,-maxX,maxX);panY=clamp(panY,-maxY,maxY);
    stageShell.style.transform=`translate(-50%,-50%) translate(${panX}px,${panY}px)`;
  }
  function syncEditButton(){const editButton=$('#edit-selected',root);if(editButton)editButton.disabled=!selected;}
  function render(){renderStage(stage,p,selected);scale=scaleStage(stage,viewport,p,zoom);applyPan();syncEditButton();renderProps();renderLibrary();renderAudio();}
  function renderCanvas(){renderStage(stage,p,selected);scale=scaleStage(stage,viewport,p,zoom);applyPan();syncEditButton();}
  function collapseTools(){selected=null;libraryOpen=false;propertiesOpen=false;renderCanvas();renderProps();renderLibrary();}
  function choose(id,{openProperties=!mobile}={}){selected=id;if(mobile){libraryOpen=false;propertiesOpen=openProperties;}renderCanvas();renderProps();if(tool==='layers')renderLibrary();}
  const add=e=>{const before=snapshot();p.elements.push(e);selected=e.id;if(mobile){libraryOpen=false;propertiesOpen=false;}commit(before);render();};
  const base=(type,x=270,y=200,w=250,h=100)=>({id:uid(),type,x,y,w,h,rotate:0,opacity:1});
  function replaceBackground(src){
    p.elements=p.elements.filter(element=>!element.isBackground);
    if(src)p.elements.unshift({...base('image',0,0,800,formats[p.format]),src,isBackground:true});
  }
  function setCanvasColor(color){
    const before=snapshot();replaceBackground();p.bg=color;commit(before);render();
  }
  function renderLibrary(){
    $$('.rail-btn',root).forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
    const heading=menu.find(m=>m[0]===tool)?.[1];
    let html=`<div class="panel-head"><h2>${heading}</h2><button type="button" class="icon-btn panel-close" data-close-library aria-label="Свернуть панель">${icon('close',18)}</button></div>`;
    if(tool==='templates') html+=`<p class="muted">Выберите оформление. Элементы шаблона можно редактировать.</p><div class="thumb-grid">${templates.map(t=>`<button class="template-thumb" data-template="${t.id}"><span class="template-art" style="background:${t.bg}"><b>${t.decoration}</b><i>${t.id==='blank'?'':t.name}</i></span><small>${t.name}</small></button>`).join('')}</div>`;
    if(tool==='text')html+=`<button type="button" class="tile" data-add="title"><span style="font:700 24px var(--hand)">Заголовок от руки</span></button><button type="button" class="tile" data-add="subtitle"><span style="font:800 17px var(--sans)">Подзаголовок</span></button><button type="button" class="tile" data-add="paragraph">Обычный текст</button><h3>готовые надписи</h3>${['С Днём рождения!','Поздравляю!','С любовью ♡','Спасибо!'].map(t=>`<button type="button" class="tile" data-text="${esc(t)}"><span style="font:700 21px var(--hand)">${esc(t)}</span></button>`).join('')}`;
    if(tool==='images')html+=`<label class="btn primary upload-label">${icon('upload',18)}Вклеить фото или GIF<input hidden type="file" id="image-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple></label><p class="muted">JPG, PNG, WebP и GIF, до ${MAX_IMAGE_MB} МБ. Загружайте только материалы, на которые у вас есть права.</p><h3>Изображения проекта</h3><div id="asset-gallery" class="asset-gallery"></div>`;
    if(tool==='shapes')html+=`<p class="muted">Фигуры и декоративные символы</p><div class="shape-grid">${[['heart','♥'],['star','★'],['circle','●'],['square','■']].map(([k,s])=>`<button data-shape="${k}" class="shape-tile">${s}</button>`).join('')}</div>${stickers.length?`<h3>Стикеры из каталога</h3>${stickers.map(s=>`<button type="button" class="tile" data-sticker="${esc(s.id)}">${icon('plus',16)}${esc(s.name)}</button>`).join('')}`:''}`;
    if(tool==='background')html+=`<label>Цвет фона <input id="bg-color" type="color" value="${esc(p.bg)}"></label><div class="swatches">${['#fce8f2','#ffe8da','#dff2e9','#e8e0ff','#d9eeff','#ffffff','#2f2942'].map(c=>`<button data-bg="${c}" style="background:${c}" aria-label="Фон ${c}"></button>`).join('')}</div>${backgrounds.length?`<h3>Фоны из каталога</h3>${backgrounds.map(b=>`<button type="button" class="tile" data-catalog-bg="${esc(b.id)}">${icon('images',16)}${esc(b.name)}</button>`).join('')}`:''}<label class="btn light upload-label">${icon('upload',17)}Загрузить свой фон<input hidden type="file" id="background-file" accept="image/png,image/jpeg,image/webp,image/gif"></label><p class="muted">Загруженный фон станет растянутым изображением в нижнем слое.</p>`;
    if(tool==='draw')html+=`<p>Режим рисования: <b>включён</b>. Проведите по холсту мышью или пальцем.</p><label>Цвет кисти <input id="draw-color" type="color" value="#8a5bbf"></label><label>Толщина <input id="draw-size" type="range" min="2" max="35" value="6"></label><button type="button" class="btn light" data-tool="layers">${icon('check',17)}Завершить рисование</button>`;
    if(tool==='layers')html+=`<div class="layer-list">${[...p.elements].reverse().map(e=>`<button class="layer ${selected===e.id?'current':''}" data-layer="${esc(e.id)}"><span>${icon(e.type==='text'?'text':e.type==='image'?'images':e.type==='draw'?'draw':'shapes',18)}</span><span>${esc(e.type==='text'?e.text.slice(0,21):e.type==='image'?'Изображение':e.type==='draw'?'Рисунок':e.kind)}</span></button>`).join('')||'<p class="muted">На холсте пока нет элементов</p>'}</div>`;
    if(tool==='audio')html+=`<button type="button" class="btn primary wide" data-audio="record">${icon('mic',18)}Записать голос</button><label class="btn light wide upload-label">${icon('upload',17)}Загрузить голос<input hidden type="file" id="voice-file" accept="audio/*"></label><p class="muted">Совет: улыбнитесь, когда говорите, — это слышно.</p><h3>музыкальная подборка</h3>${melodies.map(m=>`<button type="button" class="tile" data-melody="${esc(m.id)}" aria-pressed="${p.music?.key===m.id}">${icon('audio',16)}<span>${esc(m.name)}${m.artist?' · '+esc(m.artist):''}</span></button>`).join('')}<label class="btn light wide upload-label">${icon('upload',17)}Загрузить свою музыку<input hidden type="file" id="music-file" accept="audio/*"></label><p class="muted">Загружайте только музыку, которую вам разрешено использовать.</p>`;
    library.innerHTML=html;
    library.hidden=!libraryOpen;
    library.style.setProperty('display',libraryOpen?'':'none',libraryOpen?'':'important');
    library.classList.toggle('mobile-hidden',mobile&&!libraryOpen);
    properties.classList.toggle('is-open',mobile&&propertiesOpen&&!!selected&&!libraryOpen);
    if(tool==='images'){
      const gallery=$('#asset-gallery',library);
      p.elements.filter(e=>e.type==='image').forEach(async e=>{
        const item=document.createElement('button');item.className='asset-preview';item.textContent='Изображение';item.onclick=()=>choose(e.id);
        gallery.append(item);
        try{const {mediaSource}=await import('./stage.js');const img=new Image();img.src=await mediaSource(e.src);img.alt='Изображение проекта';item.replaceChildren(img);}catch{}
      });
    }
  }
  function renderProps(){
    const e=p.elements.find(o=>o.id===selected);
    properties.classList.toggle('is-open',mobile&&propertiesOpen&&!!e&&!libraryOpen);
    if(!e){properties.innerHTML=`<h2>Настройки холста</h2><p class="muted">Выберите объект для редактирования.</p><label>Формат<select id="side-format">${formatOptions(p)}</select></label><label>Фон<input type="color" data-canvas-color value="${esc(p.bg)}"></label>`;return;}
    let html=`<div class="props-head"><h2>${({text:'Текст',image:'Изображение',shape:'Фигура',draw:'Рисунок'})[e.type]}</h2><span class="row-wrap"><button type="button" class="icon-btn" data-prop-action="delete" title="Удалить" aria-label="Удалить объект">${icon('trash',18)}</button><button type="button" class="icon-btn panel-close" data-prop-action="close" aria-label="Готово">${icon('check',18)}</button></span></div>`;
    if(e.type==='text')html+=`<label>Текст<textarea rows="3" data-prop="text">${esc(e.text)}</textarea></label><label>Шрифт<select data-prop="font">${FONT_OPTIONS.map(([value,label])=>`<option value="${value}" ${(e.font||'serif')===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Размер шрифта<input type="number" min="8" max="150" data-prop="size" value="${e.size}"></label><label>Выравнивание<select data-prop="align"><option value="center">По центру</option><option value="left" ${e.align==='left'?'selected':''}>Слева</option><option value="right" ${e.align==='right'?'selected':''}>Справа</option></select></label>`;
    if(e.type==='image')html+=`<label class="btn light upload-label">Заменить изображение<input hidden id="replace-file" type="file" accept="image/*"></label>`;
    if(e.type!=='image')html+=`<label>Цвет<input data-prop="color" type="color" value="${esc(e.color||'#8855aa')}"></label>`;
    html+=`<div class="prop-grid"><label>X<input type="number" data-prop="x" value="${Math.round(e.x)}"></label><label>Y<input type="number" data-prop="y" value="${Math.round(e.y)}"></label><label>Ширина<input type="number" min="20" data-prop="w" value="${Math.round(e.w)}"></label><label>Высота<input type="number" min="20" data-prop="h" value="${Math.round(e.h)}"></label></div><label>Поворот<input type="range" min="-180" max="180" data-prop="rotate" value="${e.rotate||0}"></label><label>Прозрачность<input type="range" min="0" max="1" step="0.05" data-prop="opacity" value="${e.opacity??1}"></label><div class="row-wrap"><button class="btn light" data-prop-action="duplicate">Дублировать</button><button class="btn light" data-prop-action="up">Выше</button><button class="btn light" data-prop-action="down">Ниже</button></div>`;
    properties.innerHTML=html;
  }
  function renderAudio(){
    const playing=player.playing;
    const panel=$('#audio-panel',root);
    panel.classList.toggle('is-playing',playing);
    panel.innerHTML=`<div class="cassette" aria-hidden="true"><div class="label"><b>${esc(p.name||'Моя открытка')}</b><div class="window">${reel(34)}${reel(34)}</div></div></div>
    <div class="deck-keys"><button type="button" class="key main" data-audio="toggle" aria-label="${playing?'Пауза':'Слушать голос и музыку вместе'}">${icon(playing?'pause':'play',20)}</button></div>
    <div class="deck-tracks">
      <div class="audio-track voice"><span class="track-name">${icon('mic',17)}<b>голос</b><span class="track-file">${esc(p.voice?.name||'не добавлен')}</span></span><button type="button" class="btn light" data-audio="record">${p.voice?'Заменить':'Добавить'}</button><label><span class="lbl-text">Громкость</span><input type="range" data-volume="voice" min="0" max="1" step="0.05" value="${p.voiceVolume}" aria-label="Громкость голоса"></label></div>
      <div class="audio-track music"><span class="track-name">${icon('audio',17)}<b>музыка</b><span class="track-file">${esc(p.music?.name||'не выбрана')}</span></span><button type="button" class="btn light" data-audio="choose">Выбрать</button><label><span class="lbl-text">Громкость</span><input type="range" data-volume="music" min="0" max="1" step="0.05" value="${p.musicVolume}" aria-label="Громкость музыки"></label></div>
      <label class="duck"><input type="checkbox" data-duck ${p.duckMusic?'checked':''}> Музыка тише, пока звучит голос</label>
    </div>`;
  }
  // Read dimensions locally before upload; works with JPEG, PNG, WebP and GIF.
  function imageDimensions(file){
    return new Promise((resolve,reject)=>{
      const objectURL=URL.createObjectURL(file),img=new Image();
      const cleanup=()=>URL.revokeObjectURL(objectURL);
      img.onload=()=>{const dimensions={width:img.naturalWidth,height:img.naturalHeight};cleanup();dimensions.width&&dimensions.height?resolve(dimensions):reject(Error('Не удалось определить размер изображения'));};
      img.onerror=()=>{cleanup();reject(Error('Не удалось прочитать изображение'));};
      img.src=objectURL;
    });
  }
  function fitDimensions(width,height,maxWidth,maxHeight){
    const scale=Math.min(maxWidth/width,maxHeight/height,1);
    return {w:Math.max(1,Math.round(width*scale)),h:Math.max(1,Math.round(height*scale))};
  }
  const uploadRightsNoticeKey=`${UPLOAD_RIGHTS_NOTICE_KEY_PREFIX}${token}`;
  const voiceRightsNoticeKey=`${VOICE_RIGHTS_NOTICE_KEY_PREFIX}${token}`;
  function rightsNoticeDisabled(){try{return localStorage.getItem(uploadRightsNoticeKey)==='1';}catch{return false;}}
  function disableRightsNotice(){try{localStorage.setItem(uploadRightsNoticeKey,'1');}catch{}}
  function voiceRightsNoticeDisabled(){try{return localStorage.getItem(voiceRightsNoticeKey)==='1';}catch{return false;}}
  function disableVoiceRightsNotice(){try{localStorage.setItem(voiceRightsNoticeKey,'1');}catch{}}
  function confirmUploadRights(){
    if(rightsNoticeDisabled())return Promise.resolve(true);
    return new Promise(resolve=>{
      let answered=false;
      const finish=value=>{if(answered)return;answered=true;resolve(value);};
      const dialog=modal('Права на загружаемые материалы',`<p>Пользователь гарантирует, что обладает всеми необходимыми правами на загружаемые материалы (фото, аудио, текст), а их размещение на Сайте не нарушает авторские и смежные права, а также иные права и законные интересы третьих лиц. В случае возникновения претензий со стороны третьих лиц, Пользователь обязуется урегулировать их своими силами и за свой счет, а также возместить Владельцу сайта все понесенные убытки.</p><label class="upload-rights-check"><input type="checkbox" data-disable-upload-rights-notice />Больше не показывать</label><div class="row-wrap"><button type="button" class="btn light" data-cancel-upload>Отмена</button><button type="button" class="btn primary" data-confirm-upload>Продолжить</button></div>`,{onClose:()=>finish(false)});
      dialog.addEventListener('click',event=>{
        if(event.target.closest('[data-cancel-upload]')){dialog.close();return;}
        if(!event.target.closest('[data-confirm-upload]'))return;
        if(dialog.querySelector('[data-disable-upload-rights-notice]').checked)disableRightsNotice();
        finish(true);dialog.close();
      });
    });
  }
  function confirmVoiceRights(){
    if(voiceRightsNoticeDisabled())return Promise.resolve(true);
    return new Promise(resolve=>{
      let answered=false;
      const finish=value=>{if(answered)return;answered=true;resolve(value);};
      const dialog=modal('Согласие на использование голоса',`<p>Загружая аудиоматериалы, Пользователь дает согласие на использование своего голоса и гарантирует, что обладает правами на использование голоса всех лиц, присутствующих в записи. Пользователь подтверждает, что получил от всех участников аудиозаписи письменное согласие на обнародование и дальнейшее использование их голоса (ст. 152.1 ГК РФ) и изображения. В случае предъявления претензий со стороны лиц, чей голос содержится в записи, Пользователь обязуется урегулировать их своими силами и возместить Владельцу сайта все убытки.</p><label class="upload-rights-check"><input type="checkbox" data-disable-voice-rights-notice />Больше не показывать</label><div class="row-wrap"><button type="button" class="btn light" data-cancel-voice>Отмена</button><button type="button" class="btn primary" data-confirm-voice>Продолжить</button></div>`,{onClose:()=>finish(false)});
      dialog.addEventListener('click',event=>{
        if(event.target.closest('[data-cancel-voice]')){dialog.close();return;}
        if(!event.target.closest('[data-confirm-voice]'))return;
        if(dialog.querySelector('[data-disable-voice-rights-notice]').checked)disableVoiceRightsNotice();
        finish(true);dialog.close();
      });
    });
  }
  async function handleFile(file,kind,voiceRightsConfirmed=false){
    if(!file)return;
    const image=kind==='image'||kind==='background'||kind==='replace';
    if(!file.type.startsWith(image?'image/':'audio/'))return toast('Неподдерживаемый тип файла');
    if(file.size>(image?MAX_IMAGE_MB:MAX_AUDIO_MB)*1024*1024)return toast('Файл превышает допустимый размер');
    if(kind==='voice'&&!voiceRightsConfirmed&&!(await confirmVoiceRights()))return;
    if(kind!=='voice'&&!(await confirmUploadRights()))return;
    try{
      const dimensions=image?await imageDimensions(file):null;
      const {url,moderation}=await api.upload(file,token),before=snapshot();
      if(kind==='image'){
        const {w,h}=fitDimensions(dimensions.width,dimensions.height,420,310);
        add({...base('image',180,180,w,h),src:url});
      }
      else if(kind==='replace'){
        const e=p.elements.find(v=>v.id===selected);
        if(e){const {w,h}=fitDimensions(dimensions.width,dimensions.height,e.w,e.h);e.src=url;e.w=w;e.h=h;commit(before);render();}
      }else if(kind==='background'){
        replaceBackground(url);commit(before);render();
      }else {p[kind]={src:url,name:file.name};commit(before);renderAudio();}
      toast(moderation==='unchecked'?'Файл загружен без проверки контента':'Файл добавлен');
    }catch(err){toast(`Ошибка загрузки: ${err.message}`);}
  }
  library.addEventListener('change',async e=>{
    const id=e.target.id;
    if(['image-file','background-file','voice-file','music-file','replace-file'].includes(id)){
      const kind=({'image-file':'image','background-file':'background','voice-file':'voice','music-file':'music','replace-file':'replace'})[id];
      const files=[...e.target.files];for(const file of files)await handleFile(file,kind);
      e.target.value='';
    }
  });
  properties.addEventListener('change',e=>{if(e.target.id==='replace-file')handleFile(e.target.files[0],'replace');});
  library.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-close-library')){libraryOpen=false;renderLibrary();renderProps();return;}
    if(b.dataset.tool){tool=b.dataset.tool;libraryOpen=true;renderLibrary();return;}
    if(b.dataset.template){if(p.elements.length && !confirm('Заменить текущее оформление?'))return;const before=snapshot();try{const {template}=await api.getTemplate(b.dataset.template,p.format);applyCatalogTemplate(p,template);}catch(error){applyTemplate(p,b.dataset.template);toast(`Каталог недоступен: ${error.message}`);}selected=null;commit(before);render();}
    if(b.dataset.add || b.dataset.text){const title=b.dataset.add==='title',subtitle=b.dataset.add==='subtitle';const size=title?64:subtitle?42:b.dataset.text?48:30;add({...base('text',100,formats[p.format]*.35,600,size*2),text:b.dataset.text|| (title?'Заголовок':subtitle?'Подзаголовок':'Ваш текст'),color:'#1F2A44',font:(title||b.dataset.text)?'hand':subtitle?'round':'sans',size,align:'center'});}
    if(b.dataset.shape)add({...base('shape',300,formats[p.format]*.35,140,140),kind:b.dataset.shape,color:'#a064c4'});
    if(b.dataset.bg)setCanvasColor(b.dataset.bg);
    if(b.dataset.catalogBg){const item=backgrounds.find(v=>v.id===b.dataset.catalogBg);if(item){const before=snapshot();replaceBackground(item.src);commit(before);render();}}
    if(b.dataset.sticker){const item=stickers.find(v=>v.id===b.dataset.sticker);if(item)add({...base('image',260,formats[p.format]*.35,item.defaultSize.w,item.defaultSize.h),src:item.src});}
    if(b.dataset.layer)choose(b.dataset.layer);
    if(b.dataset.melody){const track=melodies.find(m=>m.id===b.dataset.melody);if(track){const before=snapshot();p.music={key:track.id,name:track.name,...(track.src?{src:track.src}:{})};commit(before);renderAudio();renderLibrary();toast('Мелодия выбрана');}}
    if(b.dataset.audio==='record')voiceDialog();
  });
  library.addEventListener('input',e=>{if(e.target.id==='bg-color')setCanvasColor(e.target.value);});
  properties.addEventListener('input',e=>{
    if('canvasColor' in e.target.dataset){setCanvasColor(e.target.value);return;}
    const key=e.target.dataset.prop;if(!key)return;
    const obj=p.elements.find(o=>o.id===selected);if(!obj)return;
    const before=snapshot();obj[key]=['size','x','y','w','h','rotate','opacity'].includes(key)?Number(e.target.value):e.target.value;
    if(['w','h'].includes(key)){
      obj[key]=Math.max(20,obj[key]);
      if(obj.type==='image'){
        const ratio=Number(before.elements.find(v=>v.id===obj.id)?.w)/Number(before.elements.find(v=>v.id===obj.id)?.h);
        if(Number.isFinite(ratio)&&ratio>0){
          if(key==='w')obj.h=Math.max(1,obj.w/ratio);
          else obj.w=Math.max(1,obj.h*ratio);
        }
        const linked=properties.querySelector(`[data-prop="${key==='w'?'h':'w'}"]`);
        if(linked)linked.value=Math.round(key==='w'?obj.h:obj.w);
      }
    }
    commit(before);renderCanvas();
  });
  properties.addEventListener('change',e=>{if(e.target.id==='side-format')setFormat(e.target.value);});
  properties.addEventListener('click',e=>{
    const action=e.target.closest('[data-prop-action]')?.dataset.propAction;if(!action)return;
    if(action==='close'){selected=null;renderCanvas();renderProps();return;}
    const index=p.elements.findIndex(o=>o.id===selected);if(index<0)return;
    const before=snapshot(),obj=p.elements[index];
    if(action==='delete'){p.elements.splice(index,1);selected=null;}
    if(action==='duplicate'){const copy=structuredClone(obj);copy.id=uid();copy.x+=25;copy.y+=25;p.elements.push(copy);selected=copy.id;}
    if(action==='up' && index<p.elements.length-1)[p.elements[index],p.elements[index+1]]=[p.elements[index+1],p.elements[index]];
    if(action==='down' && index>0)[p.elements[index],p.elements[index-1]]=[p.elements[index-1],p.elements[index]];
    commit(before);render();
  });
  function setFormat(value){if(!formats[value]||value===p.format)return;if(!confirm('При изменении формата расположение элементов может потребовать корректировки. Продолжить?')){$('#format',root).value=p.format;return;}const before=snapshot();p.format=value;commit(before);render();}
  $('#format',root).addEventListener('change',e=>setFormat(e.target.value));
  $('#edit-selected',root).addEventListener('click',()=>{
    if(!selected)return;
    libraryOpen=false;
    propertiesOpen=true;
    renderProps();
    renderLibrary();
  });
  $('#project-name',root).addEventListener('input',e=>{p.name=e.target.value;dirty();});
  root.querySelector('.editor-rail').addEventListener('click',e=>{
    const id=e.target.closest('[data-tool]')?.dataset.tool;if(!id)return;
    const closeCurrent=tool===id&&libraryOpen;
    tool=id;libraryOpen=!closeCurrent;renderLibrary();renderProps();
  });
  // Pointer interaction: dragging, resizing, rotating and freehand drawing.
  stage.addEventListener('pointerdown',e=>{
    e.stopPropagation();
    const item=e.target.closest('.object');
    const sx=e.clientX,sy=e.clientY;
    if(tool==='draw'){
      const rect=stage.getBoundingClientRect(),start=[(sx-rect.left)/scale,(sy-rect.top)/scale];
      gesture={kind:'draw',points:[start],before:snapshot()};stage.setPointerCapture(e.pointerId);return;
    }
    if(!item){
      collapseTools();
      gesture={kind:'pan',sx,sy,panX,panY};stage.setPointerCapture(e.pointerId);e.preventDefault();return;
    }
    const id=item.dataset.id,entry=p.elements.find(v=>v.id===id);if(!entry)return;
    // On touch screens selecting or dragging keeps the canvas unobstructed.
    // The bottom panel is opened with the dedicated edit button above the canvas.
    if(mobile){selected=id;propertiesOpen=false;properties.classList.remove('is-open');renderCanvas();}
    else if(selected!==id)choose(id);
    gesture={kind:e.target.dataset.handle||'move',id,starting:{...entry},sx,sy,before:snapshot(),moved:false};
    stage.setPointerCapture(e.pointerId);e.preventDefault();
  });
  stage.addEventListener('click',e=>e.stopPropagation());
  viewport.addEventListener('pointerdown',e=>{
    if(e.target.closest('.stage'))return;
    collapseTools();
  });
  root.querySelector('.workspace').addEventListener('click',e=>{
    if(mobile || e.target.closest('button,input,select,textarea,.stage'))return;
    collapseTools();
  });
  stage.addEventListener('pointermove',e=>{
    if(!gesture)return;
    if(mobile&&!gesture.moved&&Math.hypot(e.clientX-gesture.sx,e.clientY-gesture.sy)>7){
      gesture.moved=true;
      propertiesOpen=false;
      properties.classList.remove('is-open');
    }
    if(gesture.kind==='pan'){
      panX=gesture.panX+e.clientX-gesture.sx;panY=gesture.panY+e.clientY-gesture.sy;applyPan();return;
    }
    if(gesture.kind==='draw'){
      const rect=stage.getBoundingClientRect();gesture.points.push([(e.clientX-rect.left)/scale,(e.clientY-rect.top)/scale]);return;
    }
    const ob=p.elements.find(v=>v.id===gesture.id);if(!ob)return;
    const dx=(e.clientX-gesture.sx)/scale,dy=(e.clientY-gesture.sy)/scale;
    if(gesture.kind==='move'){ob.x=gesture.starting.x+dx;ob.y=gesture.starting.y+dy;}
    if(gesture.kind==='resize'){
      if(ob.type==='image'){
        const startW=Math.max(1,gesture.starting.w),startH=Math.max(1,gesture.starting.h);
        const scaleFactor=Math.max(30/Math.min(startW,startH),1+(dx*startW+dy*startH)/(startW*startW+startH*startH));
        ob.w=startW*scaleFactor;ob.h=startH*scaleFactor;
      }else{ob.w=Math.max(30,gesture.starting.w+dx);ob.h=Math.max(30,gesture.starting.h+dy);}
    }
    if(gesture.kind==='rotate'){ob.rotate=(gesture.starting.rotate||0)+dx*.7;}
    const node=stage.querySelector(`[data-id="${gesture.id}"]`);
    if(node){node.style.left=`${ob.x}px`;node.style.top=`${ob.y}px`;node.style.width=`${ob.w}px`;node.style.height=`${ob.h}px`;node.style.transform=`rotate(${ob.rotate||0}deg)`;}
  });
  stage.addEventListener('pointerup',e=>{
    if(!gesture)return;
    const g=gesture;gesture=null;
    if(g.kind==='pan')return;
    if(mobile&&g.kind==='move'&&!g.moved){choose(g.id);return;}
    if(g.kind==='draw' && g.points.length>1){
      const xs=g.points.map(p=>p[0]),ys=g.points.map(p=>p[1]);const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(20,Math.max(...xs)-x+8),h=Math.max(20,Math.max(...ys)-y+8);
      p.elements.push({...base('draw',x,y,w,h),points:g.points.map(pt=>[pt[0]-x,pt[1]-y]),color:$('#draw-color',library)?.value||'#8a5bbf',size:Number($('#draw-size',library)?.value||6)});
    }
    commit(g.before);renderCanvas();
    if(!mobile||!g.moved)renderProps();
    if(tool==='layers')renderLibrary();
  });
  stage.addEventListener('dblclick',e=>{
    const id=e.target.closest('.object')?.dataset.id;const ob=p.elements.find(v=>v.id===id);
    if(ob?.type==='text'){const result=prompt('Изменить текст',ob.text);if(result!==null){const before=snapshot();ob.text=result;commit(before);render();}}
  });
  root.querySelector('.zoom-controls').addEventListener('click',e=>{const a=e.target.closest('[data-zoom]')?.dataset.zoom;if(!a)return;if(a==='fit'){zoom=1;panX=0;panY=0;}else zoom=clamp(zoom*(a==='in'?1.2:1/1.2),.45,2.5);scale=scaleStage(stage,viewport,p,zoom);applyPan();$('#zoom-label',root).textContent=`${Math.round(scale*100)}%`;});
  const resizeObserver=new ResizeObserver(()=>{
    if(!stage.isConnected)return;
    scale=scaleStage(stage,viewport,p,zoom);
    applyPan();
    const label=$('#zoom-label',root);if(label)label.textContent=`${Math.round(scale*100)}%`;
  });
  resizeObserver.observe(viewport);
  root.querySelector('.editor-top').addEventListener('click',e=>{
    const action=e.target.closest('[data-top]')?.dataset.top;if(action)topAction(action);
  });
  // «Ещё» на телефоне: редкие действия собраны в одно меню, чтобы шапка не переполнялась.
  function moreMenu(){
    const dark=currentTheme()==='dark';
    const m=modal('Действия',`<div class="menu-list">
      <button type="button" class="btn light" data-more="link">${icon('link',18)}Ссылка редактирования</button>
      <button type="button" class="btn light" data-more="theme">${icon(dark?'sun':'moon',18)}${dark?'Светлая тема':'Тёмная тема'}</button>
      <button type="button" class="btn danger" data-more="delete">${icon('trash',18)}Удалить открытку</button></div>`);
    m.addEventListener('click',e=>{
      const action=e.target.closest('[data-more]')?.dataset.more;if(!action)return;
      m.close();
      if(action==='theme'){setTheme(currentTheme()==='dark'?'light':'dark');return;}
      topAction(action);
    });
  }
  async function topAction(action){
    if(action==='more'){moreMenu();return;}
    if(action==='undo' && undoStack.length){redoStack.push(snapshot());p=JSON.parse(undoStack.pop());dirty();selected=null;render();}
    if(action==='redo' && redoStack.length){undoStack.push(snapshot());p=JSON.parse(redoStack.pop());dirty();selected=null;render();}
    if(action==='delete'){
      if(!confirm('Безвозвратно удалить проект, его опубликованные открытки и загруженные файлы? Отменить нельзя.'))return;
      try{await api.deleteProject(token);onProjectDeleted();location.hash='#/';toast('Открытка удалена');}
      catch(err){toast(`Не удалось удалить: ${err.message}`);}
      return;
    }
    if(action==='link'){
      const m=modal('Ссылка для редактирования',`<p>Сохраните эту секретную ссылку. Любой, у кого она есть, сможет менять открытку.</p><input readonly value="${esc(linkFor('edit',token))}" /><button class="btn primary wide" id="copy-edit">Скопировать</button>`);
      $('#copy-edit',m).onclick=async()=>{await copy(linkFor('edit',token));onEditLinkCopied();};
    }
    if(['preview','publish'].includes(action)){
      try{await flush();location.hash=`#/${action}/${token}`;}catch(err){toast(`Не удалось сохранить: ${err.message}`);}
    }
  }
  $('#audio-panel',root).addEventListener('input',e=>{
    const kind=e.target.dataset.volume;if(!kind)return;
    const before=snapshot();p[kind+'Volume']=Number(e.target.value);commit(before);player.volume(p.voiceVolume,p.musicVolume);
  });
  $('#audio-panel',root).addEventListener('change',e=>{
    if(!e.target.matches('[data-duck]'))return;
    const before=snapshot();p.duckMusic=e.target.checked;commit(before);
    if(player.project)player.project.duckMusic=p.duckMusic;
    player.refreshVolume();
  });
  $('#audio-panel',root).addEventListener('click',async e=>{
    const action=e.target.closest('[data-audio]')?.dataset.audio;
    if(action==='record')voiceDialog();
    if(action==='choose'){tool='audio';libraryOpen=true;renderLibrary();renderProps();}
    if(action==='toggle'){
      if(player.playing)player.pause();
      else try{await player.prepare(p);player.play(()=>renderAudio());}catch(err){toast(err.message);}
      renderAudio();
    }
  });
  async function voiceDialog(){
    if(!(await confirmVoiceRights()))return;
    let timer=null,stream=null,cancelled=false;
    const browserRecordingAvailable=window.isSecureContext&&!!navigator.mediaDevices?.getUserMedia&&!!window.MediaRecorder;
    const recordingUnavailable=()=>modal('Запись голоса недоступна',`<p>Откройте на устройстве приложение «Диктофон» или «Запись голоса», запишите поздравление, затем вернитесь на сайт и выберите сохранённый файл кнопкой «Выбрать аудиофайл».</p><button type="button" class="btn primary wide" data-close>Понятно</button>`);
    const stopTimer=()=>{clearInterval(timer);timer=null;};
    const m=modal('Голосовое поздравление',`<div class="rec-box">
      <button type="button" class="rec-button" id="rec-start" aria-label="Начать запись">${icon('mic',40)}</button>
      <span class="rec-time" id="rec-time" aria-live="off">0:00</span>
      <p class="rec-status" id="rec-status" aria-live="polite">нажмите на микрофон и говорите</p>
      <div class="rec-actions"><button type="button" class="btn light" id="rec-stop" disabled>${icon('stopFill',16)}Остановить и сохранить</button></div>
    </div>
    <label class="btn light wide upload-label">${icon('upload',17)}Выбрать аудиофайл<input type="file" id="modal-voice" accept="audio/*" hidden></label>`,
    {onClose:()=>{
      stopTimer();
      // Окно закрыли во время записи — запись отменяется, микрофон освобождается.
      if(recording?.state==='recording'){cancelled=true;recording.stop();}
      stream?.getTracks().forEach(t=>t.stop());
    }});
    const startBtn=$('#rec-start',m),stopBtn=$('#rec-stop',m),status=$('#rec-status',m),time=$('#rec-time',m),voiceFile=$('#modal-voice',m);
    voiceFile.onchange=async e=>{await handleFile(e.target.files[0],'voice',true);m.close();};
    const stop=()=>{if(recording?.state==='recording'){recording.stop();status.textContent='сохраняем…';}stopBtn.disabled=true;stopTimer();startBtn.classList.remove('live');};
    startBtn.onclick=async()=>{
      if(recording?.state==='recording')return stop();
      if(!browserRecordingAvailable){
        recordingUnavailable();
        return;
      }
      try{
        stream=await navigator.mediaDevices.getUserMedia({audio:true});
        if(!m.isConnected){stream.getTracks().forEach(t=>t.stop());return;}
        const recorder=new MediaRecorder(stream),chunks=[];recording=recorder;
        recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        recorder.onstop=async()=>{
          stream?.getTracks().forEach(t=>t.stop());
          if(cancelled||!chunks.length)return;
          const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});
          await handleFile(new File([blob],`Поздравление.${blob.type.includes('mp4')?'mp4':'webm'}`,{type:blob.type}),'voice',true);
          if(m.isConnected)m.close();
        };
        recorder.start();
        const startedAt=Date.now();
        timer=setInterval(()=>{const sec=Math.floor((Date.now()-startedAt)/1000);time.textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;},250);
        startBtn.classList.add('live');startBtn.setAttribute('aria-label','Остановить запись');startBtn.innerHTML=icon('stopFill',38);
        stopBtn.disabled=false;status.textContent='идёт запись… говорите';
      }catch{recordingUnavailable();}
    };
    stopBtn.onclick=stop;
  }
  const keyhandler=e=>{
    if(!document.querySelector('.editor-shell')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();root.querySelector('[data-top="undo"]').click();}
    if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();properties.querySelector('[data-prop-action="delete"]')?.click();}
  };
  document.addEventListener('keydown',keyhandler);
  render();
  return ()=>{clearTimeout(saveTimer);resizeObserver.disconnect();player.stop();document.removeEventListener('keydown',keyhandler);};
}
