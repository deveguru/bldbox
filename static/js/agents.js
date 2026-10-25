/* Custom agent builder: connect capabilities into a pipeline, set model, prompt and knowledge */
(function () {
  const CSRF = window.__CSRF;
  const $ = (s) => document.querySelector(s);
  const CAPS = Object.fromEntries((window.__CAPS || []).map(c => [c.key, c]));
  const agents = window.__AGENTS || [];
  const toast = (m, k) => (window.BB && BB.toast ? BB.toast(m, k) : alert(m));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const EN = (window.__LANG || 'fa') === 'en';
  const L = (fa, en) => (EN ? en : fa);
  let cur = null;           // agent being edited (null = new)
  let flow = ['chat'];

  function renderFlow() {
    $('#agFlow').innerHTML = flow.map((k, i) => {
      const c = CAPS[k] || { name: k, icon: '•', desc: '' };
      const fixed = k === 'chat';
      return `${i ? '<div class="ag-link"><i></i></div>' : '<div class="ag-start">' + L('ورودی کاربر', 'User input') + '</div><div class="ag-link"><i></i></div>'}
        <div class="ag-node ${fixed ? 'fixed' : ''}" data-i="${i}">
          <span class="ag-node-ic">${c.icon}</span>
          <div class="ag-node-t"><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></div>
          ${fixed ? '<span class="tiny dim">' + L('پایه', 'base') + '</span>' : `<div class="ag-node-x">
            <button type="button" data-mv="-1" title="${L('بالا', 'Up')}" ${i <= 1 ? 'disabled' : ''}>▲</button>
            <button type="button" data-mv="1" title="${L('پایین', 'Down')}" ${i === flow.length - 1 ? 'disabled' : ''}>▼</button>
            <button type="button" data-rm title="${L('حذف', 'Remove')}">✕</button></div>`}
        </div>`;
    }).join('') + '<div class="ag-link"><i></i></div><div class="ag-start end">' + L('پاسخ ایجنت', 'Agent answer') + '</div>';
    document.querySelectorAll('#agPalette .ag-chip').forEach(b => b.classList.toggle('used', flow.includes(b.dataset.key)));
  }

  function setAvatar(url, name) {
    $('#agAvInner').innerHTML = url ? `<img src="${esc(url)}" alt="">` : esc((name || '✦')[0]);
  }

  function open(a) {
    cur = a || null;
    $('#agEditor').hidden = false;
    $('#agName').value = a ? a.name : '';
    $('#agDesc').value = a ? a.description : '';
    $('#agPrompt').value = a ? a.system_prompt : '';
    $('#agKnow').value = a ? a.knowledge : '';
    $('#agModel').value = a ? a.model : '';
    flow = a ? a.flow.slice() : ['chat', 'web'];
    if (!flow.includes('chat')) flow.unshift('chat');
    setAvatar(a && a.avatar, a && a.name);
    $('#agChat').hidden = !a; if (a) $('#agChat').href = '/?agent=' + a.id;
    $('#agDel').hidden = !a;
    $('#agKHint').textContent = a ? '' : L('برای افزودن فایل، اول ایجنت را ذخیره کن.', 'Save the agent first to add files.');
    knowChars();
    document.querySelectorAll('.ag-card').forEach(c => c.classList.toggle('on', !!a && c.dataset.id === a.id));
    renderFlow();
    if (window.innerWidth < 860) $('#agEditor').scrollIntoView({ behavior: 'smooth' });
  }
  function knowChars() { const n = $('#agKnow').value.length; $('#agKChars').textContent = n ? '(' + n.toLocaleString(EN ? 'en-US' : 'fa-IR') + L(' نویسه)', ' chars)') : ''; }

  $('#agPalette').addEventListener('click', e => {
    const b = e.target.closest('.ag-chip'); if (!b) return;
    const k = b.dataset.key;
    if (flow.includes(k)) flow = flow.filter(x => x !== k); else flow.push(k);
    if (k === 'knowledge' && flow.includes(k)) $('#agKnow').focus();
    renderFlow();
  });
  $('#agFlow').addEventListener('click', e => {
    const node = e.target.closest('.ag-node'); if (!node) return;
    const i = +node.dataset.i;
    if (e.target.closest('[data-rm]')) flow.splice(i, 1);
    const mv = e.target.closest('[data-mv]');
    if (mv) { const j = i + (+mv.dataset.mv); if (j >= 1 && j < flow.length) [flow[i], flow[j]] = [flow[j], flow[i]]; }
    renderFlow();
  });
  $('#agKnow').addEventListener('input', knowChars);

  async function save() {
    const body = { id: cur ? cur.id : '', name: $('#agName').value.trim(), description: $('#agDesc').value.trim(),
                   system_prompt: $('#agPrompt').value, knowledge: $('#agKnow').value, model: $('#agModel').value, flow };
    if (!body.name) { toast(L('نام ایجنت را بنویس', 'Enter an agent name'), 'err'); $('#agName').focus(); return null; }
    const r = await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.error || L('خطا', 'Error'), 'err'); return null; }
    toast(L('ذخیره شد', 'Saved'));
    const isNew = !cur;
    cur = j.agent;
    if (isNew) { location.href = '/agents?a=' + cur.id; return cur; }
    const card = document.querySelector(`.ag-card[data-id="${cur.id}"]`);
    if (card) { card.querySelector('b').textContent = cur.name; card.querySelector('small').textContent = cur.description || L('بدون توضیح', 'No description'); }
    $('#agChat').hidden = false; $('#agChat').href = '/?agent=' + cur.id;
    return cur;
  }
  $('#agSave').addEventListener('click', save);
  $('#agNew').addEventListener('click', () => open(null));
  $('#agList').addEventListener('click', e => {
    if (e.target.closest('a')) return;
    const c = e.target.closest('.ag-card'); if (!c) return;
    open(agents.find(a => a.id === c.dataset.id));
  });
  $('#agDel').addEventListener('click', async () => {
    if (!cur || !confirm(L('این ایجنت حذف شود؟', 'Delete this agent?'))) return;
    await fetch('/api/agents/' + cur.id, { method: 'DELETE', headers: { 'X-CSRF-Token': CSRF } });
    location.href = '/agents';
  });
  $('#agKFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!cur) { toast(L('اول ایجنت را ذخیره کن', 'Save the agent first'), 'err'); return; }
    $('#agKHint').textContent = L('در حال خواندن ', 'Reading ') + f.name + '…';
    const fd = new FormData(); fd.append('file', f);
    const r = await fetch(`/api/agents/${cur.id}/knowledge`, { method: 'POST', headers: { 'X-CSRF-Token': CSRF }, body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $('#agKHint').textContent = ''; toast(j.error || L('خطا', 'Error'), 'err'); return; }
    $('#agKnow').value = j.knowledge; knowChars();
    if (!flow.includes('knowledge')) { flow.push('knowledge'); renderFlow(); }
    $('#agKHint').textContent = '✓ ' + f.name + L(' اضافه شد', ' added');
  });
  $('#agAvFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const a = cur || await save(); if (!a) return;
    const fd = new FormData(); fd.append('file', f);
    const r = await fetch(`/api/agents/${a.id}/avatar`, { method: 'POST', headers: { 'X-CSRF-Token': CSRF }, body: fd });
    const j = await r.json().catch(() => ({}));
    if (j.avatar) { setAvatar(j.avatar); const card = document.querySelector(`.ag-card[data-id="${a.id}"] .ag-av`); if (card) card.innerHTML = `<img src="${esc(j.avatar)}" alt="">`; }
    else toast(j.error || L('خطا', 'Error'), 'err');
  });

  const first = agents.find(a => a.id === window.__CURRENT);
  if (first) open(first);
  else if (!agents.length) open(null);
})();
