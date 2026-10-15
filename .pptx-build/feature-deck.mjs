import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Presentation, PresentationFile } from 'file:///C:/Users/Ian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const require=createRequire(import.meta.url);
const sharp=require('C:/Users/Ian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const root = path.resolve('.');
const shots = path.join(root, '.pptx-build', 'feature-shots');
const build = path.join(root, '.pptx-build', 'feature-deck');
await fs.mkdir(build, { recursive: true });
const crops={
  '03-create-single-dialog':{left:380,top:140,width:680,height:700},
  '04-create-group-dialog':{left:380,top:70,width:680,height:820},
  '05-group-overview':{left:355,top:300,width:1050,height:580},
  '06a-edit-single':{left:355,top:300,width:1050,height:580},
  '06b-convert-single':{left:355,top:300,width:1050,height:580},
  '12-teacher-live-answers':{left:355,top:300,width:1050,height:580},
  '13-teacher-paused':{left:355,top:300,width:1050,height:580},
  '14a-disqualified-replacement':{left:355,top:300,width:1050,height:580},
  '15-export-preview':{left:480,top:235,width:490,height:465},
};
for(const [name,box] of Object.entries(crops)) await sharp(path.join(shots,name+'.png')).extract(box).png().toFile(path.join(build,name+'.png'));
const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const font = 'Microsoft JhengHei';
const ink = '#123F38', secondary = '#45645D', cream = '#F7F5EF', gold = '#E6AB42';
const addText = (slide, value, x, y, w, h, size, color=ink, bold=false) => {
  const s = slide.shapes.add({ geometry:'textbox', position:{left:x,top:y,width:w,height:h}, fill:'none', line:{fill:'none',width:0} });
  s.text = value;
  s.text.style = { fontFamily:font, fontSize:size, color, bold, verticalAlignment:'middle', wrap:true };
  return s;
};
const addImage = async (slide, file, box) => {
  const buf = await fs.readFile(path.join(crops[file]?build:shots,file+'.png'));
  slide.images.add({ blob:buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength), contentType:'image/png', alt:`本機測試預覽畫面：${file}`, fit:'contain', position:box });
};
function base(title, n, section='功能介紹') {
  const slide = deck.slides.add(); slide.background.fill = cream;
  addText(slide,title,52,34,1130,67,37,ink,true);
  addText(slide,section,53,680,200,22,14,secondary,false);
  addText(slide,String(n).padStart(2,'0'),1177,678,50,24,14,secondary,false);
  return slide;
}
async function feature({title,image,body,notes,layout='wide',section}) {
  const n=deck.slides.items.length+1, s=base(title,n,section);
  if (layout==='wide') {
    await addImage(s,image,{left:42,top:120,width:840,height:526});
    addText(s,body,904,142,315,470,22,ink,false);
  } else if (layout==='mobile') {
    await addImage(s,image,{left:70,top:115,width:360,height:550});
    addText(s,body,495,150,675,435,28,ink,false);
  } else if (layout==='modal') {
    await addImage(s,image,{left:70,top:115,width:510,height:545});
    addText(s,body,640,155,545,440,27,ink,false);
  }
  s.speakerNotes.text = notes;
  return s;
}

{
  const s=deck.slides.add(); s.background.fill=ink;
  addText(s,'課堂即時搶答系統',78,187,1100,100,59,'#FFFFFF',true);
  addText(s,'完整功能與實際操作畫面',82,309,1080,60,30,'#F2D39A');
  addText(s,'教師端、學生端、即時裁決與 Google Sheet 彙整',82,403,1080,76,25,'#FFFFFF');
  addText(s,'本機測試預覽截圖｜2026 年 10 月',82,628,870,35,18,'#D4E4DD');
  s.speakerNotes.text='本簡報依據目前專案程式與本機測試預覽的實際操作畫面。測試預覽的 Google Sheet 匯出由模擬服務處理，未連線真實 Google。';
}
await feature({title:'教師登入與角色入口',image:'01-teacher-login',body:'教師以帳號密碼登入控制台。\n\n學生使用獨立頁面，以完整學號進入。\n\n兩種角色的畫面與即時資料分開。',notes:'教師帳密由 .env 設定；學生自填學號。教師與學生使用不同 cookie。教師可登出目前工作階段。'});
await feature({title:'控制台與 Case 導覽',image:'06-case-library',body:'左側分開建立題目與管理既有 Case。\n\n題組可展開小題；上方顯示 Case、開放題數與回答數。\n\n可切換舒適或精簡間距，也可收合題目欄。',notes:'畫面有題目清單、題組層級和課堂摘要。題組、單題皆由伺服器分配連續 Case 編號。'});
await feature({title:'建立單題',image:'03-create-single-dialog',body:'教師輸入題目內容，設定 1 至 3600 秒的搶答時間。\n\n新增後先維持草稿狀態，由教師決定何時開始。',notes:'單題建立的畫面截圖。預設搶答時間為 60 秒，Case 編號由伺服器分配。',layout:'modal'});
await feature({title:'建立題組與小題',image:'04-create-group-dialog',body:'一個 Case 可包含多個小題。\n\n教師設定大題標題，並為每個小題輸入內容與倒數秒數。\n\n各小題獨立開放和結算。',notes:'題組至少包含一個小題。每個小題都保有自己的狀態、倒數、回答和得標者。',layout:'modal'});
await feature({title:'題組管理',image:'05-group-overview',body:'點入題組可查看小題列表與各題狀態。\n\n可追加小題、修改題組標題或刪除整組。\n\n刪除後，後續編號會連續遞補。',notes:'刪題不改變其他題目的穩定 ID、已進行的倒數或回答。題組小題按 1-1、1-2 等編號呈現。'});
await feature({title:'編輯題目與延伸題組',image:'06a-edit-single',body:'草稿題目可修改內容及倒數時間。\n\n既有單題也可轉為題組，原題成為第一小題；已收的回答與倒數狀態保留。',notes:'畫面為編輯單題。轉題組保留原題 ID、倒數、回答和提交狀態。教師也可刪除題目，刪除的回答無法復原。'});
await feature({title:'單題轉為題組',image:'06b-convert-single',body:'教師為既有單題填入題組標題。\n\n原題成為 1-1，題目 ID、倒數與已收回答維持原狀；之後可再追加小題。',notes:'此畫面顯示轉為題組的輸入區。轉換不會重新開放或重置原題。'});
await feature({title:'學生以學號加入課堂',image:'08-student-waiting',body:'學生輸入完整學號，前導零保留。\n\n尚無開放題目時，頁面顯示等待狀態；題目開放後即時出現。',notes:'學生登入不驗證學籍身分。切換學號可在同一分頁依序測試；不同學生同時測試應使用獨立瀏覽器設定檔或裝置。',layout:'mobile'});
await feature({title:'多題同步作答',image:'09-student-open',body:'教師可同時開放多個單題或小題。\n\n學生逐題看到內容與剩餘時間，各題有自己的回答欄和提交狀態。',notes:'學生只接收開放或暫停題目、倒數，以及自己的提交狀態。學生看不到名次、第一名、其他學號或其他人的答案。',layout:'mobile'});
await feature({title:'送出前再次確認',image:'10-student-confirm',body:'學生先填答案，按「搶答！」後會出現確認視窗。\n\n取消不送出；按「確認送出」才提交。倒數在確認時繼續。',notes:'確認前若題目已暫停或到期，視窗會關閉且不發送。網路失敗可重試同一份凍結答案。',layout:'mobile'});
await feature({title:'每題僅保存首次有效回答',image:'11-student-submitted',body:'送出後，學生只會看到自己的提交狀態。\n\n同一學號在同一題不能用重送或重新登入覆寫首次有效回答。',notes:'伺服器對相同學號和相同題目去重。HTTP 202 received=true 只表示請求送達，不透露裁決結果。',layout:'mobile'});
await feature({title:'教師即時查看全部回答',image:'12-teacher-live-answers',body:'教師看到每位學生的回答與順位。\n\n先比其他已結算題目的有效得標次數，少者優先；相同時比伺服器接受順序。\n\n開放中只顯示目前第一名。',notes:'其他題目結算或失格時，開放題順位會立即更新。結算後才固定得標者。'});
await feature({title:'暫停、繼續與提早結算',image:'13-teacher-paused',body:'暫停保留剩餘時間與學生草稿。\n\n繼續後接著倒數；到零或提早結算會固定候選順位。\n\n結算後不可重新開放。',notes:'各題控制互不影響。暫停題目不接受新回答；倒數以伺服器狀態裁決。'});
await feature({title:'失格與候補遞補',image:'14a-disqualified-replacement',body:'教師可取消亂答者資格。\n\n若失格者原本是第一名，下一位有效回答自動遞補；失格者在同題不能重送。',notes:'此畫面先讓兩位學生回答並結算，隨後將原第一名取消資格，由後位有效回答遞補。'});
await feature({title:'Google Sheet 匯出預覽',image:'15-export-preview',body:'教師先檢查後端產生的每格預覽，再確認匯出。\n\n每格格式為「回答_學號」；題組小題在同一 Case 列向右排列。',notes:'本畫面使用測試預覽，匯出由模擬服務處理，沒有連線真實 Google Sheet。正式模式使用 Google Sheets API；Case 1 的 1-1 為 C19、1-2 為 D19，Case 2 為 C20。',layout:'modal'});
await feature({title:'匯出結果與更新規則',image:'16-export-result',body:'只匯出已結算題目的有效第一名。\n\n先前已匯出的舊座標，可在下次匯出時覆寫或清空。匯出期間教師修改暫時鎖定。',notes:'測試預覽模擬匯出，不寫入 Google。正式匯出依目前 Case 編號對應 Sequence。Case 7 之後必要時插列；從未匯出的空題不動。'});
{
  const s=base('使用範圍與資料保存',deck.slides.items.length+1,'運作說明');
  addText(s,'即時課堂',65,147,320,60,30,ink,true);
  addText(s,'單一 Node.js 程序處理倒數、去重、順位及即時事件。多個題目可同時進行。',65,222,330,210,24,ink);
  addText(s,'資料保存',455,147,320,60,30,ink,true);
  addText(s,'題目、回答和登入只存在記憶體。服務重啟後清空；已寫入 Google Sheet 的內容不受影響。',455,222,330,210,24,ink);
  addText(s,'角色與隱私',845,147,320,60,30,ink,true);
  addText(s,'教師看全部回答與順位；學生只看自己的狀態。學號由學生自填，目前不驗證真實身分。',845,222,330,210,24,ink);
  addText(s,'本簡報的匯出畫面為模擬服務，真實 Google Sheet 題組結構仍需另外驗收。',65,565,1130,60,22,secondary);
  s.speakerNotes.text='課堂狀態只保留於單一 Node.js 程序記憶體。Google Sheet 匯出需要正式服務帳號與憑證。測試預覽不寫入 Google。';
}

const candidate=path.join(build,'candidate.pptx');
await (await PresentationFile.exportPptx(deck)).save(candidate);
for (let i=0;i<deck.slides.items.length;i++) {
  const png=await deck.export({slide:deck.slides.items[i],format:'png',scale:1});
  await fs.writeFile(path.join(build,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
}
console.log(JSON.stringify({candidate,slides:deck.slides.items.length}));
