// 僅供本機介面驗收。正式入口 src/server.js 不使用此帳密或模擬 writer。
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../src/server.js';
import { testConfig } from './helpers.js';

const port = Number(process.env.PREVIEW_PORT || 3000);
const config = testConfig({ port, origin: `http://127.0.0.1:${port}`, testMode: true });
let app, failNext = false, loseNextBuzz = false;
function makeApp() {
  const previewValues = new Map();
  const writer = async data => {
    await delay(1200);
    if (failNext) { failNext = false; throw new Error('模擬遠端失敗'); }
    for (const item of data) previewValues.set(item.range, item.values[0][0]);
    console.log(`模擬匯出確認 ${data.length} 格；未連線 Google。`);
  };
  writer.readCells = async items => new Map(items.map(item => [item.range, previewValues.get(item.range) ?? '']));
  const instance = createApp({ config, heartbeatMs: 1000, writer });
  let suppressStudentEvent = false;
  const publish = instance.events.publish.bind(instance.events);
  instance.events.publish = studentNumber => {
    if (suppressStudentEvent && studentNumber) { suppressStudentEvent = false; instance.events.teachers(); return; }
    publish(studentNumber);
  };
  instance.server.prependListener('request', (req, res) => {
    if (loseNextBuzz && req.method === 'POST' && /^\/api\/student\/questions\/[^/]+\/buzz$/.test(req.url)) {
      loseNextBuzz = false; suppressStudentEvent = true;
      // 注入「伺服器接受了回答，但 HTTP 及提交者 SSE 確認都遺失」的測試情境。
      res.end = () => { res.destroy(); return res; };
    }
  });
  return instance;
}
async function start() { app = makeApp(); await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve)); }
await start();
console.log(`僅供測試：http://127.0.0.1:${port}/teacher\n帳號 teacher / 密碼 test-password-only\nstdin 控制：fail-next-export、lose-next-buzz、disconnect、restart、stop`);
const lines = createInterface({ input: process.stdin });
for await (const command of lines) {
  if (command === 'fail-next-export') { failNext = true; console.log('下一次模擬匯出將失敗。'); }
  if (command === 'lose-next-buzz') { loseNextBuzz = true; console.log('下一次學生送出的確認將被丟棄（回答仍保存）。'); }
  if (command === 'disconnect') { for (const client of app.events.clients) client.res.end(); console.log('已中斷 SSE，等待瀏覽器自動重連。'); }
  if (command === 'restart') { await app.close(); await start(); console.log('測試服務重啟，所有題目與工作階段已清空。'); }
  if (command === 'stop') { await app.close(); lines.close(); break; }
}
