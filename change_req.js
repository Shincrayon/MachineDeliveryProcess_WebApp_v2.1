/* change_req.js — Hàng chờ duyệt (đợt 2, 2026-11-25, migration 26 change_requests). window.CR.
   Editor / catalog_editor bấm Lưu ở ✏️ Sửa / ➕ Thêm / 📋 Nhân bản / 🗑 Xoá → gửi YÊU CẦU (không ghi bảng máy); admin duyệt mới ghi.
   Admin lưu thẳng như cũ. Chưa chạy 26 (bảng chưa có: 42P01 / PGRST205 / 404) → CR.missing = true: mọi đường lưu như cũ, không nút / nhãn nào.
   Lỗi khác khi dò bảng (mạng, 5xx, JWT hết hạn) KHÔNG tắt duyệt: editor vẫn phải gửi yêu cầu, gửi lỗi thì báo — không bao giờ lưu thẳng.
   CR.loaded = Promise (xong khi dò + tải xong); CR.isLoaded = boolean. Đường lưu của editor await CR.loaded trước khi quyết định.
   - Nội dung yêu cầu mã hoá như dữ liệu máy: sec = CRYPTO.on ? CRYPTO.encObj(o) : 'plain:' + JSON(o), o = { payload, before, title }.
     payload = bản ghi đề xuất (đúng dạng tham số hàm ghi), before = giá trị hiện tại cùng các khoá (null khi thêm), title = tên máy (+ mã).
   - requested_by / decided_* do trigger máy chủ đặt — không gửi. Mỗi máy tối đa 1 yêu cầu pending của cùng người gửi (gửi lại → cũ withdrawn).
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
   Req = { id, created_at, module, kind, target_id, base_version, sec, status, requested_by, decided_by, decided_at, reject_note, applied_ids }.
   Cần: tr, escH, fmtDT, openM, mTitle/mSub/mBody, showNotice, dbErrText, quToast (index.html), CRYPTO, PERM, window.__sb,
   window.__dvHist / __mmHist (nhãn + trường được xem), showVal (Tiến độ). */
(function(){
  'use strict';
  let doneLoad;
  const CR = window.CR = { ready: false, missing: false, isLoaded: false, list: [], appliers: {}, onChange: [],
    getters: {}, sync: {}, derive: {}, busy: false,
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
  const STAT = () => ({ pending: tr('Pending', 'Chờ duyệt'), approved: tr('Approved', 'Đã duyệt'), rejected: tr('Rejected', 'Từ chối'), withdrawn: tr('Withdrawn', 'Đã rút') });
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
    const key = [o.module, o.kind, o.target_id || ('new:' + (o.title || ''))].join('|');
    if(inflight.has(key)) return inflight.get(key);
    const pr = doSubmit(o).finally(() => inflight.delete(key));
    inflight.set(key, pr); return pr;
  };
  async function doSubmit({ module, kind, target_id = null, base_version = null, payload = null, before = null, title = '' }){
    if(CR.missing || !sb()) throw { message: tr('The approval queue is not available.', 'Chưa có hàng chờ duyệt.') };
    const sec = await seal({ payload, before, title });
    const { data, error } = await sb().from('change_requests')
      .insert({ module, kind, target_id: target_id || null, base_version: base_version == null ? null : base_version, sec }).select('*');
    if(error) throw error;
    const req = data && data[0];
    if(!req) throw { message: tr('The request was not saved.', 'Yêu cầu chưa được lưu.') };
    cache.set(req.id, { payload, before, title });
    // tối đa 1 pending của mình cho mỗi máy: rút các yêu cầu cũ (lỗi ở bước này không làm hỏng yêu cầu vừa gửi)
    if(target_id && me()){
      try{
        const { data: old, error: e0 } = await sb().from('change_requests').select('id')
          .eq('status', 'pending').eq('module', module).eq('target_id', target_id).eq('requested_by', me()).neq('id', req.id);
        if(e0) throw e0;
        for(const r of old || []){
          const { error: e1 } = await sb().from('change_requests').update({ status: 'withdrawn' }).eq('id', r.id).select('id');
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
  const diffHTML = (req, d) => {
    if(d.__locked) return `<div class="al-lock">${esc(tr('(could not decrypt)', '(không giải mã được)'))}</div>`;
    if(req.kind === 'delete') return `<div class="cr-note">🗑 ${esc(tr('Move this machine to the trash (an admin can restore it).', 'Chuyển máy này vào thùng rác (admin khôi phục được).'))}</div>`;
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

  const rowHTML = (r, d, open) => {
    const st = r.status, mine = String(r.requested_by || '').toLowerCase() === me();
    return `<details class="al-row cr-row" data-id="${esc(r.id)}" data-s="${esc(st)}" data-t="${esc(r.target_id || '')}" data-m="${esc(r.module)}"${open ? ' open' : ''}>
      <summary><span class="al-at">${esc(fmtDT(r.created_at))}</span><span class="al-act">${esc(KIND()[r.kind] || r.kind)}</span>`
      + `<span class="al-t">${esc(d.title || (d.__locked ? tr('(could not decrypt)', '(không giải mã được)') : tr('(no name)', '(không tên)')))}</span>`
      + `<span class="cr-st" data-s="${esc(st)}">${esc(STAT()[st] || st)}</span><span class="al-mod">${esc(MOD()[r.module] || r.module)}</span></summary>
      <div class="al-body">${st === 'rejected' && r.reject_note ? `<div class="cr-why">${esc(tr('Reason', 'Lý do'))}: ${esc(r.reject_note)}</div>` : ''}${diffHTML(r, d)}`
      + (r.decided_at && st !== 'pending' ? `<div class="cr-meta">${esc(STAT()[st] || st)} · ${esc(r.decided_by || '')} · ${esc(fmtDT(r.decided_at))}</div>` : '')
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
    host.innerHTML = list.length ? list.map((r, i) => rowHTML(r, ds[i], r.id === focusId)).join('')
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
  const curRow = cur => cur && typeof cur === 'object' && 'version' in cur && 'row' in cur ? cur.row : cur;
  CR.current = (mod, targetId) => { const g = CR.getters[mod]; return g && targetId ? g(targetId) : null; };

  CR.plan = (req, data, cur) => {
    const mod = req.module, kind = req.kind, c0 = curRow(cur);
    const gone = kind !== 'insert' && !c0;
    const stale = !!cur && cur.version != null && req.base_version != null && cur.version !== req.base_version;
    if(kind === 'delete' || !data || !data.payload) return { changed: [], conflicts: [], gone, stale };
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
  /* trả về { ids, note } (note = ghi chú của applier cho admin, chữ thường — phải thoát khi hiện) */
  CR.approve = async (id, choices = {}) => {
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
    const miss = pl.conflicts.filter(k => choices[k] !== 'mine' && choices[k] !== 'theirs');
    if(miss.length) throw { message: tr('Choose which value to keep for every field changed by both sides.', 'Chọn giữ bên nào cho mọi trường bị cả 2 bên đổi.') };
    const payload = req.kind === 'delete' ? null : CR.merge(req, data, cur, pl, choices);
    // chống ghi 2 lần: đọc lại trạng thái trong DB ngay trước khi ghi (admin khác có thể vừa duyệt / từ chối)
    const { data: st, error: e0 } = await sb().from('change_requests').select('status').eq('id', id).maybeSingle();
    if(e0) throw e0;
    if(!st || st.status !== 'pending'){
      await refresh();
      throw { handled: true, message: tr('This request has already been handled (by another admin). Nothing was written.', 'Yêu cầu này đã được xử lý (bởi admin khác). Không ghi gì thêm.') };
    }
    // Thêm: ID máy mới = ID yêu cầu (applier tự nhận ra máy đã ghi ở lần duyệt trước → không thêm lần 2)
    const ids = await ap(req, { payload, before: data.before, title: data.title });      // lỗi ghi → ném lỗi, status giữ nguyên
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
    let cur = null, pl = { changed: [], conflicts: [], gone: false, stale: false }, err = '';
    if(!d.__locked){
      try{ await syncTarget(req); }catch(e){ err = dbErrText(e); }
      cur = req.kind === 'insert' ? null : CR.current(req.module, req.target_id);
      pl = CR.plan(req, d, cur);
    }
    const can = !d.__locked && !pl.gone && !!(CR.appliers[req.module] || {})[req.kind];
    const LV = lblVal(req, d), c = CR.flat(req.module, curRow(cur)) || {}, p = CR.flat(req.module, d.payload) || {};
    const cf = pl.conflicts.map(k => `<div class="cr-cfk" data-k="${esc(k)}"><b>${LV.l(k)}</b>
        <label><input type="radio" name="cf-${esc(req.id)}-${esc(k)}" value="theirs"> ${esc(tr('Keep current', 'Giữ hiện tại'))}: <span>${esc(LV.v(k, c[k]))}</span></label>
        <label><input type="radio" name="cf-${esc(req.id)}-${esc(k)}" value="mine"> ${esc(tr("Use the editor's", 'Lấy của editor'))}: <span>${esc(LV.v(k, p[k]))}</span></label></div>`).join('');
    host.innerHTML = (err ? `<div class="cr-warn">⚠️ ${err}</div>` : '')
      + (pl.gone ? `<div class="cr-gone">🗑 ${esc(tr('Machine deleted', 'Máy đã bị xoá'))} — ${esc(tr('this request can only be rejected.', 'chỉ Từ chối được yêu cầu này.'))}</div>` : '')
      + (!pl.gone && pl.stale ? `<div class="cr-warn">⚠️ ${esc(tr('The machine has changed since the request was sent (e.g. ⚡). Only the fields the editor changed are written; newer changes to other fields are kept.',
          'Máy đã đổi sau lúc gửi (vd có người dùng ⚡). Chỉ ghi các trường editor đổi; thay đổi mới ở trường khác được giữ nguyên.'))}</div>` : '')
      + (can || d.__locked || pl.gone ? '' : `<div class="cr-note">${esc(tr('This kind of request cannot be approved here yet.', 'Chưa duyệt được loại yêu cầu này.'))}</div>`)
      + diffHTML(req, d)
      + (cf ? `<div class="cr-cf"><div class="cr-cfh">${esc(tr('Changed by both sides — choose which value to keep:', 'Trường bị cả 2 bên đổi — chọn giữ bên nào:'))}</div>${cf}</div>` : '')
      + `<div class="cr-acts">${can ? `<button type="button" class="nbtn2 cr-ok"${pl.conflicts.length ? ' disabled' : ''}>${esc(tr('✅ Approve', '✅ Duyệt'))}</button>` : ''}</div>
        <div class="cr-rej"><textarea class="cr-why-in" rows="2" maxlength="500" placeholder="${esc(tr('Reason for rejecting (required)', 'Lý do từ chối (bắt buộc)'))}"></textarea>
        <button type="button" class="nbtn2 ghost cr-no" disabled>${esc(tr('❌ Reject', '❌ Từ chối'))}</button></div>`;
    const ok = host.querySelector('.cr-ok'), no = host.querySelector('.cr-no'), why = host.querySelector('.cr-why-in');
    const choices = () => Object.fromEntries(pl.conflicts.map(k => { const i = host.querySelector(`.cr-cfk[data-k="${CSS.escape(k)}"] input:checked`); return [k, i ? i.value : null]; }));
    host.querySelectorAll('.cr-cfk input').forEach(i => i.onchange = () => { if(ok) ok.disabled = Object.values(choices()).some(v => !v); });
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
      const r = await CR.approve(req.id, choices());
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
