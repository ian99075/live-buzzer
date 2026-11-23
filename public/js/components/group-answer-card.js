import { api, element, message, validText } from '../api.js';

export function groupAnswerCard(initial, { expired, isCurrent }) {
  let group = initial, online = false, clockOffset = 0;
  let state = group.submitted ? 'sent' : 'editable', frozen = null, candidate = null;
  const root = element('form', 'panel answer-card group-answer-card');
  root.dataset.questionId = group.id;
  const tag = element('span', 'case-tag'), title = element('h2'), timer = element('strong', 'student-timer');
  const fields = element('div', 'group-answer-fields'), inputs = new Map();
  const hint = element('small', 'answer-hint', '請填寫全部小題（每題 1–5000 字），再按一次「搶答！」。');
  const button = element('button', 'buzz-button', '搶答！'); button.type = 'submit';
  const feedback = element('p', 'message'); feedback.setAttribute('role', 'status');
  const result = element('div', 'student-result'); result.setAttribute('role', 'status'); result.setAttribute('aria-live', 'polite');
  const resultLabel = element('p', 'student-result-label', '搶答第一名');
  const resultIdentity = element('strong', 'student-result-identity'); result.append(resultLabel, resultIdentity);
  const dialog = element('dialog', 'answer-confirm');
  const heading = element('h2', '', '確認送出整組回答？'), preview = element('div', 'group-answer-preview');
  const note = element('p', 'muted', '確認後整組立即送出，所有小題都無法修改或再次送出。');
  const actions = element('div', 'control-actions'), cancel = element('button', '', '返回修改');
  const confirm = element('button', 'primary', '確認送出');
  cancel.type = confirm.type = 'button'; actions.append(cancel, confirm);
  dialog.append(heading, preview, note, actions);
  root.append(tag, title, timer, fields, hint, button, feedback, result, dialog);

  for (const part of group.parts) {
    const section = element('section', 'group-answer-part'), label = element('label', '', `${group.caseNumber}-${part.partNumber} · ${part.content}`);
    const input = element('textarea'); input.rows = 3; input.required = true;
    input.id = `answer-${group.id}-${part.partNumber}`; label.htmlFor = input.id;
    input.placeholder = '在這裡填寫這一小題的回答…';
    input.oninput = () => { message(feedback); render(); };
    section.append(label, input); fields.append(section); inputs.set(part.sourceKey, input);
  }
  const remaining = () => group.status === 'open'
    ? Math.max(0, group.deadlineAt - (Date.now() - clockOffset)) : group.remainingMs;
  const canSend = () => group.status === 'open' && remaining() > 0 && online && isCurrent();
  const answers = () => Object.fromEntries(group.parts.map(part => [part.sourceKey, inputs.get(part.sourceKey).value.trim()]));
  const valid = () => group.parts.every(part => validText(inputs.get(part.sourceKey).value, 5000));

  function render() {
    tag.textContent = `CASE ${group.caseNumber} · 題組`; title.textContent = group.groupTitle;
    const settled = group.status === 'settled', active = canSend();
    root.dataset.state = settled ? 'settled' : state;
    for (const control of [timer, fields, hint, button, feedback]) control.hidden = settled;
    result.hidden = !settled;
    if (settled) {
      resultLabel.hidden = !group.firstPlace;
      resultIdentity.textContent = group.firstPlace
        ? `學號 ${group.firstPlace.studentNumber} · G${group.firstPlace.groupNumber}` : '尚無搶答第一名';
      for (const input of inputs.values()) input.disabled = true;
      button.disabled = true; if (dialog.open) dialog.close(); return;
    }
    timer.textContent = group.status === 'paused' ? `已暫停 · 剩餘 ${Math.ceil(group.remainingMs / 1000)} 秒`
      : `剩餘 ${Math.floor(Math.ceil(remaining() / 1000) / 60)}:${String(Math.ceil(remaining() / 1000) % 60).padStart(2, '0')}`;
    for (const input of inputs.values()) input.disabled = state !== 'editable' || !active;
    button.disabled = !active || state === 'sending' || state === 'sent' || (state === 'editable' && !valid());
    button.textContent = ({ editable: '搶答！', sending: '送出中…', sent: '已送出', retryable: '重試送出' })[state];
    button.classList.toggle('sent', state === 'sent');
    if (state === 'sent') message(feedback, '整組已送出，請等候老師的下一步。');
    else if (group.status === 'paused') message(feedback, '老師已暫停這組題目，草稿會保留。');
    else if (!active && remaining() <= 0) message(feedback, '本題組搶答時間已結束。');
    if (dialog.open && !active) dialog.close();
  }
  async function send() {
    if (!canSend() || state === 'sending' || state === 'sent') return;
    state = 'sending'; message(feedback); render();
    try {
      await api(`/api/student/groups/${group.groupId}/buzz`, { method: 'POST', body: { answers: frozen } });
      if (isCurrent()) { state = 'sent'; render(); }
    } catch (error) {
      if (!isCurrent()) return;
      if (error.status === 401) { expired(); return; }
      state = 'retryable';
      message(feedback, '未確認送出，若仍在搶答期間可重試同一份整組回答。', true); render();
    }
  }
  root.onsubmit = event => {
    event.preventDefault(); if (button.disabled || !isCurrent()) return;
    if (state === 'retryable') { void send(); return; }
    candidate = answers(); preview.replaceChildren(...group.parts.map(part => {
      const item = element('div', 'group-answer-preview-item');
      item.append(element('strong', '', `${group.caseNumber}-${part.partNumber} · ${part.content}`),
        element('p', '', candidate[part.sourceKey])); return item;
    }));
    dialog.showModal(); cancel.focus();
  };
  cancel.onclick = () => dialog.close();
  dialog.onclose = () => { if (isCurrent() && root.isConnected && state === 'editable' && canSend()) button.focus(); };
  confirm.onclick = () => {
    if (!canSend() || !candidate || !group.parts.every(part => validText(candidate[part.sourceKey], 5000))) {
      dialog.close(); render(); return;
    }
    frozen = { ...candidate }; dialog.close(); void send();
  };
  render();
  return { root, update(value, connected, offset) {
      group = value; online = connected; clockOffset = offset;
      if (group.submitted) state = 'sent'; render();
    }, tick: render, destroy() { if (dialog.open) dialog.close(); root.remove(); } };
}
