import { api, element } from '../api.js';
import { stateLabel } from './question-controls.js';

function badge(q) { return element('span', `badge ${q.status}`, stateLabel(q.status)); }
function leader(q) { return q.status === 'settled' ? q.winner : q.provisionalLeader; }
function leaderLabel(q) { return q.status === 'settled' ? '最終第一名 · 將匯出' : '目前排名第一 · 尚未結算'; }

export function questionNavigation(initial, choose) {
  const root = element('button', 'nav-button'); root.type = 'button'; root.dataset.questionId = initial.id;
  const top = element('div', 'nav-top'), tag = element('span', 'case-tag'), status = badge(initial);
  const content = element('p', 'nav-question'), timer = element('span', 'nav-timer'), foot = element('div', 'nav-foot');
  const count = element('span'), first = element('span');
  top.append(tag, status); foot.append(count, first); root.append(top, content, timer, foot);
  root.onclick = () => choose(initial.id);
  return { root, update(q, selected) {
    root.setAttribute('aria-pressed', String(q.id === selected));
    tag.textContent = `CASE ${q.caseNumber}`; status.textContent = stateLabel(q.status); status.className = `badge ${q.status}`;
    content.textContent = q.content; count.textContent = `${q.submissions.length} 份回答`;
    if (q.status === 'open') { timer.dataset.deadlineAt = q.deadlineAt; timer.textContent = ''; }
    else { delete timer.dataset.deadlineAt; timer.textContent = q.status === 'paused' ? `暫停 · 剩餘 ${Math.ceil(q.remainingMs / 1000)} 秒` : ''; }
    first.textContent = leader(q) ? (q.status === 'settled' ? '已有得標者' : '已有暫定第一') : '等待作答';
  } };
}

export function renderOverview(container, questions, choose) {
  const grid = element('div', 'overview-grid');
  for (const q of questions) {
    const card = element('article', 'panel overview-card'), top = element('div', 'nav-top');
    card.dataset.questionId = q.id; top.append(element('span', 'case-tag', `CASE ${q.caseNumber}`), badge(q));
    card.append(top, element('h3', '', q.content));
    const timer = element('strong', 'overview-timer');
    if (q.status === 'open') { timer.dataset.deadlineAt = q.deadlineAt; }
    else if (q.status === 'paused') timer.textContent = `已暫停 · 剩餘 ${Math.ceil(q.remainingMs / 1000)} 秒`;
    else timer.textContent = q.status === 'settled' ? '已結算' : `設定 ${q.durationSeconds} 秒`;
    card.append(timer);
    const first = leader(q);
    if (first) {
      const box = element('div', 'mini-winner');
      box.append(element('span', 'label', leaderLabel(q)), element('p', 'answer', first.answer), element('p', 'identity', first.studentNumber));
      card.append(box);
    } else card.append(element('p', 'no-answer', q.status === 'settled' ? '沒有有效得標者' : '尚未收到回答'));
    const foot = element('div', 'card-foot'), view = element('button', '', '查看全部回答 →');
    view.type = 'button'; view.onclick = () => choose(q.id);
    foot.append(element('span', '', `${q.submissions.length} 份回答`), view); card.append(foot); grid.append(card);
  }
  container.replaceChildren(grid, element('p', 'overview-hint', '開放期間顯示目前第一名；結算後顯示正式得標者。選取題目可查看順位及所有回答。'));
}

export function renderDetailResponses(container, q, { updated, failed, locked }) {
  const nodes = [], first = leader(q);
  if (first) {
    const box = element('section', 'winner'), copy = element('div', 'winner-copy');
    box.setAttribute('aria-label', q.status === 'settled' ? '本題正式得標者' : '本題目前第一名');
    copy.append(element('p', 'label', leaderLabel(q)), element('p', 'answer', first.answer), element('p', 'identity', `學號 ${first.studentNumber}`));
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
    table.setAttribute('aria-label', `Case ${q.caseNumber} 全部學生回答`);
    for (const label of ['順位／學號', '回答內容', '先前得標', '狀態／操作']) {
      const th = element('th', '', label); th.scope = 'col'; row.append(th);
    }
    thead.append(row);
    const ordered = [...q.submissions].sort((a,b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.acceptedOrder - b.acceptedOrder);
    for (const entry of ordered) {
      const tr = element('tr', first?.id === entry.id ? 'is-winner' : '');
      const student = element('td', '', `${entry.rank ? `#${entry.rank} · ` : ''}${entry.studentNumber}`);
      student.append(element('small', 'accepted-order', `接收第 ${entry.acceptedOrder} 份`));
      const answer = element('td', '', entry.answer);
      const count = element('td', '', `${entry.priorWinCount} 次`);
      const action = element('td');
      if (entry.disqualified) action.append(element('span', 'other-label', '已取消資格'));
      else {
        const button = element('button', 'danger disqualify-button', '取消資格');
        button.type = 'button'; button.disabled = locked;
        button.setAttribute('aria-label', `取消 ${entry.studentNumber} 在 Case ${q.caseNumber} 的回答資格`);
        button.onclick = async () => {
          if (!window.confirm(`取消學號 ${entry.studentNumber} 的回答資格？此題無法再次送出。`)) return;
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
