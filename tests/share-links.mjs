// UI-контракт: единственный адрес для отправки, отдельный секретный ключ автора.
import assert from 'node:assert/strict';
import {renderPublishedLinks,renderAuthorKeyPanel,attachAuthorKeyPanel} from '../src/shareLinks.js';
import {toast} from '../src/ui.js';

const pub='http://192.168.1.103:8001/#/card/public-0001';
const edit='http://192.168.1.103:8001/#/edit/secret-token-0001';
const pubHtml=renderPublishedLinks(pub,'public-0001');
const keyHtml=renderAuthorKeyPanel();
assert.match(pubHtml, /Для получателя/);
assert.match(pubHtml, /id="share-public"/);
assert.match(pubHtml, /id="copy-public"/);
assert.match(pubHtml, /#\/card\/public-0001/);
assert.ok(!pubHtml.includes(edit) && !pubHtml.includes('secret-token-0001'), 'публичный блок не содержит секрет');
assert.match(keyHtml, /<details[^>]*data-author-key/);
assert.ok(!keyHtml.includes(' open>'), 'секретный блок свёрнут');
assert.ok(!keyHtml.includes(edit), 'секрет отсутствует в исходной HTML-разметке');
assert.match(keyHtml, /data-key-value/);
assert.match(keyHtml, /data-key-toggle/);
assert.match(keyHtml, /data-key-copy/);
assert.ok(renderAuthorKeyPanel({expanded:true}).includes(' open>'));

// Проверка клика раскрыть/скрыть и успешного копирования через Clipboard API.
function element(extra={}){
  const handlers={};const attrs={};
  return {textContent:'',value:'',hidden:true,open:false,...extra,
    addEventListener:(type,fn)=>{handlers[type]=fn;},
    setAttribute:(key,value)=>{attrs[key]=value;},
    getAttribute:key=>attrs[key],
    fire:async(type)=>handlers[type]?.(),
  };
}
const input=element(),toggle=element(),saved=element(),copy=element();
const els={'[data-key-value]':input,'[data-key-toggle]':toggle,'[data-key-saved]':saved,'[data-key-copy]':copy};
const host=element({querySelector:sel=>els[sel]});
let savedCount=0,copied='';
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>{copied=text;}}}});
const toastNode={textContent:'',classList:{add(){},remove(){}}};
globalThis.document={querySelector:selector=>selector==='#toast'?toastNode:null};
attachAuthorKeyPanel(host,edit,{onSaved:()=>{savedCount++;}});
await toggle.fire('click');
assert.equal(input.value,edit);
assert.equal(toggle.textContent,'Скрыть');
await toggle.fire('click');
assert.equal(input.value,'');
assert.equal(toggle.textContent,'Показать');
await toggle.fire('click');
await host.fire('toggle'); // закрытие секции очищает значение
assert.equal(input.value,'');
assert.equal(toggle.getAttribute('aria-pressed'),'false');
await copy.fire('click');
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(copied,edit, 'копируется секретный адрес, а не публичный');
assert.equal(savedCount,1);
assert.equal(saved.hidden,false);
clearTimeout(toast.timer);
console.log('OK: публичная ссылка отдельно, секрет скрыт, показ/скрытие и копирование');
