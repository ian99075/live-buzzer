import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { HttpError, textValue } from './http.js';

function duration(value) {
  if (!Number.isInteger(value) || value < 1 || value > 3600) throw new HttpError(400, '倒數秒數需為 1–3600 的整數。');
  return value;
}

export class Classroom {
  constructor({ clock = () => performance.now(), wallClock = () => Date.now(), schedule = setTimeout, cancel = clearTimeout } = {}) {
    this.questions = new Map(); this.caseIndex = new Map(); this.exporting = false;
    Object.assign(this, { clock, wallClock, schedule, cancel });
    this.timer = null; this.onChange = () => {};
  }
  setOnChange(callback) { this.onChange = callback; }
  close() { if (this.timer !== null) this.cancel(this.timer); this.timer = null; }
  unlocked() { if (this.exporting) throw new HttpError(409, '正在匯出，請稍後再操作題目。'); }
  all() { return [...this.questions.values()].sort((a, b) => a.caseNumber - b.caseNumber); }
  get(id) { const q = this.questions.get(id); if (!q) throw new HttpError(404, '找不到題目。'); return q; }
  add(caseNumber, content, durationSeconds = 60) {
    this.unlocked(); content = textValue(content, 2000, '題目'); durationSeconds = duration(durationSeconds);
    if (!Number.isInteger(caseNumber) || caseNumber < 1 || caseNumber > 6) throw new HttpError(400, '題號需為 Case 1–6。');
    if (this.caseIndex.has(caseNumber)) throw new HttpError(409, '這個 Case 已有題目。');
    const q = { id: randomUUID(), caseNumber, content, durationSeconds, status: 'draft',
      remainingMs: durationSeconds * 1000, deadlineMono: null, deadlineAt: null,
      submissions: new Map(), finalRanking: null, winnerKey: null, confirmedExport: false };
    this.questions.set(q.id, q); this.caseIndex.set(caseNumber, q.id); return q;
  }
  edit(id, content, durationSeconds) {
    this.unlocked(); this.settleDue(); const q = this.get(id);
    const nextContent = textValue(content, 2000, '題目');
    if (durationSeconds !== undefined) {
      if (q.status !== 'draft') throw new HttpError(409, '題目開始後不能修改倒數秒數。');
      q.durationSeconds = duration(durationSeconds); q.remainingMs = q.durationSeconds * 1000;
    }
    q.content = nextContent; return q;
  }
  remaining(q) { return q.status === 'open' ? Math.max(0, q.deadlineMono - this.clock()) : q.remainingMs; }
  rearm() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    const next = this.all().filter(q => q.status === 'open').sort((a, b) => a.deadlineMono - b.deadlineMono || a.caseNumber - b.caseNumber)[0];
    if (!next) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      // 某些計時器會捨去小數毫秒而略早喚醒；未到期時必須重新安排。
      if (!this.settleDue()) this.rearm();
    }, Math.max(0, next.deadlineMono - this.clock()));
    this.timer?.unref?.();
  }
  settleDue() {
    const now = this.clock();
    const due = this.all().filter(q => q.status === 'open' && q.deadlineMono <= now)
      .sort((a, b) => a.deadlineMono - b.deadlineMono || a.caseNumber - b.caseNumber);
    for (const q of due) this.settle(q);
    if (due.length) { this.rearm(); this.onChange(); }
    return due.length;
  }
  status(id, state) {
    this.unlocked(); this.settleDue(); const q = this.get(id);
    if (state === 'open' && q.status === 'draft') {
      q.status = 'open'; q.deadlineMono = this.clock() + q.remainingMs; q.deadlineAt = this.wallClock() + q.remainingMs;
    } else if (state === 'paused' && q.status === 'open') {
      q.remainingMs = this.remaining(q); q.status = 'paused'; q.deadlineMono = q.deadlineAt = null;
    } else if (state === 'open' && q.status === 'paused') {
      q.status = 'open'; q.deadlineMono = this.clock() + q.remainingMs; q.deadlineAt = this.wallClock() + q.remainingMs;
    } else if (state === 'settled' && ['open', 'paused'].includes(q.status)) {
      this.settle(q);
    } else throw new HttpError(409, '題目目前不能執行這項操作。');
    this.rearm(); return q;
  }
  remove(id) {
    this.unlocked(); this.settleDue(); const q = this.get(id);
    this.caseIndex.delete(q.caseNumber); this.questions.delete(id); this.rearm();
  }
  priorWins(studentNumber, excludeId) {
    return this.all().filter(q => q.id !== excludeId && q.status === 'settled' && q.winnerKey === studentNumber).length;
  }
  submissionById(q, id) { return [...q.submissions.values()].find(s => s.id === id); }
  ranking(q) {
    if (q.status === 'settled') {
      return q.finalRanking.filter(entry => !this.submissionById(q, entry.id).disqualified)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));
    }
    return [...q.submissions.values()].filter(s => !s.disqualified)
      .map(s => ({ id: s.id, priorWinCount: this.priorWins(s.studentNumber, q.id), acceptedOrder: s.acceptedOrder }))
      .sort((a, b) => a.priorWinCount - b.priorWinCount || a.acceptedOrder - b.acceptedOrder)
      .map((entry, index) => ({ id: entry.id, priorWinCount: entry.priorWinCount, rank: index + 1 }));
  }
  settle(q) {
    if (q.status === 'settled') return q;
    q.finalRanking = this.ranking(q); q.status = 'settled'; q.remainingMs = 0;
    q.deadlineMono = q.deadlineAt = null;
    q.winnerKey = q.finalRanking[0] ? this.submissionById(q, q.finalRanking[0].id).studentNumber : null;
    return q;
  }
  submit(id, studentNumber, answer) {
    answer = textValue(answer, 5000, '回答'); this.settleDue();
    const q = this.questions.get(id);
    if (!q || q.status !== 'open' || q.submissions.has(studentNumber)) return false;
    // 截止、去重與儲存同在同步區段；請勿在這裡加入 await。
    q.submissions.set(studentNumber, { id: randomUUID(), studentNumber, answer,
      acceptedAt: this.wallClock(), acceptedOrder: q.submissions.size + 1, disqualified: false });
    return true;
  }
  disqualify(questionId, submissionId) {
    this.unlocked(); this.settleDue(); const q = this.get(questionId);
    const entry = this.submissionById(q, submissionId);
    if (!entry) throw new HttpError(404, '找不到回答。');
    if (entry.disqualified) throw new HttpError(409, '這份回答已取消資格。');
    entry.disqualified = true;
    if (q.status === 'settled') {
      const next = this.ranking(q)[0]; q.winnerKey = next ? this.submissionById(q, next.id).studentNumber : null;
    }
    return q;
  }
  winners() {
    return this.all().filter(q => q.status === 'settled' && q.winnerKey !== null).map(q => ({
      caseNumber: q.caseNumber, studentNumber: q.winnerKey, answer: q.submissions.get(q.winnerKey).answer,
    }));
  }
}
