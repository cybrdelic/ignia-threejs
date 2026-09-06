'use strict';
(() => {
  let encoded = '';
  for (let i = 0; i < 4; i++) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `src/presets-data.${i}.b64`, false);
    xhr.send(null);
    if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0)) throw new Error(`Failed to load preset data part ${i}`);
    encoded += xhr.responseText.trim();
  }
  (0, eval)(atob(encoded));
})();
