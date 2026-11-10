/* Yeni versiya yoxlaması: tətbiq açılanda bir dəfə serverdəki səhifə ilə
   açıq olanı müqayisə edir; daha yenisi varsa «Yenilə» pəncərəsi göstərir.
   İstifadəçi məlumatlarına (localStorage, hesablar) toxunmur. */
(function () {
  var KEY = 'yenilenme-yoxlandi';
  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, '1');
  } catch (e) {}

  var local = Date.parse(document.lastModified);
  if (!local || !window.fetch) return;

  fetch(location.pathname + '?_yv=' + Date.now(), { method: 'HEAD', cache: 'no-store' })
    .then(function (r) {
      var lm = r.ok && r.headers.get('last-modified');
      if (lm && Date.parse(lm) - local > 5000) show();
    })
    .catch(function () {});

  function refresh() {
    var jobs = [];
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (g) { return g.update().catch(function () {}); }));
      }));
    }
    if (window.caches) {
      jobs.push(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }));
    }
    Promise.all(jobs).catch(function () {}).then(function () { location.reload(); });
  }

  function show() {
    var css = document.createElement('style');
    css.textContent =
      '#yv-bar{position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;' +
      'display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;max-width:calc(100% - 24px);' +
      'padding:12px 14px 12px 18px;border-radius:16px;background:#1f1b33;color:#fff;box-shadow:0 12px 32px rgba(0,0,0,.35);' +
      'font:600 15px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:yv-in .3s ease-out}' +
      '#yv-bar button{font:inherit;border:0;border-radius:10px;padding:9px 16px;cursor:pointer;min-height:40px}' +
      '#yv-go{background:#7c5cff;color:#fff}#yv-later{background:transparent;color:#cfc9e6}' +
      '#yv-bar button:focus-visible{outline:3px solid #fff;outline-offset:2px}' +
      '@keyframes yv-in{from{opacity:0;transform:translate(-50%,12px)}}' +
      '@media (prefers-reduced-motion:reduce){#yv-bar{animation:none}}';
    var bar = document.createElement('div');
    bar.id = 'yv-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>Yeni versiya hazırdır</span>' +
      '<button type="button" id="yv-go">Yenilə</button>' +
      '<button type="button" id="yv-later">Sonra</button>';
    document.head.appendChild(css);
    document.body.appendChild(bar);
    document.getElementById('yv-go').onclick = refresh;
    document.getElementById('yv-later').onclick = function () { bar.remove(); };
  }
})();
