export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function fields(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(k => !allowed.includes(k)) || required.some(k => !(k in value))) {
    throw new HttpError(400, '請求欄位不正確。');
  }
  return value;
}
export function textValue(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > max) {
    throw new HttpError(400, `${label}必須為 1–${max} 個字元。`);
  }
  return value.trim();
}
export function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}
export function headers(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}
function rejectDuplicateJsonKeys(source) {
  let index = 0;
  const space = () => { while (/\s/.test(source[index] ?? '')) index++; };
  const string = () => {
    const start = index++;
    while (index < source.length) {
      if (source[index] === '\\') { index += 2; continue; }
      if (source[index++] === '"') return JSON.parse(source.slice(start, index));
    }
  };
  const value = depth => {
    if (depth > 100) throw new HttpError(400, 'JSON 巢狀層數過多。');
    space();
    if (source[index] === '{') {
      index++; space(); const keys = new Set();
      while (source[index] !== '}') {
        const key = string();
        if (keys.has(key)) throw new HttpError(400, '請求欄位不可重複。');
        keys.add(key); space(); index++; value(depth + 1); space();
        if (source[index] !== ',') break;
        index++; space();
      }
      index++; return;
    }
    if (source[index] === '[') {
      index++; space();
      while (source[index] !== ']') {
        value(depth + 1); space();
        if (source[index] !== ',') break;
        index++; space();
      }
      index++; return;
    }
    if (source[index] === '"') { string(); return; }
    while (index < source.length && !/[\s,}\]]/.test(source[index])) index++;
  };
  value(0);
}
export async function bodyJson(req, config, maxBytes = 65536, rejectDuplicates = false) {
  if ((req.headers.origin && req.headers.origin !== config.origin)
    || req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, '不允許跨來源操作。');
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, '請使用 application/json。');
  }
  const chunks = []; let size = 0;
  // 不使用 req 的 async iterator：提早 throw 時不應銷毀連線而失去 413 回應。
  await new Promise((resolve, reject) => {
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { reject(new HttpError(413, '請求內容過大。')); return; }
      chunks.push(chunk);
    });
    req.on('end', resolve);
    req.on('error', reject);
    req.on('aborted', () => reject(new HttpError(400, '請求已中斷。')));
  });
  try {
    const raw = Buffer.concat(chunks).toString('utf8');
    const parsed = JSON.parse(raw);
    if (rejectDuplicates) rejectDuplicateJsonKeys(raw);
    return parsed;
  }
  catch { throw new HttpError(400, 'JSON 格式不正確。'); }
}
