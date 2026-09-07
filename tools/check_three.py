from playwright.sync_api import sync_playwright
from pathlib import Path
import json,time,re,os
r=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=gl-egl','--ignore-gpu-blocklist'],env={**os.environ,'EGL_PLATFORM':'surfaceless','LIBGL_ALWAYS_SOFTWARE':'1','LP_NUM_THREADS':'1'})
 page=browser.new_page(viewport={'width':640,'height':360});logs=[];page.on('pageerror',lambda e: logs.append(str(e)));page.on('console',lambda m: logs.append(m.text) if m.type=='error' else None)
 html=(r/'index.html').read_text()
 html=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+ (r/m.group(1)).read_text().replace('</script','<\\/script') + '</script>', html)
 html=html.replace('<head>','<head><script>window.__CAPTURE__=true;window.__COLD__=true;window.__TIER__="draft";</script>')
 t=time.perf_counter();page.set_content(html,wait_until='load',timeout=120000)
 page.wait_for_function('window.PYRE && window.PYRE.ready || window.PYRE_ERROR',timeout=120000)
 print('INFO',page.evaluate('window.PYRE?.info() || window.PYRE_ERROR'),flush=True)
 print('ERRORS',logs,flush=True)
 data=page.evaluate('''async()=>{const a=window.PYRE;if(!a)throw Error(window.PYRE_ERROR); a.resize(640,360,1); a.advance(12,1/48);a.draw();return {...a.info(),GLerror:a.gpu.gl.getError(),threeRevision:a.gpu.THREE?.REVISION,threeProgramCount:a.gpu.threeRenderer?.info.programs?.length}}''')
 data['errors']=logs;data['wall_seconds']=time.perf_counter()-t
 (r/'validation/browser_three.json').write_text(json.dumps(data,indent=2));page.locator('#viewport').screenshot(path=str(r/'renders/three_browser.png'));print(json.dumps(data),flush=True)
 browser.close()
