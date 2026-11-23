import { parseSheetGrid, markerText } from '../src/sheet-grid.js';

export function fakeSheet() {
  const cells = new Map();
  const sheet = { properties: { sheetId: 11, title: '學習單',
    gridProperties: { rowCount: 30, columnCount: 12 } }, data: [], merges: [] };
  function put(address, value = '', note = '') {
    cells.set(address, { userEnteredValue: { stringValue: value }, formattedValue: value, note });
  }
  function grid() {
    const rows = Array.from({ length: 30 }, () => ({ values: Array.from({ length: 12 }, () => ({})) }));
    for (const [address, cell] of cells) {
      const match = address.match(/^([A-Z]+)(\d+)$/);
      const col = [...match[1]].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      rows[Number(match[2]) - 1].values[col] = structuredClone(cell);
    }
    sheet.data = [{ startRow: 0, startColumn: 0, rowData: rows }];
    return parseSheetGrid(sheet);
  }
  let writes = 0, fail = false, loseResponse = false;
  const client = {
    async readGrid() { return grid(); },
    async write(items, current) {
      writes++;
      if (fail) throw new Error('模擬寫入失敗');
      for (const item of items) {
        const old = cells.get(item.address), target = current.answers.get(item.key);
        const note = target.inNote ? old.note : [old.note.trim(), markerText('a', item.key)].filter(Boolean).join('\n');
        put(item.address, item.value, note);
      }
      if (loseResponse) { loseResponse = false; throw new Error('模擬回應遺失'); }
    },
  };
  return { put, grid, cells, client, get writes() { return writes; },
    setFail(value) { fail = value; }, loseNextResponse() { loseResponse = true; } };
}
