/* =====================================================================
   📤 XUẤT DỮ LIỆU (Tiến độ máy về) — popup chọn trường + thứ tự cột, sao chép TSV để dán Excel, tải .xlsx.
   Dữ liệu: window.__listView() trong index.html trả về đúng các dòng bảng 📋 Danh sách đang hiện
   (theo bộ lọc + thứ tự sắp xếp đang xem). File .xlsx dùng ExcelJS, chỉ tải từ cdnjs khi bấm nút.
   Lựa chọn hiện tại + các mẫu báo cáo lưu trong localStorage của trình duyệt này.
   ===================================================================== */
(function(){
const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
const LS_CUR = 'tdmv_exp_cur', LS_TPL = 'tdmv_exp_tpl';
const lsGet = (k, d) => { try{ const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; }catch(e){ return d; } };
const lsSet = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
const esc = v => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const plain = v => (v == null ? '' : String(typeof unescH === 'function' ? unescH(v) : v)).trim();   // DATA giữ chữ đã escape HTML
const isoOk = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const num = v => { if(v === null || v === undefined || v === '') return null; const n = Number(v); return isFinite(n) ? n : null; };

/* các trường: [field, kiểu s=chữ · n=số · d=ngày, mặc định chọn]. Nhãn lấy đúng nhãn app đang hiển thị (REC_LABEL / REC_LABEL_EN). */
const DEF = [
  ['ma_may','s',1], ['ten','s',1], ['sl','n',1], ['noilapdat','s',1], ['ncc','s',1], ['xuatxu','s',1], ['phutrach','s',1],
  ['vnd','n',1], ['usd','n',1], ['dathang','d',1], ['vekh','d',1], ['vedukienn','d',1], ['status','s',1], ['arrival_kind','s',0], ['danhgia','s',1],
  ['company','s',0], ['daysleft','n',0], ['congsuat','s',0], ['model','s',0], ['serial','s',0], ['duyet','d',0],
  ['ctu','n',0], ['tamungtt','d',0], ['tamung_days','n',0], ['ditaukh','n',0], ['ditautt','n',0], ['lanhkh','n',0], ['lanhtt','n',0],
  ['sonagyctm','n',0], ['workingday','s',0], ['xuatxuong','d',0], ['tauchay_tt','d',0], ['capcang_tt','d',0],
  ['venm_tt','d',0], ['giaitrinh','s',0]
];
/* nhãn / bảng dịch giá trị do index.html (mainSrc) đưa ra qua window.__expCtx() */
const CTX = () => (window.__expCtx && window.__expCtx()) || { labels:{}, LBL:{}, dgT:v=>v, ctT:v=>v };
const TYPE = Object.fromEntries(DEF.map(([k,t])=>[k,t]));
function label(k){
  const L = CTX().labels;
  const extra = { status: tr('Status','Trạng thái'), company: tr('Company','Công ty'), daysleft: tr('Days to arrival','Số ngày còn lại'),
                  tamung_days: tr('Advance-payment days','Số ngày tạm ứng'), arrival_kind: tr('Arrival date type','Trạng thái ngày về') };
  return extra[k] || (L && L[k]) || k;
}
/* giá trị 1 ô: null = để trống; ngày giữ dạng ISO 'YYYY-MM-DD' để định dạng sau */
function cell(x, k){
  const t = TYPE[k];
  if(k === 'status') return (x.status && x.status !== 'unknown' && CTX().LBL[x.status]) || null;   // trạng thái mới: DM.arrivalStatus (index.html)
  if(k === 'arrival_kind') return x.venm_tt ? tr('Actual','Thực tế') : x.vedukienn ? tr('Expected','Dự kiến') : null;
  if(k === 'tamung_days') return calcAdvanceDays(x);
  if(k === 'company') return (window.DM && DM.companyCode(plain(x.noilapdat))) || null;
  if(k === 'danhgia'){ const v = plain(x.danhgia); return v ? CTX().dgT(v) : '?'; }   // thiếu ngày -> "?" như file Excel gốc
  if(k === 'xuatxu'){ const v = plain(x.xuatxu); return v ? CTX().ctT(v) : null; }
  if(t === 'd') return isoOk(x[k]) ? x[k].slice(0,10) : null;
  if(t === 'n') return num(x[k]);
  const v = plain(x[k]); return v === '' ? null : v;
}
const dmy = iso => iso.slice(8,10) + '/' + iso.slice(5,7) + '/' + iso.slice(0,4);

/* Số ngày tạm ứng = Ngày tạm ứng TT (tamungtt) − Ngày đặt hàng (dathang), ngày lịch, số nguyên.
   Chỉ tính lúc xuất, không sửa DATA. Ngày là chuỗi 'YYYY-MM-DD' -> đưa về 00:00 UTC rồi trừ (không lệch do múi giờ).
   Thiếu 1 trong 2 ngày -> null (ô trống). Âm -> vẫn trả số âm + cảnh báo console 1 lần cho mỗi máy / cặp ngày. */
const utcDay = iso => isoOk(iso) ? Date.UTC(+iso.slice(0,4), +iso.slice(5,7) - 1, +iso.slice(8,10)) : null;
const warnedAdv = new Set();
function calcAdvanceDays(row){
  const a = utcDay(row && row.dathang), b = utcDay(row && row.tamungtt);
  if(a == null || b == null || !isFinite(a) || !isFinite(b)) return null;
  const d = Math.round((b - a) / 86400000);
  if(d < 0){
    const key = (row._id || plain(row.ten)) + '|' + row.dathang + '|' + row.tamungtt;
    if(!warnedAdv.has(key)){ warnedAdv.add(key);
      console.warn(`[Xuất dữ liệu] Số ngày tạm ứng âm (${d}) — "${plain(row.ten)}": ngày tạm ứng ${dmy(row.tamungtt)} trước ngày đặt hàng ${dmy(row.dathang)}. Kiểm tra lại dữ liệu.`); }
  }
  return d;
}

/* ---------- trạng thái lựa chọn ---------- */
const defaults = () => DEF.map(([k,,on])=>({ k, on: !!on }));
/* lựa chọn / mẫu đã lưu từ bản cũ: bỏ trường lạ; trường mới (bỏ chọn) chèn ngay sau trường đứng trước nó trong DEF,
   vd "Số ngày tạm ứng" vào sau "Ngày tạm ứng TT" theo đúng thứ tự của mẫu đó */
function normalize(list){
  const seen = new Set(), out = [];
  (Array.isArray(list) ? list : []).forEach(f=>{ if(f && TYPE[f.k] && !seen.has(f.k)){ seen.add(f.k); out.push({ k:f.k, on:!!f.on }); } });
  // Mã máy là khoá của mọi báo cáo: lựa chọn / mẫu cũ chưa có thì thêm vào cột đầu và chọn sẵn
  if(!seen.has('ma_may') && out.length){ out.unshift({ k:'ma_may', on:true }); seen.add('ma_may'); }
  DEF.forEach(([k], i)=>{
    if(seen.has(k)) return;
    let at = out.length;
    for(let j = i - 1; j >= 0; j--){ const p = out.findIndex(f=>f.k === DEF[j][0]); if(p >= 0){ at = p + 1; break; } }
    if(i === 0) at = 0;
    out.splice(at, 0, { k, on:false }); seen.add(k);
  });
  return out;
}
let S = null, Q = '', VIEW = null, dragK = null;
const save = () => lsSet(LS_CUR, S);
const chosen = () => S.filter(f=>f.on).map(f=>f.k);

/* ---------- xuất ---------- */
function toTSV(rows, keys){
  const clean = v => String(v).replace(/[\t\r\n]+/g, ' ').trim();     // tab / xuống dòng trong ô sẽ làm lệch cột Excel
  const fmt = (k, v) => v == null ? '' : TYPE[k] === 'd' ? dmy(v) : clean(v);
  // xuống dòng bằng \n: Excel nhận cả \n lẫn \r\n; trình duyệt trên Windows tự đổi \n -> \r\n khi chép
  return [keys.map(k=>clean(label(k))).join('\t')].concat(rows.map(x=>keys.map(k=>fmt(k, cell(x,k))).join('\t'))).join('\n');
}
async function copyText(text){
  try{ if(navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(text); return true; } }catch(e){}
  const ta = document.createElement('textarea');          // http thường / trình duyệt chặn Clipboard API
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try{ ok = document.execCommand('copy'); }catch(e){}
  ta.remove(); return ok;
}
let exLoad = null;
function loadExcelJS(){
  if(window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if(!exLoad) exLoad = new Promise((ok, bad)=>{
    const s = document.createElement('script'); s.src = EXCELJS; s.async = true;
    s.onload = () => window.ExcelJS ? ok(window.ExcelJS) : bad(new Error('ExcelJS'));
    s.onerror = () => { exLoad = null; bad(new Error(tr('Could not load the Excel library. Check the network and try again.','Chưa tải được thư viện Excel. Kiểm tra mạng rồi thử lại.'))); };
    document.head.appendChild(s);
  });
  return exLoad;
}
const pad = n => String(n).padStart(2,'0');
function fileName(){ const d = new Date();
  return `TienDoMayVe_Export_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`; }
async function toXlsx(rows, keys){
  const EX = await loadExcelJS();
  const wb = new EX.Workbook(); wb.creator = 'TienDoMayVe';
  const ws = wb.addWorksheet('Export', { views:[{ state:'frozen', ySplit:1 }] });
  const data = rows.map(x=>keys.map(k=>{
    const v = cell(x,k);
    if(v == null) return null;
    if(TYPE[k] === 'd') return new Date(Date.UTC(+v.slice(0,4), +v.slice(5,7)-1, +v.slice(8,10)));   // ngày thật của Excel
    return v;
  }));
  ws.addRow(keys.map(label));
  data.forEach(r=>ws.addRow(r));
  ws.getRow(1).font = { bold:true };
  keys.forEach((k,i)=>{
    const col = ws.getColumn(i+1), t = TYPE[k];
    if(t === 'd') col.numFmt = 'dd/mm/yyyy';
    else if(k === 'vnd' || k === 'usd') col.numFmt = '#,##0';
    const w = Math.max(String(label(k)).length, ...data.map(r=>{ const v = r[i];
      return v == null ? 0 : t === 'd' ? 10 : t === 'n' ? Math.round(v).toLocaleString('en-US').length : String(v).length; }));
    col.width = Math.min(60, Math.max(8, w + 2));
  });
  ws.getRow(1).alignment = { vertical:'middle' };
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = fileName(); document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1500);
  return a.download;
}
function toast(msg){
  let t = document.querySelector('.mm-toast'); if(!t){ t = document.createElement('div'); t.className = 'mm-toast'; document.body.appendChild(t); }
  t.innerHTML = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 2800);
}

/* ---------- giao diện ---------- */
const $ = id => document.getElementById(id);
function shell(){
  let bg = $('expBg'); if(bg) return bg;
  bg = document.createElement('div'); bg.id = 'expBg'; bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal wide exp-modal" role="dialog" aria-modal="true" aria-labelledby="expTitle">
    <button class="m-close" id="expX" aria-label="Close">✕</button>
    <h4 id="expTitle"></h4><div class="m-sub" id="expInfo"></div>
    <div class="exp-tpl"><select id="expTplSel"></select><input id="expTplName" maxlength="40">
      <button type="button" class="nbtn2 ghost" id="expTplSave"></button><button type="button" class="nbtn2 ghost" id="expTplDel"></button></div>
    <div class="exp-tools"><input id="expQ" type="search">
      <button type="button" class="nbtn2 ghost" data-a="all"></button><button type="button" class="nbtn2 ghost" data-a="none"></button>
      <button type="button" class="nbtn2 ghost" data-a="def"></button><span id="expCnt"></span></div>
    <ul class="exp-list" id="expList"></ul>
    <h5 class="exp-h" id="expPrevT"></h5><div class="exp-prev" id="expPrev"></div>
    <div class="exp-foot"><span id="expHint"></span>
      <button type="button" class="nbtn2 ghost" id="expCopy"></button><button type="button" class="nbtn2" id="expXlsx"></button></div>
  </div>`;
  document.body.appendChild(bg);
  bg.addEventListener('click', e=>{ if(e.target === bg) close(); });
  $('expX').onclick = close;
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && bg.classList.contains('show')) close(); });
  $('expQ').oninput = e=>{ Q = e.target.value.trim().toLowerCase(); drawList(); };
  bg.querySelectorAll('[data-a]').forEach(b=>b.onclick = ()=>{
    const a = b.dataset.a;
    if(a === 'def') S = defaults(); else S.forEach(f=>{ if(visible(f.k)) f.on = a === 'all'; });   // đang tìm: chỉ áp cho trường đang hiện
    save(); draw();
  });
  $('expTplSel').onchange = e=>{ const T = lsGet(LS_TPL, {}), n = e.target.value;
    if(n && T[n]){ S = normalize(T[n]); $('expTplName').value = n; save(); draw(); } };
  $('expTplSave').onclick = ()=>{
    const n = $('expTplName').value.trim();
    if(!n){ $('expTplName').focus(); toast(tr('Type a name for the template first.','Nhập tên mẫu trước.')); return; }
    const T = lsGet(LS_TPL, {}), had = !!T[n]; T[n] = S.map(f=>({ k:f.k, on:f.on })); lsSet(LS_TPL, T);
    drawTpl(n); toast((had ? tr('Template updated: ','Đã cập nhật mẫu: ') : tr('Template saved: ','Đã lưu mẫu: ')) + esc(n));
  };
  $('expTplDel').onclick = ()=>{
    const n = $('expTplSel').value; if(!n) return;
    const T = lsGet(LS_TPL, {}); delete T[n]; lsSet(LS_TPL, T); $('expTplName').value = ''; drawTpl(''); toast(tr('Template deleted: ','Đã xoá mẫu: ') + esc(n));
  };
  const list = $('expList');
  list.addEventListener('change', e=>{ const c = e.target.closest('input[data-k]'); if(!c) return;
    const f = S.find(f=>f.k === c.dataset.k); if(f){ f.on = c.checked; save(); draw(); } });
  list.addEventListener('click', e=>{ const b = e.target.closest('button[data-mv]'); if(!b) return;
    move(b.closest('li').dataset.k, +b.dataset.mv); });
  /* kéo-thả HTML5: thả lên nửa trên = chèn trước, nửa dưới = chèn sau */
  list.addEventListener('dragstart', e=>{ const li = e.target.closest('li'); if(!li) return; dragK = li.dataset.k; li.classList.add('drag');
    e.dataTransfer.effectAllowed = 'move'; try{ e.dataTransfer.setData('text/plain', dragK); }catch(_){} });
  list.addEventListener('dragend', ()=>{ dragK = null; list.querySelectorAll('.drag,.over-t,.over-b').forEach(n=>n.classList.remove('drag','over-t','over-b')); });
  list.addEventListener('dragover', e=>{ const li = e.target.closest('li'); if(!li || !dragK) return; e.preventDefault();
    const r = li.getBoundingClientRect(), top = e.clientY < r.top + r.height/2;
    list.querySelectorAll('.over-t,.over-b').forEach(n=>n.classList.remove('over-t','over-b')); li.classList.add(top ? 'over-t' : 'over-b'); });
  list.addEventListener('drop', e=>{ const li = e.target.closest('li'); if(!li || !dragK) return; e.preventDefault();
    const r = li.getBoundingClientRect(), after = e.clientY >= r.top + r.height/2;
    place(dragK, li.dataset.k, after); });
  $('expCopy').onclick = async ()=>{
    const keys = chosen(); if(!keys.length) return;
    const ok = await copyText(toTSV(VIEW.rows, keys));
    toast(ok ? tr(`✅ Copied ${VIEW.rows.length} rows — paste into Excel with Ctrl+V`,`✅ Đã sao chép ${VIEW.rows.length} dòng — dán vào Excel bằng Ctrl+V`)
             : tr('Could not copy. Use ⬇️ Download .xlsx instead.','Chưa sao chép được. Hãy dùng ⬇️ Tải file .xlsx.'));
  };
  $('expXlsx').onclick = async ()=>{
    const keys = chosen(); if(!keys.length) return;
    const b = $('expXlsx'), t0 = b.textContent; b.disabled = true; b.textContent = tr('⏳ Preparing…','⏳ Đang tạo file…');
    try{ const n = await toXlsx(VIEW.rows, keys); toast(tr(`✅ Downloaded ${VIEW.rows.length} rows: `,`✅ Đã tải ${VIEW.rows.length} dòng: `) + esc(n)); }
    catch(e){ toast('⚠️ ' + esc(e.message || e)); }
    finally{ b.disabled = !chosen().length; b.textContent = t0; }
  };
  return bg;
}
const visible = k => !Q || label(k).toLowerCase().includes(Q) || k.includes(Q);
function move(k, d){
  const i = S.findIndex(f=>f.k === k);
  let j = i + d;                                   // đang tìm: nhảy qua các trường bị ẩn
  while(j >= 0 && j < S.length && !visible(S[j].k)) j += d;
  if(i < 0 || j < 0 || j >= S.length) return;
  const [f] = S.splice(i, 1); S.splice(j, 0, f); save(); draw();
  const b = $('expList').querySelector(`li[data-k="${k}"] button[data-mv="${d}"]`); if(b && !b.disabled) b.focus();
}
function place(k, target, after){
  if(k === target) return;
  const [f] = S.splice(S.findIndex(x=>x.k === k), 1);
  let j = S.findIndex(x=>x.k === target); if(after) j++;
  S.splice(j, 0, f); save(); draw();
}
function drawTpl(sel){
  const T = lsGet(LS_TPL, {}), names = Object.keys(T).sort((a,b)=>a.localeCompare(b));
  $('expTplSel').innerHTML = `<option value="">${tr('— Report templates —','— Mẫu báo cáo —')}</option>` + names.map(n=>`<option value="${esc(n)}"${n === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
  $('expTplDel').disabled = !sel;
}
function drawList(){
  const vis = S.filter(f=>visible(f.k));
  $('expList').innerHTML = vis.length ? vis.map((f,i)=>`<li draggable="true" data-k="${f.k}" class="${f.on ? 'on' : ''}">
      <span class="exp-grip" aria-hidden="true">⋮⋮</span>
      <label><input type="checkbox" data-k="${f.k}"${f.on ? ' checked' : ''}> ${esc(label(f.k))}</label>
      <span class="exp-type">${TYPE[f.k] === 'd' ? tr('date','ngày') : TYPE[f.k] === 'n' ? tr('number','số') : tr('text','chữ')}</span>
      <button type="button" data-mv="-1" title="${tr('Move up','Lên')}"${i === 0 ? ' disabled' : ''}>▲</button>
      <button type="button" data-mv="1" title="${tr('Move down','Xuống')}"${i === vis.length-1 ? ' disabled' : ''}>▼</button></li>`).join('')
    : `<li class="exp-none">${tr('No field matches.','Không có trường nào khớp.')}</li>`;
}
function draw(){
  drawList();
  const keys = chosen(), none = !keys.length;
  $('expCnt').textContent = tr(`${keys.length}/${S.length} fields`,`${keys.length}/${S.length} trường`);
  $('expCopy').disabled = $('expXlsx').disabled = none;
  $('expHint').textContent = none ? tr('Select at least one field to export.','Chọn ít nhất 1 trường để xuất.') : '';
  const rows = VIEW.rows.slice(0, 5);
  const show = (k, v) => v == null ? '' : TYPE[k] === 'd' ? dmy(v) : TYPE[k] === 'n' ? Number(v).toLocaleString(tr('en-US','vi-VN')) : v;
  $('expPrev').innerHTML = none ? `<div class="exp-empty">${tr('Nothing to preview.','Chưa có gì để xem trước.')}</div>`
    : !rows.length ? `<div class="exp-empty">${tr('No rows match the current filters.','Không có dòng nào theo bộ lọc hiện tại.')}</div>`
    : `<table><thead><tr>${keys.map(k=>`<th>${esc(label(k))}</th>`).join('')}</tr></thead><tbody>${rows.map(x=>
        `<tr>${keys.map(k=>{ const v = cell(x,k); return `<td class="${TYPE[k] === 'n' ? 'n' : ''}">${esc(show(k,v))}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
}
function close(){ const bg = $('expBg'); if(bg) bg.classList.remove('show'); }
window.expOpen = () => {
  if(typeof window.__listView !== 'function') return;
  VIEW = window.__listView();
  S = normalize(lsGet(LS_CUR, null) || defaults());
  const bg = shell(); Q = '';
  $('expTitle').textContent = tr('📤 Export data','📤 Xuất dữ liệu');
  $('expInfo').innerHTML = tr(`Will export <b>${VIEW.rows.length}</b> rows with the current filters (${esc(VIEW.desc)}), in the order shown in the list.`,
                              `Sẽ xuất <b>${VIEW.rows.length}</b> dòng theo bộ lọc hiện tại (${esc(VIEW.desc)}), đúng thứ tự đang xem trong danh sách.`);
  $('expTplName').placeholder = tr('Template name, e.g. Weekly report','Tên mẫu, vd: Báo cáo tuần');
  $('expTplSave').textContent = tr('💾 Save template','💾 Lưu mẫu'); $('expTplDel').textContent = tr('🗑 Delete','🗑 Xoá mẫu');
  $('expQ').value = ''; $('expQ').placeholder = tr('🔍 Find a field…','🔍 Tìm trường…');
  const A = { all: tr('Select all','Chọn tất cả'), none: tr('Clear all','Bỏ chọn tất cả'), def: tr('Restore default','Khôi phục mặc định') };
  bg.querySelectorAll('[data-a]').forEach(b=>{ b.textContent = A[b.dataset.a]; });
  $('expPrevT').textContent = tr('Preview — first 5 rows','Xem trước — 5 dòng đầu');
  $('expCopy').textContent = tr('📋 Copy for Excel','📋 Sao chép để dán Excel'); $('expXlsx').textContent = tr('⬇️ Download .xlsx','⬇️ Tải file .xlsx');
  $('expX').setAttribute('aria-label', tr('Close','Đóng'));
  drawTpl(''); $('expTplName').value = ''; draw();
  bg.classList.add('show');
};
/* cho test: các hàm chuyển đổi không phụ thuộc giao diện */
window.__exp = { cell, toTSV, label, defaults, normalize, calcAdvanceDays };
})();
