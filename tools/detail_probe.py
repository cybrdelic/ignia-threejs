from capture_evidence import *
class Detail:
 def __init__(self,g,macro,scale=2):
  self.g=g;self.macro=macro;self.grid=tuple(n*scale for n in macro.grid);self.size=macro.size;self.w=self.grid[0]*8;self.h=self.grid[1]*math.ceil(self.grid[2]/8);self.turbulence=.6
  shaders=json.loads((ROOT/'tools'/'detail-shaders.json').read_text());self.p={k:g.program(v) for k,v in shaders.items()}
  self.state=[g.target(self.w,self.h,2) for _ in range(3)];self.seed()
 @property
 def time(self):return self.macro.time
 @property
 def tick(self):return self.macro.tick
 @property
 def v(self):return self.state[0]['textures'][0]
 @property
 def c(self):return self.state[0]['textures'][1]
 def base(self,dt=1/48):return {**self.macro.base(dt),'uGrid':self.grid,'uAtlas':[self.w,self.h],'uMacroGrid':self.macro.grid,'uMacroAtlas':[self.macro.w,self.macro.h],'uTurbulence':self.turbulence}
 def seed(self):
  for t in self.state:self.g.pass_(self.p['seed'],t,**self.base(),uMacroV=self.macro.v,uMacroC=self.macro.c)
 def step(self,dt=1/48):
  g=self.g;m=self.macro;m.step(dt);b=self.base(dt)
  g.pass_(self.p['advect'],self.state[1],**b,uMacroV=m.v,uMacroC=m.c,uV=self.v,uC=self.c)
  g.pass_(self.p['react'],self.state[2],**b,uMacroV=m.v,uMacroC=m.c,uV=self.v,uC=self.c,uA=self.state[1]['textures'][0],uB=self.state[1]['textures'][1])
  self.state[0],self.state[2]=self.state[2],self.state[0]
  # Separate output avoids a read/write feedback loop for the corrected transport.
 def couple(self):
  g=self.g;m=self.macro;g.pass_(self.p['restrict'],m.state[1],**m.base(),uV=m.v,uC=m.c,uFineV=self.v,uFineC=self.c,uFineGrid=self.grid,uFineAtlas=[self.w,self.h]);m.state[0],m.state[1]=m.state[1],m.state[0]
if __name__=='__main__':
 g=GL(1280,720);m=Simulation(g,(48,72,48));m.fuel=2.0;m.scene=0;m.wind=0.;m.vorticity=4.;d=Detail(g,m,3);r=Renderer(g,d,1.,256);r.exposure=1.3;r.eye=[.75,1.5,4.1];r.aim=[0,1.16,0];r.fov=40.;start=time.perf_counter()
 for i in range(144):
  d.step(1/48);d.couple()
  if (i+1)%24==0:
   Image.fromarray(r.render()).save(ROOT/'renders'/f'detail-{i+1:04d}.png');print(i+1,time.perf_counter()-start,flush=True)
