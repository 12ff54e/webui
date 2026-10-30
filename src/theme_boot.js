// Optional classic script: restore the document theme before styles can paint.
(() => {
    const script = document.currentScript;
    const fallback = script?.dataset.defaultMode === 'dark' ? 'dark' : 'light';
    const corners_fallback = script?.dataset.defaultCorners === 'sharp' ? 'sharp' : 'rounded';
    const key = script?.dataset.storageKey;
    const corners_key = script?.dataset.cornersStorageKey;
    const read = key => { if (key) { try { return localStorage.getItem(key); } catch {} } };
    const saved = read(key), saved_corners = read(corners_key);
    const name = script?.dataset.theme ?? document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = ['cloisonne', 'sorghum', 'gromwell', 'carbon'].includes(name) ? name : 'default';
    document.documentElement.dataset.mode = saved === 'light' || saved === 'dark' ? saved : fallback;
    document.documentElement.dataset.corners = saved_corners === 'rounded' || saved_corners === 'sharp' ? saved_corners : corners_fallback;
})();
