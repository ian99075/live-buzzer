export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}
export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}), signal: AbortSignal.timeout(25000) });
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok) throw new ApiError(data.error || '操作未完成，請稍後再試。', response.status);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('連線中斷或回應逾時，尚未確認結果，請重試。');
  }
}
export function validText(value, max) { const length = [...value.trim()].length; return length > 0 && length <= max; }
export function message(element, value = '', error = false) { element.textContent = value; element.dataset.error = String(error); }
export function element(tag, className, text) {
  const el = document.createElement(tag); if (className) el.className = className;
  if (text !== undefined) el.textContent = text; return el;
}
export function connection(online, text) {
  const el = document.querySelector('#connection'); el.dataset.online = String(online); el.textContent = text;
}
