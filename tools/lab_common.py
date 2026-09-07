"""PYRE III preset host and measured evidence helpers.
The solver equations are exported from src/engine.js and src/detail-shaders.js.
No generated visual assets, prerecorded flame imagery, or synthetic diagnostics.
"""
from detail_probe import *
import copy
for _directory in ['renders','videos','validation']:
 (ROOT/_directory).mkdir(parents=True,exist_ok=True)
LIB=json.loads((ROOT/'presets.json').read_text())

def select(m,d,r,key,reset_fields=True):
 p=LIB['presets'][key];m.pyre3=copy.deepcopy(p['params'])
 for k in ['fuel','wind','vorticity','obstacle','ignition','burst']:setattr(m,k,p[k])
 m.radius=p['sourceRadius'];m.oxygen=1.;m.scene=0 if m.pyre3['emitter']==0 else (2 if m.pyre3['emitter'] in [2,11] else 1)
 if reset_fields:
  reset(m);d.seed()
  if getattr(d,"embers",None):d.embers.reset()
 d.turbulence=p['turbulence'];r.exposure=p['exposure'];r.smoke=p['smoke'];r.eye=p['eye'];r.aim=p['aim'];r.fov=p['fov'];r.view=0;r.cacheTick=-1
 return p

def advance(d,dt=1/48):
 m=d.macro
 if m.pyre3['emitter'] in [2,11]:m.burst=float(m.time+1e-9<m.pyre3['pulseDuration'])
 d.step(dt);d.couple()
 if getattr(d,"embers",None):d.embers.step(dt)

def solid_mask(field):
 """Read the solver's actual float32 boundary predicate, cache per grid/shape.

 This avoids applying a float64 Python inequality to voxel centers that lie
 exactly on a GLSL box face. It changes diagnostics, not solver geometry.
 """
 macro=getattr(field,'macro',field);obstacle=int(macro.obstacle)
 if not hasattr(field,'_solid_mask_cache'):field._solid_mask_cache={}
 if obstacle not in field._solid_mask_cache:
  if not hasattr(field,'_solid_mask_program'):
   shader=json.loads((ROOT/'tools/diagnostics-shaders.json').read_text())['solidMask']
   field._solid_mask_program=field.g.program(shader)
   field._solid_mask_target=field.g.target(field.w,field.h,1)
  field.g.pass_(field._solid_mask_program,field._solid_mask_target,**field.base())
  field._solid_mask_cache[obstacle]=unpack(field.g.read(field._solid_mask_target),field.grid)[...,0]>.5
 return field._solid_mask_cache[obstacle]

def read_metrics(d):
 m=d.macro;coarse=metrics(m);g=d.g
 va=g.read(d.state[0]);ca=g.read(d.state[0],1)
 v=unpack(va,d.grid);c=unpack(ca,d.grid)
 nx,ny,nz=d.grid;hx,hy,hz=np.array(d.size)/np.array(d.grid)
 z,y,x=np.ogrid[:nz,:ny,:nx];wx=(x+.5)*hx-d.size[0]/2;wy=(y+.5)*hy;wz=(z+.5)*hz-d.size[2]/2
 mask=solid_mask(d)
 heat=v[...,3];soot=c[...,2];burn=c[...,3];weight=heat*np.clip(wy/.55,0,1);ws=float(weight.sum());vol=float(hx*hy*hz)
 # Units are normalized field integrals; they are NOT mass or watts.
 speed=np.linalg.norm(v[...,:3],axis=-1)
 result=dict(fine_grid=list(d.grid),macro_grid=list(m.grid),simulation_time=m.time,
 finite=bool(np.isfinite(v).all() and np.isfinite(c).all() and coarse['finite']),
 fine_temperature_max=float(heat.max()),fine_species_min=float(c.min()),fine_velocity_max=float(speed.max()),
 fine_fuel_integral=float(c[...,0].sum()*vol),fine_soot_integral=float(soot.sum()*vol),fine_reaction_integral=float(burn.sum()*vol),
 fine_heat_integral=float(heat.sum()*vol),hot_centroid_x=float((weight*wx).sum()/max(ws,1e-12)),
 fine_solid_cell_count=int(mask.sum()),fine_solid_mask_method="readback of shared GLSL solid predicate",
 fine_solid_species_max=float(np.abs(c[mask]).max()) if mask.any() else 0.,
 fine_solid_velocity_max=float(np.abs(v[...,:3][mask]).max()) if mask.any() else 0.,
 circulation_proxy=float(((wx*v[...,2]-wz*v[...,0])*weight).sum()/max(ws,1e-12)),
 macro=coarse,gl_error=g.GetError())
 if m.obstacle:
  cv=unpack(g.read(m.state[0]),m.grid);cc=unpack(g.read(m.state[0],1),m.grid);solid=solid_mask(m)
  result['macro']['solid_cell_count']=int(solid.sum())
  result['macro']['solid_scalar_max']=float(np.abs(cc[solid]).max(initial=0));result['macro']['solid_velocity_max']=float(np.abs(cv[...,:3][solid]).max(initial=0))
 return result

def state_digest(d):
 h=hashlib.sha256()
 for t in [d.macro.state[0],d.state[0]]:
  for a in [0,1]:h.update(d.g.read(t,a).tobytes())
 if getattr(d,"embers",None):
  for a in [0,1]:h.update(d.g.read(d.embers.state[0],a).tobytes())
 return h.hexdigest()

def fine_snapshot(d):
 s={'macro':snapshot(d.macro),'v':d.g.read(d.state[0]),'c':d.g.read(d.state[0],1)}
 if getattr(d,'embers',None):s['embers']=[d.g.read(d.embers.state[0],i) for i in [0,1]]
 return s

def fine_restore(d,s):
 restore(d.macro,s['macro'])
 for t in d.state:d.g.upload(t['textures'][0],s['v']);d.g.upload(t['textures'][1],s['c'])

# Particle replay is an optional part of a complete state. Old fluid-only
# checkpoints intentionally reset the one-way visual tracers.
_restore_fields=fine_restore
def fine_restore(d,s):
 _restore_fields(d,s)
 if getattr(d,"embers",None):
  if "embers" in s:
   for t in d.embers.state:
    for i in [0,1]:d.g.upload(t["textures"][i],s["embers"][i])
  else:d.embers.reset()
