"""Record PYRE III's actual refined fields. No AI media, interpolated frames,
image-based fire, guessed timing, or fabricated numerical overlays.

Catalogue: 48x72x48 pressure / 96x144x96 reactive scalars.
Verification: 64x96x64 pressure / 128x192x128 reactive scalars.
Both: 24 native frames/s, 2 simulation steps/frame at dt=1/48, 1x playback.
"""
from lab_common import *
import textwrap
W,H,FPS=1280,720,24
DT=1/48

def encoder(path):
 return subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-threads','1','-preset','veryfast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(path)],stdin=subprocess.PIPE)

def hud(rgb,title,subtitle,index,phase,record,t,grid,overall,mode,digest=None):
 image=Image.fromarray(rgb).convert('RGBA');layer=Image.new('RGBA',(W,H));q=ImageDraw.Draw(layer)
 q.rectangle((0,0,W,65),fill=(6,10,16,232));q.text((29,17),'P Y R E   I I I',font=fonts[26],fill=(242,240,232,255))
 q.text((282,27),f'REFINED {mode.upper()}  /  {index:02d}',font=fonts[13],fill=(148,173,190,255))
 q.text((953,27),phase[:36],font=fonts[13],fill=(255,185,116,255))
 q.rectangle((0,H-99,W,H),fill=(6,10,16,230))
 q.text((30,H-90),title,font=ImageFont.truetype(BOLD,25),fill=(245,240,232,255))
 # Keep human-readable labels inside the picture; complete methodological notes are in JSON.
 note=textwrap.shorten(subtitle,width=140,placeholder='…')
 q.text((31,H-55),note,font=fonts[13],fill=(174,188,201,255))
 q.text((31,H-27),f'{grid[0]} x {grid[1]} x {grid[2]} REFINED CELLS  |  24 FPS OUTPUT  |  1x SIM CLOCK  |  OFFLINE SHADER CAPTURE',font=fonts[12],fill=(117,143,161,255))
 if record:
  lines=[('SIMULATION TIME',f'{record["simulation_time"]:06.3f} s'),('REACTION / FIELD INTEGRAL',f'{record["fine_reaction_integral"]:.5f}'),('MAX TEMPERATURE / NORMALIZED',f'{record["fine_temperature_max"]:.3f}')]
  if 'WIND' in title:lines=[('HOT-REGION CENTROID X',f'{record["hot_centroid_x"]:+.3f}'),('MACRO DIVERGENCE RMS',f'{record["macro"]["post_projection_rms"]:.5f}'),('REFINED MAX SPEED',f'{record["fine_velocity_max"]:.2f}')]
  if 'SPHERE' in title or 'BAFFLE' in title or 'BOUNDARY' in title:lines=[('SOLID / MAX SPECIES',f'{record["fine_solid_species_max"]:.6f}'),('SOLID / MAX VELOCITY',f'{record["fine_solid_velocity_max"]:.6f}'),('MACRO DIVERGENCE RMS',f'{record["macro"]["post_projection_rms"]:.5f}')]
  if 'TORNADO' in title or 'VORTEX' in title:lines=[('CIRCULATION PROXY',f'{record["circulation_proxy"]:+.3f}'),('SOOT / FIELD INTEGRAL',f'{record["fine_soot_integral"]:.4f}'),('REACTION / FIELD INTEGRAL',f'{record["fine_reaction_integral"]:.5f}')]
  if digest:lines=[('STATE SHA-256 / PREFIX',digest[:16]),('SIMULATION TIME / HELD',f'{record["simulation_time"]:.4f} s'),('FIELD CHANGES','NONE' if 'SNAPSHOT' not in title else 'RESTORED EXACTLY')]
  x=W-265;y=91;q.rounded_rectangle((x-13,y-11,W-26,y+164),radius=7,fill=(7,12,20,197),outline=(110,134,151,45))
  for j,(label,value) in enumerate(lines):
   yy=y+j*47;q.text((x,yy),label,font=fonts[12],fill=(126,151,171,255));q.text((x,yy+17),value,font=fonts[18],fill=(227,232,238,255))
  q.text((x,y+146),'MEASURED / SAMPLED EVERY 0.5 s',font=fonts[12],fill=(115,139,157,255))
 q.rectangle((0,H-3,max(1,int(W*overall)),H),fill=(245,157,89,255))
 return np.asarray(Image.alpha_composite(image,layer).convert('RGB'))

def clean_title(rgb,title,sub):
 im=Image.fromarray(rgb);q=ImageDraw.Draw(im);q.rectangle((0,H-68,W,H),fill=(6,10,16));q.text((30,H-56),title,font=fonts[22],fill=(241,239,230));q.text((31,H-25),sub,font=fonts[12],fill=(141,160,177));return np.asarray(im)

def check(r):
 if not r['finite'] or r['gl_error'] or r['macro']['gl_error']:raise RuntimeError('Nonfinite or GL error: '+str(r))
 if r['fine_species_min']< -1e-6:raise RuntimeError('Negative species')
 if r['fine_velocity_max']>45:raise RuntimeError('Unbounded velocity')
 if r['fine_solid_species_max']!=0 or r['fine_solid_velocity_max']!=0:raise RuntimeError('Nonzero solid interior')

VERIFICATION=[
 dict(id='ignition',preset='hearth',title='IGNITION / FUEL CUTOFF',duration=8.,warm=0,note='Fuel starts cold. Pilot on at 1 s. Fuel off at 3 s. Existing heat and smoke keep moving.'),
 dict(id='wind',preset='hearth',title='WIND REVERSAL / LOCKED CAMERA',duration=6.,warm=2.,note='Same refined source and camera. Only horizontal forcing reverses at 2.5 s.'),
 dict(id='collider',preset='collider',title='REFINED FIRE / SOLID SPHERE',duration=4.,warm=2.,note='Both refined species and transport velocity are read back inside the solid.'),
 dict(id='baffle',preset='baffle',title='REFINED FIRE / BAFFLE BOUNDARY',duration=4.,warm=2.,note='The same obstacle is used by the pressure solver, refined transport, and renderer.'),
 dict(id='puff',preset='explosion',title='FINITE REACTIVE PULSE',duration=4.,warm=0,note='Injection lasts 0.25 s. Residual fuel and reaction evolve after the source shuts off; no blast physics.'),
 dict(id='smoke',preset='smoke',title='SMOKE ONLY / BAFFLE BOUNDARY',duration=4.,warm=1.5,note='Soot and heat are injected without fuel. Measured chemical reaction remains zero.'),
 dict(id='frozen',preset='hearth',title='FREEZE THE VOLUME / 360-DEGREE ORBIT',duration=4.,warm=0,note='No simulation steps. The camera makes one full revolution around an unchanged refined 3D state.'),
 dict(id='fields',preset='hearth',title='REFINED FIELD INSPECTION',duration=4.,warm=0,note='Actual z = 0 slices: temperature; fuel/oxygen/soot; velocity; soot. No decorative diagnostic textures.'),
 dict(id='palettes',preset='hearth',title='COLOR CONTROL / UNCHANGED SIMULATION',duration=4.,warm=0,note='One frozen state, four emission palettes. No change to velocity, temperature, fuel, oxygen, or soot.'),
 dict(id='snapshot',preset='hearth',title='SNAPSHOT RESTORE / EXACT REPLAY',duration=3.,warm=0,note='Restore both grids and pressure, advance again, and compare the resulting numerical arrays.'),
 dict(id='refinement',preset='hearth',title='MACRO FIELDS / REFINED FIELDS',duration=3.,warm=0,note='Same coupled state: restricted macro scalar view beside the finer transported reactive fields.')
]

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--mode',choices=['catalogue','verification'],default='catalogue');ap.add_argument('--grid',type=int);ap.add_argument('--only',nargs='*');args=ap.parse_args()
 mode=args.mode;N=args.grid or (48 if mode=='catalogue' else 64)
 g=GL(W,H);m=Simulation(g,(N,N*3//2,N));d=Detail(g,m,2);r=Renderer(g,d,1.,208 if mode=='verification' else 192)
 if mode=='catalogue':
  scenes=[dict(id=k,preset=k,title=p['title'],duration=p['duration'],warm=p['warm'],note=p['note']) for k,p in LIB['presets'].items()]
 else:scenes=VERIFICATION
 if args.only:scenes=[s for s in scenes if s['id'] in args.only]
 suffix='Preset_Catalogue' if mode=='catalogue' else 'Refined_Verification'
 output=ROOT/'videos'/('PYRE_III_'+suffix+'.mp4');cleanpath=ROOT/'videos'/('PYRE_III_'+suffix+'_Clean.mp4')
 main=encoder(output);clean=encoder(cleanpath)
 total_frames=sum(round(s['duration']*FPS) for s in scenes);global_frame=0;entries=[];hero=None;held=None;start=time.perf_counter();snapshot_test=None
 record_path=ROOT/'validation'/('pyre3_'+mode+'.json');macro_render=None
 report=dict(version='PYRE III',backend=g.adapter,api=g.version,host='EGL execution of exported application GLSL',threejs_executed=False,pressure_grid=list(m.grid),scalar_grid=list(d.grid),refinement_factor=2,resolution=[W,H],volume_resolution=[W,H],fps=FPS,dt=DT,substeps_per_moving_frame=2,playback_speed=1.,real_time_performance_claimed=False,base_shader_sha256=hashlib.sha256((ROOT/'tools/shaders.json').read_bytes()).hexdigest(),detail_shader_sha256=hashlib.sha256((ROOT/'tools/detail-shaders.json').read_bytes()).hexdigest(),presets_sha256=hashlib.sha256((ROOT/'presets.json').read_bytes()).hexdigest(),scenes=entries)
 def persist():
  report['elapsed_wall_seconds']=time.perf_counter()-start;record_path.write_text(json.dumps(report,indent=2))
 try:
  for index,scene in enumerate(scenes,1):
   name=scene['id'];p=select(m,d,r,scene['preset'])
   frozen=mode=='verification' and name in ['frozen','fields','palettes','snapshot','refinement']
   optical=mode=='catalogue' and p['category']=='Artistic palettes'
   digest=None
   if frozen or optical:
    if hero is None:
     select(m,d,r,'hearth')
     for _ in range(192):advance(d)
     hero=fine_snapshot(d)
    fine_restore(d,hero)
    if optical:m.pyre3=copy.deepcopy(p['params']);d.turbulence=p['turbulence']
    digest=state_digest(d);r.cacheTick=-1
   else:
    for _ in range(round(scene['warm']/DT)):advance(d)
   if mode=='verification' and name=='ignition':m.ignition=0.
   if mode=='verification' and name=='wind':r.eye=[0,1.85,6.7];r.aim=[0,1.7,0];r.fov=43
   frames=round(scene['duration']*FPS);rows=[];record=read_metrics(d);check(record)
   entry=dict(**scene,frames=frames,start_frame=global_frame,start_seconds=global_frame/FPS,pressure_grid=list(m.grid),scalar_grid=list(d.grid),parameters=copy.deepcopy(p),frozen=bool(frozen or optical),samples=rows,measured_inputs=[])
   print('START',mode,name,'wall',round(time.perf_counter()-start,1),flush=True)
   if name=='snapshot' and mode=='verification':
    snap=fine_snapshot(d);h0=state_digest(d)
    for _ in range(12):advance(d)
    expected=fine_snapshot(d);expected_hash=state_digest(d)
    fine_restore(d,snap)
    for _ in range(12):advance(d)
    actual=fine_snapshot(d);actual_hash=state_digest(d)
    error=max(float(np.max(np.abs(expected[k]-actual[k]))) for k in ['v','c'])
    macro_error=max(float(np.max(np.abs(expected['macro'][k]-actual['macro'][k]))) for k in ['v','c','p'])
    snapshot_test=dict(initial_sha256=h0,expected_sha256=expected_hash,actual_sha256=actual_hash,max_refined_abs_error=error,max_macro_abs_error=macro_error,pass_=error==0 and macro_error==0 and expected_hash==actual_hash)
    if not snapshot_test['pass_']:raise RuntimeError('Replay mismatch: '+str(snapshot_test))
    entry['snapshot_test']=snapshot_test;fine_restore(d,hero);digest=state_digest(d);r.cacheTick=-1
   for frame in range(frames):
    local=frame/FPS;phase='ADVECTED REFINED FIELDS'
    if not frozen and not optical:
     if mode=='verification' and name=='ignition':
      m.fuel=p['fuel'] if local<3 else 0.;m.ignition=0. if local<1 else 1.
      phase='PILOT OFF / FUEL ON' if local<1 else ('PILOT ON' if local<3 else 'FUEL OFF / RESIDUAL SMOKE')
     if mode=='verification' and name=='wind':m.wind=2. if local<2.5 else -2.;phase='WIND +2.0' if local<2.5 else 'WIND -2.0'
     for _ in range(2):advance(d)
    else:phase='FROZEN / NO SOLVER STEPS'
    if m.pyre3['emitter'] in [2,11]:phase='PULSE ACTIVE' if m.burst else 'SOURCE OFF / EVOLVING FIELDS'
    if mode=='catalogue' and m.pyre3['emitter']==11:phase='MUSHROOM-CLOUD VFX / NO BLAST'
    if mode=='verification' and name=='ignition' and frame==65:hero=fine_snapshot(d)
    if name=='hearth' and mode=='catalogue' and frame==frames-1:hero=fine_snapshot(d)
    if name=='frozen' and mode=='verification':
     a=-.15+2*math.pi*frame/max(1,frames-1);r.eye=[math.sin(a)*6.6,2.05,math.cos(a)*6.6];r.aim=[0,1.7,0];r.fov=43
    if name=='fields' and mode=='verification':
     r.view=min(4,1+int(local));r.eye=[0,2.2,6.5];r.aim=[0,2.2,0];r.fov=43;phase=['','TEMPERATURE','FUEL / OXYGEN / SOOT','VELOCITY','SOOT DENSITY'][r.view]
    if name=='palettes' and mode=='verification':
     names=['cyan','green','violet','crimson'];key=names[min(3,int(local))];color=LIB['colors'][key];m.pyre3['tint']=color['tint'];m.pyre3['colorMix']=1.;r.cacheTick=-1;phase=key.upper()+' / OPTICAL CHANGE ONLY'
    # Slow camera arc only for the cinematic catalogue. Verification experiments remain locked.
    if mode=='catalogue' and not optical and name not in ['crosswind','gusts','oscillate','rotating','shear']:
     base=np.array(p['eye']);a=(local/scene['duration']-.5)*.24
     r.eye=[math.cos(a)*base[0]+math.sin(a)*base[2],base[1],-math.sin(a)*base[0]+math.cos(a)*base[2]]
    if frame%12==0 or frame==frames-1:
     record=read_metrics(d);check(record)
     row=dict(frame=frame,clip_time=local,fuel_input=m.fuel,ignition=m.ignition,wind=m.wind,pulse_active=m.burst,**record);rows.append(row)
     print('FRAME',name,frame,'wall',round(time.perf_counter()-start,1),'T',round(record['fine_temperature_max'],2),'R',round(record['fine_reaction_integral'],5),flush=True)
    entry['measured_inputs'].append(dict(frame=frame,time=m.time,fuel=m.fuel,wind=m.wind,pulse=m.burst))
    rgb=r.render()
    if name=='refinement' and mode=='verification':
     if macro_render is None:macro_render=Renderer(g,m,1.,192)
     macro_render.eye=r.eye;macro_render.aim=r.aim;macro_render.fov=r.fov;macro_render.exposure=r.exposure;macro_render.smoke=r.smoke
     low=Image.fromarray(macro_render.render()).resize((640,360),Image.Resampling.LANCZOS)
     high=Image.fromarray(rgb).resize((640,360),Image.Resampling.LANCZOS)
     im=Image.new('RGB',(W,H),(7,11,17));im.paste(low,(0,160));im.paste(high,(640,160));q=ImageDraw.Draw(im)
     q.text((35,119),f'MACRO / {m.grid[0]} x {m.grid[1]} x {m.grid[2]}',font=fonts[22],fill=(190,203,215));q.text((675,119),f'REFINED / {d.grid[0]} x {d.grid[1]} x {d.grid[2]}',font=fonts[22],fill=(255,192,123));rgb=np.asarray(im)
    if frame in [0,frames//2,frames-1]:Image.fromarray(rgb).save(ROOT/'renders'/f'{mode}_{name}_{frame:04d}.png')
    main.stdin.write(hud(rgb,scene['title'],scene['note'],index,phase,record,local,d.grid,(global_frame+1)/total_frames,mode,digest).tobytes())
    clean.stdin.write(clean_title(rgb,scene['title'],'ACTUAL REFINED FIELD RENDER  /  OFFLINE CAPTURE  /  '+('SIMULATION PAUSED' if frozen or optical else '1x SIMULATION PLAYBACK')).tobytes())
    global_frame+=1
   if frozen or optical:
    after=state_digest(d);entry['frozen_state_hash_before']=digest;entry['frozen_state_hash_after']=after;entry['frozen_state_unchanged']=digest==after
    if digest!=after:raise RuntimeError('Renderer mutated the simulation state')
   entry['end_state_sha256']=state_digest(d)
   entry['all_samples_finite']=all(x['finite'] for x in rows);entries.append(entry);persist()
  report['complete']=True;report['native_frame_count']=global_frame;report['duration_seconds']=global_frame/FPS;persist()
 finally:
  for proc in [main,clean]:
   proc.stdin.close();returncode=proc.wait();assert returncode==0,returncode
 print('COMPLETE',mode,round(time.perf_counter()-start,1),flush=True)
