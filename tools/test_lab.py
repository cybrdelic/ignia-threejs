"""Executed refined-grid regression tests for PYRE III, not CFD validation.

Tests use a 32 x 48 x 32 pressure grid and 64 x 96 x 64 transported scalars.
Values are field readbacks, not assumptions based on preset labels.
"""
from lab_common import *
from types import SimpleNamespace

def main():
 g=GL(160,90);m=Simulation(g,(32,48,32));d=Detail(g,m,2);r=SimpleNamespace()
 result={'version':'IGNIA 0.5','backend':g.adapter,'pressure_grid':list(m.grid),'scalar_grid':list(d.grid),
         'meaning':'software-rendered numerical regressions; not measured combustion or GPU throughput',
         'dt':1/48,'tests':{},'base_shader_sha256':hashlib.sha256((ROOT/'tools/shaders.json').read_bytes()).hexdigest(),
         'detail_shader_sha256':hashlib.sha256((ROOT/'tools/detail-shaders.json').read_bytes()).hexdigest()}
 start=time.perf_counter();out=ROOT/'validation/refined_regressions.json'
 def record(name,passed,**details):
  result['tests'][name]={'pass':bool(passed),**details};out.write_text(json.dumps(result,indent=2));print(name,passed,details,flush=True)
 def run(n):
  for _ in range(n):advance(d)
 # Zero source does not create reaction or heat; prescribed refinement is off.
 select(m,d,r,'hearth');m.fuel=0.;m.wind=0.;m.vorticity=0.;d.turbulence=0.;run(32);a=read_metrics(d)
 record('zero_source',a['fine_temperature_max']==0 and a['fine_reaction_integral']==0 and a['fine_velocity_max']==0,temperature=a['fine_temperature_max'],reaction=a['fine_reaction_integral'],speed=a['fine_velocity_max'])
 # Inflow can exist without an ignited reaction. Do not assert zero velocity here.
 select(m,d,r,'hearth');m.ignition=0.;run(48);a=read_metrics(d)
 record('cold_fuel_requires_ignition',a['fine_reaction_integral']==0 and a['fine_fuel_integral']>0,temperature=a['fine_temperature_max'],reaction=a['fine_reaction_integral'],fuel=a['fine_fuel_integral'])
 m.ignition=1.;run(72);a=read_metrics(d)
 record('pilot_causes_reaction',a['fine_reaction_integral']>0 and a['fine_temperature_max']>.1,reaction=a['fine_reaction_integral'],temperature=a['fine_temperature_max'])
 # Full two-grid + pressure snapshot and exact same-runtime replay.
 checkpoint=fine_snapshot(d);run(12);expected=fine_snapshot(d);expected_hash=state_digest(d)
 fine_restore(d,checkpoint);run(12);actual=fine_snapshot(d);actual_hash=state_digest(d)
 error=max(float(np.max(np.abs(expected[k]-actual[k])))for k in ['v','c']);macro=max(float(np.max(np.abs(expected['macro'][k]-actual['macro'][k])))for k in ['v','c','p'])
 record('pressure_inclusive_refined_replay',error==0 and macro==0 and expected_hash==actual_hash,max_refined_abs_error=error,max_macro_abs_error=macro,expected_hash=expected_hash,actual_hash=actual_hash)
 # Fixed seeds/state and identical evolving numerical inputs replay identically.
 hashes=[]
 for _ in range(2):
  select(m,d,r,'torch');run(48);hashes.append(state_digest(d))
 record('cold_reset_determinism',hashes[0]==hashes[1],hashes=hashes)
 # Vortex direction is a physical velocity-field change, not a material change.
 circulations=[]
 for sign in [1,-1]:
  select(m,d,r,'tornado');m.pyre3['swirl']=sign*2.5;run(84);a=read_metrics(d);circulations.append(a['circulation_proxy'])
 record('vortex_sign_reversal',circulations[0]>.01 and circulations[1]<-.01,circulation_proxy=circulations)
 # The reference uses the same geometry and speed for distinct fuel surrogates.
 yields={}
 for name in ['alcohol','oil']:
  select(m,d,r,'alcohol');f=LIB['fuels'][name]
  for k,v in f.items():
   if k!='label':m.pyre3[k]=copy.deepcopy(v)
  m.pyre3['source'][2]=1.;m.pyre3['colorMix']=0.;run(72);a=read_metrics(d);yields[name]={'soot':a['fine_soot_integral'],'reaction':a['fine_reaction_integral']}
 record('fuel_models_change_species',yields['oil']['soot']>yields['alcohol']['soot']*2 and min(x['reaction']for x in yields.values())>0,measured=yields)
 for name in ['collider','baffle','stove_pan']:
  select(m,d,r,name);run(72);a=read_metrics(d)
  zero=a['fine_solid_species_max']==0 and a['fine_solid_velocity_max']==0 and a['macro']['solid_scalar_max']==0 and a['macro']['solid_velocity_max']==0
  record('solid_'+name,zero and a['finite'],solid_cell_count=a['fine_solid_cell_count'],fine_species=a['fine_solid_species_max'],fine_velocity=a['fine_solid_velocity_max'],macro_species=a['macro']['solid_scalar_max'],macro_velocity=a['macro']['solid_velocity_max'],finite=a['finite'])
  if name=='collider':record('collider_pressure_projection',a['macro']['projection_ratio']<.20,pre_rms=a['macro']['pre_projection_rms'],post_rms=a['macro']['post_projection_rms'],ratio=a['macro']['projection_ratio'],declared_acceptance_ratio=.20)
 select(m,d,r,'smoke');run(72);a=read_metrics(d)
 record('smoke_without_reaction',a['fine_soot_integral']>0 and a['fine_reaction_integral']==0,soot=a['fine_soot_integral'],reaction=a['fine_reaction_integral'])
 select(m,d,r,'explosion');schedule=[]
 for i in range(32):
  advance(d);schedule.append(m.burst)
 a=read_metrics(d)
 record('finite_pulse_cutoff',sum(schedule)==12 and all(v==0 for v in schedule[12:]) and a['fine_heat_integral']>0,active_substeps=int(sum(schedule)),configured_seconds=m.pyre3['pulseDuration'],last_source_input=m.burst,residual_heat=a['fine_heat_integral'])
 # A palette update by itself cannot mutate a simulation state.
 select(m,d,r,'hearth');run(48);h0=state_digest(d)
 m.pyre3['tint']=copy.deepcopy(LIB['colors']['green']['tint']);m.pyre3['colorMix']=1;h1=state_digest(d)
 record('palette_changes_no_fields',h0==h1,before=h0,after=h1)
 result['elapsed_wall_seconds']=time.perf_counter()-start;result['all_passed']=all(t['pass']for t in result['tests'].values());result['test_count']=len(result['tests']);result['complete']=True
 out.write_text(json.dumps(result,indent=2));print('COMPLETE',result['test_count'],result['all_passed'],flush=True)
 if not result['all_passed']:raise SystemExit(1)
if __name__=='__main__':main()
