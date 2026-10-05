import { api, element, message, validText } from '../api.js';

export function questionEditor(question, { updated, failed }) {
  const form = element('form', 'question-editor'); form.hidden = true;
  const label = element('label', '', '修改題目內容'); const input = element('textarea');
  input.id = `edit-${question.id}`; label.htmlFor = input.id; input.rows = 3; input.required = true;
  const note = element('small', '', '修改或停止重開不會清除既有回答及第一名。');
  const actions = element('div', 'control-actions');
  const save = element('button', 'primary', '儲存'); save.type = 'submit';
  const cancel = element('button', '', '取消'); cancel.type = 'button'; cancel.onclick = () => { form.hidden = true; };
  const feedback = element('p', 'message'); feedback.setAttribute('role', 'status');
  actions.append(save, cancel); form.append(label, input, note, actions, feedback);
  let busy = false, locked = false;
  function sync() { input.disabled = save.disabled = cancel.disabled = busy || locked; }
  form.onsubmit = async event => {
    event.preventDefault(); if (busy || locked) return;
    if (!validText(input.value, 2000)) { message(feedback, '請填寫 1–2000 字的題目。', true); return; }
    busy = true; sync(); message(feedback);
    try { await api(`/api/teacher/questions/${question.id}`, { method: 'PATCH', body: { content: input.value } }); form.hidden = true; await updated(); }
    catch (error) { message(feedback, error.message, true); failed(error); }
    finally { busy = false; sync(); }
  };
  return { form, open(content) { if (locked) return; input.value = content; message(feedback); form.hidden = false; input.focus(); },
    lock(value) { locked = value; sync(); } };
}
