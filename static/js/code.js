/* BldBox Code — chat-driven app builder: live file tree, preview, ZIP export */
(function () {
  const $ = (id) => document.getElementById(id);
  const CSRF = window.__CSRF;
  const fa = (window.__LANG || 'fa') === 'fa';
  const T = {
    step: fa ? 'در حال ساخت… مرحله' : 'Building… step',
    of: fa ? 'از' : 'of',
    writing: fa ? 'در حال نوشتن' : 'Writing',
    error: fa ? 'خطا' : 'Error',
    noPreview: fa ? 'این پروژه صفحه HTML برای پیش‌نمایش ندارد' : 'No HTML entry to preview',
    pickFile: fa ? 'یک فایل را انتخاب کن' : 'Select a file',
    confirmDel: fa ? 'پروژه و همه فایل‌هایش حذف شود؟' : 'Delete this project and all its files?',
    pricing: fa ? 'خرید پلن' : 'Get a plan',
  };
  const state = { pid: window.__CODE.pid, token: window.__CODE.token, files: [], entry: '', busy: false, current: '' };
  const msgs = $('cxMsgs'), input = $('cxInput'), sendBtn = $('cxSend'), main = $('codeMain');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = (t) => (window.BB && BB.md ? BB.md(t) : esc(t));
  const enhance = (el) => { if (window.BB && BB.enhanceCode) BB.enhanceCode(el); };
  const scroll = () => { msgs.scrollTop = msgs.scrollHeight; };
  const LANGS = { js: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript', py: 'python',
    html: 'xml', htm: 'xml', vue: 'xml', svg: 'xml', css: 'css', scss: 'scss', json: 'json', md: 'markdown', php: 'php',
    go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', rb: 'ruby', sh: 'bash', yml: 'yaml', yaml: 'yaml', sql: 'sql',
    dart: 'dart', swift: 'swift', c: 'c', cpp: 'cpp', cs: 'csharp', toml: 'ini', ini: 'ini', env: 'bash' };

  /* ---------- messages ---------- */
  function addMsg(role, text) {
    $('cxIntro') && ($('cxIntro').hidden = true);
    const el = document.createElement('div');
    el.className = 'cxm ' + role;
    el.innerHTML = '<div class="cxm-body"></div><div class="cxm-files"></div>';
    el.querySelector('.cxm-body').innerHTML = md(text);
    enhance(el);
    msgs.appendChild(el); scroll();
    return el;
  }
  function fileChip(container, path) {
    if (container.querySelector(`[data-open="${CSS.escape(path)}"]`)) return;
    const s = document.createElement('span');
    s.className = 'fchip new'; s.dataset.open = path; s.textContent = path;
    container.appendChild(s); scroll();
  }
  msgs.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-open]');
    if (chip) { switchTab('code'); openFile(chip.dataset.open); }
    const fill = e.target.closest('[data-fill]');
    if (fill) { input.value = fill.dataset.fill; input.focus(); }
  });
  if (msgs.querySelector('.cxm')) $('cxIntro').hidden = true;

  /* ---------- workspace ---------- */
  function switchTab(tab) {
    document.querySelectorAll('.cx-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $('paneView').hidden = tab !== 'preview';
    $('paneCode').hidden = tab !== 'code';
  }
  document.querySelectorAll('.cx-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  async function loadTree() {
    if (!state.pid) return;
    const j = await (await fetch(`/api/code/${state.pid}/files`)).json();
    state.files = j.items || []; state.entry = j.entry || '';
    renderTree();
  }

  function renderTree() {
    const root = {};
    state.files.forEach(f => {
      let node = root;
      const parts = f.path.split('/');
      parts.forEach((p, i) => {
        if (i === parts.length - 1) { (node.__files = node.__files || []).push(f); }
        else { node[p] = node[p] || {}; node = node[p]; }
      });
    });
    const build = (node, depth) => {
      let html = '';
      Object.keys(node).filter(k => k !== '__files').sort().forEach(dir => {
        html += `<details open class="tr-dir" style="--d:${depth}"><summary>📁 ${esc(dir)}</summary>${build(node[dir], depth + 1)}</details>`;
      });
      (node.__files || []).sort((a, b) => a.path.localeCompare(b.path)).forEach(f => {
        const name = f.path.split('/').pop();
        html += `<a class="tr-file ${f.path === state.current ? 'on' : ''}" style="--d:${depth}" data-path="${esc(f.path)}">${esc(name)}</a>`;
      });
      return html;
    };
    $('cxTree').innerHTML = state.files.length ? build(root, 0) : `<div class="dim tiny" style="padding:12px">—</div>`;
  }
  $('cxTree').addEventListener('click', (e) => {
    const a = e.target.closest('.tr-file');
    if (a) openFile(a.dataset.path);
  });

  async function openFile(path) {
    state.current = path; renderTree();
    $('cxFname').textContent = path;
    const r = await fetch(`/api/code/${state.pid}/file?path=${encodeURIComponent(path)}`);
    const j = await r.json();
    const ext = (path.split('.').pop() || '').toLowerCase();
    const lang = LANGS[ext] || '';
    const v = $('cxViewer');
    v.innerHTML = '';
    const pre = document.createElement('pre'); const code = document.createElement('code');
    if (lang) code.className = 'language-' + lang;
    code.textContent = j.content != null ? j.content : (j.error || '');
    pre.appendChild(code); v.appendChild(pre);
    enhance(v);
  }

  async function loadPreview() {
    const frame = $('cxFrame'), empty = $('cxEmpty');
    if (!state.pid || !state.entry) {
      frame.removeAttribute('srcdoc'); frame.hidden = true;
      empty.hidden = false; empty.textContent = state.files.length ? T.noPreview : empty.textContent;
      return;
    }
    const j = await (await fetch(`/api/code/${state.pid}/file?path=${encodeURIComponent(state.entry)}`)).json();
    if (j.content == null) return;
    const dir = state.entry.includes('/') ? state.entry.slice(0, state.entry.lastIndexOf('/') + 1) : '';
    const base = `${location.origin}/code/raw/${state.pid}/${state.token}/${dir}`;
    const doc = new DOMParser().parseFromString(j.content, 'text/html');
    await inlineAssets(doc, dir);
    const b = doc.createElement('base'); b.href = base;
    doc.head.prepend(b);
    frame.hidden = false; empty.hidden = true;
    frame.srcdoc = '<!doctype html>\n' + doc.documentElement.outerHTML;   // sandboxed, opaque origin
  }

  /* Inline the project's own stylesheets and scripts so the preview never depends on
     sub-resource requests from the sandboxed frame; images etc. still load via <base>. */
  const isLocal = (u) => u && !/^([a-z]+:)?\/\//i.test(u) && !u.startsWith('data:') && !u.startsWith('#');
  function resolvePath(dir, rel) {
    const parts = (dir + rel.split(/[?#]/)[0]).split('/');
    const out = [];
    parts.forEach(p => { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
    return out.join('/');
  }
  async function fetchText(path) {
    if (!state.files.some(f => f.path === path)) return null;
    const j = await (await fetch(`/api/code/${state.pid}/file?path=${encodeURIComponent(path)}`)).json();
    return j.content == null ? null : j.content;
  }
  async function inlineAssets(doc, dir) {
    const jobs = [];
    doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach(l => {
      const href = l.getAttribute('href');
      if (!isLocal(href)) return;
      jobs.push(fetchText(resolvePath(dir, href)).then(css => {
        if (css == null) return;
        const s = doc.createElement('style'); s.textContent = css; l.replaceWith(s);
      }));
    });
    doc.querySelectorAll('script[src]').forEach(sc => {
      const src = sc.getAttribute('src');
      if (!isLocal(src)) return;
      jobs.push(fetchText(resolvePath(dir, src)).then(js => {
        if (js == null) return;
        const n = doc.createElement('script');
        if (sc.type) n.type = sc.type;
        n.textContent = js.replace(/<\/script/gi, '<\\/script');
        sc.replaceWith(n);
      }));
    });
    await Promise.all(jobs);
  }

  $('cxRefresh').onclick = async () => { await loadTree(); loadPreview(); };
  $('cxOpen').onclick = () => { if (state.pid && state.entry) window.open(`/code/raw/${state.pid}/${state.token}/${state.entry}`, '_blank', 'noopener'); };
  $('cxZip').onclick = () => { if (state.pid) location.href = `/code/${state.pid}/export.zip`; };

  /* ---------- projects ---------- */
  $('projSelect').addEventListener('change', (e) => { location.href = e.target.value ? '/code/p/' + e.target.value : '/code'; });
  if ($('projDelete')) $('projDelete').onclick = async () => {
    if (!confirm(T.confirmDel)) return;
    await fetch('/api/code/projects/' + state.pid, { method: 'DELETE', headers: { 'X-CSRF-Token': CSRF } });
    location.href = '/code';
  };

  async function ensureProject(title) {
    if (state.pid) return;
    const j = await (await fetch('/api/code/projects', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF },
      body: JSON.stringify({ title: title.slice(0, 60) }) })).json();
    state.pid = j.id; state.token = j.token;
    history.replaceState({}, '', '/code/p/' + j.id);
    main.classList.remove('is-new');
  }

  /* ---------- run ---------- */
  function status(text) { $('cxStatus').hidden = !text; $('cxStatusText').textContent = text || ''; }

  let treeTimer = null;
  const refreshSoon = () => { clearTimeout(treeTimer); treeTimer = setTimeout(loadTree, 600); };

  async function send() {
    const text = input.value.trim();
    if (!text || state.busy) return;
    state.busy = true; sendBtn.disabled = true;
    input.value = '';
    addMsg('user', text);
    let runBox = null;
    try {
      await ensureProject(text);
      status(T.step + ' 1');
      const resp = await fetch(`/api/code/${state.pid}/chat`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF }, body: JSON.stringify({ message: text }) });
      if (resp.status === 402) { location.href = '/pricing?need=1'; return; }
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).split('\n').find(l => l.startsWith('data:')); buf = buf.slice(i + 2);
          if (!line) continue;
          const p = line.slice(5).trim();
          if (p === '[DONE]') continue;
          let ev; try { ev = JSON.parse(p); } catch (e) { continue; }
          if (ev.type === 'status') status(`${T.step} ${ev.step} ${T.of} ${ev.max}`);
          else if (ev.type === 'note') { runBox = addMsg('assistant', ev.text); }
          else if (ev.type === 'file') {
            if (!runBox) runBox = addMsg('assistant', '');
            if (ev.op === 'write') fileChip(runBox.querySelector('.cxm-files'), ev.path);
            status(`${T.writing} ${ev.path}`); refreshSoon();
          } else if (ev.type === 'limit') {
            const el = addMsg('assistant', '⚠️ ' + ev.message);
            el.querySelector('.cxm-body').insertAdjacentHTML('beforeend', ` <a href="/pricing">${T.pricing} →</a>`);
          } else if (ev.type === 'final') {
            const el = addMsg('assistant', ev.content || '');
            (ev.files || []).forEach(f => fileChip(el.querySelector('.cxm-files'), f));
            await loadTree(); await loadPreview(); switchTab('preview');
          } else if (ev.type === 'error') addMsg('assistant', `${T.error}: ${ev.error}`);
        }
      }
    } catch (e) {
      addMsg('assistant', `${T.error}: ${e.message || e}`);
    } finally {
      state.busy = false; sendBtn.disabled = false; status('');
    }
  }
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  // initial load
  msgs.querySelectorAll('.raw').forEach(el => { el.innerHTML = md(el.dataset.raw || ''); enhance(el); });
  if (state.pid) { loadTree().then(loadPreview); }
  scroll();
})();
