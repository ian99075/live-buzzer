import { HttpError } from './http.js';
import { coordinateKey } from './classroom.js';

const markerKey = 'live-buzzer-case';
const maxInsertedRows = 1000;

export function columnName(index) {
  if (!Number.isSafeInteger(index) || index < 0) throw new HttpError(400, '小題欄位超出可用範圍。');
  let result = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result;
  return result;
}
export function sheetCoordinate(caseNumber, partNumber = null) {
  const part = partNumber ?? 1;
  if (!Number.isSafeInteger(caseNumber) || caseNumber < 1 || caseNumber > Number.MAX_SAFE_INTEGER - 18 ||
    !Number.isSafeInteger(part) || part < 1 || part > 10000) throw new HttpError(400, 'Case 或小題編號超出可用範圍。');
  return `${columnName(part + 1)}${18 + caseNumber}`;
}
const quoteSheet = sheetName => `'${sheetName.replaceAll("'", "''")}'`;
const sheetValue = winner => `{${winner.content}}_${winner.answer}_G${winner.groupNumber}`;
export function sheetData(winners, sheetName) {
  const sheet = quoteSheet(sheetName);
  return winners.map(w => ({ range: `${sheet}!${sheetCoordinate(w.caseNumber, w.partNumber)}`,
    values: [[w.clear ? '' : sheetValue(w)]] }));
}

function exportTargets(store) {
  const targets = new Map();
  for (const confirmed of store.confirmedCells.values()) targets.set(coordinateKey(confirmed.caseNumber, confirmed.partNumber),
    { caseNumber: confirmed.caseNumber, partNumber: confirmed.partNumber, clear: true, question: null,
      expectedOldValue: confirmed.value });
  for (const q of store.all()) {
    if (q.status !== 'settled') continue;
    const key = coordinateKey(q.caseNumber, q.partNumber);
    if (q.winnerKey !== null) {
      const winner = q.submissions.get(q.winnerKey);
      targets.set(key, { question: q, caseNumber: q.caseNumber, partNumber: q.partNumber,
        content: q.content, groupNumber: winner.groupNumber, answer: winner.answer });
    } else if (targets.has(key)) targets.set(key, { ...targets.get(key), question: q, clear: true });
  }
  return [...targets.values()].sort((a,b) => a.caseNumber - b.caseNumber || (a.partNumber ?? 1) - (b.partNumber ?? 1));
}
export function exportPlan(store, sheetName) {
  const targets = exportTargets(store);
  const data = sheetData(targets, sheetName);
  return { items: targets.map((target, i) => ({ caseNumber: target.caseNumber, partNumber: target.partNumber,
    range: data[i].range, clear: !!target.clear, value: data[i].values[0][0],
    ...(target.clear && target.expectedOldValue !== undefined ? { expectedOldValue: target.expectedOldValue } : {}) })),
    throughCase: Math.max(6, ...targets.map(t => t.caseNumber)) };
}

function extractColumn(range) {
  const cell = range.split('!').at(-1);
  const letters = cell.match(/^([A-Z]+)[0-9]+$/)?.[1];
  if (!letters) throw new Error('無效的格位');
  return [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}
function afterInsertion(merge, at, count) {
  const m = { ...merge };
  if (m.startRowIndex >= at) { m.startRowIndex += count; m.endRowIndex += count; }
  else if (m.endRowIndex > at) m.endRowIndex += count;
  return m;
}
function structureRequests(sheet, metadata, labelRows, items, throughCase) {
  const sheetId = sheet.properties.sheetId;
  const rowCount = sheet.properties.gridProperties?.rowCount;
  const columnCount = sheet.properties.gridProperties?.columnCount;
  if (!Number.isInteger(rowCount) || !Number.isInteger(columnCount) || rowCount < 25) throw new Error('工作表範圍不正確');
  if (throughCase - 6 > maxInsertedRows) throw new Error('Case 列數超出安全範圍');
  for (const item of items) if (extractColumn(item.range) >= columnCount) throw new Error('小題超出工作表欄數');
  const markers = new Map();
  for (const entry of metadata) {
    if (entry.metadataKey !== markerKey || entry.location?.dimensionRange?.sheetId !== sheetId) continue;
    const caseNumber = Number(entry.metadataValue), range = entry.location.dimensionRange;
    if (!Number.isSafeInteger(caseNumber) || caseNumber < 7 || range.dimension !== 'ROWS' ||
      range.endIndex !== range.startIndex + 1 || markers.has(caseNumber)) throw new Error('Case 列標記不一致');
    markers.set(caseNumber, range.startIndex);
  }
  const requests = [];
  const labeledCases = new Map();
  for (let i = 0; i < labelRows.length; i++) {
    const match = String(labelRows[i]).trim().match(/^case\s*([0-9]+)$/i);
    if (!match) continue;
    const number = Number(match[1]);
    if (number >= 7) {
      if (number !== i + 7 || labeledCases.has(number)) throw new Error('Case 列標籤位置不一致');
      labeledCases.set(number, i + 24);
    }
  }
  let firstMissing = null;
  for (let n = 7; n <= throughCase; n++) {
    const index = 17 + n, marker = markers.get(n), label = labelRows[n - 7] || '';
    const expectedLabel = `Case ${n}`;
    if (marker !== undefined && marker !== index) throw new Error('Case 列已移位');
    if (marker !== undefined && label && !labeledCases.has(n)) throw new Error('Case 列文字與標記不一致');
    const exists = marker !== undefined || labeledCases.has(n);
    if (!exists) {
      if (label) { if (firstMissing !== null) throw new Error('Case 列中有其他內容'); }
      firstMissing ??= n;
    } else if (firstMissing !== null) throw new Error('Case 列有缺口，不能安全插列');
    if (exists && marker === undefined) requests.push({ createDeveloperMetadata: { developerMetadata: {
      metadataKey: markerKey, metadataValue: String(n), visibility: 'DOCUMENT',
      location: { dimensionRange: { sheetId, dimension: 'ROWS', startIndex: index, endIndex: index + 1 } },
    } } });
    if (exists && !label) requests.push({ updateCells: { range: { sheetId, startRowIndex: index, endRowIndex: index + 1, startColumnIndex: 1, endColumnIndex: 2 },
      rows: [{ values: [{ userEnteredValue: { stringValue: expectedLabel } }] }], fields: 'userEnteredValue' } });
  }
  let insertAt = null, insertCount = 0;
  if (firstMissing !== null) {
    if ([...markers.keys(), ...labeledCases.keys()].some(n => n > throughCase)) throw new Error('後續 Case 列已存在，不能安全插列');
    insertAt = 17 + firstMissing; insertCount = throughCase - firstMissing + 1;
    if (insertAt > rowCount) throw new Error('Case 列已超出工作表範圍');
    // 插列先執行；後續所有座標均以插列後的列次表示。
    requests.unshift({ insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: insertAt, endIndex: insertAt + insertCount }, inheritFromBefore: true } });
    if (insertAt + insertCount > rowCount) requests.unshift({ appendDimension: { sheetId, dimension: 'ROWS', length: insertAt + insertCount - rowCount } });
    for (let n = firstMissing; n <= throughCase; n++) {
      const index = 17 + n;
      requests.push({ updateCells: { range: { sheetId, startRowIndex: index, endRowIndex: index + 1, startColumnIndex: 1, endColumnIndex: 2 },
        rows: [{ values: [{ userEnteredValue: { stringValue: `Case ${n}` } }] }], fields: 'userEnteredValue' } });
      requests.push({ createDeveloperMetadata: { developerMetadata: { metadataKey: markerKey, metadataValue: String(n), visibility: 'DOCUMENT',
        location: { dimensionRange: { sheetId, dimension: 'ROWS', startIndex: index, endIndex: index + 1 } } } } });
    }
  }
  const merges = (sheet.merges || []).map(m => insertAt === null ? m : afterInsertion(m, insertAt, insertCount));
  for (const merge of merges) {
    if (!items.some(item => { const col = extractColumn(item.range), row = 18 + item.caseNumber - 1;
      return row >= merge.startRowIndex && row < merge.endRowIndex && col >= merge.startColumnIndex && col < merge.endColumnIndex;
    })) continue;
    requests.push({ unmergeCells: { range: merge } });
  }
  return requests;
}

export function createGoogleWriter(config, { fetchImpl = fetch, tokenProvider } = {}) {
  let auth;
  const getToken = tokenProvider || (async () => {
    const { GoogleAuth } = await import('google-auth-library');
    auth ||= new GoogleAuth({ keyFile: config.credentialFile, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    return auth.getAccessToken();
  });
  async function readCells(items) {
    if (!items.length) return new Map();
    if (!config.sheetId || !config.credentialFile) throw new HttpError(503, '尚未設定 Google Sheet ID 或服務帳號憑證。');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.googleTimeoutMs);
    try {
      const token = await getToken(); controller.signal.throwIfAborted();
      const query = items.map(item => `ranges=${encodeURIComponent(item.range)}`).join('&');
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.sheetId)}/values:batchGet?${query}&valueRenderOption=UNFORMATTED_VALUE`;
      const response = await fetchImpl(url, { method: 'GET', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Google API 回應錯誤');
      const result = await response.json();
      if (!Array.isArray(result.valueRanges) || result.valueRanges.length !== items.length) throw new Error('讀回格位數不符');
      return new Map(items.map((item, index) => [item.range, String(result.valueRanges[index].values?.[0]?.[0] ?? '')]));
    } catch { throw new HttpError(502, '無法確認 Google Sheet 現有格位，已停止匯出。'); }
    finally { clearTimeout(timer); }
  }
  const write = async (data, plan) => {
    if (!data.length) return;
    if (!config.sheetId || !config.credentialFile) throw new HttpError(503, '尚未設定 Google Sheet ID 或服務帳號憑證。');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.googleTimeoutMs);
    try {
      const operation = (async () => {
        const token = await getToken(); controller.signal.throwIfAborted();
        if (!token) throw new Error('缺少權杖');
        const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.sheetId)}`;
        async function request(url, method = 'GET', body) {
          controller.signal.throwIfAborted();
          const response = await fetchImpl(url, { method, signal: controller.signal,
            headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}) });
          if (!response.ok) throw new Error('Google API 回應錯誤');
          return response.json();
        }
        const clearItems = plan?.items.filter(item => item.clear && item.expectedOldValue !== undefined) ?? [];
        if (clearItems.length) {
          const current = await readCells(clearItems);
          for (const item of clearItems) if (current.get(item.range) !== item.expectedOldValue)
            throw new Error('原格內容已變動，拒絕清空');
        }
        if (plan?.items.some(item => item.caseNumber >= 7 || (item.partNumber ?? 1) > 1)) {
          const fields = encodeURIComponent('sheets(properties(sheetId,title,gridProperties),merges,developerMetadata),developerMetadata');
          const book = await request(`${base}?fields=${fields}`);
          const sheet = book.sheets?.find(s => s.properties?.title === config.sheetName);
          if (!sheet) throw new Error('找不到目標工作表');
          let labels = [];
          if (plan.throughCase >= 7) {
            const throughRow = Math.min(sheet.properties.gridProperties?.rowCount ?? 0, 1018);
            const range = encodeURIComponent(`${quoteSheet(config.sheetName)}!B25:B${throughRow}`);
            const result = await request(`${base}/values/${range}?valueRenderOption=FORMATTED_VALUE`);
            labels = Array.from({ length: throughRow - 24 }, (_, i) => result.values?.[i]?.[0] ?? '');
          }
          const metadata = [...(book.developerMetadata || []), ...(sheet.developerMetadata || [])];
          const seen = new Set();
          const uniqueMetadata = metadata.filter(entry => { const key = entry.metadataId ?? JSON.stringify(entry);
            if (seen.has(key)) return false; seen.add(key); return true; });
          const requests = structureRequests(sheet, uniqueMetadata, labels, plan.items, plan.throughCase);
          if (requests.length) await request(`${base}:batchUpdate`, 'POST', { requests });
        }
        const result = await request(`${base}/values:batchUpdate`, 'POST', { valueInputOption: 'RAW', data });
        if (result.totalUpdatedCells !== data.length) throw new Error('未確認全部儲存格');
      })();
      await Promise.race([operation, new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('逾時')), { once: true }))]);
    } catch {
      throw new HttpError(502, 'Google 寫入失敗或無法確認結構與格位。請檢查工作表後重試。');
    } finally { clearTimeout(timer); }
  };
  write.readCells = readCells;
  return write;
}

export class SheetExporter {
  constructor(store, config, writer, onChange = () => {}) { Object.assign(this, { store, config, writer, onChange }); }
  async run() {
    this.store.unlocked(); this.store.settleDue();
    this.store.exporting = true;
    this.onChange();
    try {
      if (this.store.ambiguousBatch) {
        if (typeof this.writer.readCells !== 'function') throw new HttpError(502, '上次匯出結果未確認，需讀回 Google Sheet 後才能重試。');
        const previous = this.store.ambiguousBatch;
        const actual = await this.writer.readCells(previous);
        for (const item of previous) if (actual.get(item.range) === item.value) {
          const key = coordinateKey(item.caseNumber, item.partNumber);
          if (item.clear) this.store.confirmedCells.delete(key);
          else this.store.confirmedCells.set(key, { caseNumber: item.caseNumber, partNumber: item.partNumber, value: item.value });
        }
        this.store.ambiguousBatch = null;
      }
      const targets = exportTargets(this.store), plan = exportPlan(this.store, this.config.sheetName);
      const data = sheetData(targets, this.config.sheetName);
      if (data.length) {
        this.store.ambiguousBatch = plan.items.map(item => ({ ...item }));
        await this.writer(data, plan);
      }
      for (const [index, target] of targets.entries()) {
        if (target.question) target.question.confirmedExport = !target.clear;
        const key = coordinateKey(target.caseNumber, target.partNumber);
        if (target.clear) this.store.confirmedCells.delete(key);
        else this.store.confirmedCells.set(key, { caseNumber: target.caseNumber, partNumber: target.partNumber,
          value: data[index].values[0][0] });
      }
      this.store.ambiguousBatch = null;
      return { writtenCount: data.length, clearedCount: targets.filter(target => target.clear).length,
        ranges: data.map(d => d.range), testMode: this.config.testMode === true };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, '未能確認寫入成功，請稍後重試。');
    } finally { this.store.exporting = false; this.onChange(); }
  }
}
