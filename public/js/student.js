import { api, connection, message, validText } from './api.js';
import { connectEvents } from './events.js';
import { answerCard } from './components/answer-card.js';
import { groupAnswerCard } from './components/group-answer-card.js';

const $ = selector => document.querySelector(selector);
const cards = new Map(); let closeEvents, online = false, generation = 0, clockOffset = 0, snapshot = { questions: [] };
setInterval(() => { for (const card of cards.values()) card.tick(); }, 250);
function loginView(text = '') {
  generation++; closeEvents?.(); closeEvents = undefined; online = false; snapshot = { questions: [] };
  for (const card of cards.values()) card.destroy(); cards.clear(); $('#answer-list').replaceChildren();
  $('#identity-number').textContent = ''; $('#identity-group').textContent = '';
  $('#classroom').hidden = true; $('#login-view').hidden = false; connection(false, '尚未登入');
  message($('#login-message'), text, !!text);
}
function expired() { loginView('登入已失效，請重新輸入學號。'); }
function render() {
  const ids = new Set(snapshot.questions.map(q => q.id));
  for (const [id, card] of cards) if (!ids.has(id)) { card.destroy(); cards.delete(id); }
  snapshot.questions.forEach((q, index) => {
    if (!cards.has(q.id)) {
      const current = generation;
      cards.set(q.id, (q.kind === 'group' ? groupAnswerCard : answerCard)(q,
        { expired, isCurrent: () => current === generation && cards.has(q.id) }));
    }
    const card = cards.get(q.id); card.update(q, online, clockOffset);
    if ($('#answer-list').children[index] !== card.root) $('#answer-list').insertBefore(card.root, $('#answer-list').children[index] || null);
  });
  $('#waiting').hidden = snapshot.questions.some(q => q.status === 'open' || q.status === 'paused');
}
function apply(value) {
  snapshot = value; clockOffset = Date.now() - value.serverNow;
  $('#identity-number').textContent = `學號 ${value.studentNumber}`;
  $('#identity-group').textContent = `G${value.groupNumber}`; render();
}
function enter(value) {
  closeEvents?.(); generation++; for (const card of cards.values()) card.destroy(); cards.clear(); $('#answer-list').replaceChildren(); online = false;
  $('#login-view').hidden = true; $('#classroom').hidden = false; apply(value); connection(false, '連線中…');
  closeEvents = connectEvents('student', { snapshot: apply, expired, status(connected) {
    online = connected; connection(online, online ? '即時連線中' : '連線中斷，重新連線中…'); render();
  } });
}
$('#switch-student').onclick = () => { loginView(); $('#student-number').focus(); };
$('#login-form').onsubmit = async event => {
  event.preventDefault();
  if (!validText($('#student-number').value, 80)) { message($('#login-message'), '請輸入 1–80 字的學號。', true); return; }
  const groupInput = $('#group-number').value.trim();
  const groupNumber = Number(groupInput);
  if (!/^[0-9]+$/.test(groupInput) || !Number.isSafeInteger(groupNumber) || groupNumber < 1) {
    message($('#login-message'), '請輸入正整數組別編號，例如 2。', true); return;
  }
  const button = event.currentTarget.querySelector('button'); button.disabled = true; message($('#login-message'));
  try { await api('/api/student/session', { method: 'POST', body: { studentNumber: $('#student-number').value, groupNumber } }); enter(await api('/api/student/questions')); }
  catch (error) { message($('#login-message'), error.message, true); }
  finally { button.disabled = false; }
};
try { enter(await api('/api/student/questions')); }
catch (error) { loginView(error.status === 401 ? '' : error.message); }
