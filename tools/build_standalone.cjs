'use strict';
// Bundle the real local dependency and application, not a download-only wrapper.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
source = source.replace(/<script src="([^"]+)"><\/script>/g, (_, relative) => {
  const full = path.resolve(root, relative);
  if (!full.startsWith(root + path.sep)) throw new Error('External script path rejected');
  return '<script>\n' + fs.readFileSync(full, 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>';
});
if (/<script src=/.test(source)) throw new Error('Unbundled script remains');
const output = process.argv[2] || path.join(root, '..', 'IGNIA_Next_Studio.html');
fs.writeFileSync(output, source);
console.log(output);
