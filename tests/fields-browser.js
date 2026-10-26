import {numberField, textField, selectField, checkbox} from '../src/fields.js';

export async function test_fields({test, assert, equal, root}) {
    const event = (input, type) => input.dispatchEvent(new input.ownerDocument.defaultView.Event(type, {bubbles: true}));
    const edit = (field, text) => { field.input.value = text; event(field.input, 'input'); };

    await test('numeric drafts survive invalid commits and commit once when valid', () => {
        const changes = [];
        const field = numberField({label: 'Tolerance', value: 1e-5, required: true,
            onCommit: value => changes.push(value)}).mount(root);
        try {
            edit(field, '1e-');
            equal(field.draft, '1e-');
            equal(field.value, 1e-5);
            assert(!field.valid);
            assert(!field.commit());
            assert(!field.input.checkValidity());
            equal(field.input.getAttribute('aria-invalid'), 'true');
            event(field.input, 'blur');
            equal(field.draft, '1e-');
            equal(changes.length, 0);
            edit(field, '1e-12');
            event(field.input, 'change');
            event(field.input, 'blur');
            equal(field.value, 1e-12);
            equal(changes.length, 1);
            assert(field.input.checkValidity());
            assert(!field.input.hasAttribute('aria-invalid'));
        } finally { field.destroy(); }
    });

    await test('numeric programmatic updates are silent and never clamp scientific values', () => {
        let calls = 0;
        const field = numberField({label: 'Tolerance', value: 1e-8, onCommit: () => ++calls}).mount(root);
        try {
            const input = field.input;
            input.focus(); edit(field, '1e-');
            field.set({value: 1e-6});
            equal(field.input, input);
            equal(input.ownerDocument.activeElement, input);
            equal(field.draft, '0.000001');
            equal(calls, 0);
            field.set({min: 1e-5});
            equal(field.value, 1e-6);
            equal(field.draft, '0.000001');
            assert(!field.valid);
            equal(calls, 0);
            field.set({min: undefined, value: -0});
            equal(field.draft, '-0');
            assert(Object.is(field.value, -0));
            assert(field.commit());
            equal(calls, 0);
            let threw = false;
            try { field.set({value: Infinity}); } catch { threw = true; }
            assert(threw);
            assert(Object.is(field.value, -0));
        } finally { field.destroy(); }
    });

    await test('disabling a focused draft through a setter stays silent', async () => {
        for (const [factory, initial, draft, replacement] of [
            [numberField, 1, '2', 3], [textField, 'initial', 'draft', 'replacement'],
        ]) {
            for (const replace of [false, true]) {
                const changes = [];
                const field = factory({label: 'Focused draft', value: initial,
                    onCommit: value => changes.push(value)}).mount(root);
                try {
                    field.input.focus(); edit(field, draft);
                    field.set(replace ? {disabled: true, value: replacement} : {disabled: true});
                    // Chromium can defer the resulting native blur until layout.
                    await new Promise(resolve => setTimeout(resolve, 50));
                    equal(changes.length, 0);
                    equal(field.value, replace ? replacement : initial);
                    equal(field.draft, replace ? String(replacement) : draft);
                } finally { field.destroy(); }
            }
        }
    });

    await test('hiding a focused field or ancestor never commits a draft', async () => {
        const {panel} = await import('../src/components.js');
        for (const hide of [
            (field, parent) => field.set({hidden: true}),
            (field, parent) => parent.set({hidden: true}),
            (field, parent) => { parent.element.style.display = 'none'; },
        ]) {
            let calls = 0;
            const field = numberField({label: 'Hidden draft', value: 1, onCommit: () => ++calls});
            const parent = panel({title: 'Owner', children: [field]}).mount(root);
            try {
                field.input.focus(); edit(field, '2'); hide(field, parent);
                await new Promise(resolve => setTimeout(resolve, 50));
                equal(calls, 0); equal(field.value, 1); equal(field.draft, '2');
            } finally { parent.destroy(); }
        }
    });

    await test('scientific fields default to a full keyboard and accept native input modes', () => {
        const field = numberField({label: 'Exponent', value: 1e-6}).mount(root);
        try {
            equal(field.input.inputMode, 'text');
            field.set({inputMode: 'decimal'}); equal(field.input.inputMode, 'decimal');
            let threw = false;
            try { field.set({inputMode: 'unsupported'}); } catch { threw = true; }
            assert(threw); equal(field.input.inputMode, 'decimal');
            edit(field, '1e-8'); assert(field.commit()); equal(field.value, 1e-8);
        } finally { field.destroy(); }
    });

    await test('destroying a focused field never commits its draft', async () => {
        for (const factory of [numberField, textField]) {
            let calls = 0;
            const field = factory({label: 'Disposable draft', value: factory === numberField ? 1 : 'initial',
                onCommit: () => ++calls}).mount(root);
            field.input.focus(); edit(field, factory === numberField ? '2' : 'draft');
            field.destroy();
            await new Promise(resolve => setTimeout(resolve, 50));
            equal(calls, 0);
            equal(field.value, factory === numberField ? 1 : 'initial');
        }
    });

    await test('destroying a container never commits a focused child draft', async () => {
        const {panel} = await import('../src/components.js');
        let calls = 0;
        const field = numberField({label: 'Owned draft', value: 1, onCommit: () => ++calls});
        const parent = panel({title: 'Owner', children: [field]}).mount(root);
        field.input.focus(); edit(field, '2');
        parent.destroy();
        await new Promise(resolve => setTimeout(resolve, 50));
        equal(calls, 0); equal(field.value, 1); assert(field.destroyed);
    });

    await test('Escape restores committed input and optional blank commits null', () => {
        const values = [];
        const field = numberField({label: 'Optional bound', value: 4, onCommit: value => values.push(value)}).mount(root);
        try {
            edit(field, '1e-');
            field.input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
            equal(field.draft, '4'); assert(field.valid);
            edit(field, ''); assert(field.commit());
            equal(field.value, null); equal(values.length, 1); equal(values[0], null);
            field.set({required: true});
            assert(!field.valid); equal(field.value, null);
        } finally { field.destroy(); }
    });

    await test('numeric fields participate in native form validity', () => {
        const form = root.ownerDocument.createElement('form');
        root.append(form);
        const field = numberField({label: 'Resolution', name: 'resolution', value: 55,
            integer: true, min: 3, required: true}).mount(form);
        try {
            assert(form.checkValidity());
            edit(field, '5.5'); assert(!form.checkValidity());
            field.set({disabled: true}); assert(form.checkValidity());
            field.set({disabled: false, value: 63}); assert(form.checkValidity());
            equal(new FormData(form).get('resolution'), '63');
        } finally { field.destroy(); form.remove(); }
    });

    await test('text fields preserve drafts, show safe text, and clear application errors on edit', () => {
        const values = [];
        const field = textField({label: '<b>Name</b>', help: 'A saved case', value: 'initial',
            onCommit: value => values.push(value)}).mount(root);
        try {
            assert(field.element.textContent.includes('<b>Name</b>'));
            assert(!field.element.querySelector('b'));
            field.set({error: 'Name already exists'});
            assert(!field.valid); assert(!field.input.checkValidity());
            edit(field, 'new');
            equal(field.value, 'initial'); assert(field.valid);
            event(field.input, 'change'); event(field.input, 'blur');
            equal(values.length, 1); equal(field.value, 'new');
            field.set({value: 'external'});
            equal(values.length, 1); equal(field.draft, 'external');
            field.set({required: true}); edit(field, ''); assert(!field.commit());
            equal(field.value, 'external');
        } finally { field.destroy(); }
    });

    await test('select and checkbox use native controls and silent setters', () => {
        const changes = [];
        const select = selectField({label: 'Method', value: 'a', options: [
            {value: 'a', label: '<b>First</b>'}, {value: 'b', label: 'Second'},
        ], onChange: value => changes.push(value)}).mount(root);
        const check = checkbox({label: 'Advanced', value: false,
            onChange: value => changes.push(value)}).mount(root);
        try {
            assert(!select.element.querySelector('b'));
            select.set({value: 'b'}); check.set({value: true});
            equal(changes.length, 0);
            select.input.value = 'a'; event(select.input, 'change');
            check.input.click();
            equal(changes.length, 2); equal(changes[0], 'a'); equal(changes[1], false);
            check.set({disabled: true}); check.input.click(); equal(changes.length, 2);
            select.set({required: true, options: ['b']});
            equal(select.value, ''); assert(!select.valid);
            select.set({value: 'b'}); assert(select.valid);
        } finally { select.destroy(); check.destroy(); }
    });

    await test('moved controls keep their native node and callbacks, then release listeners on destroy', () => {
        const frame = root.ownerDocument.createElement('iframe');
        root.append(frame);
        let calls = 0;
        const field = numberField({label: 'Moved value', value: 1, onCommit: () => ++calls}).mount(root);
        try {
            const input = field.input;
            const destination = frame.contentDocument.createElement('main');
            destination.className = 'wui'; frame.contentDocument.body.append(destination);
            field.mount(destination);
            equal(field.input, input); equal(input.ownerDocument, frame.contentDocument);
            input.focus(); equal(frame.contentDocument.activeElement, input);
            edit(field, '2'); event(input, 'change');
            equal(field.value, 2); equal(calls, 1);
            field.mount(root); equal(field.input, input);
            field.destroy(); field.destroy();
            input.value = '3'; event(input, 'input'); event(input, 'change');
            equal(calls, 1); assert(!field.commit());
        } finally { field.destroy(); frame.remove(); }
    });
}
