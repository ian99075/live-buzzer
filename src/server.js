import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { readConfig } from './config.js';
import { Classroom } from './classroom.js';
import { Sessions } from './auth.js';
import { Events } from './events.js';
import { createGoogleWriter, SheetExporter } from './sheets.js';
import { HttpError, headers, json, bodyJson } from './http.js';
import { teacherRoute } from './routes/teacher.js';
import { studentRoute } from './routes/student.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
export function createApp({ config, store = new Classroom(), sessions = new Sessions(config), writer, heartbeatMs } = {}) {
  const events = new Events(store, sessions, config, heartbeatMs);
  const exporter = new SheetExporter(store, config, writer || createGoogleWriter(config), () => events.teachers());
  const server = createServer(async (req, res) => {
    headers(res);
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path.startsWith('/api/')) {
        const body = ['POST', 'PATCH', 'DELETE'].includes(req.method) ? await bodyJson(req, config) : undefined;
        const ctx = { req, res, path, body, store, sessions, events, exporter, config };
        if (path.startsWith('/api/teacher/')) { await teacherRoute(ctx); return; }
        if (path.startsWith('/api/student/')) { studentRoute(ctx); return; }
        throw new HttpError(404, '找不到 API。');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, '不支援的操作。');
      const route = path === '/' ? '/student.html' : path === '/teacher' ? '/teacher.html' : path === '/student' ? '/student.html' : path;
      let decoded;
      try { decoded = decodeURIComponent(route); } catch { throw new HttpError(400, '網址不正確。'); }
      if (/[\\:\0]/.test(decoded)) throw new HttpError(404, '找不到頁面。');
      const target = resolve(publicDir, `.${decoded}`);
      if (!target.startsWith(resolve(publicDir) + sep) || !mime[extname(target)]) throw new HttpError(404, '找不到頁面。');
      let content;
      try { content = await readFile(target); } catch { throw new HttpError(404, '找不到頁面。'); }
      res.writeHead(200, { 'Content-Type': mime[extname(target)] }); res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent) { if (!res.writableEnded) res.end(); return; }
      json(res, error instanceof HttpError ? error.status : 500,
        { error: error instanceof HttpError ? error.message : '系統暫時無法處理，請稍後再試。' });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  const close = async () => {
    events.close(); server.closeAllConnections();
    if (server.listening) await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  };
  return { server, store, sessions, events, exporter, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const config = readConfig(); const app = createApp({ config });
    app.server.listen(config.port, config.host, () => console.log(`搶答系統已啟動：${config.origin}\n教師端：${config.origin}/teacher\n資料僅存於記憶體，停止服務會清空。`));
    app.server.on('error', () => { console.error('無法啟動服務，請確認主機與連接埠設定。'); app.events.close(); process.exitCode = 1; });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
