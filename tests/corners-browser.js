import {createTheme, cornerToggle, themeToggle, themePicker, checkbox} from '../src/index.js';

export async function test_corners({test, assert, equal, root}) {
    const theme_root = (parent = root) => {
        const node = document.createElement('section');
        node.className = 'wui'; parent.append(node); return node;
    };
    const rejects = action => { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected); };
    const key = () => `webui.test.corners.${[...crypto.getRandomValues(new Uint32Array(4))].join('-')}`;
    const frame = async source => {
        const node = document.createElement('iframe');
        const loaded = new Promise(resolve => { node.onload = resolve; });
        node.srcdoc = source ?? '<!doctype html><html class="wui"><title>Corner test</title></html>';
        root.append(node); await loaded; return node;
    };

    await test('Corner switches retain nodes and focus, synchronize once, and preserve theme and mode', () => {
        const node = theme_root(), form = document.createElement('form'); node.append(form);
        const theme = createTheme({root: node, theme: 'carbon', defaultMode: 'dark'});
        const first = cornerToggle({theme, id: 'test-corner-toggle'}).mount(form);
        const second = cornerToggle({theme}).mount(form), mode = themeToggle({theme}).mount(form);
        const element = first.element, icon = element.querySelector('svg');
        let notifications = 0, submissions = 0;
        node.addEventListener('webui-theme-change', () => ++notifications);
        form.addEventListener('submit', event => { event.preventDefault(); ++submissions; });
        try {
            equal(theme.corners, 'rounded'); equal(node.dataset.corners, 'rounded');
            equal(element.type, 'button'); equal(element.id, 'test-corner-toggle');
            equal(element.getAttribute('aria-label'), 'Sharp corners'); equal(element.title, 'Sharp corners');
            equal(element.getAttribute('aria-pressed'), 'false'); equal(icon.getAttribute('aria-hidden'), 'true');
            element.focus(); element.click();
            equal(theme.corners, 'sharp'); equal(node.dataset.corners, 'sharp'); equal(notifications, 1);
            equal(first.element, element); equal(element.querySelector('svg'), icon); equal(document.activeElement, element);
            equal(first.element.getAttribute('aria-pressed'), 'true'); equal(second.element.getAttribute('aria-pressed'), 'true');
            equal(theme.name, 'carbon'); equal(theme.mode, 'dark'); equal(submissions, 0);
            equal(theme.setCorners('sharp'), theme); equal(notifications, 1, 'A repeated setting does not notify');
            rejects(() => theme.setCorners('square')); rejects(() => theme.setCorners(null));
            equal(notifications, 1); equal(theme.corners, 'sharp');
            theme.setTheme('sorghum').setMode('light'); equal(theme.corners, 'sharp');
            equal(mode.element.getAttribute('aria-pressed'), 'false');
            second.element.click(); equal(theme.corners, 'rounded'); equal(element.getAttribute('aria-pressed'), 'false');
            node.dataset.corners = 'unknown'; equal(theme.corners, 'rounded');
            const before = notifications;
            theme.setCorners('rounded'); equal(notifications, before + 1, 'Repairing a root setting notifies');
        } finally { first.destroy(); second.destroy(); mode.destroy(); theme.destroy(); node.remove(); }
    });

    await test('Corner switches honor hidden, disabled, fieldset, update, and disposal contracts', () => {
        const node = theme_root(), fieldset = document.createElement('fieldset'); node.append(fieldset);
        const theme = createTheme({root: node}), toggle = cornerToggle({theme}).mount(fieldset);
        const element = toggle.element;
        try {
            toggle.set({label: 'Use square corners', disabled: true}); element.click(); equal(theme.corners, 'rounded');
            equal(element.getAttribute('aria-label'), 'Use square corners');
            toggle.set({disabled: false, hidden: true});
            element.click(); equal(theme.corners, 'rounded', 'Hidden switches cannot change the design');
            toggle.set({hidden: false}); fieldset.disabled = true;
            element.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
            equal(theme.corners, 'rounded', 'A disabled fieldset blocks synthetic clicks too');
            fieldset.disabled = false; element.click(); equal(theme.corners, 'sharp');
            rejects(() => toggle.set({label: '', disabled: true})); equal(element.disabled, false);
            equal(element.getAttribute('aria-label'), 'Use square corners');
            toggle.destroy(); toggle.destroy(); fieldset.append(element);
            theme.setCorners('rounded'); equal(element.getAttribute('aria-pressed'), 'true', 'Disposal stops synchronization');
            element.click(); equal(theme.corners, 'rounded', 'Disposal removes the click listener');
            const unbind = theme.bindCornerToggle(element);
            equal(theme.bindCornerToggle(element), unbind, 'Binding twice returns the same disposer');
            unbind(); const rebind = theme.bindCornerToggle(element); unbind();
            element.click(); equal(theme.corners, 'sharp', 'An old disposer cannot remove a new binding');
            rebind(); element.click(); equal(theme.corners, 'sharp');
            theme.bindCornerToggle(element); theme.destroy(); element.click(); equal(theme.corners, 'sharp');
            rejects(() => theme.toggleCorners()); rejects(() => theme.bindCornerToggle(element));
            rejects(() => cornerToggle({theme}));
            equal(node.dataset.corners, 'sharp', 'Controller teardown leaves the selected design in place');
        } finally { toggle.destroy(); theme.destroy(); node.remove(); }
    });

    await test('Sharp corners cover controls, menus, swatches, and indicators without crossing nested roots', () => {
        const node = theme_root(), nested = theme_root(node);
        const theme = createTheme({root: node}), inner = createTheme({root: nested});
        const sample = document.createElement('div'), inner_panel = document.createElement('div');
        sample.innerHTML = `<section class="wui-panel"><button class="wui-button" data-busy="true">Busy</button>
            <input class="wui-input"><select class="wui-input"><option>Choice</option></select>
            <div class="wui-checkbox"><input type="checkbox" checked></div><input class="wui-range" type="range">
            <div class="wui-status">Status</div><span class="wui-hint">Hint</span>
            <nav class="wui-nav"><a href="#">Link</a></nav><div class="wui-toolbar">Toolbar</div>
            <div class="wui-segmented"><button>Segment</button></div>
            <details class="wui-disclosure"><summary>Details</summary></details>
            <dialog class="wui-dialog" open>Dialog</dialog>
            <div class="wui-button-group"><button>First</button><button>Last</button></div>
            <div class="wui-menu"><button>Menu item</button></div>
            <span class="wui-badge">Badge</span><i class="wui-status-dot"></i><span class="wui-spinner"></span>
            </section>`;
        node.append(sample); inner_panel.className = 'wui-panel'; nested.append(inner_panel);
        const picker = themePicker({theme}).mount(sample), mode = themeToggle({theme}).mount(sample);
        const corners = cornerToggle({theme}).mount(sample);
        const nodes = [...sample.querySelectorAll('*')].filter(element => element.namespaceURI !== 'http://www.w3.org/2000/svg');
        const rounded = nodes.map(element => getComputedStyle(element).borderRadius);
        try {
            assert(rounded.some(radius => radius !== '0px'));
            for (const name of ['default', 'cloisonne', 'sorghum', 'gromwell', 'carbon']) {
                theme.setTheme(name);
                for (const mode of ['light', 'dark']) {
                    theme.setMode(mode); theme.setCorners('sharp');
                    for (const element of nodes)
                        equal(getComputedStyle(element).borderRadius, '0px', `${name} ${mode}: ${element.className || element.localName}`);
                    equal(getComputedStyle(sample.querySelector('[data-busy]'), '::before').borderRadius, '0px');
                    equal(getComputedStyle(sample.querySelector('.wui-range')).getPropertyValue('--ui-radius-round').trim(), '0px');
                    equal(getComputedStyle(inner_panel).borderRadius, '9px', 'Nested root keeps its rounded design');
                    theme.setCorners('rounded');
                    nodes.forEach((element, index) => equal(getComputedStyle(element).borderRadius, rounded[index], 'Restore every original radius'));
                }
            }
            inner.setCorners('sharp'); equal(getComputedStyle(inner_panel).borderRadius, '0px');
            equal(getComputedStyle(sample.firstElementChild).borderRadius, '9px', 'Nested changes do not affect the parent');
            node.dataset.corners = 'sharp'; equal(getComputedStyle(sample.firstElementChild).borderRadius, '0px', 'CSS-only selection works');
            nodes.forEach(element => assert(sample.contains(element), 'Changing corners keeps every control node'));
        } finally { picker.destroy(); mode.destroy(); corners.destroy(); theme.destroy(); inner.destroy(); node.remove(); }
    });

    await test('Styled checkboxes keep native checking, indeterminate states, and silent updates in either design', () => {
        const node = theme_root(), theme = createTheme({root: node, theme: 'carbon'});
        let changes = 0;
        const control = checkbox({label: 'Enable option', onChange: () => ++changes}).mount(node);
        const input = control.input;
        try {
            for (const corners of ['rounded', 'sharp']) {
                theme.setCorners(corners);
                equal(getComputedStyle(input).appearance, 'none');
                equal(getComputedStyle(input).borderRadius, corners === 'sharp' ? '0px' : '2px');
                input.focus(); input.click(); assert(input.checked); equal(document.activeElement, input);
                equal(getComputedStyle(input, '::before').transform, 'matrix(1, 0, 0, 1, 0, 0)');
                control.set({value: false}); equal(input.checked, false); equal(control.input, input);
                equal(getComputedStyle(input, '::before').transform, 'matrix(0, 0, 0, 0, 0, 0)');
                input.indeterminate = true;
                equal(getComputedStyle(input, '::before').clipPath, 'inset(40% 10%)');
                equal(getComputedStyle(input, '::before').transform, 'matrix(1, 0, 0, 1, 0, 0)');
                input.indeterminate = false; control.set({disabled: true}); input.click(); equal(input.checked, false);
                control.set({disabled: false});
            }
            equal(changes, 2, 'Only native user changes notify the consumer');
        } finally { control.destroy(); theme.destroy(); node.remove(); }
    });

    await test('Corner preferences restore separately, validate keys, and follow storage events without writeback', () => {
        const node = theme_root(), other = theme_root(), mode_key = key(), corners_key = key();
        let theme, second;
        const stored = (event_key, newValue, storageArea = localStorage) =>
            window.dispatchEvent(new StorageEvent('storage', {key: event_key, newValue, storageArea}));
        try {
            for (const options of [{defaultCorners: 'square'}, {cornersStorageKey: ''}, {cornersStorageKey: 42},
                {storageKey: mode_key, cornersStorageKey: mode_key}]) rejects(() => createTheme({root: node, ...options}));
            equal(node.dataset.corners, undefined, 'Invalid options must not change the root');
            localStorage.setItem(mode_key, 'dark'); localStorage.setItem(corners_key, 'sharp');
            theme = createTheme({root: node, storageKey: mode_key, cornersStorageKey: corners_key});
            equal(theme.mode, 'dark'); equal(theme.corners, 'sharp');
            theme.setCorners('rounded'); equal(localStorage.getItem(corners_key), 'rounded');
            equal(localStorage.getItem(mode_key), 'dark');
            theme.setCorners('sharp', {persist: false}); equal(localStorage.getItem(corners_key), 'rounded');
            theme.setMode('light'); equal(localStorage.getItem(corners_key), 'rounded');
            second = createTheme({root: other, cornersStorageKey: corners_key, defaultMode: 'dark', defaultCorners: 'sharp'});
            equal(second.corners, 'rounded'); equal(second.mode, 'dark');
            stored(corners_key, 'sharp', null); equal(second.corners, 'rounded');
            stored(`${corners_key}.other`, 'sharp'); equal(second.corners, 'rounded');
            stored(corners_key, 'sharp'); equal(second.corners, 'sharp'); equal(theme.corners, 'sharp');
            equal(localStorage.getItem(corners_key), 'rounded', 'Stored changes do not write back');
            stored(mode_key, 'dark'); equal(theme.mode, 'dark'); equal(second.corners, 'sharp');
            stored(corners_key, 'invalid'); equal(theme.corners, 'rounded'); equal(second.corners, 'sharp');
            second.setMode('light'); theme.setCorners('sharp', {persist: false});
            stored(null, null); equal(theme.corners, 'rounded'); equal(theme.mode, 'light');
            equal(second.corners, 'sharp'); equal(second.mode, 'light', 'A corners-only controller does not restore an unsaved mode');
            theme.setCorners('rounded'); equal(localStorage.getItem(corners_key), 'rounded', 'Same-value calls still save');
            second.destroy(); stored(corners_key, 'rounded'); equal(second.corners, 'sharp');
        } finally { theme?.destroy(); second?.destroy(); node.remove(); other.remove(); localStorage.removeItem(mode_key); localStorage.removeItem(corners_key); }
    });

    await test('Corner switches use the controller document and remain usable when storage is denied', async () => {
        for (const denied of ['access', 'methods']) {
            const node = await frame(), doc = node.contentDocument, view = node.contentWindow;
            let theme, toggle, accesses = 0;
            try {
                Object.defineProperty(view, 'localStorage', {get() {
                    ++accesses;
                    if (denied === 'access') throw Error('Denied');
                    return {getItem() { throw Error('Denied'); }, setItem() { throw Error('Denied'); }};
                }});
                theme = createTheme({root: doc.documentElement}); theme.toggleCorners(); equal(accesses, 0);
                theme.destroy();
                theme = createTheme({root: doc.documentElement, cornersStorageKey: key(), defaultCorners: 'sharp'});
                equal(theme.corners, 'sharp');
                rejects(() => cornerToggle({theme, document}));
                toggle = cornerToggle({theme}).mount(doc.body); equal(toggle.element.ownerDocument, doc);
                toggle.element.click(); equal(theme.corners, 'rounded'); equal(theme.mode, 'light');
                theme.destroy(); toggle.element.click(); equal(theme.corners, 'rounded');
                toggle.set({disabled: false}); assert(toggle.element.disabled);
            } finally { toggle?.destroy(); theme?.destroy(); node.remove(); }
        }
    });

    await test('The boot helper restores corners before paint and agrees with controller startup', async () => {
        const mode_key = key(), corners_key = key();
        const script = new URL('../src/theme_boot.js', import.meta.url).href;
        const stylesheet = new URL('../styles/ui.css', import.meta.url).href;
        try {
            sessionStorage.setItem(mode_key, 'dark');
            for (const [saved, fallback, expected] of [
                ['sharp', 'rounded', 'sharp'], ['rounded', 'sharp', 'rounded'],
                ['invalid', 'sharp', 'sharp'], [null, 'rounded', 'rounded'],
            ]) {
                if (saved === null) sessionStorage.removeItem(corners_key); else sessionStorage.setItem(corners_key, saved);
                const node = await frame(`<!doctype html><html class="wui" data-theme="carbon"><head>
                    <script>Object.defineProperty(window, 'localStorage', {get: () => parent.sessionStorage});<\/script>
                    <script src="${script}" data-storage-key="${mode_key}" data-corners-storage-key="${corners_key}"
                        data-default-corners="${fallback}"><\/script>
                    <script>window.bootSelection = {...document.documentElement.dataset};<\/script>
                    <link rel="stylesheet" href="${stylesheet}"></head><body><div class="wui-panel"></div></body></html>`);
                let theme;
                try {
                    const doc = node.contentDocument, panel = doc.querySelector('.wui-panel');
                    equal(node.contentWindow.bootSelection.corners, expected);
                    equal(node.contentWindow.bootSelection.mode, 'dark');
                    equal(node.contentWindow.getComputedStyle(panel).borderRadius, expected === 'sharp' ? '0px' : '9px');
                    theme = createTheme({root: doc.documentElement, theme: 'carbon', storageKey: mode_key,
                        cornersStorageKey: corners_key, defaultCorners: fallback});
                    equal(theme.corners, expected); equal(theme.mode, 'dark'); equal(theme.name, 'carbon');
                } finally { theme?.destroy(); node.remove(); }
            }
        } finally { sessionStorage.removeItem(mode_key); sessionStorage.removeItem(corners_key); }
    });
}
