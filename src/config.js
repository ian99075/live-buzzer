export function readConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT 必須為有效連接埠。');
  if (!env.TEACHER_USERNAME?.trim() || !env.TEACHER_PASSWORD) {
    throw new Error('請先在 .env 設定 TEACHER_USERNAME 與 TEACHER_PASSWORD。');
  }
  const origin = new URL(env.APP_ORIGIN || `http://localhost:${port}`);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error('APP_ORIGIN 必須為 HTTP 或 HTTPS 網址。');
  }
  return {
    port, host: env.HOST || '127.0.0.1', origin: origin.origin,
    teacherUsername: env.TEACHER_USERNAME.trim(), teacherPassword: env.TEACHER_PASSWORD,
    secureCookie: env.COOKIE_SECURE === 'true', sessionMs: 12 * 60 * 60 * 1000,
    sheetId: env.GOOGLE_SHEET_ID || '1X7YNIcyvPMsbUnTuBdJ5lwmkZmIHj2-wO-S7CdpEwo0', sheetName: env.GOOGLE_SHEET_NAME || '學習單',
    credentialFile: env.GOOGLE_APPLICATION_CREDENTIALS || '', googleTimeoutMs: 15000,
  };
}
