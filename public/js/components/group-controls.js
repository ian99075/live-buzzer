import { api, element, message, validText } from '../api.js';
import { confirmDelete } from './question-controls.js';

export function groupControls(initial, { updated, failed, chooseAll, openPart }) {
  let group = initial, locked = false, busy = false;
  const root = element('div', 'group-control');
  const breadcrumb = element('div', 'case-breadcrumb');
  const all = element('button', '', '全部 Case'); all.type = 'button'; all.onclick = chooseAll;
  breadcrumb.append(all, element('span', '', '/'), element('span', '', `CASE ${group.caseNumber}`));
  const heading = element('div', 'group-heading'), copy = element('div');
  const label = element('span', 'case-label-large'), title = element('h2'), subtitle = element('p');
  copy.append(label, title, subtitle);
  const actions = element('div', 'group-tools');
  const append = element('button', 'primary', '＋ 新增小題');
  const rename = element('button', 'quiet', '改題組標題');
  const remove = element('button', 'quiet danger', '刪除整組');
  for (const button of [append, rename, remove]) button.type = 'button';
  actions.append(append, rename, remove); heading.append(copy, actions);
  const form = element('form', 'group-rename'); form.hidden = true;
  const renameLabel = element('label', '', '新的大題標題');
  const input = element('input'); input.maxLength = 2000; input.required = true;
  renameLabel.append(input);
  const formActions = element('div', 'control-actions');
  const save = element('button', 'primary', '儲存標題'); save.type = 'submit';
  const cancel = element('button', 'quiet', '取消'); cancel.type = 'button'; cancel.onclick = () => { form.hidden = true; };
  const feedback = element('p', 'message'); feedback.setAttribute('role', 'status');
  formActions.append(cancel, save); form.append(renameLabel, formActions, feedback);
  const operationFeedback = element('p', 'message'); operationFeedback.setAttribute('role', 'status');
  root.append(breadcrumb, heading, form, operationFeedback);

  function render() {
    breadcrumb.lastChild.textContent = `CASE ${group.caseNumber}`;
    label.textContent = `CASE ${group.caseNumber} · 大題 / 題組`;
    title.textContent = group.title;
    subtitle.textContent = `${group.questions.length} 個小題 · 每個小題獨立搶答、倒數與結算`;
    for (const button of [append, rename, remove, save, cancel]) button.disabled = locked || busy;
    input.disabled = locked || busy;
  }
  append.onclick = () => { if (!locked && !busy) openPart(group); };
  rename.onclick = () => {
    if (locked || busy) return;
    input.value = group.title; message(feedback); form.hidden = false; input.focus();
  };
  remove.onclick = async () => {
    if (locked || busy || !await confirmDelete(group.caseNumber, null, true)) return;
    busy = true; render(); message(operationFeedback);
    try { await api(`/api/teacher/groups/${group.groupId}`, { method: 'DELETE' }); await updated(); }
    catch (error) { message(operationFeedback, error.message, true); failed(error); }
    finally { busy = false; render(); }
  };
  form.onsubmit = async event => {
    event.preventDefault(); if (locked || busy) return;
    if (!validText(input.value, 2000)) { message(feedback, '請填寫 1–2000 字的題組標題。', true); return; }
    busy = true; render(); message(feedback);
    try {
      await api(`/api/teacher/groups/${group.groupId}`, { method: 'PATCH', body: { title: input.value } });
      form.hidden = true; await updated();
    } catch (error) { message(feedback, error.message, true); failed(error); }
    finally { busy = false; render(); }
  };
  render();
  return { root, update(value, exportLock) { group = value; locked = exportLock; render(); } };
}
