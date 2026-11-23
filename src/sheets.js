import { randomUUID } from 'node:crypto';
import { HttpError } from './http.js';
import { markerText, parseSheetGrid } from './sheet-grid.js';

const quoteSheet = name => `'${name.replaceAll("'", "''")}'`;
const maxResponseBytes = 5_000_000;

export function createGoogleSheetClient(config, { fetchImpl = fetch, tokenProvider } = {}) {
  let auth;
  const getToken = tokenProvider || (async () => {
    const { GoogleAuth } = await import('google-auth-library');
    auth ||= new GoogleAuth({ keyFile: config.credentialFile, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    return auth.getAccessToken();
  });
  async function request(path, method = 'GET', body) {
    if (!config.sheetId || !config.credentialFile) throw new HttpError(503, '尚未設定 Google Sheet ID 或服務帳號憑證。');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), config.googleTimeoutMs ?? 15000);
    try {
      const token = await Promise.race([getToken(), new Promise((_, reject) =>
        controller.signal.addEventListener('abort', () => reject(new Error('Google 授權逾時')), { once: true }))]);
      if (!token) throw new Error('無 Google 權杖');
      const response = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.sheetId)}${path}`,
        { method, signal: controller.signal, headers: { Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) throw new Error(`Google API ${response.status}`);
      if (Number(response.headers?.get?.('content-length') || 0) > maxResponseBytes) throw new Error('Google 回應過大');
      let raw;
      if (response.body?.getReader) {
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let bytes = 0; raw = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxResponseBytes) { await reader.cancel(); throw new Error('Google 回應過大'); }
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      } else {
        raw = await response.text();
        if (Buffer.byteLength(raw) > maxResponseBytes) throw new Error('Google 回應過大');
      }
      return JSON.parse(raw);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, 'Google Sheet 讀寫失敗或逾時，請檢查授權、分頁及網路。');
    } finally { clearTimeout(timeout); }
  }
  return {
    async readGrid() {
      const fields = 'sheets(properties(sheetId,title,gridProperties),merges,data(startRow,startColumn,rowData(values(userEnteredValue,formattedValue,note))))';
      const query = `?ranges=${encodeURIComponent(quoteSheet(config.sheetName))}&includeGridData=true&fields=${encodeURIComponent(fields)}`;
      const result = await request(query);
      const sheet = result.sheets?.find(item => item.properties?.title === config.sheetName);
      if (!sheet) throw new HttpError(502, '找不到設定的 Google Sheet 分頁。');
      return parseSheetGrid(sheet);
    },
    async write(items, grid) {
      if (!items.length) return;
      const requests = items.map(item => {
        const target = grid.answers.get(item.key);
        if (!target || target.address !== item.address) throw new HttpError(409, '答案格已移動，請重新預覽。');
        const value = item.value ? { userEnteredValue: { stringValue: item.value } } : {};
        let fields = 'userEnteredValue';
        if (!target.inNote) {
          value.note = [target.note.trim(), markerText('a', item.key)].filter(Boolean).join('\n');
          fields += ',note';
        }
        return { updateCells: { range: { sheetId: grid.sheetId, startRowIndex: target.row,
          endRowIndex: target.row + 1, startColumnIndex: target.column, endColumnIndex: target.column + 1 },
          rows: [{ values: [value] }], fields } };
      });
      const result = await request(':batchUpdate', 'POST', { requests });
      if (!Array.isArray(result.replies) || result.replies.length !== requests.length)
        throw new HttpError(502, 'Google 寫入回應不完整，需讀回確認。');
    },
  };
}

function targets(store) {
  const chosen = new Map([...store.confirmedCells].map(([key]) => [key, { key, clear: true, value: '' }]));
  for (const entity of store.competitions()) {
    if (entity.status !== 'settled' || entity.winnerKey === null) continue;
    const winner = entity.submissions.get(entity.winnerKey);
    if (entity.kind === 'group') {
      for (const id of entity.questionIds) {
        const part = store.get(id);
        if (part.sourceKey) chosen.set(part.sourceKey, { key: part.sourceKey, clear: false,
          value: `${winner.answers[part.sourceKey]}_G${winner.groupNumber}` });
      }
    } else if (entity.sourceKey) {
      chosen.set(entity.sourceKey, { key: entity.sourceKey, clear: false,
        value: `${winner.answer}_G${winner.groupNumber}` });
    }
  }
  return [...chosen.values()].sort((a,b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

function plan(store, grid) {
  return targets(store).map(item => {
    const cell = grid.answers.get(item.key);
    if (!cell) throw new HttpError(409, `找不到 $a_${item.key}$ 的答案格，請檢查工作表備註。`);
    const confirmed = store.confirmedCells.get(item.key);
    if (confirmed && cell.value !== confirmed.value)
      throw new HttpError(409, `${cell.address} 已由他人修改，請先核對工作表。`);
    return { ...item, address: cell.address, range: `${quoteSheet(grid.title)}!${cell.address}`,
      oldValue: cell.value, oldNote: cell.note };
  });
}

function previewDigest(store, items) {
  const competitions = store.competitions().map(entity => {
    const winner = entity.winnerKey === null ? null : entity.submissions.get(entity.winnerKey);
    return {
      id: entity.id, status: entity.status,
      keys: entity.kind === 'group' ? entity.questionIds.map(id => store.get(id).sourceKey) : [entity.sourceKey],
      winnerKey: entity.winnerKey,
      winningSubmissionId: winner?.id ?? null,
      winningAnswers: winner ? entity.kind === 'group' ? winner.answers : winner.answer : null,
    };
  });
  return JSON.stringify({ items, competitions });
}

export class SheetExporter {
  constructor(store, config, client, onChange = () => {}) {
    Object.assign(this, { store, config, client, onChange });
    this.previews = new Map();
  }
  async importQuestions() {
    this.store.unlocked(); this.store.exporting = true; this.onChange();
    try {
      const grid = await this.client.readGrid();
      const result = this.store.importQuestions(grid);
      this.store.onChange(); return result;
    } finally { this.store.exporting = false; this.onChange(); }
  }
  async reconcile() {
    if (!this.store.ambiguousBatch) return;
    const pending = this.store.ambiguousBatch, grid = await this.client.readGrid();
    const allWritten = pending.items.every(item => {
      const cell = grid.answers.get(item.key);
      return cell?.address === item.address && cell.value === item.value && cell.inNote;
    });
    const allOriginal = pending.items.every(item => {
      const cell = grid.answers.get(item.key);
      return cell?.address === item.address && cell.value === item.oldValue && cell.note === item.oldNote;
    });
    if (!allWritten && !allOriginal) throw new HttpError(409, '前次寫入結果不明，請核對答案格與備註後再試。');
    if (allWritten) this.commit(pending.items);
    this.store.ambiguousBatch = null;
  }
  commit(items) {
    for (const item of items) {
      if (item.clear) this.store.confirmedCells.delete(item.key);
      else this.store.confirmedCells.set(item.key, { value: item.value });
      const q = this.store.sourceIndex.get(item.key);
      if (q) q.confirmedExport = !item.clear;
    }
  }
  async preview(teacherToken) {
    this.store.unlocked(); this.store.settleDue();
    this.store.exporting = true; this.onChange();
    try {
      await this.reconcile();
      const grid = await this.client.readGrid(), items = plan(this.store, grid);
      const token = randomUUID(), digest = previewDigest(this.store, items), expiresAt = Date.now() + 120000;
      this.previews.set(token, { teacherToken, digest, expiresAt });
      if (this.previews.size > 100) for (const [key, preview] of this.previews)
        if (preview.expiresAt <= Date.now() || this.previews.size > 100) this.previews.delete(key);
      return { token, items, expiresAt, sheetName: grid.title, testMode: this.config.testMode === true };
    } finally { this.store.exporting = false; this.onChange(); }
  }
  async run(token, teacherToken) {
    this.store.unlocked();
    const preview = this.previews.get(token);
    if (!preview || preview.teacherToken !== teacherToken || preview.expiresAt <= Date.now())
      throw new HttpError(409, '匯出預覽已過期，請重新開啟。');
    this.previews.delete(token);
    this.store.settleDue(); this.store.exporting = true; this.onChange();
    try {
      await this.reconcile();
      const grid = await this.client.readGrid(), items = plan(this.store, grid);
      if (previewDigest(this.store, items) !== preview.digest) throw new HttpError(409, '題目結果或 Sheet 格位已改變，請重新預覽。');
      if (items.length) {
        this.store.ambiguousBatch = { items };
        await this.client.write(items, grid);
        const written = await this.client.readGrid();
        if (!items.every(item => written.answers.get(item.key)?.address === item.address &&
          written.answers.get(item.key)?.value === item.value && written.answers.get(item.key)?.inNote))
          throw new HttpError(502, 'Google 寫入後讀回不一致，請核對後重試。');
        this.commit(items); this.store.ambiguousBatch = null;
      }
      return { writtenCount: items.length, clearedCount: items.filter(item => item.clear).length,
        ranges: items.map(item => item.range), testMode: this.config.testMode === true };
    } finally { this.store.exporting = false; this.onChange(); }
  }
}
