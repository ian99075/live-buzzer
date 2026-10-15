import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'file:///C:/Users/Ian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { createApp } from '../src/server.js';
import { testConfig } from '../tests/helpers.js';

const port = 3300;
const origin = `http://127.0.0.1:${port}`;
const written = new Map();
const writer = async items => { for (const item of items) written.set(item.range, item.values[0][0]); };
writer.readCells = async items => new Map(items.map(item => [item.range, written.get(item.range) ?? '']));
const app = createApp({ config: testConfig({ port, origin, testMode: true }), heartbeatMs: 1000, writer });
await new Promise((resolve, reject) => {
  app.server.once('error', reject);
  app.server.listen(port, '127.0.0.1', resolve);
});

async function call(route, method='GET', body, cookie) {
  const response = await fetch(origin+route, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'GET' ? {} : { 'Content-Type':'application/json', Origin: origin }) },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${raw}`);
  return { data: raw ? JSON.parse(raw) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const cookieParts = cookie => { const index=cookie.indexOf('='); return {name:cookie.slice(0,index),value:cookie.slice(index+1),url:origin}; };
let teacherBrowser, studentBrowser;
try {
  const t = (await call('/api/teacher/session','POST',{username:'teacher',password:'test-password-only'})).cookie;
  const a = (await call('/api/student/session','POST',{studentNumber:'00123'})).cookie;
  const b = (await call('/api/student/session','POST',{studentNumber:'00456'})).cookie;
  const group=(await call('/api/teacher/groups','POST',{
    title:'案例分析：需求與邊界條件',
    parts:[
      {content:'需求一：請指出使用者可看見哪些資料？',durationSeconds:300},
      {content:'需求二：倒數結束後，系統如何選出得標者？',durationSeconds:300},
    ],
  },t)).data;
  const [q1,q2]=group.questions;
  await call(`/api/teacher/questions/${q1.id}/start`,'POST',{},t);
  await call(`/api/teacher/questions/${q2.id}/start`,'POST',{},t);
  await call(`/api/student/questions/${q1.id}/buzz`,'POST',{answer:'只看題目、倒數及自己的提交狀態'},a);
  await call(`/api/student/questions/${q1.id}/buzz`,'POST',{answer:'學生只能看到題目與自己的結果'},b);
  await call(`/api/student/questions/${q2.id}/buzz`,'POST',{answer:'先比得標次數，再比接受順序'},b);
  await call(`/api/teacher/questions/${q1.id}/stop`,'POST',{},t);
  await call(`/api/teacher/questions/${q2.id}/stop`,'POST',{},t);
  const q1View=(await call(`/api/teacher/questions/${q1.id}`,'GET',undefined,t)).data;
  const first=q1View.submissions.find(item=>item.studentNumber==='00123');
  await call(`/api/teacher/questions/${q1.id}/submissions/${first.id}/disqualify`,'POST',{},t);
  const single=(await call('/api/teacher/questions','POST',{
    content:'單題：請說明何謂伺服器接受順序', durationSeconds:3600,
  },t)).data;
  await call(`/api/teacher/questions/${single.id}/start`,'POST',{},t);
  await call(`/api/student/questions/${single.id}/buzz`,'POST',{answer:'以後端首次接受的有效提交順序為準'},b);

  const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
  teacherBrowser=await chromium.launch({headless:false,executablePath:chrome,args:['--window-position=0,0','--window-size=1120,930','--no-first-run']});
  const teacherContext=await teacherBrowser.newContext({viewport:{width:1080,height:830},deviceScaleFactor:1});
  await teacherContext.addCookies([cookieParts(t)]);
  const teacherPage=await teacherContext.newPage();
  await teacherPage.goto(origin+'/teacher');
  await teacherPage.locator('#dashboard').waitFor({state:'visible'});
  await teacherPage.locator('#question-nav .single-case').click();

  studentBrowser=await chromium.launch({headless:false,executablePath:chrome,args:['--window-position=1130,0','--window-size=510,930','--no-first-run']});
  const studentContext=await studentBrowser.newContext({viewport:{width:450,height:830},deviceScaleFactor:1});
  await studentContext.addCookies([cookieParts(a)]);
  const studentPage=await studentContext.newPage();
  await studentPage.goto(origin+'/student');
  await studentPage.locator('#classroom').waitFor({state:'visible'});
  await studentPage.locator('#answer-list textarea').first().fill('伺服器依接受有效提交的順序裁決');
  await teacherPage.bringToFront();
  await studentPage.bringToFront();
  const out=path.resolve('.pptx-build/demo-live');
  await fs.mkdir(out,{recursive:true});
  await teacherPage.screenshot({path:path.join(out,'teacher.png')});
  await studentPage.screenshot({path:path.join(out,'student.png')});
  console.log(JSON.stringify({status:'ready',teacher:origin+'/teacher',student:origin+'/student',caseCount:2,settledQuestions:2,openQuestions:1,teacherAnswerCount:4}));
  await new Promise(()=>{});
} catch(error) {
  console.error(error);
  await teacherBrowser?.close().catch(()=>{});
  await studentBrowser?.close().catch(()=>{});
  await app.close().catch(()=>{});
  process.exitCode=1;
}
