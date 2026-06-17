const fs = require('fs');

// 1. Update index.html
let html = fs.readFileSync('d:/Propisi/index.html', 'utf8');

// Wrap settings-card
html = html.replace(
    '<aside class="settings-card"',
    '<div class="settings-wrapper" style="position: relative; display: flex; height: 100%; flex-shrink: 0; z-index: 10;">\n        <aside class="settings-card" style="position: relative; z-index: 2;"'
);

// Move glass-drawer
const glassDrawerRegex = /[ \t]*<!-- ══════════════════════════════════════════════════════════════════\s*GLASS DRAWER[\s\S]*?<\/aside>\r?\n/;
const glassDrawerMatch = html.match(glassDrawerRegex);
if (glassDrawerMatch) {
    const glassDrawerHtml = glassDrawerMatch[0];
    html = html.replace(glassDrawerRegex, ''); // Remove from bottom

    // Insert after settings-card
    html = html.replace(
        '    </aside><!-- /.settings-card -->',
        '    </aside><!-- /.settings-card -->\n\n' + glassDrawerHtml + '    </div><!-- /.settings-wrapper -->'
    );
}

fs.writeFileSync('d:/Propisi/index.html', html, 'utf8');

// 2. Update styles.css
let css = fs.readFileSync('d:/Propisi/css/styles.css', 'utf8');

const fullRegex = /\/\* ═══════════════════════════════════════════════════════════════════════\r?\n   GLASS DRAWER[\s\S]*?@media \(max-width: 1023px\) \{\r?\n    \.glass-drawer \{ display: none !important; \}\r?\n\}/;

const replacement = `/* ═══════════════════════════════════════════════════════════════════════
   GLASS DRAWER (выезжающая шторка с рекламой приложений Точилки)
   Прикреплена к левой панели
   ═══════════════════════════════════════════════════════════════════════ */

.glass-drawer {
    --drawer-tab-w: 40px;
    --drawer-panel-w: 290px;
    --glass-bg: rgba(255, 255, 255, 0.38);
    --glass-border: rgba(255, 255, 255, 0.72);
    --glass-shine: inset 0 1px 1px rgba(255, 255, 255, 0.95);
    --glass-depth: inset 0 -12px 28px rgba(255, 255, 255, 0.28);
    --glass-glow: inset 2px 2px 12px rgba(255, 255, 255, 0.42);

    position: absolute;
    z-index: 1;
    right: calc(-1 * var(--drawer-tab-w));
    top: 50%;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    width: calc(var(--drawer-panel-w) + var(--drawer-tab-w));
    height: min(340px, 55vh);
    min-height: 180px;
    max-height: 340px;
    /* Ярлычок торчит из правого края, панель прячется ЗА левой колонкой */
    transform: translateY(-50%) translateX(0);
    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
                opacity 0.5s ease,
                visibility 0.5s ease;
    will-change: transform;
    pointer-events: auto;
}

/* Панель открывается по клику на ярлычок */
.glass-drawer.is-open {
    transform: translateY(-50%) translateX(var(--drawer-panel-w));
}

.glass-drawer__panel {
    flex: 1 1 auto;
    min-width: 0;
    position: relative;
    display: flex;
    flex-direction: column;
    border-radius: 20px 0 0 20px;
    background: var(--glass-bg);
    backdrop-filter: blur(36px) saturate(1.8);
    -webkit-backdrop-filter: blur(36px) saturate(1.8);
    border: 1px solid var(--glass-border);
    border-right: none;
    box-shadow:
        var(--glass-shine),
        var(--glass-depth),
        var(--glass-glow),
        0 8px 32px rgba(255, 255, 255, 0.12);
    overflow: hidden;
    pointer-events: none;
}

.glass-drawer.is-open .glass-drawer__panel {
    pointer-events: auto;
}

.glass-drawer__scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    scrollbar-width: none;
    -ms-overflow-style: none;
}

.glass-drawer__scroll::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
}

.glass-drawer__card {
    flex-shrink: 0;
    width: 100%;
    padding: 14px 18px;
    border: none;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: blur(16px) saturate(1.6);
    -webkit-backdrop-filter: blur(16px) saturate(1.6);
    color: var(--text-main);
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.5;
    text-align: left;
    white-space: normal;
    overflow-wrap: break-word;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(255, 255, 255, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.82);
    transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.glass-drawer__card:hover {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.58);
    box-shadow:
        0 8px 22px rgba(255, 255, 255, 0.28),
        inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.glass-drawer__card:focus-visible {
    outline: 2px solid var(--brand-teal);
    outline-offset: 2px;
}

.glass-drawer__all-btn {
    flex-shrink: 0;
    width: 100%;
    padding: 14px 18px;
    border: none;
    border-radius: 16px;
    background: rgba(0, 101, 132, 0.65);
    backdrop-filter: blur(16px) saturate(1.6);
    -webkit-backdrop-filter: blur(16px) saturate(1.6);
    color: #ffffff;
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.5;
    text-align: left;
    white-space: normal;
    overflow-wrap: break-word;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0, 101, 132, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.3);
    transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.glass-drawer__all-btn:hover {
    transform: translateY(-2px);
    background: rgba(0, 101, 132, 0.8);
    box-shadow:
        0 8px 22px rgba(0, 101, 132, 0.28),
        inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.glass-drawer__all-btn:focus-visible {
    outline: 2px solid var(--brand-teal);
    outline-offset: 2px;
}

.glass-drawer__tab {
    flex: 0 0 var(--drawer-tab-w);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px 6px;
    border-radius: 0 18px 18px 0;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    line-height: 1.25;
    color: var(--text-main);
    background: var(--glass-bg);
    backdrop-filter: blur(36px) saturate(1.8);
    -webkit-backdrop-filter: blur(36px) saturate(1.8);
    border: 1px solid var(--glass-border);
    border-left: 1px solid rgba(255, 255, 255, 0.4);
    user-select: none;
    white-space: nowrap;
    pointer-events: auto;
    cursor: pointer;
    box-shadow:
        var(--glass-shine),
        var(--glass-depth),
        var(--glass-glow),
        4px 0 24px rgba(255, 255, 255, 0.14);
    transition: background 0.2s ease;
}

.glass-drawer__tab:hover {
    background: rgba(255, 255, 255, 0.52);
}

.glass-drawer__tab:focus-visible {
    outline: 2px solid var(--brand-teal);
    outline-offset: 2px;
}

@media (max-width: 1023px) {
    .glass-drawer { display: none !important; }
}`;

css = css.replace(fullRegex, replacement);
fs.writeFileSync('d:/Propisi/css/styles.css', css, 'utf8');

console.log("Layout HTML and CSS updated!");
