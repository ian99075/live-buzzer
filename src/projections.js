const identity = s => ({ id: s.id, studentNumber: s.studentNumber, groupNumber: s.groupNumber,
  ...(s.answers ? { answers: { ...s.answers } } : { answer: s.answer }) });

function competitionProjection(entity, store) {
  const ranking = store.ranking(entity), ranked = new Map(ranking.map(entry => [entry.id, entry]));
  const submissions = [...entity.submissions.values()].map(s => {
    const entry = ranked.get(s.id), frozen = entity.finalRanking?.find(item => item.id === s.id);
    return { ...identity(s), acceptedAt: s.acceptedAt, acceptedOrder: s.acceptedOrder,
      priorWinCount: entry?.priorWinCount ?? frozen?.priorWinCount ?? store.priorWins(s.groupNumber, entity.id),
      rank: entry?.rank ?? null, disqualified: s.disqualified };
  });
  const first = ranking[0] ? store.submissionById(entity, ranking[0].id) : null;
  return { durationSeconds: entity.durationSeconds, status: entity.status,
    deadlineAt: entity.status === 'open' ? entity.deadlineAt : null,
    remainingMs: ['paused', 'draft'].includes(entity.status) ? entity.remainingMs : entity.status === 'settled' ? 0 : null,
    submissions, provisionalLeader: entity.status === 'settled' || !first ? null : identity(first),
    winner: entity.status !== 'settled' || entity.winnerKey === null ? null : identity(entity.submissions.get(entity.winnerKey)) };
}

export function teacherQuestion(q, store) {
  const result = competitionProjection(q, store);
  return { id: q.id, kind: 'single', caseNumber: q.caseNumber, partNumber: null,
    groupId: null, groupTitle: null, content: q.content, sourceKey: q.sourceKey ?? null,
    ...result, clearPending: q.status === 'settled' && q.confirmedExport && q.winnerKey === null };
}

export function teacherGroup(group, store) {
  const parts = group.questionIds.map(id => store.get(id));
  return { id: group.id, groupId: group.id, kind: 'group', caseNumber: group.caseNumber,
    groupTitle: group.title, title: group.title,
    parts: parts.map(part => ({ id: part.id, sourceKey: part.sourceKey, partNumber: part.partNumber, content: part.content })),
    ...competitionProjection(group, store),
    clearPending: parts.some(part => part.confirmedExport) && group.winnerKey === null };
}

export function teacherSnapshot(store, config) {
  return { serverNow: store.wallClock(), questions: store.competitions().map(entity =>
    entity.kind === 'group' ? teacherGroup(entity, store) : teacherQuestion(entity, store)),
    exporting: store.exporting, sheetName: config.sheetName, testMode: config.testMode === true };
}

function studentCompetition(entity, studentNumber) {
  return { status: entity.status,
    deadlineAt: entity.status === 'open' ? entity.deadlineAt : null,
    remainingMs: entity.status === 'paused' ? entity.remainingMs : entity.status === 'settled' ? 0 : null,
    submitted: entity.submissions.has(studentNumber),
    ...(entity.status === 'settled' ? { firstPlace: entity.winnerKey === null ? null : {
      studentNumber: entity.submissions.get(entity.winnerKey).studentNumber,
      groupNumber: entity.submissions.get(entity.winnerKey).groupNumber,
    } } : {}) };
}

export function studentSnapshot(store, studentNumber, groupNumber) {
  return { studentNumber, groupNumber, serverNow: store.wallClock(),
    questions: store.competitions().filter(entity => entity.status !== 'draft').map(entity =>
      entity.kind === 'group' ? {
        id: entity.id, groupId: entity.id, kind: 'group', caseNumber: entity.caseNumber, groupTitle: entity.title,
        parts: entity.questionIds.map(id => { const part = store.get(id); return {
          id: part.id, sourceKey: part.sourceKey, partNumber: part.partNumber, content: part.content }; }),
        ...studentCompetition(entity, studentNumber),
      } : { id: entity.id, kind: 'single', caseNumber: entity.caseNumber,
        partNumber: null, groupTitle: null, content: entity.content,
        ...studentCompetition(entity, studentNumber) }) };
}
