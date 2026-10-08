import { api, element, message, validText } from '../api.js';

export function questionEditor(question, { updated, failed }) {
  const form = element('form', 'question-editor'); form.hidden = true;
  const label = element('label', '', '修改題目內容'); const input = element('textarea');
  input.id = `edit-${question.id}`; label.htmlFor = input.id; input.rows = 3; input.required = true;
  const durationLabel = element('label', '', '搶答時間（秒）'); const duration = element('input');
  duration.type = 'number'; duration.min = '1'; duration.max = '3600'; duration.step = '1'; duration.required = true;
  duration.id = `edit-duration-${question.id}`; durationLabel.htmlFor = duration.id;
  const note = element('small', '', '倒數秒數僅能在開始搶答前修改；已結算題目不可重開。');
  const actions = element('div', 'control-actions');
  const save = element('button', 'primary', '儲存'); save.type = 'submit';
  const cancel = element('button', '', '取消'); cancel.type = 'button'; cancel.onclick = () => { form.hidden = true; };
  const feedback = element('p', 'message'); feedback.setAttribute('role', 'status');
  actions.append(save, cancel); form.append(label, input, durationLabel, duration, note, actions, feedback);
  let busy = false, locked = false;
  let draft = question.status === 'draft';
  function sync() { input.disabled = save.disabled = cancel.disabled = busy || locked; duration.disabled = busy || locked || !draft; durationLabel.hidden = duration.hidden = !draft; }
  form.onsubmit = async event => {
    event.preventDefault(); if (busy || locked) return;
    if (!validText(input.value, 2000)) { message(feedback, '請填寫 1–2000 字的題目。', true); return; }
    if (draft && (!Number.isInteger(Number(duration.value)) || Number(duration.value) < 1 || Number(duration.value) > 3600)) { message(feedback,'搶答時間需為 1–3600 秒。',true); return; }
    busy = true; sync(); message(feedback);
    try { await api(`/api/teacher/questions/${question.id}`, { method: 'PATCH', body: { content: input.value, ...(draft ? { durationSeconds: Number(duration.value) } : {}) } }); form.hidden = true; await updated(); }
    catch (error) { message(feedback, error.message, true); failed(error); }
    finally { busy = false; sync(); }
  };
  return { form, open(current) { if (locked) return; input.value = current.content; duration.value = current.durationSeconds; draft = current.status === 'draft'; sync(); message(feedback); form.hidden = false; input.focus(); },
    lock(value) { locked = value; sync(); } };
}
