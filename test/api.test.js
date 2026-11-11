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

const dbServer = http.createServer((req, res) => {
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
  assert.match(r.body.toString(), /© 994501112233<\/div><\/body>/);

  r = await call('content', { cookie, query: { slug: 'kurs_13', p: ['en', '01-aqressiv-usaqlarla-is.html'] }, url: '/kurs/kurs_13/en/01-aqressiv-usaqlarla-is.html' });
  assert.equal(r.status, 200);

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
  r = await call('admin', { method: 'POST', cookie, body: { action: 'removeCustomer', phone: '0509998877' } });
  assert.equal(store.customers['0509998877'], undefined);
  r = await call('session', { cookie: custCookie });
  assert.equal(r.body.loggedIn, false);

  r = await call('admin', { method: 'POST', cookie, body: { action: 'constructor' } });
  assert.equal(r.status, 400);
});

test('qeydiyyat gözləyənlərə düşür', async () => {
  const r = await call('register', { method: 'POST', body: { name: 'Ad Soyad', phone: '0501234567', courseId: 'c13' } });
  assert.equal(r.status, 200);
  assert.equal(Object.values(store.pendingRegistrations)[0].courseName, 'Kurs 13');
});
