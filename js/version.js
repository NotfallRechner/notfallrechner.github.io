// Bump `number` and `date` with every release: open apps compare it with the
// published file and offer a reload when they differ.
(function (root) {
  'use strict';

  const VERSION = {
    number: '2.1.0',
    date: '2026-10-16',
    repo: 'https://github.com/NotfallRechner/notfallrechner.github.io',
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = VERSION;
  else root.NotfallVersion = VERSION;
})(this);
