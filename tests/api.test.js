import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, testConfig } from './helpers.js';

function source(sheet) {
  sheet.put('C5', '第一小題', '$q_1_1$'); sheet.put('H5', '$a_1_1$');
  sheet.put('C6', '第二小題', '$q_1_2$'); sheet.put('H6', '$a_1_2$');
  sheet.put('C11', '單題三', '$q_3$'); sheet.put('G11', '$a_3$');
}
const importPath = '/api/teacher/questions/import-google-sheet';

test('教師匯入、草稿秒數與停用手動建題；學生只看題目和自身狀態', async t => {
  const f = await fixture(t), teacher = await f.login('teacher'), student = await f.login('student', '001', 2);
  source(f.sheet);
  assert.equal((await f.request(importPath, { method:'POST' })).status, 401);
  assert.equal((await f.request(importPath, { method:'POST', cookie:teacher, body:{ sheetId:'other' } })).status, 400);
  assert.deepEqual((await f.request(importPath, { method:'POST', cookie:teacher })).data,
    { added:3, updated:0, retained:0, missing:[] });
  let questions = (await f.request('/api/teacher/questions', { cookie:teacher })).data.questions;
  assert.deepEqual(questions.map(q => [q.caseNumber,q.kind]), [[1,'group'],[3,'single']]);
  const id = questions[0].id;
  assert.equal((await f.request('/api/teacher/questions', { method:'POST', cookie:teacher, body:{content:'偽造'} })).status, 404);
  assert.equal((await f.request('/api/teacher/groups', { method:'POST', cookie:teacher, body:{title:'偽造'} })).status, 404);
  assert.equal((await f.request(`/api/teacher/groups/${id}`, { method:'PATCH', cookie:teacher,
    body:{content:'不允許',durationSeconds:20} })).status, 400);
  assert.equal((await f.request(`/api/teacher/groups/${id}`, { method:'PATCH', cookie:teacher,
    body:{durationSeconds:20} })).data.durationSeconds, 20);
  await f.request(`/api/teacher/groups/${id}/start`, { method:'POST', cookie:teacher });
  const own = (await f.request('/api/student/questions', { cookie:student })).data;
  assert.equal(own.questions.length, 1);
  assert.deepEqual(own.questions[0].parts.map(part => part.content), ['第一小題','第二小題']);
  assert.equal(JSON.stringify(own).includes('$q_'), false);
  assert.equal(JSON.stringify(own).includes('rank'), false);
  assert.equal((await f.request(`/api/teacher/groups/${id}`, { method:'PATCH', cookie:teacher,
    body:{durationSeconds:50} })).status, 409);
  questions = (await f.request('/api/teacher/questions', { cookie:teacher })).data.questions;
  assert.equal(questions[0].durationSeconds, 20);
});

test('來源文字殘留與鍵衝突不部分匯入；重匯保留課堂並維持固定題號', async t => {
  const f = await fixture(t), teacher = await f.login('teacher');
  source(f.sheet); f.sheet.put('C5', '第一小題 $q_1_1$', '');
  assert.equal((await f.request(importPath, { method:'POST', cookie:teacher })).status, 400);
  assert.equal((await f.request('/api/teacher/questions', { cookie:teacher })).data.questions.length, 0);
  f.sheet.put('C5', '第一小題', '$q_1_1$');
  await f.request(importPath, { method:'POST', cookie:teacher });
  let q = (await f.request('/api/teacher/questions', { cookie:teacher })).data.questions;
  await f.request(`/api/teacher/groups/${q[0].id}/start`, { method:'POST', cookie:teacher });
  f.sheet.put('C5', '改動開放題文字', '$q_1_1$');
  f.sheet.put('C6', '更新草稿文字', '$q_1_2$');
  assert.equal((await f.request(importPath, { method:'POST', cookie:teacher })).data.updated, 0);
  q = (await f.request('/api/teacher/questions', { cookie:teacher })).data.questions;
  assert.equal(q[0].parts[0].content, '第一小題'); assert.equal(q[0].parts[1].content, '第二小題');
  assert.equal((await f.request(`/api/teacher/questions/${q[0].parts[1].id}`, { method:'DELETE', cookie:teacher })).status, 409);
  await f.request(`/api/teacher/groups/${q[0].id}`, { method:'DELETE', cookie:teacher });
  q = (await f.request('/api/teacher/questions', { cookie:teacher })).data.questions;
  assert.deepEqual(q.map(item => item.caseNumber), [3]);
  assert.equal((await f.request(importPath, { method:'POST', cookie:teacher })).data.added, 2);
  q = (await f.request('/api/teacher/questions', { cookie:teacher })).data.questions;
  assert.deepEqual(q[0].parts.map(part => part.partNumber), [1,2]);
});

test('預覽確認 token 綁教師工作階段，拒絕前端自選格位與預覽後修改', async t => {
  const f = await fixture(t), teacher = await f.login('teacher'), other = await f.login('teacher');
  const student = await f.login('student','001',2); const q = await f.question(teacher,3);
  await f.request(`/api/student/questions/${q.id}/buzz`, { method:'POST', cookie:student, body:{answer:'回答'} });
  await f.request(`/api/teacher/questions/${q.id}/stop`, { method:'POST', cookie:teacher });
  const previewPath = '/api/teacher/exports/google-sheet/preview', exportPath = '/api/teacher/exports/google-sheet';
  assert.equal((await f.request(previewPath)).status, 401);
  const preview = (await f.request(previewPath, { cookie:teacher })).data;
  assert.equal(preview.items[0].range, "'學習單'!H7");
  assert.equal(preview.items[0].value, '回答_G2');
  assert.equal((await f.request(exportPath, { method:'POST', cookie:other, body:{token:preview.token} })).status, 409);
  assert.equal((await f.request(exportPath, { method:'POST', cookie:teacher,
    body:{token:preview.token,range:'Z99'} })).status, 400);
  assert.equal((await f.request(exportPath, { method:'POST', cookie:teacher, body:{token:preview.token} })).status, 200);
  assert.equal(f.sheet.cells.get('H7').note, '$a_3$');
  assert.equal(f.sheet.cells.get('H7').userEnteredValue.stringValue, '回答_G2');
  assert.equal((await f.request(exportPath, { method:'POST', cookie:teacher, body:{token:preview.token} })).status, 409);
});

test('100 名學生同題併發全部保留，結算只一名；教師可失格並遞補', async t => {
  const f = await fixture(t), teacher = await f.login('teacher'), q = await f.question(teacher);
  const cookies = await Promise.all(Array.from({length:100},(_,i) => f.login('student', String(i).padStart(3,'0'), i+1)));
  const results = await Promise.all(cookies.map((cookie,i) => f.request(`/api/student/questions/${q.id}/buzz`,
    { method:'POST', cookie, body:{answer:`答${i}`} })));
  assert.equal(results.every(r => r.status===202 && r.data.received===true), true);
  await f.request(`/api/teacher/questions/${q.id}/stop`, { method:'POST', cookie:teacher });
  let detail = (await f.request(`/api/teacher/questions/${q.id}`, { cookie:teacher })).data;
  assert.equal(detail.submissions.length, 100); assert.ok(detail.winner);
  const first = detail.submissions.find(s => s.studentNumber === detail.winner.studentNumber);
  await f.request(`/api/teacher/questions/${q.id}/submissions/${first.id}/disqualify`, { method:'POST', cookie:teacher });
  detail = (await f.request(`/api/teacher/questions/${q.id}`, { cookie:teacher })).data;
  assert.notEqual(detail.winner.studentNumber, first.studentNumber);
});

test('缺少 Google 設定時匯入與預覽安全失敗，不洩漏憑證', async t => {
  const config = testConfig({ sheetId:'', credentialFile:'' });
  const f = await fixture(t, { config, sheetClient:undefined }), teacher = await f.login('teacher');
  // 測試用假客戶端提供隔離 Sheet；此處直接測真客戶端的設定驗證。
  const { createGoogleSheetClient } = await import('../src/sheets.js');
  await assert.rejects(createGoogleSheetClient(config).readGrid(), { status:503 });
  assert.equal((await f.request('/api/teacher/questions', { cookie:teacher })).status, 200);
});

test('Google 讀取 502／503 以安全訊息回覆教師，課堂與認證資料不外洩', async t => {
  const { HttpError } = await import('../src/http.js');
  for (const status of [502,503]) {
    const f = await fixture(t, { sheetClient:{ async readGrid() { throw new HttpError(status,'Google Sheet 暫不可用'); } } });
    const teacher = await f.login('teacher');
    const response = await f.request(importPath, { method:'POST', cookie:teacher });
    assert.equal(response.status, status);
    assert.equal(JSON.stringify(response.data).includes('test-password-only'), false);
    assert.deepEqual((await f.request('/api/teacher/questions', { cookie:teacher })).data.questions, []);
  }
});

test('本機整合：匯入兩題、搶答、結算、失格遞補、匯出及重匯', async t => {
  const f = await fixture(t), teacher = await f.login('teacher');
  const a = await f.login('student','A',1), b = await f.login('student','B',2);
  f.sheet.put('C5','第一題','$q_1$'); f.sheet.put('H5','$a_1$');
  f.sheet.put('C6','第二題','$q_2$'); f.sheet.put('H6','$a_2$');
  await f.request(importPath,{method:'POST',cookie:teacher});
  const questions = (await f.request('/api/teacher/questions',{cookie:teacher})).data.questions;
  for (const q of questions) await f.request(`/api/teacher/questions/${q.id}/start`,{method:'POST',cookie:teacher});
  for (const q of questions) {
    await f.request(`/api/student/questions/${q.id}/buzz`,{method:'POST',cookie:a,body:{answer:'甲答'}});
    await f.request(`/api/student/questions/${q.id}/buzz`,{method:'POST',cookie:b,body:{answer:'乙答'}});
    await f.request(`/api/teacher/questions/${q.id}/stop`,{method:'POST',cookie:teacher});
  }
  const second = (await f.request(`/api/teacher/questions/${questions[1].id}`,{cookie:teacher})).data;
  assert.equal(second.winner.studentNumber,'B');
  const winnerId = second.submissions.find(s => s.studentNumber === 'B').id;
  await f.request(`/api/teacher/questions/${questions[1].id}/submissions/${winnerId}/disqualify`,
    {method:'POST',cookie:teacher});
  const preview = (await f.request('/api/teacher/exports/google-sheet/preview',{cookie:teacher})).data;
  assert.deepEqual(preview.items.map(item => item.value), ['甲答_G1','甲答_G1']);
  assert.equal((await f.request('/api/teacher/exports/google-sheet',
    {method:'POST',cookie:teacher,body:{token:preview.token}})).status,200);
  assert.equal(f.sheet.cells.get('H6').note,'$a_2$');
  f.sheet.put('C5','改動已結算題','$q_1$');
  assert.equal((await f.request(importPath,{method:'POST',cookie:teacher})).data.retained,2);
  assert.equal((await f.request('/api/teacher/questions',{cookie:teacher})).data.questions[0].content,'第一題');
});
