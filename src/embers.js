/** IGNIA / one-way coupled Lagrangian ember tracers.
 * Positions, velocities, age and thermal state persist in GPU textures.
 * These are VFX particles with drag/cooling, not calibrated burning solids.
 * GPL-2.0-only; no sprites, image files, or prerecorded fire are used.
 */
window.IGNIAEmberShaders = function(grid){
 const init=`layout(location=0)out vec4 P;layout(location=1)out vec4 V;void main(){P=vec4(0,0,0,-1);V=vec4(0);}`;
 const step=grid+`
 uniform sampler2D uParticles,uParticleV,uV,uC;
 uniform float uDT,uTime,uFuel,uParticleCount;
 layout(location=0)out vec4 P;layout(location=1)out vec4 V;
 float rnd(float x){return fract(sin(x*127.1+311.7)*43758.5453);}
 void main(){
  float id=floor(gl_FragCoord.x);vec2 uv=vec2((id+.5)/uParticleCount,.5);
  P=texture(uParticles,uv);V=texture(uParticleV,uv);
  float seed=id*17.31+floor(uTime*48.)*3.77;
  if(P.w<0.){
   if(uEmitter!=0||uFuel<=0.||rnd(seed)>uDT*.040)return;
   float a=rnd(seed+1.)*6.2831853,r=.58*sqrt(rnd(seed+2.));
   vec3 w=vec3(cos(a)*r,.37,sin(a)*r);
   vec3 gp=(w+vec3(uSize.x*.5,0,uSize.z*.5))/uSize*uGrid-.5;
   vec4 field=sampleV(uV,gp);if(field.w<.25)return;
   P=vec4(w,0.);V=vec4(field.xyz*.7+vec3((rnd(seed+3.)-.5)*.8,.7+rnd(seed+4.)*1.3,(rnd(seed+5.)-.5)*.8),max(.85,field.w));
  }else{
   vec3 gp=(P.xyz+vec3(uSize.x*.5,0,uSize.z*.5))/uSize*uGrid-.5;
   vec4 field=sampleV(uV,gp);
   V.xyz=mix(V.xyz,field.xyz,1.-exp(-uDT*3.6));V.y-=uDT*2.8;
   P.xyz+=uDT*V.xyz;P.w+=uDT;
   V.w*=exp(-uDT*(.30+.24*V.w));
   if(P.y<.1||P.y>uSize.y||abs(P.x)>uSize.x*.5||abs(P.z)>uSize.z*.5||P.w>2.2+2.*rnd(id)||V.w<.28||solid(gp)>.5){P.w=-1.;V=vec4(0);}
  }
 }`;
 const vertex=`precision highp float;precision highp int;
 uniform sampler2D uParticles,uParticleV,uC;
 uniform vec3 uGrid,uSize,uEye,uForward,uRight,uUp,uTint;
 uniform vec2 uAtlas;uniform float uTan,uAspect,uParticleCount,uPixelHeight,uSmoke,uColorMix;
 out vec3 vEmber;out vec2 vDirection;out float vStretch;
 float rnd(float x){return fract(sin(x*127.1+311.7)*43758.5453);}
 vec2 uvFor(vec3 p){p=clamp(p,vec3(0),uGrid-1.);return (vec2(mod(p.z,8.),floor(p.z/8.))*uGrid.xy+p.xy+.5)/uAtlas;}
 float soot(vec3 p){p=clamp(p,vec3(0),uGrid-1.001);float z=floor(p.z);return mix(texture(uC,uvFor(vec3(p.xy,z))).z,texture(uC,uvFor(vec3(p.xy,z+1.))).z,fract(p.z));}
 void main(){
  float id=float(gl_VertexID);vec2 uv=vec2((id+.5)/uParticleCount,.5);
  vec4 p=texture(uParticles,uv),v=texture(uParticleV,uv);vec3 q=p.xyz-uEye;float z=dot(q,uForward);
  if(p.w<0.||z<.05){gl_Position=vec4(3,3,0,1);gl_PointSize=1.;vEmber=vec3(0);vDirection=vec2(1,0);vStretch=1.;return;}
  gl_Position=vec4(dot(q,uRight)/(z*uTan*uAspect),dot(q,uUp)/(z*uTan),0,1);
  vec2 projected=vec2(dot(v.xyz,uRight),dot(v.xyz,uUp));vDirection=normalize(projected+vec2(1e-5,0));
  float radius=.0025+.0045*rnd(id*2.13);vStretch=clamp(length(projected)*2.,1.,4.);
  gl_PointSize=clamp(radius*uPixelHeight/(z*uTan)*2.*vStretch,1.4,16.);
  float tau=0.,distance=length(q);vec3 ray=q/max(distance,1e-5);
  for(int i=0;i<10;i++){
   vec3 w=uEye+ray*(distance*(float(i)+.5)/10.);
   vec3 gp=(w+vec3(uSize.x*.5,0,uSize.z*.5))/uSize*uGrid-.5;
   if(all(greaterThanEqual(gp,vec3(0)))&&all(lessThan(gp,uGrid)))tau+=soot(gp)*distance*.10*(1.+uSmoke*2.5);
  }
  vec3 hot=mix(vec3(1.,.035,.001),vec3(1.,.63,.12),smoothstep(.4,1.6,v.w));
  hot=mix(hot,uTint,uColorMix);vEmber=hot*(2.+12.*v.w)*exp(-tau)*smoothstep(.28,.55,v.w);
 }`;
 const fragment=`precision highp float;in vec3 vEmber;in vec2 vDirection;in float vStretch;out vec4 O;
 void main(){vec2 p=gl_PointCoord-.5;float along=dot(p,vDirection),across=dot(p,vec2(-vDirection.y,vDirection.x));float d=length(vec2(along,across*vStretch));float a=exp(-d*d*18.)*(1.-smoothstep(.36,.5,d));O=vec4(vEmber*a,0);}`;
 return {init,step,vertex,fragment};
};
window.IGNIAEmbers = (()=>{
 class EmberSystem{
  constructor(app,count=2048){this.app=app;this.gpu=app.gpu;this.count=count;const s=window.IGNIAEmberShaders(gridGLSL);this.init=this.gpu.program(s.init);this.update=this.gpu.program(s.step);this.drawProgram=this.gpu.program(s.fragment,s.vertex,count);this.state=[this.gpu.target(count,1,2),this.gpu.target(count,1,2)];this.reset();}
  reset(){for(const t of this.state)this.gpu.pass(this.init,t);}
  step(dt){const f=this.app.render.flow;this.gpu.pass(this.update,this.state[1],{...f.base(),uDT:dt,uParticleCount:this.count,uParticles:this.state[0].textures[0],uParticleV:this.state[0].textures[1],uV:f.v,uC:f.c});this.state.reverse();}
  draw(target,camera){const f=this.app.render.flow,r=this.app.render;this.gpu.pass(this.drawProgram,target,{...f.base(),...camera,uParticleCount:this.count,uParticles:this.state[0].textures[0],uParticleV:this.state[0].textures[1],uC:f.c,uPixelHeight:target.h,uSmoke:r.smoke});}
 }
 function install(app){const e=new EmberSystem(app);app.embers=e;app.render.embers=e;const step=app.flow.step.bind(app.flow),reset=app.flow.reset.bind(app.flow);app.flow.step=dt=>{step(dt);e.step(dt);};app.flow.reset=()=>{reset();e.reset();};}
 return {EmberSystem,install};
})();
