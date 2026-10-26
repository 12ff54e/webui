import {button, numberField, selectField, checkbox, panel, stack, row, status, tabs} from '../src/index.js';

function element(tag, class_name, text) {
    const node = document.createElement(tag);
    if (class_name) node.className = class_name;
    if (text !== undefined) node.textContent = text;
    return node;
}

function field_grid(fields) {
    const grid = stack({children: fields});
    grid.element.classList.add('gallery-form-grid');
    return grid;
}

function example_note({eyebrow, title, description, code, values}) {
    const note = element('aside', 'gallery-example-note');
    note.append(element('p', 'gallery-eyebrow', eyebrow), element('h3', '', title),
        element('p', '', description));
    const pre = element('pre', 'gallery-code');
    pre.append(element('code', '', code));
    note.append(pre);
    const list = element('dl', 'gallery-readout');
    const outputs = {};
    for (const [key, value] of Object.entries(values)) {
        const output = element('dd', '', String(value));
        list.append(element('dt', '', key), output);
        outputs[key] = output;
    }
    note.append(list);
    return {element: note, outputs};
}

function solver_example() {
    const state = {points: 55, tolerance: 1e-8, boundary: 'fixed', symmetric: true};
    const note = example_note({eyebrow: 'Example / Equilibrium', title: 'The application keeps the rules.',
        description: 'A field owns its editing state. The application decides which values belong to its scientific model. Commit an edit to see the values below change.',
        code: "const tolerance = numberField({\n  label: 'Tolerance',\n  value: 1e-8,\n  min: 1e-12,\n  required: true,\n  onCommit: value => {\n    state.tolerance = value;\n  },\n});", values: {'Radial points': 55, 'Tolerance': '1e-8', 'Boundary': 'Fixed'}});
    const feedback = status({text: 'Ready to edit. These settings stay in this example.', tone: 'neutral'});
    const changed = () => {
        note.outputs['Radial points'].textContent = state.points;
        note.outputs.Tolerance.textContent = state.tolerance.toExponential();
        note.outputs.Boundary.textContent = state.boundary === 'fixed' ? 'Fixed' : 'Free';
        feedback.set({text: 'Settings updated. The application received a committed value.', tone: 'success'});
    };
    const points = numberField({label: 'Radial grid points', value: state.points, min: 5, max: 1025, integer: true, required: true,
        help: 'An integer between 5 and 1025.', onCommit: value => {state.points = value; changed();}});
    const tolerance = numberField({label: 'Tolerance', value: state.tolerance, min: 1e-12, max: 1e-2, required: true,
        help: 'Scientific notation is welcome.', onCommit: value => {state.tolerance = value; changed();}});
    const boundary = selectField({label: 'Boundary condition', value: state.boundary,
        options: [{value: 'fixed', label: 'Fixed boundary'}, {value: 'free', label: 'Free boundary'}],
        onChange: value => {state.boundary = value; changed();}});
    const symmetry = checkbox({label: 'Use stellarator symmetry', value: state.symmetric,
        onChange: value => {state.symmetric = value; changed();}});
    const apply = button({label: 'Check settings', variant: 'primary', onClick: () => {
        const valid_points = points.commit();
        const valid_tolerance = tolerance.commit();
        feedback.set(valid_points && valid_tolerance ? {text: 'Settings are valid for this example. No calculation was started.', tone: 'success'} :
            {text: 'Review the marked fields before continuing.', tone: 'danger'});
    }});
    const reset = button({label: 'Reset', onClick: () => {
        Object.assign(state, {points: 55, tolerance: 1e-8, boundary: 'fixed', symmetric: true});
        points.set({value: state.points}); tolerance.set({value: state.tolerance});
        boundary.set({value: state.boundary}); symmetry.set({value: state.symmetric});
        changed(); feedback.set({text: 'Default settings restored.', tone: 'neutral'});
    }});
    const settings = panel({title: 'Equilibrium setup', description: 'The same controls, composed for a boundary solve.',
        children: [stack({gap: 'large', children: [field_grid([points, tolerance]), boundary, symmetry,
            row({gap: 'small', children: [apply, reset]}), feedback]})]});
    const layout = row({children: [settings, note.element]});
    layout.element.classList.add('gallery-example-layout');
    return layout;
}

function trajectory_example() {
    const state = {energy: 3500, duration: .002, particle: 'deuterium', history: true};
    const note = example_note({eyebrow: 'Example / Trajectories', title: 'Familiar, in a different tool.',
        description: 'Labels, units, help, and feedback follow the same rules. The application chooses the fields and the relationships between them.',
        code: "const energy = numberField({\n  label: 'Particle energy',\n  unit: 'eV',\n  value: 3500,\n  min: 1,\n  required: true,\n  onCommit: value => {\n    state.energy = value;\n  },\n});", values: {'Energy': '3500 eV', 'Duration': '0.002 s', 'Particle': 'Deuterium'}});
    const feedback = status({text: 'Edit a value to update the configuration.', tone: 'neutral'});
    const changed = () => {
        note.outputs.Energy.textContent = `${state.energy} eV`;
        note.outputs.Duration.textContent = `${state.duration} s`;
        note.outputs.Particle.textContent = state.particle === 'deuterium' ? 'Deuterium' : 'Proton';
        feedback.set({text: 'Trajectory settings updated.', tone: 'success'});
    };
    const energy = numberField({label: 'Particle energy', unit: 'eV', value: state.energy, min: 1, required: true,
        help: 'A positive energy in electronvolts.', onCommit: value => {state.energy = value; changed();}});
    const duration = numberField({label: 'Trace duration', unit: 's', value: state.duration, min: 1e-9, required: true,
        help: 'Commit with Enter or by leaving the field.', onCommit: value => {state.duration = value; changed();}});
    const particle = selectField({label: 'Particle', value: state.particle,
        options: [{value: 'deuterium', label: 'Deuterium'}, {value: 'proton', label: 'Proton'}],
        onChange: value => {state.particle = value; changed();}});
    const history = checkbox({label: 'Keep trajectory history', value: state.history,
        onChange: value => {state.history = value; changed();}});
    const check = button({label: 'Check settings', variant: 'primary', onClick: () => {
        const valid_energy = energy.commit();
        const valid_duration = duration.commit();
        feedback.set(valid_energy && valid_duration ? {text: 'Settings are valid for this example. No particles were traced.', tone: 'success'} :
            {text: 'Review the marked fields before continuing.', tone: 'danger'});
    }});
    const settings = panel({title: 'Trajectory setup', description: 'A second composition of the same field and action components.',
        children: [stack({gap: 'large', children: [field_grid([energy, duration]), particle, history,
            row({gap: 'small', children: [check]}), feedback]})]});
    const layout = row({children: [settings, note.element]});
    layout.element.classList.add('gallery-example-layout');
    return layout;
}

tabs({label: 'Interface examples', value: 'equilibrium', items: [
    {id: 'equilibrium', label: 'Equilibrium', content: solver_example()},
    {id: 'trajectory', label: 'Trajectories', content: trajectory_example()},
]}).mount(document.getElementById('examples-host'));

const action_feedback = status({text: 'Choose an action to inspect its feedback.', tone: 'neutral'});
panel({title: 'Actions', description: 'A clear hierarchy for common choices.', children: [stack({gap: 'large', children: [
    row({gap: 'small', children: [
        button({label: 'Primary action', variant: 'primary', onClick: () => action_feedback.set({text: 'Primary action selected.', tone: 'success'})}),
        button({label: 'Secondary', onClick: () => action_feedback.set({text: 'Secondary action selected.', tone: 'neutral'})}),
        button({label: 'Quiet', variant: 'quiet', onClick: () => action_feedback.set({text: 'Quiet action selected.', tone: 'neutral'})}),
    ]}),
    row({gap: 'small', children: [
        button({label: 'Remove', variant: 'danger', onClick: () => action_feedback.set({text: 'A destructive action needs clear intent. This example removes nothing.', tone: 'warning'})}),
        button({label: 'Unavailable', disabled: true}),
    ]}), action_feedback,
]})]}).mount(document.getElementById('actions-host'));

panel({title: 'Feedback', description: 'Words carry the meaning; color supports it.', children: [stack({gap: 'small', children: [
    status({text: 'Ready. Your settings are available for editing.', tone: 'neutral'}),
    status({text: 'Saved. The configuration is up to date.', tone: 'success'}),
    status({text: 'Check the resolution before continuing.', tone: 'warning'}),
    status({text: 'Enter a finite number greater than zero.', tone: 'danger'}),
]})]}).mount(document.getElementById('feedback-host'));

document.body.dataset.gallery = 'ready';
