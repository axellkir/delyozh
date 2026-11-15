'use strict';
// При сборке (scripts/build.mjs) сюда подставляется номер релиза.
const VERSION = 'dev';
{ const el = document.getElementById('ver'); if (el) el.textContent = VERSION; }
