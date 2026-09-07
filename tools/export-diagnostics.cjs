// Export the SAME discrete solid predicate used by the solver. A float64 CPU
// inequality can disagree with float32 GLSL at voxel centers on a box face.
const fs=require('fs'),vm=require('vm'),path=require('path');
let source=fs.readFileSync(path.join(__dirname,'../src/engine.js'),'utf8');source=source.slice(0,source.lastIndexOf('main().catch'));
const ctx={URLSearchParams,location:{search:''},window:{},document:{querySelector:()=>null},console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/presets.js'),'utf8'),ctx);
vm.runInContext(source+'\nglobalThis.MASK=gridGLSL+"out vec4 O;void main(){vec3 p=cell();O=vec4(solid(p),world(p).y,0,1);}";',ctx);
fs.writeFileSync(path.join(__dirname,'diagnostics-shaders.json'),JSON.stringify({solidMask:ctx.MASK}));
