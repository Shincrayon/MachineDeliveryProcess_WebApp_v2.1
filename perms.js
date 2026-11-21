/* =====================================================================
   perms.js — phân quyền từng người (window.PERM). Nạp sau config.js, trước script chính của index.html.
   - REG: danh mục khoá (tab / nút / nhóm trường) của 2 phân hệ: mmtb = Danh mục máy, delivery = Tiến độ máy về.
     THÊM TRƯỜNG MỚI vào form / cột Danh sách thì phải đăng ký vào nhóm tương ứng ở đây (không đăng ký = người không phải admin không thấy).
   - perms (cột app_users.perms): { mmtb:{tabs,actions,view,edit}, delivery:{...} }; phần tử "*" = tất cả.
     perms = null: người cũ chưa cấu hình → dùng PERM.defaults(role) (đúng như quy tắc theo role trước đây).
   - Quy tắc: edit ⇒ see · viewer không bao giờ sửa/ghi · admin mọi thứ · khoá lạ bỏ qua · Thư viện (c3): admin + người cũ chưa cấu hình (editor / catalog_editor, perms null); người đã cấu hình chỉ admin (không tick được).
   - Chỉ là giao diện: máy chủ chặn ghi ở mức phân hệ bằng perm_can_write() (migration 22).
   ===================================================================== */
(function () {
  const lang = () => { try { return localStorage.getItem('tdmv_lang') === 'vi' ? 'vi' : 'en'; } catch (e) { return 'en'; } };
  const T = (k, en, vi) => ({ k, en, vi });
  const G = (k, en, vi, fields) => ({ k, en, vi, fields });
  const A = (k, en, vi, write) => ({ k, en, vi, write });

  /* nút ghi (chỉ editor) + nút chỉ đọc (viewer tick được), RIÊNG từng phân hệ (chỉ liệt kê nút thật sự có ở phân hệ đó). Phải khớp perm_can_write() trong migration 22.
     🏷 Gán mã không có ở đây: máy chủ (assign_machine_codes) chỉ cho admin, UI chỉ hiện cho admin. */
  const ACT = {
    export: A('export', 'Export Excel', 'Xuất Excel', false),
    add: A('add', 'Add', 'Thêm', true), edit: A('edit', 'Edit', 'Sửa', true), delete: A('delete', 'Delete', 'Xoá', true),
    import: A('import', 'Import Excel', 'Nạp Excel', true), quick: A('quick', 'Quick update', 'Cập nhật nhanh', true),
    clone: A('clone', 'Clone', 'Nhân bản', true), split: A('split', 'Split', 'Tách máy', true),
    confirm: A('confirm', 'Confirm arrival', 'Xác nhận về', true),
    arrange: A('arrange', 'Arrange (drag & drop)', 'Sắp xếp (kéo thả)', true), payment: A('payment', 'Payments', 'Thanh toán', true)
  };
  const ACTS = {
    mmtb: ['add', 'edit', 'delete', 'clone', 'split', 'arrange'],
    delivery: ['export', 'add', 'edit', 'delete', 'import', 'quick', 'clone', 'confirm', 'payment']
  };
  const actionsOf = m => ACTS[m].map(k => Object.assign({}, ACT[k]));
  const writeOf = m => ACTS[m].filter(k => ACT[k].write);

  const REG = {
    mmtb: {
      tabs: [T('c1', 'Overview', 'Tổng quan'), T('c2', 'Machines', 'Danh sách'), T('c4', 'Arrange', 'Sắp xếp')],
      actions: actionsOf('mmtb'),
      groups: [
        G('name', 'Machine name', 'Tên máy', ['name', 'alias_names']),
        G('code', 'Machine code', 'Mã máy', ['machine_code', 'legacy_code', 'asset_code']),
        G('location', 'Plant / area / line', 'Nhà máy / khu vực / chuyền', ['company_id', 'area_id', 'line_id', 'parent_machine_id', 'company_code', 'area_code', 'line_name']),
        G('status', 'Status', 'Trạng thái', ['lifecycle_status', 'needs_info']),
        G('dates', 'Dates / milestones', 'Các ngày / mốc', ['approved_date', 'commissioned_date', 'manufacturing_days',
          'ms_contract_signed', 'ms_deposit_paid', 'ms_fat', 'ms_shipped', 'ms_arrived_port', 'ms_customs_cleared', 'ms_arrived_site', 'ms_installed', 'ms_sat', 'ms_commissioned']),
        G('model', 'Model / serial', 'Model / số serial', ['model', 'serial_number']),
        G('qty', 'Quantity', 'Số lượng', ['quantity']),
        G('capacity', 'Capacity / materials', 'Công suất / vật liệu', ['capacity_value', 'capacity_unit', 'materials']),
        G('classify', 'Group / type / role', 'Nhóm / loại thiết bị / vai trò', ['group_name', 'equipment_type', 'role']),
        G('supplier', 'Supplier / brand', 'Nhà cung cấp / thương hiệu', ['supplier_id', 'manufacturer', 'supplier_name']),
        G('origin', 'Origin', 'Xuất xứ', ['origin']),
        G('value', 'Value (contract, currency, rate)', 'Giá trị (hợp đồng, tiền tệ, tỷ giá)', ['contract_amount', 'contract_currency', 'locked_rate', 'value_vnd', 'value_usd']),
        G('person', 'Engineer / manager', 'Kỹ sư / người quản lý', ['engineer', 'manager']),
        G('notes', 'Notes', 'Ghi chú', ['notes'])
      ]
    },
    delivery: {
      tabs: [T('p1', 'Overview', 'Tổng quan'), T('p2', 'Analytics', 'Phân tích'), T('p4', 'Evaluation', 'Đánh giá'), T('p5', 'Planning', 'Kế hoạch'), T('p3', 'Machines', 'Danh sách')],
      actions: actionsOf('delivery'),
      groups: [
        G('name', 'Machine name', 'Tên máy', ['ten']),
        G('code', 'Machine code', 'Mã máy', ['ma_may', 'sysid']),
        G('location', 'Installation site', 'Nơi lắp đặt', ['noilapdat']),
        G('status', 'Status / rating', 'Trạng thái / đánh giá', ['status', 'danhgia']),
        G('dates', 'Progress dates', 'Các ngày tiến độ', ['duyet', 'dathang', 'ctu', 'tamungtt', 'ditaukh', 'ditautt', 'lanhkh', 'lanhtt', 'xuatxuong', 'sonagyctm', 'workingday',
          'vekh', 'vedukienn', 'tauchay_tt', 'capcang_tt', 'venm_tt', 'nghiemthu_kh', 'lapdat_tt', 'chaythu_tt', 'nghiemthu_tt']),
        G('model', 'Model / serial', 'Model / số serial', ['model', 'serial']),
        G('qty', 'Quantity', 'Số lượng', ['sl']),
        G('capacity', 'Capacity', 'Công suất', ['congsuat']),
        G('supplier', 'Supplier / brand', 'Nhà cung cấp / thương hiệu', ['ncc', 'thuong_hieu']),
        G('origin', 'Origin', 'Xuất xứ', ['xuatxu']),
        G('purchase', 'Purchase type', 'Hình thức mua', ['hinh_thuc_mua']),
        G('value', 'Value (unit price VND / USD, quote currency)', 'Giá trị (đơn giá VNĐ / USD, loại tiền báo giá)', ['vnd', 'usd', 'gia_tien_te']),
        G('person', 'Person in charge', 'Người phụ trách', ['phutrach']),
        G('notes', 'Delay / installation notes', 'Giải trình / ghi chú lắp đặt', ['giaitrinh', 'ghichu_ld'])
      ]
    }
  };
  const MODS = Object.keys(REG);

  /* người mới tạo (migration 22 đặt cho người không phải admin): chỉ xem 4 nhóm cơ bản, không nút nào */
  const MINIMAL = {
    mmtb: { tabs: ['c1', 'c2'], actions: [], view: ['name', 'location', 'status', 'dates'], edit: [] },
    delivery: { tabs: ['p1', 'p3'], actions: [], view: ['name', 'location', 'status', 'dates'], edit: [] }
  };

  const ALL = () => ({ tabs: ['*'], actions: ['*'], view: ['*'], edit: ['*'] });
  const NONE = () => ({ tabs: [], actions: [], view: [], edit: [] });
  const clone = o => JSON.parse(JSON.stringify(o));

  /* quyền theo role cho người chưa cấu hình (perms = null): đúng như app xử lý trước khi có phân quyền từng người */
  function defaults(role) {
    if (role === 'viewer') return {   // viewer: Tổng quan + Danh sách, thấy mọi cột; nút 📤 Xuất dữ liệu chỉ có ở Tiến độ (⬇️ Excel của Tiến độ chỉ editor)
      mmtb: { tabs: ['c1', 'c2'], actions: [], view: ['*'], edit: [] },
      delivery: { tabs: ['p1', 'p3'], actions: ['export'], view: ['*'], edit: [] } };
    if (role === 'editor' || role === 'admin') return { mmtb: ALL(), delivery: ALL() };
    if (role === 'catalog_editor') return { mmtb: ALL(), delivery: { tabs: ['*'], actions: [], view: ['*'], edit: [] } };
    return { mmtb: NONE(), delivery: NONE() };
  }

  /* chỉ nhận mảng chuỗi; "*" = tất cả. Trả về { all, set } đã lọc theo danh sách khoá hợp lệ */
  function list(v, valid) {
    if (!Array.isArray(v)) return { all: false, set: new Set() };
    if (v.includes('*')) return { all: true, set: new Set(valid) };
    return { all: false, set: new Set(v.filter(k => typeof k === 'string' && valid.includes(k))) };
  }
  const isObj = o => o && typeof o === 'object' && !Array.isArray(o);

  let role = null, raw = null, eff = null;
  const fieldGroup = {};   // mod -> { tên trường thật -> khoá nhóm }
  MODS.forEach(m => { fieldGroup[m] = {}; REG[m].groups.forEach(g => g.fields.forEach(f => { fieldGroup[m][f] = g.k; })); });
  const keys = (m, part) => REG[m][part].map(x => x.k);
  const groupKey = (m, f) => REG[m].groups.some(g => g.k === f) ? f : fieldGroup[m][f];

  function build() {
    eff = {};
    const src = raw == null ? defaults(role) : raw;
    MODS.forEach(m => {
      const mp = isObj(src) && isObj(src[m]) ? src[m] : {};
      const e = { tabs: list(mp.tabs, keys(m, 'tabs')), actions: list(mp.actions, keys(m, 'actions')),
                  view: list(mp.view, REG[m].groups.map(g => g.k)), edit: list(mp.edit, REG[m].groups.map(g => g.k)) };
      if (role === 'viewer') {   // viewer: bỏ mọi sửa + mọi nút ghi
        e.edit = { all: false, set: new Set() };
        e.actions = { all: false, set: new Set([...e.actions.set].filter(k => !writeOf(m).includes(k))) };
      }
      eff[m] = e;
    });
  }

  const known = m => MODS.includes(m);
  const PERM = {
    REG, MINIMAL: clone(MINIMAL), defaults,
    init(r, p) {
      role = r || null; raw = p == null ? null : p; build();
      return PERM;
    },
    isAdmin: () => role === 'admin',
    tab(m, p) {
      if (!known(m)) return false;
      if (role === 'admin') return true;   // admin thấy cả Thư viện (c3)
      /* Thư viện (c3) không nằm trong bảng tick: người cũ chưa cấu hình (perms null) editor / catalog_editor vẫn xem như trước; người đã cấu hình → chỉ admin */
      if (m === 'mmtb' && p === 'c3') return raw == null && (role === 'editor' || role === 'catalog_editor');
      return !!eff && eff[m].tabs.set.has(p);
    },
    act(m, a) {
      if (!known(m) || !keys(m, 'actions').includes(a)) return role === 'admin' && known(m);
      if (role === 'admin') return true;
      /* catalog_editor cũ (perms null) vẫn xem được 📤 Xuất và 💳 Thanh toán của Tiến độ như trước (chỉ xem: không vào canWrite) */
      if (raw == null && role === 'catalog_editor' && m === 'delivery' && (a === 'export' || a === 'payment')) return true;
      return !!eff && eff[m].actions.set.has(a);
    },
    /* f = khoá nhóm hoặc tên trường thật (vd. 'vnd' → nhóm 'value') */
    see(m, f) {
      if (!known(m)) return false;
      if (role === 'admin') return true;
      const g = groupKey(m, f);
      return !!eff && !!g && (eff[m].view.set.has(g) || eff[m].edit.set.has(g));
    },
    edit(m, f) {
      if (!known(m)) return false;
      if (role === 'admin') return true;
      const g = groupKey(m, f);
      return !!eff && !!g && eff[m].edit.set.has(g);
    },
    /* có quyền ghi vào phân hệ không (khớp perm_can_write ở máy chủ, chặt hơn một chút: bỏ qua khoá lạ) */
    canWrite(m) {
      if (!known(m)) return false;
      if (role === 'admin') return true;
      if (!eff || role === 'viewer' || !role) return false;
      return eff[m].edit.set.size > 0 || writeOf(m).some(a => eff[m].actions.set.has(a));
    },
    /* các trường thật mà người này xem được ('edit' → chỉ các trường sửa được) */
    fieldsOf(m, mode) {
      if (!known(m)) return [];
      return REG[m].groups.filter(g => mode === 'edit' ? PERM.edit(m, g.k) : PERM.see(m, g.k)).flatMap(g => g.fields.slice());
    },
    label: o => o[lang()] || o.en
  };
  window.PERM = PERM;
  PERM.init(null, null);
})();
