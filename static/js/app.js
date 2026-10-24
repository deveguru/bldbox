/* shared UI helpers */
(function () {
  window.BB = window.BB || {};

  BB.toast = function (msg, kind) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    el.hidden = false;
    clearTimeout(BB._toastT);
    BB._toastT = setTimeout(() => { el.classList.remove('show'); }, 3200);
  };

  BB.md = function (text) {
    if (!text) return '';
    let html;
    if (window.marked) {
      try {
        marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
        html = marked.parse(text);
      } catch (e) { html = escapeHtml(text); }
    } else {
      html = escapeHtml(text).replace(/\n/g, '<br>');
    }
    if (window.DOMPurify) html = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
    // each block picks its own direction, so Persian and English lines align correctly
    return html.replace(/<(p|li|h[1-6]|blockquote|td|th)(?=[\s>])/g, '<$1 dir="auto"');
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  BB.escapeHtml = escapeHtml;

  BB.fmtSize = function (n) {
    n = n || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  };

  /* ---------- code blocks: syntax colours + copy + download ---------- */
  const EXT = {
    python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', jsx: 'jsx',
    tsx: 'tsx', html: 'html', xml: 'xml', css: 'css', scss: 'scss', json: 'json', bash: 'sh',
    shell: 'sh', sh: 'sh', zsh: 'sh', php: 'php', java: 'java', kotlin: 'kt', c: 'c', cpp: 'cpp',
    csharp: 'cs', cs: 'cs', go: 'go', rust: 'rs', ruby: 'rb', swift: 'swift', sql: 'sql',
    yaml: 'yml', yml: 'yml', markdown: 'md', md: 'md', dart: 'dart', lua: 'lua', r: 'r',
    dockerfile: 'Dockerfile', nginx: 'conf', ini: 'ini', toml: 'toml', powershell: 'ps1',
  };
  const fa = () => (window.__LANG || 'fa') === 'fa';

  function langOf(code) {
    const m = (code.className || '').match(/language-([\w+#-]+)/);
    return m ? m[1].toLowerCase() : '';
  }

  BB.enhanceCode = function (root) {
    if (!root) return;
    root.querySelectorAll('pre > code').forEach(code => {
      const pre = code.parentElement;
      if (pre.dataset.enhanced) return;
      pre.dataset.enhanced = '1';
      let lang = langOf(code);
      if (window.hljs) {
        try {
          if (lang && hljs.getLanguage(lang)) hljs.highlightElement(code);
          else {
            const r = hljs.highlightAuto(code.textContent);
            code.innerHTML = r.value; code.classList.add('hljs');
            lang = lang || r.language || '';
          }
        } catch (e) {}
      }
      const box = document.createElement('div');
      box.className = 'code-box';
      const head = document.createElement('div');
      head.className = 'code-head';
      head.innerHTML = `<span class="code-lang">${escapeHtml(lang || 'code')}</span><span class="code-sp"></span>
        <button type="button" class="code-btn" data-act="copy">⧉ ${fa() ? 'کپی' : 'Copy'}</button>
        <button type="button" class="code-btn" data-act="dl">⬇ ${fa() ? 'دانلود' : 'Download'}</button>`;
      pre.replaceWith(box);
      box.appendChild(head);
      box.appendChild(pre);
      head.addEventListener('click', async (e) => {
        const btn = e.target.closest('.code-btn');
        if (!btn) return;
        const text = code.textContent;
        if (btn.dataset.act === 'copy') {
          try { await navigator.clipboard.writeText(text); }
          catch (err) {
            const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
            ta.select(); document.execCommand('copy'); ta.remove();
          }
          const old = btn.textContent; btn.textContent = '✓ ' + (fa() ? 'کپی شد' : 'Copied');
          setTimeout(() => { btn.textContent = old; }, 1600);
        } else {
          const ext = EXT[lang] || 'txt';
          const name = ext === 'Dockerfile' ? 'Dockerfile' : `bldbox-code.${ext}`;
          const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
          const a = document.createElement('a'); a.href = url; a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
      });
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.raw').forEach(el => {
      el.innerHTML = BB.md(el.dataset.raw || el.textContent || '');
      BB.enhanceCode(el);
    });
  });
})();
