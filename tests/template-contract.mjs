// Regression test for the browser-to-FastAPI project schema.
// Run from the project root: node tests/template-contract.mjs
import assert from 'node:assert/strict';
import {applyCatalogTemplate, newProject, formats} from '../src/model.js';

let checks=0;
for (const [format, height] of Object.entries(formats)) {
  const template = {
    bg:'#dff2e9',
    elements:[
      {id:'cheer-1',type:'shape',x:62,y:90,w:82,h:82,color:'#276d60',kind:'star'},
      {id:'cheer-2',type:'text',x:60,y:200,w:400,h:90,text:'Поздравляю!',font:'serif',size:40},
      {id:'cheer-3',type:'image',x:0,y:0,w:800,h:height,src:'/api/catalog/backgrounds/example/file'},
      {id:'cheer-4',type:'image',x:50,y:100,w:250,h:150,src:'/api/catalog/stickers/example/file'},
      {id:'cheer-5',type:'draw',x:40,y:50,w:90,h:90,points:[[0,0],[10,10]]}
    ]
  };
  const project=newProject('Проверка',format,'blank');
  const source=structuredClone(template);
  applyCatalogTemplate(project,template);
  assert.deepEqual(template,source,'must not mutate catalog template');
  for(const item of project.elements){
    if(item.type!=='image') assert.equal(Object.hasOwn(item,'isBackground'),false,`${item.type} must not have isBackground`);
  }
  assert.equal(project.elements[2].isBackground,true);
  assert.equal(Object.hasOwn(project.elements[3],'isBackground'),false);
  checks+=5;
}
console.log(`OK: ${checks} checks across all canvas formats`);
