import {createTheme} from '../src/index.js';

export async function test_layout({test, assert, equal, root}) {
    await test('Presentation styles stay scoped and follow independent theme roots', () => {
        const outside = document.createElement('div'); outside.className = 'wui-overlay-label';
        document.body.append(outside);
        const first = document.createElement('div'), second = document.createElement('div');
        first.className = second.className = 'wui'; root.append(first, second);
        const themes = [createTheme({root: first}), createTheme({root: second, theme: 'carbon', defaultMode: 'dark'})];
        try {
            for (const node of [first, second]) node.innerHTML = '<div class="wui-frame"><span class="wui-overlay-label">Status</span></div>';
            const a = first.firstElementChild, b = second.firstElementChild;
            assert(getComputedStyle(a).backgroundColor !== getComputedStyle(b).backgroundColor);
            themes[0].setCorners('sharp'); equal(getComputedStyle(a).borderTopLeftRadius, '0px');
            assert(parseFloat(getComputedStyle(b).borderTopLeftRadius) > 0);
            equal(getComputedStyle(outside).paddingTop, '0px', 'Classes outside a webui root remain unstyled');
        } finally { themes.forEach(theme => theme.destroy()); first.remove(); second.remove(); outside.remove(); }
    });

    await test('Page, header, and form patterns fit narrow viewports without replacing native controls', async () => {
        const frame = document.createElement('iframe'); frame.style.width = '800px';
        const css = new URL('../styles/ui.css', import.meta.url).href;
        const loaded = new Promise(resolve => frame.onload = resolve);
        frame.srcdoc = `<!doctype html><html class="wui"><head><link rel="stylesheet" href="${css}"></head>
          <body class="wui-app"><header class="wui-page wui-header"><div class="wui-brand"><span class="wui-brand-title">Projects</span></div>
          <div class="wui-header-actions"><nav class="wui-nav"><a href="#">Overview</a><a href="#">Activity</a></nav><button class="wui-button">Account</button></div></header>
          <main class="wui-page"><section class="wui-panel" data-clip="true"><div class="wui-form-row"><label for="name">Name</label><input id="name" class="wui-input" value="Draft"></div>
          <div class="wui-panel-body wui-form"><label class="wui-label" data-layout="inline">Category<select class="wui-input"><option>A long category description that should stay inside its panel</option></select></label>
          <label class="wui-label" data-layout="stacked">Notes<textarea class="wui-input">Unfinished draft</textarea></label></div></section></main></body></html>`;
        root.append(frame); await loaded;
        const doc = frame.contentDocument, input = doc.querySelector('input'), area = doc.querySelector('textarea');
        let edits = 0; input.addEventListener('input', () => ++edits);
        try {
            input.focus(); input.value = 'Retained edit'; input.dispatchEvent(new frame.contentWindow.Event('input'));
            for (const width of [390, 320, 800]) {
                frame.style.width = `${width}px`;
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                assert(doc.documentElement.scrollWidth <= doc.documentElement.clientWidth, `No page overflow at ${width}px`);
                equal(doc.querySelector('input'), input); equal(input.value, 'Retained edit');
                equal(doc.querySelector('textarea'), area); equal(area.value, 'Unfinished draft');
            }
            equal(edits, 1, 'Resizing never synthesizes edit events');
        } finally { frame.remove(); }
    });

    await test('Legend line patterns remain distinct independently of theme color', () => {
        const node = document.createElement('div'); node.className = 'wui'; root.append(node);
        node.innerHTML = '<ul class="wui-legend"><li data-series="1"><i class="wui-swatch" data-kind="line"></i>First</li><li data-series="2"><i class="wui-swatch" data-kind="line" data-line="dashed"></i>Second</li></ul>';
        const theme = createTheme({root: node, theme: 'carbon'});
        try {
            for (const mode of ['light', 'dark']) {
                theme.setMode(mode);
                const [first, second] = node.querySelectorAll('i');
                equal(getComputedStyle(first).borderTopStyle, 'solid'); equal(getComputedStyle(second).borderTopStyle, 'dashed');
                assert(getComputedStyle(first).color !== getComputedStyle(second).color);
                assert(parseFloat(getComputedStyle(first).borderTopWidth) > 0);
            }
        } finally { theme.destroy(); node.remove(); }
    });
}
