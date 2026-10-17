import {esc} from './model.js';
import {icon} from './icons.js';
export const $=(s,root=document)=>root.querySelector(s);
export const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
export function toast(message){
  const el=$('#toast');el.textContent=message;el.classList.add('show');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3300);
}
export function modal(title,html,{onClose}={}){
  const existing=document.querySelector('#dialog-overlay');
  if(existing){if(typeof existing.close==='function')existing.close();else existing.remove();}
  const node=document.createElement('div');node.id='dialog-overlay';node.className='dialog-overlay';
  node.innerHTML=`<section class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon('close',18)}</button></header><div class="dialog-body">${html}</div></section>`;
  const previous=document.activeElement;
  document.body.append(node);
  let closed=false;
  const close=()=>{
    if(closed)return;closed=true;
    node.remove();document.removeEventListener('keydown',onKey);
    try{onClose?.();}finally{if(previous?.isConnected)previous.focus?.();}
  };
  function onKey(e){if(e.key==='Escape')close();}
  node.addEventListener('click',e=>{if(e.target===node || e.target.closest('[data-close]'))close();});
  document.addEventListener('keydown',onKey);
  node.querySelector('[data-close]')?.focus();
  node.close=close;
  return node;
}
export async function copy(text){
  try{await navigator.clipboard.writeText(text);toast('Ссылка скопирована');}
  catch{
    const m=modal('Скопируйте ссылку',`<input value="${esc(text)}" readonly aria-label="Ссылка" />`);
    const input=m.querySelector('input');input.addEventListener('focus',()=>input.select());input.focus();
  }
}
export async function shareLink({title='Музыкальная открытка',text='',url}){
  if(typeof navigator.share==='function'){
    try{await navigator.share({title,text,url});return;}
    catch(error){if(error?.name==='AbortError')return;}
  }
  const chooser=modal('Отправить ссылку',`<p>Выберите, куда отправить открытку.</p><div class="menu-list">
    <button type="button" class="btn light" data-share-via="telegram">Telegram</button>
    <button type="button" class="btn light" data-share-via="whatsapp">WhatsApp</button>
    <button type="button" class="btn light" data-share-via="vk">ВКонтакте</button>
    <button type="button" class="btn primary" data-share-via="copy">Скопировать ссылку</button>
  </div>`);
  chooser.addEventListener('click',async event=>{
    const via=event.target.closest('[data-share-via]')?.dataset.shareVia;
    if(!via)return;
    if(via==='copy'){chooser.close();await copy(url);return;}
    const message=text?`${text}\n${url}`:url;
    const targets={
      telegram:`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      whatsapp:`https://wa.me/?text=${encodeURIComponent(message)}`,
      vk:`https://vk.com/share.php?url=${encodeURIComponent(url)}`,
    };
    chooser.close();
    window.open(targets[via],'_blank','noopener,noreferrer');
  });
}
export const button=(label,action='',kind='')=>`<button class="btn ${kind}" ${action?`data-action="${action}"`:''}>${esc(label)}</button>`;

/** Цвет из каталога или проекта допускается только в виде #RRGGBB (защита от CSS-инъекций). */
export const safeColor=(value,fallback='#FFFFFF')=>/^#[0-9a-fA-F]{6}$/.test(String(value??''))?value:fallback;

/** Цвет подписи поверх фона: фирменные чернила, если контраст ≥ 4.5 : 1 (WCAG AA), иначе чёрный или белый. */
const luminance=hex=>{
  const c=safeColor(hex,'#FFFFFF').slice(1);
  const ch=[0,2,4].map(i=>{const v=parseInt(c.slice(i,i+2),16)/255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});
  return .2126*ch[0]+.7152*ch[1]+.0722*ch[2];
};
export const contrastRatio=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05);};
export function inkFor(hex){
  const bg=safeColor(hex,'#FFFFFF');
  const preferred=luminance(bg)>.23?['#1F2A44','#FFFDF7']:['#FFFDF7','#1F2A44'];
  const pass=preferred.find(ink=>contrastRatio(bg,ink)>=4.5);
  if(pass)return pass;
  return contrastRatio(bg,'#000000')>=contrastRatio(bg,'#FFFFFF')?'#000000':'#FFFFFF';
}
