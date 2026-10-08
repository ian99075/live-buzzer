import test from 'node:test';
import assert from 'node:assert/strict';
import { Classroom } from '../src/classroom.js';
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
  const s = new Classroom(); const a = s.add(1, '題目一'); const b = s.add(2, '題目二');
  assert.throws(() => s.add(1, '重複'), { status: 409 });
  assert.throws(() => s.add(7, '超過'), { status: 400 });
  assert.throws(() => s.edit(a.id, ' '), { status: 400 });
  s.status(a.id, 'open'); s.status(b.id, 'open');
  assert.throws(() => s.submit(a.id, '001', ' '), { status: 400 });
  assert.equal(s.submit(a.id, '001', '甲'), true);
  assert.equal(s.submit(a.id, '002', '乙'), true);
  assert.equal(s.submit(a.id, '001', '改答案'), false);
  s.submit(b.id, '002', '第二題答案');
  assert.equal(s.ranking(a)[0].id, a.submissions.get('001').id); assert.equal(b.winnerKey, null);
  assert.equal(a.submissions.size, 2); assert.equal(a.submissions.get('001').answer, '甲');
  s.status(a.id, 'settled'); assert.equal(s.submit(a.id, '003', '晚到'), false);
  assert.equal(b.status, 'open'); assert.throws(() => s.status(a.id, 'open'), { status: 409 });
  assert.equal(a.winnerKey, '001'); assert.equal(a.submissions.size, 2);
  s.edit(a.id, '修正文字'); assert.equal(a.submissions.size, 2);
  s.remove(a.id); const replacement = s.add(1, '新題'); s.status(replacement.id, 'open');
  assert.notEqual(replacement.id, a.id); assert.equal(s.submit(a.id, '004', '舊請求'), false);
  assert.equal(replacement.submissions.size, 0); assert.equal(s.get(b.id).caseNumber, 2);
  assert.deepEqual(new Classroom().all(), []);
  s.close();
});
