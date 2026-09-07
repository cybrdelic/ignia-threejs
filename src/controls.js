/* PYRE III composable source controls and validated preset round trips.
 * These controls modify uniforms used by both reactive grids, never render-only
 * substitutes for flame motion. Fuel names denote uncalibrated VFX profiles.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const shapes = ['Log surfaces','Pool / disc','Finite reactive sphere','Smoke source',
    'Moving trail','Candle wick','20-port burner ring','Four burner rings',
    'Oriented nozzle','Five-nozzle bar','Opposed jets','Hot thermal sphere',
    'Ribbon burner','Three candle wicks','Pulsed nozzle'];
  const parameters = [
    ['radius','Source radius',.04,1.0,.01, a => a.flow.sourceRadius, (a,v) => a.flow.sourceRadius=v],
    ['height','Source height',.1,2.5,.01,a=>a.flow.pyre3.height,(a,v)=>a.flow.pyre3.height=v],
    ['speed','Inlet speed',0,8,.05,a=>a.flow.pyre3.source[2],(a,v)=>a.flow.pyre3.source[2]=v],
    ['premix','Source oxygen target',0,2,.02,a=>a.flow.pyre3.source[1],(a,v)=>a.flow.pyre3.source[1]=v],
    ['frequency','Wind frequency',.02,2,.02,a=>a.flow.pyre3.frequency,(a,v)=>a.flow.pyre3.frequency=v],
    ['crossZ','Z wind acceleration',-5,5,.1,a=>a.flow.pyre3.windZ,(a,v)=>a.flow.pyre3.windZ=v],
    ['pulse','Finite-pulse duration',.04,2,.01,a=>a.flow.pyre3.pulseDuration,(a,v)=>a.flow.pyre3.pulseDuration=v],
    ['yield','Soot yield',0,2.5,.01,a=>a.flow.pyre3.reaction[2],(a,v)=>a.flow.pyre3.reaction[2]=v],
    ['cooling','Cooling coefficient',.05,3,.05,a=>a.flow.pyre3.cooling,(a,v)=>a.flow.pyre3.cooling=v]
  ];
  function sync(app) {
    if (!$('combustorShape')) return;
    const p=app.flow.pyre3;
    $('combustorShape').value=String(p.emitter);
    for (const [id,,,,,get] of parameters) {
      const v=get(app);$('custom_'+id).value=String(v);$('custom_'+id+'Value').textContent=v.toFixed(2);
    }
    $('swirl').value=String(p.swirl);$('swirlValue').textContent=p.swirl.toFixed(2);
    const t=app.detail?.turbulence||0;
    $('refinementTurbulence').value=String(t);$('refinementValue').textContent=t.toFixed(2);
    $('directionX').value=p.direction[0];$('directionY').value=p.direction[1];$('directionZ').value=p.direction[2];
  }
  function install(app) {
    const panel=document.createElement('details');
    panel.innerHTML='<summary>Build a custom combustor</summary><div class="label">Source geometry</div>'+
      '<select id="combustorShape">'+shapes.map((x,i)=>`<option value="${i}">${x}</option>`).join('')+'</select>'+
      '<div class="small" style="margin:8px 0">Changing geometry resets the fields. Fuel, palette, and wind remain independently editable. These are normalized model controls, not burner-design specifications.</div>'+
      parameters.map(([id,label,min,max,step])=>`<div class="label">${label}<span class="value" id="custom_${id}Value"></span></div><input id="custom_${id}" type="range" min="${min}" max="${max}" step="${step}">`).join('')+
      '<div class="label">Inlet direction · X / Y / Z</div><div style="display:flex;gap:8px">'+['X','Y','Z'].map(x=>`<input type="number" id="direction${x}" min="-1" max="1" step=".05" style="width:31%;color:#ddd;background:#171f29;border:1px solid #354052;border-radius:4px;padding:6px">`).join('')+'</div>'+
      '<button class="wide" id="restartCustom">Restart current source</button>'+
      '<button class="wide" id="importPreset3">Import preset JSON</button><input type="file" id="presetFile3" accept=".json,application/json" hidden>';
    const inspect=$('benchmark').closest('details');inspect.before(panel);
    app.syncControls=()=>sync(app);
    app.setCombustor=(id)=>{
      if(!Number.isInteger(id)||id<0||id>=shapes.length)throw new Error('Invalid combustor geometry');
      const source=Object.values(window.PYRE3_PRESETS).find(p=>p.params.emitter===id);
      const f=app.flow;
      if(source){f.pyre3.height=source.params.height;f.pyre3.direction=[...source.params.direction];f.pyre3.source[2]=source.params.source[2];f.sourceRadius=source.sourceRadius;}
      f.pyre3.emitter=id;f.scene=id===0?0:([2,11].includes(id)?2:1);f.obstacle=0;f.burst=[2,11].includes(id)?1:0;
      f.reset();app.clock=0;app.render.cacheTick=-1;app.render.fixedCamera=null;
      if(source){const c=app.render;const delta=source.eye.map((x,i)=>x-source.aim[i]);c.target=[...source.aim];c.radius=Math.hypot(...delta);c.pitch=Math.asin(delta[1]/c.radius);c.angle=Math.atan2(delta[0],delta[2]);c.customFov=source.fov;}
      $('collider').value='0';sync(app);$('status').textContent='Custom source: '+shapes[id]+'. Fuel and wind preserved.';
    };
    $('combustorShape').onchange=e=>app.setCombustor(+e.target.value);
    for(const [id,,,,,get,set]of parameters){$('custom_'+id).oninput=e=>{const v=+e.target.value;if(Number.isFinite(v)){set(app,v);$('custom_'+id+'Value').textContent=get(app).toFixed(2);app.render.cacheTick=-1;}};}
    for(const axis of ['X','Y','Z'])$('direction'+axis).onchange=()=>{
      const v=['X','Y','Z'].map(x=>+$('direction'+x).value);
      if(v.every(Number.isFinite)&&Math.hypot(...v)>.001&&v.every(x=>Math.abs(x)<=1)){app.flow.pyre3.direction=v;app.render.cacheTick=-1;}
      else{$('status').textContent='Direction must be a nonzero finite vector with components in [-1, 1].';sync(app);}
    };
    $('restartCustom').onclick=()=>{app.flow.reset();app.clock=0;app.render.cacheTick=-1;app.paused=false;$('pause').textContent='Pause';};
    app.importPreset=async(input)=>{
      const p=typeof input==='string'?JSON.parse(input):structuredClone(input);
      if(p?.format!=='pyre3-preset-v1')throw new Error('Unsupported preset format');
      window.PYRE3Validate(p.params);
      const limits={fuel:[0,6],wind:[-5,5],vorticity:[0,6],sourceRadius:[.01,2],obstacle:[0,3],ignition:[0,1],burst:[0,1]};
      for(const [key,[lo,hi]]of Object.entries(limits)){const v=p.flow?.[key];if(!Number.isFinite(v)||v<lo||v>hi)throw new Error('Invalid flow parameter: '+key);}
      if(!Number.isInteger(p.flow.obstacle))throw new Error('Invalid collider index');
      const factor=p.refinement;if(![1,2,3].includes(factor))throw new Error('Invalid refinement factor');
      if(!Number.isFinite(p.turbulence)||p.turbulence<0||p.turbulence>1.2)throw new Error('Invalid refinement turbulence');
      const count=app.flow.grid.reduce((a,b)=>a*b,1)*factor**3;if(count>12e6)throw new Error('This preset needs a smaller base grid for its refinement factor');
      // Validate before touching a running state.
      app.flow.pyre3=structuredClone(p.params);Object.assign(app.flow,Object.fromEntries(Object.keys(limits).map(k=>[k,p.flow[k]])));app.flow.scene=p.params.emitter===0?0:([2,11].includes(p.params.emitter)?2:1);
      app.enableDetail(factor===1?0:factor);if(app.detail)app.detail.turbulence=p.turbulence;
      app.flow.reset();app.clock=0;app.render.cacheTick=-1;
      for(const key of ['fuel','wind','vorticity']){$(key).value=String(app.flow[key]);$(key+'Value').textContent=app.flow[key].toFixed(2);}
      $('windPattern').value=String(p.params.windMode);$('collider').value=String(p.flow.obstacle);$('pilot').checked=!!p.flow.ignition;
      sync(app);$('status').textContent='Preset imported: '+String(p.name||'Custom').slice(0,80);return true;
    };
    $('importPreset3').onclick=()=>$('presetFile3').click();
    $('presetFile3').onchange=async(e)=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>1024*1024)throw Error('Preset JSON is too large');await app.importPreset(await file.text());}catch(error){$('status').textContent='Import failed: '+error.message;}finally{e.target.value='';}};
    sync(app);
  }
  window.PYRE3Controls={install,sync};
})();
