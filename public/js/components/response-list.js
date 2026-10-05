import { element } from '../api.js';
import { stateLabel } from './question-controls.js';

export function renderResponses(container, questions) {
  const fragment = document.createDocumentFragment();
  for (const q of questions) {
    const section = element('section', 'response-group'); section.dataset.caseNumber = q.caseNumber;
    const top = element('div', 'question-top'); const state = element('span', 'status-tag', stateLabel(q.status)); state.dataset.state = q.status;
    top.append(element('span', 'case-tag', `CASE ${q.caseNumber}`), state);
    section.append(top, element('h3', 'question-text', q.content));
    if (!q.submissions.length) section.append(element('p', 'empty-small', '尚未收到回答'));
    for (const response of q.submissions) {
      const isWinner = q.winner?.studentNumber === response.studentNumber;
      const row = element('article', 'response-row'); row.dataset.winner = String(isWinner);
      const meta = element('div', 'response-meta'); meta.append(element('span', '', response.studentNumber));
      if (isWinner) meta.append(element('span', 'winner-badge', '第一名 · 將匯出'));
      row.append(meta, element('p', 'answer-text', response.answer)); section.append(row);
    }
    fragment.append(section);
  }
  container.replaceChildren(fragment);
}
