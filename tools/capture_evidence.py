"""Deterministic capture and inspection of PYRE II's exported browser GLSL.
Every captured moving frame advances the actual fields at fixed simulation dt.
Frozen-orbit and inspector segments intentionally hold the fields fixed.
No images of fire, generated media, interpolation, or optical-flow synthesis.
"""
from egl_renderer import *
from PIL import ImageDraw,ImageFont
import subprocess,hashlib,argparse,sys,os
ROOT=Path(__file__).resolve().parent.parent
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO='/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
fonts={n:ImageFont.truetype(FONT,n) for n in [12,13,14,15,16,18,22,26,34,40]}
fonts['bold']=ImageFont.truetype(BOLD,34);fonts['mono']=ImageFont.truetype(MONO,13)

def unpack(a,grid):
 nx,ny,nz=grid
 return np.stack([a[(z//8)*ny:(z//8+1)*ny,(z%8)*nx:(z%8+1)*nx] for z in range(nz)])

def reset(sim):
 for t in sim.state+[sim.curl,sim.div,sim.residual,sim.coarse_d]+sim.pressure+sim.coarse_p:sim.g.clear(t)
 c=np.zeros((sim.h,sim.w,4),np.float32);c[:,:,1]=1.
 for t in sim.state:sim.g.upload(t['textures'][1],c)
 sim.time=0.;sim.tick+=1

def snapshot(sim):
 return {'v':sim.g.read(sim.state[0]),'c':sim.g.read(sim.state[0],1),'p':sim.g.read(sim.pressure[0]),'grid':np.array(sim.grid),'time':sim.time}

def restore(sim,state):
 for t in sim.state:sim.g.upload(t['textures'][0],state['v']);sim.g.upload(t['textures'][1],state['c'])
 for t in sim.pressure:sim.g.upload(t['textures'][0],state['p'])
 sim.time=float(state['time']);sim.tick+=1

def metrics(sim):
 g=sim.g;va=g.read(sim.state[0]);ca=g.read(sim.state[0],1);v=unpack(va,sim.grid);c=unpack(ca,sim.grid)
 pre=unpack(g.read(sim.div)[:,:,0],sim.grid)
 g.pass_(sim.p['div'],sim.residual,**sim.base(),uV=sim.v,uC=sim.c)
 post=unpack(g.read(sim.residual)[:,:,0],sim.grid)
 nx,ny,nz=sim.grid;hx,hy,hz=np.array(sim.size)/sim.grid
 z,y,x=np.ogrid[:nz,:ny,:nx];wx=(x+.5)*hx-sim.size[0]/2;wy=(y+.5)*hy;wz=(z+.5)*hz-sim.size[2]/2
 mask=np.broadcast_to((x>3)&(x<nx-4)&(y>3)&(y<ny-4)&(z>3)&(z<nz-4),(nz,ny,nx))
 solid=np.zeros((nz,ny,nx),bool)
 if sim.obstacle==1:solid=((wx**2+(wy-1.28)**2+wz**2)<.5**2)
 elif sim.obstacle==2:solid=np.broadcast_to((abs(wx)<.72)&(abs(wy-1.3)<.075)&(abs(wz)<.60),(nz,ny,nx))
 mask=mask&~solid
 speed=np.linalg.norm(v[:,:,:,:3],axis=-1)
 pre_rms=float(np.sqrt(np.mean(pre[mask]**2)));post_rms=float(np.sqrt(np.mean(post[mask]**2)))
 soot=c[:,:,:,2];burn=c[:,:,:,3];temp=v[:,:,:,3];cell_volume=hx*hy*hz
 weight=soot*np.clip(wy/.7,0,1);ws=float(weight.sum())
 return {'simulation_time':sim.time,'tick':sim.tick,'finite':bool(np.isfinite(v).all() and np.isfinite(c).all()),'gl_error':g.GetError(),'pre_projection_rms':pre_rms,'post_projection_rms':post_rms,'projection_ratio':post_rms/max(pre_rms,1e-12),'velocity_max':float(speed.max()),'temperature_max_normalized':float(temp.max()),'model_temperature_K':float(300+1420*temp.max()),'reaction_integral':float(burn.sum()*cell_volume),'fuel_integral':float(c[:,:,:,0].sum()*cell_volume),'soot_integral':float(soot.sum()*cell_volume),'soot_centroid_x':float((weight*wx).sum()/max(ws,1e-12)),'solid_scalar_max':float(np.max(np.abs(c[solid]))) if solid.any() else 0.,'solid_velocity_max':float(np.max(np.abs(v[:,:,:,:3][solid]))) if solid.any() else 0.,'cfl_max':float(speed.max()*(1/48)/min(hx,hy,hz))}

SCENES=[
 {'id':'ignition','title':'IGNITION / FUEL SHUTOFF','sub':'Fuel without ignition; ignite at 1 s; shut the fuel off at 3 s.','duration':8.,'number':'01'},
 {'id':'wind','title':'REVERSE THE WIND','sub':'The camera stays fixed. Only the force changes.','duration':6.,'number':'02'},
 {'id':'collider','title':'FLOW AROUND A SOLID','sub':'A pressure boundary, not a render-only sphere.','duration':6.,'number':'03'},
 {'id':'puff','title':'ONE PULSE. THEN NOTHING.','sub':'A 0.292 s fuel pulse. The transported fields continue after cutoff.','duration':5.,'number':'04'},
 {'id':'smoke','title':'SMOKE / SOLID DEFLECTION','sub':'A soot source under a plate. No flame emission.','duration':5.,'number':'05'},
 {'id':'orbit','title':'FREEZE TIME. MOVE AROUND IT.','sub':'The identical 3D state is viewed through a full revolution.','duration':4.,'number':'06'},
 {'id':'fields','title':'LOOK INSIDE THE SOLVER','sub':'Raw temperature, species, velocity, and soot on the z = 0 plane.','duration':4.,'number':'07'}]

def overlay(rgb,scene,local,m,sim,frame,total_frames,phase):
 image=Image.fromarray(rgb).convert('RGBA');layer=Image.new('RGBA',image.size);d=ImageDraw.Draw(layer);W,H=image.size
 d.rectangle((0,0,W,79),fill=(5,8,12,219));d.line((34,78,W-34,78),fill=(208,221,234,36),width=1)
 d.text((34,22),'P Y R E   I I',font=fonts[26],fill=(244,239,229,255));d.text((280,30),'CONTROLLED EXPERIMENT / '+scene['number'],font=fonts[13],fill=(157,174,190,255))
 d.rounded_rectangle((W-315,22,W-34,55),radius=15,fill=(24,30,39,235),outline=(80,89,100,120));d.text((W-300,32),phase,font=fonts['mono'],fill=(255,174,99,255))
 d.rectangle((0,H-109,W,H),fill=(5,8,12,222));title_font=ImageFont.truetype(BOLD,28)
 d.text((34,H-96),scene['title'],font=title_font,fill=(240,241,241,255));d.text((35,H-55),scene['sub'],font=fonts[14],fill=(172,184,199,255))
 d.text((35,H-25),f'{sim.grid[0]} x {sim.grid[1]} x {sim.grid[2]} CELLS   /   24 FPS OUTPUT   /   1x SIMULATION CLOCK   /   OFFLINE EGL CAPTURE',font=fonts[12],fill=(117,136,153,255))
 name=scene['id'];lines=[('SHOT TIME',f'{local:05.2f} s'),('REACTION INTEGRAL',f'{m["reaction_integral"]:.5f}'),('PROJECTION RMS',f'{m["post_projection_rms"]:.5f}')]
 if name=='wind':lines=[('WIND ACCELERATION',f'{sim.wind:+.1f} m/s2'),('SOOT CENTROID X',f'{m["soot_centroid_x"]:+.3f} m'),('MAXIMUM SPEED',f'{m["velocity_max"]:.2f} m/s')]
 if name=='collider':lines=[('SOLID INTERIOR / SPEED',f'{m["solid_velocity_max"]:.6f}'),('SOLID INTERIOR / SPECIES',f'{m["solid_scalar_max"]:.6f}'),('PROJECTION RMS',f'{m["post_projection_rms"]:.5f}')]
 if name=='puff':lines=[('PULSE INPUT', 'ON' if sim.burst else 'OFF'),('REMAINING FUEL',f'{m["fuel_integral"]:.4f}'),('REACTION INTEGRAL',f'{m["reaction_integral"]:.4f}')]
 if name=='smoke':lines=[('REACTION INTEGRAL',f'{m["reaction_integral"]:.6f}'),('SOOT INTEGRAL',f'{m["soot_integral"]:.4f}'),('SOLID INTERIOR / SPECIES',f'{m["solid_scalar_max"]:.6f}')]
 if name=='orbit':lines=[('FIELD TIME / HELD',f'{sim.time:.3f} s'),('SOLVER STEPS IN SHOT','0'),('CAMERA ROTATION',f'{local/scene["duration"]*360:05.1f} deg')]
 if name=='fields':lines=[('SLICE PLANE','z = 0.00 m'),('FIELD TIME / HELD',f'{sim.time:.3f} s'),('MAX TEMP / NORMALIZED',f'{m["temperature_max_normalized"]:.3f}')]
 x=W-264;y=105;d.rounded_rectangle((x-15,y-13,W-34,y+184),radius=8,fill=(7,11,17,214),outline=(122,140,162,48))
 for k,(label,value) in enumerate(lines):
  yy=y+k*54;d.text((x,yy),label,font=fonts[12],fill=(131,151,171,255));d.text((x,yy+19),value,font=fonts[18],fill=(226,232,237,255))
 d.text((x,y+163),'FIELD READBACK / EVERY 0.5 s',font=fonts[12],fill=(107,132,151,255))
 d.rectangle((0,H-3,W*(frame+1)/total_frames,H),fill=(255,145,70,230))
 return np.asarray(Image.alpha_composite(image,layer).convert('RGB'))

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--grid',type=int,default=96);ap.add_argument('--only');ap.add_argument('--out',type=Path,default=ROOT/'videos');args=ap.parse_args()
 used_shader_sha256=hashlib.sha256((ROOT/'tools/shaders.json').read_bytes()).hexdigest()
 args.out.mkdir(parents=True,exist_ok=True);g=GL(1280,720);sim=Simulation(g,(args.grid,args.grid*3//2,args.grid));ren=Renderer(g,sim,1.,208);ren.exposure=.95
 scenes=[s for s in SCENES if not args.only or s['id']==args.only];total=sum(round(s['duration']*24) for s in scenes)
 def encoder(path):
  return subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r','24','-i','pipe:0','-an','-c:v','libx264','-threads','1','-preset','veryfast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(path)],stdin=subprocess.PIPE)
 main=encoder(args.out/'PYRE_II_Evidence.mp4');clean=encoder(args.out/'PYRE_II_Cinematic.mp4');report=[];global_frame=0;steady=None;frozen=None;start=time.perf_counter()
 for scene in scenes:
  name=scene['id'];reset(sim);sim.scene=0;sim.obstacle=0;sim.fuel=1.6;sim.wind=0.;sim.vorticity=3.2;sim.ignition=1.;sim.burst=0.;ren.view=0;ren.fov=40.;ren.exposure=.95;ren.eye=[.75,1.8,5.2];ren.aim=[0,1.48,0];phase='FUEL ON'
  if name=='wind':
   if steady:restore(sim,steady)
   else:
    for _ in range(160):sim.step(1/60)
   ren.eye=[0,1.55,5.4];ren.aim=[0,1.5,0];ren.fov=43.
  if name=='collider':
   sim.scene=1;sim.obstacle=1;sim.radius=.34;sim.fuel=3.2;sim.vorticity=3.2
   ren.eye=[1.65,1.5,4.3];ren.aim=[0,1.30,0];ren.fov=41.
   for _ in range(72):sim.step(1/60)
  if name=='puff':
   sim.scene=2;sim.radius=.60;sim.fuel=6.0;sim.vorticity=4.2
   ren.eye=[2.0,1.85,5.7];ren.aim=[0,1.65,0];ren.fov=43.
  if name=='smoke':
   sim.scene=3;sim.obstacle=2;sim.radius=.33;sim.fuel=1.8;sim.vorticity=2.6
   ren.eye=[2.5,2.2,5.4];ren.aim=[0,1.55,0];ren.fov=42.
  if name in ['orbit','fields']:
   if frozen:restore(sim,frozen);sim.scene=1;sim.obstacle=1;sim.fuel=3.2;sim.radius=.34
   else:
    sim.scene=1;sim.obstacle=1;sim.fuel=3.2;sim.radius=.34
    for _ in range(180):sim.step(1/60)
  rows=[];frames=round(scene['duration']*24);m=metrics(sim)
  print('START',name,'elapsed',round(time.perf_counter()-start,1),flush=True)
  for frame in range(frames):
   local=frame/24
   if name=='ignition':sim.fuel=1.6 if local<3 else 0.;sim.ignition=0. if local<1 else 1.;phase='FUEL ON / IGNITER OFF' if local<1 else ('IGNITER ON' if local<3 else 'FUEL OFF / ADVECTING')
   if name=='wind':sim.wind=1.5 if local<3 else -1.5;phase='WIND +1.5 m/s2' if local<3 else 'WIND -1.5 m/s2'
   if name=='collider':phase='SOLID SPHERE / ACTIVE'
   if name=='puff':sim.burst=1. if local<.28 else 0.;phase='INJECTING FUEL' if sim.burst else 'INJECTION = 0'
   if name=='smoke':phase='SOOT + HEAT / NO FUEL'
   if name not in ['orbit','fields']:
    for _ in range(2):sim.step(1/48)
   if name=='ignition' and frame==65:steady=snapshot(sim);np.savez_compressed(ROOT/'renders'/'steady.npz',**steady)
   if name=='collider' and frame==104:frozen=snapshot(sim);np.savez_compressed(ROOT/'renders'/'frozen.npz',**frozen)
   if name=='orbit':
    a=-.25+2*math.pi*frame/max(1,frames-1);ren.eye=[math.sin(a)*4.8,1.95,math.cos(a)*4.8];ren.aim=[0,1.55,0];ren.fov=43;phase=f'FROZEN / {round(frame/(frames-1)*360):03} DEG'
   if name=='fields':
    ren.view=min(4,1+int(local));ren.eye=[0,2.1,6.6];ren.aim=[0,2.1,0];ren.fov=42.;phase=['','TEMPERATURE','FUEL / OXYGEN / SOOT','VELOCITY','SOOT CONCENTRATION'][ren.view]
   if frame%12==0 or frame==frames-1:
    m=metrics(sim)
    if name in ['orbit','fields']:
     m['pre_projection_rms']=None;m['projection_ratio']=None;m['projection_measurement_applicable']=False
    row={'frame':frame,'scene_elapsed':local,'fuel_input':sim.fuel,'ignition_input':sim.ignition,'wind_acceleration':sim.wind,'burst_input':sim.burst,**m};rows.append(row)
    if not m['finite'] or m['gl_error'] or m['velocity_max']>35 or m['post_projection_rms']>5:raise RuntimeError('Invalid field or GL error: '+str(m))
   rgb=ren.render('orbit',local)
   clean.stdin.write(rgb.tobytes());annotated=overlay(rgb,scene,local,m,sim,global_frame,total,phase);main.stdin.write(annotated.tobytes())
   if frame in [0,48,frames//2,frames-1]:
    Image.fromarray(rgb).save(ROOT/'renders'/f'{name}-{frame:04d}.png');Image.fromarray(annotated).save(ROOT/'renders'/f'{name}-annotated-{frame:04d}.png')
   if name=='puff' and frame%8==0:Image.fromarray(rgb).resize((320,180),Image.Resampling.LANCZOS).save(ROOT/'renders'/f'flip-{frame//8:02d}.png')
   if frame%24==0:print(json.dumps({'scene':name,'frame':frame,'elapsed':round(time.perf_counter()-start,2),'reaction':m['reaction_integral'],'projection_ratio':m['projection_ratio'],'x_centroid':m['soot_centroid_x'],'solid_scalar':m['solid_scalar_max']}),flush=True)
   global_frame+=1
  entry={**scene,'frames':frames,'samples':rows,'state_sha256':hashlib.sha256(g.read(sim.state[0]).tobytes()+g.read(sim.state[0],1).tobytes()).hexdigest()};report.append(entry)
  (ROOT/'validation'/'capture.json').write_text(json.dumps({'backend':g.adapter,'api':g.version,'grid':list(sim.grid),'resolution':[1280,720],'fps':24,'simulation_dt':1/48,'substeps_per_moving_frame':2,'playback_speed':1.,'renderer':'exported GLSL in EGL, not the Three.js host','real_time_performance_claimed':False,'scenes':report,'elapsed_wall_seconds':time.perf_counter()-start,'shader_sha256':used_shader_sha256},indent=2))
 for proc in [main,clean]:proc.stdin.close();assert proc.wait()==0
 print('COMPLETE',time.perf_counter()-start,flush=True)
