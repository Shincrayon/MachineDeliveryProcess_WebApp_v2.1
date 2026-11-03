/* =====================================================================
   motion.js — hiệu ứng chuyển động dùng chung (window.MO). Không thư viện ngoài.
   - Tôn trọng "giảm chuyển động" của hệ điều hành: MO.reduced() = true → không đếm số, không hiệu ứng biểu đồ
     (CSS trong index.html tắt animation / transition).
   - Tự động, không cần gọi: số KPI (.kpi .val) chạy từ giá trị cũ sang mới, thẻ KPI hiện lần lượt lần đầu,
     ô sáng trượt dưới tab đang chọn, trượt ngang khi đổi phân hệ, popup mở về đầu.
   - Gọi tay: MO.saved(ids) sau khi lưu → dòng có data-mo = id loé xanh 1 lần (kể cả khi bảng vẽ lại sau đó);
     MO.skel(n) → HTML khung chờ; MO.ready() → gỡ khung chờ lúc mở trang.
   ===================================================================== */
(function () {
  const MO = window.MO = {};
  const mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  MO.reduced = () => !!(mq && mq.matches);

  /* ---------- số KPI: chạy từ số cũ sang số mới ---------- */
  const prev = new Map();                    // khoá thẻ -> giá trị đã hiện lần trước
  const loc = () => window.NUMLOC || (document.documentElement.lang === 'vi' ? 'vi-VN' : 'en-US');
  const sepOf = l => { const p = (1234.5).toLocaleString(l); return { grp: p.charAt(1), dec: p.charAt(p.length - 2) }; };
  // số đầu tiên trong chữ, theo dấu thập phân của ngôn ngữ đang dùng: "12,5 tỷ" (vi) / "1,234" (en)
  function parse(txt, l) {
    const s = sepOf(l), re = new RegExp('-?\\d[\\d' + '\\' + s.grp + ']*(\\' + s.dec + '\\d+)?');
    const m = txt.match(re); if (!m) return null;
    const raw = m[0], dec = m[1] ? m[1].length - 1 : 0;
    const n = parseFloat(raw.split(s.grp).join('').replace(s.dec, '.'));
    return isFinite(n) ? { n, dec, at: m.index, raw } : null;
  }
  const keyOf = (val) => {
    const k = val.closest('.kpi'); if (!k) return null;
    if (k.id) return k.id;
    const box = k.parentElement, host = k.closest('[id]');
    return (host ? host.id : '') + ':' + [...box.children].indexOf(k);
  };
  function tween(val) {
    const node = [...val.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.data));
    const key = keyOf(val); if (!node || !key || node._moEnd != null) return;   // cùng 1 ô có thể tới 2 lần trong 1 lượt
    const l = loc(), p = parse(node.data, l); if (!p) return;
    const from = prev.has(key) ? prev.get(key) : 0;
    prev.set(key, p.n);
    if (MO.reduced() || from === p.n || document.hidden) return;   // tab nền: hiện số cuối luôn
    const end = node.data, head = end.slice(0, p.at), tail = end.slice(p.at + p.raw.length);
    if (/^\s*[\/:–-]\s*\d/.test(tail)) return;        // "8 / 12", "10:30": không chạy số giữa chừng
    const grouped = p.raw.length > 4 && p.raw.indexOf(sepOf(l).grp) >= 0;
    const dur = prev.size && from ? 450 : 700, t0 = performance.now();
    const show = v => { node.data = head + v.toLocaleString(l, { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec, useGrouping: grouped }) + tail; };
    node._moEnd = end; running.add(node); show(from);
    requestAnimationFrame(function tick(t) {
      if (node._moEnd !== end) return;                 // đã có số mới đè lên / đã chốt
      const q = Math.min(1, (t - t0) / dur);
      if (q < 1) { show(from + (p.n - from) * (1 - Math.pow(1 - q, 3))); requestAnimationFrame(tick); }
      else settle(node);
    });
  }
  // tab bị ẩn giữa chừng (requestAnimationFrame dừng, hẹn giờ bị giãn): chốt ngay mọi số đang chạy
  const running = new Set();
  function settle(node) { if (node._moEnd != null) node.data = node._moEnd; node._moEnd = null; running.delete(node); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) running.forEach(settle); });
  // thẻ KPI hiện lần lượt — chỉ lần đầu một dải thẻ xuất hiện, đổi bộ lọc thì không chạy lại
  const seenStrip = new WeakSet(), seenKey = new Set();
  function enter(strip) {
    if (!strip) return;
    const host = strip.id || (strip.closest('[id]') || {}).id || '';
    if (seenStrip.has(strip) || seenKey.has(host + strip.className)) return;
    const all = [...strip.querySelectorAll(':scope > .kpi')]; if (!all.length) return;
    seenStrip.add(strip); seenKey.add(host + strip.className);
    if (MO.reduced()) return;
    all.forEach((k, i) => { k.style.setProperty('--mo-i', i); k.classList.add('mo-in'); });
    setTimeout(() => all.forEach(k => k.classList.remove('mo-in')), 400 + all.length * 60);
  }

  /* ---------- dòng vừa lưu loé xanh ---------- */
  const pend = new Map();                    // id -> hạn chờ bảng vẽ lại
  // chờ bảng vẽ lại (dòng mới được thêm vào DOM) rồi mới loé; không vẽ lại trong 1,5 giây thì loé dòng đang có
  MO.saved = ids => {
    const until = Date.now() + 6000;
    [].concat(ids).filter(Boolean).forEach(id => { pend.set(String(id), until); });
    setTimeout(() => document.querySelectorAll('tr[data-mo]').forEach(flash), 1500);
  };
  function flash(tr) {
    const id = tr.dataset.mo, t = pend.get(id); if (!t) return;
    if (t < Date.now()) { pend.delete(id); return; }
    pend.delete(id);
    if (MO.reduced()) return;
    tr.classList.remove('mo-flash'); void tr.offsetWidth; tr.classList.add('mo-flash');
    tr.addEventListener('animationend', e => { if (e.animationName === 'moFlash') tr.classList.remove('mo-flash'); });
  }

  /* ---------- khung chờ ---------- */
  MO.skel = (n = 4) => '<div class="mo-skel">' + Array.from({ length: n }, (_, i) =>
    `<i style="width:${92 - (i * 17) % 40}%"></i>`).join('') + '</div>';
  MO.ready = () => { const b = document.getElementById('moBoot'); if (b) { b.classList.add('gone'); setTimeout(() => b.remove(), 400); } };

  /* ---------- ô sáng dưới tab đang chọn ---------- */
  let ink = null;
  function placeInk(instant) {
    const bar = document.querySelector('.topbar .tabs'); if (!bar) return;
    if (!ink) { ink = document.createElement('span'); ink.className = 'tab-ink'; bar.prepend(ink); bar.classList.add('has-ink'); instant = true; }
    const a = [...bar.querySelectorAll('.tab.active')].find(t => t.offsetParent);
    if (!a) { ink.style.opacity = 0; return; }
    if (instant) ink.style.transition = 'none';
    ink.style.opacity = 1;
    ink.style.transform = `translateX(${a.offsetLeft}px)`; ink.style.width = a.offsetWidth + 'px';
    ink.style.top = a.offsetTop + 'px'; ink.style.height = a.offsetHeight + 'px';
    if (instant) { void ink.offsetWidth; ink.style.transition = ''; }
  }

  /* ---------- theo dõi DOM ---------- */
  let lastMod = null, inkRaf = 0;
  const onMut = list => {
    let tabs = false;
    for (const m of list) {
      const t = m.target;
      if (m.type === 'attributes') {
        if (t === document.body && m.attributeName === 'data-mod') {
          const mod = t.dataset.mod;
          if (lastMod && mod !== lastMod && !MO.reduced()) {
            t.classList.remove('mo-mod-l', 'mo-mod-r'); void t.offsetWidth;
            t.classList.add(mod === 'delivery' ? 'mo-mod-r' : 'mo-mod-l');
            clearTimeout(t._moT); t._moT = setTimeout(() => t.classList.remove('mo-mod-l', 'mo-mod-r'), 450);
          }
          lastMod = mod; tabs = true;
        } else if (t.classList && t.classList.contains('tab')) tabs = true;
        else if (t.classList && (t.classList.contains('modal-bg') || t.classList.contains('notice-bg')) && t.classList.contains('show') && !(m.oldValue || '').includes('show')) {
          t.scrollTop = 0; t.querySelectorAll('.modal,.notice').forEach(c => { c.scrollTop = 0; });
        }
        continue;
      }
      if (t.classList && t.classList.contains('val') && t.closest('.kpi')) tween(t);
      const strips = new Set();
      m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches('.kpi')) strips.add(n.parentElement);
        n.querySelectorAll('.kpi').forEach(k => strips.add(k.parentElement));
        n.querySelectorAll('.kpi .val').forEach(tween);
        if (n.matches('.kpi .val')) tween(n);
        if (pend.size) { if (n.matches('tr[data-mo]')) flash(n); n.querySelectorAll('tr[data-mo]').forEach(flash); }
      });
      strips.forEach(enter);
    }
    if (tabs) { cancelAnimationFrame(inkRaf); inkRaf = requestAnimationFrame(() => placeInk(false)); }
  };
  function watch() {
    lastMod = document.body.dataset.mod || null;
    new MutationObserver(onMut).observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'data-mod'], attributeOldValue: true });
    const bar = document.querySelector('.topbar .tabs');
    if (bar && window.ResizeObserver) new ResizeObserver(() => placeInk(true)).observe(bar);
    placeInk(true);
    setTimeout(() => MO.ready(), 30000);              // lỡ không mở được dữ liệu: không để khung chờ mãi
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

  /* ---------- biểu đồ: cột mọc lần lượt, đường vẽ dần ---------- */
  if (window.Chart && Chart.defaults) {
    const d = Chart.defaults;
    d.animation = Object.assign({}, d.animation, { duration: 650, easing: 'easeOutQuart',
      delay: c => (c.type === 'data' && c.mode === 'default' && !MO.reduced()) ? Math.min(c.dataIndex * 35 + c.datasetIndex * 60, 500) : 0 });
    if (MO.reduced()) d.animation = false;
  }
  if (window.echarts && echarts.init && !echarts.__mo) {
    const init = echarts.init;
    echarts.init = function () {
      const ch = init.apply(this, arguments), set = ch.setOption;
      ch.setOption = function (opt) {
        if (opt && typeof opt === 'object' && !('animation' in opt)) {
          if (MO.reduced()) opt.animation = false;
          else Object.assign(opt, { animationDuration: 650, animationEasing: 'cubicOut', animationDurationUpdate: 400,
            animationDelay: i => Math.min(i * 25, 400) });
        }
        return set.apply(this, arguments);
      };
      return ch;
    };
    echarts.__mo = true;
  }
})();
