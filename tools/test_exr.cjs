const fs=require('fs'),path=require('path');require('../src/exr.js');
const w=8,h=4,data=new Float32Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set([x/4-1,y/3,2.5+x+y,x/7],(y*w+x)*4);
fs.writeFileSync(path.join(__dirname,'../validation/exr_fixture.exr'),IGNIAEXR.encode(w,h,data));fs.writeFileSync(path.join(__dirname,'../validation/exr_fixture.rgba32f'),new Uint8Array(data.buffer));
for(const f of [()=>IGNIAEXR.encode(0,h,data),()=>IGNIAEXR.encode(w,h,new Float32Array(2)),()=>{data[0]=NaN;IGNIAEXR.encode(w,h,data)}]){let rejected=false;try{f()}catch{rejected=true}if(!rejected)throw Error('Malformed input accepted');}
console.log('EXR fixture and validation checks passed');
