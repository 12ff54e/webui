KaTeX 0.19.1

Source: https://registry.npmjs.org/katex/-/katex-0.19.1.tgz
Package integrity (SHA-512, base64):
jG8uKntjSEcm2EpQOh0XturpPuuC9r3Sq5HLHdsFdWZT27E672SF19QEi+of0/YeOy15lDgRhKvr5614uRrEfA==

katex.mjs, LICENSE, and the WOFF2 fonts are unchanged from the official package.
katex.css prefixes style selectors with .wui, resets equation counters on .wui
instead of body, and references only the included WOFF2 fonts. No CDN is used.

To reproduce these files, unpack the verified package and run:
node scripts/vendor-katex.mjs /path/to/package

The script accepts the pinned version and rejects unknown CSS rule types.
Review those assumptions when upgrading. Applications use the checked-in files
directly; they do not need this script or a package manager.
