import { randomUUID } from 'node:crypto';
import { HttpError, textValue } from './http.js';

export class Classroom {
  constructor() { this.questions = new Map(); this.caseIndex = new Map(); this.exporting = false; }
  unlocked() { if (this.exporting) throw new HttpError(409, '正在匯出，請稍後再操作題目。'); }
  all() { return [...this.questions.values()].sort((a, b) => a.caseNumber - b.caseNumber); }
  get(id) { const q = this.questions.get(id); if (!q) throw new HttpError(404, '找不到題目。'); return q; }
  add(caseNumber, content) {
    this.unlocked();
    content = textValue(content, 2000, '題目');
    if (!Number.isInteger(caseNumber) || caseNumber < 1 || caseNumber > 6) throw new HttpError(400, '題號需為 Case 1–6。');
    if (this.caseIndex.has(caseNumber)) throw new HttpError(409, '這個 Case 已有題目。');
    const q = { id: randomUUID(), caseNumber, content, status: 'draft', submissions: new Map(), winnerKey: null };
    this.questions.set(q.id, q); this.caseIndex.set(caseNumber, q.id); return q;
  }
  edit(id, content) { this.unlocked(); const q = this.get(id); q.content = textValue(content, 2000, '題目'); return q; }
  status(id, state) { this.unlocked(); const q = this.get(id); q.status = state; return q; }
  remove(id) { this.unlocked(); const q = this.get(id); this.caseIndex.delete(q.caseNumber); this.questions.delete(id); }
  submit(id, studentNumber, answer) {
    answer = textValue(answer, 5000, '回答');
    const q = this.questions.get(id);
    if (!q || q.status !== 'open' || q.submissions.has(studentNumber)) return false;
    // 這段檢查與寫入必須同步完成：不得加入 await 或外部回呼。
    q.submissions.set(studentNumber, Object.freeze({ studentNumber, answer, acceptedOrder: q.submissions.size + 1 }));
    if (q.winnerKey === null) q.winnerKey = studentNumber;
    return true;
  }
  winners() {
    return this.all().filter(q => q.winnerKey !== null).map(q => ({
      caseNumber: q.caseNumber, studentNumber: q.winnerKey, answer: q.submissions.get(q.winnerKey).answer,
    }));
  }
}
