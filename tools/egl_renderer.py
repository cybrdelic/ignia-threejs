"""Offscreen EGL runner for the exact GLSL shipped with the browser application.
Mesa llvmpipe enables reproducible capture when browser GPU rendering is too slow.
This does not claim to benchmark a consumer GPU or to execute Three.js itself.
"""
import ctypes as C, os, json, math, time
from pathlib import Path
import numpy as np
from PIL import Image
os.environ.setdefault('EGL_PLATFORM','surfaceless')
os.environ.setdefault('LP_NUM_THREADS','4')
E=C.CDLL('libEGL.so.1'); G=C.CDLL('libGL.so.1')
P=C.c_void_p; I=C.c_int; U=C.c_uint; F=C.c_float

def fn(lib,name,result,*args):
    f=getattr(lib,name);f.restype=result;f.argtypes=list(args);return f

class GL:
 def __init__(self,width=1280,height=720):
  self.width=width;self.height=height
  self.display=fn(E,'eglGetDisplay',P,P)(P(0));a=I();b=I()
  assert fn(E,'eglInitialize',U,P,C.POINTER(I),C.POINTER(I))(self.display,C.byref(a),C.byref(b))
  fn(E,'eglBindAPI',U,U)(0x30A0)
  attrs=(I*13)(0x3033,1,0x3040,0x0040,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038)
  config=P();count=I();assert fn(E,'eglChooseConfig',U,P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I))(self.display,attrs,C.byref(config),1,C.byref(count))
  self.context=fn(E,'eglCreateContext',P,P,P,P,C.POINTER(I))(self.display,config,P(0),(I*3)(0x3098,3,0x3038))
  self.surface=fn(E,'eglCreatePbufferSurface',P,P,P,C.POINTER(I))(self.display,config,(I*5)(0x3057,width,0x3056,height,0x3038))
  assert fn(E,'eglMakeCurrent',U,P,P,P,P)(self.display,self.surface,self.surface,self.context)
  for name,res,args in [
   ('glEnable',None,[U]),('glBlendFunc',None,[U,U]),('glGetString',C.c_char_p,[U]),('glCreateShader',U,[U]),('glShaderSource',None,[U,I,C.POINTER(C.c_char_p),C.POINTER(I)]),('glCompileShader',None,[U]),('glGetShaderiv',None,[U,U,C.POINTER(I)]),('glGetShaderInfoLog',None,[U,I,C.POINTER(I),C.c_char_p]),('glCreateProgram',U,[]),('glAttachShader',None,[U,U]),('glLinkProgram',None,[U]),('glGetProgramiv',None,[U,U,C.POINTER(I)]),('glGetProgramInfoLog',None,[U,I,C.POINTER(I),C.c_char_p]),('glGetUniformLocation',I,[U,C.c_char_p]),('glUseProgram',None,[U]),('glUniform1f',None,[I,F]),('glUniform1i',None,[I,I]),('glUniform2fv',None,[I,I,C.POINTER(F)]),('glUniform3fv',None,[I,I,C.POINTER(F)]),('glUniform4fv',None,[I,I,C.POINTER(F)]),('glGenFramebuffers',None,[I,C.POINTER(U)]),('glBindFramebuffer',None,[U,U]),('glFramebufferTexture2D',None,[U,U,U,U,I]),('glCheckFramebufferStatus',U,[U]),('glGenTextures',None,[I,C.POINTER(U)]),('glBindTexture',None,[U,U]),('glTexParameteri',None,[U,U,I]),('glTexImage2D',None,[U,I,I,I,I,I,U,U,P]),('glTexSubImage2D',None,[U,I,I,I,I,I,U,U,P]),('glDrawBuffers',None,[I,C.POINTER(U)]),('glViewport',None,[I,I,I,I]),('glDisable',None,[U]),('glGenVertexArrays',None,[I,C.POINTER(U)]),('glBindVertexArray',None,[U]),('glActiveTexture',None,[U]),('glDrawArrays',None,[U,I,I]),('glClearBufferfv',None,[U,I,C.POINTER(F)]),('glReadPixels',None,[I,I,I,I,U,U,P]),('glReadBuffer',None,[U]),('glFinish',None,[]),('glGetError',U,[]),('glPixelStorei',None,[U,I])]:
   setattr(self,name[2:],fn(G,name,res,*args))
  self.adapter=self.GetString(0x1F01).decode();self.version=self.GetString(0x1F02).decode()
  vao=U();self.GenVertexArrays(1,C.byref(vao));self.BindVertexArray(vao)
  self.Disable(0x0B71);self.Disable(0x0BE2);self.Disable(0x0B44)
  self.vertex=json.loads((Path(__file__).parent/'shaders.json').read_text())['vertex']
 def program(self,fragment,vertex=None,points=0):
  def compile(kind,src):
   s=self.CreateShader(kind);arr=(C.c_char_p*1)(src.encode());self.ShaderSource(s,1,arr,None);self.CompileShader(s);ok=I();self.GetShaderiv(s,0x8B81,C.byref(ok))
   if not ok.value:
    log=C.create_string_buffer(32768);self.GetShaderInfoLog(s,len(log),None,log);raise RuntimeError(log.value.decode()+'\n'+src)
   return s
  p=self.CreateProgram();self.AttachShader(p,compile(0x8B31,self.vertex if vertex is None else "#version 300 es\n"+vertex));self.AttachShader(p,compile(0x8B30,'#version 300 es\nprecision highp float;precision highp int;\n'+fragment));self.LinkProgram(p);ok=I();self.GetProgramiv(p,0x8B82,C.byref(ok))
  if not ok.value:
   log=C.create_string_buffer(32768);self.GetProgramInfoLog(p,len(log),None,log);raise RuntimeError(log.value.decode())
  return {'id':p,'locations':{},'points':points}
 def target(self,w,h,count=1):
  f=U();self.GenFramebuffers(1,C.byref(f));self.BindFramebuffer(0x8D40,f);textures=[]
  for i in range(count):
   t=U();self.GenTextures(1,C.byref(t));self.BindTexture(0x0DE1,t)
   for name,value in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x812F),(0x2803,0x812F)]:self.TexParameteri(0x0DE1,name,value)
   self.TexImage2D(0x0DE1,0,0x881A,w,h,0,0x1908,0x140B,None);self.FramebufferTexture2D(0x8D40,0x8CE0+i,0x0DE1,t,0);textures.append(t.value)
  self.DrawBuffers(count,(U*count)(*[0x8CE0+i for i in range(count)]));assert self.CheckFramebufferStatus(0x8D40)==0x8CD5
  return {'f':f.value,'w':w,'h':h,'textures':textures}
 def pass_(self,program,target=None,**uniforms):
  self.BindFramebuffer(0x8D40,target['f'] if target else 0);self.Viewport(0,0,target['w'] if target else self.width,target['h'] if target else self.height)
  if target:self.DrawBuffers(len(target['textures']),(U*len(target['textures']))(*[0x8CE0+i for i in range(len(target['textures']))]))
  self.UseProgram(program['id']);unit=0
  samplers={'uV','uC','uA','uB','uCurl','uP','uD','uImage','uBloom','uMaterial','uOccupancy','uLight','uMacroV','uMacroC','uFineV','uFineC','uParticles','uParticleV'};ints={'uKind','uSteps','uThreshold','uClean','uScene','uObstacle','uView','uTransparent','uAOV','uEmitter','uWindMode'}
  for k,v in uniforms.items():
   if k not in program['locations']:program['locations'][k]=self.GetUniformLocation(program['id'],k.encode())
   l=program['locations'][k]
   if l<0:continue
   if k in samplers:self.ActiveTexture(0x84C0+unit);self.BindTexture(0x0DE1,int(v));self.Uniform1i(l,unit);unit+=1
   elif k in ints:self.Uniform1i(l,int(v))
   elif np.isscalar(v):self.Uniform1f(l,float(v))
   else:getattr(self,'Uniform'+str(len(v))+'fv')(l,1,(F*len(v))(*v))
  if program.get("points"):
   self.Enable(0x0BE2);self.BlendFunc(1,1);self.DrawArrays(0,0,program["points"]);self.Disable(0x0BE2)
  else:self.DrawArrays(4,0,3)
 def clear(self,t):
  self.BindFramebuffer(0x8D40,t['f'])
  for i in range(len(t['textures'])):self.ClearBufferfv(0x1800,i,(F*4)(0,0,0,0))
 def read(self,target=None,attachment=0):
  self.BindFramebuffer(0x8D40,target['f'] if target else 0)
  if target:self.ReadBuffer(0x8CE0+attachment)
  w=target['w'] if target else self.width;h=target['h'] if target else self.height
  a=np.empty((h,w,4),np.float32 if target else np.uint8);self.ReadPixels(0,0,w,h,0x1908,0x1406 if target else 0x1401,a.ctypes.data_as(P));return a
 def upload(self,texture,data):
  self.BindTexture(0x0DE1,texture);self.TexSubImage2D(0x0DE1,0,0,0,data.shape[1],data.shape[0],0x1908,0x1406,data.ctypes.data_as(P))

class Simulation:
 def __init__(self,g,grid=(56,88,56)):
  self.g=g;self.grid=grid;self.size=[3.2,4.8,3.2];self.tiles=8;self.w=grid[0]*8;self.h=grid[1]*math.ceil(grid[2]/8);self.time=0;self.tick=0;self.fuel=1.25;self.wind=.08;self.vorticity=4.0;self.iterations=36;self.pyre3=json.loads((Path(__file__).parent.parent/'presets.json').read_text())['defaults'];self.scene=0;self.obstacle=0;self.ignition=1.;self.oxygen=1.;self.radius=.23;self.burst=0.
  sh=json.loads((Path(__file__).parent/'shaders.json').read_text());self.p={k:g.program(v) for k,v in sh.items() if not k.startswith('ember') and k not in ['render','post','blur','vertex','material','occupancy','light']}
  self.state=[g.target(self.w,self.h,2) for _ in range(3)];self.curl=g.target(self.w,self.h);self.div=g.target(self.w,self.h);self.pressure=[g.target(self.w,self.h) for _ in range(2)];self.coarse_grid=[n//2 for n in grid];self.cw=self.coarse_grid[0]*8;self.ch=self.coarse_grid[1]*math.ceil(self.coarse_grid[2]/8);self.residual=g.target(self.w,self.h);self.coarse_d=g.target(self.cw,self.ch);self.coarse_p=[g.target(self.cw,self.ch) for _ in range(2)];self.multigrid=True
  for t in self.state+[self.curl,self.div,self.residual,self.coarse_d]+self.pressure+self.coarse_p:g.clear(t)
  initial=np.zeros((self.h,self.w,4),np.float32);initial[:,:,1]=1
  for t in self.state:g.upload(t['textures'][1],initial)
 def base(self,dt=1/60):return dict(uGrid=self.grid,uSize=self.size,uAtlas=[self.w,self.h],uTiles=8,uTime=self.time,uDT=dt,uFuel=self.fuel,uWind=self.wind,uVort=self.vorticity,uScene=self.scene,uObstacle=self.obstacle,uIgnition=self.ignition,uOxygen=self.oxygen,uRadius=self.radius,uBurst=self.burst,**self.extra_uniforms())
 def extra_uniforms(self):
  p=self.pyre3
  return dict(uEmitter=p['emitter'],uWindMode=p['windMode'],uReactionParams=p['reaction'],uSourceParams=p['source'],uWindVector=[self.wind,0,p['windZ']],uDirection=p['direction'],uTint=p['tint'],uSourceHeight=p['height'],uWindFrequency=p['frequency'],uSwirl=p['swirl'],uBuoyancy=p['buoyancy'],uCooling=p['cooling'],uColorMix=p['colorMix'],uChemilum=p['chemilum'],uPulseDuration=p['pulseDuration'])
 @property
 def v(self):return self.state[0]['textures'][0]
 @property
 def c(self):return self.state[0]['textures'][1]
 def step(self,dt=1/60):
  b=self.base(dt);g=self.g;a,tmp,c=self.state
  g.pass_(self.p['advect'],tmp,**b,uV=a['textures'][0],uC=a['textures'][1])
  g.pass_(self.p['correct'],c,**b,uV=a['textures'][0],uC=a['textures'][1],uA=tmp['textures'][0],uB=tmp['textures'][1])
  g.pass_(self.p['curl'],self.curl,**b,uV=c['textures'][0])
  g.pass_(self.p['force'],tmp,**b,uV=c['textures'][0],uC=c['textures'][1],uCurl=self.curl['textures'][0])
  g.pass_(self.p['div'],self.div,**b,uV=tmp['textures'][0])
  def smooth_fine(n):
   for _ in range(n):
    g.pass_(self.p['jacobi'],self.pressure[1],**b,uP=self.pressure[0]['textures'][0],uD=self.div['textures'][0]);self.pressure.reverse()
  if self.multigrid:
   for cycle in range(4 if self.time<.15 else (2 if self.obstacle or self.scene==2 else 1)):
    smooth_fine(5)
    g.pass_(self.p['residual'],self.residual,**b,uP=self.pressure[0]['textures'][0],uD=self.div['textures'][0])
    cb={**b,'uGrid':self.coarse_grid,'uAtlas':[self.cw,self.ch]}
    g.pass_(self.p['restrict'],self.coarse_d,**cb,uD=self.residual['textures'][0],uFineGrid=self.grid,uFineAtlas=[self.w,self.h])
    for target in self.coarse_p:g.clear(target)
    for _ in range(18):
     g.pass_(self.p['jacobi'],self.coarse_p[1],**cb,uP=self.coarse_p[0]['textures'][0],uD=self.coarse_d['textures'][0]);self.coarse_p.reverse()
    g.pass_(self.p['prolong'],self.pressure[1],**b,uP=self.pressure[0]['textures'][0],uA=self.coarse_p[0]['textures'][0],uCoarseGrid=self.coarse_grid,uCoarseAtlas=[self.cw,self.ch]);self.pressure.reverse()
    smooth_fine(5)
  else:smooth_fine(self.iterations)
  g.pass_(self.p['project'],a,**b,uV=tmp['textures'][0],uC=tmp['textures'][1],uP=self.pressure[0]['textures'][0])
  self.time+=dt;self.tick+=1

class Renderer:
 def __init__(self,g,sim,scale=.75,steps=160):
  self.g=g;self.sim=sim;self.steps=steps;self.exposure=1.5;self.smoke=.6;self.frame=0;self.view=0;self.slice=0;self.transparent=0;self.aov=0;self.eye=None;self.aim=None;self.fov=42
  sh=json.loads((Path(__file__).parent/'shaders.json').read_text());self.p={k:g.program(sh[k]) for k in ['render','post','blur','material','occupancy','light']}
  self.light=g.target(1,1);self.cacheTick=-1;self.materialGrid=[math.ceil(n/2) for n in sim.grid];self.materialAtlas=[self.materialGrid[0]*8,self.materialGrid[1]*math.ceil(self.materialGrid[2]/8)];self.material=g.target(*self.materialAtlas);self.brickGrid=[math.ceil(n/8) for n in sim.grid];self.brickAtlas=[self.brickGrid[0]*8,self.brickGrid[1]*math.ceil(self.brickGrid[2]/8)];self.occupancy=g.target(*self.brickAtlas);self.image=g.target(int(g.width*scale),int(g.height*scale));self.bloom=[g.target(g.width//6,g.height//6) for _ in range(2)]
 def camera(self,shot='orbit',t=0):
  target=[0,1.50,0];fov=40
  if shot=='orbit':
   a=.10+t*.135;eye=[math.sin(a)*5.5,1.85+math.sin(t*.24)*.16,math.cos(a)*5.5];target=[0,1.24,0];fov=39
  elif shot=='low':
   a=-.5+t*.065;r=5.55-t*.045;eye=[math.sin(a)*r,.64+t*.035,math.cos(a)*r];target=[.03,1.16,0];fov=42
  else:
   a=.72+t*.075;eye=[math.sin(a)*4.4,1.65-t*.027,math.cos(a)*4.4];target=[0,1.08+t*.018,0];fov=36
  if self.eye is not None:eye=self.eye;target=self.aim or [0,1.4,0];fov=self.fov
  def norm(a):a=np.asarray(a);return a/np.linalg.norm(a)
  forward=norm(np.array(target)-eye);right=norm(np.cross(forward,[0,1,0]));up=norm(np.cross(right,forward))
  return dict(uEye=eye,uForward=forward,uRight=right,uUp=up,uTan=math.tan(fov*math.pi/360),uAspect=self.g.width/self.g.height)
 def render(self,shot='orbit',t=0):
  g=self.g;b=self.sim.base();self.frame+=1
  cache_key=(self.sim.tick,self.smoke,json.dumps(b,sort_keys=True))
  if getattr(self,'cache_key',None)!=cache_key:
   g.pass_(self.p['material'],self.material,**{**b,'uGrid':self.materialGrid,'uAtlas':self.materialAtlas},uFieldGrid=self.sim.grid,uFieldAtlas=[self.sim.w,self.sim.h],uV=self.sim.v,uC=self.sim.c,uSmoke=self.smoke)
   g.pass_(self.p['occupancy'],self.occupancy,**b,uMaterial=self.material['textures'][0],uV=self.sim.v,uC=self.sim.c,uBrickGrid=self.brickGrid,uBrickAtlas=self.brickAtlas)
   g.pass_(self.p['light'],self.light,**b,uMaterial=self.material['textures'][0],uV=self.sim.v,uC=self.sim.c)
   self.cacheTick=self.sim.tick;self.cache_key=cache_key
  g.pass_(self.p['render'],self.image,**b,**self.camera(shot,t),uMaterialGrid=self.materialGrid,uMaterialAtlas=self.materialAtlas,uLight=self.light['textures'][0],uMaterial=self.material['textures'][0],uOccupancy=self.occupancy['textures'][0],uBrickGrid=self.brickGrid,uBrickAtlas=self.brickAtlas,uV=self.sim.v,uC=self.sim.c,uFrame=self.sim.tick,uSteps=self.steps,uView=self.view,uSlice=self.slice,uTransparent=self.transparent,uAOV=self.aov,uSmoke=self.smoke,uResolution=[self.image['w'],self.image['h']])
  if getattr(self,'embers',None) and not(self.transparent or self.view or self.aov):self.embers.draw(self.image,self.camera(shot,t),self.smoke)
  g.pass_(self.p['blur'],self.bloom[0],uImage=self.image['textures'][0],uDirection=[1/self.bloom[0]['w'],0],uThreshold=1)
  g.pass_(self.p['blur'],self.bloom[1],uImage=self.bloom[0]['textures'][0],uDirection=[0,1/self.bloom[0]['h']],uThreshold=0)
  g.pass_(self.p['blur'],self.bloom[0],uImage=self.bloom[1]['textures'][0],uDirection=[1/self.bloom[0]['w'],0],uThreshold=0)
  g.pass_(self.p['post'],None,uImage=self.image['textures'][0],uBloom=self.bloom[0]['textures'][0],uExposure=self.exposure,uTime=self.sim.time,uResolution=[g.width,g.height],uClean=1,uTransparent=self.transparent)
  return g.read()[::-1, :, :4 if self.transparent else 3].copy()

if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--steps',type=int,default=240);ap.add_argument('--grid',type=int,default=56);args=ap.parse_args()
 g=GL(960,540);print(g.adapter,g.version,flush=True);sim=Simulation(g,(args.grid,int(args.grid*1.57)//8*8,args.grid));ren=Renderer(g,sim,.75,160);start=time.perf_counter()
 for i in range(args.steps):
  sim.step(1/60)
  if (i+1)%60==0:
   image=ren.render('orbit',1);Image.fromarray(image).save(Path(__file__).parent.parent/'renders'/f'egl-{i+1}.png');print(i+1,round(time.perf_counter()-start,2),'error',g.GetError(),flush=True)
 data=g.read(sim.state[0]);print('Vmax',np.nanmax(np.abs(data[:,:,:3])),'Tmax',np.nanmax(data[:,:,3]),flush=True)
 np.savez_compressed(Path(__file__).parent.parent/'renders'/'state.npz',v=data,c=g.read(sim.state[0],1),time=sim.time,grid=sim.grid)
