/* =====================================================================
   seal_tool.js — 🔐 Chuyển sang gói theo nhóm + ♻️ Khôi phục từ file sao lưu (CHỈ admin). window.SEALT. Nạp sau seal.js.
   Chuyển dữ liệu thật của 1 bảng (machines HOẶC mmtb_machines, chạy riêng) từ gói cũ 'sec' sang các cột nhóm s_* (SEAL.sealAll):
     1 Sao lưu (tải file SaoLuu_MaHoa_<bảng>_<yyyy-mm-dd-HHMM>.json, gồm máy trong thùng rác) → 2 Chọn lại đúng file vừa tải (SHA-256 khớp)
     → 3 Chạy thử: niêm phong trong trình duyệt rồi MỞ LẠI, so từng trường với bản gốc; lệch 1 trường là không cho ghi
     → 4 Ghi: đúng gói đã chạy thử, từng dòng, eq('version', bản sao lưu); lỗi / 0 dòng → dừng ngay → 5 Kiểm tra: đọc lại toàn bảng, so với file.
   File sao lưu VẪN MÃ HOÁ: mỗi dòng giữ nguyên id, version, deleted_at, sec, s_* (vốn là chuỗi mã hoá); giá trị các cột gốc của trường nhạy cảm
   (thường trống, nhưng có thể còn chữ rõ như thuong_hieu / alias_names) được gói vào 'pc' = CRYPTO.encObj({cột: giá trị}). Không có chữ rõ nào trong file.
   Dòng không mở được (🔒) không bao giờ bị ghi: giữ nguyên sec. Khôi phục ghi lại đúng sec + s_* + cột gốc (mở từ pc) của file
   (dòng bị sửa sau sao lưu chỉ ghi khi admin xác nhận; trước khi ghi phải tải + chọn lại file sao lưu hiện trạng). Popup chỉ đóng bằng ✕ (✕ = dừng sau dòng đang ghi),
   không tự tải lại trang. Trigger của bảng machines tính lại ditautt / lanhtt / vedukienn / danhgia khi cập nhật: dòng nào đổi được liệt kê (không chặn).
   Cần: SEAL (seal.js), CRYPTO + tr (index.html), window.__sb, window.__role. Máy chủ chặn ghi theo nhóm ở 28b (sau); đây là chặn phía app.
   ===================================================================== */
(function () {
  'use strict';
  const L = (en, vi) => (typeof tr === 'function' ? tr(en, vi) : vi);
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const TABLES = ['machines', 'mmtb_machines'];
  const TNAME = t => (t === 'machines' ? L('Delivery', 'Tiến độ máy về') : L('Machine catalog', 'Danh mục máy'));
  const DERIVED = { machines: ['ditautt', 'lanhtt', 'vedukienn', 'danhgia'], mmtb_machines: [] };   // trigger machines_actual_sync tính lại khi cập nhật
  const isAdmin = () => window.__role === 'admin';
  const cryptoOn = () => typeof CRYPTO !== 'undefined' && !!CRYPTO.on;
  const ready = t => cryptoOn() && TABLES.includes(t) && !!(window.SEAL && SEAL.on && SEAL.on[t]);
  const nz = v => (v === undefined ? null : v);
  const J = v => JSON.stringify(v === undefined ? null : v);
  const G1 = /^g1:dk:[A-Za-z0-9+/=]+$/;
  const PROVEN = new WeakSet();          // chỉ gói do dryRun tạo VÀ chạy thử không lệch mới được convert ghi
  let stopReq = false;

  const refuse = reason => { const e = new Error(reason); e.code = reason; return e; };
  const gate = t => {
    if (!isAdmin()) throw refuse('not_admin');
    if (!ready(t)) throw refuse('not_ready');
  };
  const dbCols = t => ['id', 'version', 'deleted_at', 'sec'].concat(SEAL.cols(t), SEAL.fields(t));

  /* mã lý do → câu cho người dùng (2 ngôn ngữ); mã thô để cuối trong ngoặc */
  const WHY = () => ({
    version: L('the row was changed by someone else after the backup (version differs)', 'dòng đã bị sửa sau lúc sao lưu (phiên bản khác)'),
    readback: L('the server stored something different from what was checked', 'máy chủ lưu khác với gói đã chạy thử'),
    not_proven: L('these rows did not come from a clean dry run', 'các dòng này không đến từ một lần chạy thử không lệch'),
    incomplete_read: L('could not read the whole table (row count does not match the server)', 'không đọc đủ cả bảng (số dòng không khớp máy chủ)'),
    not_ready: L('encryption is not unlocked or the server has no group columns (28a)', 'chưa mở khoá mã hoá hoặc máy chủ chưa có cột theo nhóm (28a)'),
    not_admin: L('only an admin can do this', 'chỉ admin được làm việc này'),
    user_stop: L('stopped by you', 'bạn đã bấm dừng'),
    bad_file: L('not a valid backup file', 'không phải file sao lưu hợp lệ'),
    bad_backup: L('the backup row cannot be decrypted with the current data password', 'không giải mã được dòng sao lưu bằng mật khẩu dữ liệu hiện tại'),
    locked: L('the row cannot be decrypted', 'dòng không giải mã được'),
    missing: L('the row no longer exists', 'dòng không còn'),
    sec: L('the old package (sec) changed or was not converted', 'gói cũ (sec) bị đổi hoặc chưa chuyển'),
    '*': L('the sealed columns are not in the new format', 'các cột niêm phong không đúng định dạng mới'),
    pc: L('the encrypted column values in the backup cannot be opened', 'không mở được giá trị cột gốc đã mã hoá trong file')
  });
  const why = code => { const m = WHY()[code]; return m ? m + ' (' + code + ')' : L('server error: ', 'lỗi máy chủ: ') + code; };

  /* đọc toàn bảng (kể cả thùng rác); số dòng phải khớp count của máy chủ (PostgREST có thể cắt bớt); thiếu count = từ chối */
  async function readAll(sb, t, extra) {
    const head = await sb.from(t).select('id', { count: 'exact', head: true });
    if (head.error) throw head.error;
    const { data, error } = await sb.from(t).select(dbCols(t).concat(extra || []).join(',')).order('id', { ascending: true });
    if (error) throw error;
    const rows = data || [];
    if (typeof head.count !== 'number' || head.count !== rows.length) throw refuse('incomplete_read');
    return rows;
  }
  async function sha256(buf) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
    return [...h].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); };
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  const pick = (o, F) => { const v = {}; F.forEach(f => { if (f in o) v[f] = o[f]; }); return v; };
  /* dòng DB → dòng file: cột gốc vào pc (mã hoá) */
  async function packRow(t, r) {
    const F = SEAL.fields(t), out = {};
    ['id', 'version', 'deleted_at', 'sec'].concat(SEAL.cols(t)).forEach(k => { if (k in r) out[k] = r[k]; });
    out.pc = await CRYPTO.encObj(pick(r, F));
    return out;
  }
  /* dòng file → dòng như đọc từ DB (mở pc); không mở được → ném 'bad_backup' */
  async function expand(t, r) {
    let v;
    try { v = await CRYPTO.decObj(r.pc); } catch (e) { throw refuse('bad_backup'); }
    if (!v || typeof v !== 'object') throw refuse('bad_backup');
    const F = SEAL.fields(t), out = Object.assign({}, r);
    delete out.pc;
    Object.keys(v).forEach(k => { if (!F.includes(k)) throw refuse('bad_backup'); out[k] = v[k]; });
    return out;
  }
  async function derivedNow(sb, t) {
    const D = DERIVED[t]; if (!D.length) return null;
    const { data, error } = await sb.from(t).select(['id'].concat(D).join(','));
    if (error) throw error;
    return new Map((data || []).map(r => [r.id, r]));
  }
  const driftOf = (t, before, after) => (DERIVED[t] || []).filter(f => before && after && J(before[f]) !== J(after[f]))
    .map(f => ({ field: f, a: before[f], b: after[f] }));
  async function refreshApp(t) {
    try {
      if (t === 'machines' && window.__reloadDelivery) await window.__reloadDelivery();
      if (t === 'mmtb_machines' && window.__mmReload) await window.__mmReload();
    } catch (e) { console.warn('[SEALT] chưa vẽ lại được', e); }
  }
  const selfWrite = on => { if (on) window.__selfWriting = window.__selfWritingM = true;
    else setTimeout(() => { window.__selfWriting = window.__selfWritingM = false; }, 1500); };

  const SEALT = window.SEALT = { TABLES, DERIVED, last: null, why };

  /* ---------- 1. Sao lưu ---------- */
  SEALT.backup = async (sb, table) => {
    gate(table);
    const raw = await readAll(sb, table);
    const rows = [];
    for (const r of raw) rows.push(await packRow(table, r));
    const data = { table, at: new Date().toISOString(), rows };
    const json = JSON.stringify(data);
    const hash = await sha256(new TextEncoder().encode(json));
    const name = 'SaoLuu_MaHoa_' + table + '_' + stamp() + '.json';
    download(name, json);
    return { data, name, hash };
  };

  /* ---------- 2. Chọn lại đúng file vừa tải ---------- */
  SEALT.confirmFile = async (file, hash) => {
    try {
      if (!file || typeof file.arrayBuffer !== 'function' || !hash) return false;
      return (await sha256(await file.arrayBuffer())) === hash;
    } catch (e) { return false; }
  };

  /* ---------- 3. Chạy thử (thuật toán cố định của kế hoạch, trên dòng file đã mở pc) ---------- */
  SEALT.dryRun = async (table, rows) => {
    if (!ready(table)) throw refuse('not_ready');
    const F = SEAL.fields(table), C = SEAL.cols(table), FS = new Set(F);
    const res = { total: (rows || []).length, match: 0, todo: [], skip: { done: [], plain: [], locked: [] }, bad: [] };
    for (const r0 of rows || []) {
      let r;
      if ('pc' in r0) { try { r = await expand(table, r0); } catch (e) { res.bad.push({ id: r0.id, field: 'pc', a: null, b: null }); continue; } }
      else r = r0;
      const fmt = SEAL.fmtOf(r);
      if (fmt === 'g1') { res.skip.done.push(r.id); continue; }
      if (fmt === 'plain') { res.skip.plain.push(r.id); continue; }       // chưa mã hoá: "🔐 Mã hoá ngay" lo
      const o = await SEAL.openRow(r);
      if (!o || o.__locked) { res.skip.locked.push(r.id); continue; }       // không ghi, không tính là lệch
      let ok = true;
      const bad = (field, a, b) => { res.bad.push({ id: r.id, field, a, b }); ok = false; };
      if (typeof r.id !== 'string' || !r.id || typeof r.version !== 'number') bad('version', r.version, null);
      /* gói sec có khoá ngoài các nhóm → chuyển sẽ mất khoá đó: từ chối thay vì đoán */
      try { const s = await SEAL.codec.decObj(r.sec); Object.keys(s || {}).forEach(k => { if (!FS.has(k)) bad(k, s[k], undefined); }); }
      catch (e) { bad('sec', null, null); }
      const n = await SEAL.sealAll(table, pick(o, F));                    // giá trị từ bản đã mở (gồm blank của cột rõ)
      const o2 = await SEAL.openRow(Object.assign({}, r, n));             // n có sec: null → chỉ đọc từ s_*
      F.forEach(f => { if (J(o[f]) !== J(o2[f])) bad(f, o[f], o2[f]); });
      if (!o2 || o2.__locked || n.sec !== null || C.some(c => !G1.test(String(n[c])))) bad('*', null, null);
      const extra = Object.keys(n).filter(k => k !== 'sec' && !C.includes(k) && !FS.has(k));
      if (extra.length) bad(extra.join(','), null, null);
      if (ok) { res.match++; res.todo.push({ id: r.id, version: r.version, n }); }
    }
    if (!res.bad.length) res.todo.forEach(x => PROVEN.add(x));
    return res;
  };

  SEALT.stop = () => { stopReq = true; };

  /* ---------- 4. Ghi ---------- */
  SEALT.convert = async (sb, table, todo, onStep) => {
    const out = { done: [], stopped: null, drift: [] };
    try { gate(table); } catch (e) { out.stopped = { id: null, reason: e.code }; return out; }
    const list = todo || [];
    const np = list.find(x => !PROVEN.has(x));
    if (np) { out.stopped = { id: np.id || null, reason: 'not_proven' }; return out; }
    if (!list.length) return out;
    const C = SEAL.cols(table), D = DERIVED[table];
    let before;
    try { before = await derivedNow(sb, table); } catch (e) { out.stopped = { id: null, reason: String(e.message || e.code || e) }; return out; }
    stopReq = false; selfWrite(true);
    try {
      for (let i = 0; i < list.length; i++) {
        const x = list[i];
        if (window.__sealtBeforeWrite) await window.__sealtBeforeWrite(x.id);
        if (stopReq) { out.stopped = { id: x.id, reason: 'user_stop', at: i + 1 }; break; }
        let r;
        try { r = await sb.from(table).update(Object.assign({}, x.n, { sec: null })).eq('id', x.id).eq('version', x.version).select(['id', 'sec', 'version'].concat(C, D).join(',')); }
        catch (e) { r = { error: e }; }
        if (r.error) { out.stopped = { id: x.id, reason: String(r.error.message || r.error.code || r.error), at: i + 1 }; break; }
        if (!r.data || r.data.length !== 1) { out.stopped = { id: x.id, reason: 'version', at: i + 1 }; break; }
        const back = r.data[0];
        if (back.sec != null || C.some(c => back[c] !== x.n[c])) { out.stopped = { id: x.id, reason: 'readback', at: i + 1 }; break; }
        out.done.push(x.id);
        driftOf(table, before && before.get(x.id), back).forEach(d => out.drift.push(Object.assign({ id: x.id }, d)));
        if (onStep) try { onStep(out.done.length, list.length, x.id); } catch (e) {}
      }
    } finally { selfWrite(false); }
    return out;
  };

  /* ---------- 5. Kiểm tra ---------- */
  SEALT.verify = async (sb, table, data) => {
    gate(table);
    const F = SEAL.fields(table), C = SEAL.cols(table);
    const live = new Map((await readAll(sb, table)).map(r => [r.id, r]));
    const res = { total: 0, ok: 0, bad: [] };
    for (const r0 of (data && data.rows) || []) {
      let r;
      try { r = 'pc' in r0 ? await expand(table, r0) : r0; } catch (e) { res.total++; res.bad.push({ id: r0.id, field: 'pc' }); continue; }
      const fmt = SEAL.fmtOf(r);
      if (fmt !== 'sec') continue;
      const Lr = live.get(r.id);
      const o = await SEAL.openRow(r);
      if (!o.__locked) res.total++;
      if (!Lr) { res.bad.push({ id: r.id, field: 'missing' }); continue; }
      if (o.__locked) {                                                    // 🔒: không chuyển, không tính vào N/N — nhưng sec phải giữ nguyên từng byte
        if (!(Lr.sec === r.sec && C.every(c => nz(Lr[c]) === nz(r[c])))) res.bad.push({ id: r.id, field: 'sec' });
        continue;
      }
      if (SEAL.fmtOf(Lr) !== 'g1' || Lr.sec !== null || C.some(c => !G1.test(String(Lr[c])))) { res.bad.push({ id: r.id, field: 'sec' }); continue; }
      const o2 = await SEAL.openRow(Lr);
      if (o2.__locked) { res.bad.push({ id: r.id, field: '*' }); continue; }
      const diff = F.filter(f => J(o[f]) !== J(o2[f]));
      if (diff.length) diff.forEach(f => res.bad.push({ id: r.id, field: f })); else res.ok++;
    }
    return res;
  };

  /* ---------- ♻️ Khôi phục ---------- */
  function checkFile(data) {
    if (!data || typeof data !== 'object' || !TABLES.includes(data.table) || !Array.isArray(data.rows)) throw refuse('bad_file');
    const t = data.table, C = SEAL.cols(t), ok = new Set(['id', 'version', 'deleted_at', 'sec', 'pc'].concat(C)), seen = new Set();
    data.rows.forEach(r => {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || typeof r.version !== 'number' || seen.has(r.id)) throw refuse('bad_file');
      seen.add(r.id);
      Object.keys(r).forEach(k => { if (!ok.has(k)) throw refuse('bad_file'); });           // file có cột rõ → không phải file của công cụ này
      if (typeof r.pc !== 'string' || !r.pc.startsWith('e1:')) throw refuse('bad_file');
      if (r.sec != null && typeof r.sec !== 'string') throw refuse('bad_file');
      C.forEach(c => { if (r[c] != null && !(typeof r[c] === 'string' && r[c].startsWith('g1:'))) throw refuse('bad_file'); });
    });
    return t;
  }
  SEALT.checkFile = data => { try { checkFile(data); return true; } catch (e) { return false; } };
  SEALT.restore = async (sb, data, opts) => {
    const out = { restored: 0, same: 0, changedSince: [], stopped: null, missing: [], drift: [] };
    let t;
    try { t = checkFile(data); gate(t); } catch (e) { out.stopped = { id: null, reason: e.code || 'bad_file' }; return out; }
    const confirmChanged = !!(opts && opts.confirmChanged);
    const F = SEAL.fields(t), C = SEAL.cols(t), D = DERIVED[t];
    let live, rows = [];
    try {
      live = new Map((await readAll(sb, t, D)).map(r => [r.id, r]));
      for (const r0 of data.rows) rows.push(await expand(t, r0));         // mở hết pc TRƯỚC khi ghi dòng nào: 1 dòng hỏng → không ghi gì
    } catch (e) { out.stopped = { id: null, reason: e.code || String(e.message || e) }; return out; }
    const sameVals = async (a, b) => { const x = await SEAL.openRow(a), y = await SEAL.openRow(b);
      return !x.__locked && !y.__locked && F.every(f => J(x[f]) === J(y[f])); };
    stopReq = false; selfWrite(true);
    try {
      for (const r of rows) {
        const Lr = live.get(r.id);
        if (!Lr) { out.missing.push(r.id); continue; }
        const same = nz(r.sec) === nz(Lr.sec) && C.every(c => nz(r[c]) === nz(Lr[c])) && F.every(f => !(f in r) || J(r[f]) === J(Lr[f]));
        if (same) { out.same++; continue; }
        /* sau lần chuyển, version = file + 1 và giá trị mở ra y hệt file; hơn thế (hoặc giá trị khác) = bị sửa sau sao lưu */
        const changed = Lr.version !== r.version && (Lr.version > r.version + 1 || Lr.version < r.version || !(await sameVals(r, Lr)));
        if (changed) { out.changedSince.push({ id: r.id, from: r.version, now: Lr.version }); if (!confirmChanged) continue; }
        if (window.__sealtBeforeWrite) await window.__sealtBeforeWrite(r.id);
        if (stopReq) { out.stopped = { id: r.id, reason: 'user_stop' }; break; }
        const p = { sec: nz(r.sec) };
        C.forEach(c => { p[c] = nz(r[c]); });
        F.forEach(f => { if (f in r) p[f] = r[f]; });
        let w;
        try { w = await sb.from(t).update(p).eq('id', r.id).eq('version', Lr.version).select(['id'].concat(D).join(',')); } catch (e) { w = { error: e }; }
        if (w.error) { out.stopped = { id: r.id, reason: String(w.error.message || w.error.code || w.error) }; break; }
        if (!w.data || w.data.length !== 1) { out.stopped = { id: r.id, reason: 'version' }; break; }
        out.restored++;
        driftOf(t, Lr, w.data[0]).forEach(d => out.drift.push(Object.assign({ id: r.id }, d)));
      }
    } finally { selfWrite(false); }
    return out;
  };

  /* ---------- số dòng còn sec (mở được) + nút trong 🩺 ---------- */
  SEALT.counts = async sb => {
    const c = {};
    for (const t of TABLES) {
      if (!ready(t)) continue;
      const r = await sb.from(t).select('id,sec').not('sec', 'is', null);
      if (r.error) continue;
      let n = 0, locked = 0;
      for (const x of r.data || []) { try { await CRYPTO.decObj(x.sec); n++; } catch (e) { locked++; } }   // 🔒 không chuyển được: không đếm vào nút
      c[t] = { n, locked };
    }
    return c;
  };
  SEALT.mount = async box => {
    if (!box) return;
    box.innerHTML = '';
    const sb = window.__sb;
    if (!sb || !isAdmin() || !TABLES.some(ready)) return;
    let c; try { c = await SEALT.counts(sb); } catch (e) { return; }
    if (!box.isConnected) return;
    const n = Object.values(c).reduce((s, x) => s + x.n, 0), lk = Object.values(c).reduce((s, x) => s + x.locked, 0);
    box.innerHTML = `<div class="lib-note" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      <span>🔐 ${L('Encrypted data storage format (admin)', 'Định dạng lưu dữ liệu mã hoá (admin)')}:</span>
      ${n ? `<button class="nbtn2" id="hcSeal">${L(`🔐 Convert to per-group seal (${n} rows)`, `🔐 Chuyển sang gói theo nhóm (${n} dòng)`)}</button>` : ''}
      ${lk ? `<span id="hcSealLocked" style="color:var(--muted)">🔒 ${L(`${lk} row(s) cannot be decrypted — kept as they are`, `${lk} dòng không giải mã được — giữ nguyên`)}</span>` : ''}
      <button class="nbtn2 ghost" id="hcSealRestore">${L('♻️ Restore from backup file', '♻️ Khôi phục từ file sao lưu')}</button></div>`;
    const b1 = box.querySelector('#hcSeal'); if (b1) b1.onclick = () => SEALT.open();
    box.querySelector('#hcSealRestore').onclick = () => SEALT.openRestore();
  };

  /* ---------- popup ---------- */
  function toastMsg(msg) {
    if (typeof window.toast === 'function') return window.toast(msg);
    let t = document.querySelector('.mm-toast'); if (!t) { t = document.createElement('div'); t.className = 'mm-toast'; document.body.appendChild(t); }
    t.innerHTML = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2800);
  }
  const REFUSE_MSG = () => L('Only an admin with encryption unlocked (and migration 28a) can convert or restore encrypted data.',
    'Chỉ admin (đã mở khoá mã hoá, máy chủ đã chạy 28a) được chuyển / khôi phục dữ liệu mã hoá.');
  let busy = false;
  function modal(title, sub) {
    let bg = document.getElementById('sealtBg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'sealtBg'; bg.className = 'modal-bg';      // không đóng khi bấm nền / Esc: chỉ ✕
      bg.innerHTML = `<div class="modal wide" style="position:relative"><button class="m-close" id="sealtX" title="${esc(L('Close (stops after the current row)', 'Đóng (dừng sau dòng đang ghi)'))}">✕</button>
        <h4 id="sealtTitle"></h4><div class="m-sub" id="sealtSub"></div><div id="sealtBody"></div></div>`;
      document.body.appendChild(bg);
      bg.querySelector('#sealtX').onclick = () => { if (busy) stopReq = true; bg.classList.remove('show'); };
    }
    bg.querySelector('#sealtTitle').textContent = title;
    bg.querySelector('#sealtSub').textContent = sub;
    bg.classList.add('show');
    return bg.querySelector('#sealtBody');
  }
  const $ = id => document.getElementById(id);
  const STEP = (n, title, inner) => `<div class="sealt-step" id="sealtS${n}" style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin:8px 0">
      <div style="font-weight:600;margin-bottom:6px">${n} · ${title}</div>${inner}</div>`;
  const msgBox = id => `<div id="${id}" style="margin-top:6px;font-size:13px"></div>`;
  const short = i => `<code>${esc(String(i || '').slice(0, 8))}</code>`;
  const idList = ids => ids.slice(0, 50).map(short).join(' ') + (ids.length > 50 ? ' …' : '');
  const errText = e => (e && e.code && WHY()[e.code]) ? why(e.code) : esc((e && (e.message || e.code)) || e);
  const driftHtml = (list, id) => !list || !list.length ? '' : `<div id="${id}" style="color:var(--amber)">⚠ ${L(
      `${new Set(list.map(d => d.id)).size} row(s): the server recalculated planned dates / rating while saving (not caused by the encryption, nothing is blocked):`,
      `${new Set(list.map(d => d.id)).size} dòng: máy chủ tự tính lại ngày dự kiến / đánh giá khi lưu (không do mã hoá, không chặn gì):`)}
      ${list.slice(0, 30).map(d => `<div>${short(d.id)} · ${esc(d.field)}: ${esc(d.a == null ? '—' : d.a)} → ${esc(d.b == null ? '—' : d.b)}</div>`).join('')}${list.length > 30 ? '…' : ''}</div>`;

  SEALT.open = async table => {
    if (!isAdmin() || !TABLES.some(ready)) { toastMsg(REFUSE_MSG()); return false; }
    if (busy) return false;
    const sb = window.__sb;
    let c = {}; try { c = await SEALT.counts(sb); } catch (e) {}
    const cnt = x => (c[x] ? c[x].n : 0);
    const t0 = TABLES.includes(table) && ready(table) ? table : (TABLES.find(t => ready(t) && cnt(t)) || TABLES.find(ready));
    const body = modal(L('🔐 Convert to per-group seal', '🔐 Chuyển sang gói theo nhóm'),
      L('Each table runs on its own. Every step unlocks only after the previous one finishes. Nothing is written until the dry run matches 100%.',
        'Mỗi bảng chạy riêng. Bước sau chỉ mở khi bước trước xong. Không ghi gì nếu chạy thử chưa khớp 100%.'));
    const draw = t => {
      const st = { table: t, data: null, hash: null, name: '', dry: null, done: false };
      SEALT.last = st;
      body.innerHTML = `<div id="sealtTbl" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">${TABLES.filter(ready).map(x =>
          `<button class="nbtn2${x === t ? '' : ' ghost'}" data-t="${x}" id="sealtT_${x}">${esc(TNAME(x))} (${cnt(x)} ${L('rows to convert', 'dòng cần chuyển')})</button>`).join('')}</div>`
        + STEP(1, L('Back up (download the file — still encrypted)', 'Sao lưu (tải file về máy — file vẫn mã hoá)'), `<button class="nbtn2" id="sealtBk">${L('⬇️ Download backup', '⬇️ Tải file sao lưu')}</button>${msgBox('sealtBkMsg')}`)
        + STEP(2, L('Pick the file you just downloaded', 'Chọn lại đúng file vừa tải'), `<input type="file" id="sealtFile" accept=".json,application/json" disabled>${msgBox('sealtFileMsg')}`)
        + STEP(3, L('Dry run', 'Chạy thử'), `<button class="nbtn2" id="sealtDry" disabled>${L('🧪 Dry run', '🧪 Chạy thử')}</button>${msgBox('sealtDryMsg')}`)
        + STEP(4, L('Write', 'Ghi'), `<button class="nbtn2" id="sealtWrite" disabled>${L('💾 Write', '💾 Ghi')}</button> <button class="nbtn2 ghost" id="sealtStop" hidden>${L('⏹ Stop', '⏹ Dừng')}</button>
            <div style="height:8px;border-radius:4px;background:var(--border);margin-top:8px;overflow:hidden"><i id="sealtBar" style="display:block;height:100%;width:0;background:var(--green)"></i></div>${msgBox('sealtWriteMsg')}`)
        + STEP(5, L('Check', 'Kiểm tra'), `<button class="nbtn2" id="sealtVer" disabled>${L('🔎 Check', '🔎 Kiểm tra')}</button>${msgBox('sealtVerMsg')}`);
      const lockTbl = on => body.querySelectorAll('#sealtTbl button').forEach(b => { b.disabled = on; });
      body.querySelectorAll('#sealtTbl button').forEach(b => { b.onclick = () => { if (!busy) draw(b.dataset.t); }; });
      const reset = from => {          // làm lại 1 bước → các bước sau khoá lại
        if (from <= 2) { $('sealtFile').value = ''; $('sealtFileMsg').innerHTML = ''; }
        if (from <= 3) { $('sealtDry').disabled = true; $('sealtDryMsg').innerHTML = ''; st.dry = null; }
        if (from <= 4) { $('sealtWrite').disabled = true; $('sealtWriteMsg').innerHTML = ''; $('sealtBar').style.width = '0'; }
        $('sealtVer').disabled = true; $('sealtVerMsg').innerHTML = ''; st.done = false;
      };
      const err = (id, e) => { $(id).innerHTML = `<span style="color:var(--red)">⛔ ${errText(e)}</span>`; };
      $('sealtBk').onclick = async () => {
        if (busy) return; busy = true; lockTbl(true); reset(2); $('sealtFile').disabled = true;
        try {
          const b = await SEALT.backup(sb, t); Object.assign(st, { data: b.data, hash: b.hash, name: b.name });
          $('sealtBkMsg').innerHTML = `✓ ${L('Downloaded', 'Đã tải')} <b>${esc(b.name)}</b> (${b.data.rows.length} ${L('rows', 'dòng')}). ${L('Keep this file safe.', 'Giữ file này cẩn thận.')}`;
          $('sealtFile').disabled = false;
        } catch (e) { err('sealtBkMsg', e); }
        busy = false; lockTbl(false);
      };
      $('sealtFile').onchange = async () => {
        reset(3);
        const f = $('sealtFile').files && $('sealtFile').files[0];
        if (!f || !st.hash) return;
        const ok = await SEALT.confirmFile(f, st.hash);
        $('sealtFileMsg').innerHTML = ok ? `✓ ${L('This is the file just downloaded.', 'Đúng file vừa tải.')}`
          : `<span style="color:var(--red)">⛔ ${L('This is not the file just downloaded — pick it again.', 'Không phải file vừa tải — chọn lại.')}</span>`;
        $('sealtDry').disabled = !ok;
      };
      $('sealtDry').onclick = async () => {
        if (busy || !st.data) return; busy = true; lockTbl(true); reset(4); $('sealtDry').disabled = true;
        try {
          const d = st.dry = await SEALT.dryRun(t, st.data.rows);
          const k = d.todo.length;
          let h = `<div><b>${d.match}/${k}</b> ${L('rows match', 'dòng khớp')}</div>`
            + `<div style="color:var(--muted)">${L('Skipped', 'Bỏ qua')}: ${d.skip.done.length} ${L('already per-group', 'đã theo nhóm')} · ${d.skip.plain.length} ${L('not encrypted', 'chưa mã hoá')} · 🔒 ${d.skip.locked.length} ${L('cannot be decrypted', 'không giải mã được')}</div>`;
          if (d.skip.locked.length) h += `<div id="sealtLocked">🔒 ${L('Skipped (kept as is)', 'Bỏ qua (giữ nguyên)')}: ${idList(d.skip.locked)}</div>`;
          if (d.bad.length) h += `<div id="sealtBad" style="color:var(--red)">⛔ ${L('Mismatch — writing is locked', 'Lệch — khoá nút Ghi')}: ${d.bad.slice(0, 30).map(b =>
            `<div>${short(b.id)} · ${esc(b.field)}${WHY()[b.field] ? ' — ' + esc(WHY()[b.field]) : ''}</div>`).join('')}${d.bad.length > 30 ? '…' : ''}</div>`;
          if (!k && !d.bad.length) h += `<div>✓ ${L('Nothing left to convert.', 'Không còn dòng nào cần chuyển.')}</div>`;
          $('sealtDryMsg').innerHTML = h;
          $('sealtWrite').disabled = !(k > 0 && !d.bad.length && d.match === k);
        } catch (e) { err('sealtDryMsg', e); }
        $('sealtDry').disabled = false; busy = false; lockTbl(false);
      };
      $('sealtWrite').onclick = async () => {
        if (busy || !st.dry || st.dry.bad.length) return; busy = true; lockTbl(true);
        $('sealtWrite').disabled = true; $('sealtDry').disabled = true; $('sealtBk').disabled = true; $('sealtFile').disabled = true;
        $('sealtStop').hidden = false; $('sealtStop').onclick = () => { stopReq = true; };
        const k = st.dry.todo.length;
        $('sealtWriteMsg').textContent = `0/${k}`;
        let r;
        try {
          r = await SEALT.convert(sb, t, st.dry.todo, (i, n) => { $('sealtBar').style.width = Math.round(i * 100 / n) + '%'; $('sealtWriteMsg').textContent = `${i}/${n}`; });
        } catch (e) { r = { done: [], drift: [], stopped: { id: null, reason: String(e.message || e) } }; }
        st.result = r;
        $('sealtStop').hidden = true; busy = false; lockTbl(false); $('sealtBk').disabled = false;
        if (r.stopped) {
          const at = r.stopped.at || (r.done.length + 1);
          $('sealtWriteMsg').innerHTML = `<span style="color:var(--amber)">⏸ ${L(`Stopped at row ${at}/${k}`, `Dừng ở dòng ${at}/${k}`)} (${short(r.stopped.id)}: ${esc(why(r.stopped.reason))}).
            ${L(`${r.done.length} done; the remaining ${k - r.done.length} are not converted yet.`, `${r.done.length} xong; còn lại ${k - r.done.length} chưa chuyển.`)}
            ${L('Start again from step 1 to finish the rest.', 'Làm lại từ bước 1 để chuyển nốt.')}</span>` + driftHtml(r.drift, 'sealtDriftW');
        } else {
          $('sealtWriteMsg').innerHTML = `✓ ${L(`Written ${r.done.length}/${k} rows.`, `Đã ghi ${r.done.length}/${k} dòng.`)}` + driftHtml(r.drift, 'sealtDriftW');
          st.done = true; $('sealtVer').disabled = false;
        }
        await refreshApp(t);
      };
      $('sealtVer').onclick = async () => {
        if (busy || !st.done) return; busy = true; $('sealtVer').disabled = true;
        try {
          const v = st.verify = await SEALT.verify(sb, t, st.data);
          const dr = (st.result && st.result.drift) || [];
          $('sealtVerMsg').innerHTML = (v.bad.length
            ? `<span style="color:var(--red)">⛔ ${v.ok}/${v.total} ${L('rows OK', 'dòng đạt')}. ${L('Problems', 'Lỗi')}: ${v.bad.slice(0, 30).map(b => `${short(b.id)}·${esc(b.field)}${WHY()[b.field] ? ' (' + esc(WHY()[b.field]) + ')' : ''}`).join(', ')}.
               ${L('Use ♻️ Restore with the backup file.', 'Dùng ♻️ Khôi phục với file sao lưu.')}</span>`
            : `✓ <b>${v.ok}/${v.total}</b> ${L('rows open with the new format and match the backup.', 'dòng mở được bằng định dạng mới, khớp sao lưu.')}`)
            + (dr.length ? driftHtml(dr, 'sealtDriftV') : `<div id="sealtDriftV" style="color:var(--muted)">${L('Planned dates / rating unchanged.', 'Ngày dự kiến / đánh giá không đổi.')}</div>`);
        } catch (e) { err('sealtVerMsg', e); }
        $('sealtVer').disabled = false; busy = false;
      };
    };
    draw(t0);
    return true;
  };

  SEALT.openRestore = () => {
    if (!isAdmin() || !TABLES.some(ready)) { toastMsg(REFUSE_MSG()); return false; }
    if (busy) return false;
    const sb = window.__sb;
    const body = modal(L('♻️ Restore from backup file', '♻️ Khôi phục từ file sao lưu'),
      L('Writes back exactly the encrypted columns stored in the file. First download a backup of the current state and pick it again.',
        'Ghi lại đúng các cột mã hoá trong file. Trước đó tải bản sao lưu hiện trạng và chọn lại file đó.'));
    body.innerHTML = STEP(1, L('Pick a backup file (SaoLuu_MaHoa_…json)', 'Chọn file sao lưu (SaoLuu_MaHoa_…json)'), `<input type="file" id="sealtRsFile" accept=".json,application/json">${msgBox('sealtRsFileMsg')}`)
      + STEP(2, L('Back up the current state', 'Sao lưu hiện trạng'), `<button class="nbtn2" id="sealtRsBk" disabled>${L('⬇️ Download current-state backup', '⬇️ Tải bản sao lưu hiện trạng')}</button>${msgBox('sealtRsBkMsg')}`)
      + STEP(3, L('Pick the current-state file you just downloaded', 'Chọn lại file hiện trạng vừa tải'), `<input type="file" id="sealtRsBkFile" accept=".json,application/json" disabled>${msgBox('sealtRsBkFileMsg')}`)
      + STEP(4, L('Restore', 'Khôi phục'), `<button class="nbtn2" id="sealtRsGo" disabled>${L('♻️ Restore', '♻️ Khôi phục')}</button>${msgBox('sealtRsMsg')}`);
    let data = null, safeHash = null;
    const lockFrom = n => {
      if (n <= 2) { $('sealtRsBk').disabled = true; $('sealtRsBkMsg').innerHTML = ''; safeHash = null; }
      if (n <= 3) { $('sealtRsBkFile').disabled = true; $('sealtRsBkFile').value = ''; $('sealtRsBkFileMsg').innerHTML = ''; }
      $('sealtRsGo').disabled = true; $('sealtRsMsg').innerHTML = '';
    };
    $('sealtRsFile').onchange = async () => {
      data = null; lockFrom(2);
      const f = $('sealtRsFile').files && $('sealtRsFile').files[0]; if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        checkFile(d);
        if (!ready(d.table)) throw refuse('not_ready');
        data = d;
        $('sealtRsFileMsg').innerHTML = `✓ ${esc(TNAME(d.table))} · ${d.rows.length} ${L('rows', 'dòng')} · ${esc(String(d.at || '').slice(0, 16).replace('T', ' '))}`;
        $('sealtRsBk').disabled = false;
      } catch (e) {
        $('sealtRsFileMsg').innerHTML = `<span style="color:var(--red)">⛔ ${L('Not a valid backup file.', 'Không phải file sao lưu hợp lệ.')}</span>`;
      }
    };
    $('sealtRsBk').onclick = async () => {
      if (busy || !data) return; busy = true; lockFrom(3); $('sealtRsBk').disabled = true;
      try {
        const b = await SEALT.backup(sb, data.table);
        safeHash = b.hash;
        $('sealtRsBkMsg').innerHTML = `✓ ${L('Downloaded', 'Đã tải')} <b>${esc(b.name)}</b>. ${L('Pick it again in the next step to confirm it was saved.', 'Chọn lại file này ở bước sau để xác nhận đã lưu.')}`;
        $('sealtRsBkFile').disabled = false;
      } catch (e) { $('sealtRsBkMsg').innerHTML = `<span style="color:var(--red)">⛔ ${errText(e)}</span>`; }
      $('sealtRsBk').disabled = false; busy = false;
    };
    $('sealtRsBkFile').onchange = async () => {
      $('sealtRsGo').disabled = true;
      const f = $('sealtRsBkFile').files && $('sealtRsBkFile').files[0]; if (!f || !safeHash) return;
      const ok = await SEALT.confirmFile(f, safeHash);
      $('sealtRsBkFileMsg').innerHTML = ok ? `✓ ${L('Current-state backup saved.', 'Đã lưu file sao lưu hiện trạng an toàn.')}`
        : `<span style="color:var(--red)">⛔ ${L('This is not the file just downloaded — pick it again.', 'Không phải file vừa tải — chọn lại.')}</span>`;
      $('sealtRsGo').disabled = !ok;
    };
    const show = (r, confirmed) => {
      SEALT.lastRestore = r;
      let h = `<div>✓ ${L('Restored', 'Đã khôi phục')} <b>${r.restored}</b> · ${L('already same as file', 'đã giống file')} ${r.same}${r.missing.length ? ` · ${L('no longer exist', 'không còn')} ${r.missing.length}` : ''}</div>`;
      if (r.stopped) h += `<div id="sealtRsStop" style="color:var(--red)">⛔ ${L('Stopped at', 'Dừng ở')} ${short(r.stopped.id)}: ${esc(why(r.stopped.reason))}</div>`;
      h += driftHtml(r.drift, 'sealtRsDrift');
      if (r.changedSince.length && !confirmed && !r.stopped) {
        h += `<div id="sealtRsChanged" style="color:var(--amber)">⚠ ${L(`${r.changedSince.length} row(s) were edited after the backup and were NOT written`, `${r.changedSince.length} dòng bị sửa sau sao lưu, CHƯA ghi`)}:
          ${r.changedSince.map(x => `<div>${short(x.id)} · v${x.from} → v${x.now}</div>`).join('')}
          <button class="nbtn2" id="sealtRsAll">${L(`Overwrite these ${r.changedSince.length} row(s) with the file too`, `Ghi đè cả ${r.changedSince.length} dòng này bằng file`)}</button></div>`;
      }
      $('sealtRsMsg').innerHTML = h;
      const b = $('sealtRsAll');
      if (b) b.onclick = async () => {
        if (busy) return; busy = true; b.disabled = true;
        let r2; try { r2 = await SEALT.restore(sb, data, { confirmChanged: true }); } catch (e) { r2 = null; $('sealtRsMsg').innerHTML += `<div style="color:var(--red)">⛔ ${errText(e)}</div>`; }
        busy = false;
        if (r2) { show(r2, true); await refreshApp(data.table); }
      };
    };
    $('sealtRsGo').onclick = async () => {
      if (busy || !data || $('sealtRsGo').disabled) return; busy = true; $('sealtRsGo').disabled = true; $('sealtRsFile').disabled = true;
      let r = null;
      try { r = await SEALT.restore(sb, data, { confirmChanged: false }); }
      catch (e) { $('sealtRsMsg').innerHTML = `<span style="color:var(--red)">⛔ ${errText(e)}</span>`; }
      busy = false; $('sealtRsFile').disabled = false;
      if (r) { show(r, false); await refreshApp(data.table); }
    };
    return true;
  };
})();
