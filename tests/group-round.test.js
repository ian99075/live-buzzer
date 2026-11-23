import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
import { Classroom } from '../src/classroom.js';
import { fakeSheet } from './sheet-fixture.js';
import { SheetExporter } from '../src/sheets.js';

function groupedSheet(sheet) {
  sheet.put('C5', '第一小題', '$q_1_1$'); sheet.put('H5', '$a_1_1$');
  sheet.put('C6', '第二小題', '$q_1_2$'); sheet.put('H6', '$a_1_2$');
}
const teacherGroup = (f, cookie) => f.request('/api/teacher/questions', { cookie })
  .then(response => response.data.questions.find(item => item.kind === 'group'));

test('題組 API 一次送出全部回答、同學號去重與整份失格遞補，學生只在結算後見第一名', async t => {
  const f = await fixture(t), teacher = await f.login('teacher');
  const a = await f.login('student', 'A', 2), b = await f.login('student', 'B', 3);
  groupedSheet(f.sheet);
  assert.equal((await f.request('/api/teacher/questions/import-google-sheet', { method: 'POST', cookie: teacher })).status, 200);
  const group = await teacherGroup(f, teacher), path = `/api/student/groups/${group.id}/buzz`;
  assert.equal(group.parts.length, 2);
  assert.equal((await f.request(`/api/teacher/groups/${group.id}`, { method: 'PATCH', cookie: teacher,
    body: { durationSeconds: 90 } })).data.durationSeconds, 90);
  assert.equal((await f.request(`/api/teacher/groups/${group.id}/start`, { method: 'POST', cookie: teacher })).status, 200);
  const bad = [
    { '1_1': '只有一題' },
    { '1_1': '一', '1_2': ' ' },
    { '1_1': '一', '1_2': '二', '1_3': '多餘' },
  ];
  for (const answers of bad)
    assert.equal((await f.request(path, { method: 'POST', cookie: a, body: { answers } })).status, 400);
  assert.equal((await teacherGroup(f, teacher)).submissions.length, 0);
  const aAnswers = { '1_1': '甲的第一答', '1_2': '甲的第二答' };
  const bAnswers = { '1_1': '乙的第一答', '1_2': '乙的第二答' };
  assert.deepEqual((await f.request(path, { method: 'POST', cookie: a, body: { answers: aAnswers } })).data, { received: true });
  assert.equal((await f.request(path, { method: 'POST', cookie: a, body: { answers: bAnswers } })).status, 202);
  assert.equal((await f.request(path, { method: 'POST', cookie: b, body: { answers: bAnswers } })).status, 202);
  let detail = await teacherGroup(f, teacher);
  assert.equal(detail.submissions.length, 2);
  assert.deepEqual(detail.submissions[0].answers, aAnswers);
  assert.equal(detail.provisionalLeader.studentNumber, 'A');
  let student = (await f.request('/api/student/questions', { cookie: b })).data.questions[0];
  assert.equal(student.submitted, true); assert.equal('firstPlace' in student, false);
  assert.equal(JSON.stringify(student).includes('甲的第一答'), false);
  assert.equal((await f.request(`/api/teacher/questions/${group.parts[0].id}/stop`, { method: 'POST', cookie: teacher })).status, 409);
  await f.request(`/api/teacher/groups/${group.id}/stop`, { method: 'POST', cookie: teacher });
  student = (await f.request('/api/student/questions', { cookie: b })).data.questions[0];
  assert.deepEqual(student.firstPlace, { studentNumber: 'A', groupNumber: 2 });
  await f.request(`/api/teacher/groups/${group.id}/submissions/${detail.submissions[0].id}/disqualify`,
    { method: 'POST', cookie: teacher });
  detail = await teacherGroup(f, teacher);
  assert.equal(detail.winner.studentNumber, 'B');
  student = (await f.request('/api/student/questions', { cookie: a })).data.questions[0];
  assert.deepEqual(student.firstPlace, { studentNumber: 'B', groupNumber: 3 });
  assert.equal((await f.request(path, { method: 'POST', cookie: a, body: { answers: aAnswers } })).status, 202);
  assert.equal((await teacherGroup(f, teacher)).submissions.length, 2);
});

test('題組提交拒絕重複小題鍵、超長回答與超過請求大小限制', async t => {
  const f = await fixture(t), teacher = await f.login('teacher'), student = await f.login('student', 'A', 2);
  groupedSheet(f.sheet);
  await f.request('/api/teacher/questions/import-google-sheet', { method:'POST', cookie:teacher });
  const group = await teacherGroup(f, teacher);
  await f.request(`/api/teacher/groups/${group.id}/start`, { method:'POST', cookie:teacher });
  const path = `/api/student/groups/${group.id}/buzz`;
  const raw = '{"answers":{"1_1":"第一版","1_2":"第二答","1_\\u0031":"覆蓋版"}}';
  const duplicate = await fetch(f.base + path, { method:'POST', headers:{ cookie:student, 'Content-Type':'application/json' }, body:raw });
  assert.equal(duplicate.status, 400);
  assert.equal((await f.request(path, { method:'POST', cookie:student,
    body:{ answers:{ '1_1':'字'.repeat(5001), '1_2':'第二答' } } })).status, 400);
  const oversized = await fetch(f.base + path, { method:'POST',
    headers:{ cookie:student, 'Content-Type':'application/json' },
    body:JSON.stringify({ answers:{ '1_1':'字'.repeat(1_700_000), '1_2':'第二答' } }) });
  assert.equal(oversized.status, 413);
  assert.equal((await teacherGroup(f, teacher)).submissions.length, 0);
});

test('30 位學生併發提交題組，全部完整保存且整組僅一位第一名', async t => {
  const f = await fixture(t), teacher = await f.login('teacher'); groupedSheet(f.sheet);
  await f.request('/api/teacher/questions/import-google-sheet', { method:'POST', cookie:teacher });
  const group = await teacherGroup(f, teacher);
  await f.request(`/api/teacher/groups/${group.id}/start`, { method:'POST', cookie:teacher });
  const students = await Promise.all(Array.from({ length:30 }, (_, i) => f.login('student', `S${i}`, i + 1)));
  const responses = await Promise.all(students.map((cookie, i) =>
    f.request(`/api/student/groups/${group.id}/buzz`, { method:'POST', cookie,
      body:{ answers:{ '1_1':`第一答${i}`, '1_2':`第二答${i}` } } })));
  assert.equal(responses.every(response => response.status === 202), true);
  const open = await teacherGroup(f, teacher);
  assert.equal(open.submissions.length, 30);
  assert.equal(new Set(open.submissions.map(entry => entry.acceptedOrder)).size, 30);
  assert.equal(open.submissions.every(entry => Object.keys(entry.answers).length === 2), true);
  await f.request(`/api/teacher/groups/${group.id}/stop`, { method:'POST', cookie:teacher });
  const settled = await teacherGroup(f, teacher);
  assert.ok(settled.winner);
  assert.equal(settled.submissions.filter(entry => entry.rank === 1).length, 1);
});

test('題組第一名逐小題匯出，候補覆寫及全員失格清空整組', async t => {
  const f = await fixture(t), teacher = await f.login('teacher');
  const a = await f.login('student', 'A', 2), b = await f.login('student', 'B', 3);
  groupedSheet(f.sheet);
  await f.request('/api/teacher/questions/import-google-sheet', { method: 'POST', cookie: teacher });
  const group = await teacherGroup(f, teacher), path = `/api/student/groups/${group.id}/buzz`;
  await f.request(`/api/teacher/groups/${group.id}/start`, { method: 'POST', cookie: teacher });
  await f.request(path, { method: 'POST', cookie: a, body: { answers: { '1_1': '甲一', '1_2': '甲二' } } });
  await f.request(path, { method: 'POST', cookie: b, body: { answers: { '1_1': '乙一', '1_2': '乙二' } } });
  await f.request(`/api/teacher/groups/${group.id}/stop`, { method: 'POST', cookie: teacher });
  async function exportNow() {
    const preview = (await f.request('/api/teacher/exports/google-sheet/preview', { cookie: teacher })).data;
    const result = await f.request('/api/teacher/exports/google-sheet',
      { method: 'POST', cookie: teacher, body: { token: preview.token } });
    assert.equal(result.status, 200); return preview;
  }
  let preview = await exportNow();
  assert.deepEqual(preview.items.map(item => item.value), ['甲一_G2', '甲二_G2']);
  assert.equal(f.sheet.cells.get('H5').note, '$a_1_1$');
  let detail = await teacherGroup(f, teacher);
  await f.request(`/api/teacher/groups/${group.id}/submissions/${detail.submissions[0].id}/disqualify`,
    { method: 'POST', cookie: teacher });
  preview = await exportNow();
  assert.deepEqual(preview.items.map(item => item.value), ['乙一_G3', '乙二_G3']);
  detail = await teacherGroup(f, teacher);
  await f.request(`/api/teacher/groups/${group.id}/submissions/${detail.submissions[1].id}/disqualify`,
    { method: 'POST', cookie: teacher });
  preview = await exportNow();
  assert.deepEqual(preview.items.map(item => [item.key, item.clear]), [['1_1', true], ['1_2', true]]);
  assert.equal(f.sheet.cells.get('H5').userEnteredValue.stringValue, '');
  assert.equal(f.sheet.cells.get('H6').userEnteredValue.stringValue, '');
});

test('已匯出題組刪除後下次預覽清空各小題；舊預覽在第一名改變後失效', async t => {
  const f = await fixture(t), teacher = await f.login('teacher'), student = await f.login('student', 'A', 2);
  groupedSheet(f.sheet);
  await f.request('/api/teacher/questions/import-google-sheet', { method:'POST', cookie:teacher });
  const group = await teacherGroup(f, teacher);
  await f.request(`/api/teacher/groups/${group.id}/start`, { method:'POST', cookie:teacher });
  await f.request(`/api/student/groups/${group.id}/buzz`, { method:'POST', cookie:student,
    body:{ answers:{ '1_1':'一', '1_2':'二' } } });
  await f.request(`/api/teacher/groups/${group.id}/stop`, { method:'POST', cookie:teacher });
  const previewPath = '/api/teacher/exports/google-sheet/preview', exportPath = '/api/teacher/exports/google-sheet';
  const first = (await f.request(previewPath, { cookie:teacher })).data;
  const submission = (await teacherGroup(f, teacher)).submissions[0];
  await f.request(`/api/teacher/groups/${group.id}/submissions/${submission.id}/disqualify`,
    { method:'POST', cookie:teacher });
  assert.equal((await f.request(exportPath, { method:'POST', cookie:teacher, body:{ token:first.token } })).status, 409);
  // 新課堂建立另一題組，驗證刪整組時兩格一起清空。
  const replacement = await f.login('student', 'B', 3);
  await f.request(`/api/teacher/groups/${group.id}`, { method:'DELETE', cookie:teacher });
  await f.request('/api/teacher/questions/import-google-sheet', { method:'POST', cookie:teacher });
  const restored = await teacherGroup(f, teacher);
  await f.request(`/api/teacher/groups/${restored.id}/start`, { method:'POST', cookie:teacher });
  await f.request(`/api/student/groups/${restored.id}/buzz`, { method:'POST', cookie:replacement,
    body:{ answers:{ '1_1':'新一', '1_2':'新二' } } });
  await f.request(`/api/teacher/groups/${restored.id}/stop`, { method:'POST', cookie:teacher });
  const writePreview = (await f.request(previewPath, { cookie:teacher })).data;
  assert.equal((await f.request(exportPath, { method:'POST', cookie:teacher, body:{ token:writePreview.token } })).status, 200);
  await f.request(`/api/teacher/groups/${restored.id}`, { method:'DELETE', cookie:teacher });
  const clearPreview = (await f.request(previewPath, { cookie:teacher })).data;
  assert.deepEqual(clearPreview.items.map(item => item.clear), [true, true]);
  assert.equal((await f.request(exportPath, { method:'POST', cookie:teacher, body:{ token:clearPreview.token } })).status, 200);
});

test('同組同答案但第一名換人，或草稿小題集合變動，舊匯出預覽仍失效', async t => {
  const f = await fixture(t), teacher = await f.login('teacher');
  const a = await f.login('student', 'A', 2), b = await f.login('student', 'B', 2);
  groupedSheet(f.sheet);
  await f.request('/api/teacher/questions/import-google-sheet', { method:'POST', cookie:teacher });
  const group = await teacherGroup(f, teacher);
  const previewPath = '/api/teacher/exports/google-sheet/preview';
  const exportPath = '/api/teacher/exports/google-sheet';
  const draftPreview = (await f.request(previewPath, { cookie:teacher })).data;
  f.sheet.put('C7', '第三小題', '$q_1_3$'); f.sheet.put('H7', '$a_1_3$');
  await f.request('/api/teacher/questions/import-google-sheet', { method:'POST', cookie:teacher });
  assert.equal((await f.request(exportPath, { method:'POST', cookie:teacher,
    body:{ token:draftPreview.token } })).status, 409);
  await f.request(`/api/teacher/groups/${group.id}/start`, { method:'POST', cookie:teacher });
  const answers = { '1_1':'相同一', '1_2':'相同二', '1_3':'相同三' };
  for (const cookie of [a, b]) await f.request(`/api/student/groups/${group.id}/buzz`,
    { method:'POST', cookie, body:{ answers } });
  await f.request(`/api/teacher/groups/${group.id}/stop`, { method:'POST', cookie:teacher });
  const first = (await f.request(previewPath, { cookie:teacher })).data;
  const leader = (await teacherGroup(f, teacher)).submissions[0];
  await f.request(`/api/teacher/groups/${group.id}/submissions/${leader.id}/disqualify`,
    { method:'POST', cookie:teacher });
  const replacement = (await f.request(previewPath, { cookie:teacher })).data;
  assert.deepEqual(first.items, replacement.items);
  assert.equal((await f.request(exportPath, { method:'POST', cookie:teacher,
    body:{ token:first.token } })).status, 409);
});

test('已開始題組的新小題使增量匯入整批失敗；草稿題組可增減小題', () => {
  const sheet = fakeSheet(), store = new Classroom(); groupedSheet(sheet);
  sheet.put('C11', '草稿單題', '$q_3$'); sheet.put('G11', '$a_3$');
  store.importQuestions(sheet.grid());
  const group = store.caseIndex.get(1), before = store.sourceIndex.get('3');
  store.editGroupDuration(group.id, 45);
  sheet.put('C7', '第三小題', '$q_1_3$'); sheet.put('H7', '$a_1_3$');
  store.importQuestions(sheet.grid());
  assert.equal(group.questionIds.length, 3); assert.equal(group.durationSeconds, 45);
  store.remove(store.sourceIndex.get('1_3').id);
  store.groupStatus(group.id, 'open');
  sheet.put('C11', '修改後單題', '$q_3$');
  assert.throws(() => store.importQuestions(sheet.grid()), { status: 409 });
  assert.equal(group.questionIds.length, 2);
  assert.equal(before.content, '草稿單題');
  store.close();
});

test('同組先前整組第一名僅計一次，開放中排行更新且結算後固定', () => {
  const store = new Classroom(), group = store.addGroup('題組',
    [{ content: '一' }, { content: '二' }, { content: '三' }]);
  for (const [student, number] of [['A', 2], ['B', 2], ['C', 3]]) store.registerStudent(student, number);
  const current = store.add('下一題');
  store.groupStatus(group.id, 'open'); store.status(current.id, 'open');
  store.submit(current.id, 'B', 'B答', 2); store.submit(current.id, 'C', 'C答', 3);
  store.submitGroup(group.id, 'A', { '1_1': '一', '1_2': '二', '1_3': '三' }, 2);
  store.groupStatus(group.id, 'settled');
  assert.deepEqual(store.ranking(current).map(entry => entry.priorWinCount), [0, 1]);
  assert.equal(store.submissionById(current, store.ranking(current)[0].id).studentNumber, 'C');
  store.status(current.id, 'settled');
  store.disqualifyGroup(group.id, group.submissions.get('A').id);
  assert.equal(current.winnerKey, 'C');
  store.close();
});
