import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleWriter, sheetData, sheetCoordinate, exportPlan, SheetExporter } from '../src/sheets.js';
import { Classroom } from '../src/classroom.js';
import { submit } from './grouped-submit.js';
import { fixture, testConfig } from './helpers.js';

test('RAW、固定位置、精確{題目}_回答_G組別格式及分頁跳脫', async () => {
  const data = sheetData([{ caseNumber: 1, content: '題一', answer: 'Single element', groupNumber: 2 },
    { caseNumber: 3, content: '題三', answer: '=1+1\n第二行', groupNumber: 7 }], "老師's 表");
  assert.deepEqual(data, [{ range: "'老師''s 表'!C19", values: [['{題一}_Single element_G2']] },
    { range: "'老師''s 表'!C21", values: [['{題三}_=1+1\n第二行_G7']] }]);
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
  const data = sheetData([{ caseNumber: 1, content: '題目', answer: '答', groupNumber: 1 }], '工作表1');
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
  assert.deepEqual(captured, [{ range: "'工作表1'!C19", values: [['{第 1 題}_第一_G1']] }]);
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
  f.exporter.writer = Object.assign(async data => { assert.equal(data.length, 2); },
    { readCells: async items => new Map(items.map(item => [item.range, ''])) });
  const retry = await f.request('/api/teacher/exports/google-sheet', { method: 'POST', cookie: teacher });
  assert.equal(retry.data.writtenCount, 2); assert.equal(f.store.get(q1.id).submissions.size, 2);
});

test('候補覆寫、全員失格後清空；從未匯出的空題不動，失敗可重試', async t => {
  const batches = []; let fail = false;
  const writer = Object.assign(async data => { batches.push(structuredClone(data)); if (fail) throw Error('network'); },
    { readCells: async items => new Map(items.map(item => [item.range, '{第 1 題}_乙_G2'])) });
  const f = await fixture(t, { writer });
  const teacher = await f.login('teacher'), a = await f.login('student','A'), b = await f.login('student','B');
  const q1 = await f.question(teacher,1), q2 = await f.question(teacher,2);
  for (const [cookie, answer] of [[a,'甲'],[b,'乙']]) await f.request(`/api/student/questions/${q1.id}/buzz`,{method:'POST',cookie,body:{answer}});
  for (const q of [q1,q2]) await f.request(`/api/teacher/questions/${q.id}/stop`,{method:'POST',cookie:teacher});
  const exportNow = () => f.request('/api/teacher/exports/google-sheet',{method:'POST',cookie:teacher});
  assert.equal((await exportNow()).data.writtenCount,1);
  assert.deepEqual(batches[0],[{range:"'工作表1'!C19",values:[['{第 1 題}_甲_G1']]}]);
  const disqualify = id => f.request(`/api/teacher/questions/${q1.id}/submissions/${id}/disqualify`,{method:'POST',cookie:teacher});
  await disqualify(f.store.get(q1.id).submissions.get('A').id);
  assert.equal((await exportNow()).data.clearedCount,0);
  assert.deepEqual(batches[1],[{range:"'工作表1'!C19",values:[['{第 1 題}_乙_G2']]}]);
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
  const q1 = store.add('已完成'), q2 = store.add('仍開放', 1);
  store.status(q1.id, 'open'); submit(store, q1.id, 'A', '甲答'); store.status(q1.id, 'settled');
  store.status(q2.id, 'open');
  const batches = [];
  const exporter = new SheetExporter(store, testConfig(), data => {
    batches.push(structuredClone(data));
    if (batches.length === 1) return new Promise(resolve => { release = resolve; });
  });
  const exporting = exporter.run();
  assert.equal(submit(store, q2.id, 'B', '乙答'), true);
  now = 1000; fire(); assert.equal(q2.status, 'settled');
  release(); assert.equal((await exporting).writtenCount, 1);
  assert.deepEqual(batches[0], [{ range: "'工作表1'!C19", values: [['{已完成}_甲答_G1']] }]);
  assert.equal((await exporter.run()).writtenCount, 2);
  assert.deepEqual(batches[1].map(d => d.range), ["'工作表1'!C19", "'工作表1'!C20"]);
  store.close();
});

test('題組座標與後端預覽；刪題、失敗與同座標重建後仍正確清空或覆寫', async () => {
  const store = new Classroom();
  assert.equal(sheetCoordinate(1, 1), 'C19'); assert.equal(sheetCoordinate(1, 2), 'D19');
  assert.equal(sheetCoordinate(1, 3), 'E19'); assert.equal(sheetCoordinate(7), 'C25');
  assert.equal(sheetCoordinate(2, 25), 'AA20');
  const group = store.addGroup('題組', [{content:'甲'}, {content:'乙'}, {content:'丙'}]);
  const q = group.questions[1]; store.status(q.id,'open'); submit(store, q.id,'001','第一'); store.status(q.id,'settled');
  store.add('第二題');
  assert.deepEqual(exportPlan(store,'工作表1').items.map(x => x.range), ["'工作表1'!D19"]);
  let fail = false; const batches = [];
  const writer = Object.assign(async data => { batches.push(data); if (fail) throw new Error('lost'); },
    { readCells: async items => new Map(items.map(item => [item.range, '{乙}_第一_G1'])) });
  const exporter = new SheetExporter(store, testConfig(), writer);
  await exporter.run(); store.remove(q.id);
  assert.deepEqual(exportPlan(store,'工作表1').items, [{caseNumber:1,partNumber:2,range:"'工作表1'!D19",clear:true,value:'',expectedOldValue:'{乙}_第一_G1'}]);
  fail = true; await assert.rejects(exporter.run(), {status:502});
  assert.equal(store.confirmedCells.size, 1);
  fail = false; assert.equal((await exporter.run()).clearedCount,1); assert.equal(store.confirmedCells.size,0);
  assert.equal((await exporter.run()).writtenCount,0);
  store.removeGroup(group.id); store.close();
});

test('已匯出題組刪除後同 Case 重建，當前得標者優先覆寫待清空格', async () => {
  const store = new Classroom(), batches = [];
  const original = store.addGroup('舊題組',[{content:'一'},{content:'二'}]); const first = original.questions[1];
  store.status(first.id,'open'); submit(store, first.id,'A','舊答'); store.status(first.id,'settled');
  const exporter = new SheetExporter(store,testConfig(),async data => { batches.push(structuredClone(data)); });
  await exporter.run(); store.removeGroup(original.id);
  assert.equal(store.confirmedCells.size,1);
  const replacement = store.addGroup('新題組',[{content:'一'},{content:'二'}]).questions[1];
  store.status(replacement.id,'open'); submit(store, replacement.id,'B','新答'); store.status(replacement.id,'settled');
  assert.deepEqual(exportPlan(store,'工作表1').items.map(item => [item.range,item.value,item.clear]),[["'工作表1'!D19",'{二}_新答_G2',false]]);
  await exporter.run(); assert.equal(store.confirmedCells.size,1);
  assert.deepEqual(batches.at(-1),[{range:"'工作表1'!D19",values:[['{二}_新答_G2']]}]);
  store.close();
});

test('刪除 Case 2 與小題 1-2 後，新格覆寫且已確認的舊格清空', async () => {
  const store = new Classroom(), batches = [];
  const q1 = store.add('一'), q2 = store.add('二'), q3 = store.add('三');
  const group = store.addGroup('題組', [{ content: '1' }, { content: '2' }, { content: '3' }]);
  for (const q of [q2, q3, ...group.questions]) {
    store.status(q.id, 'open'); submit(store, q.id, `S${q.id.slice(0, 2)}`, q.content); store.status(q.id, 'settled');
  }
  const writer = async data => { batches.push(structuredClone(data)); };
  const exporter = new SheetExporter(store, testConfig(), writer);
  await exporter.run();
  store.remove(q2.id); store.remove(group.questions[1].id);
  const preview = exportPlan(store, '工作表1').items;
  assert.deepEqual(preview.map(item => [item.range, item.clear]), [
    ["'工作表1'!C20", false], ["'工作表1'!C21", false],
    ["'工作表1'!D21", false],
    ["'工作表1'!C22", true], ["'工作表1'!D22", true], ["'工作表1'!E22", true],
  ]);
  await exporter.run();
  assert.deepEqual(batches.at(-1).filter(item => item.values[0][0] === '').map(item => item.range),
    ["'工作表1'!C22", "'工作表1'!D22", "'工作表1'!E22"]);
  assert.equal(store.get(q3.id).caseNumber, 2); assert.equal(store.get(group.questions[2].id).partNumber, 2);
  assert.equal(store.get(q1.id).status, 'draft'); store.close();
});

test('刪除 1-2 後 1-3 的 E19 遞補到 D19；開放中候補不輸出', async () => {
  const store = new Classroom();
  const group = store.addGroup('一', [{ content: '1-1' }, { content: '1-2' }, { content: '1-3' }]);
  const last = group.questions[2];
  store.status(last.id, 'open'); submit(store, last.id, 'A', '第三答'); store.status(last.id, 'settled');
  const exporter = new SheetExporter(store, testConfig(), async () => {});
  await exporter.run(); store.remove(group.questions[1].id);
  assert.deepEqual(exportPlan(store, '工作表1').items.map(item => [item.range, item.clear]),
    [["'工作表1'!D19", false], ["'工作表1'!E19", true]]);
  const opened = store.addPart(group.id, '新 1-3'); store.status(opened.id, 'open');
  submit(store, opened.id, 'B', '未結算');
  assert.deepEqual(exportPlan(store, '工作表1').items.map(item => [item.range, item.clear]),
    [["'工作表1'!D19", false], ["'工作表1'!E19", true]]);
  store.close();
});

function fakeGoogle({ labels = {}, merges = [], rowCount = 100, loseStructureReply = false, loseValueReply = false } = {}) {
  const state = { labels: new Map(Object.entries(labels).map(([n,v]) => [Number(n),v])), markers: new Map(),
    values: new Map(), merges: structuredClone(merges), calls: [], rowCount, writes: [], loseValueReply };
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    state.calls.push({url, method:options.method, body});
    if (url.includes('/values:batchGet')) {
      const ranges = new URL(url).searchParams.getAll('ranges');
      return Response.json({ valueRanges: ranges.map(range => ({ range, values: state.values.has(range) ? [[state.values.get(range)]] : [] })) });
    }
    if (url.includes('/values/')) {
      const match = decodeURIComponent(url).match(/!B25:B(\d+)/);
      return Response.json({values:Array.from({length:Number(match[1])-24},(_,i) => state.labels.get(i+7) ? [state.labels.get(i+7)] : [])});
    }
    if (url.endsWith(':batchUpdate') && !url.includes('/values:')) {
      for (const request of body.requests) {
        if (request.insertDimension) {
          const {startIndex,endIndex} = request.insertDimension.range;
          state.inserted = (state.inserted || 0) + endIndex-startIndex;
        }
        if (request.updateCells) state.labels.set(request.updateCells.range.startRowIndex-17,request.updateCells.rows[0].values[0].userEnteredValue.stringValue);
        if (request.createDeveloperMetadata) {
          const m = request.createDeveloperMetadata.developerMetadata;
          state.markers.set(Number(m.metadataValue),m.location.dimensionRange.startIndex);
        }
        if (request.unmergeCells) state.merges = state.merges.filter(m => JSON.stringify(m) !== JSON.stringify(request.unmergeCells.range));
      }
      if (loseStructureReply) { loseStructureReply = false; throw new Error('reply lost'); }
      return Response.json({replies:body.requests.map(() => ({}))});
    }
    if (url.includes('/values:batchUpdate')) {
      state.writes.push(body); for (const item of body.data) state.values.set(item.range, item.values[0][0]);
      if (state.loseValueReply) { state.loseValueReply = false; throw new Error('reply lost'); }
      return Response.json({totalUpdatedCells:body.data.length});
    }
    return Response.json({sheets:[{properties:{sheetId:538609809,title:'工作表1',gridProperties:{rowCount:state.rowCount,columnCount:100}},
      merges:state.merges,developerMetadata:[...state.markers].map(([n,index],i) => ({metadataId:i+1,metadataKey:'live-buzzer-case',metadataValue:String(n),location:{dimensionRange:{sheetId:538609809,dimension:'ROWS',startIndex:index,endIndex:index+1}}}))}]});
  };
  return {state,fetchImpl};
}

test('Google 模擬：Case 7 首次插列、已存在列或回應遺失時不再插列', async () => {
  const config = testConfig({sheetId:'id',credentialFile:'file'});
  const store = new Classroom(); for (let i = 1; i < 7; i++) store.add(`第 ${i} 題`);
  const q = store.add('第七題'); store.status(q.id,'open'); submit(store, q.id,'007','答案'); store.status(q.id,'settled');
  const plan = exportPlan(store,'工作表1'), data = sheetData(store.winners(),'工作表1');
  const fake = fakeGoogle({loseStructureReply:true}); const writer = createGoogleWriter(config,{tokenProvider:async()=> 'token',fetchImpl:fake.fetchImpl});
  await assert.rejects(writer(data,plan),{status:502}); assert.equal(fake.state.inserted,1); assert.equal(fake.state.markers.get(7),24);
  await writer(data,plan); assert.equal(fake.state.inserted,1);
  assert.deepEqual(fake.state.writes.at(-1),{valueInputOption:'RAW',data});
  fake.state.labels.set(7,'');
  await writer(data,plan); assert.equal(fake.state.inserted,1); assert.equal(fake.state.labels.get(7),'Case 7');
  const adopted = fakeGoogle({labels:{7:'Case 7'}});
  await createGoogleWriter(config,{tokenProvider:async()=> 'token',fetchImpl:adopted.fetchImpl})(data,plan);
  assert.equal(adopted.state.inserted,undefined); assert.equal(adopted.state.markers.get(7),24);
  store.close();
});

test('Google 模擬：跳號 Case 10 預留 7–10，題組只解除相交合併', async () => {
  const config = testConfig({sheetId:'id',credentialFile:'file'});
  const store = new Classroom();
  const group = store.addGroup('題組',[{content:'一'},{content:'二'},{content:'三'}]);
  for (const q of group.questions) { store.status(q.id,'open'); submit(store, q.id,String(q.partNumber),`答${q.partNumber}`); store.status(q.id,'settled'); }
  for (let i = 2; i < 10; i++) store.add(`第 ${i} 題`);
  const q10 = store.add('第十題'); store.status(q10.id,'open'); submit(store, q10.id,'10','答10'); store.status(q10.id,'settled');
  const plan = exportPlan(store,'工作表1'), data = sheetData(store.winners(),'工作表1');
  assert.deepEqual(plan.items.map(i=>i.range),["'工作表1'!C19","'工作表1'!D19","'工作表1'!E19","'工作表1'!C28"]);
  const fake = fakeGoogle({merges:[
    {sheetId:538609809,startRowIndex:18,endRowIndex:19,startColumnIndex:3,endColumnIndex:5},
    {sheetId:538609809,startRowIndex:19,endRowIndex:20,startColumnIndex:3,endColumnIndex:5},
  ]});
  await createGoogleWriter(config,{tokenProvider:async()=> 'token',fetchImpl:fake.fetchImpl})(data,plan);
  const structural = fake.state.calls.find(c=>c.url.endsWith(':batchUpdate') && !c.url.includes('/values:'));
  assert.equal(structural.body.requests.find(r=>r.insertDimension).insertDimension.range.startIndex,24);
  assert.equal(fake.state.inserted,4);
  assert.equal(structural.body.requests.filter(r=>r.createDeveloperMetadata).length,4);
  assert.deepEqual(structural.body.requests.filter(r=>r.unmergeCells).map(r=>r.unmergeCells.range.startRowIndex),[18]);
  assert.equal(fake.state.merges.length,1);
  store.close();
});

test('Google 模擬：錯位的既有 Case 標籤拒絕寫值，不會再插列', async () => {
  const fake = fakeGoogle({labels:{7:'Case 10'}});
  const writer = createGoogleWriter(testConfig({sheetId:'id',credentialFile:'file'}),{tokenProvider:async()=> 'token',fetchImpl:fake.fetchImpl});
  const targets = [{caseNumber:7,partNumber:null,content:'第七題',answer:'甲',groupNumber:1}];
  const data = sheetData(targets,'工作表1');
  await assert.rejects(writer(data,{items:[{caseNumber:7,partNumber:null,range:data[0].range,clear:false,value:'{第七題}_甲_G1'}],throughCase:7}),{status:502});
  assert.equal(fake.state.inserted,undefined); assert.equal(fake.state.writes.length,0);
});

test('Google 模擬：回應遺失先讀回舊格，再重試且不清除他人修改', async () => {
  const fake = fakeGoogle(), store = new Classroom();
  const config = testConfig({ sheetId: 'id', credentialFile: 'file' });
  const exporter = new SheetExporter(store, config, createGoogleWriter(config,
    { tokenProvider: async () => 'token', fetchImpl: fake.fetchImpl }));
  const first = store.add('一'), second = store.add('二');
  store.status(second.id, 'open'); submit(store, second.id, '002', '答案'); store.status(second.id, 'settled');
  await exporter.run(); store.remove(first.id);
  fake.state.loseValueReply = true;
  await assert.rejects(exporter.run(), { status: 502 });
  assert.equal(fake.state.values.get("'工作表1'!C19"), '{二}_答案_G1');
  assert.equal(fake.state.values.get("'工作表1'!C20"), '');
  assert.equal(store.ambiguousBatch.length, 2);
  await exporter.run(); assert.equal(store.ambiguousBatch, null);
  assert.equal(fake.state.writes.at(-1).data.length, 1);
  store.remove(second.id);
  fake.state.values.set("'工作表1'!C19", '教師手動修改');
  await assert.rejects(exporter.run(), { status: 502 });
  assert.equal(fake.state.values.get("'工作表1'!C19"), '教師手動修改');
  store.close();
});

test('Google 模擬：已插入的 Case 8 列在刪前題與重建後沿用', async () => {
  const fake = fakeGoogle(), store = new Classroom();
  const config = testConfig({ sheetId: 'id', credentialFile: 'file' });
  const exporter = new SheetExporter(store, config, createGoogleWriter(config,
    { tokenProvider: async () => 'token', fetchImpl: fake.fetchImpl }));
  const questions = Array.from({ length: 8 }, (_, i) => store.add(`題 ${i + 1}`));
  const last = questions[7]; store.status(last.id, 'open'); submit(store, last.id, '008', '回答'); store.status(last.id, 'settled');
  await exporter.run(); assert.equal(fake.state.inserted, 2);
  store.remove(questions[0].id); await exporter.run();
  assert.equal(fake.state.values.get("'工作表1'!C25"), '{題 8}_回答_G1');
  assert.equal(fake.state.values.get("'工作表1'!C26"), '');
  const newCase8 = store.add('重建八'); store.status(newCase8.id, 'open');
  submit(store, newCase8.id, '009', '新回答'); store.status(newCase8.id, 'settled');
  await exporter.run(); assert.equal(fake.state.inserted, 2);
  assert.equal(fake.state.values.get("'工作表1'!C26"), '{重建八}_新回答_G2'); store.close();
});
