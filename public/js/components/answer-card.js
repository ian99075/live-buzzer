import { api, element, message, validText } from '../api.js';

export function answerCard(initial, { expired, isCurrent }) {
  let q = initial, state = q.submitted ? 'sent' : 'editable', frozen = '', online = false;
  const root = element('form', 'panel answer-card'); root.dataset.questionId = q.id;
  const tag = element('span', 'case-tag', `CASE ${q.caseNumber}`); const title = element('h2');
  const label = element('label', '', '你的回答'); const input = element('textarea');
  input.id = `answer-${q.id}`; label.htmlFor = input.id; input.placeholder = '在這裡填寫回答…'; input.rows = 4;
  const button = element('button', 'buzz-button', '搶答！'); button.type = 'submit';
  const feedback = element('p', 'message'); feedback.setAttribute('role', 'status');
  root.append(tag, title, label, input, button, feedback);
  function render() {
    title.textContent = q.content; root.dataset.state = state;
    input.disabled = state !== 'editable';
    button.disabled = !online || state === 'sending' || state === 'sent' || (state === 'editable' && !validText(input.value, 5000));
    button.classList.toggle('sent', state === 'sent');
    button.textContent = ({ editable: '搶答！', sending: '送出中…', sent: '已送出', retryable: '重試送出' })[state];
    if (state === 'sent') message(feedback, '已送出，請等候老師的下一步。');
  }
  input.oninput = () => { message(feedback, [...input.value.trim()].length > 5000 ? '回答最多 5000 字，請縮短後再送出。' : '', true); render(); };
  root.onsubmit = async event => {
    event.preventDefault(); if (button.disabled || !isCurrent()) return;
    if (state === 'editable') frozen = input.value.trim();
    state = 'sending'; message(feedback); render();
    try {
      await api(`/api/student/questions/${q.id}/buzz`, { method: 'POST', body: { answer: frozen } });
      if (isCurrent()) { state = 'sent'; render(); }
    } catch (error) {
      if (!isCurrent()) return;
      if (error.status === 401) { expired(); return; }
      if (state !== 'sent') {
        state = error.status === 400 ? 'editable' : 'retryable';
        message(feedback, error.status === 400 ? error.message : '未確認送出，請重試。重試會傳送同一份回答。', true); render();
      }
    }
  };
  render();
  return { root, update(value, connected) { q = value; online = connected; if (q.submitted) state = 'sent'; render(); } };
}
