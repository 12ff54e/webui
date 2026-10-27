// Connect to an existing browser; never launch or alter a user's browser profile.
import {connectCdp} from './cdp.mjs';

const url = process.argv[2] ?? 'http://localhost:6969/magnetic-equilibrium-solver/webui/tests/';
const base = process.env.WEBUI_CDP_URL ?? 'http://localhost:9333';
const version = await (await fetch(`${base}/json/version`)).json();
const cdp = await connectCdp(version.webSocketDebuggerUrl);
let target, session;
try {
    target = (await cdp.call('Target.createTarget', {url: 'about:blank', newWindow: false})).targetId;
    session = (await cdp.call('Target.attachToTarget', {targetId: target, flatten: true})).sessionId;
    const call = (name, params = {}) => cdp.call(name, params, session);
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Network.enable');
    await call('Network.setCacheDisabled', {cacheDisabled: true});
    // Keep saved-theme fixtures within this disposable tab.
    await call('Page.addScriptToEvaluateOnNewDocument', {source:
        `Object.defineProperty(window, 'localStorage', {get: () => window.sessionStorage});`});
    const errors = [];
    const off = cdp.on('Runtime.exceptionThrown', (event, id) => {
        if (id === session) errors.push(event.exceptionDetails.exception?.description ?? event.exceptionDetails.text);
    });
    await call('Page.navigate', {url});
    await call('Page.bringToFront');
    const deadline = Date.now() + 30000;
    let result;
    while (Date.now() < deadline) {
        result = (await call('Runtime.evaluate', {expression: 'window.webuiResult', returnByValue: true})).result.value;
        if (result || errors.length) break;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    off();
    if (errors.length) throw new Error(errors.join('\n'));
    if (!result) throw new Error(`No browser result after 30 seconds: ${url}`);
    console.log(JSON.stringify({browser: version.Browser, url, ...result}, null, 2));
    if (!result.pass) process.exitCode = 1;
} finally {
    if (target) await cdp.call('Target.closeTarget', {targetId: target}).catch(() => {});
    cdp.close();
}
