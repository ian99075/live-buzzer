import { api, element, message } from '../api.js';

export function exportPanel({ lock, refresh, failed }) {
  const $ = selector => document.querySelector(selector);
  const button = $('#export-button'), feedback = $('#export-message'), dialog = $('#export-dialog');
  let busy = false, remoteLock = false, generation = 0, preview = null, testMode = false;
  function render() {
    button.disabled = busy || remoteLock;
    button.textContent = busy || remoteLock ? '讀取中，請稍候…' : '彙整至 Google Sheet ↗';
    $('#confirm-export').disabled = busy || remoteLock || !preview?.items.length;
  }
  function renderList() {
    const list = $('#export-items'); list.replaceChildren();
    for (const plan of preview?.items || []) {
      const item = element('div', 'export-item');
      item.append(element('small', '', `題目 ${plan.key.replace('_', '-')} → ${plan.range}`),
        element('p', '', plan.clear ? '清空舊值' : plan.value)); list.append(item);
    }
    if (!list.children.length) list.append(element('p','muted','目前沒有可匯出的回答。'));
    $('#confirm-export').textContent = testMode ? '確認模擬匯出' : '確認匯出';
  }
  button.onclick = async () => {
    if (busy || remoteLock) return;
    preview = null; busy = true; lock(true); render(); message(feedback, '正在讀取 Google Sheet 現況…');
    try {
      preview = await api('/api/teacher/exports/google-sheet/preview');
      $('#sheet-target').textContent = `${preview.sheetName} · 請核對格位與內容`;
      renderList(); message(feedback); dialog.showModal();
    } catch (error) { message(feedback, error.message, true); failed(error); }
    finally { busy = false; lock(false); render(); }
  };
  $('#close-export').onclick = $('#cancel-export').onclick = () => dialog.close();
  $('#confirm-export').onclick = async () => {
    if (busy || remoteLock || !preview?.items.length) return;
    const current = generation, token = preview.token;
    dialog.close(); preview = null; busy = true; lock(true); render(); message(feedback,'正在寫入並讀回答案格…');
    try {
      const result = await api('/api/teacher/exports/google-sheet', { method: 'POST', body: { token } });
      if (current !== generation) return;
      message(feedback, `${result.testMode ? '模擬完成' : '已完成寫入'}：${result.writtenCount} 格，其中清空 ${result.clearedCount} 格。\n${result.ranges.join('、')}`);
    } catch (error) {
      if (current !== generation) return;
      message(feedback, error.status === 409 ? `${error.message} 請重新開啟匯出預覽。` : error.message, true);
      failed(error);
    } finally {
      if (current === generation) { busy = false; lock(false); render(); await refresh(); }
    }
  };
  return {
    update(value) { remoteLock = value.exporting; testMode = value.testMode; render(); },
    reset() { generation++; busy = false; remoteLock = false; preview = null; dialog.close();
      $('#export-items').replaceChildren(); message(feedback); lock(false); render(); },
  };
}
