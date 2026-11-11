/* AN Курс программ терапии для детей и подростков — Общий JS-движок (русский)
   By s_akhundoff — https://instagram.com/s_akhundoff */

const io = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('show'); io.unobserve(e.target);} });
},{threshold:0.1});
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('section').forEach(s=>io.observe(s));
});

window.addEventListener('mousemove', e=>{
  const mx = (e.clientX/window.innerWidth - 0.5);
  const my = (e.clientY/window.innerHeight - 0.5);
  document.querySelectorAll('.blob').forEach((b,i)=>{
    const speed = (i+1)*16;
    b.style.transform = `translate(${mx*speed}px, ${my*speed}px)`;
  });
});

function renderSession(s){
  const total = (typeof TOTAL_SESSIONS !== 'undefined') ? TOTAL_SESSIONS : s.num;
  let html = `<span class="m-tag">Сессия ${s.num} / ${total}</span><h3 class="m-title">${s.title}</h3>`;
  if(s.about){
    html += `<div class="m-block"><h5>ℹ️ Описание</h5><div class="m-goal">${s.about}</div></div>`;
  }
  html += `<div class="m-block"><h5>🎯 Цель</h5><div class="m-goal">${s.goal}</div></div>`;
  if(s.structure){
    html += `<div class="m-block"><h5>🧱 Структура</h5><div class="m-goal">${s.structure}</div></div>`;
  }
  if(s.administrator){
    html += `<div class="m-block"><h5>🎓 Кто может проводить</h5><div class="m-goal">${s.administrator}</div></div>`;
  }
  if(s.materials && s.materials.length){
    html += `<div class="m-block"><h5>🧰 Необходимые материалы</h5><div class="m-materials">${s.materials.map(m=>`<span>${m}</span>`).join('')}</div></div>`;
  }
  html += `<div class="m-block"><h5>📋 Полный сценарий сессии</h5>`;
  s.phases.forEach(ph=>{
    html += `<div class="m-phase"><div class="ph-name">${ph.name}</div>`;
    (ph.text||[]).forEach(t=>{ html += `<p>${t}</p>`; });
    if(ph.dialog && ph.dialog.length){
      html += `<div class="m-dialog">`;
      ph.dialog.forEach(d=>{
        const who = d[0]==='T' ? 'Терапевт' : d[0];
        const cls = d[0]==='T' ? 't' : 'k';
        html += `<div class="dl"><span class="dw ${cls}">${who}:</span><span class="dt">${d[1]}</span></div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  });
  html += `</div>`;
  if(s.scoring){
    html += `<div class="m-block"><h5>📊 Подсчёт баллов и интерпретация</h5><div class="m-homework">${s.scoring}</div></div>`;
  }
  if(s.homework){
    html += `<div class="m-block"><h5>📝 Домашнее задание</h5><div class="m-homework">${s.homework}</div></div>`;
  }
  html += `<div class="m-nextprev">
    <div class="m-navbtn ${s.num<=1?'disabled':''}" onclick="openSession(${s.num-1})">◂ Предыдущая сессия</div>
    <div class="m-navbtn ${s.num>=total?'disabled':''}" onclick="openSession(${s.num+1})">Следующая сессия ▸</div>
  </div>`;
  return html;
}

function openSession(n){
  if(typeof SESSIONS === 'undefined') return;
  const s = SESSIONS.find(x=>x.num===n);
  if(!s) return;
  document.getElementById('modalContent').innerHTML = renderSession(s);
  document.getElementById('modalOverlay').classList.add('active');
  document.body.classList.add('modal-open');
  const box = document.querySelector('.modal-box');
  if(box) box.scrollTop = 0;
}
function closeSession(){
  const ov = document.getElementById('modalOverlay');
  if(ov) ov.classList.remove('active');
  document.body.classList.remove('modal-open');
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeSession(); });
