import { teacherSnapshot, studentSnapshot } from './projections.js';

export class Events {
  constructor(store, sessions, config, interval = 15000) {
    Object.assign(this, { store, sessions, config }); this.clients = new Set();
    this.timer = setInterval(() => this.heartbeat(), interval); this.timer.unref();
  }
  attach(req, res, role, auth) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    res.write('retry: 1500\n\n');
    const client = { res, role, ...auth, last: '' };
    this.clients.add(client);
    res.on('drain', () => { client.blocked = false; if (client.dirty) { client.dirty = false; this.send(client); } });
    res.on('close', () => this.clients.delete(client));
    res.on('error', () => { this.clients.delete(client); res.destroy(); });
    this.send(client);
  }
  valid(c) {
    if (this.sessions.find(c.token, c.role)) return true;
    c.res.end('event: auth-required\ndata: {}\n\n'); this.clients.delete(c); return false;
  }
  write(c, data) {
    try {
      if (c.res.destroyed) { this.clients.delete(c); return; }
      if (c.blocked) return;
      c.blocked = !c.res.write(data);
    } catch { c.res.destroy(); this.clients.delete(c); }
  }
  send(c) {
    if (!this.valid(c)) return;
    if (c.blocked) { c.dirty = true; return; }
    const data = JSON.stringify(c.role === 'teacher' ? teacherSnapshot(this.store, this.config)
      : studentSnapshot(this.store, c.session.studentNumber));
    if (data === c.last) return;
    c.last = data; this.write(c, `event: snapshot\ndata: ${data}\n\n`);
  }
  publish(studentNumber = null) {
    for (const c of this.clients) {
      if (studentNumber === null || c.role === 'teacher' || c.session.studentNumber === studentNumber) this.send(c);
    }
  }
  teachers() { for (const c of this.clients) if (c.role === 'teacher') this.send(c); }
  heartbeat() {
    this.sessions.prune();
    for (const c of this.clients) if (this.valid(c)) this.write(c, ': heartbeat\n\n');
  }
  close() { clearInterval(this.timer); for (const c of this.clients) c.res.end(); this.clients.clear(); }
}
