import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture } from './helpers.js';

test('OpenAPI 路由完整、參照有效、瀏覽器資源可讀且私人資料不可讀', async t => {
  const spec = JSON.parse(await readFile(new URL('../docs/openapi.json', import.meta.url), 'utf8'));
  assert.equal(spec.openapi, '3.1.0');
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.$ref) { const parts = node.$ref.split('/').slice(1); assert.ok(parts.reduce((obj, key) => obj?.[key], spec), node.$ref); }
    for (const value of Object.values(node)) walk(value);
  }
  walk(spec);
  const expected = [
    'POST /api/teacher/session', 'DELETE /api/teacher/session', 'POST /api/student/session', 'GET /api/teacher/questions', 'POST /api/teacher/questions',
    'GET /api/teacher/questions/{questionId}', 'PATCH /api/teacher/questions/{questionId}', 'DELETE /api/teacher/questions/{questionId}',
    'POST /api/teacher/groups', 'PATCH /api/teacher/groups/{groupId}', 'DELETE /api/teacher/groups/{groupId}',
    'POST /api/teacher/groups/{groupId}/questions', 'POST /api/teacher/questions/{questionId}/convert-to-group',
    'POST /api/teacher/questions/{questionId}/start', 'POST /api/teacher/questions/{questionId}/pause',
    'POST /api/teacher/questions/{questionId}/resume', 'POST /api/teacher/questions/{questionId}/stop',
    'POST /api/teacher/questions/{questionId}/submissions/{submissionId}/disqualify',
    'GET /api/student/questions', 'POST /api/student/questions/{questionId}/buzz', 'POST /api/teacher/exports/google-sheet',
    'GET /api/teacher/events', 'GET /api/student/events',
  ];
  assert.deepEqual(Object.entries(spec.paths).flatMap(([path, ops]) => Object.keys(ops).map(method => `${method.toUpperCase()} ${path}`)).sort(), expected.sort());
  assert.deepEqual(spec.components.schemas.TeacherQuestion.properties.status.enum, ['draft','open','paused','settled']);
  assert.deepEqual(spec.components.schemas.StudentQuestion.properties.status.enum, ['open','paused']);
  assert.equal(spec.components.schemas.CreateQuestion.properties.durationSeconds.maximum, 3600);
  assert.equal(spec.components.schemas.CreateQuestion.properties.caseNumber, undefined);
  assert.equal(spec.components.schemas.CreateGroup.properties.caseNumber, undefined);
  assert.ok(spec.components.schemas.Group.properties.groupId);
  assert.ok(spec.components.schemas.TeacherQuestion.properties.groupId);
  assert.ok(spec.components.schemas.TeacherQuestion.properties.partNumber);
  assert.ok(spec.components.schemas.StudentQuestion.properties.groupTitle);
  assert.ok(spec.components.schemas.TeacherSubmission.properties.rank);
  assert.equal(spec.components.schemas.StudentIdentity.properties.groupNumber.type, 'integer');
  assert.equal(spec.components.schemas.StudentIdentity.properties.groupNumber.minimum, 1);
  assert.deepEqual(spec.components.schemas.StudentIdentity.required, ['studentNumber', 'groupNumber']);
  assert.ok(spec.paths['/api/student/session'].post.responses[409]);
  assert.ok(spec.components.schemas.StudentSnapshot.properties.groupNumber);
  assert.ok(spec.components.schemas.TeacherSubmission.properties.groupNumber);
  assert.ok(spec.components.schemas.SubmissionIdentity.properties.groupNumber);
  assert.equal(spec.components.schemas.TeacherQuestion.properties.groupId.anyOf[0].format, 'uuid');
  assert.equal(spec.components.schemas.TeacherSubmission.properties.groupNumber.type, 'integer');
  assert.deepEqual(spec.components.schemas.Buzz.required, ['answer']);
  assert.ok(spec.components.schemas.ExportResult.properties.clearedCount);
  assert.ok(spec.components.schemas.TeacherSnapshot.properties.exportPlan);
  const f = await fixture(t);
  for (const path of ['/teacher', '/student', '/css/app.css', '/js/teacher.js', '/js/student.js', '/mark.svg']) {
    const result = await fetch(f.base + path); assert.equal(result.status, 200, path);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }
  for (const path of ['/docs/openapi.json', '/tests/preview.js', '/src/config.js', '/.env', '/%2e%2e%2fsrc/config.js']) assert.equal((await fetch(f.base + path)).status, 404, path);
});

test('新 HTTP 服務不恢復舊題目或工作階段', async t => {
  const first = await fixture(t); const teacher = await first.login('teacher'); const student = await first.login();
  const q = await first.question(teacher);
  await first.request(`/api/student/questions/${q.id}/buzz`, { method: 'POST', cookie: student, body: { answer: '暫存' } });
  await first.close();
  const fresh = await fixture(t);
  assert.equal((await fresh.request('/api/teacher/questions', { cookie: teacher })).status, 401);
  assert.equal((await fresh.request('/api/student/questions', { cookie: student })).status, 401);
  const newTeacher = await fresh.login('teacher');
  assert.deepEqual((await fresh.request('/api/teacher/questions', { cookie: newTeacher })).data.questions, []);
});
