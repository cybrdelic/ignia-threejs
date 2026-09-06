/* Pin and vendor the official Three.js distribution; do not substitute a stub. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'node_modules','three','build'),out=path.join(root,'vendor');
fs.mkdirSync(out,{recursive:true});
for(const name of ['three.module.min.js','three.core.min.js']){
 const src=path.join(source,name);
 if(!fs.existsSync(src))throw new Error('Missing official Three.js build: '+src);
 fs.copyFileSync(src,path.join(out,name));
}
fs.copyFileSync(path.join(root,'node_modules','three','LICENSE'),path.join(out,'THREE-LICENSE.txt'));
console.log('Vendored Three.js r180. The regular local-server app now runs without a CDN.');
