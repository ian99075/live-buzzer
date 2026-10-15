// 舊課堂測試的每位學生預設屬於不同組；新組別測試可明確傳入相同編號。
const groupsByStore = new WeakMap();

export function submit(store, questionId, studentNumber, answer, explicitGroup) {
  let groups = groupsByStore.get(store);
  if (!groups) { groups = new Map(); groupsByStore.set(store, groups); }
  let groupNumber = explicitGroup ?? groups.get(studentNumber);
  if (groupNumber === undefined) { groupNumber = groups.size + 1; groups.set(studentNumber, groupNumber); }
  else if (!groups.has(studentNumber)) groups.set(studentNumber, groupNumber);
  store.registerStudent(studentNumber, groupNumber);
  return store.submit(questionId, studentNumber, answer, groupNumber);
}
