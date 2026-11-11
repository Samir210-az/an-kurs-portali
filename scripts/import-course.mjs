// Kurs reposunu content/<slug>/ altına köçürür və brauzer tərəfli giriş
// yoxlamasını (guard, AUTH-GATE, kursun öz PWA-sı) çıxarır: icazəni artıq
// api/content.js verir.
//
//   node scripts/import-course.mjs <kurs reposunun qovluğu> <slug>

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [src, slug] = process.argv.slice(2);
if (!src || !/^[\w-]+$/.test(slug || '')) {
  console.error('İstifadə: node scripts/import-course.mjs <qovluq> <slug>');
  process.exit(1);
}

const SKIP = new Set([
  '.git', '.nojekyll', 'README.md', 'manifest.json', 'service-worker.js', 'pwa.js',
  'guard-v4.js', 'guard-v5.js', 'yenilenme.js', 'icon-192.png', 'icon-512.png',
]);

const STRIP = [
  /<script>document\.documentElement\.style\.visibility='hidden';<\/script>\r?\n?/g,
  /<script src="(?:\.\.\/)?guard-v[45]\.js"><\/script>\r?\n?/g,
  /<link rel="manifest" href="[^"]*">\r?\n?/g,
  /<link rel="apple-touch-icon" href="[^"]*">\r?\n?/g,
  /<script src="(?:\.\.\/)?pwa\.js" defer><\/script>\r?\n?/g,
  /<script src="yenilenme\.js" defer><\/script>\r?\n?/g,
  /<div id="authGateOverlay"[\s\S]*?<\/div>\s*<\/div>\s*<style>@keyframes agSpin[^<]*<\/style>\r?\n?/g,
  /<!-- AUTH-GATE-V2[^>]*-->\s*<script type="module">[\s\S]*?<\/script>\r?\n?/g,
];

const LEFTOVER = /guard-v\d|authGateOverlay|AUTH-GATE|an_session_token|pwa\.js|visibility='hidden'/;

const dest = path.join('content', slug);
await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

let html = 0;
const problems = [];

async function walk(from, to) {
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.endsWith('.md')) continue;
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await mkdir(b, { recursive: true });
      await walk(a, b);
    } else if (entry.name.endsWith('.html')) {
      let text = await readFile(a, 'utf8');
      for (const re of STRIP) text = text.replace(re, '');
      if (LEFTOVER.test(text)) problems.push(path.relative(src, a));
      await writeFile(b, text);
      html++;
    } else {
      await cp(a, b);
    }
  }
}

await walk(src, dest);
const listFile = path.join('api', '_lib', 'slugs.json');
const slugs = JSON.parse(await readFile(listFile, 'utf8'));
if (!slugs.includes(slug)) {
  await writeFile(listFile, JSON.stringify([...slugs, slug].sort(), null, 2) + '\n');
}

console.log(`${slug}: ${html} HTML səhifə köçürüldü`);
if (problems.length) {
  console.error('Təmizlənməmiş qalıq var:\n  ' + problems.join('\n  '));
  process.exit(1);
}
