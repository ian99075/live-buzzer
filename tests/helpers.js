import { createApp } from '../src/server.js';
import { readConfig } from '../src/config.js';

export const testConfig = extra => ({ ...readConfig({ TEACHER_USERNAME: 'teacher', TEACHER_PASSWORD: 'test-password-only', PORT: '0' }), ...extra });
export async function fixture(t, options = {}) {
  const config = options.config || testConfig();
  const app = createApp({ ...options, config });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  config.origin = base;
  t.after(() => app.close());
  async function request(path, { method = 'GET', cookie, body, headers = {} } = {}) {
    const response = await fetch(base + path, { method,
      headers: { ...(cookie ? { cookie } : {}), ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null, headers: response.headers,
      cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const studentGroups = new Map();
  const login = async (role = 'student', studentNumber = '00123', explicitGroup) => {
    const groupNumber = explicitGroup ?? studentGroups.get(studentNumber) ?? studentGroups.size + 1;
    if (role === 'student' && !studentGroups.has(studentNumber)) studentGroups.set(studentNumber, groupNumber);
    const r = await request(`/api/${role}/session`, { method: 'POST', body: role === 'teacher'
      ? { username: 'teacher', password: 'test-password-only' } : { studentNumber, groupNumber } });
    return r.cookie;
  };
  const question = async (cookie, caseNumber = 1) => {
    const q = (await request('/api/teacher/questions', { method: 'POST', cookie, body: { content: `第 ${caseNumber} 題` } })).data;
    await request(`/api/teacher/questions/${q.id}/start`, { method: 'POST', cookie }); return q;
  };
  return { ...app, config, base, request, login, question };
}
export async function stream(base, role, cookie) {
  const controller = new AbortController();
  const response = await fetch(`${base}/api/${role}/events`, { headers: { cookie }, signal: controller.signal });
  const reader = response.body.getReader();
  const frames = []; const waiters = []; let buffer = '';
  const pump = (async () => {
    try {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (!raw.startsWith('event:')) continue;
          const frame = { raw, event: raw.match(/^event: (.+)/)[1], data: JSON.parse(raw.match(/\ndata: (.+)/)[1]) };
          const waiter = waiters.shift(); if (waiter) waiter(frame); else frames.push(frame);
        }
      }
    } catch { /* 測試主動取消串流 */ }
  })();
  return { response, frames, next: () => frames.length ? Promise.resolve(frames.shift()) : new Promise(resolve => waiters.push(resolve)),
    close: async () => { controller.abort(); await pump; } };
}
