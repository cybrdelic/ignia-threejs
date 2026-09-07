"""GPU particle host executing the identical browser ember shaders."""
import json
from pathlib import Path
class Embers:
 def __init__(self,g,field,count=2048):
  self.g=g;self.field=field;self.count=count
  sh=json.loads((Path(__file__).parent/'shaders.json').read_text())
  self.init=g.program(sh['emberInit']);self.update=g.program(sh['emberStep']);self.program=g.program(sh['emberFragment'],sh['emberVertex'],count)
  self.state=[g.target(count,1,2) for _ in range(2)];self.reset()
 def reset(self):
  for t in self.state:self.g.pass_(self.init,t)
 def step(self,dt):
  f=self.field;self.g.pass_(self.update,self.state[1],**{**f.base(),'uDT':dt},uParticleCount=self.count,uParticles=self.state[0]['textures'][0],uParticleV=self.state[0]['textures'][1],uV=f.v,uC=f.c);self.state.reverse()
 def draw(self,target,camera,smoke):
  f=self.field;self.g.pass_(self.program,target,**f.base(),**camera,uParticleCount=self.count,uParticles=self.state[0]['textures'][0],uParticleV=self.state[0]['textures'][1],uC=f.c,uPixelHeight=target['h'],uSmoke=smoke)
