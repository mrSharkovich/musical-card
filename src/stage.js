import {api} from './api.js';
import {esc,formats} from './model.js';
const urlCache=new Map();
export async function mediaSource(ref){
  if(!ref)return '';
  if(urlCache.has(ref))return urlCache.get(ref);
  const url=await api.mediaUrl(ref);
  // URLs supplied by the server must be HTTPS, HTTP on localhost, or same-origin paths.
  if(!url.startsWith('blob:') && !url.startsWith('/') && !/^https?:\/\//.test(url)) throw Error('Недопустимая ссылка на файл');
  urlCache.set(ref,url);return url;
}
// Допустимые шрифты текста (тот же список проверяет сервер в schemas.py).
// hand/script/round — локальные шрифты OFL из /fonts, остальные — системные.
export const FONT_STACKS={
  serif:'Georgia,serif',
  sans:'system-ui,sans-serif',
  mono:'monospace',
  hand:"'Caveat','Segoe Print',cursive",
  script:"'Pacifico','Caveat',cursive",
  round:"'Nunito',system-ui,sans-serif",
};
export const fontStack=font=>FONT_STACKS[Object.hasOwn(FONT_STACKS,font)?font:'serif'];
function elementHTML(e,selected){
  const n=(v,fallback=0)=>Number.isFinite(Number(v))?Math.max(-100000,Math.min(100000,Number(v))):fallback;
  const style=`left:${n(e.x)}px;top:${n(e.y)}px;width:${n(e.w,100)}px;height:${n(e.h,100)}px;transform:rotate(${n(e.rotate)}deg);opacity:${n(e.opacity,1)};`;
  let content='';
  if(e.type==='text')content=`<span class="text-content" style="font-size:${n(e.size,36)}px;color:${esc(e.color)};font-family:${fontStack(e.font)};text-align:${['left','right','center'].includes(e.align)?e.align:'center'}">${esc(e.text)}</span>`;
  if(e.type==='shape')content=`<span class="shape-content ${e.kind==='star'?'star':''}" style="color:${esc(e.color)}">${e.kind==='star'?'★':e.kind==='circle'?'●':e.kind==='square'?'■':'♥'}</span>`;
  if(e.type==='image')content=`<img draggable="false" alt="Загруженное изображение" data-ref="${esc(e.src)}" />`;
  if(e.type==='draw')content=`<svg width="100%" height="100%" viewBox="0 0 ${n(e.w,100)} ${n(e.h,100)}" preserveAspectRatio="none"><polyline fill="none" stroke="${esc(e.color)}" stroke-width="${n(e.size,5)}" stroke-linecap="round" stroke-linejoin="round" points="${Array.isArray(e.points)?e.points.slice(0,3000).filter(p=>Array.isArray(p)&&p.length===2).map(p=>`${n(p[0])},${n(p[1])}`).join(' '):''}" /></svg>`;
  return `<div class="object ${e.isBackground?'background-object':''} ${selected===e.id?'selected':''}" data-id="${esc(e.id)}" style="${style}">${content}${selected===e.id?'<span class="resize-knob" data-handle="resize"></span><span class="rotate-knob" data-handle="rotate">↻</span>':''}</div>`;
}
export function renderStage(host,p,selected=null){
  if(!host) return;
  host.style.width='800px';host.style.height=`${formats[p.format]}px`;host.style.background=p.bg;
  host.innerHTML=p.elements.map(e=>elementHTML(e,selected)).join('');
  host.querySelectorAll('img[data-ref]').forEach(async img=>{
    const ref=img.dataset.ref;
    try {const src=await mediaSource(ref);if(img.isConnected && img.dataset.ref===ref) img.src=src;} catch{img.alt='Не удалось загрузить изображение';}
  });
}
export function scaleStage(host,viewport,project,extra=1){
  if(!host || !viewport)return 1;
  const maxW=Math.max(100,viewport.clientWidth-32),maxH=Math.max(100,viewport.clientHeight-32);
  const scale=Math.min(maxW/800,maxH/formats[project.format])*extra;
  host.style.transform=`scale(${scale})`;
  const shell=host.parentElement;
  shell.style.width=`${800*scale}px`;shell.style.height=`${formats[project.format]*scale}px`;
  return scale;
}
