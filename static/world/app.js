/* AI World Builder — UI: sidebar, ChatGPT-style composer, sector compass, panels, connections */
import { WorldEngine } from '/static/world/engine.js?v=20261026';

const W = window.__W;
const EN = W.lang === 'en';
const L = (fa, en) => (EN ? en : fa);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STYLE_COLOR = { '2d': '#4fc3f7', pixel: '#ff8a65', voxel: '#8bc34a', lego: '#f2cd37', pixel3d: '#ff6fb1', '3d': '#b266ff', anime: '#ff5f8f' };
const styleName = (k) => (W.styles[k] ? (EN ? W.styles[k][2] : W.styles[k][1]) : k);
const FAMILY = { '2d': 'flat', pixel: 'flat', voxel: 'block', lego: 'block', pixel3d: 'block', '3d': 'smooth', anime: 'smooth' };
const LEVEL_RANK = { portal: 1, bridge: 2, merge: 3 };
const LEVEL_NAME = { portal: L('پورتال (دروازه)', 'Portal'), bridge: L('پل', 'Bridge'), merge: L('ادغام لبه‌ها', 'Merge edges') };
const TIER_NAME = { trial: L('آزمایشی', 'Trial'), special: L('ویژه', 'Special'), vip: 'VIP', expired: L('منقضی', 'Expired') };

let acc = W.acc, worlds = [], cur = null, newStyle = null, sel = new Set(), group = false, busy = false;

function toast(m, err) { const t = $('toast'); t.textContent = m; t.className = 'toast on' + (err ? ' err' : ''); clearTimeout(t._t); t._t = setTimeout(() => (t.className = 'toast'), 3600); }
async function api(path, method = 'GET', body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': W.csrf }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); throw new Error('login'); }
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

/* ------------------------------------------------------------------ engine */
const engine = new WorldEngine($('stage'), {
  vr: !!(acc && acc.vr), vrHost: $('vrHost'),
  onSector: (s, info) => { if (!cur || !cur.mine) return; if (info.locked) return toast(L('این بخش به سقف وسعت پلن تو رسیده است.', 'This sector reached your plan limit.'), true); pickSector(s); },
  onPortal: (id) => openWorld(id, true),
});
window.__wb = engine;   // handy for debugging from the console

/* ----------------------------------------------------------------- sidebar */
function planBox() {
  const box = $('planBox'); if (!box || !acc) return;
  const tier = acc.tier || 'expired';
  const left = acc.ends ? Math.max(0, Math.ceil((acc.ends * 1000 - Date.now()) / 86400000)) : null;
  const pct = acc.window_limit ? Math.min(100, (acc.window_used / acc.window_limit) * 100) : 0;
  box.innerHTML = `<div class="t"><b>${L('پلن جهان‌ساز', 'World plan')}</b><span class="tier ${tier}">${TIER_NAME[tier] || tier}</span></div>
    ${acc.ok ? `${acc.window_limit ? `<div class="bar"><i style="width:${pct}%"></i></div><small>${L('مصرف ۳ ساعت اخیر', 'Last 3 hours')}: ${acc.window_used} / ${acc.window_limit}</small>` : `<small>${L('بدون محدودیت (مدیر)', 'Unlimited (admin)')}</small>`}
      ${left !== null ? `<small style="display:block">${left} ${L('روز باقی‌مانده', 'days left')}${tier === 'trial' ? ` · ${L('سهمیه آزمایشی', 'trial units')}: ${acc.trial_left}` : ''}</small>` : ''}`
      : `<small>${L('دوره آزمایشی تمام شده است.', 'Your trial has ended.')}</small>`}
    ${tier !== 'vip' ? `<a class="up" href="/pricing">${tier === 'special' ? L('ارتقا به VIP', 'Upgrade to VIP') : L('خرید پلن', 'Get a plan')}</a>` : ''}`;
}
async function refreshMe() {
  if (!W.user) return;
  const me = await api('/api/me').catch(() => null); if (!me) return;
  acc = me.access; planBox();
  const pb = $('pendBadge'), nb = $('noteBadge');
  if (pb) { pb.hidden = !me.pending; pb.textContent = me.pending; }
  if (nb) { nb.hidden = !me.notes; nb.textContent = me.notes; }
}
async function loadList() {
  if (!W.user) { $('worldList').innerHTML = `<div class="hint" style="padding:8px 10px">${L('برای ساخت دنیا وارد شو.', 'Sign in to build worlds.')}</div>`; return; }
  worlds = (await api('/api/worlds').catch(() => ({ items: [] }))).items;
  $('worldList').innerHTML = worlds.map((w) => `<div class="w-item ${cur && cur.id === w.id ? 'on' : ''}" data-id="${w.id}">
      <span class="dot" style="background:${STYLE_COLOR[w.style]}"></span><span class="nm">${esc(w.name)}</span><small>${w.pieces}</small></div>`).join('')
    || `<div class="hint" style="padding:8px 10px">${L('هنوز دنیایی نساختی.', 'No worlds yet.')}</div>`;
}
$('worldList').addEventListener('click', (e) => { const it = e.target.closest('.w-item'); if (it) { openWorld(it.dataset.id); closeDrawer(); } });
$('newWorld').addEventListener('click', () => { newMode(); closeDrawer(); });
document.querySelectorAll('[data-panel]').forEach((b) => b.addEventListener('click', () => { panels[b.dataset.panel](); closeDrawer(); }));

const desktop = () => matchMedia('(min-width: 861px)').matches;
function setCollapsed(c) { document.body.classList.toggle('sb-collapsed', c); document.cookie = `bb_sb=${c ? 'c' : 'o'};path=/;max-age=31536000;samesite=lax`; setTimeout(() => engine.resize(), 240); }
function closeDrawer() { if (!desktop()) $('sb').classList.remove('open'); }
$('sbCollapse').addEventListener('click', () => (desktop() ? setCollapsed(true) : closeDrawer()));
$('menuBtn').addEventListener('click', () => (desktop() ? setCollapsed(false) : $('sb').classList.toggle('open')));
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); desktop() ? setCollapsed(!document.body.classList.contains('sb-collapsed')) : $('sb').classList.toggle('open'); } });

/* ---------------------------------------------------------------- composer */
const prompt = $('prompt');
prompt.addEventListener('input', () => { prompt.style.height = 'auto'; prompt.style.height = Math.min(180, prompt.scrollHeight) + 'px'; });
prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
$('send').addEventListener('click', send);
document.querySelectorAll('#examples button').forEach((b) => b.addEventListener('click', () => { prompt.value = b.textContent; prompt.focus(); prompt.dispatchEvent(new Event('input')); }));

function newMode() {
  cur = null; sel.clear(); history.replaceState(null, '', '/');
  $('hero').hidden = false; $('thread').innerHTML = ''; $('wTitle').textContent = L('جهان‌ساز هوش مصنوعی', 'AI World Builder');
  $('wStyle').hidden = $('wInfo').hidden = $('wActions').hidden = true; $('viewbar').hidden = true; $('composer').hidden = false;
  const avail = (acc && acc.styles) || [];
  if (!newStyle || !avail.includes(newStyle)) newStyle = avail[0] || '2d';
  $('cmpTools').innerHTML = `<div class="styles">${Object.keys(W.styles).map((k) => {
    const ok = avail.includes(k);
    return `<button type="button" class="st ${k === newStyle ? 'on' : ''} ${ok ? '' : 'locked'}" data-style="${k}" title="${ok ? '' : L('در پلن VIP', 'VIP plan')}"><i style="background:${STYLE_COLOR[k]}"></i>${esc(styleName(k))}${ok ? '' : ' 🔒'}</button>`;
  }).join('')}</div>`;
  $('cmpLeft').innerHTML = `<button type="button" class="pill on" id="pubToggle" aria-pressed="true">🌐 ${L('عمومی', 'Public')}</button>`;
  $('pubToggle').onclick = (e) => { const b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); b.classList.toggle('on', on); b.innerHTML = (on ? '🌐 ' + L('عمومی', 'Public') : '🔒 ' + L('خصوصی', 'Private')); };
  $('cmpTools').querySelectorAll('.st').forEach((b) => b.addEventListener('click', () => {
    if (b.classList.contains('locked')) { toast(L('این سبک در پلن VIP است.', 'This style is part of VIP.'), true); return; }
    newStyle = b.dataset.style; $('cmpTools').querySelectorAll('.st').forEach((x) => x.classList.toggle('on', x === b));
  }));
  prompt.placeholder = L('دنیایت را توصیف کن…', 'Describe your world…');
  $('cmpNote').textContent = W.user ? (acc && acc.ok ? L('هسته دنیا ساخته می‌شود؛ بعد آن را ۳۶۰ درجه گسترش می‌دهی.', 'The AI builds the core; then you grow it all around.') : L('دوره آزمایشی تمام شده؛ از «پلن‌ها» ادامه بده.', 'Your trial has ended; continue from Plans.')) : L('برای ساخت دنیا وارد شو — ۷ روز رایگان.', 'Sign in to build — 7 days free.');
  engine.showSeed(); loadList();
}

function expandMode() {
  $('composer').hidden = false; $('viewbar').hidden = true;
  const n = cur.sectors, max = (acc && acc.rings) || 0;
  $('cmpTools').innerHTML = `<div class="compass">${compassSvg(n, cur.next_rings, max)}<div class="cap" id="compCap"></div></div>`;
  $('cmpLeft').innerHTML = (acc && acc.group ? `<button type="button" class="pill ${group ? 'on' : ''}" id="groupBtn">⧉ ${L('توسعه دسته‌جمعی', 'Group expand')}</button>` : '')
    + `<button type="button" class="pill" id="undoBtn" title="${L('حذف آخرین بخش جهت انتخاب‌شده', 'Remove the outermost piece of the selected sector')}">↶ ${L('برگرداندن', 'Undo')}</button>`
    + `<button type="button" class="pill" id="connBtn">⇄ ${L('اتصال به دنیای دیگر', 'Connect')}</button>`;
  if ($('groupBtn')) $('groupBtn').onclick = () => { group = !group; if (!group && sel.size > 1) sel = new Set([[...sel][0]]); expandMode(); };
  $('undoBtn').onclick = undo; $('connBtn').onclick = () => panels.connect(cur);
  $('cmpTools').querySelectorAll('[data-sec]').forEach((p) => p.addEventListener('click', () => pickSector(+p.dataset.sec)));
  caption(); engine.setSelection([...sel]);
  prompt.placeholder = sel.size ? L('در این جهت چه چیزی ساخته شود؟', 'What should grow in this direction?') : L('یک جهت را روی قطب‌نما یا روی دنیا انتخاب کن…', 'Pick a direction on the compass or on the world…');
  $('cmpNote').textContent = L(`این دنیا ${n} جهت دارد؛ هر بار یک حلقه به جهت انتخاب‌شده اضافه می‌شود.`, `This world has ${n} directions; each request adds one ring to the chosen ones.`);
}
function compassSvg(n, next, max) {
  const r1 = 36, r0 = 13, c = 38; let out = `<svg viewBox="0 0 76 76" role="group" aria-label="sectors">`;
  for (let s = 0; s < n; s++) {
    const a0 = (s / n) * Math.PI * 2, a1 = ((s + 1) / n) * Math.PI * 2, pt = (a, r) => `${c + Math.cos(a) * r},${c + Math.sin(a) * r}`;
    const nr = next ? next[s] : 1, locked = max && nr > max, on = sel.has(s);
    const fill = on ? '#ED1908' : locked ? '#2a2638' : '#5a2ea0';
    out += `<path data-sec="${s}" d="M${pt(a0, r0)} L${pt(a0, r1)} A${r1},${r1} 0 0 1 ${pt(a1, r1)} L${pt(a1, r0)} A${r0},${r0} 0 0 0 ${pt(a0, r0)}Z" fill="${fill}" stroke="#0b0913" stroke-width="1.5"><title>${s + 1} · ${L('حلقه', 'ring')} ${nr}${locked ? ' 🔒' : ''}</title></path>`;
    const am = (a0 + a1) / 2; out += `<text x="${c + Math.cos(am) * 25}" y="${c + Math.sin(am) * 25 + 3}" text-anchor="middle" font-size="${n > 6 ? 8 : 10}" fill="#fff" pointer-events="none">${s + 1}</text>`;
  }
  return out + `<circle cx="${c}" cy="${c}" r="${r0 - 2}" fill="#B266FF"/></svg>`;
}
function caption() {
  const cap = $('compCap'); if (!cap) return;
  const list = [...sel].sort((a, b) => a - b);
  cap.innerHTML = list.length ? `<b>${L('جهت', 'Direction')} ${list.map((s) => s + 1).join('، ')}</b><br>${L('حلقه بعدی', 'next ring')}: ${list.map((s) => cur.next_rings[s]).join('، ')}`
    : `${L('جهت توسعه را انتخاب کن', 'Choose where to grow')}<br><span class="hint">${cur.sectors === 9 ? L('۹ بخش · VIP', '9 sectors · VIP') : L('۳ بخش', '3 sectors')}</span>`;
}
function pickSector(s) {
  const max = (acc && acc.rings) || 0;
  if (max && cur.next_rings[s] > max && !(W.user && W.user.admin)) { toast(L('این جهت به سقف وسعت پلن رسیده است.', 'This direction reached your plan limit.'), true); return; }
  if (group) { sel.has(s) ? sel.delete(s) : sel.add(s); } else { sel = sel.has(s) && sel.size === 1 ? new Set() : new Set([s]); }
  expandMode(); engine.focusSector(s); prompt.focus();
}

async function send() {
  if (busy) return;
  if (!W.user) { location.href = '/login?next=' + encodeURIComponent(location.pathname); return; }
  const text = prompt.value.trim();
  if (!cur) {
    if (!text) { prompt.focus(); return; }
    await run(async () => {
      const pub = $('pubToggle') ? $('pubToggle').getAttribute('aria-pressed') === 'true' : true;
      $('hero').hidden = true; bubble('user', text); waiting(L('هوش مصنوعی در حال ساخت هسته دنیاست…', 'The AI is shaping the core of your world…'));
      const j = await api('/api/worlds', 'POST', { prompt: text, style: newStyle, public: pub });
      prompt.value = ''; await openWorld(j.id); toast(L('دنیای تو ساخته شد ✨', 'Your world is born ✨'));
    });
    return;
  }
  if (!cur.mine) return;
  if (!sel.size) { toast(L('اول یک جهت را انتخاب کن.', 'Pick a direction first.'), true); return; }
  await run(async () => {
    bubble('user', text || L('ادامه بده', 'Continue'), [...sel].map((s) => `${L('جهت', 'dir')} ${s + 1}`).join(' · '));
    waiting(L('در حال گسترش دنیا…', 'Growing the world…'));
    await api(`/api/worlds/${cur.id}/expand`, 'POST', { sectors: [...sel], prompt: text });
    prompt.value = ''; const keep = [...sel]; await openWorld(cur.id); sel = new Set(keep.filter((s) => cur.next_rings[s] <= (acc.rings || 99))); expandMode();
  });
}
async function run(fn) {
  busy = true; $('send').disabled = true;
  try { await fn(); } catch (e) { if (e.message !== 'login') { unwait(); bubble('sys', e.message); toast(e.message, true); } }
  finally { busy = false; $('send').disabled = false; unwait(); refreshMe(); }
}

/* ----------------------------------------------------------------- thread */
function bubble(kind, text, meta, title) {
  const d = document.createElement('div'); d.className = 'msg ' + kind;
  d.innerHTML = (title ? `<b>${esc(title)}</b>` : '') + esc(text) + (meta ? `<div class="meta">${esc(meta)}</div>` : '');
  $('thread').appendChild(d); $('thread').scrollTop = 1e9;
}
function waiting(t) { unwait(); const d = document.createElement('div'); d.className = 'msg ai wait'; d.id = 'waitMsg'; d.innerHTML = `<span class="spin"></span>${esc(t)}`; $('thread').appendChild(d); $('thread').scrollTop = 1e9; }
function unwait() { const w = $('waitMsg'); if (w) w.remove(); }
function renderThread(w) {
  $('thread').innerHTML = '';
  for (const s of w.sections) {
    if (s.prompt) bubble('user', s.prompt, s.ring ? `${L('جهت', 'dir')} ${s.sector + 1} · ${L('حلقه', 'ring')} ${s.ring}` : L('هسته', 'core'));
    bubble('ai', s.spec.summary || '', s.spec.landmark && s.spec.landmark.name ? '★ ' + s.spec.landmark.name : '', s.spec.title || '');
  }
  for (const c of w.connections || []) bubble('ai', (c.bridge && c.bridge.description) || '', `${LEVEL_NAME[c.level] || c.level} · ${L('جهت', 'dir')} ${c.my_sector + 1}`, '⇄ ' + c.world.name);
}

/* ----------------------------------------------------------------- worlds */
async function openWorld(id, travel) {
  const w = await api('/api/worlds/' + id).catch((e) => { toast(e.message, true); return null; }); if (!w) return;
  cur = w; $('hero').hidden = true;
  if (!w.mine) sel.clear();
  history.replaceState(null, '', w.mine ? '/?w=' + w.id : '/w/' + w.id);
  $('wTitle').textContent = w.name;
  $('wStyle').hidden = false; $('wStyle').innerHTML = `<i style="width:9px;height:9px;border-radius:3px;background:${STYLE_COLOR[w.style]}"></i>${esc(styleName(w.style))}`;
  $('wInfo').hidden = false; $('wInfo').textContent = `${w.sections.length} ${L('بخش', 'pieces')} · ${w.sectors} ${L('جهت', 'dirs')}${w.mine ? '' : ' · @' + w.owner}`;
  $('wActions').hidden = false; $('aSettings').hidden = !w.mine;
  engine.setConnections(w.connections || []);
  engine.load(w, w.connections || [], { editable: w.mine, sectorsInfo: { maxRing: W.user && W.user.admin ? 0 : (acc && acc.rings) || 0 } });
  renderThread(w);
  if (w.mine) expandMode(); else viewMode(w);
  loadList();
  if (travel) toast(L('به ', 'Travelled to ') + w.name + L(' سفر کردی', ''));
}
function viewMode(w) {
  $('composer').hidden = true; $('viewbar').hidden = false;
  $('viewbar').innerHTML = `<span class="chip">${L('دنیای', 'World by')} @${esc(w.owner)}</span>`
    + (W.user && w.connectable ? `<button class="btn p sm" id="vConnect">⇄ ${L('وصل کردن به دنیای من', 'Connect to my world')}</button>` : '')
    + (W.user ? `<button class="btn sm" id="vMine">${L('دنیاهای من', 'My worlds')}</button>` : `<a class="btn p sm" href="/login?next=${encodeURIComponent(location.pathname)}">${L('ورود و ساخت دنیای خودم', 'Sign in & build my own')}</a>`);
  if ($('vConnect')) $('vConnect').onclick = () => panels.connect(null, w);
  if ($('vMine')) $('vMine').onclick = () => (worlds[0] ? openWorld(worlds[0].id) : newMode());
  $('cmpNote').textContent = L('روی دنیاهای متصل یا پورتال‌ها کلیک کن تا به آن‌ها سفر کنی.', 'Click connected worlds or portals to travel to them.');
}
async function undo() {
  const s = [...sel][0]; if (s === undefined) return toast(L('اول جهت را انتخاب کن.', 'Pick a direction first.'), true);
  const ring = cur.next_rings[s] - 1; if (ring < 1) return toast(L('در این جهت چیزی برای برگرداندن نیست.', 'Nothing to undo in this direction.'), true);
  if (!confirm(L(`حلقه ${ring} در جهت ${s + 1} حذف شود؟`, `Remove ring ${ring} in direction ${s + 1}?`))) return;
  try { await api(`/api/worlds/${cur.id}/sections/${s}/${ring}`, 'DELETE'); await openWorld(cur.id); sel = new Set([s]); expandMode(); } catch (e) { toast(e.message, true); }
}

$('aShare').onclick = () => { const url = W.world + '/w/' + cur.id; navigator.clipboard ? navigator.clipboard.writeText(url).then(() => toast(L('لینک کپی شد', 'Link copied'))) : window.prompt('', url); };
$('aFile').onclick = () => { location.href = `/api/worlds/${cur.id}/file`; };
$('aShot').onclick = () => { const a = document.createElement('a'); a.href = engine.snapshot(); a.download = (cur.name || 'world') + '.png'; a.click(); };
$('aSettings').onclick = () => panels.settings(cur);

/* ----------------------------------------------------------------- panels */
function modal(title, html) { $('mTitle').textContent = title; $('mBody').innerHTML = html; $('modal').hidden = false; return $('mBody'); }
const closeModal = () => { $('modal').hidden = true; };
$('mClose').onclick = closeModal; $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

const panels = {
  async explore() {
    const body = modal(L('کاوش دنیاها', 'Explore worlds'), `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <input class="input" id="exQ" placeholder="${L('جستجو…', 'Search…')}" style="flex:1;min-width:160px">
      <select class="input" id="exS" style="width:auto"><option value="">${L('همه سبک‌ها', 'All styles')}</option>${Object.keys(W.styles).map((k) => `<option value="${k}">${esc(styleName(k))}</option>`).join('')}</select></div>
      <div class="grid-w" id="exList"></div>`);
    const go = async () => {
      const j = await api(`/api/explore?q=${encodeURIComponent($('exQ').value)}&style=${$('exS').value}`).catch(() => ({ items: [] }));
      $('exList').innerHTML = j.items.map((w) => `<div class="wcard" data-id="${w.id}"><b>${esc(w.name)}</b><p>${esc(w.description)}</p>
        <div class="row"><span class="chip"><i style="width:8px;height:8px;border-radius:2px;background:${STYLE_COLOR[w.style]};display:inline-block"></i>${esc(styleName(w.style))}</span>
        <span>@${esc(w.owner)}</span><span>· ${w.pieces} ${L('بخش', 'pieces')}</span></div></div>`).join('') || `<p class="hint">${L('چیزی پیدا نشد.', 'Nothing found.')}</p>`;
      body.querySelectorAll('.wcard').forEach((c) => c.onclick = () => { closeModal(); openWorld(c.dataset.id); });
    };
    let t; $('exQ').oninput = () => { clearTimeout(t); t = setTimeout(go, 300); }; $('exS').onchange = go; go();
  },

  async connections() {
    const body = modal(L('اتصال دنیاها', 'World connections'), `<p class="hint" style="margin-top:0">${L('دو دنیا با تأیید هر دو مالک به هم وصل می‌شوند. هر مالک حداکثر سطح اتصالی را که قبول دارد تعیین می‌کند و سطح کمتر اعمال می‌شود: پورتال برای همه سبک‌ها، پل برای سبک‌های هم‌خانواده یا بلوکی↔سه‌بعدی، ادغام لبه‌ها فقط برای هم‌خانواده‌ها. بعد از تأیید، دو ایجنت سازنده با هم پل اتصال را می‌سازند.', 'Two worlds connect when both owners approve. Each owner sets the most they allow and the lower level wins: portals work between any styles, bridges between the same family or blocky↔3D, edge merges only within a family. After approval the two builder agents design the connection together.')}</p><div id="cnList"><div class="spin"></div></div>`);
    const j = await api('/api/connections').catch((e) => ({ items: [], error: e.message }));
    const lvlPick = (name, max, val) => `<div class="lvl">${Object.keys(LEVEL_RANK).map((k) => `<label class="${LEVEL_RANK[k] > LEVEL_RANK[max] ? 'off' : ''}"><input type="radio" name="${name}" value="${k}" ${k === val ? 'checked' : ''}>${LEVEL_NAME[k]}</label>`).join('')}</div>`;
    $('cnList').innerHTML = j.items.map((c) => {
      const head = `<div class="t"><b>${esc(c.a.name)}</b> <small>@${esc(c.a.user)} · ${esc(styleName(c.a.style))} · ${L('جهت', 'dir')} ${c.a.sector + 1}</small><br>⇄ <b>${esc(c.b.name)}</b> <small>@${esc(c.b.user)} · ${esc(styleName(c.b.style))} · ${L('جهت', 'dir')} ${c.b.sector + 1}</small>
        ${c.note ? `<br><small style="color:#ff9a90">${esc(c.note)}</small>` : ''}</div>`;
      if (c.incoming) return `<div class="conn">${head}<div style="width:100%">${L('درخواست', 'Requested')}: ${LEVEL_NAME[c.a_level]} · ${L('سطح موافقت تو', 'Your level')}:
        ${lvlPick('lv' + c.id, c.max_level, LEVEL_RANK[c.a_level] <= LEVEL_RANK[c.max_level] ? c.a_level : c.max_level)}
        <div style="display:flex;gap:6px;margin-top:8px"><button class="btn p sm" data-acc="${c.id}">✓ ${L('تأیید و ساخت اتصال', 'Approve & build')}</button><button class="btn sm d" data-rej="${c.id}">✕ ${L('رد', 'Decline')}</button></div></div></div>`;
      return `<div class="conn">${head}<span class="chip">${c.status === 'active' ? '✓ ' + (LEVEL_NAME[c.level] || '') : c.status === 'building' ? L('در حال ساخت…', 'building…') : L('در انتظار تأیید', 'awaiting approval')}</span>
        <button class="btn sm" data-open="${c.a.id}">${L('مشاهده', 'View')}</button><button class="btn sm d" data-del="${c.id}">${L('حذف', 'Remove')}</button></div>`;
    }).join('') || `<p class="hint">${L('هنوز اتصالی نداری. از «کاوش دنیاها» یک دنیا انتخاب کن و «وصل کردن» را بزن.', 'No connections yet. Open a world from Explore and choose “Connect”.')}</p>`;
    body.querySelectorAll('[data-acc]').forEach((b) => b.onclick = async () => {
      const id = b.dataset.acc, lv = (body.querySelector(`input[name=lv${id}]:checked`) || {}).value || 'portal';
      b.disabled = true; b.innerHTML = `<span class="spin"></span> ${L('ایجنت‌ها در حال ساخت اتصال…', 'Agents are building…')}`;
      try { const r = await api(`/api/connections/${id}/answer`, 'POST', { accept: true, level: lv }); toast(L('وصل شد: ', 'Connected: ') + LEVEL_NAME[r.level]); panels.connections(); refreshMe(); if (cur) openWorld(cur.id); } catch (e) { toast(e.message, true); b.disabled = false; }
    });
    body.querySelectorAll('[data-rej]').forEach((b) => b.onclick = async () => { await api(`/api/connections/${b.dataset.rej}/answer`, 'POST', { accept: false }).catch((e) => toast(e.message, true)); panels.connections(); refreshMe(); });
    body.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm(L('این اتصال حذف شود؟', 'Remove this connection?'))) return; await api(`/api/connections/${b.dataset.del}`, 'DELETE').catch((e) => toast(e.message, true)); panels.connections(); if (cur) openWorld(cur.id); });
    body.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { closeModal(); openWorld(b.dataset.open); });
  },

  async connect(mine, target) {
    if (!W.user) { location.href = '/login'; return; }
    if (!worlds.length) await loadList();
    if (!worlds.length) { toast(L('اول یک دنیا بساز.', 'Build a world first.'), true); return; }
    let other = target;
    const body = modal(L('اتصال دو دنیا', 'Connect two worlds'), `<div class="two">
      <div><label class="field"><span>${L('دنیای من', 'My world')}</span><select class="input" id="cA">${worlds.map((w) => `<option value="${w.id}" ${mine && mine.id === w.id ? 'selected' : ''}>${esc(w.name)} · ${esc(styleName(w.style))}</option>`).join('')}</select></label>
        <label class="field"><span>${L('از جهت', 'From direction')}</span><select class="input" id="cAs"></select></label></div>
      <div><label class="field"><span>${L('دنیای مقصد', 'Target world')}</span>${other ? `<input class="input" value="${esc(other.name)} · @${esc(other.owner)}" disabled>` : `<input class="input" id="cBq" placeholder="${L('نام دنیا را جستجو کن…', 'Search a world…')}"><div id="cBres" class="hint"></div>`}</label>
        <label class="field"><span>${L('به جهت', 'To direction')}</span><select class="input" id="cBs"></select></label></div></div>
      <div class="field"><span>${L('حداکثر سطح اتصالی که قبول داری', 'The most you allow')}</span><div id="cLv"></div></div>
      <p class="hint" id="cHint"></p><button class="btn p" id="cGo">⇄ ${L('ارسال درخواست اتصال', 'Send connection request')}</button>`);
    const secOpts = (n) => Array.from({ length: n }, (_, i) => `<option value="${i}">${L('جهت', 'Direction')} ${i + 1}</option>`).join('');
    const refresh = () => {
      const a = worlds.find((w) => w.id === $('cA').value); $('cAs').innerHTML = secOpts(a.sectors);
      if (other) $('cBs').innerHTML = secOpts(other.sectors);
      const max = !other ? 'portal' : (FAMILY[a.style] === FAMILY[other.style] ? 'merge' : (new Set([FAMILY[a.style], FAMILY[other.style]]).has('block') && new Set([FAMILY[a.style], FAMILY[other.style]]).has('smooth') ? 'bridge' : 'portal'));
      $('cLv').innerHTML = `<div class="lvl">${Object.keys(LEVEL_RANK).map((k) => `<label class="${LEVEL_RANK[k] > LEVEL_RANK[max] ? 'off' : ''}"><input type="radio" name="cl" value="${k}" ${k === max ? 'checked' : ''}>${LEVEL_NAME[k]}</label>`).join('')}</div>`;
      $('cHint').textContent = other ? L(`حداکثر سطح ممکن بین «${styleName(a.style)}» و «${styleName(other.style)}»: ${LEVEL_NAME[max]}. مالک دنیای مقصد هم سطح خودش را انتخاب می‌کند.`, `Highest possible between ${styleName(a.style)} and ${styleName(other.style)}: ${LEVEL_NAME[max]}. The other owner picks their level too.`) : '';
    };
    $('cA').onchange = refresh; refresh();
    if (!other) {
      let t; $('cBq').oninput = () => { clearTimeout(t); t = setTimeout(async () => {
        const j = await api('/api/explore?q=' + encodeURIComponent($('cBq').value)).catch(() => ({ items: [] }));
        $('cBres').innerHTML = j.items.filter((w) => w.id !== $('cA').value && w.connectable).slice(0, 8).map((w) => `<a href="#" data-pick="${w.id}">${esc(w.name)} · @${esc(w.owner)}</a>`).join(' · ');
        $('cBres').querySelectorAll('[data-pick]').forEach((x) => x.onclick = (e) => { e.preventDefault(); other = j.items.find((w) => w.id === x.dataset.pick); $('cBq').value = other.name; refresh(); });
      }, 300); };
    }
    $('cGo').onclick = async () => {
      if (!other) return toast(L('دنیای مقصد را انتخاب کن.', 'Pick the target world.'), true);
      const b = $('cGo'); b.disabled = true;
      try {
        const r = await api('/api/connections', 'POST', { a_world: $('cA').value, a_sector: +$('cAs').value, b_world: other.id, b_sector: +$('cBs').value, level: (body.querySelector('input[name=cl]:checked') || {}).value });
        closeModal(); toast(r.status === 'active' ? L('دو دنیای تو وصل شدند ✨', 'Your two worlds are connected ✨') : L('درخواست برای مالک ارسال شد.', 'Request sent to the owner.'));
        openWorld($('cA').value);
      } catch (e) { toast(e.message, true); b.disabled = false; }
    };
  },

  async notes() {
    const j = await api('/api/notes').catch(() => ({ items: [] }));
    modal(L('اعلان‌ها', 'Notifications'), j.items.map((n) => `<div class="note-row">${n.link ? `<a href="${esc(n.link)}">${esc(n.text)}</a>` : esc(n.text)}<small>${new Date(n.at * 1000).toLocaleString(EN ? 'en-GB' : 'fa-IR')}</small></div>`).join('') || `<p class="hint">${L('اعلانی نداری.', 'No notifications.')}</p>`);
    refreshMe();
  },

  settings(w) {
    const body = modal(L('تنظیمات دنیا', 'World settings'), `<label class="field"><span>${L('نام', 'Name')}</span><input class="input" id="sName" value="${esc(w.name)}" maxlength="60"></label>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="sPub" ${w.public ? 'checked' : ''}> ${L('عمومی (در کاوش دیده شود)', 'Public (listed in Explore)')}</label>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="sCon" ${w.connectable ? 'checked' : ''}> ${L('دیگران بتوانند درخواست اتصال بدهند', 'Others may request connections')}</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn p" id="sSave">${L('ذخیره', 'Save')}</button><span class="sp"></span><button class="btn d" id="sDel">${L('حذف دنیا', 'Delete world')}</button></div>`);
    $('sSave').onclick = async () => { try { await api('/api/worlds/' + w.id, 'PATCH', { name: $('sName').value, public: $('sPub').checked, connectable: $('sCon').checked }); closeModal(); openWorld(w.id); toast(L('ذخیره شد', 'Saved')); } catch (e) { toast(e.message, true); } };
    $('sDel').onclick = async () => { if (!confirm(L('این دنیا برای همیشه حذف شود؟', 'Delete this world forever?'))) return; await api('/api/worlds/' + w.id, 'DELETE').catch((e) => toast(e.message, true)); closeModal(); newMode(); };
  },
};

/* ------------------------------------------------------------------- start */
planBox();
(async () => {
  await loadList(); refreshMe();
  if (W.view || W.open) await openWorld(W.view || W.open);
  else if (worlds.length) await openWorld(worlds[0].id);
  else newMode();
  if (W.panel && panels[W.panel]) panels[W.panel]();
  if (W.paid) toast(L('پلن جهان‌ساز فعال شد 🎉', 'Your World Builder plan is active 🎉'));
  setInterval(refreshMe, 60000);
})();
