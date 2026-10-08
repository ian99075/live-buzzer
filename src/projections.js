const identity = s => ({ id: s.id, studentNumber: s.studentNumber, answer: s.answer });
export function teacherQuestion(q, store) {
  const ranking = store.ranking(q), ranked = new Map(ranking.map(entry => [entry.id, entry]));
  const submissions = [...q.submissions.values()].map(s => {
    const entry = ranked.get(s.id), frozen = q.finalRanking?.find(item => item.id === s.id);
    return { ...identity(s), acceptedAt: s.acceptedAt, acceptedOrder: s.acceptedOrder,
      priorWinCount: entry?.priorWinCount ?? frozen?.priorWinCount ?? store.priorWins(s.studentNumber, q.id),
      rank: entry?.rank ?? null, disqualified: s.disqualified };
  });
  const first = ranking[0] ? store.submissionById(q, ranking[0].id) : null;
  return { id: q.id, caseNumber: q.caseNumber, content: q.content, durationSeconds: q.durationSeconds,
    status: q.status, deadlineAt: q.status === 'open' ? q.deadlineAt : null,
    remainingMs: q.status === 'paused' || q.status === 'draft' ? q.remainingMs : q.status === 'settled' ? 0 : null,
    submissions, provisionalLeader: q.status === 'settled' || !first ? null : identity(first),
    winner: q.status !== 'settled' || q.winnerKey === null ? null : identity(q.submissions.get(q.winnerKey)),
    clearPending: q.status === 'settled' && q.confirmedExport && q.winnerKey === null };
}
export function teacherSnapshot(store, config) {
  return { serverNow: store.wallClock(), questions: store.all().map(q => teacherQuestion(q, store)),
    exporting: store.exporting, sheetName: config.sheetName, testMode: config.testMode === true };
}
export function studentSnapshot(store, studentNumber) {
  return { studentNumber, serverNow: store.wallClock(),
    questions: store.all().filter(q => q.status === 'open' || q.status === 'paused').map(q => ({
    id: q.id, caseNumber: q.caseNumber, content: q.content, status: q.status,
    deadlineAt: q.status === 'open' ? q.deadlineAt : null,
    remainingMs: q.status === 'paused' ? q.remainingMs : null,
    submitted: q.submissions.has(studentNumber),
  })) };
}
