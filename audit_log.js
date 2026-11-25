/* audit_log.js — 📜 Nhật ký thao tác (chỉ admin, 2026-11-23). window.AL. Chỉ ĐỌC: không ghi gì vào DB.
   Gộp nhiều nguồn, mới nhất trên cùng. AL.sources: mảng { key, label(), fetch(before, n) } — fetch trả tối đa n Row có at < before
   (before = null: không lọc), xếp at giảm dần. Đợt 2 push thêm nguồn change_requests vào AL.sources.
   Row = { key, at, who, module: 'delivery'|'mmtb'|'users', kind: 'insert'|'update'|'delete'|'trash'|'restore'|'user', title, html, act?, code? }
     key: duy nhất trong mọi nguồn (vd 'audit_log:12') — dùng để không lặp dòng khi tải thêm; act: nhãn hành động riêng (nguồn users).
   Tải thêm: mỗi nguồn nhớ con trỏ riêng = at của dòng cuối nó đã trả + 1 ms, bỏ dòng đã thấy theo key. Nhiều dòng cùng 1 thời điểm
   (vd nạp Excel: cả lệnh chung 1 now()) vẫn không mất: trang đầy mà không có dòng mới thì lấy trang to gấp đôi.
   Lọc (phân hệ / người / thao tác / ngày / tìm máy không dấu) chạy trên các dòng đã tải, không gọi lại máy chủ.
   Cần: tr, fmtDT, escH, openM, mTitle/mSub/mBody (index.html), window.__open (giải mã), window.__histRow + __dvHist (Tiến độ) + __mmHist (Danh mục), DM.fold. */
(function(){
  'use strict';
  const AL = window.AL = { busy: false, sources: [] };
  const N = () => Number(window.AL_PAGE) || 200;
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fold = v => (window.DM && DM.fold) ? DM.fold(v) : String(v || '').toLowerCase();
  const LOCK = () => tr('(could not decrypt)', '(không giải mã được)');
  const MOD = () => ({ delivery: tr('Delivery', 'Tiến độ'), mmtb: tr('Catalog', 'Danh mục'), users: tr('Users', 'Người dùng') });
  const KIND = () => ({ insert: tr('Added', 'Thêm máy'), update: tr('Edited', 'Sửa'), delete: tr('Deleted permanently', 'Xoá hẳn'),
    trash: tr('Moved to trash', 'Chuyển vào thùng rác'), restore: tr('Restored', 'Khôi phục'), user: tr('User management', 'Quản lý người dùng') });
  const UA_LBL = () => ({ create: tr('Added', 'Thêm'), set_role: tr('Changed permission', 'Đổi quyền'), set_perms: tr('Set permissions', 'Đặt quyền chi tiết'),
    reset_password: tr('Reset password', 'Đặt lại mật khẩu'), revoke: tr('Revoked', 'Thu hồi') });
  const txt = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const pick = (...vs) => vs.find(v => v != null && v !== '' && v !== '🔒') || '';

  /* ---- nguồn 1: audit_log (2 phân hệ, giải mã trong trình duyệt) ---- */
  async function auditRow(h){
    const o = h.old_data ? await window.__open(h.old_data) : null, n = h.new_data ? await window.__open(h.new_data) : null;
    const locked = !!((o && o.__locked) || (n && n.__locked));
    const mm = /^MMTB_/.test(h.action || ''), A = String(h.action || '').replace(/^MMTB_/, '');
    const oo = o || {}, nn = n || {};
    const kind = A === 'INSERT' ? 'insert' : A === 'DELETE' ? 'delete'
      : nn.deleted_at && !oo.deleted_at ? 'trash' : oo.deleted_at && !nn.deleted_at ? 'restore' : 'update';
    const name = mm ? pick(nn.name, oo.name) : pick(nn.ten, oo.ten, h.ten);
    const code = mm ? pick(h.ten, nn.machine_code, oo.machine_code) : pick(nn.ma_may, oo.ma_may);
    let html;
    if(locked) html = `<div class="al-lock">${esc(LOCK())}</div>`;
    else if(kind !== 'update') html = `<div class="al-none">${esc(tr('No field-by-field comparison for this action.', 'Thao tác này không có so sánh từng trường.'))}</div>`;
    else {
      const r = Object.assign({}, h, { old_data: o, new_data: n });
      html = mm ? window.__histRow(r, window.__mmHist.keys([r]), window.__mmHist.lbl, window.__mmHist.val)
                : window.__histRow(r, window.__dvHist.keys(), window.__dvHist.lbl);
    }
    const title = (name || code || (locked ? '' : tr('(no name)', '(không tên)'))) + (locked ? (name || code ? ' · ' : '') + LOCK() : '');
    return { key: 'audit_log:' + h.id, at: h.at, who: h.user_email || '', module: mm ? 'mmtb' : 'delivery', kind, title, code: name ? code : '', html };
  }
  AL.sources.push({ key: 'audit_log', label: () => tr('Machine data', 'Dữ liệu máy'),
    fetch: async (before, n) => {
      let q = window.__sb.from('audit_log').select('id,at,user_email,action,machine_id,ten,old_data,new_data');
      if(before) q = q.lt('at', before);
      const { data, error } = await q.order('at', { ascending: false }).order('id', { ascending: false }).limit(n);
      if(error) throw error;
      const out = [];
      for(const h of data || []) out.push(await auditRow(h));
      return out;
    } });

  /* ---- nguồn 2: user_admin_log (chuyển từ 👥 sang, 2026-11-23) ---- */
  AL.sources.push({ key: 'user_admin_log', label: () => tr('User management', 'Quản lý người dùng'),
    fetch: async (before, n) => {
      let q = window.__sb.from('user_admin_log').select('*');
      if(before) q = q.lt('at', before);
      const { data, error } = await q.order('at', { ascending: false }).order('id', { ascending: false }).limit(n);
      if(error) throw error;
      return (data || []).map(x => { const d = x.detail || {}, act = UA_LBL()[x.action] || x.action;
        return { key: 'user_admin_log:' + x.id, at: x.at, who: x.actor_email || '', module: 'users', kind: 'user', act, title: x.target_email || '',
          html: `<div class="hx-ch">${esc(act)} · <b>${esc(x.target_email)}</b>${d.to != null ? `: <s>${esc(txt(d.from) || '—')}</s> → <ins>${esc(txt(d.to))}</ins>` : ''}</div>` }; });
    } });

  /* ---- gộp + tải thêm ---- */
  let S = [], ROWS = [], openK = new Set(), errs = [];
  const tms = at => { const t = Date.parse(at); return isNaN(t) ? 0 : t; };
  async function fill(s){
    let lim = N();
    for(let i = 0; i < 12; i++){
      const rows = await s.src.fetch(s.before, lim);
      const fresh = rows.filter(r => !s.seen.has(r.key));
      fresh.forEach(r => s.seen.add(r.key)); s.buf.push(...fresh);
      if(rows.length < lim){ s.done = true; return; }
      if(fresh.length){ s.before = new Date(tms(rows[rows.length - 1].at) + 1).toISOString(); return; }
      lim *= 2;                                  // cả trang trùng thời điểm đã thấy: lấy trang to hơn
    }
    s.done = true;
  }
  async function more(){
    if(AL.busy) return;
    AL.busy = true; draw();
    const n = N(), out = [];
    try{
      while(out.length < n){
        await Promise.all(S.filter(s => !s.buf.length && !s.done).map(s => fill(s).catch(e => {
          s.done = true; errs.push(s.src.label() + ': ' + ((e && e.message) || e)); })));
        const live = S.filter(s => s.buf.length); if(!live.length) break;
        let best = live[0];
        for(const s of live) if(tms(s.buf[0].at) > tms(best.buf[0].at)) best = s;
        out.push(best.buf.shift());
      }
      ROWS.push(...out);
    } finally { AL.busy = false; }
    draw();
  }
  const hasMore = () => S.some(s => s.buf.length || !s.done);

  /* ---- lọc + vẽ ---- */
  const v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  const day = at => { const d = new Date(at); return isNaN(d) ? '' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function shown(){
    const m = v('alMod'), w = v('alWho'), k = v('alKind'), f = v('alFrom'), t = v('alTo'), q = fold(v('alQ'));
    return ROWS.filter(r => (!m || r.module === m) && (!w || r.who === (w === '-' ? '' : w)) && (!k || r.kind === k)
      && (!f || day(r.at) >= f) && (!t || day(r.at) <= t) && (!q || fold(r.title + ' ' + (r.code || '')).includes(q)));
  }
  const COL = { insert: 'var(--green)', restore: 'var(--green)', delete: 'var(--red)', trash: 'var(--red)', update: 'var(--blue)', user: 'var(--violet)' };
  const rowHTML = r => `<details class="al-row" data-k="${esc(r.key)}" data-m="${esc(r.module)}" data-w="${esc(r.who)}"${openK.has(r.key) ? ' open' : ''}>
    <summary><span class="al-at">${esc(fmtDT(r.at))}</span><span class="al-who">${esc(r.who || tr('Admin (SQL)', 'Quản trị (SQL)'))}</span>`
    + `<span class="al-act" style="color:${COL[r.kind] || 'var(--muted)'}">${esc(r.act || KIND()[r.kind] || r.kind)}</span>`
    + `<span class="al-t">${esc(r.title)}${r.code ? ` <small>${esc(r.code)}</small>` : ''}</span><span class="al-mod">${esc(MOD()[r.module] || r.module)}</span></summary>
    <div class="al-body">${r.html}</div></details>`;
  function whoOpts(){
    const sel = document.getElementById('alWho'); if(!sel) return;
    const cur = sel.value, ws = [...new Set(ROWS.map(r => r.who))].sort();
    sel.innerHTML = `<option value="">${esc(tr('Everyone', 'Mọi người'))}</option>`
      + ws.map(w => `<option value="${w ? esc(w) : '-'}">${esc(w || tr('Admin (SQL)', 'Quản trị (SQL)'))}</option>`).join('');
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : '';
  }
  function draw(){
    const list = document.getElementById('alList'); if(!list) return;
    const more = document.getElementById('alMore'), cnt = document.getElementById('alCount');
    if(AL.busy && !ROWS.length){ list.innerHTML = window.MO ? MO.skel(6) : `<div class="al-none">${esc(tr('Loading…', 'Đang tải…'))}</div>`; }
    else {
      whoOpts();
      const rs = shown();
      list.innerHTML = rs.length ? rs.map(rowHTML).join('')
        : `<div class="al-none">${esc(ROWS.length ? tr('No rows match the filters.', 'Không có dòng nào khớp bộ lọc.')
            + (hasMore() ? tr(' — press Load more to search older rows', ' — bấm Tải thêm để tìm trong dòng cũ hơn') : '') : tr('No entries yet.', 'Chưa có dòng nào.'))}</div>`;
      cnt.textContent = tr(`Showing ${rs.length} of ${ROWS.length} loaded rows`, `Đang hiện ${rs.length} / ${ROWS.length} dòng đã tải`)
        + (hasMore() ? '' : tr(' · all loaded', ' · đã tải hết'));
    }
    const er = document.getElementById('alErr'); if(er){ er.hidden = !errs.length; er.textContent = errs.join(' · '); }
    more.hidden = !hasMore(); more.disabled = AL.busy;
    more.textContent = AL.busy ? tr('Loading…', 'Đang tải…') : tr(`Load ${N()} more`, `Tải thêm ${N()} dòng`);
  }

  AL.open = async () => {
    if(window.__role !== 'admin' || !window.__sb || AL.busy) return;     // nhật ký chỉ admin (RLS audit_log + user_admin_log cũng chặn); đang tải thì bỏ qua bấm lần 2
    S = AL.sources.map(src => ({ src, before: null, seen: new Set(), buf: [], done: false })); ROWS = []; openK = new Set(); errs = [];
    const o = (val, en, vi) => `<option value="${val}">${esc(tr(en, vi))}</option>`;
    mTitle.textContent = tr('📜 Activity log', '📜 Nhật ký');
    mSub.textContent = tr('Who changed what and when — newest first, read-only. Filters apply to the rows loaded so far.',
                          'Ai sửa gì, lúc nào — mới nhất ở trên, chỉ đọc. Bộ lọc áp trên các dòng đã tải.');
    mBody.innerHTML = `<div class="al-wrap"><div class="al-bar">
        <select id="alMod" aria-label="${esc(tr('Module', 'Phân hệ'))}">${o('', 'All modules', 'Mọi phân hệ')}${o('delivery', 'Delivery tracking', 'Tiến độ máy về')}${o('mmtb', 'Machine catalog', 'Danh mục máy')}${o('users', 'Users', 'Người dùng')}</select>
        <select id="alWho" aria-label="${esc(tr('Done by', 'Người thực hiện'))}"></select>
        <select id="alKind" aria-label="${esc(tr('Action', 'Thao tác'))}">${o('', 'All actions', 'Mọi thao tác')}${o('insert', 'Added', 'Thêm máy')}${o('update', 'Edited', 'Sửa')}${o('trash', 'Moved to trash', 'Thùng rác')}${o('restore', 'Restored', 'Khôi phục')}${o('delete', 'Deleted permanently', 'Xoá hẳn')}${o('user', 'User management', 'Quản lý người dùng')}</select>
        <input id="alFrom" class="al-date" placeholder="${esc(tr('From date', 'Từ ngày'))}" aria-label="${esc(tr('From date', 'Từ ngày'))}">
        <input id="alTo" class="al-date" placeholder="${esc(tr('To date', 'Đến ngày'))}" aria-label="${esc(tr('To date', 'Đến ngày'))}">
        <button type="button" class="nbtn2 ghost al-clear" id="alClear">${esc(tr('✕ Clear filters', '✕ Bỏ lọc'))}</button>
        <input id="alQ" type="search" autocomplete="off" placeholder="${esc(tr('Find machine…', 'Tìm máy…'))}" title="${esc(tr('Find machine by name or code', 'Tìm máy theo tên hoặc mã'))}">
      </div>
      <div class="al-count" id="alCount"></div><div class="m-gt al-err" id="alErr" hidden></div>
      <div class="al-list" id="alList"></div>
      <button type="button" class="nbtn2 ghost al-more" id="alMore" hidden></button></div>`;
    ['alMod', 'alWho', 'alKind', 'alFrom', 'alTo'].forEach(id => { document.getElementById(id).onchange = draw; });
    document.getElementById('alQ').oninput = draw;
    document.getElementById('alMore').onclick = more;
    document.getElementById('alList').addEventListener('toggle', e => {        // giữ dòng đang mở khi lọc / tải thêm
      const d = e.target; if(!d.dataset || !d.dataset.k) return; d.open ? openK.add(d.dataset.k) : openK.delete(d.dataset.k); }, true);
    const fps = !window.flatpickr ? [] : ['alFrom', 'alTo'].map(id => flatpickr(document.getElementById(id), { dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y',
      allowInput: false, disableMobile: true, onChange: draw, locale: (LANG === 'vi' && flatpickr.l10ns && flatpickr.l10ns.vn) ? 'vn' : 'default' }));
    fps.forEach(fp => fp.altInput && fp.altInput.addEventListener('keydown', e => {   // Delete / Backspace xoá ngày (như ⚡)
      if(e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); fp.clear(); fp.close(); draw(); } }));
    document.getElementById('alClear').onclick = () => {                 // bỏ mọi lọc: phân hệ, người, thao tác, ngày, ô tìm
      ['alMod', 'alWho', 'alKind', 'alQ', 'alFrom', 'alTo'].forEach(id => { document.getElementById(id).value = ''; });
      fps.forEach(fp => fp.clear());
      draw();
    };
    openM(1);
    await more();
  };
})();
