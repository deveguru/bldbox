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
  };

  /* ---------- markdown helpers ---------- */
  function md(text) {
    if (window.BB && BB.md) return BB.md(text);
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML.replace(/\n/g, '<br>');
  }
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
    const w = document.getElementById('welcome');
    if (w) w.remove();
  }

  /* ---------- message rendering ---------- */
  const AI_AVATAR = `<div class="who logo-who"><img src="${esc(LOGO)}" alt="AI"></div>`;
  const AI_AVATAR_FALLBACK = `<div class="who logo-who"><span>✦</span></div>`;

  function avatarHtml() {
    return LOGO ? AI_AVATAR : AI_AVATAR_FALLBACK;
  }

  function addUserMessage(text) {
    removeWelcome();
    const wrap = document.createElement('div');
    wrap.className = 'msg user';
    wrap.innerHTML = `<div class="who">${esc((window.__USERNAME || 'U')[0].toUpperCase())}</div>
      <div class="bubble"><div class="content"></div></div>`;
    wrap.querySelector('.content').innerHTML = md(text);
    messagesEl.appendChild(wrap);
    scrollBottom(true);
  }

  function addAssistantMessage() {
    removeWelcome();
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    wrap.innerHTML = `${avatarHtml()}
      <div class="bubble">
        <div class="content"><span class="typing"><i></i><i></i><i></i></span></div>
        <div class="files-row"></div>
      </div>`;
    messagesEl.appendChild(wrap);
    scrollBottom(true);
    return wrap;
  }

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
      fr.src = url;
      fr.loading = 'lazy';
      fr.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
      body.appendChild(fr);
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
            if (shown >= target.length) { contentEl.innerHTML = md(target); resolve(); }
            else setTimeout(wait, 40);
          };
          wait();
        });
      },
      get text() { return target; },
      flush() { shown = target.length; done = true; contentEl.innerHTML = md(target); if (raf) cancelAnimationFrame(raf); raf = null; }
    };
  }

  function toolChip(name, status) {
    let chip = toolStrip.querySelector(`[data-tool="${CSS.escape(name)}"]`);
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'tool-chip';
      chip.dataset.tool = name;
      chip.innerHTML = `<span class="dot"></span><span class="tname"></span>`;
      toolStrip.appendChild(chip);
    }
    chip.classList.remove('running', 'ok', 'error');
    chip.classList.add(status === 'running' ? 'running' : status);
    chip.querySelector('.tname').textContent = name + (status === 'running' ? ' …' : '');
    if (status !== 'running') setTimeout(() => chip.remove(), 7000);
  }

  /* ---------- send ---------- */
  async function ensureConv() {
    if (convId) return true;
    const r = await fetch('/api/conversations', { method: 'POST', headers: { 'X-CSRF-Token': CSRF } });
    const j = await r.json();
    if (!j.id) { toast(TXT.noKey, 'err'); return false; }
    convId = j.id;
    history.replaceState({}, '', '/chat?c=' + convId);
    addConvToSidebar(convId);
    return true;
  }

  async function send() {
    if (busy) return '';
    const raw = input.value.trim();
    if (!raw && !attachments.length) return '';
    if (!(await ensureConv())) return '';
    let text = raw;
    if (attachments.length) {
      const names = attachments.map(a => a.name).join(', ');
      text = (L === 'fa' ? '📎 فایل‌های پیوست: ' : '📎 Attached files: ') + names + '\n\n' + text;
    }
    input.value = '';
    autoGrow();
    clearAttachments();
    addUserMessage(text || (L === 'fa' ? '(فایل پیوست)' : '(attachment)'));
    busy = true;
    sendBtn.disabled = true;
    statusLine.textContent = TXT.thinking;
    const bubble = addAssistantMessage();
    const contentEl = bubble.querySelector('.content');
    const filesEl = bubble.querySelector('.files-row');
    const tw = createTypewriter(contentEl);
    bubble.classList.add('streaming');
    let finished = false;
    let finalText = '';

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF },
        body: JSON.stringify({ conversation_id: convId, message: text, web_search: webOn })
      });
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
          if (payload === '[DONE]') { finished = true; continue; }
          let ev;
          try { ev = JSON.parse(payload); } catch (e) { continue; }
          if (ev.type === 'start' && ev.conversation_id) {
            convId = ev.conversation_id;
            history.replaceState({}, '', '/chat?c=' + convId);
          } else if (ev.type === 'text') {
            tw.push(ev.text);
          } else if (ev.type === 'tool') {
            toolChip(ev.name, ev.status);
            if (ev.status === 'running') statusLine.textContent = ev.name + ' …';
          } else if (ev.type === 'files') {
            (ev.files || []).forEach(f => filesEl.appendChild(fileCard(f)));
            scrollBottom();
          } else if (ev.type === 'final') {
            (ev.files || []).forEach(f => {
              if (!filesEl.querySelector(`a[href="${CSS.escape(f.url)}"]`)) filesEl.appendChild(fileCard(f));
            });
            if (ev.tools && ev.tools.length) statusLine.textContent =
              (L === 'fa' ? 'ابزارها: ' : 'Tools: ') + [...new Set(ev.tools)].join(', ');
            finalText = ev.content || tw.text;
            await tw.finish(finalText);
          } else if (ev.type === 'error') {
            tw.flush();
            contentEl.innerHTML = `<div class="alert">${esc(ev.error)}</div>`;
          }
        }
      }
      if (!tw.text) { tw.flush(); contentEl.innerHTML = `<span class="muted">${TXT.error}</span>`; }
      await tw.finish();
      refreshSidebar();
    } catch (e) {
      contentEl.innerHTML = `<div class="alert">${esc(e.message || String(e))}</div>`;
    } finally {
      bubble.classList.remove('streaming');
      busy = false;
      sendBtn.disabled = false;
      statusLine.textContent = TXT.ready;
      toolStrip.innerHTML = '';
      scrollBottom();
      if (!V.mode) input.focus();
    }
    return finalText;
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
      <a class="title" href="/chat?c=${id}">${L === 'fa' ? 'گفتگوی جدید' : 'New chat'}</a>
      <button class="del" data-del="${id}">✕</button>`;
    list.prepend(el);
    bindDelete(el);
    titleEl.textContent = L === 'fa' ? 'گفتگوی جدید' : 'New chat';
  }

  async function refreshSidebar() {
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
          <a class="title" href="/chat?c=${c.id}">${esc(c.title || 'New chat')}</a>
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
      await fetch('/api/conversations/' + id, { method: 'DELETE', headers: { 'X-CSRF-Token': CSRF } });
      if (id === convId) window.location.href = '/chat';
      else el.remove();
    });
  }
  document.querySelectorAll('.conv-item').forEach(bindDelete);

  $('#newChat').addEventListener('click', () => { window.location.href = '/chat'; });
  const menuBtn = $('#menuBtn');
  if (menuBtn) menuBtn.addEventListener('click', () => $('#sidebar').classList.toggle('open'));

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

  /* ---------- uploads ---------- */
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
    if (!files.length) return;
    if (!(await ensureConv())) return;
    for (const f of files) {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('conv_id', convId);
      statusLine.textContent = (L === 'fa' ? 'آپلود ' : 'Uploading ') + f.name;
      try {
        const r = await fetch('/api/upload', { method: 'POST', headers: { 'X-CSRF-Token': CSRF }, body: fd });
        if (!r.ok) throw new Error(TXT.uploadFail);
        const j = await r.json();
        attachments.push(j);
        renderAttachments();
      } catch (e) {
        toast(e.message || TXT.uploadFail, 'err');
      }
    }
    statusLine.textContent = TXT.ready;
    fileInput.value = '';
  }

  function renderAttachments() {
    attachList.innerHTML = '';
    attachments.forEach((a, i) => {
      const el = document.createElement('span');
      el.className = 'attach-pill';
      el.innerHTML = `📎 ${esc(a.name)} <button data-i="${i}">✕</button>`;
      el.querySelector('button').addEventListener('click', () => {
        attachments.splice(i, 1); renderAttachments();
      });
      attachList.appendChild(el);
    });
    scrollBottom();
  }
  function clearAttachments() { attachments = []; renderAttachments(); }

  function toast(msg, kind) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (kind === 'err' ? ' err' : '');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  document.querySelectorAll('.content.raw').forEach(el => {
    const raw = el.dataset.raw;
    if (raw) el.innerHTML = md(raw);
  });

  window.__USERNAME = window.__USERNAME || 'U';
  autoGrow();
  scrollBottom(true);
})();
