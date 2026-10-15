import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, stream } from './helpers.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('教師計時控制、學生暫停投影、狀態衝突與權限', async t => {
  const f = await fixture(t); const teacher = await f.login('teacher'); const student = await f.login('student', '00123');
  const created = await f.request('/api/teacher/questions', { method: 'POST', cookie: teacher,
    body: { content: '題目', durationSeconds: 30 } });
  assert.equal(created.status, 201); const id = created.data.id;
  assert.equal(created.data.durationSeconds, 30);
  assert.equal((await f.request(`/api/teacher/questions/${id}/pause`, { method: 'POST', cookie: teacher })).status, 409);
  assert.equal((await f.request(`/api/teacher/questions/${id}/start`, { method: 'POST', cookie: teacher })).status, 200);
  assert.equal((await f.request(`/api/teacher/questions/${id}`, { method: 'PATCH', cookie: teacher,
    body: { content: '題目', durationSeconds: 60 } })).status, 409);
  const paused = await f.request(`/api/teacher/questions/${id}/pause`, { method: 'POST', cookie: teacher });
  assert.equal(paused.data.status, 'paused'); assert.ok(paused.data.remainingMs > 0);
  const own = (await f.request('/api/student/questions', { cookie: student })).data;
  assert.equal(own.questions[0].status, 'paused'); assert.equal(own.questions[0].submitted, false);
  assert.equal(own.questions[0].deadlineAt, null);
  assert.equal((await f.request(`/api/teacher/questions/${id}/resume`, { method: 'POST', cookie: student })).status, 401);
  assert.equal((await f.request(`/api/teacher/questions/${id}/resume`, { method: 'POST', cookie: teacher })).data.status, 'open');
  assert.equal((await f.request(`/api/teacher/questions/${id}/stop`, { method: 'POST', cookie: teacher })).data.status, 'settled');
  assert.deepEqual((await f.request('/api/student/questions', { cookie: student })).data.questions, []);
  assert.equal((await f.request(`/api/teacher/questions/${id}/start`, { method: 'POST', cookie: teacher })).status, 409);
});

test('教師即時排名與失格遞補，學生白名單及事件不洩漏', async t => {
  const f = await fixture(t); const teacher = await f.login('teacher');
  const a = await f.login('student', '甲'), b = await f.login('student', '乙');
  const q1 = await f.question(teacher, 1), q2 = await f.question(teacher, 2);
  assert.ok(q1.id, JSON.stringify(q1)); assert.ok(q2.id, JSON.stringify(q2));
  const publicStream = await stream(f.base, 'student', b); t.after(() => publicStream.close());
  await publicStream.next();
  const buzz = (id, cookie, answer) => f.request(`/api/student/questions/${id}/buzz`, { method: 'POST', cookie, body: { answer } });
  await buzz(q2.id, a, '甲答'); await buzz(q2.id, b, '乙答');
  let view = (await f.request(`/api/teacher/questions/${q2.id}`, { cookie: teacher })).data;
  assert.equal(view.winner, null, JSON.stringify(view)); assert.equal(view.provisionalLeader.studentNumber, '甲');
  await buzz(q1.id, a, '甲先前得標');
  await f.request(`/api/teacher/questions/${q1.id}/stop`, { method: 'POST', cookie: teacher });
  view = (await f.request(`/api/teacher/questions/${q2.id}`, { cookie: teacher })).data;
  assert.equal(view.provisionalLeader.studentNumber, '乙');
  assert.deepEqual(view.submissions.map(s => s.priorWinCount), [1, 0]);
  const own = (await f.request('/api/student/questions', { cookie: b })).data;
  assert.deepEqual(Object.keys(own).sort(), ['groupNumber', 'questions', 'serverNow', 'studentNumber']);
  assert.deepEqual(Object.keys(own.questions[0]).sort(), ['caseNumber', 'content', 'deadlineAt', 'groupTitle', 'id', 'partNumber', 'remainingMs', 'status', 'submitted']);
  assert.equal(JSON.stringify(own).includes('甲答'), false);
  await f.request(`/api/teacher/questions/${q2.id}/stop`, { method: 'POST', cookie: teacher });
  view = (await f.request(`/api/teacher/questions/${q2.id}`, { cookie: teacher })).data;
  assert.equal(view.winner.studentNumber, '乙');
  const id = view.submissions.find(s => s.studentNumber === '乙').id;
  assert.equal((await f.request(`/api/teacher/questions/${q2.id}/submissions/${id}/disqualify`,
    { method: 'POST', cookie: b })).status, 401);
  const changed = await f.request(`/api/teacher/questions/${q2.id}/submissions/${id}/disqualify`,
    { method: 'POST', cookie: teacher });
  assert.equal(changed.data.winner.studentNumber, '甲');
  assert.equal((await f.request(`/api/teacher/questions/${q2.id}/submissions/${id}/disqualify`,
    { method: 'POST', cookie: teacher })).status, 409);
  assert.equal((await f.request(`/api/teacher/questions/${q2.id}/submissions/unknown/disqualify`,
    { method: 'POST', cookie: teacher })).status, 404);
  assert.equal((await buzz(q2.id, b, '重答')).status, 202);
  assert.equal(f.store.get(q2.id).submissions.size, 2);
  const events = publicStream.frames.filter(frame => frame.event === 'snapshot').map(frame => JSON.stringify(frame.data));
  assert.ok(events.every(event => !event.includes('winner') && !event.includes('rank') && !event.includes('甲答')));
});

test('僅教師順位改變時不推播不相關的學生事件', async t => {
  const f = await fixture(t); const teacher = await f.login('teacher');
  const a = await f.login('student', '甲'), b = await f.login('student', '乙');
  const q1 = await f.question(teacher, 1), q2 = await f.question(teacher, 2);
  await f.request(`/api/student/questions/${q1.id}/buzz`, { method: 'POST', cookie: a, body: { answer: '甲' } });
  await f.request(`/api/teacher/questions/${q1.id}/stop`, { method: 'POST', cookie: teacher });
  await f.request(`/api/student/questions/${q2.id}/buzz`, { method: 'POST', cookie: b, body: { answer: '乙' } });
  const publicStream = await stream(f.base, 'student', b); t.after(() => publicStream.close());
  await publicStream.next();
  const submissionId = f.store.get(q1.id).submissions.get('甲').id;
  await f.request(`/api/teacher/questions/${q1.id}/submissions/${submissionId}/disqualify`, { method: 'POST', cookie: teacher });
  await delay(40);
  assert.equal(publicStream.frames.length, 0);
  const view = (await f.request(`/api/teacher/questions/${q2.id}`, { cookie: teacher })).data;
  assert.equal(view.provisionalLeader.studentNumber, '乙');
});
