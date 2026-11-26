/* change_req.js — Hàng chờ duyệt (đợt 2, 2026-11-25, migration 26 change_requests). window.CR.
   Editor / catalog_editor bấm Lưu ở ✏️ Sửa / ➕ Thêm / 📋 Nhân bản / 🗑 Xoá / ✂️ Tách (Danh mục) → gửi YÊU CẦU (không ghi bảng máy); admin duyệt mới ghi.
   Admin lưu thẳng như cũ. Chưa chạy 26 (bảng chưa có: 42P01 / PGRST205 / 404) → CR.missing = true: mọi đường lưu như cũ, không nút / nhãn nào.
   Lỗi khác khi dò bảng (mạng, 5xx, JWT hết hạn) KHÔNG tắt duyệt: editor vẫn phải gửi yêu cầu, gửi lỗi thì báo — không bao giờ lưu thẳng.
   CR.loaded = Promise (xong khi dò + tải xong); CR.isLoaded = boolean. Đường lưu của editor await CR.loaded trước khi quyết định.
   - Nội dung yêu cầu mã hoá như dữ liệu máy: sec = CRYPTO.on ? CRYPTO.encObj(o) : 'plain:' + JSON(o), o = { payload, before, title }.
     payload = bản ghi đề xuất (đúng dạng tham số hàm ghi), before = giá trị hiện tại cùng các khoá (null khi thêm), title = tên máy (+ mã).
   - requested_by / decided_* do trigger máy chủ đặt — không gửi. Mỗi máy tối đa 1 yêu cầu pending của cùng người gửi:
     gửi lại Sửa khi đang có Sửa chờ → GỘP theo trường (mergeOld: trường cũ đổi mà lần mới không đổi được giữ, cả 2 đổi → lần mới thắng), cũ withdrawn (chỉ các yêu cầu đã đọc được lúc gộp);
     khác loại (có Xoá) → thay như cũ. Nội dung niêm phong kèm replaced = [{ id, at, dropped: [{k, v}], kept: [k], kind?, replacedBy? }] (nối chuỗi);
     📨 hiện "Đã thay N lần gửi trước" và nhãn "Đã gộp" cho yêu cầu cũ (chỉ nhãn hiện, DB vẫn withdrawn).
   - CR.appliers[mod][kind](req, data) → Promise<id[]>: hàm ghi thật của từng phân hệ (cả 2 đăng ký trong index.html: saveMachine / mmWrite).
     Danh mục: payload = before = { row, ms } — row = bản ghi máy chưa niêm phong (mmNorm), ms = { mốc: ngày thực tế | null } các mốc được ghi.
     CR.flat('mmtb', o) trải thành 1 tầng (trường máy + 'ms.<mốc>') để so / gộp theo trường; diffRows tự trải.
     Kết quả applier có thể kèm ids.note = ghi chú cho admin (VD Thêm Danh mục: mã tạm đã có máy khác dùng → cấp mã tạm mới).
   Hợp đồng applier (Task 4): data = { payload, before, title } với payload là bản ĐÃ GỘP (bản hiện tại + các trường editor đổi,
   trường xung đột theo lựa chọn của admin); applier ghi với version HIỆN TẠI của máy (không phải base_version), trả về ID máy đã ghi.
   Admin (Task 4, 📝 Chờ duyệt): #btnReq = "📝 N" (ẩn khi N = 0) → CR.openReview(): danh sách pending, bấm 1 yêu cầu → cũ → mới + ✅ Duyệt / ❌ Từ chối.
   - CR.getters[mod](id) → { row, version } | null: bản HIỆN TẠI đã giải mã, cùng dạng + chuẩn hoá như before (đăng ký trong index.html);
     base (tuỳ chọn, cạnh row) = các khoá applier cần dù editor không gửi (Tiến độ: REC_KEYS + nghiemthu_kh — saveMachine ghi cả dòng).
     CR.sync[mod](id | null) → đọc lại máy từ DB trước khi so (máy đã xoá → getter trả null; null = tải lại cả phân hệ, dùng cho Thêm).
     CR.derive[mod](merged, cur, before) → trường tự tính, chỉ gọi khi người khác đã đổi ô ngày (đầu vào) sau lúc gửi.
   - CR.plan(req, data, cur) → { changed, conflicts, gone, stale }: changed = khoá editor đổi (payload ≠ before, bỏ trường tự tính);
     conflicts = khoá thuộc changed mà hiện tại ≠ before và ≠ payload (cả 2 bên đổi); gone = máy không còn (Sửa / Xoá).
   - CR.approve(id, choices) — choices[k] = 'mine' (lấy của editor) | 'theirs' (giữ hiện tại); MỌI khoá xung đột phải có lựa chọn.
     Bản ghi = hiện tại + khoá editor đổi (xung đột theo choices); trường editor không đổi giữ giá trị hiện tại (không đè ⚡ mới).
     Đọc lại status trong DB ngay trước khi ghi (không còn pending → dừng). Thêm: ID máy mới = ID yêu cầu (duyệt lại sau lần ghi được
     mà chưa đổi trạng thái → applier thấy máy đã có, không thêm lần 2). Ghi được mà đổi trạng thái lỗi → báo riêng (partial).
     Ghi qua applier TRƯỚC, ghi được mới đặt status = 'approved' + applied_ids trong 1 lệnh update; lỗi ghi → ném lỗi, status giữ nguyên.
   - CR.reject(id, note) — note bắt buộc (trigger 26 cũng chặn lý do trống).
   - ✂️ Tách (Danh mục, đợt 3): editor Lưu ở popup Tách → kind 'split', payload = plan của popup { hasAmt, currency, vals, orig: { area_id, line_id, loc, quantity,
     contract_amount? }, news: [{ area_id, line_id, loc, contract_amount? }] }, before = máy gốc lúc gửi (SPLIT_KEYS: khu vực, chuyền, máy cha, SL, giá trị, ghi chú).
     Không gộp (mergeOld chỉ Sửa + Sửa): tách mới khi đang có Sửa / Tách chờ → thay (cũ withdrawn, nhãn "Đã thay"); Sửa mới khi đang có Tách chờ cũng thay Tách.
     CR.checks[mod][kind](req, data) (index.html: splitLive) → { gone | block | resume | now, live }; CR.check thêm drift = khoá before ≠ hiện tại.
     Admin: diffHTML → splitHTML (máy gốc cũ → mới + từng máy mới, bản SẼ GHI trên máy hiện tại); block (hết tách được / giá trị không chia lại được) → chỉ Từ chối;
     drift → "Máy đã thay đổi từ lúc gửi: …" + ô tick, ✅ khoá tới khi tick; CR.approve(id, choices, { confirm }) chặn tương tự. Applier = mmSplitWrite dùng chung
     với admin tách thẳng; ID máy mới suy ra từ ID yêu cầu (splitIds) + mã tạm cấp lúc duyệt → duyệt lại sau lần ghi được không tạo trùng (resume: ghi tiếp phần thiếu).
   - 🧩 Sắp xếp (Danh mục, arrange.js): editor xếp vào NHÁP rồi 📨 Gửi duyệt → kind 'arrange', target_id null, payload = { company_id, items: [{ id, patch, name }] },
     before = { company_id, items: [{ id, v }] }. doSubmit gộp với yêu cầu Sắp xếp pending của mình cùng nhà máy (mergeArrange: theo máy + khoá, mới thắng,
     khoá / máy chỉ có ở cũ mang sang, trừ khi lần mới đã đổi vị trí máy đó — chuyền / khu vực / máy cha / vai trò đi theo nhóm; replaced.dropped [{ id, k, v }] / kept [{ id, k }]; rút cũ sau khi thêm được, chỉ các yêu cầu đã đọc). CR.checks.mmtb.arrange
     (AR.check) → { arrange, conflicts: [{ key 'm:<id>', id, name, drift }], missing, st, block? }; choices['m:<id>'] = 'theirs' (giữ hiện tại) | 'mine' (lấy đề xuất)
     bắt buộc cho mọi máy xung đột (detail + CR.approve). Applier AR.apply nhận { payload, before, check, choices }: bỏ qua máy đã xoá / đã đúng (idempotent), cha trước con,
     lỗi giữa chừng → { partial }. Xem trước: arrangeHTML (CR.arrangeHTML).
   - Migration 27: máy chủ chặn người không phải admin xoá mềm / khôi phục / xoá hẳn máy (2 bảng); index.html dbErrText → "Chỉ admin được xoá / khôi phục máy".
   Req = { id, created_at, module, kind, target_id, base_version, sec, status, requested_by, decided_by, decided_at, reject_note, applied_ids }.
   Cần: tr, escH, fmtDT, openM, mTitle/mSub/mBody, showNotice, dbErrText, quToast (index.html), CRYPTO, PERM, window.__sb,
   window.__dvHist / __mmHist (nhãn + trường được xem), showVal (Tiến độ). */
(function(){
  'use strict';
  let doneLoad;
  const CR = window.CR = { ready: false, missing: false, isLoaded: false, list: [], appliers: {}, onChange: [],
    getters: {}, sync: {}, derive: {}, checks: {}, busy: false,
    loaded: new Promise(r => { doneLoad = r; }),
    DERIVED: { delivery: new Set(['vekh', 'vedukienn', 'danhgia']), mmtb: new Set(['code_temp', 'legacy_code']) } };   // trường tự tính (mmtb: cờ mã tạm / mã cũ đi theo Mã máy): hiện trong cũ → mới, không coi là editor đổi / xung đột
  const DAYS = 30;
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const me = () => String(window.__userEmail || '').trim().toLowerCase();
  const isAdmin = () => window.__role === 'admin';
  const sb = () => window.__sb;
  const hasCrypto = () => typeof CRYPTO !== 'undefined' && CRYPTO.on;
  const KIND = () => ({ update: tr('Edit', 'Sửa'), insert: tr('Add machine', 'Thêm máy'), delete: tr('Delete machine', 'Xoá máy'),
    split: tr('Split machine', 'Tách máy'), arrange: tr('Arrange', 'Sắp xếp') });
  const STAT = () => ({ pending: tr('Pending', 'Chờ duyệt'), approved: tr('Approved', 'Đã duyệt'), rejected: tr('Rejected', 'Từ chối'), withdrawn: tr('Withdrawn', 'Đã rút'),
    merged: tr('Merged', 'Đã gộp'), replaced: tr('Replaced', 'Đã thay') });   // merged / replaced: chỉ là nhãn hiện (status trong DB vẫn withdrawn)
  const MOD = () => ({ delivery: tr('Delivery', 'Tiến độ'), mmtb: tr('Catalog', 'Danh mục') });

  /* bảng KHÔNG thiếu + không phải admin + có quyền ghi phân hệ. `act` chỉ để người gọi nêu ý định, KHÔNG dùng quyết định:
     quyền nút (vd chỉ 📋 Nhân bản, không ➕ Thêm) chỉ ẩn/hiện nút — không để "✕ Bỏ nguồn" đổi đường lưu thành ghi thẳng.
     Chưa tải xong vẫn trả true cho người ghi (đường lưu await CR.loaded trước khi gọi) — không lưu thẳng chỉ vì chưa dò xong. */
  CR.must = (mod, act) => {
    if(CR.missing || isAdmin() || typeof PERM === 'undefined') return false;
    if(window.__role === 'viewer') return false;
    return PERM.canWrite(mod);
  };

  /* lỗi nói rõ là bảng chưa có (chưa chạy 26) — chỉ trường hợp này mới tắt duyệt */
  const isMissing = e => !!e && (e.code === 'PGRST205' || e.code === '42P01' || e.status === 404 || String(e.code) === '404'
    || /does not exist|schema cache|not find/i.test(String(e.message || '')));
  /* dò bảng, tải yêu cầu, vẽ nút thanh trên */
  CR.init = async () => {
    try{
      if(!sb()) return;
      const { error } = await sb().from('change_requests').select('id').limit(1);
      if(error){ CR.missing = isMissing(error); CR.ready = false; if(!CR.missing) console.warn('[Chờ duyệt] chưa dò được bảng — vẫn bật duyệt', error); }
      else { CR.ready = true; await CR.load(); }
    }catch(e){ CR.ready = false; CR.missing = isMissing(e); console.warn('[Chờ duyệt]', e); }
    finally{ CR.isLoaded = true; doneLoad(); CR.paint(); fire(); }
  };

  /* của mình (RLS) hoặc tất cả nếu admin: mọi yêu cầu pending + mọi yêu cầu 30 ngày gần nhất. Mới nhất trước. */
  CR.load = async () => {
    if(!CR.ready || !sb()) { CR.list = []; return; }
    const since = new Date(Date.now() - DAYS * 864e5).toISOString();
    const [a, b] = await Promise.all([
      sb().from('change_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      sb().from('change_requests').select('*').gte('created_at', since).order('created_at', { ascending: false })
    ]);
    if(a.error) throw a.error;
    if(b.error) throw b.error;
    const m = new Map();
    [].concat(a.data || [], b.data || []).forEach(r => m.set(r.id, r));
    CR.list = [...m.values()].sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  };

  CR.pendingFor = (mod, targetId) => !targetId ? [] : CR.list.filter(r => r.status === 'pending' && r.module === mod && r.target_id === targetId);
  const minePending = (mod, targetId) => CR.pendingFor(mod, targetId).filter(r => String(r.requested_by || '').toLowerCase() === me());
  CR.badge = (mod, targetId) => CR.ready && CR.pendingFor(mod, targetId).length
    ? `<span class="cr-badge" title="${esc(tr('A change to this machine is waiting for admin approval', 'Có thay đổi của máy này đang chờ admin duyệt'))}">${esc(tr('⏳ Pending approval', '⏳ Chờ duyệt'))}</span>` : '';

  /* ---- mã hoá nội dung ---- */
  async function seal(o){ return hasCrypto() ? await CRYPTO.encObj(o) : 'plain:' + JSON.stringify(o); }
  const cache = new Map();
  CR.open = async req => {
    if(!req) return { payload: null, before: null, title: '' };
    if(cache.has(req.id)) return cache.get(req.id);
    let o;
    try{
      const s = String(req.sec || '');
      if(s.startsWith('plain:')) o = JSON.parse(s.slice(6));
      else if(hasCrypto()) o = await CRYPTO.decObj(s);
      else throw new Error('locked');
    }catch(e){ o = { payload: null, before: null, title: '', __locked: true }; }
    const out = { payload: o.payload == null ? null : o.payload, before: o.before == null ? null : o.before, title: o.title || '' };
    if(Array.isArray(o.replaced) && o.replaced.length) out.replaced = o.replaced;
    if(o.__locked) out.__locked = true;
    if(!out.__locked) cache.set(req.id, out);
    return out;
  };

  CR.withdraw = async id => {
    const { data, error } = await sb().from('change_requests').update({ status: 'withdrawn' }).eq('id', id).select('id');
    if(error) throw error;
    if(!data || !data.length) throw { code: 'conflict' };
    await refresh();
  };

  /* gửi: THÊM yêu cầu mới trước; chỉ khi thêm được mới rút các yêu cầu pending khác của mình cùng máy (.neq id mới)
     → gửi lỗi thì yêu cầu cũ vẫn pending. Bấm 2 lần cùng lúc (cùng phân hệ + loại + máy) → dùng chung 1 lần gửi. */
  const inflight = new Map();
  CR.submit = o => {
    const key = [o.module, o.kind, o.target_id || (o.kind === 'arrange' && o.payload && o.payload.company_id ? 'co:' + o.payload.company_id : 'new:' + (o.title || ''))].join('|');
    if(inflight.has(key)) return inflight.get(key);
    const pr = doSubmit(o).finally(() => inflight.delete(key));
    inflight.set(key, pr); return pr;
  };
  async function doSubmit({ module, kind, target_id = null, base_version = null, payload = null, before = null, title = '' }){
    if(CR.missing || !sb()) throw { message: tr('The approval queue is not available.', 'Chưa có hàng chờ duyệt.') };
    // gộp với yêu cầu pending cũ của mình cùng máy (Sửa + Sửa → gộp theo trường; khác → thay như cũ nhưng ghi lại trong replaced)
    let o = { payload, before, title }, merges = [], olds = [], readOk = false;
    // 🧩 Sắp xếp: không có target_id — gộp với yêu cầu Sắp xếp pending của mình CÙNG NHÀ MÁY (payload.company_id, đọc sau khi giải mã)
    const arr = kind === 'arrange' && !target_id && !!payload && !!payload.company_id;
    if((target_id || arr) && me()){
      try{
        let q = sb().from('change_requests').select('*').eq('status', 'pending').eq('module', module).eq('requested_by', me());
        q = target_id ? q.eq('target_id', target_id) : q.eq('kind', 'arrange').is('target_id', null);
        const { data: od, error: eo } = await q;
        if(eo) throw eo;
        olds = (od || []).sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));    // mới nhất trước: yêu cầu mới hơn thắng
        readOk = true;
      }catch(e){ console.warn('[Chờ duyệt] chưa đọc được yêu cầu cũ để gộp', e); }
      if(arr){
        const keep = [];       // không giải mã được / nhà máy khác → để nguyên pending (không rút)
        for(const r of olds){ let d = null; try{ d = await CR.open(r); }catch(e){}
          if(d && !d.__locked && d.payload && d.payload.company_id === payload.company_id) keep.push([r, d]); }
        olds = keep.map(x => x[0]);
        for(const [r, d] of keep){ const res = mergeArrange(o, r, d); o = res.o; if(res.info) merges.push(res.info); }
      }
      else for(const r of olds){
        let d = null; try{ d = await CR.open(r); }catch(e){}
        const res = mergeOld(module, kind, o, r, d || { __locked: true });
        o = res.o; if(res.info) merges.push(res.info);
      }
    }
    const sealed = { payload: o.payload, before: o.before, title: o.title };
    if(o.replaced && o.replaced.length) sealed.replaced = o.replaced;
    const sec = await seal(sealed);
    const { data, error } = await sb().from('change_requests')
      .insert({ module, kind, target_id: target_id || null, base_version: base_version == null ? null : base_version, sec }).select('*');
    if(error) throw error;
    const req = data && data[0];
    if(!req) throw { message: tr('The request was not saved.', 'Yêu cầu chưa được lưu.') };
    cache.set(req.id, sealed);
    try{ const t = arr ? arrangeMergeNote(sealed, merges) : mergeNote(module, sealed, merges); if(t) req.mergeNote = t; }catch(e){ console.warn('[Chờ duyệt]', e); }
    // tối đa 1 pending của mình cho mỗi máy: rút các yêu cầu cũ (lỗi ở bước này không làm hỏng yêu cầu vừa gửi).
    // CHỈ rút các yêu cầu đã đọc + gộp / ghi vào replaced ở trên: đọc lỗi, hoặc có yêu cầu mới chen vào sau lúc đọc (tab khác) → để nguyên
    // pending (lần gửi sau sẽ gộp) thay vì rút mất mà không ai biết
    if((target_id || arr) && me() && readOk && olds.length){
      try{
        for(const r of olds){
          const { error: e1 } = await sb().from('change_requests').update({ status: 'withdrawn' }).eq('id', r.id).eq('status', 'pending').select('id');
          if(e1) throw e1;
        }
      }catch(e){ console.warn('[Chờ duyệt] chưa rút được yêu cầu cũ', e); }
    }
    CR.ready = true;
    await refresh();
    return req;
  }

  /* ---- so khác biệt: chỉ trường được XEM (dS / mS), nhãn như 🕘 Lịch sử ---- */
  const nz = v => (v === '' || v === undefined) ? null : v;
  const same = (a, b) => {
    a = nz(a); b = nz(b);
    if(a != null && b != null && typeof a !== typeof b && !isNaN(Number(a)) && !isNaN(Number(b)) && String(a).trim() !== '' && String(b).trim() !== '') return Number(a) === Number(b);
    return JSON.stringify(a) === JSON.stringify(b);
  };
  function spec(mod, before, payload){
    if(mod === 'mmtb' && window.__mmHist){
      const H = window.__mmHist;
      return { keys: H.keys([{ old_data: before || {}, new_data: payload || {} }]), lbl: k => H.lbl(k), val: (k, v) => H.val(k, v) };
    }
    const H = window.__dvHist, see = k => typeof PERM !== 'undefined' && PERM.see('delivery', k);
    const keys = (H ? H.keys() : []).concat(['thuong_hieu', 'gia_tien_te'].filter(see));
    const L = (typeof LANG !== 'undefined' && LANG === 'vi') ? (typeof REC_LABEL !== 'undefined' ? REC_LABEL : {}) : (typeof REC_LABEL_EN !== 'undefined' ? REC_LABEL_EN : {});
    const lbl = k => esc(k === 'gia_tien_te' ? tr('Quote currency', 'Loại tiền báo giá') : (L[k] || k));
    const val = (k, v) => typeof showVal === 'function' ? showVal(k, v) : (v == null || v === '' ? tr('(empty)', '(trống)') : String(v));
    return { keys: [...new Set(keys)], lbl, val };
  }
  /* Danh mục: { row, ms } → 1 tầng: trường máy + 'ms.<mốc>' (nhãn / chữ hiện của 'ms.*' do window.__mmHist lo) */
  CR.flat = (mod, o) => mod !== 'mmtb' || !o || typeof o !== 'object' || !('row' in o || 'ms' in o) ? o
    : Object.assign({}, o.row || {}, ...Object.keys(o.ms || {}).map(k => ({ ['ms.' + k]: o.ms[k] })));
  /* {k, o, n} = khoá + giá trị cũ / mới; kèm l (nhãn, HTML đã thoát), ot / nt (chữ hiện), derived (trường tự tính từ các ngày) */
  CR.diffRows = (mod, before, payload) => {
    before = CR.flat(mod, before); payload = CR.flat(mod, payload);
    const S = spec(mod, before, payload), b = before || {}, p = payload || {};
    const der = CR.DERIVED[mod] || new Set();
    const blank = v => nz(v) == null || v === 0 || v === false || (Array.isArray(v) && !v.length);     // Thêm: bỏ trường trống / 0 / không / []
    const keepDer = before && !edInputs(mod, b, p);      // 1B: editor không đổi ô ngày nào → trường tự tính giữ nguyên, không hiện
    return S.keys.filter(k => (k in p) && !(keepDer && der.has(k)) && (before ? !same(b[k], p[k]) : !blank(p[k])))
      .map(k => ({ k, o: before ? (b[k] === undefined ? null : b[k]) : null, n: p[k], l: S.lbl(k), ot: before ? S.val(k, b[k]) : '', nt: S.val(k, p[k]),
        derived: der.has(k) }));
  };
  /* ✂️ Tách (Danh mục): payload = plan của popup { hasAmt, currency, vals, orig: { area_id, line_id, loc, quantity, contract_amount? }, news: [...] },
     before = máy gốc lúc gửi (khoá SPLIT_KEYS). live (chỉ admin, CR.checks) = { now, live } → hiện đúng bản SẼ GHI trên máy gốc hiện tại.
     "Máy gốc: Số lượng 2 → 1 · Khu vực A → B · Vị trí: …" + "Máy mới 1: Khu vực C · Chuyền … · Vị trí … · Giá trị …"; chỉ trường được XEM; nhãn / chữ như 🕘 Lịch sử. */
  function splitHTML(d, live){
    const p = (live && live.live) || d.payload || {}, b = (live && live.now) || d.before || {}, o = p.orig || {}, news = Array.isArray(p.news) ? p.news : [];
    const H = window.__mmHist;
    const see = k => !H || H.keys([{ old_data: { [k]: 1 }, new_data: {} }]).includes(k);
    const L = k => H ? H.lbl(k) : esc(k);
    const V = (k, v) => k === 'contract_amount' && v != null && v !== '' && !isNaN(Number(v))
      ? Number(v).toLocaleString(typeof NUMLOC !== 'undefined' ? NUMLOC : 'vi-VN') + (p.currency ? ' ' + p.currency : '') : H ? H.val(k, v) : String(v == null ? '' : v);
    const LOC = esc(tr('Location', 'Vị trí')), amt = p.hasAmt && see('contract_amount');
    const KS = ['quantity', 'area_id', 'line_id'].filter(see).concat(amt ? ['contract_amount'] : []);
    const op = KS.filter(k => k in o && !same(b[k], o[k])).map(k => `${L(k)}: <s>${esc(V(k, b[k]))}</s> → <ins>${esc(V(k, o[k]))}</ins>`);
    if(String(o.loc || '').trim() && see('notes')) op.push(`${LOC}: <ins>${esc(String(o.loc).trim())}</ins>`);
    const nl = news.map((n, i) => `<div class="cr-sp-new">✂️ <b>${esc(tr(`New machine ${i + 1}`, `Máy mới ${i + 1}`))}</b>: ` + [
        ...['area_id', 'line_id'].filter(see).map(k => `${L(k)} ${esc(V(k, n[k]))}`),
        String(n.loc || '').trim() && see('notes') ? `${LOC} ${esc(String(n.loc).trim())}` : '',
        amt ? `${L('contract_amount')} ${esc(V('contract_amount', n.contract_amount))}` : ''].filter(Boolean).join(' · ')
      + ` <small>${esc(tr('(quantity 1, new temporary code given on approval)', '(số lượng 1, mã tạm mới cấp lúc duyệt)'))}</small></div>`).join('');
    return `<div class="hx-ch cr-sp"><div class="cr-note">✂️ ${esc(tr(`Split into ${news.length + 1} machines`, `Tách thành ${news.length + 1} máy`))}</div>`
      + `<div class="cr-sp-orig"><b>${esc(tr('Original', 'Máy gốc'))}</b>: ${op.length ? op.join(' · ') : esc(tr('(no visible change)', '(không đổi trường bạn được xem)'))}</div>${nl}</div>`;
  }
  /* 🧩 Sắp xếp (Danh mục): payload = { company_id, items: [{ id, patch, name }] }, before = { company_id, items: [{ id, v }] } (v = giá trị lúc gửi
     của các khoá trong patch). Mỗi máy 1 dòng "<tên · mã>: Chuyền A → B · Máy cha — → Y · Vai trò … · Thứ tự 3 → 1"; quá 10 máy → gập "+N máy".
     live (admin, CR.checks) = { st: { id: gone | done | conflict | todo } } → thêm nhãn từng máy. Nhãn / chữ như 🕘 Lịch sử, chỉ trường được XEM. */
  const ARK = ['line_id', 'parent_machine_id', 'role', 'sort_order', 'area_id'];
  const ARS = ['line_id', 'area_id', 'parent_machine_id', 'role'];      // = POS của arrange.js
  function arrFmt(){
    const H = window.__mmHist;
    const see = k => !H || H.keys([{ old_data: { [k]: 1 }, new_data: {} }]).includes(k);
    const lbl = k => k === 'sort_order' ? esc(tr('Order', 'Thứ tự')) : H ? H.lbl(k) : esc(k);
    const ROLE = { main: tr('Main machine', 'Máy chính'), auxiliary: tr('Auxiliary machine', 'Máy phụ'), sub_unit: tr('Sub-unit', 'Máy con') };
    const val = (k, v) => v == null || v === '' ? (k === 'line_id' ? tr('Unassigned', 'Chưa xếp') : '—')
      : k === 'role' ? (ROLE[v] || String(v)) : k === 'sort_order' ? String(Number(v)) : H ? String(H.val(k, v)) : String(v);
    return { see, lbl, val };
  }
  function arrangeHTML(d, live){
    const p = d.payload || {}, items = Array.isArray(p.items) ? p.items.filter(it => it && it.id && it.patch) : [], F = arrFmt();
    const bv = new Map((((d.before || {}).items) || []).filter(Boolean).map(b => [b.id, b.v || {}]));
    const st = (live && live.st) || {};
    const TAG = { gone: '🗑 ' + tr('deleted — skipped', 'đã xoá — bỏ qua'), done: '✓ ' + tr('already in place', 'đã đúng vị trí'), conflict: '⚠ ' + tr('moved by someone else', 'đã bị người khác xếp lại') };
    const rows = items.map(it => {
      const v = bv.get(it.id) || {};
      const ch = ARK.filter(k => k in it.patch && F.see(k)).map(k => `${F.lbl(k)} <s>${esc(F.val(k, v[k]))}</s> → <ins>${esc(F.val(k, it.patch[k]))}</ins>`);
      const tag = st[it.id] && TAG[st[it.id]] ? ` <small class="cr-ar-st" data-st="${esc(st[it.id])}">${esc(TAG[st[it.id]])}</small>` : '';
      return `<div class="cr-ar-it" data-id="${esc(it.id)}"><b>${esc(it.name || F.val('parent_machine_id', it.id))}</b>: `
        + (ch.length ? ch.join(' · ') : esc(tr('(no visible change)', '(không đổi trường bạn được xem)'))) + tag + `</div>`;
    });
    const more = rows.length > 10 ? `<details class="cr-ar-more"><summary>${esc(tr(`+${rows.length - 10} more machine(s)`, `+${rows.length - 10} máy`))}</summary>${rows.slice(10).join('')}</details>` : '';
    return `<div class="hx-ch cr-ar"><div class="cr-note">🧩 ${esc(tr(`Arrange ${rows.length} machine(s)`, `Sắp xếp ${rows.length} máy`))}</div>${rows.slice(0, 10).join('')}${more}</div>`;
  }
  CR.arrangeHTML = arrangeHTML;     // test / dùng lại
  const diffHTML = (req, d, live) => {
    if(d.__locked) return `<div class="al-lock">${esc(tr('(could not decrypt)', '(không giải mã được)'))}</div>`;
    if(req.kind === 'delete') return `<div class="cr-note">🗑 ${esc(tr('Move this machine to the trash (an admin can restore it).', 'Chuyển máy này vào thùng rác (admin khôi phục được).'))}</div>`;
    if(req.kind === 'split') return splitHTML(d, live);
    if(req.kind === 'arrange') return arrangeHTML(d, live);
    const rows = CR.diffRows(req.module, req.kind === 'insert' ? null : d.before, d.payload);
    if(!rows.length) return `<div class="al-none">${esc(tr('No visible field changes.', 'Không có trường nào (bạn được xem) thay đổi.'))}</div>`;
    return `<div class="hx-ch">${rows.map(r => req.kind === 'insert' ? `<div>${r.l}: <ins>${esc(r.nt)}</ins></div>`
      : `<div${r.derived ? ' class="cr-der"' : ''}>${r.l}: <s>${esc(r.ot)}</s> → <ins>${esc(r.nt)}</ins>${r.derived ? ` <small>${esc(tr('(calculated)', '(tự tính)'))}</small>` : ''}</div>`).join('')}</div>`;
  };

  /* ---- nút thanh trên + popup "Yêu cầu của tôi" (editor). Admin: Task 4 (📝 Chờ duyệt). ---- */
  CR.paint = () => {
    const b = document.getElementById('btnReq'); if(!b) return;
    if(isAdmin()){      // admin: "📝 N" yêu cầu chờ duyệt, ẩn khi N = 0
      const n = CR.ready ? CR.list.filter(r => r.status === 'pending').length : 0;
      b.hidden = !n;
      if(!n) return;
      const t = '📝 ' + n;
      if(b.textContent.replace(/\s+/g, ' ').trim() !== t) b.textContent = t;
      b.title = tr(`Pending approval (${n})`, `Chờ duyệt (${n})`);
      b.onclick = () => CR.openReview();
      return;
    }
    const show = CR.ready && window.__role !== 'viewer' && CR.list.length > 0;
    b.hidden = !show;
    if(!show) return;
    const n = CR.list.filter(r => r.status === 'pending').length;
    const t = '📨 ' + n;
    if(b.textContent.replace(/\s+/g, ' ').trim() !== t) b.textContent = t;
    b.title = tr(`My requests (${n} pending)`, `Yêu cầu của tôi (${n} chờ duyệt)`);
    b.onclick = () => CR.openMine();
  };
  function fire(){
    try{ if(window.__dRender) window.__dRender(); }catch(e){}
    CR.onChange.forEach(f => { try{ f(); }catch(e){} });
  }
  async function refresh(){
    try{ await CR.load(); }catch(e){ console.warn('[Chờ duyệt] chưa tải lại được', e); }
    CR.paint(); fire();
  }

  /* "Yêu cầu của tôi": người duyệt / từ chối hiện "Admin" thay vì email (user 2026-11-25); tự rút = "Bạn". 📜 Nhật ký (chỉ admin) vẫn ghi email. */
  const decider = r => String(r.decided_by || '').toLowerCase() === me() ? tr('You', 'Bạn') : 'Admin';
  /* yêu cầu đã gộp / thay các lần gửi trước: "Đã thay N lần gửi trước" + giá trị cũ bị bỏ (nhãn: giá trị) */
  const replacedHTML = (r, d) => {
    const rp = d && Array.isArray(d.replaced) ? d.replaced : []; if(!rp.length) return '';
    const S = spec(r.module, CR.flat(r.module, d.before), CR.flat(r.module, d.payload)), lb = k => S.lbl(k) || esc(k);
    const F = r.kind === 'arrange' ? arrFmt() : null, its = F && d.payload && Array.isArray(d.payload.items) ? d.payload.items : [];
    const nm = id => { const it = its.find(i => i && i.id === id); return it && it.name ? it.name : F.val('parent_machine_id', id); };
    const drop = [].concat(...rp.map(x => Array.isArray(x.dropped) ? x.dropped : [])).map(x => F ? `${esc(nm(x.id))} — ${F.lbl(x.k)}: ${esc(F.val(x.k, x.v))}`
      : `${lb(x.k)}: ${esc(S.val(x.k, x.v))}`);
    return `<div class="cr-merged-note">🔀 ${esc(tr(`Replaced ${rp.length} earlier submission${rp.length > 1 ? 's' : ''}`, `Đã thay ${rp.length} lần gửi trước`))}`
      + (drop.length ? `<br><small>${esc(tr('Dropped old values', 'Giá trị cũ đã bỏ'))}: ${drop.join(' · ')}</small>` : '') + `</div>`;
  };
  /* id yêu cầu cũ → 'merged' (đã gộp vào yêu cầu khác) | 'replaced' (bị yêu cầu khác loại thay), tính từ các yêu cầu đã tải */
  const replacedMap = ds => { const m = new Map();
    ds.forEach(d => (d && Array.isArray(d.replaced) ? d.replaced : []).forEach(x => { if(x && x.id) m.set(x.id, x.kind ? 'replaced' : 'merged'); }));
    return m; };
  const rowHTML = (r, d, open, rep) => {
    const mine = String(r.requested_by || '').toLowerCase() === me();
    const st = r.status === 'withdrawn' && rep && rep.has(r.id) ? rep.get(r.id) : r.status;
    return `<details class="al-row cr-row" data-id="${esc(r.id)}" data-s="${esc(r.status)}" data-t="${esc(r.target_id || '')}" data-m="${esc(r.module)}"${open ? ' open' : ''}>
      <summary><span class="al-at">${esc(fmtDT(r.created_at))}</span><span class="al-act">${esc(KIND()[r.kind] || r.kind)}</span>`
      + `<span class="al-t">${esc(d.title || (d.__locked ? tr('(could not decrypt)', '(không giải mã được)') : tr('(no name)', '(không tên)')))}</span>`
      + `<span class="cr-st" data-s="${esc(st)}">${esc(STAT()[st] || st)}</span><span class="al-mod">${esc(MOD()[r.module] || r.module)}</span></summary>
      <div class="al-body">${st === 'rejected' && r.reject_note ? `<div class="cr-why">${esc(tr('Reason', 'Lý do'))}: ${esc(r.reject_note)}</div>` : ''}${replacedHTML(r, d)}${diffHTML(r, d)}`
      + (r.decided_at && st !== 'pending' ? `<div class="cr-meta">${esc(STAT()[st] || st)} · ${esc(decider(r))} · ${esc(fmtDT(r.decided_at))}</div>` : '')
      + (st === 'pending' && mine ? `<div class="cr-acts"><button type="button" class="nbtn2 ghost cr-wd">${esc(tr('↩ Withdraw', '↩ Rút lại'))}</button></div>` : '')
      + `</div></details>`;
  };
  /* focusId: mở sẵn 1 yêu cầu (nút ⏳ Xem yêu cầu trong chi tiết máy) */
  CR.openMine = async focusId => {
    if(CR.missing) return;
    mTitle.textContent = tr('📨 My requests', '📨 Yêu cầu của tôi');
    mSub.textContent = tr(`Changes you sent for admin approval — pending ones plus the last ${DAYS} days, newest first.`,
                          `Thay đổi bạn đã gửi chờ admin duyệt — mọi yêu cầu đang chờ và ${DAYS} ngày gần nhất, mới nhất ở trên.`);
    mBody.innerHTML = `<div class="al-wrap"><div class="al-list" id="crList">${window.MO ? MO.skel(4) : esc(tr('Loading…', 'Đang tải…'))}</div></div>`;
    openM(1);
    try{ await CR.load(); }catch(e){ console.warn('[Chờ duyệt]', e); }
    CR.paint();
    const list = CR.list.filter(r => isAdmin() || String(r.requested_by || '').toLowerCase() === me());
    const ds = await Promise.all(list.map(r => CR.open(r)));
    const host = document.getElementById('crList'); if(!host) return;
    const rep = replacedMap(ds);
    host.innerHTML = list.length ? list.map((r, i) => rowHTML(r, ds[i], r.id === focusId, rep)).join('')
      : `<div class="al-none">${esc(tr('No requests yet.', 'Chưa có yêu cầu nào.'))}</div>`;
    host.querySelectorAll('.cr-wd').forEach(btn => btn.onclick = async e => {
      e.preventDefault();
      const id = btn.closest('.cr-row').dataset.id; btn.disabled = true;
      try{ await CR.withdraw(id); quToast('↩ ' + esc(tr('Request withdrawn', 'Đã rút yêu cầu'))); await CR.openMine(); }
      catch(err){ btn.disabled = false; showNotice({ type: 'error', title: tr('Could not withdraw', 'Chưa rút được'), sub: dbErrText(err) }); }
    });
    const f = focusId && host.querySelector(`.cr-row[data-id="${focusId}"]`);
    if(f) f.scrollIntoView({ block: 'nearest' });
  };
  /* chi tiết máy: mở yêu cầu pending của mình cho máy này */
  CR.mine = (mod, targetId) => minePending(mod, targetId);
  CR.view = (mod, targetId) => { const r = minePending(mod, targetId)[0]; return CR.openMine(r && r.id); };

  /* ================= ADMIN: 📝 Chờ duyệt (Task 4) ================= */
  /* Quy tắc "soft" (Tiến độ): form Sửa hiện ô TG đi tàu / lãnh máy TT = 0 thành ô TRỐNG, và calcDates lấy KH cho ô trống → lúc lưu form
     gửi ditautt = ditaukh (lanhtt = lanhkh) dù editor không gõ gì. Nên: before = 0 / trống VÀ payload = KH của chính payload
     → coi là tự lấy theo KH (như DERIVED), không phải editor đổi, không tính xung đột; bản gộp giữ giá trị hiện tại.
     (Editor cố tình gõ TT = KH khi TT đang trống cũng cho cùng kết quả tính ngày nên bỏ qua là vô hại.) */
  const SOFT = { delivery: { ditautt: 'ditaukh', lanhtt: 'lanhkh' } };
  /* đầu vào của trường tự tính: người khác đổi 1 trong các khoá này (hoặc chính trường tự tính) sau lúc gửi → tính lại từ bản đã gộp */
  const INPUTS = { delivery: ['dathang', 'xuatxuong', 'ctu', 'sonagyctm', 'ditaukh', 'ditautt', 'lanhkh', 'lanhtt', 'workingday'], mmtb: ['machine_code'] };
  const isSoft = (mod, k, b, p) => { const kh = (SOFT[mod] || {})[k]; return !!kh && !(Number(nz(b[k])) || 0) && same(p[k], p[kh]); };
  /* editor có thật sự đổi ô ngày (đầu vào của trường tự tính) không — 1B (user chọn 2026-11-25): không đổi thì khi duyệt GIỮ NGUYÊN
     các trường tự tính đang có (không ghi lại theo công thức như form Sửa), và không hiện chúng trong cũ → mới */
  const edInputs = (mod, b, p) => (INPUTS[mod] || []).some(k => (k in p) && !same(p[k], b[k]) && !isSoft(mod, k, b, p));
  /* gửi lại khi đã có yêu cầu pending của mình cùng máy (doSubmit). o = { payload, before, title, replaced? } của lần gửi mới (có thể đã gộp
     với yêu cầu mới hơn), r / d = yêu cầu cũ + nội dung giải mã. Sửa + Sửa → gộp theo trường: khoá cũ đổi mà mới không đổi → lấy giá trị cũ
     (payload + before của yêu cầu cũ); cả 2 đổi → mới thắng (cũ vào dropped). Khác (có Xoá, không giải mã được…) → thay như cũ, chỉ ghi replaced.
     Trường tự tính: mang ô ngày cũ sang mà lần mới không đổi ô ngày nào → lấy luôn trường tự tính của yêu cầu cũ; cả 2 đổi ô ngày khác nhau
     → tính lại (CR.derive) từ bản đã gộp. Ô TT "soft" (đi theo KH) vẫn đi theo KH của bản gộp. Trả { o, info } (info = cho thông báo, null khi không gộp). */
  function mergeOld(mod, kind, o, r, d){
    const prev = Array.isArray(d.replaced) ? d.replaced : [], later = Array.isArray(o.replaced) ? o.replaced : [];
    const base = { id: r.id, at: r.created_at };
    if(kind !== 'update' || r.kind !== 'update' || d.__locked || !d.payload || !o.payload)
      return { o: Object.assign({}, o, { replaced: prev.concat([Object.assign(base, { kind: r.kind, dropped: [], kept: [], replacedBy: kind })], later) }), info: null };
    const F = x => Object.assign({}, CR.flat(mod, x) || {}), U = v => v === undefined ? null : v;
    const op = F(d.payload), ob = F(d.before), np0 = F(o.payload), nb0 = F(o.before), np = F(o.payload), nb = F(o.before);
    const der = CR.DERIVED[mod] || new Set();
    const chg = (b, p) => Object.keys(p).filter(k => !der.has(k) && !same(p[k], b[k]) && !isSoft(mod, k, b, p));
    const oc = chg(ob, op), nc = new Set(chg(nb0, np0));
    const kept = oc.filter(k => !nc.has(k));
    const dropped = oc.filter(k => nc.has(k) && !same(op[k], np0[k])).map(k => ({ k, v: U(op[k]) }));
    kept.forEach(k => { np[k] = U(op[k]); nb[k] = U(ob[k]); });
    // ô TT "soft" đi theo KH của bản gộp (trước khi tính lại trường tự tính). Chỉ khi TT HIỆN TẠI (before lần mới) còn trống / 0:
    // TT đã có giá trị thật (vd admin ⚡ sau lần gửi cũ) thì giữ — không lấy KH đè lên dù lần cũ là soft
    Object.entries(SOFT[mod] || {}).forEach(([k, kh]) => {
      if((k in np) && (kh in np) && !kept.includes(k) && !nc.has(k) && isSoft(mod, k, nb0, np0)) np[k] = np[kh];
    });
    if(kept.some(k => (INPUTS[mod] || []).includes(k))){
      if(!edInputs(mod, nb0, np0)) der.forEach(k => { if(k in op) np[k] = op[k]; if(k in ob) nb[k] = ob[k]; });
      else if(CR.derive[mod]){
        try{ const dd = CR.derive[mod](np, nb, nb) || {}; Object.keys(dd).forEach(k => { if(der.has(k)) np[k] = dd[k]; }); }
        catch(e){ console.warn('[Chờ duyệt] chưa tính lại được trường tự tính khi gộp', e); }
      }
    }
    const un = x => { if(mod !== 'mmtb') return x; const row = {}, ms = {};
      Object.keys(x).forEach(k => { if(k.startsWith('ms.')) ms[k.slice(3)] = x[k]; else row[k] = x[k]; }); return { row, ms }; };
    return { o: { payload: un(np), before: un(nb), title: o.title,
                  replaced: prev.concat([Object.assign(base, { dropped, kept })], later) },
             info: { dropped, kept } };
  }
  /* thông báo cho editor sau khi gửi đã gộp: "Đã gộp với yêu cầu trước — Công suất: bỏ 200, lấy 250" / "— giữ: Tên, …" (tối đa 3 trường, rồi +N) */
  function mergeNote(mod, s, merges){
    if(!merges.length) return '';
    const p = CR.flat(mod, s.payload) || {}, S = spec(mod, CR.flat(mod, s.before), p), lb = k => S.lbl(k) || esc(k);
    const seen = new Set(), drop = [], keep = [];
    merges.forEach(m => m.dropped.forEach(x => { if(!seen.has(x.k)){ seen.add(x.k); drop.push(x); } }));
    merges.forEach(m => m.kept.forEach(k => { if(!seen.has(k)){ seen.add(k); keep.push(k); } }));
    const cut = a => a.slice(0, 3).join('; ') + (a.length > 3 ? ` +${a.length - 3}` : '');
    const head = esc(tr('Merged with your previous request', 'Đã gộp với yêu cầu trước'));
    if(drop.length) return head + ' — ' + cut(drop.map(x => `${lb(x.k)}: ${esc(tr('dropped', 'bỏ'))} ${esc(S.val(x.k, x.v))}, ${esc(tr('using', 'lấy'))} ${esc(S.val(x.k, p[x.k]))}`));
    if(keep.length) return head + ' — ' + esc(tr('kept', 'giữ')) + ': ' + cut(keep.map(lb)).replace(/; /g, ', ');
    return head;
  }
  /* 🧩 Sắp xếp gửi lại khi đang có yêu cầu Sắp xếp pending của mình cùng nhà máy: gộp THEO MÁY + KHOÁ — khoá có ở cả 2 → lần mới thắng
     (cũ vào dropped [{ id, k, v }] nếu khác); khoá / máy chỉ có ở cũ → mang sang cùng before cũ (kept [{ id, k }]).
     Riêng vị trí (ARS: chuyền / khu vực / máy cha / vai trò) đi theo NHÓM: lần mới đã đổi vị trí máy nào thì mọi khoá cũ của máy đó vào dropped
     (lần mới xếp trên dòng thật → không ghép chuyền mới với máy cha cũ, không ra role 'main' còn máy cha — vi phạm check DB). */
  function mergeArrange(o, r, d){
    const prev = Array.isArray(d.replaced) ? d.replaced : [], later = Array.isArray(o.replaced) ? o.replaced : [];
    const base = { id: r.id, at: r.created_at };
    const cp = x => JSON.parse(JSON.stringify(x == null ? null : x));
    const np = cp(o.payload) || {}, nb = cp(o.before) || {};
    np.items = Array.isArray(np.items) ? np.items : []; nb.items = Array.isArray(nb.items) ? nb.items : [];
    if(nb.company_id == null) nb.company_id = np.company_id;
    const ni = new Map(np.items.map(it => [it.id, it])), nbi = new Map(nb.items.map(b => [b.id, b]));
    const obi = new Map((((d.before || {}).items) || []).filter(Boolean).map(b => [b.id, b.v || {}]));
    const dropped = [], kept = [];
    ((d.payload || {}).items || []).forEach(oit => {
      if(!oit || !oit.id || !oit.patch) return;
      const ov = obi.get(oit.id) || {};
      let it = ni.get(oit.id), b = nbi.get(oit.id);
      if(!it){ it = { id: oit.id, patch: {}, name: oit.name }; np.items.push(it); ni.set(it.id, it); }
      if(!b){ b = { id: oit.id, v: {} }; nb.items.push(b); nbi.set(b.id, b); }
      if(!b.v) b.v = {};
      const pos = Object.keys(it.patch).some(k => ARS.includes(k));      // lần mới (đã gộp các lần mới hơn) đã đặt lại vị trí máy này
      Object.keys(oit.patch).forEach(k => {
        if(k in it.patch || pos){ if(!(k in it.patch) || !same(it.patch[k], oit.patch[k])) dropped.push({ id: oit.id, k, v: oit.patch[k] === undefined ? null : oit.patch[k] }); }
        else { it.patch[k] = oit.patch[k]; b.v[k] = k in ov ? ov[k] : null; kept.push({ id: oit.id, k }); }
      });
      if(!pos) Object.keys(ov).forEach(k => { if(!(k in b.v)) b.v[k] = ov[k]; });   // before cũ của cả nhóm vị trí đi cùng
    });
    return { o: { payload: np, before: nb, title: o.title, replaced: prev.concat([Object.assign(base, { dropped, kept })], later) },
             info: { dropped, kept, total: np.items.length } };
  }
  function arrangeMergeNote(s, merges){
    if(!merges.length) return '';
    const total = ((s.payload || {}).items || []).length;
    const kept = [].concat(...merges.map(m => m.kept)), drop = [].concat(...merges.map(m => m.dropped));
    const km = new Set(kept.map(x => x.id)).size;
    const parts = [km ? tr(`kept ${kept.length} earlier change(s) on ${km} machine(s)`, `giữ ${kept.length} thay đổi cũ của ${km} máy`) : '',
      drop.length ? tr(`replaced ${drop.length} older value(s)`, `thay ${drop.length} giá trị cũ`) : ''].filter(Boolean);
    return esc(tr(`Merged with your previous arrange request — ${total} machine(s) in total`, `Đã gộp với yêu cầu sắp xếp trước — tổng ${total} máy`) + (parts.length ? ': ' + parts.join(', ') : ''));
  }
  const curRow = cur =>cur && typeof cur === 'object' && 'version' in cur && 'row' in cur ? cur.row : cur;
  CR.current = (mod, targetId) => { const g = CR.getters[mod]; return g && targetId ? g(targetId) : null; };

  CR.plan = (req, data, cur) => {
    const mod = req.module, kind = req.kind, c0 = curRow(cur);
    const gone = kind !== 'insert' && !c0;
    const stale = !!cur && cur.version != null && req.base_version != null && cur.version !== req.base_version;
    if(kind === 'arrange') return { changed: [], conflicts: [], gone: false, stale: false };      // Sắp xếp: nhiều máy, không target_id — kiểm riêng (CR.check)
    if(kind === 'delete' || kind === 'split' || !data || !data.payload) return { changed: [], conflicts: [], gone, stale };   // Tách: kiểm riêng (CR.check)
    const p = CR.flat(mod, data.payload) || {}, b = CR.flat(mod, data.before) || {}, c = CR.flat(mod, c0) || {};
    const der = CR.DERIVED[mod] || new Set();
    const changed = Object.keys(p).filter(k => !der.has(k) && (kind === 'insert' || (!same(p[k], b[k]) && !isSoft(mod, k, b, p))));
    const conflicts = kind === 'insert' || gone ? [] : changed.filter(k => !same(c[k], b[k]) && !same(c[k], p[k]));
    return { changed, conflicts, gone, stale };
  };

  /* bản ghi gửi cho applier: hiện tại + khoá editor đổi (xung đột theo choices), trường tự tính theo quy tắc ở đầu file */
  CR.merge = (req, data, cur, pl, choices = {}) => {
    const mod = req.module;
    if(req.kind === 'insert') return data.payload;
    const p = CR.flat(mod, data.payload) || {}, b = CR.flat(mod, data.before) || {}, c0 = curRow(cur), c = CR.flat(mod, c0) || {};
    const base = (cur && cur.base) || [];
    const der = CR.DERIVED[mod] || new Set();
    const keys = [...new Set(base.concat(Object.keys(p)))];
    const out = {};
    keys.forEach(k => {
      if(pl.changed.includes(k)) out[k] = pl.conflicts.includes(k) && choices[k] === 'theirs' ? c[k] : p[k];
      else out[k] = k in c ? c[k] : p[k];
    });
    const moved = (INPUTS[mod] || []).concat([...der]).some(k => k in b && !same(c[k], b[k]));
    if(!moved){                 // 1B: editor không đổi ô ngày → giữ trường tự tính hiện tại; có đổi → dùng giá trị editor
      const ed = edInputs(mod, b, p);
      der.forEach(k => { if(k in p) out[k] = ed || !(k in c) ? p[k] : c[k]; });
    }
    else if(CR.derive[mod]){
      const d = CR.derive[mod](out, c, b) || {};
      Object.keys(d).forEach(k => { if(der.has(k)) out[k] = d[k]; });
    }
    if(mod !== 'mmtb') return out;
    const row = {}, ms = {};      // dựng lại {row, ms}
    Object.keys(out).forEach(k => { if(k.startsWith('ms.')) ms[k.slice(3)] = out[k]; else row[k] = out[k]; });
    return { row, ms };
  };

  const byIdReq = id => CR.list.find(r => r.id === id);
  async function syncTarget(req){
    const s = CR.sync[req.module];
    if(s) await s(req.kind === 'insert' ? null : req.target_id);
  }
  async function redrawAll(){
    await refresh();
    try{ if(typeof quAfterSave === 'function') quAfterSave(); }catch(e){ console.warn('[Chờ duyệt]', e); }
    try{ if(window.__mmReload) await window.__mmReload(); }catch(e){ console.warn('[Chờ duyệt]', e); }
  }
  /* kiểm riêng theo loại (CR.checks[mod][kind], đăng ký trong index.html — hiện chỉ ✂️ Tách Danh mục) → { gone?, block?, resume?, done?, total?, now?, live? }
     + drift = các khoá của before mà máy HIỆN TẠI (now) khác lúc gửi: [{ k, l, ot, nt }] (bỏ qua khi resume có máy mới đã tạo: lần duyệt trước đã ghi một phần).
     Không có hàm kiểm → {} (Sửa / Thêm / Xoá như cũ). */
  CR.check = async (req, data) => {
    const f = (CR.checks[req.module] || {})[req.kind];
    if(!f || !data || data.__locked) return { drift: [] };
    const ck = Object.assign({}, await f(req, data));
    const b = data.before || {}, now = ck.now || {}, S = spec(req.module, b, now);
    // resume chắc chắn (đã có máy mới mang ID suy ra) → bỏ drift (do chính lần duyệt trước ghi). Resume chỉ vì máy gốc "trông như" đã ghi
    // (done = 0) không chắc → vẫn hiện drift + bắt tick xác nhận
    ck.drift = ck.gone || (ck.resume && ck.done > 0) || !ck.now ? [] : Object.keys(b).filter(k => !same(b[k], now[k]))
      .map(k => ({ k, l: S.lbl(k) || esc(k), ot: S.val(k, b[k]), nt: S.val(k, now[k]) }));
    return ck;
  };
  /* trả về { ids, note } (note = ghi chú của applier cho admin, chữ thường — phải thoát khi hiện).
     opts.confirm = admin đã tick "vẫn duyệt" khi máy đổi sau lúc gửi (CR.check → drift, hiện chỉ ✂️ Tách) */
  CR.approve = async (id, choices = {}, opts = {}) => {
    const req = byIdReq(id);
    if(!req || req.status !== 'pending') throw { code: 'conflict' };
    const ap = (CR.appliers[req.module] || {})[req.kind];
    if(!ap) throw { message: tr('This kind of request cannot be approved here yet.', 'Chưa duyệt được loại yêu cầu này.') };
    const data = await CR.open(req);
    if(data.__locked) throw { code: 'locked' };
    await syncTarget(req);
    const cur = req.kind === 'insert' ? null : CR.current(req.module, req.target_id);
    const pl = CR.plan(req, data, cur);
    if(pl.gone) throw { message: tr('The machine has been deleted — the request can only be rejected.', 'Máy đã bị xoá — chỉ Từ chối được.') };
    const ck = await CR.check(req, data);
    if(ck.gone) throw { message: tr('The machine has been deleted — the request can only be rejected.', 'Máy đã bị xoá — chỉ Từ chối được.') };
    if(ck.block) throw { message: ck.block };
    if(ck.drift.length && !opts.confirm) throw { message: tr('The machine changed after the request was sent — tick the confirmation box before approving.',
                                                             'Máy đã thay đổi từ lúc gửi — tick ô xác nhận trước khi Duyệt.') };
    const miss = pl.conflicts.filter(k => choices[k] !== 'mine' && choices[k] !== 'theirs');
    if(miss.length) throw { message: tr('Choose which value to keep for every field changed by both sides.', 'Chọn giữ bên nào cho mọi trường bị cả 2 bên đổi.') };
    // 🧩 Sắp xếp: máy bị xếp lại sau lúc gửi → choices['m:<id>'] = 'theirs' (giữ hiện tại) | 'mine' (lấy đề xuất) cho MỌI máy
    const missA = (ck.conflicts || []).filter(c => choices[c.key] !== 'mine' && choices[c.key] !== 'theirs');
    if(missA.length) throw { message: tr('Choose "keep current" or "use proposal" for every machine moved after the request was sent.',
                                         'Chọn "giữ hiện tại" hoặc "lấy đề xuất" cho mọi máy đã bị xếp lại sau lúc gửi.') };
    const payload = req.kind === 'delete' ? null : req.kind === 'split' || req.kind === 'arrange' ? data.payload : CR.merge(req, data, cur, pl, choices);   // Tách / Sắp xếp: applier tự dựng bản ghi trên dòng hiện tại
    // chống ghi 2 lần: đọc lại trạng thái trong DB ngay trước khi ghi (admin khác có thể vừa duyệt / từ chối)
    const { data: st, error: e0 } = await sb().from('change_requests').select('status').eq('id', id).maybeSingle();
    if(e0) throw e0;
    if(!st || st.status !== 'pending'){
      await refresh();
      throw { handled: true, message: tr('This request has already been handled (by another admin). Nothing was written.', 'Yêu cầu này đã được xử lý (bởi admin khác). Không ghi gì thêm.') };
    }
    // Thêm: ID máy mới = ID yêu cầu (applier tự nhận ra máy đã ghi ở lần duyệt trước → không thêm lần 2)
    // check = kết quả CR.check admin vừa xác nhận (Tách: applier so lại, máy đổi giữa lúc kiểm và lúc ghi → dừng, không ghi trên bản admin chưa xem)
    const ids = await ap(req, { payload, before: data.before, title: data.title, check: ck, choices });      // lỗi ghi → ném lỗi, status giữ nguyên
    const note = ids && ids.note ? String(ids.note) : '';
    const applied = [].concat(ids || []).filter(Boolean);
    let up = null, err = null;
    try{ const r = await sb().from('change_requests').update({ status: 'approved', applied_ids: applied }).eq('id', id).eq('status', 'pending').select('id');
      up = r.data; err = r.error; }catch(e){ err = e; }
    if(err || !up || !up.length){
      if(err) console.warn('[Chờ duyệt] đã ghi dữ liệu nhưng chưa đổi trạng thái', err);
      await redrawAll();
      throw { partial: true, message: tr('Data was saved but the request status was not updated — refresh and check before approving again',
                                         'Đã ghi dữ liệu nhưng chưa cập nhật trạng thái yêu cầu — tải lại và kiểm tra trước khi duyệt lại') };
    }
    await redrawAll();
    return { ids: applied, note };
  };
  CR.reject = async (id, note) => {
    note = String(note == null ? '' : note).trim();
    if(!note) throw { message: tr('Enter a reason.', 'Cần nhập lý do.') };
    const { data, error } = await sb().from('change_requests').update({ status: 'rejected', reject_note: note })
      .eq('id', id).eq('status', 'pending').select('id');
    if(error) throw error;
    if(!data || !data.length) throw { code: 'conflict' };
    await refresh();
  };

  /* ---- popup 📝 Chờ duyệt ---- */
  const lblVal = (req, d) => {
    const S = spec(req.module, CR.flat(req.module, d.before), CR.flat(req.module, d.payload));
    return { l: k => { const s = S.lbl(k); return s && s !== esc(k) ? s : esc(k); }, v: (k, v) => S.val(k, v) };
  };
  const admRowHTML = (r, d) => `<details class="al-row cr-row cr-adm" data-id="${esc(r.id)}" data-s="${esc(r.status)}" data-t="${esc(r.target_id || '')}" data-m="${esc(r.module)}" data-k="${esc(r.kind)}">
      <summary><span class="al-at">${esc(fmtDT(r.created_at))}</span><span class="al-who cr-by">${esc(r.requested_by || '')}</span><span class="al-mod">${esc(MOD()[r.module] || r.module)}</span>`
    + `<span class="al-act">${esc(KIND()[r.kind] || r.kind)}</span>`
    + `<span class="al-t">${esc(d.title || (d.__locked ? tr('(could not decrypt)', '(không giải mã được)') : tr('(no name)', '(không tên)')))}</span></summary>
      <div class="al-body cr-det">${window.MO ? MO.skel(2) : esc(tr('Loading…', 'Đang tải…'))}</div></details>`;

  async function detail(row){
    const req = byIdReq(row.dataset.id), host = row.querySelector('.cr-det');
    if(!req || !host) return;
    const d = await CR.open(req);
    let cur = null, pl = { changed: [], conflicts: [], gone: false, stale: false }, err = '', ck = { drift: [] };
    if(!d.__locked){
      try{ await syncTarget(req); }catch(e){ err = dbErrText(e); }
      cur = req.kind === 'insert' ? null : CR.current(req.module, req.target_id);
      pl = CR.plan(req, d, cur);
      if(!pl.gone) try{ ck = await CR.check(req, d); }catch(e){ err = (err ? err + ' · ' : '') + dbErrText(e); ck = { drift: [], block: dbErrText(e) }; }
      if(ck.gone) pl.gone = true;
    }
    const isSplit = req.kind === 'split';
    const can = !d.__locked && !pl.gone && !ck.block && !!(CR.appliers[req.module] || {})[req.kind];
    const drift = ck.drift.length ? `<div class="cr-warn cr-drift">⚠️ ${esc(tr('The machine has changed since the request was sent', 'Máy đã thay đổi từ lúc gửi'))}: `
        + ck.drift.map(x => `${x.l}: <s>${esc(x.ot)}</s> → <ins>${esc(x.nt)}</ins>`).join(' · ')
        + `<br><small>${esc(tr('Approving writes the split onto the CURRENT machine (shown below).', 'Duyệt sẽ tách trên máy HIỆN TẠI (như bên dưới).'))}</small>`
        + `<label class="cr-drift-lb"><input type="checkbox" class="cr-drift-ok"> ${esc(tr('I have checked — approve anyway', 'Tôi đã xem, vẫn duyệt'))}</label></div>` : '';
    const LV = lblVal(req, d), c = CR.flat(req.module, curRow(cur)) || {}, p = CR.flat(req.module, d.payload) || {};
    const cf = pl.conflicts.map(k => `<div class="cr-cfk" data-k="${esc(k)}"><b>${LV.l(k)}</b>
        <label><input type="radio" name="cf-${esc(req.id)}-${esc(k)}" value="theirs"> ${esc(tr('Keep current', 'Giữ hiện tại'))}: <span>${esc(LV.v(k, c[k]))}</span></label>
        <label><input type="radio" name="cf-${esc(req.id)}-${esc(k)}" value="mine"> ${esc(tr("Use the editor's", 'Lấy của editor'))}: <span>${esc(LV.v(k, p[k]))}</span></label></div>`).join('');
    // 🧩 Sắp xếp: 1 lựa chọn cho mỗi máy bị xếp lại sau lúc gửi (khoá 'm:<id>')
    const AF = arrFmt(), acs = ck.conflicts || [];
    const acf = acs.map(c => `<div class="cr-cfk cr-ar-cf" data-k="${esc(c.key)}"><b>${esc(c.name)}</b>
        <small>${(c.drift || []).map(x => `${AF.lbl(x.k)}: ${esc(tr('when sent', 'lúc gửi'))} ${esc(AF.val(x.k, x.was))} · ${esc(tr('now', 'hiện tại'))} ${esc(AF.val(x.k, x.now))} · ${esc(tr('proposed', 'đề xuất'))} ${esc(AF.val(x.k, x.want))}`).join(' | ')}</small>
        <label><input type="radio" name="cf-${esc(req.id)}-${esc(c.key)}" value="theirs"> ${esc(tr('Keep current', 'Giữ hiện tại'))}</label>
        <label><input type="radio" name="cf-${esc(req.id)}-${esc(c.key)}" value="mine"> ${esc(tr('Use proposal', 'Lấy đề xuất'))}</label></div>`).join('');
    const cfKeys = pl.conflicts.concat(acs.map(c => c.key));
    const agone = (ck.missing || []).length && !ck.block ? `<div class="cr-warn cr-ar-gone">🗑 ${esc(tr(`${ck.missing.length} deleted machine(s) will be skipped`, `${ck.missing.length} máy đã bị xoá sẽ được bỏ qua`))}: ${ck.missing.map(m => esc(m.name)).join(', ')}</div>` : '';
    host.innerHTML = (err ? `<div class="cr-warn">⚠️ ${err}</div>` : '')
      + (pl.gone ? `<div class="cr-gone">🗑 ${esc(tr('Machine deleted', 'Máy đã bị xoá'))} — ${esc(tr('this request can only be rejected.', 'chỉ Từ chối được yêu cầu này.'))}</div>` : '')
      + (ck.block && !pl.gone ? `<div class="cr-gone cr-block">⛔ ${esc(ck.block)}</div>` : '')
      + (ck.resume ? `<div class="cr-warn cr-resume">ℹ️ ${esc(tr(`An earlier approval was partly saved (${ck.done || 0}/${ck.total || 0} new machines created). Approving again only writes what is missing — no duplicates.`,
          `Lần duyệt trước đã ghi một phần (đã tạo ${ck.done || 0}/${ck.total || 0} máy mới). Duyệt lại chỉ ghi phần còn thiếu, không tạo trùng.`))}</div>` : '')
      + drift
      + (!pl.gone && pl.stale && !isSplit ? `<div class="cr-warn">⚠️ ${esc(tr('The machine has changed since the request was sent (e.g. ⚡). Only the fields the editor changed are written; newer changes to other fields are kept.',
          'Máy đã đổi sau lúc gửi (vd có người dùng ⚡). Chỉ ghi các trường editor đổi; thay đổi mới ở trường khác được giữ nguyên.'))}</div>` : '')
      + (can || d.__locked || pl.gone || ck.block ? '' : `<div class="cr-note">${esc(tr('This kind of request cannot be approved here yet.', 'Chưa duyệt được loại yêu cầu này.'))}</div>`)
      + agone + replacedHTML(req, d) + diffHTML(req, d, (isSplit && ck.live) || ck.arrange ? ck : null)
      + (cf ? `<div class="cr-cf"><div class="cr-cfh">${esc(tr('Changed by both sides — choose which value to keep:', 'Trường bị cả 2 bên đổi — chọn giữ bên nào:'))}</div>${cf}</div>` : '')
      + (acf ? `<div class="cr-cf"><div class="cr-cfh">${esc(tr('Moved by someone else after the request was sent — choose for each machine:', 'Máy đã bị xếp lại sau lúc gửi — chọn cho từng máy:'))}</div>${acf}</div>` : '')
      + `<div class="cr-acts">${can ? `<button type="button" class="nbtn2 cr-ok"${cfKeys.length || ck.drift.length ? ' disabled' : ''}>${esc(tr('✅ Approve', '✅ Duyệt'))}</button>` : ''}</div>
        <div class="cr-rej"><textarea class="cr-why-in" rows="2" maxlength="500" placeholder="${esc(tr('Reason for rejecting (required)', 'Lý do từ chối (bắt buộc)'))}"></textarea>
        <button type="button" class="nbtn2 ghost cr-no" disabled>${esc(tr('❌ Reject', '❌ Từ chối'))}</button></div>`;
    const ok = host.querySelector('.cr-ok'), no = host.querySelector('.cr-no'), why = host.querySelector('.cr-why-in'), dok = host.querySelector('.cr-drift-ok');
    const choices = () => Object.fromEntries(cfKeys.map(k => { const i = host.querySelector(`.cr-cfk[data-k="${CSS.escape(k)}"] input:checked`); return [k, i ? i.value : null]; }));
    const okState = () => { if(ok) ok.disabled = Object.values(choices()).some(v => !v) || (!!dok && !dok.checked); };   // xung đột chưa chọn / máy đổi mà chưa tick xác nhận
    host.querySelectorAll('.cr-cfk input').forEach(i => i.onchange = okState);
    if(dok) dok.onchange = okState;
    why.oninput = () => { no.disabled = !why.value.trim(); };
    const run = async (btn, fn) => {
      if(CR.busy) return;
      CR.busy = true; btn.disabled = true;
      try{ await fn(); }
      catch(e){
        btn.disabled = false;
        if(e && (e.partial || e.handled)) try{ await CR.openReview(); }catch(e2){}   // đã ghi / đã được xử lý: vẽ lại danh sách trước khi báo
        showNotice({ type: 'error', title: e && e.partial ? tr('Partly saved', 'Mới ghi được một phần') : tr('Could not save', 'Chưa lưu được'), sub: dbErrText(e) });
      }
      finally{ CR.busy = false; }
    };
    if(ok) ok.onclick = () => run(ok, async () => {
      const r = await CR.approve(req.id, choices(), { confirm: !!dok && dok.checked });
      quToast('✅ ' + esc(tr('Approved', 'Đã duyệt')) + ': <b>' + esc(d.title || '') + '</b>');
      await CR.openReview();
      if(r.note) showNotice({ type: 'error', title: tr('Approved — note', 'Đã duyệt — lưu ý'), sub: esc(r.note) });
    });
    no.onclick = () => run(no, async () => {
      await CR.reject(req.id, why.value);
      quToast('❌ ' + esc(tr('Rejected', 'Đã từ chối')) + ': <b>' + esc(d.title || '') + '</b>');
      await CR.openReview();
    });
    host.dataset.ready = '1';
  }

  CR.openReview = async () => {
    if(CR.missing || !isAdmin()) return;
    mTitle.textContent = tr('📝 Pending approval', '📝 Chờ duyệt');
    mSub.textContent = tr('Changes sent by editors, newest first. Open one to see old → new, then approve or reject.',
                          'Thay đổi editor gửi, mới nhất ở trên. Bấm 1 yêu cầu để xem cũ → mới, rồi Duyệt hoặc Từ chối.');
    mBody.innerHTML = `<div class="al-wrap"><div class="al-list cr-adm-list" id="crList">${window.MO ? MO.skel(4) : esc(tr('Loading…', 'Đang tải…'))}</div></div>`;
    if(!mBg.classList.contains('show')) openM(1);
    try{ await CR.load(); }catch(e){ console.warn('[Chờ duyệt]', e); }
    CR.paint();
    const list = CR.list.filter(r => r.status === 'pending');
    const ds = await Promise.all(list.map(r => CR.open(r)));
    const host = document.getElementById('crList'); if(!host) return;
    host.innerHTML = list.length ? list.map((r, i) => admRowHTML(r, ds[i])).join('')
      : `<div class="al-none">${esc(tr('Nothing waiting for approval.', 'Không có yêu cầu nào chờ duyệt.'))}</div>`;
    host.querySelectorAll('.cr-adm').forEach(row => row.addEventListener('toggle', () => {
      if(row.open && !row.dataset.loaded){ row.dataset.loaded = '1'; detail(row).catch(e => console.warn('[Chờ duyệt]', e)); }
    }));
  };

  /* ================= 📜 Nhật ký: nguồn Duyệt + Đăng nhập (Task 5) =================
     Gắn vào AL.sources (audit_log.js nạp trước). Cả 2 nguồn chờ CR.loaded và trả [] khi CR.ready = false (chưa chạy 26) → không báo lỗi.
     change_requests: mỗi yêu cầu cho 1 dòng Gửi (at = created_at, key 'cr:<id>:pending') và, khi đã xử lý, thêm 1 dòng tại decided_at
     (key 'cr:<id>:<status>': Duyệt = người gửi → người duyệt / Từ chối + lý do / Rút). 2 truy vấn (theo created_at, theo decided_at), gộp, lấy n dòng
     mới nhất có at < before — đủ vì n dòng mới nhất của hợp nhất nằm trong n dòng mới nhất của từng truy vấn. Mọi giá trị giải mã / người dùng đều qua esc(). */
  const AL = window.AL;
  const when = at => { const t = Date.parse(at); return isNaN(t) ? 0 : t; };
  const LOCK = () => `<div class="al-lock">${esc(tr('(could not decrypt)', '(không giải mã được)'))}</div>`;
  async function reqRows(before, n){
    await CR.loaded; if(!CR.ready || !sb()) return [];
    let qa = sb().from('change_requests').select('*'); if(before) qa = qa.lt('created_at', before);
    let qb = sb().from('change_requests').select('*').neq('status', 'pending').not('decided_at', 'is', null); if(before) qb = qb.lt('decided_at', before);
    const [a, b] = await Promise.all([qa.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(n),
                                      qb.order('decided_at', { ascending: false }).order('id', { ascending: false }).limit(n)]);
    if(a.error) throw a.error;
    if(b.error) throw b.error;
    const rows = [];
    for(const r of a.data || []){
      const d = await CR.open(r), kind = KIND()[r.kind] || r.kind;
      let body = '';
      try{ body = d.__locked ? LOCK() : diffHTML(r, d); }catch(e){ body = ''; }
      rows.push({ key: 'cr:' + r.id + ':pending', at: r.created_at, who: r.requested_by || '', module: r.module, kind: 'request', act: tr('Request sent', 'Gửi yêu cầu'),
        title: d.title || (d.__locked ? tr('(could not decrypt)', '(không giải mã được)') : tr('(no name)', '(không tên)')),
        html: `<div class="hx-ch">${esc(kind)} · <b>${esc(r.requested_by || '')}</b></div>${body}` });
    }
    for(const r of b.data || []){
      const d = await CR.open(r), kind = KIND()[r.kind] || r.kind, by = esc(r.requested_by || ''), dec = esc(r.decided_by || '');
      const st = r.status, act = st === 'approved' ? tr('Approved', 'Duyệt') : st === 'rejected' ? tr('Rejected', 'Từ chối') : tr('Withdrawn', 'Rút');
      const head = st === 'approved' ? `${esc(kind)} · <b>${by}</b> → <b>${dec}</b>`
        : st === 'rejected' ? `${esc(kind)} · <b>${by}</b> ✕ <b>${dec}</b>` : `${esc(kind)} · <b>${by}</b>`;
      rows.push({ key: 'cr:' + r.id + ':' + st, at: r.decided_at, who: r.decided_by || '', module: r.module, kind: 'request', act,
        title: d.title || (d.__locked ? tr('(could not decrypt)', '(không giải mã được)') : tr('(no name)', '(không tên)')),
        html: `<div class="hx-ch">${head}</div>` + (st === 'rejected' && r.reject_note ? `<div class="cr-why">${esc(tr('Reason', 'Lý do'))}: ${esc(r.reject_note)}</div>` : '') });
    }
    return rows.sort((x, y) => when(y.at) - when(x.at)).slice(0, n);
  }
  /* user_agent → "Edge · Windows" / "Chrome · Android" / "Safari · iPhone"; không nhận ra trình duyệt → "Trình duyệt khác" */
  CR.browser = ua => {
    ua = String(ua || '');
    const os = /iPhone|iPod/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
      : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    const br = /Edg(e|A|iOS)?\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
      : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return br ? br + (os ? ' · ' + os : '') : tr('Other browser', 'Trình duyệt khác');
  };
  async function loginRows(before, n){
    await CR.loaded; if(!CR.ready || !sb()) return [];
    let q = sb().from('login_log').select('id,at,email,user_agent'); if(before) q = q.lt('at', before);
    const { data, error } = await q.order('at', { ascending: false }).order('id', { ascending: false }).limit(n);
    if(error) throw error;
    return (data || []).map(x => ({ key: 'login:' + x.id, at: x.at, who: x.email || '', module: 'users', kind: 'login', title: tr('Signed in', 'Đăng nhập'),
      html: `<div class="hx-ch">${esc(CR.browser(x.user_agent))}</div>` }));
  }
  /* "theo yêu cầu của <editor>": dòng audit_log (admin sửa / thêm / xoá máy) có machine_id ∈ applied_ids của 1 yêu cầu đã duyệt
     và at trong ±2 phút quanh decided_at của yêu cầu đó. 1 truy vấn cho mỗi trang audit_log vừa tải (khoảng at của trang ± 2 phút). */
  const idList = a => Array.isArray(a) ? a.map(String) : typeof a === 'string' ? a.replace(/[{}"]/g, '').split(',').filter(Boolean) : [];
  if(AL) AL.annotators.push(async rows => {
    if(!CR.ready || !sb()) return;
    const rs = rows.filter(r => r.mid); if(!rs.length) return;
    const ts = rs.map(r => when(r.at)).filter(Boolean), W = 120000;
    const { data, error } = await sb().from('change_requests').select('id,requested_by,decided_at,applied_ids').eq('status', 'approved')
      .gte('decided_at', new Date(Math.min(...ts) - W).toISOString()).lt('decided_at', new Date(Math.max(...ts) + W + 1).toISOString());
    if(error || !data || !data.length) return;
    for(const r of rs){
      const q = data.find(x => idList(x.applied_ids).includes(String(r.mid)) && Math.abs(when(x.decided_at) - when(r.at)) <= W);
      if(q) r.html += `<div class="cr-by">${esc(tr('On request of', 'theo yêu cầu của'))} <b>${esc(q.requested_by || '')}</b></div>`;
    }
  });
  if(AL){
    AL.sources.push({ key: 'change_requests', label: () => tr('Approval requests', 'Yêu cầu duyệt'), fetch: reqRows });
    AL.sources.push({ key: 'login_log', label: () => tr('Sign-ins', 'Đăng nhập'), fetch: loginRows });
  }
})();
