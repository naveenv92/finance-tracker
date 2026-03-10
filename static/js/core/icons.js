// SVG sprite sheet — injected once at the start of <body> so all pages can
// reference icons via <use href="#icon-*"/> without duplicating markup.
(function () {
  var sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sprite.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  sprite.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  sprite.setAttribute('aria-hidden', 'true');
  sprite.innerHTML = [
    '<symbol id="icon-dashboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<rect x="3" y="3" width="7" height="7" rx="1"/>',
      '<rect x="14" y="3" width="7" height="7" rx="1"/>',
      '<rect x="3" y="14" width="7" height="7" rx="1"/>',
      '<rect x="14" y="14" width="7" height="7" rx="1"/>',
    '</symbol>',

    '<symbol id="icon-import" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
      '<polyline points="17 8 12 3 7 8"/>',
      '<line x1="12" y1="3" x2="12" y2="15"/>',
    '</symbol>',

    '<symbol id="icon-review" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>',
      '<rect x="9" y="3" width="6" height="4" rx="1"/>',
      '<polyline points="9 12 11 14 15 10"/>',
    '</symbol>',

    '<symbol id="icon-transactions" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<line x1="8" y1="6" x2="21" y2="6"/>',
      '<line x1="8" y1="12" x2="21" y2="12"/>',
      '<line x1="8" y1="18" x2="21" y2="18"/>',
      '<circle cx="3.5" cy="6" r="0.5" fill="currentColor" stroke="none"/>',
      '<circle cx="3.5" cy="12" r="0.5" fill="currentColor" stroke="none"/>',
      '<circle cx="3.5" cy="18" r="0.5" fill="currentColor" stroke="none"/>',
    '</symbol>',

    '<symbol id="icon-analytics" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<line x1="18" y1="20" x2="18" y2="10"/>',
      '<line x1="12" y1="20" x2="12" y2="4"/>',
      '<line x1="6" y1="20" x2="6" y2="14"/>',
      '<line x1="2" y1="20" x2="22" y2="20"/>',
    '</symbol>',

    '<symbol id="icon-categories" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>',
      '<circle cx="7" cy="7" r="1" fill="currentColor" stroke="none"/>',
    '</symbol>',

    '<symbol id="icon-templates" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>',
      '<polyline points="14 2 14 8 20 8"/>',
      '<line x1="16" y1="13" x2="8" y2="13"/>',
      '<line x1="16" y1="17" x2="8" y2="17"/>',
      '<line x1="10" y1="9" x2="8" y2="9"/>',
    '</symbol>',

    '<symbol id="icon-change-db" viewBox="-3 0 30 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<!-- Database cylinder (compact, upper portion) -->',
      '<ellipse cx="12" cy="3" rx="6" ry="2"/>',
      '<path d="M6 3v9c0 1.1 2.69 2 6 2s6-0.9 6-2V3"/>',
      '<path d="M6 8c0 1.1 2.69 2 6 2s6-0.9 6-2"/>',
      '<!-- Double-headed arrow fully below the DB -->',
      '<path d="M-3,20 L7,16 L7,18.5 L17,18.5 L17,16 L27,20 L17,24 L17,21.5 L7,21.5 L7,24 Z" fill="var(--white)" stroke-linejoin="miter"/>',
    '</symbol>',

    '<symbol id="icon-settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<circle cx="12" cy="12" r="3"/>',
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    '</symbol>',
  ].join('');

  document.body.insertBefore(sprite, document.body.firstChild);
}());
