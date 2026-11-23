import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSheetGrid } from '../src/sheet-grid.js';

function grid(entries, merges = []) {
  const rowData = Array.from({ length: 13 }, () => ({ values: Array.from({ length: 8 }, () => ({})) }));
  for (const [address, value, note] of entries) {
    const [, letters, number] = address.match(/^([A-Z]+)(\d+)$/);
    const col = [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    rowData[Number(number) - 1].values[col] = { userEnteredValue: { stringValue: value }, note };
  }
  return { properties: { sheetId: 42, title: '學習單', gridProperties: { rowCount: 13, columnCount: 8 } },
    data: [{ startRow: 0, startColumn: 0, rowData }], merges };
}

const six = [
  ['C5', '第一小題', '$q_1_1$'], ['H5', '$a_1_1$', ''],
  ['C6', '第二小題', '$q_1_2$'], ['H6', '$a_1_2$', ''],
  ['C8', '第三小題', '$q_2_1$'], ['H8', '$a_2_1$', ''],
  ['C9', '第四小題', '$q_2_2$'], ['H9', '$a_2_2$', ''],
  ['C11', '第三題', '$q_3$'], ['G11', '$a_3$', ''],
  ['C13', '第四題', '$q_4$'], ['G13', '$a_4$', ''],
];

test('題目鍵只從備註讀取，六題配對到各自答案格', () => {
  const parsed = parseSheetGrid(grid(six));
  assert.deepEqual([...parsed.questions.keys()], ['1_1','1_2','2_1','2_2','3','4']);
  assert.deepEqual([...parsed.answers.values()].map(a => a.address), ['H5','H6','H8','H9','G11','G13']);
  assert.equal(parsed.questions.get('1_1').content, '第一小題');
});

test('題目格標記未移到備註及缺答案鍵時整份解析失敗', () => {
  assert.throws(() => parseSheetGrid(grid([['C5','第一題$q_1$',''],['H5','$a_1$','']])), { status: 400 });
  assert.throws(() => parseSheetGrid(grid([['C5','第一題','$q_1$']])), { status: 400 });
});

test('重複、混合題型、空題幹及合併格非錨點均拒絕', () => {
  assert.throws(() => parseSheetGrid(grid([['C5','一','$q_1$'],['C6','二','$q_1$'],['H5','$a_1$','']])), { status: 400 });
  assert.throws(() => parseSheetGrid(grid([['C5','一','$q_1$'],['C6','二','$q_1_1$'],['H5','$a_1$',''],['H6','$a_1_1$','']])), { status: 400 });
  assert.throws(() => parseSheetGrid(grid([['C5','','$q_1$'],['H5','$a_1$','']])), { status: 400 });
  assert.throws(() => parseSheetGrid(grid([['C5','一','$q_1$'],['H5','$a_1$','']],
    [{ startRowIndex: 4, endRowIndex: 5, startColumnIndex: 6, endColumnIndex: 8 }])), { status: 400 });
  assert.throws(() => parseSheetGrid(grid([['C5','一','$q_01$'],['H5','$a_1$','']])), { status: 400 });
  assert.throws(() => parseSheetGrid({ ...grid([]), properties: {
    sheetId:42, title:'學習單', gridProperties:{ rowCount:1001, columnCount:1001 } } }), { status: 400 });
});
