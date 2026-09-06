/** Two-way scalar refinement. The pressure/momentum solve remains on the macro
 * grid; a bounded Fourier velocity closure transports finer reactive fields.
 * This improves VFX detail. It is not a fine-grid pressure solve or DNS. */
window.PYRE2Detail = (()=>{
 class RefinedFields {
  constructor(app,scale){
   this.app=app;this.gpu=app.gpu;this.macro=app.flow;this.scale=scale;this.turbulence=.65;
   this.grid=this.macro.grid.map(n=>n*scale);this.size=this.macro.size;this.w=this.grid[0]*8;this.h=this.grid[1]*Math.ceil(this.grid[2]/8);
   if(this.grid.reduce((a,b)=>a*b,1)>5000000)throw Error('Refinement exceeds the 5-million-cell safety limit. Select a lower velocity tier.');
   const shaders=window.PYRE2DetailShaders(gridGLSL);this.p=Object.fromEntries(Object.entries(shaders).map(([k,v])=>[k,this.gpu.program(v)]));
   this.state=Array.from({length:3},()=>this.gpu.target(this.w,this.h,2));this.seed();
  }
  get time(){return this.macro.time}get tick(){return this.macro.tick}get v(){return this.state[0].textures[0]}get c(){return this.state[0].textures[1]}
  base(){return {...this.macro.base(),uGrid:this.grid,uAtlas:[this.w,this.h],uMacroGrid:this.macro.grid,uMacroAtlas:[this.macro.w,this.macro.h],uTurbulence:this.turbulence};}
  seed(){for(const t of this.state)this.gpu.pass(this.p.seed,t,{...this.base(),uMacroV:this.macro.v,uMacroC:this.macro.c});}
  advance(dt){
   const g=this.gpu,m=this.macro,b={...this.base(),uDT:dt};
   g.pass(this.p.advect,this.state[1],{...b,uMacroV:m.v,uMacroC:m.c,uV:this.v,uC:this.c});
   g.pass(this.p.react,this.state[2],{...b,uMacroV:m.v,uMacroC:m.c,uV:this.v,uC:this.c,uA:this.state[1].textures[0],uB:this.state[1].textures[1]});
   [this.state[0],this.state[2]]=[this.state[2],this.state[0]];
   g.pass(this.p.restrict,m.state[1],{...m.base(),uV:m.v,uC:m.c,uFineV:this.v,uFineC:this.c,uFineGrid:this.grid,uFineAtlas:[this.w,this.h]});
   [m.state[0],m.state[1]]=[m.state[1],m.state[0]];
  }
  destroy(){for(const t of this.state)this.gpu.destroy(t);}
 }
 function install(app){
  const m=app.flow,original={step:m.step.bind(m),reset:m.reset.bind(m),configure:m.configure.bind(m),info:app.info.bind(app)};
  let detail=null;const selector=document.getElementById('detailMode');
  app.enableDetail=(scale=0)=>{
   scale=Number(scale);if(![0,2,3].includes(scale))throw Error('Refinement must be disabled, 2x or 3x.');
   if(scale&&m.grid.reduce((a,b)=>a*b,1)*scale**3>5000000)throw Error('Refinement exceeds 5 million cells. Reduce the velocity tier first.');
   if(detail){detail.destroy();detail=null;}app.detail=null;app.render.flow=m;
   if(scale){detail=new RefinedFields(app,scale);app.detail=detail;app.render.flow=detail;app.render.steps=Math.max(app.render.steps,scale===3?224:192);}
   app.render.cacheTick=-1;if(selector)selector.value=String(scale);return detail;
  };
  m.step=(dt=1/60)=>{original.step(dt);if(detail)detail.advance(dt);};
  m.reset=()=>{original.reset();if(detail)detail.seed();};
  m.configure=tier=>{const scale=detail?.scale||0;app.enableDetail(0);original.configure(tier);if(scale){try{app.enableDetail(scale)}catch(e){document.getElementById('status').textContent=e.message;}}};
  app.info=()=>({...original.info(),velocityGrid:m.grid,scalarGrid:detail?detail.grid:m.grid,scalarRefinement:detail?.scale||1,refinementModel:detail?'advected scalars with Fourier subgrid velocity closure':'resolved base grid'});
  if(selector)selector.onchange=e=>{try{app.enableDetail(+e.target.value);document.getElementById('status').textContent=detail?'Refinement active: finer transported scalar fields; coarse pressure solve.':'Refinement disabled.';}catch(error){selector.value=String(detail?.scale||0);document.getElementById('status').textContent=error.message;}};
 }
 return {install,RefinedFields};
})();
