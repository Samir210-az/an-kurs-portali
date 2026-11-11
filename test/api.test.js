// Yerli yoxlama: node --test
// Realtime Database-in REST interfeysi yaddaşda təqlid olunur.

const http = require('http');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const store = {
  courses: {
    c13: { name: 'Kurs 13', url: 'https://samir210-az.github.io/kurs_13/' },
    ckq: { name: 'Koqnitiv', url: 'https://samir210-az.github.io/koqnitiv_kurs/' },
  },
  customers: {
    994501112233: { name: 'Test', phone: '+994 50 111 22 33', passwordHash: sha('parol123'), allowedCourses: ['c13'], devices: [] },
  },
};

function locate(parts) {
  let node = store;
  for (const p of parts.slice(0, -1)) node = node[p] = node[p] && typeof node[p] === 'object' ? node[p] : {};
  return [node, parts[parts.length - 1]];
}

let lastDbUrl = '';
const dbServer = http.createServer((req, res) => {
  lastDbUrl = req.url;
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const parts = req.url.replace(/\.json.*$/, '').split('/').filter(Boolean);
    const [parent, key] = locate(parts);
    const value = raw ? JSON.parse(raw) : undefined;
    let out = null;
    if (req.method === 'GET') out = parent[key] === undefined ? null : parent[key];
    if (req.method === 'PUT') out = parent[key] = value;
    if (req.method === 'DELETE') delete parent[key];
    if (req.method === 'PATCH') {
      parent[key] = parent[key] && typeof parent[key] === 'object' ? parent[key] : {};
      for (const [k, v] of Object.entries(value)) v === null ? delete parent[key][k] : (parent[key][k] = v);
      out = value;
    }
    if (req.method === 'POST') {
      const name = '-N' + crypto.randomBytes(6).toString('hex');
      parent[key] = parent[key] || {};
      parent[key][name] = value;
      out = { name };
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(out));
  });
});

let handlers;
test.before(async () => {
  await new Promise((r) => dbServer.listen(0, r));
  process.env.FIREBASE_DB_URL = 'http://127.0.0.1:' + dbServer.address().port;
  process.env.ADMIN_PIN_HASH = sha('sinaq-pin');
  handlers = {
    login: require('../api/login'), session: require('../api/session'), admin: require('../api/admin'),
    content: require('../api/content'), courses: require('../api/courses'), register: require('../api/register'),
  };
});
test.after(() => dbServer.close());

async function call(name, { method = 'GET', body, cookie, query = {}, url = '/', origin } = {}) {
  const headers = { host: 'kurs.test', cookie: cookie || '' };
  if (origin) headers.origin = origin;
  const out = { status: 200, headers: {}, body: undefined };
  const res = {
    set statusCode(v) { out.status = v; },
    setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; },
    getHeader: (k) => out.headers[k.toLowerCase()],
    status(c) { out.status = c; return res; },
    json(v) { out.body = v; return res; },
    send(v) { out.body = v; return res; },
    end() { return res; },
  };
  await handlers[name]({ method, headers, body, query, url }, res);
  const set = [].concat(out.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  return { ...out, cookie: set };
}

const DEVICE = 'fp_abc123';
const login = (extra) => call('login', { method: 'POST', body: { phone: '+994 50 111 22 33', password: 'parol123', device: DEVICE, ...extra } });

test('slug siyahısı content/ qovluğu ilə üst-üstə düşür', () => {
  const dirs = require('fs').readdirSync(require('path').join(__dirname, '..', 'content')).sort();
  assert.deepEqual(require('../api/_lib/slugs.json'), dirs);
});

test('açıq kurs siyahısında link yoxdur', async () => {
  const r = await call('courses');
  assert.equal(r.body.courses.length, 2);
  assert.ok(!JSON.stringify(r.body).includes('github.io'));
});

test('kurs siyahısı dilə görə tərcümə olunur, bilinməyən dil AZ qalır', async () => {
  const id = '-P-ds6F0meXtLO-Ow7At';
  store.courses[id] = { name: 'CBT Kursu (Koqnitiv Davranış Terapiyası)', url: 'https://x.test/' };
  await require('../api/_lib/core').getCourses(true);
  const tr = await call('courses', { query: { lang: 'tr' } });
  assert.equal(tr.body.courses.find((c) => c.id === id).name, 'BDT Kursu (Bilişsel Davranışçı Terapi)');
  const ru = await call('courses', { query: { lang: 'ru' } });
  assert.match(ru.body.courses.find((c) => c.id === id).audience, /психолог/);
  const xx = await call('courses', { query: { lang: 'xx' } });
  assert.equal(xx.body.courses.find((c) => c.id === id).name, 'CBT Kursu (Koqnitiv Davranış Terapiyası)');
  const tr2 = await call('courses', { query: { lang: 'tr' } });
  assert.equal(tr2.body.courses.find((c) => c.id === 'c13').name, 'Kurs 13');
  delete store.courses[id];
  await require('../api/_lib/core').getCourses(true);
});

test('giriş edən müştərinin kurs linki seçilmiş dilin səhifəsinə aparır', async () => {
  const az = await login({ acceptTerms: true });
  assert.equal(az.body.courses[0].href, '/kurs/kurs_13/');
  const r = await call('login', { method: 'POST', query: { lang: 'tr' }, body: { phone: '+994 50 111 22 33', password: 'parol123', device: DEVICE, acceptTerms: true } });
  assert.equal(r.body.courses[0].href, '/kurs/kurs_13/tr/index.html');
  const s = await call('session', { cookie: r.cookie, query: { lang: 'ru' } });
  assert.equal(s.body.courses[0].href, '/kurs/kurs_13/ru/index.html');
  const c = store.customers['994501112233'];
  delete c.termsAccepted; delete c.termsAcceptedAt; c.devices = [];
  for (const k of Object.keys(store.sessions || {})) delete store.sessions[k];
});

test('sessiyasız məzmun verilmir', async () => {
  const r = await call('content', { query: { slug: 'kurs_13', p: 'index.html' }, url: '/kurs/kurs_13/index.html' });
  assert.equal(r.status, 302);
  assert.equal(r.body, undefined);
});

test('yanlış parol rədd edilir', async () => {
  const r = await login({ password: 'sehv' });
  assert.equal(r.status, 401);
  assert.equal(r.cookie, '');
});

test('giriş: şərtlər, sessiya, yalnız icazəli kurs', async () => {
  let r = await login();
  assert.deepEqual(r.body, { needTerms: true });
  assert.equal(r.cookie, '');

  r = await login({ acceptTerms: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.courses, [{ name: 'Kurs 13', slug: 'kurs_13', href: '/kurs/kurs_13/' }]);
  assert.match(r.headers['set-cookie'][0], /HttpOnly; Secure; SameSite=Lax/);
  const cookie = r.cookie;

  r = await call('session', { cookie });
  assert.equal(r.body.loggedIn, true);

  r = await call('content', { cookie, query: { slug: 'kurs_13' }, url: '/kurs/kurs_13' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, '/kurs/kurs_13/index.html');

  r = await call('content', { cookie, query: { slug: 'kurs_13', p: 'index.html' }, url: '/kurs/kurs_13/index.html' });
  assert.equal(r.status, 200);
  assert.match(r.body.toString(), /© 994501112233<\/div>.*>Çıxış<\/button>.*<\/script><\/body>/);

  r = await call('content', { cookie, query: { slug: 'kurs_13', p: ['en', '01-aqressiv-usaqlarla-is.html'] }, url: '/kurs/kurs_13/en/01-aqressiv-usaqlarla-is.html' });
  assert.equal(r.status, 200);
  assert.match(r.body.toString(), />Log out<\/button>/);

  r = await call('content', { cookie, query: { slug: 'kurs_13', p: 'styles.css' }, url: '/kurs/kurs_13/styles.css' });
  assert.equal(r.headers['content-type'], 'text/css; charset=utf-8');

  // Başqa kurs və qovluqdan çıxma cəhdləri
  r = await call('content', { cookie, query: { slug: 'koqnitiv_kurs', p: 'index.html' }, url: '/kurs/koqnitiv_kurs/index.html' });
  assert.equal(r.status, 302);
  r = await call('content', { cookie, query: { slug: 'kurs_13', p: '../koqnitiv_kurs/index.html' }, url: '/kurs/kurs_13/x' });
  assert.equal(r.status, 404);
  r = await call('content', { cookie, query: { slug: '..', p: 'api/login.js' }, url: '/kurs/../x' });
  assert.equal(r.status, 404);

  // İcazə geri alınanda açıq sessiya da bağlanır
  store.customers['994501112233'].allowedCourses = ['ckq'];
  r = await call('content', { cookie, query: { slug: 'kurs_13', p: 'index.html' }, url: '/kurs/kurs_13/index.html' });
  assert.equal(r.status, 302);
  store.customers['994501112233'].allowedCourses = ['c13'];

  r = await call('session', { method: 'DELETE', cookie });
  r = await call('content', { cookie, query: { slug: 'kurs_13', p: 'index.html' }, url: '/kurs/kurs_13/index.html' });
  assert.equal(r.status, 302);
});

test('üçüncü cihaz rədd edilir', async () => {
  store.customers['994501112233'].devices = [{ fp: 'fp_1' }, { fp: 'fp_2' }];
  const r = await login();
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'devices');
  assert.equal(Object.keys(store.securityAlerts).length, 1);
  store.customers['994501112233'].devices = [];
});

test('başqa saytdan gələn POST rədd edilir', async () => {
  const r = await call('login', { method: 'POST', origin: 'https://evil.example', body: { phone: '1', password: '1', device: DEVICE } });
  assert.equal(r.status, 405);
});

test('admin: PIN-siz əməliyyat yoxdur, PIN ilə işləyir', async () => {
  let r = await call('admin', { method: 'POST', body: { action: 'load' } });
  assert.equal(r.status, 401);
  r = await call('admin', { method: 'POST', body: { action: 'login', pin: '0000' } });
  assert.equal(r.status, 401);

  r = await call('admin', { method: 'POST', body: { action: 'login', pin: 'sinaq-pin' } });
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(r.body).includes('passwordHash'));
  const cookie = r.cookie;

  assert.equal(r.body.links.c13, '/kurs/kurs_13/');
  r = await call('content', { cookie, query: { slug: 'koqnitiv_kurs', p: 'index.html' }, url: '/' });
  assert.equal(r.status, 200);

  r = await call('admin', { method: 'POST', cookie, body: { action: 'createCustomer', name: 'Yeni', phone: '050 999 88 77', password: 'abcdef1', courses: ['ckq'] } });
  assert.equal(r.status, 200);
  assert.equal(store.customers['0509998877'].passwordHash, sha('abcdef1'));

  r = await call('admin', { method: 'POST', cookie, body: { action: 'createCustomer', name: 'Yeni', phone: '0509998877', password: 'abcdef1', courses: ['ckq'] } });
  assert.equal(r.body.error, 'exists');

  r = await call('login', { method: 'POST', body: { phone: '0509998877', password: 'abcdef1', device: DEVICE, acceptTerms: true } });
  const custCookie = r.cookie;
  r = await call('admin', { method: 'POST', cookie, body: { action: 'resetPassword', phone: '0509998877' } });
  assert.equal(r.status, 200);
  assert.match(r.body.password, /^[A-Za-z0-9]{10}$/);
  assert.equal(store.customers['0509998877'].passwordHash, sha(r.body.password));
  r = await call('session', { cookie: custCookie });
  assert.equal(r.body.loggedIn, false);
  r = await call('login', { method: 'POST', body: { phone: '0509998877', password: 'abcdef1', device: DEVICE, acceptTerms: true } });
  assert.equal(r.status, 401);
  r = await call('admin', { method: 'POST', cookie, body: { action: 'resetPassword', phone: '0500000000' } });
  assert.equal(r.status, 400);

  r = await call('admin', { method: 'POST', cookie, body: { action: 'removeCustomer', phone: '0509998877' } });
  assert.equal(store.customers['0509998877'], undefined);

  r = await call('session', { cookie });
  assert.equal(r.body.loggedIn, true);
  assert.equal(r.body.admin, true);
  assert.ok(r.body.courses.length >= 1);

  const adminOut = await call('admin', { method: 'POST', body: { action: 'login', pin: 'sinaq-pin' } });
  r = await call('session', { method: 'DELETE', cookie: adminOut.cookie });
  assert.equal(r.status, 200);
  r = await call('session', { cookie: adminOut.cookie });
  assert.equal(r.body.loggedIn, false);

  r = await call('admin', { method: 'POST', cookie, body: { action: 'constructor' } });
  assert.equal(r.status, 400);
});

test('qeydiyyat gözləyənlərə düşür', async () => {
  const r = await call('register', { method: 'POST', body: { name: 'Ad Soyad', phone: '0501234567', courseId: 'c13' } });
  assert.equal(r.status, 200);
  assert.equal(Object.values(store.pendingRegistrations)[0].courseName, 'Kurs 13');
});

test('admin ayrı səhifədədir: ictimai səhifələrdə admin kodu yoxdur', () => {
  const fs = require('fs');
  const path = require('path');
  const admin = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'index.html'), 'utf8');
  assert.match(admin, /noindex/);
  assert.match(admin, /resetPassword/);
  for (const page of ['index.html', 'en/index.html', 'ru/index.html', 'tr/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');
    assert.ok(!/adminWrap|adminGate|removeCustomer|createCustomer|resetPassword/.test(html), page);
    assert.ok(html.includes("location.href = '/admin/'"), page);
  }
});

test('EN/RU/TR səhifələri Firebase-siz və AZ səhifə ilə sinxrondur', () => {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const pub = path.join(__dirname, '..', 'public');
  const before = ['en', 'ru', 'tr'].map(l => fs.readFileSync(path.join(pub, l, 'index.html'), 'utf8'));
  before.forEach(h => assert.ok(!/firebase|an-psixoloji-33442/i.test(h)));
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-lang-pages.mjs')], { stdio: 'ignore' });
  const after = ['en', 'ru', 'tr'].map(l => fs.readFileSync(path.join(pub, l, 'index.html'), 'utf8'));
  assert.deepStrictEqual(after, before, 'public/index.html dəyişib: node scripts/build-lang-pages.mjs işlədin');
});

test('FIREBASE_DB_SECRET sorğulara auth parametri əlavə edir', async () => {
  const db = require('../api/_lib/db');
  process.env.FIREBASE_DB_SECRET = 'gizli deyer/+';
  try {
    await db.get('courses');
    assert.match(lastDbUrl, /\.json\?auth=gizli%20deyer%2F%2B$/);
  } finally {
    delete process.env.FIREBASE_DB_SECRET;
  }
});

test('ADMIN_PIN düz mətn dəyişəni PIN-i təyin edir', async () => {
  const saved = process.env.ADMIN_PIN_HASH;
  delete process.env.ADMIN_PIN_HASH;
  process.env.ADMIN_PIN = 'yeni-pin-123';
  const key = require.resolve('../api/admin');
  const cached = require.cache[key];
  delete require.cache[key];
  try {
    const fresh = require('../api/admin');
    const out = { status: 200, body: undefined };
    const res = {
      setHeader() {}, getHeader() {}, status(c) { out.status = c; return res; },
      json(v) { out.body = v; return res; }, send(v) { out.body = v; return res; }, end() { return res; },
    };
    const mk = (pin) => ({ method: 'POST', url: '/api/admin', headers: { host: 'kurs.test', origin: 'https://kurs.test', cookie: '' }, body: { action: 'login', pin }, socket: { remoteAddress: '9.9.9.9' } });
    await fresh(mk('sinaq-pin'), res);
    assert.notEqual(out.status, 200);
    await fresh(mk('yeni-pin-123'), res);
    assert.equal(out.status, 200);
  } finally {
    delete process.env.ADMIN_PIN;
    process.env.ADMIN_PIN_HASH = saved;
    require.cache[key] = cached;
  }
});
