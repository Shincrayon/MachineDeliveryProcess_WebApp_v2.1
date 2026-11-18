/* icons.js — icon SVG (kiểu Lucide, viết tay) cho thanh trên cùng. Chỉ quan sát + trang trí DOM:
   giữ nguyên emoji/chữ cũ trong DOM (ẩn-nhìn bằng .emo) nên innerText và logic app không đổi. */
(function(){
  'use strict';
  const S = d => '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const P = {
    catalog:  '<path d="M3 21V9l6 3V9l6 3V5h4a2 2 0 0 1 2 2v14z"/><path d="M7 17h2M12 17h2M17 17h1"/>',
    delivery: '<path d="M2 18l1.5 3h17L22 18"/><path d="M4 18V12h16v6"/><path d="M12 12V6M12 6l4 2h-4"/>',
    overview: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    machines: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    arrange:  '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><path d="M17 13v8M13 17h8"/>',
    library:  '<path d="M4 4v16M9 4v16"/><path d="M14 5l3-1 4 15-3 1z"/>',
    analytics:'<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    evaluation:'<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>',
    planning: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    refresh:  '<path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/>',
    import:   '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    add:      '<path d="M12 5v14M5 12h14"/>',
    export:   '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    trash:    '<path d="M3 6h18M8 6V4h8v2"/><path d="M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14M10 11v6M14 11v6"/>',
    users:    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    key:      '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
    logout:   '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:     '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
    logo:     '<path d="M3 21V10l5 3V10l5 3V5h3l1 3h4v13z"/><path d="M7 17h2M12 17h2M17 17h2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'
  };
  const F = (vb, body) => '<svg class="ico flag" viewBox="' + vb + '" aria-hidden="true">' + body + '</svg>';
  const FLAGS = {
    flagVN: F('0 0 30 20', '<rect width="30" height="20" fill="#da251d"/><path fill="#ffff00" d="M15 4l1.76 5.42h5.7l-4.61 3.35 1.76 5.42L15 14.84l-4.61 3.35 1.76-5.42-4.61-3.35h5.7z"/>'),
    flagUK: F('0 0 60 40', '<rect width="60" height="40" fill="#012169"/><path d="M0 0l60 40M60 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0l60 40M60 0L0 40" stroke="#c8102e" stroke-width="3"/><path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="12"/><path d="M30 0v40M0 20h60" stroke="#c8102e" stroke-width="7"/>')
  };
  const html = name => FLAGS[name] || (P[name] ? S(P[name]) : '');
  const EMO = /^\s*(\p{Extended_Pictographic}️?|⎋)\s*/u;

  const TAB = {c1:'overview', p1:'overview', c2:'machines', p3:'machines', c4:'arrange', c3:'library', p2:'analytics', p4:'evaluation', p5:'planning'};
  const BTN = {btnUpd:'refresh', btnPick:'import', btnAdd:'add', btnAddM:'add', btnExport:'export', btnTrash:'trash', btnUsers:'users', btnPw:'key', btnLogout:'logout'};
  function nameFor(el){
    if(el.id in BTN) return BTN[el.id];
    if(el.id === 'btnTheme') return document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun';
    if(el.id === 'btnLang') return (typeof LANG !== 'undefined' && LANG === 'en') ? 'flagVN' : 'flagUK';
    if(el.classList.contains('mod')) return el.dataset.m === 'mmtb' ? 'catalog' : 'delivery';
    if(el.classList.contains('tab')) return TAB[el.dataset.p];
    if(el.classList.contains('updated')) return 'calendar';
    if(el.classList.contains('logo')) return 'logo';
    return null;
  }
  const tpl = document.createElement('template');
  function decorateEl(el){
    const name = nameFor(el); if(!name) return;
    // 1) gom chữ/emoji trần vào .emo (ẩn-nhìn, vẫn nằm trong innerText)
    if(el.id === 'btnLang'){
      const loose = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.nodeValue.trim());
      if(loose.length){
        const sp = document.createElement('span'); sp.className = 'emo';
        sp.textContent = loose.map(n => n.nodeValue).join(''); loose.forEach(n => n.remove());
        el.appendChild(sp);
      }
    } else {
      const t = Array.from(el.childNodes).find(n => n.nodeType === 3 && n.nodeValue.trim());
      const m = t && EMO.exec(t.nodeValue);
      if(m){
        const sp = document.createElement('span'); sp.className = 'emo'; sp.textContent = m[0];
        t.nodeValue = t.nodeValue.slice(m[0].length);
        el.insertBefore(sp, t);
      }
    }
    // 2) svg.ico đầu nút, đúng tên (thay nếu sai)
    let svg = el.querySelector(':scope > svg.ico');
    if(!svg || svg.getAttribute('data-ico') !== name){
      tpl.innerHTML = html(name);
      const n = tpl.content.firstChild; if(!n) return;
      n.setAttribute('data-ico', name);
      if(svg) svg.remove();
      el.insertBefore(n, el.firstChild); svg = n;
    }
    // 3) chừa khoảng cách chỉ khi còn chữ nhìn thấy
    const hasText = Array.from(el.childNodes).some(n => n !== svg && !(n.nodeType === 1 && n.classList.contains('emo')) && n.textContent.trim());
    svg.classList.toggle('ico-t', hasText);
  }
  const SEL = '.topbar .mod, .topbar .tab, .topbar .upd-btn, .topbar .updated, .topbar .brand .logo';
  let obs = null;
  function attach(){
    const tb = document.querySelector('.topbar');
    if(tb) obs.observe(tb, {childList:true, characterData:true, subtree:true});
    obs.observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
  }
  function decorate(root){
    obs.disconnect();                       // chặn vòng lặp: không tự nghe thay đổi của chính mình
    try{ (root && root.querySelectorAll ? root : document).querySelectorAll(SEL).forEach(decorateEl); }
    finally{ attach(); }
  }
  obs = new MutationObserver(decorate);
  window.ICONS = { svg: html, decorate };
  decorate();
})();
