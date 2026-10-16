export const formats = {'4:5':1000, '1:1':800, '9:16':1422, '16:9':450};
let fallbackIdCounter = 0;
export const uid = () => {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();

  const values = new Uint32Array(4);
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(values);
    return `local-${Array.from(values, value => value.toString(36)).join('-')}`;
  }

  fallbackIdCounter += 1;
  return `local-${Date.now().toString(36)}-${fallbackIdCounter}-${Math.random().toString(36).slice(2)}`;
};
export const esc = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
export const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
const text = (label,x,y,w,size,color='#603d73') => ({id:uid(),type:'text',text:label,x,y,w,h:size*2.0,size,color,rotate:0,font:'serif'});
const shape = (x,y,w,h,color,kind='heart') => ({id:uid(),type:'shape',x,y,w,h,color,kind,rotate:0});
export function newProject(name='Моя открытка',format='4:5',template='bloom') {
  const p = {name,format,bg:'#fce8f2',elements:[],voice:null,music:null,voiceVolume:1,musicVolume:.35,updatedAt:new Date().toISOString()};
  return applyTemplate(p,template);
}
export function applyTemplate(p,theme) {
  const h=formats[p.format];
  const style = {
    bloom:{bg:'#fce8f2',title:'С Днём рождения!',subtitle:'Пусть каждый день будет счастливым',color:'#87446b',orn:'heart'},
    love:{bg:'#ffe8da',title:'С любовью ♡',subtitle:'Ты делаешь этот мир прекраснее',color:'#9b544c',orn:'heart'},
    cheer:{bg:'#dff2e9',title:'Поздравляю!',subtitle:'Пусть мечты сбываются',color:'#276d60',orn:'star'}
  }[theme] || {bg:'#ffffff'};
  p.bg=style.bg;
  p.elements=[];
  if(theme==='blank') return p;
  p.elements=[
    shape(62,h*.09,82,82,style.color,style.orn),
    shape(640,h*.10,72,72,style.color,style.orn),
    text(style.title,88,h*.26,625,58,style.color),
    text(style.subtitle,140,h*.64,520,30,style.color),
    shape(357,h*.77,70,70,style.color,style.orn)
  ];
  return p;
}
export let templates = [
  {id:'blank',name:'Пустой холст',bg:'#ffffff',decoration:'+'},
  {id:'bloom',name:'Цветочное настроение',bg:'#fce8f2',decoration:'♡'},
  {id:'love',name:'С любовью',bg:'#ffe8da',decoration:'♡'},
  {id:'cheer',name:'Поздравление',bg:'#dff2e9',decoration:'★'}
];
export let melodies = [
  {id:'gentle',name:'Нежная мелодия',notes:[523,659,784,659,587,698,880,698]},
  {id:'festive',name:'Праздничная',notes:[392,494,587,784,698,587,494,523]},
  {id:'dream',name:'Мечта',notes:[440,523,659,523,392,494,587,494]}
];
export let backgrounds = [];
export let stickers = [];

export function setCatalog(catalog) {
  if(catalog.templates?.length) templates=catalog.templates;
  if(catalog.tracks?.length) melodies=catalog.tracks;
  backgrounds=catalog.backgrounds||[];
  stickers=catalog.stickers||[];
}

export function applyCatalogTemplate(project,template) {
  project.bg=template.bg;
  project.elements=structuredClone(template.elements||[]).map(element=>({
    ...element,
    isBackground: element.type==='image' && element.x===0 && element.y===0 && element.w===800
  }));
  project.music=template.defaultMusic||null;
  return project;
}
