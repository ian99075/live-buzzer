import { api } from './api.js';

export function connectEvents(role, { snapshot, status, expired }) {
  const source = new EventSource(`/api/${role}/events`);
  let closed = false, checking = false;
  function expire() { if (closed) return; stop(); expired(); }
  function stop() { closed = true; source.close(); }
  source.addEventListener('snapshot', event => {
    if (closed) return;
    snapshot(JSON.parse(event.data)); status(true);
  });
  source.addEventListener('auth-required', expire);
  source.onerror = async () => {
    if (closed) return;
    status(false);
    if (checking) return;
    checking = true;
    try { await api(`/api/${role}/questions`); }
    catch (error) { if (error.status === 401) expire(); }
    finally { checking = false; }
  };
  return stop;
}
