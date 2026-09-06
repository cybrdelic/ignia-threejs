async function main(){
 let THREE=null;
 if(!Q.has('offline')&&!window.__OFFLINE__){
  status('Loading Three.js…');
  try {THREE=await Promise.race([import(new URL('vendor/three.module.min.js',document.baseURI).href).catch(()=>import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js')),new Promise((_,r)=>setTimeout(()=>r(Error('offline')),5000))]);}catch(e){console.info('Offline fallback: identical GLSL, native WebGL2 host.',e.message)}
 }
 const gpu=new GPU(THREE);const flow=new ReactiveFlow(gpu,Q.get('tier')||window.__TIER__||'balanced');
 if(window.PYRE2_WARMSTART&&!Q.has('cold')&&!window.__COLD__){status('Restoring simulated fields…');try{await flow.loadSnapshot(window.PYRE2_WARMSTART)}catch(e){console.warn('Warm start unavailable; starting cold.',e)}}
 const render=new SceneRenderer(gpu,flow);
 render.steps={draft:80,balanced:112,film:192,high:160,ultra:208}[flow.tier];render.scale={draft:.5,balanced:.65,film:.8,high:.85,ultra:1}[flow.tier];
 const app=window.PYRE={gpu,flow,render,ready:true,paused:CAPTURE,auto:!CAPTURE,shot:'orbit',clock:0,perf:[],
  advance(n=1,dt=1/60){for(let i=0;i<n;i++)flow.step(dt)},
  draw(shot='orbit',t=0){render.render(shot,t);gpu.gl.finish();},
  resize(w,h,scale=.8){render.resize(w,h,scale)},
  async screenshot(){return canvas.toDataURL('image/png')},
  info(){return {backend:THREE?'Three.js r'+THREE.REVISION:'native WebGL2 fallback',adapter:gpu.adapter,grid:flow.grid,simTime:flow.time,steps:flow.tick,raySteps:render.steps,resolution:[canvas.width,canvas.height],volumeResolution:[render.image.w,render.image.h]}}
 };
 document.querySelector('#backend').textContent=THREE?'THREE.JS / WEBGL 2':'OFFLINE / WEBGL 2';
 status('Ready');
 const resize=()=>{if(CAPTURE)return;const dpr=Math.min(devicePixelRatio,1.5,Math.sqrt(2073600/(innerWidth*innerHeight)));render.resize(Math.max(1,Math.round(innerWidth*dpr)),Math.max(1,Math.round(innerHeight*dpr)));};resize();addEventListener('resize',resize);
 const el=id=>document.getElementById(id);
 el('simTime').textContent=flow.time.toFixed(2)+' s';el('voxelCount').textContent=(flow.grid.reduce((a,b)=>a*b,1)/1e6).toFixed(2)+' M';el('quality').value=flow.tier;el('fuel').value=flow.fuel;el('fuelValue').textContent=flow.fuel.toFixed(2);el('exposure').value=render.exposure;el('exposureValue').textContent=render.exposure.toFixed(2);
 el('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){status('Fullscreen unavailable: '+e.message)}};
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();app.paused=true;status('Graphics context lost. Reload to restart.');});

 el('quality').onchange=e=>{flow.configure(e.target.value);render.steps={draft:80,balanced:112,film:192,high:160,ultra:208}[e.target.value];if(app.detail)render.steps=Math.max(render.steps,192);render.scale={draft:.5,balanced:.65,film:.8,high:.85,ultra:1}[e.target.value];resize()};
 el('fuel').oninput=e=>{flow.fuel=+e.target.value;el('fuelValue').textContent=flow.fuel.toFixed(2)};
 el('wind').oninput=e=>{flow.wind=+e.target.value;el('windValue').textContent=flow.wind.toFixed(2)};
 el('exposure').oninput=e=>{render.exposure=+e.target.value;el('exposureValue').textContent=render.exposure.toFixed(2)};
 el('pause').onclick=()=>{app.paused=!app.paused;el('pause').textContent=app.paused?'Resume':'Pause'};
 el('reset').onclick=()=>flow.reset();
 el('cinema').onclick=()=>{document.body.classList.toggle('clean')};
 el('orbit').onclick=()=>{app.auto=!app.auto;el('orbit').textContent=app.auto?'Manual camera':'Cinematic orbit'};
 document.querySelectorAll('[data-shot]').forEach(e=>e.onclick=()=>{app.shot=e.dataset.shot;app.clock=0;app.auto=true});
 el('still').onclick=()=>{render.render(app.auto?app.shot:null,app.clock);const a=document.createElement('a');a.download='pyre-still.png';a.href=canvas.toDataURL();a.click()};
 let recorder=null;
 el('record').onclick=()=>{
  if(recorder){recorder.stop();return}
  if(typeof MediaRecorder==='undefined'||!canvas.captureStream){status('Canvas recording is not supported in this browser.');return}
  const types=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];const mimeType=types.find(t=>MediaRecorder.isTypeSupported(t));
  if(!mimeType){status('Recording is unsupported by this browser.');return}
  let stream;const chunks=[];try{stream=canvas.captureStream(30);recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:16000000});}catch(e){if(stream)stream.getTracks().forEach(t=>t.stop());status('Recording unavailable: '+e.message);return}
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onstop=()=>{const url=URL.createObjectURL(new Blob(chunks,{type:mimeType}));const a=document.createElement('a');a.href=url;a.download='pyre-recording.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);stream.getTracks().forEach(t=>t.stop());recorder=null;el('record').textContent='Record WebM';};
  recorder.start();el('record').textContent='Stop recording';
 };
 let drag=null;
 canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);app.auto=false};
 canvas.onpointermove=e=>{if(!drag)return;render.angle-=(e.clientX-drag[0])*.006;render.pitch=clamp(render.pitch+(e.clientY-drag[1])*.004,-.10,.9);drag=[e.clientX,e.clientY]};
 canvas.onpointerup=()=>drag=null;canvas.onwheel=e=>{e.preventDefault();render.radius=clamp(render.radius*Math.exp(e.deltaY*.0007),3.0,15.)};
 addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.code==='Space'){e.preventDefault();el('pause').click()}if(e.key.toLowerCase()==='h')el('cinema').click();if(e.key.toLowerCase()==='r')flow.reset()});
 let last=performance.now(),meter=last,frames=0,acc=0,lastAdapt=last,meterSim=flow.time;
 document.addEventListener('visibilitychange',()=>{last=performance.now();acc=0;});
 function frame(now){
  if(app.benchmarking){last=now;requestAnimationFrame(frame);return;}
  const dt=Math.min((now-last)/1000,.075);last=now;gpu.pollTimer();gpu.beginTimer();
  if(!app.paused){
   // Fixed steps never increase dt to disguise a slow machine. Limit catch-up work;
   // hardware unable to keep pace will run slow, rather than become unstable.
   acc+=dt;let n=0;while(acc>=1/120&&n<4){if(window.PYRE2Studio)window.PYRE2Studio.beforeStep(app,1/120);flow.step(1/120);acc-=1/120;n++}if(n===4)acc=Math.min(acc,1/120);
   app.clock+=dt;
  }
  render.render(app.auto?app.shot:null,app.clock);gpu.endTimer();frames++;
  if(now-meter>1000){
   const fps=frames*1000/(now-meter);if(el('rtf'))el('rtf').textContent=Math.max(0,(flow.time-meterSim)*1000/(now-meter)).toFixed(2)+'x';meterSim=flow.time;el('fps').textContent=fps.toFixed(1);el('simTime').textContent=flow.time.toFixed(2)+' s';el('voxelCount').textContent=(flow.grid.reduce((a,b)=>a*b,1)/1e6).toFixed(2)+' M';
   el('gpuTime').textContent=gpu.gpuMilliseconds===null?'—':gpu.gpuMilliseconds.toFixed(1)+' ms';
   if(el('adaptive').checked&&!app.paused&&now-lastAdapt>2500){
    const ms=gpu.gpuMilliseconds===null?1000/Math.max(fps,1):gpu.gpuMilliseconds;
    const maximum={draft:.5,balanced:.65,film:.8,high:.85,ultra:1}[flow.tier];let scale=render.scale;
    if(ms>34)scale=Math.max(.35,scale*.88);else if(ms<22)scale=Math.min(maximum,scale+.035);
    if(Math.abs(scale-render.scale)>.015){render.scale=scale;resize();}lastAdapt=now;
   }
   el('renderScale').textContent=Math.round(render.scale*100)+'%';frames=0;meter=now;
  }
  requestAnimationFrame(frame);
 }
 if(window.PYRE2Studio)window.PYRE2Studio.install(app);
 if(window.PYRE2Detail)window.PYRE2Detail.install(app);if(window.PYRE3Install)window.PYRE3Install(app);
 render.render('orbit',0);if(!CAPTURE)requestAnimationFrame(frame);
 document.body.classList.add('ready');
}
main().catch(e=>{console.error(e);status(e.message);document.body.classList.add('error');window.PYRE_ERROR=e.stack});
