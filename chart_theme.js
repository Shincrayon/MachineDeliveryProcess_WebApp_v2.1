/* =====================================================================
   🎨 MÀU DÙNG CHUNG cho biểu đồ + nhãn trạng thái (cả 2 phân hệ) — window.VZ
   Chỉ là hiển thị: không đọc/ghi dữ liệu.

   Bảng màu lấy từ bộ 8 màu chuẩn (skill dataviz, references/palette.md), mỗi chế độ sáng/tối có bước màu riêng.
   Thứ tự vòng đời đã chạy validate_palette.js (cặp liền kề, CVD protan/deutan ≥ 8, mắt thường ≥ 15) cho CẢ 2 chế độ:
     đặt hàng/chế tạo = tím · vận chuyển = ngọc · quá hạn = cam · đã về = xanh dương · lắp đặt = vàng ·
     thử nghiệm = hồng · vận hành / nghiệm thu = xanh lá.   Đỏ để riêng cho "Trễ".
   Trạng thái ngày về (x.status) dùng cùng màu với giai đoạn tương ứng: chờ về = tím, sắp về = ngọc, quá hạn = cam, đã về = xanh dương.
   Màu nhạt trên nền sáng (< 3:1) luôn đi kèm chữ (nhãn / chú thích) — không để màu đứng một mình.
   CSS: --lc-<giai đoạn> và các biến cũ --st-inst / --st-test / --st-oper / --st-over được đặt lại theo bảng này.
   ===================================================================== */
(function(){
const HEX = {
  dark:  { violet:'#9085e9', aqua:'#199e70', orange:'#d95926', blue:'#3987e5', yellow:'#c98500', magenta:'#d55181', green:'#008300', red:'#e66767', gray:'#8b98ad', slate:'#64748b' },
  light: { violet:'#6250d6', aqua:'#1baf7a', orange:'#eb6834', blue:'#2a78d6', yellow:'#eda100', magenta:'#e87ba4', green:'#008300', red:'#e34948', gray:'#94a3b8', slate:'#64748b' }
};
/* chữ trên nền nhạt của nhãn (badge): cùng họ màu nhưng đậm hơn để đọc được */
const INK = {
  dark:  { violet:'#b3abf2', aqua:'#3fd1a0', orange:'#f28a5f', blue:'#7fb3f2', yellow:'#f0b43c', magenta:'#ec86ac', green:'#3fc93f', red:'#f29a9a', gray:'#a7b3c6', slate:'#94a3b8' },
  light: { violet:'#4a3aa7', aqua:'#0b6e4c', orange:'#b5401a', blue:'#1c5cab', yellow:'#8a5a00', magenta:'#a8325f', green:'#006300', red:'#b42828', gray:'#52627a', slate:'#475569' }
};
/* giai đoạn → họ màu (Tiến độ: DM.STAGES / DM.installStatus; Danh mục: lifecycle_status) */
const LIFE = { planned:'gray', ordered:'violet', manufacturing:'violet', shipping:'aqua', overdue:'orange', arrived:'blue',
               installing:'yellow', testing:'magenta', in_operation:'green', idle:'slate', disposed:'slate', unknown:'gray' };
/* trạng thái ngày về (DM.arrivalStatus) */
const ARRIVAL = { arrived:'blue', overdue:'orange', soon:'aqua', waiting:'violet', unknown:'gray' };
/* đánh giá tiến độ */
const EVAL = { 'Sớm':'green', 'Đúng tiến độ':'blue', 'Trễ':'red' };
const CAT = ['blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red'];     // thứ tự cố định, không xoay vòng

const mode = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
const hex = fam => HEX[mode()][fam] || HEX[mode()].gray;
const ink = fam => INK[mode()][fam] || INK[mode()].gray;

/* biến CSS cho cả 2 chế độ */
function css(){
  const block = m => {
    const v = [];
    Object.keys(LIFE).forEach(k => { v.push(`--lc-${k}:${HEX[m][LIFE[k]]}`, `--lci-${k}:${INK[m][LIFE[k]]}`); });
    Object.keys(ARRIVAL).forEach(k => { v.push(`--ar-${k}:${HEX[m][ARRIVAL[k]]}`, `--ari-${k}:${INK[m][ARRIVAL[k]]}`); });
    // biến cũ của app: giữ tên, đổi màu theo bảng mới
    v.push(`--st-inst:${INK[m].yellow}`, `--st-test:${INK[m].magenta}`, `--st-oper:${INK[m].green}`, `--st-over:${INK[m].orange}`);
    return v.join(';');
  };
  return `:root{${block('dark')}}\n:root[data-theme="light"]{${block('light')}}
/* nhãn trạng thái ngày về + giai đoạn: nền nhạt cùng họ màu, chữ đậm đủ tương phản */
.b-arrived{background:color-mix(in srgb,var(--ar-arrived) 15%,transparent);color:var(--ari-arrived)}
.b-soon{background:color-mix(in srgb,var(--ar-soon) 15%,transparent);color:var(--ari-soon)}
.b-waiting{background:color-mix(in srgb,var(--ar-waiting) 15%,transparent);color:var(--ari-waiting)}
.b-overdue{background:color-mix(in srgb,var(--ar-overdue) 16%,transparent);color:var(--ari-overdue);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ar-overdue) 40%,transparent)}
.b-installing{background:color-mix(in srgb,var(--lc-installing) 15%,transparent);color:var(--lci-installing)}
.b-testing{background:color-mix(in srgb,var(--lc-testing) 15%,transparent);color:var(--lci-testing)}
.b-in_operation{background:color-mix(in srgb,var(--lc-in_operation) 15%,transparent);color:var(--lci-in_operation)}`;
}
/* gắn SAU <style> của index.html (cùng độ ưu tiên :root → khai báo sau thắng) */
const st = document.createElement('style'); st.id = 'vzTheme'; st.textContent = css();
if(document.body) document.body.appendChild(st); else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(st));

/* màu theo vai trò — đọc tại thời điểm vẽ (đổi chế độ sáng/tối thì vẽ lại) */
const VZ = {
  mode,
  life: k => hex(LIFE[k] || 'gray'),          // màu khối (thanh, lát, đoạn)
  lifeInk: k => ink(LIFE[k] || 'gray'),       // màu chữ / viền trên nền nhạt
  arrival: k => hex(ARRIVAL[k] || 'gray'),
  evalc: k => hex(EVAL[k] || 'gray'),
  cat: i => hex(CAT[i % CAT.length]),         // chỉ dùng khi ≤ 8 nhóm; nhóm thứ 9+ gộp "Khác"
  one: () => hex('blue'),                     // biểu đồ 1 chuỗi: 1 màu
  fam: f => hex(f), famInk: f => ink(f),
  // ngưỡng tỷ lệ đúng hạn: < 60% xấu · 60–80% cần cải thiện · ≥ 80% đạt (mục tiêu)
  ONTIME: { bad: .6, target: .8 }
};

/* ---------- hình nhỏ trong thẻ KPI (SVG nội tuyến, 1 màu chữ + 1 màu nhấn) ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
/* sparkline: pts = [{ v, t }] (t = nhãn tooltip). Điểm cuối có chấm. */
VZ.spark = (pts, color, opt) => {
  opt = opt || {};
  const W = 120, H = 26, P = 3, vs = pts.map(p => p.v).filter(v => v != null);
  if(vs.length < 2) return '';
  const lo = opt.min != null ? opt.min : Math.min(...vs), hi = opt.max != null ? opt.max : Math.max(...vs), rg = hi - lo || 1;
  const X = i => P + i * (W - 2 * P) / (pts.length - 1), Y = v => H - P - (v - lo) / rg * (H - 2 * P);
  let d = '', open = false;
  pts.forEach((p, i) => { if(p.v == null){ open = false; return; } d += (open ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.v).toFixed(1); open = true; });
  const last = pts.length - 1, lv = pts[last].v;
  const tgt = opt.target != null ? `<line x1="${P}" x2="${W - P}" y1="${Y(opt.target).toFixed(1)}" y2="${Y(opt.target).toFixed(1)}" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="3 3" stroke-width="1"/>` : '';
  const hits = pts.map((p, i) => `<rect x="${(X(i) - (W - 2 * P) / (pts.length - 1) / 2).toFixed(1)}" y="0" width="${((W - 2 * P) / (pts.length - 1)).toFixed(1)}" height="${H}" fill="transparent"><title>${esc(p.t)}</title></rect>`).join('');
  return `<svg class="vz-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(opt.label || '')}" role="img">${tgt}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    ${lv != null ? `<circle cx="${X(last).toFixed(1)}" cy="${Y(lv).toFixed(1)}" r="3" fill="${color}" stroke="var(--panel)" stroke-width="1.5"/>` : ''}${hits}</svg>`;
};
/* thanh phân đoạn: segs = [{ n, c, t }] — khe 2px giữa các đoạn, đoạn 0 bỏ qua */
VZ.segbar = (segs, opt) => {
  opt = opt || {};
  const tot = segs.reduce((s, x) => s + x.n, 0);
  if(!tot) return `<div class="vz-seg empty" role="img" aria-label="${esc(opt.label || '')}"></div>`;
  return `<div class="vz-seg" role="img" aria-label="${esc(opt.label || segs.map(s => s.t + ': ' + s.n).join(', '))}">${segs.filter(s => s.n).map(s =>
    `<i style="flex:${s.n};background:${s.c}" title="${esc(s.t)}: ${s.n}"></i>`).join('')}</div>`;
};
/* bullet graph (Stephen Few): giá trị 0..1, 3 vùng nền xấu / cần cải thiện / đạt, vạch mục tiêu */
VZ.bullet = (v, opt) => {
  opt = opt || {};
  const b = VZ.ONTIME.bad * 100, t = VZ.ONTIME.target * 100, pct = v == null ? 0 : Math.max(0, Math.min(1, v)) * 100;
  return `<div class="vz-bullet" role="img" aria-label="${esc(opt.label || '')}">
    <span class="r r1" style="width:${b}%" title="${esc(opt.t1 || '')}"></span><span class="r r2" style="left:${b}%;width:${t - b}%" title="${esc(opt.t2 || '')}"></span><span class="r r3" style="left:${t}%;width:${100 - t}%" title="${esc(opt.t3 || '')}"></span>
    ${v != null ? `<span class="bar" style="width:${pct}%"></span>` : ''}<span class="tg" style="left:${t}%" title="${esc(opt.tt || '')}"></span></div>`;
};
/* cột nhỏ: cols = [{ v, t }] */
VZ.cols = (cols, color, opt) => {
  opt = opt || {};
  const mx = Math.max(1, ...cols.map(c => c.v));
  return `<div class="vz-cols" role="img" aria-label="${esc(opt.label || cols.map(c => c.t).join(', '))}">${cols.map(c =>
    `<span title="${esc(c.t)}"><i style="height:${c.v ? Math.max(8, c.v / mx * 100) : 0}%;background:${color}"></i><b>${c.v || ''}</b></span>`).join('')}</div>`;
};
/* ▲▼ so với kỳ trước: up = tốt hay xấu tuỳ chỉ số (goodUp) */
VZ.delta = (now, prev, opt) => {
  opt = opt || {};
  if(now == null || prev == null) return '';
  const d = now - prev;
  if(!d) return `<span class="vz-delta flat" title="${esc(opt.t || '')}">＝ ${esc(opt.same || '')}</span>`;
  const good = opt.neutral ? null : (d > 0) === !!opt.goodUp;
  return `<span class="vz-delta ${good == null ? 'flat' : good ? 'good' : 'bad'}" title="${esc(opt.t || '')}">${d > 0 ? '▲' : '▼'} ${esc(opt.fmt ? opt.fmt(Math.abs(d)) : Math.abs(d))}</span>`;
};

const st2 = document.createElement('style');
st2.textContent = `
.kpi .vz{margin-top:8px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;min-height:20px}
.kpi .vz:empty{display:none}
.kpi .vz .vz-k{font-size:10.5px;color:var(--muted);white-space:nowrap}
.vz-spark{flex:1;height:24px;min-width:60px;color:var(--muted);overflow:visible}
.vz-seg{flex:1;display:flex;gap:2px;height:8px;border-radius:99px;overflow:hidden;background:rgba(148,163,184,.14);min-width:60px}
.vz-seg i{display:block;height:100%;min-width:3px}
.vz-seg i:first-child{border-radius:99px 0 0 99px} .vz-seg i:last-child{border-radius:0 99px 99px 0} .vz-seg i:only-child{border-radius:99px}
.vz-bullet{position:relative;flex:1;height:14px;min-width:80px}
.vz-bullet .r{position:absolute;top:0;bottom:0}
.vz-bullet .r1{left:0;border-radius:4px 0 0 4px;background:color-mix(in srgb,var(--st-bad) 22%,transparent)}
.vz-bullet .r2{background:color-mix(in srgb,var(--st-warn) 20%,transparent)}
.vz-bullet .r3{border-radius:0 4px 4px 0;background:color-mix(in srgb,var(--st-ok) 20%,transparent)}
.vz-bullet .bar{position:absolute;left:0;top:4px;height:6px;border-radius:0 4px 4px 0;background:var(--txt)}
.vz-bullet .tg{position:absolute;top:-2px;bottom:-2px;width:2px;margin-left:-1px;background:var(--txt);border-radius:2px}
.vz-cols{flex:1;display:flex;gap:4px;align-items:flex-end;height:26px;min-width:60px}
.vz-cols span{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;position:relative;background:rgba(148,163,184,.1);border-radius:3px}
.vz-cols i{display:block;width:100%;border-radius:3px 3px 0 0}
.vz-cols b{position:absolute;top:-1px;font-size:9.5px;color:var(--muted);font-weight:700;line-height:1}
.vz-delta{font-size:11px;font-weight:800;white-space:nowrap;padding:1px 6px;border-radius:99px}
.vz-delta.good{color:var(--st-ok);background:color-mix(in srgb,var(--st-ok) 12%,transparent)}
.vz-delta.bad{color:var(--st-bad);background:color-mix(in srgb,var(--st-bad) 12%,transparent)}
.vz-delta.flat{color:var(--muted);background:rgba(148,163,184,.12)}
.kpi .val-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.vz-leg{flex-basis:100%;display:flex;flex-wrap:wrap;gap:2px 9px;margin-top:0;font-size:10.5px;color:var(--muted)}
.vz-leg span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.vz-leg i{width:8px;height:8px;border-radius:2px;display:inline-block}`;
if(document.body) document.body.appendChild(st2); else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(st2));

window.VZ = VZ;
})();
