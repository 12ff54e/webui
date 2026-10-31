// Share presentation with another same-origin document. Nodes and state stay
// caller-owned; this binding never opens, navigates, or closes a window.
export function bindDocumentStyles({source = globalThis.document, target,
    root = source?.documentElement} = {}) {
    if (!source?.head || !target?.head || !source.defaultView || !target.defaultView ||
        source === target || root?.ownerDocument !== source || !root.style)
        throw new TypeError('Pass distinct source and target documents and a source root.');
    const destination = target.documentElement, nodes = [], cancel = [];
    const attributes = ['data-theme', 'data-mode', 'data-corners', 'data-density'];
    const initial = new Map(attributes.map(name => [name, destination.getAttribute(name)]));
    const had_root = destination.classList.contains('wui');
    const properties = new Map();
    let destroyed = false;
    function sync() {
        destination.classList.add('wui');
        for (const name of attributes) {
            const value = root.getAttribute(name);
            if (value === null) destination.removeAttribute(name);
            else destination.setAttribute(name, value);
        }
        const next = new Set([...root.style].filter(name => name.startsWith('--ui-')));
        for (const name of next) {
            if (!properties.has(name)) properties.set(name,
                [destination.style.getPropertyValue(name), destination.style.getPropertyPriority(name)]);
            destination.style.setProperty(name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name));
        }
        for (const [name, [value, priority]] of properties) if (!next.has(name)) {
            destination.style.setProperty(name, value, priority); properties.delete(name);
        }
    }
    // Inline styles resolve URLs against the source document. External sheets
    // retain their own URL, including the base of nested @imports and fonts.
    const base = target.createElement('base'); base.href = source.baseURI;
    target.head.prepend(base); nodes.push(base);
    const pending = [];
    for (const original of source.querySelectorAll('link[rel~="stylesheet"], style')) {
        // Links without a URL start no request and emit no load or error event.
        if (original.tagName === 'LINK' && !original.getAttribute('href')?.trim()) continue;
        const node = original.cloneNode(true);
        let imports = false;
        if (node.tagName === 'LINK') node.href = original.href;
        else if (original.sheet) {
            // DOM text omits edits made through insertRule() and rule.style.
            const rules = [...original.sheet.cssRules];
            node.textContent = rules.map(rule => rule.cssText).join('\n');
            imports = rules.some(rule => rule.type === 3);
        }
        if (!original.disabled && (node.tagName === 'LINK' || imports)) {
            pending.push(new Promise((resolve, reject) => {
                const finish = error => {
                    node.removeEventListener('load', loaded); node.removeEventListener('error', failed);
                    if (error) reject(error); else resolve();
                };
                const loaded = () => finish();
                const failed = () => finish(new Error(`Could not load stylesheet: ${node.href}`));
                node.addEventListener('load', loaded); node.addEventListener('error', failed);
                cancel.push(() => finish());
            }));
        }
        node.disabled = original.disabled; target.head.append(node);
        // STYLE has no associated stylesheet until insertion, so its disabled
        // setter must also run after append. LINK can suppress loading earlier.
        node.disabled = original.disabled; nodes.push(node);
    }
    sync();
    const observer = new source.defaultView.MutationObserver(sync);
    observer.observe(root, {attributes: true, attributeFilter: [...attributes, 'style']});
    const ready = Promise.all(pending).then(() => undefined);
    return {
        ready,
        get destroyed() { return destroyed; },
        destroy() {
            if (destroyed) return;
            destroyed = true; observer.disconnect(); cancel.forEach(finish => finish());
            nodes.forEach(node => node.remove());
            for (const [name, value] of initial) {
                if (value === null) destination.removeAttribute(name);
                else destination.setAttribute(name, value);
            }
            for (const [name, [value, priority]] of properties) destination.style.setProperty(name, value, priority);
            if (!had_root) destination.classList.remove('wui');
        },
    };
}
