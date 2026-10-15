import {FileBlob,PresentationFile} from 'file:///C:/Users/Ian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const p=await PresentationFile.importPptx(await FileBlob.load('C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/deliverables/即時線上搶答系統_學生實作需求_含題組_評分標準.pptx'));
const s=p.slides.items[9];
for(const [name,obj] of [['slide',s],['shapes',s.shapes],['shape',s.shapes.items[0]],['image',s.images.items[0]],['images',s.images]]) console.log(name,Object.getOwnPropertyNames(Object.getPrototypeOf(obj)));
console.log('shape props',s.shapes.items.map(x=>({id:x.id,text:x.text?.toString(),position:x.position.toJSON?.()})));
for(const id of ['6','7','8','9']) {const x=s.shapes.items.find(x=>x.id===id); console.log('style',id,x.text.style);}
