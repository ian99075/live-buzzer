import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

const digest = value => createHash('sha256').update(value).digest();
const hash = value => digest(value).toString('hex');
export class Sessions {
  constructor(config, now = Date.now) { this.config = config; this.now = now; this.entries = new Map(); }
  teacher(username, password) {
    const userOK = timingSafeEqual(digest(username), digest(this.config.teacherUsername));
    const passOK = timingSafeEqual(digest(password), digest(this.config.teacherPassword));
    if (!userOK || !passOK) throw new HttpError(401, '帳號或密碼不正確。');
  }
  create(role, identity) {
    this.prune();
    const token = randomBytes(32).toString('hex');
    this.entries.set(hash(token), { role, ...identity, expiresAt: this.now() + this.config.sessionMs });
    return token;
  }
  cookie(role, token) {
    return `${role}_session=${token}; Path=/; HttpOnly; SameSite=Strict${this.config.secureCookie ? '; Secure' : ''}`;
  }
  clearCookie(role) {
    return `${role}_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${this.config.secureCookie ? '; Secure' : ''}`;
  }
  revoke(token) { this.entries.delete(hash(token)); }
  find(token, role) {
    if (!token) return null;
    const key = hash(token); const session = this.entries.get(key);
    if (session && session.expiresAt <= this.now()) this.entries.delete(key);
    return session?.role === role && session.expiresAt > this.now() ? session : null;
  }
  require(req, role) {
    const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${role}_session=`));
    const token = cookie?.slice(cookie.indexOf('=') + 1);
    const session = this.find(token, role);
    if (!session) throw new HttpError(401, '登入已失效，請重新登入。');
    return { token, session };
  }
  prune() { for (const [key, s] of this.entries) if (s.expiresAt <= this.now()) this.entries.delete(key); }
}
