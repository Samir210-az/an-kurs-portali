const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const SESSION_COOKIE = 'an_sess';
const ADMIN_COOKIE = 'an_admin';
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const ADMIN_TTL = 12 * 3600 * 1000;
const MAX_DEVICES = 2;
const MAX_FAILS = 8;
const FAIL_WINDOW = 15 * 60 * 1000;

const CONTENT_DIR = path.join(process.cwd(), 'content');

const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
const normalizePhone = (p) => String(p || '').replace(/\D/g, '');
const isKey = (v) => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);

function sameHash(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function setCookie(res, name, value, maxAgeMs) {
  const parts = [
    `${name}=${value}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  const existing = res.getHeader('Set-Cookie');
  const list = existing ? [].concat(existing) : [];
  res.setHeader('Set-Cookie', list.concat(parts.join('; ')));
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Brauzer başqa saytdan göndərilən POST-a Origin başlığı qoyur; öz saytımızdan
// gəlməyən yazma sorğuları rədd edilir.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers['x-forwarded-host'] || req.headers.host);
  } catch (e) {
    return false;
  }
}

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

function clientKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  return sha256(ip).slice(0, 24);
}

async function tooManyFails(key) {
  const rec = await db.get('loginAttempts/' + key);
  return !!rec && Date.now() - rec.first < FAIL_WINDOW && rec.count >= MAX_FAILS;
}

async function recordFail(key) {
  const rec = await db.get('loginAttempts/' + key);
  const fresh = !rec || Date.now() - rec.first >= FAIL_WINDOW;
  await db.set('loginAttempts/' + key, fresh
    ? { count: 1, first: Date.now() }
    : { count: rec.count + 1, first: rec.first });
}

// Məzmun qovluqlarının adları. Siyahı fayldan oxunur, çünki content/ yalnız
// api/content.js funksiyasına qoşulur; digər funksiyalar qovluğu görmür.
const contentSlugs = () => require('./slugs.json');

// Kursun bazadakı linkində repo adı keçir (.../kurs_13/); portaldakı məzmun
// qovluğu həmin adla tapılır.
function slugOf(course) {
  const url = (course && course.url) || '';
  return contentSlugs().find((s) => new RegExp('/' + s + '(/|$)').test(url)) || null;
}

function courseHref(course) {
  const slug = slugOf(course);
  return slug ? `/kurs/${slug}/` : (course && course.url) || '';
}

let coursesCache = null;
async function getCourses(force) {
  if (force || !coursesCache || Date.now() - coursesCache.at > 60000) {
    coursesCache = { at: Date.now(), value: (await db.get('courses')) || {} };
  }
  return coursesCache.value;
}

async function getSession(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const sess = await db.get('sessions/' + token);
  if (!sess || !sess.phone || Date.now() - sess.createdAt > SESSION_TTL) return null;
  const customer = await db.get('customers/' + normalizePhone(sess.phone));
  if (!customer) return null;
  return { token, phone: normalizePhone(sess.phone), customer };
}

const LANGS = ['en', 'ru', 'tr'];
const courseI18n = require('./course-i18n.json');

function langOf(req) {
  const l = String((req && req.query && req.query.lang) || '').toLowerCase();
  return LANGS.includes(l) ? l : 'az';
}

function localize(id, course, lang) {
  const t = courseI18n[id] && courseI18n[id][lang];
  return t ? { ...course, ...t } : course;
}

async function customerCourses(customer, lang) {
  const courses = await getCourses();
  return (customer.allowedCourses || [])
    .filter((id) => courses[id])
    .map((id) => {
      const c = localize(id, courses[id], lang);
      return { name: c.name, slug: slugOf(courses[id]), href: courseHref(courses[id]) };
    });
}

async function isAdmin(req) {
  const token = readCookie(req, ADMIN_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  const sess = await db.get('adminSessions/' + token);
  return !!sess && Date.now() - sess.createdAt < ADMIN_TTL;
}

module.exports = {
  db, SESSION_COOKIE, ADMIN_COOKIE, SESSION_TTL, ADMIN_TTL, MAX_DEVICES, CONTENT_DIR,
  sha256, newToken, normalizePhone, isKey, sameHash, setCookie, readCookie, sameOrigin, body,
  clientKey, tooManyFails, recordFail, contentSlugs, slugOf, courseHref, getCourses, getSession,
  customerCourses, isAdmin, langOf, localize,
};
