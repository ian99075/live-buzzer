import { HttpError } from './http.js';

const marker = /\$([qa])_([1-9]\d*)(?:_([1-9]\d*))?\$/g;
const legacyQuestion = /\$q_[^$]*\$/;
const anyMarker = /\$[qa]_[^$]*\$/g;
const maxCells = 100000;

export function sourceKey(caseNumber, partNumber = null) {
  return `${caseNumber}${partNumber === null ? '' : `_${partNumber}`}`;
}

export function markerText(kind, key) { return `$${kind}_${key}$`; }

export function cellAddress(row, column) {
  let letters = '';
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + (n - 1) % 26) + letters;
  return `${letters}${row + 1}`;
}

function markers(text, kind) {
  return [...String(text || '').matchAll(marker)].filter(match => match[1] === kind).map(match => ({
    key: sourceKey(Number(match[2]), match[3] === undefined ? null : Number(match[3])),
    caseNumber: Number(match[2]), partNumber: match[3] === undefined ? null : Number(match[3]),
    text: match[0],
  }));
}

function safeNumber(value) { return Number.isSafeInteger(value) && value > 0; }

function inMerge(merges, row, column) {
  return merges.find(m => row >= m.startRowIndex && row < m.endRowIndex &&
    column >= m.startColumnIndex && column < m.endColumnIndex);
}

export function parseSheetGrid(sheet) {
  const properties = sheet?.properties;
  if (!Number.isInteger(properties?.sheetId) || !properties?.title || !Array.isArray(sheet.data))
    throw new HttpError(502, 'Google Sheet 資料格式不正確。');
  const rowCount = properties.gridProperties?.rowCount ?? 0;
  const columnCount = properties.gridProperties?.columnCount ?? 0;
  if (!Number.isInteger(rowCount) || !Number.isInteger(columnCount) ||
    rowCount < 1 || columnCount < 1 || rowCount * columnCount > maxCells)
    throw new HttpError(400, '工作表範圍過大，無法安全掃描佔位符。');
  const questions = new Map(), answers = new Map();
  const merges = sheet.merges || [];
  for (const block of sheet.data) {
    const rows = block.rowData || [], startRow = block.startRow || 0, startColumn = block.startColumn || 0;
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < (rows[r]?.values || []).length; c++) {
      const cell = rows[r].values[c] || {}, row = startRow + r, column = startColumn + c;
      const address = cellAddress(row, column);
      const value = cell.userEnteredValue?.stringValue ?? cell.formattedValue ?? '';
      const note = cell.note || '';
      if (legacyQuestion.test(String(value))) throw new HttpError(400, `${address} 的題目佔位符仍在文字中，請先移至同格備註。`);
      const q = markers(note, 'q'), aNote = markers(note, 'a'), aValue = markers(value, 'a');
      const rawMarkers = [...String(note).matchAll(anyMarker), ...String(value).matchAll(/\$a_[^$]*\$/g)];
      if (rawMarkers.length !== q.length + aNote.length + aValue.length)
        throw new HttpError(400, `${address} 的佔位符格式不正確，請使用正整數且不要前導零。`);
      if (q.length + aNote.length + aValue.length > 1)
        throw new HttpError(400, `${address} 有多個佔位符，請只保留一個。`);
      if (q.length) {
        const item = q[0], content = String(value).trim();
        if (!safeNumber(item.caseNumber) || (item.partNumber !== null && !safeNumber(item.partNumber)) ||
          !content || [...content].length > 2000 || cell.userEnteredValue?.formulaValue !== undefined)
          throw new HttpError(400, `${address} 的題目文字或題號不正確。`);
        if (questions.has(item.key)) throw new HttpError(400, `題目佔位符 ${item.text} 重複。`);
        questions.set(item.key, { ...item, content, address, row, column });
      }
      const a = aNote[0] || aValue[0];
      if (a) {
        const merge = inMerge(merges, row, column);
        if (merge && (merge.startRowIndex !== row || merge.startColumnIndex !== column))
          throw new HttpError(400, `${address} 不是合併格的左上角，不能作為答案位置。`);
        if (aValue.length && String(value).trim() !== a.text)
          throw new HttpError(400, `${address} 的答案佔位符須單獨佔一格。`);
        if (answers.has(a.key)) throw new HttpError(400, `答案佔位符 ${a.text} 重複。`);
        answers.set(a.key, { ...a, address, row, column, value: String(value), note,
          inNote: !!aNote.length });
      }
    }
  }
  const kinds = new Map();
  for (const q of questions.values()) {
    const kind = q.partNumber === null ? 'single' : 'group';
    if (kinds.has(q.caseNumber) && kinds.get(q.caseNumber) !== kind)
      throw new HttpError(400, `Case ${q.caseNumber} 同時有單題與小題佔位符。`);
    kinds.set(q.caseNumber, kind);
    if (!answers.has(q.key)) throw new HttpError(400, `找不到 ${markerText('a', q.key)} 的答案格。`);
  }
  return { sheetId: properties.sheetId, title: properties.title, questions, answers };
}
