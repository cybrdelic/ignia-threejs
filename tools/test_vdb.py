"""Native OpenVDB I/O regression using real current-shader fields."""
from lab_common import *
from export_vdb import read_snapshot,export
import gzip,struct

g=GL(320,180);m=Simulation(g,(40,64,40));d=Detail(g,m,2);r=Renderer(g,d,1,96)
select(m,d,r,'hearth')
for _ in range(72):advance(d)
meta={'format':'pyre2-state-v1','dtype':'float32-le','tier':'draft','grid':list(m.grid),'size':list(m.size),'time':m.time,'params':{'ambientOxygen':m.oxygen},'refinement':{'grid':list(d.grid),'scale':2,'turbulence':d.turbulence}}
header=json.dumps(meta).encode();payload=[g.read(m.state[0],0),g.read(m.state[0],1),g.read(m.pressure[0]),g.read(d.state[0],0),g.read(d.state[0],1)]
snapshot=ROOT/'validation/IGNIA_Simulated_State.pyre.gz'
with gzip.open(snapshot,'wb') as f:
    f.write(struct.pack('<I',len(header)));f.write(header)
    for data in payload:f.write(np.asarray(data,dtype='<f4').tobytes())
parsed,arrays=read_snapshot(snapshot)
for z,y,x in [(0,0,0),(12,22,25),(39,48,38),(79,127,79)]:
    sy=(z//8)*d.grid[1]+y;sx=(z%8)*d.grid[0]+x
    assert arrays['temperature'][x,y,z]==payload[3][sy,sx,3]
    assert arrays['density'][x,y,z]==payload[4][sy,sx,2]
result=export(snapshot,ROOT/'validation/IGNIA_Simulated_Fields.vdb')
assert len(result['grids'])==7 and all(v['pass'] for v in result['grids'])
result['atlas_axis_checks_passed']=True;result['simulation_grid']=list(m.grid);result['refined_grid']=list(d.grid)
result['simulation_time']=m.time;result['actual_simulated_input']=True
(ROOT/'validation/vdb_roundtrip.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
