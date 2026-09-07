/** Advected scalar refinement. This is a VFX turbulence closure, not additional
 * resolved Navier–Stokes momentum. Geometry remains entirely field-derived. */
window.PYRE2DetailShaders = function (grid) {
 const common = grid + `
 uniform sampler2D uMacroV,uMacroC,uV,uC,uA,uB;
 uniform vec3 uMacroGrid;uniform vec2 uMacroAtlas;
 uniform float uDT,uTime,uFuel,uTurbulence;
 vec2 muv(vec3 p){p=clamp(p,vec3(0),uMacroGrid-1.);return (vec2(mod(p.z,8.),floor(p.z/8.))*uMacroGrid.xy+p.xy+.5)/uMacroAtlas;}
 vec4 ms(sampler2D t,vec3 p){p=clamp(p,vec3(0),uMacroGrid-1.001);float z=floor(p.z);return mix(texture(t,muv(vec3(p.xy,z))),texture(t,muv(vec3(p.xy,z+1.))),fract(p.z));}
 vec3 macroP(vec3 p){return (p+.5)/uGrid*uMacroGrid-.5;}
 vec3 transport(vec3 p){
  vec3 w=world(p),q=w-vec3(.17,.9,.11)*uTime;
  // Each mode is transverse to its wavevector: k dot a = 0.
  // Its continuous divergence is zero; collider clipping is only a VFX boundary approximation.
  vec3 n=vec3(0);
  n+=vec3(.7071,-.7071,0)*sin(dot(q,vec3(13.,13.,7.))+1.3);
  n+=vec3(0,.7071,-.7071)*sin(dot(q,vec3(11.,29.,29.))+.8);
  n+=vec3(.7071,0,.7071)*sin(dot(q,vec3(43.,17.,-43.))+2.4);
  n+=vec3(-.7071,.7071,0)*sin(dot(q,vec3(67.,67.,-23.))+4.1);
  n+=vec3(.7071,0,-.7071)*sin(dot(q,vec3(29.,-19.,29.))+3.2);
  n*=uTurbulence*.38;
  vec3 mp=macroP(p);
  vec3 v=vec3(ms(uMacroV,mp-.5*X).x,ms(uMacroV,mp-.5*Y).y,ms(uMacroV,mp-.5*Z).z)+n;
  if(uObstacle==1){vec3 d=w-vec3(0,1.28,0);float r=length(d);if(r<.5+2.*uSize.x/uGrid.x){vec3 normal=d/max(r,1e-5);v-=normal*min(dot(v,normal),0.);}}
  if(solid(p)>.5)return vec3(0);
  v*=vec3(faceOpen(p,X*sign(v.x)),faceOpen(p,Y*sign(v.y)),faceOpen(p,Z*sign(v.z)));return v;
 }
 
 vec3 detailTrace(vec3 p,float dt){
  vec3 mid=p-.5*dt*transport(p)*uGrid/uSize;
  vec3 dep=p-dt*transport(mid)*uGrid/uSize;
  if(uObstacle>0){for(int k=1;k<=4;k++)if(solid(mix(p,dep,float(k)*.25))>.5)return p;}
  dep.y=max(dep.y,-.49);return dep;
 }
 layout(location=0)out vec4 O;layout(location=1)out vec4 C;
 `;
 const advect=common+`void main(){vec3 p=cell(),v=transport(p),dep=detailTrace(p,uDT);O=sampleV(uV,dep);C=sampleV(uC,dep);O.xyz=v;}`;
 const react=common+`
 float segment(vec2 p,vec2 a,vec2 b){vec2 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.));}
 void main(){
  vec3 p=cell(),w=world(p),v=transport(p),dep=detailTrace(p,uDT),q=floor(dep);float dt=uDT;
  float loT=1e5,hiT=-1e5;vec4 loC=vec4(1e5),hiC=-loC;
  for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec3 r=q+vec3(x,y,z);float t=at(uV,r).w;vec4 c=at(uC,r);loT=min(loT,t);hiT=max(hiT,t);loC=min(loC,c);hiC=max(hiC,c);}
  vec3 rev=detailTrace(p,-dt);
  O=vec4(v,clamp(at(uA,p).w+.5*(at(uV,p).w-sampleV(uA,rev).w),loT,hiT));
  C=clamp(at(uB,p)+.5*(at(uC,p)-sampleV(uB,rev)),loC,hiC);
  vec3 h=uSize/uGrid,ih=1./(h*h);
  vec4 oldC=at(uC,p);float oldT=at(uV,p).w;
  vec4 lc=(at(uC,p+X)+at(uC,p-X)-2.*oldC)*ih.x+(at(uC,p+Y)+at(uC,p-Y)-2.*oldC)*ih.y+(at(uC,p+Z)+at(uC,p-Z)-2.*oldC)*ih.z;
  float lt=(at(uV,p+X).w+at(uV,p-X).w-2.*oldT)*ih.x+(at(uV,p+Y).w+at(uV,p-Y).w-2.*oldT)*ih.y+(at(uV,p+Z).w+at(uV,p-Z).w-2.*oldT)*ih.z;
  C+=lc*.00011*dt;O.w+=lt*.00012*dt;
  float source=pySource(w,uTime);
  float phase=1.+uSourceParams.w*(.32*sin(w.x*22.+uTime*5.8)*sin(w.z*19.-uTime*4.1)+.16*sin(w.x*37.+w.z*31.+uTime*12.));
  phase*=1.+uSourceParams.w*.22*sin(w.x*91.+uTime*18.)*sin(w.z*73.-uTime*13.);
  float injection=max(0.,source*uFuel*phase);
  pyReact(O,C,injection,dt);
  if(p.x<1.||p.x>uGrid.x-2.||p.z<1.||p.z>uGrid.z-2.||p.y>uGrid.y-2.){C=mix(C,vec4(0,uOxygen,0,0),1.-exp(-24.519*dt));O.w*=exp(-10.711*dt);}
  if(solid(p)>.5){O=vec4(0);C=vec4(0);}
 }`;
 const seed=common+`void main(){vec3 p=cell();O=ms(uMacroV,macroP(p));C=ms(uMacroC,macroP(p));if(solid(p)>.5){O=vec4(0);C=vec4(0);}}`;
 // uGrid now describes the macro output. Read subcell quadrature from the fine textures.
 const restrict=grid+`uniform sampler2D uV,uC,uFineV,uFineC;uniform vec3 uFineGrid;uniform vec2 uFineAtlas;layout(location=0)out vec4 O;layout(location=1)out vec4 C;
 vec2 fuv(vec3 p){p=clamp(p,vec3(0),uFineGrid-1.);return (vec2(mod(p.z,8.),floor(p.z/8.))*uFineGrid.xy+p.xy+.5)/uFineAtlas;}
 vec4 fs(sampler2D t,vec3 p){p=clamp(p,vec3(0),uFineGrid-1.001);float z=floor(p.z);return mix(texture(t,fuv(vec3(p.xy,z))),texture(t,fuv(vec3(p.xy,z+1.))),fract(p.z));}
 void main(){vec3 p=cell(),ratio=uFineGrid/uGrid,q=(p+.5)*ratio-.5;float temp=0.;C=vec4(0);for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec3 o=(vec3(x,y,z)-.5)*ratio*.5;temp+=fs(uFineV,q+o).w;C+=fs(uFineC,q+o);}C*=.125;O=vec4(texelFetch(uV,ivec2(gl_FragCoord.xy),0).xyz,temp*.125);if(solid(p)>.5){O=vec4(0);C=vec4(0);}}`;
 return {advect,react,seed,restrict};
};
