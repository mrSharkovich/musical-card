import {API_BASE} from './config.js';
import {uid} from './model.js';

const projectKey = id => `mc:project:${id}`;
const publicKey = id => `mc:card:${id}`;
const clone = obj => structuredClone(obj);

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
    if(API_BASE) return request('/api/projects','POST',{project});
    const editToken=uid();localStorage.setItem(projectKey(editToken),JSON.stringify(project));return {editToken};
  },
  async getProject(token){
    if(API_BASE) return request(`/api/projects/${encodeURIComponent(token)}`);
    const raw=localStorage.getItem(projectKey(token));if(!raw) throw Error('Проект не найден в этом браузере');
    return {project:JSON.parse(raw)};
  },
  async saveProject(token,project){
    if(API_BASE) return request(`/api/projects/${encodeURIComponent(token)}`,'PUT',{project});
    localStorage.setItem(projectKey(token),JSON.stringify(project));return {ok:true};
  },
  async upload(file){
    if(API_BASE){const data=new FormData();data.append('file',file);return request('/api/assets','POST',data);}
    return {url:await putBlob(file)};
  },
  async mediaUrl(src){
    if(!src) return '';
    if(!src.startsWith('local:')) return src;
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
  }
};
export const linkFor = (type,id) => `${location.origin}${location.pathname}#/${type}/${encodeURIComponent(id)}`;
