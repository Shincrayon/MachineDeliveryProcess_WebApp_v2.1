/* =====================================================================
   ✏️ TÊN TÀI SẢN CHUẨN — Danh mục MMTB (migrations/20261102_11_standard_name.sql)
   Mẫu: <Loại thiết bị> <Vật liệu> <Đặc điểm> <Công suất + đơn vị chuẩn>, VD "Máy băm PET 3 t/h", "Băng tải nghiêng 600 mm".
   Tên máy mã hoá trong trình duyệt (sec) nên mọi kiểm tra / đề xuất chạy ở đây, trên dữ liệu đã giải mã (window.__MMTB).
   Chỉ CẢNH BÁO, không chặn lưu. Đổi sang tên chuẩn: tên cũ chuyển vào "Tên gọi khác" (alias_names) để vẫn tìm được.
   Tên mua hàng bên Tiến độ máy về không liên quan, không đổi.
   ===================================================================== */
(function(){
const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9³]+/g, ' ').trim();
const collapse = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const capFirst = s => s ? s.charAt(0).toLocaleUpperCase('vi') + s.slice(1) : s;
const L = (en, vi) => typeof tr === 'function' ? tr(en, vi) : vi;

/* ---------- đơn vị chuẩn (viết tắt quốc tế) ---------- */
const UNIT = {};
[['kg/h', 'kg/h kg/hr kg/gio kg/g kgh kg/hour'], ['t/h', 't/h tan/h tan/gio t/gio ton/h tph tan/hr'],
 ['m³/h', 'm3/h m³/h m3/gio m³/gio khoi/gio khoi/h'], ['l/h', 'l/h lit/h lit/gio lph'],
 ['kW', 'kw'], ['mm', 'mm'], ['m', 'm met'], ['kg', 'kg'], ['t', 't tan'], ['m³', 'm3 m³ khoi']]
  .forEach(([c, v]) => v.split(' ').forEach(k => { UNIT[k] = c; }));
const ukey = u => String(u || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, '');
/* đơn vị chuẩn của 1 cách viết, null = không nhận ra (giữ nguyên) */
const normUnit = u => UNIT[ukey(u)] || null;
/* số + đơn vị trong tên: "3T/H" "3 tấn/giờ" "600mm" */
const CAP_RE = /(\d+(?:[.,]\d+)?)\s*([\p{L}³]+(?:\s*\/\s*\p{L}+)?)(?![\p{L}\d])/gu;
const fixUnits = s => String(s || '').replace(CAP_RE, (m, n, u) => { const c = normUnit(u); return c ? n + ' ' + c : m; });
/* số kiểu Việt Nam: 1,5 · 3000 */
const fmtNum = v => String(+v).replace('.', ',');

/* chuẩn hoá cách viết: đơn vị chuẩn, gộp khoảng trắng, viết hoa chữ đầu (không đổi chữ khác) */
const normName = s => capFirst(collapse(fixUnits(s)));

/* ---------- ngữ cảnh ---------- */
const MATS = ['PET', 'HDPE', 'PP'];
function ctx(MM){
  MM = MM || window.__MMTB || {};
  const types = (MM.types || []).filter(t => t && t.name).slice().sort((a, b) => fold(b.name).length - fold(a.name).length);
  const dup = new Map();
  (MM.machines || []).forEach(x => { const k = x.company_id + '|' + fold(x.name); dup.set(k, (dup.get(k) || 0) + 1); });
  return { MM, types, dup, hasTypes: !!MM.hasTypes };
}
/* loại thiết bị mà tên bắt đầu bằng (dài nhất trước) */
function typeOf(name, types){
  const f = fold(name);
  return types.find(t => { const k = fold(t.name); return k && (f === k || f.startsWith(k + ' ')); }) || null;
}

/* ---------- kiểm tra 1 tên ---------- */
const ISSUE = () => ({ no_type: L('does not start with an equipment type from the list','chưa bắt đầu bằng Loại thiết bị trong danh sách'),
  unit: L('non-standard unit (use kg/h, t/h, m³/h, kW, mm)','đơn vị viết chưa chuẩn (dùng kg/h, t/h, m³/h, kW, mm)'),
  supplier: L('contains the supplier name (it has its own column)','có tên NCC trong tên (đã có cột NCC)'),
  model: L('contains the model (it has its own column)','có model trong tên (đã có cột Model)'),
  dup: L('same name as another machine in this plant','trùng tên với máy khác cùng nhà máy'),
  format: L('extra spaces / first letter not capitalised','khoảng trắng thừa / chưa viết hoa chữ đầu') });
function issues(x, C){
  const n = String(x.name || ''), f = fold(n), out = [];
  if(!n || n === '🔒') return out;
  if(!typeOf(n, C.types)) out.push('no_type');
  if(fixUnits(n) !== n) out.push('unit');
  if(x.supplier_name && x.supplier_name !== '🔒' && fold(x.supplier_name).length >= 3 && (' ' + f + ' ').includes(' ' + fold(x.supplier_name) + ' ')) out.push('supplier');
  if(x.model && fold(x.model).length >= 3 && (' ' + f + ' ').includes(' ' + fold(x.model) + ' ')) out.push('model');
  if((C.dup.get(x.company_id + '|' + f) || 0) > 1) out.push('dup');
  if(capFirst(collapse(n)) !== n) out.push('format');
  return out;
}

/* ---------- đề xuất tên chuẩn ----------
   Loại: equipment_type nếu có trong danh sách, không thì loại mà tên đang bắt đầu bằng. Không xác định được loại -> null.
   Phần còn lại của tên (bỏ loại, vật liệu, công suất, model, tên NCC) giữ làm "đặc điểm". */
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function suggest(x, C){
  // hậu tố phân biệt trùng tên (" – Chuyền 1", " #2") luôn ở cuối: tách ra, xử lý phần trước, gắn lại
  const m = /^(.*?)((?:\s+[–-]\s+[^–-]+|\s+#\d+)+)$/.exec(collapse(x.name));
  const name = m ? m[1] : collapse(x.name), tail = m ? m[2] : '';
  const t = C.types.find(o => o.name === x.equipment_type) || typeOf(name, C.types);
  if(!t) return null;
  let r = name;
  const tw = collapse(t.name).split(' ').length, words = r.split(' ');
  if(typeOf(r, [t])) r = words.slice(tw).join(' ');
  let capInName = null;
  r = r.replace(CAP_RE, (m, n, u) => { const c = normUnit(u); if(!c) return m; if(!capInName) capInName = n + ' ' + c; return ' '; });
  [x.model, x.supplier_name].forEach(s => { if(s && s !== '🔒' && fold(s).length >= 3) r = r.replace(new RegExp('(^|[\\s(\\-])' + esc(collapse(s)) + '(?=$|[\\s)\\-,])', 'giu'), ' '); });
  const inName = [];
  r = r.replace(/(^|[\s/,(-])(PET|HDPE|PP)(?=$|[\s/,)-])/gi, (m, p, v) => { inName.push(v.toUpperCase()); return ' '; });
  r = collapse(r.replace(/[()]/g, ' ').replace(/^[\s\-–,/]+|[\s\-–,/]+$/g, ''));
  const mats = MATS.filter(m => (x.materials || []).includes(m) || inName.includes(m));
  const cap = x.capacity_value != null && x.capacity_value !== '' && +x.capacity_value > 0
    ? (fmtNum(x.capacity_value) + ' ' + (normUnit(x.capacity_unit) || collapse(x.capacity_unit || ''))).trim()
    : capInName;
  return normName([t.name, mats.join('/'), r, cap].filter(Boolean).join(' ') + tail);
}

/* trùng tên trong cùng nhà máy (theo danh sách tên cuối cùng): thêm " – <Chuyền>" / " – <Khu vực>", không có thì " #2", " #3"… */
function dedupe(items){            // items: [{ x, name }] — sửa name tại chỗ
  const by = new Map();
  items.forEach(o => { const k = o.x.company_id + '|' + fold(o.name); if(!by.has(k)) by.set(k, []); by.get(k).push(o); });
  by.forEach(g => {
    if(g.length < 2) return;
    g.forEach(o => { const s = o.x.line_name || o.x.area_name; if(s) o.name = o.name + ' – ' + s; });
    const again = new Map(); g.forEach(o => { const k = fold(o.name); again.set(k, (again.get(k) || 0) + 1); });
    const n = new Map(); g.forEach(o => { const k = fold(o.name); if(again.get(k) > 1){ const i = (n.get(k) || 0) + 1; n.set(k, i); if(i > 1) o.name += ' #' + i; } });
  });
  return items;
}

/* loại thường gặp trong tên của máy chưa xác định được loại: 2 chữ đầu ("Máy băm", "Băng tải"), ≥ 2 máy */
function commonTypes(machines, C){
  const cnt = new Map();
  machines.forEach(x => {
    if(!x.name || x.name === '🔒' || typeOf(x.name, C.types)) return;
    const w = collapse(x.name).split(' ').filter(s => /\p{L}/u.test(s)).slice(0, 2);
    if(w.length < 2) return;
    const p = capFirst(w.join(' ').toLocaleLowerCase('vi')), k = fold(p);
    const o = cnt.get(k) || { name: p, n: 0 }; o.n++; cnt.set(k, o);
  });
  return [...cnt.values()].filter(o => o.n >= 2).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/* tên cũ thêm vào "Tên gọi khác" (không lặp) */
const addAlias = (alias, old) => { const a = collapse(alias).split(/\s*;\s*/).filter(Boolean);
  if(old && !a.some(s => fold(s) === fold(old))) a.push(collapse(old)); return a.join('; ') || null; };

/* đổi tên 1 máy Danh mục: mã hoá lại cả gói sec (chỉ name + alias_names đổi), kiểm tra version */
async function rename(x, newName){
  const sb = window.__sb; if(!sb) throw { code: 'nodb' };
  if(x.__locked) throw { code: 'locked' };
  const ch = { name: newName, alias_names: addAlias(x.alias_names, x.name) };
  const F = (typeof SEC !== 'undefined' && SEC.mmtb_machines) ? SEC.mmtb_machines.f : ['name'];
  const s = {}; F.forEach(k => { if(k in ch || k in x) s[k] = k in ch ? ch[k] : (x[k] === undefined ? null : x[k]); });
  const upd = await window.__seal('mmtb_machines', s);
  const { data, error } = await sb.from('mmtb_machines').update(upd).eq('id', x.id).eq('version', x.version).is('deleted_at', null).select('id');
  if(error) throw error;
  if(!data || !data.length) throw { code: 'conflict' };
}

window.NS = { fold, normUnit, fixUnits, normName, ctx, typeOf, issues, suggest, dedupe, commonTypes, addAlias, rename, ISSUE, MATS };
})();
