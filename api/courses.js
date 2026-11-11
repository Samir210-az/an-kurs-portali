const { getCourses, langOf, localize } = require('./_lib/core');

// Açıq siyahı: kursun linki bura daxil edilmir.
module.exports = async (req, res) => {
  try {
    const courses = await getCourses();
    const lang = langOf(req);
    const list = Object.entries(courses).map(([id, course]) => {
      const c = localize(id, course, lang);
      return {
        id,
        name: c.name || '',
        description: c.description || '',
        stats: c.stats || [],
        price: c.price || '',
        audience: c.audience || '',
      };
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ courses: list });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
};
