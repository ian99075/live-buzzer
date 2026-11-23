import test from 'node:test';
import assert from 'node:assert/strict';
import { Classroom } from '../src/classroom.js';
import { fixture, stream } from './helpers.js';

test('學號首次綁定組別；整個題組只計一次先前第一名，結算後順位固定', () => {
  const store = new Classroom();
  assert.equal(store.registerStudent('甲', 2), 2);
  assert.equal(store.registerStudent('甲', 2), 2);
  assert.throws(() => store.registerStudent('甲', 3), { status: 409 });
  assert.equal(store.studentGroups.get('甲'), 2);
  for (const [id, group] of [['乙', 2], ['丙', 3], ['丁', 4]]) store.registerStudent(id, group);
  const previous = store.addGroup('大題', [{ content: '前題' }, { content: '後題' }]);
  const current = store.add('目前題目');
  store.groupStatus(previous.id, 'open'); store.status(current.id, 'open');
  const submit = (id, answer = id) => store.submit(current.id, id, answer, store.studentGroups.get(id));
  submit('甲'); submit('乙'); submit('丙'); submit('丁');
  assert.deepEqual(store.ranking(current).map(r => store.submissionById(current, r.id).studentNumber), ['甲', '乙', '丙', '丁']);
  store.submitGroup(previous.id, '甲', { '1_1': '一', '1_2': '二' }, 2);
  store.groupStatus(previous.id, 'settled');
  assert.deepEqual(store.ranking(current).map(r => store.submissionById(current, r.id).studentNumber), ['丙', '丁', '甲', '乙']);
  assert.deepEqual(store.ranking(current).map(r => r.priorWinCount), [0, 0, 1, 1]);
  store.status(current.id, 'settled'); assert.equal(current.winnerKey, '丙');
  store.disqualify(current.id, current.submissions.get('丙').id); assert.equal(current.winnerKey, '丁');
  store.disqualify(current.id, current.submissions.get('丁').id); assert.equal(current.winnerKey, '甲');
  store.disqualify(current.id, current.submissions.get('甲').id); assert.equal(current.winnerKey, '乙');
  store.disqualify(current.id, current.submissions.get('乙').id); assert.equal(current.winnerKey, null);
  assert.equal(submit('甲', '重送'), false);
  assert.equal(new Classroom().studentGroups.size, 0);
  store.close();
});
test('登入數字組別正規化、409 不洩漏原組別；教師能見各人組別，學生僅能見自己', async t => {
  const f = await fixture(t), teacher = await f.login('teacher');
  const postLogin = (studentNumber, groupNumber) => f.request('/api/student/session', { method: 'POST', body: { studentNumber, groupNumber } });
  for (const value of [undefined, null, '2', 0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await postLogin('甲', value)).status, 400);
  }
  const a = await postLogin('甲', 2), b = await postLogin('乙', 2), c = await postLogin('丙', 3);
  assert.equal(a.status, 200); assert.equal(a.data.groupNumber, 2);
  assert.equal(b.status, 200); assert.equal(c.status, 200);
  assert.equal((await postLogin('甲', 2)).status, 200);
  const mismatch = await postLogin('甲', 3);
  assert.equal(mismatch.status, 409); assert.equal(JSON.stringify(mismatch.data).includes('G2'), false);
  const q = await f.question(teacher);
  const teacherStream = await stream(f.base, 'teacher', teacher);
  const studentStream = await stream(f.base, 'student', c.cookie);
  t.after(async () => { await teacherStream.close(); await studentStream.close(); });
  await Promise.all([teacherStream.next(), studentStream.next()]);
  const buzz = (cookie, answer) => f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie, body: { answer } });
  assert.equal((await buzz(a.cookie, '甲答')).status, 202);
  assert.equal((await buzz(b.cookie, '乙答')).status, 202);
  const detail = (await f.request(`/api/teacher/questions/${q.id}`, { cookie: teacher })).data;
  assert.deepEqual(detail.submissions.map(s => s.groupNumber), [2, 2]);
  assert.equal(detail.provisionalLeader.groupNumber, 2);
  assert.equal((await teacherStream.next()).data.questions[0].submissions[0].groupNumber, 2);
  const own = (await f.request('/api/student/questions', { cookie: c.cookie })).data;
  assert.equal(own.groupNumber, 3);
  assert.equal(JSON.stringify(own).includes('甲答'), false);
  assert.equal(JSON.stringify(own).includes('"groupNumber":2'), false);
  assert.equal((await buzz(c.cookie, '丙答')).status, 202);
  const ownFrame = await studentStream.next();
  assert.equal(ownFrame.data.groupNumber, 3);
  assert.equal(JSON.stringify(ownFrame.data).includes('rank'), false);
  assert.equal(JSON.stringify(ownFrame.data).includes('甲答'), false);
  assert.equal((await f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: c.cookie,
    body: { answer: '竄改', groupNumber: 2 } })).status, 400);
});

test('前題第一名失格後，同組所有人在其他開放題的優先權立即恢復', () => {
  const store = new Classroom();
  for (const [id, group] of [['甲', 2], ['乙', 2], ['丙', 3]]) store.registerStudent(id, group);
  const previous = store.add('前題'), current = store.add('開放題');
  store.status(previous.id, 'open'); store.status(current.id, 'open');
  store.submit(previous.id, '甲', '前答', 2); store.status(previous.id, 'settled');
  store.submit(current.id, '乙', '同組較早', 2);
  store.submit(current.id, '丙', '異組較晚', 3);
  assert.equal(store.submissionById(current, store.ranking(current)[0].id).studentNumber, '丙');
  store.disqualify(previous.id, previous.submissions.get('甲').id);
  assert.equal(store.submissionById(current, store.ranking(current)[0].id).studentNumber, '乙');
  store.close();
});
