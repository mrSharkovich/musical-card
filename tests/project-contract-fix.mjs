// Regression: UI-only/legacy fields must never reach the strict backend schema.
// Run from the project root: node tests/project-contract-fix.mjs
import assert from 'node:assert/strict';

globalThis.window = {location:{origin:'http://192.168.1.102:8001'}};
const requests = [];
globalThis.fetch = async (url, options) => {
  requests.push({url, options});
  return {ok:true, json:async()=> url.endsWith('/api/projects') ? {editToken:'test-edit-token'}:{ok:true}};
};
const {api, projectForApi} = await import('../src/api.js');
const shape = {id:'bloom-1',type:'shape',x:62,y:90,w:82,h:82,
  color:'#87446b',kind:'heart',rotate:0,isBackground:false,selected:true,clientPreview:'x'};
const image = {id:'image-1',type:'image',x:0,y:0,w:800,h:1000,
  src:'/api/catalog/backgrounds/example/file',isBackground:true};
const draw = {id:'draw-1',type:'draw',x:1,y:2,w:100,h:40,
  points:[[0,0],[1,1]],size:5,color:'#112233',rotate:0};
const original = {name:'Проверка',format:'4:5',bg:'#ffffff',
  elements:[shape,image,draw],music:{key:'gentle',name:'Мелодия',extra:'ui-only'},
  voice:null,voiceVolume:1,musicVolume:.35,updatedAt:new Date().toISOString(),localState:42};
const preserved = structuredClone(original);
const sanitized = projectForApi(original);
assert.deepEqual(original,preserved,'source must never be mutated');
assert.equal(Object.hasOwn(sanitized,'localState'),false);
for (const name of ['isBackground','selected','clientPreview']) {
  assert.equal(Object.hasOwn(sanitized.elements[0],name),false,`${name} must be removed from shapes`);
}
assert.equal(sanitized.elements[0].kind,'heart');
assert.equal(sanitized.elements[1].isBackground,true,'image flag must survive');
assert.deepEqual(sanitized.elements[2].points,draw.points,'drawing must survive');
assert.deepEqual(sanitized.music,{key:'gentle',name:'Мелодия'});
await api.create(original);
await api.saveProject('test-edit-token',original);
assert.equal(requests.length,2);
for (const {options} of requests) {
  const sent=JSON.parse(options.body).project;
  assert.deepEqual(sent,sanitized,'create and save must both strip legacy fields');
}
assert.equal(requests[0].options.method,'POST');
assert.equal(requests[1].options.method,'PUT');
console.log('OK: legacy shapes, saved projects, images, drawing, audio, create/save');
