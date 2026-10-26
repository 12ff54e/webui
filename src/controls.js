import {append_owned, component, create_element, listen, on_cleanup, unique_id} from './core.js';
import {status} from './components.js';

function definitions(items) {
    if (!Array.isArray(items) || !items.length) throw new TypeError('Provide at least one choice.');
    const values = new Set();
    return items.map(item => {
        if (!item || !('value' in item)) throw new TypeError('Each choice needs a value.');
        const value = String(item.value);
        if (!value || values.has(value)) throw new TypeError('Use unique, nonempty choice values.');
        values.add(value);
        return {value, label: String(item.label ?? value), disabled: Boolean(item.disabled)};
    });
}

function disabled(element) {
    return element.disabled || element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true';
}

export function segmentedControl(options = {}) {
    const items = definitions(options.items);
    const first = items.find(item => !item.disabled);
    if (!first) throw new TypeError('Provide an enabled choice.');
    const element = create_element('div', 'wui-segmented', options);
    element.setAttribute('role', 'group');
    const state = {value: first.value, disabled: false, label: 'Options', ...options};
    const controlled = Boolean(options.controlled);
    const buttons = items.map(item => {
        const button = create_element('button', 'wui-segmented-item', {document: element.ownerDocument});
        button.type = 'button';
        button.value = item.value;
        button.textContent = item.label;
        element.append(button);
        return button;
    });
    const handle = component(element, patch => {
        const value = 'value' in patch ? String(patch.value) : String(state.value);
        if (!items.some(item => item.value === value)) throw new RangeError('Unknown choice.');
        Object.assign(state, patch, {value});
        element.setAttribute('aria-label', state.label);
        for (const [index, button] of buttons.entries()) {
            button.disabled = Boolean(state.disabled || items[index].disabled);
            button.setAttribute('aria-pressed', String(button.value === value));
        }
        const focus = buttons.find(button => button.value === value && !disabled(button))
            ?? buttons.find(button => !disabled(button));
        for (const button of buttons) button.tabIndex = button === focus ? 0 : -1;
    });
    function request(button, event) {
        if (disabled(button) || button.value === state.value) return;
        if (!controlled) handle.set({value: button.value});
        state.onChange?.(button.value, event);
    }
    for (const button of buttons) {
        listen(handle, button, 'click', event => request(button, event));
        listen(handle, button, 'keydown', event => {
            if (event.altKey || event.ctrlKey || event.metaKey || disabled(button)) return;
            const enabled = buttons.filter(button => !disabled(button));
            const index = enabled.indexOf(button);
            const next = {ArrowRight: (index + 1) % enabled.length,
                ArrowLeft: (index + enabled.length - 1) % enabled.length,
                Home: 0, End: enabled.length - 1}[event.key];
            if (next === undefined) return;
            event.preventDefault();
            enabled[next].focus();
            request(enabled[next], event);
        });
    }
    Object.defineProperties(handle, {
        value: {get: () => state.value},
        buttons: {value: Object.freeze(buttons)},
    });
    return handle.set(state);
}

export function rangeField(options = {}) {
    const element = create_element('div', 'wui-field', {document: options.document});
    const inside = {document: element.ownerDocument};
    const input = create_element('input', 'wui-range', {...inside, id: options.id ?? unique_id()});
    const label = create_element('label', 'wui-field-label', inside);
    label.htmlFor = input.id;
    const caption = element.ownerDocument.createElement('span');
    const unit = create_element('span', 'wui-field-unit', inside);
    const output = create_element('output', 'wui-range-output', inside);
    output.htmlFor = input.id;
    label.append(caption, unit, output);
    const help = create_element('p', 'wui-field-help', {...inside, id: unique_id()});
    element.append(label, input, help);
    const state = {min: 0, max: 100, step: 1, label: '', unit: '', help: '', disabled: false, ...options};
    let initialized = false;
    const display = () => { output.textContent = input.value; };
    const handle = component(element, patch => {
        const next = {...state, ...patch};
        for (const name of ['min', 'max']) {
            if (typeof next[name] !== 'number' || !Number.isFinite(next[name]))
                throw new TypeError('Range bounds must be finite numbers.');
        }
        if (next.min > next.max) throw new RangeError('The range minimum must not exceed its maximum.');
        if (next.step !== 'any' && (typeof next.step !== 'number' || !Number.isFinite(next.step) || next.step <= 0))
            throw new TypeError('Use a positive range step or any.');
        if ('value' in patch && (typeof patch.value !== 'number' || !Number.isFinite(patch.value)))
            throw new TypeError('The range value must be a finite number.');
        const previous = initialized ? input.value : null;
        Object.assign(state, patch);
        input.min = String(state.min); input.max = String(state.max); input.step = String(state.step);
        // Let the browser choose its initial midpoint from the final bounds.
        if (!initialized) { input.type = 'range'; initialized = true; }
        if ('value' in patch) input.value = String(patch.value);
        else if (previous !== null) input.value = previous;
        input.disabled = Boolean(state.disabled);
        if ('name' in patch) input.name = state.name ?? '';
        caption.textContent = state.label;
        unit.textContent = state.unit ? ` · ${state.unit}` : '';
        unit.hidden = !state.unit;
        help.textContent = state.help; help.hidden = !state.help;
        if (state.help) input.setAttribute('aria-describedby', help.id);
        else input.removeAttribute('aria-describedby');
        display();
    });
    for (const [name, callback] of [['input', 'onInput'], ['change', 'onChange']]) {
        listen(handle, input, name, event => {
            if (disabled(input) || !input.isConnected || element.hidden) return;
            display();
            state[callback]?.(input.valueAsNumber, event);
        });
    }
    Object.defineProperties(handle, {
        input: {value: input}, output: {value: output}, value: {get: () => input.valueAsNumber},
    });
    return handle.set(state);
}

export function disclosure(options = {}) {
    const element = create_element('details', 'wui-disclosure', options);
    const inside = {document: element.ownerDocument};
    const summary = create_element('summary', 'wui-disclosure-summary', inside);
    const body = create_element('div', 'wui-disclosure-body', inside);
    element.append(summary, body);
    const state = {label: '', open: false, ...options};
    let silent_open;
    const handle = component(element, patch => {
        Object.assign(state, patch);
        summary.textContent = state.label;
        if ('open' in patch && element.open !== Boolean(state.open)) {
            silent_open = Boolean(state.open);
            element.open = silent_open;
        }
    });
    listen(handle, element, 'toggle', event => {
        const silent = silent_open === element.open;
        silent_open = undefined;
        if (!silent) state.onToggle?.(element.open, event);
    });
    handle.append = (...children) => append_owned(handle, body, children);
    Object.defineProperties(handle, {open: {get: () => element.open}, summary: {value: summary}});
    handle.append(...(options.children ?? []));
    return handle.set(state);
}

export function dialog(options = {}) {
    const element = create_element('dialog', 'wui-dialog', options);
    const inside = {document: element.ownerDocument};
    const title = create_element('h2', 'wui-dialog-title', {...inside, id: unique_id()});
    const body = create_element('div', 'wui-dialog-body', inside);
    element.append(title, body);
    const state = {title: '', ...options};
    let silent_closes = 0;
    const handle = component(element, patch => {
        Object.assign(state, patch);
        title.textContent = state.title;
        title.hidden = !state.title;
        if (state.title) element.setAttribute('aria-labelledby', title.id);
        else element.removeAttribute('aria-labelledby');
        if (patch.hidden && element.open) { ++silent_closes; element.close(); }
    });
    function live() { if (handle.destroyed) throw new Error('Cannot update a destroyed dialog.'); }
    handle.showModal = () => {
        live();
        if (element.hidden) throw new Error('Unhide the dialog before opening it.');
        element.showModal();
        return handle;
    };
    handle.close = value => { live(); value === undefined ? element.close() : element.close(String(value)); return handle; };
    handle.append = (...children) => append_owned(handle, body, children);
    Object.defineProperty(handle, 'open', {get: () => element.open});
    listen(handle, element, 'close', event => {
        if (silent_closes) { --silent_closes; return; }
        state.onClose?.(element.returnValue, event);
    });
    on_cleanup(handle, () => { if (element.open) element.close(); });
    handle.append(...(options.children ?? []));
    return handle.set(state);
}

// Bind the interaction of an existing native menu without taking its DOM ownership.
export function bindMenu({trigger, element, container = element?.parentElement} = {}) {
    if (!trigger || !element || trigger.ownerDocument !== element.ownerDocument)
        throw new TypeError('Use a trigger and menu in the same document.');
    const doc = element.ownerDocument;
    if (!element.id) element.id = unique_id();
    element.classList.add('wui-menu'); trigger.classList.add('wui-menu-trigger');
    if (!element.getAttribute('role')) element.setAttribute('role', 'menu');
    trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-controls', element.id);
    trigger.setAttribute('aria-expanded', String(!element.hidden));
    const disposers = [];
    let destroyed = false;
    const live = () => { if (destroyed) throw new Error('Cannot update a destroyed menu binding.'); };
    const available = () => !disabled(trigger) && !trigger.closest('[hidden]') && !container?.hidden;
    const items = () => [...element.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]')]
        .filter(item => !disabled(item) && !item.closest('[hidden]'));
    const handle = {
        element, trigger,
        get destroyed() { return destroyed; },
        get isOpen() { return !element.hidden; },
        open() {
            live();
            if (!available()) return handle;
            element.hidden = false; trigger.setAttribute('aria-expanded', 'true');
            const choices = items();
            (choices.find(item => item.getAttribute('aria-checked') === 'true') ?? choices[0])?.focus();
            return handle;
        },
        close(restoreFocus = false) {
            live();
            element.hidden = true; trigger.setAttribute('aria-expanded', 'false');
            if (restoreFocus && available()) trigger.focus({preventScroll: true});
            return handle;
        },
        destroy() {
            if (destroyed) return;
            handle.close();
            destroyed = true;
            for (const dispose of disposers) dispose();
            disposers.length = 0;
        },
    };
    function on(target, name, callback) {
        target.addEventListener(name, callback);
        disposers.push(() => target.removeEventListener(name, callback));
    }
    on(trigger, 'click', () => { if (available()) handle.isOpen ? handle.close(true) : handle.open(); });
    on(trigger, 'keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !available()) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); handle.open(); }
        if (event.key === 'Escape') { event.preventDefault(); handle.close(true); }
    });
    on(element, 'keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || element.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); handle.close(true); return; }
        if (event.key === 'Tab') { handle.close(true); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const choices = items();
        if (!choices.length) return;
        const current = choices.indexOf(doc.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
            : current < 0 ? (event.key === 'ArrowDown' ? 0 : choices.length - 1)
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
        choices[next].focus();
    });
    for (const name of ['pointerdown', 'focusin']) on(doc, name, event => {
        const inside = container ? container.contains(event.target)
            : trigger.contains(event.target) || element.contains(event.target);
        if (!inside && !element.hidden) handle.close();
    });
    return handle;
}

export function menu(options = {}) {
    if (options.element) throw new TypeError('Use bindMenu to bind an existing menu.');
    const items = definitions(options.items);
    const state = {value: items.find(item => !item.disabled)?.value ?? items[0].value, ...options};
    state.value = String(state.value);
    if (!items.some(item => item.value === state.value)) throw new RangeError('Unknown menu value.');
    const element = create_element('div', 'wui-menu', options);
    element.hidden = true; element.setAttribute('role', 'menu');
    element.setAttribute('aria-label', options.label ?? 'Options');
    const buttons = items.map(item => {
        const button = create_element('button', 'wui-menu-item', {document: element.ownerDocument});
        button.type = 'button'; button.value = item.value; button.textContent = item.label;
        button.disabled = item.disabled; button.tabIndex = -1; button.setAttribute('role', 'menuitemradio');
        element.append(button); return button;
    });
    const handle = component(element, patch => {
        const value = 'value' in patch ? String(patch.value) : String(state.value);
        if (!items.some(item => item.value === value)) throw new RangeError('Unknown menu value.');
        Object.assign(state, patch, {value});
        for (const button of buttons) button.setAttribute('aria-checked', String(button.value === value));
        if ('label' in patch) element.setAttribute('aria-label', state.label);
        if ('hidden' in patch) options.trigger.setAttribute('aria-expanded', String(!patch.hidden));
    });
    const binding = bindMenu({trigger: options.trigger, element, container: options.container ?? null});
    on_cleanup(handle, () => binding.destroy());
    handle.open = () => { binding.open(); return handle; };
    handle.close = restoreFocus => { binding.close(restoreFocus); return handle; };
    Object.defineProperties(handle, {
        value: {get: () => state.value}, isOpen: {get: () => binding.isOpen}, buttons: {value: Object.freeze(buttons)},
    });
    for (const button of buttons) listen(handle, button, 'click', event => {
        if (disabled(button)) return;
        handle.set({value: button.value}); handle.close(true); state.onSelect?.(button.value, event);
    });
    return handle.set(state);
}

export function toolbar(options = {}) {
    const element = create_element('div', 'wui-toolbar', options);
    const handle = component(element, patch => {
        if ('label' in patch) element.setAttribute('aria-label', patch.label);
    });
    element.setAttribute('role', 'group');
    handle.append = (...children) => append_owned(handle, element, children);
    handle.append(...(options.children ?? []));
    return handle.set(options);
}

export function notice(options = {}) {
    const handle = status(options);
    handle.element.classList.add('wui-notice');
    return handle;
}

export function badge(options = {}) {
    const element = create_element('span', 'wui-badge', options);
    const state = {text: '', tone: 'neutral', ...options};
    return component(element, patch => {
        const tone = 'tone' in patch ? patch.tone : state.tone;
        if (!['neutral', 'success', 'warning', 'danger'].includes(tone)) throw new TypeError('Unknown badge tone.');
        Object.assign(state, patch);
        element.textContent = state.text; element.dataset.tone = state.tone;
    }).set(state);
}

export function spinner(options = {}) {
    const element = create_element('span', 'wui-spinner', options);
    element.setAttribute('role', 'status');
    return component(element, patch => {
        if ('label' in patch) element.setAttribute('aria-label', String(patch.label));
    }).set({label: 'Loading', ...options});
}
