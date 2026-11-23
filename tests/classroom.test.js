import test from 'node:test';
import assert from 'node:assert/strict';
import { Classroom } from '../src/classroom.js';
import { fakeSheet } from './sheet-fixture.js';

const source = () => {
  const sheet = fakeSheet();
  for (const [key, questionCell, answerCell] of [
    ['1_1','C5','H5'], ['1_2','C6','H6'], ['1_3','C7','H7'], ['3','C11','G11']]) {
    sheet.put(questionCell, `題目 ${key}`, `$q_${key}$`);
    sheet.put(answerCell, `$a_${key}$`);
  }
  return sheet;
};

test('增量匯入更新草稿文字、保留秒數與進行中題，缺少鍵不自動刪除', () => {
  const sheet = source(), store = new Classroom();
  assert.equal(store.importQuestions(sheet.grid()).added, 4);
  const q1 = store.sourceIndex.get('1_1'), q2 = store.sourceIndex.get('1_2');
  const group = store.caseIndex.get(1);
  store.editGroupDuration(group.id, 95);
  sheet.put('C5', '改過的題目', '$q_1_1$');
  sheet.put('C6', '不得覆蓋進行中題', '$q_1_2$');
  sheet.put('C7', '原題目', '');
  assert.equal(store.importQuestions(sheet.grid()).updated, 2);
  assert.equal(q1.id, store.sourceIndex.get('1_1').id);
  assert.equal(group.durationSeconds, 95);
  assert.equal(q1.content, '改過的題目');
  assert.equal(q2.content, '不得覆蓋進行中題');
  store.groupStatus(group.id, 'open');
  sheet.put('C6', '進行中不可覆蓋', '$q_1_2$');
  store.importQuestions(sheet.grid());
  assert.equal(q2.content, '不得覆蓋進行中題');
  assert.deepEqual(store.all().map(q => [q.caseNumber, q.partNumber]), [[1,1],[1,2],[1,3],[3,null]]);
  store.close();
});

test('草稿可刪小題；開始後單刪遭拒且刪整組不改其他 Case', () => {
  const store = new Classroom(), sheet = source();
  store.importQuestions(sheet.grid());
  const group = store.caseIndex.get(1), later = store.sourceIndex.get('1_3'), single = store.sourceIndex.get('3');
  store.remove(store.sourceIndex.get('1_2').id);
  assert.equal(later.partNumber, 3);
  assert.equal(later.id, store.sourceIndex.get('1_3').id);
  store.registerStudent('001', 2); store.groupStatus(group.id, 'open');
  const deadline = group.deadlineAt;
  assert.equal(store.submitGroup(group.id, '001', { '1_1': '回答一', '1_3': '回答三' }, 2), true);
  assert.throws(() => store.remove(later.id), { status: 409 });
  assert.equal(group.deadlineAt, deadline);
  assert.equal(group.submissions.size, 1);
  store.removeGroup(store.caseIndex.get(1).id);
  assert.equal(single.caseNumber, 3);
  assert.equal(single.id, store.sourceIndex.get('3').id);
  store.close();
});

test('單題與題組衝突時匯入整批拒絕，課堂不部分變更', () => {
  const store = new Classroom(), sheet = source();
  store.importQuestions(sheet.grid());
  sheet.put('C11', '改為題組', '$q_3_1$');
  sheet.put('G11', '$a_3_1$');
  sheet.put('C12', '新題', '$q_4$'); sheet.put('G12', '$a_4$');
  assert.throws(() => store.importQuestions(sheet.grid()), { status: 409 });
  assert.equal(store.sourceIndex.has('4'), false);
  assert.equal(store.sourceIndex.get('3').content, '題目 3');
  store.close();
});
