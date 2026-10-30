import {component, create_element, on_cleanup} from './core.js';
import {bindMenu} from './controls.js';

const colors = {
    background: 'background', surface: 'surface', text: 'text', muted: 'muted',
    accent: 'accent', warning: 'warning', danger: 'danger', line: 'line',
    grid: 'grid', plot1: 'plot-1', plot2: 'plot-2', plot3: 'plot-3',
    plot4: 'plot-4', plot5: 'plot-5',
};

const valid_mode = value => value === 'light' || value === 'dark';
const valid_corners = value => value === 'rounded' || value === 'sharp';
const theme_names = Object.freeze({default: 'Celadon', cloisonne: 'Cloisonné', sorghum: 'Sorghum', gromwell: 'Gromwell', carbon: 'Carbon'});
const valid_theme = value => typeof value === 'string' && Object.hasOwn(theme_names, value);
const picker_bindings = new WeakMap();

// One controller owns selection for a root. Storage is opt-in and may be denied.
export function createTheme({root = globalThis.document?.documentElement, theme = 'default', storageKey = null,
    defaultMode = 'light', cornersStorageKey = null, defaultCorners = 'rounded'} = {}) {
    const view = root?.ownerDocument?.defaultView;
    if (!view) throw new Error('Create a theme for an element in a browser document.');
    if (!valid_theme(theme)) throw new TypeError('Choose default, cloisonne, sorghum, gromwell, or carbon as the theme.');
    if (!valid_mode(defaultMode)) throw new TypeError('Choose light or dark as the default mode.');
    if (!valid_corners(defaultCorners)) throw new TypeError('Choose rounded or sharp as the default corners.');
    for (const key of [storageKey, cornersStorageKey])
        if (key !== null && (typeof key !== 'string' || !key))
            throw new TypeError('Use a nonempty storage key or null.');
    if (storageKey !== null && storageKey === cornersStorageKey)
        throw new TypeError('Use separate storage keys for mode and corners.');
    let storage, destroyed = false;
    if (storageKey !== null || cornersStorageKey !== null) {
        try { storage = view.localStorage; } catch {}
    }
    const read = key => { if (key !== null) { try { return storage?.getItem(key); } catch {} } };
    const save = (key, value) => { if (key !== null) { try { storage?.setItem(key, value); } catch {} } };
    const saved = read(storageKey), saved_corners = read(cornersStorageKey);
    const bindings = new Map(), corner_bindings = new Map(), pickers = new Set();
    const assert_live = () => { if (destroyed) throw new Error('Cannot update a destroyed theme controller.'); };
    const bind_toggle = (element, collection, selected, toggle) => {
        assert_live();
        if (element?.localName !== 'button') throw new TypeError('Bind a native button as the appearance toggle.');
        if (collection.has(element)) return collection.get(element);
        const update = () => element.setAttribute('aria-pressed', String(selected()));
        const click = event => {
            event.preventDefault();
            if (!element.matches(':disabled') && !element.closest('[hidden]')) toggle();
        };
        let disposed = false;
        const dispose = () => {
            if (disposed) return;
            disposed = true;
            element.removeEventListener('click', click);
            root.removeEventListener('webui-theme-change', update);
            collection.delete(element);
        };
        element.addEventListener('click', click);
        root.addEventListener('webui-theme-change', update);
        collection.set(element, dispose);
        update();
        return dispose;
    };
    const handle = {
        get root() { return root; },
        get name() { return theme; },
        get mode() { return valid_mode(root.dataset.mode) ? root.dataset.mode : defaultMode; },
        get corners() { return valid_corners(root.dataset.corners) ? root.dataset.corners : defaultCorners; },
        get destroyed() { return destroyed; },
        setTheme(value) {
            assert_live();
            if (!valid_theme(value)) throw new TypeError('Choose default, cloisonne, sorghum, gromwell, or carbon as the theme.');
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
            if (persist) save(storageKey, value);
            if (changed) refreshTheme(root);
            return handle;
        },
        toggleMode() { return handle.setMode(handle.mode === 'dark' ? 'light' : 'dark'); },
        bindToggle(element) {
            return bind_toggle(element, bindings, () => handle.mode === 'dark', () => handle.toggleMode());
        },
        setCorners(value, {persist = true} = {}) {
            assert_live();
            if (!valid_corners(value)) throw new TypeError('Choose rounded or sharp as the corners.');
            const changed = root.dataset.corners !== value;
            root.dataset.corners = value;
            if (persist) save(cornersStorageKey, value);
            if (changed) refreshTheme(root);
            return handle;
        },
        toggleCorners() { return handle.setCorners(handle.corners === 'sharp' ? 'rounded' : 'sharp'); },
        bindCornerToggle(element) {
            return bind_toggle(element, corner_bindings, () => handle.corners === 'sharp', () => handle.toggleCorners());
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            view.removeEventListener('storage', stored);
            for (const dispose of [...bindings.values()]) dispose();
            for (const dispose of [...corner_bindings.values()]) dispose();
            for (const dispose of [...pickers]) dispose();
            pickers.clear();
        },
    };
    const stored = event => {
        if (!storage || event.storageArea !== storage) return;
        if (storageKey !== null && (event.key === storageKey || event.key === null))
            handle.setMode(valid_mode(event.newValue) ? event.newValue : defaultMode, {persist: false});
        if (!destroyed && cornersStorageKey !== null && (event.key === cornersStorageKey || event.key === null))
            handle.setCorners(valid_corners(event.newValue) ? event.newValue : defaultCorners, {persist: false});
    };
    if (storageKey !== null || cornersStorageKey !== null) view.addEventListener('storage', stored);
    root.dataset.corners = valid_corners(saved_corners) ? saved_corners : defaultCorners;
    handle.setMode(valid_mode(saved) ? saved : defaultMode, {persist: false});
    picker_bindings.set(handle, pickers);
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

// The corner choice is independent of both palette and light/dark mode.
export function cornerToggle(options = {}) {
    const {theme} = options;
    if (!theme || !picker_bindings.has(theme) || theme.destroyed) throw new TypeError('Pass a live theme controller.');
    const doc = options.document ?? theme.root.ownerDocument;
    if (doc !== theme.root.ownerDocument) throw new TypeError('Create the corner toggle in its controller\'s document.');
    const element = create_element('button', 'wui-button wui-corner-toggle', {...options, document: doc});
    element.type = 'button';
    const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    const path = doc.createElementNS(icon.namespaceURI, 'path');
    for (const [key, value] of Object.entries({d: 'M12 4h8v8M4 12v2a6 6 0 0 0 6 6h2', fill: 'none',
        stroke: 'currentColor', 'stroke-width': 1.5})) path.setAttribute(key, value);
    icon.append(path); element.append(icon);
    const state = {label: 'Sharp corners', disabled: false, ...options};
    const handle = component(element, patch => {
        const label = 'label' in patch ? patch.label : state.label;
        if (typeof label !== 'string' || !label.trim()) throw new TypeError('Use a nonempty corner-switch label.');
        Object.assign(state, patch);
        element.setAttribute('aria-label', label);
        element.title = label;
        element.disabled = Boolean(state.disabled || theme.destroyed);
    }).set(state);
    on_cleanup(handle, theme.bindCornerToggle(element));
    return handle;
}

// A shared palette menu. Swatch colors come from independent CSS theme roots.
export function themePicker(options = {}) {
    const {theme} = options;
    if (!theme || !picker_bindings.has(theme) || theme.destroyed) throw new TypeError('Pass a live theme controller.');
    const root = theme.root, doc = options.document ?? root.ownerDocument;
    if (doc !== root.ownerDocument) throw new TypeError('Create the theme picker in its controller\'s document.');
    const state = {label: 'Color theme', disabled: false, hidden: false, onChange: null, ...options};
    const validate = patch => {
        const label = 'label' in patch ? patch.label : state.label;
        const onChange = 'onChange' in patch ? patch.onChange : state.onChange;
        if (typeof label !== 'string' || !label.trim()) throw new TypeError('Use a nonempty theme-picker label.');
        if (onChange !== null && onChange !== undefined && typeof onChange !== 'function')
            throw new TypeError('Use a function or null for onChange.');
    };
    validate(state);
    const element = create_element('div', 'wui-theme-picker', {document: doc});
    const trigger = create_element('button', 'wui-button wui-theme-picker-trigger', {document: doc, id: options.id});
    trigger.type = 'button';
    const svg = (name, attributes) => {
        const node = doc.createElementNS('http://www.w3.org/2000/svg', name);
        for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
        return node;
    };
    const icon = svg('svg', {viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false'});
    icon.append(svg('path', {
        d: 'M12 3a9 9 0 0 0 0 18h1.2a2.4 2.4 0 0 0 2.1-3.6.9.9 0 0 1 .8-1.4h1.4A3.5 3.5 0 0 0 21 12.5 9.5 9.5 0 0 0 12 3Z',
        fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
    for (const [cx, cy] of [[7.5, 10.5], [11, 7], [15.5, 7.8], [7.5, 15]])
        icon.append(svg('circle', {cx, cy, r: 1, fill: 'currentColor'}));
    trigger.append(icon);
    const menu = create_element('div', 'wui-theme-picker-menu', {document: doc});
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    const swatches = [], labels = [];
    const buttons = Object.entries(theme_names).map(([value, name]) => {
        const button = create_element('button', 'wui-theme-choice', {document: doc});
        button.type = 'button'; button.value = value; button.tabIndex = -1;
        button.setAttribute('role', 'menuitemradio'); button.setAttribute('aria-label', name);
        const swatch = create_element('span', 'wui wui-theme-swatch', {document: doc});
        swatch.dataset.theme = value; swatch.setAttribute('aria-hidden', 'true');
        const label = create_element('span', 'wui-theme-choice-label', {document: doc});
        label.textContent = name; label.setAttribute('aria-hidden', 'true');
        swatches.push(swatch); labels.push(label);
        button.append(swatch, label); menu.append(button);
        return button;
    });
    element.append(trigger, menu);
    element.dataset.labelSide = 'left';
    let binding, disposed = false;
    const listeners = [];
    const on = (target, name, callback, event_options) => {
        target.addEventListener(name, callback, event_options);
        listeners.push(() => target.removeEventListener(name, callback, event_options));
    };
    const synchronize = () => {
        for (let index = 0; index < buttons.length; ++index) {
            buttons[index].setAttribute('aria-checked', String(buttons[index].value === theme.name));
            swatches[index].dataset.mode = theme.mode;
        }
    };
    const place_labels = () => {
        if (disposed || !binding.isOpen || !element.isConnected || !menu.getClientRects().length) return;
        const width = doc.defaultView.innerWidth || doc.documentElement.clientWidth;
        if (!width) return;
        const anchor = element.getBoundingClientRect(), panel = menu.getBoundingClientRect();
        const inset = 8, gap = 12;
        const menu_left = Math.max(inset, Math.min(anchor.right - panel.width, width - panel.width - inset));
        menu.style.left = `${menu_left - anchor.left}px`;
        menu.style.right = 'auto';
        element.style.removeProperty('--wui-theme-label-max-width');
        const bounds = menu.getBoundingClientRect();
        const label_width = Math.max(...labels.map(label => label.getBoundingClientRect().width));
        const left = Math.max(0, bounds.left - inset - gap), right = Math.max(0, width - bounds.right - inset - gap);
        const side = left >= label_width ? 'left' : right >= label_width ? 'right' : left >= right ? 'left' : 'right';
        element.dataset.labelSide = side;
        element.style.setProperty('--wui-theme-label-max-width', `${Math.max(1, side === 'left' ? left : right)}px`);
    };
    const blur_unavailable = () => { if (element.contains(doc.activeElement)) doc.activeElement.blur(); };
    const handle = component(element, patch => {
        validate(patch);
        Object.assign(state, patch);
        const unavailable = Boolean(state.disabled || state.hidden || theme.destroyed);
        trigger.setAttribute('aria-label', state.label);
        menu.setAttribute('aria-label', state.label);
        trigger.disabled = unavailable;
        for (const button of buttons) button.disabled = unavailable;
        if (unavailable) {
            if (!disposed) binding.close();
            blur_unavailable();
        }
    });
    binding = bindMenu({trigger, element: menu, container: element});
    const live = () => { if (handle.destroyed) throw new Error('Cannot update a destroyed theme picker.'); };
    handle.open = () => { live(); if (!disposed) { binding.open(); place_labels(); } return handle; };
    handle.close = (restoreFocus = true) => { live(); if (!disposed) binding.close(restoreFocus); return handle; };
    Object.defineProperties(handle, {
        trigger: {value: trigger}, menu: {value: menu}, buttons: {value: Object.freeze(buttons)},
        isOpen: {get: () => !disposed && binding.isOpen},
    });
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        binding.destroy();
        blur_unavailable();
        trigger.disabled = true;
        for (const button of buttons) button.disabled = true;
        for (const remove of listeners) remove();
        listeners.length = 0;
        picker_bindings.get(theme).delete(dispose);
    };
    on_cleanup(handle, dispose);
    picker_bindings.get(theme).add(dispose);
    on(root, 'webui-theme-change', synchronize);
    on(trigger, 'click', place_labels);
    on(trigger, 'keydown', place_labels);
    on(doc.defaultView, 'resize', place_labels);
    for (const button of buttons) on(button, 'click', event => {
        if (disposed || theme.destroyed || !binding.isOpen || trigger.matches(':disabled') || button.matches(':disabled') ||
            button.closest('[hidden]')) return;
        const changed = theme.name !== button.value;
        theme.setTheme(button.value);
        if (disposed || handle.destroyed || theme.destroyed) return;
        binding.close(true);
        if (changed && !disposed && !handle.destroyed && !theme.destroyed) state.onChange?.(button.value, event);
    });
    synchronize();
    return handle.set(state);
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
