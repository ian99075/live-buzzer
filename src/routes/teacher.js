import { fields, HttpError, json, textValue } from '../http.js';
import { teacherQuestion, teacherSnapshot } from '../projections.js';

export async function teacherRoute(ctx) {
  const { req, res, path, body, store, sessions, events, exporter, config } = ctx;
  if (path === '/api/teacher/session' && req.method === 'POST') {
    fields(body, ['username', 'password']);
    const username = textValue(body.username, 80, '帳號');
    if (typeof body.password !== 'string' || body.password.length > 1024) throw new HttpError(400, '密碼格式不正確。');
    sessions.teacher(username, body.password);
    res.setHeader('Set-Cookie', sessions.cookie('teacher', sessions.create('teacher', { username })));
    json(res, 200, { authenticated: true }); return;
  }
  const auth = sessions.require(req, 'teacher');
  if (path === '/api/teacher/session' && req.method === 'DELETE') {
    fields(body, []); sessions.revoke(auth.token); events.revoke('teacher', auth.token);
    res.setHeader('Set-Cookie', sessions.clearCookie('teacher'));
    json(res, 204); return;
  }
  if (path === '/api/teacher/events' && req.method === 'GET') { events.attach(req, res, 'teacher', auth); return; }
  if (path === '/api/teacher/exports/google-sheet' && req.method === 'POST') {
    fields(body, []); json(res, 200, await exporter.run()); return;
  }
  if (path === '/api/teacher/groups' && req.method === 'POST') {
    fields(body, ['title', 'parts'], ['title', 'parts']);
    const group = store.addGroup(body.title, body.parts);
    json(res, 201, { groupId: group.id, caseNumber: group.caseNumber, title: group.title,
      questions: group.questions.map(q => teacherQuestion(q, store)) }); events.publish(); return;
  }
  const groupQuestion = path.match(/^\/api\/teacher\/groups\/([a-f0-9-]{36})\/questions$/);
  if (groupQuestion && req.method === 'POST') {
    fields(body, ['content', 'durationSeconds'], ['content']);
    const q = store.addPart(groupQuestion[1], body.content, body.durationSeconds);
    json(res, 201, teacherQuestion(q, store)); events.publish(); return;
  }
  const groupMatch = path.match(/^\/api\/teacher\/groups\/([a-f0-9-]{36})$/);
  if (groupMatch) {
    const groupId = groupMatch[1];
    if (req.method === 'PATCH') {
      fields(body, ['title']);
      const group = store.renameGroup(groupId, body.title);
      json(res, 200, { groupId, caseNumber: group.caseNumber, title: group.title,
        questions: group.questionIds.map(id => teacherQuestion(store.get(id), store)) }); events.publish(); return;
    }
    if (req.method === 'DELETE') {
      fields(body, []); store.removeGroup(groupId); json(res, 204); events.publish(); return;
    }
  }
  if (path === '/api/teacher/questions') {
    if (req.method === 'GET') { json(res, 200, teacherSnapshot(store, config)); return; }
    if (req.method === 'POST') {
      fields(body, ['content', 'durationSeconds'], ['content']);
      const q = store.add(body.content, body.durationSeconds);
      json(res, 201, teacherQuestion(q, store)); events.publish(); return;
    }
  }
  const disqualify = path.match(/^\/api\/teacher\/questions\/([a-zA-Z0-9-]+)\/submissions\/([a-zA-Z0-9-]+)\/disqualify$/);
  if (disqualify && req.method === 'POST') {
    fields(body, []); json(res, 200, teacherQuestion(store.disqualify(disqualify[1], disqualify[2]), store));
    events.publish(); return;
  }
  const convert = path.match(/^\/api\/teacher\/questions\/([a-zA-Z0-9-]+)\/convert-to-group$/);
  if (convert && req.method === 'POST') {
    fields(body, ['title']); const group = store.convertToGroup(convert[1], body.title);
    json(res, 200, { groupId: group.id, caseNumber: group.caseNumber, title: group.title,
      questions: group.questionIds.map(id => teacherQuestion(store.get(id), store)) }); events.publish(); return;
  }
  const match = path.match(/^\/api\/teacher\/questions\/([a-zA-Z0-9-]+)(?:\/(start|pause|resume|stop))?$/);
  if (match) {
    const [, id, action] = match;
    if (!action && req.method === 'GET') { json(res, 200, teacherQuestion(store.get(id), store)); return; }
    if (!action && req.method === 'PATCH') {
      fields(body, ['content', 'durationSeconds'], ['content']); json(res, 200, teacherQuestion(store.edit(id, body.content, body.durationSeconds), store)); events.publish(); return;
    }
    if (!action && req.method === 'DELETE') {
      fields(body, []); store.remove(id); json(res, 204); events.publish(); return;
    }
    if (action && req.method === 'POST') {
      fields(body, []);
      const state = { start: 'open', pause: 'paused', resume: 'open', stop: 'settled' }[action];
      json(res, 200, teacherQuestion(store.status(id, state), store));
      events.publish(); return;
    }
  }
  throw new HttpError(404, '找不到 API。');
}
