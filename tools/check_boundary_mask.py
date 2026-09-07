from lab_common import *
from types import SimpleNamespace
modes=json.loads((ROOT/'tools/diagnostics-shaders.json').read_text())
g=GL(160,90);m=Simulation(g,(32,48,32));d=Detail(g,m,2);r=SimpleNamespace();select(m,d,r,'baffle')
for _ in range(72):advance(d)
shader=g.program(modes['solidMask']);target=g.target(d.w,d.h,1);g.pass_(shader,target,**d.base())
field=unpack(g.read(target),d.grid);mask=field[...,0]>.5
c=unpack(g.read(d.state[0],1),d.grid);v=unpack(g.read(d.state[0]),d.grid)
nx,ny,nz=d.grid;z,y,x=np.ogrid[:nz,:ny,:nx];wx=(x+.5)*d.size[0]/nx-d.size[0]/2;wy=(y+.5)*d.size[1]/ny;wz=(z+.5)*d.size[2]/nz-d.size[2]/2
cpu=np.broadcast_to((abs(wx)<.72)&(abs(wy-1.3)<.075)&(abs(wz)<.6),(nz,ny,nx));delta=mask!=cpu
report={'cpu_mask_count':int(cpu.sum()),'gpu_mask_count':int(mask.sum()),'disagreement_count':int(delta.sum()),'disagreement_world_y_gpu_f16_readback':np.unique(field[...,1][delta]).tolist(),'gpu_solid_species_max':float(abs(c[mask]).max(initial=0)),'gpu_solid_velocity_max':float(abs(v[...,:3][mask]).max(initial=0)),'cpu_included_boundary_max_species':float(abs(c[cpu&~mask]).max(initial=0)),'explanation':'The float64 CPU mask classified voxel centers on a box face differently than the float32 shader. The authoritative shader mask is now exported and measured.'}
(ROOT/'validation/boundary_mask_audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2),flush=True)
