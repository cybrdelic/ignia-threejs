"""Smoke-test the delivered standalone HTML with its embedded Three.js copy."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json,hashlib,time
ROOT=Path(__file__).resolve().parents[1]
FILE=ROOT.parent/'PYRE_Rebuilt_Studio.html'

def main():
    t=time.perf_counter();errors=[]
    document=FILE.read_text().replace('<head>','<head><script>window.__CAPTURE__=true;window.__COLD__=true;window.__TIER__="draft";</script>',1)
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=gl-egl','--ignore-gpu-blocklist'],env={**os.environ,'EGL_PLATFORM':'surfaceless','LIBGL_ALWAYS_SOFTWARE':'1','LP_NUM_THREADS':'1'})
        page=b.new_page(viewport={'width':800,'height':600});page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(document,wait_until='load',timeout=120000)
        page.wait_for_function('window.PYRE && PYRE.ready || window.PYRE_ERROR',timeout=120000)
        info=page.evaluate('PYRE.info()');assert info['backend']=='Three.js r180',info
        page.evaluate("PYRE.resize(480,270,1);PYRE.setPreset('stove4');PYRE.paused=true;PYRE.render.steps=112;for(let i=0;i<8;i++){PYRE2Studio.beforeStep(PYRE,1/48);PYRE.flow.step(1/48)}PYRE.draw(null,0)")
        canvas=page.evaluate("({width:document.querySelector('canvas').width,height:document.querySelector('canvas').height,error:PYRE.gpu.gl.getError(),presets:Object.keys(PYRE.presetLibrary).length,three:PYRE.gpu.THREE.REVISION})")
        assert canvas=={'width':480,'height':270,'error':0,'presets':31,'three':'180'},canvas
        assert not errors,errors
        result={'status':'complete','file':str(FILE),'sha256':hashlib.sha256(FILE.read_bytes()).hexdigest(),'method':'Inline delivered standalone HTML with cold/draft capture flags for a focused startup/render smoke test. No external scripts.','initial':info,'canvas':canvas,'errors':errors,'wall_seconds':time.perf_counter()-t}
        (ROOT/'validation/standalone_checks.json').write_text(json.dumps(result,indent=2));b.close();print(json.dumps(result),flush=True)
if __name__=='__main__': main()
