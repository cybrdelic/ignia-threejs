"""Assemble current IGNIA capture artifacts into movies and real GIF previews.
Usage: python tools/build_reels.py INPUT_ARTIFACT_DIRECTORY OUTPUT_DIRECTORY
GPL-2.0-only. This tool does not simulate or upscale images.
"""
from pathlib import Path
import argparse,hashlib,html,json,shutil,subprocess
from sound_design import make_audio
ROOT=Path(__file__).resolve().parents[1]
VERIFY=['ignition','wind','collider','baffle','puff','smoke','frozen','fields','palettes','snapshot','refinement']

def run(command):
    result=subprocess.run([str(x) for x in command],capture_output=True,text=True)
    if result.returncode:raise RuntimeError(result.stderr[-5000:])
    return result.stdout

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def check(path,frames=None):
    v=json.loads(run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames,r_frame_rate,duration','-of','json',path]))['streams'][0]
    assert (v['width'],v['height'],v['r_frame_rate'])==(1920,1080,'24/1'),(path,v)
    if frames is not None:assert int(v['nb_frames'])==frames,(path,v)
    run(['ffmpeg','-v','error','-threads','1','-i',path,'-f','null','-'])
    return {**v,'sha256':sha(path),'file_bytes':path.stat().st_size,'decode_check':'passed'}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('inputs',type=Path);parser.add_argument('output',type=Path);a=parser.parse_args();out=a.output;out.mkdir(parents=True,exist_ok=True)
    lib=json.loads((ROOT/'presets.json').read_text());rows={}
    for mp in sorted(a.inputs.rglob('manifest.json')):
        m=json.loads(mp.read_text())
        if not m.get('version','').startswith('IGNIA 0.5'):continue
        assert m['status']=='complete' and m['no_old_video_inputs'] and not m['interpolation_or_upscaling'],mp
        assert m['resolution']==m['volume_resolution']==[1920,1080]
        mode='hero' if m.get('cinematic_camera') else ('verification' if 'verification' in str(mp) else 'catalogue')
        for e in m['scenes']:
            key=(mode,e['id']);assert key not in rows,key
            folder=out/'clips'/mode;folder.mkdir(parents=True,exist_ok=True)
            clean=mp.parent/Path(e['clean_path']).name;labelled=mp.parent/Path(e['path']).name
            assert sha(clean)==e['clean_sha256'] and sha(labelled)==e['video_sha256']
            p=folder/f"{e['index']:02d}_{e['id']}.mp4";q=p.with_name(p.stem+'_diagnostics.mp4')
            shutil.copy2(clean,p);shutil.copy2(labelled,q);proof=check(p,e['frame_count']);check(q,e['frame_count'])
            hashes=run(['ffmpeg','-v','error','-threads','1','-i',p,'-map','0:v:0','-f','framemd5','-'])
            unique=len({s.rsplit(',',1)[-1].strip() for s in hashes.splitlines() if s and not s.startswith('#')})
            assert e['frozen'] or unique>1,key
            gif=p.with_suffix('.gif');graph='[0:v]fps=10,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3'
            run(['ffmpeg','-v','error','-y','-threads','1','-i',p,'-filter_complex',graph,'-loop','0',gif])
            for jpg in mp.parent.glob(f"{e['index']:02d}_{e['id']}_*.jpg"):shutil.copy2(jpg,folder/jpg.name)
            rows[key]={'mode':mode,'id':e['id'],'title':e['title'],'clean':str(p.relative_to(out)),'diagnostics':str(q.relative_to(out)),'gif':str(gif.relative_to(out)),'gif_sha256':sha(gif),'checks':proof,'unique_decoded_frames':unique,'source_commit':m['source_commit'],'macro_grid':m['macro_grid'],'refined_grid':m['refined_grid'],'shader_sha256':m['source_sha256'],'detail_shader_sha256':m['detail_sha256'],'capture':e}
            print('VERIFIED',key,flush=True)
    assert {k for mode,k in rows if mode=='catalogue'}==set(lib['presets'])
    assert {k for mode,k in rows if mode=='verification'}==set(VERIFY)
    assert ('hero','hearth') in rows and len(rows)==43
    assert len({r['shader_sha256'] for r in rows.values()})==1
    assert len({r['detail_shader_sha256'] for r in rows.values()})==1
    collections={'Candle_Lab':['candle','candles'],'Stove_Lab':['stove','stove4','stove_pan'],'Combustors':['hearth','alcohol','hydrogen','torch','oil','line','opposed','ribbon','pulsejet'],'Wind_Studies':['crosswind','gusts','oscillate','rotating','shear'],'Vortices':['tornado','dust'],'Fireball_Mushroom':['explosion','mushroom'],'Color_Studies':['cyan','green','violet','crimson'],'Collision_Lab':['collider','baffle','smoke']}
    groups=[('Cinematic',[('hero','hearth')]+[('catalogue',k) for k in ['candle','stove4','torch','opposed','tornado','explosion','mushroom','cyan']],False),('Preset_Catalogue',[('catalogue',k) for k in lib['presets']],True),('Verification',[('verification',k) for k in VERIFY],True)]
    groups += [(name,[('catalogue',k) for k in keys],False) for name,keys in collections.items()]
    groups += [('Hero',[('hero','hearth')],False)]
    movies=[];audio=None
    for name,keys,labelled in groups:
        p=out/f'IGNIA_Next_{name}_1080p.mp4';listing=p.with_suffix('.concat.txt')
        sources=[out/rows[k]['diagnostics' if labelled else 'clean'] for k in keys]
        listing.write_text(''.join("file '"+x.resolve().as_posix().replace("'","'\\''")+"'\n" for x in sources))
        run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',listing,'-c','copy','-movflags','+faststart',p]);listing.unlink()
        chapters=[];at=0.
        for key in keys:
            r=rows[key];duration=float(r['checks']['duration']);chapters.append({'id':key[1],'title':r['title'],'start':at,'duration':duration});at+=duration
        if name=='Cinematic':
            wav=out/'sound.wav';audio=make_audio(wav,chapters);temp=p.with_suffix('.sound.mp4')
            run(['ffmpeg','-v','error','-y','-i',p,'-i',wav,'-c:v','copy','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',temp]);temp.replace(p);wav.unlink()
        movies.append({'name':name,'file':p.name,**check(p),'chapters':chapters})
    reports=[json.loads(x.read_text()) for x in a.inputs.rglob('browser_delivery.json')]
    browser=next(r for r in reports if r.get('status')=='complete')
    assert not browser['errors'] and len(browser['preset_checks'])==31 and all(c['pass'] for c in browser['checks'].values())
    b=next(a.inputs.rglob(Path(browser['videos'][0]['path']).name));p=out/'IGNIA_Next_ThreeJS_1080p.mp4';shutil.copy2(b,p)
    assert sha(p)==browser['videos'][0]['file_sha256'];movies.append({'name':'ThreeJS','file':p.name,**check(p,96),'chapters':[]})
    report={'version':'IGNIA 0.5','new_scene_count':44,'old_movies_used_as_render_inputs':False,'real_time_benchmark_claimed':False,'embergen_parity_established':False,'movies':movies,'scenes':list(rows.values()),'browser_tests':browser,'sound_design':audio}
    (out/'capture-report.json').write_text(json.dumps(report,indent=2))
    cards=''.join('<article><a href="'+r['clean']+'"><img loading="lazy" src="'+r['gif']+'" alt="'+html.escape(r['title'])+'"></a><h3>'+html.escape(r['title'])+'</h3><a href="'+r['clean']+'">1080p MP4</a> · <a href="'+r['diagnostics']+'">Recorded diagnostics</a></article>' for r in rows.values())
    films=''.join('<section><h2>'+m['name'].replace('_',' ')+'</h2><video controls playsinline preload="none" src="'+m['file']+'"></video><p>'+m['duration']+' seconds · native 1920 × 1080 · 24 fps</p></section>' for m in movies)
    (out/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>IGNIA NEXT recordings</title><style>body{font:16px system-ui;background:#090e15;color:#ecf0f4;margin:28px}a{color:#ffbc88}video{width:100%;max-height:80vh}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}article{padding:16px;background:#16212c}img{width:100%}section{margin:35px 0}p{line-height:1.6}</style><h1>IGNIA / NEXT</h1><p>New code-rendered recordings. Offline capture, not a real-time benchmark. No generative image or previous-video inputs. Full EmberGen parity is not established.</p><p><a href="capture-report.json">Exact source, field measurements, and frame checks</a></p>'+films+'<h2>All scenes</h2><main>'+cards+'</main></html>')
    print('COMPLETE',len(rows)+1,'new clips;',len(movies),'assembled films',flush=True)
if __name__=='__main__':main()
