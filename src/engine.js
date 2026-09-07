/**
 * PYRE II / controlled volumetric combustion studies.
 * IGNIA project distribution: GPL-2.0-only. Model coordinates and time are VFX units.
 * WebGL2 atlas solver + identical GLSL fullscreen rendering on Three.js or native GL.
 * This is an artistic incompressible combustion approximation, not a validated CFD model.
 */
'use strict';
const Q = new URLSearchParams(location.search);
const CAPTURE = Q.has('capture') || !!window.__CAPTURE__;
const canvas = document.querySelector('#viewport');
const status = (s) => { const e=document.querySelector('#status'); if(e)e.textContent=s; };
const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
const smooth = (a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
const V = {
 add:(a,b)=>a.map((v,i)=>v+b[i]), sub:(a,b)=>a.map((v,i)=>v-b[i]),
 mul:(a,s)=>a.map(v=>v*s), dot:(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),
 cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
 norm:a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n)}
};

// A native WebGL fallback is intentionally included for offline access and this
// network-isolated capture environment. No imagery, textures or videos of fire are loaded.
class GPU {
 constructor(THREE=null){
  this.THREE=THREE;
  if(THREE){
   this.threeRenderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,preserveDrawingBuffer:CAPTURE,powerPreference:'high-performance'});
   this.gl=this.threeRenderer.getContext();
  }else this.gl=canvas.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:CAPTURE,powerPreference:'high-performance'});
  if(!this.gl)throw new Error('WebGL 2 is required. Enable hardware acceleration.');
  const g=this.gl;
  if(!g.getExtension('EXT_color_buffer_float'))throw new Error('Floating-point render targets are required.');
  g.getExtension('OES_texture_float_linear');
  this.timer=g.getExtension('EXT_disjoint_timer_query_webgl2');
  const di=g.getExtension('WEBGL_debug_renderer_info');
  this.adapter=di?g.getParameter(di.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);
  this.vao=g.createVertexArray();g.bindVertexArray(this.vao);
  this.programs=[];this.pendingTimers=[];this.gpuMilliseconds=null;
  if(THREE){
   this.passScene=new THREE.Scene();this.passCamera=new THREE.Camera();
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
   this.passMesh=new THREE.Mesh(geometry);this.passMesh.frustumCulled=false;this.passScene.add(this.passMesh);
  }
 }
 uploadHalf(w,h,data){
  if(this.THREE){const T=this.THREE;const texture=new T.DataTexture(data,w,h,T.RGBAFormat,T.HalfFloatType);texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return texture;}
  const g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);
  g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
  g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
  g.texImage2D(g.TEXTURE_2D,0,g.RGBA16F,w,h,0,g.RGBA,g.HALF_FLOAT,data);return t;
 }
 disposeTexture(t){if(this.THREE)t.dispose();else this.gl.deleteTexture(t);}
 beginTimer(){if(!this.timer||this.pendingTimers.length>6)return;const g=this.gl;this.activeTimer=g.createQuery();g.beginQuery(this.timer.TIME_ELAPSED_EXT,this.activeTimer);}
 endTimer(){if(!this.activeTimer)return;this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);this.pendingTimers.push(this.activeTimer);this.activeTimer=null;}
 pollTimer(){
  const g=this.gl;if(!this.timer)return null;
  if(g.getParameter(this.timer.GPU_DISJOINT_EXT)){this.pendingTimers.forEach(q=>g.deleteQuery(q));this.pendingTimers=[];return null;}
  while(this.pendingTimers.length&&g.getQueryParameter(this.pendingTimers[0],g.QUERY_RESULT_AVAILABLE)){
   const q=this.pendingTimers.shift(),ms=g.getQueryParameter(q,g.QUERY_RESULT)/1e6;g.deleteQuery(q);
   this.gpuMilliseconds=this.gpuMilliseconds===null?ms:this.gpuMilliseconds*.85+ms*.15;
  }
  return this.gpuMilliseconds;
 }

 target(w,h,count=1,linear=true,type='half'){
  if(this.THREE){const T=this.THREE;const rt=new T.WebGLRenderTarget(w,h,{count,format:T.RGBAFormat,type:type==='byte'?T.UnsignedByteType:T.HalfFloatType,minFilter:linear?T.LinearFilter:T.NearestFilter,magFilter:linear?T.LinearFilter:T.NearestFilter,depthBuffer:false,stencilBuffer:false,generateMipmaps:false});return {rt,w,h,textures:rt.textures};}
  const g=this.gl, f=g.createFramebuffer();g.bindFramebuffer(g.FRAMEBUFFER,f);
  const textures=[];
  for(let i=0;i<count;i++){
   const t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);
   g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,linear?g.LINEAR:g.NEAREST);
   g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,linear?g.LINEAR:g.NEAREST);
   g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
   g.texImage2D(g.TEXTURE_2D,0,type==='byte'?g.RGBA8:g.RGBA16F,w,h,0,g.RGBA,type==='byte'?g.UNSIGNED_BYTE:g.HALF_FLOAT,null);
   g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0+i,g.TEXTURE_2D,t,0);textures.push(t);
  }
  g.drawBuffers(textures.map((_,i)=>g.COLOR_ATTACHMENT0+i));
  if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw new Error('Incomplete floating-point framebuffer');
  return {f,w,h,textures};
 }
 destroy(t){if(!t)return;if(t.rt){t.rt.dispose();return}const g=this.gl;t.textures.forEach(x=>g.deleteTexture(x));g.deleteFramebuffer(t.f)}
 program(fragment,vertex=null,points=0){
  if(this.THREE){const T=this.THREE;const material=new T.RawShaderMaterial({glslVersion:T.GLSL3,vertexShader:vertex||'precision highp float;out vec2 vUV;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);}',fragmentShader:'precision highp float;precision highp int;\n'+fragment,uniforms:{},depthTest:false,depthWrite:false,blending:points?T.CustomBlending:T.NoBlending,blendSrc:T.OneFactor,blendDst:T.OneFactor,blendEquation:T.AddEquation,transparent:!!points});const result={material,points};this.programs.push(result);return result;}
  const g=this.gl,vs=`#version 300 es\nprecision highp float;out vec2 vUV;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
  const compile=(type,src)=>{const s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw new Error(g.getShaderInfoLog(s)+'\n'+src);return s};
  const p=g.createProgram();g.attachShader(p,compile(g.VERTEX_SHADER,vertex?'#version 300 es\n'+vertex:vs));g.attachShader(p,compile(g.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;precision highp int;\n'+fragment));g.linkProgram(p);
  if(!g.getProgramParameter(p,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(p));
  const u={};for(let i=0,n=g.getProgramParameter(p,g.ACTIVE_UNIFORMS);i<n;i++){let q=g.getActiveUniform(p,i);u[q.name]={loc:g.getUniformLocation(p,q.name),type:q.type}}
  const result={p,u,points};this.programs.push(result);return result;
 }
 pass(pr,target,uniforms={}){
  if(this.THREE){for(const [name,value] of Object.entries(uniforms)){if(!pr.material.uniforms[name])pr.material.uniforms[name]={value};else pr.material.uniforms[name].value=value;}if(pr.points){if(!this.passPoints){const T=this.THREE,geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(pr.points*3),3));this.passPoints=new T.Points(geo,pr.material);this.passPoints.frustumCulled=false;this.passScene.add(this.passPoints);}this.passPoints.material=pr.material;this.passPoints.visible=true;this.passMesh.visible=false;}else{this.passMesh.visible=true;if(this.passPoints)this.passPoints.visible=false;this.passMesh.material=pr.material;}this.threeRenderer.setRenderTarget(target?target.rt:null);const clear=this.threeRenderer.autoClear;this.threeRenderer.autoClear=!pr.points;this.threeRenderer.render(this.passScene,this.passCamera);this.threeRenderer.autoClear=clear;return;}
  const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,target?target.f:null);g.viewport(0,0,target?target.w:canvas.width,target?target.h:canvas.height);
  if(target)g.drawBuffers(target.textures.map((_,i)=>g.COLOR_ATTACHMENT0+i));
  g.disable(g.DEPTH_TEST);g.disable(g.BLEND);g.disable(g.CULL_FACE);g.bindVertexArray(this.vao);g.useProgram(pr.p);
  let unit=0;
  for(const [name,val] of Object.entries(uniforms)){
   const u=pr.u[name];if(!u||val===undefined||val===null)continue;
   if(u.type===g.SAMPLER_2D){g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,val);g.uniform1i(u.loc,unit++);}
   else if(u.type===g.INT||u.type===g.BOOL)g.uniform1i(u.loc,val);
   else if(typeof val==='number')g.uniform1f(u.loc,val);
   else if(val.length===2)g.uniform2fv(u.loc,val);
   else if(val.length===3)g.uniform3fv(u.loc,val);
   else if(val.length===4)g.uniform4fv(u.loc,val);
  }
  if(pr.points){g.enable(g.BLEND);g.blendFunc(g.ONE,g.ONE);g.drawArrays(g.POINTS,0,pr.points);g.disable(g.BLEND);}else g.drawArrays(g.TRIANGLES,0,3);
 }
 clear(target,color=[0,0,0,0]){if(this.THREE){this.threeRenderer.setRenderTarget(target.rt);this.threeRenderer.setClearColor(0,0);this.threeRenderer.clear();return}const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,target.f);target.textures.forEach((_,i)=>g.clearBufferfv(g.COLOR,i,new Float32Array(color)))}
}

const gridGLSL = `
uniform vec3 uGrid;uniform vec3 uSize;uniform vec2 uAtlas;uniform float uTiles;
vec3 cell(){vec2 t=floor(gl_FragCoord.xy/uGrid.xy);return vec3(mod(gl_FragCoord.xy,uGrid.xy)-.5,t.x+t.y*uTiles);}
vec2 atlas(vec3 p){p=clamp(p,vec3(0),uGrid-1.);return (vec2(mod(p.z,uTiles),floor(p.z/uTiles))*uGrid.xy+p.xy+.5)/uAtlas;}
vec4 at(sampler2D t,vec3 p){return texture(t,atlas(p));}
vec4 sampleV(sampler2D t,vec3 p){p=clamp(p,vec3(0),uGrid-1.001);float z=floor(p.z);return mix(texture(t,atlas(vec3(p.xy,z))),texture(t,atlas(vec3(p.xy,z+1.))),fract(p.z));}
vec3 world(vec3 p){return (p+.5)/uGrid*uSize-vec3(uSize.x*.5,0.,uSize.z*.5);}
const vec3 X=vec3(1,0,0),Y=vec3(0,1,0),Z=vec3(0,0,1);
uniform int uScene,uObstacle;uniform float uIgnition,uOxygen,uRadius,uBurst;
float solid(vec3 p){vec3 w=world(p);if(p.y<0.)return 1.;if(uObstacle==1)return 1.-step(.50,length(w-vec3(0,1.28,0)));if(uObstacle==2)return 1.-step(0.,max(abs(w.y-1.3)-.075,max(abs(w.x)-.72,abs(w.z)-.60)));if(uObstacle==3)return (1.-step(.55,length(w.xz)))*(1.-step(.045,abs(w.y-.62)));return 0.;}
float faceOpen(vec3 p,vec3 d){return (1.-solid(p))*(1.-solid(p+d));}

vec3 macVelocity(sampler2D t,vec3 p){
 return vec3(sampleV(t,p-.5*X).x,sampleV(t,p-.5*Y).y,sampleV(t,p-.5*Z).z);
}
vec3 centeredVelocity(sampler2D t,vec3 p){
 return .5*vec3(at(t,p).x+at(t,p-X).x,at(t,p).y+at(t,p-Y).y,at(t,p).z+at(t,p-Z).z);
}
vec3 traceMAC(sampler2D t,vec3 p,float dt){
 vec3 mid=p-.5*dt*macVelocity(t,p)*uGrid/uSize;
 vec3 dep=p-dt*macVelocity(t,mid)*uGrid/uSize;
 // A blocked characteristic falls back to its fluid-side position. This is
 // deliberately dissipative near walls, rather than correcting through solids.
 if(uObstacle>0){for(int k=1;k<=4;k++)if(solid(mix(p,dep,float(k)*.25))>.5)return p;}
 if(dep.y<-.49)dep.y=-.49;
 return dep;
}
` + window.PYRE3_GLSL;

class ReactiveFlow {
 constructor(gpu,tier='balanced'){
  this.gpu=gpu;this.time=0;this.tick=0;this.fuel=1.6;this.wind=0;this.vorticity=3.2;this.pressureIterations=36;this.scene=0;this.obstacle=0;this.ignition=1;this.ambientOxygen=1;this.sourceRadius=.23;this.burst=0;
  this.pyre3=structuredClone(window.PYRE3_DEFAULTS);this.makePrograms();this.configure(tier);
 }
 makePrograms(){
  const g=this.gpu, header=gridGLSL+`uniform sampler2D uV,uC,uA,uB,uCurl,uP,uD;uniform float uDT,uTime,uFuel,uWind,uVort;layout(location=0)out vec4 O;`;
  this.init=g.program(gridGLSL+`layout(location=0)out vec4 O;layout(location=1)out vec4 C;void main(){O=vec4(0);C=vec4(0,uOxygen,0,0);}`);
  this.advect=g.program(header+`layout(location=1)out vec4 C;
void main(){vec3 p=cell(),dep=traceMAC(uV,p,uDT);
 O.w=sampleV(uV,dep).w;C=sampleV(uC,dep);
 O.x=sampleV(uV,traceMAC(uV,p+.5*X,uDT)-.5*X).x;
 O.y=sampleV(uV,traceMAC(uV,p+.5*Y,uDT)-.5*Y).y;
 O.z=sampleV(uV,traceMAC(uV,p+.5*Z,uDT)-.5*Z).z;
 if(solid(p)>.5){O=vec4(0);C=vec4(0);}
 O.xyz*=vec3(faceOpen(p,X),faceOpen(p,Y),faceOpen(p,Z));
}`);
  this.correct=g.program(header+`layout(location=1)out vec4 C;
vec4 donorLo(vec3 dep,out vec4 hi,sampler2D field){
 vec3 q=floor(dep);vec4 lo=vec4(1e20);hi=-lo;
 for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++){
  vec4 v=at(field,q+vec3(x,y,z));lo=min(lo,v);hi=max(hi,v);
 }return lo;
}
void main(){vec3 p=cell(),dep=traceMAC(uV,p,uDT),rev=traceMAC(uV,p,-uDT);
 vec4 hi,lo=donorLo(dep,hi,uV);
 O.w=clamp(at(uA,p).w+.5*(at(uV,p).w-sampleV(uA,rev).w),lo.w,hi.w);
 lo=donorLo(dep,hi,uC);C=clamp(at(uB,p)+.5*(at(uC,p)-sampleV(uB,rev)),lo,hi);
 vec3 faceResult=vec3(0);
 for(int axis=0;axis<3;axis++){
  vec3 off=axis==0?.5*X:(axis==1?.5*Y:.5*Z);
  vec3 d=traceMAC(uV,p+off,uDT)-off,r=traceMAC(uV,p+off,-uDT)-off;
  lo=donorLo(d,hi,uV);
  float corrected=at(uA,p)[axis]+.5*(at(uV,p)[axis]-sampleV(uA,r)[axis]);
  faceResult[axis]=clamp(corrected,lo[axis],hi[axis]);
 }
 O.xyz=faceResult;
 if(solid(p)>.5){O=vec4(0);C=vec4(0);}
 O.xyz*=vec3(faceOpen(p,X),faceOpen(p,Y),faceOpen(p,Z));
}`);
  this.curl=g.program(header+`void main(){vec3 p=cell();vec3 a=centeredVelocity(uV,p+X)-centeredVelocity(uV,p-X),b=centeredVelocity(uV,p+Y)-centeredVelocity(uV,p-Y),c=centeredVelocity(uV,p+Z)-centeredVelocity(uV,p-Z);vec3 d=.5*uGrid/uSize;vec3 w=vec3(b.z*d.y-c.y*d.z,c.x*d.z-a.z*d.x,a.y*d.x-b.x*d.y);O=vec4(w,length(w));}`);
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
 if(p.x<1.||p.x>uGrid.x-2.||p.z<1.||p.z>uGrid.z-2.||p.y>uGrid.y-2.){C=mix(C,vec4(0,uOxygen,0,0),1.-exp(-24.519*dt));O.w*=exp(-10.711*dt);}
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
const materialGLSL=gridGLSL+`
uniform sampler2D uV,uC;uniform float uSmoke;
uniform vec3 uFieldGrid;uniform vec2 uFieldAtlas;out vec4 O;
vec2 fieldUV(vec3 p){p=clamp(p,vec3(0),uFieldGrid-1.);return (vec2(mod(p.z,8.),floor(p.z/8.))*uFieldGrid.xy+p.xy+.5)/uFieldAtlas;}
vec4 fieldAt(sampler2D t,vec3 p){p=clamp(p,vec3(0),uFieldGrid-1.001);float z=floor(p.z);return mix(texture(t,fieldUV(vec3(p.xy,z))),texture(t,fieldUV(vec3(p.xy,z+1.))),fract(p.z));}
vec3 fieldBlackbody(float t){vec3 wavelength=vec3(615e-9,535e-9,455e-9);return 230000./(pow(wavelength/615e-9,vec3(5.))*(exp(vec3(.0143878)/(wavelength*max(t,400.)))-1.));}
void main(){
 vec3 p=cell(),w=world(p),q=(p+.5)/uGrid*uFieldGrid-.5;
 vec3 l=normalize(vec3(-.6,1.,.45));float tau=0.;
 // Directional key-light extinction is integrated through the actual soot field.
 for(int i=1;i<=14;i++){
  float dist=(float(i)-.5)*.13;vec3 fq=q+l*dist*uFieldGrid/uSize;
  tau+=max(0.,fieldAt(uC,fq).z)*.13*(1.+uSmoke*2.5);
  tau+=solid(p+l*dist*uGrid/uSize)*4.;
 }
 float shadow=exp(-min(tau,30.));
 vec3 scatter=vec3(.005,.008,.014)+vec3(.085,.110,.16)*shadow;
 // Low-resolution radiant-light cache. This is a deterministic approximation
 // of in-scattered fire light, not a multiple-scattering/path-tracing claim.
 vec3 down=normalize(vec3(-w.x*.24,-1.,-w.z*.24));
 vec3 fireLight=vec3(0);float extinction=0.;
 for(int j=1;j<=14;j++){
  float dist=(float(j)-.5)*.105;vec3 fq=q+down*dist*uFieldGrid/uSize;
  vec4 c=fieldAt(uC,fq);float t=fieldAt(uV,fq).w;
  float visibility=exp(-min(extinction,24.));
  fireLight+=pyEmission(t,c,fieldBlackbody(300.+1420.*t))*visibility*.105/(1.+dist*dist*4.);
  extinction+=max(0.,c.z)*.105*(1.+uSmoke*2.5);
  extinction+=solid(p+down*dist*uGrid/uSize)*4.;
 }
 scatter+=fireLight*.17;
 O=vec4(scatter,shadow);
}`;
const occupancyGLSL=gridGLSL+`
uniform sampler2D uMaterial;uniform sampler2D uV,uC;uniform vec3 uBrickGrid;uniform vec2 uBrickAtlas;out vec4 O;
void main(){vec2 tile=floor(gl_FragCoord.xy/uBrickGrid.xy);vec3 b=vec3(mod(gl_FragCoord.xy,uBrickGrid.xy)-.5,tile.x+tile.y*8.);vec3 base=b*8.;float m=0.;
for(int z=-1;z<9;z++)for(int y=-1;y<9;y++)for(int x=-1;x<9;x++){m=max(m,max(at(uC,base+vec3(x,y,z)).z,at(uV,base+vec3(x,y,z)).w*.2));}
O=vec4(m,0,0,0);
}`;


const lightGLSL=gridGLSL+`uniform sampler2D uMaterial,uV,uC;out vec4 O;
void main(){float sum=0.;for(int i=0;i<18;i++){float a=float(i)*2.399,r=.1+.65*sqrt(float(i)/18.);vec3 p=vec3(cos(a)*r,.32+mod(float(i),3.)*.24,sin(a)*r);vec3 q=(p+vec3(uSize.x*.5,0.,uSize.z*.5))/uSize*uGrid-.5;
 float kelvin=300.+sampleV(uV,q).w*1420.;float soot=sampleV(uC,q).z;
 vec4 c=sampleV(uC,q);sum+=230000./(exp(23395./max(400.,kelvin))-1.)*soot*9.+uChemilum*c.w*.25;}
 O=vec4(1.-exp(-sum*.15),0,0,1);}`;

const renderGLSL=gridGLSL+`
in vec2 vUV;out vec4 O;uniform sampler2D uV,uC,uMaterial,uOccupancy,uLight;uniform vec3 uBrickGrid;uniform vec2 uBrickAtlas;
uniform vec3 uMaterialGrid;uniform vec2 uMaterialAtlas;
uniform vec3 uEye,uForward,uRight,uUp;uniform float uTan,uAspect,uTime,uFrame,uExposure,uSmoke;uniform vec2 uResolution;uniform int uSteps;uniform int uView;uniform int uTransparent;uniform int uAOV;uniform float uSlice;
float gEnergy=1.;
vec3 pyLightTint(){vec3 c=vec3(1.,.21,.033);if(uReactionParams.z<.1&&uChemilum>.1)c=uTint;return mix(c,uTint,uColorMix);}
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+X),f.x),mix(hash(i+Y),hash(i+X+Y),f.x),f.y),mix(mix(hash(i+Z),hash(i+X+Z),f.x),mix(hash(i+Y+Z),hash(i+X+Y+Z),f.x),f.y),f.z);}
vec2 box(vec3 ro,vec3 rd,vec3 lo,vec3 hi){vec3 inv=1./(rd+vec3(1e-8));vec3 a=(lo-ro)*inv,b=(hi-ro)*inv;vec3 n=min(a,b),f=max(a,b);return vec2(max(max(n.x,n.y),n.z),min(min(f.x,f.y),f.z));}
vec3 gridP(vec3 p){return (p+vec3(uSize.x*.5,0,uSize.z*.5))/uSize*uGrid-.5;}
vec4 fields(vec3 p){vec3 q=gridP(p);if(any(lessThan(q,vec3(0)))||any(greaterThan(q,uGrid-1.)))return vec4(0);vec4 c=sampleV(uC,q);float t=sampleV(uV,q).w;return vec4(c.z,t,c.w,c.x);}
vec3 blackbody(float t){
 // Three-band Planck approximation, normalized at 1900 K. t is Kelvin.
 vec3 lambda=vec3(615e-9,535e-9,455e-9);
 vec3 p=1./(pow(lambda/615e-9,vec3(5.))*(exp(vec3(.0143878)/(lambda*max(t,400.)))-1.));
 return p*230000.;
}
vec3 emitted(vec4 s){float kelvin=300.+s.y*1420.;vec3 B=blackbody(kelvin);return B*s.x*13.;}
float cylinder(vec3 ro,vec3 rd,vec3 a,vec3 b,float radius){
 vec3 ba=b-a,oa=ro-a;float baba=dot(ba,ba),bard=dot(ba,rd),baoa=dot(ba,oa),rdoa=dot(rd,oa),oaoa=dot(oa,oa);
 float A=baba-bard*bard,B=baba*rdoa-baoa*bard,C=baba*oaoa-baoa*baoa-radius*radius*baba;
 float h=B*B-A*C;if(h<0.)return 1e5;float t=(-B-sqrt(h))/A,y=baoa+t*bard;if(t>0.&&y>0.&&y<baba)return t;
 t=((y<0.?0.:baba)-baoa)/bard;if(t>0.&&abs(B+A*t)<sqrt(h))return t;return 1e5;
}

vec3 pySurface(vec3 p,vec3 n,vec3 base,float metal){
 float a=max(dot(n,normalize(vec3(-.6,1.,.45))),0.);
 float b=max(dot(n,normalize(vec3(.7,.4,-.5))),0.);
 float rough=noise(p*72.);vec3 c=base*(.35+1.2*a+.32*b)*(.85+.15*rough);
 float nearFire=exp(-dot(p.xz,p.xz)*.5);
 c+=pyLightTint()*.014*gEnergy*nearFire*(.4+.6*max(n.y,0.));
 c+=vec3(.15,.20,.29)*pow(max(dot(n,normalize(vec3(-.8,.65,.6))),0.),25.)*metal;
 return c;
}
void pyCyl(vec3 ro,vec3 rd,vec3 a,vec3 b,float r,vec3 base,float metal,inout float depth,inout vec3 color){
 float t=cylinder(ro,rd,a,b,r);if(t<depth){vec3 p=ro+rd*t,ba=b-a;float u=dot(p-a,ba)/dot(ba,ba);
 vec3 n=u<.001?-normalize(ba):(u>.999?normalize(ba):normalize(p-a-ba*u));color=pySurface(p,n,base,metal);depth=t;}
}
void pyBox(vec3 ro,vec3 rd,vec3 lo,vec3 hi,vec3 base,float metal,inout float depth,inout vec3 color){
 vec2 h=box(ro,rd,lo,hi);if(h.x>0.&&h.y>=h.x&&h.x<depth){vec3 p=ro+rd*h.x;
 vec3 d=min(abs(p-lo),abs(p-hi)),n=vec3(0);if(d.x<d.y&&d.x<d.z)n.x=p.x<(lo.x+hi.x)*.5?-1.:1.;else if(d.y<d.z)n.y=p.y<(lo.y+hi.y)*.5?-1.:1.;else n.z=p.z<(lo.z+hi.z)*.5?-1.:1.;color=pySurface(p,n,base,metal);depth=h.x;}
}
void pyProps(vec3 ro,vec3 rd,inout float depth,inout vec3 color){
 vec2 bounds=box(ro,rd,vec3(-1.5,0.,-1.4),vec3(1.5,1.5,1.4));if(bounds.y<max(0.,bounds.x))return;
 if(uEmitter==5||uEmitter==13){for(int i=0;i<3;i++){
  if(uEmitter==5&&i>0)break;float x=uEmitter==5?0.:(float(i)-1.)*.55;
  float rad=uEmitter==5?.19:.145;
  pyCyl(ro,rd,vec3(x,.04,0),vec3(x,uSourceHeight-.035,0),rad,vec3(.57,.46,.29),.1,depth,color);
  pyCyl(ro,rd,vec3(x,uSourceHeight-.045,0),vec3(x,uSourceHeight+.025,0),.014,vec3(.02,.012,.006),0.,depth,color);
  pyCyl(ro,rd,vec3(x,.015,0),vec3(x,.042,0),rad+.05,vec3(.12,.14,.18),.8,depth,color);
 }}
 else if(uEmitter==6||uEmitter==7){
  vec2 extent=uEmitter==7?vec2(1.26,1.12):vec2(.72,.68);
  pyBox(ro,rd,vec3(-extent.x,.015,-extent.y),vec3(extent.x,.145,extent.y),vec3(.055,.065,.080),.85,depth,color);
  for(int i=0;i<4;i++){
   if(uEmitter==6&&i>0)break;vec2 c=uEmitter==6?vec2(0):vec2((i%2)==0?-.64:.64,i<2?-.57:.57);
   pyCyl(ro,rd,vec3(c.x,.145,c.y),vec3(c.x,.24,c.y),uRadius+.07,vec3(.04,.045,.05),.75,depth,color);
   pyCyl(ro,rd,vec3(c.x,.242,c.y),vec3(c.x,.265,c.y),uRadius-.038,vec3(.018,.020,.022),.25,depth,color);
   for(int j=0;j<4;j++){float a=float(j)*1.5707963;vec2 d=vec2(cos(a),sin(a));pyCyl(ro,rd,vec3(c.x+d.x*(uRadius+.06),.35,c.y+d.y*(uRadius+.06)),vec3(c.x+d.x*(uRadius+.20),.35,c.y+d.y*(uRadius+.20)),.022,vec3(.04,.045,.05),.65,depth,color);}
  }
  for(int i=0;i<4;i++){if(uEmitter==6&&i>0)break;float x=uEmitter==6?0.:(float(i)-1.5)*.35;pyCyl(ro,rd,vec3(x,.14,extent.y-.09),vec3(x,.205,extent.y-.09),.055,vec3(.055,.065,.075),.85,depth,color);}
 }
 else if(uEmitter==8){vec3 d=normalize(uDirection),tip=vec3(0,uSourceHeight,0);
  pyCyl(ro,rd,tip-d*.38,tip-d*.025,uRadius*1.25,vec3(.09,.12,.17),.95,depth,color);
  pyCyl(ro,rd,tip-d*.12,tip-d*.07,uRadius*1.48,vec3(.13,.14,.15),.95,depth,color);
 }
 else if(uEmitter==10){for(int i=0;i<2;i++){float s=i==0?-1.:1.;pyCyl(ro,rd,vec3(s*1.30,uSourceHeight,0),vec3(s*.9,uSourceHeight,0),uRadius*1.30,vec3(.10,.13,.18),.95,depth,color);}}
 else if(uEmitter==9){
  pyBox(ro,rd,vec3(-1.11,.04,-.16),vec3(1.11,.20,.16),vec3(.07,.09,.12),.8,depth,color);
  for(int i=0;i<5;i++){float x=(float(i)-2.)*.43;pyCyl(ro,rd,vec3(x,.18,0),vec3(x,uSourceHeight-.025,0),uRadius*1.3,vec3(.11,.13,.15),.95,depth,color);}
 }
 else if(uEmitter==12){pyBox(ro,rd,vec3(-.91,.04,-.15),vec3(.91,.23,.15),vec3(.08,.10,.13),.7,depth,color);}
 else if(uEmitter!=2&&uEmitter!=11&&uEmitter!=4){
  float r=uEmitter==0?1.17:uRadius+.18;
  pyCyl(ro,rd,vec3(0,.015,0),vec3(0,.072,0),r,vec3(.009,.012,.017),.8,depth,color);
  if(uEmitter==0)for(int j=0;j<12;j++){float a=float(j)*.5235987756;vec3 p=vec3(cos(a)*1.08,.069,sin(a)*1.08);pyCyl(ro,rd,p,p+vec3(0,.021,0),.022,vec3(.04,.047,.055),.8,depth,color);}
 }
 if(uObstacle==3){
  pyCyl(ro,rd,vec3(0,.575,0),vec3(0,.665,0),.55,vec3(.1,.13,.17),.9,depth,color);
  pyCyl(ro,rd,vec3(.48,.62,0),vec3(1.10,.65,0),.045,vec3(.055,.06,.068),.5,depth,color);
 }
}

vec3 stage(vec3 ro,vec3 rd,out float depth){
 vec3 color=vec3(.006,.008,.012)*(1.+.6*max(rd.y,0.));depth=1e4;
 float floorT=-ro.y/rd.y;
 if(floorT>0.){
  vec3 p=ro+rd*floorT;float radial=dot(p.xz,p.xz);
  float n=noise(p*15.),fine=noise(p*95.);vec3 albedo=mix(vec3(.007,.010,.015),vec3(.013,.016,.024),n);
  vec3 norm=normalize(vec3((noise(p*19.+X)-n)*.006,1.,(noise(p*19.+Z)-n)*.006));
  float pool=pow(1.+radial*.42,-1.75);
  vec3 lp=vec3(0,.8,0)-p;float nd=max(dot(norm,normalize(lp)),0.);
  color=albedo*(vec3(.35,.49,.66)+pyLightTint()*5.*pool*nd*gEnergy);
  vec3 h=normalize(normalize(lp)-rd);float spec=pow(max(dot(norm,h),0.),50.);
  color+=pyLightTint()*1.1*spec*pool*gEnergy*(.4+.6*fine);
  color*=1.-.60*exp(-radial/1.0);color=mix(color,vec3(.006,.008,.012),1.-exp(-floorT*.014));depth=floorT;
 }
 pyProps(ro,rd,depth,color);
 if(uEmitter==0)for(int i=0;i<5;i++){
  float fi=float(i);float ang=fi*1.91+.2;vec3 a=vec3(cos(ang)*.72,.24+mod(fi,2.)*.065,sin(ang)*.51);vec3 b=vec3(cos(ang+2.8)*.72,a.y+.02,sin(ang+2.8)*.51);
  float t=cylinder(ro,rd,a,b,.080+mod(fi,2.)*.016);
  if(t<depth){vec3 p=ro+rd*t,ba=b-a;vec3 n=normalize(p-a-ba*clamp(dot(p-a,ba)/dot(ba,ba),0.,1.));
   float pores=noise(p*45.);float grain=noise(vec3(p.x*12.,p.y*92.,p.z*12.));float crack=pow(max(0.,1.-abs(sin(p.x*35.+p.z*29.+grain*4.))),15.);
   color=vec3(.009,.006,.004)*(.7+pores)*(.8+.9*max(n.y,0.))+vec3(.25,.013,.0006)*gEnergy*crack*(.3+.7*pores);depth=t;
  }
 }
 if(uObstacle==1){
  vec3 ce=vec3(0,1.28,0),oc=ro-ce;float bb=dot(oc,rd),h=bb*bb-dot(oc,oc)+.25;
  if(h>0.){float t=-bb-sqrt(h);if(t>0.&&t<depth){vec3 p=ro+rd*t,n=normalize(p-ce);float key=max(dot(n,normalize(vec3(-.6,1.,.45))),0.);color=vec3(.065,.083,.11)*(.25+key)+pyLightTint()*.18*max(0.,-n.y)*gEnergy;depth=t;}}
 }else if(uObstacle==2){
  vec2 h=box(ro,rd,vec3(-.72,1.225,-.60),vec3(.72,1.375,.60));if(h.x>0.&&h.y>=h.x&&h.x<depth){vec3 p=ro+rd*h.x;float edge=min(abs(abs(p.x)-.72),abs(abs(p.z)-.60));color=vec3(.065,.083,.11)+pyLightTint()*.12*gEnergy*step(p.y,1.23);depth=h.x;}
 }
 return color;
}

vec2 materialUV(vec3 p){p=clamp(p,vec3(0),uMaterialGrid-1.);return (vec2(mod(p.z,8.),floor(p.z/8.))*uMaterialGrid.xy+p.xy+.5)/uMaterialAtlas;}
vec3 illumination(vec3 gp){vec3 p=(gp+.5)/uGrid*uMaterialGrid-.5;p=clamp(p,vec3(0),uMaterialGrid-1.001);float z=floor(p.z);return mix(texture(uMaterial,materialUV(vec3(p.xy,z))).rgb,texture(uMaterial,materialUV(vec3(p.xy,z+1.))).rgb,fract(p.z));}
float occupied(vec3 p){vec3 b=clamp(floor((p+vec3(uSize.x*.5,0,uSize.z*.5))/uSize*uGrid/8.),vec3(0),uBrickGrid-1.);vec2 uv=(vec2(mod(b.z,8.),floor(b.z/8.))*uBrickGrid.xy+b.xy+.5)/uBrickAtlas;return texture(uOccupancy,uv).r;}
float nextBrick(vec3 p,vec3 rd){vec3 gp=(p+vec3(uSize.x*.5,0,uSize.z*.5))/uSize*uGrid;vec3 cellSize=8.*uSize/uGrid;vec3 edge=(floor(gp/8.)+step(vec3(0),rd))*cellSize-vec3(uSize.x*.5,0,uSize.z*.5);vec3 d=(edge-p)/(rd+vec3(1e-8));return max(.002,min(min(d.x,d.y),d.z)+.001);}
vec4 volume(vec3 ro,vec3 rd,float limit,int steps,float jitter){
 vec2 hit=box(ro,rd,vec3(-uSize.x*.5,.15,-uSize.z*.5),vec3(uSize.x*.5,uSize.y,uSize.z*.5));
 float begin=max(0.,hit.x),end=min(hit.y,limit);if(end<=begin)return vec4(0,0,0,1);
 float ds=(end-begin)/float(steps),distance=begin+ds*jitter;vec3 col=vec3(0);float tr=1.;
 for(int i=0;i<384;i++){
  if(distance>=end||tr<.006)break;vec3 p=ro+rd*distance;
  if(occupied(p)<.0002){distance+=nextBrick(p,rd);continue;}
  vec3 gp=gridP(p);vec4 c=sampleV(uC,gp);float heat=sampleV(uV,gp).w;float sigma=c.z*(1.+uSmoke*2.5);float cost=dot(-rd,normalize(vec3(-.6,1.,.45)));float phase=.9375/pow(max(.0625,1.0625-.5*cost),1.5);vec4 s=vec4(illumination(gp)*sigma*(.60+.40*phase),sigma);
  vec3 emit=pyEmission(heat,c,blackbody(300.+heat*1420.));
  // Fast three-band Planck emission, not noise-shaped geometry.
  s.rgb+=emit;float segmentLength=min(ds,end-distance);float tau=max(0.,s.a*segmentLength);
  float a=tau<.02?tau*(1.-tau*(.5-tau*(1./6.-tau/24.))):1.-exp(-tau);
  float integrated=tau<.02?segmentLength*(1.-tau*(.5-tau*(1./6.-tau/24.))):a/max(s.a,1e-20);
  col+=tr*s.rgb*integrated;tr*=1.-a;distance+=ds;
 }
 return vec4(col,tr);
}

vec4 dataPass(vec3 ro,vec3 rd,float limit,int mode){
 vec2 hit=box(ro,rd,vec3(-uSize.x*.5,.15,-uSize.z*.5),vec3(uSize.x*.5,uSize.y,uSize.z*.5));
 float begin=max(0.,hit.x),end=min(hit.y,limit);if(end<=begin)return vec4(0);
 float ds=(end-begin)/float(uSteps),tr=1.,sum=0.,depth=0.;vec3 pos=vec3(0),vel=vec3(0),normal=vec3(0);
 for(int i=0;i<384;i++){
  float dist=begin+(float(i)+.5)*ds;if(dist>=end||tr<.001)break;
  vec3 w=ro+rd*dist,gp=gridP(w);vec4 c=sampleV(uC,gp),vv=sampleV(uV,gp);
  float sigma=max(c.z*(1.+uSmoke*2.5),vv.w*.12),a=1.-exp(-sigma*ds),weight=tr*a;
  sum+=weight;depth+=weight*dist;pos+=weight*w;vel+=weight*vv.xyz;
  if(mode==3){vec3 gr=vec3(sampleV(uC,gp+X).z-sampleV(uC,gp-X).z,sampleV(uC,gp+Y).z-sampleV(uC,gp-Y).z,sampleV(uC,gp+Z).z-sampleV(uC,gp-Z).z)*uGrid/uSize;normal-=weight*gr;}
  tr*=1.-a;
 }
 if(sum<1e-6)return vec4(0);
 if(mode==2)return vec4(depth/sum,depth/sum,depth/sum,sum);
 if(mode==3)return vec4(normalize(normal+vec3(1e-10)),sum);
 if(mode==4)return vec4(vel/sum,sum);
 return vec4(pos/sum,sum);
}
void main(){
 vec2 xy=(vUV*2.-1.);vec3 rd=normalize(uForward+uRight*xy.x*uTan*uAspect+uUp*xy.y*uTan);
 gEnergy=texture(uLight,vec2(.5)).r;
 if(uAOV>0){float depth;stage(uEye,rd,depth);if(uAOV==1){vec4 v=volume(uEye,rd,depth,uSteps,.5);O=vec4(v.rgb,1.-v.a);}else O=dataPass(uEye,rd,depth,uAOV);return;}
 if(uView>0){vec3 col=vec3(.004,.006,.01);
 if(uView>0){float t=(uSlice-uEye.z)/rd.z;vec3 p=uEye+rd*t;
  if(t>0.&&abs(p.x)<uSize.x*.5&&p.y>0.&&p.y<uSize.y){vec3 gp=gridP(p);vec4 vv=sampleV(uV,gp),cc=sampleV(uC,gp);vec3 dbg=vec3(.004,.008,.018);
   if(uView==1){float a=clamp(vv.w/1.5,0.,1.);dbg=mix(vec3(.012,.015,.065),vec3(.45,.018,.002),smoothstep(0.,.45,a));dbg=mix(dbg,vec3(1.,.6,.08),smoothstep(.25,.8,a));dbg=mix(dbg,vec3(1.),smoothstep(.8,1.,a));}
   if(uView==2){dbg=vec3(cc.x*.65,cc.y*.19,cc.z*.45);}
   if(uView==3){dbg=vec3(.05)+.16*abs(vv.xyz);vec2 cp=fract(p.xy*8.)-.5;vec2 dir=normalize(vv.xy+1e-6);float along=dot(cp,dir),across=dot(cp,vec2(-dir.y,dir.x));float arrow=(1.-smoothstep(.024,.04,abs(across)))*step(abs(along),.32);dbg+=vec3(.3,.65,.75)*arrow*smoothstep(.2,1.,length(vv.xy));}
   if(uView==4){dbg=vec3(1.-exp(-cc.z*2.));}
   if(solid(gp)>.5)dbg=vec3(.12,.16,.22);col=dbg;
  }
 }
 O=vec4(col,1.);return;}
 if(uTransparent==1){float jitter=hash(vec3(gl_FragCoord.xy,mod(uFrame,64.)))*.8+.1;vec4 v=volume(uEye,rd,1e5,uSteps,jitter);O=vec4(v.rgb,1.-v.a);return;}
 float depth;vec3 col=stage(uEye,rd,depth);
 // A planar reflection is traced through the same volumetric fields, never a decal.
 if(rd.y<0.){float t=-uEye.y/rd.y;if(t>0.&&abs(t-depth)<.03){vec3 p=uEye+rd*t;vec3 refl=reflect(rd,Y);vec4 vr=volume(p+Y*.015,refl,12.,max(20,uSteps/3),.5);float fresnel=.10+.35*pow(1.+rd.y,5.);col+=vr.rgb*fresnel*.7;}}
 if(uObstacle==1){vec3 p=uEye+rd*depth,ce=vec3(0,1.28,0);if(abs(length(p-ce)-.5)<.006){vec3 n=normalize(p-ce);vec4 rr=volume(p+n*.008,reflect(rd,n),8.,max(28,uSteps/3),.5);col+=rr.rgb*.38;}}
 float jitter=hash(vec3(gl_FragCoord.xy,mod(uFrame,64.)))*.8+.1;
 vec4 v=volume(uEye,rd,depth,uSteps,jitter);col=col*v.a+v.rgb;

 O=vec4(max(col,vec3(0)),1.);
}`;

const postGLSL=`in vec2 vUV;out vec4 O;uniform sampler2D uImage,uBloom;uniform vec2 uResolution;uniform float uExposure,uTime;uniform int uClean,uTransparent;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec2 uv=vUV;vec3 c=texture(uImage,uv).rgb;vec3 b=texture(uBloom,uv).rgb;c+=b*.09;
c*=uExposure;float luma=dot(c,vec3(.2126,.7152,.0722));vec3 lumMapped=c*(aces(vec3(luma)).r/max(luma,1e-5));vec3 channelMapped=aces(c);c=mix(channelMapped,lumMapped,.38);c=clamp(c,0.,1.);c=pow(c,vec3(1./2.2));
// PNG alpha is a visual compositing mask, not a scientific transmittance channel.
if(uTransparent==1){float alpha=max(texture(uImage,uv).a,max(c.r,max(c.g,c.b)));O=vec4(c/max(alpha,1e-6),alpha);return;}
float vignette=1.-.19*pow(length((uv-.5)*vec2(1.,.85)),1.5);c*=vignette;
float grain=fract(sin(dot(gl_FragCoord.xy+uTime,vec2(12.9898,78.233)))*43758.5453);c+=(grain-.5)/650.;O=vec4(c,1.);}`;
const blurGLSL=`in vec2 vUV;out vec4 O;uniform sampler2D uImage;uniform vec2 uDirection;uniform int uThreshold;
void main(){vec3 c=vec3(0);float weights[5]=float[5](.227027,.1945946,.1216216,.054054,.016216);for(int i=-4;i<=4;i++){vec3 a=texture(uImage,vUV+uDirection*float(i)).rgb;if(uThreshold==1)a=max(a-vec3(.65),vec3(0));c+=a*weights[abs(i)];}O=vec4(c,1.);}`;

class SceneRenderer {
 constructor(gpu,flow){this.gpu=gpu;this.flow=flow;this.lightProgram=gpu.program(lightGLSL);this.light=gpu.target(1,1);this.materialProgram=gpu.program(materialGLSL);this.occupancyProgram=gpu.program(occupancyGLSL);this.program=gpu.program(renderGLSL);this.cacheTick=-1;this.post=gpu.program(postGLSL);this.blur=gpu.program(blurGLSL);this.steps=160;this.exposure=1.1;this.view=0;this.slice=0;this.transparent=0;this.aov=0;this.smoke=.6;this.frame=0;this.scale=.7;this.angle=.42;this.pitch=.13;this.radius=7.4;this.target=[0,1.65,0];this.resize(1280,720);}
 resize(w,h,scale=this.scale){this.scale=scale;if(this.gpu.threeRenderer)this.gpu.threeRenderer.setSize(w,h,false);else{canvas.width=w;canvas.height=h;}for(const t of this.targets||[])this.gpu.destroy(t);this.image=this.gpu.target(Math.ceil(w*scale),Math.ceil(h*scale));this.bloom=[this.gpu.target(Math.ceil(w/6),Math.ceil(h/6)),this.gpu.target(Math.ceil(w/6),Math.ceil(h/6))];this.targets=[this.image,...this.bloom];}
 camera(shot=null,t=0){
  let eye,target=[0,1.50,0],fov=40;
  if(shot==='film'){const a=-.36+t*.13;eye=[Math.sin(a)*6.3,2.+.20*Math.sin(t*.55),Math.cos(a)*6.3];target=[0,1.78,0];fov=43;}
  else if(shot==='orbit'){const a=.10+t*.135;eye=[Math.sin(a)*5.5,1.85+Math.sin(t*.24)*.16,Math.cos(a)*5.5];target=[0,1.24,0];fov=39;}
  else if(shot==='low'){const a=-.5+t*.065;let r=5.55-t*.045;eye=[Math.sin(a)*r,.64+t*.035,Math.cos(a)*r];target=[.03,1.16,0];fov=42;}
  else if(shot==='close'){const a=.72+t*.075;eye=[Math.sin(a)*4.4,1.65-t*.027,Math.cos(a)*4.4];target=[0,1.08+t*.018,0];fov=36;}
  else {target=this.target;eye=[Math.sin(this.angle)*Math.cos(this.pitch)*this.radius,Math.sin(this.pitch)*this.radius+target[1],Math.cos(this.angle)*Math.cos(this.pitch)*this.radius];}
  if(this.customFov)fov=this.customFov;
  if(this.fixedCamera){eye=this.fixedCamera.eye;target=this.fixedCamera.aim;fov=this.fixedCamera.fov||fov;}
  if(this.gpu.THREE){
   const T=this.gpu.THREE;if(!this.threeCamera)this.threeCamera=new T.PerspectiveCamera(fov,canvas.width/canvas.height,.01,100);
   this.threeCamera.position.set(...eye);this.threeCamera.lookAt(...target);this.threeCamera.fov=fov;this.threeCamera.aspect=canvas.width/canvas.height;this.threeCamera.updateProjectionMatrix();this.threeCamera.updateMatrixWorld();
  }
  const forward=V.norm(V.sub(target,eye)),right=V.norm(V.cross(forward,[0,1,0])),up=V.norm(V.cross(right,forward));return {uEye:eye,uForward:forward,uRight:right,uUp:up,uTan:Math.tan(fov*Math.PI/360),uAspect:canvas.width/canvas.height};
 }
 render(shot=null,t=0,outputTarget=null){const g=this.gpu,b=this.flow.base();if(g.threeRenderer)g.threeRenderer.resetState();
  if(!this.material||this.materialSourceW!==this.flow.w||this.materialSourceH!==this.flow.h){g.destroy(this.material);g.destroy(this.occupancy);this.materialSourceW=this.flow.w;this.materialSourceH=this.flow.h;this.materialGrid=this.flow.grid.map(n=>Math.ceil(n/2));this.materialAtlas=[this.materialGrid[0]*8,this.materialGrid[1]*Math.ceil(this.materialGrid[2]/8)];this.material=g.target(...this.materialAtlas);this.brickGrid=this.flow.grid.map(n=>Math.ceil(n/8));this.brickAtlas=[this.brickGrid[0]*8,this.brickGrid[1]*Math.ceil(this.brickGrid[2]/8)];this.occupancy=g.target(...this.brickAtlas);this.cacheTick=-1;}
  const cacheKey=JSON.stringify([this.flow.tick,this.flow.grid,this.smoke,b.uTint,b.uColorMix,b.uChemilum,b.uEmitter,b.uObstacle,b.uReactionParams]);if(this.cacheKey!==cacheKey){g.pass(this.materialProgram,this.material,{...b,uGrid:this.materialGrid,uAtlas:this.materialAtlas,uFieldGrid:this.flow.grid,uFieldAtlas:[this.flow.w,this.flow.h],uV:this.flow.v,uC:this.flow.c,uSmoke:this.smoke});g.pass(this.occupancyProgram,this.occupancy,{...b,uMaterial:this.material.textures[0],uV:this.flow.v,uC:this.flow.c,uBrickGrid:this.brickGrid,uBrickAtlas:this.brickAtlas});g.pass(this.lightProgram,this.light,{...b,uMaterial:this.material.textures[0],uV:this.flow.v,uC:this.flow.c});this.cacheTick=this.flow.tick;this.cacheKey=cacheKey;}

  g.pass(this.program,this.image,{...b,...this.camera(shot,t),uMaterialGrid:this.materialGrid,uMaterialAtlas:this.materialAtlas,uLight:this.light.textures[0],uMaterial:this.material.textures[0],uOccupancy:this.occupancy.textures[0],uBrickGrid:this.brickGrid,uBrickAtlas:this.brickAtlas,uV:this.flow.v,uC:this.flow.c,uTime:this.flow.time,uFrame:this.flow.tick,uSteps:this.steps,uView:this.view,uSlice:this.slice,uTransparent:this.transparent,uAOV:this.aov,uSmoke:this.smoke,uResolution:[this.image.w,this.image.h]});
  if(this.embers&&!this.transparent&&!this.view&&!this.aov)this.embers.draw(this.image,this.camera(shot,t));
  g.pass(this.blur,this.bloom[0],{uImage:this.image.textures[0],uDirection:[1/this.bloom[0].w,0],uThreshold:1});
  g.pass(this.blur,this.bloom[1],{uImage:this.bloom[0].textures[0],uDirection:[0,1/this.bloom[0].h],uThreshold:0});
  g.pass(this.blur,this.bloom[0],{uImage:this.bloom[1].textures[0],uDirection:[1/this.bloom[0].w,0],uThreshold:0});
  g.pass(this.post,outputTarget,{uImage:this.image.textures[0],uBloom:this.bloom[0].textures[0],uResolution:[canvas.width,canvas.height],uExposure:this.exposure,uTime:this.flow.time,uClean:CAPTURE?1:0,uTransparent:this.transparent});
 }
}

async function main(){
 let THREE=window.THREE||null;
 if(!THREE&&!Q.has('offline')&&!window.__OFFLINE__){
  status('Loading Three.js…');
  try {THREE=await Promise.race([import(new URL('vendor/three.module.js',document.baseURI).href).catch(()=>import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js')),new Promise((_,r)=>setTimeout(()=>r(Error('offline')),5000))]);}catch(e){console.info('Offline fallback: identical GLSL, native WebGL2 host.',e.message)}
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
 if(window.PYRE2Detail)window.PYRE2Detail.install(app);if(window.PYRE3Install)window.PYRE3Install(app);if(window.IGNIAEmbers)window.IGNIAEmbers.install(app);window.IGNIA=app;if(window.IGNIAEXR)window.IGNIAEXR.install(app);
 render.render('orbit',0);if(!CAPTURE)requestAnimationFrame(frame);
 document.body.classList.add('ready');
}
main().catch(e=>{console.error(e);status(e.message);document.body.classList.add('error');window.PYRE_ERROR=e.stack});
