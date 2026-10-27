import {math} from '../src/math.js';
import {panel, createTheme} from '../src/index.js';

export async function test_math({test, assert, equal, root}) {
    const rejects = callback => { let rejected = false; try { callback(); } catch { rejected = true; } assert(rejected); };
    const visible = expression => expression.element.querySelector('.katex-html')?.textContent ?? '';

    await test('Math renders inline and display TeX with MathML while retaining its root', () => {
        const tex = String.raw`\frac{a}{b} + \sqrt{x}`;
        const expression = math({id: 'test-math', tex}).mount(root);
        try {
            const element = expression.element, rendered = element.firstChild;
            equal(element.localName, 'span'); equal(element.id, 'test-math');
            equal(expression.tex, tex); equal(expression.displayMode, false); equal(expression.error, null);
            assert(element.querySelector('.katex-html[aria-hidden="true"]'));
            equal(element.querySelector('math annotation').textContent, tex);
            assert(!element.querySelector('.katex-display'));
            expression.set({hidden: true}); equal(element.firstChild, rendered); assert(element.hidden);
            expression.set({hidden: false, tex, macros: {}}); equal(element.firstChild, rendered);
            expression.set(); equal(element.firstChild, rendered, 'No-op updates retain rendered children');
            expression.set({displayMode: true}); equal(expression.element, element);
            assert(element.querySelector('.katex-display')); equal(expression.displayMode, true);
            expression.set({tex: 'x^2', displayMode: false}); equal(expression.element, element);
            equal(element.querySelector('math annotation').textContent, 'x^2');
        } finally { expression.destroy(); }
    });

    await test('Math shows parse errors as literal text and rejects invalid options atomically', () => {
        const expression = math({tex: 'x'}).mount(root);
        try {
            const child = expression.element.firstChild;
            for (const patch of [{tex: 42, hidden: true}, {displayMode: 'block'}, {macros: null},
                {macros: []}, {macros: {'\\x': () => 'x'}}]) {
                rejects(() => expression.set(patch));
                equal(expression.tex, 'x'); equal(expression.element.firstChild, child);
                equal(expression.element.hidden, false);
            }
            const bad = String.raw`\frac{<img src=x onerror=alert(1)>}`;
            expression.set({tex: bad});
            assert(expression.error?.includes('KaTeX parse error'));
            equal(expression.element.childElementCount, 0); equal(expression.element.textContent, bad);
            equal(expression.element.title, expression.error); equal(expression.element.dataset.error, 'true');
            expression.set({tex: 'y'}); equal(expression.error, null);
            equal(expression.element.dataset.error, 'false'); assert(!expression.element.hasAttribute('title'));
            assert(expression.element.querySelector('math'));
        } finally { expression.destroy(); }
    });

    await test('Math snapshots string macros and isolates definitions between renders and components', () => {
        const macros = {'\\value': 'x'};
        const expression = math({tex: String.raw`\value`, macros}).mount(root);
        const other = math({tex: String.raw`\leak`}).mount(root);
        try {
            macros['\\value'] = 'y';
            expression.set({tex: String.raw`\value + 1`}); assert(visible(expression).includes('x'));
            expression.set({macros}); assert(visible(expression).includes('y'));
            const rendered = expression.element.firstChild;
            expression.set({macros: {'\\value': 'y'}}); equal(expression.element.firstChild, rendered);
            const frozen = Object.freeze({'\\R': String.raw`\mathbb{R}`});
            expression.set({tex: String.raw`\gdef\leak{z}\R`, macros: frozen});
            equal(expression.error, null); equal(Object.keys(frozen).length, 1);
            assert(other.error, 'Definitions do not leak into another component');
            expression.set({tex: String.raw`\leak`}); assert(expression.error, 'Definitions do not persist into the next render');
        } finally { expression.destroy(); other.destroy(); }
    });

    await test('Math blocks trusted HTML and external resources and limits macro expansion', () => {
        const expression = math().mount(root);
        try {
            for (const tex of [String.raw`\href{javascript:alert(1)}{x}`,
                String.raw`\includegraphics{https://example.invalid/math.png}`,
                String.raw`\htmlClass{injected-math}{x}`, String.raw`\text{<script>alert(1)</script>}`]) {
                expression.set({tex});
                assert(!expression.element.querySelector('a, img, script, iframe, .injected-math'));
            }
            expression.set({tex: String.raw`\loop`, macros: {'\\loop': String.raw`\loop`}});
            assert(expression.error?.includes('Too many expansions'));
        } finally { expression.destroy(); }
    });

    await test('Math uses its current document and follows container ownership after moves', () => {
        const doc = document.implementation.createHTMLDocument('Math destination');
        const expression = math({tex: 'x', document: doc});
        const element = expression.element;
        equal(element.ownerDocument, doc); equal(element.querySelector('math').ownerDocument, doc);
        const first = panel().mount(root), second = panel().mount(root);
        first.append(expression); second.append(expression); first.destroy();
        try {
            assert(!expression.destroyed); equal(expression.element, element);
            expression.set({tex: String.raw`\sqrt{y}`});
            for (const node of element.querySelectorAll('*')) equal(node.ownerDocument, document);
            doc.body.append(element); expression.set({tex: 'z^2'});
            equal(expression.element, element); equal(element.querySelector('math').ownerDocument, doc);
            second.destroy(); assert(expression.destroyed); assert(!element.isConnected);
            rejects(() => expression.set({tex: 'q'})); rejects(() => expression.mount(root));
            expression.destroy();
        } finally { second.destroy(); expression.destroy(); }
    });

    await test('Math styles stay scoped, inherit every palette, and contain wide equations', async () => {
        const outside = document.createElement('span'), reference = document.createElement('span');
        outside.className = 'katex'; outside.textContent = reference.textContent = 'x';
        document.body.append(outside, reference);
        const container = document.createElement('div'); container.className = 'wui';
        container.style.width = '180px'; root.append(container);
        const theme = createTheme({root: container});
        const expression = math({displayMode: true,
            tex: String.raw`\boxed{\sqrt{\frac{a}{b}}} + \begin{pmatrix}a & b \\ c & d\end{pmatrix} + \sum_{n=1}^{\infty}\frac{1}{n^2} = \frac{\pi^2}{6}`}).mount(container);
        try {
            equal(getComputedStyle(outside).fontFamily, getComputedStyle(reference).fontFamily);
            equal(getComputedStyle(outside).fontSize, getComputedStyle(reference).fontSize);
            assert(getComputedStyle(expression.element.querySelector('.katex')).fontFamily.includes('KaTeX_Main'));
            equal(getComputedStyle(expression.element.querySelector('.fbox')).boxSizing, 'border-box');
            await document.fonts.ready;
            assert([...document.fonts].some(font => font.family.startsWith('KaTeX_') && font.status === 'loaded'));
            for (const name of ['default', 'cloisonne', 'sorghum', 'gromwell']) {
                theme.setTheme(name);
                for (const mode of ['light', 'dark']) {
                    theme.setMode(mode, {persist: false});
                    equal(getComputedStyle(expression.element.querySelector('.katex')).color, getComputedStyle(container).color);
                }
            }
            assert(expression.element.clientWidth <= 180);
            assert(expression.element.scrollWidth > expression.element.clientWidth);
            const first = expression.element.querySelector('.katex-base').getBoundingClientRect();
            assert(first.left >= expression.element.getBoundingClientRect().left - 1, 'The start of a wide equation stays reachable');
            expression.element.scrollLeft = 100; assert(expression.element.scrollLeft > 0);
            expression.set({tex: String.raw`\frac{`});
            reference.style.color = getComputedStyle(container).getPropertyValue('--ui-danger');
            equal(getComputedStyle(expression.element).color, getComputedStyle(reference).color);
        } finally { expression.destroy(); theme.destroy(); container.remove(); outside.remove(); reference.remove(); }
    });
}
