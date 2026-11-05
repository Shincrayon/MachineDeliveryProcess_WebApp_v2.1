/* =====================================================================
   page_fit.js — số dòng mỗi trang vừa khít chỗ trống của bảng, không phải lăn chuột (window.PF).
   - PF.make(wrapFn, fallback, onChange): wrapFn() trả về .tablewrap (được phép tạo lại); fit.size() = số dòng mỗi trang.
   - Chiều cao dòng lấy từ biến CSS --list-row. Máy tính: mọi dòng cao bằng nhau (khối CSS "Danh sách vừa khít" trong index.html).
   - Điện thoại / màn thấp, cùng điều kiện @media của khối CSS đó: dùng fallback, cuộn trang như cũ.
   - Không tính theo clientHeight: thanh cuộn ngang tuỳ từng trang sẽ làm số dòng nhảy qua lại, nên luôn chừa sẵn chỗ cho nó.
   ===================================================================== */
(function () {
  const PF = window.PF = {};
  const desk = matchMedia('(min-width:1100px) and (min-height:640px)');
  const GUTTER = 17 + 2;                            // thanh cuộn ngang + viền trên dưới
  const MIN_ROWS = 3;

  PF.make = (wrapFn, fallback, onChange) => {
    let n = fallback, seen = null, raf = 0;
    const calc = w => {
      if (!desk.matches) return fallback;
      if (!w || !w.offsetHeight) return n;          // thẻ đang ẩn: giữ số cũ, hiện lại sẽ tính lại
      const row = parseFloat(getComputedStyle(w).getPropertyValue('--list-row')) || 48;
      const head = w.querySelector('thead');
      return Math.max(MIN_ROWS, Math.floor((w.offsetHeight - GUTTER - (head ? head.offsetHeight : 0)) / row));
    };
    const check = () => {
      raf = 0;
      const m = calc(wrapFn());
      if (m === n) return;
      const old = n; n = m; onChange(old, m);
    };
    const later = () => { if (!raf) raf = requestAnimationFrame(check); };
    const ro = new ResizeObserver(later);
    desk.addEventListener('change', later);
    return {
      size() {
        const w = wrapFn();
        if (w && w !== seen) {
          if (seen) ro.unobserve(seen);
          ro.observe(w, { box: 'border-box' }); seen = w;
        }
        return n = calc(w);
      }
    };
  };
  /* đổi số dòng mỗi trang: trang mới vẫn chứa máy đầu tiên đang xem */
  PF.page = (page, old, now) => Math.floor((page - 1) * old / now) + 1;

  /* ô bị cắt "…": rê chuột thấy đủ chữ */
  const clipped = e => e.scrollWidth > e.clientWidth;
  document.addEventListener('mouseover', e => {
    const td = e.target.closest && e.target.closest('#tb td, #mmTb td');
    if (td && !td.title && (clipped(td) || [...td.querySelectorAll('small')].some(clipped))) td.title = td.innerText.replace(/\s*\n\s*/g, ' · ');
  });
})();
