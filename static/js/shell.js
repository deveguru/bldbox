/* App shell: sidebar drawer, phone sign-in modal, guest gating. Shared by chat and code. */
(function () {
  const $ = (id) => document.getElementById(id);
  const fa = (window.__LANG || 'fa') === 'fa';
  const H = { 'Content-Type': 'application/json', 'X-CSRF-Token': window.__CSRF };

  /* ---------- sidebar ---------- */
  const sb = $('sidebar'), scrim = $('sbScrim');
  const setSidebar = (open) => { if (sb) sb.classList.toggle('open', open); if (scrim) scrim.classList.toggle('on', open); };
  if ($('menuBtn')) $('menuBtn').addEventListener('click', () => setSidebar(!sb.classList.contains('open')));
  if ($('sbClose')) $('sbClose').addEventListener('click', () => setSidebar(false));
  if (scrim) scrim.addEventListener('click', () => setSidebar(false));

  /* ---------- login modal ---------- */
  const modal = $('loginModal');
  const nextUrl = () => new URLSearchParams(location.search).get('next') || (location.pathname + location.search);
  function openLogin() {
    if (!modal) { location.href = '/login?next=' + encodeURIComponent(nextUrl()); return; }
    modal.hidden = false;
    setTimeout(() => { const i = $('lmPhone'); if (i) i.focus(); }, 50);
  }
  function closeLogin() { if (modal) modal.hidden = true; }
  window.BB = window.BB || {};
  BB.openLogin = openLogin;

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-login]')) { e.preventDefault(); openLogin(); return; }
    if (window.__GUEST && e.target.closest('[data-need-login]')) {
      e.preventDefault(); e.stopImmediatePropagation(); openLogin();
    }
    if (e.target.closest('[data-close-login]') || e.target === modal) closeLogin();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLogin(); });
  if (new URLSearchParams(location.search).get('login') === '1') openLogin();

  if ($('lmSend')) {
    let timer = null;
    const countdown = (sec) => {
      const r = $('lmResend'); r.disabled = true; clearInterval(timer);
      timer = setInterval(() => {
        sec--; $('lmTimer').textContent = sec > 0 ? `(${sec})` : '';
        if (sec <= 0) { clearInterval(timer); r.disabled = false; }
      }, 1000);
    };
    const send = async () => {
      const b = $('lmSend'); b.disabled = true;
      try {
        const j = await (await fetch('/auth/sms/send', { method: 'POST', headers: H,
          body: JSON.stringify({ phone: $('lmPhone').value }) })).json();
        if (!j.ok) { BB.toast(j.message || 'error', 'err'); return; }
        $('lmStep1').hidden = true; $('lmStep2').hidden = false; $('lmCode').focus(); countdown(60);
      } finally { b.disabled = false; }
    };
    const verify = async () => {
      const j = await (await fetch('/auth/sms/verify', { method: 'POST', headers: H,
        body: JSON.stringify({ phone: $('lmPhone').value, code: $('lmCode').value, next: nextUrl() }) })).json();
      if (j.ok) location.href = j.next || '/'; else BB.toast(j.message || 'error', 'err');
    };
    $('lmSend').onclick = send; $('lmResend').onclick = send; $('lmVerify').onclick = verify;
    $('lmBack').onclick = (e) => { e.preventDefault(); $('lmStep2').hidden = true; $('lmStep1').hidden = false; };
    $('lmPhone').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    $('lmCode').addEventListener('input', (e) => { if (e.target.value.replace(/\D/g, '').length === 6) verify(); });
  }
})();
