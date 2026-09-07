'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/<\/script/gi,'<\\/script');
let presetEncoded='';
for(let i=0;i<6;i++){
 let part=fs.readFileSync(path.join(root,`src/presets-full.${i}.b64`),'utf8').trim();
 if(i===4)part=part.slice(0,9000);
 presetEncoded+=part;
}
if(presetEncoded.length!==46116)throw Error(`Preset payload length mismatch: ${presetEncoded.length}`);
const presetBuffer=Buffer.from(presetEncoded,'base64');
if(presetBuffer.length!==34586)throw Error(`Preset source length mismatch: ${presetBuffer.length}`);
const presetHash=crypto.createHash('sha256').update(presetBuffer).digest('hex');
if(presetHash!=='e3ba0f60ed616a96945ad97597bf78c7e3eed2bebbe114835355acd744311dee')throw Error(`Preset source hash mismatch: ${presetHash}`);
const presetSource=presetBuffer.toString('utf8').replace(/<\/script/gi,'<\\/script');
const groups={
 'src/presets.js':[presetSource],
 'src/controls.js':[read('src/controls.js')],
 'src/studio.js':[read('src/studio.js')],
 'src/detail.js':[read('src/detail-shaders.js'),read('src/detail-core.js')],
 'src/engine.js':['src/engine-gpu.js','src/engine-flow-core.js','src/ci-smoke.js','src/engine-shaders-material.js','src/engine-shaders-render.js','src/engine-renderer.js','src/engine-main.js'].map(read)
};
for(const [tag,sources] of Object.entries(groups)){
 html=html.replace(`<script src="${tag}"></script>`,`<script>\n${sources.join('\n')}\n<\\/script>`);
}
const out=process.argv[2]||path.join(root,'IGNIA_Studio.html');
fs.writeFileSync(out,html);console.log(`${out}\npresets ${presetHash}`);
