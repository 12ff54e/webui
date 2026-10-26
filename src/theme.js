const colors = {
    background: 'background', surface: 'surface', text: 'text', muted: 'muted',
    accent: 'accent', warning: 'warning', danger: 'danger', line: 'line',
    plot1: 'plot-1', plot2: 'plot-2', plot3: 'plot-3',
};

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

// Explicit notification leaves theme selection and persistence to applications.
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
