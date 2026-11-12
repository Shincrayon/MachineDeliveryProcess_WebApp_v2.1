/* =====================================================================
   🧩 SẮP XẾP — Danh mục MMTB: Nhà máy → Chuyền → ⭐ Máy chính / ◇ Máy phụ → ↳ Máy con
   Dùng cột có sẵn của mmtb_machines (05_mmtb_schema.sql): line_id, area_id, parent_machine_id, role, sort_order.
   Các cột này KHÔNG nằm trong sec (mã hoá) nên ghi thẳng, không cần __seal; chống ghi đè bằng version như form Sửa.

   Quy tắc:
   · Cây theo máy cha. Máy không có máy cha = cấp đầu, xếp theo chuyền (line_id); chưa có chuyền = "Chưa xếp".
   · Chuyển 1 máy thì cả nhánh máy con đi theo (cùng chuyền, cùng xưởng). Xưởng lấy theo chuyền (production_lines.area_id).
   · Vai trò theo vị trí: có máy cha = sub_unit; cấp đầu = main / auxiliary (đổi được). DB bắt buộc sub_unit ⇔ có máy cha.
   · Không cho vòng tròn cha-con, không cho xếp sang nhà máy khác.
   · Chuyền "Phụ trợ" (mã PHUTRO) cho thiết bị dùng chung (khí nén, xử lý nước...) — tạo bằng 1 nút.
   Giao diện: thanh tiến độ "đã xếp" · mỗi chuyền 1 thẻ (viền màu theo xưởng, đếm ⭐◇↳, thanh trạng thái nhỏ) · cây có
   đường nối · hộp chờ xếp có lọc + "chọn tất cả" · thẻ cảnh báo có nút · kéo-thả có nhãn vùng thả · dòng vừa xếp nháy 1 lần.
   index.html (mmtbSrc) đưa ngữ cảnh qua window.__mmCtx(); vẽ vào trang #c4.
   ===================================================================== */
(function(){
const UTIL_CODE = 'PHUTRO';
const S = { co: '', q: '', fq: '', sel: new Set(), open: new Set(), tab: 'tree', undo: null, busy: false, flash: new Set() };
const X = () => window.__mmCtx();
const E = v => escH(v == null ? '' : v);
const L = (en, vi) => tr(en, vi);
const AREA_COLS = ['#60a5fa', '#a78bfa', '#34d399', '#f472b6', '#22d3ee', '#fb923c', '#facc15', '#c084fc', '#2dd4bf', '#f87171'];

/* ---------- CSS ---------- */
const css = `
#c4{--ar-main:#fbbf24;--ar-aux:#2dd4bf;--ar-sub:#94a3b8;--ar-ln:rgba(148,163,184,.32)}
[data-theme="light"] #c4{--ar-main:#d97706;--ar-aux:#0d9488;--ar-sub:#64748b;--ar-ln:rgba(100,116,139,.35)}
#c4 .ar-head{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:12px 14px;margin-bottom:14px}
#c4 .ar-ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
#c4 .ar-ctl .search{flex:1 1 220px;min-width:170px}
#c4 .ar-ctl select{max-width:280px}
#c4 .ar-ib{height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--txt);font-weight:700;font-size:12.5px;cursor:pointer;white-space:nowrap;transition:.15s}
#c4 .ar-ib:hover{border-color:var(--sky);color:var(--sky)}
#c4 .ar-ib.pri{border-color:var(--sky);color:var(--sky)}
#c4 .ar-prog{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin-top:12px;font-size:12.5px;color:var(--muted)}
#c4 .ar-prog .lbl b{color:var(--txt);font-size:15px}
#c4 .ar-bar{flex:1 1 180px;height:8px;border-radius:99px;background:rgba(148,163,184,.16);overflow:hidden;min-width:120px}
#c4 .ar-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--sky),var(--green));transition:width .5s}
#c4 .ar-pct{font-weight:800;color:var(--txt);font-size:14px}
#c4 .ar-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:99px;border:1px solid var(--border);font-size:12px;color:var(--muted);background:transparent;cursor:default}
#c4 .ar-chip b{color:var(--txt)}
#c4 .ar-chip.warn{border-color:color-mix(in srgb,var(--st-over) 45%,transparent);color:var(--st-over)}
#c4 .ar-chip.warn b{color:var(--st-over)}
#c4 button.ar-chip{cursor:pointer}
#c4 .ar-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr);gap:16px;align-items:start}
#c4 .ar-col-h{display:flex;align-items:baseline;gap:8px;margin:0 4px 10px;font-size:14px;font-weight:800}
#c4 .ar-col-h small{color:var(--muted);font-weight:500;font-size:12px}
/* thẻ chuyền */
#c4 .ar-line{position:relative;border:1px solid var(--border);border-radius:14px;margin-bottom:10px;background:var(--panel);overflow:hidden;transition:border-color .15s,box-shadow .15s}
#c4 .ar-line::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--ac)}
#c4 .ar-line.open{box-shadow:0 6px 22px rgba(0,0,0,.18)}
#c4 .ar-lh{display:flex;align-items:center;gap:12px;padding:11px 14px 11px 16px;cursor:pointer;user-select:none}
#c4 .ar-lh:hover{background:rgba(148,163,184,.05)}
#c4 .ar-lic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-size:16px;flex:none;background:color-mix(in srgb,var(--ac) 16%,transparent)}
#c4 .ar-lt{min-width:0;flex:1}
#c4 .ar-lt b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#c4 .ar-lt small{color:var(--muted);font-size:11.5px}
#c4 .ar-lt small.ar-ln{display:block;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#c4 .ar-cnt{display:flex;gap:5px;flex:none}
#c4 .ar-cnt i{font-style:normal;font-size:11.5px;font-weight:700;padding:2px 7px;border-radius:99px;background:rgba(148,163,184,.1)}
#c4 .ar-cnt .m{color:var(--ar-main)} #c4 .ar-cnt .a{color:var(--ar-aux)} #c4 .ar-cnt .s{color:var(--ar-sub)}
#c4 .ar-mini{display:flex;width:64px;height:6px;border-radius:99px;overflow:hidden;background:rgba(148,163,184,.14);flex:none}
#c4 .ar-mini i{display:block;height:100%}
#c4 .ar-lw{color:var(--st-over);font-size:13px;flex:none}
#c4 .ar-chev{color:var(--muted);transition:transform .2s;flex:none}
#c4 .ar-line.open .ar-chev{transform:rotate(90deg)}
#c4 .ar-body{padding:2px 12px 12px 16px}
#c4 .ar-empty{color:var(--muted);font-size:12.5px;padding:12px;border:1.5px dashed var(--border);border-radius:10px;text-align:center}
/* nút máy */
#c4 ul.ar-ul{list-style:none;margin:0;padding:0}
#c4 ul.ar-kids{list-style:none;margin:0 0 0 17px;padding:0}
#c4 ul.ar-kids>li{position:relative;padding-left:20px}
#c4 ul.ar-kids>li::before{content:'';position:absolute;left:0;top:0;bottom:0;border-left:1.5px solid var(--ar-ln)}
#c4 ul.ar-kids>li:last-child::before{bottom:auto;height:19px}
#c4 ul.ar-kids>li::after{content:'';position:absolute;left:0;top:19px;width:15px;border-top:1.5px solid var(--ar-ln);border-bottom-left-radius:6px}
#c4 .ar-row{position:relative;display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:10px;font-size:13px;line-height:1.25;border:1px solid transparent;transition:background .15s,border-color .15s}
#c4 .ar-row:hover{background:rgba(148,163,184,.07)}
#c4 .ar-row.main,#c4 .ar-row.auxiliary{margin-top:6px;background:var(--panel2);border-color:var(--border);padding:8px 10px}
#c4 .ar-row.main{border-color:color-mix(in srgb,var(--ar-main) 30%,var(--border))}
#c4 .ar-row.sel{background:color-mix(in srgb,var(--sky) 15%,transparent)!important;border-color:color-mix(in srgb,var(--sky) 55%,transparent)!important}
#c4 .ar-row.hit{box-shadow:0 0 0 2px var(--amber)}
#c4 .ar-row.flash{animation:arFlash 1.4s ease-out}
@keyframes arFlash{0%{background:color-mix(in srgb,var(--green) 35%,transparent)}100%{}}
#c4 .ar-row input[type=checkbox]{width:16px;height:16px;flex:none;margin:0;accent-color:var(--sky);opacity:0;transition:opacity .15s}
#c4 .ar-row:hover input[type=checkbox],#c4 .ar-row input:checked,#c4.selmode .ar-row input[type=checkbox]{opacity:1}
#c4 .ic{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;flex:none;font-size:12px;font-weight:800}
#c4 .ar-row.main .ic{width:30px;height:30px;font-size:15px;background:color-mix(in srgb,var(--ar-main) 18%,transparent);color:var(--ar-main)}
#c4 .ar-row.auxiliary .ic{width:30px;height:30px;font-size:14px;background:color-mix(in srgb,var(--ar-aux) 16%,transparent);color:var(--ar-aux)}
#c4 .ar-row.sub_unit .ic{color:var(--ar-sub)}
#c4 .nm{cursor:pointer;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
#c4 .ar-row.main .nm{font-weight:700;font-size:13.5px}
#c4 .nm:hover{color:var(--sky)}
#c4 .nm small{display:block;color:var(--muted);font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis}
#c4 .ar-st{display:flex;align-items:center;gap:5px;flex:none;font-size:11px;color:var(--muted);white-space:nowrap}
#c4 .ar-st i{width:8px;height:8px;border-radius:50%;flex:none}
#c4 .mv{display:flex;gap:3px;flex:none;opacity:0;transition:opacity .15s}
#c4 .ar-row:hover .mv{opacity:1}
#c4 .mv button{width:22px;height:22px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--muted);cursor:pointer;font-size:9px;padding:0}
#c4 .mv button:hover{color:var(--sky);border-color:var(--sky)}
#c4 .ar-row[draggable=true]{cursor:grab}
#c4 .ar-row.dragging{opacity:.4}
/* vùng thả */
#c4 .drop{outline:2px solid var(--sky);outline-offset:-2px;background:color-mix(in srgb,var(--sky) 10%,transparent)!important}
#c4 .drop::after{content:attr(data-dl);position:absolute;right:10px;top:50%;transform:translateY(-50%);z-index:3;background:var(--sky);color:#04122b;
  font-size:11px;font-weight:800;padding:3px 9px;border-radius:99px;pointer-events:none;white-space:nowrap}
#c4 .ar-line.drop::after{top:22px}
/* hộp chờ xếp */
#c4 .ar-box{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:12px;position:relative}
#c4 .ar-box .search{margin-bottom:8px}
#c4 .ar-inbox{max-height:min(62vh,640px);overflow:auto;margin:0 -4px;padding:0 4px}
#c4 .ar-inbox .ar-row{margin-top:5px;background:var(--panel2);border-color:var(--border)}
#c4 .ar-inbox .ar-row.sub_unit{background:transparent;border-color:transparent}
#c4 .ar-boxf{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;font-size:12px;color:var(--muted)}
#c4 .ar-iss{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;margin-top:8px;font-size:12.5px;
  background:color-mix(in srgb,var(--st-over) 9%,transparent);border:1px solid color-mix(in srgb,var(--st-over) 30%,transparent)}
#c4 .ar-iss .t{flex:1;min-width:0} #c4 .ar-iss .t b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#c4 .ar-iss .t small{color:var(--muted)}
#c4 .ar-iss button{flex:none;padding:4px 10px;border-radius:8px;border:1px solid var(--st-over);background:transparent;color:var(--st-over);font-weight:700;font-size:11.5px;cursor:pointer}
#c4 .ar-iss button:hover{background:var(--st-over);color:#1a0f05}
#c4 .ar-tabs{display:none;gap:6px;margin-bottom:12px}
#c4 .ar-tabs button{flex:1;padding:9px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--muted);font-weight:700;cursor:pointer}
#c4 .ar-tabs button.on{background:var(--panel2);color:var(--txt);border-color:var(--sky)}
/* thanh thao tác nổi */
.ar-act{position:fixed;left:50%;bottom:20px;transform:translateX(-50%) translateY(160%);z-index:60;display:flex;gap:6px;align-items:center;
  background:var(--panel2);border:1px solid color-mix(in srgb,var(--sky) 60%,transparent);border-radius:999px;padding:6px 6px 6px 8px;
  box-shadow:0 14px 40px rgba(0,0,0,.4);transition:transform .25s cubic-bezier(.2,.9,.3,1.2);max-width:calc(100vw - 24px);overflow-x:auto}
.ar-act.show{transform:translateX(-50%) translateY(0)}
.ar-act .n{background:var(--sky);color:#04122b;border-radius:999px;padding:6px 12px;font-weight:800;font-size:12.5px;white-space:nowrap}
.ar-act button{padding:8px 13px;border-radius:999px;border:0;background:transparent;color:var(--txt);font-weight:700;font-size:12.5px;cursor:pointer;white-space:nowrap}
.ar-act button:hover{background:rgba(148,163,184,.14)}
.ar-act button.pri{background:color-mix(in srgb,var(--sky) 20%,transparent);color:var(--sky)}
.ar-act .x{color:var(--muted);padding:8px 11px}
/* hộp Đưa vào */
.ar-dlg{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
.ar-dlg .opt{position:relative;display:flex;flex-direction:column;gap:6px;padding:12px;border:1.5px solid var(--border);border-radius:14px;cursor:pointer;transition:.15s;min-width:0}
.ar-dlg .opt:hover{border-color:color-mix(in srgb,var(--sky) 50%,var(--border))}
.ar-dlg .opt:has(input:checked){border-color:var(--sky);background:color-mix(in srgb,var(--sky) 8%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--sky) 15%,transparent)}
.ar-dlg .opt>input[type=radio]{position:absolute;top:8px;right:8px;width:1px;height:1px;opacity:0;margin:0;pointer-events:none}
.ar-dlg .opt .hd{display:flex;align-items:center;gap:10px}
.ar-dlg .opt .big{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;font-size:18px;flex:none;background:rgba(148,163,184,.12)}
.ar-dlg .opt b{font-size:13px} .ar-dlg .opt small{display:block;color:var(--muted);font-size:11.5px;font-weight:500}
.ar-dlg .opt select,.ar-dlg .opt input[type=text]{width:100%}
.ar-dlg .opt input[type=text]{box-sizing:border-box;padding:9px 11px;border-radius:10px;border:1px solid var(--border);background:var(--panel2);color:var(--txt);font:inherit;font-size:13px;outline:none}
.ar-dlg .opt input[type=text]:focus{border-color:var(--sky)}
.ar-dlg .row3{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.ar-dlg .row3 .opt .hd{flex-direction:column;text-align:center;gap:6px}
.ar-dlg .pk{max-height:190px;overflow:auto;border:1px solid var(--border);border-radius:10px}
.ar-dlg .pk div{padding:7px 10px;cursor:pointer;font-size:12.5px;border-bottom:1px solid var(--border)}
.ar-dlg .pk div:last-child{border-bottom:0}
.ar-dlg .pk div small{color:var(--muted)}
.ar-dlg .pk div:hover{background:rgba(148,163,184,.08)}
.ar-dlg .pk div.on{background:color-mix(in srgb,var(--sky) 20%,transparent)}
.ar-dlg .pv{grid-column:1/-1;padding:10px 12px;border-radius:12px;background:var(--panel2);font-size:12.5px;border:1px dashed var(--border)}
.ar-dlg .pv b{color:var(--sky)}
.ar-dlg .btns{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end}
.ar-dlg .btns button{padding:9px 16px;border-radius:11px;border:1px solid var(--border);background:transparent;color:var(--txt);font-weight:700;cursor:pointer}
.ar-dlg .btns button.pri{background:var(--sky);border-color:var(--sky);color:#04122b}
.ar-toast{position:fixed;left:16px;right:16px;margin:0 auto;width:fit-content;bottom:84px;z-index:61;background:var(--panel2);border:1px solid var(--border);border-radius:14px;
  padding:10px 14px;font-size:13px;box-shadow:0 12px 32px rgba(0,0,0,.38);display:none;gap:12px;align-items:center;max-width:calc(100vw - 32px)}
.ar-toast.show{display:flex;animation:arUp .25s ease-out}
@keyframes arUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.ar-toast button{background:transparent;border:1px solid var(--sky);color:var(--sky);border-radius:9px;padding:4px 11px;font-weight:700;cursor:pointer;white-space:nowrap}
@media (max-width:820px){
  #c4 .ar-grid{grid-template-columns:1fr}
  #c4 .ar-tabs{display:flex}
  #c4 .ar-grid[data-tab=tree] .ar-side,#c4 .ar-grid[data-tab=side] .ar-tree{display:none}
  #c4 .mv,#c4 .ar-row input[type=checkbox]{opacity:1}
  #c4 .ar-mini,#c4 .ar-cnt .s{display:none}
  #c4 .ar-st span{display:none}
  .ar-dlg{grid-template-columns:1fr} .ar-dlg .row3{grid-template-columns:repeat(3,1fr)}
}`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

/* ---------- dữ liệu ---------- */
const so = (a, b) => (+a.sort_order || 0) - (+b.sort_order || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'vi');
function model(){
  const C = X(), MM = C.MM;
  const coId = S.co;
  const ms = MM.machines.filter(x => x.company_id === coId);
  const byId = new Map(MM.machines.map(x => [x.id, x]));
  const kids = new Map();
  ms.forEach(x => { const p = x.parent_machine_id && byId.get(x.parent_machine_id);
    if(p && p.company_id === coId){ if(!kids.has(p.id)) kids.set(p.id, []); kids.get(p.id).push(x); } });
  kids.forEach(a => a.sort(so));
  const isRoot = x => !x.parent_machine_id || !byId.has(x.parent_machine_id) || byId.get(x.parent_machine_id).company_id !== coId;
  const roots = ms.filter(isRoot);
  const lines = MM.lines.filter(l => l.company_id === coId)
    .sort((a, b) => (a.code === UTIL_CODE) - (b.code === UTIL_CODE) || String(a.name).localeCompare(String(b.name), 'vi'));
  const lineIds = new Set(lines.map(l => l.id));
  const inLine = new Map(lines.map(l => [l.id, roots.filter(x => x.line_id === l.id).sort(so)]));
  const free = roots.filter(x => !x.line_id || !lineIds.has(x.line_id)).sort(so);
  const desc = id => { const out = []; const go = i => (kids.get(i) || []).forEach(c => { out.push(c); go(c.id); }); go(id); return out; };
  const rootOf = x => { let r = x, n = 0; while(!isRoot(r) && n++ < 50) r = byId.get(r.parent_machine_id); return r; };
  // ⚠ cần xem lại
  const iss = [];
  ms.forEach(x => {
    if(isRoot(x)) return;
    const r = rootOf(x);
    if((x.line_id || null) !== (r.line_id || null))
      iss.push({ x, t: L('sub-unit is on a different line from its main machine', 'máy con khác chuyền với máy cha'), fix: 'line' });
  });
  MM.machines.forEach(x => { const p = x.parent_machine_id && byId.get(x.parent_machine_id);
    if(x.company_id === coId && p && p.company_id !== coId) iss.push({ x, t: L('parent machine belongs to another plant', 'máy cha thuộc nhà máy khác') }); });
  lines.forEach(l => { const r = inLine.get(l.id);
    if(l.code !== UTIL_CODE && r.length && !r.some(x => x.role === 'main')) iss.push({ line: l, t: L('line has no ⭐ main machine', 'chuyền chưa có ⭐ máy chính') }); });
  const count = x => 1 + desc(x.id).length;
  const all = x => [x, ...desc(x.id)];
  const areas = MM.areas.filter(a => a.company_id === coId).sort((a, b) => String(a.code).localeCompare(String(b.code)));
  return { C, MM, ms, byId, kids, roots, lines, inLine, free, desc, rootOf, iss, count, all, areas, util: lines.find(l => l.code === UTIL_CODE) };
}

/* ---------- vẽ ---------- */
const ROLE_IC = { main: '⭐', auxiliary: '◇', sub_unit: '↳' };
const ROLE_T = () => ({ main: L('Main machine', 'Máy chính'), auxiliary: L('Auxiliary machine', 'Máy phụ'), sub_unit: L('Sub-unit', 'Máy con') });
const lc = s => (X().lcc || {})[s] || '#94a3b8';
const ll = s => (X().lcl || {})[s] || s || '';
function hit(x){ const q = S.q; return !!q && [x.name, x.model, x.manufacturer, x.machine_code, x.serial_number].some(v => v && String(v).toLowerCase().includes(q)); }
function nodeHTML(M, x, can){
  const sub = [x.model, x.manufacturer].filter(Boolean).map(E).join(' · ');
  const kids = M.kids.get(x.id) || [];
  const busy = x.lifecycle_status !== 'in_operation';
  return `<li><div class="ar-row ${x.role || 'main'}${S.sel.has(x.id) ? ' sel' : ''}${hit(x) ? ' hit' : ''}${S.flash.has(x.id) ? ' flash' : ''}" data-id="${x.id}"${can ? ' draggable="true"' : ''}>
      ${can ? `<input type="checkbox" data-ck="${x.id}"${S.sel.has(x.id) ? ' checked' : ''} aria-label="${L('Select', 'Chọn')}">` : ''}
      <span class="ic" title="${ROLE_T()[x.role] || ''}">${ROLE_IC[x.role] || '•'}</span>
      <span class="nm" data-show="${x.id}" title="${E(x.name)}">${E(x.name)}${sub ? `<small>${sub}</small>` : ''}</span>
      <span class="ar-st" title="${E(ll(x.lifecycle_status))}"><i style="background:${lc(x.lifecycle_status)}"></i>${busy ? `<span>${E(ll(x.lifecycle_status))}</span>` : ''}</span>
      ${can ? `<span class="mv"><button data-up="${x.id}" title="${L('Move up', 'Lên')}">▲</button><button data-dn="${x.id}" title="${L('Move down', 'Xuống')}">▼</button></span>` : ''}
    </div>${kids.length ? `<ul class="ar-kids">${kids.map(c => nodeHTML(M, c, can)).join('')}</ul>` : ''}</li>`;
}
const treeHTML = (M, list, can) => `<ul class="ar-ul">${list.map(x => nodeHTML(M, x, can)).join('')}</ul>`;
function lineHTML(M, l, can){
  const r = M.inLine.get(l.id), all = r.flatMap(M.all), op = S.open.has(l.id), util = l.code === UTIL_CODE;
  const ai = M.areas.findIndex(a => a.id === l.area_id), area = ai >= 0 ? M.areas[ai] : null;
  const ac = util ? 'var(--ar-aux)' : ai >= 0 ? AREA_COLS[ai % AREA_COLS.length] : 'var(--ar-sub)';
  const nM = all.filter(x => x.role === 'main').length, nA = all.filter(x => x.role === 'auxiliary').length, nS = all.length - nM - nA;
  const byS = {}; all.forEach(x => { byS[x.lifecycle_status] = (byS[x.lifecycle_status] || 0) + 1; });
  const mini = Object.entries(byS).map(([s, n]) => `<i style="width:${n / all.length * 100}%;background:${lc(s)}" title="${E(ll(s))}: ${n}"></i>`).join('');
  const noMain = !util && r.length && !nM;
  return `<div class="ar-line${op ? ' open' : ''}" data-line="${l.id}" style="--ac:${ac}" data-dl="${L('Drop into', 'Thả vào')} ${E(l.name)}">
    <div class="ar-lh" data-tog="${l.id}">
      <span class="ar-lic">${util ? '🔌' : '⛓'}</span>
      <span class="ar-lt"><b>${E(l.name)}</b><small>${area ? E(area.name) + ' · ' : ''}${all.length} ${L('machines', 'máy')}</small>${l.notes ? `<small class="ar-ln" title="${E(l.notes)}">ⓘ ${E(l.notes)}</small>` : ''}</span>
      ${all.length ? `<span class="ar-cnt">${nM ? `<i class="m" title="${ROLE_T().main}">⭐ ${nM}</i>` : ''}${nA ? `<i class="a" title="${ROLE_T().auxiliary}">◇ ${nA}</i>` : ''}${nS ? `<i class="s" title="${ROLE_T().sub_unit}">↳ ${nS}</i>` : ''}</span><span class="ar-mini">${mini}</span>` : ''}
      ${noMain ? `<span class="ar-lw" title="${L('No main machine', 'Chưa có máy chính')}">⚠</span>` : ''}
      <span class="ar-chev">▸</span>
    </div>
    ${op ? `<div class="ar-body">${r.length ? treeHTML(M, r, can) : `<div class="ar-empty">${can ? L('Empty line — drag machines here or use 📦 Move to…', 'Chuyền trống — kéo máy vào đây hoặc dùng 📦 Đưa vào…') : L('No machines yet', 'Chưa có máy')}</div>`}</div>` : ''}
  </div>`;
}
function draw(){
  const host = document.getElementById('c4'); if(!host) return;
  const C = X(); if(!C || C.MM.err || !C.MM.machines.length){ host.innerHTML = C ? C.emptyHTML() : ''; return; }
  const cos = C.MM.companies.filter(c => C.MM.machines.some(x => x.company_id === c.id));
  if(!S.co || !cos.some(c => c.id === S.co)){
    const n = c => C.MM.machines.filter(x => x.company_id === c.id).length;
    S.co = (cos.slice().sort((a, b) => n(b) - n(a))[0] || {}).id || '';
  }
  const M = model(), can = !!C.canW;
  if(S.q) M.lines.forEach(l => { if(M.inLine.get(l.id).some(x => M.all(x).some(hit))) S.open.add(l.id); });
  const nFree = M.free.reduce((a, x) => a + M.count(x), 0), nIn = M.ms.length - nFree, pct = M.ms.length ? Math.round(nIn / M.ms.length * 100) : 0;
  const fq = S.fq, fm = x => !fq || [x.name, x.model, x.manufacturer].some(v => v && String(v).toLowerCase().includes(fq));
  const freeShown = M.free.filter(x => M.all(x).some(fm));
  host.classList.toggle('selmode', S.sel.size > 0);
  host.innerHTML = `
    <div class="ar-head">
      <div class="ar-ctl">
        <select id="arCo" aria-label="${L('Plant', 'Nhà máy')}">${cos.map(c => `<option value="${c.id}"${c.id === S.co ? ' selected' : ''}>🏭 ${E(c.code)} — ${E(c.name)}</option>`).join('')}</select>
        <div class="search"><input id="arQ" type="text" value="${E(S.q)}" placeholder="${L('Find a machine in the lines…', 'Tìm máy trong các chuyền…')}"></div>
        <button class="ar-ib" id="arAll">${S.open.size ? '⊟ ' + L('Collapse all', 'Thu hết') : '⊞ ' + L('Expand all', 'Mở hết')}</button>
        ${can && !M.util ? `<button class="ar-ib pri" id="arUtil">＋ ${L('Utilities line', 'Chuyền Phụ trợ')}</button>` : ''}
      </div>
      <div class="ar-prog">
        <span class="lbl">${L('Arranged', 'Đã xếp')} <b>${nIn}</b> / ${M.ms.length} ${L('machines', 'máy')}</span>
        <span class="ar-bar"><i style="width:${pct}%"></i></span><span class="ar-pct">${pct}%</span>
        <span class="ar-chip">⛓ <b>${M.lines.length}</b> ${L('lines', 'chuyền')}</span>
        <span class="ar-chip">📥 <b>${nFree}</b> ${L('unassigned', 'chưa xếp')}</span>
        ${M.iss.length ? `<button class="ar-chip warn" id="arIssGo">⚠ <b>${M.iss.length}</b> ${L('to review', 'cần xem lại')}</button>` : ''}
      </div>
    </div>
    <div class="ar-tabs"><button data-tab="tree"${S.tab === 'tree' ? ' class="on"' : ''}>⛓ ${L('Lines', 'Cây chuyền')} (${nIn})</button><button data-tab="side"${S.tab === 'side' ? ' class="on"' : ''}>📥 ${L('Waiting', 'Chưa xếp')} (${nFree})${M.iss.length ? ' · ⚠' + M.iss.length : ''}</button></div>
    <div class="ar-grid" data-tab="${S.tab}">
      <div class="ar-tree">
        <div class="ar-col-h">⛓ ${L('Production lines', 'Các chuyền')} <small>⭐ ${L('main', 'máy chính')} · ◇ ${L('auxiliary', 'máy phụ')} · ↳ ${L('sub-unit', 'máy con')}</small></div>
        ${M.lines.map(l => lineHTML(M, l, can)).join('')
          || `<div class="ar-empty">${L('This plant has no production lines yet. Add lines in 📚 Library → Production lines.', 'Nhà máy này chưa có chuyền. Thêm chuyền ở 📚 Thư viện → Chuyền sản xuất.')}</div>`}
      </div>
      <div class="ar-side">
        <div class="ar-col-h">📥 ${L('Waiting to be arranged', 'Hộp chờ xếp')} <small>${nFree} ${L('machines', 'máy')}</small></div>
        <div class="ar-box" id="arFree" data-dl="${L('Remove from line', 'Gỡ về Chưa xếp')}">
          ${M.free.length ? `<div class="search"><input id="arFq" type="text" value="${E(S.fq)}" placeholder="${L('Filter waiting machines…', 'Lọc máy chờ xếp…')}"></div>` : ''}
          <div class="ar-inbox">${freeShown.length ? treeHTML(M, freeShown, can) : `<div class="ar-empty">${M.free.length ? L('No match', 'Không có máy khớp') : '✅ ' + L('All machines are on a line.', 'Mọi máy đã thuộc một chuyền.')}</div>`}</div>
          ${can && freeShown.length ? `<div class="ar-boxf"><span>${freeShown.length} ${L('shown', 'đang hiện')}</span><button class="ar-ib" id="arSelAll">☑ ${L('Select all shown', 'Chọn tất cả máy đang lọc')}</button></div>` : ''}
        </div>
        ${M.iss.length ? `<div class="ar-col-h" id="arIssH" style="margin-top:18px">⚠ ${L('To review', 'Cần xem lại')} <small>${M.iss.length}</small></div>
          ${M.iss.map(o => `<div class="ar-iss"><span>⚠</span><span class="t">${o.x ? `<b>${E(o.x.name)}</b>` : `<b>${E(o.line.name)}</b>`}<small>${o.t}</small></span>
            ${o.fix && can ? `<button data-fix="${o.x.id}">${L('Fix', 'Sửa')}</button>` : ''}
            ${o.x ? `<button data-show="${o.x.id}">${L('View', 'Xem')}</button>` : `<button data-goto="${o.line.id}">${L('View line', 'Xem chuyền')}</button>`}</div>`).join('')}` : ''}
      </div>
    </div>`;
  S.flash.clear();
  wire(M, can);
  actBar();
}
function wire(M, can){
  const host = document.getElementById('c4');
  arCo.onchange = e => { S.co = e.target.value; S.sel.clear(); S.open.clear(); S.fq = ''; draw(); };
  const refocus = id => { const q = document.getElementById(id); if(q){ q.focus(); q.setSelectionRange(q.value.length, q.value.length); } };
  arQ.oninput = e => { S.q = e.target.value.trim().toLowerCase(); clearTimeout(arQ._t); arQ._t = setTimeout(() => { draw(); refocus('arQ');
    const h = host.querySelector('.ar-row.hit'); if(h) h.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 250); };
  if(window.arFq) arFq.oninput = e => { S.fq = e.target.value.trim().toLowerCase(); clearTimeout(arFq._t); arFq._t = setTimeout(() => { draw(); refocus('arFq'); }, 200); };
  arAll.onclick = () => { if(S.open.size) S.open.clear(); else M.lines.forEach(l => S.open.add(l.id)); draw(); };
  if(window.arUtil) arUtil.onclick = () => makeUtil(M);
  if(window.arIssGo) arIssGo.onclick = () => { S.tab = 'side'; draw(); const h = document.getElementById('arIssH'); if(h) h.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  if(window.arSelAll) arSelAll.onclick = () => { host.querySelectorAll('#arFree [data-ck]').forEach(c => S.sel.add(c.dataset.ck)); draw(); };
  host.querySelectorAll('.ar-tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; draw(); });
  host.querySelectorAll('[data-tog]').forEach(h => h.onclick = () => { const id = h.dataset.tog; S.open.has(id) ? S.open.delete(id) : S.open.add(id); draw(); });
  host.querySelectorAll('[data-show]').forEach(n => n.onclick = e => { e.stopPropagation(); M.C.mmShow(n.dataset.show); });
  host.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { S.open.add(b.dataset.goto); S.tab = 'tree'; draw();
    const l = host.querySelector(`.ar-line[data-line="${b.dataset.goto}"]`); if(l) l.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  host.querySelectorAll('[data-ck]').forEach(c => { c.onclick = e => e.stopPropagation(); c.onchange = () => { c.checked ? S.sel.add(c.dataset.ck) : S.sel.delete(c.dataset.ck);
    c.closest('.ar-row').classList.toggle('sel', c.checked); host.classList.toggle('selmode', S.sel.size > 0); actBar(); }; });
  host.querySelectorAll('[data-up],[data-dn]').forEach(b => b.onclick = e => { e.stopPropagation(); move(M, b.dataset.up || b.dataset.dn, b.dataset.up ? -1 : 1); });
  host.querySelectorAll('[data-fix]').forEach(a => a.onclick = () => { const x = M.byId.get(a.dataset.fix), r = M.rootOf(x);
    if(r.line_id) S.open.add(r.line_id);
    run(M, [x.id], P => P.follow(x, r.line_id || null, lineArea(M, r.line_id)), L('Moved to the line of its main machine', 'Đã đưa về chuyền của máy cha')); });
  if(!can) return;
  // kéo-thả (máy tính): kéo máy đang chọn (hoặc chỉ máy đó) → thả vào chuyền / máy khác / hộp chờ xếp
  let drag = null;
  host.querySelectorAll('.ar-row[draggable]').forEach(r => {
    r.ondragstart = e => { const id = r.dataset.id; drag = S.sel.has(id) ? [...S.sel] : [id]; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id);
      drag.forEach(i => { const el = host.querySelector(`.ar-row[data-id="${i}"]`); if(el) el.classList.add('dragging'); }); };
    r.ondragend = () => { drag = null; host.querySelectorAll('.drop,.dragging').forEach(d => d.classList.remove('drop', 'dragging')); };
  });
  const zone = (el, ok, act) => {
    el.addEventListener('dragover', e => { if(!drag || !ok(e)) return; e.preventDefault(); e.stopPropagation(); host.querySelectorAll('.drop').forEach(d => d !== el && d.classList.remove('drop')); el.classList.add('drop'); });
    el.addEventListener('dragleave', e => { if(!el.contains(e.relatedTarget)) el.classList.remove('drop'); });
    el.addEventListener('drop', e => { if(!drag) return; e.preventDefault(); e.stopPropagation(); el.classList.remove('drop'); const ids = drag; drag = null; act(ids); });
  };
  host.querySelectorAll('.ar-row[data-id]').forEach(r => { const x = M.byId.get(r.dataset.id);
    r.dataset.dl = '↳ ' + L('Sub-unit of', 'Làm máy con của') + ' ' + (x ? x.name : '');
    zone(r, () => !drag.includes(r.dataset.id), ids => toParent(model(), ids, r.dataset.id)); });
  host.querySelectorAll('.ar-line').forEach(l => zone(l, () => true, ids => toLine(model(), ids, l.dataset.line)));
  zone(document.getElementById('arFree'), () => true, ids => unassign(model(), ids));
}

/* ---------- thanh thao tác nổi khi đã chọn ---------- */
function actBar(){
  let b = document.querySelector('.ar-act');
  if(!b){ b = document.createElement('div'); b.className = 'ar-act'; document.body.appendChild(b); }
  const on = S.sel.size && document.getElementById('c4') && document.getElementById('c4').classList.contains('active');
  b.classList.toggle('show', !!on);
  if(!on) return;
  b.innerHTML = `<span class="n">${L(`${S.sel.size} selected`, `${S.sel.size} đã chọn`)}</span>
    <button class="pri" id="arMove">📦 ${L('Move to…', 'Đưa vào…')}</button>
    <button id="arMain" title="${L('Set as main machine', 'Đặt làm máy chính')}">⭐ ${L('Main', 'Máy chính')}</button>
    <button id="arOut" title="${L('Remove from line', 'Gỡ về Chưa xếp')}">📥 ${L('Remove', 'Gỡ ra')}</button>
    <button class="x" id="arClr" title="${L('Clear selection', 'Bỏ chọn')}">✕</button>`;
  arMove.onclick = () => dialog(model());
  arMain.onclick = () => setRole(model(), [...S.sel], 'main');
  arOut.onclick = () => unassign(model(), [...S.sel]);
  arClr.onclick = () => { S.sel.clear(); draw(); };
}

/* ---------- hộp "Đưa vào…" ---------- */
function dialog(M){
  const ids = [...S.sel].filter(id => M.byId.has(id));
  if(!ids.length) return;
  const ban = new Set(); ids.forEach(id => { ban.add(id); M.desc(id).forEach(d => ban.add(d.id)); });
  const lineName = x => (M.lines.find(l => l.id === M.rootOf(x).line_id) || {}).name || L('Unassigned', 'Chưa xếp');
  const cands = M.ms.filter(x => !ban.has(x.id)).map(x => ({ x, line: lineName(x) }))
    .sort((a, b) => String(a.line).localeCompare(String(b.line), 'vi') || so(a.x, b.x));
  const tp = tops(M, ids), carried = tp.reduce((a, id) => a + M.desc(id).length, 0);
  mTitle.textContent = '📦 ' + L(`Move ${ids.length} machine(s) to…`, `Đưa ${ids.length} máy vào…`);
  mSub.textContent = ids.slice(0, 4).map(id => M.byId.get(id).name).join(' · ') + (ids.length > 4 ? ` +${ids.length - 4}` : '');
  const opt = (v, ic, t, d, extra = '', on = false) => `<label class="opt"><input type="radio" name="arOp" value="${v}"${on ? ' checked' : ''}>
    <span class="hd"><span class="big">${ic}</span><span><b>${t}</b>${d ? `<small>${d}</small>` : ''}</span></span>${extra}</label>`;
  mBody.innerHTML = `<div class="ar-dlg">
    ${opt('line', '⛓', L('A production line', 'Vào một chuyền'), L('becomes a top-level machine', 'thành máy cấp đầu của chuyền'),
      `<select id="arLine">${M.lines.map(l => `<option value="${l.id}" title="${E(l.notes || '')}">${l.code === UTIL_CODE ? '🔌 ' : '⛓ '}${E(window.__lineLbl ? window.__lineLbl(l) : l.name)}</option>`).join('')}</select>`, true)}
    ${opt('parent', '↳', L('Sub-unit of a machine', 'Làm máy con của…'), L('follows that machine\'s line', 'đi theo chuyền của máy đó'),
      `<input type="text" id="arPq" placeholder="${L('Search name / model…', 'Gõ tìm tên / model…')}"><div class="pk" id="arPk"></div>`)}
    <div class="row3">
      ${opt('main', '⭐', L('Main machine', 'Máy chính'), '')}
      ${opt('auxiliary', '◇', L('Auxiliary', 'Máy phụ'), '')}
      ${opt('free', '📥', L('Remove', 'Gỡ ra'), '')}
    </div>
    <div class="pv" id="arPv"></div>
    <div class="btns"><button id="arCancel">${L('Cancel', 'Huỷ')}</button><button class="pri" id="arOk">${L('Apply', 'Xác nhận')}</button></div></div>`;
  let pick = null;
  const pv = () => { const op = (document.querySelector('[name=arOp]:checked') || {}).value;
    const n = `<b>${tp.length}</b> ${L('machine(s)', 'máy')}` + (carried ? ` + <b>${carried}</b> ${L('sub-unit(s) going along', 'máy con đi theo')}` : '');
    const tgt = op === 'line' ? `⛓ <b>${E((M.lines.find(l => l.id === arLine.value) || {}).name || '')}</b>`
      : op === 'parent' ? (pick ? `↳ ${L('under', 'dưới')} <b>${E(M.byId.get(pick).name)}</b>` : `<span style="color:var(--muted)">${L('choose a parent machine above', 'chọn máy cha ở trên')}</span>`)
      : op === 'free' ? `📥 <b>${L('Unassigned', 'Chưa xếp')}</b>` : `${op === 'main' ? '⭐' : '◇'} <b>${ROLE_T()[op]}</b>`;
    arPv.innerHTML = (op === 'main' || op === 'auxiliary' ? `${L('Set', 'Đặt')} ${n} → ${tgt}` : `${n} → ${tgt}`); };
  const pk = () => { const q = arPq.value.trim().toLowerCase();
    const list = cands.filter(o => !q || [o.x.name, o.x.model, o.x.manufacturer, o.line].some(v => v && String(v).toLowerCase().includes(q))).slice(0, 80);
    arPk.innerHTML = list.map(o => `<div data-p="${o.x.id}"${pick === o.x.id ? ' class="on"' : ''}>${ROLE_IC[o.x.role] || ''} ${E(o.x.name)} <small>· ${E(o.line)}${o.x.model ? ' · ' + E(o.x.model) : ''}</small></div>`).join('')
      || `<div style="cursor:default"><small>${L('No match', 'Không có máy khớp')}</small></div>`;
    arPk.querySelectorAll('[data-p]').forEach(d => d.onclick = () => { pick = d.dataset.p; document.querySelector('[name=arOp][value=parent]').checked = true; pk(); pv(); }); };
  arPq.oninput = () => { document.querySelector('[name=arOp][value=parent]').checked = true; pk(); pv(); };
  arPq.onclick = () => { document.querySelector('[name=arOp][value=parent]').checked = true; pv(); };
  pk();
  arLine.onchange = () => { document.querySelector('[name=arOp][value=line]').checked = true; pv(); };
  document.querySelectorAll('[name=arOp]').forEach(r => r.onchange = pv);
  if(!M.lines.length){ arLine.disabled = true; document.querySelector('[name=arOp][value=parent]').checked = true; }
  pv();
  arCancel.onclick = () => mBg.classList.remove('show');
  arOk.onclick = () => {
    const op = document.querySelector('[name=arOp]:checked').value;
    if(op === 'parent' && !pick){ showNotice({ type: 'error', title: L('Choose the parent machine', 'Chọn máy cha'), sub: L('Search and click a machine in the list.', 'Gõ tìm rồi bấm chọn một máy trong danh sách.') }); return; }
    if(op === 'line' && !arLine.value) return;
    mBg.classList.remove('show');
    if(op === 'line') toLine(M, ids, arLine.value);
    else if(op === 'parent') toParent(M, ids, pick);
    else if(op === 'free') unassign(M, ids);
    else setRole(M, ids, op);
  };
  openM();
}

/* ---------- kế hoạch ghi ---------- */
/* xưởng của chuyền; chuyền chưa gắn xưởng -> undefined = giữ nguyên xưởng của máy */
const lineArea = (M, lineId) => { const l = lineId && M.lines.find(x => x.id === lineId); return l && l.area_id ? l.area_id : undefined; };
/* bỏ máy có tổ tiên cũng đang được chọn (nhánh cha đã kéo theo) */
const tops = (M, ids) => ids.filter(id => { let x = M.byId.get(id), n = 0; while(x && x.parent_machine_id && n++ < 50){ if(ids.includes(x.parent_machine_id)) return false; x = M.byId.get(x.parent_machine_id); } return true; });
function planner(M){
  const ch = new Map();
  const set = (x, patch) => { const o = ch.get(x.id) || { x, patch: {} }; Object.assign(o.patch, patch); ch.set(x.id, o); };
  const follow = (x, lineId, areaId) => { [x, ...M.desc(x.id)].forEach(d => { const p = { line_id: lineId }; if(areaId !== undefined) p.area_id = areaId; set(d, p); }); };
  return { set, follow, ch };
}
function toLine(M, ids, lineId){
  const area = lineArea(M, lineId); S.open.add(lineId);     // mở chuyền vừa nhận máy để thấy kết quả
  run(M, tops(M, ids), (P, x) => {
    const role = x.role === 'sub_unit' ? (M.inLine.get(lineId).some(r => r.role === 'main') ? 'auxiliary' : 'main') : x.role;
    P.set(x, { parent_machine_id: null, role, sort_order: nextOrder(M.inLine.get(lineId)) });
    P.follow(x, lineId, area);
  }, L('Moved to line', 'Đã xếp vào chuyền') + ' <b>' + E((M.lines.find(l => l.id === lineId) || {}).name) + '</b>');
}
function toParent(M, ids, pid){
  const p = M.byId.get(pid); if(!p) return;
  const bad = ids.filter(id => id === pid || M.desc(id).some(d => d.id === pid));
  if(bad.length){ showNotice({ type: 'error', title: L('Not allowed', 'Không xếp được'), sub: L('A machine cannot be placed under itself or under one of its own sub-units.', 'Không thể xếp một máy vào chính nó hoặc vào máy con của nó.') }); return; }
  if(ids.some(id => M.byId.get(id).company_id !== p.company_id)){ showNotice({ type: 'error', title: L('Not allowed', 'Không xếp được'), sub: L('The parent machine must be in the same plant.', 'Máy cha phải cùng nhà máy.') }); return; }
  const r = M.rootOf(p), lineId = r.line_id || null; if(lineId) S.open.add(lineId);
  run(M, tops(M, ids), (P, x) => {
    P.set(x, { parent_machine_id: pid, role: 'sub_unit', sort_order: nextOrder(M.kids.get(pid) || []) });
    P.follow(x, lineId, lineId ? lineArea(M, lineId) : undefined);
  }, L('Placed under', 'Đã xếp làm máy con của') + ' <b>' + E(p.name) + '</b>');
}
function unassign(M, ids){
  run(M, tops(M, ids), (P, x) => {
    P.set(x, { parent_machine_id: null, role: x.role === 'sub_unit' ? 'main' : x.role, sort_order: nextOrder(M.free) });
    P.follow(x, null, undefined);
  }, L('Moved to Unassigned', 'Đã gỡ về Chưa xếp'));
}
function setRole(M, ids, role){
  const subs = ids.filter(id => M.byId.get(id).parent_machine_id);
  if(subs.length === ids.length){ showNotice({ type: 'error', title: L('Only for top-level machines', 'Chỉ áp dụng cho máy cấp đầu'),
    sub: L('These are sub-units. Move them to a line first (📦 Move to… → A production line).', 'Các máy này đang là máy con. Đưa chúng ra chuyền trước (📦 Đưa vào… → Một chuyền).') }); return; }
  run(M, ids.filter(id => !M.byId.get(id).parent_machine_id), (P, x) => P.set(x, { role }),
    (role === 'main' ? '⭐ ' + L('Set as main machine', 'Đã đặt làm máy chính') : '◇ ' + L('Set as auxiliary machine', 'Đã đặt làm máy phụ')) +
    (subs.length ? ' · ' + L(`${subs.length} sub-unit(s) skipped`, `bỏ qua ${subs.length} máy con`) : ''));
}
const nextOrder = arr => (arr.reduce((m, x) => Math.max(m, +x.sort_order || 0), 0) || 0) + 10;
function move(M, id, dir){
  const x = M.byId.get(id); if(!x) return;
  const sib = x.parent_machine_id && M.kids.has(x.parent_machine_id) ? M.kids.get(x.parent_machine_id)
    : x.line_id && M.inLine.has(x.line_id) ? M.inLine.get(x.line_id) : M.free;
  const i = sib.indexOf(x), j = i + dir; if(i < 0 || j < 0 || j >= sib.length) return;
  const arr = sib.slice(); [arr[i], arr[j]] = [arr[j], arr[i]];
  run(M, arr.map(o => o.id), (P, o) => { const v = (arr.indexOf(o) + 1) * 10; if(+o.sort_order !== v) P.set(o, { sort_order: v }); }, null);
}

/* ---------- ghi xuống DB (+ hoàn tác) ---------- */
const KEYS = ['line_id', 'area_id', 'parent_machine_id', 'role', 'sort_order'];
async function run(M, ids, fn, msg){
  if(S.busy) return;
  const P = planner(M);
  ids.map(id => M.byId.get(id)).filter(Boolean).forEach(x => fn(P, x));
  // chỉ giữ thay đổi thật
  const list = [...P.ch.values()].map(o => { const patch = {}; Object.keys(o.patch).forEach(k => { if((o.x[k] ?? null) !== (o.patch[k] ?? null) && !(k === 'sort_order' && +o.x[k] === +o.patch[k])) patch[k] = o.patch[k]; }); return { x: o.x, patch }; })
    .filter(o => Object.keys(o.patch).length);
  if(!list.length){ if(msg) toast(L('Nothing to change.', 'Không có gì thay đổi.')); return; }
  const before = list.map(o => ({ id: o.x.id, v: Object.fromEntries(KEYS.map(k => [k, o.x[k] ?? null])) }));
  const fail = await write(list);
  await M.C.reload();
  S.sel.clear();
  list.forEach(o => { if(!fail.some(f => f.x.id === o.x.id)) S.flash.add(o.x.id); });
  draw();
  if(fail.length) showNotice({ type: 'error', title: L(`${fail.length} machine(s) were not saved`, `${fail.length} máy chưa ghi được`),
    sub: fail.map(f => `• ${E(f.x.name)} — ${E(f.why)}`).join('<br>') });
  if(msg){ S.undo = fail.length === list.length ? null : before.filter(b => !fail.some(f => f.x.id === b.id));
    toast((fail.length ? '⚠ ' : '✅ ') + msg + ` (${list.length - fail.length} ${L('machines', 'máy')})`, !!S.undo); }
}
async function write(list){
  const sb = window.__sb, fail = [];
  if(!sb) return list.map(o => ({ x: o.x, why: L('no connection', 'chưa kết nối') }));
  S.busy = true; window.__selfWritingM = true;
  try{
    // máy cha trước, máy con sau (đặt parent cho con khi cha đã ở đúng chỗ — không bắt buộc với DB nhưng giữ thứ tự dễ hiểu)
    for(const o of list){
      try{
        const { data, error } = await sb.from('mmtb_machines').update(o.patch).eq('id', o.x.id)
          .eq('version', o.x.version == null ? 1 : o.x.version).is('deleted_at', null).select('id');
        if(error) throw error;
        if(!data || !data.length) throw { code: 'conflict' };
      }catch(e){ fail.push({ x: o.x, why: e && e.code === 'conflict' ? L('someone else just changed this machine — reloaded, please try again', 'người khác vừa sửa máy này — đã tải lại, hãy thử lại') : dbErrText(e) }); }
    }
  } finally { S.busy = false; setTimeout(() => { window.__selfWritingM = false; }, 1500); }
  return fail;
}
async function undo(){
  const u = S.undo; S.undo = null; hideToast(); if(!u) return;
  const M = model();
  const list = u.map(b => ({ x: M.byId.get(b.id), patch: b.v })).filter(o => o.x);
  const fail = await write(list);
  await M.C.reload(); draw();
  if(fail.length) showNotice({ type: 'error', title: L('Could not undo everything', 'Chưa hoàn tác được hết'), sub: fail.map(f => `• ${E(f.x.name)} — ${E(f.why)}`).join('<br>') });
  else toast('↩ ' + L('Undone', 'Đã hoàn tác'), false);
}
async function makeUtil(M){
  const C = M.C, co = C.MM.companies.find(c => c.id === S.co);
  const sb = window.__sb; if(!sb) return;
  try{
    const row = { company_id: S.co, code: UTIL_CODE, name: L('Utilities', 'Phụ trợ'), materials: [], is_active: true };
    const { error } = await sb.from('production_lines').insert(await window.__seal('production_lines', row));
    if(error) throw error;
    await C.reload(); draw();
    toast('✅ ' + L('Created line', 'Đã tạo chuyền') + ' <b>' + L('Utilities', 'Phụ trợ') + '</b> — ' + E(co ? co.code : ''), false);
  }catch(e){ showNotice({ type: 'error', title: L('Could not create the line', 'Chưa tạo được chuyền'), sub: dbErrText(e) }); }
}

/* ---------- thông báo có nút Hoàn tác ---------- */
function toast(html, canUndo){
  let t = document.querySelector('.ar-toast');
  if(!t){ t = document.createElement('div'); t.className = 'ar-toast'; document.body.appendChild(t); }
  t.innerHTML = `<span>${html}</span>${canUndo ? `<button id="arUndo">↩ ${L('Undo', 'Hoàn tác')}</button>` : ''}`;
  t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(hideToast, canUndo ? 9000 : 3000);
  if(canUndo) document.getElementById('arUndo').onclick = undo;
}
function hideToast(){ const t = document.querySelector('.ar-toast'); if(t) t.classList.remove('show'); }

window.ARR = { draw, state: S, leave: () => { const b = document.querySelector('.ar-act'); if(b) b.classList.remove('show'); } };
})();
