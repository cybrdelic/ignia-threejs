class ReactiveFlow {
 constructor(gpu,tier='balanced'){
  this.gpu=gpu;this.time=0;this.tick=0;this.fuel=1.6;this.wind=0;this.vorticity=3.2;this.pressureIterations=36;this.scene=0;this.obstacle=0;this.ignition=1;this.ambientOxygen=1;this.sourceRadius=.23;this.burst=0;
  this.pyre3=structuredClone(window.PYRE3_DEFAULTS);this.makePrograms();this.configure(tier);
 }
 makePrograms(){
  const g=this.gpu, header=gridGLSL+`uniform sampler2D uV,uC,uA,uB,uCurl,uP,uD;uniform float uDT,uTime,uFuel,uWind,uVort;layout(location=0)out vec4 O;`;
  this.init=g.program(gridGLSL+`layout(location=0)out vec4 O;layout(location=1)out vec4 C;void main(){O=vec4(0);C=vec4(0,uOxygen,0,0);}`);
  this.advect=g.program(header+`layout(location=1)out vec4 C;void main(){vec3 p=cell();vec3 v=sampleV(uV,p).xyz;vec3 mid=p-.5*uDT*v*uGrid/uSize;vec3 dep=p-uDT*sampleV(uV,mid).xyz*uGrid/uSize;O=sampleV(uV,dep);C=sampleV(uC,dep);if(p.y<.5)O.y=max(O.y,0.);}`);
  this.correct=g.program(header+`layout(location=1)out vec4 C;
void main(){vec3 p=cell();vec3 v=at(uV,p).xyz;vec3 dep=p-uDT*sampleV(uV,p-.5*uDT*v*uGrid/uSize).xyz*uGrid/uSize;
vec3 q=floor(dep);vec4 loV=vec4(1e5),hiV=-loV,loC=loV,hiC=-loV;
for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec3 a=q+vec3(x,y,z);vec4 va=at(uV,a),ca=at(uC,a);loV=min(loV,va);hiV=max(hiV,va);loC=min(loC,ca);hiC=max(hiC,ca);}
vec3 rev=p+uDT*v*uGrid/uSize;O=clamp(at(uA,p)+.5*(at(uV,p)-sampleV(uA,rev)),loV,hiV);O.xyz=at(uA,p).xyz;C=clamp(at(uB,p)+.5*(at(uC,p)-sampleV(uB,rev)),loC,hiC);
}`);
  this.curl=g.program(header+`void main(){vec3 p=cell();vec3 a=at(uV,p+X).xyz-at(uV,p-X).xyz,b=at(uV,p+Y).xyz-at(uV,p-Y).xyz,c=at(uV,p+Z).xyz-at(uV,p-Z).xyz;vec3 d=.5*uGrid/uSize;vec3 w=vec3(b.z*d.y-c.y*d.z,c.x*d.z-a.z*d.x,a.y*d.x-b.x*d.y);O=vec4(w,length(w));}`);
  this.force=g.program(header+`layout(location=1)out vec4 C;
float segment(vec2 p,vec2 a,vec2 b){vec2 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.));}
void main(){
 vec3 p=cell(),w=world(p);O=at(uV,p);C=at(uC,p);float dt=uDT;
 vec4 cu=at(uCurl,p);vec3 h=uSize/uGrid;
 vec3 n=vec3(at(uCurl,p+X).w-at(uCurl,p-X).w,at(uCurl,p+Y).w-at(uCurl,p-Y).w,at(uCurl,p+Z).w-at(uCurl,p-Z).w)/h;
 n/=length(n)+1e-6;
 float edge=min(min(p.x,uGrid.x-1.-p.x),min(min(p.z,uGrid.z-1.-p.z),uGrid.y-1.-p.y));
 float interior=smoothstep(1.,6.,edge);
 // Confinement is an artistic subgrid term, not an unlimited energy source.
 // Choose s in [0,1] so |v+dt*s*f|^2/2 - |v|^2/2 <= dt*power.
 // The positive root enforces the bound BEFORE projection, without clipping velocity.
 vec3 conf=uVort*h.x*interior*cross(n,cu.xyz);
 float aa=.5*dt*dt*dot(conf,conf),bb=dt*dot(O.xyz,conf);
 float budget=dt*(4.0*max(O.w,0.)+.3*max(C.z,0.));
 float cs=1.;if(aa+bb>budget&&aa>1e-15)cs=clamp((sqrt(max(0.,bb*bb+4.*aa*budget))-bb)/(2.*aa),0.,1.);
 O.xyz+=dt*(cs*conf+(pyWind(w,uTime,O.xyz)+vec3(0,uBuoyancy*O.w-.16*C.z,0)));
 // Open-boundary sponge is applied BEFORE pressure projection, never after it.
 O.xyz*=exp(-dt*(.018+9.*(1.-smoothstep(0.,5.,edge))));
 vec3 invh2=1./(h*h);
 vec4 lapC=(at(uC,p+X)+at(uC,p-X)-2.*C)*invh2.x+(at(uC,p+Y)+at(uC,p-Y)-2.*C)*invh2.y+(at(uC,p+Z)+at(uC,p-Z)-2.*C)*invh2.z;
 float lapT=(at(uV,p+X).w+at(uV,p-X).w-2.*O.w)*invh2.x+(at(uV,p+Y).w+at(uV,p-Y).w-2.*O.w)*invh2.y+(at(uV,p+Z).w+at(uV,p-Z).w-2.*O.w)*invh2.z;
 // Explicit molecular/mixing diffusion; timestep is limited by the host.
 C+=lapC*(.00032*dt);O.w+=lapT*(.00025*dt);
 float source=pySource(w,uTime);
 float phase=1.+uSourceParams.w*(.32*sin(w.x*22.+uTime*5.8)*sin(w.z*19.-uTime*4.1)+.16*sin(w.x*37.+w.z*31.+uTime*12.));
 float injection=max(0.,source*uFuel*phase);
 O.xyz=mix(O.xyz,pyVelocity(w,uTime),1.-exp(-dt*injection*2.));
 pyReact(O,C,injection,dt);
 if(p.x<1.||p.x>uGrid.x-2.||p.z<1.||p.z>uGrid.z-2.||p.y>uGrid.y-2.){C=mix(C,vec4(0,uOxygen,0,0),.4);O.w*=.8;}
 if(solid(p)>.5){O=vec4(0);C=vec4(0);}
 O.xyz*=vec3(faceOpen(p,X),faceOpen(p,Y),faceOpen(p,Z));
}`);
  this.div=g.program(header+`void main(){vec3 p=cell(),d=uGrid/uSize;vec3 v=at(uV,p).xyz;float div=(v.x-at(uV,p-X).x)*d.x+(v.y-at(uV,p-Y).y)*d.y+(v.z-at(uV,p-Z).z)*d.z;O=vec4(div*(1.-solid(p)),0,0,0);}`);
  this.jacobi=g.program(header+`void main(){vec3 p=cell(),k=uGrid/uSize;k*=k;
 float xp=faceOpen(p,X)*k.x,xm=faceOpen(p,-X)*k.x,yp=faceOpen(p,Y)*k.y,ym=faceOpen(p,-Y)*k.y,zp=faceOpen(p,Z)*k.z,zm=faceOpen(p,-Z)*k.z;
 float sum=at(uP,p+X).x*xp+at(uP,p-X).x*xm+at(uP,p+Y).x*yp+at(uP,p-Y).x*ym+at(uP,p+Z).x*zp+at(uP,p-Z).x*zm;
 float pr=(sum-at(uD,p).x)/max(xp+xm+yp+ym+zp+zm,1.);
 if(solid(p)>.5||p.x<.5||p.x>uGrid.x-1.5||p.z<.5||p.z>uGrid.z-1.5||p.y>uGrid.y-1.5)pr=0.;O=vec4(mix(at(uP,p).x,pr,.8),0,0,0);
}`);
  this.project=g.program(header+`layout(location=1)out vec4 C;void main(){vec3 p=cell();O=at(uV,p);C=at(uC,p);float pp=at(uP,p).x;vec3 gr=vec3(at(uP,p+X).x-pp,at(uP,p+Y).x-pp,at(uP,p+Z).x-pp)*uGrid/uSize;O.xyz=(O.xyz-gr)*vec3(faceOpen(p,X),faceOpen(p,Y),faceOpen(p,Z));if(solid(p)>.5){O=vec4(0);C=vec4(0);}}`);

  this.residual=g.program(header+`void main(){vec3 p=cell(),k=uGrid/uSize;k*=k;float pp=at(uP,p).x;
   float lap=(at(uP,p+X).x-pp)*faceOpen(p,X)*k.x+(at(uP,p-X).x-pp)*faceOpen(p,-X)*k.x+(at(uP,p+Y).x-pp)*faceOpen(p,Y)*k.y+(at(uP,p-Y).x-pp)*faceOpen(p,-Y)*k.y+(at(uP,p+Z).x-pp)*faceOpen(p,Z)*k.z+(at(uP,p-Z).x-pp)*faceOpen(p,-Z)*k.z;
   O=vec4((at(uD,p).x-lap)*(1.-solid(p)),0,0,0);
  }`);
  this.restrict=g.program(header+`uniform vec3 uFineGrid;uniform vec2 uFineAtlas;
   float f(vec3 p){p=clamp(p,vec3(0),uFineGrid-1.);return texture(uD,(vec2(mod(p.z,8.),floor(p.z/8.))*uFineGrid.xy+p.xy+.5)/uFineAtlas).x;}
   void main(){vec3 p=cell(),q=p*2.;float v=0.;for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++)v+=f(q+vec3(x,y,z));O=vec4(v*.125*(1.-solid(p)),0,0,0);}
  `);
  this.prolong=g.program(header+`uniform vec3 uCoarseGrid;uniform vec2 uCoarseAtlas;
   vec2 uv(vec3 p){return (vec2(mod(p.z,8.),floor(p.z/8.))*uCoarseGrid.xy+p.xy+.5)/uCoarseAtlas;}
   float c(vec3 p){p=clamp(p,vec3(0),uCoarseGrid-1.001);float z=floor(p.z);return mix(texture(uA,uv(vec3(p.xy,z))).x,texture(uA,uv(vec3(p.xy,z+1.))).x,fract(p.z));}
   void main(){vec3 p=cell();O=vec4((at(uP,p).x+c((p+.5)*.5-.5))*(1.-solid(p)),0,0,0);}
  `);

 }
 configure(tier){
  const dims={draft:[40,64,40],balanced:[56,88,56],film:[64,96,64],high:[72,112,72],ultra:[128,192,128]};
  this.tier=tier;this.grid=dims[tier]||dims.balanced;this.size=[3.2,4.8,3.2];this.tiles=8;
  this.w=this.grid[0]*this.tiles;this.h=this.grid[1]*Math.ceil(this.grid[2]/this.tiles);
  for(const t of this.targets||[])this.gpu.destroy(t);
  this.state=[this.gpu.target(this.w,this.h,2),this.gpu.target(this.w,this.h,2),this.gpu.target(this.w,this.h,2)];
  this.curlTex=this.gpu.target(this.w,this.h);this.divTex=this.gpu.target(this.w,this.h);this.pressure=[this.gpu.target(this.w,this.h),this.gpu.target(this.w,this.h)];
  this.coarseGrid=this.grid.map(n=>n/2);this.cw=this.coarseGrid[0]*8;this.ch=this.coarseGrid[1]*Math.ceil(this.coarseGrid[2]/8);
  this.residualTex=this.gpu.target(this.w,this.h);this.coarseD=this.gpu.target(this.cw,this.ch);this.coarseP=[this.gpu.target(this.cw,this.ch),this.gpu.target(this.cw,this.ch)];
  this.targets=[...this.state,this.curlTex,this.divTex,...this.pressure,this.residualTex,this.coarseD,...this.coarseP];this.multigrid=true;this.reset();
 }
 base(){return {uGrid:this.grid,uSize:this.size,uAtlas:[this.w,this.h],uTiles:this.tiles,uTime:this.time,uDT:this.dt||1/60,uFuel:this.fuel,uWind:this.wind,uVort:this.vorticity,uScene:this.scene,uObstacle:this.obstacle,uIgnition:this.ignition,uOxygen:this.ambientOxygen,uRadius:this.sourceRadius,uBurst:this.burst,...window.PYRE3Uniforms(this)}}
 reset(){
  this.time=0;this.tick=0;
  for(const t of this.targets)this.gpu.clear(t);
  for(const target of this.state)this.gpu.pass(this.init,target,this.base());
 }
 async loadSnapshot(seed){
  if(!seed||typeof DecompressionStream==='undefined')return false;
  const raw=atob(seed.data),compressed=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)compressed[i]=raw.charCodeAt(i);
  const buffer=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const sg=seed.grid,w=sg[0]*8,h=sg[1]*Math.ceil(sg[2]/8),count=w*h*4;
  if(buffer.byteLength!==count*4)throw new Error('Invalid warm-start payload length');
  const v=this.gpu.uploadHalf(w,h,new Uint16Array(buffer,0,count)),c=this.gpu.uploadHalf(w,h,new Uint16Array(buffer,count*2,count));
  if(!this.seedProgram)this.seedProgram=this.gpu.program(gridGLSL+`
   uniform vec3 uSeedGrid;uniform vec2 uSeedAtlas;uniform sampler2D uSeedV,uSeedC;
   layout(location=0)out vec4 O;layout(location=1)out vec4 C;
   vec2 seedUV(vec3 p){return (vec2(mod(p.z,8.),floor(p.z/8.))*uSeedGrid.xy+p.xy+.5)/uSeedAtlas;}
   vec4 seedAt(sampler2D t,vec3 p){p=clamp(p,vec3(0),uSeedGrid-1.001);float z=floor(p.z);return mix(texture(t,seedUV(vec3(p.xy,z))),texture(t,seedUV(vec3(p.xy,z+1.))),fract(p.z));}
   void main(){vec3 p=(cell()+.5)/uGrid*uSeedGrid-.5;O=seedAt(uSeedV,p);C=seedAt(uSeedC,p);}`);
  for(const target of this.state)this.gpu.pass(this.seedProgram,target,{...this.base(),uSeedGrid:sg,uSeedAtlas:[w,h],uSeedV:v,uSeedC:c});
  this.gpu.disposeTexture(v);this.gpu.disposeTexture(c);this.time=seed.time;this.tick++;return true;
 }

 step(dt=1/60){
  this.dt=dt;const b=this.base(),g=this.gpu;let [a,tmp,c]=this.state;
  g.pass(this.advect,tmp,{...b,uV:a.textures[0],uC:a.textures[1]});
  g.pass(this.correct,c,{...b,uV:a.textures[0],uC:a.textures[1],uA:tmp.textures[0],uB:tmp.textures[1]});
  g.pass(this.curl,this.curlTex,{...b,uV:c.textures[0]});
  g.pass(this.force,tmp,{...b,uV:c.textures[0],uC:c.textures[1],uCurl:this.curlTex.textures[0]});
  g.pass(this.div,this.divTex,{...b,uV:tmp.textures[0]});
  const smoothFine=n=>{for(let i=0;i<n;i++){g.pass(this.jacobi,this.pressure[1],{...b,uP:this.pressure[0].textures[0],uD:this.divTex.textures[0]});this.pressure.reverse();}};
  if(this.multigrid){
   for(let cycle=0;cycle<(this.time<.15?4:((this.obstacle||this.scene===2)?2:1));cycle++){
   smoothFine(5);
   g.pass(this.residual,this.residualTex,{...b,uP:this.pressure[0].textures[0],uD:this.divTex.textures[0]});
   const cb={...b,uGrid:this.coarseGrid,uAtlas:[this.cw,this.ch]};
   g.pass(this.restrict,this.coarseD,{...cb,uD:this.residualTex.textures[0],uFineGrid:this.grid,uFineAtlas:[this.w,this.h]});
   for(const t of this.coarseP)g.clear(t);
   for(let i=0;i<18;i++){g.pass(this.jacobi,this.coarseP[1],{...cb,uP:this.coarseP[0].textures[0],uD:this.coarseD.textures[0]});this.coarseP.reverse();}
   g.pass(this.prolong,this.pressure[1],{...b,uP:this.pressure[0].textures[0],uA:this.coarseP[0].textures[0],uCoarseGrid:this.coarseGrid,uCoarseAtlas:[this.cw,this.ch]});this.pressure.reverse();
   smoothFine(5);
   }
  }else smoothFine(this.pressureIterations);
  g.pass(this.project,a,{...b,uV:tmp.textures[0],uC:tmp.textures[1],uP:this.pressure[0].textures[0]});
  this.time+=dt;this.tick++;
 }
 get v(){return this.state[0].textures[0]}
 get c(){return this.state[0].textures[1]}
}


// Illumination is cached on a half-resolution grid. Extinction and emission
// remain sampled from the full refined scalar volume during ray integration.
