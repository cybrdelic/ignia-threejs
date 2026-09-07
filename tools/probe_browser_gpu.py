from playwright.sync_api import sync_playwright
import json,os
from pathlib import Path
sets=[['--use-gl=angle','--use-angle=gl-egl'], ['--use-gl=angle','--use-angle=gl'],['--use-gl=egl'],['--use-gl=angle','--use-angle=swiftshader','--disable-vulkan']]
with sync_playwright() as p:
 for extra in sets:
  b=None
  try:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--ignore-gpu-blocklist',*extra],env={**os.environ,'EGL_PLATFORM':'surfaceless','LIBGL_ALWAYS_SOFTWARE':'1','LP_NUM_THREADS':'2'})
   page=b.new_page();page.set_content('<canvas id="c"></canvas>');d=page.evaluate('''()=>{const g=c.getContext('webgl2');if(!g)return {ok:false};let e=g.getExtension('WEBGL_debug_renderer_info');return {ok:true,renderer:g.getParameter(e?e.UNMASKED_RENDERER_WEBGL:g.RENDERER)}}''')
   print(json.dumps({'args':extra,**d}),flush=True)
   if d['ok']:
    Path('/mnt/data/PYRE_Rebuilt_Rendered/validation/browser_args.json').write_text(json.dumps(extra));break
  except Exception as e:print(str(e)[:300],flush=True)
  finally:
   if b:b.close()
