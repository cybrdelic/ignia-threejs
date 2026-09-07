"""Exercise the actual local Three.js host and record its canvas at native 1080p.

This is separate from the longer EGL replay movies. No fallback is accepted.
All inputs are local application source, not web imagery or old movie frames.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image,ImageDraw,ImageFont
import os,re,json,time,subprocess,base64,io,hashlib
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'delivery/browser';OUT.mkdir(parents=True,exist_ok=True)
REPORT=ROOT/'validation/browser_delivery.json'
FONTS='/usr/share/fonts/truetype/dejavu'
TITLE=ImageFont.truetype(FONTS+'/DejaVuSans-Bold.ttf',30)
TEXT=ImageFont.truetype(FONTS+'/DejaVuSans.ttf',21)
W,H,FPS=1920,1080,24

def save(data):
    temp=REPORT.with_suffix('.tmp');temp.write_text(json.dumps(data,indent=2));temp.replace(REPORT)

def inline_html():
    html=(ROOT/'index.html').read_text()
    html=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+ (ROOT/m.group(1)).read_text().replace('</script','<\\/script') + '</script>', html)
    return html.replace('<head>','<head><script>window.__CAPTURE__=true;window.__COLD__=true;window.__TIER__="draft";</script>')

STATS="""()=>{const a=PYRE,g=a.gpu.gl,d=a.detail||a.flow,v=a.readField(d.state[0],0),c=a.readField(d.state[0],1);
 let finite=true,maxTemp=0,maxSpeed=0,reaction=0,soot=0,h=2166136261;
 for(let i=0;i<v.length;i+=4){maxTemp=Math.max(maxTemp,v[i+3]);maxSpeed=Math.max(maxSpeed,Math.hypot(v[i],v[i+1],v[i+2]));reaction+=c[i+3];soot+=c[i+2];for(let k=0;k<4;k++)finite=finite&&Number.isFinite(v[i+k])&&Number.isFinite(c[i+k]);}
 for(const x of [v,c,...(a.embers?[a.readField(a.embers.state[0],0),a.readField(a.embers.state[0],1)]:[])]){const b=new Uint32Array(x.buffer);for(let i=0;i<b.length;i++){h^=b[i];h=Math.imul(h,16777619);}}
 return {...a.info(),finite,maxTemp,maxSpeed,reactionSum:reaction,sootSum:soot,fieldFNV1a32:(h>>>0).toString(16).padStart(8,'0'),glError:g.getError(),activeEmbers:a.embers?Array.from(a.readField(a.embers.state[0],0)).filter((x,i)=>i%4===3&&x>=0).length:0,threeRevision:a.gpu.THREE?.REVISION,programs:a.gpu.threeRenderer?.info.programs?.length};}"""


def main():
    result={'status':'running','host':'Chromium / Three.js WebGLRenderer','accept_fallback':False,'preset_checks':[], 'checks':{},'videos':[]}
    started=time.perf_counter();errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('IGNIA_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=gl-egl','--ignore-gpu-blocklist'],env={**os.environ,'EGL_PLATFORM':'surfaceless','LIBGL_ALWAYS_SOFTWARE':'1','LP_NUM_THREADS':'1'})
        page=browser.new_page(viewport={'width':W,'height':H},device_scale_factor=1)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:(errors.append(m.text),print('BROWSER_CONSOLE_ERROR',m.text,flush=True)) if m.type=='error' else None)
        page.set_content(inline_html(),wait_until='load',timeout=120000)
        page.wait_for_function('window.PYRE && window.PYRE.ready || window.PYRE_ERROR',timeout=120000)
        identity=page.evaluate('PYRE.info()');assert identity['backend']=='Three.js r180',identity
        result['identity']=identity;result['three_global_sha256']=hashlib.sha256((ROOT/'vendor/three.global.js').read_bytes()).hexdigest();save(result)
        keys=page.evaluate('Object.keys(PYRE.presetLibrary)')
        page.evaluate('PYRE.resize(480,270,1)')
        for key in keys:
            t=time.perf_counter()
            page.evaluate('''key=>{const a=PYRE;a.setPreset(key);a.paused=true;a.render.steps=112;for(let i=0;i<8;i++){PYRE2Studio.beforeStep(a,1/48);a.flow.step(1/48);}a.draw(null,0)}''',key)
            stat=page.evaluate(STATS)
            assert stat['finite'] and stat['glError']==0 and stat['threeRevision']=='180',stat
            stat.update(id=key,substeps=8,wall_seconds=time.perf_counter()-t)
            result['preset_checks'].append(stat);save(result);print('PRESET',key,'PASS',round(time.perf_counter()-started,1),flush=True)
        # Test a paused rendered volume, optical invalidation, and field invariance.
        page.evaluate('''()=>{const a=PYRE;a.setPreset('hearth');a.paused=true;for(let i=0;i<72;i++){PYRE2Studio.beforeStep(a,1/48);a.flow.step(1/48);}a.draw(null,0)}''')
        before=page.evaluate(STATS)
        def png():return base64.b64decode(page.evaluate("document.querySelector('#viewport').toDataURL('image/png').split(',')[1]"))
        image0=png();page.evaluate('PYRE.draw(null,0)');image1=png()
        result['checks']['paused_pixels_identical']={'pass':image0==image1,'sha256':hashlib.sha256(image0).hexdigest()}
        page.evaluate("PYRE.setPalette('green');PYRE.draw(null,0)");image2=png();after=page.evaluate(STATS)
        result['checks']['palette_changes_optics_only']={'pass':image2!=image1 and before['fieldFNV1a32']==after['fieldFNV1a32'],'field_FNV_before':before['fieldFNV1a32'],'field_FNV_after':after['fieldFNV1a32'],'image_sha256_before':hashlib.sha256(image1).hexdigest(),'image_sha256_after':hashlib.sha256(image2).hexdigest()}
        page.evaluate('PYRE.render.smoke=1.9;PYRE.draw(null,0)');image3=png()
        result['checks']['smoke_invalidates_light_cache']={'pass':image3!=image2,'sha256_before':hashlib.sha256(image2).hexdigest(),'sha256_after':hashlib.sha256(image3).hexdigest()}
        assert all(v['pass'] for v in result['checks'].values()),result['checks'];save(result)
        exr=page.evaluate('''()=>{const p=PYRE.readAOV(1);return {width:p.width,height:p.height,finite:p.data.every(Number.isFinite),max:p.data.reduce((a,b)=>Math.max(a,b),0),bytes:IGNIAEXR.encode(p.width,p.height,p.data).length};}''');assert exr['finite'] and exr['max']>0;result['checks']['actual_exr_pass']={'pass':True,**exr};save(result)
        path=OUT/'IGNIA_Next_ThreeJS_1080p_1080p.mp4'
        enc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-threads','1','-preset','veryfast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(path)],stdin=subprocess.PIPE)
        clip={'path':str(path),'width':W,'height':H,'fps':FPS,'duration_seconds':4.,'capture':'Actual browser canvas / local Three.js r180 / native 1920x1080 volume target','scenes':[],'png_sha256':[],'samples':[]}
        try:
            page.evaluate("PYRE.flow.configure('film');PYRE.resize(1920,1080,1);PYRE.render.steps=208")
            for key,title in [('hearth','WOOD FIRE'),('stove4','FOUR-BURNER STOVE')]:
                page.evaluate('''key=>{const a=PYRE;a.setPreset(key);a.paused=true;a.render.steps=208;if(key==='hearth')a.render.fixedCamera={eye:[1.,2.55,7.5],aim:[0,2.1,0],fov:44};}''',key)
                # Warm from zero on this browser host, not a stored older checkpoint.
                for batch in range(8):page.evaluate('''()=>{for(let j=0;j<12;j++){PYRE2Studio.beforeStep(PYRE,1/48);PYRE.flow.step(1/48);}}''')
                clip['scenes'].append({'id':key,'duration_seconds':2.,'warm_seconds':2.,'initial':page.evaluate(STATS)})
                for f in range(48):
                    page.evaluate('''()=>{const a=PYRE;for(let j=0;j<2;j++){PYRE2Studio.beforeStep(a,1/48);a.flow.step(1/48);}a.draw(null,0)}''')
                    raw=png();clip['png_sha256'].append(hashlib.sha256(raw).hexdigest());im=Image.open(io.BytesIO(raw)).convert('RGB');assert im.size==(W,H)
                    if f in [0,24,47]:im.save(OUT/f'{key}_{f:04d}.jpg',quality=94)
                    overlay=ImageDraw.Draw(im);overlay.rectangle((0,0,W,79),fill=(6,11,18));overlay.text((42,21),'IGNIA NEXT / ACTUAL THREE.JS CAPTURE',font=TITLE,fill=(238,237,229));overlay.text((42,H-61),title+'    |    THREE.JS r180  /  128 x 192 x 128 REFINED CELLS',font=TEXT,fill=(229,229,219));overlay.text((W-629,31),'1920 x 1080   /   24 FPS   /   OFFLINE',font=TEXT,fill=(170,186,200))
                    enc.stdin.write(im.tobytes())
                    if f%12==0 or f==47:
                        sample=page.evaluate(STATS);assert sample['glError']==0 and sample['finite'];assert sample['resolution']==[W,H] and sample['volumeResolution']==[W,H]
                        clip['samples'].append({'scene':key,'frame':f,**sample});print('BROWSER_FRAME',key,f,round(time.perf_counter()-started,1),flush=True)
        finally:
            enc.stdin.close();assert enc.wait()==0
        v=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(path)]))['streams'][0]
        assert v['width']==W and v['height']==H and int(v['nb_frames'])==96
        subprocess.run(['ffmpeg','-v','error','-threads','1','-i',str(path),'-f','null','-'],check=True)
        clip['frame_count']=96;clip['decode_check']='passed';clip['unique_canvas_frames']=len(set(clip['png_sha256']));assert clip['unique_canvas_frames']>=94
        clip['file_sha256']=hashlib.sha256(path.read_bytes()).hexdigest();result['videos'].append(clip)
        result.update(status='complete',errors=errors,wall_seconds=time.perf_counter()-started)
        assert not errors,errors;save(result);browser.close();print('COMPLETE_BROWSER',result['wall_seconds'],flush=True)

if __name__=='__main__':main()
