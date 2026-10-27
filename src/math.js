import katex from '../vendor/katex/katex.mjs';
import {component, create_element} from './core.js';

function copy_macros(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError('Math macros must be an object of TeX strings.');
    const entries = Object.entries(value);
    if (entries.some(([, expansion]) => typeof expansion !== 'string'))
        throw new TypeError('Math macro expansions must be TeX strings.');
    return Object.fromEntries(entries);
}

function same_macros(first, second) {
    const keys = Object.keys(first);
    return keys.length === Object.keys(second).length
        && keys.every(key => Object.hasOwn(second, key) && first[key] === second[key]);
}

export function math(options = {}) {
    const element = create_element('span', 'wui-math', options);
    let state, error = null;
    const handle = component(element, patch => {
        const next = {
            tex: 'tex' in patch ? patch.tex : state?.tex ?? '',
            displayMode: 'displayMode' in patch ? patch.displayMode : state?.displayMode ?? false,
            macros: 'macros' in patch ? copy_macros(patch.macros) : state?.macros ?? {},
        };
        if (typeof next.tex !== 'string') throw new TypeError('Math tex must be a string.');
        if (typeof next.displayMode !== 'boolean') throw new TypeError('Math displayMode must be a boolean.');
        if (state && next.tex === state.tex && next.displayMode === state.displayMode
            && same_macros(next.macros, state.macros)) return;

        let content, message = null;
        try {
            const html = katex.renderToString(next.tex, {
                displayMode: next.displayMode, output: 'htmlAndMathml',
                throwOnError: true, trust: false, maxExpand: 1000, maxSize: 20,
                // Definitions inside an expression never alter caller settings.
                macros: {...next.macros},
            });
            const template = element.ownerDocument.createElement('template');
            template.innerHTML = html;
            content = template.content;
        } catch (failure) {
            if (!(failure instanceof katex.ParseError)) throw failure;
            message = failure.message;
            content = element.ownerDocument.createTextNode(next.tex);
        }
        element.replaceChildren(content);
        element.dataset.display = String(next.displayMode);
        element.dataset.error = String(message !== null);
        if (message) element.title = message;
        else element.removeAttribute('title');
        state = next;
        error = message;
    });
    Object.defineProperties(handle, {
        tex: {get: () => state.tex},
        displayMode: {get: () => state.displayMode},
        error: {get: () => error},
    });
    return handle.set(options);
}
