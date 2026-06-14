/**
 * ПРОПИСИ — App v2
 * Fixed SVG renderer: unitless coords (1 unit = 1mm in viewBox 0 0 W H)
 * ГОСТ 5mm cell: font-size computed so char fits inside cell
 */
(function () {
  'use strict';

  /* ── 1. UTM & ANALYTICS ─────────────────────────────── */
  (function initAnalytics() {
    try {
      const p = new URLSearchParams(location.search);
      const d = {};
      ['utm_source','utm_medium','utm_campaign','utm_term','utm_content']
        .forEach(k => p.has(k) && (d[k] = p.get(k)));
      if (Object.keys(d).length) sessionStorage.setItem('_utm', JSON.stringify(d));
    } catch(_){}
  })();

  function track(action, extra) {
    try {
      const u = JSON.parse(sessionStorage.getItem('_utm') || '{}');
      const p = { action, ...u, ...extra };
      if (typeof ym === 'function') ym(109849947, 'reachGoal', action, p);
      if (window.dataLayer) window.dataLayer.push({ event: 'propisi_' + action, ...p });
    } catch(_){}
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el) track(el.dataset.action);
  });

  /* ── 2. STATE ────────────────────────────────────────── */
  const S = {
    grid:        'squared',
    mode:        'tracing',
    format:      'a4',
    orientation: 'portrait',
    analysis:    false,
    aColor:      '#0F172A',
    aUL:         'solid',
    overflow:    false,
  };

  // Paper sizes mm [W, H] portrait
  const DIMS = { a4: [210, 297], a5: [148, 210] };

  function paperMM() {
    let [w, h] = DIMS[S.format] || DIMS.a4;
    if (S.orientation === 'landscape') [w, h] = [h, w];
    return { w, h };
  }

  /* ── 3. DOM ──────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const D = {
    editor:  $('textEditor'),
    svg:     $('worksheetSVG'),
    paper:   $('worksheetPaper'),
    wrap:    $('previewWrap'),
    printBtn:$('printBtn'),
    pdfBtn:  $('pdfBtn'),
    toast:   $('toast'),
    toastMsg:$('toastMsg'),
    toastX:  $('toastClose'),
    aTgl:    $('analysisTgl'),
    aPills:  $('analysisPills'),
    clrBtn:  $('clearFmtBtn'),
  };

  /* ── 4. PAPER SIZING ─────────────────────────────────── */
  function applyPrint() {
    const { w, h } = paperMM();
    let s = $('_ps');
    if (!s) { s = document.createElement('style'); s.id = '_ps'; document.head.append(s); }
    s.textContent = `@page{size:${S.format.toUpperCase()} ${S.orientation};margin:0}`;
    document.documentElement.style.setProperty('--pw', w + 'mm');
    document.documentElement.style.setProperty('--ph', h + 'mm');
  }

  function scaleToFit() {
    const wrap  = D.wrap;
    const paper = D.paper;
    const svg   = D.svg;
    if (!wrap || !paper || !svg) return;

    const { w, h } = paperMM();
    const MM = 96 / 25.4;          // px per mm at 96dpi
    const pxW = w * MM;
    const pxH = h * MM;

    const r = wrap.getBoundingClientRect();
    const availW = r.width  - 32;
    const availH = r.height - 32;
    if (availW <= 0 || availH <= 0) return;

    const scale = Math.min(availW / pxW, availH / pxH, 1);

    paper.style.width  = pxW + 'px';
    paper.style.height = pxH + 'px';
    paper.style.transform = `scale(${scale})`;

    // SVG: set px size + viewBox in mm so 1 unit = 1mm
    svg.style.width  = pxW + 'px';
    svg.style.height = pxH + 'px';
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    // Remove fixed attribute dims so CSS controls size
    svg.removeAttribute('width');
    svg.removeAttribute('height');
  }

  window.addEventListener('resize', scaleToFit);

  /* ── 5. SVG HELPERS ──────────────────────────────────── */
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  }

  /* ── 6. GRID GENERATOR ───────────────────────────────── */
  // ALL coordinates are unitless (= mm) because viewBox="0 0 W H" in mm

  const LC  = '#94a3b8';
  const ALC = '#c8d4e4';
  const CELL = 5;         // 5mm ГОСТ cell
  const LINE_STEP = 8;    // 8mm between baselines (line modes)
  const LINE_FIRST = 12;  // first baseline from top (mm)

  function makeGrid(type, W, H) {
    const g = el('g', { class: 'g-grid' });

    if (type === 'squared') {
      for (let y = 0; y <= H; y += CELL)
        g.append(el('line', { x1:0, y1:y, x2:W, y2:y, stroke:LC, 'stroke-width':.3 }));
      for (let x = 0; x <= W; x += CELL)
        g.append(el('line', { x1:x, y1:0, x2:x, y2:H, stroke:LC, 'stroke-width':.3 }));
    } else {
      for (let y = LINE_FIRST; y < H; y += LINE_STEP) {
        if (type !== 'wide')
          g.append(el('line', { x1:0, y1:y-4, x2:W, y2:y-4, stroke:ALC, 'stroke-width':.25 }));
        g.append(el('line', { x1:0, y1:y, x2:W, y2:y, stroke:LC, 'stroke-width':.35 }));
      }
      if (type === 'slanted' || type === 'frequent') {
        const sp = type === 'frequent' ? 5 : 20;
        const dx = H / Math.tan(65 * Math.PI / 180);
        for (let x = -dx; x < W + dx; x += sp)
          g.append(el('line', { x1:x, y1:0, x2:x+dx, y2:H, stroke:ALC, 'stroke-width':.25 }));
      }
    }

    // Red margin line
    g.append(el('line', { x1:20, y1:0, x2:20, y2:H, stroke:'#fca5a5', 'stroke-width':.45 }));
    return g;
  }

  /* ── 7. TEXT PARSER ──────────────────────────────────── */
  /**
   * Parses contenteditable DOM → Line[]
   * Line = Chunk[]
   * Chunk = { type:'text'|'accent', text?, color, ul, ulColor }
   */
  function parseEditor(root, defColor) {
    const lines = [];
    let cur = [];

    function push() { lines.push(cur); cur = []; }

    function walk(node, st) {
      if (node.nodeType === 3) { // TEXT
        const tx = node.textContent;
        for (let i = 0; i < tx.length; i++) {
          const c = tx[i];
          if (c === '\n') { push(); continue; }
          // Accent: double comma
          if (c === ',' && tx[i+1] === ',') {
            cur.push({ type:'accent', color: st.color }); i++; continue;
          }
          // Merge with last chunk if same style
          const last = cur[cur.length - 1];
          if (last && last.type === 'text' &&
              last.color === st.color && last.ul === st.ul && last.ulColor === st.ulColor) {
            last.text += c;
          } else {
            cur.push({ type:'text', text:c, color:st.color, ul:st.ul, ulColor:st.ulColor });
          }
        }
        return;
      }
      if (node.nodeType !== 1) return; // skip non-element

      const tag = node.nodeName;
      const isBlock = tag === 'DIV' || tag === 'P';
      const isBR    = tag === 'BR';

      if (isBR) { push(); return; }

      // Before children: if block and we have content, push current line
      if (isBlock && cur.length) push();

      // Inherit style
      const ns = { ...st };
      if (node.style.color) ns.color = node.style.color;
      else if (node.getAttribute('color')) ns.color = node.getAttribute('color');

      if (node.classList.contains('custom-ul')) {
        const m = node.className.match(/custom-ul-(solid|double|wavy|dashed|dotdash)/);
        if (m) ns.ul = m[1];
        const dc = node.style.textDecorationColor;
        const bi = node.style.backgroundImage;
        if (dc) ns.ulColor = dc;
        else if (bi) { const bm = bi.match(/rgba?\([^)]+\)|#[0-9a-fA-F]+/); if(bm) ns.ulColor = bm[0]; }
        if (!ns.ulColor) ns.ulColor = ns.color;
      }

      node.childNodes.forEach(ch => walk(ch, ns));

      // After children: if block, push accumulated line
      if (isBlock && cur.length) push();
    }

    root.childNodes.forEach(ch => walk(ch, { color: defColor, ul: 'none', ulColor: defColor }));
    if (cur.length) push();
    if (!lines.length) lines.push([]);
    return lines;
  }

  /* ── 8. SVG RENDERER ─────────────────────────────────── */
  /**
   * CRITICAL: font-size MUST be unitless integer/float.
   * In SVG with viewBox="0 0 W H" where W,H are mm:
   *   font-size="4.5" = 4.5 user-units = 4.5mm (correct!)
   *   font-size="4.5mm" = absolute CSS mm → may conflict with scaling
   * → Always use UNITLESS font-size.
   */

  // Text area constants (all mm = user units)
  const TL  = 25;   // text left  (past margin)
  const MB  = 8;    // bottom margin mm
  const MR  = 10;   // right margin mm

  function render(lines) {
    const svg  = D.svg;
    const type = S.grid;
    const mode = S.mode;
    const { w: W, h: H } = paperMM();

    // Clear old layers
    svg.querySelectorAll('.g-grid,.g-text').forEach(g => g.remove());

    // Draw grid
    svg.append(makeGrid(type, W, H));

    // Default text color
    const defColor = (mode === 'tracing' || mode === 'alternating') ? '#94a3b8' : '#1a2033';

    // Parse
    let inputLines = parseEditor(D.editor, defColor);

    // Alternating: interleave blank lines
    if (mode === 'alternating') {
      const alt = [];
      inputLines.forEach(l => { alt.push(l); alt.push([]); });
      inputLines = alt;
    }

    // Render text layer
    const tg = el('g', { class: 'g-text' });
    let over = false;

    if (type === 'squared') {
      over = renderSquared(tg, inputLines, W, H, defColor);
    } else {
      over = renderLines(tg, inputLines, W, H, defColor);
    }

    svg.append(tg);
    return over;
  }

  /* ── SQUARED MODE ─────────────────────────────────────── */
  function renderSquared(g, lines, W, H, defColor) {
    /* Font size for 5mm cell.
     * Target: character body (cap-height) ≈ 60-70% of cell = 3-3.5mm
     * font-size = cap-height / 0.68 ≈ 4.5 user-units
     * Baseline placed at 82% of cell height from cell-top → 4.1mm
     */
    const FS   = 4.5;          // unitless = 4.5mm
    const TR   = W - MR;       // text right edge (mm)
    const cols = Math.floor((TR - TL) / CELL);  // cells available per row

    // Y: baseline of row r, cell-top = 5 + r*5
    // Baseline at 82% of cell → 4.1mm from top → offset = 4.1
    const baseY = r => 5 + r * CELL + 4.1;
    // Y for math operators (center of cell)
    const midY  = r => 5 + r * CELL + CELL / 2;
    // X center of column c
    const midX  = c => TL + c * CELL + CELL / 2;

    let row = 0, col = 0;
    let over = false;

    function bump() {   // advance to next row
      row++; col = 0;
      if (5 + row * CELL + CELL > H - MB) over = true;
    }

    lines.forEach(chunks => {
      if (over) return;

      // Rebuild raw string from chunks
      let raw = '';
      chunks.forEach(ck => {
        if (ck.type === 'accent') raw += '\u02CA';  // modifier letter acute
        else raw += ck.text;
      });

      // Empty line → blank row
      if (!raw.trim()) { bump(); return; }

      // Tokenize by spaces
      raw.split(/( +)/).forEach(tok => {
        if (over) return;
        if (!tok) return;

        if (/^ +$/.test(tok)) {
          // Spaces = empty cells
          col += tok.length;
          if (col >= cols) bump();
          return;
        }

        const chars = [...tok];  // Unicode-aware split

        // Whole-token wrap: if token doesn't fit on rest of row, go to next
        if (col > 0 && col + chars.length > cols) bump();

        chars.forEach(ch => {
          if (over) return;
          if (col >= cols) bump();
          if (over) return;

          const cx = midX(col);
          const isMathOp = /^[+\-×÷=]$/.test(ch);
          const isComma  = ch === ',' || ch === '.';
          const isLetter = /[а-яёА-ЯЁa-zA-Z]/u.test(ch);

          const ff = isLetter
            ? 'Propisi, ClassRoomCursive, cursive'
            : 'Inter, system-ui, monospace';

          let cy, domBase;
          if (isMathOp)   { cy = midY(row);            domBase = 'central'; }
          else if (isComma){ cy = baseY(row) + FS * .08; domBase = 'alphabetic'; }
          else             { cy = baseY(row);            domBase = 'alphabetic'; }

          const t = el('text', {
            x: cx.toFixed(2),
            y: cy.toFixed(2),
            fill: defColor,
            'font-size': FS,            // ← UNITLESS (= mm)
            'font-family': ff,
            'text-anchor': 'middle',
            'dominant-baseline': domBase,
          });
          t.textContent = ch;
          g.append(t);
          col++;
        });
      });

      // Each input line ends → advance row
      bump();
    });

    return over;
  }

  /* ── LINE MODE ────────────────────────────────────────── */
  function renderLines(g, lines, W, H, defColor) {
    /* Row step = LINE_STEP (8mm), first baseline at LINE_FIRST (12mm).
     * font-size = 5.0 (5mm): cap-height ≈ 3.5mm, well within 8mm row.
     * dominant-baseline = alphabetic → text hangs from y baseline.
     */
    const FS = 5.0;             // unitless = 5mm
    const TR = W - MR;

    // Approximate char width (user-units = mm) for wrapping
    function cw(ch) {
      if (/[mwМШЩЖ]/u.test(ch)) return FS * 0.72;
      if (/[iIl1|]/u.test(ch))  return FS * 0.32;
      if (/[а-яёА-ЯЁa-zA-Z]/u.test(ch)) return FS * 0.60;
      if (/[0-9]/u.test(ch))    return FS * 0.52;
      if (/[+\-=×÷]/u.test(ch)) return FS * 0.48;
      return FS * 0.50;
    }

    let row  = 0;
    let curX = TL;
    let over = false;

    function baseY() { return LINE_FIRST + row * LINE_STEP; }
    function checkOver() { return baseY() + LINE_STEP > H - MB; }
    function nextRow() { row++; curX = TL; if (checkOver()) over = true; }

    lines.forEach(chunks => {
      if (over) return;

      if (!chunks.length) { nextRow(); return; }

      chunks.forEach(ck => {
        if (over) return;

        if (ck.type === 'accent') {
          // Small angled stroke above baseline
          const ax = curX - 1;
          const ay = baseY();
          const acc = el('line', {
            x1:(ax-1).toFixed(2), y1:(ay - FS*1.15).toFixed(2),
            x2:(ax+.5).toFixed(2),y2:(ay - FS*1.45).toFixed(2),
            stroke: ck.color, 'stroke-width': .35, 'stroke-linecap':'round',
          });
          g.append(acc);
          return;
        }

        const chars = [...ck.text];
        const ff = /[а-яёА-ЯЁa-zA-Z]/u.test(ck.text[0] || '')
          ? 'Propisi, ClassRoomCursive, cursive'
          : 'Inter, system-ui, sans-serif';

        // Buffer chars into runs for fewer SVG nodes, wrapping at right edge
        let buf = '', bufW = 0;

        const flushBuf = () => {
          if (!buf) return;
          const t = el('text', {
            x: curX.toFixed(2),
            y: baseY().toFixed(2),
            fill: ck.color || defColor,
            'font-size': FS,            // ← UNITLESS (= mm)
            'font-family': ff,
            'dominant-baseline': 'alphabetic',
            'text-anchor': 'start',
          });
          t.textContent = buf;
          g.append(t);

          // Underline if needed
          if (ck.ul && ck.ul !== 'none') {
            drawUnderline(g, curX, curX + bufW, baseY(), ck.ul, ck.ulColor, FS);
          }

          curX += bufW;
          buf = ''; bufW = 0;
        };

        chars.forEach(ch => {
          if (over) return;
          const w = cw(ch);
          if (curX + bufW + w > TR && (curX > TL || bufW > 0)) {
            flushBuf();
            nextRow();
            if (over) return;
          }
          buf  += ch;
          bufW += w;
        });
        flushBuf();
      });

      nextRow();
    });

    return over;
  }

  function drawUnderline(g, x1, x2, y, type, color, fs) {
    const uy = y + fs * 0.12;
    const attrs = { stroke: color, 'stroke-linecap':'round' };

    if (type === 'double') {
      [[uy-.4, .3],[uy+.8, .3]].forEach(([ly, sw]) =>
        g.append(el('line', { x1:x1.toFixed(2), y1:ly.toFixed(2),
          x2:x2.toFixed(2), y2:ly.toFixed(2), ...attrs, 'stroke-width':sw })));
    } else if (type === 'solid') {
      g.append(el('line', { x1:x1.toFixed(2), y1:uy.toFixed(2),
        x2:x2.toFixed(2), y2:uy.toFixed(2), ...attrs, 'stroke-width':.4 }));
    } else if (type === 'dashed') {
      const l = el('line', { x1:x1.toFixed(2), y1:uy.toFixed(2),
        x2:x2.toFixed(2), y2:uy.toFixed(2), ...attrs, 'stroke-width':.4 });
      l.setAttribute('stroke-dasharray','2 1'); g.append(l);
    } else if (type === 'dotdash') {
      const l = el('line', { x1:x1.toFixed(2), y1:uy.toFixed(2),
        x2:x2.toFixed(2), y2:uy.toFixed(2), ...attrs, 'stroke-width':.4 });
      l.setAttribute('stroke-dasharray','3 1 .8 1'); g.append(l);
    } else if (type === 'wavy') {
      const pts = [];
      const step = 1.5;
      for (let x = x1, dir = -1; x <= x2; x += step, dir *= -1)
        pts.push(`${x.toFixed(1)},${(uy + dir*.4).toFixed(1)}`);
      const pl = el('polyline', { points: pts.join(' '), fill:'none',
        stroke: color, 'stroke-width':.3 });
      g.append(pl);
    }
  }

  /* ── 9. RENDER PIPELINE ──────────────────────────────── */
  let _timer = null;
  function scheduleRender() {
    clearTimeout(_timer);
    _timer = setTimeout(() => {
      applyPrint();
      scaleToFit();
      const over = render(parseEditor(D.editor,
        (S.mode==='tracing'||S.mode==='alternating') ? '#94a3b8' : '#1a2033'));
      handleOverflow(over);
    }, 160);
  }

  function handleOverflow(over) {
    if (over && !S.overflow) {
      S.overflow = true;
      D.editor.classList.add('is-error');
      D.editor.contentEditable = 'false';
      toast('⚠️', 'Лист заполнен — распечатайте или скачайте его', 'error', 0);
    } else if (!over && S.overflow) {
      S.overflow = false;
      D.editor.classList.remove('is-error');
      D.editor.contentEditable = 'true';
      hideToast();
    }
  }

  /* ── 10. TOAST ───────────────────────────────────────── */
  let _toastTimer = null;
  function toast(icon, msg, type = 'info', dur = 4000) {
    clearTimeout(_toastTimer);
    D.toast.className = 'toast t-' + type;
    D.toast.querySelector('.toast-icon').textContent = icon;
    D.toastMsg.textContent = msg;
    D.toast.offsetHeight; // force reflow
    D.toast.classList.add('is-on');
    if (dur > 0) _toastTimer = setTimeout(hideToast, dur);
  }
  function hideToast() { D.toast.classList.remove('is-on'); }

  /* ── 11. BUTTON STATES ───────────────────────────────── */
  function btnState(btn, state, ms = 2200) {
    btn.classList.remove('is-loading','is-success','is-error');
    if (state) {
      btn.classList.add('is-' + state);
      if (state !== 'loading') setTimeout(() => btn.classList.remove('is-' + state), ms);
    }
  }

  /* ── 12. EXPORT ──────────────────────────────────────── */
  function printSheet() {
    if (S.overflow) { toast('⚠️','Лист переполнен — сократите текст перед печатью','error'); return; }
    track('print'); btnState(D.printBtn, 'loading');
    const lbl = D.printBtn.querySelector('.btn-text');
    const old = lbl?.textContent;
    if (lbl) lbl.textContent = 'Печатаем...';
    setTimeout(() => { window.print(); btnState(D.printBtn, 'success'); if(lbl) lbl.textContent = old; }, 350);
  }
  function downloadPDF() {
    if (S.overflow) { toast('⚠️','Лист переполнен — сократите текст перед скачиванием','error'); return; }
    track('pdf'); btnState(D.pdfBtn, 'loading');
    const lbl = D.pdfBtn.querySelector('.btn-text');
    const old = lbl?.textContent;
    if (lbl) lbl.textContent = 'Генерация листа...';
    setTimeout(() => { window.print(); btnState(D.pdfBtn, 'success'); if(lbl) lbl.textContent = old; }, 600);
  }

  /* ── 13. FORMATTING TOOLBAR ──────────────────────────── */
  let lineColor = '#0F172A';

  function fmtColor(c) {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, c);
    scheduleRender();
  }
  function fmtUL(type) {
    const sel = window.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return;
    const rng = sel.getRangeAt(0);
    const sp  = document.createElement('span');
    sp.className = `custom-ul custom-ul-${type}`;
    if (type === 'dotdash') {
      sp.style.backgroundImage = `repeating-linear-gradient(to right,${lineColor} 0,${lineColor} 8px,transparent 8px,transparent 12px,${lineColor} 12px,${lineColor} 16px,transparent 16px,transparent 20px)`;
    } else {
      sp.style.textDecorationColor = lineColor;
    }
    try {
      const frag = rng.extractContents();
      sp.append(frag); rng.insertNode(sp);
    } catch(_) { toast('ℹ️','Выделяйте текст в пределах одной строки'); }
    scheduleRender();
  }
  function clearFmt() {
    document.execCommand('removeFormat', false, null);
    const sel = window.getSelection();
    D.editor.querySelectorAll('.custom-ul').forEach(sp => {
      if (sel?.containsNode(sp, true))
        sp.replaceWith(document.createTextNode(sp.textContent));
    });
    scheduleRender();
  }

  /* ── 14. SEG-GROUP WIRING ────────────────────────────── */
  function wireSegGroups() {
    document.querySelectorAll('.seg-group[data-sk]').forEach(grp => {
      grp.addEventListener('click', e => {
        const btn = e.target.closest('.seg-btn');
        if (!btn || btn.disabled) return;
        grp.querySelectorAll('.seg-btn').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed','false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed','true');
        const key = grp.dataset.sk, val = btn.dataset.v;
        if (key && val !== undefined) { S[key] = val; scheduleRender(); }
      });
    });
    // Sync initial state from HTML
    document.querySelectorAll('.seg-group[data-sk]').forEach(grp => {
      const active = grp.querySelector('.seg-btn.is-active');
      if (active?.dataset.v) S[grp.dataset.sk] = active.dataset.v;
    });
  }

  /* ── 15. ANALYSIS MODE ───────────────────────────────── */
  function wireAnalysis() {
    D.aTgl.addEventListener('change', () => {
      S.analysis = D.aTgl.checked;
      D.aPills.classList.toggle('is-open', S.analysis);
      track(S.analysis ? 'analysis_on' : 'analysis_off');
    });
    document.querySelectorAll('.pill-btn[data-ac]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pill-btn[data-ac]').forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-pressed','false'); });
        btn.classList.add('is-active'); btn.setAttribute('aria-pressed','true');
        S.aColor = lineColor = btn.dataset.ac;
      });
    });
    document.querySelectorAll('.pill-btn[data-aul]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pill-btn[data-aul]').forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-pressed','false'); });
        btn.classList.add('is-active'); btn.setAttribute('aria-pressed','true');
        S.aUL = btn.dataset.aul;
        if (S.analysis) fmtUL(S.aUL);
      });
    });
  }

  /* ── 16. BOOT ────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    wireSegGroups();
    wireAnalysis();

    // Text color buttons
    document.querySelectorAll('.tbtn[data-tc]').forEach(btn =>
      btn.addEventListener('click', () => fmtColor(btn.dataset.tc)));

    // Line color buttons
    document.querySelectorAll('.tbtn[data-lc]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tbtn[data-lc]').forEach(b => b.classList.remove('lc-active'));
        btn.classList.add('lc-active');
        lineColor = btn.dataset.lc;
      });
    });

    // Underline buttons
    document.querySelectorAll('.tbtn[data-ul]').forEach(btn =>
      btn.addEventListener('click', () => fmtUL(btn.dataset.ul)));

    // Clear format
    D.clrBtn.addEventListener('click', clearFmt);

    // Editor input
    D.editor.addEventListener('input', () => {
      if (S.overflow) {
        S.overflow = false;
        D.editor.classList.remove('is-error');
        D.editor.contentEditable = 'true';
        hideToast();
      }
      scheduleRender();
    });

    // Paste → plain text
    D.editor.addEventListener('paste', e => {
      e.preventDefault();
      const txt = (e.originalEvent || e).clipboardData.getData('text/plain');
      document.execCommand('insertText', false, txt);
    });

    // Export
    D.printBtn.addEventListener('click', printSheet);
    D.pdfBtn.addEventListener('click', downloadPDF);

    // Toast close
    D.toastX.addEventListener('click', hideToast);

    // First render after fonts load
    const go = () => {
      applyPrint();
      // Small delay to let layout stabilize
      setTimeout(() => { scaleToFit(); scheduleRender(); }, 80);
    };
    document.fonts?.ready ? document.fonts.ready.then(go) : window.addEventListener('load', go);
  });

})();
