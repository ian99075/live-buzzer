// 獨立互動預覽：只使用此頁面內的合成資料，不呼叫正式 API。
const cases = [
  { number: 1, title: '邊界條件與序列測試', parts: [
    { number: 1, content: '請設計空序列的測試案例，並說明預期結果。', status: 'open', seconds: 42, answers: [{ id: 'TEST001', text: '輸入 []，預期回傳空結果且不發生例外。', wins: 0 }, { id: 'TEST002', text: '測試零個元素，驗證程式不讀取第一項。', wins: 1 }, { id: 'TEST003', text: '空陣列應直接結束，沒有任何元素可比較。', wins: 2 }] },
    { number: 2, content: '只有一個元素時，你會如何設計測試？', status: 'open', seconds: 55, answers: [{ id: 'TEST004', text: '輸入 [7]，預期輸出仍為 [7]。', wins: 0 }, { id: 'TEST005', text: '輸入 [0]，確認單一元素不被略過。', wins: 1 }] },
    { number: 3, content: '請舉出包含重複元素的序列。', status: 'draft', seconds: 60, answers: [] }
  ]},
  { number: 2, title: '逆序輸入會如何影響結果？', status: 'settled', seconds: 60, answers: [{ id: 'TEST006', text: '用 [3, 2, 1] 驗證逆序輸入的處理。', wins: 0 }, { id: 'TEST007', text: '輸入 [9, 5, 2]，與正序案例比較。', wins: 1 }] },
  { number: 7, title: '請補充一個你認為重要的測試。', status: 'draft', seconds: 60, answers: [] }
];
const $ = selector => document.querySelector(selector);
const state = { view: 'all', caseNumber: null, partNumber: null, expanded: new Set() };
const statusText = { open: '搶答中', paused: '已暫停', settled: '已結算', draft: '尚未開放' };
let noticeTimer;
let addingToCase = null;
function el(tag, className = '', value = '') { const node = document.createElement(tag); node.className = className; node.textContent = value; return node; }
function button(value, className, onClick) { const node = el('button', className, value); node.type = 'button'; node.onclick = onClick; return node; }
function tell(value) { const node = $('#notice'); node.textContent = value; node.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { node.hidden = true; }, 3500); }
function isGroup(item) { return Array.isArray(item.parts); }
function allParts(item) { return isGroup(item) ? item.parts : [item]; }
function navigate(view, caseNumber = null, partNumber = null) { state.view = view; state.caseNumber = caseNumber; state.partNumber = partNumber; if (view === 'group') state.expanded.add(caseNumber); render(); }
function currentCase() { return cases.find(item => item.number === state.caseNumber); }
function currentPart() { const item = currentCase(); return isGroup(item) ? item.parts.find(part => part.number === state.partNumber) : item; }
function caseName(item) { return `CASE ${item.number}`; }
function status(part) { return el('span', `status ${part.status}`, statusText[part.status]); }
function nav() {
  const root = $('#case-nav'); root.replaceChildren();
  const all = button('全部 Case', 'nav-all', () => navigate('all')); all.setAttribute('aria-current', String(state.view === 'all')); root.append(all);
  for (const item of cases) {
    if (isGroup(item)) {
      const folder = button('', 'case-folder', () => {
        if (state.view === 'group' && state.caseNumber === item.number) state.expanded.has(item.number) ? state.expanded.delete(item.number) : state.expanded.add(item.number);
        else state.expanded.add(item.number);
        state.view = 'group'; state.caseNumber = item.number; state.partNumber = null; render();
      });
      folder.setAttribute('aria-expanded', String(state.expanded.has(item.number)));
      folder.setAttribute('aria-current', String(state.view === 'group' && state.caseNumber === item.number));
      const row = el('span', 'folder-main'); row.append(el('span', 'folder-icon', '▣'));
      const copy = el('span', 'folder-copy'); copy.append(el('strong', '', caseName(item)), el('small', '', item.title));
      row.append(copy, el('span', 'folder-chevron', state.expanded.has(item.number) ? '⌄' : '›'));
      folder.append(row, el('span', 'case-metadata', `題組 · ${item.parts.length} 小題`)); root.append(folder);
      if (state.expanded.has(item.number)) {
        const children = el('div', 'part-links');
        for (const part of item.parts) {
          const child = button('', 'part-link', () => navigate('part', item.number, part.number));
          child.setAttribute('aria-current', String(state.view === 'part' && state.caseNumber === item.number && state.partNumber === part.number));
          child.append(el('span', 'part-number', `${item.number}-${part.number}`), el('span', '', part.content)); children.append(child);
        }
        root.append(children);
      }
    } else {
      const single = button('', 'single-case', () => navigate('single', item.number));
      single.setAttribute('aria-current', String(state.view === 'single' && state.caseNumber === item.number));
      const row = el('span', 'folder-main'); row.append(el('span', 'folder-icon', '▤'));
      const copy = el('span', 'folder-copy'); copy.append(el('strong', '', caseName(item)), el('small', '', item.title));
      row.append(copy); single.append(row, el('span', 'case-metadata', `單題 · ${statusText[item.status]}`)); root.append(single);
    }
  }
}
function shell(className) { const node = el('article', `panel ${className}`); $('#main-view').replaceChildren(node); return node; }
function breadcrumb(root, nodes) { const line = el('div', 'breadcrumb'); line.append(button('全部 Case', '', () => navigate('all'))); for (const node of nodes) { line.append(el('span', '', '/')); if (node.onClick) line.append(button(node.label, '', node.onClick)); else line.append(el('span', '', node.label)); } root.append(line); }
function groupView(item) {
  const root = shell('group-view'); breadcrumb(root, [{ label: caseName(item) }]);
  const header = el('div', 'group-header'), copy = el('div'); copy.append(el('span', 'case-label', `${caseName(item)} · 大題 / 題組`), el('h2', '', item.title), el('p', '', `${item.parts.length} 個小題 · 每個小題獨立搶答、倒數與結算`));
  const tools = el('div', 'group-tools');
  tools.append(button('＋ 新增小題', 'primary', () => { addingToCase = item.number; $('#part-dialog-context').textContent = `${caseName(item)} · ${item.title}，下一題將編為 ${item.number}-${Math.max(...item.parts.map(part => part.number)) + 1}。`; $('#part-dialog').showModal(); $('#new-part-content').focus(); }), button('改題組標題', 'quiet', () => { const value = window.prompt('預覽：修改大題標題', item.title)?.trim(); if (value) { item.title = value; render(); } }), button('刪除整組', 'quiet danger', () => tell('「刪除整組」只位於大題層級；預覽不執行刪除。')));
  header.append(copy, tools); root.append(header, el('div', 'heavy-divider'));
  const section = el('div', 'subsection-head'); section.append(el('h3', '', '小題列表'), el('span', '', '點選小題，查看回答與單題操作')); root.append(section);
  const grid = el('div', 'part-grid');
  for (const part of item.parts) {
    const card = el('article', 'part-card'), top = el('div', 'part-card-top'); top.append(el('span', 'case-label', `${item.number}-${part.number} · 小題`), status(part));
    card.append(top, el('h4', '', part.content));
    const first = part.answers[0]; card.append(el('p', `part-preview ${first ? '' : 'empty'}`, first ? `目前第一名 · ${first.id}　${first.text}` : '尚未收到回答'));
    const foot = el('div', 'part-card-footer'); foot.append(el('small', '', `${part.answers.length} 份回答 · ${part.status === 'open' ? `剩餘約 ${part.seconds} 秒` : statusText[part.status]}`), button('進入小題 →', '', () => navigate('part', item.number, part.number))); card.append(foot); grid.append(card);
  }
  root.append(grid, el('p', 'hint', '大題操作只出現在此資料夾頁面；進入小題後只顯示該小題自己的控制。'));
}
function questionView(item, part, grouped) {
  const root = shell('question-view'); breadcrumb(root, grouped ? [{ label: caseName(item), onClick: () => navigate('group', item.number) }, { label: `${item.number}-${part.number}` }] : [{ label: caseName(item) }]);
  const header = el('div', 'question-header'), line = el('div', 'question-heading-row'), title = el('div');
  title.append(el('span', 'case-label', grouped ? `${item.number}-${part.number} · 小題` : `${caseName(item)} · 單題`), el('h2', '', part.content), el('p', '', grouped ? `所屬大題：${item.title}` : '獨立單題'));
  line.append(title, status(part)); header.append(line, el('p', 'timer', part.status === 'open' ? `倒數中 · 約剩 ${part.seconds} 秒` : `設定 ${part.seconds} 秒`));
  const actions = el('div', 'question-actions'); actions.append(button(part.status === 'open' ? '暫停' : '開始搶答', 'primary', () => { part.status = part.status === 'open' ? 'paused' : 'open'; render(); tell('已切換預覽狀態，正式課堂沒有變動。'); }), button('編輯此題', 'quiet', () => { const value = window.prompt('預覽：修改小題內容', part.content)?.trim(); if (value) { part.content = value; render(); } }), button('刪除此題', 'quiet danger', () => tell('這裡只刪除本小題，預覽不執行刪除。'))); header.append(actions); root.append(header);
  if (part.answers.length) { const first = part.answers[0], box = el('section', 'winner'); box.append(el('small', '', part.status === 'settled' ? '正式得標者' : '目前排名第一 · 尚未結算'), el('strong', '', first.text), el('span', '', `學號 ${first.id}`)); root.append(box); }
  const tableTitle = el('div', 'answers-title'); tableTitle.append(el('h3', '', '全部回答'), el('span', '', `${part.answers.length} 份 · 按目前優先順位`)); root.append(tableTitle);
  const table = el('table', 'answers'), thead = el('thead'), row = el('tr');
  for (const text of ['順位', '學號與回答', '先前得標', '狀態']) { const cell = el('th', '', text); cell.scope = 'col'; row.append(cell); } thead.append(row);
  const body = el('tbody'); for (const [index, answer] of part.answers.entries()) { const tr = el('tr'); tr.append(el('td', '', `#${index + 1}`), el('td', '', `${answer.id}　${answer.text}`), el('td', '', `${answer.wins} 次`), el('td', '', index === 0 ? '目前第一' : '已收到')); body.append(tr); }
  if (!part.answers.length) { const tr = el('tr'), td = el('td', '', '尚未收到回答'); td.colSpan = 4; tr.append(td); body.append(tr); }
  table.append(thead, body); root.append(table);
}
function overview() { const root = shell('overview-view'); root.append(el('span', 'case-label', 'ALL CASES'), el('h2', '', '全部題目'), el('p', 'hint', '大題與單題分層呈現；題組打開後才查看所屬小題。')); for (const item of cases) { const row = el('div', 'overview-case'), icon = el('span', 'folder-icon', isGroup(item) ? '▣' : '▤'), copy = el('div'); copy.append(el('h3', '', `${caseName(item)} · ${item.title}`), el('p', '', isGroup(item) ? `題組 · ${item.parts.length} 小題` : `單題 · ${statusText[item.status]}`)); row.append(icon, copy, button('開啟 →', '', () => navigate(isGroup(item) ? 'group' : 'single', item.number))); root.append(row); } }
function render() { cases.sort((a, b) => a.number - b.number); nav(); $('#case-count').textContent = cases.length; $('#open-count').textContent = cases.flatMap(allParts).filter(part => part.status === 'open').length; $('#answer-count').textContent = cases.flatMap(allParts).reduce((sum, part) => sum + part.answers.length, 0); if (state.view === 'all') overview(); else if (state.view === 'group') groupView(currentCase()); else questionView(currentCase(), currentPart(), state.view === 'part'); }
function addPartField() { const index = $('#part-fields').children.length + 1, wrapper = el('div', 'part-field'); wrapper.append(el('strong', '', `小題 ${index}`)); const content = el('label', 'field', '題目'); content.append(el('textarea', 'part-content')); const duration = el('label', 'field short-field', '搶答時間（秒）'); const input = el('input', 'part-duration'); input.type = 'number'; input.min = '1'; input.max = '3600'; input.value = '60'; duration.append(input); wrapper.append(content, duration); $('#part-fields').append(wrapper); }
function closeDialog() { $('#create-dialog').close(); $('#create-form').reset(); $('#form-error').textContent = ''; $('#part-fields').replaceChildren(); addPartField(); showKind(); }
function showKind() { const group = document.querySelector('input[name="kind"]:checked').value === 'group'; $('#group-fields').hidden = !group; $('#single-fields').hidden = group; }
$('#new-case').onclick = () => { $('#case-number').value = Math.max(...cases.map(item => item.number)) + 1; $('#create-dialog').showModal(); };
$('#close-dialog').onclick = $('#cancel-dialog').onclick = closeDialog;
document.querySelectorAll('input[name="kind"]').forEach(input => { input.onchange = showKind; });
$('#add-demo-part').onclick = addPartField;
addPartField(); showKind();
$('#create-form').onsubmit = event => {
  event.preventDefault(); const number = Number($('#case-number').value), group = document.querySelector('input[name="kind"]:checked').value === 'group';
  if (!Number.isSafeInteger(number) || number < 1 || cases.some(item => item.number === number)) { $('#form-error').textContent = '請輸入尚未使用的正整數 Case 編號。'; return; }
  if (group) {
    const title = $('#group-title').value.trim(), parts = [...$('#part-fields').children].map((row, index) => ({ number: index + 1, content: row.querySelector('.part-content').value.trim(), status: 'draft', seconds: Number(row.querySelector('.part-duration').value), answers: [] }));
    if (!title || !parts.length || parts.some(part => !part.content || !Number.isInteger(part.seconds) || part.seconds < 1 || part.seconds > 3600)) { $('#form-error').textContent = '請填寫題組標題、小題內容與有效倒數秒數。'; return; }
    cases.push({ number, title, parts }); state.view = 'group'; state.caseNumber = number; state.expanded.add(number);
  } else {
    const title = $('#single-content').value.trim(), seconds = Number($('#single-duration').value);
    if (!title || !Number.isInteger(seconds) || seconds < 1 || seconds > 3600) { $('#form-error').textContent = '請填寫單題內容與有效倒數秒數。'; return; }
    cases.push({ number, title, status: 'draft', seconds, answers: [] }); state.view = 'single'; state.caseNumber = number;
  }
  closeDialog(); render(); tell(`已建立模擬 Case ${number}，正式課堂沒有變動。`);
};
$('#export-demo').onclick = () => tell('此為版型預覽；匯出功能未連線，不會寫入 Google Sheet。');
function closePartDialog() { $('#part-dialog').close(); $('#part-form').reset(); $('#part-form-error').textContent = ''; addingToCase = null; }
$('#close-part-dialog').onclick = $('#cancel-part-dialog').onclick = closePartDialog;
$('#part-form').onsubmit = event => {
  event.preventDefault(); const item = cases.find(candidate => candidate.number === addingToCase);
  const content = $('#new-part-content').value.trim(), seconds = Number($('#new-part-duration').value);
  if (!item || !isGroup(item) || !content || !Number.isInteger(seconds) || seconds < 1 || seconds > 3600) { $('#part-form-error').textContent = '請填寫小題內容與 1–3600 秒的倒數時間。'; return; }
  const next = Math.max(...item.parts.map(part => part.number)) + 1;
  item.parts.push({ number: next, content, status: 'draft', seconds, answers: [] });
  closePartDialog(); navigate('group', item.number); tell(`已在預覽新增 ${item.number}-${next}；正式資料沒有變動。`);
};
render();
