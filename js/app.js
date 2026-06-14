/**
 * ПРОПИСИ — App Logic
 * Vanilla JS · SVG rendering · ГОСТ 5mm grid · UTM Analytics
 */
(function () {
  'use strict';

  /* ============================================================
     1. UTM & ANALYTICS
     ============================================================ */
  function parseUTM() {
    try {
      const params = new URLSearchParams(window.location.search);
      const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
      const data = {};
      utmKeys.forEach(k => {
        if (params.has(k)) data[k] = params.get(k);
      });
      if (Object.keys(data).length) {
        sessionStorage.setItem('propisi_utm', JSON.stringify(data));
      }
    } catch (_) {}
  }

  function getUTM() {
    try { return JSON.parse(sessionStorage.getItem('propisi_utm') || '{}'); } catch (_) { return {}; }
  }

  function track(action, params = {}) {
    try {
      const payload = { action, ...getUTM(), ...params };
      // Yandex Metrica
      if (typeof ym === 'function') {
        ym(109849947, 'reachGoal', action, payload);
      }
      // GTM dataLayer
      if (window.dataLayer) {
        window.dataLayer.push({ event: 'propisi_' + action, ...payload });
      }
    } catch (_) {}
  }

  // Delegate analytics: any element with data-action triggers track()
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el) track(el.dataset.action, { label: el.dataset.label || '' });
  });

  /* ============================================================
     2. STATE
     ============================================================ */
  const STATE = {
    grid:         'squared',   // squared | wide | narrow | slanted | frequent
    mode:         'tracing',   // tracing | copy | alternating
    format:       'a4',        // a4 | a5
    orientation:  'portrait',  // portrait | landscape
    analysisMode: false,
    analysisColor: '#0F172A',
    analysisUL:    'solid',
    overflowed:   false,
  };

  // Paper dimensions in mm (canonical portrait)
  const PAPER_DIMS = { a4: [210, 297], a5: [148, 210] };
  // Grid constants — all in mm
  const CELL_MM   = 5;          // ГОСТ — строго 5 мм
  const MARGIN_L  = 20;         // left red margin mm
  const TEXT_L    = 25;         // text start mm (after margin)
  const MARGIN_R  = 10;         // right padding mm
  const MARGIN_T  = 5;          // top padding mm
  const MARGIN_B  = 5;          // bottom padding mm

  /* ============================================================
     3. DOM REFS
     ============================================================ */
  const $ = id => document.getElementById(id);
  const DOM = {
    editor:         $('textEditor'),
    svgEl:          $('worksheetSVG'),
    worksheetPaper: $('worksheetPaper'),
    previewScaler:  $('previewScaler'),
    printBtn:       $('printBtn'),
    pdfBtn:         $('pdfBtn'),
    toast:          $('toast'),
    toastMsg:       $('toastMsg'),
    toastClose:     $('toastClose'),
    analysisTgl:    $('analysisTgl'),
    analysisPills:  $('analysisPills'),
    clearFmtBtn:    $('clearFmtBtn'),
    activeLineColorInput: null,
  };

  /* ============================================================
     4. PAPER DIMENSIONS HELPER
     ============================================================ */
  function getPaperMM() {
    let [w, h] = PAPER_DIMS[STATE.format] || PAPER_DIMS.a4;
    if (STATE.orientation === 'landscape') [w, h] = [h, w];
    return { w, h };
  }

  // Update CSS variables so the SVG element matches paper size
  function applyPaperCSS() {
    const { w, h } = getPaperMM();
    const root = document.documentElement.style;
    root.setProperty('--paper-w', w + 'mm');
    root.setProperty('--paper-h', h + 'mm');

    // Also update @page rule for print
    let styleNode = $('dynamic-print-style');
    if (!styleNode) {
      styleNode = document.createElement('style');
      styleNode.id = 'dynamic-print-style';
      document.head.appendChild(styleNode);
    }
    styleNode.textContent = `@page { size: ${STATE.format.toUpperCase()} ${STATE.orientation}; margin: 0; }`;

    // Scale SVG to fit preview area
    scaleSVGToFit();
  }

  function scaleSVGToFit() {
    const scaler = DOM.previewScaler;
    const paper  = DOM.worksheetPaper;
    if (!scaler || !paper) return;

    const rect   = scaler.getBoundingClientRect();
    const availW = rect.width  - 48;
    const availH = rect.height - 48;
    if (availW <= 0 || availH <= 0) return;

    const { w, h } = getPaperMM();
    // Convert mm → px at 96 DPI
    const MM_TO_PX = 96 / 25.4;
    const pxW = w * MM_TO_PX;
    const pxH = h * MM_TO_PX;

    const scale = Math.min(availW / pxW, availH / pxH, 1);

    paper.style.width            = pxW + 'px';
    paper.style.height           = pxH + 'px';
    paper.style.transform        = `scale(${scale})`;
    paper.style.transformOrigin  = 'top center';

    // Also update SVG pixel size
    const svg = DOM.svgEl;
    if (svg) {
      svg.style.width  = pxW + 'px';
      svg.style.height = pxH + 'px';
    }
  }

  window.addEventListener('resize', scaleSVGToFit);

  /* ============================================================
     5. GRID SVG GENERATOR
     (returns SVG <g> element containing all grid lines)
     All coordinates in mm units — SVG viewBox is also in mm.
     ============================================================ */
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function makeLine(x1, y1, x2, y2, stroke, sw) {
    const ln = document.createElementNS(SVG_NS, 'line');
    ln.setAttribute('x1', x1); ln.setAttribute('y1', y1);
    ln.setAttribute('x2', x2); ln.setAttribute('y2', y2);
    ln.setAttribute('stroke', stroke);
    ln.setAttribute('stroke-width', sw);
    return ln;
  }

  function generateGridGroup(type, W, H) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'grid-layer');

    const LC  = '#94a3b8';   // line color
    const ALC = '#c8d4e4';   // aux line color

    if (type === 'squared') {
      // Horizontal lines every 5mm
      for (let y = 0; y <= H; y += CELL_MM) {
        g.appendChild(makeLine(0, y, W, y, LC, 0.3));
      }
      // Vertical lines every 5mm
      for (let x = 0; x <= W; x += CELL_MM) {
        g.appendChild(makeLine(x, 0, x, H, LC, 0.3));
      }
    } else {
      // Line-based grids
      const isWide  = type === 'wide';
      const stepMM  = isWide ? 8 : 8;   // 8mm row height (≈narrow)
      const topMM   = 12;               // first baseline from top

      for (let y = topMM; y < H; y += stepMM) {
        // Top auxiliary line (upper cap line)
        if (!isWide) {
          g.appendChild(makeLine(0, y - 4, W, y - 4, ALC, 0.3));
        }
        // Baseline
        g.appendChild(makeLine(0, y, W, y, LC, 0.4));
      }

      // Slanted lines
      if (type === 'slanted' || type === 'frequent') {
        const slantSpacing = type === 'frequent' ? 5 : 20; // mm
        const angle        = 65;                           // degrees from horizontal
        const tanA         = Math.tan(angle * Math.PI / 180);
        const dx           = H / tanA;                    // horizontal run for full height

        for (let x = -dx; x < W + dx; x += slantSpacing) {
          g.appendChild(makeLine(x, 0, x + dx, H, ALC, 0.3));
        }
      }
    }

    // Red margin line
    const redLine = makeLine(MARGIN_L, 0, MARGIN_L, H, '#fca5a5', 0.5);
    redLine.setAttribute('class', 'margin-line');
    g.appendChild(redLine);

    return g;
  }

  /* ============================================================
     6. TEXT PARSER
     Parses the contenteditable DOM and returns:
       Line[] where Line = Chunk[]
       Chunk = { text, color, ul, ulColor, isMath, isAccent }
     ============================================================ */
  function getParsedLines(editorNode, defaultColor) {
    const lines = [];
    let currentLine = [];

    function pushLine() {
      lines.push(currentLine);
      currentLine = [];
    }

    function traverse(node, state) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (ch === '\n') { pushLine(); continue; }

          // Accent mark: two commas
          if (ch === ',' && i + 1 < text.length && text[i + 1] === ',') {
            currentLine.push({ type: 'accent', color: state.color });
            i++;
            continue;
          }

          const isMath = /[0-9+\-×÷=№().,]/.test(ch);
          const last   = currentLine[currentLine.length - 1];

          if (last && last.type !== 'accent' &&
              last.color === state.color &&
              last.ul === state.ul &&
              last.ulColor === state.ulColor &&
              last.isMath === isMath) {
            last.text += ch;
          } else {
            currentLine.push({
              type: 'text',
              text: ch,
              color: state.color,
              ul: state.ul,
              ulColor: state.ulColor,
              isMath,
            });
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const isBlock = /^(DIV|P|BR)$/.test(node.nodeName);
        const isBR    = node.nodeName === 'BR';

        if (isBlock && currentLine.length > 0) pushLine();
        if (isBR) { pushLine(); return; }

        const newState = { ...state };
        if (node.style.color) newState.color = node.style.color;
        else if (node.getAttribute('color')) newState.color = node.getAttribute('color');

        if (node.classList.contains('custom-ul')) {
          const m = node.className.match(/custom-ul-(solid|double|wavy|dashed|dotdash)/);
          if (m) newState.ul = m[1];
          if (node.style.textDecorationColor) newState.ulColor = node.style.textDecorationColor;
          else if (node.style.backgroundImage) {
            const bg = node.style.backgroundImage.match(/rgba?\([^)]+\)|#[0-9a-fA-F]+/);
            if (bg) newState.ulColor = bg[0];
          }
          if (!newState.ulColor) newState.ulColor = newState.color;
        }

        node.childNodes.forEach(child => traverse(child, newState));

        if (isBlock && currentLine.length > 0) pushLine();
      }
    }

    editorNode.childNodes.forEach(child =>
      traverse(child, { color: defaultColor, ul: 'none', ulColor: defaultColor })
    );
    if (currentLine.length > 0) pushLine();
    if (lines.length === 0) lines.push([]);

    return lines;
  }

  /* ============================================================
     7. SVG TEXT RENDERER
     ============================================================ */

  /**
   * Renders all content lines into the SVG element.
   * Returns true if content overflows the page.
   */
  function renderToSVG(lines) {
    const svg  = DOM.svgEl;
    const type = STATE.grid;
    const mode = STATE.mode;
    const { w: W, h: H } = getPaperMM();

    // Clear previous rendered text (keep grid group)
    const oldText = svg.querySelector('.text-layer');
    if (oldText) svg.removeChild(oldText);
    const oldGrid = svg.querySelector('.grid-layer');
    if (oldGrid) svg.removeChild(oldGrid);

    // Regenerate grid
    svg.appendChild(generateGridGroup(type, W, H));

    // Text color
    const defaultColor = (mode === 'tracing' || mode === 'alternating') ? '#94a3b8' : '#0F172A';

    // Expand for alternating mode
    let renderLines = lines;
    if (mode === 'alternating') {
      renderLines = [];
      lines.forEach(l => { renderLines.push(l); renderLines.push([]); });
    }

    const textG = document.createElementNS(SVG_NS, 'g');
    textG.setAttribute('class', 'text-layer');
    let overflowed = false;

    if (type === 'squared') {
      overflowed = renderSquaredMode(textG, renderLines, W, H, defaultColor);
    } else {
      overflowed = renderLineMode(textG, renderLines, W, H, defaultColor, type);
    }

    svg.appendChild(textG);
    return overflowed;
  }

  /* ── SQUARED MODE (1 symbol per 5mm cell) ─────────────── */
  function renderSquaredMode(g, lines, W, H, defaultColor) {
    // Available text area in mm
    const textStartX  = TEXT_L;                    // mm from left
    const textEndX    = W - MARGIN_R;              // mm from left
    const textWidth   = textEndX - textStartX;     // mm
    const cellsPerRow = Math.floor(textWidth / CELL_MM);

    // Font size: character must fit inside 5mm cell
    // Target: cap-height ≈ 3.2mm → font-size ≈ 4.5mm (80% cap-height ratio for most fonts)
    // For numeric/math chars, we use a monospace-ish size
    // We want the char to be visually centered in the 5mm×5mm cell
    const FONT_SIZE_MM = 3.8;   // designed so digit height ≈ 3.2mm leaving ~0.9mm top+bottom padding
    const CELL_OFFSET_Y_MM = (CELL_MM - FONT_SIZE_MM) / 2 + FONT_SIZE_MM * 0.75; // baseline within cell

    let row = 0;
    let col = 0;
    let overflowed = false;

    // Calculate first row Y (top of first cell)
    function cellTopY(r) { return MARGIN_T + r * CELL_MM; }
    function baselineY(r) { return cellTopY(r) + CELL_OFFSET_Y_MM; }
    function cellCenterX(c) { return textStartX + c * CELL_MM + CELL_MM / 2; }

    function nextRow() {
      row++;
      col = 0;
      if (cellTopY(row) + CELL_MM > H - MARGIN_B) overflowed = true;
    }

    function makeSVGText(x, y, text, fill, fontSize, baseline, anchor) {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', x);
      t.setAttribute('y', y);
      t.setAttribute('fill', fill);
      t.setAttribute('font-size', fontSize + 'mm');
      t.setAttribute('dominant-baseline', baseline || 'alphabetic');
      t.setAttribute('text-anchor', anchor || 'middle');
      t.textContent = text;
      return t;
    }

    lines.forEach(lineChunks => {
      if (overflowed) return;

      // Tokenize the line by spaces for whole-token wrapping
      // First flatten chunks into tokens
      const tokens = [];
      let spaceBuffer = 0;

      // Rebuild raw text from chunks
      let rawText = '';
      lineChunks.forEach(chunk => {
        if (chunk.type === 'accent') rawText += '\u0301'; // combining accent placeholder
        else rawText += chunk.text;
      });

      // Tokenize: split by spaces, keeping spaces as empty-cell markers
      const parts = rawText.split(/( +)/);
      parts.forEach(part => {
        if (/^ +$/.test(part)) {
          // Each space = one empty cell
          tokens.push({ type: 'space', count: part.length });
        } else if (part.length > 0) {
          tokens.push({ type: 'word', text: part });
        }
      });

      // Render tokens
      tokens.forEach(token => {
        if (overflowed) return;

        if (token.type === 'space') {
          col += token.count;
          while (col >= cellsPerRow) { col -= cellsPerRow; nextRow(); }
          return;
        }

        // Word token: check if it fits in remaining cells on this row
        const chars = [...token.text]; // Unicode-aware
        const needed = chars.length;

        // If word doesn't fit in current row at all → wrap
        if (col > 0 && col + needed > cellsPerRow) {
          // Move to next row
          nextRow();
          if (overflowed) return;
        }

        // If even a fresh row can't fit it → render char-by-char with forced break
        chars.forEach(ch => {
          if (overflowed) return;
          if (col >= cellsPerRow) { nextRow(); if (overflowed) return; }

          const cx = cellCenterX(col);
          const by = baselineY(row);

          // Special vertical alignment for math symbols
          let domBase = 'alphabetic';
          let fillColor = defaultColor;

          // Try to map char back to original chunk color
          // (simplified: use defaultColor; full color mapping would need chunk-char indexing)
          const isMathOp = /[+\-×÷=]/.test(ch);
          const isComma  = ch === ',';

          if (isMathOp) {
            // Center math operators vertically in cell
            domBase = 'central';
            const cy = cellTopY(row) + CELL_MM / 2;
            const t  = makeSVGText(cx, cy, ch, fillColor, FONT_SIZE_MM, 'central', 'middle');
            t.setAttribute('font-family', 'Inter, system-ui, sans-serif');
            t.setAttribute('font-weight', '600');
            g.appendChild(t);
          } else if (isComma) {
            // Comma sits at bottom of cell
            const t = makeSVGText(cx, cellTopY(row) + CELL_MM - 0.4, ch, fillColor, FONT_SIZE_MM, 'alphabetic', 'middle');
            g.appendChild(t);
          } else {
            const t = makeSVGText(cx, by, ch, fillColor, FONT_SIZE_MM, 'alphabetic', 'middle');
            // Use Propisi font for letters
            const isLetter = /[а-яёА-ЯЁa-zA-Z]/.test(ch);
            if (isLetter) {
              t.setAttribute('font-family', 'Propisi, ClassRoomCursive, cursive');
            } else {
              t.setAttribute('font-family', 'Inter, system-ui, sans-serif');
              t.setAttribute('font-weight', '500');
            }
            g.appendChild(t);
          }

          col++;
        });
      });

      // End of logical line: move to next row if we have content
      if (col > 0) { nextRow(); }
      else if (lineChunks.length === 0) { nextRow(); } // blank line
    });

    return overflowed;
  }

  /* ── LINE MODE (линейка / косая / широкая) ────────────── */
  function renderLineMode(g, lines, W, H, defaultColor, type) {
    const isWide   = type === 'wide';
    const rowMM    = 8;          // row step in mm
    const firstY   = 12;        // first baseline from top in mm (matches grid)
    const textX    = TEXT_L;    // mm
    const textEndX = W - MARGIN_R;

    // Font size: fill most of the 8mm row (cap-height ≈ 4mm)
    const FONT_SIZE_MM = 6.5;
    const lineHeight   = rowMM;

    let row      = 0;
    let overflowed = false;

    function baselineY(r) { return firstY + r * lineHeight; }

    const charWidthCache = {};
    // Approximate char width at given font-size (in mm)
    // For SVG without canvas measurement we use em-based approximation
    function approxWidth(ch, fsMM) {
      const key = ch + fsMM;
      if (charWidthCache[key]) return charWidthCache[key];
      // Rough: most chars ~0.55× font-size, wide chars ~0.7×
      const wide  = /[mwМШЩЖ]/.test(ch);
      const narrow = /[iIljJ1|iіїі]/.test(ch);
      const w = fsMM * (wide ? 0.72 : narrow ? 0.32 : 0.56);
      charWidthCache[key] = w;
      return w;
    }

    lines.forEach(lineChunks => {
      if (overflowed) return;

      const y = baselineY(row);
      if (y > H - MARGIN_B) { overflowed = true; return; }

      let curX = textX;

      lineChunks.forEach(chunk => {
        if (overflowed) return;
        if (chunk.type === 'accent') {
          // Render accent mark as a short tilted line above previous char
          const ax = curX - 2;
          const ay = y - FONT_SIZE_MM * 0.9;
          const accLine = document.createElementNS(SVG_NS, 'line');
          accLine.setAttribute('x1', ax - 1); accLine.setAttribute('y1', ay + 1.5);
          accLine.setAttribute('x2', ax + 1); accLine.setAttribute('y2', ay - 1.5);
          accLine.setAttribute('stroke', chunk.color);
          accLine.setAttribute('stroke-width', '0.5');
          accLine.setAttribute('stroke-linecap', 'round');
          g.appendChild(accLine);
          return;
        }

        // Wrap long text to next row
        const chars    = [...chunk.text];
        let   pending  = '';
        let   pendingW = 0;

        const flush = () => {
          if (!pending) return;
          const t = document.createElementNS(SVG_NS, 'text');
          t.setAttribute('x', curX);
          t.setAttribute('y', baselineY(row));
          t.setAttribute('fill', chunk.color);
          t.setAttribute('font-size', FONT_SIZE_MM + 'mm');
          t.setAttribute('dominant-baseline', 'alphabetic');
          t.setAttribute('text-anchor', 'start');

          const isLetter = /[а-яёА-ЯЁa-zA-Z]/.test(pending[0]);
          if (isLetter) {
            t.setAttribute('font-family', 'Propisi, cursive');
          } else {
            t.setAttribute('font-family', 'Inter, system-ui, sans-serif');
            t.setAttribute('font-weight', chunk.isMath ? '500' : '400');
          }
          t.textContent = pending;
          g.appendChild(t);

          // Underline if needed
          if (chunk.ul && chunk.ul !== 'none') {
            renderUnderline(g, curX, curX + pendingW, baselineY(row), chunk.ul, chunk.ulColor, FONT_SIZE_MM);
          }

          curX   += pendingW;
          pending = '';
          pendingW = 0;
        };

        chars.forEach(ch => {
          const chW = approxWidth(ch, FONT_SIZE_MM);
          if (curX + pendingW + chW > textEndX) {
            flush();
            row++;
            if (baselineY(row) > H - MARGIN_B) { overflowed = true; return; }
            curX = textX;
          }
          pending  += ch;
          pendingW += chW;
        });
        flush();
      });

      row++;
    });

    return overflowed;
  }

  function renderUnderline(g, x1, x2, y, ulType, color, fsMM) {
    const uly = y + fsMM * 0.12;  // just below baseline

    if (ulType === 'double') {
      [uly - 0.5, uly + 0.8].forEach(ly => {
        const l = makeLine(x1, ly, x2, ly, color, 0.3);
        g.appendChild(l);
      });
    } else if (ulType === 'solid') {
      g.appendChild(makeLine(x1, uly, x2, uly, color, 0.4));
    } else if (ulType === 'dashed') {
      const l = makeLine(x1, uly, x2, uly, color, 0.4);
      l.setAttribute('stroke-dasharray', '2,1');
      g.appendChild(l);
    } else if (ulType === 'dotdash') {
      const l = makeLine(x1, uly, x2, uly, color, 0.4);
      l.setAttribute('stroke-dasharray', '3,1,0.8,1');
      g.appendChild(l);
    } else if (ulType === 'wavy') {
      // Approximate wavy with a polyline
      const pts = [];
      const step = 2; // mm
      let dir = -1;
      for (let x = x1; x <= x2; x += step) {
        pts.push(`${x},${uly + dir * 0.5}`);
        dir *= -1;
      }
      const poly = document.createElementNS(SVG_NS, 'polyline');
      poly.setAttribute('points', pts.join(' '));
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', color);
      poly.setAttribute('stroke-width', '0.3');
      g.appendChild(poly);
    }
  }

  /* ============================================================
     8. MAIN RENDER ORCHESTRATOR
     ============================================================ */
  let renderTimer = null;

  function renderAll() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(_doRender, 180);
  }

  function _doRender() {
    applyPaperCSS();

    const mode         = STATE.mode;
    const defaultColor = (mode === 'tracing' || mode === 'alternating') ? '#94a3b8' : '#0F172A';
    const lines        = getParsedLines(DOM.editor, defaultColor);
    const overflowed   = renderToSVG(lines);

    // Overflow control
    if (overflowed && !STATE.overflowed) {
      STATE.overflowed = true;
      showError(DOM.editor, true);
      showToast('⚠️', 'Лист заполнен. Распечатайте или скачайте его', 'error', 0);
    } else if (!overflowed && STATE.overflowed) {
      STATE.overflowed = false;
      showError(DOM.editor, false);
      hideToast();
    }

    // Block further input when overflowed
    DOM.editor.contentEditable = overflowed ? 'false' : 'true';
  }

  /* ============================================================
     9. ERROR / SUCCESS FEEDBACK
     ============================================================ */
  function showError(el, on) {
    if (on) el.classList.add('is-error');
    else    el.classList.remove('is-error');
  }

  let toastTimer = null;

  function showToast(icon, message, type = 'info', duration = 4000) {
    clearTimeout(toastTimer);
    DOM.toast.className = 'toast toast-' + type;
    DOM.toastMsg.textContent = message;
    DOM.toast.querySelector('.toast-icon').textContent = icon;
    // Force reflow then add visible class
    DOM.toast.offsetHeight; // eslint-disable-line
    DOM.toast.classList.add('is-visible');
    if (duration > 0) {
      toastTimer = setTimeout(hideToast, duration);
    }
  }

  function hideToast() {
    DOM.toast.classList.remove('is-visible');
  }

  function showBtnState(btn, state, restoreMs = 2200) {
    btn.classList.remove('is-loading', 'is-success', 'is-error');
    if (state) {
      btn.classList.add('is-' + state);
      if (state !== 'loading') {
        setTimeout(() => {
          btn.classList.remove('is-' + state);
        }, restoreMs);
      }
    }
  }

  /* ============================================================
     10. EXPORT
     ============================================================ */
  function printSheet() {
    if (STATE.overflowed) {
      showToast('⚠️', 'Лист переполнен — уменьшите текст перед печатью', 'error');
      return;
    }
    track('print_sheet', { grid: STATE.grid, format: STATE.format });
    showBtnState(DOM.printBtn, 'loading');
    setTimeout(() => {
      window.print();
      showBtnState(DOM.printBtn, 'success');
    }, 300);
  }

  function downloadPDF() {
    if (STATE.overflowed) {
      showToast('⚠️', 'Лист переполнен — уменьшите текст перед скачиванием', 'error');
      return;
    }
    track('download_pdf', { grid: STATE.grid, format: STATE.format });
    showBtnState(DOM.pdfBtn, 'loading');
    const label = DOM.pdfBtn.querySelector('.btn-text');
    const prev  = label ? label.textContent : '';
    if (label) label.textContent = 'Генерация листа...';

    setTimeout(() => {
      window.print();
      showBtnState(DOM.pdfBtn, 'success');
      if (label) label.textContent = prev;
    }, 600);
  }

  /* ============================================================
     11. TOOLBAR — TEXT FORMATTING
     ============================================================ */
  let activeLineColor = '#0F172A';

  function formatTextColor(color) {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, color);
    renderAll();
  }

  function formatUnderline(type) {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span  = document.createElement('span');
    span.className = `custom-ul custom-ul-${type}`;

    if (type === 'dotdash') {
      span.style.backgroundImage = `repeating-linear-gradient(to right, ${activeLineColor} 0, ${activeLineColor} 8px, transparent 8px, transparent 12px, ${activeLineColor} 12px, ${activeLineColor} 16px, transparent 16px, transparent 20px)`;
    } else {
      span.style.textDecorationColor = activeLineColor;
    }

    try {
      const content = range.extractContents();
      span.appendChild(content);
      range.insertNode(span);
    } catch (_) {
      showToast('ℹ️', 'Выделяйте текст в пределах одной строки', 'info');
    }
    renderAll();
  }

  function clearFormat() {
    document.execCommand('removeFormat', false, null);
    const sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed) {
      DOM.editor.querySelectorAll('.custom-ul').forEach(sp => {
        if (sel.containsNode(sp, true)) {
          sp.parentNode.replaceChild(document.createTextNode(sp.textContent), sp);
        }
      });
    }
    renderAll();
  }

  /* ============================================================
     12. SEG-GROUP HANDLER
     ============================================================ */
  function initSegGroups() {
    document.querySelectorAll('.seg-group').forEach(group => {
      group.addEventListener('click', e => {
        const btn = e.target.closest('.seg-btn');
        if (!btn || btn.disabled) return;
        group.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');

        const key = group.dataset.stateKey;
        const val = btn.dataset.value;
        if (key && val !== undefined) {
          STATE[key] = val;
          renderAll();
        }
      });
    });
  }

  /* ============================================================
     13. ANALYSIS MODE
     ============================================================ */
  function initAnalysisMode() {
    DOM.analysisTgl.addEventListener('change', () => {
      STATE.analysisMode = DOM.analysisTgl.checked;
      DOM.analysisPills.classList.toggle('is-open', STATE.analysisMode);
      track(STATE.analysisMode ? 'analysis_on' : 'analysis_off');
    });

    // Color pills
    document.querySelectorAll('.pill-btn[data-acolor]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pill-btn[data-acolor]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        STATE.analysisColor = btn.dataset.acolor;
        activeLineColor     = STATE.analysisColor;
      });
    });

    // Underline type pills
    document.querySelectorAll('.pill-btn[data-aul]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pill-btn[data-aul]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        STATE.analysisUL = btn.dataset.aul;
        // Apply to selection
        if (STATE.analysisMode) formatUnderline(STATE.analysisUL);
      });
    });
  }

  /* ============================================================
     14. BOOT
     ============================================================ */
  function boot() {
    parseUTM();

    // Set SVG viewBox to paper size in mm
    function setSVGViewBox() {
      const { w, h } = getPaperMM();
      DOM.svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
      DOM.svgEl.setAttribute('width',  w + 'mm');
      DOM.svgEl.setAttribute('height', h + 'mm');
    }

    // Read initial STATE values from active seg-buttons (HTML → JS sync)
    document.querySelectorAll('.seg-group[data-state-key]').forEach(group => {
      const key = group.dataset.stateKey;
      const active = group.querySelector('.seg-btn.is-active');
      if (active && active.dataset.value !== undefined) STATE[key] = active.dataset.value;
    });

    // Init seg-groups
    initSegGroups();

    // Init analysis mode
    initAnalysisMode();

    // Toolbar color buttons (text color)
    document.querySelectorAll('.toolbar-btn[data-tcolor]').forEach(btn => {
      btn.addEventListener('click', () => formatTextColor(btn.dataset.tcolor));
    });

    // Line color buttons
    document.querySelectorAll('.toolbar-btn[data-lcolor]').forEach(btn => {
      btn.addEventListener('click', e => {
        document.querySelectorAll('.toolbar-btn[data-lcolor]').forEach(b => b.classList.remove('is-active-color'));
        btn.classList.add('is-active-color');
        activeLineColor = btn.dataset.lcolor;
      });
    });

    // Underline buttons
    document.querySelectorAll('.toolbar-btn[data-ul]').forEach(btn => {
      btn.addEventListener('click', () => formatUnderline(btn.dataset.ul));
    });

    // Clear format
    DOM.clearFmtBtn.addEventListener('click', clearFormat);

    // Editor input
    DOM.editor.addEventListener('input', () => {
      // Unlock if user deleted text
      if (STATE.overflowed) {
        STATE.overflowed = false;
        showError(DOM.editor, false);
        hideToast();
        DOM.editor.contentEditable = 'true';
      }
      renderAll();
    });

    // Paste: plain text only
    DOM.editor.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.originalEvent || e).clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    // Export buttons
    DOM.printBtn.addEventListener('click', printSheet);
    DOM.pdfBtn.addEventListener('click', downloadPDF);

    // Toast close
    DOM.toastClose.addEventListener('click', hideToast);

    // Initial render
    function init() {
      setSVGViewBox();
      applyPaperCSS();
      setTimeout(() => { setSVGViewBox(); renderAll(); }, 100);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(init);
    } else {
      window.addEventListener('load', init);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
