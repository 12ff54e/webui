# webui

Read the parent workspace AGENTS.md before working here.

Keep the browser library in plain JavaScript modules and a separate stylesheet.
It must run from a static server without a package manager or build step.
Scope styles and tokens to `.wui`; keep application state and scientific rules
in consumers. Components retain their DOM nodes when updated or moved.

Run the Node tests and the browser behavior suite for changed behavior. Use the
forwarded Chrome at localhost:9333; create and close only the test's own tab.
Keep screenshots and routine logs in the workspace tmp directory.

Before a large plan or final completion, obtain an architect review. Preserve
unrelated changes. Local commits are allowed; remote writes require approval.
