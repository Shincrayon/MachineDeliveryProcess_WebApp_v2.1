/* =====================================================================
   📤 XUẤT DỮ LIỆU (Tiến độ máy về) — popup chọn trường + thứ tự cột, sao chép TSV để dán Excel, tải .xlsx.
   Dữ liệu: window.__listView() trong index.html trả về đúng các dòng bảng 📋 Danh sách đang hiện
   (theo bộ lọc + thứ tự sắp xếp đang xem). File .xlsx dùng ExcelJS, chỉ tải từ cdnjs khi bấm nút.
   Lựa chọn hiện tại + các mẫu báo cáo lưu trong localStorage của trình duyệt này.
   Thứ tự MÁY (dòng) — 2026-11-21, user chọn kéo-thả từng máy: mục "Thứ tự máy" (kéo ≡ / ▲▼ / ⤒⤓ / tìm máy / ↺ Theo Danh sách).
   Mặc định = thứ tự Danh sách đang xem. Đã tự xếp thì nhớ danh sách ID ở localStorage (tdmv_exp_ord) + lưu kèm mẫu báo cáo
   ({ fields, order }; mẫu cũ dạng mảng trường vẫn đọc được). Máy chưa có trong thứ tự đã lưu → cuối, theo thứ tự Danh sách.
   Chỉ ảnh hưởng file xuất, không đổi dữ liệu / bảng Danh sách.
   Bỏ máy khỏi file xuất (2026-11-21): ô tick từng máy (bỏ tick = mờ, không xuất, tick lại được), Chọn hết / Bỏ hết (đang tìm: chỉ máy khớp).
   Máy bị bỏ: localStorage tdmv_exp_off (mảng ID) + mẫu báo cáo ({ fields, order, off }). Máy mới mặc định được tick. ↺ = thứ tự gốc + tick lại hết.
   ĐI THEO TÀI KHOẢN (2026-11-21, user chọn "A — riêng từng người", migration 24 user_export_prefs): localStorage nay là bản đệm RIÊNG
   từng email (khoá 'tdmv_exp_*|email'); mở 📤 thì đọc bản trên máy chủ (mới hơn thì ghi đè bản đệm), mỗi lần đổi tự đẩy lên sau ~0,8 s.
   Bản đệm mới hơn máy chủ (sửa lúc mất mạng) → đẩy bản đệm lên. Chưa chạy 24 / lỗi mạng / không đăng nhập → chỉ localStorage như cũ.
   Lần đầu: khoá chung cũ (không có email) chuyển sang khoá của người đang đăng nhập rồi xoá, để người khác cùng trình duyệt không nhận nhầm.
   ===================================================================== */
(function(){
const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
const BASE = { cur:'tdmv_exp_cur', tpl:'tdmv_exp_tpl', ord:'tdmv_exp_ord', off:'tdmv_exp_off', ts:'tdmv_exp_ts' };
let LS_CUR = BASE.cur, LS_TPL = BASE.tpl, LS_ORD = BASE.ord, LS_OFF = BASE.off, LS_TS = BASE.ts, EM = '';
const lsGet = (k, d) => { try{ const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; }catch(e){ return d; } };
const rawSet = (k, v) => { try{ if(v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
const lsSet = (k, v) => { rawSet(k, v); if([LS_CUR, LS_TPL, LS_ORD, LS_OFF].includes(k)){ rawSet(LS_TS, Date.now()); schedulePush(); } };
/* ---------- đồng bộ theo tài khoản (migration 24) ---------- */
const TBL = 'user_export_prefs';
let SRV = false, pushT = null;                 // SRV = đã đọc được bảng trên máy chủ (có bảng + đăng nhập)
const pack = () => ({ cur: lsGet(LS_CUR, null), ord: lsGet(LS_ORD, null), off: lsGet(LS_OFF, null), tpl: lsGet(LS_TPL, null) });
function schedulePush(){ if(!SRV) return; clearTimeout(pushT); pushT = setTimeout(push, 800); }
async function push(){
  pushT = null; if(!SRV || !EM || !window.__sb) return;
  try{ const { error } = await window.__sb.from(TBL).upsert({ email: EM, prefs: pack(), updated_at: new Date().toISOString() }, { onConflict:'email' });
       if(error) console.warn('[Xuất dữ liệu] chưa lưu được lên tài khoản', error); }
  catch(e){ console.warn('[Xuất dữ liệu] chưa lưu được lên tài khoản', e); }
}
const flush = () => { if(pushT){ clearTimeout(pushT); return push(); } };
const within = (pr, ms) => Promise.race([pr, new Promise((_, no)=>setTimeout(()=>no(new Error('timeout')), ms))]);
async function pull(){
  EM = String(window.__userEmail || '').trim().toLowerCase();
  const sfx = EM ? '|' + EM : '';
  LS_CUR = BASE.cur + sfx; LS_TPL = BASE.tpl + sfx; LS_ORD = BASE.ord + sfx; LS_OFF = BASE.off + sfx; LS_TS = BASE.ts + sfx;
  SRV = false;
  if(!EM) return;
  // bản cũ lưu chung trình duyệt → chuyển 1 lần sang khoá của người này rồi xoá
  const legacy = ['cur','tpl','ord','off'].filter(k=>localStorage.getItem(BASE[k]) != null);
  if(legacy.length){                                   // khoá cũ chỉ còn từ bản app trước → nhận làm bản mới nhất
    legacy.forEach(k=>{ try{ localStorage.setItem(BASE[k] + sfx, localStorage.getItem(BASE[k])); }catch(e){} });
    rawSet(LS_TS, Date.now());
  }
  legacy.forEach(k=>{ try{ localStorage.removeItem(BASE[k]); }catch(e){} });
  if(!window.__sb) return;
  try{
    const { data, error } = await within(window.__sb.from(TBL).select('prefs, updated_at').eq('email', EM).maybeSingle(), 5000);
    if(error) return;                              // chưa chạy migration 24 / RLS / mạng: dùng bản đệm như cũ
    SRV = true;
    const srvTs = data && data.updated_at ? Date.parse(data.updated_at) : 0, locTs = Number(lsGet(LS_TS, 0)) || 0;
    const hasLocal = ['cur','tpl','ord','off'].some(k=>localStorage.getItem(BASE[k] + sfx) != null);
    if(data && data.prefs && srvTs >= locTs){          // máy chủ mới hơn (vd vừa sửa ở máy khác) → ghi đè bản đệm
      const P = data.prefs; rawSet(LS_CUR, P.cur ?? null); rawSet(LS_ORD, P.ord ?? null); rawSet(LS_OFF, P.off ?? null); rawSet(LS_TPL, P.tpl ?? null);
      rawSet(LS_TS, srvTs);
    } else if(hasLocal) await push();                  // lần đầu (chưa có dòng) hoặc bản đệm mới hơn → đẩy lên
  }catch(e){ SRV = false; }
}
const esc = v => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const plain = v => (v == null ? '' : String(typeof unescH === 'function' ? unescH(v) : v)).trim();   // DATA giữ chữ đã escape HTML
const isoOk = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const num = v => { if(v === null || v === undefined || v === '') return null; const n = Number(v); return isFinite(n) ? n : null; };

/* các trường: [field, kiểu s=chữ · n=số · d=ngày, mặc định chọn]. Nhãn lấy đúng nhãn app đang hiển thị (REC_LABEL / REC_LABEL_EN). */
const DEF = [
  ['ma_may','s',1], ['ten','s',1], ['sl','n',1], ['noilapdat','s',1], ['ncc','s',1], ['xuatxu','s',1], ['hinh_thuc_mua','s',0], ['phutrach','s',1],
  ['vnd','n',1], ['usd','n',1], ['dathang','d',1], ['vekh','d',1], ['vedukienn','d',1], ['status','s',1], ['arrival_kind','s',0], ['danhgia','s',1],
  ['company','s',0], ['daysleft','n',0], ['congsuat','s',0], ['model','s',0], ['serial','s',0], ['duyet','d',0],
  ['ctu','n',0], ['tamungtt','d',0], ['ngay_xn_ct','d',0], ['tamung_days','n',0], ['ditaukh','n',0], ['ditautt','n',0], ['lanhkh','n',0], ['lanhtt','n',0],
  ['sonagyctm','n',0], ['workingday','s',0], ['xuatxuong','d',0], ['tauchay_tt','d',0], ['capcang_tt','d',0],
  ['venm_tt','d',0], ['giaitrinh','s',0],
  // lắp đặt – nghiệm thu (migrations/20261031_09); số ngày tính lúc xuất, thiếu ngày -> ô trống
  ['install_status','s',0], ['nghiemthu_kh','d',0], ['lapdat_tt','d',0], ['chaythu_tt','d',0], ['nghiemthu_tt','d',0], ['ghichu_ld','s',0],
  ['wait_install_days','n',0], ['install_accept_days','n',0], ['accept_delay_days','n',0],
  ['sysid','s',0]     // ID hệ thống (uuid): khoá khớp dòng khi nạp Excel
];
/* nhãn / bảng dịch giá trị do index.html (mainSrc) đưa ra qua window.__expCtx() */
const CTX = () => (window.__expCtx && window.__expCtx()) || { labels:{}, LBL:{}, dgT:v=>v, ctT:v=>v };
const TYPE = Object.fromEntries(DEF.map(([k,t])=>[k,t]));
/* phân quyền trường (perms.js): trường / cột tính thuộc nhóm không được xem thì không có trong danh sách, không xuất.
   Cột tính → nhóm nguồn; trường thật → nhóm của nó trong PERM.REG (vd vnd/usd → value). */
const SEEK = { status:'status', install_status:'status', arrival_kind:'dates', daysleft:'dates', tamung_days:'dates', wait_install_days:'dates',
               install_accept_days:'dates', accept_delay_days:'dates', company:'location', sysid:'code' };
/* ngay_xn_ct (migration 29): chưa có cột trong DB → không có trường */
const okF = k => (k !== 'ngay_xn_ct' || !window.__hasXN || window.__hasXN()) && (!window.PERM || PERM.see('delivery', SEEK[k] || k));
function label(k){
  const L = CTX().labels;
  const extra = { status: tr('Status','Trạng thái'), company: tr('Company','Công ty'), daysleft: tr('Days to arrival','Số ngày còn lại'),
                  tamung_days: tr('Advance-payment days','Số ngày tạm ứng'), arrival_kind: tr('Arrival date type','Trạng thái ngày về'),
                  install_status: tr('Installation status','Trạng thái lắp đặt'),
                  wait_install_days: tr('Days waiting for installation','Số ngày chờ lắp đặt'),
                  install_accept_days: tr('Days from installation to commissioning','Số ngày lắp đặt đến nghiệm thu'),
                  accept_delay_days: tr('Commissioning delay (days)','Trễ nghiệm thu (ngày)') };
  return extra[k] || (L && L[k]) || k;
}
/* giá trị 1 ô: null = để trống; ngày giữ dạng ISO 'YYYY-MM-DD' để định dạng sau */
function cell(x, k){
  const t = TYPE[k];
  if(k === 'status') return (x.status && x.status !== 'unknown' && CTX().LBL[x.status]) || null;   // trạng thái mới: DM.arrivalStatus (index.html)
  if(k === 'arrival_kind') return x.venm_tt ? tr('Actual','Thực tế') : x.vedukienn ? tr('Expected','Dự kiến') : null;
  if(k === 'tamung_days') return calcAdvanceDays(x);
  // Số ngày chờ lắp đặt = Bắt đầu lắp đặt TT − Về NM TT · lắp đặt đến nghiệm thu = Nghiệm thu TT − Bắt đầu lắp đặt TT
  // Trễ nghiệm thu = Nghiệm thu TT − Nghiệm thu KH (âm = sớm)
  if(k === 'wait_install_days') return dayDiff(x.venm_tt, x.lapdat_tt);
  if(k === 'install_accept_days') return dayDiff(x.lapdat_tt, x.nghiemthu_tt);
  if(k === 'accept_delay_days') return dayDiff(x.nghiemthu_kh, x.nghiemthu_tt);
  if(k === 'install_status'){
    const s = window.DM && DM.installStatus(x), I = CTX().ILBL || {};
    if(!s || !s.stage) return null;
    const main = s.stage === 'arrived' ? tr('Arrived – not installed yet','Đã về – chưa lắp đặt') : I[s.stage] || s.stage;
    return [main, s.waitInstall ? I.wait_install : '', s.lateAccept ? I.late_accept : ''].filter(Boolean).join(' · ');
  }
  if(k === 'sysid') return x._id || null;
  if(k === 'company') return (window.DM && DM.companyCode(plain(x.noilapdat))) || null;
  if(k === 'danhgia'){ const v = plain(x.danhgia); return v ? CTX().dgT(v) : '?'; }   // thiếu ngày -> "?" như file Excel gốc
  if(k === 'xuatxu'){ const v = plain(x.xuatxu); return v ? CTX().ctT(v) : null; }
  if(k === 'hinh_thuc_mua') return (CTX().PT || {})[x.hinh_thuc_mua] || null;
  if(t === 'd') return isoOk(x[k]) ? x[k].slice(0,10) : null;
  if(t === 'n') return num(x[k]);
  const v = plain(x[k]); return v === '' ? null : v;
}
const dmy = iso => iso.slice(8,10) + '/' + iso.slice(5,7) + '/' + iso.slice(0,4);

/* Số ngày tạm ứng = Ngày tạm ứng TT (tamungtt) − Ngày đặt hàng (dathang), ngày lịch, số nguyên.
   Chỉ tính lúc xuất, không sửa DATA. Ngày là chuỗi 'YYYY-MM-DD' -> đưa về 00:00 UTC rồi trừ (không lệch do múi giờ).
   Thiếu 1 trong 2 ngày -> null (ô trống). Âm -> vẫn trả số âm + cảnh báo console 1 lần cho mỗi máy / cặp ngày. */
const utcDay = iso => isoOk(iso) ? Date.UTC(+iso.slice(0,4), +iso.slice(5,7) - 1, +iso.slice(8,10)) : null;
const dayDiff = (a, b) => { const p = utcDay(a), q = utcDay(b); return p == null || q == null ? null : Math.round((q - p) / 86400000); };
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
const defaults = () => DEF.filter(([k])=>okF(k)).map(([k,,on])=>({ k, on: !!on }));
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
  return out.filter(f=>okF(f.k));
}
let S = null, Q = '', VIEW = null, dragK = null;
let R = [], RQ = '', dragR = null, custom = false;      // R = các dòng theo thứ tự; custom = người dùng đã tự xếp
let OFF = new Set();                                    // ID máy bị bỏ khỏi file xuất
const out = () => R.filter(x=>!OFF.has(x._id));         // dòng thật sự xuất: theo thứ tự R, bỏ máy không tick
const saveOff = () => lsSet(LS_OFF, OFF.size ? [...OFF] : null);
const save = () => lsSet(LS_CUR, S);
/* thứ tự đã lưu (mảng ID) áp lên các dòng đang lọc: dòng có trong thứ tự trước, còn lại giữ thứ tự Danh sách ở cuối */
function applyOrder(rows, ord){
  if(!Array.isArray(ord) || !ord.length) return rows.slice();
  const by = new Map(rows.map(x=>[x._id, x])), out = [], used = new Set();
  ord.forEach(id=>{ const x = by.get(id); if(x && !used.has(id)){ out.push(x); used.add(id); } });
  rows.forEach(x=>{ if(!used.has(x._id)) out.push(x); });
  return out;
}
/* lưu: giữ cả ID của máy đang bị lọc ra (vị trí cũ) để đổi bộ lọc rồi quay lại không mất thứ tự */
function saveOrd(){
  if(!custom){ lsSet(LS_ORD, null); return; }
  const now = R.map(x=>x._id), set = new Set(now), old = (lsGet(LS_ORD, []) || []).filter(id=>!set.has(id));
  lsSet(LS_ORD, now.concat(old));
}
const setOrder = ord => { R = applyOrder(VIEW.rows, ord); custom = Array.isArray(ord) && ord.length > 0; };
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
    <div class="exp-tools exp-rtools"><h5 class="exp-h" id="expRowT"></h5><input id="expRQ" type="search"><span id="expRInfo"></span>
      <button type="button" class="nbtn2 ghost" data-ra="all"></button><button type="button" class="nbtn2 ghost" data-ra="none"></button>
      <button type="button" class="nbtn2 ghost" id="expRReset"></button></div>
    <ul class="exp-list exp-rows" id="expRows"></ul>
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
    if(n && T[n]){ const t = T[n]; S = normalize(Array.isArray(t) ? t : t.fields); setOrder(Array.isArray(t) ? null : t.order);
      OFF = new Set(Array.isArray(t) ? [] : (t.off || []));
      $('expTplName').value = n; save(); saveOrd(); saveOff(); draw(); drawRows(); } };
  $('expTplSave').onclick = ()=>{
    const n = $('expTplName').value.trim();
    if(!n){ $('expTplName').focus(); toast(tr('Type a name for the template first.','Nhập tên mẫu trước.')); return; }
    const T = lsGet(LS_TPL, {}), had = !!T[n]; T[n] = { fields: S.map(f=>({ k:f.k, on:f.on })), order: custom ? R.map(x=>x._id) : null, off: OFF.size ? [...OFF] : null }; lsSet(LS_TPL, T);
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
  /* ---- Thứ tự máy ---- */
  const rl = $('expRows');
  $('expRQ').oninput = e=>{ RQ = e.target.value.trim().toLowerCase(); drawRows(true); };
  $('expRReset').onclick = ()=>{ custom = false; R = VIEW.rows.slice(); OFF.clear(); saveOrd(); saveOff(); drawRows(); draw(); };
  rl.addEventListener('change', e=>{ const c = e.target.closest('input.exp-rck'); if(!c) return;
    if(c.checked) OFF.delete(c.dataset.id); else OFF.add(c.dataset.id); saveOff(); drawRows(); draw(); });
  document.querySelectorAll('#expBg [data-ra]').forEach(b=>b.onclick = ()=>{        // đang tìm: chỉ áp cho máy khớp
    R.filter(x=>!RQ || rHit(x)).forEach(x=>{ if(b.dataset.ra === 'all') OFF.delete(x._id); else OFF.add(x._id); });
    saveOff(); drawRows(); draw(); });
  rl.addEventListener('click', e=>{ const b = e.target.closest('button[data-rm]'); if(!b) return; rmove(b.closest('li').dataset.id, b.dataset.rm); });
  rl.addEventListener('dragstart', e=>{ const li = e.target.closest('li[data-id]'); if(!li) return; dragR = li.dataset.id; li.classList.add('drag');
    e.dataTransfer.effectAllowed = 'move'; try{ e.dataTransfer.setData('text/plain', dragR); }catch(_){} });
  rl.addEventListener('dragend', ()=>{ dragR = null; rl.querySelectorAll('.drag,.over-t,.over-b').forEach(n=>n.classList.remove('drag','over-t','over-b')); });
  rl.addEventListener('dragover', e=>{ const li = e.target.closest('li[data-id]'); if(!li || !dragR) return; e.preventDefault();
    const r = li.getBoundingClientRect(), top = e.clientY < r.top + r.height/2;
    rl.querySelectorAll('.over-t,.over-b').forEach(n=>n.classList.remove('over-t','over-b')); li.classList.add(top ? 'over-t' : 'over-b'); });
  rl.addEventListener('drop', e=>{ const li = e.target.closest('li[data-id]'); if(!li || !dragR) return; e.preventDefault();
    const r = li.getBoundingClientRect(); rplace(dragR, li.dataset.id, e.clientY >= r.top + r.height/2); });
  $('expCopy').onclick = async ()=>{
    const keys = chosen(); if(!keys.length) return;
    const rows = out(); if(!rows.length) return;
    const ok = await copyText(toTSV(rows, keys));
    toast(ok ? tr(`✅ Copied ${rows.length} rows — paste into Excel with Ctrl+V`,`✅ Đã sao chép ${rows.length} dòng — dán vào Excel bằng Ctrl+V`)
             : tr('Could not copy. Use ⬇️ Download .xlsx instead.','Chưa sao chép được. Hãy dùng ⬇️ Tải file .xlsx.'));
  };
  $('expXlsx').onclick = async ()=>{
    const keys = chosen(); if(!keys.length) return;
    const b = $('expXlsx'), t0 = b.textContent; b.disabled = true; b.textContent = tr('⏳ Preparing…','⏳ Đang tạo file…');
    const rows = out(); if(!rows.length) return;
    try{ const n = await toXlsx(rows, keys); toast(tr(`✅ Downloaded ${rows.length} rows: `,`✅ Đã tải ${rows.length} dòng: `) + esc(n)); }
    catch(e){ toast('⚠️ ' + esc(e.message || e)); }
    finally{ b.disabled = !chosen().length || !out().length; b.textContent = t0; }
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
const rIdx = id => R.findIndex(x=>x._id === id);
function rcommit(id){ custom = true; saveOrd(); drawRows(); draw();
  const li = $('expRows').querySelector(`li[data-id="${id}"]`); if(li){ li.classList.add('moved'); li.scrollIntoView({ block:'nearest' }); } }
function rmove(id, how){
  const i = rIdx(id); if(i < 0) return;
  const j = how === 'top' ? 0 : how === 'bottom' ? R.length - 1 : i + (+how);
  if(j < 0 || j >= R.length || j === i) return;
  const [x] = R.splice(i, 1); R.splice(j, 0, x); rcommit(id);
  const b = $('expRows').querySelector(`li[data-id="${id}"] button[data-rm="${how}"]`); if(b && !b.disabled) b.focus();
}
function rplace(id, target, after){
  if(id === target) return;
  const [x] = R.splice(rIdx(id), 1);
  let j = rIdx(target); if(after) j++;
  R.splice(j, 0, x); rcommit(id);
}
const rName = x => plain(x.ten) || '—';
const rSite = x => (window.DM && DM.companyCode(plain(x.noilapdat))) || plain(x.noilapdat);
/* tìm máy: không lọc bớt (để kéo / ▲▼ luôn đúng vị trí thật) — tô các dòng khớp, cuộn tới dòng khớp đầu tiên */
const rHit = x => !!RQ && (rName(x).toLowerCase().includes(RQ) || String(rSite(x)).toLowerCase().includes(RQ) || String(x.ma_may || '').toLowerCase().includes(RQ));
function drawRows(jump){
  const n = R.length, hit = rHit;
  const T = (a, b) => tr(a, b);
  $('expRows').innerHTML = n ? R.map((x, i)=>`<li draggable="true" data-id="${esc(x._id)}" class="${hit(x) ? 'hit' : ''}${OFF.has(x._id) ? ' off' : ''}">
      <span class="exp-grip" aria-hidden="true">≡</span><input type="checkbox" class="exp-rck" data-id="${esc(x._id)}"${OFF.has(x._id) ? '' : ' checked'} aria-label="${esc(T('Export ', 'Xuất ') + rName(x))}"><span class="exp-no">${i + 1}</span>
      <span class="exp-rn" title="${esc(rName(x))}">${esc(rName(x))}</span><span class="exp-type">${esc(rSite(x))}</span>
      <button type="button" data-rm="-1" title="${T('Move up','Lên')}"${i === 0 ? ' disabled' : ''}>▲</button>
      <button type="button" data-rm="1" title="${T('Move down','Xuống')}"${i === n - 1 ? ' disabled' : ''}>▼</button>
      <button type="button" data-rm="top" title="${T('Move to top','Lên đầu')}"${i === 0 ? ' disabled' : ''}>⤒</button>
      <button type="button" data-rm="bottom" title="${T('Move to bottom','Xuống cuối')}"${i === n - 1 ? ' disabled' : ''}>⤓</button></li>`).join('')
    : `<li class="exp-none">${T('No rows match the current filters.','Không có dòng nào theo bộ lọc hiện tại.')}</li>`;
  const nh = RQ ? R.filter(hit).length : 0;
  $('expRInfo').textContent = RQ ? T(`${nh} match(es)`, `${nh} máy khớp`) : custom ? T('custom order','đã tự xếp') : T('same order as the list','theo thứ tự Danh sách');
  $('expRInfo').className = custom && !RQ ? 'exp-rcust' : '';
  $('expRReset').disabled = !custom && !OFF.size;
  const nOut = out().length;
  $('expRowT').textContent = nOut === n ? T(`Machine order (${n})`, `Thứ tự máy (${n})`) : T(`Machine order (${nOut}/${n} to export)`, `Thứ tự máy (${nOut}/${n} máy sẽ xuất)`);
  const A = { all: RQ ? T('☑ Tick matches','☑ Chọn máy khớp') : T('☑ Tick all','☑ Chọn hết'), none: RQ ? T('☐ Untick matches','☐ Bỏ máy khớp') : T('☐ Untick all','☐ Bỏ hết') };
  document.querySelectorAll('#expBg [data-ra]').forEach(b=>{ b.textContent = A[b.dataset.ra]; });
  if(jump && RQ){ const f = $('expRows').querySelector('li.hit'); if(f) f.scrollIntoView({ block:'nearest' }); }
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
  const keys = chosen(), none = !keys.length, noRow = R.length > 0 && !out().length;
  $('expCnt').textContent = tr(`${keys.length}/${S.length} fields`,`${keys.length}/${S.length} trường`);
  $('expCopy').disabled = $('expXlsx').disabled = none || !out().length;
  $('expHint').textContent = none ? tr('Select at least one field to export.','Chọn ít nhất 1 trường để xuất.')
    : noRow ? tr('Tick at least one machine to export.','Tick ít nhất 1 máy để xuất.') : '';
  const rows = out().slice(0, 5);
  const show = (k, v) => v == null ? '' : TYPE[k] === 'd' ? dmy(v) : TYPE[k] === 'n' ? Number(v).toLocaleString(tr('en-US','vi-VN')) : v;
  $('expPrev').innerHTML = none ? `<div class="exp-empty">${tr('Nothing to preview.','Chưa có gì để xem trước.')}</div>`
    : !rows.length ? `<div class="exp-empty">${noRow ? tr('Every machine is unticked.','Đã bỏ tick mọi máy.') : tr('No rows match the current filters.','Không có dòng nào theo bộ lọc hiện tại.')}</div>`
    : `<table><thead><tr>${keys.map(k=>`<th>${esc(label(k))}</th>`).join('')}</tr></thead><tbody>${rows.map(x=>
        `<tr>${keys.map(k=>{ const v = cell(x,k); return `<td class="${TYPE[k] === 'n' ? 'n' : ''}">${esc(show(k,v))}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
}
function close(){ const bg = $('expBg'); if(bg) bg.classList.remove('show'); flush(); }
window.expOpen = async () => {
  if(typeof window.__listView !== 'function') return;
  await pull();                                       // lấy cấu hình xuất của tài khoản (nếu có bảng), rồi mới dựng popup
  VIEW = window.__listView();
  S = normalize(lsGet(LS_CUR, null) || defaults());
  setOrder(lsGet(LS_ORD, null)); RQ = ''; OFF = new Set(lsGet(LS_OFF, []) || []);
  const bg = shell(); Q = '';
  $('expTitle').textContent = tr('📤 Export data','📤 Xuất dữ liệu');
  $('expInfo').innerHTML = tr(`Will export <b>${VIEW.rows.length}</b> rows with the current filters (${esc(VIEW.desc)}), in the order and with the ticks set under <b>Machine order</b> below (default: as in the list, all ticked).`,
                              `Sẽ xuất <b>${VIEW.rows.length}</b> dòng theo bộ lọc hiện tại (${esc(VIEW.desc)}), theo thứ tự và ô tick ở mục <b>Thứ tự máy</b> bên dưới (mặc định: như danh sách đang xem, tick hết).`);
  $('expRQ').value = ''; $('expRQ').placeholder = tr('🔍 Find a machine…','🔍 Tìm máy…');
  $('expRReset').textContent = tr('↺ Same as list','↺ Theo Danh sách');
  $('expTplName').placeholder = tr('Template name, e.g. Weekly report','Tên mẫu, vd: Báo cáo tuần');
  $('expTplSave').textContent = tr('💾 Save template','💾 Lưu mẫu'); $('expTplDel').textContent = tr('🗑 Delete','🗑 Xoá mẫu');
  $('expQ').value = ''; $('expQ').placeholder = tr('🔍 Find a field…','🔍 Tìm trường…');
  const A = { all: tr('Select all','Chọn tất cả'), none: tr('Clear all','Bỏ chọn tất cả'), def: tr('Restore default','Khôi phục mặc định') };
  bg.querySelectorAll('[data-a]').forEach(b=>{ b.textContent = A[b.dataset.a]; });
  $('expPrevT').textContent = tr('Preview — first 5 rows','Xem trước — 5 dòng đầu');
  $('expCopy').textContent = tr('📋 Copy for Excel','📋 Sao chép để dán Excel'); $('expXlsx').textContent = tr('⬇️ Download .xlsx','⬇️ Tải file .xlsx');
  $('expX').setAttribute('aria-label', tr('Close','Đóng'));
  drawTpl(''); $('expTplName').value = ''; draw(); drawRows();
  bg.classList.add('show');
};
/* cho test: các hàm chuyển đổi không phụ thuộc giao diện */
window.__exp = { cell, toTSV, label, defaults, normalize, calcAdvanceDays, dayDiff, applyOrder, rows: () => R, out, flush, srv: () => SRV, keys: () => ({ LS_CUR, LS_ORD, LS_OFF, LS_TPL }) };
})();
