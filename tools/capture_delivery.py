"""Native-1080p capture of the rebuilt PYRE runtime's exported GLSL.

Every moving frame advances the coupled macro/refined solver twice at 1/48 s.
No old videos, generated pictures, spatial upscaling, optical-flow interpolation,
or duplicated moving frames are inputs. Individual clips are finalized before
starting the next scene, so a later failure cannot erase completed work.
"""
from lab_common import *
from capture_lab import VERIFICATION
from embers import Embers
import argparse, traceback, os
from pathlib import Path

W,H,FPS = 1920,1080,24
DT = 1/48
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD_FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO='/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
FONTS={s:ImageFont.truetype(FONT,s) for s in [17,18,19,20,22,25,27,32]}
TITLE=ImageFont.truetype(BOLD_FONT,37)
BRAND=ImageFont.truetype(BOLD_FONT,28)
VALUE=ImageFont.truetype(MONO,22)

def encode(path):
    return subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y',
        '-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0',
        '-an','-c:v','libx264','-threads','1','-preset','veryfast','-crf','17',
        '-pix_fmt','yuv420p','-movflags','+faststart',str(path)],stdin=subprocess.PIPE)

def probe(path):
    raw=subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0',
        '-show_entries','stream=width,height,nb_frames,duration,r_frame_rate','-of','json',str(path)])
    v=json.loads(raw)['streams'][0]
    assert (v['width'],v['height'])==(W,H),v
    return v

def save_json(path,obj):
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(obj,indent=2));temp.replace(path)

def fit_camera(r,key):
    # Controlled wide catalogue framing; a separate hero clip uses the same
    # fields at closer camera settings, never an enlargement of these pixels.
    # Full plume views keep the top of the 4.8-unit simulation region on-screen.
    if key in ['hearth','oil','line','crosswind','gusts','oscillate','rotating','shear',
               'tornado','dust','mushroom','trail','cyan','green','violet','crimson']:
        r.eye=[1.0,2.20,6.8];r.aim=[0,1.93,0];r.fov=44.
    elif key=='explosion':
        r.eye=[1.8,2.8,8.0];r.aim=[0,2.15,0];r.fov=43.
    elif key in ['baffle','smoke','collider']:
        r.eye=[2.5,2.25,6.6];r.aim=[0,1.9,0];r.fov=44.
    elif key=='opposed':
        r.eye=[.5,2.4,7.1];r.aim=[0,1.75,0];r.fov=44.

def annotate(rgb,scene,index,total,frame,record,phase,mode,grid,digest=None,replay=None):
    im=Image.fromarray(rgb).convert('RGBA');layer=Image.new('RGBA',(W,H));q=ImageDraw.Draw(layer)
    q.rectangle((0,0,W,81),fill=(5,9,15,235))
    q.text((43,23),'I G N I A  /  NEXT',font=BRAND,fill=(239,239,231,255))
    q.text((490,31),f'{mode.upper()}   /   {index:02d} OF {total:02d}',font=FONTS[19],fill=(145,166,184,255))
    q.text((W-480,31),'NATIVE 1920 x 1080  /  24 FPS',font=FONTS[19],fill=(225,192,151,255))
    q.rectangle((0,H-142,W,H),fill=(5,9,15,235))
    q.text((43,H-126),scene['title'],font=TITLE,fill=(240,239,232,255))
    note=scene['note']
    while q.textlength(note,font=FONTS[20])>W-86: note=note[:-2]
    q.text((45,H-74),note,font=FONTS[20],fill=(158,179,194,255))
    desc='PAUSED FIELD / CAMERA OR OPTICS ONLY' if digest else '1x SIMULATION CLOCK / OFFLINE CAPTURE'
    q.text((45,H-37),f'{grid[0]} x {grid[1]} x {grid[2]} REFINED CELLS   |   {desc}',font=FONTS[18],fill=(108,136,157,255))
    if mode=='verification':
        x=W-407;y=114
        q.rounded_rectangle((x-20,y-17,W-30,y+218),radius=8,fill=(6,13,21,207),outline=(108,140,159,67))
        q.text((x,y),phase[:37],font=FONTS[18],fill=(245,183,108,255))
        lines=[('SIMULATION TIME',f'{record["simulation_time"]:.4f} s'),
               ('REACTION / FIELD INTEGRAL',f'{record["fine_reaction_integral"]:.6f}'),
               ('TEMPERATURE / NORMALIZED',f'{record["fine_temperature_max"]:.4f}')]
        if scene['id']=='wind':
            lines=[('HOT-REGION CENTROID X',f'{record["hot_centroid_x"]:+.4f}'),
                   ('PRESSURE / DIVERGENCE RMS',f'{record["macro"]["post_projection_rms"]:.6f}'),
                   ('REFINED MAXIMUM SPEED',f'{record["fine_velocity_max"]:.4f}')]
        if scene['id'] in ['collider','baffle','smoke']:
            lines=[('SOLID / SPECIES MAXIMUM',f'{record["fine_solid_species_max"]:.6f}'),
                   ('SOLID / SPEED MAXIMUM',f'{record["fine_solid_velocity_max"]:.6f}'),
                   ('PRESSURE / DIVERGENCE RMS',f'{record["macro"]["post_projection_rms"]:.6f}')]
        if digest:
            lines=[('STATE SHA-256 / PREFIX',digest[:20]),('SIMULATION TIME / HELD',f'{record["simulation_time"]:.5f} s'),('SOLVER STEPS THIS SHOT','0')]
        if replay:
            lines=[('REFINED REPLAY MAX ERROR',f'{replay["max_refined_abs_error"]:.7f}'),('MACRO REPLAY MAX ERROR',f'{replay["max_macro_abs_error"]:.7f}'),('HASHES MATCH',str(replay['pass']))]
        for j,(label,value) in enumerate(lines):
            yy=y+40+j*53
            q.text((x,yy),label,font=FONTS[17],fill=(121,153,175,255));q.text((x,yy+21),value,font=VALUE,fill=(222,232,234,255))
    q.rectangle((0,H-3,W*(frame+1)/max(1,round(scene['duration']*FPS)),H),fill=(225,143,72,235))
    return np.asarray(Image.alpha_composite(im,layer).convert('RGB'))

def verify_record(record):
    if not record['finite'] or record['gl_error']!=0:
        raise RuntimeError('Nonfinite fields or OpenGL error: '+repr(record))
    if record['fine_temperature_max']>30 or record['fine_velocity_max']>50:
        raise RuntimeError('Numerical safety threshold exceeded: '+repr(record))
    if record['fine_solid_species_max']!=0 or record['fine_solid_velocity_max']!=0:
        raise RuntimeError('Nonzero field inside an actual solid boundary')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--mode',choices=['catalogue','verification'],required=True)
    ap.add_argument('--grid',type=int);ap.add_argument('--refinement',type=int,choices=[1,2,3],default=3);ap.add_argument('--duration',type=float);ap.add_argument('--ray-steps',type=int,default=256);ap.add_argument('--cinema',action='store_true');ap.add_argument('--only',nargs='*');ap.add_argument('--destination',type=Path);args=ap.parse_args()
    mode=args.mode;N=args.grid or (48 if mode=='catalogue' else 64)
    out=args.destination or ROOT/'delivery'/mode;out.mkdir(parents=True,exist_ok=True)
    g=GL(W,H);m=Simulation(g,(N,N*3//2,N));d=Detail(g,m,args.refinement);r=Renderer(g,d,1.,args.ray_steps);d.embers=Embers(g,d);r.embers=d.embers
    scenes=([dict(id=k,preset=k,title=p['title'],duration=p['duration'],warm=p['warm'],note=p['note'])
             for k,p in LIB['presets'].items()] if mode=='catalogue' else copy.deepcopy(VERIFICATION))
    if args.only:scenes=[s for s in scenes if s['id'] in args.only]
    if args.duration:
        for scene in scenes:scene['duration']=args.duration
    report={'status':'rendering','version':'IGNIA 0.5 / corrected MAC transport and threefold scalar refinement',
            'host':'EGL / exact exported application GLSL','adapter':g.adapter,'api':g.version,
            'resolution':[W,H],'volume_resolution':[W,H],'fps':FPS,'simulation_dt':DT,
            'substeps_per_moving_frame':2,'playback_speed':1.,'macro_grid':list(m.grid),'refined_grid':list(d.grid),
            'source_sha256':hashlib.sha256((ROOT/'tools/shaders.json').read_bytes()).hexdigest(),
            'detail_sha256':hashlib.sha256((ROOT/'tools/detail-shaders.json').read_bytes()).hexdigest(),
            'particle_budget':d.embers.count,'ember_shader_sha256':hashlib.sha256((ROOT/'src/embers.js').read_bytes()).hexdigest(),'no_old_video_inputs':True,'interpolation_or_upscaling':False,'real_time_performance_claimed':False,
            'source_commit':os.environ.get('IGNIA_SOURCE_COMMIT','local-workspace'),'cinematic_camera':args.cinema,'requested_scene_ids':[s['id'] for s in scenes],'scenes':[]}
    manifest=out/'manifest.json';started=time.perf_counter();hero=None;macro_r=None
    save_json(manifest,report)
    for ordinal,scene in enumerate(scenes,1):
        index=list(LIB['presets']).index(scene['id'])+1 if mode=='catalogue' else next(i+1 for i,v in enumerate(VERIFICATION) if v['id']==scene['id'])
        t0=time.perf_counter();name=scene['id'];p=select(m,d,r,scene['preset']);fit_camera(r,scene['preset'])
        if args.cinema:r.eye=[1.,1.5,5.2];r.aim=[0,1.4,0];r.fov=43.
        frozen=(mode=='verification' and name in ['frozen','fields','palettes','snapshot','refinement']) or (mode=='catalogue' and p['category']=='Artistic palettes')
        digest=None;replay=None
        print('START',mode,index,name,'elapsed',round(t0-started,1),flush=True)
        if frozen:
            if hero is None:
                select(m,d,r,'hearth')
                for _ in range(144):advance(d)
                hero=fine_snapshot(d)
            fine_restore(d,hero)
            m.pyre3=copy.deepcopy(p['params']);d.turbulence=p['turbulence'];r.cacheTick=-1
            fit_camera(r,scene['preset']);digest=state_digest(d)
        else:
            if mode=='verification' and name=='ignition':m.ignition=0.
            for _ in range(round(scene['warm']/DT)):advance(d)
        if mode=='verification' and name=='wind':r.eye=[0,2.4,7.5];r.aim=[0,2.0,0];r.fov=44.
        if mode=='verification' and name=='snapshot':
            checkpoint=fine_snapshot(d)
            for _ in range(12):advance(d)
            expected=fine_snapshot(d);expected_hash=state_digest(d)
            fine_restore(d,checkpoint)
            for _ in range(12):advance(d)
            actual=fine_snapshot(d);actual_hash=state_digest(d)
            er=max(float(np.max(np.abs(expected[k]-actual[k]))) for k in ['v','c'])
            em=max(float(np.max(np.abs(expected['macro'][k]-actual['macro'][k]))) for k in ['v','c','p'])
            replay={'max_refined_abs_error':er,'max_macro_abs_error':em,'expected_hash':expected_hash,
                    'actual_hash':actual_hash,'pass':er==0 and em==0 and expected_hash==actual_hash}
            if not replay['pass']:raise RuntimeError('Snapshot replay failed')
            fine_restore(d,checkpoint);digest=state_digest(d)
        clean_path=out/f'{index:02d}_{name}_clean.mp4';annotated_path=out/f'{index:02d}_{name}.mp4'
        clean=encode(clean_path);labelled=encode(annotated_path)
        frames=round(scene['duration']*FPS);record=read_metrics(d);verify_record(record)
        entry={**scene,'index':index,'frame_count':frames,'frozen':frozen,'clean_path':str(clean_path),
               'path':str(annotated_path),'samples':[],'inputs':[],
               'camera_initial':{'eye':r.eye,'aim':r.aim,'fov':r.fov},'parameters':copy.deepcopy(p),
               'full_state_hash_start':state_digest(d),'source_version':'IGNIA 0.5','refinement_factor':args.refinement,'ray_steps':args.ray_steps}
        if replay:entry['replay']=replay
        if digest:entry['frozen_hash_before']=digest
        initial_eye=list(r.eye);initial_aim=list(r.aim)
        try:
            for frame in range(frames):
                local=frame/FPS;phase='ADVECTED REACTIVE FIELDS'
                if not frozen:
                    if mode=='verification' and name=='ignition':
                        m.fuel=p['fuel'] if local<3 else 0.;m.ignition=0. if local<1 else 1.
                        phase='FUEL ON / PILOT OFF' if local<1 else ('IGNITION ON' if local<3 else 'FUEL OFF / RESIDUAL SMOKE')
                    if mode=='verification' and name=='wind':
                        m.wind=2. if local<2.5 else -2.;phase='WIND +2.0' if local<2.5 else 'WIND -2.0'
                    for _ in range(2):advance(d)
                else:phase='FROZEN FIELD'
                if m.pyre3['emitter'] in [2,11]:phase='PULSE ON' if m.burst else 'SOURCE OFF / EVOLVING VOLUME'
                if mode=='verification' and name=='frozen':
                    angle=2*math.pi*frame/max(1,frames-1);r.eye=[7.5*math.sin(angle),2.55,7.5*math.cos(angle)];r.aim=[0,2.1,0]
                elif mode=='verification' and name=='fields':
                    r.view=min(4,1+int(local));r.eye=[0,2.4,7.5];r.aim=[0,2.4,0];r.fov=44.
                    phase=['','TEMPERATURE','FUEL / OXYGEN / SOOT','VELOCITY','SOOT'][r.view]
                elif mode=='verification' and name=='palettes':
                    key=['cyan','green','violet','crimson'][min(3,int(local))]
                    m.pyre3['tint']=LIB['colors'][key]['tint'];m.pyre3['colorMix']=1.;phase=key.upper()+' / OPTICS ONLY'
                elif mode=='catalogue' and name not in ['crosswind','gusts','oscillate','rotating','shear','explosion','mushroom']:
                    angle=(frame/max(1,frames-1)-.5)*.28
                    r.eye=[math.cos(angle)*initial_eye[0]+math.sin(angle)*initial_eye[2],initial_eye[1],-math.sin(angle)*initial_eye[0]+math.cos(angle)*initial_eye[2]]
                if frame%24==0 or frame==frames-1:
                    record=read_metrics(d);verify_record(record);particle_state=g.read(d.embers.state[0]);record['active_ember_count']=int((particle_state[...,3]>=0).sum());record['ember_fields_finite']=bool(np.isfinite(particle_state).all())
                    entry['samples'].append({'frame':frame,'clip_time':local,**record})
                    print('FRAME',mode,name,frame,'of',frames,'wall',round(time.perf_counter()-started,1),flush=True)
                entry['inputs'].append({'frame':frame,'time':m.time,'fuel':m.fuel,'pilot':m.ignition,'wind':m.wind,'pulse':m.burst})
                rgb=r.render()
                if mode=='verification' and name=='refinement':
                    if macro_r is None:macro_r=Renderer(g,m,1.,208)
                    macro_r.eye=r.eye;macro_r.aim=r.aim;macro_r.fov=r.fov;macro_r.exposure=r.exposure;macro_r.smoke=r.smoke
                    small_a=Image.fromarray(macro_r.render()).resize((960,540),Image.Resampling.LANCZOS)
                    small_b=Image.fromarray(rgb).resize((960,540),Image.Resampling.LANCZOS)
                    image=Image.new('RGB',(W,H),(5,9,15));image.paste(small_a,(0,236));image.paste(small_b,(960,236))
                    q=ImageDraw.Draw(image);q.text((45,182),'COUPLED MACRO FIELDS',font=FONTS[27],fill=(178,198,214));q.text((1005,182),'REFINED TRANSPORTED FIELDS',font=FONTS[27],fill=(233,188,132))
                    rgb=np.asarray(image)
                if frame in [0,frames//2,frames-1]:
                    Image.fromarray(rgb).save(out/f'{index:02d}_{name}_{frame:04d}.jpg',quality=93)
                clean.stdin.write(rgb.tobytes())
                labelled.stdin.write(annotate(rgb,scene,index,len(LIB['presets']) if mode=='catalogue' else len(scenes),frame,record,phase,mode,d.grid,digest,replay).tobytes())
            if mode=='catalogue' and name=='hearth':hero=fine_snapshot(d)
            if mode=='verification' and name=='ignition' and hero is None:
                # Subsequent paused studies warm a separate flame, not the extinguished final state.
                pass
            if digest:
                entry['frozen_hash_after']=state_digest(d);entry['frozen_fields_unchanged']=entry['frozen_hash_after']==digest
                if not entry['frozen_fields_unchanged']:raise RuntimeError('Renderer mutated a frozen field')
            entry['full_state_hash_end']=state_digest(d)
        finally:
            clean.stdin.close();labelled.stdin.close()
            if clean.wait()!=0 or labelled.wait()!=0:raise RuntimeError('FFmpeg encoder failure')
        entry['video']=probe(annotated_path);entry['clean_video']=probe(clean_path)
        for path in [annotated_path,clean_path]:subprocess.run(['ffmpeg','-v','error','-threads','1','-i',str(path),'-f','null','-'],check=True)
        entry['full_decode_check']='passed';entry['video_sha256']=hashlib.sha256(annotated_path.read_bytes()).hexdigest();entry['clean_sha256']=hashlib.sha256(clean_path.read_bytes()).hexdigest()
        assert int(entry['video']['nb_frames'])==frames
        entry['wall_seconds']=time.perf_counter()-t0;entry['completed']=True
        report['scenes'].append(entry);report['elapsed_wall_seconds']=time.perf_counter()-started
        save_json(manifest,report)
        print('COMPLETE_SCENE',mode,index,name,'seconds',round(entry['wall_seconds'],1),flush=True)
    report['status']='complete';report['frame_count']=sum(s['frame_count'] for s in report['scenes'])
    report['duration_seconds']=report['frame_count']/FPS
    report['elapsed_wall_seconds']=time.perf_counter()-started;save_json(manifest,report)
    print('COMPLETE',mode,report['duration_seconds'],report['elapsed_wall_seconds'],flush=True)

if __name__=='__main__':
    main()
