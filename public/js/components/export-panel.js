import { api, element, message } from '../api.js';

export function exportPanel({ lock, refresh, failed }) {
  const $ = selector => document.querySelector(selector);
  const button = $('#export-button'), feedback = $('#export-message'), dialog = $('#export-dialog');
  let busy = false, remoteLock = false, generation = 0, snapshot = { questions: [] };
  function render() {
    button.disabled = busy || remoteLock;
    button.textContent = busy || remoteLock ? '彙整中，請稍候…' : '彙整至 Google Sheet ↗';
    $('#confirm-export').disabled = busy || remoteLock || !snapshot.questions.some(q => q.winner);
  }
  function renderList() {
    const list = $('#export-items'); list.replaceChildren();
    for (const q of snapshot.questions.filter(q => q.winner)) {
      const item = element('div', 'export-item');
      item.append(element('small', '', `CASE ${q.caseNumber} → ${snapshot.sheetName}!C${18+q.caseNumber}`),
        element('p', '', `${q.winner.answer}_${q.winner.studentNumber}`)); list.append(item);
    }
    if (!list.children.length) list.append(element('p','muted','目前沒有可匯出的回答。'));
    $('#confirm-export').textContent = snapshot.testMode ? '確認模擬匯出' : '確認匯出';
  }
  button.onclick = () => {
    if (busy || remoteLock) return;
    if (!snapshot.questions.some(q => q.winner)) { message(feedback,'目前沒有可匯出的回答，未寫入任何儲存格。'); return; }
    renderList(); render(); dialog.showModal();
  };
  $('#close-export').onclick = $('#cancel-export').onclick = () => dialog.close();
  $('#confirm-export').onclick = async () => {
    if (busy || remoteLock || !snapshot.questions.some(q => q.winner)) return;
    const current = generation;
    dialog.close(); busy = true; lock(true); render(); message(feedback,'正在彙整目前各題第一名…');
    try {
      const result = await api('/api/teacher/exports/google-sheet', { method: 'POST' });
      if (current !== generation) return;
      message(feedback, result.writtenCount === 0 ? '目前沒有可匯出的回答，未寫入任何儲存格。'
        : `${result.testMode ? '模擬完成（未寫入 Google）' : '已完成寫入'}：${result.writtenCount} 格。\n${result.ranges.join('、')}`);
    } catch (error) {
      if (current !== generation) return;
      message(feedback,error.message,true); failed(error);
    } finally {
      if (current === generation) { busy = false; lock(false); render(); await refresh(); }
    }
  };
  return {
    update(value) {
      snapshot = value; remoteLock = value.exporting;
      $('#sheet-target').textContent = `${value.sheetName} · C19–C24 · Case 1–6${value.testMode ? ' · 模擬匯出，不會寫入 Google' : ''}`;
      if (dialog.open) renderList(); render();
    },
    reset() {
      generation++; busy = false; remoteLock = false; snapshot = {questions:[]};
      dialog.close(); $('#export-items').replaceChildren(); message(feedback); lock(false); render();
    },
  };
}
