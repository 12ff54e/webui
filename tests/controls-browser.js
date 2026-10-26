import {button, segmentedControl, rangeField, disclosure, dialog, bindMenu, menu,
    toolbar, notice, badge, spinner} from '../src/index.js';

export async function test_controls({test, assert, equal, root}) {
    const key = (target, value) => target.dispatchEvent(new KeyboardEvent('keydown', {key: value, bubbles: true, cancelable: true}));
    const next = (element, name) => new Promise(resolve => element.addEventListener(name, resolve, {once: true}));

    await test('Segmented controls retain buttons and skip unavailable choices', () => {
        const changes = [];
        const control = segmentedControl({label: 'Representation', items: [
            {value: 'a', label: 'First'}, {value: 'disabled', label: 'Unavailable', disabled: true},
            {value: 'b', label: '<b>Second</b>'},
        ], onChange: value => changes.push(value)}).mount(root);
        try {
            const [first, unavailable, second] = control.buttons;
            equal(second.children.length, 0, 'Labels stay text');
            equal(first.getAttribute('aria-pressed'), 'true');
            first.focus(); key(first, 'ArrowRight');
            equal(control.value, 'b'); equal(document.activeElement, second);
            key(second, 'ArrowRight'); equal(control.value, 'a');
            key(first, 'End'); equal(control.value, 'b');
            equal(changes.join(','), 'b,a,b');
            control.set({value: 'a'}); equal(changes.length, 3, 'Programmatic updates stay silent');
            equal(control.buttons[0], first); equal(unavailable.disabled, true);
            control.set({disabled: true}); second.click(); equal(control.value, 'a');
            control.set({disabled: false}); equal(unavailable.disabled, true);
            const fieldset = document.createElement('fieldset'); fieldset.disabled = true; root.append(fieldset);
            control.mount(fieldset); key(first, 'ArrowRight');
            equal(control.value, 'a', 'A disabled fieldset blocks keyboard requests');
            control.mount(root); fieldset.remove();
        } finally { control.destroy(); }
    });

    await test('Controlled segmented requests allow application validation to reject selection', () => {
        const requests = [];
        const control = segmentedControl({controlled: true, value: 'single', items: [
            {value: 'single', label: 'Single'}, {value: 'paired', label: 'Paired'},
        ], onChange: value => requests.push(value)}).mount(root);
        try {
            control.buttons[1].click();
            equal(requests.join(','), 'paired'); equal(control.value, 'single');
            equal(control.buttons[0].getAttribute('aria-pressed'), 'true');
            control.set({value: requests.at(-1)});
            equal(control.value, 'paired'); equal(requests.length, 1);
            control.destroy(); control.buttons[0].click(); equal(requests.length, 1);
        } finally { control.destroy(); }
    });

    await test('Range fields use native bounds and separate live input from change', () => {
        const defaulted = rangeField({min: 0, max: 1, step: 'any'});
        equal(defaulted.value, .5, 'Unspecified values use the native midpoint'); defaulted.destroy();
        const constrained = rangeField({min: 0, max: 10, step: 2, value: 2});
        constrained.set({min: 1, step: 1});
        equal(constrained.value, 2, 'Constraint updates sanitize against the final bounds and step');
        constrained.set({min: 1, step: 2});
        equal(constrained.value, 3, 'The final native step still rounds values that need it'); constrained.destroy();
        const inputs = [], changes = [];
        const control = rangeField({label: 'Angle', unit: 'degrees', name: 'angle', min: 0, max: 10, step: 2,
            value: 4, help: 'Choose an angle.', onInput: value => inputs.push(value), onChange: value => changes.push(value)}).mount(root);
        try {
            const input = control.input;
            equal(input.type, 'range'); equal(control.value, 4);
            equal(control.output.value, '4');
            input.value = '8'; input.dispatchEvent(new Event('input', {bubbles: true}));
            equal(inputs.join(','), '8'); equal(changes.length, 0); equal(control.output.value, '8');
            input.dispatchEvent(new Event('change', {bubbles: true})); equal(changes.join(','), '8');
            input.dispatchEvent(new Event('blur')); equal(changes.length, 1);
            control.set({value: 99}); equal(control.value, 10, 'Native clamping stays authoritative');
            equal(inputs.length, 1); equal(changes.length, 1); equal(control.input, input);
            control.set({min: -1, max: 1, step: 'any', value: .25}); equal(control.value, .25);
            equal(input.step, 'any'); equal(input.name, 'angle');
            const fieldset = document.createElement('fieldset'); fieldset.disabled = true; root.append(fieldset);
            control.mount(fieldset); input.dispatchEvent(new Event('input', {bubbles: true}));
            equal(inputs.length, 1, 'Inherited disabled state blocks input callbacks');
            control.mount(root); fieldset.remove();
            control.destroy(); input.dispatchEvent(new Event('change')); equal(changes.length, 1);
        } finally { control.destroy(); }
    });

    await test('Disclosure keeps native toggle behavior and owned children', async () => {
        const changes = [], child = button({label: 'Inside'});
        const control = disclosure({label: 'Advanced', children: [child], onToggle: value => changes.push(value)}).mount(root);
        try {
            let event = next(control.element, 'toggle');
            control.set({open: true}); await event;
            equal(control.open, true); equal(changes.length, 0, 'A set update is silent');
            event = next(control.element, 'toggle'); control.summary.click(); await event;
            equal(control.open, false); equal(changes.join(','), 'false');
            control.set({label: 'More settings'}); equal(control.summary.textContent, 'More settings');
            control.destroy(); assert(child.destroyed);
        } finally { control.destroy(); }
    });

    await test('Dialogs preserve method-dialog submission and native return values', async () => {
        const form = document.createElement('form'); form.method = 'dialog';
        const submit = document.createElement('button'); submit.value = 'continue'; submit.textContent = 'Continue'; form.append(submit);
        const closed = [];
        const control = dialog({title: 'Confirm', children: [form], onClose: value => closed.push(value)}).mount(root);
        try {
            control.showModal(); assert(control.open);
            let event = next(control.element, 'close'); submit.click(); await event;
            equal(control.open, false); equal(control.element.returnValue, 'continue'); equal(closed.join(','), 'continue');
            control.showModal(); event = next(control.element, 'close'); control.set({hidden: true}); await event;
            equal(control.open, false); equal(closed.length, 1, 'Hiding through set closes silently');
            control.set({hidden: false}); control.showModal();
            event = next(control.element, 'close'); control.destroy(); await event;
            equal(control.element.open, false);
            equal(closed.length, 1, 'Queued close events cannot call a destroyed component');
        } finally { control.destroy(); }
    });

    await test('Borrowed menu bindings navigate live enabled items and release outside listeners', () => {
        const container = document.createElement('div'), trigger = document.createElement('button'), panel = document.createElement('div');
        trigger.textContent = 'Coordinates'; panel.hidden = true;
        const choices = ['Native', 'Unavailable', 'Boozer'].map((label, index) => {
            const item = document.createElement('button'); item.textContent = label;
            item.setAttribute('role', 'menuitemradio'); item.setAttribute('aria-checked', String(index === 2));
            item.disabled = index === 1; item.tabIndex = -1; panel.append(item); return item;
        });
        container.append(trigger, panel); root.append(container);
        const binding = bindMenu({trigger, element: panel, container});
        let calls = 0; choices[0].addEventListener('click', () => ++calls);
        try {
            trigger.click(); assert(binding.isOpen); equal(document.activeElement, choices[2]);
            key(choices[2], 'ArrowDown'); equal(document.activeElement, choices[0]);
            key(choices[0], 'End'); equal(document.activeElement, choices[2]);
            choices[2].disabled = true; key(choices[2], 'Home'); equal(document.activeElement, choices[0]);
            key(choices[0], 'Escape'); assert(!binding.isOpen); equal(document.activeElement, trigger);
            key(trigger, 'ArrowDown'); equal(document.activeElement, choices[0]);
            root.dispatchEvent(new Event('pointerdown', {bubbles: true})); assert(!binding.isOpen);
            binding.open(); key(choices[0], 'Tab'); assert(!binding.isOpen); equal(document.activeElement, trigger);
            binding.open(); const outside = document.createElement('button'); root.append(outside); outside.focus();
            assert(!binding.isOpen); outside.remove();
            binding.destroy(); binding.destroy();
            assert(panel.isConnected && trigger.isConnected, 'Disposal keeps borrowed nodes');
            trigger.click(); assert(panel.hidden, 'Trigger listener is gone');
            choices[0].click(); equal(calls, 1, 'Application selection listeners stay caller-owned');
        } finally { binding.destroy(); container.remove(); }
    });

    await test('Menu factories own their panel while keeping the supplied trigger', () => {
        const trigger = document.createElement('button'); trigger.textContent = 'Download'; root.append(trigger);
        const selected = [];
        const control = menu({trigger, items: [{value: 'native'}, {value: 'boozer'}],
            onSelect: value => selected.push(value)}).mount(root);
        try {
            control.open(); control.buttons[1].click();
            equal(control.value, 'boozer'); equal(selected.join(','), 'boozer'); assert(!control.isOpen);
            equal(document.activeElement, trigger);
            control.set({value: 'native'}); equal(selected.length, 1);
            control.destroy(); assert(trigger.isConnected); trigger.click(); assert(!control.isOpen);
        } finally { control.destroy(); trigger.remove(); }
    });

    await test('Invalid menu construction leaves borrowed triggers and document listeners untouched', () => {
        const trigger = document.createElement('button'); trigger.textContent = 'Choices'; root.append(trigger);
        const original = document.addEventListener;
        let outside_listeners = 0, rejected = false, control;
        document.addEventListener = function(name, ...args) {
            if (name === 'pointerdown' || name === 'focusin') ++outside_listeners;
            return original.call(this, name, ...args);
        };
        try {
            try { menu({trigger, items: [{value: 'a'}], value: 'missing'}); }
            catch (error) { rejected = error instanceof RangeError; }
            assert(rejected); equal(outside_listeners, 0);
            trigger.click(); equal(trigger.getAttribute('aria-expanded'), null, 'An invalid constructor binds no trigger action');
        } finally { document.addEventListener = original; }
        try {
            control = menu({trigger, items: [{value: 'a'}, {value: 'b'}]}).mount(root);
            trigger.click(); assert(control.isOpen);
            control.buttons[1].click(); equal(control.value, 'b'); assert(!control.isOpen);
        } finally { control?.destroy(); trigger.remove(); }
    });

    await test('Presentation controls compose with retained ownership and safe text', () => {
        const feedback = notice({text: '<strong>Ready</strong>', tone: 'success'});
        const tag = badge({text: 'Fixed', tone: 'neutral'}), loading = spinner({label: 'Solving'});
        const control = toolbar({label: 'Actions', children: [feedback, tag, loading]}).mount(root);
        equal(feedback.element.children.length, 0);
        equal(loading.element.getAttribute('aria-label'), 'Solving');
        loading.set({hidden: true}); assert(loading.element.hidden);
        tag.set({text: 'Free', tone: 'warning'}); equal(tag.element.textContent, 'Free');
        control.destroy(); assert(feedback.destroyed && tag.destroyed && loading.destroyed);
    });
}
