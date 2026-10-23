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
    if (window.DOMPurify) {
      return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
    }
    return html;
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

  document.addEventListener('DOMContentLoaded', () => {
    const menu = document.getElementById('menuBtn');
    const side = document.getElementById('sidebar');
    if (menu && side) {
      if (window.innerWidth <= 860) menu.style.display = 'grid';
      menu.addEventListener('click', () => side.classList.toggle('open'));
      window.addEventListener('resize', () => {
        menu.style.display = window.innerWidth <= 860 ? 'grid' : 'none';
      });
    }
    document.querySelectorAll('.raw').forEach(el => {
      el.innerHTML = BB.md(el.dataset.raw || el.textContent || '');
    });
  });
})();
