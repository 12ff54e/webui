import {createTheme, themeToggle, palette, onThemeChange} from '../src/theme.js';

export async function test_themes({test, assert, equal, root}) {
    const theme_root = (parent = root) => {
        const node = document.createElement('section');
        node.className = 'wui'; parent.append(node);
        return node;
    };
    const frame = async source => {
        const node = document.createElement('iframe');
        const loaded = new Promise(resolve => { node.onload = resolve; });
        node.srcdoc = source ?? '<!doctype html><html class="wui"><title>Theme test</title></html>';
        root.append(node); await loaded;
        return node;
    };
    const rejects = action => { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected); };

    await test('Light and dark palettes stay independent on nested roots', () => {
        const outer = theme_root(), inner = theme_root(outer);
        const first = createTheme({root: outer}), second = createTheme({root: inner});
        try {
            const light = palette(outer);
            rejects(() => createTheme({root: inner, theme: 'unknown'}));
            first.setMode('dark');
            equal(first.name, 'default'); equal(outer.dataset.theme, 'default');
            const dark = palette(outer);
            equal(dark.background, '#141e1a'); equal(dark.grid, '#2b3c31');
            equal(dark.plot4, '#ed88b8'); equal(dark.plot5, '#edab81');
            equal(palette(inner).background, light.background);
            assert(dark.text !== light.text && dark.accent !== light.accent);
            second.setMode('dark'); first.setMode('light');
            equal(palette(inner).background, dark.background);
            equal(palette(outer).background, light.background);
            equal(getComputedStyle(inner).colorScheme, 'dark');
            equal(getComputedStyle(outer).colorScheme, 'light');
        } finally { first.destroy(); second.destroy(); outer.remove(); }
    });

    await test('Cloisonné provides readable palettes and stays independent of nested themes', () => {
        const outer = theme_root(), inner = theme_root(outer);
        const first = createTheme({root: outer, theme: 'cloisonne'}), second = createTheme({root: inner});
        const luminance = hex => {
            const channels = hex.slice(1).match(/../g).map(value => {
                const channel = parseInt(value, 16) / 255;
                return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
            });
            return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const contrast = (foreground, background) => {
            const a = luminance(foreground), b = luminance(background);
            return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        };
        try {
            const default_light = palette(inner), cloisonne_light = palette(outer);
            equal(first.name, 'cloisonne'); equal(cloisonne_light.accent, '#2775b6');
            for (const mode of ['light', 'dark']) {
                first.setMode(mode);
                const colors = palette(outer), style = getComputedStyle(outer);
                const soft = style.getPropertyValue('--ui-soft').trim();
                const on_accent = style.getPropertyValue('--ui-on-accent').trim();
                assert(/^#[\da-f]{6}$/i.test(soft) && /^#[\da-f]{6}$/i.test(on_accent));
                equal(getComputedStyle(outer).colorScheme, mode);
                for (const name of ['text', 'muted', 'accent']) {
                    for (const background of [colors.background, colors.surface, soft]) {
                        assert(contrast(colors[name], background) >= 4.5,
                            `Cloisonné ${mode} ${name} text must have 4.5:1 contrast on ${background}`);
                    }
                }
                assert(contrast(on_accent, colors.accent) >= 4.5,
                    `Cloisonné ${mode} primary-button text must have 4.5:1 contrast`);
                equal(JSON.stringify(palette(inner)), JSON.stringify(default_light), 'Nested default keeps its own light palette');
            }
            const cloisonne_dark = palette(outer);
            assert(cloisonne_dark.background !== cloisonne_light.background && cloisonne_dark.accent !== cloisonne_light.accent);
            second.setTheme('cloisonne').setMode('dark');
            first.setTheme('default').setMode('light');
            equal(JSON.stringify(palette(outer)), JSON.stringify(default_light));
            equal(JSON.stringify(palette(inner)), JSON.stringify(cloisonne_dark), 'Nested Cloisonné keeps its own dark palette');
            second.setMode('light');
            equal(JSON.stringify(palette(inner)), JSON.stringify(cloisonne_light));
        } finally { first.destroy(); second.destroy(); outer.remove(); }
    });

    await test('Theme selection preserves mode, preference, focused controls, and notification counts', () => {
        const key = `webui.test.selection.${crypto.randomUUID()}`;
        const node = theme_root();
        localStorage.setItem(key, 'light');
        const theme = createTheme({root: node, storageKey: key, theme: 'cloisonne'});
        const toggle = themeToggle({theme}).mount(node);
        const changes = [], stop = onThemeChange(node, colors => changes.push(colors.accent));
        try {
            toggle.element.focus();
            theme.setMode('dark', {persist: false}); equal(changes.length, 2);
            equal(theme.setTheme('default'), theme); equal(changes.length, 3);
            equal(theme.name, 'default'); equal(theme.mode, 'dark');
            equal(node.dataset.theme, 'default'); equal(node.dataset.mode, 'dark');
            equal(toggle.element.getAttribute('aria-pressed'), 'true');
            equal(document.activeElement, toggle.element);
            equal(localStorage.getItem(key), 'light', 'Identity changes must not write a mode preference');
            theme.setTheme('default'); equal(changes.length, 3, 'Same identity does not notify');
            rejects(() => theme.setTheme('Cloisonné'));
            rejects(() => theme.setTheme('unknown'));
            equal(theme.name, 'default'); equal(changes.length, 3, 'Rejected identities do not notify');
            node.dataset.theme = 'unknown';
            theme.setTheme('default'); equal(changes.length, 4, 'Repairing the root identity notifies once');
            theme.setTheme('cloisonne'); equal(changes.length, 5);
            theme.toggleMode(); equal(theme.mode, 'light'); equal(changes.length, 6);
            equal(theme.name, 'cloisonne'); equal(localStorage.getItem(key), 'light');
            window.dispatchEvent(new StorageEvent('storage', {key, newValue: 'dark', storageArea: localStorage}));
            equal(theme.mode, 'dark'); equal(theme.name, 'cloisonne'); equal(changes.length, 7);
            equal(localStorage.getItem(key), 'light', 'Stored mode notifications preserve the name without writing back');
            node.dataset.mode = 'unknown';
            theme.setTheme('cloisonne'); equal(theme.mode, 'light'); equal(changes.length, 8);
            theme.destroy();
            rejects(() => theme.setTheme('default'));
            equal(node.dataset.theme, 'cloisonne'); equal(changes.length, 8);
        } finally { stop(); toggle.destroy(); theme.destroy(); node.remove(); localStorage.removeItem(key); }
    });

    await test('The built-in mode switch owns its icon, label, state, and cleanup', () => {
        const node = theme_root(), form = document.createElement('form'); node.append(form);
        const theme = createTheme({root: node});
        let submissions = 0;
        form.addEventListener('submit', event => { event.preventDefault(); ++submissions; });
        const toggle = themeToggle({theme}).mount(form);
        const element = toggle.element, icon = element.querySelector('svg');
        try {
            equal(element.type, 'button'); equal(element.getAttribute('aria-label'), 'Dark mode');
            equal(element.getAttribute('aria-pressed'), 'false'); assert(icon && icon.getAttribute('aria-hidden') === 'true');
            element.focus(); element.click(); equal(theme.mode, 'dark');
            equal(document.activeElement, element); equal(submissions, 0);
            equal(element.getAttribute('aria-pressed'), 'true');
            toggle.set({label: 'Use dark mode', disabled: true});
            equal(toggle.element, element); equal(element.querySelector('svg'), icon);
            equal(element.getAttribute('aria-label'), 'Use dark mode');
            element.click(); equal(theme.mode, 'dark');
            toggle.set({disabled: false, hidden: true}); equal(element.hidden, true);
            toggle.set({hidden: false}); theme.setMode('light');
            equal(element.getAttribute('aria-pressed'), 'false');
            toggle.destroy(); toggle.destroy();
            theme.setMode('dark');
            equal(element.getAttribute('aria-pressed'), 'false', 'Destroyed switch unsubscribes');
            element.click(); equal(theme.mode, 'dark', 'Destroyed switch removes its click listener');
        } finally { toggle.destroy(); theme.destroy(); node.remove(); }
    });

    await test('Theme toggles notify once, retain focus, and release their bindings', () => {
        const node = theme_root(), button = document.createElement('button');
        button.textContent = 'Dark theme'; node.append(button);
        const theme = createTheme({root: node});
        const changes = [], stop = onThemeChange(node, colors => changes.push(colors.background));
        try {
            const unbind = theme.bindToggle(button);
            equal(button.getAttribute('aria-pressed'), 'false');
            theme.setMode('dark'); equal(changes.length, 2);
            theme.setMode('dark'); equal(changes.length, 2, 'No duplicate notifications');
            equal(button.getAttribute('aria-pressed'), 'true');
            button.focus(); button.click();
            equal(theme.mode, 'light'); equal(document.activeElement, button);
            equal(button.getAttribute('aria-pressed'), 'false');
            equal(changes.length, 3);
            rejects(() => theme.setMode('system')); equal(theme.mode, 'light');
            unbind(); unbind();
            const rebind = theme.bindToggle(button);
            unbind(); // An old disposer must not remove the replacement binding.
            button.click(); equal(theme.mode, 'dark');
            rebind(); button.click(); equal(theme.mode, 'dark');
            theme.bindToggle(button);
            theme.destroy(); theme.destroy();
            button.click(); equal(node.dataset.mode, 'dark');
            rejects(() => theme.toggleMode()); rejects(() => theme.bindToggle(button));
            assert(node.isConnected, 'Destroy leaves the root and selected theme in place');
        } finally { stop(); theme.destroy(); node.remove(); }
    });

    await test('Saved preferences and storage changes obey the selected key and area', () => {
        const key = `webui.test.theme.${crypto.randomUUID()}`;
        const node = theme_root(), other = theme_root();
        let first, second;
        try {
            localStorage.setItem(key, 'invalid');
            first = createTheme({root: node, storageKey: key, defaultMode: 'dark'});
            equal(first.mode, 'dark');
            first.setMode('light'); equal(localStorage.getItem(key), 'light');
            first.setMode('dark', {persist: false}); equal(localStorage.getItem(key), 'light');
            second = createTheme({root: other, storageKey: key});
            equal(second.mode, 'light', 'A second controller restores the stored preference');
            const stored = (eventKey, value, area = localStorage) => window.dispatchEvent(new StorageEvent('storage', {
                key: eventKey, newValue: value, storageArea: area,
            }));
            stored(key, 'dark', null); equal(second.mode, 'light', 'Ignore another storage area');
            stored(key + '.other', 'dark'); equal(second.mode, 'light', 'Ignore another key');
            stored(key, 'dark'); equal(second.mode, 'dark');
            equal(localStorage.getItem(key), 'light', 'Storage notifications never write back');
            stored(key, 'invalid'); equal(first.mode, 'dark'); equal(second.mode, 'light');
            second.setMode('dark', {persist: false});
            stored(null, null); equal(first.mode, 'dark'); equal(second.mode, 'light');
            second.destroy(); stored(key, 'dark'); equal(other.dataset.mode, 'light');
            first.setMode('dark'); equal(localStorage.getItem(key), 'dark', 'Same-value set still saves explicitly');
        } finally {
            first?.destroy(); second?.destroy(); node.remove(); other.remove(); localStorage.removeItem(key);
        }
    });

    await test('Theme changes work when storage reads or writes are blocked', async () => {
        for (const denied of ['access', 'methods']) {
            const node = await frame();
            const view = node.contentWindow, target = node.contentDocument.documentElement;
            let accesses = 0, theme;
            try {
                Object.defineProperty(view, 'localStorage', {configurable: true, get() {
                    ++accesses;
                    if (denied === 'access') throw Error('Storage denied');
                    return {getItem() { throw Error('Read denied'); }, setItem() { throw Error('Write denied'); }};
                }});
                theme = createTheme({root: target});
                theme.toggleMode(); equal(accesses, 0, 'No storage access without a key');
                theme.destroy();
                theme = createTheme({root: target, storageKey: 'webui.test.denied', defaultMode: 'dark'});
                equal(theme.mode, 'dark'); theme.toggleMode(); equal(theme.mode, 'light');
                equal(target.dataset.mode, 'light');
            } finally { theme?.destroy(); node.remove(); }
        }
    });

    await test('The classic boot helper restores the same theme before the stylesheet', async () => {
        const key = `webui.test.boot.${crypto.randomUUID()}`;
        const script = new URL('../src/theme_boot.js', import.meta.url).href;
        const stylesheet = new URL('../styles/ui.css', import.meta.url).href;
        try {
            for (const [saved, fallback, expected] of [
                ['dark', 'light', 'dark'], ['light', 'dark', 'light'],
                ['invalid', 'dark', 'dark'], [null, 'light', 'light'],
            ]) {
                if (saved === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, saved);
                const node = await frame(`<!doctype html><html class="wui"><head>
                    <script>Object.defineProperty(window, 'localStorage', {get: () => parent.sessionStorage});<\/script>
                    <script src="${script}" data-storage-key="${key}" data-default-mode="${fallback}"><\/script>
                    <script>window.bootMode = document.documentElement.dataset.mode;<\/script>
                    <link rel="stylesheet" href="${stylesheet}"></head></html>`);
                let theme;
                try {
                    equal(node.contentWindow.bootMode, expected);
                    equal(node.contentDocument.documentElement.dataset.theme, 'default');
                    theme = createTheme({root: node.contentDocument.documentElement, storageKey: key, defaultMode: fallback});
                    equal(theme.mode, expected);
                    equal(palette(node.contentDocument.documentElement).background, expected === 'dark' ? '#141e1a' : '#f7f7f1');
                } finally { theme?.destroy(); node.remove(); }
            }
        } finally { sessionStorage.removeItem(key); }
    });

    await test('The boot helper selects configured names before paint and rejects invalid identities', async () => {
        const key = `webui.test.named-boot.${crypto.randomUUID()}`;
        const script = new URL('../src/theme_boot.js', import.meta.url).href;
        const stylesheet = new URL('../styles/ui.css', import.meta.url).href;
        const cases = [
            {root: 'cloisonne', mode: 'light', expected: 'cloisonne'},
            {root: 'cloisonne', mode: 'dark', expected: 'cloisonne'},
            {root: 'default', configured: 'cloisonne', mode: 'dark', expected: 'cloisonne'},
            {root: 'cloisonne', configured: 'default', mode: 'light', expected: 'default'},
            {root: 'cloisonne', configured: 'unknown', mode: 'dark', expected: 'default'},
            {root: 'unknown', mode: 'light', expected: 'default'},
        ];
        try {
            for (const entry of cases) {
                sessionStorage.setItem(key, entry.mode);
                const configured = entry.configured === undefined ? '' : `data-theme="${entry.configured}"`;
                const node = await frame(`<!doctype html><html class="wui" data-theme="${entry.root}"><head>
                    <script>Object.defineProperty(window, 'localStorage', {get: () => parent.sessionStorage});<\/script>
                    <script src="${script}" ${configured} data-storage-key="${key}"><\/script>
                    <script>window.bootSelection = {...document.documentElement.dataset};<\/script>
                    <link rel="stylesheet" href="${stylesheet}"></head></html>`);
                let theme;
                try {
                    equal(node.contentWindow.bootSelection.theme, entry.expected);
                    equal(node.contentWindow.bootSelection.mode, entry.mode);
                    const target = node.contentDocument.documentElement, before = palette(target);
                    theme = createTheme({root: target, theme: entry.expected, storageKey: key});
                    equal(theme.name, entry.expected); equal(theme.mode, entry.mode);
                    equal(JSON.stringify(palette(target)), JSON.stringify(before), 'Controller startup must keep the boot palette');
                } finally { theme?.destroy(); node.remove(); }
            }
        } finally { sessionStorage.removeItem(key); }
    });
}
