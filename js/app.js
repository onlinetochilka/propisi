/**
 * Прописи — Шаги 1 + 2 + 3 + ПОЛЯ + ЖЁСТКИЙ ПЕРЕНОС
 *
 *  [1] Ветвь А: чанк-рендер с жёстким переносом по endX
 *  [2] Ветвь Б: per-cell ТОЛЬКО цифры и мат.знаки; буквы — чанк-рендер
 *  [3] Шрифт: нет lat-букв → Propisi, есть → ClassRoomCursive
 *  [4] Ударения: ,, → отдельный SVG-элемент ´ (U+0301 ломает Propisi)
 *  [5] Отступ от верха: y = lineH * 2
 *  [6] Поля: left / none / right → красная линия + startX/endX
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════
   КОНСТАНТЫ
   ═══════════════════════════════════════════════════════════════════════ */

const PAPER_DIMS = {
    a4: { w: 210, h: 297 },
    a5: { w: 148, h: 210 },
    notebook: { w: 170, h: 205 },
};

const GRID_CFG = {
    frequent: { step: 12.70, helper: 4.10, hasHelper: true,  hasDiag: true,  diagStep:  6.35, fontSize: 12.70, lineH: 12.70 },
    slanted:  { step: 12.70, helper: 4.10, hasHelper: true,  hasDiag: true,  diagStep: 26.46, fontSize: 12.70, lineH: 12.70 },
    narrow:   { step: 12.70, helper: 4.10, hasHelper: true,  hasDiag: false, diagStep:  0,    fontSize: 12.70, lineH: 12.70 },
    wide: { step: 9.52, helper: 0, hasHelper: false, hasDiag: false, diagStep: 0, fontSize: 11.50, lineH: 9.52 },
    squared:  { step:  5.00, helper:  0,   hasHelper: false, hasDiag: false, diagStep:  0,    fontSize: 12.50, lineH: 5.00 },
    large_squared: { step: 10.00, helper: 0, hasHelper: false, hasDiag: false, diagStep: 0, fontSize: 12.50, lineH: 10.00 },
};

const NS = 'http://www.w3.org/2000/svg';

const PROMO_APPS = [
    { app_name: 'handwriting_generator', label: 'Генератор прописей' },
    { app_name: 'ruling_generator', label: 'Генератор разлиновки' },
    { app_name: 'oral_math_randomizer', label: 'Рандомайзер устного счета' },
    { app_name: 'reading_technique_analyzer', label: 'Анализатор техники чтения' },
    { app_name: 'dictation_constructor', label: 'Конструктор словарных диктантов' },
    { app_name: 'student_profile', label: 'Характеристика ученика' },
    { app_name: 'seating_generator', label: 'Генератор рассадки' },
    { app_name: 'crossword_constructor', label: 'Конструктор кроссвордов' },
    { app_name: 'teen_slang_dictionary', label: 'Словарь подросткового сленга' },
    { app_name: 'tutor_efficiency', label: 'Оценка эффективности репетитора' },
    { app_name: 'career_orientation_test', label: 'Тест на профориентацию' },
    { app_name: 'deadline_tracker', label: 'Трекер дедлайнов' },
    { app_name: 'worksheet_generator', label: 'Генератор рабочих листов' },
    { app_name: 'coming_soon', label: 'Продолжение следует...' },
];

/* [1][4] Точный замер ширины текста через Canvas API */
// ponytail: offscreen canvas — нет DOM-overhead, живёт весь сеанс
const measureCtx = document.createElement('canvas').getContext('2d');
const textWidthCache = {};
function getMeasuredWidth(text, fontString) {
    const key = text + '|' + fontString;
    if (textWidthCache[key] !== undefined) return textWidthCache[key];
    measureCtx.font = fontString;
    const width = measureCtx.measureText(text).width;
    textWidthCache[key] = width;
    return width;
}

/* Шрифты */
const FONT_CYR = "'Propisi', cursive";
const FONT_LAT = "'ClassRoomCursive', cursive";
const LATIN_RE = /[a-zA-Z]/;

/* Символы, идущие в per-cell режим (цифры + мат.знаки) */
const MATH_CHAR_RE = /^[\d+\-=()[\]{}]$/;

/* ═══════════════════════════════════════════════════════════════════════
   СОСТОЯНИЕ
   ═══════════════════════════════════════════════════════════════════════ */

const state = {
    format:      'a4',
    orientation: 'portrait',
    grid:        'frequent',
    mode:        'tracing',
    layout:      '1-page',
    mathMode:    false,
    margin:      'left',   // [6] Поля
};

function readState() {
    const activeVal = (id) => {
        const btn = document.querySelector(`#${id} .seg-btn.active`);
        return btn ? btn.dataset.value : null;
    };
    state.format      = activeVal('paperSizeGroup')  || 'a4';
    state.orientation = activeVal('orientationGroup') || 'portrait';
    state.grid        = activeVal('gridTypeGroup')    || 'frequent';
    state.mode        = activeVal('writingModeGroup') || 'tracing';
    state.margin      = activeVal('marginGroup')      || 'left';   // [6]

    const layoutGroup = document.getElementById('layoutGroup');
    const layoutSection = layoutGroup ? layoutGroup.closest('.setting-section') : null;
    state.layout = activeVal('layoutGroup') || '1-page';
    
    if (layoutSection) {
        if (state.format === 'a5') {
            layoutSection.style.display = '';
        } else {
            layoutSection.style.display = 'none';
            if (state.layout !== '1-page') {
                const btns = layoutGroup.querySelectorAll('.seg-btn');
                btns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
                const btn1 = layoutGroup.querySelector('[data-value="1-page"]');
                if (btn1) {
                    btn1.classList.add('active');
                    btn1.setAttribute('aria-pressed', 'true');
                }
                state.layout = '1-page';
            }
        }
    }

    const layoutSubSettings = document.getElementById('layoutSubSettings');
    const mirrorCheck = document.getElementById('mirrorMarginsCheck');

    if (state.layout === '2-pages') {
        if (layoutSubSettings) layoutSubSettings.classList.add('open');
        state.mirrorMargins = mirrorCheck ? mirrorCheck.checked : false;
    } else {
        if (layoutSubSettings) layoutSubSettings.classList.remove('open');
        if (mirrorCheck) mirrorCheck.checked = false;
        state.mirrorMargins = false;
    }

    const mc = document.getElementById('mathModeCheck');
    state.mathMode = mc ? mc.checked : false;

    const mathLabel = document.getElementById('mathModeLabel');
    if (mathLabel) {
        mathLabel.style.display = (state.grid === 'squared') ? 'flex' : 'none';
    }
}

function getSheetDims() {
    const b = PAPER_DIMS[state.format] || PAPER_DIMS.a4;
    return state.orientation === 'landscape' ? { w: b.h, h: b.w } : { w: b.w, h: b.h };
}

/* [6] Вычисляет startX / endX по текущему полю */
function getTextBounds(W) {
    switch (state.margin) {
        case 'right': return { startX: 10,  endX: W - 20 };
        case 'none':  return { startX: 10,  endX: W - 2 };
        default:      return { startX: 25,  endX: W - 2 };  // 'left'
    }
}

/* ═══════════════════════════════════════════════════════════════════════
   SVG УТИЛИТЫ
   ═══════════════════════════════════════════════════════════════════════ */

function el(tag, attrs = {}) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
}
const r = (n) => +n.toFixed(3);

function mkLine(x1, y1, x2, y2, stroke, sw) {
    return el('line', { x1: r(x1), y1: r(y1), x2: r(x2), y2: r(y2), stroke, 'stroke-width': sw });
}

/* ═══════════════════════════════════════════════════════════════════════
   ПАРСЕР ТЕКСТА
   ═══════════════════════════════════════════════════════════════════════ */

function getTextLines(editorEl) {
    if (!editorEl) return [[]];
    
    let lines = [];
    let currentLineChunks = [];

    function traverse(node, currentColor = null, currentUl = null, currentUlColor = null, currentMorph = 'none', currentMorphId = null) {
        if (node.nodeType === Node.TEXT_NODE) {
            const cleanText = node.textContent.replace(/\n/g, '');
            if (cleanText) {
                currentLineChunks.push({
                    text: cleanText,
                    color: currentColor,
                    ul: currentUl,
                    ulColor: currentUlColor !== null ? currentUlColor : currentColor,
                    morph: currentMorph || 'none',
                    morphId: currentMorphId
                });
            }
            return;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.nodeName;
            
            if (tag === 'BR') {
                lines.push(currentLineChunks);
                currentLineChunks = [];
                return;
            }

            const isBlock = tag === 'DIV' || tag === 'P';
            if (isBlock && currentLineChunks.length > 0) {
                lines.push(currentLineChunks);
                currentLineChunks = [];
            }

            const newColor = node.dataset?.color || currentColor;
            const newUl = node.dataset?.ul || currentUl;
            const newUlColor = node.dataset?.ulColor || currentUlColor;
            const newMorph = node.dataset?.morph || currentMorph;
            const newMorphId = node.dataset?.morphId || currentMorphId;

            node.childNodes.forEach(child => traverse(child, newColor, newUl, newUlColor, newMorph, newMorphId));

            if (isBlock) {
                if (currentLineChunks.length > 0) {
                    lines.push(currentLineChunks);
                    currentLineChunks = [];
                } else if (node.childNodes.length === 0) {
                    lines.push([]);
                }
            }
        }
    }

    editorEl.childNodes.forEach(child => traverse(child, null, null, null, 'none', null));

    if (currentLineChunks.length > 0) {
        lines.push(currentLineChunks);
    }

    const optimizedLines = lines.map(lineChunks => {
        const merged = [];
        for (const chunk of lineChunks) {
            if (!chunk.text) continue;
            const last = merged[merged.length - 1];
            if (last && last.color === chunk.color && last.ul === chunk.ul && last.ulColor === chunk.ulColor && last.morph === chunk.morph && last.morphId === chunk.morphId) {
                last.text += chunk.text;
            } else {
                merged.push({ ...chunk });
            }
        }
        return merged;
    });

    return optimizedLines.length ? optimizedLines : [[]];
}

/* ═══════════════════════════════════════════════════════════════════════
   [6] СЕТКА SVG — красная линия по margin
   ═══════════════════════════════════════════════════════════════════════ */

function buildGridGroup(W, H, gridType) {
    const g = el('g', { 'aria-hidden': 'true', id: 'svgGrid' });

    let redLineX = 0;
    if (state.margin === 'left') redLineX = 20;
    else if (state.margin === 'right') redLineX = W - 20;

    if (gridType === 'squared' || gridType === 'large_squared') {
        const step = GRID_CFG[gridType].step;
        for (let y = step; y <= H + 0.05; y += step)
            g.appendChild(mkLine(0, y, W, y, '#94A3B8', 0.20));
        for (let x = redLineX; x <= W + 0.05; x += step)
            g.appendChild(mkLine(x, 0, x, H, '#94A3B8', 0.20));
        for (let x = redLineX; x >= -0.05; x -= step)
            g.appendChild(mkLine(x, 0, x, H, '#94A3B8', 0.20));
    } else {
        const cfg = GRID_CFG[gridType] || GRID_CFG.narrow;
        const { step, helper, hasHelper, hasDiag, diagStep } = cfg;
        for (let y = step; y <= H + step * 0.5; y += step) {
            if (hasHelper) {
                const hy = y - helper;
                if (hy > 0.01 && hy <= H) g.appendChild(mkLine(0, hy, W, hy, '#94A3B8', 0.20));
            }
            if (y <= H + 0.05) g.appendChild(mkLine(0, y, W, y, '#94A3B8', 0.28));
        }
        if (hasDiag) {
            const dx = H / 2.1445;
            for (let x = -dx; x < W + dx; x += diagStep)
                g.appendChild(mkLine(x + dx, 0, x, H, '#CBD5E1', 0.18));
        }
    }

    /* [6] Красная линия только если есть поле */
    if (state.margin === 'left') {
        g.appendChild(mkLine(20, 0, 20, H, '#F87171', 0.45));
    } else if (state.margin === 'right') {
        g.appendChild(mkLine(W - 20, 0, W - 20, H, '#F87171', 0.45));
    }
    // 'none' — не рисуем

    return g;
}

/* ═══════════════════════════════════════════════════════════════════════
   [1] ЖЁСТКИЙ ПЕРЕНОС СТРОКИ И ДЕКОРАЦИИ
   ═══════════════════════════════════════════════════════════════════════ */

function drawDecorations(g, chunk, x, y, decWidth, fontSize, lineH, fill = '#000') {
    if (chunk.ul && chunk.ul !== 'none') {
        const ulC = (chunk.ulColor && chunk.ulColor !== 'inherit') ? chunk.ulColor : (chunk.color || fill);
        const uy = y + 2;
        if (chunk.ul === 'solid') {
            g.appendChild(mkLine(x, uy, x + decWidth, uy, ulC, 0.3));
        } else if (chunk.ul === 'double') {
            g.appendChild(mkLine(x, uy, x + decWidth, uy, ulC, 0.3));
            g.appendChild(mkLine(x, uy + 3, x + decWidth, uy + 3, ulC, 0.3));
        } else if (chunk.ul === 'dashed') {
            g.appendChild(el('line', { x1: r(x), y1: r(uy), x2: r(x + decWidth), y2: r(uy), stroke: ulC, 'stroke-width': 0.3, 'stroke-dasharray': '4 3' }));
        } else if (chunk.ul === 'dotdash') {
            g.appendChild(el('line', { x1: r(x), y1: r(uy), x2: r(x + decWidth), y2: r(uy), stroke: ulC, 'stroke-width': 0.3, 'stroke-dasharray': '8 3 2 3' }));
        } else if (chunk.ul === 'wavy') {
            let d = `M ${r(x)} ${r(uy)}`;
            let up = true;
            for (let cx = x; cx < x + decWidth; cx += 3) {
                const nx = Math.min(cx + 3, x + decWidth);
                const cy = up ? uy - 1.5 : uy + 1.5;
                d += ` Q ${r(cx + 1.5)} ${r(cy)} ${r(nx)} ${r(uy)}`;
                up = !up;
            }
            g.appendChild(el('path', { d, stroke: ulC, 'stroke-width': 0.3, fill: 'none' }));
        }
    }

    if (chunk.morph && chunk.morph !== 'none') {
        const mC = (chunk.ulColor && chunk.ulColor !== 'inherit') ? chunk.ulColor : (chunk.color || fill);
        const mSw = 0.3;
        const my = y - fontSize * 0.7;

        if (chunk.morph === 'prefix') {
            const d = `M ${r(x)} ${r(my)} L ${r(x + decWidth)} ${r(my)} L ${r(x + decWidth)} ${r(my + 4)}`;
            g.appendChild(el('path', { d, stroke: mC, 'stroke-width': mSw, fill: 'none' }));
        } else if (chunk.morph === 'root') {
            const d = `M ${r(x)} ${r(my + 2)} Q ${r(x + decWidth / 2)} ${r(my - 4)} ${r(x + decWidth)} ${r(my + 2)}`;
            g.appendChild(el('path', { d, stroke: mC, 'stroke-width': mSw, fill: 'none' }));
        } else if (chunk.morph === 'suffix') {
            const d = `M ${r(x)} ${r(my + 2)} L ${r(x + decWidth / 2)} ${r(my - 4)} L ${r(x + decWidth)} ${r(my + 2)}`;
            g.appendChild(el('path', { d, stroke: mC, 'stroke-width': mSw, fill: 'none' }));
        } else if (chunk.morph === 'ending') {
            const boxH = fontSize * 0.8;
            g.appendChild(el('rect', { x: r(x), y: r(y - boxH), width: r(decWidth), height: r(boxH + 2), stroke: mC, 'stroke-width': mSw, fill: 'none' }));
        } else if (chunk.morph === 'base') {
            const pathD = `M ${r(x)} ${r(y)} L ${r(x)} ${r(y + 4)} L ${r(x + decWidth)} ${r(y + 4)} L ${r(x + decWidth)} ${r(y)}`;
            g.appendChild(el('path', { d: pathD, fill: 'none', stroke: mC, 'stroke-width': 0.3 }));
        }
    }
}

function renderLineWithWrap(g, lineChunks, startX, endX, y, H, fontSize, lineH, fill, stepY, cfg, initialX = startX) {
    let currentX = initialX;
    let currentTextNode = null;

    for (const chunkObj of lineChunks) {
        if (!chunkObj.text) continue;
        const text = chunkObj.text;
        const chunkColor = chunkObj.color || fill;

        let accText = '';
        let i = 0;

        const flushAcc = (yPos) => {
            if (!accText) return;
            const fontName = LATIN_RE.test(accText) ? 'ClassRoomCursive' : 'Propisi';
            const estWidth = getMeasuredWidth(accText.replace(/ /g, '\u00A0'), `${r(fontSize)}px '${fontName}'`);

            if (yPos <= H) {
                if (!currentTextNode) {
                    currentTextNode = el('text', {
                        x: r(currentX), y: r(yPos),
                        'font-size': r(fontSize),
                        'dominant-baseline': 'alphabetic',
                        'xml:space': 'preserve'
                    });
                    g.appendChild(currentTextNode);
                }

                const isPrint = state.grid === 'large_squared';
                let chunkStr = isPrint ? accText.toUpperCase() : accText;
                let font = LATIN_RE.test(chunkStr) ? 'ClassRoomCursive' : 'Propisi';
                if (isPrint) font = 'RazerF5';
                
                let digitFs = fontSize;
                if (isPrint) digitFs = fontSize;
                else if (cfg) {
                    if (cfg.hasHelper) digitFs = fontSize * 0.60;
                    else if (cfg.step === 5) digitFs = fontSize * 0.65;
                    else if (cfg.step === 9.52) digitFs = fontSize * 0.75;
                }
                let digitFamily = isPrint ? 'RazerF5' : 'ClassRoomCursive';
                let weight = isPrint ? 'normal' : 'bold';

                const ts = el('tspan', { fill: chunkColor, 'font-family': font });
                ts.innerHTML = chunkStr.replace(/(\d+)/g, `<tspan font-family="${digitFamily}" font-size="${r(digitFs)}" font-weight="${weight}">$1</tspan>`);
                currentTextNode.appendChild(ts);

                const trimmedText = accText.trimEnd();
                const decWidth = getMeasuredWidth(trimmedText.replace(/ /g, '\u00A0'), `${r(fontSize)}px '${fontName}'`);
                drawDecorations(g, chunkObj, currentX, yPos, decWidth, fontSize, lineH, fill);
            }
            currentX += estWidth;
            accText = '';
        };

        while (i < text.length) {
            if (text[i] === '´') {
                if (y <= H && accText !== '') {
                    const fontName = LATIN_RE.test(accText) ? 'ClassRoomCursive' : 'Propisi';
                    const wText = getMeasuredWidth(accText.replace(/ /g, '\u00A0'), `${r(fontSize)}px '${fontName}'`);
                    const accX = currentX + wText - (fontSize * 0.15);
                    g.appendChild(el('text', { x: r(accX), y: r(y - fontSize * 0.15), 'font-family': 'Arial', 'font-size': r(fontSize * 0.8), fill: chunkColor })).textContent = '\u00B4';
                }
                i++;
                continue;
            }

            const ch = text[i];
            if (accText === '') {
                const fontName = LATIN_RE.test(ch) ? 'ClassRoomCursive' : 'Propisi';
                const chW = getMeasuredWidth(ch.replace(/ /g, '\u00A0'), `${r(fontSize)}px '${fontName}'`);
                if (currentX + chW > endX && currentX > startX) {
                    y += stepY;
                    currentX = startX;
                    currentTextNode = null;
                }
                accText = ch;
                i++;
                continue;
            }

            const fontName = LATIN_RE.test(accText + ch) ? 'ClassRoomCursive' : 'Propisi';
            const estWidth = getMeasuredWidth((accText + ch).replace(/ /g, '\u00A0'), `${r(fontSize)}px '${fontName}'`);

            if (currentX + estWidth > endX) {
                flushAcc(y);
                y += stepY;
                currentX = startX;
                currentTextNode = null;
            } else {
                accText += ch;
                i++;
            }
        }
        flushAcc(y);
    }
    return { endY: y, endX: currentX };
}

/* ═══════════════════════════════════════════════════════════════════════
   [1] ВЕТВЬ А — ОБЫЧНЫЙ РЕНДЕР (все сетки кроме squared+mathMode)
   ═══════════════════════════════════════════════════════════════════════ */

function renderNormalLines(g, W, H, cfg, mode, textLines, fill) {
    const { fontSize, lineH, step } = cfg;
    const { startX, endX } = getTextBounds(W);
    let y = (state.grid === 'squared' || state.grid === 'large_squared') ? step * 2 : step;

    textLines.forEach(rawLine => {
        if (y > H) return;
        
        const lineChunks = Array.isArray(rawLine) ? rawLine : [{ text: rawLine }];
        
        if (!lineChunks.some(ch => ch.text)) {
            y += lineH;
            return;
        }

        const res = renderLineWithWrap(g, lineChunks, startX, endX, y, H, fontSize, lineH, fill, lineH, cfg);
        y = res.endY + lineH;
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   [2] ВЕТВЬ Б — ПОКЛЕТОЧНЫЙ РЕНДЕР (squared + mathMode = true)
   Per-cell: ТОЛЬКО цифры и знаки (+,-,=,скобки).
   Буквы — жёсткий чанк-рендер как в Ветви А.
   ═══════════════════════════════════════════════════════════════════════ */

function renderMathLines(g, W, H, cfg, textLines, fill) {
    const { step, lineH, fontSize } = cfg;
    
    let redLineX = 0;
    if (state.margin === 'left') redLineX = 20;
    else if (state.margin === 'right') redLineX = W - 20;

    let { startX, endX } = getTextBounds(W);
    const offset = (startX - redLineX) / step;
    startX = redLineX + Math.ceil(offset) * step;

    const cols = Math.floor((endX - startX) / step);
    let rowY = (state.grid === 'squared' || state.grid === 'large_squared') ? step * 2 : step;
    const isPrint = state.grid === 'large_squared';

    textLines.forEach(rawLine => {
        if (rowY > H) return;
        
        const lineChunks = Array.isArray(rawLine) ? rawLine : [{ text: rawLine }];

        const chars = [];
        for (const chunkObj of lineChunks) {
            if (!chunkObj.text) continue;
            let i = 0;
            const t = chunkObj.text;
            while(i < t.length) {
                if (t[i] === '´') {
                    chars.push({ ch: '´', chunkObj });
                    i++;
                } else {
                    chars.push({ ch: t[i], chunkObj });
                    i++;
                }
            }
        }

        let col = 0;
        let i   = 0;

        while (i < chars.length) {
            if (rowY > H) break;
            const { ch, chunkObj } = chars[i];
            const chColor = chunkObj.color || fill;

            if (ch === '´') {
                if (rowY <= H && col > 0) {
                    const prevCx = startX + (col - 1) * step + step / 2;
                    g.appendChild(el('text', { x: r(prevCx), y: r(rowY - fontSize * 0.15), 'font-family': 'Arial', 'font-size': r(fontSize * 0.8), fill: chColor, 'text-anchor': 'middle' })).textContent = '\u00B4';
                }
                i++;
                continue;
            }

            if (ch === ' ') {
                col++;
                if (col >= cols) { rowY += lineH; col = 0; }
                i++;
            } else if (isPrint || MATH_CHAR_RE.test(ch)) {
                if (col >= cols) { rowY += lineH; col = 0; }
                const cx = r(startX + col * step + step / 2);
                
                let digitFs = fontSize;
                if (isPrint) {
                    digitFs = fontSize * 0.94; // Идеальный масштаб для печатных
                } else if (cfg) {
                    if (cfg.hasHelper) digitFs = fontSize * 0.60;
                    else if (cfg.step === 5) digitFs = fontSize * 0.65;
                    else if (cfg.step === 9.52) digitFs = fontSize * 0.75;
                }

                const t = el('text', {
                    x: cx, 
                    y: r(rowY),
                    'font-family': isPrint ? 'RazerF5' : 'ClassRoomCursive',
                    'font-size': r(digitFs),
                    'font-weight': isPrint ? 'normal' : 'bold',
                    fill: chColor, 'text-anchor': 'middle', 'dominant-baseline': 'alphabetic',
                });
                t.textContent = isPrint ? ch.toUpperCase() : ch;
                g.appendChild(t);
                
                const chStr = isPrint ? ch.toUpperCase() : ch;
                const wText = getMeasuredWidth(chStr.replace(/ /g, '\u00A0'), `${r(digitFs)}px '${isPrint ? 'RazerF5' : 'ClassRoomCursive'}'`);
                drawDecorations(g, chunkObj, cx - wText/2, rowY, wText, fontSize, lineH, fill);

                col++;
                i++;
            } else {
                let j = i;
                while (j < chars.length && chars[j].ch !== ' ' && !MATH_CHAR_RE.test(chars[j].ch)) {
                    j++;
                }

                const wordChars = chars.slice(i, j);
                const wordStartX = startX + col * step;
                
                const wordChunks = [];
                let currSub = null;
                for (const wc of wordChars) {
                    if (currSub && currSub.chunkObj === wc.chunkObj) {
                        currSub.text += wc.ch;
                    } else {
                        if (currSub) wordChunks.push(currSub);
                        currSub = { ...wc.chunkObj, text: wc.ch };
                    }
                }
                if (currSub) wordChunks.push(currSub);

                const res = renderLineWithWrap(g, wordChunks, startX, endX, rowY, H, fontSize, lineH, fill, lineH, cfg, wordStartX);
                rowY = res.endY;
                col = Math.max(0, Math.round((res.endX - startX) / step));
                
                i = j;
            }
        }
        rowY += lineH;
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   МАРШРУТИЗАТОР А / Б
   ═══════════════════════════════════════════════════════════════════════ */

function buildTextGroup(W, H, gridType, mode, mathMode, textLines) {
    const g   = el('g', { id: 'svgText' });
    const cfg = GRID_CFG[gridType] || GRID_CFG.narrow;
    const fill = mode === 'copy' ? '#1a1a2e' : '#c0cdd8';

    if (gridType === 'large_squared' || (gridType === 'squared' && mathMode)) {
        renderMathLines(g, W, H, cfg, textLines, fill);  // Ветвь Б (поклеточная)
    } else {
        renderNormalLines(g, W, H, cfg, mode, textLines, fill);  // Ветвь А
    }
    return g;
}

/* ═══════════════════════════════════════════════════════════════════════
   ГЛАВНЫЙ РЕНДЕР
   ═══════════════════════════════════════════════════════════════════════ */

function render(textOnly = false) {
    if (!textOnly) readState();
    const { w: W, h: H } = getSheetDims();
    const sheet = document.getElementById('previewSheet');
    if (!sheet) return;

    sheet.style.aspectRatio = `${W} / ${H}`;
    sheet.setAttribute('aria-label',
        `Предпросмотр листа ${state.format.toUpperCase()} ` +
        `${state.orientation === 'landscape' ? 'альбомная' : 'книжная'}`
    );

    // Динамическая ориентация страницы для печати (убираем лишние клики)
    let printStyle = document.getElementById('dynamicPrintStyle');
    if (!printStyle) {
        printStyle = el('style', { id: 'dynamicPrintStyle' });
        document.head.appendChild(printStyle);
    }
    const isLandscape = (state.layout === '2-pages') || (state.orientation === 'landscape');
    printStyle.textContent = `@page { size: ${isLandscape ? 'landscape' : 'portrait'}; margin: 0; }`;

    let svg = sheet.querySelector('svg#previewSvg');
    if (!svg) {
        sheet.innerHTML = '';
        svg = el('svg', {
            id: 'previewSvg', xmlns: NS,
            width: '100%', height: '100%',
            preserveAspectRatio: 'xMidYMid meet', role: 'img',
        });
        sheet.appendChild(svg);
        svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff', id: 'bgRect' }));
        svg.appendChild(el('g', { id: 'gridLayer' }));
        svg.appendChild(el('g', { id: 'textLayer' }));
        textOnly = false;
    }

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('aria-label', `Лист прописей ${state.format.toUpperCase()} ${W}×${H} мм`);
    
    const bgRect = svg.querySelector('#bgRect');
    if (bgRect) {
        bgRect.setAttribute('width', W);
        bgRect.setAttribute('height', H);
    }

    const editorEl = document.getElementById('textEditor');
    const lines    = editorEl ? getTextLines(editorEl) : [''];

    const gridLayer = svg.querySelector('#gridLayer');
    const textLayer = svg.querySelector('#textLayer');

    if (!textOnly) {
        gridLayer.innerHTML = '';
        gridLayer.appendChild(buildGridGroup(W, H, state.grid));
    }

    textLayer.innerHTML = '';
    textLayer.appendChild(buildTextGroup(W, H, state.grid, state.mode, state.mathMode, lines));

    // 1. ПОЛНАЯ ЗАЧИСТКА СТАРЫХ КЛОНОВ (ПО КЛАССУ)
    if (!textOnly && state.layout !== '2-pages') {
        sheet.querySelectorAll('.preview-clone').forEach(c => c.remove());
    }

    if (state.layout === '2-pages') {
        let clone = sheet.querySelector('.preview-clone');
        if (!clone) {
            clone = el('svg', {
                xmlns: NS,
                width: '100%', height: '100%',
                preserveAspectRatio: 'xMidYMid meet', role: 'img',
                viewBox: `0 0 ${W} ${H}`
            });
            clone.classList.add('preview-clone');
            clone.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff', id: 'cloneBgRect' }));
            clone.appendChild(el('g', { id: 'cloneGridLayer' }));
            clone.appendChild(el('g', { id: 'cloneTextLayer' }));
            sheet.appendChild(clone);
            textOnly = false;
        }

        clone.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const cloneBgRect = clone.querySelector('#cloneBgRect');
        if (cloneBgRect) {
            cloneBgRect.setAttribute('width', W);
            cloneBgRect.setAttribute('height', H);
        }
        
        const oldMargin = state.margin;
        if (state.mirrorMargins) {
            state.margin = (oldMargin === 'left') ? 'right' : (oldMargin === 'right' ? 'left' : oldMargin);
        }
        
        const cloneGridLayer = clone.querySelector('#cloneGridLayer');
        const cloneTextLayer = clone.querySelector('#cloneTextLayer');

        if (!textOnly) {
            cloneGridLayer.innerHTML = '';
            cloneGridLayer.appendChild(buildGridGroup(W, H, state.grid));
        }

        cloneTextLayer.innerHTML = '';
        cloneTextLayer.appendChild(buildTextGroup(W, H, state.grid, state.mode, state.mathMode, lines));
        
        state.margin = oldMargin;
        
        sheet.style.display = 'flex';
        sheet.style.flexDirection = 'row';
        sheet.style.aspectRatio = `${W * 2} / ${H}`;
    } else {
        sheet.style.display = '';
        sheet.style.flexDirection = '';
    }
}

let isDirtyText = false;
let isDirtyFull = false;

function scheduleRender(textOnly = false) {
    if (textOnly === true) {
        isDirtyText = true;
    } else {
        isDirtyFull = true;
    }
}

function renderLoop() {
    if (isDirtyFull) {
        render(false);
        isDirtyFull = false;
        isDirtyText = false;
    } else if (isDirtyText) {
        render(true);
        isDirtyText = false;
    }
    requestAnimationFrame(renderLoop);
}

/* ═══════════════════════════════════════════════════════════════════════
   UI: СЕГМЕНТИРОВАННЫЕ КНОПКИ
   ═══════════════════════════════════════════════════════════════════════ */

function initSegGroup(groupEl) {
    const btns = Array.from(groupEl.querySelectorAll('.seg-btn'));
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
            if (groupEl.id === 'layoutGroup' && btn.dataset.value === '2-pages') {
                if (typeof ym === 'function') ym(109849947, 'reachGoal', 'layout_2pages');
            }
            scheduleRender(false);
        });
        btn.addEventListener('keydown', e => {
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); btn.click(); return; }
            const idx = btns.indexOf(btn);
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); btns[(idx + 1) % btns.length].focus(); }
            if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); btns[(idx - 1 + btns.length) % btns.length].focus(); }
        });
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   UI: ЦВЕТОВЫЕ КНОПКИ
   ═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════
   UI: РЕДАКТОР СТИЛЕЙ
   ═══════════════════════════════════════════════════════════════════════ */
function applyStyle(type, value) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    if (sel.isCollapsed) {
        if (value === 'none') {
            // Если ничего не выделено и нажали "Очистить" — чистим весь редактор
            const editor = document.getElementById('textEditor');
            editor.innerHTML = editor.innerHTML.replace(/<\/?span[^>]*>/g, '');
            scheduleRender(true);
        }
        return;
    }

    const range = sel.getRangeAt(0);

    const editor = document.getElementById('textEditor');
    if (!editor || !editor.contains(range.commonAncestorContainer)) return;
    if (range.collapsed) return;

    // Обрезка конечных пробелов в range, чтобы не стилизовать невидимые отступы
    while (range.endContainer.nodeType === Node.TEXT_NODE && range.endOffset > 0 && range.endContainer.textContent[range.endOffset - 1].match(/\s/)) {
        range.setEnd(range.endContainer, range.endOffset - 1);
    }
    while (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset < range.startContainer.length && range.startContainer.textContent[range.startOffset].match(/\s/)) {
        range.setStart(range.startContainer, range.startOffset + 1);
    }

    if (range.collapsed) return;

    // Получаем текущие стили ближайшего родительского span
    const closestSpan = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE 
        ? range.commonAncestorContainer.closest('span') 
        : range.commonAncestorContainer.parentElement.closest('span');

    const parentMorph = closestSpan ? closestSpan.dataset.morph : null;
    const parentUl = closestSpan ? closestSpan.dataset.ul : null;

    // Всегда создаем НОВЫЙ span для идеальной вложенности
    const targetSpan = document.createElement('span');
    try {
        targetSpan.appendChild(range.extractContents());
        range.insertNode(targetSpan);
    } catch (e) {
        console.error("Ошибка применения стиля:", e);
        return;
    }

    if (type === 'color') {
        targetSpan.dataset.color = value;
        targetSpan.style.color = value;
    } else if (type === 'ul') {
        if (value === 'none' || parentUl === value) {
            targetSpan.dataset.ul = 'none';
            targetSpan.style.textDecoration = 'none';
            targetSpan.style.textDecorationStyle = '';
        } else {
            targetSpan.dataset.ul = value;
            targetSpan.style.textDecoration = 'underline';
            targetSpan.style.textDecorationStyle = value === 'dotdash' ? 'dotted' : value;
            const activeColorBtn = document.querySelector('.wysiwyg-toolbar .color-swatch.active');
            const ulC = activeColorBtn ? activeColorBtn.dataset.color : '#0F172A';
            targetSpan.dataset.ulColor = ulC;
            if (ulC !== 'inherit') targetSpan.style.textDecorationColor = ulC;
        }
    } else if (type === 'morph') {
        if (value === 'none' || parentMorph === value) {
            targetSpan.dataset.morph = 'none';
            delete targetSpan.dataset.morphId;
            targetSpan.style.backgroundColor = '';
        } else {
            targetSpan.dataset.morph = value;
            targetSpan.dataset.morphId = Date.now().toString() + Math.random().toString().slice(2, 6);
            targetSpan.style.backgroundColor = 'rgba(0,101,132,0.1)';
            const activeColorBtn = document.querySelector('.wysiwyg-toolbar .color-swatch.active');
            const ulC = activeColorBtn ? activeColorBtn.dataset.color : '#0F172A';
            targetSpan.dataset.ulColor = ulC;
        }
    } else if (type === 'clear') {
        targetSpan.innerHTML = targetSpan.innerHTML.replace(/<\/?span[^>]*>/g, '');
    }

    scheduleRender(true);
}

function initColorRow(rowEl) {
    if (!rowEl) return;
    const swatches = Array.from(rowEl.querySelectorAll('.color-swatch'));
    swatches.forEach(sw => {
        sw.addEventListener('mousedown', e => e.preventDefault());
        sw.addEventListener('click', () => {
            swatches.forEach(s => { s.classList.remove('active'); s.setAttribute('aria-pressed', 'false'); });
            sw.classList.add('active');
            sw.setAttribute('aria-pressed', 'true');
            if (sw.dataset.color) {
                applyStyle('color', sw.dataset.color);
            }
        });
        sw.addEventListener('keydown', e => {
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); sw.click(); }
        });
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   UI: ТУМБЛЕР «РАЗБОР ПРЕДЛОЖЕНИЯ»
   ═══════════════════════════════════════════════════════════════════════ */

function initSentenceToggle() {
    const toggles = [
        { btnId: 'sentenceToggleBtn', panelId: 'sentencePanel' },
        { btnId: 'pageSettingsToggleBtn', panelId: 'pageSettingsPanel' }
    ];

    toggles.forEach(({ btnId, panelId }) => {
        const btn = document.getElementById(btnId);
        const panel = document.getElementById(panelId);
        if (!btn || !panel) return;
        btn.addEventListener('click', () => {
            const isOpen = panel.classList.contains('open');
            panel.classList.toggle('open', !isOpen);
            btn.classList.toggle('active', !isOpen);
            btn.setAttribute('aria-expanded', String(!isOpen));
            panel.setAttribute('aria-hidden',  String(isOpen));
        });
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   UI: GLASS DRAWER
   ═══════════════════════════════════════════════════════════════════════ */

function initGlassDrawer() {
    const drawer = document.getElementById('glassDrawer');
    const tab    = document.getElementById('glassDrawerTab');
    const scroll = document.getElementById('glassDrawerScroll');
    if (!drawer || !tab || !scroll) return;

    const cardHtml = ({ app_name, label }) =>
        `<button class="glass-drawer__card" type="button" data-app-name="${app_name}">${label}</button>`;

    const allBtnHtml = `<button class="glass-drawer__all-btn" type="button" data-app-name="all_services">Все приложения Точилки</button>`;

    const SPLIT = 6;
    scroll.innerHTML =
        PROMO_APPS.slice(0, SPLIT).map(cardHtml).join('') +
        allBtnHtml +
        PROMO_APPS.slice(SPLIT).map(cardHtml).join('');

    tab.addEventListener('click', e => {
        e.stopPropagation();
        const open = drawer.classList.toggle('is-open');
        tab.setAttribute('aria-expanded', String(open));
        
        if (open) {
            const allBtn = scroll.querySelector('.glass-drawer__all-btn');
            if (allBtn) {
                setTimeout(() => {
                    allBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
        }
    });
    
    document.addEventListener('click', e => {
        if (drawer.classList.contains('is-open') && !drawer.contains(e.target)) {
            drawer.classList.remove('is-open');
            tab.setAttribute('aria-expanded', 'false');
        }
    });
    
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
            drawer.classList.remove('is-open');
            tab.setAttribute('aria-expanded', 'false');
            tab.focus();
        }
    });

    drawer.addEventListener('click', e => {
        const card = e.target.closest('[data-app-name]');
        if (!card) return;
        
        const appName = card.dataset.appName;
        if (typeof ym === 'function') {
            ym(109849947, 'reachGoal', 'crosspromo_clicked', { app_name: appName });
        }
        
        if (appName !== 'coming_soon') {
            const url = appName === 'all_services' 
                ? 'https://onlinetochilka.github.io/' 
                : `https://onlinetochilka.github.io/${appName}/`;
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    });
}

function initClearBtn() {
    const btn = document.getElementById('btnClearFormat');
    if (btn) {
        btn.addEventListener('mousedown', e => e.preventDefault());
        btn.addEventListener('click', e => {
            e.preventDefault();
            const sel = window.getSelection();
            if (sel.isCollapsed) {
                const editor = document.getElementById('textEditor');
                editor.innerHTML = editor.innerHTML.replace(/<\/?span[^>]*>/g, '');
                scheduleRender(true);
            } else {
                applyStyle('clear', 'none');
            }
        });
    }
}

function initAccentButton() {
    const btn = document.getElementById('btnAccent');
    const editor = document.getElementById('textEditor');
    if (!btn || !editor) return;
    
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', e => {
        e.preventDefault();
        if (typeof ym === 'function') ym(109849947, 'reachGoal', 'accent_clicked');
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) return;
        
        const textNode = document.createTextNode('´');
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        
        scheduleRender(true);
    });
}

function initSmartMenu() {
    const editor = document.getElementById('textEditor');
    const menu = document.getElementById('smartMenu');
    if (!editor || !menu) return;

    const showMenu = () => {
        const sel = window.getSelection();
        if (!sel.rangeCount || sel.isCollapsed) {
            menu.classList.remove('is-visible');
            return;
        }

        const range = sel.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) {
            menu.classList.remove('is-visible');
            return;
        }

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            menu.classList.remove('is-visible');
            return;
        }

        let top = rect.top + window.scrollY - 40;
        if (top < window.scrollY + 10) {
            top = rect.bottom + window.scrollY + 10;
        }

        let left = rect.left + window.scrollX + (rect.width / 2) - (menu.offsetWidth / 2);
        if (left < 10) left = 10;
        if (left + menu.offsetWidth > document.documentElement.clientWidth - 10) {
            left = document.documentElement.clientWidth - menu.offsetWidth - 10;
        }

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
        menu.classList.add('is-visible');
        if (typeof ym === 'function') ym(109849947, 'reachGoal', 'smart_menu_used');
    };

    document.addEventListener('mouseup', e => {
        if (menu.contains(e.target)) return;
        setTimeout(showMenu, 10);
    });

    document.addEventListener('keyup', e => {
        if (e.key === 'Shift' || e.key.startsWith('Arrow')) {
            setTimeout(showMenu, 10);
        }
    });

    document.addEventListener('mousedown', e => {
        if (!menu.contains(e.target) && !editor.contains(e.target)) {
            menu.classList.remove('is-visible');
        }
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   UI: КНОПКИ ДЕЙСТВИЙ (заглушки)
   ═══════════════════════════════════════════════════════════════════════ */

function initActionButtons() {
    const printBtn = document.getElementById('btnPrint');
    const downloadBtn = document.getElementById('btnDownload');

    if (printBtn) {
        printBtn.addEventListener('click', () => {
            if (typeof ym === 'function') ym(109849947, 'reachGoal', 'print_click');
            window.print();
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (typeof ym === 'function') ym(109849947, 'reachGoal', 'download_pdf_click');
            // Небольшая подсказка для неопытных пользователей перед открытием окна печати
            alert('Чтобы сохранить файл, в открывшемся окне выберите принтер "Сохранить как PDF" (или "Save as PDF").');
            window.print();
        });
    }
}

function initHelpModal() {
    const helpBtn = document.getElementById('helpBtn');
    const overlay = document.getElementById('helpModalOverlay');
    const closeBtn = document.getElementById('helpModalClose');

    if (!helpBtn || !overlay || !closeBtn) return;

    const closeModal = () => {
        overlay.classList.remove('is-open');
    };

    helpBtn.addEventListener('click', () => {
        if (typeof ym === 'function') ym(109849947, 'reachGoal', 'help_opened');
        overlay.classList.add('is-open');
    });

    closeBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
            closeModal();
        }
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   ИНИЦИАЛИЗАЦИЯ
   ═══════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

    document.querySelectorAll('[role="group"]').forEach(g => {
        if (g.querySelector('.seg-btn')) initSegGroup(g);
    });
    initColorRow(document.getElementById('toolbarColorGroup'));
    
    document.querySelectorAll('.ul-btn').forEach(btn => {
        btn.addEventListener('mousedown', e => e.preventDefault());
        btn.addEventListener('click', () => {
            applyStyle('ul', btn.dataset.ul);
        });
    });

    document.querySelectorAll('.morph-btn').forEach(btn => {
        btn.addEventListener('mousedown', e => e.preventDefault());
        btn.addEventListener('click', () => {
            applyStyle('morph', btn.dataset.morph);
        });
    });

    initSentenceToggle();
    initGlassDrawer();
    initActionButtons();
    initAccentButton();
    initClearBtn();
    initSmartMenu();
    initHelpModal();

    const editor = document.getElementById('textEditor');
    if (editor) {
        editor.addEventListener('input', () => scheduleRender(true));
        editor.addEventListener('paste', e => {
            e.preventDefault();
            const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
            document.execCommand('insertText', false, txt);
        });
    }

    const mathCheck = document.getElementById('mathModeCheck');
    if (mathCheck) mathCheck.addEventListener('change', () => {
        if (typeof ym === 'function') ym(109849947, 'reachGoal', 'math_mode_toggled');
        scheduleRender(false);
    });

    const mirrorCheck = document.getElementById('mirrorMarginsCheck');
    if (mirrorCheck) mirrorCheck.addEventListener('change', () => scheduleRender(false));

    const editorEl = document.getElementById('textEditor');
    const gridBtns = document.querySelectorAll('#gridTypeGroup .seg-btn');
    const DEF_CURSIVE = 'Аа Бб Вв 1 2 3 4 5Пишу красиво и легко.С Точилкой всё сходится!';
    const DEF_PRINT = 'А Б В 1 2 3 4 5ПИШУ КРАСИВО.';
    
    if (editorEl && gridBtns.length) {
        gridBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const cleanText = editorEl.innerText.replace(/\s+/g, '');
                if (cleanText === DEF_CURSIVE.replace(/\s+/g, '') || cleanText === DEF_PRINT.replace(/\s+/g, '')) {
                    editorEl.innerHTML = (btn.dataset.value === 'large_squared') 
                        ? '<div>А Б В 1 2 3 4 5</div><div><br></div><div>ПИШУ КРАСИВО.</div>' 
                        : '<div>Аа Бб Вв 1 2 3 4 5</div><div><br></div><div>Пишу красиво и легко.</div><div><br></div><div>С Точилкой всё сходится!</div>';
                }
            });
        });
    }

    render();
    requestAnimationFrame(renderLoop);

    console.log('%c✅ Прописи — Canvas-замер + SVG-ударения активны', 'color:#006584;font-weight:700;font-size:14px;');
    console.log(
        '%c[1] Canvas measureText вместо эвристики 0.45\n' +
        '[2] Ветвь Б: per-cell = только цифры и ±=(); буквы — чанк-рендер\n' +
        '[3] Нет lat → Propisi | Есть lat → ClassRoomCursive\n' +
        '[4] ,, → отдельный SVG ´ (U+0301 убран из шрифта)\n' +
        '[5] Отступ y = lineH × 2 от верха\n' +
        '[6] Поля: left/none/right → красная линия + startX/endX',
        'color:#006584;font-size:12px;'
    );
});
