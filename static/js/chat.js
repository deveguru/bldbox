/* BldBox chat playground — streaming, typing animation, voice, previews */
(function () {
  const CSRF = window.__CSRF;
  const $ = (s) => document.querySelector(s);
  const messagesEl = $('#messages');
  const input = $('#input');
  const sendBtn = $('#sendBtn');
  const attachBtn = $('#attachBtn');
  const fileInput = $('#fileInput');
  const attachList = $('#attachList');
  const toolStrip = $('#toolStrip');
  const statusLine = $('#statusLine');
  const titleEl = $('#chatTitle');
  const micBtn = $('#micBtn');
  const LOGO = window.__LOGO || '';
  const GUEST = !!window.__GUEST;
  const chatMain = $('#chatMain');
  const NOTE = statusLine ? statusLine.textContent : '';

  /* ---------- guest store: conversations live only in this browser ---------- */
  const GS = {
    KEY: 'bb_guest_chats_v1',
    all() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
    save(list) { try { localStorage.setItem(this.KEY, JSON.stringify(list.slice(0, 50))); } catch (e) {} },
    get(id) { return this.all().find(c => c.id === id); },
    create(title) {
      const c = { id: 'g_' + Math.random().toString(36).slice(2, 10), title: (title || '').slice(0, 60), messages: [], t: Date.now() };
      this.save([c, ...this.all()]); return c;
    },
    push(id, role, content) {
      const list = this.all(); const c = list.find(x => x.id === id);
      if (!c) return;
      c.messages.push({ role, content }); c.t = Date.now();
      this.save([c, ...list.filter(x => x.id !== id)]);
    },
    remove(id) { this.save(this.all().filter(c => c.id !== id)); },
  };

  let convId = window.__CONV || null;
  let busy = false;
  let attachments = [];
  const L = window.__LANG;
  const TXT = {
    thinking: L === 'fa' ? 'در حال فکر کردن…' : 'Thinking…',
    ready: L === 'fa' ? 'آماده' : 'Ready',
    error: L === 'fa' ? 'خطا' : 'Error',
    uploadFail: L === 'fa' ? 'آپلود ناموفق' : 'Upload failed',
    noKey: L === 'fa' ? 'کلید API تنظیم نشده؛ به مدیر بگو.' : 'API key not configured; ask the admin.',
    listening: L === 'fa' ? 'در حال شنیدن…' : 'Listening…',
    transcribing: L === 'fa' ? 'تبدیل صدا به متن…' : 'Transcribing…',
    voiceFail: L === 'fa' ? 'ورودی صوتی در دسترس نیست' : 'Voice input unavailable',
    preview: L === 'fa' ? 'پیش‌نمایش' : 'Preview',
    close: L === 'fa' ? 'بستن' : 'Close',
    stop: L === 'fa' ? 'توقف' : 'Stop',
    copied: L === 'fa' ? 'کپی شد' : 'Copied',
    copy: L === 'fa' ? 'کپی' : 'Copy',
    retry: L === 'fa' ? 'تلاش مجدد' : 'Retry',
    auto: L === 'fa' ? 'انتخاب خودکار بهترین مدل' : 'Best model, chosen automatically',
    premium: L === 'fa' ? 'پلن حرفه‌ای' : 'Pro plan',
  };

  /* ---------- markdown helpers ---------- */
  function md(text) {
    if (window.BB && BB.md) return BB.md(text);
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML.replace(/\n/g, '<br>');
  }
  function highlight(el) { if (window.BB && BB.enhanceCode) BB.enhanceCode(el); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtSize(n) {
    n = Number(n || 0);
    if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n > 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  function scrollBottom(force) {
    const near = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 240;
    if (force || near) messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function removeWelcome() {
    if (chatMain) chatMain.classList.remove('is-empty');
  }

  /* ---------- message rendering ---------- */
  const ICON_COPY = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const ICON_RETRY = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
  const ICON_OK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  function avatarHtml() {
    // circular AI avatar, no background, sits directly above the AI message
    return `<div class="ai-head"><div class="who logo-who">${LOGO ? `<img src="${esc(LOGO)}" alt="AI">` : '<span>✦</span>'}</div></div>`;
  }
  function actionsHtml(role) {
    return `<div class="msg-actions">
      <button class="ma" type="button" data-act="copy" title="${TXT.copy}">${ICON_COPY}</button>
      ${role === 'assistant' ? `<button class="ma retry" type="button" data-act="retry" title="${TXT.retry}">${ICON_RETRY}</button><span class="ma-model"></span>` : ''}
    </div>`;
  }
  function markLastAssistant() {
    const all = messagesEl.querySelectorAll('.msg.assistant .msg-actions');
    all.forEach((el, i) => el.classList.toggle('last', i === all.length - 1));
  }

  function isImage(a) { return (a.mime || '').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.name || ''); }
  function renderAtts(el, atts) {
    el.innerHTML = '';
    (atts || []).forEach(a => {
      if (isImage(a) && (a.preview || a.url)) {
        const img = document.createElement('img');
        img.src = a.preview || a.url; img.alt = a.name || ''; img.loading = 'lazy';
        img.addEventListener('click', () => openPreview(a.url || a.preview, 'img', a.name));
        el.appendChild(img);
      } else {
        const c = document.createElement('span');
        c.className = 'att-chip';
        c.textContent = '📎 ' + (a.name || '');
        el.appendChild(c);
      }
    });
  }

  function addUserMessage(text, atts) {
    removeWelcome();
    const wrap = document.createElement('div');
    wrap.className = 'msg user';
    wrap.innerHTML = (atts && atts.length ? '<div class="msg-atts"></div>' : '') +
      (text ? `<div class="bubble"><div class="content"></div></div>` : '') + actionsHtml('user');
    if (atts && atts.length) renderAtts(wrap.querySelector('.msg-atts'), atts);
    if (text) {
      const c = wrap.querySelector('.content');
      c.innerHTML = md(text); c.dataset.raw = text;
      highlight(wrap);
    }
    messagesEl.appendChild(wrap);
    scrollBottom(true);
    return wrap;
  }

  function addAssistantMessage() {
    removeWelcome();
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    wrap.innerHTML = `${avatarHtml()}
      <div class="bubble">
        <div class="content"><span class="typing"><i></i><i></i><i></i></span></div>
        <div class="files-row"></div>
      </div>${actionsHtml('assistant')}`;
    messagesEl.appendChild(wrap);
    markLastAssistant();
    scrollBottom(true);
    return wrap;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) {}
      ta.remove(); return ok;
    }
  }

  messagesEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const msg = btn.closest('.msg');
    if (btn.dataset.act === 'copy') {
      const c = msg.querySelector('.content');
      const text = (c && (c.dataset.raw || c.innerText)) || '';
      if (text && await copyText(text)) {
        btn.innerHTML = ICON_OK; btn.classList.add('done');
        setTimeout(() => { btn.innerHTML = ICON_COPY; btn.classList.remove('done'); }, 1400);
        toast(TXT.copied);
      }
    } else if (btn.dataset.act === 'retry') {
      if (busy) return;
      const all = [...messagesEl.querySelectorAll('.msg.assistant')];
      if (all[all.length - 1] !== msg) return;          // only the latest answer can be retried
      msg.remove();
      await runTurn({ regenerate: true });
    }
  });

  function fileCard(f) {
    const el = document.createElement('div');
    el.className = 'file-card';
    const name = f.name || '';
    const mime = f.mime || '';
    const isImg = mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
    const isAudio = mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|opus)$/i.test(name);
    const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(name);
    const isHtml = mime === 'text/html' || /\.html?$/i.test(name);
    const icon = isImg ? '▣' : isAudio ? '♪' : isPdf ? '▤' : isHtml ? '◧' : '▤';
    el.innerHTML = `<div class="ficon">${icon}</div>
      <div style="min-width:0">
        <div class="fname" title="${esc(name)}">${esc(name)}</div>
        <div class="fsize">${fmtSize(f.size)}</div>
      </div>
      <div class="fc-actions">
        ${(isHtml || isPdf || isImg) ? `<button class="btn btn-sm" data-preview="${esc(f.url)}" data-kind="${isHtml ? 'html' : isPdf ? 'pdf' : 'img'}" data-name="${esc(name)}">${TXT.preview}</button>` : ''}
        <a class="btn btn-sm" href="${esc(f.url)}" target="_blank" rel="noopener" download>↓</a>
      </div>`;

    if (isImg) {
      const img = document.createElement('img');
      img.src = f.url;
      img.alt = name;
      img.loading = 'lazy';
      img.className = 'inline-preview';
      el.querySelector('div[style]').appendChild(img);
    } else if (isAudio) {
      const au = document.createElement('audio');
      au.src = f.url;
      au.controls = true;
      au.className = 'inline-audio';
      el.querySelector('div[style]').appendChild(au);
    }
    el.querySelectorAll('[data-preview]').forEach(b => b.addEventListener('click', () => openPreview(b.dataset.preview, b.dataset.kind, b.dataset.name)));
    return el;
  }

  function openPreview(url, kind, name) {
    let modal = document.getElementById('previewModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'previewModal';
      modal.className = 'preview-modal';
      modal.innerHTML = `<div class="preview-box">
        <div class="preview-head"><b id="pvTitle"></b><span class="spacer"></span>
          <a class="btn btn-sm" target="_blank" rel="noopener" id="pvOpen">↗</a>
          <button class="btn btn-sm" id="pvClose">✕</button></div>
        <div class="preview-body" id="pvBody"></div>
      </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      modal.querySelector('#pvClose').addEventListener('click', () => modal.remove());
    }
    modal.querySelector('#pvTitle').textContent = name || '';
    modal.querySelector('#pvOpen').href = url;
    const body = modal.querySelector('#pvBody');
    body.innerHTML = '';
    if (kind === 'img') {
      const i = document.createElement('img'); i.src = url; body.appendChild(i);
    } else {
      const fr = document.createElement('iframe');
      // No allow-same-origin: the page runs in an opaque origin and cannot touch the app.
      fr.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-modals');
      body.appendChild(fr);
      if (kind === 'html') {
        // srcdoc avoids framing headers (X-Frame-Options / frame-ancestors) entirely
        fetch(url, { credentials: 'same-origin' })
          .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
          .then(html => { fr.srcdoc = html; })
          .catch(() => { fr.src = url; });
      } else {
        fr.src = url;
      }
    }
  }

  /* ---------- typing animation ---------- */
  function createTypewriter(contentEl) {
    let target = '';
    let shown = 0;
    let raf = null;
    let last = 0;
    let lastRender = 0;
    let done = false;

    function render(force) {
      const now = performance.now();
      if (!force && now - lastRender < 32) return;
      lastRender = now;
      const slice = target.slice(0, shown);
      contentEl.innerHTML = md(slice) + (done ? '' : '<span class="caret"></span>');
      scrollBottom();
    }

    function tick(ts) {
      if (done && shown >= target.length) { raf = null; return; }
      const dt = last ? ts - last : 16;
      last = ts;
      const remaining = target.length - shown;
      // adaptive speed: fast for long streams, gentle for short
      const cps = remaining > 600 ? 900 : remaining > 200 ? 420 : 190;
      shown = Math.min(target.length, shown + Math.max(1, Math.round(cps * dt / 1000)));
      render(false);
      if (shown < target.length || !done) raf = requestAnimationFrame(tick);
      else raf = null;
    }

    return {
      push(text) {
        target += text;
        if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
      },
      set(text) {
        target = text;
        if (shown > target.length) shown = target.length;
        if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
      },
      finish(text) {
        if (typeof text === 'string' && text.length) target = text;
        done = true;
        if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
        return new Promise(resolve => {
          const wait = () => {
            if (shown >= target.length) { contentEl.innerHTML = md(target); highlight(contentEl); resolve(); }
            else setTimeout(wait, 40);
          };
          wait();
        });
      },
      get text() { return target; },
      flush() { shown = target.length; done = true; contentEl.innerHTML = md(target); highlight(contentEl); if (raf) cancelAnimationFrame(raf); raf = null; }
    };
  }

  // Progress chip: shows only a friendly label (e.g. "در حال ساخت تصویر"), never a tool name.
  function toolChip(id, label, status) {
    let chip = toolStrip.querySelector(`[data-tool="${CSS.escape(id)}"]`);
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'tool-chip';
      chip.dataset.tool = id;
      chip.innerHTML = `<span class="dot"></span><span class="tname"></span>`;
      toolStrip.appendChild(chip);
    }
    chip.classList.remove('running', 'ok', 'error');
    chip.classList.add(status === 'running' ? 'running' : status);
    chip.querySelector('.tname').textContent = label + (status === 'running' ? ' …' : '');
    if (status !== 'running') setTimeout(() => chip.remove(), 7000);
  }

  /* ---------- send ---------- */
  async function ensureConv() {
    if (convId) return true;
    if (GUEST) {
      const c = GS.create(input.value.trim());
      convId = c.id;
      history.replaceState({}, '', '/?c=' + convId);
      refreshSidebar();
      return true;
    }
    const r = await fetch('/api/conversations', { method: 'POST', headers: { 'X-CSRF-Token': CSRF } });
    const j = await r.json();
    if (!j.id) { toast(TXT.noKey, 'err'); return false; }
    convId = j.id;
    history.replaceState({}, '', '/?c=' + convId);
    addConvToSidebar(convId);
    return true;
  }

  async function send() {
    if (busy) return '';
    const raw = input.value.trim();
    if (!raw && !attachments.length) return '';
    if (attachments.some(a => a.uploading)) { toast(L === 'fa' ? 'صبر کن آپلود تمام شود' : 'Wait for uploads', 'err'); return ''; }
    if (!(await ensureConv())) return '';
    const atts = attachments.map(a => ({ name: a.name, url: a.url, mime: a.mime, preview: a.preview }));
    input.value = '';
    autoGrow();
    attachments = [];
    renderAttachments();
    addUserMessage(raw, atts);
    return runTurn({ message: raw, attachments: atts.map(a => a.name) });
  }

  // One assistant turn (a new message or a retry of the last one).
  async function runTurn(opts) {
    busy = true;
    sendBtn.disabled = true;
    statusLine.textContent = TXT.thinking;
    const bubble = addAssistantMessage();
    const contentEl = bubble.querySelector('.content');
    const filesEl = bubble.querySelector('.files-row');
    const tw = createTypewriter(contentEl);
    bubble.classList.add('streaming');
    let finalText = '';

    try {
      let resp;
      if (GUEST) {
        if (opts.regenerate) {
          const c = GS.get(convId);
          if (c && c.messages.length && c.messages[c.messages.length - 1].role === 'assistant') {
            c.messages.pop(); GS.save([c, ...GS.all().filter(x => x.id !== c.id)]);
          }
        } else {
          GS.push(convId, 'user', opts.message);
        }
        resp = await fetch('/api/guest/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF },
          body: JSON.stringify({ messages: (GS.get(convId) || { messages: [] }).messages })
        });
        if (resp.status === 429 || resp.status === 401) {
          const j = await resp.json().catch(() => ({}));
          if (window.BB && BB.openLogin) BB.openLogin();
          throw new Error(j.message || 'login');
        }
      } else {
        resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF },
          body: JSON.stringify({ conversation_id: convId, message: opts.message || '',
                                 attachments: opts.attachments || [], regenerate: !!opts.regenerate,
                                 web_search: webOn, model: currentModel })
        });
      }
      if (resp.status === 402) { window.location.href = '/pricing?need=1'; return ''; }
      if (!resp.ok) {
        let msg = 'HTTP ' + resp.status;
        try { const j = await resp.json(); msg = j.message || j.error || msg; } catch (e) {}
        throw new Error(msg);
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          let ev;
          try { ev = JSON.parse(payload); } catch (e) { continue; }
          if (ev.type === 'start' && ev.conversation_id) {
            convId = ev.conversation_id;
            history.replaceState({}, '', '/?c=' + convId);
          } else if (ev.type === 'text') {
            tw.push(ev.text);
          } else if (ev.type === 'tool') {
            toolChip(ev.id || ev.label, ev.label || TXT.thinking, ev.status);
            if (ev.status === 'running') statusLine.textContent = (ev.label || TXT.thinking) + ' …';
          } else if (ev.type === 'files') {
            (ev.files || []).forEach(f => filesEl.appendChild(fileCard(f)));
            scrollBottom();
          } else if (ev.type === 'final') {
            (ev.files || []).forEach(f => {
              if (!filesEl.querySelector(`a[href="${CSS.escape(f.url)}"]`)) filesEl.appendChild(fileCard(f));
            });
            finalText = ev.content || tw.text;
            const mm = bubble.querySelector('.ma-model');
            if (mm && ev.model_name) mm.textContent = ev.model_name;
            await tw.finish(finalText);
          } else if (ev.type === 'error') {
            tw.flush();
            contentEl.innerHTML = `<div class="alert">${esc(ev.error)}</div>`;
          }
        }
      }
      if (!tw.text && !contentEl.querySelector('.alert')) { tw.flush(); contentEl.innerHTML = `<span class="muted">${TXT.error}</span>`; }
      else await tw.finish();
      contentEl.dataset.raw = finalText || tw.text;
      if (GUEST && (finalText || tw.text)) GS.push(convId, 'assistant', finalText || tw.text);
      refreshSidebar();
    } catch (e) {
      contentEl.innerHTML = `<div class="alert">${esc(e.message || String(e))}</div>`;
    } finally {
      bubble.classList.remove('streaming');
      busy = false;
      sendBtn.disabled = false;
      statusLine.textContent = NOTE;
      toolStrip.innerHTML = '';
      markLastAssistant();
      scrollBottom();
      if (!V.mode) input.focus();
    }
    return finalText;
  }

  /* ---------- model picker ---------- */
  let currentModel = '';
  try { currentModel = localStorage.getItem('bb_model') || ''; } catch (e) {}
  async function initModelPicker() {
    const btn = $('#modelBtn'), menu = $('#modelMenu');
    if (!btn || !menu || !window.__MODEL_CHOICE) return;
    let data;
    try { data = await (await fetch('/api/models')).json(); } catch (e) { return; }
    const items = data.items || [];
    if (!items.length) return;
    const auto = { id: '', name: data.auto && data.auto.name || 'Auto', desc: TXT.auto, icon: '' };
    const all = [auto, ...items];
    if (currentModel && !items.some(m => m.id === currentModel && !m.locked)) currentModel = '';
    const ico = (m) => m.icon ? `<img src="${esc(m.icon)}" alt="">` : (m.id ? `<span class="mp-ph">${esc((m.name || '?')[0])}</span>` : '<span class="live-dot"></span>');
    function paint() {
      const m = all.find(x => x.id === currentModel) || auto;
      $('#modelName').textContent = m.name;
      $('#modelIco').innerHTML = ico(m);
      menu.innerHTML = all.map(x => `<button type="button" class="mp-item ${x.id === currentModel ? 'on' : ''} ${x.locked ? 'locked' : ''}" data-id="${esc(x.id)}" role="option">
        <span class="mp-ico">${ico(x)}</span>
        <span class="mp-txt"><b>${esc(x.name)}</b>${x.desc ? `<small>${esc(x.desc)}</small>` : ''}</span>
        ${x.locked ? `<span class="mp-lock">${TXT.premium}</span>` : (x.id === currentModel ? '<span class="mp-check">✓</span>' : '')}
      </button>`).join('');
    }
    paint();
    btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.hidden = true; });
    menu.addEventListener('click', (e) => {
      const it = e.target.closest('.mp-item'); if (!it) return;
      if (it.classList.contains('locked')) { window.location.href = '/pricing'; return; }
      currentModel = it.dataset.id || '';
      try { localStorage.setItem('bb_model', currentModel); } catch (e2) {}
      menu.hidden = true; paint();
    });
  }

  /* ---------- voice: live dictation, auto-send after silence, conversation ---------- */
  const SILENCE = Math.max(1, Number(window.__VOICE_SILENCE || 3));
  const VLANG = window.__VOICE_LANG || (L === 'fa' ? 'fa-IR' : 'en-US');
  const talkBtn = $('#talkBtn');
  const vl = {
    box: $('#voiceLive'), text: $('#vlText'), state: $('#vlState'), timer: $('#vlTimer'),
    count: $('#vlCount'), bar: $('#vlBar'), send: $('#vlSend'), stop: $('#vlStop'),
  };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const V = { mode: null, rec: null, finalText: '', interim: '', lastActivity: 0, started: 0,
              tick: null, media: null, recorder: null, chunks: [], ctx: null, analyser: null,
              heard: false, speaking: false, audio: null, busyStt: false, lastPartial: 0,
              committing: false, srFailed: false };
  const VT = {
    listening: L === 'fa' ? 'در حال شنیدن…' : 'Listening…',
    sending: L === 'fa' ? 'ارسال تا' : 'Sending in',
    thinking: L === 'fa' ? 'هوش مصنوعی در حال پاسخ…' : 'AI is answering…',
    speaking: L === 'fa' ? 'در حال پخش پاسخ…' : 'Speaking…',
    recording: L === 'fa' ? 'در حال ضبط… (متن هر چند ثانیه به‌روز می‌شود)' : 'Recording… (text refreshes every few seconds)',
    placeholder: L === 'fa' ? 'صحبت کن؛ متن همین‌جا نوشته می‌شود…' : 'Speak — your words appear here…',
    sec: L === 'fa' ? 'ثانیه' : 's',
  };

  function fmtClock(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function liveText() { return (V.finalText + ' ' + V.interim).trim(); }
  function renderLive() {
    const t = liveText();
    vl.text.innerHTML = t ? esc(V.finalText) + (V.interim ? ' <span class="vl-interim">' + esc(V.interim) + '</span>' : '')
                          : '<span class="dim">' + VT.placeholder + '</span>';
    vl.text.scrollTop = vl.text.scrollHeight;
  }
  function showPanel(on) {
    vl.box.hidden = !on;
    if (micBtn) micBtn.classList.toggle('recording', on && V.mode === 'dictate');
    if (talkBtn) talkBtn.classList.toggle('recording', V.mode === 'talk');
  }

  function startTicker() {
    clearInterval(V.tick);
    V.tick = setInterval(() => {
      const now = Date.now();
      vl.timer.textContent = fmtClock(now - V.started);
      const hasText = !!liveText() || (V.recorder && V.heard);
      if (V.speaking || V.committing || !hasText || busy) { vl.count.hidden = true; vl.bar.style.width = '0%'; return; }
      const idle = (now - V.lastActivity) / 1000;
      const left = Math.max(0, SILENCE - idle);
      vl.count.hidden = false;
      vl.count.textContent = VT.sending + ' ' + Math.ceil(left) + ' ' + VT.sec;
      vl.bar.style.width = Math.min(100, (idle / SILENCE) * 100) + '%';
      if (left <= 0) commit();
    }, 100);
  }

  async function startListening(mode) {
    if (V.mode && V.mode !== mode) stopVoice();
    V.mode = mode; V.finalText = ''; V.interim = ''; V.heard = false; V.chunks = [];
    V.started = Date.now(); V.lastActivity = Date.now();
    vl.state.textContent = VT.listening; renderLive(); showPanel(true);
    if (SR && !V.srFailed) startSR(); else await startRecorder();
    startTicker();
  }

  /* -- browser speech recognition: words appear in real time -- */
  function startSR() {
    try { if (V.rec) V.rec.abort(); } catch (e) {}
    const rec = new SR();
    rec.lang = VLANG; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) V.finalText = (V.finalText + ' ' + r[0].transcript).trim();
        else interim += r[0].transcript;
      }
      V.interim = interim.trim(); V.lastActivity = Date.now(); renderLive();
    };
    rec.onspeechstart = () => { V.lastActivity = Date.now(); };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast(TXT.voiceFail, 'err'); stopVoice(); }
      else if (e.error === 'network' || e.error === 'language-not-supported') {
        V.srFailed = true; V.rec = null; startRecorder();           // fall back to server STT
      }
    };
    rec.onend = () => { if (V.mode && !V.speaking && !busy && V.rec === rec) { try { rec.start(); } catch (e) {} } };
    V.rec = rec;
    try { rec.start(); } catch (e) {}
  }

  /* -- fallback: record + voice-activity detection + server transcription -- */
  async function startRecorder() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast(TXT.voiceFail, 'err'); stopVoice(); return; }
    try {
      V.media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) { toast(TXT.voiceFail, 'err'); stopVoice(); return; }
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    V.chunks = [];
    V.recorder = mime ? new MediaRecorder(V.media, { mimeType: mime }) : new MediaRecorder(V.media);
    V.recorder.ondataavailable = ev => { if (ev.data && ev.data.size) V.chunks.push(ev.data); };
    V.recorder.start(1000);
    vl.state.textContent = VT.recording;
    V.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = V.ctx.createMediaStreamSource(V.media);
    V.analyser = V.ctx.createAnalyser(); V.analyser.fftSize = 1024; src.connect(V.analyser);
    const buf = new Uint8Array(V.analyser.fftSize);
    const loop = () => {
      if (!V.analyser) return;
      V.analyser.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
      const rms = Math.sqrt(sum / buf.length);
      if (rms > 0.035) { V.heard = true; V.lastActivity = Date.now(); }
      if (V.heard && Date.now() - V.lastPartial > 4500 && !V.busyStt && !V.committing) partialTranscribe();
      requestAnimationFrame(loop);
    };
    loop();
  }
  function recordedBlob() { return new Blob(V.chunks, { type: (V.recorder && V.recorder.mimeType) || 'audio/webm' }); }
  async function transcribeBlob(blob) {
    const fd = new FormData(); fd.append('file', blob, 'voice.webm');
    const r = await fetch('/api/voice', { method: 'POST', headers: { 'X-CSRF-Token': CSRF }, body: fd });
    if (!r.ok) throw new Error('voice');
    return ((await r.json()).text || '').trim();
  }
  async function partialTranscribe() {
    if (!V.chunks.length) return;
    V.busyStt = true; V.lastPartial = Date.now();
    try { const t = await transcribeBlob(recordedBlob()); if (t && !V.committing) { V.finalText = t; renderLive(); } } catch (e) {}
    V.busyStt = false;
  }
  function releaseRecorder() {
    try { if (V.recorder && V.recorder.state !== 'inactive') V.recorder.stop(); } catch (e) {}
    if (V.media) V.media.getTracks().forEach(t => t.stop());
    try { if (V.ctx) V.ctx.close(); } catch (e) {}
    V.media = null; V.recorder = null; V.ctx = null; V.analyser = null;
  }

  /* -- commit: send the transcript to the AI -- */
  async function commit() {
    if (busy || V.committing || !V.mode) return;
    V.committing = true;
    vl.count.hidden = true;
    let text = liveText();
    const usedRecorder = !!V.recorder;
    try { if (V.rec) { const r = V.rec; V.rec = null; r.abort(); } } catch (e) {}
    if (usedRecorder) {
      vl.state.textContent = TXT.transcribing;
      await new Promise(r => setTimeout(r, 250));            // flush the last chunk
      const blob = recordedBlob();
      releaseRecorder();
      try { const t = await transcribeBlob(blob); if (t) text = t; } catch (e) { toast(TXT.voiceFail, 'err'); }
    }
    V.committing = false;
    if (!V.mode) return;
    if (!text) { startListening(V.mode); return; }
    if (V.mode === 'dictate') {
      stopVoice();
      input.value = text; autoGrow();
      await send();
      return;
    }
    // conversation mode: send, speak the answer, then listen again
    V.speaking = true; vl.state.textContent = VT.thinking;
    V.finalText = text; V.interim = ''; renderLive();
    input.value = text;
    const answer = await send();
    if (V.mode !== 'talk') return;
    if (answer) await speak(answer);
    V.speaking = false;
    if (V.mode === 'talk') startListening('talk');
  }

  function speakable(md) {
    return String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/https?:\/\/\S+/g, '')
      .replace(/[#*_`>|\[\]()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1600);
  }
  async function speak(text) {
    const clean = speakable(text);
    if (!clean) return;
    vl.state.textContent = VT.speaking;
    try {
      const r = await fetch('/api/tts', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF },
        body: JSON.stringify({ text: clean }) });
      if (!r.ok) throw new Error('tts');
      const url = URL.createObjectURL(await r.blob());
      await new Promise(res => {
        V.audio = new Audio(url);
        V.audio.onended = V.audio.onerror = () => { URL.revokeObjectURL(url); res(); };
        V.audio.play().catch(res);
      });
    } catch (e) {
      if ('speechSynthesis' in window) {
        await new Promise(res => {
          const u = new SpeechSynthesisUtterance(clean); u.lang = VLANG; u.onend = u.onerror = res;
          speechSynthesis.speak(u);
        });
      }
    }
    V.audio = null;
  }

  function stopVoice() {
    V.mode = null; V.speaking = false; V.committing = false;
    clearInterval(V.tick);
    try { if (V.rec) { const r = V.rec; V.rec = null; r.abort(); } } catch (e) {}
    releaseRecorder();
    try { if (V.audio) V.audio.pause(); } catch (e) {}
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
    showPanel(false);
    statusLine.textContent = TXT.ready;
  }

  if (micBtn) micBtn.addEventListener('click', () => V.mode === 'dictate' ? commit() : startListening('dictate'));
  if (talkBtn) talkBtn.addEventListener('click', () => V.mode === 'talk' ? stopVoice() : startListening('talk'));
  if (vl.send) vl.send.addEventListener('click', () => commit());
  if (vl.stop) vl.stop.addEventListener('click', stopVoice);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && V.mode) stopVoice(); });

  /* ---------- web search toggle ---------- */
  const webBtn = $('#webBtn');
  let webOn = false;
  if (webBtn) webBtn.addEventListener('click', () => {
    webOn = !webOn;
    webBtn.classList.toggle('on', webOn);
    webBtn.setAttribute('aria-pressed', webOn ? 'true' : 'false');
    statusLine.textContent = webOn ? (L === 'fa' ? '🌐 جستجوی وب برای پیام بعدی روشن است' : '🌐 Web search is on') : TXT.ready;
  });

  /* ---------- sidebar ---------- */
  function addConvToSidebar(id) {
    const list = $('#convList');
    const el = document.createElement('div');
    el.className = 'conv-item active';
    el.dataset.id = id;
    el.innerHTML = `<span class="conv-dot"></span>
      <a class="title" href="/?c=${id}">${L === 'fa' ? 'گفتگوی جدید' : 'New chat'}</a>
      <button class="del" data-del="${id}">✕</button>`;
    list.prepend(el);
    bindDelete(el);
    titleEl.textContent = L === 'fa' ? 'گفتگوی جدید' : 'New chat';
  }

  function renderGuestSidebar() {
    const list = $('#convList');
    list.innerHTML = '';
    GS.all().forEach(c => {
      const el = document.createElement('div');
      el.className = 'conv-item' + (c.id === convId ? ' active' : '');
      el.dataset.id = c.id;
      el.innerHTML = `<a class="title" href="/?c=${c.id}">${esc(c.title || (L === 'fa' ? 'گفتگوی جدید' : 'New chat'))}</a>
        <button class="del" data-del="${c.id}">✕</button>`;
      list.appendChild(el);
      bindDelete(el);
    });
  }

  async function refreshSidebar() {
    if (GUEST) { renderGuestSidebar(); return; }
    try {
      const r = await fetch('/api/conversations');
      const j = await r.json();
      const list = $('#convList');
      list.innerHTML = '';
      (j.items || []).forEach(c => {
        const el = document.createElement('div');
        el.className = 'conv-item' + (c.id === convId ? ' active' : '');
        el.dataset.id = c.id;
        el.innerHTML = `<span class="conv-dot"></span>
          <a class="title" href="/?c=${c.id}">${esc(c.title || 'New chat')}</a>
          <button class="del" data-del="${c.id}">✕</button>`;
        list.appendChild(el);
        bindDelete(el);
      });
    } catch (e) {}
  }

  function bindDelete(el) {
    const b = el.querySelector('[data-del]');
    if (b) b.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = b.dataset.del;
      if (!confirm(window.__T.confirm_delete)) return;
      if (GUEST) GS.remove(id);
      else await fetch('/api/conversations/' + id, { method: 'DELETE', headers: { 'X-CSRF-Token': CSRF } });
      if (id === convId) window.location.href = '/';
      else el.remove();
    });
  }
  document.querySelectorAll('.conv-item').forEach(bindDelete);


  /* ---------- composer ---------- */
  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  }
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      send();
    }
  });
  sendBtn.addEventListener('click', send);
  document.querySelectorAll('[data-fill]').forEach(b => b.addEventListener('click', () => {
    input.value = b.dataset.fill;
    input.focus();
    autoGrow();
  }));

  /* ---------- uploads: images and files, several at once, with previews ---------- */
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => uploadFiles([...fileInput.files]));
  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); uploadFiles(files); }
  });
  const composer = document.querySelector('.composer');
  ['dragover', 'dragenter'].forEach(ev => composer.addEventListener(ev, e => {
    e.preventDefault(); composer.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach(ev => composer.addEventListener(ev, e => {
    e.preventDefault(); composer.classList.remove('drag');
    if (ev === 'drop') uploadFiles([...(e.dataTransfer?.files || [])]);
  }));

  async function uploadFiles(files) {
    if (!files.length || GUEST) return;
    if (!(await ensureConv())) return;
    const jobs = files.slice(0, 12).map(async (f) => {
      const item = { name: f.name, mime: f.type, uploading: true,
                     preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : '' };
      attachments.push(item);
      renderAttachments();
      const fd = new FormData();
      fd.append('file', f);
      fd.append('conv_id', convId);
      try {
        const r = await fetch('/api/upload', { method: 'POST', headers: { 'X-CSRF-Token': CSRF }, body: fd });
        if (r.status === 402) { window.location.href = '/pricing?need=1'; return; }
        if (!r.ok) throw new Error(TXT.uploadFail);
        Object.assign(item, await r.json(), { uploading: false });
      } catch (e) {
        attachments = attachments.filter(a => a !== item);
        toast((e.message || TXT.uploadFail) + ': ' + f.name, 'err');
      }
      renderAttachments();
    });
    await Promise.all(jobs);
    fileInput.value = '';
  }

  function renderAttachments() {
    attachList.innerHTML = '';
    attachList.classList.toggle('has', attachments.length > 0);
    attachments.forEach((a, i) => {
      const el = document.createElement('div');
      el.className = 'att' + (a.uploading ? ' busy' : '') + (a.preview ? ' img' : '');
      el.title = a.name;
      el.innerHTML = (a.preview ? `<img src="${esc(a.preview)}" alt="">` : `<span class="att-file">📎<small>${esc(a.name)}</small></span>`) +
        `<button type="button" class="att-x" aria-label="remove">✕</button>`;
      el.querySelector('.att-x').addEventListener('click', () => { attachments.splice(i, 1); renderAttachments(); });
      attachList.appendChild(el);
    });
  }

  function toast(msg, kind) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (kind === 'err' ? ' err' : '');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  document.querySelectorAll('.files-row[data-files]').forEach(row => {
    try { JSON.parse(row.dataset.files || '[]').forEach(f => row.appendChild(fileCard(f))); } catch (e) {}
  });

  document.querySelectorAll('.content.raw').forEach(el => {
    const raw = el.dataset.raw;
    if (raw) el.innerHTML = md(raw);
    highlight(el);
  });
  document.querySelectorAll('.msg-atts[data-atts]').forEach(el => {
    try { renderAtts(el, JSON.parse(el.dataset.atts || '[]')); } catch (e) {}
  });
  initModelPicker();

  /* ---------- guest: restore a browser-stored conversation ---------- */
  if (GUEST) {
    const cid = new URLSearchParams(location.search).get('c');
    const c = cid && GS.get(cid);
    if (c) {
      convId = c.id;
      c.messages.forEach(m => {
        if (m.role === 'user') addUserMessage(m.content);
        else {
          const w = addAssistantMessage();
          const ce = w.querySelector('.content');
          ce.innerHTML = md(m.content); ce.dataset.raw = m.content;
          highlight(w);
        }
      });
      markLastAssistant();
    }
    renderGuestSidebar();
  }

  /* ---------- ?mode= shortcuts from the sidebar tools ---------- */
  const mode = new URLSearchParams(location.search).get('mode');
  if (mode === 'image' && !GUEST) {
    input.value = L === 'fa' ? 'یک تصویر بساز از: ' : 'Create an image of: ';
    input.focus(); autoGrow();
  } else if (mode === 'voice' && !GUEST && typeof startListening === 'function') {
    setTimeout(() => startListening('talk'), 300);
  }

  window.__USERNAME = window.__USERNAME || 'U';
  autoGrow();
  scrollBottom(true);
})();
