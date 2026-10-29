/* =====================================================================
   metrics.js — mọi phép tính của dashboard Tiến độ máy về (Machine Delivery)
   Hàm thuần: nhận danh sách máy (bảng machines đã giải mã), trả số liệu.
   Không đụng DOM, không gọi Supabase → kiểm tra được độc lập, đối chiếu với SQL.

   Lớp chuyển đổi: bảng machines lưu mốc trong cột, quy về mốc chuẩn của
   delivery_milestones (dtr_machinery_schema.sql):
     contract_signed : actual = dathang
     shipped         : xuatxuong  (≤ hôm qua = actual, từ hôm nay trở đi = forecast)
     arrived_site    : planned = vekh, vedukienn (≤ hôm qua = actual, còn lại = forecast)
   Sau này chuyển sang delivery_milestones thì chỉ sửa DM.milestones().
   Quy ước "đã về" giống app: ngày về NM trước hôm nay (daysleft < 0).
   ===================================================================== */
(function(){
  const DAY = 86400000;
  const iso = d => d ? String(d).slice(0, 10) : null;
  const toDate = s => new Date(s + 'T00:00:00');

  const DM = {};

  /* hôm nay lúc 00:00 — test có thể đặt window.DM_TODAY = 'YYYY-MM-DD' */
  DM.today = () => {
    if (window.DM_TODAY) return toDate(window.DM_TODAY);
    const t = new Date(); t.setHours(0, 0, 0, 0); return t;
  };
  DM.todayIso = () => {
    const t = DM.today();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  };
  /* số ngày b - a (chuỗi ISO) */
  DM.days = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
  DM.addDays = (s, n) => {
    const d = toDate(s); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /* ---------- công ty: nơi lắp đặt (chữ) -> mã công ty ---------- */
  DM.COMPANIES = ['DTR', 'DAL', 'DOL', 'KN', 'TDP', 'TT'];
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
  const CO_ALIAS = { dtr: 'DTR', duytanrecycling: 'DTR', dal: 'DAL', dailoc: 'DAL', dol: 'DOL', donglam: 'DOL',
                     kn: 'KN', khanhnga: 'KN', tdp: 'TDP', tandaiphat: 'TDP', tt: 'TT', tantao: 'TT' };
  DM.companyCode = noilapdat => CO_ALIAS[fold(noilapdat)] || null;

  /* ---------- mốc chuẩn của 1 máy ---------- */
  DM.MILESTONES = ['contract_signed', 'shipped', 'arrived_site'];
  DM.milestones = x => {
    const t = DM.todayIso();
    const split = d => !d ? { forecast: null, actual: null } : d < t ? { forecast: null, actual: d } : { forecast: d, actual: null };
    return [
      { milestone: 'contract_signed', planned: null, forecast: null, actual: iso(x.dathang) },
      Object.assign({ milestone: 'shipped', planned: null }, split(iso(x.xuatxuong))),
      Object.assign({ milestone: 'arrived_site', planned: iso(x.vekh) }, split(iso(x.vedukienn)))
    ];
  };
  const ms = (x, name) => DM.milestones(x).find(m => m.milestone === name);

  /* ---------- trạng thái vòng đời suy từ ngày ----------
     Bảng machines chưa có ngày lắp đặt / nghiệm thu nên dừng ở 'arrived'. */
  DM.LIFECYCLE = ['planned', 'manufacturing', 'shipping', 'arrived'];
  DM.lifecycle = x => {
    const m = DM.milestones(x);
    if (m[2].actual) return 'arrived';
    if (m[1].actual) return 'shipping';
    if (m[0].actual) return 'manufacturing';
    return 'planned';
  };

  /* ---------- trễ ----------
     Mốc chưa xong có ngày kế hoạch: trễ = (dự kiến, hoặc hôm nay nếu chưa có dự kiến) − kế hoạch.
     Trả mốc trễ nhiều nhất, hoặc null nếu không trễ. Mốc thiếu planned_date thì không đánh giá. */
  DM.delay = x => {
    const t = DM.todayIso();
    let worst = null;
    DM.milestones(x).forEach(m => {
      if (m.actual || !m.planned) return;
      const days = DM.days(m.planned, m.forecast || t);
      if (days > 0 && (!worst || days > worst.days))
        worst = { milestone: m.milestone, planned: m.planned, forecast: m.forecast, days, overdue: !m.forecast };
    });
    return worst;
  };
  /* màu trạng thái: đúng hạn = ok · trễ ≤ 14 ngày = warn · trễ > 14 ngày = bad · đã về = done */
  DM.severity = x => {
    if (DM.lifecycle(x) === 'arrived') return 'done';
    const d = DM.delay(x);
    return !d ? 'ok' : d.days <= 14 ? 'warn' : 'bad';
  };

  /* ---------- bộ lọc chung ----------
     f = { co, sup, st, m, y }: mã công ty, NCC, trạng thái (lifecycle hoặc 'delayed'), tháng '01'..'12', năm 'YYYY'.
     Tháng/năm lọc theo ngày về NM (vedukienn). */
  DM.FILTER_KEYS = ['co', 'sup', 'st', 'm', 'y'];
  DM.filter = (rows, f) => rows.filter(x => {
    const d = iso(x.vedukienn);
    if (f.co && DM.companyCode(x.noilapdat) !== f.co) return false;
    if (f.sup && (x.ncc || '') !== f.sup) return false;
    if (f.st === 'delayed' ? !DM.delay(x) : f.st && DM.lifecycle(x) !== f.st) return false;
    if ((f.m || f.y) && !d) return false;
    if (f.y && d.slice(0, 4) !== f.y) return false;
    if (f.m && d.slice(5, 7) !== f.m) return false;
    return true;
  });
  /* NCC trong URL: mã băm FNV-1a của tên (tên NCC được mã hoá nên không đưa nguyên văn lên URL) */
  DM.supKey = name => {
    let h = 0x811c9dc5;
    for (const ch of String(name)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  };
  DM.parseQuery = search => {
    const q = new URLSearchParams(search || ''), f = {};
    DM.FILTER_KEYS.forEach(k => { f[k] = q.get(k) || ''; });
    return f;
  };
  DM.toQuery = f => {
    const q = new URLSearchParams();
    DM.FILTER_KEYS.forEach(k => { if (f[k]) q.set(k, f[k]); });
    const s = q.toString(); return s ? '?' + s : '';
  };

  /* ---------- KPI ----------
     opt.ontimeWindow: số ngày nhìn lại cho tỷ lệ đúng hạn (mặc định 90); null = mọi mốc trong rows */
  DM.kpis = (rows, opt) => {
    opt = opt || {};
    const t = DM.todayIso();
    const win = opt.ontimeWindow === undefined ? 90 : opt.ontimeWindow;
    const from = win == null ? null : DM.addDays(t, -win);

    // 1. đang trong tiến trình: chưa về NM (chưa có dữ liệu nghiệm thu nên máy đã về không tính)
    const pipe = rows.filter(x => DM.lifecycle(x) !== 'arrived');
    // 2. đúng hạn: mốc arrived_site đã có thực tế + có kế hoạch, thực tế ≤ kế hoạch
    const done = rows.map(x => ({ x, m: ms(x, 'arrived_site') }))
                     .filter(o => o.m.actual && o.m.planned && (!from || o.m.actual >= from));
    const onTime = done.filter(o => o.m.actual <= o.m.planned);
    // 3. trễ: máy có mốc chưa xong đang trễ
    const late = rows.map(x => ({ x, d: DM.delay(x) })).filter(o => o.d);
    // 4. về trong 30 ngày: dự kiến arrived_site trong [hôm nay, hôm nay + 30]
    const to30 = DM.addDays(t, 30);
    const soon = rows.filter(x => { const m = ms(x, 'arrived_site'); return m.forecast && m.forecast >= t && m.forecast <= to30; });

    return {
      pipeline:  { rows: pipe, count: pipe.length, vnd: pipe.reduce((s, x) => s + (+x.vnd || 0), 0) },
      ontime:    { rows: done.map(o => o.x), num: onTime.length, den: done.length,
                   rate: done.length ? onTime.length / done.length : null, window: win },
      delayed:   { rows: late.map(o => o.x), count: late.length,
                   avgDays: late.length ? late.reduce((s, o) => s + o.d.days, 0) / late.length : null },
      arriving:  { rows: soon, count: soon.length },
      commissioning: null   // bảng machines chưa có dữ liệu nghiệm thu
    };
  };

  /* ---------- Needs attention: n máy trễ nặng nhất ---------- */
  DM.attention = (rows, n) => rows.map(x => ({ x, d: DM.delay(x) }))
    .filter(o => o.d)
    .sort((a, b) => b.d.days - a.d.days || String(a.x.ten).localeCompare(String(b.x.ten)))
    .slice(0, n || 5);

  window.DM = DM;
})();
