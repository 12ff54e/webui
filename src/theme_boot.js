// Optional classic script: restore the document theme before styles can paint.
(() => {
    const script = document.currentScript;
    const fallback = script?.dataset.defaultMode === 'dark' ? 'dark' : 'light';
    const key = script?.dataset.storageKey;
    let saved;
    if (key) {
        try { saved = localStorage.getItem(key); } catch {}
    }
    const name = script?.dataset.theme ?? document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = name === 'cloisonne' || name === 'sorghum' ? name : 'default';
    document.documentElement.dataset.mode = saved === 'light' || saved === 'dark' ? saved : fallback;
})();
