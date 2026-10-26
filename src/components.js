import {append_owned, component, create_element, listen, unique_id} from './core.js';

function choice(value, values) {
    if (!values.includes(value)) throw new TypeError(`Expected one of: ${values.join(', ')}.`);
    return value;
}

export function button(options = {}) {
    const element = create_element('button', 'wui-button', options);
    element.type = 'button';
    const state = {label: '', variant: 'secondary', disabled: false, ...options};
    const handle = component(element, patch => {
        choice('variant' in patch ? patch.variant : state.variant, ['primary', 'secondary', 'quiet', 'danger']);
        Object.assign(state, patch);
        element.textContent = state.label;
        element.dataset.variant = choice(state.variant, ['primary', 'secondary', 'quiet', 'danger']);
        element.disabled = Boolean(state.disabled);
    });
    listen(handle, element, 'click', event => {
        if (!element.disabled) state.onClick?.(event);
    });
    return handle.set(state);
}

export function status(options = {}) {
    const element = create_element('p', 'wui-status', options);
    element.setAttribute('role', 'status');
    element.setAttribute('aria-atomic', 'true');
    const state = {text: '', tone: 'neutral', ...options};
    return component(element, patch => {
        choice('tone' in patch ? patch.tone : state.tone, ['neutral', 'success', 'warning', 'danger']);
        Object.assign(state, patch);
        element.textContent = state.text;
        element.dataset.tone = choice(state.tone, ['neutral', 'success', 'warning', 'danger']);
    }).set(state);
}

export function panel(options = {}) {
    const element = create_element('section', 'wui-panel', options);
    const inside = {document: element.ownerDocument};
    const header = create_element('div', 'wui-panel-head', inside);
    const title = create_element('h2', 'wui-panel-title', inside);
    title.id = unique_id();
    const description = create_element('p', 'wui-panel-description', inside);
    const body = create_element('div', 'wui-panel-body', inside);
    header.append(title, description);
    element.append(header, body);
    const state = {title: '', description: '', ...options};
    const handle = component(element, patch => {
        Object.assign(state, patch);
        title.textContent = state.title;
        description.textContent = state.description;
        title.hidden = !state.title;
        description.hidden = !state.description;
        header.hidden = !state.title && !state.description;
        if (state.title) element.setAttribute('aria-labelledby', title.id);
        else element.removeAttribute('aria-labelledby');
    });
    handle.append = (...children) => append_owned(handle, body, children);
    handle.append(...(options.children ?? []));
    return handle.set(state);
}

function layout(kind, options) {
    const element = create_element('div', `wui-${kind}`, options);
    const handle = component(element, patch => {
        if ('gap' in patch) element.dataset.gap = choice(patch.gap, ['small', 'medium', 'large']);
    });
    handle.append = (...children) => append_owned(handle, element, children);
    handle.append(...(options.children ?? []));
    return handle.set({gap: 'medium', ...options});
}

export function stack(options = {}) { return layout('stack', options); }
export function row(options = {}) { return layout('row', options); }

// Panels are already present, so arrow keys can activate tabs without waiting.
export function tabs(options = {}) {
    const items = options.items ?? [];
    if (!items.length || items.some(item => typeof item.id !== 'string' || !item.id)
        || new Set(items.map(item => item.id)).size !== items.length)
        throw new TypeError('Tabs require nonempty, unique string IDs.');
    const enabled = items.filter(item => !item.disabled);
    if (!enabled.length) throw new TypeError('Tabs require at least one enabled item.');
    const element = create_element('div', 'wui-tabs', options);
    const inside = {document: element.ownerDocument};
    const list = create_element('div', 'wui-tab-list', inside);
    list.setAttribute('role', 'tablist');
    element.append(list);
    const entries = new Map();
    const state = {value: enabled[0].id, label: 'Sections', ...options};
    const handle = component(element, patch => {
        const next = 'value' in patch ? patch.value : state.value;
        if (!enabled.some(item => item.id === next)) throw new RangeError('Unknown or disabled tab.');
        const previous = entries.get(state.value);
        const focused = element.ownerDocument.activeElement;
        const restore_focus = next !== state.value && (previous?.panel.contains(focused) || previous?.button === focused);
        Object.assign(state, patch);
        list.setAttribute('aria-label', state.label);
        for (const [id, entry] of entries) {
            const active = id === state.value;
            entry.button.setAttribute('aria-selected', String(active));
            entry.button.tabIndex = active ? 0 : -1;
            entry.panel.hidden = !active;
        }
        if (restore_focus) entries.get(next).button.focus();
    });
    Object.defineProperty(handle, 'value', {get: () => state.value});
    function activate(id, focus = false, event) {
        const changed = id !== state.value;
        handle.set({value: id});
        if (focus) entries.get(id).button.focus();
        if (changed) state.onChange?.(id, event);
    }
    for (const item of items) {
        const tab = create_element('button', 'wui-tab', inside);
        const content = create_element('div', 'wui-tab-panel', inside);
        tab.type = 'button';
        tab.id = unique_id();
        tab.textContent = item.label;
        tab.disabled = Boolean(item.disabled);
        tab.setAttribute('role', 'tab');
        content.id = unique_id();
        content.setAttribute('role', 'tabpanel');
        content.setAttribute('aria-labelledby', tab.id);
        content.tabIndex = 0;
        tab.setAttribute('aria-controls', content.id);
        list.append(tab);
        element.append(content);
        entries.set(item.id, {button: tab, panel: content});
        append_owned(handle, content, [item.content]);
        listen(handle, tab, 'click', event => {
            if (!tab.disabled) activate(item.id, false, event);
        });
        listen(handle, tab, 'keydown', event => {
            if (event.altKey || event.ctrlKey || event.metaKey || tab.disabled) return;
            const index = enabled.findIndex(value => value.id === item.id);
            const next = {ArrowRight: (index + 1) % enabled.length,
                ArrowLeft: (index + enabled.length - 1) % enabled.length,
                Home: 0, End: enabled.length - 1}[event.key];
            if (next === undefined) return;
            event.preventDefault();
            activate(enabled[next].id, true, event);
        });
    }
    return handle.set(state);
}
