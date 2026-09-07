/** Uncompressed single-part FLOAT scanline OpenEXR writer and AOV export.
 * File layout: https://openexr.com/en/latest/OpenEXRFileLayout.html
 * GPL-2.0-only. No color conversion, exposure, or post-processing is applied.
 */
(function(global){
 'use strict';
 const encoder=new TextEncoder();
 const cstr=s=>encoder.encode(s+'\0');
 function concat(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.byteLength,0));let at=0;for(const p of parts){out.set(p,at);at+=p.byteLength;}return out;}
 function ints(values){const a=new Uint8Array(values.length*4),v=new DataView(a.buffer);values.forEach((x,i)=>v.setInt32(i*4,x,true));return a;}
 function floats(values){const a=new Uint8Array(values.length*4),v=new DataView(a.buffer);values.forEach((x,i)=>v.setFloat32(i*4,x,true));return a;}
 function attribute(name,type,data){return concat([cstr(name),cstr(type),ints([data.length]),data]);}
 function encode(width,height,rgba,{flipY=false,label='linear radiance'}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>16777216)throw Error('EXR image dimensions exceed the 16M-pixel allocation limit');
  if(!(rgba instanceof Float32Array)||rgba.length!==width*height*4)throw Error('EXR requires a Float32Array with four channels per pixel');
  for(const x of rgba)if(!Number.isFinite(x))throw Error('EXR input contains nonfinite pixels');
  const names=['A','B','G','R'],indices=[3,2,1,0];
  const channels=concat([...names.map(n=>concat([cstr(n),ints([2]),new Uint8Array(4),ints([1,1])])),new Uint8Array(1)]);
  const header=concat([ints([20000630,2]),attribute('channels','chlist',channels),attribute('compression','compression',new Uint8Array([0])),attribute('dataWindow','box2i',ints([0,0,width-1,height-1])),attribute('displayWindow','box2i',ints([0,0,width-1,height-1])),attribute('lineOrder','lineOrder',new Uint8Array([0])),attribute('pixelAspectRatio','float',floats([1])),attribute('screenWindowCenter','v2f',floats([0,0])),attribute('screenWindowWidth','float',floats([1])),attribute('comments','string',encoder.encode('IGNIA / '+label+' / FLOAT / no display transform')),new Uint8Array(1)]);
  const scanlineSize=8+width*16,start=header.length+height*8,out=new Uint8Array(start+height*scanlineSize),view=new DataView(out.buffer);out.set(header);
  for(let y=0;y<height;y++){
   const row=start+y*scanlineSize;view.setBigUint64(header.length+y*8,BigInt(row),true);view.setInt32(row,y,true);view.setInt32(row+4,width*16,true);
   const sy=flipY?height-y-1:y;
   for(let c=0;c<4;c++)for(let x=0;x<width;x++)view.setFloat32(row+8+(c*width+x)*4,rgba[(sy*width+x)*4+indices[c]],true);
  }
  return out;
 }
 const names={1:'linear_volume_radiance',2:'opacity_weighted_depth',3:'opacity_weighted_density_gradient_normal',4:'opacity_weighted_velocity',5:'opacity_weighted_world_position'};
 function install(app){
  app.readAOV=(mode=1)=>{
   if(!names[mode])throw Error('AOV mode must be an integer from 1 to 5');
   const r=app.render,old={aov:r.aov,view:r.view,transparent:r.transparent};
   try{r.aov=mode;r.view=0;r.transparent=0;r.render(app.auto?app.shot:null,app.clock);const data=app.readField(r.image,0);return {width:r.image.w,height:r.image.h,data,label:names[mode],simulationTime:app.flow.time,origin:'bottom-left',grid:[...r.flow.grid],note:mode===1?'Emission and approximate single-scattered light, linear RGB; optical extinction alpha.':'Opacity-weighted field moment, not a geometric surface or deep EXR. Alpha includes the heat visibility proxy.'};}
   finally{Object.assign(r,old);}
  };
  app.exportEXR=(mode=1)=>{const result=app.readAOV(mode),bytes=encode(result.width,result.height,result.data,{flipY:true,label:result.label});const url=URL.createObjectURL(new Blob([bytes],{type:'image/x-exr'})),a=document.createElement('a');a.href=url;a.download='IGNIA_'+result.label+'.exr';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return {...result,data:undefined,bytes:bytes.length};};
  const button=document.getElementById('exportEXR');if(button)button.onclick=()=>{try{const mode=+document.getElementById('aovExport').value,meta=app.exportEXR(mode);document.getElementById('status').textContent='Exported '+meta.label+' / '+meta.width+' × '+meta.height+' / scene-linear FLOAT EXR';}catch(e){document.getElementById('status').textContent=e.message;}};
 }
 global.IGNIAEXR={encode,install,names};
})(globalThis);
