import { fields, HttpError, json, textValue } from '../http.js';
import { studentSnapshot } from '../projections.js';

export function studentRoute({ req, res, path, body, store, sessions, events }) {
  if (path === '/api/student/session' && req.method === 'POST') {
    fields(body, ['studentNumber']);
    const studentNumber = textValue(body.studentNumber, 80, '學號');
    res.setHeader('Set-Cookie', sessions.cookie('student', sessions.create('student', { studentNumber })));
    json(res, 200, { studentNumber }); return;
  }
  const auth = sessions.require(req, 'student');
  const studentNumber = auth.session.studentNumber;
  if (path === '/api/student/events' && req.method === 'GET') { events.attach(req, res, 'student', auth); return; }
  if (path === '/api/student/questions' && req.method === 'GET') {
    json(res, 200, studentSnapshot(store, studentNumber)); return;
  }
  const match = path.match(/^\/api\/student\/questions\/([a-zA-Z0-9-]+)\/buzz$/);
  if (match && req.method === 'POST') {
    fields(body, ['answer']);
    const changed = store.submit(match[1], studentNumber, body.answer);
    json(res, 202, { received: true });
    if (changed) events.publish(studentNumber);
    return;
  }
  throw new HttpError(404, '找不到 API。');
}
