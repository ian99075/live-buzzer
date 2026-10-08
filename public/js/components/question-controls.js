import { api, element, message } from '../api.js';
import { questionEditor } from './question-editor.js';

export const stateLabel = state => ({ draft: '尚未開放', open: '搶答中', paused: '已暫停', settled: '已結算' })[state];
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
  const timer = element('strong', 'question-timer');
  const toggle = element('button', 'primary'); const pause = element('button', '', '暫停'); const stop = element('button', '', '提早結算');
  const edit = element('button', '', '編輯'); const remove = element('button', 'danger', '刪除');
  const feedback = element('p', 'message'); feedback.setAttribute('role', 'status');
  const editor = questionEditor(q, callbacks);
  function render() {
    content.textContent = q.content; state.textContent = stateLabel(q.status); state.dataset.state = q.status;
    toggle.textContent = q.status === 'paused' ? '繼續搶答' : '開始搶答';
    toggle.hidden = !['draft','paused'].includes(q.status); pause.hidden = q.status !== 'open';
    stop.hidden = !['open','paused'].includes(q.status);
    timer.dataset.deadlineAt = q.status === 'open' ? q.deadlineAt : '';
    timer.textContent = q.status === 'open' ? '' : q.status === 'settled' ? '倒數結束' : `設定 ${q.status === 'draft' ? q.durationSeconds : Math.ceil(q.remainingMs / 1000)} 秒`;
    if (q.status !== 'open') delete timer.dataset.deadlineAt;
    for (const button of [toggle, pause, stop, edit, remove]) button.disabled = locked || busy;
    editor.lock(locked || busy);
  }
  async function run(path, method = 'POST') {
    if (locked || busy) return; busy = true; render(); message(feedback);
    try { await api(path, { method }); await callbacks.updated(); }
    catch (error) { message(feedback, error.message, true); callbacks.failed(error); }
    finally { busy = false; render(); }
  }
  toggle.onclick = () => run(`/api/teacher/questions/${q.id}/${q.status === 'paused' ? 'resume' : 'start'}`);
  pause.onclick = () => run(`/api/teacher/questions/${q.id}/pause`);
  stop.onclick = () => run(`/api/teacher/questions/${q.id}/stop`);
  edit.onclick = () => editor.open(q);
  remove.onclick = async () => { if (await confirmDelete(q.caseNumber)) await run(`/api/teacher/questions/${q.id}`, 'DELETE'); };
  actions.append(toggle, pause, stop, edit, remove); root.append(top, content, timer, actions, editor.form, feedback); render();
  return { root, update(value, exportLock) { q = value; locked = exportLock; render(); } };
}
