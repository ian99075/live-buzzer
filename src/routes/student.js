import { fields, HttpError, json, textValue } from '../http.js';
import { studentSnapshot } from '../projections.js';

export function studentRoute({ req, res, path, body, store, sessions, events }) {
  if (path === '/api/student/session' && req.method === 'POST') {
    fields(body, ['studentNumber', 'groupNumber']);
    const studentNumber = textValue(body.studentNumber, 80, '學號');
    const groupNumber = store.registerStudent(studentNumber, body.groupNumber);
    res.setHeader('Set-Cookie', sessions.cookie('student', sessions.create('student', { studentNumber, groupNumber })));
    json(res, 200, { studentNumber, groupNumber }); return;
  }
  const auth = sessions.require(req, 'student');
  const studentNumber = auth.session.studentNumber;
  const groupNumber = auth.session.groupNumber;
  if (path === '/api/student/events' && req.method === 'GET') { events.attach(req, res, 'student', auth); return; }
  if (path === '/api/student/questions' && req.method === 'GET') {
    json(res, 200, studentSnapshot(store, studentNumber, groupNumber)); return;
  }
  const groupMatch = path.match(/^\/api\/student\/groups\/([a-zA-Z0-9-]+)\/buzz$/);
  if (groupMatch && req.method === 'POST') {
    fields(body, ['answers']);
    const changed = store.submitGroup(groupMatch[1], studentNumber, body.answers, groupNumber);
    json(res, 202, { received: true });
    if (changed) events.publish(studentNumber);
    return;
  }
  const match = path.match(/^\/api\/student\/questions\/([a-zA-Z0-9-]+)\/buzz$/);
  if (match && req.method === 'POST') {
    fields(body, ['answer']);
    const changed = store.submit(match[1], studentNumber, body.answer, groupNumber);
    json(res, 202, { received: true });
    if (changed) events.publish(studentNumber);
    return;
  }
  throw new HttpError(404, '找不到 API。');
}
