import { HttpError } from './http.js';

export function sheetData(winners, sheetName) {
  const sheet = `'${sheetName.replaceAll("'", "''")}'`;
  return winners.map(w => ({ range: `${sheet}!C${18 + w.caseNumber}`,
    values: [[w.clear ? '' : `${w.answer}_${w.studentNumber}`]] }));
}

export function createGoogleWriter(config, { fetchImpl = fetch, tokenProvider } = {}) {
  let auth;
  const getToken = tokenProvider || (async () => {
    const { GoogleAuth } = await import('google-auth-library');
    auth ||= new GoogleAuth({ keyFile: config.credentialFile, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    return auth.getAccessToken();
  });
  return async data => {
    if (!config.sheetId || !config.credentialFile) throw new HttpError(503, '尚未設定 Google Sheet ID 或服務帳號憑證。');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.googleTimeoutMs);
    try {
      // 整個授權與寫入流程均受逾時限制；授權晚到也不得再發出寫入。
      const operation = (async () => {
        const token = await getToken();
        controller.signal.throwIfAborted();
        if (!token) throw new Error('缺少權杖');
        const response = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.sheetId)}/values:batchUpdate`, {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInputOption: 'RAW', data }),
        });
        if (!response.ok) throw new Error('外部服務拒絕寫入');
        const result = await response.json();
        if (result.totalUpdatedCells !== data.length) throw new Error('未確認全部儲存格');
      })();
      await Promise.race([operation, new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('逾時')), { once: true });
      })]);
    } catch {
      throw new HttpError(502, 'Google 寫入失敗或未能確認成功。請確認原生試算表、編輯權限與網路後重試。');
    } finally { clearTimeout(timer); }
  };
}

export class SheetExporter {
  constructor(store, config, writer, onChange = () => {}) { Object.assign(this, { store, config, writer, onChange }); }
  async run() {
    this.store.unlocked();
    this.store.settleDue();
    this.store.exporting = true;
    const targets = this.store.all().filter(q => q.status === 'settled').flatMap(q => {
      if (q.winnerKey !== null) {
        const winner = q.submissions.get(q.winnerKey);
        return [{ question: q, caseNumber: q.caseNumber, studentNumber: winner.studentNumber, answer: winner.answer }];
      }
      return q.confirmedExport ? [{ question: q, caseNumber: q.caseNumber, clear: true }] : [];
    });
    const data = sheetData(targets, this.config.sheetName);
    this.onChange();
    try {
      if (data.length) await this.writer(data);
      for (const target of targets) target.question.confirmedExport = !target.clear;
      return { writtenCount: data.length, clearedCount: targets.filter(target => target.clear).length,
        ranges: data.map(d => d.range), testMode: this.config.testMode === true };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, '未能確認寫入成功，請稍後重試。');
    } finally { this.store.exporting = false; this.onChange(); }
  }
}
