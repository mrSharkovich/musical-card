import {API_BASE} from './config.js';
import {uid} from './model.js';

const projectKey = id => `mc:project:${id}`;
const publicKey = id => `mc:card:${id}`;
const clone = obj => structuredClone(obj);

// Strict browser-to-server contract for both new and previously opened cards.
// Historical editor state can contain UI-only properties (e.g. isBackground:false
// on a shape). Remove only unknown property NAMES; FastAPI still validates all
// remaining values, media ownership and edit permissions. Never relax the API schema.
const PROJECT_FIELDS = new Set([
  'name', 'format', 'bg', 'elements', 'voice', 'music',
  'voiceVolume', 'musicVolume', 'updatedAt'
]);
const COMMON_FIELDS = ['id', 'type', 'x', 'y', 'w', 'h', 'rotate', 'opacity'];
const ELEMENT_FIELDS = Object.fromEntries(Object.entries({
  text: ['text', 'font', 'align', 'size', 'color'],
  shape: ['kind', 'color'],
  image: ['src', 'isBackground'],
  draw: ['points', 'color', 'size'],
}).map(([type, fields]) => [type, new Set([...COMMON_FIELDS, ...fields])]));
const AUDIO_FIELDS = new Set(['src', 'name', 'key']);

function allowedKeys(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([name]) => fields.has(name)));
}

export function projectForApi(project) {
  // Known element types are projected onto the exact server schema.
  // Unknown types are NOT converted to valid ones; the server rejects them.
  const result = allowedKeys(project, PROJECT_FIELDS);
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  if (Array.isArray(result.elements)) {
    result.elements = result.elements.map(element =>
      element && Object.hasOwn(ELEMENT_FIELDS, element.type)
        ? allowedKeys(element, ELEMENT_FIELDS[element.type])
        : element
    );
  }
  for (const field of ['voice', 'music']) {
    if (result[field] != null) result[field] = allowedKeys(result[field], AUDIO_FIELDS);
  }
  return result;
}

// The edit key stays in the editor fragment / request header, never in media URLs.
let activeEditToken = null;


async function request(path,method='GET',body) {
  const options = {method,headers:{}};
  if(body instanceof FormData) options.body=body;
  else if(body!==undefined) {options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
  const res=await fetch(`${API_BASE}${path}`,options);
  if(!res.ok) throw new Error((await res.text()).slice(0,200) || `Ошибка API ${res.status}`);
  return res.json();
}
function mediaDB(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open('musical-cards-media',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('blobs');
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);
  });
}
async function putBlob(blob){
  const id=uid(),db=await mediaDB();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').put(blob,id);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });db.close();return `local:${id}`;
}
async function readBlob(id){
  const db=await mediaDB();
  const value=await new Promise((resolve,reject)=>{
    const r=db.transaction('blobs').objectStore('blobs').get(id);
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });db.close();return value;
}
export const api={
  async create(project){
    const cleanProject=projectForApi(project);
    if(API_BASE) return request('/api/projects','POST',{project:cleanProject});
    const editToken=uid();localStorage.setItem(projectKey(editToken),JSON.stringify(cleanProject));return {editToken};
  },
  async getProject(token){
    if(API_BASE){activeEditToken=token;return request(`/api/projects/${encodeURIComponent(token)}`);}
    const raw=localStorage.getItem(projectKey(token));if(!raw) throw Error('Проект не найден в этом браузере');
    return {project:JSON.parse(raw)};
  },
  async saveProject(token,project){
    const cleanProject=projectForApi(project);
    if(API_BASE) return request(`/api/projects/${encodeURIComponent(token)}`,'PUT',{project:cleanProject});
    localStorage.setItem(projectKey(token),JSON.stringify(cleanProject));return {ok:true};
  },
  async deleteProject(token){
    if(API_BASE) return request(`/api/projects/${encodeURIComponent(token)}`,'DELETE');
    localStorage.removeItem(projectKey(token));return {ok:true};
  },
  async upload(file,editToken){
    if(API_BASE){activeEditToken=editToken;const data=new FormData();data.append('file',file);data.append('edit_token',editToken);return request('/api/assets','POST',data);}
    return {url:await putBlob(file)};
  },
  async mediaUrl(src){
    if(!src) return '';
    if(API_BASE && src.startsWith('/api/media/draft/')){
      if(!activeEditToken) throw Error('Сначала откройте секретную ссылку редактирования');
      const bare=src.split('?')[0];
      const response=await fetch(`${API_BASE}${bare}`, {headers:{'X-Edit-Token':activeEditToken}, cache:'no-store'});
      if(!response.ok) throw Error('Нет доступа к файлу черновика');
      return URL.createObjectURL(await response.blob());
    }
    if(!src.startsWith('local:')) return API_BASE && src.startsWith('/') ? `${API_BASE}${src}` : src;
    const blob=await readBlob(src.slice(6));
    if(!blob) throw Error('Медиафайл отсутствует в этом браузере');
    return URL.createObjectURL(blob);
  },
  async publish(token,opensAt){
    if(API_BASE) return request(`/api/projects/${encodeURIComponent(token)}/publish`,'POST',{opensAt});
    const {project}=await this.getProject(token);
    const publicId=uid();
    localStorage.setItem(publicKey(publicId),JSON.stringify({project:clone(project),opensAt}));
    return {publicId};
  },
  async getCard(id){
    if(API_BASE) return request(`/api/cards/${encodeURIComponent(id)}`);
    const raw=localStorage.getItem(publicKey(id));if(!raw) throw Error('Открытка не найдена в этом браузере');
    const data=JSON.parse(raw);
    if(data.opensAt && Date.now()<Date.parse(data.opensAt)) return {status:'scheduled',opensAt:data.opensAt};
    return {status:'ready',project:data.project};
  },
  async getCatalog(){
    const [templates,tracks,backgrounds,stickers]=await Promise.all([
      request('/api/catalog/templates'),request('/api/catalog/music'),
      request('/api/catalog/backgrounds'),request('/api/catalog/stickers')
    ]);
    return {templates:templates.templates,tracks:tracks.tracks,backgrounds:backgrounds.backgrounds,stickers:stickers.stickers};
  },
  async getTemplate(id,format){
    return request(`/api/catalog/templates/${encodeURIComponent(id)}?format=${encodeURIComponent(format)}`);
  }
};
export const linkFor = (type,id) => `${location.origin}${location.pathname}#/${type}/${encodeURIComponent(id)}`;
