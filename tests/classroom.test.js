import test from 'node:test';
import assert from 'node:assert/strict';
import { Classroom } from '../src/classroom.js';
import { submit } from './grouped-submit.js';
import { Sessions } from '../src/auth.js';
import { testConfig } from './helpers.js';
import { readConfig } from '../src/config.js';

test('設定、登入與工作階段只在記憶體中', () => {
  assert.throws(() => readConfig({}), /TEACHER_USERNAME/);
  const config = testConfig({ sessionMs: 10, secureCookie: true }); let now = 0;
  const auth = new Sessions(config, () => now);
  auth.teacher('teacher', 'test-password-only');
  assert.throws(() => auth.teacher('other', 'test-password-only'), { status: 401 });
  assert.throws(() => auth.teacher('teacher', 'wrong'), { status: 401 });
  const token = auth.create('student', { studentNumber: '00123' });
  assert.equal(auth.find(token, 'student').studentNumber, '00123');
  assert.equal(auth.find(token, 'teacher'), null);
  assert.equal(auth.entries.has(token), false);
  assert.match(auth.cookie('student', token), /HttpOnly; SameSite=Strict; Secure/);
  now = 11; assert.equal(auth.find(token, 'student'), null);
});

test('多題獨立、全部回答、去重、結算鎖定與刪除重建', () => {
  const s = new Classroom(); const a = s.add('題目一'); const b = s.add('題目二');
  assert.equal(a.caseNumber, 1); assert.equal(b.caseNumber, 2);
  assert.throws(() => s.add(' '), { status: 400 });
  assert.throws(() => s.edit(a.id, ' '), { status: 400 });
  s.status(a.id, 'open'); s.status(b.id, 'open');
  assert.throws(() => submit(s, a.id, '001', ' '), { status: 400 });
  assert.equal(submit(s, a.id, '001', '甲'), true);
  assert.equal(submit(s, a.id, '002', '乙'), true);
  assert.equal(submit(s, a.id, '001', '改答案'), false);
  submit(s, b.id, '002', '第二題答案');
  assert.equal(s.ranking(a)[0].id, a.submissions.get('001').id); assert.equal(b.winnerKey, null);
  assert.equal(a.submissions.size, 2); assert.equal(a.submissions.get('001').answer, '甲');
  s.status(a.id, 'settled'); assert.equal(submit(s, a.id, '003', '晚到'), false);
  assert.equal(b.status, 'open'); assert.throws(() => s.status(a.id, 'open'), { status: 409 });
  assert.equal(a.winnerKey, '001'); assert.equal(a.submissions.size, 2);
  s.edit(a.id, '修正文字'); assert.equal(a.submissions.size, 2);
  s.remove(a.id); assert.equal(b.caseNumber, 1);
  const replacement = s.add('新題'); s.status(replacement.id, 'open');
  assert.notEqual(replacement.id, a.id); assert.equal(submit(s, a.id, '004', '舊請求'), false);
  assert.equal(replacement.submissions.size, 0); assert.equal(replacement.caseNumber, 2);
  assert.deepEqual(new Classroom().all(), []);
  s.close();
});

test('題組小題及 Case 刪除後連續遞補，群組 ID 與題目 ID 不變', () => {
  const s = new Classroom();
  const group = s.addGroup('第一題組', [{ content: '1-1' }, { content: '1-2', durationSeconds: 90 }, { content: '1-3' }]);
  assert.deepEqual(group.questions.map(q => q.partNumber), [1, 2, 3]);
  assert.equal(group.questions[1].durationSeconds, 90);
  assert.throws(() => s.addGroup('空題組', []), { status: 400 });
  s.status(group.questions[0].id, 'open');
  const fourth = s.addPart(group.id, '1-4');
  assert.equal(fourth.status, 'draft'); assert.equal(group.questions[0].status, 'open');
  s.remove(group.questions[1].id);
  assert.equal(group.questions[2].partNumber, 2); assert.equal(fourth.partNumber, 3);
  const fifth = s.addPart(group.id, '1-4'); assert.equal(fifth.partNumber, 4);
  assert.deepEqual(s.all().map(q => q.partNumber), [1, 2, 3, 4]);
  const second = s.add('第二題'); assert.equal(second.caseNumber, 2);
  s.removeGroup(group.id); assert.equal(s.all().length, 1); assert.equal(second.caseNumber, 1);
  for (let i = 2; i <= 7; i++) assert.equal(s.add(`第 ${i} 題`).caseNumber, i);
  assert.deepEqual(s.all().map(q => q.caseNumber), [1, 2, 3, 4, 5, 6, 7]);
  assert.throws(() => s.get(fourth.id), { status: 404 });
  s.close();
});

test('刪除前方 Case 時，開放題與題組保持原 ID、回答和倒數', () => {
  const s = new Classroom(); const first = s.add('刪除我');
  const group = s.addGroup('題組', [{ content: '小題' }]);
  const last = s.add('第三題', 30);
  s.status(group.questions[0].id, 'open'); s.status(last.id, 'open');
  submit(s, group.questions[0].id, '001', '題組答案'); submit(s, last.id, '002', '第三題答案');
  const deadline = last.deadlineMono;
  s.remove(first.id);
  assert.equal(group.questions[0].caseNumber, 1); assert.equal(last.caseNumber, 2);
  assert.equal(s.group(group.id).caseNumber, 1); assert.equal(s.get(last.id), last);
  assert.equal(last.deadlineMono, deadline); assert.equal(last.submissions.get('002').answer, '第三題答案');
  assert.equal(s.add('下一題').caseNumber, 3); s.close();
});
