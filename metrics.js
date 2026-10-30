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
  /* Tháng/năm: không có trên URL = mặc định tháng & năm hiện tại (do trang quyết định);
     "tất cả" ghi rõ là m=all / y=all để link gửi đi giữ đúng góc nhìn. periodInUrl cho biết URL có ghi tháng/năm. */
  DM.parseQuery = search => {
    const q = new URLSearchParams(search || ''), f = {};
    DM.FILTER_KEYS.forEach(k => { const v = q.get(k) || ''; f[k] = v === 'all' ? '' : v; });
    Object.defineProperty(f, 'periodInUrl', { value: q.has('m') || q.has('y'), enumerable: false });
    return f;
  };
  DM.toQuery = f => {
    const q = new URLSearchParams();
    DM.FILTER_KEYS.forEach(k => { if (f[k]) q.set(k, f[k]); else if (k === 'm' || k === 'y') q.set(k, 'all'); });
    return '?' + q.toString();
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

  /* ---------- Gantt kế hoạch so với thực tế ----------
     Mỗi máy 1 thanh mờ (kế hoạch) + 1 thanh đậm (thực tế, hoặc dự kiến nếu chưa về), từ contract_signed tới arrived_site.
     Kế hoạch: bảng machines không có ngày ký HĐ kế hoạch nên đầu thanh kế hoạch = ngày ký HĐ thực tế.
     opt.recentDays: ngoài máy chưa về, chỉ lấy máy đã về trong N ngày qua (null = lấy hết). Nhóm theo công ty. */
  DM.gantt = (rows, opt) => {
    opt = opt || {};
    const from = opt.recentDays == null ? null : DM.addDays(DM.todayIso(), -opt.recentDays);
    const items = rows.map(x => {
      const m = DM.milestones(x), c = m[0], a = m[2];
      const end = a.actual || a.forecast;
      if (!c.actual || (!end && !a.planned)) return null;
      if (from && a.actual && a.actual < from) return null;
      return { x, group: DM.companyCode(x.noilapdat) || 'Other', start: c.actual,
               planEnd: a.planned, end, endKind: a.actual ? 'actual' : 'forecast',
               sev: DM.severity(x), delay: DM.delay(x), milestones: m };
    }).filter(Boolean);
    const order = [...DM.COMPANIES, 'Other'];
    items.sort((p, q) => order.indexOf(p.group) - order.indexOf(q.group) || String(p.end || p.planEnd).localeCompare(String(q.end || q.planEnd)));
    const groups = order.map(g => ({ group: g, items: items.filter(i => i.group === g) })).filter(g => g.items.length);
    return { items, groups };
  };

  /* ---------- Phễu vòng đời ----------
     Số máy (hoặc giá trị VNĐ) đang ở từng giai đoạn. Bảng machines không tách được "đã đặt hàng" và "đang chế tạo"
     (gộp 1 bước) và chưa có dữ liệu lắp đặt / nghiệm thu (available = false). */
  DM.FUNNEL = [
    { key: 'planned',       states: ['planned'] },
    { key: 'manufacturing', states: ['manufacturing'] },
    { key: 'shipping',      states: ['shipping'] },
    { key: 'arrived',       states: ['arrived'] },
    { key: 'installing',    states: [], available: false },
    { key: 'in_operation',  states: [], available: false }   // nghiệm thu trong 12 tháng gần nhất
  ];
  DM.funnel = rows => DM.FUNNEL.map(st => {
    const r = rows.filter(x => st.states.includes(DM.lifecycle(x)));
    return { key: st.key, available: st.available !== false, rows: r, count: r.length,
             vnd: r.reduce((s, x) => s + (+x.vnd || 0), 0) };
  });

  /* ---------- Bảng điểm nhà cung cấp (thay cho view v_supplier_scorecard: tên NCC đã mã hoá) ----------
     Mỗi NCC 1 dòng, tính trên mốc arrived_site:
       delivered      số máy đã về NM (có actual)
       onTimePct      % máy đã về có planned mà actual ≤ planned (null nếu không máy nào có planned)
       avgLateDays    trung bình (actual − planned) của riêng các máy về trễ (null nếu không trễ)
       committedLT /  lead time cam kết (planned − ngày ký HĐ) / thực tế (actual − ngày ký HĐ), trung bình,
       actualLT       cùng tập máy có đủ 3 ngày để 2 con số so được với nhau; gapDays = actualLT − committedLT
       inProgress     số máy chưa về
     opt.minDelivered (mặc định 2): dưới ngưỡng thì sufficient = false ("insufficient data"). */
  DM.supplierScorecard = (rows, opt) => {
    const min = (opt && opt.minDelivered) || 2;
    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
    const by = {};
    rows.forEach(x => { const k = x.ncc || ''; (by[k] = by[k] || []).push(x); });
    return Object.keys(by).map(name => {
      const ms3 = by[name].map(x => DM.milestones(x));
      const done = ms3.filter(m => m[2].actual);
      const planned = done.filter(m => m[2].planned);
      const late = planned.map(m => DM.days(m[2].planned, m[2].actual)).filter(d => d > 0);
      const full = planned.filter(m => m[0].actual);
      const committedLT = avg(full.map(m => DM.days(m[0].actual, m[2].planned)));
      const actualLT = avg(full.map(m => DM.days(m[0].actual, m[2].actual)));
      return {
        name, delivered: done.length, inProgress: ms3.length - done.length,
        onTimeNum: planned.filter(m => m[2].actual <= m[2].planned).length, onTimeDen: planned.length,
        onTimePct: planned.length ? planned.filter(m => m[2].actual <= m[2].planned).length / planned.length : null,
        lateCount: late.length, avgLateDays: avg(late),
        ltCount: full.length, committedLT, actualLT,
        gapDays: committedLT == null ? null : actualLT - committedLT,
        sufficient: done.length >= min
      };
    }).sort((a, b) => (b.sufficient - a.sufficient) || ((b.onTimePct ?? -1) - (a.onTimePct ?? -1)) ||
                      (b.delivered - a.delivered) || a.name.localeCompare(b.name));
  };

  /* ---------- Lịch thanh toán của 1 máy (bảng payment_schedule, đã giải mã) ----------
     Số tiền mỗi đợt: amount nếu có, không thì percent × giá trị hợp đồng (chỉ khi đợt tính bằng VND).
     Trả: tổng % đã lên lịch, tổng tiền lên lịch / đã trả / còn lại (VND), số đợt quá hạn chưa trả. */
  DM.PAY_KINDS = ['deposit', 'before_shipment', 'on_arrival', 'after_commissioning', 'other'];
  DM.payAmount = (p, contractVnd) => p.amount != null && p.amount !== '' ? +p.amount
    : (p.percent != null && p.percent !== '' && (p.currency || 'VND') === 'VND' && contractVnd ? Math.round(contractVnd * p.percent / 100) : null);
  DM.paymentSummary = (pays, contractVnd) => {
    const t = DM.todayIso(), vnd = pays.filter(p => (p.currency || 'VND') === 'VND');
    const sched = vnd.reduce((s, p) => s + (DM.payAmount(p, contractVnd) || 0), 0);
    const paid = vnd.reduce((s, p) => s + (p.paid_date ? (p.paid_amount != null && p.paid_amount !== '' ? +p.paid_amount : (DM.payAmount(p, contractVnd) || 0)) : 0), 0);
    return {
      // % đã lên lịch: đợt không ghi % thì quy từ số tiền / giá trị hợp đồng (đợt VND)
      count: pays.length, pct: pays.reduce((s, p) => s + (p.percent != null && p.percent !== '' ? +p.percent
        : (p.amount != null && p.amount !== '' && (p.currency || 'VND') === 'VND' && contractVnd ? p.amount / contractVnd * 100 : 0)), 0),
      scheduled: sched, paid, outstanding: sched - paid,
      overdue: pays.filter(p => !p.paid_date && p.planned_date && p.planned_date < t).length,
      foreign: pays.length - vnd.length
    };
  };

  /* ---------- 5.1 Milestone Trend Analysis (mốc arrived_site) ----------
     history: dòng milestone_forecast_history {machine_id, milestone, new_forecast, changed_at}.
     Trục X = cuối mỗi tuần (Chủ nhật), tối đa opt.maxWeeks tuần gần nhất (mặc định 52) tới tuần hiện tại.
     Giá trị tuần = new_forecast mới nhất có changed_at ≤ cuối tuần đó (chưa có lịch sử thì bỏ trống). */
  const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  DM.weekEnd = s => { const d = toDate(s); d.setDate(d.getDate() + (7 - d.getDay()) % 7); return isoOf(d); };
  DM.mta = (history, machineIds, opt) => {
    opt = opt || {};
    const t = DM.todayIso(), maxW = opt.maxWeeks || 52;
    const ev = history.filter(h => h.milestone === 'arrived_site' && machineIds.includes(h.machine_id))
      .map(h => ({ id: h.machine_id, at: String(h.changed_at), d: iso(h.new_forecast) }))
      .sort((a, b) => a.at.localeCompare(b.at));
    if (!ev.length) return { weeks: [], series: [] };
    const lastWeek = DM.weekEnd(t);
    let first = DM.weekEnd(ev[0].at.slice(0, 10));
    const minStart = DM.addDays(lastWeek, -7 * (maxW - 1));
    if (first < minStart) first = minStart;
    const weeks = [];
    for (let w = first; w <= lastWeek; w = DM.addDays(w, 7)) weeks.push(w);
    const series = machineIds.map(id => {
      const mine = ev.filter(e => e.id === id);
      const values = weeks.map(w => { let v; for (const e of mine) { if (e.at.slice(0, 10) <= w) v = e.d; else break; } return v === undefined ? null : v; });
      const shown = values.filter(v => v);
      return { id, values, changes: Math.max(mine.length - 1, 0),
               firstForecast: shown[0] || null, lastForecast: shown[shown.length - 1] || null,
               slipDays: shown.length ? DM.days(shown[0], shown[shown.length - 1]) : null };
    }).filter(s => s.values.some(v => v));
    return { weeks, series };
  };

  /* ---------- 5.2 Dự báo dòng tiền 12 tháng (đợt chưa trả) ----------
     Ngày đến hạn: planned_date, không có thì lấy ngày của mốc gắn kèm (ký HĐ / xuất xưởng / về NM).
     Quy VNĐ: VND giữ nguyên; USD dùng tỷ giá riêng của máy (vnd/usd của chính máy đó, coi như tỷ giá chốt),
     không có thì tỷ giá mới nhất (exchange_rates); EUR dùng tỷ giá mới nhất. Thiếu tỷ giá / ngày -> 'unscheduled'. */
  DM.msDate = (x, ms) => !x ? null : ms === 'contract_signed' ? iso(x.dathang) : ms === 'shipped' ? iso(x.xuatxuong)
    : ms === 'arrived_site' ? iso(x.vedukienn) : null;
  DM.payVnd = (p, x, rates) => {
    const cur = p.currency || 'VND';
    const amt = p.amount != null && p.amount !== '' ? +p.amount
      : p.percent != null && p.percent !== '' ? (cur === 'VND' ? (x && +x.vnd) : cur === 'USD' ? (x && +x.usd) : 0) * p.percent / 100 : null;
    if (amt == null || isNaN(amt)) return null;
    if (cur === 'VND') return Math.round(amt);
    const own = cur === 'USD' && x && +x.usd > 0 && +x.vnd > 0 ? x.vnd / x.usd : null;
    const r = own || (rates && rates[cur]);
    return r ? Math.round(amt * r) : null;
  };
  DM.cashflow = (pays, machinesById, rates, opt) => {
    opt = opt || {};
    const t = DM.todayIso(), n = opt.months || 12;
    const m0 = toDate(t.slice(0, 8) + '01');
    const months = Array.from({ length: n }, (_, i) => { const d = new Date(m0); d.setMonth(d.getMonth() + i); return isoOf(d).slice(0, 7); });
    const items = pays.filter(p => !p.paid_date).map(p => {
      const x = machinesById[p.machine_id];
      const due = iso(p.planned_date) || DM.msDate(x, p.linked_milestone);
      return { p, x, kind: p.kind || 'other', due, vnd: DM.payVnd(p, x, rates) };
    });
    const ok = items.filter(i => i.due && i.vnd != null);
    const overdue = ok.filter(i => i.due < t);
    const byMonth = months.map(m => {
      const o = { month: m, total: 0 };
      DM.PAY_KINDS.forEach(k => { o[k] = 0; });
      ok.filter(i => i.due >= t && i.due.slice(0, 7) === m).forEach(i => { o[i.kind] += i.vnd; o.total += i.vnd; });
      return o;
    });
    let run = overdue.reduce((s, i) => s + i.vnd, 0);
    byMonth.forEach(o => { run += o.total; o.cumulative = run; });
    const to30 = DM.addDays(t, 30);
    return {
      months: byMonth,
      overdue: { count: overdue.length, vnd: overdue.reduce((s, i) => s + i.vnd, 0), items: overdue },
      due30: ok.filter(i => i.due <= to30).sort((a, b) => a.due.localeCompare(b.due)),
      unscheduled: items.filter(i => !i.due || i.vnd == null),
      later: ok.filter(i => i.due.slice(0, 7) > months[months.length - 1])
    };
  };

  /* ---------- 5.3 Lookahead 90 ngày: sẵn sàng mặt bằng ----------
     Máy chưa về, ngày về dự kiến trong [hôm nay, hôm nay + 90]; nhóm 0–30 / 31–60 / 61–90 ngày.
     Checklist 5 mục; mục chưa có dòng = 'todo'. Cờ đỏ: còn mục chưa xong (không phải done/na) và còn ≤ 14 ngày. */
  DM.READY_ITEMS = ['foundation', 'power_supply', 'lifting', 'installer', 'utilities'];
  DM.lookahead = (rows, readiness, opt) => {
    const t = DM.todayIso(), days = (opt && opt.days) || 90, red = (opt && opt.redDays) || 14;
    const by = {};
    (readiness || []).forEach(r => { (by[r.machine_id] = by[r.machine_id] || {})[r.item] = r; });
    return rows.map(x => ({ x, m: ms(x, 'arrived_site') }))
      .filter(o => o.m.forecast && DM.days(t, o.m.forecast) <= days)
      .map(({ x, m }) => {
        const d = DM.days(t, m.forecast), rd = by[x._id] || {};
        const items = DM.READY_ITEMS.map(k => Object.assign({ item: k, status: 'todo' }, rd[k] || {}));
        const open = items.filter(i => i.status !== 'done' && i.status !== 'na').length;
        return { x, forecast: m.forecast, days: d, bucket: d <= 30 ? 0 : d <= 60 ? 1 : 2, items, open, red: open > 0 && d <= red };
      })
      .sort((a, b) => a.days - b.days);
  };

  window.DM = DM;
})();
