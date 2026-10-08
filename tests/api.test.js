import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';

test('REST CRUD、權限、隱私及原始回答', async t => {
  const f = await fixture(t); const teacher = await f.login('teacher');
  const a = await f.login('student', '00123'); const b = await f.login('student', '00456');
  const q = await f.question(teacher);
  for (const cookie of [undefined, a]) for (const path of ['/api/teacher/questions', '/api/teacher/events']) {
    assert.equal((await f.request(path, { cookie })).status, 401);
  }
  const buzz = (cookie, answer, id = q.id) => f.request(`/api/student/questions/${id}/buzz`, { method: 'POST', cookie, body: { answer } });
  const first = await buzz(a, 'Single element'); const second = await buzz(b, '其他回答');
  for (const r of [first, second, await buzz(a, '重送修改')]) {
    assert.equal(r.status, 202); assert.deepEqual(r.data, { received: true });
  }
  const detail = (await f.request(`/api/teacher/questions/${q.id}`, { cookie: teacher })).data;
  assert.equal(detail.submissions.length, 2); assert.equal(detail.winner, null);
  assert.equal(detail.provisionalLeader.studentNumber, '00123');
  const publicData = (await f.request('/api/student/questions', { cookie: b })).data;
  assert.deepEqual(Object.keys(publicData).sort(), ['questions', 'serverNow', 'studentNumber']);
  assert.deepEqual(Object.keys(publicData.questions[0]).sort(), ['caseNumber', 'content', 'deadlineAt', 'id', 'remainingMs', 'status', 'submitted']);
  assert.equal(JSON.stringify(publicData).includes('Single element'), false);
  assert.equal(JSON.stringify(publicData).includes('00123'), false);
  const relogin = await f.login('student', '00123'); await buzz(relogin, '重新登入修改');
  assert.equal(f.store.get(q.id).submissions.size, 2);
  assert.equal((await f.request(`/api/teacher/questions/${q.id}`, { method: 'PATCH', cookie: teacher, body: { content: '修正題目' } })).status, 200);
  assert.equal((await f.request(`/api/teacher/questions/${q.id}`, { method: 'PATCH', cookie: teacher, body: { caseNumber: 3 } })).status, 400);
  await f.request(`/api/teacher/questions/${q.id}/stop`, { method: 'POST', cookie: teacher });
  assert.deepEqual((await buzz(b, '停止後')).data, first.data);
  await f.request(`/api/teacher/questions/${q.id}`, { method: 'DELETE', cookie: teacher });
  assert.equal((await f.request(`/api/teacher/questions/${q.id}`, { cookie: teacher })).status, 404);
  assert.deepEqual((await buzz(a, '刪除後')).data, first.data);
  assert.equal((await f.request('/api/teacher/exports/google-sheet', { method: 'POST', cookie: teacher })).data.writtenCount, 0);
});

test('請求邊界不洩漏憑證，拒絕偽造學號及外部來源', async t => {
  const f = await fixture(t); const teacher = await f.login('teacher'); const student = await f.login(); const q = await f.question(teacher);
  assert.equal((await f.request('/api/student/session', { method: 'POST', body: { studentNumber: 123 } })).status, 400);
  assert.equal((await f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: student, body: { answer: '有效', studentNumber: 'other' } })).status, 400);
  assert.equal((await f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: student, body: { answer: ' ' } })).status, 400);
  assert.equal((await f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: student, body: { answer: '字'.repeat(5001) } })).status, 400);
  assert.equal((await f.request('/api/teacher/questions', { method: 'POST', cookie: teacher, headers: { Origin: 'https://elsewhere.example' }, body: { content: '題目', caseNumber: 2 } })).status, 403);
  assert.equal((await f.request('/api/student/session', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: {} })).status, 415);
  const malformed = await fetch(f.base + '/api/student/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(malformed.status, 400); await malformed.text();
  const large = await f.request('/api/student/session', { method: 'POST', body: { studentNumber: 'x'.repeat(70000) } });
  assert.equal(large.status, 413);
  for (const path of ['/.env', '/src/config.js', '/%2e%2e%5c.env', '/node_modules/google-auth-library/package.json']) {
    const r = await fetch(f.base + path); assert.equal(r.status, 404); await r.text();
  }
  f.sessions.entries.clear(); assert.equal((await f.request('/api/student/questions', { cookie: student })).status, 401);
});

test('100 人 HTTP 同題與多題併發：全部保存，每題唯一第一名', async t => {
  const f = await fixture(t); const teacher = await f.login('teacher');
  const q1 = await f.question(teacher, 1); const q2 = await f.question(teacher, 2);
  const students = await Promise.all(Array.from({ length: 100 }, (_, i) => f.login('student', String(i).padStart(5, '0'))));
  const results = await Promise.all(students.flatMap((cookie, i) => [q1, q2].map(q => f.request(`/api/student/questions/${q.id}/buzz`, {
    method: 'POST', cookie, body: { answer: `答案 ${i} / ${q.caseNumber}` },
  }))));
  for (const r of results) { assert.equal(r.status, 202); assert.deepEqual(r.data, { received: true }); }
  for (const q of f.store.all()) {
    assert.equal(q.submissions.size, 100);
    const first = [...q.submissions.values()].find(s => s.acceptedOrder === 1);
    assert.equal(f.store.ranking(q)[0].id, first.id);
  }
  for (const q of [q1, q2]) await f.request(`/api/teacher/questions/${q.id}/stop`, { method: 'POST', cookie: teacher });
  assert.equal(f.store.all().filter(q => q.winnerKey !== null).length, 2);
  const view = (await f.request('/api/teacher/questions', { cookie: teacher })).data;
  assert.deepEqual(view.questions.map(q => q.submissions.length), [100, 100]);
});

test('未設定 Google 時匯出回 503、解除鎖定且保留回答', async t => {
  const f = await fixture(t); const teacher = await f.login('teacher'); const student = await f.login();
  const q = await f.question(teacher);
  await f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: student, body: { answer: '保留這份回答' } });
  await f.request(`/api/teacher/questions/${q.id}/stop`, { method: 'POST', cookie: teacher });
  const result = await f.request('/api/teacher/exports/google-sheet', { method: 'POST', cookie: teacher });
  assert.equal(result.status, 503); assert.equal(result.data.writtenCount, undefined);
  const view = (await f.request('/api/teacher/questions', { cookie: teacher })).data;
  assert.equal(view.exporting, false); assert.equal(view.questions[0].winner.answer, '保留這份回答');
  assert.equal((await f.request(`/api/teacher/questions/${q.id}/stop`, { method: 'POST', cookie: teacher })).status, 409);
});

test('匯出拒絕未授權及前端指定位置或答案，不呼叫 writer', async t => {
  let calls = 0;
  const f = await fixture(t, { writer: async () => { calls++; } });
  const teacher = await f.login('teacher'); const student = await f.login();
  const q = await f.question(teacher);
  await f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: student, body: { answer: '原回答' } });
  const path = '/api/teacher/exports/google-sheet';
  for (const cookie of [undefined, student]) assert.equal((await f.request(path, { method: 'POST', cookie })).status, 401);
  for (const body of [{ sheetId: 'other' }, { sheetName: 'other' }, { range: 'A1' }, { answer: '替換回答' }, { studentNumber: 'other' }]) {
    assert.equal((await f.request(path, { method: 'POST', cookie: teacher, body })).status, 400);
  }
  assert.equal(calls, 0);
  assert.equal(f.store.get(q.id).submissions.size, 1);
  assert.equal(f.store.get(q.id).submissions.values().next().value.answer, '原回答');
});
