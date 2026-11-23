// 僅供本機介面驗收。正式入口 src/server.js 不使用此帳密或模擬 writer。
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../src/server.js';
import { testConfig } from './helpers.js';
import { fakeSheet } from './sheet-fixture.js';

const port = Number(process.env.PREVIEW_PORT || 3000);
const host = process.env.PREVIEW_HOST || '127.0.0.1';
const config = testConfig({ port, origin: `http://127.0.0.1:${port}`, testMode: true });
let app, failNext = false, loseNextBuzz = false;
function makeApp() {
  const sheet = fakeSheet();
  for (const [key, questionCell, answerCell] of [
    ['1_1','C5','H5'], ['1_2','C6','H6'], ['2_1','C8','H8'], ['2_2','C9','H9'], ['3','C11','G11'], ['4','C13','G13']]) {
    sheet.put(questionCell, `題目 ${key}`, `$q_${key}$`);
    sheet.put(answerCell, `$a_${key}$`);
  }
  const sheetClient = {
    readGrid: () => sheet.client.readGrid(),
    async write(items, grid) {
      await delay(1200);
      if (failNext) { failNext = false; throw new Error('模擬遠端失敗'); }
      await sheet.client.write(items, grid);
      console.log(`模擬匯出確認 ${items.length} 格；未連線 Google。`);
    },
  };
  const instance = createApp({ config, heartbeatMs: 1000, sheetClient });
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
async function start() { app = makeApp(); await new Promise(resolve => app.server.listen(port, host, resolve)); }
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
