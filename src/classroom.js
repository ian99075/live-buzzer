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
function competitionFields(durationSeconds = 60) {
  return { durationSeconds, status: 'draft', remainingMs: durationSeconds * 1000,
    deadlineMono: null, deadlineAt: null, submissions: new Map(), finalRanking: null, winnerKey: null };
}

export class Classroom {
  constructor({ clock = () => performance.now(), wallClock = () => Date.now(), schedule = setTimeout, cancel = clearTimeout } = {}) {
    this.questions = new Map(); this.caseIndex = new Map(); this.groupIndex = new Map(); this.sourceIndex = new Map(); this.studentGroups = new Map();
    this.confirmedCells = new Map(); this.ambiguousBatch = null; this.exporting = false;
    Object.assign(this, { clock, wallClock, schedule, cancel });
    this.timer = null; this.onChange = () => {};
  }
  setOnChange(callback) { this.onChange = callback; }
  close() { if (this.timer !== null) this.cancel(this.timer); this.timer = null; }
  unlocked() { if (this.exporting) throw new HttpError(409, '正在匯入或匯出，請稍後再操作題目。'); }
  importQuestions(grid) {
    const incoming = [...grid.questions.values()];
    for (const entry of incoming) {
      const record = this.caseIndex.get(entry.caseNumber);
      if (record && record.kind !== (entry.partNumber === null ? 'single' : 'group'))
        throw new HttpError(409, `Case ${entry.caseNumber} 的單題／題組型態與課堂不同，請先處理原題。`);
      const existing = this.sourceIndex.get(entry.key);
      if (existing && (existing.caseNumber !== entry.caseNumber || existing.partNumber !== entry.partNumber))
        throw new HttpError(409, `題目 ${entry.key} 的編號與課堂不同。`);
      if (!existing && record?.kind === 'group' && record.status !== 'draft')
        throw new HttpError(409, `Case ${entry.caseNumber} 已開始，不能新增小題；本次匯入未修改課堂。`);
    }
    this.settleDue();
    let added = 0, updated = 0, retained = 0;
    for (const entry of incoming) {
      const existing = this.sourceIndex.get(entry.key);
      if (existing) {
        const record = this.caseIndex.get(entry.caseNumber);
        if ((record.kind === 'group' ? record.status : existing.status) === 'draft') {
          if (existing.content !== entry.content) updated++; existing.content = entry.content;
        }
        else retained++;
        continue;
      }
      let record = this.caseIndex.get(entry.caseNumber);
      if (!record) {
        record = { id: randomUUID(), caseNumber: entry.caseNumber, kind: entry.partNumber === null ? 'single' : 'group',
          title: entry.partNumber === null ? null : `題組 ${entry.caseNumber}`, questionIds: [],
          ...(entry.partNumber === null ? {} : competitionFields()) };
        this.caseIndex.set(entry.caseNumber, record);
        if (record.kind === 'group') this.groupIndex.set(record.id, record);
      }
      const q = this.makeQuestion(entry.caseNumber, entry.partNumber, entry.content, 60);
      q.sourceKey = entry.key; this.sourceIndex.set(entry.key, q); record.questionIds.push(q.id); added++;
    }
    for (const record of this.caseIndex.values()) record.questionIds.sort((a,b) => partOrder(this.get(a)) - partOrder(this.get(b)));
    const missing = [...this.sourceIndex.keys()].filter(key => !grid.questions.has(key));
    return { added, updated, retained, missing };
  }
  all() { return [...this.questions.values()].sort(compareQuestions); }
  competitions() { return [...this.caseIndex.values()].sort((a, b) => a.caseNumber - b.caseNumber)
    .map(record => record.kind === 'group' ? record : this.get(record.questionIds[0])); }
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
    const q = { id: randomUUID(), caseNumber, partNumber, content,
      ...competitionFields(durationSeconds), confirmedExport: false };
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
    const questions = normalized.map((part, index) => {
      const q = this.makeQuestion(caseNumber, index + 1, part.content, part.durationSeconds);
      q.sourceKey = `${caseNumber}_${index + 1}`; this.sourceIndex.set(q.sourceKey, q); return q;
    });
    const group = { id: randomUUID(), caseNumber, kind: 'group', title,
      questionIds: questions.map(q => q.id), ...competitionFields() };
    this.caseIndex.set(caseNumber, group); this.groupIndex.set(group.id, group);
    return { ...group, questions };
  }
  addPart(groupId, content, durationSeconds = 60) {
    this.unlocked(); this.settleDue(); const group = this.group(groupId);
    if (group.status !== 'draft') throw new HttpError(409, '題組開始後不能新增小題。');
    content = textValue(content, 2000, '小題'); durationSeconds = duration(durationSeconds);
    const next = group.questionIds.length + 1;
    if (next > 10000) throw new HttpError(400, '小題編號已超出範圍。');
    const q = this.makeQuestion(group.caseNumber, next, content, durationSeconds);
    q.sourceKey = `${group.caseNumber}_${next}`; this.sourceIndex.set(q.sourceKey, q);
    group.questionIds.push(q.id); return q;
  }
  renameGroup(groupId, title) {
    this.unlocked(); const group = this.group(groupId);
    group.title = textValue(title, 2000, '題組標題'); return group;
  }
  convertToGroup(id, title) {
    throw new HttpError(409, '題型僅由 Google Sheet 決定，不能在課堂內轉換。');
  }
  editDuration(id, durationSeconds) {
    this.unlocked(); this.settleDue(); const q = this.get(id);
    if (q.partNumber !== null) throw new HttpError(409, '請設定整個題組的倒數秒數。');
    if (q.status !== 'draft') throw new HttpError(409, '題目開始後不能修改倒數秒數。');
    q.durationSeconds = duration(durationSeconds); q.remainingMs = q.durationSeconds * 1000; return q;
  }
  editGroupDuration(groupId, durationSeconds) {
    this.unlocked(); this.settleDue(); const group = this.group(groupId);
    if (group.status !== 'draft') throw new HttpError(409, '題組開始後不能修改倒數秒數。');
    group.durationSeconds = duration(durationSeconds); group.remainingMs = group.durationSeconds * 1000;
    return group;
  }
  remaining(q) { return q.status === 'open' ? Math.max(0, q.deadlineMono - this.clock()) : q.remainingMs; }
  rearm() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    const next = this.competitions().filter(q => q.status === 'open').sort((a, b) => a.deadlineMono - b.deadlineMono || a.caseNumber - b.caseNumber)[0];
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
    const due = this.competitions().filter(q => q.status === 'open' && q.deadlineMono <= now)
      .sort((a, b) => a.deadlineMono - b.deadlineMono || a.caseNumber - b.caseNumber);
    for (const q of due) this.settle(q);
    if (due.length) { this.rearm(); this.onChange(); }
    return due.length;
  }
  status(id, state) {
    this.unlocked(); this.settleDue(); const q = this.get(id);
    if (q.partNumber !== null) throw new HttpError(409, '請操作整個題組。');
    return this.transition(q, state);
  }
  groupStatus(groupId, state) {
    this.unlocked(); this.settleDue(); return this.transition(this.group(groupId), state);
  }
  transition(q, state) {
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
    const group = this.caseIndex.get(q.caseNumber);
    if (group.kind === 'group' && group.status !== 'draft')
      throw new HttpError(409, '題組開始後不能單獨刪除小題；可刪除整組。');
    this.dropQuestion(q);
    group.questionIds = group.questionIds.filter(questionId => questionId !== id);
    if (!group.questionIds.length) {
      this.caseIndex.delete(group.caseNumber); this.groupIndex.delete(group.id);
    }
    this.rearm();
  }
  dropQuestion(q) {
    this.questions.delete(q.id); if (q.sourceKey) this.sourceIndex.delete(q.sourceKey);
  }
  removeGroup(groupId) {
    this.unlocked(); this.settleDue(); const group = this.group(groupId);
    for (const id of group.questionIds) this.dropQuestion(this.questions.get(id));
    this.caseIndex.delete(group.caseNumber); this.groupIndex.delete(group.id);
    this.rearm();
  }
  priorWins(groupNumber, excludeId) {
    return this.competitions().filter(q => q.id !== excludeId && q.status === 'settled' && q.winnerKey !== null &&
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
    if (!q || q.partNumber !== null || q.status !== 'open' || q.submissions.has(studentNumber)) return false;
    // 截止、去重與儲存同在同步區段；請勿在這裡加入 await。
    q.submissions.set(studentNumber, { id: randomUUID(), studentNumber, groupNumber, answer,
      acceptedAt: this.wallClock(), acceptedOrder: q.submissions.size + 1, disqualified: false });
    return true;
  }
  submitGroup(groupId, studentNumber, answers, groupNumber) {
    const group = this.groupIndex.get(groupId);
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new HttpError(400, '題組回答欄位不正確。');
    if (!group) {
      if (!Object.keys(answers).length) throw new HttpError(400, '題組回答欄位不正確。');
      for (const [key, value] of Object.entries(answers)) {
        if (!/^[1-9]\d*_[1-9]\d*$/.test(key)) throw new HttpError(400, '題組回答欄位不正確。');
        textValue(value, 5000, '回答');
      }
      return false;
    }
    const parts = group.questionIds.map(id => this.get(id));
    const keys = parts.map(part => part.sourceKey);
    if (keys.some(key => !key) || Object.keys(answers).length !== keys.length ||
      Object.keys(answers).some(key => !keys.includes(key))) throw new HttpError(400, '請填寫題組所有小題，且不可增加額外欄位。');
    const normalized = Object.fromEntries(keys.map(key => [key, textValue(answers[key], 5000, '回答')]));
    if (this.studentGroups.get(studentNumber) !== groupNumber || groupNumber === undefined)
      throw new HttpError(401, '登入已失效，請重新登入。');
    this.settleDue();
    if (group.status !== 'open' || group.submissions.has(studentNumber)) return false;
    // 截止、去重與整組儲存同在同步區段；不得在此插入 await。
    group.submissions.set(studentNumber, { id: randomUUID(), studentNumber, groupNumber,
      answers: normalized, acceptedAt: this.wallClock(), acceptedOrder: group.submissions.size + 1, disqualified: false });
    return true;
  }
  disqualify(questionId, submissionId) {
    this.unlocked(); this.settleDue(); const q = this.get(questionId);
    if (q.partNumber !== null) throw new HttpError(409, '請取消整份題組回答的資格。');
    return this.disqualifyEntry(q, submissionId);
  }
  disqualifyGroup(groupId, submissionId) {
    this.unlocked(); this.settleDue(); return this.disqualifyEntry(this.group(groupId), submissionId);
  }
  disqualifyEntry(q, submissionId) {
    const entry = this.submissionById(q, submissionId);
    if (!entry) throw new HttpError(404, '找不到回答。');
    if (entry.disqualified) throw new HttpError(409, '這份回答已取消資格。');
    entry.disqualified = true;
    if (q.status === 'settled') {
      const next = this.ranking(q)[0]; q.winnerKey = next ? this.submissionById(q, next.id).studentNumber : null;
    }
    return q;
  }
}
