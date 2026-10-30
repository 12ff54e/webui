// Optional static staging only. The source tree runs directly over HTTP too.
import {cp, mkdir, rm} from 'node:fs/promises';
const output = new URL('../build/', import.meta.url);
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
for (const path of ['src', 'styles', 'vendor', 'examples', 'index.html', 'README.md'])
    await cp(new URL(`../${path}`, import.meta.url), new URL(path, output), {recursive: true});
console.log(`Static package: ${output.pathname}`);
