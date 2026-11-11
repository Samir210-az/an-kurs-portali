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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();

  const slug = String(req.query.slug || '');
  let rel = [].concat(req.query.p || []).join('/');
  if (!core.contentSlugs().includes(slug)) return res.status(404).send('Tapılmadı');

  try {
    const sess = await core.getSession(req);
    const courses = sess ? await core.customerCourses(sess.customer) : [];
    if (!courses.some((c) => c.slug === slug)) {
      res.statusCode = 302;
      res.setHeader('Location', '/?giris=1#giris');
      return res.end();
    }

    // Səhifələrdəki nisbi linklər qovluq ünvanının "/" ilə bitməsinə söykənir.
    const asked = String(req.url || '').split('?')[0];
    if (rel === '' && asked.startsWith('/kurs/') && !asked.endsWith('/')) {
      res.statusCode = 302;
      res.setHeader('Location', `/kurs/${slug}/`);
      return res.end();
    }
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
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
      const mark = watermark(sess.phone);
      data = Buffer.from(i === -1 ? html + mark : html.slice(0, i) + mark + html.slice(i));
    }
    res.setHeader('Content-Type', type);
    res.status(200).send(data);
  } catch (e) {
    console.error(e);
    res.status(500).send('Xəta');
  }
};
