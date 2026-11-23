import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, stream } from './helpers.js';

const publicQuestion = (snapshot, id) => snapshot.questions.find(question => question.id === id);

test('學生查詢僅在結算後公開第一名學號與組別，失格後遞補或清空', async t => {
  const f = await fixture(t), teacher = await f.login('teacher');
  const first = await f.login('student', '00123', 2);
  const second = await f.login('student', '00456', 3);
  const viewer = await f.login('student', '00999', 4);
  const q = await f.question(teacher);
  const buzz = (cookie, answer) => f.request(`/api/student/questions/${q.id}/buzz`,
    { method: 'POST', cookie, body: { answer } });
  assert.deepEqual((await buzz(first, '甲答案')).data, { received: true });
  assert.deepEqual((await buzz(second, '乙答案')).data, { received: true });
  const open = (await f.request('/api/student/questions', { cookie: viewer })).data;
  assert.equal(publicQuestion(open, q.id).status, 'open');
  assert.equal(Object.hasOwn(publicQuestion(open, q.id), 'firstPlace'), false);
  assert.equal(JSON.stringify(open).includes('00123'), false);
  assert.equal(JSON.stringify(open).includes('甲答案'), false);
  assert.equal((await f.request('/api/student/questions')).status, 401);

  await f.request(`/api/teacher/questions/${q.id}/stop`, { method: 'POST', cookie: teacher });
  for (const cookie of [first, second, viewer]) {
    const result = publicQuestion((await f.request('/api/student/questions', { cookie })).data, q.id);
    assert.equal(result.status, 'settled');
    assert.equal(result.deadlineAt, null); assert.equal(result.remainingMs, 0);
    assert.deepEqual(result.firstPlace, { studentNumber: '00123', groupNumber: 2 });
    assert.deepEqual(Object.keys(result.firstPlace).sort(), ['groupNumber', 'studentNumber']);
    assert.equal(JSON.stringify(result).includes('甲答案'), false);
    assert.equal(JSON.stringify(result).includes('rank'), false);
  }
  const detail = (await f.request(`/api/teacher/questions/${q.id}`, { cookie: teacher })).data;
  const firstId = detail.submissions.find(item => item.studentNumber === '00123').id;
  const secondId = detail.submissions.find(item => item.studentNumber === '00456').id;
  await f.request(`/api/teacher/questions/${q.id}/submissions/${firstId}/disqualify`, { method: 'POST', cookie: teacher });
  assert.deepEqual(publicQuestion((await f.request('/api/student/questions', { cookie: viewer })).data, q.id).firstPlace,
    { studentNumber: '00456', groupNumber: 3 });
  await f.request(`/api/teacher/questions/${q.id}/submissions/${secondId}/disqualify`, { method: 'POST', cookie: teacher });
  assert.equal(publicQuestion((await f.request('/api/student/questions', { cookie: viewer })).data, q.id).firstPlace, null);
  assert.deepEqual((await buzz(first, '重送')).data, { received: true });
  await f.request(`/api/teacher/questions/${q.id}`, { method: 'DELETE', cookie: teacher });
  assert.deepEqual((await f.request('/api/student/questions', { cookie: viewer })).data.questions, []);
});

test('學生 SSE 對所有人發布結算與遞補，只在結算後揭露第一名', { timeout: 10000 }, async t => {
  const f = await fixture(t), teacher = await f.login('teacher');
  const first = await f.login('student', 'A', 1), second = await f.login('student', 'B', 2);
  const viewer = await f.login('student', 'C', 3), q = await f.question(teacher);
  const firstEvents = await stream(f.base, 'student', first), viewerEvents = await stream(f.base, 'student', viewer);
  t.after(async () => { await Promise.all([firstEvents.close(), viewerEvents.close()]); });
  await Promise.all([firstEvents.next(), viewerEvents.next()]);
  await f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: first, body: { answer: '甲答案' } });
  await firstEvents.next();
  await f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: second, body: { answer: '乙答案' } });
  await f.request(`/api/teacher/questions/${q.id}/stop`, { method: 'POST', cookie: teacher });
  const settled = await Promise.all([firstEvents.next(), viewerEvents.next()]);
  for (const event of settled) {
    assert.deepEqual(publicQuestion(event.data, q.id).firstPlace, { studentNumber: 'A', groupNumber: 1 });
    assert.equal(event.raw.includes('甲答案'), false);
    assert.equal(event.raw.includes('rank'), false);
  }
  const detail = (await f.request(`/api/teacher/questions/${q.id}`, { cookie: teacher })).data;
  const firstId = detail.submissions.find(item => item.studentNumber === 'A').id;
  await f.request(`/api/teacher/questions/${q.id}/submissions/${firstId}/disqualify`, { method: 'POST', cookie: teacher });
  for (const event of await Promise.all([firstEvents.next(), viewerEvents.next()]))
    assert.deepEqual(publicQuestion(event.data, q.id).firstPlace, { studentNumber: 'B', groupNumber: 2 });
  const reconnected = await stream(f.base, 'student', viewer);
  assert.deepEqual(publicQuestion((await reconnected.next()).data, q.id).firstPlace, { studentNumber: 'B', groupNumber: 2 });
  await reconnected.close();
});

test('倒數自動結算、全部失格及刪題依序更新學生 SSE', { timeout: 10000 }, async t => {
  const f = await fixture(t), teacher = await f.login('teacher');
  const answerer = await f.login('student', 'T01', 5), viewer = await f.login('student', 'T02', 6);
  f.sheet.put('C5', '限時題', '$q_1$'); f.sheet.put('H5', '$a_1$');
  await f.request('/api/teacher/questions/import-google-sheet', { method: 'POST', cookie: teacher });
  const q = (await f.request('/api/teacher/questions', { cookie: teacher })).data.questions[0];
  await f.request(`/api/teacher/questions/${q.id}`, { method: 'PATCH', cookie: teacher, body: { durationSeconds: 1 } });
  await f.request(`/api/teacher/questions/${q.id}/start`, { method: 'POST', cookie: teacher });
  await f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: answerer, body: { answer: '限時回答' } });
  const events = await stream(f.base, 'student', viewer);
  t.after(() => events.close());
  const initial = await events.next();
  assert.equal(Object.hasOwn(publicQuestion(initial.data, q.id), 'firstPlace'), false);
  const settled = await events.next();
  assert.deepEqual(publicQuestion(settled.data, q.id).firstPlace, { studentNumber: 'T01', groupNumber: 5 });
  const detail = (await f.request(`/api/teacher/questions/${q.id}`, { cookie: teacher })).data;
  await f.request(`/api/teacher/questions/${q.id}/submissions/${detail.submissions[0].id}/disqualify`,
    { method: 'POST', cookie: teacher });
  assert.equal(publicQuestion((await events.next()).data, q.id).firstPlace, null);
  await f.request(`/api/teacher/questions/${q.id}`, { method: 'DELETE', cookie: teacher });
  assert.deepEqual((await events.next()).data.questions, []);
});
