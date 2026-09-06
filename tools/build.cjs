'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/<\/script/gi,'<\\/script');
const presetData=Buffer.concat([0,1,2,3].map(i=>Buffer.from(fs.readFileSync(path.join(root,`src/presets-data.${i}.b64`),'utf8').trim(),'base64'))).toString('utf8').replace(/<\/script/gi,'<\\/script');
const groups={
 'src/presets.js':['src/presets-glsl.js',null,'src/presets-runtime.js'],
 'src/controls.js':['src/controls.js'],
 'src/studio.js':['src/studio.js'],
 'src/detail.js':['src/detail-shaders.js','src/detail-core.js'],
 'src/engine.js':['src/engine-gpu.js','src/engine-flow-core.js','src/engine-shaders-material.js','src/engine-shaders-render.js','src/engine-renderer.js','src/engine-main.js']
};
for(const [tag,files] of Object.entries(groups)){
 const source=files.map(f=>f?read(f):presetData).join('\n');
 html=html.replace(`<script src="${tag}"></script>`,`<script>\n${source}\n<\\/script>`);
}
const out=process.argv[2]||path.join(root,'IGNIA_Studio.html');
fs.writeFileSync(out,html);console.log(out);
