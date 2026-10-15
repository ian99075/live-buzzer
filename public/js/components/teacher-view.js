import { api, element } from '../api.js';
import { stateLabel } from './question-controls.js';

function badge(q) { return element('span', `badge ${q.status}`, stateLabel(q.status)); }
function leader(q) { return q.status === 'settled' ? q.winner : q.provisionalLeader; }
function leaderLabel(q) { return q.status === 'settled' ? '搶答第一名 · 已結算' : '目前第一名 · 尚未結算'; }
const caseLabel = q => `CASE ${q.caseNumber}${q.partNumber ? `-${q.partNumber}` : ''}`;

export function caseGroups(questions) {
  const groups = [];
  for (const q of questions) {
    let group = groups.find(item => item.caseNumber === q.caseNumber);
    if (!group) {
      group = { groupId: q.groupId, caseNumber: q.caseNumber, title: q.groupTitle || q.content,
        isGroup: !!q.partNumber, questions: [] };
      groups.push(group);
    }
    group.questions.push(q);
  }
  return groups;
}

export function renderCaseNavigation(container, groups, selection, expanded, { all, group: openGroup, question }) {
  const nodes = [], allButton = element('button', 'nav-all', '全部 Case');
  allButton.type = 'button'; allButton.setAttribute('aria-current', String(selection.groupId === null && selection.questionId === null)); allButton.onclick = all;
  nodes.push(allButton);
  for (const item of groups) {
    const row = element('span', 'folder-main'), icon = element('span', 'folder-icon', item.isGroup ? '▣' : '▤');
    const copy = element('span', 'folder-copy');
    copy.append(element('span', 'folder-case', `CASE ${item.caseNumber}`), element('strong', 'folder-title', item.title));
    row.append(icon, copy);
    if (item.isGroup) {
      const folder = element('button', 'case-folder'); folder.type = 'button';
      const selected = selection.groupId === item.groupId && !selection.questionId;
      folder.setAttribute('aria-current', String(selected)); folder.setAttribute('aria-expanded', String(expanded.has(item.groupId)));
      row.append(element('span', 'folder-chevron', expanded.has(item.groupId) ? '⌄' : '›'));
      folder.append(row, element('span', 'case-metadata', `題組 · ${item.questions.length} 小題`));
      folder.onclick = () => {
        if (selected && expanded.has(item.groupId)) expanded.delete(item.groupId);
        else expanded.add(item.groupId);
        openGroup(item.groupId);
      };
      nodes.push(folder);
      if (expanded.has(item.groupId)) {
        const children = element('div', 'part-links');
        for (const q of item.questions) {
          const child = element('button', 'part-link'); child.type = 'button';
          child.setAttribute('aria-current', String(selection.questionId === q.id));
          child.append(element('span', 'part-number', `${q.caseNumber}-${q.partNumber}`), element('span', 'part-name', q.content));
          child.onclick = () => question(q.id); children.append(child);
        }
        nodes.push(children);
      }
    } else {
      const q = item.questions[0], single = element('button', 'single-case'); single.type = 'button';
      single.setAttribute('aria-current', String(selection.questionId === q.id));
      single.append(row, element('span', 'case-metadata', `單題 · ${stateLabel(q.status)}`));
      single.onclick = () => question(q.id); nodes.push(single);
    }
  }
  container.replaceChildren(...nodes);
}

export function renderOverview(container, groups, { group, question }) {
  const root = element('article', 'panel case-overview');
  root.append(element('span', 'case-label-large', 'ALL CASES'), element('h2', '', '全部題目'),
    element('p', 'overview-hint', '大題與單題分層呈現；題組打開後才查看所屬小題。'));
  for (const item of groups) {
    const row = element('div', 'overview-case'), copy = element('div', 'overview-case-copy');
    copy.append(element('h3', '', `CASE ${item.caseNumber} · ${item.title}`),
      element('p', '', item.isGroup ? `題組 · ${item.questions.length} 小題` : `單題 · ${stateLabel(item.questions[0].status)}`));
    const open = element('button', '', '開啟 →'); open.type = 'button';
    open.onclick = () => item.isGroup ? group(item.groupId) : question(item.questions[0].id);
    row.append(element('span', 'folder-icon', item.isGroup ? '▣' : '▤'), copy, open); root.append(row);
  }
  container.replaceChildren(root);
}

export function renderGroupQuestions(container, group, choose) {
  const heading = element('div', 'group-parts-heading');
  heading.append(element('h3', '', '小題列表'), element('span', '', '點選小題，查看回答與單題操作'));
  const grid = element('div', 'group-parts-grid');
  for (const q of group.questions) {
    const card = element('article', 'group-part-card'), top = element('div', 'group-part-top');
    top.append(element('span', 'part-tag', `${q.caseNumber}-${q.partNumber} · 小題`), badge(q));
    card.append(top, element('h4', '', q.content));
    const first = leader(q);
    const preview = element('div', `group-part-preview ${first ? '' : 'empty'}`);
    if (first) {
      const identity = element('div', 'group-part-preview-identity');
      identity.append(element('strong', 'group-part-preview-id', `學號 ${first.studentNumber}`),
        element('span', 'student-group-badge', `G${first.groupNumber}`));
      preview.append(element('span', 'group-part-preview-label', q.status === 'settled' ? '搶答第一名' : '目前第一名 · 尚未結算'),
        identity, element('p', 'group-part-preview-answer', first.answer));
    } else preview.append(element('span', 'group-part-preview-empty', '尚未收到回答'));
    card.append(preview);
    const foot = element('div', 'group-part-foot'), timer = element('small');
    if (q.status === 'open') timer.dataset.deadlineAt = q.deadlineAt;
    else timer.textContent = stateLabel(q.status);
    const open = element('button', '', '進入小題 →'); open.type = 'button'; open.onclick = () => choose(q.id);
    foot.append(element('small', '', `${q.submissions.length} 份回答 · `), timer, open);
    card.append(foot); grid.append(card);
  }
  container.replaceChildren(element('div', 'group-divider'), heading, grid);
}

export function renderDetailResponses(container, q, { updated, failed, locked }) {
  const nodes = [], first = leader(q);
  if (first) {
    const box = element('section', 'winner'), copy = element('div', 'winner-copy');
    box.setAttribute('aria-label', q.status === 'settled' ? '本題搶答第一名' : '本題目前第一名');
    const identity = element('div', 'leader-identity');
    identity.append(element('strong', 'leader-student-number', `學號 ${first.studentNumber}`),
      element('span', 'student-group-badge', `G${first.groupNumber}`));
    copy.append(element('p', 'label', leaderLabel(q)), identity, element('p', 'answer', first.answer));
    box.append(element('span', 'winner-symbol', '✦'), copy); nodes.push(box);
  }
  if (!q.submissions.length) {
    const empty = element('div', 'detail-empty');
    empty.append(element('strong', '', '✳'), element('p', '', q.status === 'open' ? '等待同學送出回答' : '尚無回答。'));
    nodes.push(empty);
  } else {
    const heading = element('div', 'table-heading');
    heading.append(element('h3', '', '全部回答'), element('span', '', `即時優先順位 · ${q.submissions.length} 份`));
    const table = element('table', 'answers'), thead = element('thead'), row = element('tr'), tbody = element('tbody');
    table.setAttribute('aria-label', `Case ${q.caseNumber}${q.partNumber ? `-${q.partNumber}` : ''} 全部學生回答`);
    for (const label of ['順位／學號／組別', '回答內容', '同組先前第一名', '狀態／操作']) {
      const th = element('th', '', label); th.scope = 'col'; row.append(th);
    }
    thead.append(row);
    const ordered = [...q.submissions].sort((a,b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.acceptedOrder - b.acceptedOrder);
    for (const entry of ordered) {
      const tr = element('tr', first?.id === entry.id ? 'is-winner' : '');
      const student = element('td', 'student-cell'); student.dataset.label = '學號／組別';
      const studentIdentity = element('div', 'student-cell-identity');
      if (entry.rank) studentIdentity.append(element('span', 'student-rank', `#${entry.rank}`));
      studentIdentity.append(element('strong', 'student-number', entry.studentNumber),
        element('span', 'student-group-badge', `G${entry.groupNumber}`));
      student.append(studentIdentity, element('small', 'accepted-order', `接收第 ${entry.acceptedOrder} 份`));
      const answer = element('td', '', entry.answer); answer.dataset.label = '回答';
      const count = element('td', '', `${entry.priorWinCount} 次`); count.dataset.label = '同組先前第一名';
      const action = element('td');
      action.dataset.label = '狀態／操作';
      if (entry.disqualified) action.append(element('span', 'other-label', '已取消資格'));
      else {
        const button = element('button', 'danger disqualify-button', '取消資格');
        button.type = 'button'; button.disabled = locked;
        button.setAttribute('aria-label', `取消學號 ${entry.studentNumber}（G${entry.groupNumber}）在 ${caseLabel(q)} 的回答資格`);
        button.onclick = async () => {
          if (!window.confirm(`取消學號 ${entry.studentNumber}（G${entry.groupNumber}）的回答資格？此題無法再次送出。`)) return;
          button.disabled = true;
          try { await api(`/api/teacher/questions/${q.id}/submissions/${entry.id}/disqualify`, { method: 'POST' }); await updated(); }
          catch (error) { failed(error); button.disabled = false; window.alert(error.message); }
        };
        action.append(button);
      }
      tr.append(student, answer, count, action); tbody.append(tr);
    }
    table.append(thead, tbody); nodes.push(heading, table);
  }
  container.replaceChildren(...nodes);
}
