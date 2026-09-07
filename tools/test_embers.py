from lab_common import *
from embers import Embers
g=GL(640,360);m=Simulation(g,(32,48,32));d=Detail(g,m,2);r=Renderer(g,d,1,128)
e=Embers(g,d);d.embers=e;r.embers=e;select(m,d,r,'hearth')
print('COMPILED',g.adapter,flush=True)
for _ in range(96):advance(d)
a=g.read(e.state[0]);active=int((a[...,3]>=0).sum());print('ACTIVE',active,'ERROR',g.GetError(),flush=True)
s=fine_snapshot(d)
for _ in range(5):advance(d)
expected=state_digest(d);fine_restore(d,s)
for _ in range(5):advance(d)
actual=state_digest(d);assert actual==expected
im=r.render();Image.fromarray(im).save(ROOT/'renders/ember-probe.png');assert g.GetError()==0
report={'active_particles':active,'particle_budget':e.count,'finite':bool(np.isfinite(a).all()),'exact_fluid_and_particle_replay':actual==expected,'state_hash':actual,'gl_error':g.GetError(),'pass':active>0 and actual==expected}
(ROOT/'validation/embers.json').write_text(json.dumps(report,indent=2));print(report,flush=True);assert report['pass']
