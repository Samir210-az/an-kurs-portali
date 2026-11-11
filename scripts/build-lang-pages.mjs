// public/index.html (AZ) əsasında EN / RU / TR səhifələrini yaradır.
// İşlətmək: node scripts/build-lang-pages.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { langs, AZ_CENTER } from './i18n.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'public', 'index.html'), 'utf8');
const portalWord = { en: 'Course Portal', ru: 'Портал курсов', tr: 'Kurs Portalı' };

function replaceAllStrict(text, from, to, lang) {
  if (!text.includes(from)) {
    throw new Error(`[${lang}] mənbədə tapılmadı: ${from.slice(0, 70)}`);
  }
  return text.split(from).join(to);
}

for (const [code, cfg] of Object.entries(langs)) {
  let html = source;

  for (const [az, tr] of cfg.pairs) html = replaceAllStrict(html, az, tr, code);

  html = html.replace('<html lang="az">', `<html lang="${cfg.htmlLang}">`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${cfg.center} — ${portalWord[code]}</title>`);
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${cfg.description}$2`);
  html = html.split(`${AZ_CENTER} loqosu`).join(cfg.centerLogoAlt);
  html = html.split(AZ_CENTER).join(cfg.center);
  html = html.split('Nahidə Axundova').join(cfg.author);

  html = html.replace(
    /(href|src)="(logo\.png|manifest\.json|apple-touch-icon\.png|nahide-axundova\.jpg|terms\.html|privacy\.html)"/g,
    '$1="../$2"'
  );

  const switcher = ['az', 'en', 'ru', 'tr']
    .map(l => l === code
      ? `  <a href="#" class="active">${l.toUpperCase()}</a>`
      : `  <a href="${l === 'az' ? '../index.html' : `../${l}/index.html`}">${l.toUpperCase()}</a>`)
    .join('\n');
  html = html.replace(/(<div class="lang-switch">\n)[\s\S]*?(\n<\/div>)/, `$1${switcher}$2`);

  html = html.replace("register('service-worker.js')", "register('/service-worker.js')");

  if (/firebase|googleapis\.com\/identitytoolkit|an-psixoloji-33442/i.test(html)) {
    throw new Error(`[${code}] Firebase izi qalıb`);
  }
  writeFileSync(join(root, 'public', code, 'index.html'), html);
  console.log(`public/${code}/index.html yazıldı`);
}
