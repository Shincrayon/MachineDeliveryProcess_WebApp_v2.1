/* =====================================================================
   users_admin.js — cửa sổ 👥 Quản lý người dùng của admin (window.UA).
   - Mọi thao tác ghi đi qua Edge Function manage-users (giữ service role, tự kiểm tra admin). Ẩn nút chỉ là giao diện.
   - UA.call(action, body) -> { data } hoặc { code }: code khớp bảng MSG; không gọi được hàm -> no_function.
   - Mật khẩu tạm chỉ hiện trong #uaNew, nằm ngoài bảng được vẽ lại; đóng cửa sổ là mất.
   - Chạy sau mainSrc nên dùng chung tr, openM, mTitle/mSub/mBody, window.__sb, window.__userEmail.
   ===================================================================== */
(function () {
  const UA = window.UA = {};
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const low = v => String(v == null ? '' : v).trim().toLowerCase();
  const el = id => document.getElementById(id);
  const ROLES = () => [['viewer', tr('Viewer', 'Chỉ xem')], ['catalog_editor', tr('Catalog editor', 'Sửa Danh mục')], ['editor', tr('Editor', 'Sửa cả 2 phân hệ')], ['admin', 'Admin']];
  const fmtTime = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString(tr('en-GB', 'vi-VN'), { dateStyle: 'short', timeStyle: 'short' }); };

  const MSG = {
    bad_origin: () => tr('User management only works on the main app link.', 'Quản lý người dùng chỉ dùng được trên link chính của app.'),
    no_auth: () => tr('Your session has expired. Sign out and sign in again.', 'Phiên đăng nhập đã hết hạn. Hãy đăng xuất rồi đăng nhập lại.'),
    forbidden: () => tr('Only an admin can do this.', 'Chỉ admin mới làm được việc này.'),
    bad_request: () => tr('Please enter a valid email.', 'Hãy nhập email hợp lệ.'),
    bad_role: () => tr('This permission is not valid.', 'Quyền này không hợp lệ.'),
    email_not_allowed: () => tr('This email is not allowed. Use a company email.', 'Email này không được phép. Hãy dùng email công ty.'),
    already_exists: () => tr('This person already has an account and a permission. Change the permission in their row.', 'Người này đã có tài khoản và quyền. Hãy đổi quyền ở dòng của họ.'),
    self_action: () => tr('You cannot do this to your own account. Use 🔑 to change your password.', 'Không làm được với chính tài khoản của bạn. Đổi mật khẩu của mình bằng nút 🔑.'),
    not_found: () => tr('This person was not found. Reopen the window to refresh the list.', 'Không tìm thấy người này. Hãy mở lại cửa sổ để tải lại danh sách.'),
    revoked_account_left: () => tr('Permission removed, but the login account could not be deleted. Press Revoke on this row again.', 'Đã cắt quyền nhưng chưa xoá được tài khoản đăng nhập. Hãy bấm Thu hồi ở dòng này lần nữa.'),
    internal: () => tr('The server hit an error. Try again in a few minutes.', 'Máy chủ gặp lỗi. Hãy thử lại sau ít phút.'),
    no_function: () => tr('Could not reach user management (manage-users). The function may not be deployed, the network may be down, or this is not the main app link.',
                          'Chưa kết nối được chức năng quản lý người dùng (manage-users). Có thể hàm chưa được đưa lên Supabase, mạng đang lỗi, hoặc đây không phải link chính của app.'),
  };
  UA.call = async (action, body) => {
    try {
      const { data, error } = await window.__sb.functions.invoke('manage-users', { body: { action, ...body } });
      if (!error) return { data };
      if (!error.context) return { code: 'no_function' };
      let j = null;
      try { j = await error.context.json(); } catch (e) {}
      if (j && MSG[j.code]) return { code: j.code };
      const st = error.context.status;              // cổng của Supabase chặn trước khi tới hàm: không có mã của ta
      return { code: st === 401 ? 'no_auth' : st === 404 || !j ? 'no_function' : 'internal' };
    } catch (e) { return { code: 'no_function' }; }
  };

  function setMsg(text, kind) {
    const m = el('uaMsg'); if (!m) return;
    m.textContent = text || '';
    m.style.color = kind === 'ok' ? 'var(--green)' : kind === 'warn' ? 'var(--amber)' : 'var(--red)';
  }
  const LOG_WARN = () => tr('Done, but it could not be written to the log.', 'Đã làm xong nhưng chưa ghi được vào nhật ký.');
  /* kết quả 1 thao tác: true nếu thành công; báo lỗi / cảnh báo nhật ký */
  function outcome(r, okText) {
    if (r.code) { setMsg(MSG[r.code]()); return false; }
    if (r.data && r.data.log_failed) setMsg(LOG_WARN(), 'warn'); else setMsg(okText || '', 'ok');
    return true;
  }

  function showNew(email, password) {
    const link = location.origin + '/';
    /* thêm khung mới, không đè: thêm liền nhiều người vẫn còn mật khẩu của người trước */
    el('uaNew').insertAdjacentHTML('afterbegin', `<div class="m-ok ua-new">
      <b>${esc(email)}</b><div class="ua-pw"><code>${esc(password)}</code>
      <button type="button" class="nbtn2 ua-copy">${tr('📋 Copy', '📋 Sao chép')}</button></div>
      <small>${tr('Temporary password, shown only once. The person must change it at first sign-in.', 'Mật khẩu tạm, chỉ hiện một lần. Người đó sẽ phải đổi khi đăng nhập lần đầu.')}<br>
      ${tr('Send the data password separately. The app does not send it.', 'Hãy gửi riêng mật khẩu dữ liệu. App không gửi hộ.')}</small></div>`);
    const btn = el('uaNew').querySelector('.ua-copy');
    btn.onclick = async () => {
      const text = tr(`App: ${link}\nEmail: ${email}\nTemporary password: ${password}\nYou will be asked to change it at first sign-in.`,
                      `App: ${link}\nEmail: ${email}\nMật khẩu tạm: ${password}\nBạn sẽ được yêu cầu đổi mật khẩu khi đăng nhập lần đầu.`);
      try { await navigator.clipboard.writeText(text); btn.textContent = tr('✓ Copied', '✓ Đã chép'); }
      catch (e) { btn.textContent = tr('⚠ Copy blocked, copy by hand', '⚠ Trình duyệt chặn, hãy chép tay'); }
    };
  }

  function rowHtml(u) {
    const self = low(u.email) === low(window.__userEmail);
    const opts = (u.role ? '' : `<option value="" selected>—</option>`) + ROLES().map(([v, l]) => `<option value="${v}"${v === u.role ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const tag = u.status === 'no_account' ? `<small class="ua-tag">${tr('no account yet', 'chưa có tài khoản')}</small>`
              : u.status === 'no_role' ? `<small class="ua-tag">${tr('no permission yet', 'chưa có quyền')}</small>` : '';
    const btn = (act, label) => `<button type="button" data-act="${act}" data-label="${esc(label)}">${esc(label)}</button>`;
    const acts = self ? `<small class="ua-tag">${tr('you', 'bạn')}</small>`
      : (u.status === 'no_account' ? `<button type="button" data-act="create">${tr('Create account', 'Tạo tài khoản')}</button>` : '')
      + (u.status === 'ok' ? btn('reset_password', tr('Reset password', 'Đặt lại mật khẩu')) : '')
      + btn('revoke', tr('Revoke', 'Thu hồi'));
    return `<tr data-em="${esc(u.email)}">
      <td data-l="Email">${esc(u.email)}${tag}</td>
      <td data-l="${tr('Name', 'Họ tên')}">${esc(u.ho_ten || '')}</td>
      <td data-l="${tr('Permission', 'Quyền')}"><select data-old="${esc(u.role || '')}"${self ? ' disabled' : ''} aria-label="${tr('Permission', 'Quyền')}">${opts}</select></td>
      <td data-l="${tr('Last sign-in', 'Đăng nhập gần nhất')}">${u.last_sign_in_at ? esc(fmtTime(u.last_sign_in_at)) : '—'}</td>
      <td class="act">${acts}</td></tr>`;
  }
  async function loadList() {
    const r = await UA.call('list');
    const box = el('uaList'); if (!box) return;
    if (r.code) { box.innerHTML = ''; setMsg(MSG[r.code]()); return; }
    box.innerHTML = `<table><thead><tr><th>Email</th><th>${tr('Name', 'Họ tên')}</th><th>${tr('Permission', 'Quyền')}</th><th>${tr('Last sign-in', 'Đăng nhập gần nhất')}</th><th></th></tr></thead>
      <tbody>${r.data.users.map(rowHtml).join('')}</tbody></table>`;
    r.data.users.forEach(u => {
      const tr_ = box.querySelector(`tr[data-em="${CSS.escape(u.email)}"]`); if (!tr_) return;
      const sel = tr_.querySelector('select');
      sel.onchange = () => changeRole(u, sel);
      tr_.querySelectorAll('button[data-act]').forEach(b => { b.onclick = () => rowAction(u, b); });
    });
  }
  async function changeRole(u, sel) {
    sel.disabled = true;
    const r = await UA.call('set_role', { email: u.email, role: sel.value });
    sel.disabled = false;
    if (!outcome(r, tr('Permission saved.', 'Đã lưu quyền.'))) { sel.value = sel.dataset.old; return; }
    loadList();
  }
  async function rowAction(u, b) {
    const act = b.dataset.act;
    if (act !== 'create' && !b.classList.contains('ask')) {          // bấm lần 2 mới làm, giống nút xoá đợt thanh toán
      b.classList.add('ask'); b.textContent = tr('Sure?', 'Chắc chưa?');
      setTimeout(() => { b.classList.remove('ask'); b.textContent = b.dataset.label; }, 4000);
      return;
    }
    b.disabled = true;
    const r = act === 'create' ? await UA.call('create', { email: u.email, ho_ten: u.ho_ten, role: u.role || 'viewer' })
                               : await UA.call(act, { email: u.email });
    b.disabled = false;
    if (r.code === 'revoked_account_left') { setMsg(MSG[r.code]()); loadList(); return; }
    if (!outcome(r)) return;
    if (r.data.password) showNew(u.email, r.data.password);
    loadList();
  }
  async function addUser(e) {
    e.preventDefault();
    const email = el('uaEmail').value.trim();
    if (!email) return setMsg(MSG.bad_request());
    const add = el('uaAdd');
    add.disabled = true;
    const r = await UA.call('create', { email, ho_ten: el('uaName').value.trim(), role: el('uaRole').value });
    add.disabled = false;
    if (!outcome(r, tr('Permission granted. The person keeps their current password.', 'Đã cấp quyền. Người này giữ mật khẩu hiện có.'))) return;
    if (r.data.password) { showNew(low(email), r.data.password); if (!r.data.log_failed) setMsg(''); }
    el('uaEmail').value = ''; el('uaName').value = ''; el('uaRole').value = 'viewer';
    loadList();
  }
  async function loadLog() {
    const box = el('uaLogB');
    const { data, error } = await window.__sb.from('user_admin_log').select('*').order('at', { ascending: false }).limit(50);
    if (error) { box.textContent = tr('Could not load the log. Migration 15 may not have been run.', 'Không tải được nhật ký. Có thể chưa chạy migration 15.'); return; }
    const LBL = { create: tr('Added', 'Thêm'), set_role: tr('Changed permission', 'Đổi quyền'), reset_password: tr('Reset password', 'Đặt lại mật khẩu'), revoke: tr('Revoked', 'Thu hồi') };
    box.innerHTML = (data || []).map(x => { const d = x.detail || {};
      return `<div>${esc(fmtTime(x.at))} · ${esc(x.actor_email)} · ${esc(LBL[x.action] || x.action)} · <b>${esc(x.target_email)}</b>${d.to ? ` (${esc(d.from || '—')} → ${esc(d.to)})` : ''}</div>`; }).join('')
      || tr('No entries yet.', 'Chưa có dòng nào.');
  }

  /* mật khẩu tạm (admin biết) phải đổi trước khi vào app. Chạy trước mainSrc nên có bảng lỗi riêng, không dùng được pwErrText.
     Đây là bước buộc trong giao diện, không phải lớp bảo mật ở database. */
  UA.forceChangePw = (sb, user, card, signOut) => {
    if (!user || !user.user_metadata || user.user_metadata.must_change_pw !== true) return Promise.resolve();
    return new Promise(done => {
      const bg = card(`<h2>${tr('🔑 Set your own password', '🔑 Đặt mật khẩu của bạn')}</h2>
        <p>${tr('You signed in with a temporary password. Choose a new one to continue.', 'Bạn vừa đăng nhập bằng mật khẩu tạm. Hãy đặt mật khẩu mới để tiếp tục.')} <span style="color:var(--muted)">${esc(user.email)}</span></p>
        <form id="fcForm" novalidate style="display:contents">
          <label>${tr('New password (at least 6 characters)', 'Mật khẩu mới (tối thiểu 6 ký tự)')}<input id="fcP1" type="password" autocomplete="new-password"></label>
          <label>${tr('Confirm new password', 'Nhập lại mật khẩu mới')}<input id="fcP2" type="password" autocomplete="new-password"></label>
          <div class="err" id="fcErr"></div>
          <button type="submit" id="fcBtn">${tr('💾 Save and continue', '💾 Lưu và tiếp tục')}</button>
        </form>
        <button type="button" id="fcOut" style="background:none;color:var(--muted);font-weight:400">${tr('Sign out', 'Đăng xuất')}</button>`);
      const err = t => { bg.querySelector('#fcErr').textContent = t; };
      bg.querySelector('#fcOut').onclick = async () => { await signOut(); location.reload(); };
      bg.querySelector('#fcForm').onsubmit = async e => {
        e.preventDefault();
        const a = bg.querySelector('#fcP1').value, b = bg.querySelector('#fcP2').value, btn = bg.querySelector('#fcBtn');
        if (a.length < 6) return err(tr('The password must be at least 6 characters.', 'Mật khẩu phải có ít nhất 6 ký tự.'));
        if (a !== b) return err(tr('The two passwords do not match.', 'Hai mật khẩu không khớp.'));
        btn.disabled = true; err('');
        try {
          const { error } = await sb.auth.updateUser({ password: a, data: { must_change_pw: false } });
          if (error) throw error;
          bg.remove(); done();
        } catch (ex) {
          btn.disabled = false;
          const c = ex && ex.code, m = String(ex && ex.message || '');
          err(c === 'same_password' || /different from the old/i.test(m) ? tr('The new password must be different from the temporary one.', 'Mật khẩu mới phải khác mật khẩu tạm.')
            : c === 'weak_password' || /weak|at least/i.test(m) ? tr('This password is too weak. Use a longer one with letters and numbers.', 'Mật khẩu quá yếu. Hãy dùng mật khẩu dài hơn, có cả chữ và số.')
            : tr('Could not save the password. Check your connection and try again.', 'Chưa lưu được mật khẩu. Hãy kiểm tra mạng rồi thử lại.'));
        }
      };
    });
  };

  UA.open = () => {
    mTitle.textContent = tr('👥 Manage users', '👥 Quản lý người dùng');
    mSub.textContent = tr('Add people, change permissions, reset passwords, revoke access.', 'Thêm người, đổi quyền, đặt lại mật khẩu, thu hồi quyền.');
    mBody.innerHTML = `<div class="ua-scroll"><form id="uaForm" class="add-grid ua-form" novalidate>
        <label>Email<input id="uaEmail" type="email" autocomplete="off"></label>
        <label>${tr('Name', 'Họ tên')}<input id="uaName" type="text" autocomplete="off"></label>
        <label>${tr('Permission', 'Quyền')}<select id="uaRole">${ROLES().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
        <button type="submit" class="nbtn2" id="uaAdd">${tr('➕ Add', '➕ Thêm')}</button>
      </form>
      <div id="uaMsg" class="ua-msg"></div>
      <div id="uaNew"></div>
      <div id="uaList" class="pay-tbl ua-tbl"></div>
      <details id="uaLog" class="ua-log"><summary>${tr('Log (latest 50)', 'Nhật ký (50 dòng mới nhất)')}</summary><div id="uaLogB"></div></details></div>`;
    el('uaForm').onsubmit = addUser;
    el('uaLog').ontoggle = () => { if (el('uaLog').open) loadLog(); };
    openM(true);
    loadList();
  };
})();
