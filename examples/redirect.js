// Keep theme links and section anchors when entering through the site root.
const gallery = new URL('examples/', location.href);
gallery.search = location.search;
gallery.hash = location.hash;
location.replace(gallery.href);
