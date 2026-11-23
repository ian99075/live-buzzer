import { api, element, message } from '../api.js';
import { confirmDelete, stateLabel } from './question-controls.js';

export function groupControls(initial, { updated, failed, chooseAll }) {
  let group = initial, locked = false, busy = false;
  const root = element('div', 'group-control');
  const breadcrumb = element('div', 'case-breadcrumb');
  const all = element('button', '', '全部 Case'); all.type = 'button'; all.onclick = chooseAll;
  breadcrumb.append(all, element('span', '', '/'), element('span', '', `CASE ${group.caseNumber}`));
  const heading = element('div', 'group-heading'), copy = element('div');
  const label = element('span', 'case-label-large'), title = element('h2'), subtitle = element('p');
  copy.append(label, title, subtitle);
  const actions = element('div', 'group-tools');
  const remove = element('button', 'quiet danger', '刪除整組'); remove.type = 'button';
  actions.append(remove); heading.append(copy, actions);
  const timer = element('strong', 'question-timer'), state = element('span', 'status-tag');
  const controls = element('div', 'control-actions');
  const toggle = element('button', 'primary'), pause = element('button', '', '暫停');
  const stop = element('button', '', '提早結算'), edit = element('button', '', '設定秒數');
  for (const button of [toggle, pause, stop, edit]) button.type = 'button';
  controls.append(toggle, pause, stop, edit);
  const editor = element('form', 'question-editor'); editor.hidden = true;
  const durationLabel = element('label', '', '整組搶答時間（秒）');
  const duration = element('input'); duration.type = 'number'; duration.min = '1'; duration.max = '3600';
  duration.step = '1'; duration.required = true; duration.id = `group-duration-${group.groupId}`;
  durationLabel.htmlFor = duration.id;
  const save = element('button', 'primary', '儲存'), cancel = element('button', '', '取消');
  cancel.type = 'button'; cancel.onclick = () => { editor.hidden = true; };
  const editActions = element('div', 'control-actions'); editActions.append(save, cancel);
  const editFeedback = element('p', 'message'); editor.append(durationLabel, duration, editActions, editFeedback);
  const leader = element('section', 'winner'), leaderLabel = element('p', 'label');
  const leaderIdentity = element('div', 'leader-identity');
  leader.append(leaderLabel, leaderIdentity);
  const operationFeedback = element('p', 'message'); operationFeedback.setAttribute('role', 'status');
  root.append(breadcrumb, heading, state, timer, controls, editor, leader, operationFeedback);

  function render() {
    breadcrumb.lastChild.textContent = `CASE ${group.caseNumber}`;
    label.textContent = `CASE ${group.caseNumber} · 大題 / 題組`;
    title.textContent = group.title;
    subtitle.textContent = `${group.parts.length} 個小題 · 共用一次搶答、倒數與結算`;
    state.textContent = stateLabel(group.status); state.dataset.state = group.status;
    timer.dataset.deadlineAt = group.status === 'open' ? group.deadlineAt : '';
    timer.textContent = group.status === 'open' ? '' : group.status === 'settled'
      ? '倒數結束' : `設定 ${group.status === 'draft' ? group.durationSeconds : Math.ceil(group.remainingMs / 1000)} 秒`;
    if (group.status !== 'open') delete timer.dataset.deadlineAt;
    toggle.textContent = group.status === 'paused' ? '繼續搶答' : '開始搶答';
    toggle.hidden = !['draft', 'paused'].includes(group.status);
    pause.hidden = group.status !== 'open'; stop.hidden = !['open', 'paused'].includes(group.status);
    edit.hidden = group.status !== 'draft';
    for (const button of [remove, toggle, pause, stop, edit, save, cancel]) button.disabled = locked || busy;
    duration.disabled = locked || busy;
    const first = group.status === 'settled' ? group.winner : group.provisionalLeader;
    leader.hidden = !first;
    leaderLabel.textContent = group.status === 'settled' ? '搶答第一名 · 已結算' : '目前第一名 · 尚未結算';
    leaderIdentity.replaceChildren();
    if (first) leaderIdentity.append(element('strong', 'leader-student-number', `學號 ${first.studentNumber}`),
      element('span', 'student-group-badge', `G${first.groupNumber}`));
  }
  async function run(path, method = 'POST', body) {
    if (locked || busy) return;
    busy = true; render(); message(operationFeedback);
    try { await api(path, { method, ...(body ? { body } : {}) }); await updated(); }
    catch (error) { message(operationFeedback, error.message, true); failed(error); }
    finally { busy = false; render(); }
  }
  toggle.onclick = () => run(`/api/teacher/groups/${group.groupId}/${group.status === 'paused' ? 'resume' : 'start'}`);
  pause.onclick = () => run(`/api/teacher/groups/${group.groupId}/pause`);
  stop.onclick = () => run(`/api/teacher/groups/${group.groupId}/stop`);
  edit.onclick = () => { duration.value = group.durationSeconds; editor.hidden = false; duration.focus(); };
  editor.onsubmit = event => {
    event.preventDefault(); const value = Number(duration.value);
    if (!Number.isInteger(value) || value < 1 || value > 3600) {
      message(editFeedback, '搶答時間需為 1–3600 秒。', true); return;
    }
    editor.hidden = true;
    void run(`/api/teacher/groups/${group.groupId}`, 'PATCH', { durationSeconds: value });
  };
  remove.onclick = async () => {
    if (locked || busy || !await confirmDelete(group.caseNumber, null, true)) return;
    await run(`/api/teacher/groups/${group.groupId}`, 'DELETE');
  };
  render();
  return { root, update(value, exportLock) { group = value; locked = exportLock; render(); } };
}
