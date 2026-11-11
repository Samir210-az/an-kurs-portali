const core = require('./_lib/core');
const { db } = core;

module.exports = async (req, res) => {
  if (req.method !== 'POST' || !core.sameOrigin(req)) return res.status(405).json({ error: 'method' });
  const input = core.body(req);
  const phone = core.normalizePhone(input.phone);
  const password = String(input.password || '').trim();
  const device = String(input.device || '').slice(0, 64);
  if (!phone || !password || !/^fp_[0-9a-f]+$/.test(device)) return res.status(400).json({ error: 'empty' });

  try {
    const limitKey = 'c_' + phone;
    if (await core.tooManyFails(limitKey)) return res.status(429).json({ error: 'locked' });

    const cust = await db.get('customers/' + phone);
    if (!cust || !core.sameHash(core.sha256(password), cust.passwordHash)) {
      await core.recordFail(limitKey);
      return res.status(401).json({ error: 'credentials' });
    }

    const devices = Array.isArray(cust.devices) ? cust.devices.slice() : [];
    if (!devices.some((d) => d && d.fp === device)) {
      if (devices.length >= core.MAX_DEVICES) {
        await db.push('securityAlerts', {
          customerName: cust.name || '', phone, type: 'cihaz_limiti',
          detail: `${devices.length} cihaz artıq qeydiyyatdadır, yeni cihazdan giriş cəhdi rədd edildi`,
          ts: Date.now(),
        });
        return res.status(403).json({ error: 'devices' });
      }
      devices.push({ fp: device, addedAt: Date.now() });
    }

    if (!cust.termsAccepted && input.acceptTerms !== true) {
      return res.status(200).json({ needTerms: true });
    }

    const patch = { devices, lastLogin: Date.now() };
    if (!cust.termsAccepted) { patch.termsAccepted = true; patch.termsAcceptedAt = Date.now(); }
    await db.update('customers/' + phone, patch);

    const courses = await core.customerCourses(cust, core.langOf(req));
    if (!courses.length) return res.status(403).json({ error: 'nocourses' });

    const token = core.newToken();
    await db.set('sessions/' + token, { phone, createdAt: Date.now() });
    await db.remove('loginAttempts/' + limitKey);
    core.setCookie(res, core.SESSION_COOKIE, token, core.SESSION_TTL);
    res.status(200).json({ ok: true, name: cust.name || '', courses });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
};
