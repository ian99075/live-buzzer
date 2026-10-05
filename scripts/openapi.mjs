// 可重複產生公開 API 合約；不含執行環境或課堂資料。
import { mkdir, writeFile } from 'node:fs/promises';
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const string = (maxLength, description) => ({ type: 'string', minLength: 1, ...(maxLength ? { maxLength } : {}), ...(description ? { description } : {}) });
const array = items => ({ type: 'array', items });
const number = string(80, '去除前後空白，保留前導零；以字串處理。');
const content = string(2000, '去除前後空白後 1–2000 個 Unicode 字元，不接受全空白。');
const answer = string(5000, '去除前後空白後 1–5000 個 Unicode 字元；保留內部換行。');
const id = { type: 'string', format: 'uuid' };
const caseNumber = { type: 'integer', minimum: 1, maximum: 6 };
const schemas = {
  Error: object({ error: { type: 'string' } }), Empty: object({}),
  TeacherLogin: object({ username: string(80), password: { type: 'string', maxLength: 1024, description: '不修剪密碼，需與部署設定一致。' } }),
  Authenticated: object({ authenticated: { const: true, type: 'boolean' } }),
  StudentIdentity: object({ studentNumber: number }),
  CreateQuestion: object({ caseNumber, content }), EditQuestion: object({ content }),
  Submission: object({ studentNumber: number, answer }), Buzz: object({ answer }),
  Receipt: object({ received: { type: 'boolean', const: true } }),
  TeacherQuestion: object({ id, caseNumber, content, status: { type: 'string', enum: ['draft', 'open', 'stopped'] },
    submissions: array(ref('Submission')), winner: { anyOf: [ref('Submission'), { type: 'null' }] } }),
  StudentQuestion: object({ id, caseNumber, content, submitted: { type: 'boolean', description: '僅此學號在該題是否已有效提交，與第一名無關。' } }),
  TeacherSnapshot: object({ questions: array(ref('TeacherQuestion')), exporting: { type: 'boolean' }, sheetName: string(), testMode: { type: 'boolean', description: '正式服務固定 false；測試 fixture 才會 true。' } }),
  StudentSnapshot: object({ studentNumber: number, questions: array(ref('StudentQuestion')) }),
  ExportResult: object({ writtenCount: { type: 'integer', minimum: 0, maximum: 6 }, ranges: array(string()), testMode: { type: 'boolean' } }),
};
const errorText = { 400: 'JSON、必要欄位、額外欄位或文字長度錯誤', 401: '未登入、角色不符、工作階段失效或教師憑證錯誤',
  403: '跨來源寫入被拒絕', 404: '找不到題目或 API', 409: 'Case 重複或正在匯出，請稍後再試',
  413: '超過 64 KiB body 上限', 415: '必須為 application/json', 500: '伺服器錯誤（不透露內部資訊）',
  502: '無法確認 Google 授權或寫入成功；遠端可能已寫入，可手動重試相同儲存格', 503: '尚未提供 Google 設定' };
const response = (schema, description = '成功') => ({ description, content: { 'application/json': { schema: ref(schema) } } });
const errors = codes => Object.fromEntries(codes.map(code => [code, response('Error', errorText[code])]));
const writeErrors = [400, 401, 403, 413, 415, 500];
function operation(operationId, summary, role, result, options = {}) {
  const { body, success = 200, extra = [], description, parameter = false } = options;
  const op = { operationId, summary, tags: [role], security: options.public ? [] : [{ [`${role}Cookie`]: [] }],
    responses: { [success]: result ? response(result) : { description: '刪除成功，沒有回應內容' }, ...errors(body ? [...writeErrors, ...extra] : [401, 500, ...extra]) } };
  if (body) op.requestBody = { required: true, content: { 'application/json': { schema: ref(body) } } };
  if (description) op.description = description;
  if (parameter) op.parameters = [{ in: 'path', name: 'questionId', required: true, schema: id }];
  return op;
}
const paths = {
  '/api/teacher/session': { post: operation('teacherLogin', '教師帳密登入', 'teacher', 'Authenticated', { body: 'TeacherLogin', public: true }) },
  '/api/student/session': { post: operation('studentLogin', '學號免密碼登入', 'student', 'StudentIdentity', { body: 'StudentIdentity', public: true }) },
  '/api/teacher/questions': {
    get: operation('teacherQuestions', '取得題目、全部回答及每題第一名', 'teacher', 'TeacherSnapshot'),
    post: operation('createQuestion', '新增固定 Case 題號（不會立即開放）', 'teacher', 'TeacherQuestion', { body: 'CreateQuestion', success: 201, extra: [409] }),
  },
  '/api/teacher/questions/{questionId}': {
    get: operation('teacherQuestion', '取得指定題目及全部回答', 'teacher', 'TeacherQuestion', { parameter: true, extra: [404] }),
    patch: operation('editQuestion', '只修改題目文字，保留回答與第一名', 'teacher', 'TeacherQuestion', { body: 'EditQuestion', parameter: true, extra: [404, 409] }),
    delete: operation('deleteQuestion', '刪除題目與暫存回答，不更動 Sheet', 'teacher', null, { body: 'Empty', parameter: true, success: 204, extra: [404, 409] }),
  },
  '/api/student/questions': { get: operation('studentQuestions', '僅取得開放題目及自己的提交狀態', 'student', 'StudentSnapshot') },
  '/api/student/questions/{questionId}/buzz': { post: operation('buzz', '提交回答，不回傳勝負', 'student', 'Receipt', { body: 'Buzz', success: 202, parameter: true,
    description: '已驗證、格式有效的請求，不論首次、後續、重送、停止或已刪除題目，均回傳相同 202 / {received:true}。僅代表收到請求。只有仍開放題目中此學號的首次提交被保存；不接受 body 學號、時間戳或勝負欄位。第一名由單一程序同步操作最先接受的有效提交決定，之後仍收集其他學號回答。' }) },
  '/api/teacher/exports/google-sheet': { post: operation('exportWinners', '將每題第一名寫入固定 Sequence 儲存格', 'teacher', 'ExportResult', { body: 'Empty', extra: [409, 502, 503],
    description: '開始時複製第一名快照，Case 1–6 對應設定分頁 C19–C24。RAW 寫入 answer + "_" + studentNumber。無第一名的格不變，無資料不呼叫 Google。匯出期間題目管理及第二次匯出回 409，但學生可繼續提交。新第一名下次才匯出。失敗不清空資料，固定位置覆寫可安全重試。' }) },
};
for (const action of ['start', 'stop']) paths[`/api/teacher/questions/{questionId}/${action}`] = {
  post: operation(`${action}Question`, action === 'start' ? '獨立開放此題（可同時開放多題）' : '獨立停止此題', 'teacher', 'TeacherQuestion', { body: 'Empty', parameter: true, extra: [404, 409], description: '不重設既有回答或第一名。重複設定相同狀態無害。' }),
};
for (const role of ['teacher', 'student']) {
  const schema = role === 'teacher' ? 'TeacherSnapshot' : 'StudentSnapshot';
  const op = operation(`${role}Events`, '角色專用即時快照串流', role, schema);
  op.responses[200] = { description: `每次連線先送完整 snapshot，資料為 ${schema} JSON。重連重新取得完整快照。不提供事件 id。15 秒固定 heartbeat 註解；過期送 auth-required / {} 並關閉。學生僅因自己的提交或可見題目變更收到快照，不能看到其他學號、回答、總人數或勝負。慢連線只保留最新快照。`,
    content: { 'text/event-stream': { schema: { type: 'string' }, example: `retry: 1500\n\nevent: snapshot\ndata: ${JSON.stringify(role === 'teacher' ? { questions: [], exporting: false, sheetName: '工作表1', testMode: false } : { studentNumber: '00123', questions: [] })}\n\n: heartbeat\n\nevent: auth-required\ndata: {}\n\n` } },
    'x-snapshot-schema': ref(schema) };
  paths[`/api/${role}/events`] = { get: op };
  paths[`/api/${role}/session`].post.responses[200].headers = { 'Set-Cookie': { description: `${role}_session 隨機 token；HttpOnly、Path=/、SameSite=Strict；HTTPS 設 Secure。伺服器保存雜湊，12 小時到期，重啟失效。`, schema: { type: 'string' } } };
}
const spec = { openapi: '3.1.0', info: { title: '課堂即時搶答 API', version: '1.0.0', description: '單一 Node.js 程序、記憶體狀態、無資料庫。所有端點同源。寫入要求 application/json；body 上限 64 KiB，未列出的欄位被拒絕。沒有瀏覽器 Origin 的客戶端仍須登入。所有回應 no-store，不記錄學生答案或憑證。重啟不從 Sheet 恢復課堂。' },
  servers: [{ url: '/', description: '與前端同一來源' }], tags: [{ name: 'teacher' }, { name: 'student' }], paths,
  components: { securitySchemes: { teacherCookie: { type: 'apiKey', in: 'cookie', name: 'teacher_session' }, studentCookie: { type: 'apiKey', in: 'cookie', name: 'student_session' } }, schemas } };
await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
await writeFile(new URL('../docs/openapi.json', import.meta.url), JSON.stringify(spec, null, 2) + '\n');
