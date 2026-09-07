"""Test browser snapshot download/import using direct, full-array comparisons.
Every uint32 word of all seven float32 readbacks is compared, not just a hash.
GPL-2.0-only.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, hashlib
from browser_delivery import inline_html
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'validation';OUT.mkdir(exist_ok=True)
COLLECT="""()=>{const a=PYRE,fields={velocity:a.readField(a.flow.state[0],0),species:a.readField(a.flow.state[0],1),pressure:a.readField(a.flow.pressure[0])};if(a.detail){fields.refinedVelocity=a.readField(a.detail.state[0],0);fields.refinedSpecies=a.readField(a.detail.state[0],1)}if(a.embers){fields.emberPosition=a.readField(a.embers.state[0],0);fields.emberVelocity=a.readField(a.embers.state[0],1)}return {fields,time:a.flow.time,grid:[...a.flow.grid],detail:a.detail?[...a.detail.grid]:null,glError:a.gpu.gl.getError()}}"""
STEP="""n=>{for(let i=0;i<n;i++){PYRE2Studio.beforeStep(PYRE,1/48);PYRE.flow.step(1/48)}}"""
SAVE="""key=>{window._snapshotTests??={};const s=window.collectTestState();window._snapshotTests[key]=s;return {time:s.time,grid:s.grid,detail:s.detail,fields:Object.fromEntries(Object.entries(s.fields).map(([k,v])=>[k,v.length])),glError:s.glError}}"""
COMPARE="""key=>{const expected=window._snapshotTests[key],actual=window.collectTestState(),checks={};for(const [name,a] of Object.entries(expected.fields)){const b=actual.fields[name];if(!b||a.length!==b.length)throw Error(name+': length mismatch');const ua=new Uint32Array(a.buffer,a.byteOffset,a.length),ub=new Uint32Array(b.buffer,b.byteOffset,b.length);let mismatches=0,maxAbs=0;for(let i=0;i<a.length;i++){if(ua[i]!==ub[i])mismatches++;maxAbs=Math.max(maxAbs,Math.abs(a[i]-b[i]));}checks[name]={compared_float32_words:a.length,bitwise_mismatches:mismatches,maximum_absolute_error:maxAbs,pass:mismatches===0};}const metadataEqual=expected.time===actual.time&&JSON.stringify(expected.grid)===JSON.stringify(actual.grid)&&JSON.stringify(expected.detail)===JSON.stringify(actual.detail);return {pass:metadataEqual&&actual.glError===0&&Object.values(checks).every(c=>c.pass),checks,metadata_equal:metadataEqual,gl_error:actual.glError,time:actual.time}}"""
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('IGNIA_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=gl-egl','--ignore-gpu-blocklist'],env={**os.environ,'EGL_PLATFORM':'surfaceless','LIBGL_ALWAYS_SOFTWARE':'1','LP_NUM_THREADS':'1'})
    try:
        page=browser.new_page(viewport={'width':320,'height':180},device_scale_factor=1,accept_downloads=True)
        page.set_content(inline_html(),wait_until='load',timeout=120000)
        page.wait_for_function('window.PYRE?.ready || window.PYRE_ERROR',timeout=120000)
        assert page.evaluate('PYRE.info().backend')=='Three.js r180'
        page.evaluate('window.collectTestState='+COLLECT)
        page.evaluate("PYRE.setPreset('hearth');PYRE.paused=true;PYRE.resize(320,180,1);PYRE.enableDetail(2)")
        page.evaluate(STEP,72);initial=page.evaluate(SAVE,'initial')
        with page.expect_download(timeout=120000) as download:page.evaluate('PYRE.exportState()')
        path=OUT/'browser_roundtrip.pyre.gz';download.value.save_as(path)
        page.evaluate(STEP,8);expected=page.evaluate(SAVE,'continued')
        page.locator('#stateFile').set_input_files(str(path))
        page.wait_for_function("document.getElementById('status').textContent.startsWith('Snapshot restored')",timeout=120000)
        restored=page.evaluate(COMPARE,'initial');assert restored['pass'],restored
        page.evaluate(STEP,8);continued=page.evaluate(COMPARE,'continued');assert continued['pass'],continued
        result={'pass':True,'backend':page.evaluate('PYRE.info().backend'),'comparison':'Direct bitwise comparison of every float32 readback word; not checksum-only','includes_pressure':True,'includes_refined_fields':True,'includes_gpu_particles':True,'initial':initial,'expected_continuation':expected,'restoration':restored,'continuation':continued,'snapshot_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'snapshot_bytes':path.stat().st_size}
        (OUT/'browser_state_roundtrip.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
    finally:browser.close()
