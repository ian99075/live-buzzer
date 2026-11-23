import { api, connection, element, message } from './api.js';
import { connectEvents } from './events.js';
import { questionControls } from './components/question-controls.js';
import { groupControls } from './components/group-controls.js';
import { caseGroups, renderCaseNavigation, renderOverview, renderGroupQuestions, renderGroupResponses, renderDetailResponses } from './components/teacher-view.js';
import { exportPanel } from './components/export-panel.js';

const $ = selector => document.querySelector(selector);
const controls = new Map(), groupControlsMap = new Map(), expandedGroups = new Set();
let snapshot = { questions: [], exporting: false }, closeEvents;
let selectedId = null, selectedGroupId = null, localLock = false, importing = false, loggedIn = false, clockOffset = 0;

function chooseAll() { selectedId = selectedGroupId = null; renderManagement(); renderAnswers(); tick(); }
function chooseGroup(groupId) { selectedId = null; selectedGroupId = groupId; renderManagement(); renderAnswers(); tick(); }
function chooseQuestion(id) {
  const q = snapshot.questions.find(item => item.id === id);
  if (!q) {
    const group = snapshot.questions.find(item => item.kind === 'group' && item.parts.some(part => part.id === id));
    if (group) chooseGroup(group.groupId);
    return;
  }
  selectedId = id; selectedGroupId = q.groupId;
  if (q.groupId) expandedGroups.add(q.groupId);
  renderManagement(); renderAnswers(); tick();
}
function tick() {
  for (const timer of document.querySelectorAll('[data-deadline-at]')) {
    const seconds = Math.ceil(Math.max(0, Number(timer.dataset.deadlineAt) - (Date.now() - clockOffset)) / 1000);
    timer.textContent = `剩餘 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
}
setInterval(tick, 250);
function loginView(text = '') {
  loggedIn = false; closeEvents?.(); closeEvents = undefined; exportUI.reset();
  $('#teacher-logout').hidden = true; $('#dashboard').hidden = true; $('#login-view').hidden = false;
  connection(false, '尚未登入'); controls.clear(); groupControlsMap.clear(); expandedGroups.clear();
  selectedId = selectedGroupId = null;
  for (const id of ['question-nav','group-controls','group-parts','detail-breadcrumb','selected-controls','response-list','overview-list'])
    $('#'+id).replaceChildren();
  snapshot = { questions: [], exporting: false }; message($('#login-message'), text, !!text);
}
function failed(error) { if (error.status === 401) loginView('登入已失效，請重新登入。'); }
function renderManagement() {
  const locked = localLock || snapshot.exporting || importing, groups = caseGroups(snapshot.questions);
  const ids = new Set(snapshot.questions.filter(q => q.kind !== 'group').map(q => q.id));
  for (const [id, control] of controls) if (!ids.has(id)) { control.root.remove(); controls.delete(id); }
  const groupIds = new Set(groups.filter(item => item.isGroup).map(item => item.groupId));
  for (const [id, control] of groupControlsMap) if (!groupIds.has(id)) { control.root.remove(); groupControlsMap.delete(id); }
  for (const id of expandedGroups) if (!groupIds.has(id)) expandedGroups.delete(id);
  if (selectedId && !ids.has(selectedId)) selectedId = null;
  if (selectedGroupId !== null && !groupIds.has(selectedGroupId)) selectedGroupId = null;
  for (const q of snapshot.questions.filter(item => item.kind !== 'group')) {
    if (!controls.has(q.id)) controls.set(q.id, questionControls(q, { updated: refresh, failed }));
    controls.get(q.id).update(q, locked);
  }
  for (const group of groups.filter(item => item.isGroup)) {
    if (!groupControlsMap.has(group.groupId)) groupControlsMap.set(group.groupId,
      groupControls(group, { updated: refresh, failed, chooseAll }));
    groupControlsMap.get(group.groupId).update(group, locked);
  }
  renderCaseNavigation($('#question-nav'), groups, { groupId: selectedGroupId, questionId: selectedId }, expandedGroups,
    { all: chooseAll, group: chooseGroup, question: chooseQuestion });
  $('#import-questions').disabled = locked;
  $('#question-empty').hidden = groups.length > 0;
  $('#question-count').textContent = `${groups.length} Case`;
}
function breadcrumb(q) {
  const all = element('button', '', '全部 Case'); all.type = 'button'; all.onclick = chooseAll;
  const nodes = [all, element('span', '', '/')];
  if (q.partNumber) {
    const group = element('button', '', `CASE ${q.caseNumber}`); group.type = 'button'; group.onclick = () => chooseGroup(q.groupId);
    nodes.push(group, element('span', '', '/'), element('span', '', `${q.caseNumber}-${q.partNumber}`));
  } else nodes.push(element('span', '', `CASE ${q.caseNumber}`));
  $('#detail-breadcrumb').replaceChildren(...nodes);
}
function renderAnswers() {
  const groups = caseGroups(snapshot.questions), q = snapshot.questions.find(item => item.id === selectedId);
  const group = groups.find(item => item.groupId === selectedGroupId && item.isGroup);
  $('#response-empty').hidden = groups.length > 0;
  $('#detail-view').hidden = !q; $('#group-view').hidden = !!q || !group;
  $('#overview-list').hidden = !!q || !!group || !groups.length;
  if (q) {
    breadcrumb(q);
    const root = controls.get(q.id).root;
    if ($('#selected-controls').firstChild !== root) $('#selected-controls').replaceChildren(root);
    renderDetailResponses($('#response-list'), q, { updated: refresh, failed, locked: localLock || snapshot.exporting });
    $('#group-controls').replaceChildren(); $('#group-parts').replaceChildren();
  } else if (group) {
    $('#selected-controls').replaceChildren(); $('#response-list').replaceChildren(); $('#detail-breadcrumb').replaceChildren();
    const root = groupControlsMap.get(group.groupId).root;
    if ($('#group-controls').firstChild !== root) $('#group-controls').replaceChildren(root);
    renderGroupQuestions($('#group-parts'), group);
    const responses = element('div', 'group-response-list');
    renderGroupResponses(responses, group, { updated: refresh, failed, locked: localLock || snapshot.exporting });
    $('#group-parts').append(responses);
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
const exportUI = exportPanel({ lock(value) { localLock = value; renderManagement(); renderAnswers(); }, refresh, failed });
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
$('#import-questions').onclick = async () => {
  if (importing || localLock || snapshot.exporting) return;
  importing = true; renderManagement(); message($('#import-message'), '正在讀取 Google Sheet 題目…');
  try {
    const result = await api('/api/teacher/questions/import-google-sheet', { method: 'POST' });
    message($('#import-message'), `匯入完成：新增 ${result.added} 題、更新 ${result.updated} 題，保留 ${result.retained} 題。${result.missing.length ? ` Sheet 未找到的既有題目：${result.missing.join('、')}（本堂課保留）` : ''}`);
    await refresh();
  } catch (error) { message($('#import-message'), error.message, true); failed(error); }
  finally { importing = false; renderManagement(); }
};
function density(compact) { document.body.classList.toggle('compact', compact); $('#comfortable').setAttribute('aria-pressed', String(!compact)); $('#compact').setAttribute('aria-pressed', String(compact)); }
$('#comfortable').onclick = () => density(false); $('#compact').onclick = () => density(true);
$('#focus').onclick = () => { const focused = document.body.classList.toggle('focus-mode'); $('#focus').textContent = focused ? '顯示題目欄' : '收合題目欄'; $('#focus').setAttribute('aria-pressed', String(focused)); };
try { enter(await api('/api/teacher/questions')); }
catch (error) { loginView(error.status === 401 ? '' : error.message); }
