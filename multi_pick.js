/* =====================================================================
   multi_pick.js — biến 1 ô <select> thành ô chọn NHIỀU giá trị bằng ô tick (window.MP).
   - Ô <select> vẫn nằm đúng chỗ, giữ id và kiểu dáng cũ; chỉ là bấm vào thì mở bảng tick thay vì danh sách.
   - sel.value = các giá trị đã tick nối bằng dấu phẩy, theo thứ tự trong danh sách ("03,04"); '' = tất cả.
     Gán sel.value = '03,04' / '' cũng được; giá trị không có trong danh sách bị bỏ qua.
   - Tick là lọc ngay: mỗi lần tick bắn sự kiện 'change' như ô <select> thường → code cũ (onchange) chạy y nguyên.
   - MP.make(sel, { cols, short, unit, done, title }): option value '' là dòng "Tất cả" (chữ của nó làm nhãn khi
     chưa tick gì, phần trước dấu ':' làm tiền tố); short(v) = chữ ngắn của 1 giá trị khi tick 2–3 giá trị;
     unit = chữ sau số đếm khi tick từ 4 giá trị ("5 tháng"); done = chữ nút đóng. Chữ do trang truyền vào (đã dịch).
   ===================================================================== */
(function () {
  const MP = window.MP = {};
  let open = null;                                  // { sel, pop }

  function close() {
    if (!open) return;
    open.pop.remove(); open.sel.classList.remove('mp-open'); open.sel.setAttribute('aria-expanded', 'false');
    open = null;
  }
  document.addEventListener('pointerdown', e => {
    if (open && !open.pop.contains(e.target) && e.target !== open.sel) close();
  }, true);
  document.addEventListener('keydown', e => { if (open && e.key === 'Escape') { const s = open.sel; close(); s.focus(); } });
  window.addEventListener('resize', close);
  document.addEventListener('scroll', e => { if (open && !open.pop.contains(e.target)) close(); }, true);

  MP.make = (sel, o) => {
    o = o || {};
    const items = [...sel.options].filter(x => x.value !== '').map(x => ({ v: x.value, t: x.text }));
    const allOpt = [...sel.options].find(x => x.value === '');
    const allTxt = allOpt ? allOpt.text : 'All';
    const pre = allTxt.includes(':') ? allTxt.split(':')[0].trim() : '';
    const short = o.short || (v => (items.find(i => i.v === v) || {}).t || v);
    let on = new Set();

    const val = () => items.filter(i => on.has(i.v)).map(i => i.v).join(',');
    const text = () => {
      const vs = items.filter(i => on.has(i.v));
      if (!vs.length) return allTxt;
      if (vs.length === 1) return vs[0].t;
      if (vs.length <= 3) return (pre ? pre + ': ' : '') + vs.map(i => short(i.v)).join(', ');
      return o.unit ? vs.length + ' ' + o.unit : (pre ? pre + ': ' : '') + vs.length;
    };
    // ô <select> chỉ còn 1 dòng = chữ tóm tắt
    const shown = new Option('', '__mp');
    const paint = () => {
      shown.text = text();
      sel.title = (o.title ? o.title + ' — ' : '') + (on.size ? items.filter(i => on.has(i.v)).map(i => i.t).join(', ') : allTxt);
    };
    sel.innerHTML = ''; sel.add(shown); shown.selected = true;
    sel.classList.add('mp'); sel.setAttribute('aria-haspopup', 'true'); sel.setAttribute('aria-expanded', 'false');
    if (o.title) sel.dataset.mpTitle = o.title;
    Object.defineProperty(sel, 'value', {
      configurable: true,
      get: val,
      set: v => { const want = String(v || '').split(',').filter(Boolean); on = new Set(items.map(i => i.v).filter(x => want.includes(x))); paint(); if (open && open.sel === sel) draw(); }
    });
    Object.defineProperty(sel, 'mpItems', { value: items });
    const fire = () => { paint(); sel.dispatchEvent(new Event('change', { bubbles: true })); };

    let pop = null;
    function draw() {
      pop.innerHTML =
        `<div class="mp-grid" style="grid-template-columns:repeat(${o.cols || 3},minmax(0,1fr))">` +
        items.map(i => `<label class="mp-it${on.has(i.v) ? ' on' : ''}"><input type="checkbox" value="${i.v}"${on.has(i.v) ? ' checked' : ''}><span>${i.t}</span></label>`).join('') +
        `</div><div class="mp-foot"><button type="button" class="mp-all${on.size ? '' : ' on'}">${allTxt}</button>` +
        `<button type="button" class="mp-done">${o.done || 'OK'}</button></div>`;
    }
    function show() {
      if (open && open.sel === sel) { close(); return; }
      close();
      pop = document.createElement('div'); pop.className = 'mp-pop'; pop.setAttribute('role', 'dialog');
      draw(); document.body.appendChild(pop);
      const r = sel.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
      const top = r.bottom + 6 + h > innerHeight - 8 && r.top - 6 - h > 8 ? r.top - 6 - h : r.bottom + 6;
      pop.style.left = left + 'px'; pop.style.top = top + 'px';
      pop.addEventListener('change', e => {
        const c = e.target; if (!c.matches('input[type=checkbox]')) return;
        e.stopPropagation();
        if (c.checked) on.add(c.value); else on.delete(c.value);
        c.closest('.mp-it').classList.toggle('on', c.checked);
        pop.querySelector('.mp-all').classList.toggle('on', !on.size);
        fire();
      });
      pop.addEventListener('click', e => {
        if (e.target.closest('.mp-all')) { if (on.size) { on = new Set(); draw(); fire(); } }
        else if (e.target.closest('.mp-done')) { close(); sel.focus(); }
      });
      open = { sel, pop }; sel.classList.add('mp-open'); sel.setAttribute('aria-expanded', 'true');
      const first = pop.querySelector('input'); if (first) first.focus({ preventScroll: true });
    }
    // chặn danh sách có sẵn của trình duyệt, mở bảng tick
    sel.addEventListener('mousedown', e => { e.preventDefault(); sel.focus(); show(); });
    sel.addEventListener('keydown', e => {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'F4'].includes(e.key) || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); show(); }
      else if (e.key.length === 1 || ['Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) e.preventDefault();
    });
    paint();
    return sel;
  };
})();
