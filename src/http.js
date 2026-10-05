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
export async function bodyJson(req, config) {
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
      if (size > 65536) { reject(new HttpError(413, '請求內容過大。')); return; }
      chunks.push(chunk);
    });
    req.on('end', resolve);
    req.on('error', reject);
    req.on('aborted', () => reject(new HttpError(400, '請求已中斷。')));
  });
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'JSON 格式不正確。'); }
}
