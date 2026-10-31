// Assemble the example site. Copy sources unchanged into their serving layout.
import {cp, mkdir, rm} from 'node:fs/promises';
const output = new URL('../build/', import.meta.url);
await rm(output, {recursive: true, force: true});
await mkdir(new URL('webui/', output), {recursive: true});
await cp(new URL('../examples/', import.meta.url), output, {recursive: true});
for (const path of ['src', 'styles', 'vendor'])
    await cp(new URL(`../${path}`, import.meta.url), new URL(`webui/${path}`, output), {recursive: true});
console.log(`Example site: ${output.pathname}`);
