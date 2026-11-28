/* =====================================================================
   seal.js — niêm phong / mở dữ liệu nhạy cảm THEO NHÓM (window.SEAL). Nạp sau perms.js, trước script chính của index.html.
   - Mỗi bảng (machines, mmtb_machines) có các cột s_<nhóm> chứa chuỗi 'g1:dk:<base64>' (AES-GCM, cùng khoá dữ liệu như 'e1:').
   - Nhóm khớp với PERM.REG (perms.js) để máy chủ chặn ghi theo nhóm; cột gốc luôn để trống (BLANK).
   - Mở dòng chấp nhận cả 3 dạng: g1 (s_*), sec (gói cũ 'e1:') và plain.
   - Không có chữ hiển thị cho người dùng trong module này.
   ===================================================================== */
(function () {
  const KEY_ID = 'dk';
  const GROUPS = {
    machines: { name: ['ten'], model: ['model', 'serial'], capacity: ['congsuat'], supplier: ['ncc', 'thuong_hieu'], value: ['vnd', 'usd'], person: ['phutrach'], notes: ['giaitrinh', 'ghichu_ld'] },
    mmtb_machines: { name: ['name', 'alias_names'], code: ['asset_code'], model: ['model', 'serial_number'], capacity: ['capacity_value', 'capacity_unit'], supplier: ['manufacturer'],
      value: ['contract_amount', 'locked_rate'], person: ['engineer', 'manager'], notes: ['notes'] }
  };
  const BLANK = {
    machines: { ten: '', phutrach: null, congsuat: null, ncc: null, thuong_hieu: null, model: null, serial: null, vnd: 0, usd: 0, giaitrinh: null, ghichu_ld: null },
    mmtb_machines: { name: '', model: null, manufacturer: null, serial_number: null, capacity_value: null, capacity_unit: null, alias_names: null,
      contract_amount: null, locked_rate: null, notes: null, engineer: null, manager: null, asset_code: null }
  };
  let _codec;
  const SEAL = {
    GROUPS, BLANK, KEY_ID,
    on: { machines: false, mmtb_machines: false }
  };
  Object.defineProperty(SEAL, 'codec', {
    enumerable: true,
    get() { return _codec !== undefined ? _codec : (typeof CRYPTO !== 'undefined' ? CRYPTO : null); },
    set(v) { _codec = v; }
  });

  const gs = t => Object.keys(GROUPS[t]);
  SEAL.cols = t => gs(t).map(g => 's_' + g);
  SEAL.fields = t => [].concat(...gs(t).map(g => GROUPS[t][g]));
  SEAL.groupOf = (t, f) => gs(t).find(g => GROUPS[t][g].includes(f)) || null;

  SEAL.probe = async sb => {
    for (const t of Object.keys(GROUPS)) {
      try { const r = await sb.from(t).select('id,s_name').limit(1); SEAL.on[t] = !r.error; } catch (e) { SEAL.on[t] = false; }
    }
  };

  /* openRow không biết bảng: nhóm cùng tên của 2 bảng gộp lại (trường của bảng kia không có trong dòng nên vô hại) */
  const FIELDS = {};
  Object.keys(GROUPS).forEach(t => gs(t).forEach(g => { FIELDS[g] = (FIELDS[g] || []).concat(GROUPS[t][g]); }));
  const ALLG = Object.keys(FIELDS);
  const isStr = v => typeof v === 'string' && v !== '';
  SEAL.fmtOf = row => {
    if (!row) return 'plain';
    if (isStr(row.sec)) return 'sec';
    if (row._fmt === 'g1' || row._fmt === 'sec' || row._fmt === 'plain') return row._fmt;   // dòng kế hoạch (DATA) mất sec nhưng còn _fmt
    for (const k of Object.keys(row)) if (k.startsWith('s_') && isStr(row[k])) return 'g1';
    return 'plain';
  };

  const norm = v => (v === undefined || v === '' ? null : v);
  SEAL.same = (a, b) => norm(a) === norm(b);

  SEAL.encGroup = async (obj, keyId) => 'g1:' + (keyId || KEY_ID) + ':' + (await SEAL.codec.encObj(obj)).slice(3);
  SEAL.decGroup = async s => {
    const m = /^g1:([A-Za-z0-9_-]+):([A-Za-z0-9+/=]+)$/.exec(String(s));
    if (!m || m[1] !== KEY_ID) throw new Error('bad_group_cipher');
    return SEAL.codec.decObj('e1:' + m[2]);
  };

  const defGet = (c, k) => (c[k] === undefined ? null : c[k]);
  SEAL.sealGroups = async (table, row, cur, get = defGet) => {
    const G = GROUPS[table], B = BLANK[table], names = gs(table), has = k => k in row;
    const todo = {};
    let withSecNull = false;
    if (cur === null) {
      names.forEach(g => { todo[g] = {}; G[g].forEach(k => { todo[g][k] = has(k) ? row[k] : B[k]; }); });
    } else if (cur && (cur.__locked || cur._locked)) {
      throw { code: 'locked' };
    } else if (cur === undefined) {
      names.forEach(g => {
        const f = G[g].filter(has); if (!f.length) return;
        if (f.length !== G[g].length) throw new Error('seal_partial:' + g);
        todo[g] = {}; G[g].forEach(k => { todo[g][k] = row[k]; });
      });
      withSecNull = names.every(g => todo[g]);
    } else if (SEAL.fmtOf(cur) === 'sec') {
      names.forEach(g => { todo[g] = {}; G[g].forEach(k => { todo[g][k] = has(k) ? row[k] : get(cur, k); }); });
      withSecNull = true;
    } else {
      names.forEach(g => {
        if (!G[g].some(k => has(k) && !SEAL.same(row[k], get(cur, k)))) return;
        todo[g] = {}; G[g].forEach(k => { todo[g][k] = has(k) ? row[k] : get(cur, k); });
      });
    }
    const out = Object.assign({}, row);
    for (const g of names) {
      if (todo[g]) { out['s_' + g] = await SEAL.encGroup(todo[g]); G[g].forEach(k => { if (has(k)) out[k] = B[k]; }); }
      else G[g].forEach(k => { delete out[k]; });          // không bao giờ gửi bản rõ
    }
    if (cur === null || withSecNull) out.sec = null; else delete out.sec;
    return out;
  };

  SEAL.sealAll = async (table, vals) => {
    const G = GROUPS[table], B = BLANK[table], out = {};
    for (const g of gs(table)) {
      const o = {}; G[g].forEach(k => { o[k] = k in vals ? vals[k] : B[k]; });
      out['s_' + g] = await SEAL.encGroup(o);
      G[g].forEach(k => { out[k] = B[k]; });
    }
    out.sec = null;
    return out;
  };

  SEAL.openRow = async row => {
    const c = SEAL.codec;
    if (!row || !c || !c.on) return row;
    const base = Object.assign({}, row);
    try {
      if (isStr(row.sec)) Object.assign(base, await c.decObj(row.sec));
      for (const g of ALLG) {
        const v = row['s_' + g]; if (!isStr(v)) continue;
        const d = await SEAL.decGroup(v);
        FIELDS[g].forEach(k => { if (k in d) base[k] = d[k]; });
      }
    } catch (e) { base.__locked = true; }
    return base;
  };
  window.SEAL = SEAL;
})();
