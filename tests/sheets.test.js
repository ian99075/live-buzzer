import test from 'node:test';
import assert from 'node:assert/strict';
import { Classroom } from '../src/classroom.js';
import { SheetExporter, createGoogleSheetClient } from '../src/sheets.js';
import { fakeSheet } from './sheet-fixture.js';

function setup() {
  const sheet = fakeSheet(), store = new Classroom();
  for (const [key,q,a] of [['1_1','C5','H5'],['1_2','C6','H6'],['2_1','C8','H8'],
    ['2_2','C9','H9'],['3','C11','G11'],['4','C13','G13']]) {
    sheet.put(q, `題目 ${key}`, `$q_${key}$`); sheet.put(a, `$a_${key}$`);
  }
  store.importQuestions(sheet.grid());
  const exporter = new SheetExporter(store, { sheetName:'學習單' }, sheet.client);
  return { sheet, store, exporter };
}
function answer(store, key, student, group, text) {
  const q = store.sourceIndex.get(key);
  store.registerStudent(student, group); store.status(q.id, 'open');
  assert.equal(store.submit(q.id, student, text, group), true);
  store.status(q.id, 'settled'); return q;
}

test('六題依 a 鍵實際格位預覽，首次匯出將純文字答案與佔位符備註同批保存', async () => {
  const { sheet, store, exporter } = setup();
  for (const n of [1, 2]) {
    const group = store.caseIndex.get(n), student = `S${n}`;
    store.registerStudent(student, 2); store.groupStatus(group.id, 'open');
    assert.equal(store.submitGroup(group.id, student,
      Object.fromEntries(group.questionIds.map(id => { const q = store.get(id); return [q.sourceKey, `答案${q.sourceKey}`]; })), 2), true);
    store.groupStatus(group.id, 'settled');
  }
  for (const key of ['3','4']) answer(store, key, `S${key}`, 2, `答案${key}`);
  const preview = await exporter.preview('teacher-1');
  assert.deepEqual(preview.items.map(item => item.address), ['H5','H6','H8','H9','G11','G13']);
  assert.equal(preview.items[0].value, '答案1_1_G2');
  assert.equal((await exporter.run(preview.token, 'teacher-1')).writtenCount, 6);
  assert.equal(sheet.cells.get('H5').userEnteredValue.stringValue, '答案1_1_G2');
  assert.equal(sheet.cells.get('H5').note, '$a_1_1$');
  store.close();
});

test('覆寫、清空、失格候補與答案中公式字首及換行仍為純文字', async () => {
  const { sheet, store, exporter } = setup();
  const q = answer(store, '3', 'A', 1, '=SUM(1,2)\n下一行');
  store.registerStudent('B', 2);
  // 已結算題不能再提交；先匯出再失格時應清空。
  let preview = await exporter.preview('teacher');
  await exporter.run(preview.token, 'teacher');
  assert.equal(sheet.cells.get('G11').userEnteredValue.stringValue, '=SUM(1,2)\n下一行_G1');
  const submissionId = [...q.submissions.values()][0].id;
  store.disqualify(q.id, submissionId);
  preview = await exporter.preview('teacher');
  assert.equal(preview.items[0].clear, true);
  await exporter.run(preview.token, 'teacher');
  assert.equal(sheet.cells.get('G11').userEnteredValue.stringValue, '');
  assert.equal(sheet.cells.get('G11').note, '$a_3$');
  store.close();
});

test('已匯出第一名失格後覆寫候補；刪題只清原鍵，不移動其他題號', async () => {
  const { sheet, store, exporter } = setup();
  const q = store.sourceIndex.get('3'), other = store.sourceIndex.get('4');
  store.registerStudent('A',1); store.registerStudent('B',2);
  store.status(q.id,'open'); store.submit(q.id,'A','先答',1); store.submit(q.id,'B','後答',2); store.status(q.id,'settled');
  let preview = await exporter.preview('teacher'); await exporter.run(preview.token,'teacher');
  store.disqualify(q.id,q.submissions.get('A').id);
  preview = await exporter.preview('teacher');
  assert.equal(preview.items[0].value,'後答_G2');
  await exporter.run(preview.token,'teacher');
  assert.equal(sheet.cells.get('G11').userEnteredValue.stringValue,'後答_G2');
  store.remove(q.id);
  assert.equal(other.caseNumber,4);
  preview = await exporter.preview('teacher');
  assert.equal(preview.items[0].clear,true);
  await exporter.run(preview.token,'teacher');
  assert.equal(sheet.cells.get('G11').userEnteredValue.stringValue,'');
  assert.equal(other.caseNumber,4);
  store.close();
});

test('預覽後移格、結果改變、人工改格與遺失備註均拒絕舊 token', async () => {
  const { sheet, store, exporter } = setup();
  const q = answer(store, '4', 'A', 1, '第一答');
  let preview = await exporter.preview('teacher');
  sheet.put('G13', '', ''); sheet.put('J13', '$a_4$');
  await assert.rejects(exporter.run(preview.token, 'teacher'), { status: 409 });
  assert.equal(sheet.writes, 0);
  preview = await exporter.preview('teacher');
  store.disqualify(q.id, [...q.submissions.values()][0].id);
  await assert.rejects(exporter.run(preview.token, 'teacher'), { status: 409 });
  store.close();
});

test('寫入回應遺失時下次預覽讀回確認；人工改值或備註遺失則安全停下', async () => {
  const { sheet, store, exporter } = setup();
  answer(store, '3', 'A', 1, '答案');
  sheet.loseNextResponse();
  let preview = await exporter.preview('teacher');
  await assert.rejects(exporter.run(preview.token, 'teacher'));
  assert.equal(store.ambiguousBatch.items.length, 1);
  preview = await exporter.preview('teacher');
  assert.equal(store.ambiguousBatch, null);
  assert.equal(store.confirmedCells.get('3').value, '答案_G1');
  sheet.put('G11', '人工修改', '$a_3$');
  await assert.rejects(exporter.preview('teacher'), { status: 409 });
  sheet.put('G11', '答案_G1', '');
  await assert.rejects(exporter.preview('teacher'), { status: 400 });
  store.close();
});

test('Google client 僅使用設定的 Sheet ID 與分頁，寫入為 updateCells 純文字', async () => {
  const sheet = fakeSheet(); sheet.put('C5', '題目', '$q_1$'); sheet.put('H5', '$a_1$');
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, ...options });
    if (options.method === 'POST') return { ok:true, headers:new Headers(), text:async () => JSON.stringify({ replies:[{}] }) };
    return { ok:true, headers:new Headers(), text:async () => JSON.stringify({ sheets:[{
      properties:{ sheetId:11, title:'學習單', gridProperties:{ rowCount:30, columnCount:12 } },
      data:[{ startRow:0, startColumn:0, rowData:Array.from({length:30},(_,i) => ({ values:Array.from({length:12},(_,j) =>
        i===4 && j===2 ? { userEnteredValue:{stringValue:'題目'}, note:'$q_1$' } :
        i===4 && j===7 ? { userEnteredValue:{stringValue:'$a_1$'} } : {}) })) }]
    }] }) };
  };
  const client = createGoogleSheetClient({ sheetId:'configured-id', sheetName:'學習單', credentialFile:'synthetic.json', googleTimeoutMs:1000 },
    { fetchImpl, tokenProvider:async () => 'synthetic-token' });
  const grid = await client.readGrid();
  await client.write([{ key:'1', address:'H5', value:'=作答_G2' }], grid);
  assert.match(requests[0].url, /configured-id/);
  assert.match(requests[0].url, /%E5%AD%B8%E7%BF%92%E5%96%AE/);
  const body = JSON.parse(requests[1].body);
  assert.deepEqual(body.requests[0].updateCells.rows[0].values[0],
    { userEnteredValue:{stringValue:'=作答_G2'}, note:'$a_1$' });
});

test('首次匯出保留原有答案格備註；寫入回應不完整不得宣告成功', async () => {
  const sheet = fakeSheet(); sheet.put('C5', '題目', '$q_1$');
  sheet.put('H5', '$a_1$', '教師原有備註');
  const store = new Classroom(); store.importQuestions(sheet.grid());
  answer(store, '1', 'A', 2, '答案');
  const exporter = new SheetExporter(store, { sheetName:'學習單' }, sheet.client);
  const preview = await exporter.preview('teacher');
  await exporter.run(preview.token, 'teacher');
  assert.equal(sheet.cells.get('H5').note, '教師原有備註\n$a_1$');
  store.close();
  const client = createGoogleSheetClient({ sheetId:'x', sheetName:'學習單', credentialFile:'synthetic.json', googleTimeoutMs:1000 },
    { tokenProvider:async () => 'token', fetchImpl:async () => ({ ok:true, headers:new Headers(), text:async () => '{}' }) });
  await assert.rejects(client.write([{ key:'1', address:'H5', value:'答案_G2' }], sheet.grid()), { status:502 });
});
