import { api, element, message } from '../api.js';
import { questionEditor } from './question-editor.js';

export const stateLabel = state => ({ draft: '尚未開放', open: '搶答中', paused: '已暫停', settled: '已結算' })[state];
export function confirmDelete(caseNumber, partNumber = null, wholeGroup = false) {
  return new Promise(resolve => {
    const dialog = element('dialog');
    const label = wholeGroup ? `整個 Case ${caseNumber} 題組` : partNumber ? `Case ${caseNumber}-${partNumber}` : `Case ${caseNumber}`;
    dialog.append(element('h2', '', `刪除 ${label}？`), element('p', '', '這會移除相關題目與暫存回答，無法復原；已匯出的格將在下次彙整時清空。'));
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
  const groupHeading = element('p', 'group-title');
  const content = element('p', 'question-text'); const actions = element('div', 'control-actions');
  const timer = element('strong', 'question-timer');
  const toggle = element('button', 'primary'); const pause = element('button', '', '暫停'); const stop = element('button', '', '提早結算');
  const edit = element('button', '', '編輯'); const remove = element('button', 'danger', '刪除');
  const groupActions = element('div', 'control-actions group-actions');
  const convert = element('button', '', '轉為題組');
  const groupForm = element('form', 'group-editor'); groupForm.hidden = true;
  const groupLabel = element('label'); const groupInput = element('input'); groupInput.maxLength = 2000;
  const groupSubmit = element('button', 'primary', '儲存'); groupSubmit.type = 'submit';
  const groupCancel = element('button', '', '取消'); groupCancel.type = 'button'; groupCancel.onclick = () => { groupForm.hidden = true; };
  const groupFeedback = element('p', 'message'); groupFeedback.setAttribute('role', 'status');
  groupForm.append(groupLabel, groupInput, groupSubmit, groupCancel, groupFeedback);
  function showGroupForm() {
    if (locked || busy) return;
    groupForm.hidden = false; message(groupFeedback);
    groupLabel.textContent = '題組標題'; groupInput.value = q.content; groupInput.focus();
  }
  const feedback = element('p', 'message'); feedback.setAttribute('role', 'status');
  const editor = questionEditor(q, callbacks);
  function render() {
    tag.textContent = `CASE ${q.caseNumber}${q.partNumber ? `-${q.partNumber}` : ''}`;
    groupHeading.textContent = q.groupTitle || ''; groupHeading.hidden = !q.groupTitle;
    content.textContent = q.content; state.textContent = stateLabel(q.status); state.dataset.state = q.status;
    toggle.textContent = q.status === 'paused' ? '繼續搶答' : '開始搶答';
    toggle.hidden = !['draft','paused'].includes(q.status); pause.hidden = q.status !== 'open';
    stop.hidden = !['open','paused'].includes(q.status);
    timer.dataset.deadlineAt = q.status === 'open' ? q.deadlineAt : '';
    timer.textContent = q.status === 'open' ? '' : q.status === 'settled' ? '倒數結束' : `設定 ${q.status === 'draft' ? q.durationSeconds : Math.ceil(q.remainingMs / 1000)} 秒`;
    if (q.status !== 'open') delete timer.dataset.deadlineAt;
    for (const button of [toggle, pause, stop, edit, remove]) button.disabled = locked || busy;
    for (const button of [convert, groupSubmit, groupCancel]) button.disabled = locked || busy;
    convert.hidden = !!q.partNumber;
    groupActions.hidden = !!q.partNumber;
    if (q.partNumber) groupForm.hidden = true;
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
  remove.onclick = async () => { if (await confirmDelete(q.caseNumber, q.partNumber)) await run(`/api/teacher/questions/${q.id}`, 'DELETE'); };
  convert.onclick = showGroupForm;
  groupForm.onsubmit = async event => {
    event.preventDefault(); if (locked || busy) return;
    const value = groupInput.value.trim();
    if (!value || [...value].length > 2000) { message(groupFeedback, '請輸入 1–2000 字的題組標題。', true); return; }
    busy = true; render(); message(groupFeedback);
    try {
      await api(`/api/teacher/questions/${q.id}/convert-to-group`, { method: 'POST', body: { title: value } });
      groupForm.hidden = true; await callbacks.updated();
    } catch (error) { message(groupFeedback,error.message,true); callbacks.failed(error); }
    finally { busy = false; render(); }
  };
  groupActions.append(convert);
  actions.append(toggle, pause, stop, edit, remove); root.append(top, groupHeading, content, timer, actions, groupActions, groupForm, editor.form, feedback); render();
  return { root, update(value, exportLock) { q = value; locked = exportLock; render(); } };
}
