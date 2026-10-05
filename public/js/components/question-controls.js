import { api, element, message } from '../api.js';
import { questionEditor } from './question-editor.js';

export const stateLabel = state => ({ draft: '尚未開放', open: '開放中', stopped: '已停止' })[state];
export function confirmDelete(caseNumber) {
  return new Promise(resolve => {
    const dialog = element('dialog');
    dialog.append(element('h2', '', `刪除 Case ${caseNumber}？`), element('p', '', '這會移除這題及所有暫存回答，無法復原。其他題目與已寫入 Google Sheet 的內容不受影響。'));
    const controls = element('div', 'control-actions'); const cancel = element('button', '', '保留題目');
    const confirm = element('button', 'danger', '確定刪除');
    cancel.onclick = () => dialog.close('cancel'); confirm.onclick = () => dialog.close('confirm');
    dialog.onclose = () => { resolve(dialog.returnValue === 'confirm'); dialog.remove(); };
    controls.append(cancel, confirm); dialog.append(controls); document.body.append(dialog); dialog.showModal(); cancel.focus();
  });
}
export function questionControls(initial, callbacks) {
  let q = initial, locked = false, busy = false;
  const root = element('article', 'question-control'); root.dataset.questionId = q.id;
  const top = element('div', 'question-top'); const tag = element('span', 'case-tag', `CASE ${q.caseNumber}`);
  const state = element('span', 'status-tag'); top.append(tag, state);
  const content = element('p', 'question-text'); const actions = element('div', 'control-actions');
  const toggle = element('button', 'primary'); const edit = element('button', '', '編輯'); const remove = element('button', 'danger', '刪除');
  const feedback = element('p', 'message'); feedback.setAttribute('role', 'status');
  const editor = questionEditor(q, callbacks);
  function render() {
    content.textContent = q.content; state.textContent = stateLabel(q.status); state.dataset.state = q.status;
    toggle.textContent = q.status === 'open' ? '停止搶答' : '開始搶答';
    for (const button of [toggle, edit, remove]) button.disabled = locked || busy;
    editor.lock(locked || busy);
  }
  async function run(path, method = 'POST') {
    if (locked || busy) return; busy = true; render(); message(feedback);
    try { await api(path, { method }); await callbacks.updated(); }
    catch (error) { message(feedback, error.message, true); callbacks.failed(error); }
    finally { busy = false; render(); }
  }
  toggle.onclick = () => run(`/api/teacher/questions/${q.id}/${q.status === 'open' ? 'stop' : 'start'}`);
  edit.onclick = () => editor.open(q.content);
  remove.onclick = async () => { if (await confirmDelete(q.caseNumber)) await run(`/api/teacher/questions/${q.id}`, 'DELETE'); };
  actions.append(toggle, edit, remove); root.append(top, content, actions, editor.form, feedback); render();
  return { root, update(value, exportLock) { q = value; locked = exportLock; render(); } };
}
