import {bindDocumentStyles, button, createTheme, palette} from '../src/index.js';

export async function test_document({test, assert, equal, root}) {
    const frame = async () => {
        const element = document.createElement('iframe');
        const loaded = new Promise(resolve => element.onload = resolve);
        element.srcdoc = '<!doctype html><html><head></head><body></body></html>';
        root.append(element); await loaded; return element;
    };
    await test('Document presentation retains nodes, imported styles, theme, and cleanup', async () => {
        const source = await frame(), target = await frame();
        const doc = source.contentDocument, destination = target.contentDocument;
        const css = doc.createElement('link'); css.rel = 'stylesheet';
        css.href = new URL('../styles/ui.css', import.meta.url).href;
        const loaded = new Promise(resolve => css.onload = resolve); doc.head.append(css); await loaded;
        doc.documentElement.classList.add('wui');
        const theme = createTheme({root: doc.documentElement, theme: 'cloisonne'});
        let clicks = 0;
        const control = button({document: doc, label: 'Keep me', onClick: () => ++clicks}).mount(doc.body);
        const node = control.element;
        const binding = bindDocumentStyles({source: doc, target: destination});
        try {
            control.mount(destination.body); await binding.ready;
            equal(control.element, node); node.click(); equal(clicks, 1);
            equal(palette(node).accent, palette(doc.documentElement).accent);
            const page = destination.createElement('div'); page.className = 'wui-header'; destination.body.append(page);
            equal(target.contentWindow.getComputedStyle(page).display, 'flex', 'Relative layout.css import loads');
            theme.setMode('dark'); theme.setCorners('sharp');
            doc.documentElement.dataset.density = 'compact';
            doc.documentElement.style.setProperty('--ui-accent', '#123456');
            await Promise.resolve();
            equal(palette(node).accent, '#123456');
            equal(palette(node).background, palette(doc.documentElement).background);
            equal(target.contentWindow.getComputedStyle(node).borderTopLeftRadius, '0px');
            equal(target.contentWindow.getComputedStyle(node).minHeight, '35px');
            doc.documentElement.style.removeProperty('--ui-accent'); await Promise.resolve();
            equal(palette(node).accent, palette(doc.documentElement).accent);
            binding.destroy(); binding.destroy();
            equal(destination.querySelectorAll('link, style, base').length, 0);
            assert(!destination.documentElement.classList.contains('wui'));
            theme.setMode('light'); await Promise.resolve();
            equal(destination.documentElement.getAttribute('data-mode'), null);
            control.mount(doc.body); node.click(); equal(clicks, 2, 'Borrowed nodes keep handlers');
        } finally { binding.destroy(); control.destroy(); theme.destroy(); source.remove(); target.remove(); }
    });
    await test('Document readiness covers inline imports, disabled sheets, failure, and cancellation', async () => {
        const source = await frame(), target = await frame();
        const doc = source.contentDocument, destination = target.contentDocument;
        try {
            const style = doc.createElement('style');
            style.textContent = `@import url("${new URL('../styles/ui.css', import.meta.url).href}");`;
            const loaded = new Promise(resolve => style.onload = resolve); doc.head.append(style); await loaded;
            const disabled = doc.createElement('link'); disabled.rel = 'stylesheet'; disabled.disabled = true;
            disabled.href = new URL('missing-disabled.css', import.meta.url).href; doc.head.append(disabled);
            const disabled_inline = doc.createElement('style');
            disabled_inline.textContent = '.wui { --ui-background: #123456; }';
            doc.head.append(disabled_inline); disabled_inline.disabled = true;
            const binding = bindDocumentStyles({source: doc, target: destination});
            await binding.ready;
            equal(palette(destination.documentElement).background, '#f7f7f1', 'Disabled inline styles stay inactive');
            binding.destroy();
            const missing = doc.createElement('link'); missing.rel = 'stylesheet';
            missing.href = new URL('missing.css', import.meta.url).href; doc.head.append(missing);
            const failing = bindDocumentStyles({source: doc, target: destination});
            let rejected = false;
            try { await failing.ready; } catch { rejected = true; }
            assert(rejected, 'A failed stylesheet rejects readiness'); failing.destroy();
            const canceled = bindDocumentStyles({source: doc, target: destination});
            canceled.destroy(); await canceled.ready;
            equal(destination.querySelectorAll('link, style, base').length, 0);
            let invalid = false;
            try { bindDocumentStyles({source: doc.implementation.createHTMLDocument(), target: destination}); }
            catch { invalid = true; }
            assert(invalid, 'Detached source documents have no observer context');
        } finally { source.remove(); target.remove(); }
    });
}
