# webui

Small JavaScript components for a shared visual language across scientific web
applications. Create controls imperatively, retain their DOM nodes, and update
them explicitly. Applications own their state, scientific rules, workers, and
renderers.

The library uses native browser elements, ES modules, and a separate stylesheet.
It has no runtime dependencies or required build step. Version 0.2.0 includes a
default theme with light and dark modes, a shared mode switch, and optional saved
preferences.

## Start

Copy `src/` and `styles/` into a `webui/` directory in your static site, preserving
their relative paths.
Load the stylesheet and create components in a module script:

```html
<link rel="stylesheet" href="./webui/styles/ui.css">
<main class="wui" id="settings"></main>
<script type="module">
  import {numberField, button, panel} from './webui/src/index.js';

  const state = {tolerance: 1e-8};
  const tolerance = numberField({
    label: 'Tolerance',
    value: state.tolerance,
    min: 1e-12,
    required: true,
    onCommit: value => { state.tolerance = value; },
  });
  const run = button({
    label: 'Run',
    variant: 'primary',
    onClick: () => {
      if (!tolerance.commit()) {
        tolerance.input.focus();
        return;
      }
      console.log('Application settings:', state);
    },
  });
  panel({title: 'Solver settings', children: [tolerance, run]})
    .mount(document.getElementById('settings'));
</script>
```

Serve the files over HTTP(S), with JavaScript MIME types. Opening the page through
`file://` is not supported. A package manager is optional; the package exports its
JS entry point and `webui/style.css` for consumers that use one.

Open [the gallery](examples/index.html) from the same static server. Its equilibrium
and trajectory forms demonstrate composition; they do not run computations or
establish integration with cuMES, GEPT, FACS, or meow.

## Components

All factories accept an optional `document` for creating elements in another
browser document. All handles expose:

| Member | Contract |
| --- | --- |
| `element` | The stable root DOM element |
| `set(patch)` | Update supported properties without firing user callbacks; return the handle |
| `mount(parent)` | Append to a DOM parent and release ownership by a former component |
| `destroy()` | Release owned resources and remove the element; safe to call twice |
| `destroyed` | Whether the handle has been destroyed |

`set({hidden: true})` hides any component. Updating or mounting a destroyed
component throws. Text options use `textContent`; they do not accept HTML.
Direct DOM access is available for application-specific attributes and events.
The library owns the properties listed below; later updates may overwrite direct
changes to those properties.

| Factory | Properties supported by construction and `set` |
| --- | --- |
| `button` | `label`, `variant`, `disabled`, `onClick(event)` |
| `themeToggle` | `label`, `disabled`; pass a theme controller as `theme` at construction |
| `status` | `text`, `tone` |
| `panel` | `title`, `description` |
| `row`, `stack` | `gap` |
| `tabs` | `value`, `label`, `onChange(id, event)` |
| `textField` | `value`, `onCommit(value, event)`, common field properties |
| `numberField` | `value`, `min`, `max`, `integer`, `onCommit(value, event)`, common field properties |
| `selectField` | `value`, `options`, `onChange(value, event)`, common field properties |
| `checkbox` | Boolean `value`, `onChange(value, event)`, common field properties |

Button variants are `primary`, `secondary` (default), `quiet`, and `danger`.
Status tones are `neutral` (default), `success`, `warning`, and `danger`.
Layout gaps are `small`, `medium` (default), and `large`.

Common field properties are `label`, `help`, `unit`, `name`, `disabled`,
`required`, and `error`. Text and number fields also accept `readOnly`,
`placeholder`, `autocomplete`, and `inputMode`. Field `id` is a construction option for the
native control, with a matching label; other components apply `id` to their root.
Use unique IDs when providing your own.

Fields expose `input` (the native element), `value`, and `valid`. Text and number
fields additionally expose `draft` and `commit()`. Commit returns whether the
draft is valid. Native select values are strings; options accept strings or
`{value, label, disabled}` objects. Replacing options retains the selected value
if it still exists; otherwise it leaves the control unselected.

## Editing and application state

Text and numeric fields keep the current draft separate from the last committed
value. Change, blur, and Enter attempt a commit. Enter prevents implicit form
submission; Escape restores the committed value. An invalid commit leaves the
draft visible and displays a message. Repeated commits of the same value do not
repeat the callback.

Numeric fields use text inputs so incomplete scientific notation such as `1e-`
remains editable. Their default text keyboard keeps exponent and sign characters
available; `inputMode: 'decimal'` can request a narrower keyboard when appropriate.
They accept finite decimal and exponent notation using a dot
as the decimal separator. Hex, comma decimals, Infinity, overflow, and nonzero
values that round to zero are rejected. Values use JavaScript binary64;
`integer: true` requires a safe integer. An optional empty field commits `null`.
Numeric fields do not provide spinner buttons or step rounding.

`set({value})` explicitly replaces the draft, including while focused. It never
emits a user callback. Numeric programmatic values must be finite numbers or
`null`; a finite value outside the constraints is retained and marked invalid.
Changing constraints revalidates without clamping or changing the committed
value. Application errors set through `set({error})` clear on the next edit or
programmatic value update. Keep persistent scientific checks in the application.

Before consuming field values, commit every editable field and check the result:

```js
const valid = fields.map(field => field.commit()).every(Boolean);
if (!valid) return;
```

Use the committed values in application state. `FormData` reads native control
text, which can still be an uncommitted draft. Native required/custom-validity
checks work, but native `form.reset()` does not synchronize committed component
state. Reset application state and call `set({value})` on the affected fields.

Components do not schedule computations or reject stale worker messages. Keep
those rules in an application controller. A single function that maps application
state to control properties makes success, error, and cancellation paths easier
to keep consistent.

## Composition and lifetime

Panels, rows, and stacks accept initial `children` and expose `append(...children)`.
Passing a component transfers its ownership to that container. Destroying the
container recursively destroys its owned components. Appending the child to
another container transfers ownership; `child.mount(dom_parent)` makes it
caller-owned again.

Raw DOM nodes are borrowed. Removing a container may detach those nodes, but the
library does not release their application listeners, workers, or GPU resources.
An application can retain a raw node and mount it elsewhere.

Removing or moving a node through DOM APIs does not destroy a component or change
its logical owner. Use `mount` or `append` when transferring ownership. Call
`destroy` when finished. Application listeners and external subscriptions remain
the application's responsibility.

Components can move between documents while retaining native control identity
and handlers. Load the stylesheet in the destination and provide a `.wui` root
there. Document-specific application resources, including render scheduling,
still need their own relocation policy.

Tabs accept an immutable `items` array of `{id, label, content, disabled}` entries
at construction. IDs must be unique nonempty strings, with at least one enabled
item. Content can be a component or a raw DOM node. Arrow keys, Home, and End
select and focus enabled tabs. Panels remain mounted; hiding them does not reset
their fields. Programmatic selection is silent and restores focus to the new tab
if it would otherwise remain in hidden content. Panels should hold content that
can be shown without waiting for a new computation.

## Styles and themes

All library selectors stay within `.wui`. Defaults are defined on each root, so
multiple roots can have independent tokens. Set `data-density="compact"` on a
root for smaller controls and panel padding; omit it for the default density.
Override a small set of semantic tokens instead of patching component internals:

```css
.wui.my-workspace {
    --ui-accent: #156f65;
    --ui-space-medium: 18px;
}
```

The main tokens are `--ui-background`, `--ui-surface`, `--ui-text`, `--ui-muted`,
`--ui-accent`, `--ui-warning`, `--ui-danger`, `--ui-line`, `--ui-grid`, the five
`--ui-plot-N` colors, and `--ui-font`, `--ui-serif`, and `--ui-mono`.
The root supplies typography and foreground color; the application chooses where
to paint its page background. See [ui.css](styles/ui.css) for spacing, control,
border, and supporting surface tokens.

Theme identity and mode are separate. The bundled theme is named `default` and
provides both `light` and `dark` modes. A theme added later must provide both
palettes; selecting other themes remains deferred. Each root defaults to the
light palette. `data-theme="default" data-mode="dark"` selects dark mode, while
nested roots keep their own mode. The controller owns these attributes and
notifies renderers when the mode changes:

```js
import {createTheme, themeToggle} from './webui/src/index.js';

const theme = createTheme({root: document.documentElement,
  theme: 'default', storageKey: 'my-app.mode.v1', defaultMode: 'light'});
const toggle = themeToggle({theme}).mount(document.getElementById('toolbar'));
theme.setMode('dark');
theme.setMode('light', {persist: false}); // For a temporary host-supplied mode.
theme.toggleMode();
console.log(theme.name, theme.mode); // 'default', then 'light' or 'dark'
// At teardown:
toggle.destroy();
theme.destroy();
```

`themeToggle` supplies a circular native button, a split light/dark icon, and the
stable accessible label "Dark mode". It manages `aria-pressed` and follows the
controller when the mode changes. Its optional `label` replaces the accessible
label and tooltip. It supports the usual component methods, including silent
disabled/hidden updates and disposal; destroying it leaves the controller active.
For custom markup, `theme.bindToggle(button)` returns a binding disposer.
Destroying the controller removes all bindings and its storage listener while
leaving the DOM and mode in place. Later controller updates throw.

Persistence is opt-in: omit `storageKey` to avoid storage access. With a key,
initial mode uses a valid saved value, then `defaultMode`; existing root
attributes do not override that choice. Invalid saved values and storage clears
use the default. `setMode` accepts only `light` or `dark`. It saves by default,
even when the mode already matches, and emits one
notification per change. Storage notifications from the same key and storage
area update the theme without writing back. Denied storage access leaves theme
changes available. The controller uses the root's document at construction;
destroy and recreate it if the root moves to another document. System theme
selection is not automatic.

To restore a document theme before the first paint, put the optional classic
helper before stylesheets and use the same key and default in the controller:

```html
<html class="wui" data-theme="default">
<head>
  <script src="./webui/src/theme_boot.js"
    data-storage-key="my-app.mode.v1" data-default-mode="light"></script>
  <link rel="stylesheet" href="./webui/styles/ui.css">
</head>
```

The helper sets the root's theme identity to `default` and restores its mode.
It uses a valid saved preference or the given default, and falls back to light
when no default is given. It creates no controller or global API.

Canvas and GPU renderers can read the same palette:

```js
import {palette, onThemeChange, refreshTheme} from './webui/src/index.js';

const colors = palette(canvas); // Canvas is inside a styled .wui root.
const unsubscribe = onThemeChange(root, next => repaint(next));
// After the application changes tokens or stylesheets:
refreshTheme(root);
// When the renderer is destroyed:
unsubscribe();
```

`palette(element)` returns `background`, `surface`, `text`, `muted`, `accent`,
`warning`, `danger`, `line`, `grid`, `plot1` through `plot5`, `font`, and `mono`.
Palette colors must be six-digit sRGB hex strings, to support existing scientific
renderers. CSS tokens remain the source of truth. Read them after the stylesheet
loads and the element inherits from a root.

`onThemeChange` calls its callback immediately and returns a disposer.
`refreshTheme` notifies subscribers on that root after application token changes.
It does not select or save a theme. Moving the whole root retains palette
subscriptions. Moving an individual renderer between roots requires subscribing
to the new root.

The library makes no font requests. Its font stacks prefer Biolinum, Libertine,
and Fira Code when available, with system fallbacks. The gallery optionally loads
pinned fonts from a CDN through [fonts.css](examples/fonts.css); omit that file
or self-host the fonts for an offline deployment.

## Distribution and checks

Keep each application on a pinned library revision. Copy the complete `src/`
module graph and `styles/` together. A versioned asset directory is the simplest
way to invalidate all imported modules and CSS at once. Changing only an entry
script's query string does not version its imports.

Existing classic-script apps should initialize consumers from an explicit module
bootstrap. Placing a module tag before a classic startup script does not make the
classic script wait for that module.

Node 22 or newer runs the development scripts without installing packages:

```sh
node --test tests/*.test.mjs
node scripts/build.mjs
node scripts/test-browser.mjs http://localhost:6969/magnetic-equilibrium-solver/webui/tests/
```

The optional build copies the runtime, styles, and gallery to ignored `build/`.
Serve `build/examples/index.html` to check the staged package.

The browser runner uses an existing Chrome CDP connection at `localhost:9333`;
`WEBUI_CDP_URL` overrides it. It creates one tab in the existing window and closes
that tab on completion. It does not launch a browser or change its profile.
The page at `tests/index.html` can also run directly in a browser.

Checks cover numeric parsing, draft/commit behavior, native form validity, silent
updates, keyboard tabs, focus, ownership transfer, disposal, independent theme
roots, saved and blocked storage, theme toggles, prepaint restoration, and
controls/palette subscriptions moving between documents. The gallery
also needs visual checks at desktop and narrow widths. These checks do not
establish browser-wide accessibility certification or solver integration.
