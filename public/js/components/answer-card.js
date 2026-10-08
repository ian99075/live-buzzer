import { api, element, message, validText } from '../api.js';

export function answerCard(initial, { expired, isCurrent }) {
  let q = initial, state = q.submitted ? 'sent' : 'editable', frozen = '', candidate = '', online = false, clockOffset = 0;
  const root = element('form', 'panel answer-card'); root.dataset.questionId = q.id;
  const tag = element('span', 'case-tag', `CASE ${q.caseNumber}`), title = element('h2');
  const timer = element('strong', 'student-timer');
  const label = element('label', '', '你的回答'), input = element('textarea');
  input.id = `answer-${q.id}`; label.htmlFor = input.id; input.placeholder = '在這裡填寫回答…'; input.rows = 4;
  input.required = true;
  const inputHint = element('small', 'answer-hint', '請先填寫回答（1–5000 字），再按「搶答！」。');
  const button = element('button', 'buzz-button', '搶答！'); button.type = 'submit';
  const feedback = element('p', 'message'); feedback.setAttribute('role', 'status');
  const dialog = element('dialog', 'answer-confirm');
  const heading = element('h2', '', '確認送出這份回答？');
  const questionPreview = element('p', 'confirm-question');
  const preview = element('p', 'answer-preview');
  const hint = element('p', 'muted', '確認後立即送出，同題無法修改或再次送出。倒數期間仍會繼續。');
  const actions = element('div', 'control-actions');
  const cancel = element('button', '', '返回修改'), confirm = element('button', 'primary', '確認送出');
  cancel.type = confirm.type = 'button'; actions.append(cancel, confirm); dialog.append(heading, questionPreview, preview, hint, actions);
  root.append(tag, title, timer, label, input, inputHint, button, feedback, dialog);
  const remaining = () => q.status === 'open' ? Math.max(0, q.deadlineAt - (Date.now() - clockOffset)) : q.remainingMs;
  const canSend = () => q.status === 'open' && remaining() > 0 && online && isCurrent();
  function render() {
    title.textContent = q.content; root.dataset.state = state;
    const active = canSend();
    timer.textContent = q.status === 'paused' ? `已暫停 · 剩餘 ${Math.ceil(q.remainingMs / 1000)} 秒`
      : `剩餘 ${Math.floor(Math.ceil(remaining() / 1000) / 60)}:${String(Math.ceil(remaining() / 1000) % 60).padStart(2, '0')}`;
    input.disabled = state !== 'editable' || !active;
    button.disabled = !active || state === 'sending' || state === 'sent' || (state === 'editable' && !validText(input.value, 5000));
    button.classList.toggle('sent', state === 'sent');
    button.textContent = ({ editable: '搶答！', sending: '送出中…', sent: '已送出', retryable: '重試送出' })[state];
    if (state === 'sent') message(feedback, '已送出，請等候老師的下一步。');
    else if (q.status === 'paused') message(feedback, '老師已暫停這題，草稿會保留。');
    else if (!active && remaining() <= 0) message(feedback, '本題搶答時間已結束。');
    if (dialog.open && !active) dialog.close();
  }
  async function send() {
    if (!canSend() || state === 'sending' || state === 'sent') return;
    state = 'sending'; message(feedback); render();
    try {
      await api(`/api/student/questions/${q.id}/buzz`, { method: 'POST', body: { answer: frozen } });
      if (isCurrent()) { state = 'sent'; render(); }
    } catch (error) {
      if (!isCurrent()) return;
      if (error.status === 401) { expired(); return; }
      if (state !== 'sent') {
        state = 'retryable';
        message(feedback, '未確認送出，若仍在搶答期間可重試同一份回答。', true); render();
      }
    }
  }
  input.oninput = () => {
    const length = [...input.value.trim()].length;
    message(feedback, length > 5000 ? '回答最多 5000 字，請縮短後再送出。'
      : length === 0 ? '請先填寫回答。' : '', length === 0 || length > 5000);
    render();
  };
  root.onsubmit = event => {
    event.preventDefault(); if (button.disabled || !isCurrent()) return;
    if (state === 'retryable') { void send(); return; }
    candidate = input.value.trim(); questionPreview.textContent = q.content;
    preview.textContent = candidate; dialog.showModal(); cancel.focus();
  };
  cancel.onclick = () => dialog.close();
  dialog.onclose = () => { if (isCurrent() && root.isConnected && state === 'editable' && canSend()) button.focus(); };
  confirm.onclick = () => {
    if (!canSend() || !validText(candidate, 5000)) { dialog.close(); render(); return; }
    frozen = candidate; dialog.close(); void send();
  };
  render();
  return { root, update(value, connected, offset) { q = value; online = connected; clockOffset = offset;
      if (q.submitted) state = 'sent'; render(); }, tick: render,
    destroy() { if (dialog.open) dialog.close(); root.remove(); } };
}
