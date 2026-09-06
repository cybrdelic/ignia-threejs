/**
 * PYRE IV / controlled volumetric combustion studies.
 * IGNIA project implementation. Distributed under the repository GPL-2.0-only license; Three.js remains separately MIT licensed. Simulation units: metres and seconds.
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
 program(fragment){
  if(this.THREE){const T=this.THREE;const material=new T.RawShaderMaterial({glslVersion:T.GLSL3,vertexShader:'precision highp float;out vec2 vUV;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);}',fragmentShader:'precision highp float;precision highp int;\n'+fragment,uniforms:{},depthTest:false,depthWrite:false,blending:T.NoBlending});const result={material};this.programs.push(result);return result;}
  const g=this.gl,vs=`#version 300 es\nprecision highp float;out vec2 vUV;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
  const compile=(type,src)=>{const s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw new Error(g.getShaderInfoLog(s)+'\n'+src);return s};
  const p=g.createProgram();g.attachShader(p,compile(g.VERTEX_SHADER,vs));g.attachShader(p,compile(g.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;precision highp int;\n'+fragment));g.linkProgram(p);
  if(!g.getProgramParameter(p,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(p));
  const u={};for(let i=0,n=g.getProgramParameter(p,g.ACTIVE_UNIFORMS);i<n;i++){let q=g.getActiveUniform(p,i);u[q.name]={loc:g.getUniformLocation(p,q.name),type:q.type}}
  const result={p,u};this.programs.push(result);return result;
 }
 pass(pr,target,uniforms={}){
  if(this.THREE){for(const [name,value] of Object.entries(uniforms)){if(!pr.material.uniforms[name])pr.material.uniforms[name]={value};else pr.material.uniforms[name].value=value;}this.passMesh.material=pr.material;this.threeRenderer.setRenderTarget(target?target.rt:null);this.threeRenderer.render(this.passScene,this.passCamera);return;}
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
  g.drawArrays(g.TRIANGLES,0,3);
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
` + window.PYRE3_GLSL;
