# an-kurs-portali

AN Psixoloji Dəstək və Reabilitasiya Mərkəzi — Vahid Kurs Portalı.

Portal və bütün kurslar bir Vercel layihəsində işləyir. Kurs səhifələri açıq
fayl kimi verilmir: hər sorğuda `api/content.js` sessiyanı və müştərinin həmin
kursa icazəsini yoxlayır.

## Quruluş

- `public/` — portalın açıq səhifəsi (giriş, qeydiyyat, admin paneli), PWA faylları
- `api/` — server funksiyaları: `login`, `session`, `register`, `courses`, `admin`, `content`
- `content/<slug>/` — kurs səhifələri; yalnız `/kurs/<slug>/...` ünvanından, icazə yoxlanandan sonra verilir
- `scripts/import-course.mjs` — kurs reposunu `content/` altına köçürür
- `scripts/build-lang-pages.mjs` + `scripts/i18n.mjs` — `public/index.html`-dən EN/RU/TR səhifələrini yaradır (AZ dəyişəndə yenidən işlədin: `node scripts/build-lang-pages.mjs`)
- `test/` — `node --test`

Kursun bazadakı linkində (`courses/<id>/url`) repo adı keçməlidir, məsələn
`.../kurs_13/`: portal məzmun qovluğunu həmin adla tapır.

## Environment variables (Vercel)

| Ad | Nə üçündür |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Service account JSON-u. Baza rules bağlanandan sonra məcburidir |
| `ADMIN_PIN_HASH` | Admin PIN-in SHA-256 hash-i |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Yeni qeydiyyat bildirişi |

## Kursu yeniləmək

```
node scripts/import-course.mjs ../kurs_13 kurs_13
```
