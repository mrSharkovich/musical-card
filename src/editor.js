import {api,linkFor} from './api.js';
import {newProject,applyTemplate,templates,melodies,formats,uid,esc,clamp} from './model.js';
import {renderStage,scaleStage} from './stage.js';
import {CardAudio} from './audio.js';
import {$,$$,toast,modal,copy} from './ui.js';
import {MAX_IMAGE_MB,MAX_AUDIO_MB} from './config.js';

const menu=[['templates','Шаблоны'],['text','Текст'],['images','Изображения'],['shapes','Элементы'],['background','Фоны'],['draw','Рисование'],['layers','Слои'],['audio','Аудио']];
const formatOptions=p=>Object.keys(formats).map(f=>`<option value="${f}" ${p.format===f?'selected':''}>${f}</option>`).join('');
export function mountEditor(root,token,p){
  let tool='templates',selected=null,zoom=1,scale=1,gesture=null,saveTimer=null,changeNumber=0,recording=null;
  let saveFlight=Promise.resolve();
  const mobile=matchMedia('(max-width:750px)').matches;
  let libraryOpen=!mobile;
  const player=new CardAudio();
  root.innerHTML=`<div class="editor-shell">
    <header class="editor-top">
      <a href="#/" class="back" aria-label="На главную">←</a>
      <input class="project-name" id="project-name" aria-label="Название проекта" value="${esc(p.name)}" />
      <span class="save-state" id="save-state">Сохранено</span>
      <span class="top-spacer"></span>
      <button class="btn light" data-top="undo" title="Отменить">↶</button>
      <button class="btn light" data-top="redo" title="Повторить">↷</button>
      <button class="btn light" data-top="link">Ссылка редактирования</button>
      <button class="btn light" data-top="preview">Просмотр</button>
      <button class="btn primary" data-top="publish">Опубликовать</button>
    </header>
    <div class="editor-middle">
      <nav class="editor-rail" aria-label="Инструменты">
        ${menu.map(([key,name])=>`<button class="rail-btn" data-tool="${key}" title="${name}" aria-label="${name}"><span class="rail-glyph">${({templates:'▦',text:'T',images:'▧',shapes:'◇',background:'◩',draw:'✎',layers:'☷',audio:'♫'})[key]}</span><small>${name}</small></button>`).join('')}
      </nav>
      <aside class="library" id="library"></aside>
      <main class="workspace">
        <div class="workspace-top"><span>Холст: <select id="format">${formatOptions(p)}</select></span><span class="hint">Перетаскивайте объекты • дважды нажмите текст для редактирования</span></div>
        <div class="viewport" id="viewport"><div class="stage-shell"><div class="stage" id="stage"></div></div></div>
        <div class="zoom-controls"><button class="icon-button" data-zoom="out" aria-label="Уменьшить">−</button><output id="zoom-label">100%</output><button class="icon-button" data-zoom="in" aria-label="Увеличить">+</button><button class="btn light" data-zoom="fit">Уместить</button></div>
      </main>
      <aside class="properties" id="properties"></aside>
    </div>
    <footer class="audio-panel" id="audio-panel"></footer>
  </div>`;
  const stage=$('#stage',root),viewport=$('#viewport',root),library=$('#library',root),properties=$('#properties',root);
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
  function render(){renderStage(stage,p,selected);scale=scaleStage(stage,viewport,p,zoom);renderProps();renderLibrary();renderAudio();}
  function renderCanvas(){renderStage(stage,p,selected);scale=scaleStage(stage,viewport,p,zoom);}
  function choose(id){selected=id;if(mobile)libraryOpen=false;renderCanvas();renderProps();if(tool==='layers')renderLibrary();}
  const add=e=>{const before=snapshot();p.elements.push(e);selected=e.id;if(mobile)libraryOpen=false;commit(before);render();};
  const base=(type,x=270,y=200,w=250,h=100)=>({id:uid(),type,x,y,w,h,rotate:0,opacity:1});
  function renderLibrary(){
    $$('.rail-btn',root).forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
    const heading=menu.find(m=>m[0]===tool)?.[1];
    let html=`<h2>${heading}</h2>`;
    if(tool==='templates') html+=`<p class="muted">Выберите оформление. Элементы шаблона можно редактировать.</p><div class="thumb-grid">${templates.map(t=>`<button class="template-thumb" data-template="${t.id}"><span class="template-art" style="background:${t.bg}"><b>${t.decoration}</b><i>${t.id==='blank'?'':t.name}</i></span><small>${t.name}</small></button>`).join('')}</div>`;
    if(tool==='text')html+=`<button class="tile" data-add="title">Добавить заголовок</button><button class="tile" data-add="subtitle">Добавить подзаголовок</button><button class="tile" data-add="paragraph">Добавить текст</button><p class="muted">Готовые надписи</p>${['С Днём рождения!','Поздравляю!','С любовью ♡'].map(t=>`<button class="tile" data-text="${esc(t)}">${esc(t)}</button>`).join('')}`;
    if(tool==='images')html+=`<label class="btn primary upload-label">+ Загрузить фото / GIF<input hidden type="file" id="image-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple></label><p class="muted">JPG, PNG, WebP и GIF, до ${MAX_IMAGE_MB} МБ. Загружайте только материалы, на которые у вас есть права.</p><h3>Изображения проекта</h3><div id="asset-gallery" class="asset-gallery"></div>`;
    if(tool==='shapes')html+=`<p class="muted">Фигуры и декоративные символы</p><div class="shape-grid">${[['heart','♥'],['star','★'],['circle','●'],['square','■']].map(([k,s])=>`<button data-shape="${k}" class="shape-tile">${s}</button>`).join('')}</div>`;
    if(tool==='background')html+=`<label>Цвет фона <input id="bg-color" type="color" value="${esc(p.bg)}"></label><div class="swatches">${['#fce8f2','#ffe8da','#dff2e9','#e8e0ff','#d9eeff','#ffffff','#2f2942'].map(c=>`<button data-bg="${c}" style="background:${c}" aria-label="Фон ${c}"></button>`).join('')}</div><label class="btn light upload-label">Загрузить свой фон<input hidden type="file" id="background-file" accept="image/png,image/jpeg,image/webp,image/gif"></label><p class="muted">Загруженный фон станет растянутым изображением в нижнем слое.</p>`;
    if(tool==='draw')html+=`<p>Режим рисования: <b>включён</b>. Проведите по холсту мышью или пальцем.</p><label>Цвет кисти <input id="draw-color" type="color" value="#8a5bbf"></label><label>Толщина <input id="draw-size" type="range" min="2" max="35" value="6"></label><button class="btn light" data-tool="layers">Завершить рисование</button>`;
    if(tool==='layers')html+=`<div class="layer-list">${[...p.elements].reverse().map(e=>`<button class="layer ${selected===e.id?'current':''}" data-layer="${e.id}"><span>${e.type==='text'?'T':e.type==='image'?'▧':e.type==='draw'?'✎':'◇'}</span><span>${esc(e.type==='text'?e.text.slice(0,21):e.type==='image'?'Изображение':e.type==='draw'?'Рисунок':e.kind)}</span></button>`).join('')||'<p class="muted">На холсте пока нет элементов</p>'}</div>`;
    if(tool==='audio')html+=`<button class="btn primary wide" data-audio="record">Записать голос</button><label class="btn light wide upload-label">Загрузить голос<input hidden type="file" id="voice-file" accept="audio/*"></label><hr><h3>Музыкальная подборка</h3><p class="muted">Мелодии созданы программно для этого проекта, сторонние записи не используются.</p>${melodies.map(m=>`<button class="tile" data-melody="${m.id}">♫ ${m.name}</button>`).join('')}<label class="btn light wide upload-label">Загрузить свою музыку<input hidden type="file" id="music-file" accept="audio/*"></label>`;
    library.innerHTML=html;
    library.classList.toggle('mobile-hidden',mobile&&!libraryOpen);
    properties.classList.toggle('is-open',mobile&&!!selected&&!libraryOpen);
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
    properties.classList.toggle('is-open',mobile&&!!e&&!libraryOpen);
    if(!e){properties.innerHTML=`<h2>Настройки холста</h2><p class="muted">Выберите объект для редактирования.</p><label>Формат<select id="side-format">${formatOptions(p)}</select></label><label>Фон<input type="color" data-canvas-color value="${esc(p.bg)}"></label>`;return;}
    let html=`<div class="props-head"><h2>Свойства: ${({text:'Текст',image:'Изображение',shape:'Фигура',draw:'Рисунок'})[e.type]}</h2><button class="icon-button" data-prop-action="delete" title="Удалить">×</button></div>`;
    if(e.type==='text')html+=`<label>Текст<textarea rows="3" data-prop="text">${esc(e.text)}</textarea></label><label>Шрифт<select data-prop="font"><option value="serif" ${e.font==='serif'?'selected':''}>С засечками</option><option value="sans" ${e.font==='sans'?'selected':''}>Без засечек</option><option value="mono" ${e.font==='mono'?'selected':''}>Моноширинный</option></select></label><label>Размер шрифта<input type="number" min="8" max="150" data-prop="size" value="${e.size}"></label><label>Выравнивание<select data-prop="align"><option value="center">По центру</option><option value="left" ${e.align==='left'?'selected':''}>Слева</option><option value="right" ${e.align==='right'?'selected':''}>Справа</option></select></label>`;
    if(e.type==='image')html+=`<label class="btn light upload-label">Заменить изображение<input hidden id="replace-file" type="file" accept="image/*"></label>`;
    if(e.type!=='image')html+=`<label>Цвет<input data-prop="color" type="color" value="${esc(e.color||'#8855aa')}"></label>`;
    html+=`<div class="prop-grid"><label>X<input type="number" data-prop="x" value="${Math.round(e.x)}"></label><label>Y<input type="number" data-prop="y" value="${Math.round(e.y)}"></label><label>Ширина<input type="number" min="20" data-prop="w" value="${Math.round(e.w)}"></label><label>Высота<input type="number" min="20" data-prop="h" value="${Math.round(e.h)}"></label></div><label>Поворот<input type="range" min="-180" max="180" data-prop="rotate" value="${e.rotate||0}"></label><label>Прозрачность<input type="range" min="0" max="1" step="0.05" data-prop="opacity" value="${e.opacity??1}"></label><div class="row-wrap"><button class="btn light" data-prop-action="duplicate">Дублировать</button><button class="btn light" data-prop-action="up">Выше</button><button class="btn light" data-prop-action="down">Ниже</button></div>`;
    properties.innerHTML=html;
  }
  function renderAudio(){
    $('#audio-panel',root).innerHTML=`<div class="audio-head"><button class="btn light" data-audio="toggle">${player.playing?'Ⅱ Пауза':'▶ Слушать'}</button><strong>Звуковое сопровождение</strong><span class="muted">Голос и музыка вместе</span></div>
    <div class="audio-track"><b>🎙 Голос</b><span>${esc(p.voice?.name||'Не добавлен')}</span><label>Громкость <input type="range" data-volume="voice" min="0" max="1" step="0.05" value="${p.voiceVolume}"></label><button class="btn light" data-audio="record">${p.voice?'Заменить':'Добавить'}</button></div>
    <div class="audio-track"><b>♫ Музыка</b><span>${esc(p.music?.name||'Не выбрана')}</span><label>Громкость <input type="range" data-volume="music" min="0" max="1" step="0.05" value="${p.musicVolume}"></label><button class="btn light" data-audio="choose">Выбрать</button></div>`;
  }
  async function handleFile(file,kind){
    if(!file)return;
    const image=kind==='image'||kind==='background'||kind==='replace';
    if(!file.type.startsWith(image?'image/':'audio/'))return toast('Неподдерживаемый тип файла');
    if(file.size>(image?MAX_IMAGE_MB:MAX_AUDIO_MB)*1024*1024)return toast('Файл превышает допустимый размер');
    try{
      const {url}=await api.upload(file),before=snapshot();
      if(kind==='image')add({...base('image',180,180,420,310),src:url});
      else if(kind==='replace'){
        const e=p.elements.find(v=>v.id===selected);if(e){e.src=url;commit(before);render();}
      }else if(kind==='background'){
        p.elements.unshift({...base('image',0,0,800,formats[p.format]),src:url});commit(before);render();
      }else {p[kind]={src:url,name:file.name};commit(before);renderAudio();}
      toast('Файл добавлен');
    }catch(err){toast(`Ошибка загрузки: ${err.message}`);}
  }
  library.addEventListener('change',e=>{
    const id=e.target.id;
    if(['image-file','background-file','voice-file','music-file','replace-file'].includes(id)){
      const kind=({'image-file':'image','background-file':'background','voice-file':'voice','music-file':'music','replace-file':'replace'})[id];
      const files=[...e.target.files];files.forEach(file=>handleFile(file,kind));
    }
  });
  properties.addEventListener('change',e=>{if(e.target.id==='replace-file')handleFile(e.target.files[0],'replace');});
  library.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.tool){tool=b.dataset.tool;libraryOpen=true;renderLibrary();return;}
    if(b.dataset.template){if(p.elements.length && !confirm('Заменить текущее оформление?'))return;const before=snapshot();applyTemplate(p,b.dataset.template);selected=null;commit(before);render();}
    if(b.dataset.add || b.dataset.text){const title=b.dataset.add==='title',subtitle=b.dataset.add==='subtitle';const size=title?64:subtitle?42:30;add({...base('text',100,formats[p.format]*.35,600,size*2),text:b.dataset.text|| (title?'Заголовок':subtitle?'Подзаголовок':'Ваш текст'),color:'#533a69',font:title?'serif':'sans',size,align:'center'});}
    if(b.dataset.shape)add({...base('shape',300,formats[p.format]*.35,140,140),kind:b.dataset.shape,color:'#a064c4'});
    if(b.dataset.bg){const before=snapshot();p.bg=b.dataset.bg;commit(before);render();}
    if(b.dataset.layer)choose(b.dataset.layer);
    if(b.dataset.melody){const before=snapshot();p.music={key:b.dataset.melody,name:melodies.find(m=>m.id===b.dataset.melody).name};commit(before);renderAudio();toast('Мелодия выбрана');}
    if(b.dataset.audio==='record')voiceDialog();
  });
  library.addEventListener('input',e=>{if(e.target.id==='bg-color'){const before=snapshot();p.bg=e.target.value;commit(before);renderCanvas();}});
  properties.addEventListener('input',e=>{
    if(e.target.dataset.canvasColor){const before=snapshot();p.bg=e.target.value;commit(before);renderCanvas();return;}
    const key=e.target.dataset.prop;if(!key)return;
    const obj=p.elements.find(o=>o.id===selected);if(!obj)return;
    const before=snapshot();obj[key]=['size','x','y','w','h','rotate','opacity'].includes(key)?Number(e.target.value):e.target.value;
    if(['w','h'].includes(key))obj[key]=Math.max(20,obj[key]);
    commit(before);renderCanvas();
  });
  properties.addEventListener('change',e=>{if(e.target.id==='side-format')setFormat(e.target.value);});
  properties.addEventListener('click',e=>{
    const action=e.target.closest('[data-prop-action]')?.dataset.propAction;if(!action)return;
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
  $('#project-name',root).addEventListener('input',e=>{p.name=e.target.value;dirty();});
  root.querySelector('.editor-rail').addEventListener('click',e=>{const id=e.target.closest('[data-tool]')?.dataset.tool;if(id){tool=id;libraryOpen=true;renderLibrary();renderProps();}});
  // Pointer interaction: dragging, resizing, rotating and freehand drawing.
  stage.addEventListener('pointerdown',e=>{
    const item=e.target.closest('.object');
    const sx=e.clientX,sy=e.clientY;
    if(tool==='draw'){
      const rect=stage.getBoundingClientRect(),start=[(sx-rect.left)/scale,(sy-rect.top)/scale];
      gesture={kind:'draw',points:[start],before:snapshot()};stage.setPointerCapture(e.pointerId);return;
    }
    if(!item){choose(null);return;}
    const id=item.dataset.id,entry=p.elements.find(v=>v.id===id);if(!entry)return;
    if(selected!==id)choose(id);
    gesture={kind:e.target.dataset.handle||'move',id,starting:{...entry},sx,sy,before:snapshot()};
    stage.setPointerCapture(e.pointerId);e.preventDefault();
  });
  stage.addEventListener('pointermove',e=>{
    if(!gesture)return;
    if(gesture.kind==='draw'){
      const rect=stage.getBoundingClientRect();gesture.points.push([(e.clientX-rect.left)/scale,(e.clientY-rect.top)/scale]);return;
    }
    const ob=p.elements.find(v=>v.id===gesture.id);if(!ob)return;
    const dx=(e.clientX-gesture.sx)/scale,dy=(e.clientY-gesture.sy)/scale;
    if(gesture.kind==='move'){ob.x=gesture.starting.x+dx;ob.y=gesture.starting.y+dy;}
    if(gesture.kind==='resize'){ob.w=Math.max(30,gesture.starting.w+dx);ob.h=Math.max(30,gesture.starting.h+dy);}
    if(gesture.kind==='rotate'){ob.rotate=(gesture.starting.rotate||0)+dx*.7;}
    const node=stage.querySelector(`[data-id="${gesture.id}"]`);
    if(node){node.style.left=`${ob.x}px`;node.style.top=`${ob.y}px`;node.style.width=`${ob.w}px`;node.style.height=`${ob.h}px`;node.style.transform=`rotate(${ob.rotate||0}deg)`;}
  });
  stage.addEventListener('pointerup',e=>{
    if(!gesture)return;
    const g=gesture;gesture=null;
    if(g.kind==='draw' && g.points.length>1){
      const xs=g.points.map(p=>p[0]),ys=g.points.map(p=>p[1]);const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(20,Math.max(...xs)-x+8),h=Math.max(20,Math.max(...ys)-y+8);
      p.elements.push({...base('draw',x,y,w,h),points:g.points.map(pt=>[pt[0]-x,pt[1]-y]),color:$('#draw-color',library)?.value||'#8a5bbf',size:Number($('#draw-size',library)?.value||6)});
    }
    commit(g.before);renderCanvas();renderProps();if(tool==='layers')renderLibrary();
  });
  stage.addEventListener('dblclick',e=>{
    const id=e.target.closest('.object')?.dataset.id;const ob=p.elements.find(v=>v.id===id);
    if(ob?.type==='text'){const result=prompt('Изменить текст',ob.text);if(result!==null){const before=snapshot();ob.text=result;commit(before);render();}}
  });
  root.querySelector('.zoom-controls').addEventListener('click',e=>{const a=e.target.closest('[data-zoom]')?.dataset.zoom;if(!a)return;zoom=a==='fit'?1:clamp(zoom*(a==='in'?1.2:1/1.2),.45,2.5);scale=scaleStage(stage,viewport,p,zoom);$('#zoom-label',root).textContent=`${Math.round(scale*100)}%`;});
  const resizeObserver=new ResizeObserver(()=>{
    if(!stage.isConnected)return;
    scale=scaleStage(stage,viewport,p,zoom);
    const label=$('#zoom-label',root);if(label)label.textContent=`${Math.round(scale*100)}%`;
  });
  resizeObserver.observe(viewport);
  root.querySelector('.editor-top').addEventListener('click',async e=>{
    const action=e.target.closest('[data-top]')?.dataset.top;if(!action)return;
    if(action==='undo' && undoStack.length){redoStack.push(snapshot());p=JSON.parse(undoStack.pop());dirty();selected=null;render();}
    if(action==='redo' && redoStack.length){undoStack.push(snapshot());p=JSON.parse(redoStack.pop());dirty();selected=null;render();}
    if(action==='link'){
      const m=modal('Ссылка для редактирования',`<p>Сохраните эту секретную ссылку. Любой, у кого она есть, сможет менять открытку.</p><input readonly value="${esc(linkFor('edit',token))}" /><button class="btn primary wide" id="copy-edit">Скопировать</button>`);
      $('#copy-edit',m).onclick=()=>copy(linkFor('edit',token));
    }
    if(['preview','publish'].includes(action)){
      try{await flush();location.hash=`#/${action}/${token}`;}catch(err){toast(`Не удалось сохранить: ${err.message}`);}
    }
  });
  $('#audio-panel',root).addEventListener('input',e=>{
    const kind=e.target.dataset.volume;if(!kind)return;
    const before=snapshot();p[kind+'Volume']=Number(e.target.value);commit(before);player.volume(p.voiceVolume,p.musicVolume);
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
  function voiceDialog(){
    const m=modal('Голосовое поздравление',`<p>Запишите голос или загрузите аудиофайл. Для микрофона необходим HTTPS либо localhost.</p><p class="muted" id="rec-status">Запись не начата</p><button class="btn primary" id="rec-start">Начать запись</button> <button class="btn light" id="rec-stop" disabled>Остановить</button><hr><label class="btn light upload-label">Выбрать аудиофайл<input type="file" id="modal-voice" accept="audio/*" hidden></label>`);
    $('#modal-voice',m).onchange=async e=>{await handleFile(e.target.files[0],'voice');m.remove();};
    $('#rec-start',m).onclick=async()=>{
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return toast('Запись недоступна: используйте HTTPS или загрузите файл');
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        const recorder=new MediaRecorder(stream),chunks=[];recording=recorder;
        recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});await handleFile(new File([blob],`Поздравление.${blob.type.includes('mp4')?'mp4':'webm'}`,{type:blob.type}),'voice');$('#rec-status',m)&&( $('#rec-status',m).textContent='Запись сохранена' );};
        recorder.start();$('#rec-start',m).disabled=true;$('#rec-stop',m).disabled=false;$('#rec-status',m).textContent='Идёт запись…';
      }catch(err){toast(`Микрофон: ${err.message}`);}
    };
    $('#rec-stop',m).onclick=()=>{if(recording?.state==='recording')recording.stop();$('#rec-stop',m).disabled=true;};
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
