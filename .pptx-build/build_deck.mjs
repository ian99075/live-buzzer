import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, PresentationFile } from 'file:///C:/Users/Ian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const base = 'C:/Users/Ian/Desktop/NCU/實驗室/SE_TA';
const source = 'C:/Users/Ian/Desktop/NCU/實驗室/SE_TA - 複製/deliverables/即時線上搶答系統_學生實作需求_含評分標準.pptx';
const output = path.join(base, '.pptx-build', 'candidate.pptx');
const renderDir = path.join(base, '.pptx-build', 'updated');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(renderDir, { recursive: true });

const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const original = [...presentation.slides.items];

function edit(slide, before, after) {
  const hits = slide.shapes.items.filter(shape => shape.text?.toString() === before);
  if (hits.length !== 1) throw new Error(`Expected one text shape for ${JSON.stringify(before)}; found ${hits.length}`);
  hits[0].text.replace(before, after);
}
function notes(slide, value) { slide.speakerNotes.text = value; }

edit(original[1], '新增、編輯、刪除，逐題開始或停止', '建立單題或題組；逐題管理與開關');
edit(original[1], '將各題第一名寫入 Google Sheet', '將單題／小題第一名寫入 Google Sheet');

edit(original[2], '出題', '單題示意');
edit(original[2], '必做：登入驗證、選題號、輸入內容並新增。', '必做：教師登入後可建立單題或題組，填寫題目內容。');
notes(original[2], '教師須登入管理入口，能建立單題與題組。右側為單題建立介面的參考截圖；學生可自行設計題號產生與新增畫面，重點是題組及其小題的操作完整。');

edit(original[3], '題目建立後，由教師決定何時允許學生送出', '單題與題組中的各小題，由教師個別控制開放狀態');
edit(original[3], '只影響選取的題目；未開放題不能送出。', '只影響選取的題目或小題；未開放時不能送出。');

edit(original[4], '題目各自有開放狀態與回答清單', '單題及題組小題各自有開放狀態與回答清單');
edit(original[4], '必做：同時開放兩題時，學生能分別選題並送出回答。', '必做：同時開放多題／小題時，學生能分別選題回答。');

// Reuse the source slide's frame, typography, and border for the new grouped-case slide.
const grouped = original[8].duplicate();
grouped.moveTo(5);
edit(grouped, '教師端：彙整至 Google Sheet', '教師端：一個 Case 可包含多個小題');
edit(grouped, '寫入 Step 1 的 Sequence 欄位，從 C19 開始', '題組有標題；1-1、1-2 等小題各自搶答與記錄結果');
edit(grouped, 'Step 1 → Sequence', 'Case 1 → 題組');
edit(grouped, 'Case 1 → C19\nCase 2 → C20\nCase 3 → C21\nCase 4 → C22\nCase 5 → C23\nCase 6 → C24', '1-1：第一小題\n1-2：第二小題\n\n各小題可獨立開放，\n分別收集回答、\n判定各自的第一名');
edit(grouped, '每格只寫第一名的', '可在既有題組新增小題');
edit(grouped, '回答_學號', '單題亦可轉為題組');
const groupImage = grouped.images.items[0];
const oldFrame = groupImage.frame;
groupImage.replace({blob: await fs.readFile(path.join(base, '.pptx-build', 'group-shot-slide.png')), contentType:'image/png', alt:'教師端題組小題列表截圖節錄，顯示 1-1 與 1-2'});
groupImage.frame = oldFrame;
notes(grouped, '本頁左側為教師端題組小題列表的畫面節錄。Case 是題組標題與容器；每個小題各自開放、接收回答並判定第一名。教師可在現有題組新增小題，原有單題也可延伸為題組。畫面節錄只展示題組相關區域。');

edit(original[6], '先輸入回答，再按「搶答！」；同題只保留第一次有效送出', '先輸入回答，再按「搶答！」；各小題分別提交與鎖定');
edit(original[6], '學生只能知道「已送出」，不能看到自己是否第一名或目前名次。', '每個小題只保留首次有效送出；學生端不顯示第一名或名次。');

edit(original[7], '第一名要清楚標示，但後續學生的回答也要保留', '每個單題／小題標示第一名，也保留其他學生的回答');

edit(original[8], '寫入 Step 1 的 Sequence 欄位，從 C19 開始', 'Case 依列排列；同一題組的小題依序向右寫入');
edit(original[8], 'Case 1 → C19\nCase 2 → C20\nCase 3 → C21\nCase 4 → C22\nCase 5 → C23\nCase 6 → C24', 'Case 1-1 → C19\nCase 1-2 → D19\nCase 1-3 → E19\nCase 2 → C20\n…\nCase 7 → C25');
edit(original[8], '每格只寫第一名的', '每格只寫第一名；缺列才新增');
notes(original[8], '寫入既有 Google Sheet 的 Step 1 Sequence 區域。Case 1 位於第 19 列，其小題 1-1、1-2、1-3 分別寫入 C19、D19、E19；Case 2 往下一列 C20，依此類推。原有六列之外，首次輸出 Case 7 或後續 Case 時，確認對應 Case 列是否已存在，再決定是否插入新列。每格只有第一名的「回答_學號」；不處理其他欄位。');

edit(original[9], '同一學號同一題只保存第一次有效回答。', '同一學號在同一單題／小題只保存首次有效回答。');
edit(original[9], '依後端接受有效提交的順序判定；多題各自計算。', '依後端接受有效提交的順序判定；各小題分別計算。');
notes(original[9], '學生端僅提交回答；由後端統一接受、去重並為每個單題或小題判定唯一第一名。教師可看完整回答清單，學生不得得知名次或其他學生資料。');

edit(original[10], '用兩題與至少兩位模擬學生，證明各功能能一起運作', '用一個題組、兩個小題與至少兩位學生展示完整流程');
edit(original[10], '教師新增兩題', '教師建立 Case 1 題組');
edit(original[10], '只開放其中一題，學生只應看見可作答題。', '新增 1-1 與 1-2，先只開放 1-1。');
edit(original[10], '兩位學生送出', '兩位學生回答 1-1');
edit(original[10], '開放第二題', '再開放 1-2');
edit(original[10], '兩題分別收集回答，第一名各自判定。', '兩個小題各自收集回答，分別判定第一名。');
edit(original[10], '開啟雲端表格，核對每題 Sequence 的「回答_學號」。', '核對同列 C19、D19 各自的「回答_學號」。');

edit(original[11], '教師登入、題目管理與開關\n學生學號登入、等待與搶答\n教師看全部回答與每題第一名\n教師彙整結果至 Google Sheet', '教師登入、單題／題組管理與開關\n學生學號登入、等待與逐題搶答\n教師看全部回答與各小題第一名\n將各題結果彙整至 Google Sheet');
edit(original[11], '倒數計時、優先權與失格遞補屬後續擴充，不是本次基本功能。', '題組以 Case 為容器；小題各自搶答，結果依同列向右匯出。');
notes(original[11], '本頁界定學生期末專題的交付範圍：教師端、學生端、單題與題組小題、完整回答清單及各小題第一名、Google Sheet 輸出。參考畫面僅是介面示例，技術選擇與排版可自行設計。');

edit(original[12], 'DEMO 影片證明核心流程可執行，不能只展示畫面', 'DEMO 影片證明單題與題組流程可執行，不能只展示畫面');
edit(original[14], '影片需操作完整流程；保留測試結果與問題修正紀錄。', '影片需操作單題及題組流程；保留測試與修正紀錄。');

for (const [index, slide] of presentation.slides.items.entries()) {
  const footer = slide.shapes.items.filter(shape => /^\d{2}$/.test(shape.text?.toString() ?? '') && shape.position?.top > 650);
  if (footer.length !== 1) throw new Error(`Slide ${index + 1}: expected one page number, got ${footer.length}`);
  footer[0].text.replace(footer[0].text.toString(), String(index + 1).padStart(2,'0'));
}

const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(output);
const report = await presentation.inspect({ select:'$.slides[*]', include:['id','index','title','elements.text','notes.text'] });
await fs.writeFile(path.join(renderDir,'content.ndjson'), report.ndjson, 'utf8');
for (const [index, slide] of presentation.slides.items.entries()) {
  const png = await presentation.export({slide, format:'png', scale:1});
  await fs.writeFile(path.join(renderDir,`slide-${String(index+1).padStart(2,'0')}.png`), new Uint8Array(await png.arrayBuffer()));
}
console.log(JSON.stringify({output,slides:presentation.slides.items.length}));
