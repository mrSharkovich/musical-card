import {esc} from './model.js';
export const $=(s,root=document)=>root.querySelector(s);
export const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
export function toast(message){
  const el=$('#toast');el.textContent=message;el.classList.add('show');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3300);
}
export function modal(title,html){
  document.querySelector('#dialog-overlay')?.remove();
  const node=document.createElement('div');node.id='dialog-overlay';node.className='dialog-overlay';
  node.innerHTML=`<section class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="icon-button" data-close aria-label="Закрыть">×</button></header><div class="dialog-body">${html}</div></section>`;
  document.body.append(node);
  node.addEventListener('click',e=>{if(e.target===node || e.target.closest('[data-close]'))node.remove();});
  document.addEventListener('keydown',function close(e){if(e.key==='Escape'){node.remove();document.removeEventListener('keydown',close);}});
  return node;
}
export async function copy(text){
  try{await navigator.clipboard.writeText(text);toast('Ссылка скопирована');}
  catch{modal('Скопируйте ссылку',`<input value="${esc(text)}" readonly onclick="this.select()" />`);}
}
export const button=(label,action='',kind='')=>`<button class="btn ${kind}" ${action?`data-action="${action}"`:''}>${esc(label)}</button>`;
