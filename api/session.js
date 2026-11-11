const core = require('./_lib/core');

// GET — açıq sessiyanın kursları (admin girişi açıqdırsa bütün kurslar); DELETE — çıxış.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'DELETE') {
      if (!core.sameOrigin(req)) return res.status(403).json({ error: 'origin' });
      const token = core.readCookie(req, core.SESSION_COOKIE);
      if (token && /^[0-9a-f]{64}$/.test(token)) await core.db.remove('sessions/' + token);
      core.setCookie(res, core.SESSION_COOKIE, '', 0);
      const adminToken = core.readCookie(req, core.ADMIN_COOKIE);
      if (adminToken && /^[0-9a-f]{64}$/.test(adminToken)) await core.db.remove('adminSessions/' + adminToken);
      core.setCookie(res, core.ADMIN_COOKIE, '', 0);
      return res.status(200).json({ ok: true });
    }
    if (await core.isAdmin(req)) {
      const all = await core.getCourses();
      return res.status(200).json({
        loggedIn: true,
        name: 'Admin',
        admin: true,
        courses: await core.customerCourses({ allowedCourses: Object.keys(all) }, core.langOf(req)),
      });
    }
    const sess = await core.getSession(req);
    if (!sess) return res.status(200).json({ loggedIn: false });
    res.status(200).json({
      loggedIn: true,
      name: sess.customer.name || '',
      courses: await core.customerCourses(sess.customer, core.langOf(req)),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
};
