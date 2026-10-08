import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleWriter, sheetData, SheetExporter } from '../src/sheets.js';
import { Classroom } from '../src/classroom.js';
import { fixture, testConfig } from './helpers.js';

test('RAW、固定位置、精確回答_學號格式及分頁跳脫', async () => {
  const data = sheetData([{ caseNumber: 1, answer: 'Single element', studentNumber: '00123' },
    { caseNumber: 3, answer: '=1+1\n第二行', studentNumber: '0007' }], "老師's 表");
  assert.deepEqual(data, [{ range: "'老師''s 表'!C19", values: [['Single element_00123']] },
    { range: "'老師''s 表'!C21", values: [['=1+1\n第二行_0007']] }]);
  let called = 0;
  const write = createGoogleWriter(testConfig({ sheetId: 'configured-id', credentialFile: 'test-only.json' }), {
    tokenProvider: async () => 'test-token', fetchImpl: async (url, options) => {
      called++; assert.equal(url, 'https://sheets.googleapis.com/v4/spreadsheets/configured-id/values:batchUpdate');
      assert.deepEqual(JSON.parse(options.body), { valueInputOption: 'RAW', data });
      assert.equal(options.method, 'POST');
      return Response.json({ totalUpdatedCells: 2 });
    },
  });
  await write(data); assert.equal(called, 1);
});

test('未設定、403、授權逾時與回應遺失不偽稱成功', async () => {
  const data = sheetData([{ caseNumber: 1, answer: '答', studentNumber: '001' }], '工作表1');
  await assert.rejects(createGoogleWriter(testConfig())(data), { status: 503 });
  const config = testConfig({ sheetId: 'id', credentialFile: 'file', googleTimeoutMs: 30 });
  for (const fetchImpl of [async () => new Response('secret', { status: 403 }), async () => { throw new Error('secret-token'); },
    async () => Response.json({ totalUpdatedCells: 0 })]) {
    await assert.rejects(createGoogleWriter(config, { tokenProvider: async () => 'token', fetchImpl })(data), error => error.status === 502 && !error.message.includes('secret'));
  }
  let fetched = false;
  await assert.rejects(createGoogleWriter(config, { tokenProvider: () => new Promise(resolve => setTimeout(() => resolve('token'), 60)),
    fetchImpl: async () => { fetched = true; } })(data), { status: 502 });
  await new Promise(resolve => setTimeout(resolve, 70)); assert.equal(fetched, false);
});

test('匯出快照只含第一名；鎖定管理，仍收集回答；失敗可重試', async t => {
  let release; let rejectWrite; let captured;
  const f = await fixture(t, { writer: data => { captured = structuredClone(data); return new Promise((resolve, reject) => { release = resolve; rejectWrite = reject; }); } });
  const teacher = await f.login('teacher'); const a = await f.login('student', '001'); const b = await f.login('student', '002');
  const q1 = await f.question(teacher, 1); const q2 = await f.question(teacher, 2);
  const buzz = (q, cookie, answer) => f.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie, body: { answer } });
  await buzz(q1, a, '第一'); await buzz(q1, b, '第二');
  await f.request(`/api/teacher/questions/${q1.id}/stop`, { method: 'POST', cookie: teacher });
  const exporting = f.request('/api/teacher/exports/google-sheet', { method: 'POST', cookie: teacher });
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(captured, [{ range: "'工作表1'!C19", values: [['第一_001']] }]);
  for (const path of ['/api/teacher/exports/google-sheet', `/api/teacher/questions/${q1.id}/stop`,
    `/api/teacher/questions/${q1.id}/submissions/${f.store.get(q1.id).submissions.get('001').id}/disqualify`]) {
    assert.equal((await f.request(path, { method: 'POST', cookie: teacher })).status, 409);
  }
  await buzz(q2, b, '第二題'); assert.equal(f.store.get(q2.id).winnerKey, null);
  assert.equal((await f.request(`/api/teacher/questions/${q2.id}/stop`, { method: 'POST', cookie: teacher })).status, 409);
  release(); assert.equal((await exporting).data.writtenCount, 1);
  await f.request(`/api/teacher/questions/${q2.id}/stop`, { method: 'POST', cookie: teacher });
  release = undefined;
  const failed = f.request('/api/teacher/exports/google-sheet', { method: 'POST', cookie: teacher });
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  rejectWrite(new Error('network')); assert.equal((await failed).status, 502); assert.equal(f.store.exporting, false);
  f.exporter.writer = async data => { assert.equal(data.length, 2); };
  const retry = await f.request('/api/teacher/exports/google-sheet', { method: 'POST', cookie: teacher });
  assert.equal(retry.data.writtenCount, 2); assert.equal(f.store.get(q1.id).submissions.size, 2);
});

test('候補覆寫、全員失格後清空；從未匯出的空題不動，失敗可重試', async t => {
  const batches = []; let fail = false;
  const f = await fixture(t, { writer: async data => { batches.push(structuredClone(data)); if (fail) throw Error('network'); } });
  const teacher = await f.login('teacher'), a = await f.login('student','A'), b = await f.login('student','B');
  const q1 = await f.question(teacher,1), q2 = await f.question(teacher,2);
  for (const [cookie, answer] of [[a,'甲'],[b,'乙']]) await f.request(`/api/student/questions/${q1.id}/buzz`,{method:'POST',cookie,body:{answer}});
  for (const q of [q1,q2]) await f.request(`/api/teacher/questions/${q.id}/stop`,{method:'POST',cookie:teacher});
  const exportNow = () => f.request('/api/teacher/exports/google-sheet',{method:'POST',cookie:teacher});
  assert.equal((await exportNow()).data.writtenCount,1);
  assert.deepEqual(batches[0],[{range:"'工作表1'!C19",values:[['甲_A']]}]);
  const disqualify = id => f.request(`/api/teacher/questions/${q1.id}/submissions/${id}/disqualify`,{method:'POST',cookie:teacher});
  await disqualify(f.store.get(q1.id).submissions.get('A').id);
  assert.equal((await exportNow()).data.clearedCount,0);
  assert.deepEqual(batches[1],[{range:"'工作表1'!C19",values:[['乙_B']]}]);
  await disqualify(f.store.get(q1.id).submissions.get('B').id);
  fail = true; assert.equal((await exportNow()).status,502);
  assert.equal(f.store.get(q1.id).confirmedExport,true);
  fail = false; const result = await exportNow();
  assert.equal(result.data.writtenCount,1); assert.equal(result.data.clearedCount,1);
  assert.deepEqual(batches.at(-1),[{range:"'工作表1'!C19",values:[['']]}]);
  assert.equal((await exportNow()).data.writtenCount,0);
});

test('匯出期間其他題目提交並到期，當次快照不納入新得標者', async () => {
  let now = 0, fire, release;
  const store = new Classroom({ clock: () => now, wallClock: () => 1_700_000_000_000 + now,
    schedule: callback => { fire = callback; return 1; }, cancel: () => {} });
  const q1 = store.add(1, '已完成'), q2 = store.add(2, '仍開放', 1);
  store.status(q1.id, 'open'); store.submit(q1.id, 'A', '甲答'); store.status(q1.id, 'settled');
  store.status(q2.id, 'open');
  const batches = [];
  const exporter = new SheetExporter(store, testConfig(), data => {
    batches.push(structuredClone(data));
    if (batches.length === 1) return new Promise(resolve => { release = resolve; });
  });
  const exporting = exporter.run();
  assert.equal(store.submit(q2.id, 'B', '乙答'), true);
  now = 1000; fire(); assert.equal(q2.status, 'settled');
  release(); assert.equal((await exporting).writtenCount, 1);
  assert.deepEqual(batches[0], [{ range: "'工作表1'!C19", values: [['甲答_A']] }]);
  assert.equal((await exporter.run()).writtenCount, 2);
  assert.deepEqual(batches[1].map(d => d.range), ["'工作表1'!C19", "'工作表1'!C20"]);
  store.close();
});
