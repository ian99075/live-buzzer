import { element } from '../api.js';
import { stateLabel } from './question-controls.js';

function badge(q) { return element('span', `badge ${q.status}`, stateLabel(q.status)); }
export function questionNavigation(initial, choose) {
  const root = element('button', 'nav-button'); root.type = 'button'; root.dataset.questionId = initial.id;
  const top = element('div', 'nav-top'), tag = element('span', 'case-tag'), status = badge(initial);
  const content = element('p', 'nav-question'), foot = element('div', 'nav-foot');
  const count = element('span'), winner = element('span');
  top.append(tag, status); foot.append(count, winner); root.append(top, content, foot);
  root.onclick = () => choose(initial.id);
  return { root, update(q, selected) {
    root.setAttribute('aria-pressed', String(q.id === selected));
    tag.textContent = `CASE ${q.caseNumber}`; status.textContent = stateLabel(q.status); status.className = `badge ${q.status}`;
    content.textContent = q.content; count.textContent = `${q.submissions.length} 份回答`;
    winner.textContent = q.winner ? '已有第一名' : '等待作答';
  } };
}
export function renderOverview(container, questions, choose) {
  const grid = element('div', 'overview-grid');
  for (const q of questions) {
    const card = element('article', 'panel overview-card'), top = element('div', 'nav-top');
    card.dataset.questionId = q.id; top.append(element('span', 'case-tag', `CASE ${q.caseNumber}`), badge(q));
    card.append(top, element('h3', '', q.content));
    if (q.winner) {
      const winner = element('div', 'mini-winner');
      winner.append(element('span', 'label', '第一名 · 將匯出'), element('p', 'answer', q.winner.answer), element('p', 'identity', q.winner.studentNumber));
      card.append(winner);
    } else card.append(element('p', 'no-answer', '尚未收到回答'));
    const foot = element('div', 'card-foot'), view = element('button', '', '查看全部回答 →');
    view.type = 'button'; view.onclick = () => choose(q.id);
    foot.append(element('span', '', `${q.submissions.length} 份回答`), view); card.append(foot); grid.append(card);
  }
  container.replaceChildren(grid, element('p', 'overview-hint', '總覽顯示各題第一名；選取題目後，可管理題目並查看所有學生的完整回答。'));
}
export function renderDetailResponses(container, q) {
  const nodes = [];
  if (q.winner) {
    const winner = element('section', 'winner'), copy = element('div', 'winner-copy'), label = element('p', 'label', '第一名回答');
    winner.setAttribute('aria-label', '本題第一名'); label.append(element('span', '', '本題將匯出這一份'));
    copy.append(label, element('p', 'answer', q.winner.answer), element('p', 'identity', `學號 ${q.winner.studentNumber}`));
    winner.append(element('span', 'winner-symbol', '✦'), copy); nodes.push(winner);
  }
  if (!q.submissions.length) {
    const empty = element('div', 'detail-empty'); empty.append(element('strong', '', '✳'), element('p', '', q.status === 'open' ? '等待同學送出第一個回答' : '開放題目後，同學的回答會出現在這裡。'));
    nodes.push(empty);
  } else {
    const heading = element('div', 'table-heading'); heading.append(element('h3', '', '全部回答'), element('span', '', `依收到順序 · ${q.submissions.length} 份`));
    const table = element('table', 'answers'), thead = element('thead'), row = element('tr'), tbody = element('tbody');
    table.setAttribute('aria-label', `Case ${q.caseNumber} 全部學生回答`);
    for (const text of ['學號', '回答內容', '註記']) { const th = element('th', '', text); th.scope = 'col'; row.append(th); }
    thead.append(row);
    for (const a of q.submissions) {
      const first = q.winner?.studentNumber === a.studentNumber, tr = element('tr', first ? 'is-winner' : ''), note = element('td');
      note.append(element('span', first ? 'first-badge' : 'other-label', first ? '第一名' : '已收到'));
      tr.append(element('td', '', a.studentNumber), element('td', '', a.answer), note); tbody.append(tr);
    }
    table.append(thead, tbody); nodes.push(heading, table);
  }
  container.replaceChildren(...nodes);
}
