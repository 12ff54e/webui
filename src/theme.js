import {component, create_element, on_cleanup} from './core.js';

const colors = {
    background: 'background', surface: 'surface', text: 'text', muted: 'muted',
    accent: 'accent', warning: 'warning', danger: 'danger', line: 'line',
    grid: 'grid', plot1: 'plot-1', plot2: 'plot-2', plot3: 'plot-3',
    plot4: 'plot-4', plot5: 'plot-5',
};

const valid_mode = value => value === 'light' || value === 'dark';
const valid_theme = value => value === 'default' || value === 'cloisonne' || value === 'sorghum' || value === 'gromwell';

// One controller owns selection for a root. Storage is opt-in and may be denied.
export function createTheme({root = globalThis.document?.documentElement, theme = 'default', storageKey = null, defaultMode = 'light'} = {}) {
    const view = root?.ownerDocument?.defaultView;
    if (!view) throw new Error('Create a theme for an element in a browser document.');
    if (!valid_theme(theme)) throw new TypeError('Choose default, cloisonne, sorghum, or gromwell as the theme.');
    if (!valid_mode(defaultMode)) throw new TypeError('Choose light or dark as the default mode.');
    if (storageKey !== null && (typeof storageKey !== 'string' || !storageKey))
        throw new TypeError('Use a nonempty storage key or null.');
    let storage, saved, destroyed = false;
    if (storageKey !== null) {
        try { storage = view.localStorage; saved = storage.getItem(storageKey); } catch {}
    }
    const bindings = new Map();
    const assert_live = () => { if (destroyed) throw new Error('Cannot update a destroyed theme controller.'); };
    const handle = {
        get name() { return theme; },
        get mode() { return valid_mode(root.dataset.mode) ? root.dataset.mode : defaultMode; },
        get destroyed() { return destroyed; },
        setTheme(value) {
            assert_live();
            if (!valid_theme(value)) throw new TypeError('Choose default, cloisonne, sorghum, or gromwell as the theme.');
            const mode = handle.mode;
            const changed = theme !== value || root.dataset.theme !== value || root.dataset.mode !== mode;
            theme = value;
            root.dataset.theme = value;
            root.dataset.mode = mode;
            if (changed) refreshTheme(root);
            return handle;
        },
        setMode(value, {persist = true} = {}) {
            assert_live();
            if (!valid_mode(value)) throw new TypeError('Choose light or dark as the mode.');
            const changed = root.dataset.mode !== value || root.dataset.theme !== theme;
            root.dataset.theme = theme;
            root.dataset.mode = value;
            if (persist && storageKey !== null) {
                try { storage?.setItem(storageKey, value); } catch {}
            }
            if (changed) refreshTheme(root);
            return handle;
        },
        toggleMode() { return handle.setMode(handle.mode === 'dark' ? 'light' : 'dark'); },
        bindToggle(element) {
            assert_live();
            if (element?.localName !== 'button') throw new TypeError('Bind a native button as the theme toggle.');
            if (bindings.has(element)) return bindings.get(element);
            const update = () => element.setAttribute('aria-pressed', String(handle.mode === 'dark'));
            const click = event => {
                event.preventDefault();
                if (!element.disabled) handle.toggleMode();
            };
            let disposed = false;
            const dispose = () => {
                if (disposed) return;
                disposed = true;
                element.removeEventListener('click', click);
                root.removeEventListener('webui-theme-change', update);
                bindings.delete(element);
            };
            element.addEventListener('click', click);
            root.addEventListener('webui-theme-change', update);
            bindings.set(element, dispose);
            update();
            return dispose;
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            view.removeEventListener('storage', stored);
            for (const dispose of [...bindings.values()]) dispose();
        },
    };
    const stored = event => {
        if (!storage || event.storageArea !== storage || (event.key !== storageKey && event.key !== null)) return;
        handle.setMode(valid_mode(event.newValue) ? event.newValue : defaultMode, {persist: false});
    };
    if (storageKey !== null) view.addEventListener('storage', stored);
    handle.setMode(valid_mode(saved) ? saved : defaultMode, {persist: false});
    return handle;
}

// A shared mode switch, including its icon, accessible label, and pressed state.
export function themeToggle(options = {}) {
    const {theme} = options;
    if (!theme || typeof theme.bindToggle !== 'function') throw new TypeError('Pass a theme controller.');
    const element = create_element('button', 'wui-button wui-theme-toggle', options);
    element.type = 'button';
    const icon = element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    const circle = element.ownerDocument.createElementNS(icon.namespaceURI, 'circle');
    for (const [name, value] of Object.entries({cx: 12, cy: 12, r: 8, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5}))
        circle.setAttribute(name, value);
    const half = element.ownerDocument.createElementNS(icon.namespaceURI, 'path');
    half.setAttribute('d', 'M12 4a8 8 0 0 1 0 16Z');
    half.setAttribute('fill', 'currentColor');
    icon.append(circle, half); element.append(icon);
    const state = {label: 'Dark mode', disabled: false, ...options};
    const handle = component(element, patch => {
        const label = 'label' in patch ? patch.label : state.label;
        if (typeof label !== 'string' || !label.trim()) throw new TypeError('Use a nonempty mode-switch label.');
        Object.assign(state, patch);
        element.setAttribute('aria-label', label);
        element.title = label;
        element.disabled = Boolean(state.disabled);
    }).set(state);
    on_cleanup(handle, theme.bindToggle(element));
    return handle;
}

// CSS is the only source of palette values, including for canvas consumers.
export function palette(element) {
    const view = element.ownerDocument.defaultView;
    if (!view) throw new Error('Read a palette from an element in a browser document.');
    const style = view.getComputedStyle(element);
    const result = {};
    for (const [key, token] of Object.entries(colors)) {
        const value = style.getPropertyValue(`--ui-${token}`).trim();
        if (!/^#[\da-f]{6}$/i.test(value))
            throw new Error(`--ui-${token} must be a six-digit hex color; load ui.css inside a .wui root.`);
        result[key] = value;
    }
    result.font = style.getPropertyValue('--ui-font').trim();
    result.mono = style.getPropertyValue('--ui-mono').trim();
    return Object.freeze(result);
}

// Notify renderers after theme selection or an application token override.
// Listeners remain attached when a whole root moves to another document.
export function refreshTheme(root) {
    const Event = root.ownerDocument.defaultView.Event;
    root.dispatchEvent(new Event('webui-theme-change'));
}

export function onThemeChange(root, callback) {
    const update = () => callback(palette(root));
    update();
    root.addEventListener('webui-theme-change', update);
    return () => root.removeEventListener('webui-theme-change', update);
}
