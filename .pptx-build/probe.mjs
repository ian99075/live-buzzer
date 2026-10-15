import { FileBlob, PresentationFile } from 'file:///C:/Users/Ian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const source = 'C:/Users/Ian/Desktop/NCU/實驗室/SE_TA - 複製/deliverables/即時線上搶答系統_學生實作需求_含評分標準.pptx';
const p = await PresentationFile.importPptx(await FileBlob.load(source));
for (const index of [2,4,8,11]) {
 const s=p.slides.items[index];
 console.log('SLIDE',index+1,'images',s.images.items.map(x=>({id:x.id,frame:x.frame,fit:x.fit,crop:x.crop}))); 
 console.log('shapes',s.shapes.items.filter(x=>x.text?.toString?.()).map(x=>({id:x.id,text:x.text.toString(),position:x.position})).slice(-4));
}
console.log('methods',Object.getOwnPropertyNames(Object.getPrototypeOf(p.slides.items[8])).filter(x=>/dup|move/.test(x)));
