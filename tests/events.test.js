import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, stream } from './helpers.js';
import { EventEmitter } from 'node:events';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('SSE 教師全部回答、學生隔離、重連、過期與清理', { timeout: 10000 }, async t => {
  const f = await fixture(t); const teacher = await f.login('teacher'); const a = await f.login('student', '00123'); const b = await f.login('student', '00456');
  const q = await f.question(teacher);
  const ts = await stream(f.base, 'teacher', teacher); const as = await stream(f.base, 'student', a); const bs = await stream(f.base, 'student', b);
  t.after(async () => { await Promise.all([ts.close(), as.close(), bs.close()]); });
  await Promise.all([ts.next(), as.next(), bs.next()]);
  await f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: a, body: { answer: '甲答案' } });
  assert.equal((await ts.next()).data.questions[0].provisionalLeader.answer, '甲答案');
  const own = await as.next(); assert.equal(own.data.questions[0].submitted, true); assert.equal(own.raw.includes('winner'), false);
  await delay(50); assert.equal(bs.frames.length, 0);
  await f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: b, body: { answer: '乙答案' } });
  assert.equal((await ts.next()).data.questions[0].submissions.length, 2);
  assert.equal((await bs.next()).data.questions[0].submitted, true);
  const again = await stream(f.base, 'teacher', teacher); assert.equal((await again.next()).data.questions[0].submissions.length, 2); await again.close();
  f.sessions.entries.clear(); f.events.heartbeat();
  assert.equal((await as.next()).event, 'auth-required');
  assert.equal((await ts.next()).event, 'auth-required');
  assert.equal(f.events.clients.size, 0);
});

test('慢速 SSE 連線不累積中間快照，恢復後取得最新完整狀態', async t => {
  const f = await fixture(t); const teacher = await f.login('teacher'); const q = await f.question(teacher);
  class SlowResponse extends EventEmitter {
    writes = []; slow = true; destroyed = false;
    writeHead() {}
    write(value) { this.writes.push(value); return !this.slow; }
    end(value) { if (value) this.writes.push(value); this.emit('close'); }
    destroy() { this.destroyed = true; this.emit('close'); }
  }
  const res = new SlowResponse();
  const auth = f.sessions.require({ headers: { cookie: teacher } }, 'teacher');
  f.events.attach({}, res, 'teacher', auth);
  const initial = res.writes.length;
  for (let i = 0; i < 100; i++) {
    f.store.registerStudent(String(i), i + 1);
    f.store.submit(q.id, String(i), `回答 ${i}`, i + 1);
    f.events.teachers(); f.events.heartbeat();
  }
  assert.equal(res.writes.length, initial, '阻塞時不堆積額外寫入');
  res.slow = false; res.emit('drain');
  assert.equal(res.writes.length, initial + 1);
  const snapshot = JSON.parse(res.writes.at(-1).match(/\ndata: (.+)/)[1]);
  assert.equal(snapshot.questions[0].submissions.length, 100);
  res.destroy(); assert.equal(f.events.clients.size, 0);
});

test('SSE 單題轉組保留學生提交狀態，草稿小題不洩漏回答', async t => {
  const f = await fixture(t); const teacher = await f.login('teacher'); const student = await f.login('student', '00123');
  const q = await f.question(teacher);
  await f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: student, body: { answer: '原答案' } });
  const ts = await stream(f.base, 'teacher', teacher), ss = await stream(f.base, 'student', student);
  t.after(async () => { await Promise.all([ts.close(), ss.close()]); });
  await Promise.all([ts.next(), ss.next()]);
  const converted = await f.request(`/api/teacher/questions/${q.id}/convert-to-group`, { method: 'POST', cookie: teacher,
    body: { title: '公開標題' } });
  const tView = await ts.next(), sView = await ss.next();
  assert.equal(tView.data.questions[0].submissions[0].answer, '原答案');
  assert.equal(sView.data.questions[0].id, q.id); assert.equal(sView.data.questions[0].submitted, true);
  assert.equal(sView.data.questions[0].groupTitle, '公開標題');
  assert.equal(sView.raw.includes('原答案'), false); assert.equal(sView.raw.includes('winner'), false);
  await f.request(`/api/teacher/groups/${converted.data.groupId}/questions`, { method: 'POST', cookie: teacher, body: { content: '新草稿' } });
  assert.equal((await ts.next()).data.questions.length, 2);
  assert.equal((await f.request('/api/student/questions', { cookie: student })).data.questions.length, 1);
});

test('教師登出立即關閉其 SSE，其他教師與學生繼續接收改號快照', async t => {
  const f = await fixture(t), teacher = await f.login('teacher');
  const otherTeacher = await f.login('teacher'), student = await f.login('student', '00123');
  const first = await f.question(teacher), second = await f.question(teacher);
  await f.request(`/api/teacher/questions/${second.id}/start`, { method: 'POST', cookie: teacher });
  const a = await stream(f.base, 'teacher', teacher), b = await stream(f.base, 'teacher', otherTeacher);
  const s = await stream(f.base, 'student', student);
  t.after(async () => { await Promise.all([a.close(), b.close(), s.close()]); });
  await Promise.all([a.next(), b.next(), s.next()]);
  await f.request('/api/teacher/session', { method: 'DELETE', cookie: teacher });
  assert.equal((await a.next()).event, 'auth-required');
  await f.request(`/api/teacher/questions/${first.id}`, { method: 'DELETE', cookie: otherTeacher });
  assert.equal((await b.next()).data.questions[0].caseNumber, 1);
  const studentView = await s.next();
  assert.equal(studentView.data.questions[0].id, second.id);
  assert.equal(studentView.data.questions[0].caseNumber, 1);
  assert.equal(studentView.raw.includes('groupId'), false);
  assert.equal(studentView.raw.includes('winner'), false);
});
