// Firestore REST 用的服務帳號 token（零外部相依，node crypto 自簽 JWT）
// 與 project-hub/_lib/gauth.mjs、han-autoreply/api/_firestore.js 同一套做法。
// 金鑰來源：FIREBASE_SERVICE_ACCOUNT_JSON（整份 JSON 字串），退而求其次 GOOGLE_SERVICE_ACCOUNT_JSON。
import crypto from 'node:crypto';

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

let cached = null; // { token, exp }

export async function getFirestoreToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('missing FIREBASE_SERVICE_ACCOUNT_JSON');
  const sa = JSON.parse(raw);

  const now = Math.floor(Date.now() / 1000);
  const unsigned = [
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    },
  ].map((o) => b64url(JSON.stringify(o))).join('.');

  const signature = crypto.createSign('RSA-SHA256')
    .update(unsigned)
    .sign(String(sa.private_key || '').replace(/\n/g, '\n'));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(signature)}`,
    }),
  });
  if (!res.ok) throw new Error(`取 Firestore token 失敗：${res.status} ${await res.text()}`);

  const data = await res.json();
  cached = { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  return cached.token;
}

export async function firestoreHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${await getFirestoreToken()}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}
