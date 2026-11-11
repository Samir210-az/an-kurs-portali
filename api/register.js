const core = require('./_lib/core');
const { db } = core;

async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) {
    console.error('telegram', e.message);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' || !core.sameOrigin(req)) return res.status(405).json({ error: 'method' });
  const input = core.body(req);
  const name = String(input.name || '').trim().slice(0, 120);
  const phone = String(input.phone || '').trim().slice(0, 30);
  const courseId = String(input.courseId || '');
  if (!name || core.normalizePhone(phone).length < 9 || !core.isKey(courseId)) {
    return res.status(400).json({ error: 'invalid' });
  }

  try {
    const limitKey = 'r_' + core.clientKey(req);
    if (await core.tooManyFails(limitKey)) return res.status(429).json({ error: 'locked' });
    await core.recordFail(limitKey);

    const courses = await core.getCourses();
    let courseName;
    if (courseId === 'ALL') courseName = 'Bütün kurslar (paket)';
    else if (courses[courseId]) courseName = courses[courseId].name;
    else return res.status(400).json({ error: 'invalid' });

    await db.push('pendingRegistrations', {
      name, phone, courseId, courseName, status: 'gozleyir', createdAt: Date.now(),
    });
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    await notifyTelegram(`🎓 Yeni qeydiyyat — AN Kurs Portalı\nAd: ${name}\nTelefon: ${phone}\nKurs: ${courseName}\nLink: https://${host}/`);
    res.status(200).json({ ok: true, courseName });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
};
