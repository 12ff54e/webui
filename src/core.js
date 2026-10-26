// Internal DOM and ownership helpers. No document is captured at module load.
const components = new WeakMap();
let next_id = 0;

export function unique_id() {
    return `wui-${++next_id}`;
}

export function create_element(tag, class_name, options = {}) {
    const doc = options.document ?? globalThis.document;
    if (!doc) throw new Error('Pass a document when creating a component outside a browser.');
    const element = doc.createElement(tag);
    element.className = class_name;
    if (options.id) element.id = options.id;
    return element;
}

export function component(element, update = () => {}) {
    const owned = new Set();
    const cleanup = new Set();
    let owner = null;
    let destroyed = false;

    const handle = {
        element,
        get destroyed() { return destroyed; },
        set(patch = {}) {
            if (destroyed) throw new Error('Cannot update a destroyed component.');
            update(patch);
            if ('hidden' in patch) element.hidden = Boolean(patch.hidden);
            return handle;
        },
        mount(parent) {
            if (destroyed) throw new Error('Cannot mount a destroyed component.');
            const target = parent.element ?? parent;
            target.append(element);
            // mount() transfers placement to the caller, not ownership to an
            // arbitrary DOM ancestor. Containers use append_owned() instead.
            owner?.release(handle);
            return handle;
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            owner?.release(handle);
            for (const child of [...owned]) child.destroy();
            for (const dispose of cleanup) dispose();
            cleanup.clear();
            element.remove();
        },
    };
    const internal = {
        own(child) {
            if (child.destroyed) throw new Error('Cannot own a destroyed component.');
            const other = components.get(child);
            if (!other) throw new TypeError('Expected a webui component.');
            if (child === handle || child.element.contains(element))
                throw new Error('A component cannot contain itself or its ancestor.');
            other.owner?.release(child);
            owned.add(child);
            other.owner = internal;
        },
        release(child) {
            owned.delete(child);
            components.get(child).owner = null;
        },
        get owner() { return owner; },
        set owner(value) { owner = value; },
        cleanup,
    };
    components.set(handle, internal);
    return handle;
}

export function append_owned(parent, target, children = []) {
    if (parent.destroyed) throw new Error('Cannot append to a destroyed component.');
    for (const child of children) {
        if (child == null) continue;
        if (components.has(child)) {
            // DOM placement can differ from ownership after a caller moves a
            // raw element. Check both graphs before changing either one.
            const child_state = components.get(child);
            for (let ancestor = components.get(parent); ancestor; ancestor = ancestor.owner) {
                if (ancestor === child_state) throw new Error('Component ownership cannot contain a cycle.');
            }
            // Append first: failed DOM insertion must not change ownership.
            if (child.destroyed || child.element.contains(parent.element))
                throw new Error('Cannot append a destroyed component or an ancestor.');
            target.append(child.element);
            components.get(parent).own(child);
        } else {
            // Raw DOM nodes are borrowed; no resource cleanup is inferred.
            target.append(child);
        }
    }
    return parent;
}

export function on_cleanup(handle, dispose) {
    if (handle.destroyed) { dispose(); return; }
    components.get(handle).cleanup.add(dispose);
}

export function listen(handle, target, name, callback, options) {
    target.addEventListener(name, callback, options);
    on_cleanup(handle, () => target.removeEventListener(name, callback, options));
}
