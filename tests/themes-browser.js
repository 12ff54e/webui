import {createTheme, themeToggle, themePicker, palette, onThemeChange, refreshTheme} from '../src/theme.js';

export async function test_themes({test, assert, equal, root}) {
    // HTTP static servers do not expose crypto.randomUUID; fixture keys need only uniqueness.
    const unique_key = () => [...crypto.getRandomValues(new Uint32Array(4))].map(value => value.toString(16)).join('-');
    const theme_root = (parent = root) => {
        const node = document.createElement('section');
        node.className = 'wui'; parent.append(node);
        return node;
    };
    const frame = async source => {
        const node = document.createElement('iframe');
        const loaded = new Promise(resolve => { node.onload = resolve; });
        node.srcdoc = source ?? '<!doctype html><html class="wui"><title>Theme test</title></html>';
        root.append(node); await loaded;
        return node;
    };
    const rejects = action => { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected); };

    await test('Light and dark palettes stay independent on nested roots', () => {
        const outer = theme_root(), inner = theme_root(outer);
        const first = createTheme({root: outer}), second = createTheme({root: inner});
        try {
            const light = palette(outer);
            rejects(() => createTheme({root: inner, theme: 'unknown'}));
            first.setMode('dark');
            equal(first.name, 'default'); equal(outer.dataset.theme, 'default');
            const dark = palette(outer);
            equal(dark.background, '#141e1a'); equal(dark.grid, '#2b3c31');
            assert(dark.plot4 !== light.plot4); equal(dark.plot5, '#edab81');
            equal(palette(inner).background, light.background);
            assert(dark.text !== light.text && dark.accent !== light.accent);
            second.setMode('dark'); first.setMode('light');
            equal(palette(inner).background, dark.background);
            equal(palette(outer).background, light.background);
            equal(getComputedStyle(inner).colorScheme, 'dark');
            equal(getComputedStyle(outer).colorScheme, 'light');
        } finally { first.destroy(); second.destroy(); outer.remove(); }
    });

    const named_themes = [
        {id: 'cloisonne', name: 'Cloisonné', accent: '#2775b6'},
        {id: 'sorghum', name: 'Sorghum', accent: '#c02c38'},
        {id: 'gromwell', name: 'Gromwell', accent: '#5d3a6f'},
        {id: 'carbon', name: 'Carbon', accent: '#404040'},
    ];
    const luminance = hex => {
        const channels = hex.slice(1).match(/../g).map(value => {
            const channel = parseInt(value, 16) / 255;
            return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        });
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const contrast = (foreground, background) => {
        const a = luminance(foreground), b = luminance(background);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    await test('Pressed primary buttons keep their primary colors in every theme and mode', () => {
        const node = theme_root(), theme = createTheme({root: node});
        const control = document.createElement('button'), reference = document.createElement('span');
        control.className = 'wui-button'; control.dataset.variant = 'primary'; control.textContent = 'Run';
        control.style.transition = 'none';
        reference.style.color = 'var(--ui-on-accent)'; reference.style.backgroundColor = 'var(--ui-accent)';
        node.append(control, reference);
        try {
            for (const id of ['default', ...named_themes.map(theme => theme.id)]) {
                theme.setTheme(id);
                for (const mode of ['light', 'dark']) {
                    theme.setMode(mode, {persist: false});
                    for (const pressed of ['false', 'true']) {
                        control.setAttribute('aria-pressed', pressed);
                        const actual = getComputedStyle(control), expected = getComputedStyle(reference);
                        equal(actual.color, expected.color, `${id} ${mode} pressed=${pressed} text`);
                        equal(actual.backgroundColor, expected.backgroundColor, `${id} ${mode} pressed=${pressed} background`);
                    }
                }
            }
        } finally { theme.destroy(); node.remove(); }
    });
    const series_colors = colors => [colors.plot1, colors.plot2, colors.plot3, colors.plot4];
    const hue = hex => {
        const [r, g, b] = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255);
        const high = Math.max(r, g, b), span = high - Math.min(r, g, b);
        if (!span) return NaN;
        const sector = high === r ? (g - b) / span : high === g ? (b - r) / span + 2 : (r - g) / span + 4;
        return (sector * 60 + 360) % 360;
    };
    const base_hues = ['#3d99cc', '#f29f24', '#74b235', '#eb6235'].map(hue);
    const plot_palettes = [];
    for (const {id, name} of [{id: 'default', name: 'Celadon'}, ...named_themes]) {
        await test(`${name} supplies four ordered plot colors per mode and notifies renderers`, () => {
            const node = theme_root(), theme = createTheme({root: node, theme: id});
            const updates = [], stop = onThemeChange(node, colors => updates.push(series_colors(colors)));
            const modes = {};
            try {
                for (const mode of ['light', 'dark']) {
                    theme.setMode(mode, {persist: false});
                    const colors = palette(node), style = getComputedStyle(node);
                    const series = series_colors(colors); modes[mode] = series;
                    equal(new Set(series).size, 4, 'Each cycle contains four distinct colors');
                    equal(JSON.stringify(updates.at(-1)), JSON.stringify(series), 'Renderers receive the current four colors');
                    for (const [index, color] of series.entries()) {
                        assert(/^#[\da-f]{6}$/i.test(color));
                        equal(color, style.getPropertyValue(`--ui-plot-${index + 1}`).trim());
                        if (id === 'carbon') assert(/^#([\da-f]{2})\1\1$/i.test(color), 'Carbon plots use only gray');
                        else {
                            const distance = Math.abs(hue(color) - base_hues[index]);
                            assert(Math.min(distance, 360 - distance) < 10, 'Keep blue, amber, green, orange-red hue order');
                        }
                        for (const background of [colors.background, colors.surface])
                            assert(contrast(color, background) >= 3, `${name} ${mode} plot ${index + 1} needs contrast on ${background}`);
                    }
                }
                equal(new Set([...modes.light, ...modes.dark]).size, 8, 'Light and dark have separate variants');
                for (let index = 0; index < 4; ++index)
                    assert(luminance(modes.dark[index]) > luminance(modes.light[index]), 'Dark-mode lines use brighter colors');
                if (id !== 'carbon') plot_palettes.push(modes);
                node.style.setProperty('--ui-plot-2', '#123456'); refreshTheme(node);
                equal(updates.at(-1)[1], '#123456', 'Consumer overrides use the same notification path');
                stop(); const count = updates.length;
                theme.setMode('light', {persist: false}); equal(updates.length, count, 'Disposal stops plot updates');
            } finally { stop(); theme.destroy(); node.remove(); }
        });
    }
    await test('Each theme gives the four base plot colors its own tint', () => {
        equal(plot_palettes.length, 4);
        for (const mode of ['light', 'dark'])
            for (let index = 0; index < 4; ++index)
                equal(new Set(plot_palettes.map(colors => colors[mode][index])).size, 4);
    });
    await test('Carbon keeps every theme color and shadow neutral in both modes', () => {
        const node = theme_root(), theme = createTheme({root: node, theme: 'carbon'});
        const gray = value => assert(/^#([\da-f]{2})\1\1(?:[\da-f]{2})?$/i.test(value), `${value} must be gray`);
        try {
            for (const mode of ['light', 'dark']) {
                theme.setMode(mode);
                for (const [key, value] of Object.entries(palette(node)))
                    if (key !== 'font' && key !== 'mono') gray(value);
                const style = getComputedStyle(node);
                for (const token of ['soft', 'danger-soft', 'warning-soft', 'on-accent'])
                    gray(style.getPropertyValue(`--ui-${token}`).trim());
                for (const token of ['shadow', 'shadow-overlay']) {
                    const colors = style.getPropertyValue(`--ui-${token}`).match(/#[\da-f]+/gi);
                    assert(colors?.length); colors.forEach(gray);
                }
            }
        } finally { theme.destroy(); node.remove(); }
    });
    for (const [index, {id, name, accent}] of named_themes.entries()) {
        await test(`${name} provides readable palettes and stays independent of nested themes`, () => {
            const outer = theme_root(), inner = theme_root(outer), nested = theme_root(inner);
            const other = named_themes[(index + 1) % named_themes.length].id;
            const first = createTheme({root: outer, theme: id}), second = createTheme({root: inner});
            const third = createTheme({root: nested, theme: other});
            try {
                const default_light = palette(inner), named_light = palette(outer), other_light = palette(nested);
                equal(first.name, id); equal(named_light.accent, accent);
                for (const mode of ['light', 'dark']) {
                    first.setMode(mode);
                    const colors = palette(outer), style = getComputedStyle(outer);
                    for (const [token, value] of Object.entries(colors)) {
                        if (token !== 'font' && token !== 'mono')
                            assert(/^#[\da-f]{6}$/i.test(value), `${name} ${mode} ${token} must be a six-digit color`);
                    }
                    for (const token of ['soft', 'danger-soft', 'warning-soft', 'on-accent'])
                        assert(/^#[\da-f]{6}$/i.test(style.getPropertyValue(`--ui-${token}`).trim()),
                            `${name} ${mode} ${token} must be a six-digit color`);
                    const soft = style.getPropertyValue('--ui-soft').trim();
                    const on_accent = style.getPropertyValue('--ui-on-accent').trim();
                    equal(style.colorScheme, mode);
                    for (const token of ['text', 'muted', 'accent', 'warning', 'danger']) {
                        const backgrounds = [colors.background, colors.surface];
                        if (['text', 'muted', 'accent'].includes(token)) backgrounds.push(soft);
                        for (const background of backgrounds)
                            assert(contrast(colors[token], background) >= 4.5,
                                `${name} ${mode} ${token} text must have 4.5:1 contrast on ${background}`);
                    }
                    assert(contrast(on_accent, colors.accent) >= 4.5,
                        `${name} ${mode} primary-button text must have 4.5:1 contrast`);
                    equal(JSON.stringify(palette(inner)), JSON.stringify(default_light), 'Nested Celadon keeps its own light palette');
                    equal(JSON.stringify(palette(nested)), JSON.stringify(other_light), 'A third theme keeps its own light palette');
                }
                const named_dark = palette(outer);
                assert(named_dark.background !== named_light.background && named_dark.accent !== named_light.accent);
                second.setTheme(id).setMode('dark');
                first.setTheme('default').setMode('light');
                equal(JSON.stringify(palette(outer)), JSON.stringify(default_light));
                equal(JSON.stringify(palette(inner)), JSON.stringify(named_dark), `Nested ${name} keeps its own dark palette`);
                equal(JSON.stringify(palette(nested)), JSON.stringify(other_light), 'Nested themes do not inherit mode changes');
                third.setMode('dark');
                equal(JSON.stringify(palette(outer)), JSON.stringify(default_light));
                equal(JSON.stringify(palette(inner)), JSON.stringify(named_dark));
                second.setMode('light');
                equal(JSON.stringify(palette(inner)), JSON.stringify(named_light));
            } finally { first.destroy(); second.destroy(); third.destroy(); outer.remove(); }
        });

        await test(`${name} selection preserves mode, preference, focused controls, and notification counts`, () => {
            const key = `webui.test.selection.${unique_key()}`;
            const node = theme_root();
            localStorage.setItem(key, 'light');
            const theme = createTheme({root: node, storageKey: key, theme: id});
            const toggle = themeToggle({theme}).mount(node);
            const changes = [], stop = onThemeChange(node, colors => changes.push(colors.accent));
            try {
                toggle.element.focus();
                theme.setMode('dark', {persist: false}); equal(changes.length, 2);
                equal(theme.setTheme('default'), theme); equal(changes.length, 3);
                equal(theme.name, 'default'); equal(theme.mode, 'dark');
                equal(node.dataset.theme, 'default'); equal(node.dataset.mode, 'dark');
                equal(toggle.element.getAttribute('aria-pressed'), 'true');
                equal(document.activeElement, toggle.element);
                equal(localStorage.getItem(key), 'light', 'Identity changes must not write a mode preference');
                theme.setTheme('default'); equal(changes.length, 3, 'Same identity does not notify');
                rejects(() => theme.setTheme(name));
                rejects(() => theme.setTheme('unknown'));
                equal(theme.name, 'default'); equal(changes.length, 3, 'Rejected identities do not notify');
                node.dataset.theme = 'unknown';
                theme.setTheme('default'); equal(changes.length, 4, 'Repairing the root identity notifies once');
                theme.setTheme(id); equal(changes.length, 5);
                theme.toggleMode(); equal(theme.mode, 'light'); equal(changes.length, 6);
                equal(theme.name, id); equal(localStorage.getItem(key), 'light');
                window.dispatchEvent(new StorageEvent('storage', {key, newValue: 'dark', storageArea: localStorage}));
                equal(theme.mode, 'dark'); equal(theme.name, id); equal(changes.length, 7);
                equal(localStorage.getItem(key), 'light', 'Stored mode notifications preserve the name without writing back');
                node.dataset.mode = 'unknown';
                theme.setTheme(id); equal(theme.mode, 'light'); equal(changes.length, 8);
                theme.destroy();
                rejects(() => theme.setTheme('default'));
                equal(node.dataset.theme, id); equal(changes.length, 8);
            } finally { stop(); toggle.destroy(); theme.destroy(); node.remove(); localStorage.removeItem(key); }
        });
    }

    await test('The built-in mode switch owns its icon, label, state, and cleanup', () => {
        const node = theme_root(), form = document.createElement('form'); node.append(form);
        const theme = createTheme({root: node});
        let submissions = 0;
        form.addEventListener('submit', event => { event.preventDefault(); ++submissions; });
        const toggle = themeToggle({theme}).mount(form);
        const element = toggle.element, icon = element.querySelector('svg');
        try {
            equal(element.type, 'button'); equal(element.getAttribute('aria-label'), 'Dark mode');
            equal(element.getAttribute('aria-pressed'), 'false'); assert(icon && icon.getAttribute('aria-hidden') === 'true');
            element.focus(); element.click(); equal(theme.mode, 'dark');
            equal(document.activeElement, element); equal(submissions, 0);
            equal(element.getAttribute('aria-pressed'), 'true');
            toggle.set({label: 'Use dark mode', disabled: true});
            equal(toggle.element, element); equal(element.querySelector('svg'), icon);
            equal(element.getAttribute('aria-label'), 'Use dark mode');
            element.click(); equal(theme.mode, 'dark');
            toggle.set({disabled: false, hidden: true}); equal(element.hidden, true);
            toggle.set({hidden: false}); theme.setMode('light');
            equal(element.getAttribute('aria-pressed'), 'false');
            toggle.destroy(); toggle.destroy();
            theme.setMode('dark');
            equal(element.getAttribute('aria-pressed'), 'false', 'Destroyed switch unsubscribes');
            element.click(); equal(theme.mode, 'dark', 'Destroyed switch removes its click listener');
        } finally { toggle.destroy(); theme.destroy(); node.remove(); }
    });

    await test('The theme picker exposes named radio choices and CSS-derived swatches in both modes', () => {
        const node = theme_root(), theme = createTheme({root: node});
        const picker = themePicker({theme, id: 'test-theme-picker'}).mount(node);
        const expected = [{id: 'default', name: 'Celadon'}, ...named_themes];
        try {
            equal(theme.root, node); rejects(() => { theme.root = root; });
            equal(picker.trigger.id, 'test-theme-picker'); equal(picker.trigger.type, 'button');
            equal(picker.trigger.getAttribute('aria-label'), 'Color theme');
            equal(picker.trigger.getAttribute('aria-haspopup'), 'menu');
            equal(picker.trigger.getAttribute('aria-controls'), picker.menu.id);
            equal(picker.trigger.getAttribute('aria-expanded'), 'false');
            equal(picker.menu.getAttribute('role'), 'menu'); assert(picker.menu.hidden);
            assert(picker.trigger.querySelector('svg')?.getAttribute('aria-hidden') === 'true');
            assert(Object.isFrozen(picker.buttons)); equal(picker.buttons.length, expected.length);
            for (const mode of ['light', 'dark']) {
                theme.setMode(mode, {persist: false});
                for (const [index, choice] of picker.buttons.entries()) {
                    const entry = expected[index], swatch = choice.querySelector('.wui-theme-swatch');
                    equal(choice.value, entry.id); equal(choice.type, 'button');
                    equal(choice.getAttribute('role'), 'menuitemradio');
                    equal(choice.getAttribute('aria-label'), entry.name);
                    equal(choice.querySelector('.wui-theme-choice-label')?.textContent, entry.name);
                    equal(choice.getAttribute('aria-checked'), String(entry.id === theme.name));
                    assert(swatch && swatch.getAttribute('aria-hidden') === 'true');
                    equal(swatch.dataset.theme, entry.id); equal(swatch.dataset.mode, mode);
                    const reference = theme_root();
                    reference.dataset.theme = entry.id; reference.dataset.mode = mode;
                    const color = document.createElement('span');
                    color.style.color = palette(reference).accent; reference.append(color);
                    try {
                        equal(getComputedStyle(swatch).backgroundColor, getComputedStyle(color).color,
                            `${entry.name} swatch follows its ${mode} CSS accent`);
                    } finally { reference.remove(); }
                }
                equal(node.dataset.theme, 'default', 'Rendering other swatches does not change the selected theme');
                equal(node.dataset.mode, mode);
            }
        } finally { picker.destroy(); theme.destroy(); node.remove(); }
    });

    await test('Picker selections preserve mode and preference while synchronizing other pickers once', () => {
        const key = `webui.test.picker.${unique_key()}`, node = theme_root();
        localStorage.setItem(key, 'light');
        const theme = createTheme({root: node, storageKey: key});
        theme.setMode('dark', {persist: false});
        const form = document.createElement('form'); node.append(form);
        let submissions = 0, notifications = 0;
        form.addEventListener('submit', event => { event.preventDefault(); ++submissions; });
        node.addEventListener('webui-theme-change', () => ++notifications);
        const changes = [], other_changes = [];
        const first = themePicker({theme, onChange: (value, event) => changes.push({value, event})}).mount(form);
        const second = themePicker({theme, onChange: value => other_changes.push(value)}).mount(node);
        const selected = picker => picker.buttons.find(button => button.getAttribute('aria-checked') === 'true')?.value;
        try {
            assert(first.menu.id && second.menu.id && first.menu.id !== second.menu.id);
            equal(first.open(), first); assert(first.isOpen);
            first.buttons.find(button => button.value === 'cloisonne').click();
            equal(theme.name, 'cloisonne'); equal(theme.mode, 'dark');
            equal(localStorage.getItem(key), 'light'); equal(notifications, 1);
            equal(changes.length, 1); equal(changes[0].value, 'cloisonne'); assert(changes[0].event instanceof Event);
            equal(other_changes.length, 0, 'A synchronized picker does not emit a user callback');
            equal(selected(first), 'cloisonne'); equal(selected(second), 'cloisonne');
            equal(first.isOpen, false); equal(document.activeElement, first.trigger); equal(submissions, 0);
            first.open(); first.buttons.find(button => button.value === 'cloisonne').click();
            equal(notifications, 1); equal(changes.length, 1, 'Selecting the current identity closes without a change');
            second.open(); const focused = document.activeElement;
            theme.setTheme('sorghum');
            equal(selected(first), 'sorghum'); equal(selected(second), 'sorghum');
            equal(document.activeElement, focused, 'Programmatic updates do not move menu focus');
            equal(notifications, 2); equal(changes.length, 1); equal(other_changes.length, 0);
            equal(theme.mode, 'dark'); equal(localStorage.getItem(key), 'light');
            const replacement = [];
            first.set({onChange: value => replacement.push(value)}).open();
            first.buttons.find(button => button.value === 'gromwell').click();
            equal(replacement.join(','), 'gromwell'); equal(changes.length, 1); equal(notifications, 3);
            equal(selected(second), 'gromwell'); equal(submissions, 0);
        } finally { first.destroy(); second.destroy(); theme.destroy(); node.remove(); localStorage.removeItem(key); }
    });

    for (const target of ['picker', 'controller']) {
        await test(`Picker selections tolerate ${target} destruction during theme notification`, () => {
            const node = theme_root(), theme = createTheme({root: node});
            let callbacks = 0;
            const picker = themePicker({theme, onChange: () => ++callbacks}).mount(node);
            const errors = [], error = event => { errors.push(event.error); event.preventDefault(); };
            const destroy = () => target === 'picker' ? picker.destroy() : theme.destroy();
            node.addEventListener('webui-theme-change', destroy, {once: true});
            window.addEventListener('error', error);
            try {
                picker.open();
                picker.buttons.find(button => button.value === 'gromwell').click();
                equal(theme.name, 'gromwell', 'The theme changes before its listener tears down the controls');
                equal(errors.length, 0, 'Selection must not update a binding destroyed by its theme listener');
                equal(callbacks, 0, 'Selection callbacks stop after teardown');
                equal(picker.isOpen, false); assert(picker.trigger.disabled);
                assert(!picker.element.contains(document.activeElement), 'Teardown does not restore focus into the picker');
                equal(picker.destroyed, target === 'picker'); equal(theme.destroyed, target === 'controller');
            } finally {
                window.removeEventListener('error', error);
                node.removeEventListener('webui-theme-change', destroy);
                picker.destroy(); theme.destroy(); node.remove();
            }
        });
    }

    await test('Picker keyboard navigation, Escape, and outside actions retain ordinary focus behavior', () => {
        const node = theme_root(), theme = createTheme({root: node, theme: 'sorghum'});
        const picker = themePicker({theme}).mount(node), outside = document.createElement('button');
        outside.type = 'button'; outside.textContent = 'Outside picker'; node.append(outside);
        const key = (target, name) => {
            const event = new KeyboardEvent('keydown', {key: name, bubbles: true, cancelable: true});
            target.dispatchEvent(event); return event;
        };
        try {
            picker.trigger.focus(); key(picker.trigger, 'ArrowDown');
            assert(picker.isOpen); equal(picker.trigger.getAttribute('aria-expanded'), 'true');
            equal(document.activeElement, picker.buttons.find(button => button.value === 'sorghum'));
            const last = picker.buttons.length - 1;
            for (const [name, index] of [['End', last], ['Home', 0], ['ArrowUp', last], ['ArrowDown', 0]]) {
                key(document.activeElement, name); equal(document.activeElement, picker.buttons[index]);
            }
            key(document.activeElement, 'Escape');
            equal(picker.isOpen, false); equal(document.activeElement, picker.trigger);
            equal(picker.trigger.getAttribute('aria-expanded'), 'false');
            picker.open(); const tab = key(document.activeElement, 'Tab');
            equal(picker.isOpen, false); equal(tab.defaultPrevented, false, 'Tab can continue its native focus traversal');
            picker.open(); outside.focus();
            equal(picker.isOpen, false); equal(document.activeElement, outside, 'Outside focus is not pulled back');
            picker.open(); outside.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
            equal(picker.isOpen, false);
            picker.open(); equal(picker.close(true), picker); equal(document.activeElement, picker.trigger);
        } finally { picker.destroy(); theme.destroy(); node.remove(); }
    });

    await test('Picker updates keep their nodes and honor disabled, hidden, and native fieldset state', () => {
        const node = theme_root(), theme = createTheme({root: node});
        const fieldset = document.createElement('fieldset'); node.append(fieldset);
        const picker = themePicker({theme}).mount(fieldset);
        const element = picker.element, trigger = picker.trigger, menu = picker.menu, choices = picker.buttons;
        try {
            picker.set({label: 'Choose a palette', disabled: true});
            equal(trigger.getAttribute('aria-label'), 'Choose a palette'); assert(trigger.disabled);
            trigger.click(); picker.open(); equal(picker.isOpen, false);
            picker.set({disabled: false}); picker.open(); assert(picker.isOpen);
            picker.set({disabled: true}); equal(picker.isOpen, false);
            picker.set({disabled: false}); picker.open(); picker.set({hidden: true});
            assert(element.hidden); equal(picker.isOpen, false); picker.open(); equal(picker.isOpen, false);
            picker.set({hidden: false}); fieldset.disabled = true;
            trigger.click(); picker.open(); equal(picker.isOpen, false);
            choices.find(button => button.value === 'sorghum').click(); equal(theme.name, 'default');
            fieldset.disabled = false; picker.open(); assert(picker.isOpen);
            choices.find(button => button.value === 'gromwell').click(); equal(theme.name, 'gromwell');
            equal(picker.element, element); equal(picker.trigger, trigger); equal(picker.menu, menu); equal(picker.buttons, choices);
            rejects(() => picker.set({label: ''})); equal(trigger.getAttribute('aria-label'), 'Choose a palette');
        } finally { picker.destroy(); theme.destroy(); node.remove(); }
    });

    await test('Picker disposal releases retained controls and supports controller teardown first', () => {
        const node = theme_root(), theme = createTheme({root: node});
        let callbacks = 0;
        const picker = themePicker({theme, onChange: () => ++callbacks}).mount(node);
        const initial = picker.buttons.map(button => button.getAttribute('aria-checked')).join(',');
        try {
            picker.open(); picker.destroy(); picker.destroy();
            theme.setTheme('gromwell');
            equal(picker.buttons.map(button => button.getAttribute('aria-checked')).join(','), initial,
                'Destroyed pickers unsubscribe from theme changes');
            node.append(picker.element); picker.menu.hidden = true; picker.trigger.click(); assert(picker.menu.hidden);
            picker.menu.hidden = false; picker.buttons.find(button => button.value === 'sorghum').click();
            equal(theme.name, 'gromwell'); equal(callbacks, 0, 'Retained choices release selection listeners');
            rejects(() => picker.open()); rejects(() => picker.close());
            const second = themePicker({theme, onChange: () => ++callbacks}).mount(node);
            try {
                theme.destroy(); second.trigger.click(); equal(second.isOpen, false);
                second.buttons.find(button => button.value === 'cloisonne').click();
                equal(theme.name, 'gromwell'); equal(callbacks, 0);
                second.destroy(); second.destroy();
            } finally { second.destroy(); }
        } finally { picker.destroy(); theme.destroy(); node.remove(); }
    });

    await test('Pickers use the controller document and reject mismatched documents before binding', async () => {
        const node = theme_root(), theme = createTheme({root: node}), other = await frame();
        const doc = other.contentDocument, target = doc.documentElement;
        const foreign = createTheme({root: target, theme: 'cloisonne'});
        let picker;
        try {
            rejects(() => themePicker({theme, document: doc}));
            picker = themePicker({theme: foreign}).mount(doc.body);
            equal(picker.element.ownerDocument, doc); equal(picker.trigger.ownerDocument, doc);
            picker.open(); assert(picker.isOpen);
            equal(doc.activeElement, picker.buttons.find(button => button.value === 'cloisonne'));
            picker.buttons.find(button => button.value === 'sorghum').click();
            equal(foreign.name, 'sorghum'); equal(doc.activeElement, picker.trigger);
            equal(theme.name, 'default', 'Another document keeps an independent controller');
        } finally { picker?.destroy(); foreign.destroy(); theme.destroy(); node.remove(); other.remove(); }
    });

    await test('Theme toggles notify once, retain focus, and release their bindings', () => {
        const node = theme_root(), button = document.createElement('button');
        button.textContent = 'Dark theme'; node.append(button);
        const theme = createTheme({root: node});
        const changes = [], stop = onThemeChange(node, colors => changes.push(colors.background));
        try {
            const unbind = theme.bindToggle(button);
            equal(button.getAttribute('aria-pressed'), 'false');
            theme.setMode('dark'); equal(changes.length, 2);
            theme.setMode('dark'); equal(changes.length, 2, 'No duplicate notifications');
            equal(button.getAttribute('aria-pressed'), 'true');
            button.focus(); button.click();
            equal(theme.mode, 'light'); equal(document.activeElement, button);
            equal(button.getAttribute('aria-pressed'), 'false');
            equal(changes.length, 3);
            rejects(() => theme.setMode('system')); equal(theme.mode, 'light');
            unbind(); unbind();
            const rebind = theme.bindToggle(button);
            unbind(); // An old disposer must not remove the replacement binding.
            button.click(); equal(theme.mode, 'dark');
            rebind(); button.click(); equal(theme.mode, 'dark');
            theme.bindToggle(button);
            theme.destroy(); theme.destroy();
            button.click(); equal(node.dataset.mode, 'dark');
            rejects(() => theme.toggleMode()); rejects(() => theme.bindToggle(button));
            assert(node.isConnected, 'Destroy leaves the root and selected theme in place');
        } finally { stop(); theme.destroy(); node.remove(); }
    });

    await test('Saved preferences and storage changes obey the selected key and area', () => {
        const key = `webui.test.theme.${unique_key()}`;
        const node = theme_root(), other = theme_root();
        let first, second;
        try {
            localStorage.setItem(key, 'invalid');
            first = createTheme({root: node, storageKey: key, defaultMode: 'dark'});
            equal(first.mode, 'dark');
            first.setMode('light'); equal(localStorage.getItem(key), 'light');
            first.setMode('dark', {persist: false}); equal(localStorage.getItem(key), 'light');
            second = createTheme({root: other, storageKey: key});
            equal(second.mode, 'light', 'A second controller restores the stored preference');
            const stored = (eventKey, value, area = localStorage) => window.dispatchEvent(new StorageEvent('storage', {
                key: eventKey, newValue: value, storageArea: area,
            }));
            stored(key, 'dark', null); equal(second.mode, 'light', 'Ignore another storage area');
            stored(key + '.other', 'dark'); equal(second.mode, 'light', 'Ignore another key');
            stored(key, 'dark'); equal(second.mode, 'dark');
            equal(localStorage.getItem(key), 'light', 'Storage notifications never write back');
            stored(key, 'invalid'); equal(first.mode, 'dark'); equal(second.mode, 'light');
            second.setMode('dark', {persist: false});
            stored(null, null); equal(first.mode, 'dark'); equal(second.mode, 'light');
            second.destroy(); stored(key, 'dark'); equal(other.dataset.mode, 'light');
            first.setMode('dark'); equal(localStorage.getItem(key), 'dark', 'Same-value set still saves explicitly');
        } finally {
            first?.destroy(); second?.destroy(); node.remove(); other.remove(); localStorage.removeItem(key);
        }
    });

    await test('Theme changes work when storage reads or writes are blocked', async () => {
        for (const denied of ['access', 'methods']) {
            const node = await frame();
            const view = node.contentWindow, target = node.contentDocument.documentElement;
            let accesses = 0, theme;
            try {
                Object.defineProperty(view, 'localStorage', {configurable: true, get() {
                    ++accesses;
                    if (denied === 'access') throw Error('Storage denied');
                    return {getItem() { throw Error('Read denied'); }, setItem() { throw Error('Write denied'); }};
                }});
                theme = createTheme({root: target});
                theme.toggleMode(); equal(accesses, 0, 'No storage access without a key');
                theme.destroy();
                theme = createTheme({root: target, storageKey: 'webui.test.denied', defaultMode: 'dark'});
                equal(theme.mode, 'dark'); theme.toggleMode(); equal(theme.mode, 'light');
                equal(target.dataset.mode, 'light');
            } finally { theme?.destroy(); node.remove(); }
        }
    });

    await test('The classic boot helper restores the same theme before the stylesheet', async () => {
        const key = `webui.test.boot.${unique_key()}`;
        const script = new URL('../src/theme_boot.js', import.meta.url).href;
        const stylesheet = new URL('../styles/ui.css', import.meta.url).href;
        try {
            for (const [saved, fallback, expected] of [
                ['dark', 'light', 'dark'], ['light', 'dark', 'light'],
                ['invalid', 'dark', 'dark'], [null, 'light', 'light'],
            ]) {
                if (saved === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, saved);
                const node = await frame(`<!doctype html><html class="wui"><head>
                    <script>Object.defineProperty(window, 'localStorage', {get: () => parent.sessionStorage});<\/script>
                    <script src="${script}" data-storage-key="${key}" data-default-mode="${fallback}"><\/script>
                    <script>window.bootMode = document.documentElement.dataset.mode;<\/script>
                    <link rel="stylesheet" href="${stylesheet}"></head></html>`);
                let theme;
                try {
                    equal(node.contentWindow.bootMode, expected);
                    equal(node.contentDocument.documentElement.dataset.theme, 'default');
                    theme = createTheme({root: node.contentDocument.documentElement, storageKey: key, defaultMode: fallback});
                    equal(theme.mode, expected);
                    equal(palette(node.contentDocument.documentElement).background, expected === 'dark' ? '#141e1a' : '#f7f7f1');
                } finally { theme?.destroy(); node.remove(); }
            }
        } finally { sessionStorage.removeItem(key); }
    });

    await test('The boot helper selects configured names before paint and rejects invalid identities', async () => {
        const key = `webui.test.named-boot.${unique_key()}`;
        const script = new URL('../src/theme_boot.js', import.meta.url).href;
        const stylesheet = new URL('../styles/ui.css', import.meta.url).href;
        const cases = [
            ...named_themes.flatMap(({id}) => [
                {root: id, mode: 'light', expected: id},
                {root: id, mode: 'dark', expected: id},
                {root: 'default', configured: id, mode: 'dark', expected: id},
                {root: id, configured: 'default', mode: 'light', expected: 'default'},
                {root: id, configured: 'unknown', mode: 'dark', expected: 'default'},
            ]),
            {root: 'cloisonne', configured: 'sorghum', mode: 'dark', expected: 'sorghum'},
            {root: 'sorghum', configured: 'cloisonne', mode: 'light', expected: 'cloisonne'},
            {root: 'unknown', configured: 'sorghum', mode: 'light', expected: 'sorghum'},
            {root: 'sorghum', configured: 'gromwell', mode: 'dark', expected: 'gromwell'},
            {root: 'gromwell', configured: 'cloisonne', mode: 'light', expected: 'cloisonne'},
            {root: 'unknown', configured: 'gromwell', mode: 'light', expected: 'gromwell'},
            {root: 'unknown', mode: 'light', expected: 'default'},
        ];
        try {
            for (const entry of cases) {
                sessionStorage.setItem(key, entry.mode);
                const configured = entry.configured === undefined ? '' : `data-theme="${entry.configured}"`;
                const node = await frame(`<!doctype html><html class="wui" data-theme="${entry.root}"><head>
                    <script>Object.defineProperty(window, 'localStorage', {get: () => parent.sessionStorage});<\/script>
                    <script src="${script}" ${configured} data-storage-key="${key}"><\/script>
                    <script>window.bootSelection = {...document.documentElement.dataset};<\/script>
                    <link rel="stylesheet" href="${stylesheet}"></head></html>`);
                let theme;
                try {
                    equal(node.contentWindow.bootSelection.theme, entry.expected);
                    equal(node.contentWindow.bootSelection.mode, entry.mode);
                    const target = node.contentDocument.documentElement, before = palette(target);
                    theme = createTheme({root: target, theme: entry.expected, storageKey: key});
                    equal(theme.name, entry.expected); equal(theme.mode, entry.mode);
                    equal(JSON.stringify(palette(target)), JSON.stringify(before), 'Controller startup must keep the boot palette');
                } finally { theme?.destroy(); node.remove(); }
            }
        } finally { sessionStorage.removeItem(key); }
    });
}
