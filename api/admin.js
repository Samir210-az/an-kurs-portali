const core = require('./_lib/core');
const { db } = core;

// PIN mənbəyi: ADMIN_PIN_HASH (SHA-256), yoxdursa ADMIN_PIN (düz mətn, Vercel-də Sensitive).
// Heç biri təyin olunmayıbsa köhnə portalda işlənən PIN-in hash-i qüvvədədir.
const PIN_HASH = process.env.ADMIN_PIN_HASH ||
  (process.env.ADMIN_PIN
    ? require('crypto').createHash('sha256').update(process.env.ADMIN_PIN).digest('hex')
    : 'a0e517d37e8d21b24dc3b8aed38954353019618e2b2552b44bb55dddb52a7b15');

function publicCustomer(c) {
  return {
    name: c.name || '', phone: c.phone || '',
    allowedCourses: c.allowedCourses || [],
    deviceCount: Array.isArray(c.devices) ? c.devices.length : 0,
  };
}

async function dropSessions(phone) {
  const sessions = (await db.get('sessions')) || {};
  const patch = {};
  for (const [token, s] of Object.entries(sessions)) {
    if (s && core.normalizePhone(s.phone) === phone) patch[token] = null;
  }
  if (Object.keys(patch).length) await db.update('sessions', patch);
}

// Admin panelindəki "Aç" düyməsi üçün: kursun portal daxilindəki ünvanı.
async function courseList(force) {
  const courses = await core.getCourses(force);
  const links = {};
  for (const [id, c] of Object.entries(courses)) links[id] = core.courseHref(c);
  return { courses, links };
}

const actions = {
  async load() {
    const [list0, customers, pending, alerts] = await Promise.all([
      courseList(true), db.get('customers'), db.get('pendingRegistrations'), db.get('securityAlerts'),
    ]);
    const list = {};
    for (const [phone, c] of Object.entries(customers || {})) list[phone] = publicCustomer(c || {});
    return { ...list0, customers: list, pending: pending || {}, alerts: alerts || {} };
  },

  async saveCourse(input) {
    const name = String(input.name || '').trim();
    const url = String(input.url || '').trim();
    if (!name || !/^https?:\/\//.test(url)) return { error: 'invalid' };
    const fields = {
      name, url,
      description: String(input.description || '').trim(),
      stats: Array.isArray(input.stats) ? input.stats.map((s) => String(s).trim()).filter(Boolean) : [],
      price: String(input.price || '').trim(),
      audience: String(input.audience || '').trim(),
    };
    if (input.id) {
      if (!core.isKey(input.id)) return { error: 'invalid' };
      await db.update('courses/' + input.id, fields);
    } else {
      await db.push('courses', { ...fields, createdAt: Date.now() });
    }
    return courseList(true);
  },

  async removeCourse(input) {
    if (!core.isKey(input.id)) return { error: 'invalid' };
    await db.remove('courses/' + input.id);
    return courseList(true);
  },

  async createCustomer(input) {
    const name = String(input.name || '').trim();
    const phoneRaw = String(input.phone || '').trim();
    const phone = core.normalizePhone(phoneRaw);
    const password = String(input.password || '').trim();
    const allowed = Array.isArray(input.courses) ? input.courses.filter(core.isKey) : [];
    if (!name || phone.length < 9 || password.length < 6 || !allowed.length) return { error: 'invalid' };
    if (await db.get('customers/' + phone)) return { error: 'exists' };

    const customer = {
      name, phone: phoneRaw, passwordHash: core.sha256(password),
      allowedCourses: allowed, devices: [], createdAt: Date.now(),
    };
    await db.set('customers/' + phone, customer);
    if (core.isKey(input.regId)) {
      await db.update('pendingRegistrations/' + input.regId, { status: 'aktivlesdi', activatedAt: Date.now() });
    }
    return { phone, customer: publicCustomer(customer) };
  },

  async resetDevices(input) {
    const phone = core.normalizePhone(input.phone);
    if (!phone) return { error: 'invalid' };
    await db.update('customers/' + phone, { devices: [] });
    return {};
  },

  async removeCustomer(input) {
    const phone = core.normalizePhone(input.phone);
    if (!phone) return { error: 'invalid' };
    await db.remove('customers/' + phone);
    await dropSessions(phone);
    return {};
  },

  async dismissPending(input) {
    if (!core.isKey(input.id)) return { error: 'invalid' };
    await db.remove('pendingRegistrations/' + input.id);
    return {};
  },

  async dismissAlert(input) {
    if (!core.isKey(input.id)) return { error: 'invalid' };
    await db.remove('securityAlerts/' + input.id);
    return {};
  },
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST' || !core.sameOrigin(req)) return res.status(405).json({ error: 'method' });
  const input = core.body(req);

  try {
    if (input.action === 'login') {
      const limitKey = 'a_' + core.clientKey(req);
      if (await core.tooManyFails(limitKey)) return res.status(429).json({ error: 'locked' });
      if (!core.sameHash(core.sha256(String(input.pin || '').trim()), PIN_HASH)) {
        await core.recordFail(limitKey);
        return res.status(401).json({ error: 'pin' });
      }
      const token = core.newToken();
      await db.set('adminSessions/' + token, { createdAt: Date.now() });
      core.setCookie(res, core.ADMIN_COOKIE, token, core.ADMIN_TTL);
      return res.status(200).json({ ok: true, ...(await actions.load()) });
    }

    if (input.action === 'logout') {
      const token = core.readCookie(req, core.ADMIN_COOKIE);
      if (token && /^[0-9a-f]{64}$/.test(token)) await db.remove('adminSessions/' + token);
      core.setCookie(res, core.ADMIN_COOKIE, '', 0);
      return res.status(200).json({ ok: true });
    }

    if (!(await core.isAdmin(req))) return res.status(401).json({ error: 'auth' });
    const run = Object.prototype.hasOwnProperty.call(actions, input.action) && actions[input.action];
    if (!run) return res.status(400).json({ error: 'action' });
    const result = await run(input);
    res.status(result.error ? 400 : 200).json(result.error ? result : { ok: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
};
