/* =====================================================================
   combo.js — ô chữ có danh sách xổ để chọn, vẫn gõ được giá trị mới (window.CB).
   - Ô <input> giữ nguyên id và .value, code đọc / ghi / lưu của form không đổi.
   - CB.make(input, { items, hint }): items() trả về các giá trị (được phép lặp, trống): CB.values gom lại;
     hint: false = không chèn dòng nhắc "Có phải … không?" (ô quá hẹp).
   - Bấm vào ô là xổ cả danh sách; gõ thì lọc, không phân biệt dấu. Chọn 1 dòng bắn 'input' + 'change' như gõ tay.
   - Chỉ nhắc, không chặn: gõ gần giống giá trị đã có thì hỏi lại, vẫn lưu được.
   - Chữ do trang truyền vào CB.labels (đã dịch). Cần metrics.js (DM.fold).
   ===================================================================== */
(function () {
  const CB = window.CB = { labels: { pre: 'Did you mean', post: '?', fresh: 'New value' } };
  const fold = s => DM.fold(s);
  let cur = null;                                   // { el, o, pop, rows, at, typed }
  let picking = false;

  /* gom các cách viết chỉ khác dấu / hoa thường: giữ cách viết nhiều máy dùng nhất; xếp theo tên */
  CB.values = list => {
    const by = new Map();
    (list || []).forEach(v => {
      const t = String(v == null ? '' : v).trim(), k = fold(t);
      if (!k || t === '🔒') return;
      if (!by.has(k)) by.set(k, new Map());
      by.get(k).set(t, (by.get(k).get(t) || 0) + 1);
    });
    return [...by.values()].map(m => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'))[0][0])
      .sort((a, b) => a.localeCompare(b, 'vi'));
  };
  const dist = (a, b) => {
    let p = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const n = [i];
      for (let j = 1; j <= b.length; j++) n[j] = Math.min(p[j] + 1, n[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      p = n;
    }
    return p[b.length];
  };
  /* giá trị đã có gần giống chữ đang gõ; trùng hẳn thì không có gì để hỏi */
  CB.near = (v, list) => {
    const t = String(v || '').trim(), k = fold(t);
    if (!k || list.includes(t)) return null;
    const max = k.length >= 6 ? 2 : k.length >= 4 ? 1 : 0;
    let best = null, bd = max + 1;
    list.forEach(x => { const d = dist(k, fold(x)); if (d < bd) { bd = d; best = x; } });
    return best;
  };

  function close() {
    if (!cur) return;
    cur.pop.remove(); cur.el.setAttribute('aria-expanded', 'false');
    cur = null;
  }
  function place() {
    if (!cur) return;
    const r = cur.el.getBoundingClientRect(), H = window.innerHeight;
    if (r.bottom < 0 || r.top > H) { close(); return; }
    const below = H - r.bottom - 12, up = below < 160 && r.top > below;
    const s = cur.pop.style, w = Math.max(r.width, 180);
    s.width = w + 'px';
    s.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    s.maxHeight = Math.min(260, Math.max(up ? r.top - 12 : below, 80)) + 'px';
    s.top = up ? '' : (r.bottom + 4) + 'px';
    s.bottom = up ? (H - r.top + 4) + 'px' : '';
  }
  function mark() {
    [...cur.pop.querySelectorAll('.cb-it')].forEach((d, i) => {
      d.classList.toggle('on', i === cur.at);
      if (i === cur.at) d.scrollIntoView({ block: 'nearest' });
    });
  }
  function draw() {
    const all = CB.values(cur.o.items()), q = fold(cur.el.value), v = cur.el.value.trim();
    cur.rows = cur.typed && q ? all.filter(x => fold(x).includes(q)) : all;
    cur.at = cur.rows.indexOf(v);
    cur.pop.textContent = '';
    cur.rows.forEach((x, i) => {
      const d = document.createElement('div'); d.className = 'cb-it'; d.textContent = x;
      d.onmousemove = () => { if (cur.at !== i) { cur.at = i; mark(); } };
      d.onclick = () => pick(x);
      cur.pop.appendChild(d);
    });
    if (!cur.rows.length && v) {
      const d = document.createElement('div'); d.className = 'cb-fresh'; d.textContent = CB.labels.fresh + ': ' + v;
      cur.pop.appendChild(d);
    }
    cur.pop.hidden = !cur.pop.firstChild;
    mark(); place();
  }
  function open(el, o) {
    if (cur && cur.el === el) return;
    close();
    const pop = document.createElement('div'); pop.className = 'cb-pop';
    pop.onmousedown = e => e.preventDefault();      // giữ con trỏ trong ô, ô không bị blur khi bấm danh sách
    document.body.appendChild(pop);
    cur = { el, o, pop, rows: [], at: -1, typed: false };
    el.setAttribute('aria-expanded', 'true');
    draw();
  }
  function setVal(el, v) {
    close();
    el.value = v;
    picking = true;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    picking = false;
  }
  const pick = v => setVal(cur.el, v);
  function paintHint(el, o) {
    if (o.hint === false) return;
    const box = el.parentNode.querySelector(':scope > .cb-hint');
    const best = CB.near(el.value, CB.values(o.items()));
    if (!best) { if (box) box.remove(); return; }
    const h = box || el.insertAdjacentElement('afterend', document.createElement('div'));
    h.className = 'cb-hint'; h.textContent = '';
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = best;
    b.onclick = e => { e.preventDefault(); setVal(el, best); };
    h.append(CB.labels.pre + ' ', b, ' ' + CB.labels.post);
  }
  /* mở form / điền sẵn dữ liệu máy: xoá các dòng nhắc cũ */
  CB.clearHints = () => document.querySelectorAll('.cb-hint').forEach(h => h.remove());

  CB.make = (el, o) => {
    el.autocomplete = 'off';
    el.setAttribute('role', 'combobox'); el.setAttribute('aria-expanded', 'false');
    el.addEventListener('focus', () => open(el, o));
    el.addEventListener('click', () => open(el, o));
    el.addEventListener('blur', () => { if (cur && cur.el === el) close(); });
    el.addEventListener('input', () => {
      paintHint(el, o);
      if (picking) return;
      open(el, o);
      if (cur) { cur.typed = true; draw(); }
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        open(el, o);
        if (!cur.rows.length) return;
        const n = cur.rows.length, st = e.key === 'ArrowDown' ? 1 : -1;
        cur.at = cur.at < 0 ? (st > 0 ? 0 : n - 1) : (cur.at + st + n) % n;
        mark();
      } else if (e.key === 'Enter' && cur && cur.el === el) {
        e.preventDefault(); e.stopPropagation();
        if (cur.at >= 0) pick(cur.rows[cur.at]); else close();
      } else if (e.key === 'Escape' && cur && cur.el === el) {
        e.stopPropagation();
        close();
      }
    });
  };
  window.addEventListener('resize', place);
  document.addEventListener('scroll', e => { if (cur && !cur.pop.contains(e.target)) place(); }, true);
})();
