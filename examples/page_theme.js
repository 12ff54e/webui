// Select the gallery palette before the shared boot helper restores its mode.
document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') ?? 'default';
