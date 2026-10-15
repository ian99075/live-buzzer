import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { HttpError, textValue } from './http.js';

function duration(value) {
  if (!Number.isInteger(value) || value < 1 || value > 3600) throw new HttpError(400, '倒數秒數需為 1–3600 的整數。');
  return value;
}
function partOrder(q) { return q.partNumber ?? 1; }
function compareQuestions(a, b) { return a.caseNumber - b.caseNumber || partOrder(a) - partOrder(b); }
export function coordinateKey(caseNumber, partNumber = null) { return `${caseNumber}:${partNumber ?? 1}`; }

export class Classroom {
  constructor({ clock = () => performance.now(), wallClock = () => Date.now(), schedule = setTimeout, cancel = clearTimeout } = {}) {
    this.questions = new Map(); this.caseIndex = new Map(); this.groupIndex = new Map(); this.studentGroups = new Map();
    this.confirmedCells = new Map(); this.ambiguousBatch = null; this.exporting = false;
    Object.assign(this, { clock, wallClock, schedule, cancel });
    this.timer = null; this.onChange = () => {};
  }
  setOnChange(callback) { this.onChange = callback; }
  close() { if (this.timer !== null) this.cancel(this.timer); this.timer = null; }
  unlocked() { if (this.exporting) throw new HttpError(409, '正在匯出，請稍後再操作題目。'); }
  all() { return [...this.questions.values()].sort(compareQuestions); }
  get(id) { const q = this.questions.get(id); if (!q) throw new HttpError(404, '找不到題目。'); return q; }
  registerStudent(studentNumber, groupNumber) {
    if (!Number.isSafeInteger(groupNumber) || groupNumber < 1) throw new HttpError(400, '組別需為正整數。');
    const existing = this.studentGroups.get(studentNumber);
    if (existing !== undefined && existing !== groupNumber) throw new HttpError(409, '此學號與先前組別不符，請確認輸入。');
    this.studentGroups.set(studentNumber, groupNumber);
    return groupNumber;
  }
  nextCaseNumber() {
    const number = this.caseIndex.size + 1;
    if (!Number.isSafeInteger(number) || number > Number.MAX_SAFE_INTEGER - 18) throw new HttpError(400, 'Case 題號已超出工作表範圍。');
    return number;
  }
  group(groupId) {
    const group = this.groupIndex.get(groupId);
    if (!group) throw new HttpError(404, '找不到題組。');
    return group;
  }
  makeQuestion(caseNumber, partNumber, content, durationSeconds) {
    const q = { id: randomUUID(), caseNumber, partNumber, content, durationSeconds, status: 'draft',
      remainingMs: durationSeconds * 1000, deadlineMono: null, deadlineAt: null,
      submissions: new Map(), finalRanking: null, winnerKey: null, confirmedExport: false };
    this.questions.set(q.id, q); return q;
  }
  add(content, durationSeconds = 60) {
    this.unlocked(); content = textValue(content, 2000, '題目'); durationSeconds = duration(durationSeconds);
    const caseNumber = this.nextCaseNumber();
    const q = this.makeQuestion(caseNumber, null, content, durationSeconds);
    this.caseIndex.set(caseNumber, { id: randomUUID(), caseNumber, kind: 'single', title: null, questionIds: [q.id] });
    return q;
  }
  addGroup(title, parts) {
    this.unlocked(); title = textValue(title, 2000, '題組標題');
    if (!Array.isArray(parts) || parts.length === 0) throw new HttpError(400, '題組至少需要一個小題。');
    if (parts.length > 10000) throw new HttpError(400, '小題數量已超出工作表欄數。');
    const normalized = parts.map(part => {
      if (!part || typeof part !== 'object' || Array.isArray(part) ||
        Object.keys(part).some(key => !['content','durationSeconds'].includes(key))) throw new HttpError(400, '小題欄位不正確。');
      return { content: textValue(part.content, 2000, '小題'), durationSeconds: duration(part.durationSeconds ?? 60) };
    });
    const caseNumber = this.nextCaseNumber();
    const questions = normalized.map((part, index) => this.makeQuestion(caseNumber, index + 1, part.content, part.durationSeconds));
    const group = { id: randomUUID(), caseNumber, kind: 'group', title, questionIds: questions.map(q => q.id) };
    this.caseIndex.set(caseNumber, group); this.groupIndex.set(group.id, group);
    return { ...group, questions };
  }
  addPart(groupId, content, durationSeconds = 60) {
    this.unlocked(); this.settleDue(); const group = this.group(groupId);
    content = textValue(content, 2000, '小題'); durationSeconds = duration(durationSeconds);
    const next = group.questionIds.length + 1;
    if (next > 10000) throw new HttpError(400, '小題編號已超出範圍。');
    const q = this.makeQuestion(group.caseNumber, next, content, durationSeconds);
    group.questionIds.push(q.id); return q;
  }
  renameGroup(groupId, title) {
    this.unlocked(); const group = this.group(groupId);
    group.title = textValue(title, 2000, '題組標題'); return group;
  }
  convertToGroup(id, title) {
    this.unlocked(); this.settleDue(); const q = this.get(id), group = this.caseIndex.get(q.caseNumber);
    if (group.kind !== 'single') throw new HttpError(409, '這題已屬於題組。');
    title = textValue(title, 2000, '題組標題');
    group.kind = 'group'; group.title = title; q.partNumber = 1; this.groupIndex.set(group.id, group);
    return group;
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
    const next = this.all().filter(q => q.status === 'open').sort((a, b) => a.deadlineMono - b.deadlineMono || compareQuestions(a, b))[0];
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
      .sort((a, b) => a.deadlineMono - b.deadlineMono || compareQuestions(a, b));
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
    this.dropQuestion(q);
    const group = this.caseIndex.get(q.caseNumber);
    group.questionIds = group.questionIds.filter(questionId => questionId !== id);
    if (!group.questionIds.length) {
      this.caseIndex.delete(group.caseNumber); this.groupIndex.delete(group.id);
      this.reindexCases(group.caseNumber);
    } else this.reindexParts(group);
    this.rearm();
  }
  reindexParts(group) {
    group.questionIds.forEach((id, index) => {
      const q = this.questions.get(id);
      if (q.partNumber === index + 1) return;
      q.partNumber = index + 1;
    });
  }
  reindexCases(deletedNumber) {
    const records = [...this.caseIndex.values()].sort((a, b) => a.caseNumber - b.caseNumber);
    this.caseIndex.clear();
    for (const record of records) {
      if (record.caseNumber > deletedNumber) {
        for (const id of record.questionIds) this.questions.get(id).caseNumber--;
        record.caseNumber--;
      }
      this.caseIndex.set(record.caseNumber, record);
    }
  }
  dropQuestion(q) {
    this.questions.delete(q.id);
  }
  removeGroup(groupId) {
    this.unlocked(); this.settleDue(); const group = this.group(groupId);
    for (const id of group.questionIds) this.dropQuestion(this.questions.get(id));
    this.caseIndex.delete(group.caseNumber); this.groupIndex.delete(group.id);
    this.reindexCases(group.caseNumber); this.rearm();
  }
  priorWins(groupNumber, excludeId) {
    return this.all().filter(q => q.id !== excludeId && q.status === 'settled' && q.winnerKey !== null &&
      q.submissions.get(q.winnerKey)?.groupNumber === groupNumber).length;
  }
  submissionById(q, id) { return [...q.submissions.values()].find(s => s.id === id); }
  ranking(q) {
    if (q.status === 'settled') {
      return q.finalRanking.filter(entry => !this.submissionById(q, entry.id).disqualified)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));
    }
    return [...q.submissions.values()].filter(s => !s.disqualified)
      .map(s => ({ id: s.id, priorWinCount: this.priorWins(s.groupNumber, q.id), acceptedOrder: s.acceptedOrder }))
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
  submit(id, studentNumber, answer, groupNumber) {
    answer = textValue(answer, 5000, '回答');
    if (this.studentGroups.get(studentNumber) !== groupNumber || groupNumber === undefined)
      throw new HttpError(401, '登入已失效，請重新登入。');
    this.settleDue();
    const q = this.questions.get(id);
    if (!q || q.status !== 'open' || q.submissions.has(studentNumber)) return false;
    // 截止、去重與儲存同在同步區段；請勿在這裡加入 await。
    q.submissions.set(studentNumber, { id: randomUUID(), studentNumber, groupNumber, answer,
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
      caseNumber: q.caseNumber, partNumber: q.partNumber,
      studentNumber: q.winnerKey, groupNumber: q.submissions.get(q.winnerKey).groupNumber,
      content: q.content, answer: q.submissions.get(q.winnerKey).answer,
    }));
  }
}
