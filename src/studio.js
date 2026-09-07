/** PYRE II authoring/inspection layer. The solver never reads pixels from this UI. */
'use strict';
window.PYRE2Studio = (() => {
  const presets = {
    refined: {scene:0, obstacle:0, fuel:1.85, wind:.06, vorticity:3.6, sourceRadius:.23, ignition:1, burst:0},
    hearth: {scene:0, obstacle:0, fuel:1.6, wind:0, vorticity:3.2, sourceRadius:.23, ignition:1, burst:0},
    jet: {scene:1, obstacle:0, fuel:3.2, wind:0, vorticity:3.2, sourceRadius:.34, ignition:1, burst:0},
    collider: {scene:1, obstacle:1, fuel:3.2, wind:0, vorticity:3.2, sourceRadius:.34, ignition:1, burst:0},
    puff: {scene:2, obstacle:0, fuel:6, wind:0, vorticity:4.2, sourceRadius:.60, ignition:1, burst:1},
    smoke: {scene:3, obstacle:2, fuel:1.8, wind:0, vorticity:2.6, sourceRadius:.33, ignition:1, burst:0},
    trail: {scene:4, obstacle:0, fuel:2.8, wind:0, vorticity:3.0, sourceRadius:.22, ignition:1, burst:0}
  };
  let app=null, tour=null, busy=false;
  const el=id=>document.getElementById(id);
  const notice=t=>{el('status').textContent=t;};
  const nextFrame=()=>new Promise(r=>requestAnimationFrame(r));
  function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
  function updateControls(){
    const f=app.flow;
    for(const name of ['fuel','wind','vorticity']){el(name).value=f[name];el(name+'Value').textContent=f[name].toFixed(2);}
    el('collider').value=f.obstacle;el('pilot').checked=!!f.ignition;
  }
  function preset(name, reset=true){
    const p=presets[name];if(!p)throw Error('Unknown preset');
    if(name==='refined')app.flow.configure('film');Object.assign(app.flow,p);if(reset)app.flow.reset();app.render.view=0;el('view').value='0';el('preset').value=name;
    app.clock=0;app.auto=true;app.shot=name==='collider'?'close':'orbit';app.paused=false;el('pause').textContent='Pause';updateControls();
    if(name==='refined'){app.enableDetail(2);app.render.exposure=1.35;app.render.steps=256;app.shot='film';el('quality').value='film';el('exposure').value='1.35';el('exposureValue').textContent='1.35';}
    notice('Preset: '+name+' / '+(reset?'cold start':'simulated warm start'));
  }
  function beforeStep(a,dt){
    if(a.flow.pyre3){if([2,11].includes(a.flow.pyre3.emitter))a.flow.burst=a.flow.time+1e-9<a.flow.pyre3.pulseDuration?1:0;return;}if(a.flow.scene===2)a.flow.burst=a.flow.time<.28?1:0;
    if(!tour)return;
    const t=tour.elapsed;
    const phase=t<8?0:t<14?1:t<20?2:t<25?3:t<30?4:5;
    if(phase!==tour.phase){
      tour.phase=phase;
      if(phase===0)preset('hearth');
      if(phase===1)preset('hearth');
      if(phase===2)preset('collider');
      if(phase===3)preset('puff');
      if(phase===4)preset('smoke');
      if(phase===5){tour=null;el('tour').textContent='Run controlled test tour';a.paused=true;el('pause').textContent='Resume';notice('Tour finished. Inspect any field or export the state.');return;}
    }
    if(phase===0){a.flow.fuel=t<3?1.6:0;a.flow.ignition=t<1?0:1;}
    if(phase===1)a.flow.wind=t<11?1.5:-1.5;
    tour.elapsed+=dt;updateControls();
    notice(['Ignition at 1 s; fuel shuts off at 3 s','Controlled wind reversal','Solid collider: zero interior fields','Finite fuel pulse','Soot / plate deflection'][phase]);
  }
  function floatToHalf(data){
    const result=new Uint16Array(data.length),bits=new Uint32Array(data.buffer,data.byteOffset,data.length);
    for(let i=0;i<data.length;i++){
      const x=bits[i],sign=(x>>>16)&0x8000,exp=((x>>>23)&255)-127+15,mant=x&0x7fffff;
      if(exp<=0){result[i]=exp< -10?sign:sign|(((mant|0x800000)>>> (1-exp))+0x1000>>>13);}
      else if(exp>=31)result[i]=sign|0x7c00|(mant?0x200:0);
      else result[i]=sign|(exp<<10)|((mant+0x1000)>>>13);
    }
    return result;
  }
  function readTarget(target,index=0){
    const gpu=app.gpu,g=gpu.gl;
    if(gpu.THREE)gpu.threeRenderer.setRenderTarget(target.rt);else g.bindFramebuffer(g.FRAMEBUFFER,target.f);
    g.readBuffer(g.COLOR_ATTACHMENT0+index);const data=new Float32Array(target.w*target.h*4);
    g.readPixels(0,0,target.w,target.h,g.RGBA,g.FLOAT,data);const error=g.getError();
    if(gpu.THREE)gpu.threeRenderer.resetState();
    if(error!==g.NO_ERROR)throw Error('This browser cannot read floating-point fields (GL '+error+').');
    return data;
  }
  async function exportState(){
    if(busy)return;busy=true;const paused=app.paused;app.paused=true;
    try{
      notice('Reading fluid fields, pressure, and ember tracers…');await nextFrame();
      const f=app.flow,meta={format:'pyre2-state-v1',tier:f.tier,grid:f.grid,size:f.size,time:f.time,fields:['velocity_temperature','fuel_oxygen_soot_reaction','pressure_rgba'],dtype:'float32-le',pyre3:structuredClone(f.pyre3),params:Object.fromEntries(['scene','obstacle','fuel','wind','vorticity','sourceRadius','ignition','burst','ambientOxygen'].map(k=>[k,f[k]]))};
      const payload=[readTarget(f.state[0],0),readTarget(f.state[0],1),readTarget(f.pressure[0])];
      if(app.detail){meta.refinement={scale:app.detail.scale,grid:app.detail.grid,turbulence:app.detail.turbulence};meta.fields.push('refined_velocity_temperature','refined_fuel_oxygen_soot_reaction');payload.push(readTarget(app.detail.state[0],0),readTarget(app.detail.state[0],1));}
      if(app.embers){meta.particles={count:app.embers.count,fields:['position_age','velocity_temperature']};payload.push(readTarget(app.embers.state[0],0),readTarget(app.embers.state[0],1));}
      const json=new TextEncoder().encode(JSON.stringify(meta)),len=new Uint32Array([json.length]);
      const raw=new Blob([len,json,...payload]);
      if(typeof CompressionStream!=='undefined'){
        const blob=await new Response(raw.stream().pipeThrough(new CompressionStream('gzip'))).blob();download(blob,'IGNIA_State.pyre.gz');
      }else download(raw,'IGNIA_State.pyre');
      notice('State exported, including pressure. Same-runtime replay can restore it.');
    }catch(e){notice(e.message);}finally{app.paused=paused;busy=false;}
  }
  async function importState(file){
    if(!file||busy)return;busy=true;const paused=app.paused;app.paused=true;
    try{
      if(file.size>268435456)throw Error('Snapshot is too large.');
      let blob=file;if(file.name.endsWith('.gz')){
        if(typeof DecompressionStream==='undefined')throw Error('Gzip snapshots require DecompressionStream.');
        let expanded=0;const guard=new TransformStream({transform(chunk,controller){expanded+=chunk.byteLength;if(expanded>536870912)throw Error('Expanded snapshot exceeds 512 MiB');controller.enqueue(chunk);}});
        blob=await new Response(file.stream().pipeThrough(new DecompressionStream('gzip')).pipeThrough(guard)).blob();
      }
      const bytes=await blob.arrayBuffer();if(bytes.byteLength>536870912)throw Error('Expanded snapshot exceeds 512 MiB');const view=new DataView(bytes);if(bytes.byteLength<8)throw Error('Truncated snapshot');
      const length=view.getUint32(0,true);if(length>65536||length+4>bytes.byteLength)throw Error('Invalid snapshot header');
      const meta=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,4,length)));
      if(meta.format!=='pyre2-state-v1'||!['draft','balanced','film','high','ultra'].includes(meta.tier))throw Error('Unsupported snapshot format');
      const tiers={draft:[40,64,40],balanced:[56,88,56],film:[64,96,64],high:[72,112,72],ultra:[128,192,128]};
      if(JSON.stringify(meta.grid)!==JSON.stringify(tiers[meta.tier]))throw Error('Snapshot grid does not match its declared tier');
      const w=meta.grid[0]*8,h=meta.grid[1]*Math.ceil(meta.grid[2]/8),count=w*h*4,offset=4+length;
      let fineCount=0,fineWidth=0,fineHeight=0;
      if(meta.refinement){const z=meta.refinement;if(![2,3].includes(z.scale)||JSON.stringify(z.grid)!==JSON.stringify(meta.grid.map(n=>n*z.scale)))throw Error('Invalid refinement grid');if(z.grid.reduce((a,b)=>a*b,1)>12000000)throw Error('Refinement exceeds the allocation limit');fineWidth=z.grid[0]*8;fineHeight=z.grid[1]*Math.ceil(z.grid[2]/8);fineCount=fineWidth*fineHeight*4;if(!Number.isFinite(z.turbulence)||z.turbulence<0||z.turbulence>2)throw Error('Invalid refinement turbulence');}
      const particleCount=meta.particles?.count||0;if(particleCount&&(!Number.isInteger(particleCount)||particleCount!==app.embers?.count))throw Error('Unsupported ember allocation');
      if(bytes.byteLength!==offset+count*12+fineCount*8+particleCount*32)throw Error('Snapshot payload length mismatch');
      // Array buffers begin at arbitrary header offsets; copy before interpreting.
      const fields=[0,1,2].map(i=>new Float32Array(bytes.slice(offset+i*count*4,offset+(i+1)*count*4)));
      for(const field of fields)for(let i=0;i<field.length;i++)if(!Number.isFinite(field[i])||Math.abs(field[i])>65504)throw Error('Snapshot contains invalid half-float values');
      const refined=fineCount?[0,1].map(i=>new Float32Array(bytes.slice(offset+count*12+i*fineCount*4,offset+count*12+(i+1)*fineCount*4))):[];
      for(const field of refined)for(let i=0;i<field.length;i++)if(!Number.isFinite(field[i])||Math.abs(field[i])>65504)throw Error('Invalid half-float refinement field');
      const po=offset+count*12+fineCount*8;const particleFields=particleCount?[0,1].map(i=>new Float32Array(bytes.slice(po+i*particleCount*16,po+(i+1)*particleCount*16))):[];
      for(const field of particleFields)for(const v of field)if(!Number.isFinite(v)||Math.abs(v)>65504)throw Error('Invalid ember field');
      const allowed=['scene','obstacle','fuel','wind','vorticity','sourceRadius','ignition','burst','ambientOxygen'];const params={};for(const key of allowed){const value=meta.params?.[key];if(!Number.isFinite(value))throw Error('Invalid parameter '+key);params[key]=value;}
      if(![0,1,2,3,4].includes(params.scene)||![0,1,2,3].includes(params.obstacle))throw Error('Unknown emitter or collider');
      if(meta.pyre3)window.PYRE3Validate(meta.pyre3);if(!Number.isFinite(Number(meta.time)))throw Error('Invalid simulation time');const f=app.flow,g=app.gpu;if(app.enableDetail)app.enableDetail(0);f.configure(meta.tier);Object.assign(f,params);if(meta.pyre3){window.PYRE3Validate(meta.pyre3);f.pyre3=structuredClone(meta.pyre3);}f.time=Number(meta.time);if(!Number.isFinite(f.time))throw Error('Invalid simulation time');
      const tex=fields.map(a=>g.uploadHalf(w,h,floatToHalf(a)));
      if(!f.restorePair)f.restorePair=g.program('in vec2 vUV;uniform sampler2D uSV,uSC;layout(location=0)out vec4 O;layout(location=1)out vec4 C;void main(){O=texelFetch(uSV,ivec2(gl_FragCoord.xy),0);C=texelFetch(uSC,ivec2(gl_FragCoord.xy),0);}');
      if(!f.restoreP)f.restoreP=g.program('in vec2 vUV;uniform sampler2D uSP;out vec4 O;void main(){O=texelFetch(uSP,ivec2(gl_FragCoord.xy),0);}');
      for(const t of f.state)g.pass(f.restorePair,t,{uSV:tex[0],uSC:tex[1]});
      for(const t of f.pressure)g.pass(f.restoreP,t,{uSP:tex[2]});
      for(const t of tex)g.disposeTexture(t);
      if(refined.length){if(!app.enableDetail)throw Error('This build cannot restore refinement');const detail=app.enableDetail(meta.refinement.scale);detail.turbulence=meta.refinement.turbulence;const ft=refined.map(a=>g.uploadHalf(fineWidth,fineHeight,floatToHalf(a)));for(const t of detail.state)g.pass(f.restorePair,t,{uSV:ft[0],uSC:ft[1]});for(const t of ft)g.disposeTexture(t);}
      if(app.embers){if(particleFields.length){const pt=particleFields.map(a=>g.uploadHalf(particleCount,1,floatToHalf(a)));for(const t of app.embers.state)g.pass(f.restorePair,t,{uSV:pt[0],uSC:pt[1]});pt.forEach(t=>g.disposeTexture(t));}else app.embers.reset();}
      f.tick++;app.render.cacheTick=-1;el('quality').value=f.tier;updateControls();if(app.syncControls)app.syncControls();
      notice('Snapshot restored. Temperature, species, velocity, and pressure loaded.');
    }catch(e){notice(e.message);}finally{app.paused=paused;busy=false;}
  }
  async function flipbook(){
    if(busy)return;busy=true;const paused=app.paused;app.paused=true;
    try{
      const count=16,cols=4,rows=4,width=320,height=180,fps=12;
      const sheet=document.createElement('canvas');sheet.width=cols*width;sheet.height=rows*height;const ctx=sheet.getContext('2d');
      const initialTime=app.flow.time,transparent=el('alphaExport').checked;
      const originalTransparent=app.render.transparent;app.render.transparent=transparent?1:0;
      const target=transparent?app.gpu.target(el('viewport').width,el('viewport').height,1,true,'byte'):null;
      const tile=document.createElement('canvas');tile.width=el('viewport').width;tile.height=el('viewport').height;const tileCtx=tile.getContext('2d');
      for(let i=0;i<count;i++){
        notice('Simulating color flipbook '+(i+1)+' / '+count+'…');
        for(let j=0;j<10;j++){beforeStep(app,1/120);app.flow.step(1/120);}
        app.render.render(app.auto?app.shot:null,app.clock+i/fps,target);
        if(transparent){const gpu=app.gpu,g=gpu.gl;if(gpu.THREE)gpu.threeRenderer.setRenderTarget(target.rt);else g.bindFramebuffer(g.FRAMEBUFFER,target.f);g.readBuffer(g.COLOR_ATTACHMENT0);const pixels=new Uint8Array(target.w*target.h*4);g.readPixels(0,0,target.w,target.h,g.RGBA,g.UNSIGNED_BYTE,pixels);if(g.getError()!==g.NO_ERROR)throw Error('RGBA export readback failed');const flipped=new Uint8ClampedArray(pixels.length);for(let y=0;y<target.h;y++)flipped.set(pixels.subarray((target.h-1-y)*target.w*4,(target.h-y)*target.w*4),y*target.w*4);tileCtx.putImageData(new ImageData(flipped,target.w,target.h),0,0);if(gpu.THREE)gpu.threeRenderer.resetState();}
        ctx.drawImage(transparent?tile:el('viewport'),(i%cols)*width,Math.floor(i/cols)*height,width,height);await nextFrame();
      }
      if(target)app.gpu.destroy(target);app.render.transparent=originalTransparent;
      const image=await new Promise(r=>sheet.toBlob(r,'image/png'));download(image,'PYRE_III_Color_Flipbook.png');
      download(new Blob([JSON.stringify({format:'pyre2-color-flipbook-v1',columns:cols,rows,frameCount:count,frameWidth:width,frameHeight:height,fps,grid:app.flow.grid,scalarGrid:(app.detail||app.flow).grid,refinementFactor:app.detail?.scale||1,backend:app.info().backend,startTime:initialTime,endTime:app.flow.time,alpha:transparent,includesStage:!transparent,alphaSemantics:transparent?'visual emission/extinction compositing mask':'opaque',view:app.render.view},null,2)],{type:'application/json'}),'PYRE_III_Color_Flipbook.json');
      notice('Color flipbook exported. '+(transparent?'RGBA, no stage; visual compositing alpha.':'Opaque with stage.'));
    }catch(e){notice(e.message);}finally{app.render.transparent=0;app.paused=paused;busy=false;}
  }
  async function inspect(){
    if(busy)return;busy=true;
    try{
      const inspected=app.detail||app.flow;const v=readTarget(inspected.state[0]),c=readTarget(inspected.state[0],1);let speed=0,temp=0,burn=0,finite=true;
      for(let i=0;i<v.length;i+=4){speed=Math.max(speed,Math.hypot(v[i],v[i+1],v[i+2]));temp=Math.max(temp,v[i+3]);burn+=c[i+3];for(let k=0;k<4;k++)finite=finite&&Number.isFinite(v[i+k])&&Number.isFinite(c[i+k]);}
      const stats={...app.info(),finite,maxSpeed:speed,maximumModelKelvin:300+1420*temp,reactionSum:burn,temperatureIsCalibrated:false,readbackWallTime:performance.now()};
      el('inspection').textContent=`Finite: ${finite}  |  max speed: ${speed.toFixed(2)} m/s\nModel temperature: ${stats.maximumModelKelvin.toFixed(0)} K (uncalibrated)\nBackend: ${stats.backend}`;window.PYRE_INSPECTION=stats;
    }catch(e){notice(e.message);}finally{busy=false;}
  }
  async function benchmark(){
    if(busy)return;busy=true;const paused=app.paused;app.paused=true;app.benchmarking=true;
    try{
      const count=24,times=[];notice('Benchmarking this device; no assumed frame rate…');app.gpu.gl.finish();
      const wall=performance.now(),initial=app.flow.time;
      for(let i=-3;i<count;i++){
        const start=performance.now();await nextFrame();
        for(let j=0;j<4;j++){beforeStep(app,1/120);app.flow.step(1/120);}
        app.render.render(app.auto?app.shot:null,app.clock);app.gpu.gl.finish();
        const probe=new Uint8Array(4);app.gpu.gl.readPixels(0,0,1,1,app.gpu.gl.RGBA,app.gpu.gl.UNSIGNED_BYTE,probe);
        if(app.gpu.gl.getError()!==app.gpu.gl.NO_ERROR)throw Error("Benchmark readback failed");
        if(i>=0)times.push(performance.now()-start);
      }
      const sorted=[...times].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)],p95=sorted[Math.floor((sorted.length-1)*.95)];
      const result={...app.info(),samples:count,solverStepsPerBatch:4,dt:1/120,medianBatchMilliseconds:median,p95BatchMilliseconds:p95,medianEndToEndBatchesPerSecond:1000/median,medianSimulationRealtimeFactor:(1000/median)/30,wallSeconds:(performance.now()-wall)/1000,simulatedSeconds:app.flow.time-initial,includesGPUFinish:true,includesFrameScheduling:true,includesSynchronousReadback:true,includesWarmupInWallSeconds:true,isDisplayedFPS:false};
      window.PYRE_BENCHMARK=result;download(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),'PYRE_III_Device_Benchmark.json');
      notice(`Measured batch: ${median.toFixed(1)} ms median; ${p95.toFixed(1)} ms p95. Report exported.`);
    }catch(e){notice(e.message);}finally{app.benchmarking=false;app.paused=paused;busy=false;}
  }
  function install(a){
    app=a;
    el('preset').onchange=e=>{tour=null;preset(e.target.value);};
    el('view').onchange=e=>{app.render.view=+e.target.value;app.auto=false;app.render.angle=0;app.render.pitch=0;app.render.radius=6.6;app.render.target=[0,2.1,0];};
    el('collider').onchange=e=>{app.flow.obstacle=+e.target.value;app.flow.tick++;};
    el('pilot').onchange=e=>app.flow.ignition=e.target.checked?1:0;
    el('vorticity').oninput=e=>{app.flow.vorticity=+e.target.value;el('vorticityValue').textContent=app.flow.vorticity.toFixed(2);};
    el('slice').oninput=e=>{app.render.slice=+e.target.value;el('sliceValue').textContent=app.render.slice.toFixed(2)+' m';};
    el('cut').onclick=()=>{app.flow.fuel=0;updateControls();notice('Fuel input = 0. Existing fuel, heat, and soot remain in the solver.');};
    el('step').onclick=()=>{app.paused=true;beforeStep(app,1/120);app.flow.step(1/120);app.render.render(app.auto?app.shot:null,app.clock);el('pause').textContent='Resume';};
    el('tour').onclick=()=>{if(tour){tour=null;el('tour').textContent='Run controlled test tour';return;}tour={elapsed:0,phase:-1};app.paused=false;el('tour').textContent='Stop test tour';};
    el('exportState').onclick=exportState;el('importState').onclick=()=>el('stateFile').click();el('stateFile').onchange=e=>importState(e.target.files[0]);
    el('flipbook').onclick=flipbook;el('inspect').onclick=inspect;el('benchmark').onclick=benchmark;
    el('exportPreset').onclick=()=>download(new Blob([JSON.stringify({format:'pyre2-preset-v1',...Object.fromEntries(Object.keys(presets.hearth).map(k=>[k,app.flow[k]]))},null,2)],{type:'application/json'}),'PYRE_III_Preset.json');
    app.exportFlipbook=flipbook;app.benchmark=benchmark;app.exportState=exportState;app.importState=importState;app.inspect=inspect;app.setPreset=preset;app.readField=readTarget;
    updateControls();
  }
  return {install,beforeStep,presets};
})();
