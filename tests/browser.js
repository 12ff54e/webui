import {button, panel, row, stack, status, tabs, numberField, palette, onThemeChange, refreshTheme} from '../src/index.js';
import {test_fields} from './fields-browser.js';
import {test_themes} from './themes-browser.js';
import {test_corners} from './corners-browser.js';
import {test_controls} from './controls-browser.js';
import {test_math} from './math-browser.js';
import {test_layout} from './layout-browser.js';
import {test_document} from './document-browser.js';

export async function run() {
    const results = [];
    const root = document.getElementById('tests');
    const assert = (value, message = 'Assertion failed') => { if (!value) throw new Error(message); };
    const equal = (actual, expected, message = '') => {
        if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${expected}, got ${actual}`);
    };
    const test = async (name, check) => {
        try { await check(); results.push({name, pass: true}); }
        catch (error) { results.push({name, pass: false, error: error.stack}); }
    };
    await test_document({test, assert, equal, root});
    await test('Silent updates preserve focused controls and text is not HTML', () => {
        let clicks = 0;
        const control = button({label: '<b>Run</b>', onClick: () => ++clicks}).mount(root);
        const element = control.element;
        element.focus();
        control.set({label: 'Run again'});
        equal(document.activeElement, element);
        equal(element.children.length, 0);
        equal(clicks, 0);
        element.click(); equal(clicks, 1);
        control.set({disabled: true}); element.click(); equal(clicks, 1);
        control.destroy(); control.destroy();
        element.disabled = false; element.click(); equal(clicks, 1, 'Listener cleanup');
    });
    await test('Container ownership transfers; raw nodes stay caller-owned', () => {
        const child = button({label: 'Move me'});
        const first = panel({title: 'First', children: [child]}).mount(root);
        const second = panel({id: 'second-panel', title: 'Second'}).mount(root);
        second.append(child);
        first.destroy(); assert(!child.destroyed);
        equal(document.querySelectorAll('#second-panel').length, 1, 'No duplicate root IDs');
        const raw = document.createElement('button');
        let clicks = 0;
        raw.addEventListener('click', () => ++clicks);
        second.append(raw);
        second.destroy(); assert(child.destroyed);
        root.append(raw); raw.click(); equal(clicks, 1); raw.remove();
    });
    await test('Mount transfers a child out of its former container', () => {
        const child = button({label: 'Independent'});
        const parent = stack({children: [child]}).mount(root);
        child.mount(root); parent.destroy(); assert(!child.destroyed);
        child.destroy();
    });
    await test('Raw DOM moves cannot create a cycle in component ownership', () => {
        const child = stack();
        const parent = stack({children: [child]}).mount(root);
        root.append(child.element);
        let rejected = false;
        try { child.append(parent); } catch { rejected = true; }
        assert(rejected, 'Reject a logical ancestor even after its DOM child moves');
        equal(parent.element.parentNode, root, 'Rejected append leaves placement unchanged');
        equal(child.element.parentNode, root);
        parent.destroy(); assert(child.destroyed);
    });
    await test('Keyboard tabs skip disabled entries, wrap, and retain panels', () => {
        const a = numberField({label: 'Value', value: 3});
        const b = status({text: 'Result'});
        const changes = [];
        const control = tabs({label: 'Workspace', items: [
            {id: 'a', label: 'Input', content: a},
            {id: 'disabled', label: 'Unavailable', disabled: true},
            {id: 'b', label: 'Result', content: b},
        ], onChange: value => changes.push(value)}).mount(root);
        const buttons = [...control.element.querySelectorAll('[role=tab]')];
        buttons[0].focus();
        buttons[0].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
        equal(control.value, 'b'); equal(document.activeElement, buttons[2]);
        equal(buttons[2].getAttribute('aria-selected'), 'true'); equal(buttons[0].tabIndex, -1);
        buttons[2].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
        equal(control.value, 'a'); equal(document.activeElement, buttons[0]);
        a.input.value = '1e-';
        a.input.dispatchEvent(new Event('input', {bubbles: true}));
        a.input.focus();
        control.set({value: 'b'}); equal(document.activeElement, buttons[2]);
        control.set({value: 'a'}); equal(a.draft, '1e-');
        equal(changes.length, 2, 'Programmatic selection is silent');
        control.destroy(); assert(a.destroyed && b.destroyed);
    });
    await test('Theme roots are independent and renderer notifications can be disposed', () => {
        const other = document.createElement('div'); other.className = 'wui'; root.append(other);
        other.style.setProperty('--ui-accent', '#123456');
        equal(palette(other).accent, '#123456'); assert(palette(root).accent !== '#123456');
        const values = [];
        const stop = onThemeChange(other, value => values.push(value.accent));
        other.style.setProperty('--ui-accent', '#654321'); refreshTheme(other);
        equal(values.join(','), '#123456,#654321');
        stop(); refreshTheme(other); equal(values.length, 2);
        other.remove();
    });
    await test('A live control and palette subscription survive document adoption', async () => {
        const frame = document.createElement('iframe');
        const loaded = new Promise(resolve => { frame.onload = resolve; });
        frame.src = 'about:blank'; root.append(frame); await loaded;
        const doc = frame.contentDocument;
        const style = doc.createElement('style');
        style.textContent = [...document.styleSheets[0].cssRules].map(rule => rule.cssText).join('\n');
        doc.head.append(style);
        const moved_root = document.createElement('div'); moved_root.className = 'wui'; root.append(moved_root);
        const values = [], themes = [];
        const field = numberField({label: 'Moved value', value: 1, onCommit: value => values.push(value)}).mount(moved_root);
        const input = field.input;
        const stop = onThemeChange(moved_root, theme => themes.push(theme.accent));
        doc.body.append(moved_root);
        equal(field.input, input); equal(input.ownerDocument, doc);
        input.value = '2e-3';
        input.dispatchEvent(new frame.contentWindow.Event('change', {bubbles: true}));
        equal(field.value, 0.002); equal(values.length, 1);
        moved_root.style.setProperty('--ui-accent', '#123456'); refreshTheme(moved_root);
        equal(themes.at(-1), '#123456');
        root.append(moved_root);
        stop(); field.destroy(); refreshTheme(moved_root); equal(themes.length, 2);
        moved_root.remove(); frame.remove();
    });
    await test('Repeated disposal removes listeners from retained elements', () => {
        let calls = 0;
        for (let i = 0; i < 30; ++i) {
            const child = button({label: 'Run', onClick: () => ++calls});
            const controls = row({children: [child]}).mount(root);
            child.element.click(); controls.destroy(); child.element.click();
        }
        equal(calls, 30);
    });
    await test_fields({test, assert, equal, root});
    await test_themes({test, assert, equal, root});
    await test_corners({test, assert, equal, root});
    await test_controls({test, assert, equal, root});
    await test_math({test, assert, equal, root});
    await test_layout({test, assert, equal, root});
    return {pass: results.every(result => result.pass), results};
}
