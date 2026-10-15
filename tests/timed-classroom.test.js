import test from 'node:test';
import assert from 'node:assert/strict';
import { Classroom } from '../src/classroom.js';
import { submit } from './grouped-submit.js';

function classroom() {
  let now = 0; const scheduled = new Map(); let next = 0;
  const store = new Classroom({ clock: () => now, wallClock: () => 1_700_000_000_000 + now,
    schedule: (callback, delay) => { const id = ++next; scheduled.set(id, { callback, at: now + delay }); return id; },
    cancel: id => scheduled.delete(id) });
  return { store, advance(ms, runTimers = true) {
    now += ms;
    if (runTimers) {
      for (const [id, timer] of [...scheduled].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= now && scheduled.has(id)) { scheduled.delete(id); timer.callback(); }
      }
    }
  }, fireEarly() { const [id, timer] = scheduled.entries().next().value;
    scheduled.delete(id); timer.callback(); }, pending: () => scheduled.size };
}

test('倒數設定、暫停／繼續及結算後不可重開', () => {
  const time = classroom(), s = time.store;
  const q = s.add('題目'); assert.equal(q.durationSeconds, 60);
  assert.throws(() => s.add('題目', 0), { status: 400 });
  assert.throws(() => s.add('題目', 3601), { status: 400 });
  s.edit(q.id, '新題目', 1); assert.equal(q.remainingMs, 1000);
  s.status(q.id, 'open'); assert.equal(q.status, 'open');
  assert.throws(() => s.edit(q.id, '修改', 2), { status: 409 });
  time.advance(200); s.status(q.id, 'paused'); assert.equal(q.remainingMs, 800);
  assert.equal(submit(s, q.id, '001', '暫停時'), false);
  time.advance(5000); assert.equal(q.remainingMs, 800);
  s.status(q.id, 'open'); time.advance(799); assert.equal(q.status, 'open');
  time.advance(1); assert.equal(q.status, 'settled');
  assert.throws(() => s.status(q.id, 'open'), { status: 409 });
  assert.throws(() => s.status(q.id, 'paused'), { status: 409 });
  s.close(); assert.equal(time.pending(), 0);
});

test('提交路徑同步判定截止，晚醒仍只結算一次', () => {
  const time = classroom(), s = time.store; let notifications = 0;
  s.setOnChange(() => notifications++);
  const q = s.add('第一題', 1); s.status(q.id, 'open');
  time.advance(999, false); assert.equal(submit(s, q.id, '001', '準時'), true);
  time.advance(1, false); assert.equal(submit(s, q.id, '002', '逾時'), false);
  assert.equal(q.status, 'settled'); assert.equal(q.winnerKey, '001');
  assert.equal(notifications, 1); assert.equal(time.pending(), 0);
});

test('排程略早醒時會重新安排，不會使題目永遠保持開放', () => {
  const time = classroom(), s = time.store;
  const q = s.add('題目', 1); s.status(q.id, 'open');
  time.advance(999, false);
  // 模擬排程器於截止前喚醒；重新排程後抵達截止點仍應結算。
  time.fireEarly(); assert.equal(q.status, 'open'); assert.equal(time.pending(), 1);
  time.advance(1); assert.equal(q.status, 'settled');
});

test('同時到期依 Case 號結算，後題優先權計入前題得標', () => {
  const time = classroom(), s = time.store;
  const a = s.add('第一題', 1), b = s.add('第二題', 1);
  s.status(a.id, 'open'); s.status(b.id, 'open');
  submit(s, a.id, '甲', '答1'); submit(s, b.id, '甲', '答2'); submit(s, b.id, '乙', '答3');
  time.advance(1000, false); assert.equal(s.settleDue(), 2);
  assert.equal(a.winnerKey, '甲'); assert.equal(b.winnerKey, '乙');
  assert.equal(s.settleDue(), 0); assert.equal(s.ranking(b)[0].priorWinCount, 0);
});

test('刪除開放題目會撤銷其倒數，其餘開放題仍可作答及到期', () => {
  const time = classroom(), s = time.store;
  const a = s.add('待刪除', 1), b = s.add('保留', 1);
  s.status(a.id, 'open'); s.status(b.id, 'open');
  s.remove(a.id);
  assert.equal(time.pending(), 1);
  assert.equal(b.caseNumber, 1);
  assert.equal(submit(s, a.id, '001', '舊題答案'), false);
  assert.equal(submit(s, b.id, '001', '保留題答案'), true);
  time.advance(1000); assert.equal(b.status, 'settled'); assert.equal(b.winnerKey, '001');
});

test('開放期間按其他題有效得標次數即時重排，結算後固定且失格遞補', () => {
  const time = classroom(), s = time.store;
  const a = s.add('一'), b = s.add('二'), target = s.add('目標');
  for (const q of [a, b, target]) s.status(q.id, 'open');
  submit(s, target.id, '甲', '甲答'); submit(s, target.id, '乙', '乙答'); submit(s, target.id, '丙', '丙答');
  assert.deepEqual(s.ranking(target).map(x => x.rank), [1, 2, 3]);
  submit(s, a.id, '甲', '先前一'); s.status(a.id, 'settled');
  assert.deepEqual(s.ranking(target).map(x => [...target.submissions.values()].find(v => v.id === x.id).studentNumber), ['乙', '丙', '甲']);
  submit(s, b.id, '乙', '先前二'); s.status(b.id, 'settled');
  assert.deepEqual(s.ranking(target).map(x => [...target.submissions.values()].find(v => v.id === x.id).studentNumber), ['丙', '甲', '乙']);
  s.status(target.id, 'settled'); assert.equal(target.winnerKey, '丙');
  s.disqualify(a.id, a.submissions.get('甲').id);
  assert.deepEqual(s.ranking(target).map(x => [...target.submissions.values()].find(v => v.id === x.id).studentNumber), ['丙', '甲', '乙']);
  s.disqualify(target.id, target.submissions.get('丙').id); assert.equal(target.winnerKey, '甲');
  s.disqualify(target.id, target.submissions.get('甲').id); assert.equal(target.winnerKey, '乙');
  s.disqualify(target.id, target.submissions.get('乙').id); assert.equal(target.winnerKey, null);
  assert.equal(submit(s, target.id, '丙', '重答'), false);
  assert.equal(target.submissions.size, 3);
});

test('已結算題目的得標者失格後，其他開放題立即重新計算優先權', () => {
  const s = classroom().store;
  const previous = s.add('前題'), current = s.add('開放題');
  s.status(previous.id, 'open'); s.status(current.id, 'open');
  submit(s, previous.id, '甲', '甲先前回答'); s.status(previous.id, 'settled');
  submit(s, current.id, '甲', '甲目前回答'); submit(s, current.id, '乙', '乙目前回答');
  assert.equal(s.submissionById(current, s.ranking(current)[0].id).studentNumber, '乙');
  s.disqualify(previous.id, previous.submissions.get('甲').id);
  assert.equal(s.submissionById(current, s.ranking(current)[0].id).studentNumber, '甲');
  assert.equal(current.status, 'open');
  s.close();
});

test('開放中的單題轉為 1-1 保留 ID、計時、回答，已匯出題也可轉換', () => {
  const time = classroom(), s = time.store;
  const q = s.add('原題', 30); s.status(q.id, 'open');
  submit(s, q.id, '甲', '答案'); time.advance(3000, false);
  const deadline = q.deadlineMono, submission = q.submissions.get('甲');
  const group = s.convertToGroup(q.id, '題組標題');
  assert.equal(group.title, '題組標題'); assert.equal(q.partNumber, 1);
  assert.equal(q.deadlineMono, deadline); assert.equal(q.submissions.get('甲'), submission);
  assert.equal(s.get(q.id), q); assert.equal(s.addPart(group.id, '新題').partNumber, 2);
  assert.equal(submit(s, q.id, '乙', '後續答案'), true);
  s.status(q.id, 'settled'); q.confirmedExport = true;
  assert.equal(q.winnerKey, '甲'); assert.equal(q.confirmedExport, true);
  assert.throws(() => s.convertToGroup(q.id, '再轉'), { status: 409 });
  const settled = s.add('已結算'); s.status(settled.id, 'open');
  submit(s, settled.id, '丙', '答'); s.status(settled.id, 'settled'); settled.confirmedExport = true;
  s.convertToGroup(settled.id, '第二組');
  assert.equal(settled.partNumber, 1); assert.equal(settled.winnerKey, '丙');
  assert.equal(settled.confirmedExport, true); s.close();
});

test('同組小題按結算得標次數即時重排，同時到期依小題序號裁決', () => {
  const time = classroom(), s = time.store;
  const { id: groupId, questions: [first, second] } = s.addGroup('題組', [
    { content: '1-1', durationSeconds: 1 }, { content: '1-2', durationSeconds: 1 },
  ]);
  s.status(first.id, 'open'); s.status(second.id, 'open');
  submit(s, first.id, '甲', '第一答');
  submit(s, second.id, '甲', '第二答'); submit(s, second.id, '乙', '後答');
  assert.equal(s.submissionById(second, s.ranking(second)[0].id).studentNumber, '甲');
  time.advance(1000, false); assert.equal(s.settleDue(), 2);
  assert.equal(first.winnerKey, '甲'); assert.equal(second.winnerKey, '乙');
  const third = s.addPart(groupId, '1-3'); s.status(third.id, 'open');
  submit(s, third.id, '甲', '第三答'); submit(s, third.id, '丙', '另一答');
  assert.equal(s.submissionById(third, s.ranking(third)[0].id).studentNumber, '丙');
  s.disqualify(first.id, first.submissions.get('甲').id);
  assert.equal(s.submissionById(third, s.ranking(third)[0].id).studentNumber, '甲');
  s.close();
});
