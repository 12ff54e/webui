import {component, create_element, listen, unique_id} from './core.js';
import {parseNumber, validateNumberConstraints} from './number.js';

const input_modes = ['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url'];

function silent_updates(handle) {
    const set = handle.set;
    let depth = 0;
    handle.set = patch => {
        ++depth;
        try { return set(patch); }
        finally { --depth; }
    };
    return () => depth > 0;
}

function ignore_event(handle, input, updating, event) {
    if (handle.destroyed || updating()) return true;
    if (!event) return false; // Explicit commit() remains available to callers.
    // Disabling or hiding a focused control can emit change/blur after set()
    // returns. Those lifecycle events must not commit an application update.
    if (input.matches(':disabled') || !input.isConnected || !input.getClientRects().length) return true;
    const visibility = input.ownerDocument.defaultView?.getComputedStyle(input).visibility;
    return visibility === 'hidden' || visibility === 'collapse';
}

function shell(tag, options, is_checkbox = false) {
    const element = create_element('div', `wui-field${is_checkbox ? ' wui-checkbox' : ''}`, {document: options.document});
    const doc = element.ownerDocument;
    const input = create_element(tag, is_checkbox ? 'wui-checkbox-input' : 'wui-input',
        {document: doc, id: options.id ?? unique_id()});
    const label = create_element('label', 'wui-field-label', {document: doc});
    label.htmlFor = input.id;
    const caption = doc.createElement('span');
    const unit = create_element('span', 'wui-field-unit', {document: doc});
    label.append(caption, unit);
    const help = create_element('p', 'wui-field-help', {document: doc, id: unique_id()});
    const error = create_element('p', 'wui-field-error', {document: doc, id: unique_id()});
    error.setAttribute('aria-live', 'polite');
    if (is_checkbox) element.append(input, label, help, error);
    else element.append(label, input, help, error);

    function update(patch) {
        if ('inputMode' in patch && !input_modes.includes(patch.inputMode))
            throw new TypeError(`inputMode must be one of: ${input_modes.join(', ')}.`);
        if ('label' in patch) caption.textContent = patch.label ?? '';
        if ('unit' in patch) { unit.textContent = patch.unit ? ` · ${patch.unit}` : ''; unit.hidden = !patch.unit; }
        if ('help' in patch) help.textContent = patch.help ?? '';
        for (const name of ['disabled', 'required', 'readOnly']) {
            if (name in patch) input[name] = Boolean(patch[name]);
        }
        for (const name of ['name', 'placeholder', 'autocomplete']) {
            if (name in patch) input[name] = patch[name] ?? '';
        }
        if ('inputMode' in patch) input.inputMode = patch.inputMode;
        help.hidden = !help.textContent;
        const descriptions = [help.hidden ? null : help.id, error.hidden ? null : error.id].filter(Boolean);
        if (descriptions.length) input.setAttribute('aria-describedby', descriptions.join(' '));
        else input.removeAttribute('aria-describedby');
    }
    function validity(message, show = false) {
        input.setCustomValidity(message);
        if (message && show) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
        error.textContent = show ? message : '';
        error.hidden = !error.textContent;
        update({});
    }
    error.hidden = true;
    update({label: '', help: '', unit: '', ...options});
    return {element, input, update, validity};
}

function expose(handle, input, properties) {
    Object.defineProperties(handle, {
        input: {value: input, enumerable: true},
        ...Object.fromEntries(Object.entries(properties).map(([key, get]) => [key, {get, enumerable: true}])),
    });
    return handle;
}

function numeric_value(value) {
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value)))
        throw new TypeError('Numeric value must be a finite number or null.');
    return value;
}

function numeric_text(value) {
    return value === null ? '' : Object.is(value, -0) ? '-0' : String(value);
}

export function numberField(options = {}) {
    const field = shell('input', options);
    const {element, input} = field;
    input.type = 'text';
    input.inputMode = 'text';
    const constraints = {min: undefined, max: undefined, integer: false, required: false};
    let committed = null, external_error = '', show_errors = false, on_commit;
    const parse = () => parseNumber(input.value, constraints);
    function validate(show = show_errors) {
        const result = parse();
        field.validity(external_error || result.message, show);
        return result.valid && !external_error;
    }
    const handle = component(element, patch => {
        const next = {...constraints};
        for (const key of ['min', 'max', 'integer', 'required']) if (key in patch) next[key] = patch[key];
        validateNumberConstraints(next);
        if ('value' in patch) numeric_value(patch.value);
        Object.assign(constraints, next);
        if ('onCommit' in patch) on_commit = patch.onCommit;
        field.update(patch);
        if ('value' in patch) {
            committed = patch.value;
            input.value = numeric_text(patch.value);
            external_error = '';
            show_errors = true;
        }
        if ('error' in patch) { external_error = String(patch.error ?? ''); show_errors = true; }
        validate();
    });
    const updating = silent_updates(handle);
    function commit(event) {
        if (ignore_event(handle, input, updating, event)) return false;
        show_errors = true;
        if (!validate()) return false;
        const value = parse().value;
        const changed = !Object.is(committed, value);
        committed = value;
        if (changed) on_commit?.(committed, event);
        return true;
    }
    handle.commit = commit;
    expose(handle, input, {
        value: () => committed,
        draft: () => input.value,
        valid: () => parse().valid && !external_error,
    });
    listen(handle, input, 'input', () => { external_error = ''; validate(); });
    listen(handle, input, 'change', commit);
    listen(handle, input, 'blur', commit);
    listen(handle, input, 'keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'Enter') { event.preventDefault(); commit(event); }
        if (event.key === 'Escape') {
            event.preventDefault();
            input.value = numeric_text(committed);
            external_error = ''; show_errors = false; validate();
        }
    });
    return handle.set({value: null, ...options});
}

export function textField(options = {}) {
    const field = shell('input', options);
    const {element, input} = field;
    input.type = 'text';
    input.inputMode = 'text';
    let committed = '', external_error = '', show_errors = false, on_commit;
    function message() { return external_error || (input.required && !input.value ? 'Enter a value.' : ''); }
    function validate() { field.validity(message(), show_errors); return !message(); }
    const handle = component(element, patch => {
        if ('value' in patch && typeof patch.value !== 'string') throw new TypeError('Text value must be a string.');
        if ('onCommit' in patch) on_commit = patch.onCommit;
        field.update(patch);
        if ('value' in patch) { committed = patch.value; input.value = committed; external_error = ''; }
        if ('error' in patch) { external_error = String(patch.error ?? ''); show_errors = true; }
        validate();
    });
    const updating = silent_updates(handle);
    function commit(event) {
        if (ignore_event(handle, input, updating, event)) return false;
        show_errors = true;
        if (!validate()) return false;
        const changed = committed !== input.value;
        committed = input.value;
        if (changed) on_commit?.(committed, event);
        return true;
    }
    handle.commit = commit;
    expose(handle, input, {value: () => committed, draft: () => input.value, valid: () => !message()});
    listen(handle, input, 'input', () => { external_error = ''; validate(); });
    listen(handle, input, 'change', commit);
    listen(handle, input, 'blur', commit);
    listen(handle, input, 'keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'Enter') { event.preventDefault(); commit(event); }
        if (event.key === 'Escape') {
            event.preventDefault(); input.value = committed; external_error = ''; show_errors = false; validate();
        }
    });
    return handle.set({value: '', ...options});
}

function choices(definitions = []) {
    const seen = new Set();
    return definitions.map(choice => {
        const item = typeof choice === 'string' ? {value: choice, label: choice} : choice;
        if (!item || !('value' in item)) throw new TypeError('Each select option needs a value.');
        const value = String(item.value);
        if (seen.has(value)) throw new Error(`Duplicate select option: ${value}`);
        seen.add(value);
        return {value, label: String(item.label ?? value), disabled: Boolean(item.disabled)};
    });
}

export function selectField(options = {}) {
    const field = shell('select', options);
    const {element, input} = field;
    let external_error = '', on_change, initialized = false;
    const message = () => external_error || (input.required && !input.value ? 'Choose an option.' : '');
    const validate = () => field.validity(message(), true);
    const handle = component(element, patch => {
        const items = 'options' in patch ? choices(patch.options) : null;
        if ('value' in patch) {
            const values = items ? items.map(item => item.value) : [...input.options].map(item => item.value);
            if (!values.includes(String(patch.value))) throw new RangeError(`Unknown select value: ${patch.value}`);
        }
        const previous = input.value;
        if (items) {
            input.replaceChildren(...items.map(item => {
                const option = input.ownerDocument.createElement('option');
                option.value = item.value; option.textContent = item.label; option.disabled = item.disabled;
                return option;
            }));
            if (initialized) input.value = previous;
        }
        if ('value' in patch) { input.value = String(patch.value); external_error = ''; }
        if ('error' in patch) external_error = String(patch.error ?? '');
        if ('onChange' in patch) on_change = patch.onChange;
        field.update(patch); validate(); initialized = true;
    });
    const updating = silent_updates(handle);
    expose(handle, input, {value: () => input.value, valid: () => !message()});
    listen(handle, input, 'change', event => {
        if (ignore_event(handle, input, updating, event)) return;
        external_error = ''; validate(); on_change?.(input.value, event);
    });
    return handle.set({options: [], ...options});
}

export function checkbox(options = {}) {
    const field = shell('input', options, true);
    const {element, input} = field;
    input.type = 'checkbox';
    let external_error = '', on_change;
    const message = () => external_error || (input.required && !input.checked ? 'Select this option.' : '');
    const validate = () => field.validity(message(), true);
    const handle = component(element, patch => {
        if ('value' in patch && typeof patch.value !== 'boolean') throw new TypeError('Checkbox value must be a boolean.');
        if ('value' in patch) { input.checked = patch.value; external_error = ''; }
        if ('error' in patch) external_error = String(patch.error ?? '');
        if ('onChange' in patch) on_change = patch.onChange;
        field.update(patch); validate();
    });
    const updating = silent_updates(handle);
    expose(handle, input, {value: () => input.checked, valid: () => !message()});
    listen(handle, input, 'change', event => {
        if (ignore_event(handle, input, updating, event)) return;
        external_error = ''; validate(); on_change?.(input.checked, event);
    });
    return handle.set({value: false, ...options});
}
