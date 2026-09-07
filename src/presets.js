'use strict';
(() => {
  let encoded = '';
  for (let i = 0; i < 6; i++) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `src/presets-full.${i}.b64`, false);
    xhr.send(null);
    if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0)) {
      throw new Error(`Failed to load verified preset source part ${i}`);
    }
    let part = xhr.responseText.trim();
    // The historical GitHub transfer accidentally appended part 5 to part 4.
    // Keep the first 9000 bytes of part 4, then append the real part 5 once.
    if (i === 4) part = part.slice(0, 9000);
    encoded += part;
  }
  if (encoded.length !== 46116) throw new Error(`Preset source payload length mismatch: ${encoded.length}`);
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  if (bytes.length !== 34586) throw new Error(`Preset source decoded length mismatch: ${bytes.length}`);
  const source = new TextDecoder().decode(bytes);
  (0, eval)(source);
})();
