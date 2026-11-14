/* =====================================================================
   🔗 LIÊN KẾT Tiến độ máy về (machines) → Danh mục MMTB (mmtb_machines) — migrations/20261101_10
   Cả 2 bảng mã hoá trường nhạy cảm trong trình duyệt (cột sec) nên đồng bộ chạy ở đây, sau khi giải mã — không bằng trigger DB.
   Một chiều Tiến độ → Danh mục. Liên kết: mmtb_machines.tracking_machine_id = machines.id (UNIQUE).

   Quy tắc (CS.plan):
   · Chỉ máy có Mã máy (ma_may). Chưa liên kết + đã nghiệm thu TT đủ WAIT_DAYS (10) ngày -> tạo hồ sơ mới (mã tạm theo quy tắc Danh mục,
     needs_info = "Cần bổ sung"); chưa liên kết + chưa nghiệm thu -> chưa chuyển.
   · Trạng thái theo DM.installStatus: về NM -> arrived · lắp đặt / đang thử nghiệm -> installing · nghiệm thu -> in_operation
     (commissioned_date = nghiemthu_tt). Không bao giờ hạ trạng thái bên Danh mục.
   · Mốc delivery_milestones: arrived_site = venm_tt · installed (vận hành thử) = chaythu_tt (chỉ khi ≤ hôm nay) · commissioned = nghiemthu_tt.
   · Trường chung (model, serial, xuất xứ, thương hiệu, công suất, hợp đồng, NCC, công ty): Danh mục trống -> điền; khác -> "lệch", không ghi.
     Tên máy chỉ dùng khi tạo mới. KHÔNG BAO GIỜ ghi: khu vực, chuyền, máy cha, vai trò, vật liệu, mã tài sản, mã máy đã có,
     ghi chú, kỹ sư, người quản lý. NCC: khớp tên đã bỏ dấu, không tự tạo NCC mới.
   · Lưu Tiến độ trước, đồng bộ sau (CS.afterSave); lỗi không làm hỏng lần lưu. Hàng chờ = máy đủ điều kiện mà Danh mục còn
     chậm hơn — tính lại mỗi lần (CS.planAll), không cần bảng riêng.
   · Tên máy bên Tiến độ không bao giờ bị sửa (kể cả "Giữ Danh mục" ở màn Lệch).
   · Máy đã liên kết: tên Danh mục luôn theo tên Tiến độ (ghi đè, không tính lệch); tên cũ Danh mục chuyển vào alias_names.
     Bên Danh mục khoá ô Tên máy của máy đã liên kết; ✏️ Chuẩn hoá tên bỏ qua máy đã liên kết.
   ===================================================================== */
(function(){
const WAIT_DAYS = typeof window.CS_WAIT_DAYS === 'number' ? window.CS_WAIT_DAYS : 10;      // (CS_WAIT_DAYS: chỉ bài test đặt) máy mới chỉ vào Danh mục khi đã nghiệm thu đủ 10 ngày (mọi máy, user 2026-11-13)
const LCO = ['planned','ordered','manufacturing','shipping','arrived','installing','in_operation','idle','disposed'];
const MS_MAP = [['arrived_site','venm_tt'], ['installed','chaythu_tt'], ['commissioned','nghiemthu_tt']];
const un = v => (typeof unescH === 'function' ? unescH(v == null ? '' : v) : String(v == null ? '' : v));   // DATA giữ chữ đã escape HTML
const txt = v => { const s = un(v).trim(); return s || null; };
const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const iso = d => d ? String(d).slice(0, 10) : null;
const esc = v => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtDate = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const nf = v => v == null || v === '' ? '—' : Number(v).toLocaleString(typeof NUMLOC !== 'undefined' ? NUMLOC : 'vi-VN');
const L = (en, vi) => typeof tr === 'function' ? tr(en, vi) : vi;

/* "3000 kg/h" -> {value:3000, unit:'kg/h'} · "1,5 tấn/giờ" -> 1.5 · "3.000" -> 3000; không có số đầu chuỗi -> null */
function parseCap(s){
  const m = /^\s*(\d[\d.,]*)\s*(.*?)\s*$/.exec(un(s)); if(!m) return null;
  let n = m[1];
  n = /^\d{1,3}([.,]\d{3})+$/.test(n) ? n.replace(/[.,]/g, '') : n.replace(',', '.');
  const v = Number(n); if(!isFinite(v)) return null;
  return { value: v, unit: m[2] || null };
}

/* ---------- ngữ cảnh: dữ liệu Danh mục đã giải mã (window.__MMTB) ---------- */
function ctx(){
  const MM = window.__MMTB;
  if(!MM || MM.err || !Array.isArray(MM.machines)) return null;
  const byTrack = new Map(), ms = new Map(), byId = new Map();
  MM.machines.forEach(c => { byId.set(c.id, c); if(c.tracking_machine_id) byTrack.set(c.tracking_machine_id, c); });
  (MM.milestones || []).forEach(r => { if(!ms.has(r.machine_id)) ms.set(r.machine_id, {}); ms.get(r.machine_id)[r.milestone] = r; });
  const coBy = new Map((MM.companies || []).map(c => [c.code, c])), coId = new Map((MM.companies || []).map(c => [c.id, c]));
  const supBy = new Map(), supId = new Map();
  (MM.suppliers || []).forEach(s => { supId.set(s.id, s); const k = fold(s.name); if(k && s.name !== '🔒' && !supBy.has(k)) supBy.set(k, s); });
  // đã chạy migration 10 chưa: dòng Danh mục có cột tracking_machine_id (bảng trống thì thử ghi, lỗi sẽ báo)
  const ready = !MM.machines.length || 'tracking_machine_id' in MM.machines[0];
  return { MM, byTrack, ms, byId, coBy, coId, supBy, supId, ready };
}

/* giá trị Tiến độ quy sang trường Danh mục */
function want(x, C){
  const co = DM.companyCode(un(x.noilapdat)), coRow = co ? C.coBy.get(co) : null;
  const ncc = txt(x.ncc), sup = ncc ? C.supBy.get(fold(ncc)) : null;
  const cap = parseCap(x.congsuat);
  const vnd = +x.vnd || 0, usd = +x.usd || 0;
  return { company_id: coRow ? coRow.id : null, company_code: co, supplier_id: sup ? sup.id : null, ncc, ncc_unmatched: !!ncc && !sup,
           model: txt(x.model), serial_number: txt(x.serial), origin: txt(x.xuatxu), manufacturer: txt(x.thuong_hieu),
           capacity: cap, contract: vnd > 0 ? { currency:'VND', amount: vnd } : usd > 0 ? { currency:'USD', amount: usd } : null, vnd, usd };
}
/* trạng thái Danh mục muốn có (null = chưa về NM -> không đổi) */
const target = x => { const st = DM.installStatus(x).stage; return st === 'testing' ? 'installing' : st; };   // Danh mục không có 'testing'
/* ngày cho mốc Danh mục; chạy thử ở tương lai chỉ là kế hoạch -> chưa ghi mốc vận hành thử */
const msDay = (x, k) => { const d = iso(x[k]); return d && k === 'chaythu_tt' && d > DM.todayIso() ? null : d; };
const FIELD_L = () => ({ company: L('Company','Công ty'), supplier: L('Supplier','Nhà cung cấp'), model: 'Model', serial_number: L('Serial number','Số serial'),
  origin: L('Origin','Xuất xứ'), manufacturer: L('Brand','Thương hiệu'), capacity: L('Capacity','Công suất'), contract: L('Contract value','Giá trị hợp đồng'),
  commissioned_date: L('Commissioning date','Ngày nghiệm thu'), 'ms:arrived_site': L('Milestone: arrival at plant','Mốc: về nhà máy'),
  'ms:installed': L('Milestone: trial run','Mốc: vận hành thử'), 'ms:commissioned': L('Milestone: commissioning','Mốc: nghiệm thu') });
const REASON = () => ({ no_code: L('no machine code yet (not arrived at plant)','chưa có Mã máy (chưa về NM)'),
  not_commissioned: L('not linked, not yet commissioned — a catalog record is created at commissioning','chưa liên kết, chưa nghiệm thu — tạo hồ sơ Danh mục khi nghiệm thu'),
  wait_days: L(`commissioned, waiting ${WAIT_DAYS} days before a catalog record is created`,`đã nghiệm thu, chờ đủ ${WAIT_DAYS} ngày mới tạo hồ sơ Danh mục`),
  no_company: L('unknown company (installation site) — cannot create a catalog record','không xác định công ty (Nơi lắp đặt) — chưa tạo được hồ sơ Danh mục'),
  locked: L('catalog record could not be decrypted','hồ sơ Danh mục chưa giải mã được') });

/* tên Danh mục = tên Tiến độ; tên cũ nối vào alias_names (nếu có cột) */
function nameFollow(p, cat, tn){
  p.set.name = tn; p.oldName = cat.name;
  if('alias_names' in cat && cat.name && cat.name !== '🔒'){
    const al = String(cat.alias_names || '').split(/\s*;\s*/).filter(Boolean);
    if(!al.some(a => fold(a) === fold(cat.name)) && fold(cat.name) !== fold(tn)) al.push(cat.name);
    const nv = al.join('; ') || null; if(nv !== (cat.alias_names || null)) p.set.alias_names = nv;
  }
}
/* ---------- kế hoạch đồng bộ 1 máy ----------
   action: 'create' | 'update' | 'none' (đã khớp) | 'skip' (chưa đủ điều kiện, reason)
   set: trường ghi vào mmtb_machines · ms: mốc ghi vào delivery_milestones · conflicts: lệch · warn: cảnh báo */
function plan(x, C){
  const p = { x, cat: null, action: 'none', reason: '', set: {}, ms: [], conflicts: [], warn: [] };
  if(!x){ p.action = 'skip'; p.reason = 'no_code'; return p; }
  if(!x.ma_may){
    // chưa có Mã máy (chưa về NM): không đồng bộ gì — TRỪ tên của máy đã ghép cặp (tên Danh mục luôn theo Tiến độ, user 2026-11-14)
    const c0 = C.byTrack.get(x._id), tn0 = txt(x.ten);
    if(c0 && !c0.__locked && tn0 && tn0 !== c0.name){ p.cat = c0; nameFollow(p, c0, tn0); p.action = 'update'; return p; }
    if(c0) p.cat = c0;
    p.action = 'skip'; p.reason = 'no_code'; return p;
  }
  const w = want(x, C), st = target(x), cat = C.byTrack.get(x._id);
  if(w.ncc_unmatched) p.warn.push(L(`Supplier "${w.ncc}" is not in the catalog supplier list — left empty, no new supplier created`,
                                    `NCC "${w.ncc}" không có trong danh sách NCC của Danh mục — để trống, không tạo NCC mới`));
  if(!cat){
    if(!x.nghiemthu_tt){ p.action = 'skip'; p.reason = 'not_commissioned'; return p; }
    const readyOn = DM.addDays(iso(x.nghiemthu_tt), WAIT_DAYS);
    if(readyOn > DM.todayIso()){ p.action = 'skip'; p.reason = 'wait_days'; p.readyOn = readyOn; return p; }
    if(!w.company_id){ p.action = 'skip'; p.reason = 'no_company'; return p; }
    p.action = 'create';
    const s = p.set;
    s.name = txt(x.ten) || x.ma_may; s.company_id = w.company_id; s.lifecycle_status = st || 'in_operation'; s.commissioned_date = iso(x.nghiemthu_tt);
    if(w.supplier_id) s.supplier_id = w.supplier_id;
    ['model','serial_number','origin','manufacturer'].forEach(k => { if(w[k]) s[k] = w[k]; });
    if(w.capacity){ s.capacity_value = w.capacity.value; if(w.capacity.unit) s.capacity_unit = w.capacity.unit; }
    if(w.contract){ s.contract_currency = w.contract.currency; s.contract_amount = w.contract.amount; }
    p.ms = MS_MAP.filter(([, k]) => msDay(x, k)).map(([m, k]) => ({ milestone: m, actual_date: msDay(x, k), exists: false }));
    return p;
  }
  p.cat = cat;
  if(cat.__locked){ p.action = 'skip'; p.reason = 'locked'; return p; }
  const s = p.set, cf = (field, t, c, tv, cv) => p.conflicts.push({ field, track: t, cat: c, tv, cv });
  // tên máy: đã liên kết thì Danh mục luôn theo tên Tiến độ (user 2026-11-14); tên cũ bên Danh mục giữ ở "Tên gọi khác" (alias_names)
  const tn = txt(x.ten);
  if(tn && tn !== cat.name) nameFollow(p, cat, tn);
  if(w.company_id && w.company_id !== cat.company_id)
    cf('company', w.company_code, (C.coId.get(cat.company_id) || {}).code || '—', w.company_id, cat.company_id);
  if(w.supplier_id){
    if(!cat.supplier_id) s.supplier_id = w.supplier_id;
    else if(cat.supplier_id !== w.supplier_id) cf('supplier', w.ncc, (C.supId.get(cat.supplier_id) || {}).name || '—', w.supplier_id, cat.supplier_id);
  }
  ['model','serial_number','origin','manufacturer'].forEach(k => {
    if(!w[k]) return;
    if(cat[k] == null || String(cat[k]).trim() === '') s[k] = w[k];
    else if(fold(cat[k]) !== fold(w[k])) cf(k, w[k], cat[k], w[k], cat[k]);
  });
  if(w.capacity){
    const cv = cat.capacity_value == null || cat.capacity_value === '' ? null : Number(cat.capacity_value);
    if(cv == null){ s.capacity_value = w.capacity.value; if(w.capacity.unit && !cat.capacity_unit) s.capacity_unit = w.capacity.unit; }
    else if(cv !== w.capacity.value || (w.capacity.unit && cat.capacity_unit && fold(w.capacity.unit) !== fold(cat.capacity_unit)))
      cf('capacity', un(x.congsuat).trim(), (cv + ' ' + (cat.capacity_unit || '')).trim(), w.capacity, { value: cv, unit: cat.capacity_unit });
  }
  if(w.contract){
    let ca = cat.contract_amount == null || cat.contract_amount === '' ? null : Number(cat.contract_amount);
    // máy đã ✂️ tách: giá trị Tiến độ là tổng cả cụm → cộng thêm phần giá trị của các máy tách ra (cùng loại tiền)
    if(ca != null) (C.MM.machines || []).forEach(m => { if(m.id !== cat.id && String(m.source_ref || '').startsWith('Tách từ ' + cat.machine_code)
      && m.contract_currency === cat.contract_currency && m.contract_amount != null && m.contract_amount !== '') ca += Number(m.contract_amount); });
    if(ca == null){ s.contract_amount = w.contract.amount; if(cat.contract_currency !== w.contract.currency) s.contract_currency = w.contract.currency; }
    else {
      const tv = cat.contract_currency === 'VND' ? w.vnd : cat.contract_currency === 'USD' ? w.usd : 0;    // EUR: không so
      if(tv > 0 && Math.abs(tv - ca) > 0.5) cf('contract', nf(tv) + ' ' + cat.contract_currency, nf(ca) + ' ' + cat.contract_currency, tv, ca);
    }
  }
  const nt = iso(x.nghiemthu_tt);
  if(nt){
    if(!cat.commissioned_date) s.commissioned_date = nt;
    else if(iso(cat.commissioned_date) !== nt) cf('commissioned_date', fmtDate(nt), fmtDate(cat.commissioned_date), nt, iso(cat.commissioned_date));
  }
  if(st && LCO.indexOf(st) > LCO.indexOf(cat.lifecycle_status)) s.lifecycle_status = st;
  const have = C.ms.get(cat.id) || {};
  MS_MAP.forEach(([m, k]) => {
    const d = msDay(x, k); if(!d) return;
    const e = have[m];
    if(!e || !e.actual_date) p.ms.push({ milestone: m, actual_date: d, exists: !!e });
    else if(iso(e.actual_date) !== d) cf('ms:' + m, fmtDate(d), fmtDate(e.actual_date), d, iso(e.actual_date));
  });
  p.action = Object.keys(s).length || p.ms.length ? 'update' : 'none';
  return p;
}
const planAll = (rows, C) => rows.map(x => plan(x, C));

/* ---------- ghi ---------- */
const SECF = () => (typeof SEC !== 'undefined' && SEC.mmtb_machines) ? SEC.mmtb_machines.f : [];
async function refreshCat(id){            // đọc lại 1 hồ sơ + mốc sau khi ghi, cập nhật window.__MMTB tại chỗ
  const sb = window.__sb, MM = window.__MMTB;
  const [{ data: r }, { data: ms }] = await Promise.all([sb.from('mmtb_machines').select('*').eq('id', id).maybeSingle(),
    sb.from('delivery_milestones').select('machine_id,milestone,planned_date,forecast_date,actual_date').eq('machine_id', id)]);
  if(!r || !MM) return;
  const o = await window.__open(r), cur = MM.machines.find(c => c.id === id);
  const co = (MM.companies || []).find(c => c.id === o.company_id) || {}, sp = (MM.suppliers || []).find(s => s.id === o.supplier_id) || {};
  Object.assign(o, { company_code: co.code || null, company_name: co.name || null, supplier_name: sp.name || null });
  if(cur) Object.assign(cur, o); else MM.machines.push(o);
  MM.milestones = (MM.milestones || []).filter(m => m.machine_id !== id).concat(ms || []);
}
let reloadT = null;
const reloadLater = () => { clearTimeout(reloadT); reloadT = setTimeout(() => { if(window.__mmReload) window.__mmReload().catch(() => {}); }, 900); };

async function writeMs(id, list){
  const sb = window.__sb;
  for(const m of list){
    const q = m.exists ? sb.from('delivery_milestones').update({ actual_date: m.actual_date }).eq('machine_id', id).eq('milestone', m.milestone)
                       : sb.from('delivery_milestones').insert({ machine_id: id, milestone: m.milestone, actual_date: m.actual_date });
    const { error } = await q; if(error) throw error;
  }
}
/* thực hiện 1 kế hoạch; trả { ok, id, code, created } hoặc ném lỗi */
async function apply(p, C){
  const sb = window.__sb; if(!sb) throw { code:'nodb' };
  const now = new Date().toISOString(), x = p.x;
  if(p.action === 'create'){
    const co = C.coId.get(p.set.company_id) || {};
    const base = Object.assign({ source_ref: 'Từ Tiến độ máy về · ' + x.ma_may, tracking_machine_id: x._id, needs_info: true,
                                 tracking_synced_at: now, role: 'main' }, p.set);
    if(C.MM.hasGroups) base.code_temp = true;
    let data, error;
    for(let i = 0; i < 3; i++){           // mã tạm ngẫu nhiên trùng (rất hiếm) -> cấp lại
      const row = Object.assign({ machine_code: window.__tempCode ? window.__tempCode(co.code) : co.code + '-' + Date.now() }, base);
      ({ data, error } = await sb.from('mmtb_machines').insert(await window.__seal('mmtb_machines', row)).select('id,machine_code').single());
      if(!error || !(error.code === '23505' && /machine_code/.test(error.message || ''))) break;
    }
    if(error) throw error;
    if(p.ms.length) await writeMs(data.id, p.ms);
    await refreshCat(data.id);
    return { ok: true, id: data.id, code: data.machine_code, created: true };
  }
  const cat = p.cat, upd = Object.assign({}, p.set, { tracking_synced_at: now });
  const F = SECF();
  if(F.some(k => k in p.set)){            // trường nhạy cảm nằm trong sec: mã hoá lại cả gói, chỉ các trường vừa đổi
    // chỉ các trường có trên dòng (cột của migration chưa chạy thì bỏ qua — VD alias_names của migration 11)
    const s = {}; F.forEach(k => { if(k in p.set || k in cat) s[k] = k in p.set ? p.set[k] : (cat[k] === undefined ? null : cat[k]); });
    Object.assign(upd, await window.__seal('mmtb_machines', s));
  }
  if(Object.keys(p.set).length){
    const { data, error } = await sb.from('mmtb_machines').update(upd).eq('id', cat.id).eq('version', cat.version).is('deleted_at', null).select('id');
    if(error) throw error;
    if(!data || !data.length) throw { code: 'conflict' };
  }
  if(p.ms.length) await writeMs(cat.id, p.ms);
  await refreshCat(cat.id);
  return { ok: true, id: cat.id, code: cat.machine_code, created: false };
}

/* sau khi lưu bên Tiến độ (Cập nhật nhanh, Xác nhận hàng loạt, form Sửa, nạp Excel). Không ném lỗi.
   Trả { done:[{x,code,created}], failed:[{x,err}], conflicts } — người gọi tự báo. */
async function syncMachines(list, opt){
  opt = opt || {};
  const out = { done: [], failed: [], conflicts: 0, skipped: '' };
  if(!window.__canWriteM){ out.skipped = 'perm'; return out; }
  let C = ctx();
  if(!C){ out.skipped = 'no_catalog'; return out; }
  if(!C.ready){ out.skipped = 'no_migration'; return out; }
  window.__selfWritingM = true;
  try{
    for(const x of list){
      let p = plan(x, C);
      out.conflicts += p.conflicts.length;
      if(p.action !== 'create' && p.action !== 'update') continue;
      try{ const r = await apply(p, C); out.done.push({ x, code: r.code, created: r.created }); C = ctx(); }
      catch(err){
        // hồ sơ Danh mục trong trình duyệt cũ hơn máy chủ (VD lần tải lại ngầm chạy chồng lên lần ghi trước):
        // đọc lại hồ sơ, tính lại kế hoạch trên bản mới rồi thử 1 lần nữa
        if(err && err.code === 'conflict' && p.cat){
          try{
            await refreshCat(p.cat.id); C = ctx(); p = plan(x, C);
            if(p.action === 'create' || p.action === 'update'){ const r = await apply(p, C); out.done.push({ x, code: r.code, created: r.created }); C = ctx(); }
            continue;
          }catch(e2){ err = e2; }
        }
        out.failed.push({ x, err });
      }
    }
  } finally { setTimeout(() => { window.__selfWritingM = false; }, 1500); }
  if(out.done.length && !opt.noReload) reloadLater();
  return out;
}
/* các lần gọi chạy lần lượt (2 lần lưu liền nhau của cùng 1 máy không tạo 2 hồ sơ); CS.idle() chờ hết hàng */
let chain = Promise.resolve();
const afterSave = list => (chain = chain.then(() => afterSave1(list), () => afterSave1(list)));
const afterSave1 = async list => {
  let r;
  try{ r = await syncMachines(list); }
  catch(err){ console.warn('[Danh mục] chưa đồng bộ được', err); r = { done: [], failed: list.map(x => ({ x, err })), conflicts: 0 }; }
  if(r.failed.length && typeof quToast === 'function')
    quToast('⚠ ' + L(`Saved, but not yet copied to the Catalog (${r.failed.length}) — it stays in the sync queue: `,
                       `Đã lưu, nhưng chưa chuyển sang Danh mục (${r.failed.length}) — máy nằm trong hàng chờ đồng bộ: `)
            + (typeof dbErrText === 'function' ? dbErrText(r.failed[0].err) : esc(r.failed[0].err && r.failed[0].err.message)));
  else if(r.done.some(d => d.created) && typeof quToast === 'function')
    quToast('🔗 ' + L('Catalog record created: ','Đã tạo hồ sơ Danh mục: ') + r.done.filter(d => d.created).map(d => '<b>' + esc(d.code) + '</b>').join(', '));
  return r;
};

/* trạng thái liên kết để hiện ở popup chi tiết bên Tiến độ */
function linkInfo(x){
  const C = ctx(); if(!C) return null;
  const p = plan(x, C);
  return { cat: p.cat, pending: p.action === 'create' || p.action === 'update', conflicts: p.conflicts.length,
           reason: p.action === 'skip' ? (REASON()[p.reason] || p.reason) + (p.readyOn ? L(' (from ',' (từ ') + p.readyOn.split('-').reverse().join('/') + ')' : '') : '', ready: C.ready };
}

/* ---------- ghép cặp lần đầu ----------
   Ứng viên: máy Danh mục ordered / installing / in_operation chưa liên kết × máy Tiến độ chưa liên kết, CÙNG công ty.
   Điểm 0..1: tên (giống theo từ) 0.35 · model trùng 0.25 · serial trùng 0.3 · NCC 0.15 · giá trị ±2% 0.15 · ngày nghiệm thu / về ±30 ngày 0.1.
   "Chắc chắn": điểm ≥ 0.6, hai bên chọn nhau là tốt nhất, hơn ứng viên thứ 2 ≥ 0.15, máy Tiến độ số lượng 1. */
const STOP = new Set(['may', 'he', 'thong', 'bo', 'cum', 'va', 'cho', 'the', 'machine', 'system', 'line']);
const toks = s => new Set(fold(s).split(' ').filter(t => t && !STOP.has(t)));
function nameSim(a, b){
  const A = toks(a), B = toks(b); if(!A.size || !B.size) return 0;
  let n = 0; A.forEach(t => { if(B.has(t)) n++; });
  return 2 * n / (A.size + B.size);
}
const MATCH_ST = ['ordered', 'installing', 'in_operation'];
function score(x, c){
  if(DM.companyCode(un(x.noilapdat)) !== c.company_code) return 0;
  let s = 0.35 * nameSim(un(x.ten), c.name);
  const eq = (a, b) => !!fold(a) && fold(a) === fold(b);
  if(eq(un(x.model), c.model)) s += 0.25;
  if(eq(un(x.serial), c.serial_number)) s += 0.3;
  const n1 = fold(un(x.ncc)), n2 = fold(c.supplier_name);
  if(n1 && n2 && (n1 === n2 || n1.includes(n2) || n2.includes(n1))) s += 0.15;
  const v1 = +x.vnd || 0, v2 = +c.value_vnd || 0;
  if(v1 > 0 && v2 > 0 && Math.abs(v1 - v2) / Math.max(v1, v2) <= 0.02) s += 0.15;
  const d1 = iso(x.nghiemthu_tt) || iso(x.venm_tt), d2 = iso(c.commissioned_date);
  if(d1 && d2 && Math.abs(DM.days(d1, d2)) <= 30) s += 0.1;
  return Math.min(1, Math.round(s * 100) / 100);
}
function suggest(rows, C){
  const cats = C.MM.machines.filter(c => !c.tracking_machine_id && MATCH_ST.includes(c.lifecycle_status));
  const linked = new Set(C.MM.machines.map(c => c.tracking_machine_id).filter(Boolean));
  const tracks = rows.filter(x => !linked.has(x._id));
  const cand = new Map(), bestOfX = new Map();
  cats.forEach(c => {
    const l = tracks.map(x => ({ x, s: score(x, c) })).filter(o => o.s >= 0.3).sort((a, b) => b.s - a.s).slice(0, 5);
    cand.set(c.id, l);
    l.forEach(o => { const b = bestOfX.get(o.x._id); if(!b || o.s > b.s) bestOfX.set(o.x._id, { c, s: o.s }); });
  });
  const sure = [], review = [];
  cats.forEach(c => {
    const l = cand.get(c.id); if(!l.length) return;
    const [a, b] = l, mutual = (bestOfX.get(a.x._id) || {}).c === c;
    const ok = a.s >= 0.6 && mutual && (!b || a.s - b.s >= 0.15) && (+a.x.sl || 1) === 1;
    (ok ? sure : review).push({ c, cands: l, pick: ok || (a.s >= 0.45 && mutual) ? a.x._id : '' });
  });
  const used = new Set([...sure, ...review].flatMap(r => r.cands.map(o => o.x._id)));
  return { sure, review,
           trackOnly: tracks.filter(x => !used.has(x._id)),
           catOnly: cats.filter(c => !cand.get(c.id).length && c.lifecycle_status !== 'in_operation') };
}

/* ---------- giao diện admin (dùng chung modal mBg / mTitle / mSub / mBody của index.html) ---------- */
const $ = id => document.getElementById(id);
const rowsT = () => (typeof DATA !== 'undefined' ? DATA : []);
const LCN = () => L({ planned:'Planned', ordered:'Ordered', manufacturing:'Manufacturing', shipping:'Shipping', arrived:'Arrived', installing:'Installing', in_operation:'In operation', idle:'Idle', disposed:'Disposed' },
                    { planned:'Kế hoạch', ordered:'Đã đặt hàng', manufacturing:'Đang chế tạo', shipping:'Đang vận chuyển', arrived:'Đã về', installing:'Đang lắp đặt', in_operation:'Đang vận hành', idle:'Dừng / dự phòng', disposed:'Thanh lý' });
function needCtx(){
  const C = ctx();
  if(!C){ mBody.innerHTML = `<div class="m-gt">${L('The Catalog could not be loaded. Reload the page.','Chưa tải được Danh mục MMTB. Tải lại trang.')}</div>`; return null; }
  if(!C.ready){ mBody.innerHTML = `<div class="m-gt">${L('The database is not linked yet. An admin needs to run <b>supabase/migrations/20261101_10_link_tracking_catalog.sql</b> in Supabase > SQL Editor.',
    'Cơ sở dữ liệu chưa có cột liên kết. Admin cần chạy file <b>supabase/migrations/20261101_10_link_tracking_catalog.sql</b> trong Supabase > SQL Editor.')}</div>`; return null; }
  return C;
}
const pendingCount = () => { const C = ctx(); return C && C.ready ? planAll(rowsT(), C).filter(p => p.action === 'create' || p.action === 'update').length : 0; };

/* menu 🔗 */
window.csOpen = () => {
  mTitle.textContent = L('🔗 Delivery ↔ Catalog','🔗 Tiến độ ↔ Danh mục');
  mSub.textContent = L('One-way: delivery tracking updates the Machinery catalog.','Một chiều: Tiến độ máy về cập nhật Danh mục MMTB.');
  if(typeof openM === 'function') openM();
  const C = needCtx(); if(!C) return;
  const P = planAll(rowsT(), C), pend = P.filter(p => p.action === 'create' || p.action === 'update').length;
  const nc = P.reduce((s, p) => s + p.conflicts.length, 0), linked = C.byTrack.size;
  mBody.innerHTML = `<div class="cs-menu">
    <button type="button" class="nbtn2 ghost" onclick="csPair()">🧩 ${L('Pair existing machines','Ghép cặp máy đã có')}<small>${L(`${linked} linked`,`${linked} máy đã liên kết`)}</small></button>
    <button type="button" class="nbtn2 ghost" onclick="csSync()">🔄 ${L('Sync to Catalog','Đồng bộ lại sang Danh mục')}<small>${pend ? L(`${pend} waiting`,`${pend} máy chờ đồng bộ`) : L('up to date','đã khớp')}</small></button>
    <button type="button" class="nbtn2 ghost" onclick="csDiff()">⚖️ ${L('Data differences','Lệch dữ liệu')}<small>${L(`${nc} field(s)`,`${nc} trường`)}</small></button>
    ${brandFill(C).length ? `<button type="button" class="nbtn2 ghost" id="csBrand" onclick="csBrand()">🏷 ${L('Fill brands from the Catalog','Điền thương hiệu từ Danh mục')}<small>${L(`${brandFill(C).length} machine(s) without a brand`,`${brandFill(C).length} máy chưa có thương hiệu`)}</small></button>` : ''}</div>`;
};
/* 🏷 máy Tiến độ đã liên kết, chưa có thương hiệu, Danh mục có thương hiệu (migrations/20261110_18) -> điền 1 lần */
const brandFill = C => rowsT().filter(x => x._th && !un(x.thuong_hieu).trim() && x.ten !== '🔒')
  .map(x => ({ x, c: C.byTrack.get(x._id) })).filter(o => o.c && !o.c.__locked && txt(o.c.manufacturer) && o.c.manufacturer !== '🔒');
window.csBrand = async () => {
  const C = needCtx(); if(!C) return;
  const list = brandFill(C), b = $('csBrand'); if(b) b.disabled = true;
  let ok = 0, bad = 0;
  for(const o of list){
    try{ await writeTrack(o.x, { thuong_hieu: txt(o.c.manufacturer) }); ok++; }
    catch(e){ bad++; console.warn('[Danh mục] chưa điền được thương hiệu', o.x.ma_may, e); }
  }
  if(typeof render === 'function') try{ render(); }catch(e){}
  quToast((bad ? '⚠ ' : '✅ ') + L(`Filled the brand for ${ok} machine(s)` + (bad ? ` · ${bad} failed` : ''),
                                   `Đã điền thương hiệu cho ${ok} máy` + (bad ? ` · ${bad} máy lỗi` : '')));
  window.csOpen();
};

/* 🧩 ghép cặp */
let PAIR = null;
window.csPair = () => {
  mTitle.textContent = L('🧩 Pair Delivery ↔ Catalog','🧩 Ghép cặp Tiến độ ↔ Danh mục');
  const C = needCtx(); if(!C) return;
  const S = suggest(rowsT(), C); PAIR = { S, C, sel: new Map(), ok: new Set() };
  [...S.sure, ...S.review].forEach(r => { if(r.pick) PAIR.sel.set(r.c.id, r.pick); });
  mSub.innerHTML = L(`${S.sure.length} sure · ${S.review.length} to review · ${S.trackOnly.length} delivery machines with no catalog match · ${S.catOnly.length} ordered / installing catalog machines not found. Nothing is written until you tick and press Save links.`,
                     `${S.sure.length} chắc chắn · ${S.review.length} cần xem lại · ${S.trackOnly.length} máy Tiến độ chưa có bên Danh mục · ${S.catOnly.length} máy Danh mục ordered / installing không tìm thấy bên Tiến độ. Chưa tick duyệt thì không ghi gì.`);
  drawPair(); openM(1);
};
function drawPair(){
  const { S } = PAIR, X = new Map(rowsT().map(x => [x._id, x]));
  const opt = r => `<select data-c="${r.c.id}"><option value="">${L('— do not link —','— không ghép —')}</option>${r.cands.map(o =>
    `<option value="${o.x._id}"${PAIR.sel.get(r.c.id) === o.x._id ? ' selected' : ''}>${esc(o.x.ma_may || L('(no code)','(chưa có mã)'))} · ${esc(un(o.x.ten))} · ${o.s.toFixed(2)}</option>`).join('')}</select>`;
  const row = (r, grp) => { const x = X.get(PAIR.sel.get(r.c.id));
    return `<tr><td><b>${esc(r.c.machine_code)}</b><small>${esc(r.c.name)}</small></td><td>${esc(r.c.company_code)} · ${LCN()[r.c.lifecycle_status] || r.c.lifecycle_status}</td>
      <td>${opt(r)}${x ? `<small>${esc(un(x.ncc) || '—')} · ${esc(un(x.model) || '—')} · ${L('arrived','về NM')} ${fmtDate(x.venm_tt)}</small>` : ''}</td>
      <td class="n">${grp}</td><td><input type="checkbox" data-ok="${r.c.id}"${PAIR.ok.has(r.c.id) ? ' checked' : ''}${PAIR.sel.get(r.c.id) ? '' : ' disabled'}></td></tr>`; };
  const n = [...PAIR.ok].filter(id => PAIR.sel.get(id)).length;
  mBody.innerHTML = `<div class="cs-tools"><button type="button" class="nbtn2 ghost" id="csTickSure">✔ ${L('Tick all sure pairs','Tick tất cả cặp chắc chắn')}</button>
      <button type="button" class="nbtn2 ghost" id="csXlsx">⬇️ ${L('Download proposal (.xlsx)','Tải file đề xuất (.xlsx)')}</button></div>
    <div class="qu-tbl cs-tbl"><table><thead><tr><th>${L('Catalog','Danh mục')}</th><th>${L('Company · status','Công ty · trạng thái')}</th><th>${L('Delivery machine','Máy Tiến độ')}</th><th>${L('Group','Nhóm')}</th><th>${L('Approve','Duyệt')}</th></tr></thead>
    <tbody>${S.sure.map(r => row(r, L('sure','chắc chắn'))).join('')}${S.review.map(r => row(r, L('review','xem lại'))).join('')}</tbody></table></div>
    ${!S.sure.length && !S.review.length ? `<div class="m-ok">${L('No pair to propose.','Không có cặp nào để đề xuất.')}</div>` : ''}
    <div id="quMsg" style="min-height:1.2em;font-size:13px;margin:8px 0"></div>
    <div class="add-actions"><button type="button" class="nbtn2 ghost" onclick="csOpen()">← ${L('Back','Quay lại')}</button>
      <button type="button" class="nbtn2" id="csSaveLinks"${n ? '' : ' disabled'}>💾 ${L(`Save ${n} link(s)`,`Ghi ${n} liên kết`)}</button></div>`;
  mBody.querySelectorAll('select[data-c]').forEach(s => s.onchange = () => { if(s.value) PAIR.sel.set(s.dataset.c, s.value); else { PAIR.sel.delete(s.dataset.c); PAIR.ok.delete(s.dataset.c); } drawPair(); });
  mBody.querySelectorAll('input[data-ok]').forEach(c => c.onchange = () => { c.checked ? PAIR.ok.add(c.dataset.ok) : PAIR.ok.delete(c.dataset.ok); drawPair(); });
  $('csTickSure').onclick = () => { S.sure.forEach(r => { if(PAIR.sel.get(r.c.id)) PAIR.ok.add(r.c.id); }); drawPair(); };
  $('csXlsx').onclick = pairXlsx;
  $('csSaveLinks').onclick = savePairs;
}
async function savePairs(){
  const list = [...PAIR.ok].map(id => [id, PAIR.sel.get(id)]).filter(([, t]) => t);
  const seen = new Map(), dup = list.filter(([, t]) => seen.has(t) || !seen.set(t, 1));
  if(dup.length){ $('quMsg').style.color = 'var(--red)'; $('quMsg').textContent = L('The same delivery machine is chosen for 2 catalog machines — fix it first.','Một máy Tiến độ đang được chọn cho 2 máy Danh mục — sửa lại trước khi ghi.'); return; }
  $('csSaveLinks').disabled = true; window.__selfWritingM = true;
  const sb = window.__sb, bad = [];
  for(const [n, [id, t]] of list.entries()){
    $('quMsg').style.color = 'var(--muted)'; $('quMsg').textContent = L(`Saving ${n + 1}/${list.length}…`,`Đang ghi ${n + 1}/${list.length}…`);
    const c = PAIR.C.byId.get(id);
    const { data, error } = await sb.from('mmtb_machines').update({ tracking_machine_id: t }).eq('id', id).eq('version', c.version).is('deleted_at', null).select('id');
    if(error || !data || !data.length) bad.push([c, error || { code:'conflict' }]); else await refreshCat(id);
  }
  setTimeout(() => { window.__selfWritingM = false; }, 1500); reloadLater();
  if(bad.length){ $('quMsg').style.color = 'var(--red)'; $('quMsg').innerHTML = L(`${bad.length} link(s) not saved: `,`${bad.length} liên kết chưa ghi được: `) + bad.map(([c, e]) => esc(c.machine_code) + ' — ' + (typeof dbErrText === 'function' ? dbErrText(e) : esc(e.message))).join('<br>'); return; }
  quToast('✅ ' + L(`Saved ${list.length} link(s)`,`Đã ghi ${list.length} liên kết`)); csSync();
}
function pairXlsx(){
  const { S } = PAIR;
  const cRow = c => [c.machine_code, c.name, c.company_code, LCN()[c.lifecycle_status] || c.lifecycle_status, c.supplier_name || '', c.model || '', c.serial_number || '', c.value_vnd == null ? '' : Math.round(c.value_vnd), c.commissioned_date || ''];
  const tRow = x => x ? [x.ma_may || '', un(x.ten), DM.companyCode(un(x.noilapdat)) || un(x.noilapdat), un(x.ncc), un(x.model), un(x.serial), +x.vnd || '', x.venm_tt || '', x.nghiemthu_tt || '', +x.sl || 1] : ['', '', '', '', '', '', '', '', '', ''];
  const HC = ['Mã Danh mục','Tên Danh mục','Công ty','Trạng thái','NCC (DM)','Model (DM)','Serial (DM)','Giá trị VNĐ (DM)','Ngày nghiệm thu (DM)'];
  const HT = ['Mã máy Tiến độ','Tên Tiến độ','Công ty (TĐ)','NCC (TĐ)','Model (TĐ)','Serial (TĐ)','Giá trị VNĐ (TĐ)','Ngày về NM TT','Ngày nghiệm thu TT','Số lượng'];
  const pairs = list => list.flatMap(r => r.cands.map((o, i) => [...cRow(r.c), i + 1, o.s, ...tRow(o.x)]));
  const wb = XLSX.utils.book_new(), add = (name, aoa, w) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map((h, i) => ({ wch: w && w[i] || 16 })); XLSX.utils.book_append_sheet(wb, ws, name); };
  add('Ghép chắc chắn', [[...HC, 'Hạng', 'Điểm', ...HT]].concat(S.sure.map(r => [...cRow(r.c), 1, r.cands[0].s, ...tRow(r.cands[0].x)])), [16, 34]);
  add('Cần xem lại', [[...HC, 'Hạng ứng viên', 'Điểm', ...HT]].concat(pairs(S.review)), [16, 34]);
  add('Tiến độ chưa có bên DM', [HT].concat(S.trackOnly.map(tRow)), [16, 34]);
  add('DM không thấy bên TĐ', [HC].concat(S.catOnly.map(cRow)), [16, 34]);
  XLSX.writeFile(wb, 'GhepCap_TienDo_DanhMuc_' + DM.todayIso() + '.xlsx');
}

/* 🔄 đồng bộ lại: xem trước rồi mới ghi */
window.csSync = () => {
  mTitle.textContent = L('🔄 Sync to Catalog','🔄 Đồng bộ lại sang Danh mục');
  const C = needCtx(); if(!C) return;
  const P = planAll(rowsT(), C), cr = P.filter(p => p.action === 'create'), up = P.filter(p => p.action === 'update');
  const nc = P.filter(p => p.conflicts.length), sk = P.filter(p => p.action === 'skip');
  const by = {}; sk.forEach(p => { by[p.reason] = (by[p.reason] || 0) + 1; });
  const R = REASON(), FL = FIELD_L(), go = [...cr, ...up];
  mSub.innerHTML = L(`Preview — nothing is written until you press Sync.`,`Xem trước — chưa ghi gì cho tới khi bấm Đồng bộ.`);
  const line = p => `<tr><td><b>${esc(p.x.ma_may)}</b><small>${esc(un(p.x.ten))}</small></td><td>${p.action === 'create' ? '➕ ' + L('create','tạo mới') : '✏️ ' + esc(p.cat.machine_code)}</td>
    <td>${p.action === 'update' && p.set.name ? `<small class="cs-rn">✏️ ${L('name','tên')}: ${esc(p.oldName || '—')} → <b>${esc(p.set.name)}</b></small>` : ''}${Object.keys(p.set).filter(k => k !== 'name' && k !== 'alias_names').map(k => esc(k)).concat(p.ms.map(m => 'ms:' + m.milestone)).join(', ')}${p.warn.map(w => `<small style="color:var(--st-over)">⚠ ${esc(w)}</small>`).join('')}</td></tr>`;
  mBody.innerHTML = `<div class="cs-sum"><span>➕ ${L('Create','Tạo mới')}: <b>${cr.length}</b></span><span>✏️ ${L('Update','Cập nhật')}: <b>${up.length}</b></span>
      <span>⚖️ ${L('With differences','Có lệch')}: <b>${nc.length}</b></span><span>⏸ ${L('Not eligible','Chưa đủ điều kiện')}: <b>${sk.length}</b></span></div>
    ${Object.keys(by).length ? `<div class="cs-why">${Object.entries(by).map(([k, n]) => `<div>· ${esc(R[k] || k)}: <b>${n}</b></div>`).join('')}</div>` : ''}
    ${go.length ? `<div class="qu-tbl cs-tbl"><table><thead><tr><th>${L('Delivery machine','Máy Tiến độ')}</th><th>${L('Catalog','Danh mục')}</th><th>${L('Fields written','Trường sẽ ghi')}</th></tr></thead><tbody>${go.map(line).join('')}</tbody></table></div>`
                : `<div class="m-ok">✅ ${L('Everything is up to date.','Danh mục đã khớp với Tiến độ.')}</div>`}
    <div id="quMsg" style="min-height:1.2em;font-size:13px;margin:8px 0"></div>
    <div class="add-actions"><button type="button" class="nbtn2 ghost" onclick="csOpen()">← ${L('Back','Quay lại')}</button>
      ${nc.length ? `<button type="button" class="nbtn2 ghost" onclick="csDiff()">⚖️ ${L('Differences','Lệch dữ liệu')}</button>` : ''}
      <button type="button" class="nbtn2" id="csGo"${go.length ? '' : ' disabled'}>🔄 ${L(`Sync ${go.length} machine(s)`,`Đồng bộ ${go.length} máy`)}</button></div>`;
  openM(1);
  $('csGo').onclick = async () => {
    $('csGo').disabled = true; $('quMsg').style.color = 'var(--muted)'; $('quMsg').textContent = L('Syncing…','Đang đồng bộ…');
    const r = await syncMachines(go.map(p => p.x));
    $('quMsg').style.color = r.failed.length ? 'var(--red)' : 'var(--green)';
    $('quMsg').innerHTML = L(`Done: ${r.done.length} · failed: ${r.failed.length}`,`Xong: ${r.done.length} · lỗi: ${r.failed.length}`)
      + r.failed.map(f => `<br>${esc(f.x.ma_may)} — ${typeof dbErrText === 'function' ? dbErrText(f.err) : esc(f.err && f.err.message)}`).join('');
    if(!r.failed.length) quToast('✅ ' + L(`Synced ${r.done.length} machine(s) to the Catalog`,`Đã đồng bộ ${r.done.length} máy sang Danh mục`));
  };
};

/* ⚖️ lệch dữ liệu: chọn giữ bên nào. Giữ Tiến độ -> ghi Danh mục; Giữ Danh mục -> ghi Tiến độ (không bao giờ đụng tên máy). */
const BACK = { model:'model', serial_number:'serial', origin:'xuatxu', manufacturer:'thuong_hieu', capacity:'congsuat', supplier:'ncc', commissioned_date:'nghiemthu_tt',
               'ms:installed':'chaythu_tt', 'ms:commissioned':'nghiemthu_tt', contract:'_contract' };   // company, ms:arrived_site: sửa ở Tiến độ
let DIFF = [];
window.csDiff = () => {
  mTitle.textContent = L('⚖️ Data differences','⚖️ Lệch dữ liệu');
  const C = needCtx(); if(!C) return;
  DIFF = planAll(rowsT(), C).flatMap(p => p.conflicts.map(c => Object.assign({ p }, c)));
  mSub.innerHTML = L('Fields that differ between the 2 sides. Sync never overwrites them — pick which side to keep.','Các trường khác nhau giữa 2 bên. Đồng bộ không tự ghi đè — chọn giữ bên nào.');
  const FL = FIELD_L();
  mBody.innerHTML = DIFF.length ? `<div class="qu-tbl cs-tbl"><table><thead><tr><th>${L('Machine','Máy')}</th><th>${L('Field','Trường')}</th><th>${L('Delivery','Tiến độ')}</th><th>${L('Catalog','Danh mục')}</th><th></th></tr></thead><tbody>
    ${DIFF.map((d, i) => `<tr><td><b>${esc(d.p.x.ma_may)}</b><small>${esc(d.p.cat.machine_code)}</small></td><td>${esc(FL[d.field] || d.field)}</td>
      <td>${esc(d.track)}</td><td>${esc(d.cat)}</td><td class="cs-act"><button type="button" class="nbtn2 ghost" data-i="${i}" data-k="t">${L('Keep delivery','Giữ Tiến độ')}</button>
      <button type="button" class="nbtn2 ghost" data-i="${i}" data-k="c"${BACK[d.field] ? '' : ` disabled title="${esc(L('Change it in Delivery tracking','Sửa bên Tiến độ máy về'))}"`}>${L('Keep catalog','Giữ Danh mục')}</button></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="m-ok">✅ ${L('No differences.','Không có lệch dữ liệu.')}</div>`;
  mBody.innerHTML += `<div id="quMsg" style="min-height:1.2em;font-size:13px;margin:8px 0"></div><div class="add-actions"><button type="button" class="nbtn2 ghost" onclick="csOpen()">← ${L('Back','Quay lại')}</button></div>`;
  openM(1);
  mBody.querySelectorAll('button[data-i]').forEach(b => b.onclick = async () => {
    const d = DIFF[+b.dataset.i];
    mBody.querySelectorAll('button[data-i]').forEach(o => o.disabled = true);
    try{ await (b.dataset.k === 't' ? keepTrack(d) : keepCat(d)); quToast('✅ ' + L('Saved','Đã lưu')); }
    catch(err){ $('quMsg').style.color = 'var(--red)'; $('quMsg').innerHTML = typeof dbErrText === 'function' ? dbErrText(err) : esc(err && err.message); return; }
    window.csDiff();
  });
};
async function keepTrack(d){                     // ghi giá trị Tiến độ sang Danh mục
  const C = ctx(), p = plan(d.p.x, C); if(!p.cat) return;
  const q = { x: p.x, cat: p.cat, action: 'update', set: {}, ms: [] };
  const v = d.tv;
  if(d.field === 'company') q.set.company_id = v;
  else if(d.field === 'supplier') q.set.supplier_id = v;
  else if(d.field === 'capacity'){ q.set.capacity_value = v.value; if(v.unit) q.set.capacity_unit = v.unit; }
  else if(d.field === 'contract') q.set.contract_amount = v;
  else if(d.field.startsWith('ms:')) q.ms.push({ milestone: d.field.slice(3), actual_date: v, exists: true });
  else q.set[d.field] = v;
  window.__selfWritingM = true;
  try{ await apply(q, C); } finally { setTimeout(() => { window.__selfWritingM = false; }, 1500); reloadLater(); }
}
async function keepCat(d){                       // ghi giá trị Danh mục ngược về Tiến độ (không bao giờ đụng tên máy)
  const x = d.p.x, k = BACK[d.field]; if(!k) return;
  const ch = {};
  if(k === '_contract') ch[d.p.cat.contract_currency === 'USD' ? 'usd' : 'vnd'] = d.cv;
  else if(k === 'congsuat') ch.congsuat = (d.cv.value + ' ' + (d.cv.unit || '')).trim();
  else if(k === 'ncc') ch.ncc = d.cat;
  else ch[k] = d.cv;
  await writeTrack(x, ch);
}
/* ghi Tiến độ (ngoài tên máy): trường nhạy cảm nằm trong sec -> mã hoá lại cả gói như quSaveOne */
async function writeTrack(x, ch){
  const sb = window.__sb; if(!sb) throw { code:'nodb' };
  if('ten' in ch) throw new Error('ten');
  const F = (typeof SEC !== 'undefined' && SEC.machines) ? SEC.machines.f : [];
  const upd = {}; Object.keys(ch).forEach(k => { if(!F.includes(k)) upd[k] = ch[k]; });
  if(F.some(k => k in ch)){
    if(typeof CRYPTO !== 'undefined' && CRYPTO.on && x.ten === '🔒') throw { code:'locked' };
    const s = {}; F.forEach(k => { s[k] = k in ch ? ch[k] : (k === 'vnd' || k === 'usd') ? (Number(x[k]) || 0) : un(x[k]); });
    Object.assign(upd, await window.__seal('machines', s));
    delete upd.ten; if(upd.sec === undefined) F.filter(k => !(k in ch)).forEach(k => { delete upd[k]; });
  }
  window.__selfWriting = true;
  try{
    const { data, error } = await sb.from('machines').update(upd).eq('id', x._id).eq('version', x._ver).is('deleted_at', null).select('*');
    if(error) throw error;
    if(!data || !data.length) throw { code:'conflict' };
    const o = window.__cleanMachine(await window.__open(data[0]));
    if(o.ten === '' && x.ten) o.ten = x.ten;
    Object.assign(x, o); if(typeof setArrival === 'function') setArrival(x);
  } finally { setTimeout(() => { window.__selfWriting = false; }, 1500); }
}

window.CS = { WAIT_DAYS, FIELD_L, parseCap, fold, ctx, plan, planAll, apply, syncMachines, afterSave, linkInfo, score, suggest, nameSim, pendingCount, writeTrack,
              idle: () => chain.then(() => {}, () => {}) };
})();
