// Realtime Database-ə REST ilə çıxış. FIREBASE_SERVICE_ACCOUNT təyin olunubsa
// sorğular service account tokeni ilə gedir (rules bağlı olanda da işləyir);
// təyin olunmayıbsa tokensiz gedir və yalnız rules açıq olduqda işləyir.

const crypto = require('crypto');

const DB_URL = (process.env.FIREBASE_DB_URL ||
  'https://kurs-portali-default-rtdb.europe-west1.firebasedatabase.app').replace(/\/+$/, '');

const SCOPES = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database';

let cachedToken = null;

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

async function accessToken() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  if (cachedToken && cachedToken.expires > Date.now() + 60000) return cachedToken.value;

  const account = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64url(JSON.stringify({
      iss: account.client_email,
      scope: SCOPES,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }));
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + signature,
    }),
  });
  if (!res.ok) throw new Error('Service account tokeni alınmadı: ' + res.status);
  const data = await res.json();
  cachedToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function request(method, path, body) {
  const token = await accessToken();
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${DB_URL}/${path}.json`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DB ${method} ${path}: ${res.status}`);
  return res.json();
}

module.exports = {
  get: (path) => request('GET', path),
  set: (path, value) => request('PUT', path, value),
  update: (path, value) => request('PATCH', path, value),
  push: async (path, value) => (await request('POST', path, value)).name,
  remove: (path) => request('DELETE', path),
};
