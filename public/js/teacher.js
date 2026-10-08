import { api, connection, element, message, validText } from './api.js';
import { connectEvents } from './events.js';
import { questionControls } from './components/question-controls.js';
import { questionNavigation, renderOverview, renderDetailResponses } from './components/teacher-view.js';
import { exportPanel } from './components/export-panel.js';

const $ = selector => document.querySelector(selector);
const controls = new Map(), navigation = new Map();
let snapshot = { questions: [], exporting: false }, closeEvents, selectedId = null;
let localLock = false, adding = false, loggedIn = false;
let clockOffset = 0;
const allButton = element('button', 'nav-button nav-all', '全部題目'); allButton.type = 'button';
const allCount = element('span', 'count'); allButton.append(allCount);
allButton.onclick = () => choose(null);
function choose(id) { selectedId = id; renderManagement(); renderAnswers(); tick(); }
function tick() {
  for (const timer of document.querySelectorAll('[data-deadline-at]')) {
    const end = Number(timer.dataset.deadlineAt);
    const seconds = Math.ceil(Math.max(0, end - (Date.now() - clockOffset)) / 1000);
    timer.textContent = `剩餘 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
}
setInterval(tick, 250);
function loginView(text = '') {
  loggedIn = false; closeEvents?.(); closeEvents = undefined;
  exportUI.reset(); $('#dashboard').hidden = true; $('#login-view').hidden = false; connection(false, '尚未登入');
  controls.clear(); navigation.clear(); selectedId = null;
  for (const id of ['question-nav','selected-controls','response-list','overview-list']) $('#'+id).replaceChildren();
  message($('#add-message')); $('#question-content').value = ''; $('#add-question').hidden = true;
  $('#add-toggle').setAttribute('aria-expanded', 'false');
  snapshot = { questions: [], exporting: false }; $('#case-number').replaceChildren();
  message($('#login-message'), text, !!text);
}
function failed(error) { if (error.status === 401) loginView('登入已失效，請重新登入。'); }
function renderManagement() {
  const locked = localLock || snapshot.exporting, ids = new Set(snapshot.questions.map(q => q.id));
  for (const [id, control] of controls) if (!ids.has(id)) { control.root.remove(); controls.delete(id); }
  for (const [id, nav] of navigation) if (!ids.has(id)) { nav.root.remove(); navigation.delete(id); }
  if (selectedId && !ids.has(selectedId)) selectedId = null;
  const nav = $('#question-nav');
  if (nav.firstChild !== allButton) nav.prepend(allButton);
  allButton.setAttribute('aria-pressed', String(selectedId === null)); allCount.textContent = snapshot.questions.length;
  snapshot.questions.forEach((q, index) => {
    if (!controls.has(q.id)) controls.set(q.id, questionControls(q, { updated: refresh, failed }));
    controls.get(q.id).update(q, locked);
    if (!navigation.has(q.id)) navigation.set(q.id, questionNavigation(q, choose));
    const item = navigation.get(q.id); item.update(q, selectedId);
    if (nav.children[index+1] !== item.root) nav.insertBefore(item.root, nav.children[index+1] || null);
  });
  const select = $('#case-number'), previous = select.value;
  const available = [1,2,3,4,5,6].filter(n => !snapshot.questions.some(q => q.caseNumber === n));
  if ([...select.options].map(o => o.value).join() !== available.join()) {
    select.replaceChildren(...available.map(n => new Option(`Case ${n} · 第 ${n} 題`, n)));
    if (available.includes(Number(previous))) select.value = previous;
  }
  $('#add-fields').disabled = locked || adding || available.length === 0;
  $('#add-toggle').disabled = locked || adding || available.length === 0;
  $('#question-empty').hidden = snapshot.questions.length > 0;
  $('#question-count').textContent = `${snapshot.questions.length} / 6`;
}
function renderAnswers() {
  const q = snapshot.questions.find(q => q.id === selectedId);
  $('#detail-view').hidden = !q; $('#overview-list').hidden = !!q || !snapshot.questions.length;
  $('#response-empty').hidden = snapshot.questions.length > 0;
  $('#show-all').hidden = !q; $('#view-heading').textContent = q ? '即時回答' : '各題回答總覽';
  if (q) {
    // SSE 只更新回答；所選題目未變時，不重新掛載編輯表單，保留輸入焦點與游標。
    const root = controls.get(q.id).root;
    if ($('#selected-controls').firstChild !== root) $('#selected-controls').replaceChildren(root);
    renderDetailResponses($('#response-list'), q, { updated: refresh, failed, locked: localLock || snapshot.exporting });
  } else {
    $('#selected-controls').replaceChildren();
    $('#response-list').replaceChildren();
    renderOverview($('#overview-list'), snapshot.questions, choose);
  }
}
function apply(value) {
  if (!loggedIn) return;
  snapshot = value; clockOffset = Date.now() - value.serverNow; renderManagement(); renderAnswers(); exportUI.update(value); tick();
  $('#open-count').textContent = value.questions.filter(q => q.status === 'open').length;
  $('#answer-count').textContent = value.questions.reduce((n,q) => n+q.submissions.length, 0);
  $('#winner-count').textContent = value.questions.filter(q => q.winner).length;
  $('#test-banner').hidden = !value.testMode;
}
async function refresh() {
  try { const value = await api('/api/teacher/questions'); if (loggedIn) apply(value); }
  catch (error) { message($('#dashboard-message'), error.message, true); failed(error); }
}
const exportUI = exportPanel({ lock(value) { localLock = value; renderManagement(); }, refresh, failed });
function enter(value) {
  loggedIn = true; $('#login-view').hidden = true; $('#dashboard').hidden = false; $('#password').value = '';
  selectedId = value.questions[0]?.id ?? null;
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
$('#add-toggle').onclick = () => { const open = $('#add-question').hidden; $('#add-question').hidden = !open; $('#add-toggle').setAttribute('aria-expanded',String(open)); if (open) $('#question-content').focus(); };
$('#add-question').onsubmit = async event => {
  event.preventDefault(); if (adding || localLock || snapshot.exporting) return;
  if (!validText($('#question-content').value,2000)) { message($('#add-message'),'請填寫 1–2000 字的題目。',true); return; }
  const durationSeconds = Number($('#duration-seconds').value);
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600) { message($('#add-message'),'搶答時間需為 1–3600 秒。',true); return; }
  adding = true; renderManagement(); message($('#add-message'));
  try {
    const q = await api('/api/teacher/questions',{method:'POST',body:{caseNumber:Number($('#case-number').value),content:$('#question-content').value,durationSeconds}});
    selectedId = q.id; $('#question-content').value = ''; $('#duration-seconds').value = '60'; $('#add-question').hidden = true; $('#add-toggle').setAttribute('aria-expanded','false'); await refresh();
  } catch (error) { message($('#add-message'),error.message,true); failed(error); }
  finally { adding = false; renderManagement(); }
};
$('#show-all').onclick = () => choose(null);
function density(compact) { document.body.classList.toggle('compact',compact); $('#comfortable').setAttribute('aria-pressed',String(!compact)); $('#compact').setAttribute('aria-pressed',String(compact)); }
$('#comfortable').onclick = () => density(false); $('#compact').onclick = () => density(true);
$('#focus').onclick = () => { const focused = document.body.classList.toggle('focus-mode'); $('#focus').textContent = focused ? '顯示題目欄' : '收合題目欄'; $('#focus').setAttribute('aria-pressed',String(focused)); };
try { enter(await api('/api/teacher/questions')); }
catch (error) { loginView(error.status === 401 ? '' : error.message); }
