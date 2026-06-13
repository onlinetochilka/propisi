/**
 * Генератор прописей — UI, форматирование, превью, экспорт
 */

import { initFirebase, trackEvent } from './firebase.js';

/* ─── UTM ─── */

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];

export function parseAndStoreUTM() {
  const params = new URLSearchParams(window.location.search);
  UTM_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) sessionStorage.setItem(key, value);
  });
}

/* ─── Constants ─── */

const FORMAT_DIMS = { a3: [297, 420], a4: [210, 297], a5: [148, 210] };
const FORMAT_SCALE = { a3: 1.414, a4: 1, a5: 0.707 };
const MATH_CHAR_RE = /[0-9+\-№()=.,\s]/;
const MATH_RUN_RE = /[0-9+\-№()=.,\s]+/g;
const UL_TYPES = ['solid', 'double', 'wavy', 'dashed', 'dotdash'];

function isMathRun(text) {
  return /[0-9]/.test(text) && /^[0-9+\-№()=.,\s]+$/.test(text);
}

/* ─── State ─── */

const state = {
  format: 'a4',
  orientation: 'portrait',
  grid: 'squared',
  mode: 'tracing',
  layout: '1-page',
  activeLineColor: '#0F172A',
};

/* ─── DOM ─── */

const dom = {};

function cacheDom() {
  dom.editor = document.getElementById('textEditor');
  dom.previewContainer = document.getElementById('previewContainer');
  dom.previewPlaceholder = document.getElementById('previewPlaceholder');
  dom.pages = document.querySelectorAll('.worksheet-paper');
}

function readSegmented(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : null;
}

function bindSegmented(name, callback) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.addEventListener('change', () => {
      state[name] = input.value;
      callback();
    });
  });
}

/* ─── Editor: paste & empty check ─── */

function isEditorEmpty() {
  const text = dom.editor.innerText.replace(/\u200B/g, '').trim();
  return text.length === 0;
}

function handlePaste(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
  renderPreview();
}

/* ─── Formatting helpers ─── */

function unwrapNode(node) {
  const parent = node.parentNode;
  if (!parent) return;
  while (node.firstChild) parent.insertBefore(node.firstChild, node);
  parent.removeChild(node);
}

function unwrapFormattingInContainer(container) {
  const selectors = 'span.fmt-color, span.custom-ul, span[data-fmt]';
  let spans = container.querySelectorAll(selectors);
  while (spans.length) {
    spans.forEach(unwrapNode);
    spans = container.querySelectorAll(selectors);
  }
}

function getSelectionRange() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!dom.editor.contains(range.commonAncestorContainer)) return null;
  return range;
}

function applyColorToSelection(color) {
  const range = getSelectionRange();
  if (!range || range.collapsed) return;

  const fragment = range.extractContents();
  unwrapFormattingInContainer(fragment);

  const span = document.createElement('span');
  span.className = 'fmt-color';
  span.style.color = color;
  span.appendChild(fragment);
  range.insertNode(span);

  range.collapse(false);
  renderPreview();
  syncToolbarFromSelection();
}

function applyUnderlineToSelection(type) {
  const range = getSelectionRange();
  if (!range || range.collapsed) return;

  const fragment = range.extractContents();
  unwrapFormattingInContainer(fragment);

  const span = document.createElement('span');
  span.className = `custom-ul custom-ul-${type}`;
  span.dataset.fmt = 'ul';

  if (type === 'dotdash') {
    span.style.backgroundImage = `repeating-linear-gradient(to right, ${state.activeLineColor} 0, ${state.activeLineColor} 8px, transparent 8px, transparent 12px, ${state.activeLineColor} 12px, ${state.activeLineColor} 16px, transparent 16px, transparent 20px)`;
  } else {
    span.style.textDecorationColor = state.activeLineColor;
  }

  span.appendChild(fragment);
  range.insertNode(span);
  range.collapse(false);
  renderPreview();
  syncToolbarFromSelection();
}

function clearFormatInSelection() {
  const range = getSelectionRange();
  if (!range || range.collapsed) return;

  const fragment = range.extractContents();
  unwrapFormattingInContainer(fragment);
  range.insertNode(fragment);
  range.collapse(false);
  renderPreview();
  syncToolbarFromSelection();
}

function getFormatStateAtNode(node) {
  let color = null;
  let ul = null;
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;

  while (el && el !== dom.editor) {
    if (el.classList?.contains('fmt-color') && el.style.color) {
      color = el.style.color;
    }
    if (el.classList?.contains('custom-ul')) {
      UL_TYPES.forEach((t) => {
        if (el.classList.contains(`custom-ul-${t}`)) ul = t;
      });
    }
    el = el.parentElement;
  }

  return { color, ul };
}

function syncToolbarFromSelection() {
  const sel = window.getSelection();
  if (!sel.rangeCount || !dom.editor.contains(sel.anchorNode)) return;

  const { color, ul } = getFormatStateAtNode(sel.anchorNode);

  document.querySelectorAll('[data-action^="text-color-"]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.color === color);
  });

  document.querySelectorAll('[data-action^="underline-"]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.ul === ul);
  });
}

/* ─── Parse editor → lines ─── */

function getParsedLines(editorNode, defaultColor) {
  const lines = [];
  let currentLine = [];

  const pushLine = () => {
    lines.push(currentLine);
    currentLine = [];
  };

  const traverse = (node, fmt) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '\n') continue;

        if (i + 1 < text.length && char === ',' && text[i + 1] === ',') {
          currentLine.push({ type: 'accent', color: fmt.color });
          i++;
          continue;
        }

        const isMath = MATH_CHAR_RE.test(char);
        const last = currentLine[currentLine.length - 1];

        if (
          last &&
          last.type !== 'accent' &&
          last.color === fmt.color &&
          last.ul === fmt.ul &&
          last.ulColor === fmt.ulColor &&
          last.isMath === isMath
        ) {
          last.text += char;
        } else {
          currentLine.push({
            text: char,
            color: fmt.color,
            ul: fmt.ul,
            ulColor: fmt.ulColor,
            isMath,
          });
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const style = window.getComputedStyle(node);
      const isBlock = style.display === 'block' || node.nodeName === 'DIV' || node.nodeName === 'P';
      const isBr = node.nodeName === 'BR';

      if (isBlock && currentLine.length) pushLine();
      if (isBr) {
        pushLine();
        return;
      }

      const next = { ...fmt };

      if (node.style.color) next.color = node.style.color;
      else if (node.hasAttribute('color')) next.color = node.getAttribute('color');

      if (node.classList?.contains('custom-ul')) {
        const match = node.className.match(/custom-ul-(solid|double|wavy|dashed|dotdash)/);
        if (match) next.ul = match[1];

        if (node.style.textDecorationColor) {
          next.ulColor = node.style.textDecorationColor;
        } else if (node.style.backgroundImage) {
          const bgMatch = node.style.backgroundImage.match(/rgba?\([^)]+\)|#[0-9a-fA-F]+/);
          if (bgMatch) next.ulColor = bgMatch[0];
        }
        if (!next.ulColor) next.ulColor = next.color;
      }

      node.childNodes.forEach((child) => traverse(child, next));

      if (isBlock && currentLine.length) pushLine();
    }
  };

  editorNode.childNodes.forEach((child) =>
    traverse(child, { color: defaultColor, ul: 'none', ulColor: defaultColor })
  );

  if (currentLine.length) lines.push(currentLine);
  if (!lines.length) lines.push([]);

  return lines;
}

/* ─── Render chunk HTML ─── */

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function chunkStyle(chunk) {
  let styles = `color:${chunk.color};`;
  if (chunk.ul !== 'none') {
    if (chunk.ul === 'dotdash') {
      styles += ` background-image:repeating-linear-gradient(to right, ${chunk.ulColor} 0, ${chunk.ulColor} 8px, transparent 8px, transparent 12px, ${chunk.ulColor} 12px, ${chunk.ulColor} 16px, transparent 16px, transparent 20px);`;
    } else {
      styles += ` text-decoration-color:${chunk.ulColor};`;
    }
  }
  return styles;
}

function renderChunkSpan(chunk) {
  if (chunk.type === 'accent') return '<span class="accent-mark"></span>';

  const classes = [];
  if (chunk.ul !== 'none') {
    classes.push('custom-ul', `custom-ul-${chunk.ul}`);
  }

  const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
  return `<span${cls} style="${chunkStyle(chunk)}">${escapeHtml(chunk.text)}</span>`;
}

function renderMathCellContent(text, chunk) {
  const ulClass =
    chunk.ul !== 'none' ? ` custom-ul custom-ul-${chunk.ul}` : '';
  let wordStyle = 'white-space:nowrap;';
  if (chunk.ul === 'dotdash') {
    wordStyle += ` background-image:repeating-linear-gradient(to right, ${chunk.ulColor} 0, ${chunk.ulColor} 8px, transparent 8px, transparent 12px, ${chunk.ulColor} 12px, ${chunk.ulColor} 16px, transparent 16px, transparent 20px); background-position:left 0 top calc(1em - 2px); background-size:100% 2px; background-repeat:repeat-x;`;
  } else if (chunk.ul !== 'none') {
    wordStyle += ` text-decoration-color:${chunk.ulColor};`;
  }

  let html = `<span class="math-word${ulClass}" style="${wordStyle}">`;
  for (const char of text) {
    const cellStyle = `color:${chunk.color};`;
    html += `<span class="math-cell" style="${cellStyle}">${escapeHtml(char === ' ' ? '\u00A0' : char)}</span>`;
  }
  html += '</span>';
  return html;
}

function renderLineHtml(lineChunks, useMathCells) {
  let html = '&#8203;';

  if (!useMathCells) {
    lineChunks.forEach((chunk) => {
      html += renderChunkSpan(chunk);
    });
    return html;
  }

  const fullText = lineChunks.map((c) => (c.type === 'accent' ? ',,' : c.text)).join('');
  let cursor = 0;

  lineChunks.forEach((chunk) => {
    if (chunk.type === 'accent') {
      html += '<span class="accent-mark"></span>';
      cursor += 2;
      return;
    }

    const chunkStart = cursor;
    cursor += chunk.text.length;
    const segment = fullText.slice(chunkStart, cursor);

    const parts = [];
    let lastIndex = 0;
    let match;

    MATH_RUN_RE.lastIndex = 0;
    while ((match = MATH_RUN_RE.exec(segment)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: segment.slice(lastIndex, match.index), math: false });
      }
      parts.push({ text: match[0], math: true });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < segment.length) {
      parts.push({ text: segment.slice(lastIndex), math: false });
    }
    if (!parts.length) parts.push({ text: segment, math: false });

    parts.forEach((part) => {
      if (part.math && isMathRun(part.text)) {
        html += renderMathCellContent(part.text, chunk);
      } else {
        const subChunk = { ...chunk, text: part.text };
        html += renderChunkSpan(subChunk);
      }
    });
  });

  return html;
}

/* ─── SVG grid ─── */

function generateGridSVG(type) {
  let svgLines = '';

  if (type === 'squared') {
    for (let y = 0; y <= 500; y += 5) {
      svgLines += `<line x1="0" y1="${y}mm" x2="100%" y2="${y}mm" stroke="var(--line-color)" stroke-width="0.5"/>`;
    }
    for (let x = 0; x <= 500; x += 5) {
      svgLines += `<line x1="${x}mm" y1="0" x2="${x}mm" y2="100%" stroke="var(--line-color)" stroke-width="0.5"/>`;
    }
  } else {
    const isWide = type === 'wide';
    const step = isWide ? 36 : 48;
    for (let y = 48; y < 2500; y += step) {
      if (!isWide) {
        svgLines += `<line x1="0" y1="${y - 15.5}" x2="100%" y2="${y - 15.5}" stroke="var(--line-color)" stroke-width="1"/>`;
      }
      svgLines += `<line x1="0" y1="${y + 0.5}" x2="100%" y2="${y + 0.5}" stroke="var(--line-color)" stroke-width="1"/>`;
    }
    if (type === 'slanted' || type === 'frequent') {
      const slantSpace = type === 'frequent' ? 24 : 100;
      const dx = 2500 / 2.1445;
      for (let x = -dx; x < 3000; x += slantSpace) {
        svgLines += `<line x1="${x + dx}" y1="0" x2="${x}" y2="2500" stroke="var(--aux-line-color)" stroke-width="1"/>`;
      }
    }
  }

  return `<svg width="100%" height="100%" style="position:absolute;top:0;left:0;z-index:0;pointer-events:none" xmlns="http://www.w3.org/2000/svg">${svgLines}</svg>`;
}

/* ─── Dimensions & print ─── */

function setPrintStyle(format, orientation) {
  let node = document.getElementById('dynamic-print-style');
  if (!node) {
    node = document.createElement('style');
    node.id = 'dynamic-print-style';
    document.head.appendChild(node);
  }
  node.textContent = `@page{size:${format.toUpperCase()} ${orientation};margin:0}`;
}

function updateDimensions() {
  const { format, orientation, layout } = state;
  let [w, h] = FORMAT_DIMS[format];
  if (orientation === 'landscape') [w, h] = [h, w];

  setPrintStyle(format, orientation);

  const root = document.documentElement.style;
  const scale = FORMAT_SCALE[format];
  root.setProperty('--format-scale', String(scale));

  if (layout === '2-pages') {
    root.setProperty('--paper-w', `${w / 2}mm`);
    root.setProperty('--paper-h', `${h}mm`);
    root.setProperty('--red-line-pos', '12mm');
    root.setProperty('--text-pad-left', '15mm');
    root.setProperty('--text-pad-right', '5mm');
  } else {
    root.setProperty('--paper-w', `${w}mm`);
    root.setProperty('--paper-h', `${h}mm`);
    root.setProperty('--red-line-pos', '20mm');
    root.setProperty('--text-pad-left', '25mm');
    root.setProperty('--text-pad-right', '10mm');
  }

  dom.previewContainer.classList.toggle('is-landscape', orientation === 'landscape');
  document.body.className = `tochilka-theme layout-${layout}`;
}

/* ─── Preview render ─── */

function renderPreview() {
  state.format = readSegmented('format') || state.format;
  state.orientation = readSegmented('orientation') || state.orientation;
  state.grid = readSegmented('grid') || state.grid;
  state.mode = readSegmented('mode') || state.mode;
  state.layout = readSegmented('layout') || state.layout;

  updateDimensions();

  const empty = isEditorEmpty();
  dom.previewPlaceholder.hidden = !empty;

  dom.previewContainer.className = `app-preview layout-${state.layout}`;
  if (state.orientation === 'landscape') {
    dom.previewContainer.classList.add('is-landscape');
  }

  const defaultColor =
    state.mode === 'tracing' || state.mode === 'alternating' ? '#94A3B8' : '#0F172A';

  let parsedLines = getParsedLines(dom.editor, defaultColor);

  if (state.mode === 'alternating') {
    const alt = [];
    parsedLines.forEach((l) => {
      alt.push(l);
      alt.push([]);
    });
    parsedLines = alt;
  }

  const useMathCells = state.grid === 'squared';
  let html = '';

  if (!empty) {
    parsedLines.forEach((line) => {
      html += `<div class="text-line">${renderLineHtml(line, useMathCells)}</div>`;
    });
  }

  const svg = generateGridSVG(state.grid);
  const paperClass = `worksheet-paper mode-${state.mode} grid-${state.grid}`;

  dom.pages.forEach((page) => {
    page.className = paperClass;
    page.dataset.format = state.format;
    page.querySelector('.svg-background').innerHTML = svg;
    page.querySelector('.text-content').innerHTML = html;
  });
}

/* ─── PNG export ─── */

function exportToPNG() {
  const btn = document.querySelector('[data-action="download-png"]');
  btn.classList.add('is-loading');

  requestAnimationFrame(() => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      let [wMm, hMm] = FORMAT_DIMS[state.format];
      if (state.orientation === 'landscape') [wMm, hMm] = [hMm, wMm];
      if (state.layout === '2-pages') wMm /= 2;

      const scale = 4.70588;
      const width = Math.round(wMm * scale);
      const height = Math.round(hMm * scale);

      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      drawGrid(ctx, width, height, scale);
      drawRedLine(ctx, height, scale);
      drawText(ctx, scale);

      const link = document.createElement('a');
      link.download = `прописи_точилка_${state.grid}.png`;
      link.href = canvas.toDataURL('image/png', 1);
      link.click();

      trackEvent('download_png', { grid: state.grid, format: state.format });
      btn.classList.remove('is-loading');
      btn.classList.add('is-success');
      setTimeout(() => btn.classList.remove('is-success'), 1500);
    } catch {
      btn.classList.remove('is-loading');
      btn.classList.add('is-error');
      setTimeout(() => btn.classList.remove('is-error'), 2000);
    }
  });
}

function drawGrid(ctx, width, height, scale) {
  const { grid } = state;
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#94A3B8';

  if (grid === 'squared') {
    const step = 5 * scale;
    for (let y = 0; y <= height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let x = 0; x <= width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  } else {
    const isWide = grid === 'wide';
    const step = isWide ? 36 : 48;
    for (let y = 48; y < height; y += step) {
      if (!isWide) {
        ctx.beginPath();
        ctx.moveTo(0, y - 15.5);
        ctx.lineTo(width, y - 15.5);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();
    }
    if (grid === 'slanted' || grid === 'frequent') {
      const slantSpace = grid === 'frequent' ? 24 : 100;
      const dx = height / 2.1445;
      ctx.strokeStyle = '#CBD5E1';
      for (let x = -dx; x < width + dx; x += slantSpace) {
        ctx.beginPath();
        ctx.moveTo(x + dx, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }
  }
}

function drawRedLine(ctx, height, scale) {
  const marginMm = state.layout === '2-pages' ? 12 : 20;
  const marginX = marginMm * scale;
  ctx.strokeStyle = '#F87171';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(marginX, 0);
  ctx.lineTo(marginX, height);
  ctx.stroke();
  return marginX;
}

function drawText(ctx, scale) {
  const marginMm = state.layout === '2-pages' ? 12 : 20;
  const marginX = marginMm * scale;
  const { grid, mode, layout } = state;
  const isSquared = grid === 'squared';
  const isWide = grid === 'wide';

  const defaultColor =
    mode === 'tracing' || mode === 'alternating' ? '#94A3B8' : '#0F172A';

  let parsedLines = getParsedLines(dom.editor, defaultColor);
  if (mode === 'alternating') {
    const alt = [];
    parsedLines.forEach((l) => {
      alt.push(l);
      alt.push([]);
    });
    parsedLines = alt;
  }

  ctx.textBaseline = 'alphabetic';
  const lineHeight = isSquared ? 10 * scale : isWide ? 36 : 48;
  let currentY = isSquared ? 10 * scale : 48;
  const textPadMm = layout === '2-pages' ? 15 : 25;
  const marginMm = layout === '2-pages' ? 12 : 20;
  const startX = marginX + (textPadMm - marginMm) * scale;

  parsedLines.forEach((lineChunks) => {
    if (lineChunks.length) {
      let currentX = startX;
      let prevColor = defaultColor;

      lineChunks.forEach((chunk) => {
        if (chunk.type === 'accent') {
          const ax = currentX - (isSquared ? 8 : 12);
          const ay = currentY - (isSquared ? 7 * scale : 34);
          ctx.strokeStyle = prevColor;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(ax - 5, ay + 5);
          ctx.lineTo(ax + 5, ay - 5);
          ctx.stroke();
        } else {
          let fontSize = isSquared ? 14 * scale : isWide ? 36 : 48;
          if (chunk.isMath && !isSquared) fontSize *= 0.6;

          ctx.font = `${fontSize}px TochilkaWorksheet, Caveat, cursive`;
          ctx.fillStyle = chunk.color;

          let charY = currentY;
          if (chunk.text.includes('-') && chunk.isMath) charY -= fontSize * 0.25;

          ctx.fillText(chunk.text, currentX, charY);
          const charWidth = ctx.measureText(chunk.text).width;

          if (chunk.ul !== 'none' && chunk.text.trim()) {
            drawUnderline(ctx, chunk, currentX, charY, charWidth, fontSize);
          }

          currentX += charWidth;
          prevColor = chunk.color;
        }
      });
    }
    currentY += lineHeight;
  });
}

function drawUnderline(ctx, chunk, x, y, width, fontSize) {
  ctx.save();
  ctx.strokeStyle = chunk.ulColor;
  const ulY = y + fontSize * 0.08;
  ctx.beginPath();

  if (chunk.ul === 'double') {
    ctx.lineWidth = 1;
    ctx.moveTo(x, ulY - 1);
    ctx.lineTo(x + width, ulY - 1);
    ctx.moveTo(x, ulY + 3);
    ctx.lineTo(x + width, ulY + 3);
  } else {
    ctx.lineWidth = 2.5;
    if (chunk.ul === 'solid') {
      ctx.moveTo(x, ulY);
      ctx.lineTo(x + width, ulY);
    } else if (chunk.ul === 'wavy') {
      ctx.lineWidth = 1.5;
      const wave = 8;
      for (let wx = x; wx < x + width; wx += wave) {
        ctx.quadraticCurveTo(wx + wave / 4, ulY - 2, wx + wave / 2, ulY);
        ctx.quadraticCurveTo(wx + wave * 0.75, ulY + 2, wx + wave, ulY);
      }
    } else if (chunk.ul === 'dashed') {
      ctx.setLineDash([10, 6]);
      ctx.moveTo(x, ulY);
      ctx.lineTo(x + width, ulY);
    } else if (chunk.ul === 'dotdash') {
      ctx.setLineDash([14, 6, 4, 6]);
      ctx.moveTo(x, ulY);
      ctx.lineTo(x + width, ulY);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/* ─── Event bindings ─── */

function bindToolbar() {
  document.querySelectorAll('[data-action^="text-color-"]').forEach((btn) => {
    btn.addEventListener('click', () => applyColorToSelection(btn.dataset.color));
  });

  document.querySelectorAll('[data-action^="line-color-"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-action^="line-color-"]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.activeLineColor = btn.dataset.color;
    });
  });

  document.querySelectorAll('[data-action^="underline-"]').forEach((btn) => {
    btn.addEventListener('click', () => applyUnderlineToSelection(btn.dataset.ul));
  });

  document.querySelector('[data-action="clear-format"]').addEventListener('click', clearFormatInSelection);
}

function bindActions() {
  document.querySelector('[data-action="print-save-pdf"]').addEventListener('click', () => {
    trackEvent('print_pdf', { format: state.format, grid: state.grid });
    window.print();
  });

  document.querySelector('[data-action="download-png"]').addEventListener('click', exportToPNG);
}

function bindEditor() {
  dom.editor.addEventListener('input', renderPreview);
  dom.editor.addEventListener('paste', handlePaste);
  document.addEventListener('selectionchange', syncToolbarFromSelection);
}

function readInitialState() {
  state.format = readSegmented('format') || 'a4';
  state.orientation = readSegmented('orientation') || 'portrait';
  state.grid = readSegmented('grid') || 'squared';
  state.mode = readSegmented('mode') || 'tracing';
  state.layout = readSegmented('layout') || '1-page';
}

/* ─── Init ─── */

function init() {
  parseAndStoreUTM();
  initFirebase();
  cacheDom();
  readInitialState();

  ['format', 'orientation', 'grid', 'mode', 'layout'].forEach((name) => {
    bindSegmented(name, renderPreview);
  });

  bindToolbar();
  bindActions();
  bindEditor();
  renderPreview();

  trackEvent('page_view', { page: 'propisi_generator' });
}

document.addEventListener('DOMContentLoaded', init);
