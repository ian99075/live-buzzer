const submission = s => ({ studentNumber: s.studentNumber, answer: s.answer });
export function teacherQuestion(q) {
  return { id: q.id, caseNumber: q.caseNumber, content: q.content, status: q.status,
    submissions: [...q.submissions.values()].map(submission),
    winner: q.winnerKey === null ? null : submission(q.submissions.get(q.winnerKey)) };
}
export function teacherSnapshot(store, config) {
  return { questions: store.all().map(teacherQuestion), exporting: store.exporting,
    sheetName: config.sheetName, testMode: config.testMode === true };
}
export function studentSnapshot(store, studentNumber) {
  return { studentNumber, questions: store.all().filter(q => q.status === 'open').map(q => ({
    id: q.id, caseNumber: q.caseNumber, content: q.content, submitted: q.submissions.has(studentNumber),
  })) };
}
