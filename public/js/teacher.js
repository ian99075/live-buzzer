import { api, connection, element, message, validText } from './api.js';
import { connectEvents } from './events.js';
import { questionControls } from './components/question-controls.js';
import { groupControls } from './components/group-controls.js';
import { caseGroups, renderCaseNavigation, renderOverview, renderGroupQuestions, renderDetailResponses } from './components/teacher-view.js';
import { exportPanel } from './components/export-panel.js';

const $ = selector => document.querySelector(selector);
const controls = new Map(), groupControlsMap = new Map(), expandedGroups = new Set();
let snapshot = { questions: [], exporting: false }, closeEvents;
let selectedId = null, selectedGroupId = null, pendingPartGroupId = null;
let localLock = false, adding = false, addingPart = false, loggedIn = false, clockOffset = 0;

function chooseAll() { selectedId = selectedGroupId = null; renderManagement(); renderAnswers(); tick(); }
function chooseGroup(groupId) { selectedId = null; selectedGroupId = groupId; renderManagement(); renderAnswers(); tick(); }
function chooseQuestion(id) {
  const q = snapshot.questions.find(item => item.id === id);
  if (!q) return;
  selectedId = id; selectedGroupId = q.groupId;
  if (q.groupId) expandedGroups.add(q.groupId);
  renderManagement(); renderAnswers(); tick();
}
function tick() {
  for (const timer of document.querySelectorAll('[data-deadline-at]')) {
    const end = Number(timer.dataset.deadlineAt);
    const seconds = Math.ceil(Math.max(0, end - (Date.now() - clockOffset)) / 1000);
    timer.textContent = `剩餘 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
}
setInterval(tick, 250);

function closeIfOpen(selector) { const dialog = $(selector); if (dialog.open) dialog.close(); }
function loginView(text = '') {
  loggedIn = false; closeEvents?.(); closeEvents = undefined;
  exportUI.reset(); closeIfOpen('#create-dialog'); closeIfOpen('#part-dialog');
  $('#teacher-logout').hidden = true;
  $('#dashboard').hidden = true; $('#login-view').hidden = false; connection(false, '尚未登入');
  controls.clear(); groupControlsMap.clear(); expandedGroups.clear();
  selectedId = selectedGroupId = pendingPartGroupId = null;
  for (const id of ['question-nav', 'group-controls', 'group-parts', 'detail-breadcrumb', 'selected-controls', 'response-list', 'overview-list']) $('#'+id).replaceChildren();
  message($('#add-message')); message($('#append-message'));
  $('#add-question').reset(); $('#new-parts').replaceChildren(); createPartField(); showKind();
  snapshot = { questions: [], exporting: false }; $('#case-preview').textContent = '預計 CASE 1';
  message($('#login-message'), text, !!text);
}
function failed(error) { if (error.status === 401) loginView('登入已失效，請重新登入。'); }

function renderManagement() {
  const locked = localLock || snapshot.exporting, groups = caseGroups(snapshot.questions);
  const ids = new Set(snapshot.questions.map(q => q.id));
  for (const [id, control] of controls) if (!ids.has(id)) { control.root.remove(); controls.delete(id); }
  const groupIds = new Set(groups.filter(item => item.isGroup).map(item => item.groupId));
  for (const [id, control] of groupControlsMap) if (!groupIds.has(id)) { control.root.remove(); groupControlsMap.delete(id); }
  for (const id of expandedGroups) if (!groupIds.has(id)) expandedGroups.delete(id);
  if (selectedId && !ids.has(selectedId)) selectedId = null;
  if (selectedGroupId !== null && !groupIds.has(selectedGroupId)) selectedGroupId = null;
  for (const q of snapshot.questions) {
    if (!controls.has(q.id)) controls.set(q.id, questionControls(q, { updated: refresh, failed }));
    controls.get(q.id).update(q, locked);
  }
  for (const group of groups.filter(item => item.isGroup)) {
    if (!groupControlsMap.has(group.groupId)) groupControlsMap.set(group.groupId,
      groupControls(group, { updated: refresh, failed, chooseAll, openPart: openPartDialog }));
    groupControlsMap.get(group.groupId).update(group, locked);
  }
  renderCaseNavigation($('#question-nav'), groups, { groupId: selectedGroupId, questionId: selectedId }, expandedGroups,
    { all: chooseAll, group: chooseGroup, question: chooseQuestion });
  $('#add-fields').disabled = locked || adding;
  $('#append-fields').disabled = locked || addingPart;
  $('#add-toggle').disabled = locked || adding;
  $('#question-empty').hidden = groups.length > 0;
  $('#question-count').textContent = `${groups.length} Case`;
  if ($('#part-dialog').open && !groupIds.has(pendingPartGroupId)) closePartDialog();
  if ($('#part-dialog').open) {
    const pending = groups.find(group => group.groupId === pendingPartGroupId);
    $('#part-context').textContent = `CASE ${pending.caseNumber} · ${pending.title}，下一題預計編為 ${pending.caseNumber}-${pending.questions.length + 1}。`;
  }
}
function breadcrumb(q) {
  const line = $('#detail-breadcrumb'), all = element('button', '', '全部 Case'); all.type = 'button'; all.onclick = chooseAll;
  const nodes = [all, element('span', '', '/')];
  if (q.partNumber) {
    const group = element('button', '', `CASE ${q.caseNumber}`); group.type = 'button'; group.onclick = () => chooseGroup(q.groupId);
    nodes.push(group, element('span', '', '/'), element('span', '', `${q.caseNumber}-${q.partNumber}`));
  } else nodes.push(element('span', '', `CASE ${q.caseNumber}`));
  line.replaceChildren(...nodes);
}
function renderAnswers() {
  const groups = caseGroups(snapshot.questions), q = snapshot.questions.find(item => item.id === selectedId);
  const group = groups.find(item => item.groupId === selectedGroupId && item.isGroup);
  $('#response-empty').hidden = groups.length > 0;
  $('#detail-view').hidden = !q;
  $('#group-view').hidden = !!q || !group;
  $('#overview-list').hidden = !!q || !!group || !groups.length;
  if (q) {
    breadcrumb(q);
    // SSE 更新回答時不重新掛載題目編輯表單，保留輸入焦點與游標。
    const root = controls.get(q.id).root;
    if ($('#selected-controls').firstChild !== root) $('#selected-controls').replaceChildren(root);
    renderDetailResponses($('#response-list'), q, { updated: refresh, failed, locked: localLock || snapshot.exporting });
    $('#group-controls').replaceChildren(); $('#group-parts').replaceChildren();
  } else if (group) {
    $('#selected-controls').replaceChildren(); $('#response-list').replaceChildren(); $('#detail-breadcrumb').replaceChildren();
    const root = groupControlsMap.get(group.groupId).root;
    if ($('#group-controls').firstChild !== root) $('#group-controls').replaceChildren(root);
    renderGroupQuestions($('#group-parts'), group, chooseQuestion);
  } else {
    $('#selected-controls').replaceChildren(); $('#response-list').replaceChildren(); $('#detail-breadcrumb').replaceChildren();
    $('#group-controls').replaceChildren(); $('#group-parts').replaceChildren();
    if (groups.length) renderOverview($('#overview-list'), groups, { group: chooseGroup, question: chooseQuestion });
    else $('#overview-list').replaceChildren();
  }
}
function apply(value) {
  if (!loggedIn) return;
  snapshot = value; clockOffset = Date.now() - value.serverNow;
  renderManagement(); renderAnswers(); exportUI.update(value); tick();
  $('#case-count').textContent = caseGroups(value.questions).length;
  $('#open-count').textContent = value.questions.filter(q => q.status === 'open').length;
  $('#answer-count').textContent = value.questions.reduce((n, q) => n + q.submissions.length, 0);
  $('#test-banner').hidden = !value.testMode;
}
async function refresh() {
  try { const value = await api('/api/teacher/questions'); if (loggedIn) apply(value); }
  catch (error) { message($('#dashboard-message'), error.message, true); failed(error); }
}
const exportUI = exportPanel({ lock(value) { localLock = value; renderManagement(); }, refresh, failed });
function enter(value) {
  loggedIn = true; $('#login-view').hidden = true; $('#dashboard').hidden = false; $('#password').value = '';
  selectedId = selectedGroupId = null; expandedGroups.clear(); $('#teacher-logout').hidden = false;
  message($('#dashboard-message')); apply(value); closeEvents?.(); connection(false, '連線中…');
  closeEvents = connectEvents('teacher', { snapshot: apply,
    status: online => connection(online, online ? '即時連線中' : '連線中斷，重新連線中…'),
    expired: () => loginView('登入已失效，請重新登入。') });
}
$('#login-form').onsubmit = async event => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true; message($('#login-message'));
  try {
    await api('/api/teacher/session', { method: 'POST', body: { username: $('#username').value, password: $('#password').value } });
    enter(await api('/api/teacher/questions'));
  } catch (error) { message($('#login-message'), error.message, true); }
  finally { button.disabled = false; }
};
$('#teacher-logout').onclick = async () => {
  if (!loggedIn) return;
  const button = $('#teacher-logout'); button.disabled = true;
  try { await api('/api/teacher/session', { method: 'DELETE' }); loginView(); $('#username').focus(); }
  catch (error) { message($('#dashboard-message'), error.message, true); failed(error); }
  finally { button.disabled = false; }
};

let partFieldCounter = 0;
function createPartField() {
  const number = $('#new-parts').children.length + 1, unique = ++partFieldCounter;
  const row = element('div', 'new-part'), label = element('label', '', `小題 ${number} 內容`);
  const content = element('textarea'); content.id = `part-content-${unique}`; content.rows = 2; content.maxLength = 2000; content.className = 'part-content'; label.htmlFor = content.id;
  const durationLabel = element('label', '', '搶答時間（秒）'), duration = element('input');
  duration.id = `part-duration-${unique}`; duration.type = 'number'; duration.min = '1'; duration.max = '3600'; duration.step = '1'; duration.value = '60'; duration.className = 'part-duration'; durationLabel.htmlFor = duration.id;
  const remove = element('button', 'quiet', '移除這個小題'); remove.type = 'button';
  remove.onclick = () => { row.remove(); [...$('#new-parts').children].forEach((child, i) => { child.querySelector('label').textContent = `小題 ${i+1} 內容`; }); };
  row.append(label, content, durationLabel, duration, remove); $('#new-parts').append(row);
}
function createKind() { return document.querySelector('input[name="create-kind"]:checked').value; }
function showKind() { const group = createKind() === 'group'; $('#single-fields').hidden = group; $('#group-fields').hidden = !group; }
document.querySelectorAll('input[name="create-kind"]').forEach(input => { input.onchange = showKind; });
$('#add-part-field').onclick = createPartField;
createPartField(); showKind();
$('#add-toggle').onclick = () => {
  const next = Math.max(0, ...snapshot.questions.map(q => q.caseNumber)) + 1;
  $('#case-preview').textContent = `預計 CASE ${next}`;
  message($('#add-message')); $('#create-dialog').showModal();
  $(createKind() === 'group' ? '#group-title' : '#question-content').focus();
};
$('#close-add').onclick = $('#cancel-add').onclick = () => closeIfOpen('#create-dialog');
$('#add-question').onsubmit = async event => {
  event.preventDefault(); if (adding || localLock || snapshot.exporting) return;
  const group = createKind() === 'group';
  const validDuration = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 3600;
  let body;
  if (group) {
    const rows = [...$('#new-parts').children];
    if (!validText($('#group-title').value, 2000) || !rows.length || rows.some(row => !validText(row.querySelector('.part-content').value, 2000) || !validDuration(row.querySelector('.part-duration').value))) { message($('#add-message'), '請填寫題組標題、至少一個小題與 1–3600 秒倒數。', true); return; }
    body = { title: $('#group-title').value, parts: rows.map(row => ({ content: row.querySelector('.part-content').value, durationSeconds: Number(row.querySelector('.part-duration').value) })) };
  } else {
    if (!validText($('#question-content').value, 2000) || !validDuration($('#duration-seconds').value)) { message($('#add-message'), '請填寫題目及 1–3600 秒倒數。', true); return; }
    body = { content: $('#question-content').value, durationSeconds: Number($('#duration-seconds').value) };
  }
  adding = true; renderManagement(); message($('#add-message'));
  try {
    const created = await api(group ? '/api/teacher/groups' : '/api/teacher/questions', { method: 'POST', body });
    selectedGroupId = group ? created.groupId : null; selectedId = group ? null : created.id;
    if (group) expandedGroups.add(created.groupId);
    $('#add-question').reset(); $('#new-parts').replaceChildren(); createPartField(); showKind();
    closeIfOpen('#create-dialog'); await refresh();
  } catch (error) { message($('#add-message'), error.message, true); failed(error); }
  finally { adding = false; renderManagement(); }
};

function openPartDialog(group) {
  if (localLock || snapshot.exporting || addingPart) return;
  pendingPartGroupId = group.groupId;
  const next = group.questions.length + 1;
  $('#append-part-form').reset(); message($('#append-message'));
  $('#part-context').textContent = `CASE ${group.caseNumber} · ${group.title}，下一題將編為 ${group.caseNumber}-${next}。`;
  $('#part-dialog').showModal(); $('#append-content').focus();
}
function closePartDialog() { closeIfOpen('#part-dialog'); pendingPartGroupId = null; message($('#append-message')); }
$('#close-part').onclick = $('#cancel-part').onclick = closePartDialog;
$('#part-dialog').addEventListener('close', () => { pendingPartGroupId = null; });
$('#append-part-form').onsubmit = async event => {
  event.preventDefault(); if (addingPart || localLock || snapshot.exporting) return;
  const groupId = pendingPartGroupId, content = $('#append-content').value;
  const durationSeconds = Number($('#append-duration').value);
  if (!caseGroups(snapshot.questions).some(group => group.groupId === groupId && group.isGroup)) { message($('#append-message'), '題組已不存在，請重新選擇。', true); return; }
  if (!validText(content, 2000) || !Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600) { message($('#append-message'), '請填寫小題內容與 1–3600 秒的倒數時間。', true); return; }
  addingPart = true; renderManagement(); message($('#append-message'));
  try {
    await api(`/api/teacher/groups/${groupId}/questions`, { method: 'POST', body: { content, durationSeconds } });
    closePartDialog(); selectedGroupId = groupId; selectedId = null; expandedGroups.add(groupId); await refresh();
  } catch (error) { message($('#append-message'), error.message, true); failed(error); }
  finally { addingPart = false; renderManagement(); }
};

function density(compact) { document.body.classList.toggle('compact', compact); $('#comfortable').setAttribute('aria-pressed', String(!compact)); $('#compact').setAttribute('aria-pressed', String(compact)); }
$('#comfortable').onclick = () => density(false); $('#compact').onclick = () => density(true);
$('#focus').onclick = () => { const focused = document.body.classList.toggle('focus-mode'); $('#focus').textContent = focused ? '顯示題目欄' : '收合題目欄'; $('#focus').setAttribute('aria-pressed', String(focused)); };
try { enter(await api('/api/teacher/questions')); }
catch (error) { loginView(error.status === 401 ? '' : error.message); }
