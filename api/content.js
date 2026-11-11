const fs = require('fs');
const path = require('path');
const core = require('./_lib/core');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function watermark(phone) {
  return `<div style="position:fixed;bottom:8px;right:10px;z-index:9998;font-size:11px;color:rgba(243,238,225,0.35);pointer-events:none;font-family:Inter,sans-serif;letter-spacing:.02em;user-select:none;">© ${phone}</div>`;
}

const LOGOUT_LABEL = { en: 'Log out', ru: 'Выйти', tr: 'Çıkış' };
const PILL = 'display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border-radius:999px;' +
  'background:rgba(12,33,31,0.92);border:1px solid rgba(217,168,90,0.45);color:#f3eee1;' +
  'font:600 13px/1 Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer;';

// Kurs səhifələrinin özündə portala qayıtmaq və çıxmaq üçün düymə yoxdur;
// hər səhifəyə aşağı-sol küncdə kiçik panel əlavə olunur.
function portalBar(rel) {
  const label = LOGOUT_LABEL[rel.split('/')[0]] || 'Çıxış';
  return `<div style="position:fixed;left:10px;bottom:10px;z-index:9999;display:flex;gap:6px;">` +
    `<a href="/" style="${PILL}">← Portal</a>` +
    `<button type="button" id="anLogoutBtn" style="${PILL}">${label}</button></div>` +
    `<script>document.getElementById('anLogoutBtn').addEventListener('click',function(){` +
    `this.disabled=true;Promise.all([fetch('/api/session',{method:'DELETE'}),` +
    `fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"logout"}'})])` +
    `.catch(function(){}).then(function(){location.replace('/');});});</script>`;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();

  const slug = String(req.query.slug || '');
  const rel = [].concat(req.query.p || []).join('/');
  if (!core.contentSlugs().includes(slug)) return res.status(404).send('Tapılmadı');

  // Kursun əsas ünvanı açıq fayl adına yönləndirilir ki, səhifədəki nisbi
  // linklər ünvanın "/" ilə bitib-bitməməsindən asılı olmasın.
  if (rel === '' || rel.endsWith('/')) {
    res.statusCode = 302;
    res.setHeader('Location', `/kurs/${slug}/${rel}index.html`);
    return res.end();
  }

  try {
    // Admin bütün kursları aça bilir; müştəri yalnız icazəsi olanları.
    const admin = await core.isAdmin(req);
    const sess = admin ? null : await core.getSession(req);
    const courses = sess ? await core.customerCourses(sess.customer) : [];
    if (!admin && !courses.some((c) => c.slug === slug)) {
      res.statusCode = 302;
      res.setHeader('Location', '/?giris=1#giris');
      return res.end();
    }

    const base = path.join(core.CONTENT_DIR, slug);
    const file = path.normalize(path.join(base, rel));
    const type = TYPES[path.extname(file).toLowerCase()];
    if (!file.startsWith(base + path.sep) || !type) return res.status(404).send('Tapılmadı');

    let data;
    try {
      data = await fs.promises.readFile(file);
    } catch (e) {
      return res.status(404).send('Tapılmadı');
    }

    if (type.startsWith('text/html')) {
      const html = data.toString('utf8');
      const i = html.lastIndexOf('</body>');
      const mark = watermark(admin ? 'admin' : sess.phone) + portalBar(rel);
      data = Buffer.from(i === -1 ? html + mark : html.slice(0, i) + mark + html.slice(i));
    }
    res.setHeader('Content-Type', type);
    res.status(200).send(data);
  } catch (e) {
    console.error(e);
    res.status(500).send('Xəta');
  }
};
