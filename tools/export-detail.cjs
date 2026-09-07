const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let s=fs.readFileSync(path.join(__dirname,'../src/engine.js'),'utf8');s=s.slice(0,s.lastIndexOf('main().catch'));
const ctx={URLSearchParams,location:{search:''},window:{},document:{querySelector:()=>null},console};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,"../src/presets.js"),"utf8"),ctx);
vm.runInContext(s+'\n'+fs.readFileSync(path.join(__dirname,'../src/detail-shaders.js'),'utf8')+'\nglobalThis.DETAIL=window.PYRE2DetailShaders(gridGLSL);',ctx);
fs.writeFileSync(path.join(__dirname,'detail-shaders.json'),JSON.stringify(ctx.DETAIL));
