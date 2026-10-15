// 可重複產生公開 API 合約；不含執行環境或課堂資料。
import { mkdir, writeFile } from 'node:fs/promises';
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const string = (maxLength, description) => ({ type: 'string', minLength: 1, ...(maxLength ? { maxLength } : {}), ...(description ? { description } : {}) });
const array = items => ({ type: 'array', items });
const number = string(80, '去除前後空白，保留前導零；以字串處理。');
const groupNumber = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER, description: '學生組別編號；畫面以 G 加編號顯示。' };
const content = string(2000, '去除前後空白後 1–2000 個 Unicode 字元，不接受全空白。');
const answer = string(5000, '去除前後空白後 1–5000 個 Unicode 字元；保留內部換行。');
const id = { type: 'string', format: 'uuid' };
const nullableId = { anyOf: [id, { type: 'null' }] };
const caseNumber = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 18 };
const partNumber = { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] };
const groupTitle = { anyOf: [string(2000), { type: 'null' }] };
const durationSeconds = { type: 'integer', minimum: 1, maximum: 3600, default: 60, description: '每題倒數秒數，僅草稿可修改。' };
const nullableNumber = { anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }] };
const nullable = name => ({ anyOf: [ref(name), { type: 'null' }] });
const serverNow = { type: 'number', description: '伺服器目前 Unix 毫秒，用於顯示倒數。' };
const schemas = {
  Error: object({ error: { type: 'string' } }), Empty: object({}),
  TeacherLogin: object({ username: string(80), password: { type: 'string', maxLength: 1024, description: '不修剪密碼，需與部署設定一致。' } }),
  Authenticated: object({ authenticated: { const: true, type: 'boolean' } }),
  StudentIdentity: object({ studentNumber: number, groupNumber }),
  CreateQuestion: { ...object({ content, durationSeconds }), required: ['content'] },
  CreatePart: { ...object({ content, durationSeconds }), required: ['content'] },
  CreateGroup: object({ title: string(2000), parts: { type: 'array', minItems: 1, items: ref('CreatePart') } }),
  EditGroup: object({ title: string(2000) }),
  Group: object({ groupId: id, caseNumber, title: string(2000), questions: array(ref('TeacherQuestion')) }),
  EditQuestion: { ...object({ content, durationSeconds }), required: ['content'] },
  Submission: object({ studentNumber: number, groupNumber, answer }), Buzz: object({ answer }),
  SubmissionIdentity: object({ id, studentNumber: number, groupNumber, answer }),
  TeacherSubmission: object({ id, studentNumber: number, groupNumber, answer, acceptedAt: { type:'number', description:'伺服器接受時間，Unix 毫秒。' },
    acceptedOrder: { type:'integer', minimum:1 }, priorWinCount: { type:'integer', minimum:0, description:'同組先前有效第一名次數；開放中動態計算，結算時固定。' },
    rank: { anyOf:[{ type:'integer', minimum:1 },{ type:'null' }] }, disqualified: { type:'boolean' } }),
  Receipt: object({ received: { type: 'boolean', const: true } }),
  TeacherQuestion: object({ id, groupId: nullableId, caseNumber, partNumber, groupTitle, content, durationSeconds, status: { type: 'string', enum: ['draft', 'open', 'paused', 'settled'] },
    deadlineAt: nullableNumber, remainingMs: nullableNumber, submissions: array(ref('TeacherSubmission')),
    provisionalLeader: nullable('SubmissionIdentity'), winner: nullable('SubmissionIdentity'),
    clearPending: { type:'boolean', description:'本課堂已匯出但有效第一名全數失格，下次匯出清空舊值。' } }),
  StudentQuestion: object({ id, caseNumber, partNumber, groupTitle, content, status:{ type:'string', enum:['open','paused'] },
    deadlineAt: nullableNumber, remainingMs: nullableNumber,
    submitted: { type: 'boolean', description: '僅此學號在該題是否已有效提交，與第一名無關。' } }),
  ExportItem: { ...object({ caseNumber, partNumber, range: string(), clear: { type:'boolean' }, value: { type:'string' },
    expectedOldValue: { type:'string', description:'僅清空已確認的舊格時提供；寫入前會讀回確認沒有被手動修改。' } }),
    required: ['caseNumber', 'partNumber', 'range', 'clear', 'value'] },
  ExportPlan: object({ items: array(ref('ExportItem')), throughCase: { type:'integer', minimum:6, description:'Case 7+ 的列可能需首次插入；實際結構由匯出時 Google 現況決定。' } }),
  TeacherSnapshot: object({ serverNow, questions: array(ref('TeacherQuestion')), exporting: { type: 'boolean' }, sheetName: string(), testMode: { type: 'boolean', description: '正式服務固定 false；測試 fixture 才會 true。' }, exportPlan: ref('ExportPlan') }),
  StudentSnapshot: object({ serverNow, studentNumber: number, groupNumber, questions: array(ref('StudentQuestion')) }),
  ExportResult: object({ writtenCount: { type: 'integer', minimum: 0 }, clearedCount: { type:'integer', minimum:0, description:'writtenCount 中以空文字清除的格數。' },
    ranges: array(string()), testMode: { type: 'boolean' } }),
};
const errorText = { 400: 'JSON、必要欄位、額外欄位或文字長度錯誤', 401: '未登入、角色不符、工作階段失效或教師憑證錯誤',
  403: '跨來源寫入被拒絕', 404: '找不到題目、題組或 API', 409: '題目狀態不符或正在匯出，請稍後再試',
  413: '超過 64 KiB body 上限', 415: '必須為 application/json', 500: '伺服器錯誤（不透露內部資訊）',
  502: '無法確認 Google 格位或寫入成功；可能已寫入，重試前會讀回可疑格', 503: '尚未提供 Google 設定' };
const response = (schema, description = '成功') => ({ description, content: { 'application/json': { schema: ref(schema) } } });
const errors = codes => Object.fromEntries(codes.map(code => [code, response('Error', errorText[code])]));
const writeErrors = [400, 401, 403, 413, 415, 500];
function operation(operationId, summary, role, result, options = {}) {
  const { body, success = 200, extra = [], description, parameter = false, groupParameter = false } = options;
  const op = { operationId, summary, tags: [role], security: options.public ? [] : [{ [`${role}Cookie`]: [] }],
    responses: { [success]: result ? response(result) : { description: '刪除成功，沒有回應內容' }, ...errors(body ? [...writeErrors, ...extra] : [401, 500, ...extra]) } };
  if (body) op.requestBody = { required: true, content: { 'application/json': { schema: ref(body) } } };
  if (description) op.description = description;
  if (parameter) op.parameters = [{ in: 'path', name: 'questionId', required: true, schema: id }];
  if (groupParameter) op.parameters = [{ in: 'path', name: 'groupId', required: true, schema: id }];
  return op;
}
const paths = {
  '/api/teacher/session': {
    post: operation('teacherLogin', '教師帳密登入', 'teacher', 'Authenticated', { body: 'TeacherLogin', public: true }),
    delete: operation('teacherLogout', '撤銷目前教師工作階段', 'teacher', null, { body: 'Empty', success: 204 }),
  },
  '/api/student/session': { post: operation('studentLogin', '學號與組別免密碼登入', 'student', 'StudentIdentity', { body: 'StudentIdentity', public: true, extra: [409] }) },
  '/api/teacher/questions': {
    get: operation('teacherQuestions', '取得全部題目、即時順位與所有回答', 'teacher', 'TeacherSnapshot'),
    post: operation('createQuestion', '後端自動編號新增單題 Case（不會立即開放）', 'teacher', 'TeacherQuestion', { body: 'CreateQuestion', success: 201, extra: [409] }),
  },
  '/api/teacher/groups': {
    post: operation('createGroup', '後端自動編號建立題組與草稿小題', 'teacher', 'Group', { body: 'CreateGroup', success: 201, extra: [409] }),
  },
  '/api/teacher/groups/{groupId}': {
    patch: operation('editGroup', '修改題組標題', 'teacher', 'Group', { body: 'EditGroup', groupParameter: true, extra: [404, 409] }),
    delete: operation('deleteGroup', '刪除整個題組與暫存回答', 'teacher', null, { body: 'Empty', groupParameter: true, success: 204, extra: [404, 409] }),
  },
  '/api/teacher/groups/{groupId}/questions': {
    post: operation('addGroupQuestion', '在題組末尾追加草稿小題', 'teacher', 'TeacherQuestion', { body: 'CreatePart', groupParameter: true, success: 201, extra: [404, 409] }),
  },
  '/api/teacher/questions/{questionId}': {
    get: operation('teacherQuestion', '取得指定題目及全部回答', 'teacher', 'TeacherQuestion', { parameter: true, extra: [404] }),
    patch: operation('editQuestion', '修改題目文字；草稿可修改倒數秒數', 'teacher', 'TeacherQuestion', { body: 'EditQuestion', parameter: true, extra: [404, 409] }),
    delete: operation('deleteQuestion', '刪題並遞補後續編號，不立即更動 Sheet', 'teacher', null, { body: 'Empty', parameter: true, success: 204, extra: [404, 409] }),
  },
  '/api/teacher/questions/{questionId}/convert-to-group': {
    post: operation('convertQuestionToGroup', '保留原題狀態並轉為 1-1', 'teacher', 'Group', { body: 'EditGroup', parameter: true, extra: [404, 409] }),
  },
  '/api/student/questions': { get: operation('studentQuestions', '僅取得開放或暫停題目及自己的提交狀態', 'student', 'StudentSnapshot') },
  '/api/student/questions/{questionId}/buzz': { post: operation('buzz', '提交回答，不回傳勝負', 'student', 'Receipt', { body: 'Buzz', success: 202, parameter: true,
    description: '首次有效回答由伺服器同步接受並記錄順序；重送、截止、暫停、失格或不存在的題目一律回相同的 202 收件格式，不透露排名或得標資訊。學生端確認彈窗僅為 UI，無額外 API。' }) },
  '/api/teacher/exports/google-sheet': { post: operation('exportWinners', '覆寫已結算有效第一名，必要時清空舊值', 'teacher', 'ExportResult', { body: 'Empty', extra: [409, 502, 503],
    description: '只快照已結算單題／小題。Case N 的 N-1 或單題寫第 18+N 列 C 欄，N-2 為 D 欄，以 RAW 寫入「{題目}_回答_G組別編號」，不含學號。Case 7+ 首次匯出時視需要插列，既有列不重複新增。刪題後按新編號覆寫，已確認的舊座標清空；清空前確認未被人工改動。寫入回應遺失後，下一次匯出先讀回可疑格。匯出期間教師修改回 409。' }) },
};
for (const [action, summary, description] of [
  ['start','開始草稿題目的獨立倒數','僅 draft 可開始；從設定秒數開始倒數。可同時開放多題。'],
  ['pause','暫停此題倒數','僅 open 可暫停，保留草稿、已收回答與剩餘毫秒。'],
  ['resume','繼續此題倒數','僅 paused 可繼續，從剩餘毫秒倒數。'],
  ['stop','提早結算開放或暫停題目','固定當下有效候選順位及得標者；settled 為終態不可重開。'],
]) paths[`/api/teacher/questions/{questionId}/${action}`] = {
  post: operation(`${action}Question`, summary, 'teacher', 'TeacherQuestion', { body: 'Empty', parameter: true, extra: [404, 409], description }),
};
paths['/api/teacher/questions/{questionId}/submissions/{submissionId}/disqualify'] = {
  post: { ...operation('disqualifySubmission', '取消回答資格並遞補順位', 'teacher', 'TeacherQuestion', { body:'Empty', parameter:true, extra:[404,409],
    description:'教師可在開放、暫停或結算後取消資格；保留紀錄，同題禁止重送。結算題由下一位有效候選者遞補。匯出期間回 409。' }),
    parameters:[{ in:'path', name:'questionId', required:true, schema:id },{ in:'path', name:'submissionId', required:true, schema:id }] },
};
for (const role of ['teacher', 'student']) {
  const schema = role === 'teacher' ? 'TeacherSnapshot' : 'StudentSnapshot';
  const op = operation(`${role}Events`, '角色專用即時快照串流', role, schema);
  op.responses[200] = { description: `每次連線先送完整 snapshot，資料為 ${schema} JSON。重連重新取得完整快照。不提供事件 id。15 秒固定 heartbeat 註解；過期送 auth-required / {} 並關閉。學生僅因自己的提交或可見題目變更收到快照，不能看到其他學號、回答、總人數或勝負。慢連線只保留最新快照。`,
    content: { 'text/event-stream': { schema: { type: 'string' }, example: `retry: 1500\n\nevent: snapshot\ndata: ${JSON.stringify(role === 'teacher' ? { serverNow: 0, questions: [], exporting: false, sheetName: '工作表1', testMode: false } : { serverNow: 0, studentNumber: '00123', groupNumber: 2, questions: [] })}\n\n: heartbeat\n\nevent: auth-required\ndata: {}\n\n` } },
    'x-snapshot-schema': ref(schema) };
  paths[`/api/${role}/events`] = { get: op };
  paths[`/api/${role}/session`].post.responses[200].headers = { 'Set-Cookie': { description: `${role}_session 隨機 token；HttpOnly、Path=/、SameSite=Strict；HTTPS 設 Secure。伺服器保存雜湊，12 小時到期，重啟失效。`, schema: { type: 'string' } } };
}
const spec = { openapi: '3.1.0', info: { title: '課堂即時搶答 API', version: '1.0.0', description: '單一 Node.js 程序、記憶體狀態、無資料庫。所有端點同源。寫入要求 application/json；body 上限 64 KiB，未列出的欄位被拒絕。沒有瀏覽器 Origin 的客戶端仍須登入。所有回應 no-store，不記錄學生答案或憑證。重啟不從 Sheet 恢復課堂。' },
  servers: [{ url: '/', description: '與前端同一來源' }], tags: [{ name: 'teacher' }, { name: 'student' }], paths,
  components: { securitySchemes: { teacherCookie: { type: 'apiKey', in: 'cookie', name: 'teacher_session' }, studentCookie: { type: 'apiKey', in: 'cookie', name: 'student_session' } }, schemas } };
await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
await writeFile(new URL('../docs/openapi.json', import.meta.url), JSON.stringify(spec, null, 2) + '\n');
