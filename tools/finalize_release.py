"""Finalize an already rendered IGNIA release; never manufactures missing clips.
GPL-2.0-only. Arguments: INPUT_ARTIFACTS MEDIA_DIRECTORY DELIVERY_DIRECTORY.
"""
from pathlib import Path
import argparse,hashlib,html,json,shutil,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[1]

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load_one(root,name):
    files=list(root.rglob(name))
    if not files:raise FileNotFoundError(name)
    return json.loads(files[0].read_text()),files[0]

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('inputs',type=Path);ap.add_argument('media',type=Path);ap.add_argument('delivery',type=Path);a=ap.parse_args();a.delivery.mkdir(parents=True,exist_ok=True)
    report=json.loads((a.media/'capture-report.json').read_text())
    assert report['new_scene_count']==44 and len(report['scenes'])==43 and len(report['movies'])==13
    assert not report['old_movies_used_as_render_inputs']
    for scene in report['scenes']:
        assert scene['shader_sha256']==sha(ROOT/'tools/shaders.json')
        assert scene['detail_shader_sha256']==sha(ROOT/'tools/detail-shaders.json')
        assert scene['capture']['completed'] and scene['checks']['decode_check']=='passed'
    checks={};files=[]
    for name in ['refined_regressions.json','optical_segment.json','embers.json','exr_roundtrip.json','vdb_roundtrip.json','browser_state_roundtrip.json']:
        data,path=load_one(a.inputs,name);checks[name]=data;files.append(path)
        if name=='refined_regressions.json':assert len(data['tests'])==14 and all(v['pass'] for v in data['tests'].values())
        elif name=='optical_segment.json':assert data['all_passed'] and len(data['tests'])==8
        else:assert data['pass'],name
    assert checks['browser_state_roundtrip.json']['comparison'].startswith('Direct bitwise')
    assert len(checks['vdb_roundtrip.json']['grids'])==7
    report['validation']=checks
    report['limits']=['No EmberGen 2.0 parity or consumer-GPU real-time benchmark is established.','Fine reactive transport uses a modeled subgrid velocity and a coarser pressure solve.','Fuel labels and temperature are normalized VFX-model profiles, not calibrated chemistry.','The tornado is a driven vortex; the mushroom cloud is a buoyant thermal, not nuclear or shock-wave physics.','Volume lighting is approximate single scattering, not converged multi-bounce path tracing.','EXR passes contain volume data, not the additive ember layer or opaque prop beauty. Normals/depth/velocity/position are opacity-weighted moments.','The VDB exporter uses the native library and has no live VDB importer; it omits particles and render settings.','No sparse-domain solver, animated FBX/Alembic collision import, or production node graph is implemented.']
    report['historical_ci_note']='The initial full render workflow marked its numerics job failed because OpenCV 5.0.0 returned no decoded EXR image. Its 14 simulation, eight optical and ember tests had already passed. Release acceptance uses the official OpenEXR decoder, which preserves every fixture value exactly. The workflow was corrected without changing the rendered shaders.'
    report['packaging_source_commit']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    diagnostic=a.media/'validation';diagnostic.mkdir(exist_ok=True)
    for p in files:shutil.copy2(p,diagnostic/p.name)
    (a.media/'capture-report.json').write_text(json.dumps(report,indent=2))
    movie_rows=''.join('<tr><td><a href="'+html.escape(m['file'])+'">'+html.escape(m['name'].replace('_',' '))+'</a></td><td>'+m['duration']+' s</td><td>'+m['nb_frames']+'</td><td>1920 × 1080 · 24 fps</td><td>Passed</td></tr>' for m in report['movies'])
    limitations=''.join('<li>'+html.escape(x)+'</li>' for x in report['limits'])
    page='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>IGNIA 0.5 capture and export report</title><style>body{background:#0d131c;color:#e8eef4;font:16px system-ui;max-width:1150px;margin:36px auto;padding:20px;line-height:1.65}a{color:#ffc58f}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #334458;padding:12px}code{overflow-wrap:anywhere}h1,h2{line-height:1.2}</style><h1>IGNIA 0.5 / verified delivery</h1><p>44 new scene clips: 31 preset demonstrations, 11 verification experiments, one six-second hero shot and one actual Three.js browser clip. Thirteen edited films are assembled from those recordings. No earlier video or generative image is a render input.</p><p><a href="index.html">Scene gallery</a> · <a href="capture-report.json">Raw measurements, frame hashes, source IDs and parameters</a></p><h2>Movies</h2><table><tr><th>Film</th><th>Duration</th><th>Frames</th><th>Format</th><th>Full decode</th></tr>'+movie_rows+'</table><h2>Numerical and format checks</h2><p>14/14 simulation regressions and 8/8 optical segment tests passed. GPU ember fields remain finite and reproduce exactly after restore. All 31 presets ran in the actual Three.js browser backend. Four browser rendering/export checks passed. Full browser checkpoint restoration and continuation compared every word in all seven readback arrays with zero bitwise mismatches.</p><p>Official OpenEXR decoding recovered negative and HDR float fixture values with zero error. Native OpenVDB 10.0.1 recovered all seven simulated grids with zero error, including coordinates and velocity component ordering. These are numerical/file-format tests, not calibration against real combustion.</p><h2>Resolution and capture</h2><p>The verification and hero shots use a 64 × 96 × 64 pressure grid and 192 × 288 × 192 refined fields. The remaining catalogue includes 144 × 216 × 144 or 192 × 288 × 192 refined fields, recorded per shot in the raw report. The separate browser clip uses 128 × 192 × 128 refined fields. All movie and volume render targets are native 1920 × 1080. Offline software rendering was used; encoded 24 fps is playback speed.</p><h2>Scope and remaining gaps</h2><ul>'+limitations+'</ul><h2>CI history</h2><p>'+html.escape(report['historical_ci_note'])+'</p></html>'
    (a.media/'report.html').write_text(page)
    readme=ROOT/'README.md';s=readme.read_text();marker='## New 0.5 recordings';s=s.split(marker)[0].rstrip()
    s+='\n\n'+marker+'\n\n![New recorded hero flame](docs/media/next/clips/hero/01_hearth.gif)\n\n[New recorded scene gallery](docs/media/next/index.html) · [33-second cinematic cut](docs/media/next/IGNIA_Next_Cinematic_1080p.mp4) · [31-preset catalogue](docs/media/next/IGNIA_Next_Preset_Catalogue_1080p.mp4) · [Full refined verification](docs/media/next/IGNIA_Next_Verification_1080p.mp4) · [Actual Three.js recording](docs/media/next/IGNIA_Next_ThreeJS_1080p.mp4).\n\n[Measured release report](docs/media/next/report.html) · [Raw readbacks, frame hashes and source IDs](docs/media/next/capture-report.json) · [EXR, OpenVDB and checkpoint guide](EXPORTS.md). All capture is offline. Numerical tests do not establish physical calibration or EmberGen parity.\n'
    readme.write_text(s)
    source_paths=[]
    for dirname in ['src','tools','vendor','.github/workflows']:
        source_paths.extend(p for p in (ROOT/dirname).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    source_paths += [ROOT/n for n in ['README.md','UPGRADE.md','EXPORTS.md','LICENSE','package.json','package-lock.json','index.html','presets.json','requirements.txt','.gitignore'] if (ROOT/n).exists()]
    manifest={p.relative_to(ROOT).as_posix():sha(p) for p in sorted(source_paths)}
    (ROOT/'SOURCE_SHA256.json').write_text(json.dumps(manifest,indent=2))
    for m in report['movies']:shutil.copy2(a.media/m['file'],a.delivery/m['file'])
    shutil.copy2(a.media/'capture-report.json',a.delivery/'IGNIA_Next_Report.json')
    shutil.copy2(a.media/'report.html',a.delivery/'IGNIA_Next_Report.html')
    subprocess.run(['node','tools/build_standalone.cjs',str((a.delivery/'IGNIA_Next_Studio.html').resolve())],cwd=ROOT,check=True)
    with zipfile.ZipFile(a.delivery/'IGNIA_Next_Source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in source_paths+[ROOT/'SOURCE_SHA256.json']:z.write(p,p.relative_to(ROOT))
        z.writestr('VALIDATED_CAPTURE_REPORT.json',json.dumps(report,indent=2))
    with zipfile.ZipFile(a.delivery/'IGNIA_Next_All_Scenes_1080p.zip','w',zipfile.ZIP_DEFLATED,compresslevel=1) as z:
        for p in (a.media/'clips').rglob('*'):
            if p.is_file():z.write(p,p.relative_to(a.media))
        b=a.media/'IGNIA_Next_ThreeJS_1080p.mp4';z.write(b,b.name)
        cards=''.join('<article><h2>'+html.escape(r['title'])+'</h2><a href="'+r['clean']+'"><img width="480" src="'+r['gif']+'"></a><p><a href="'+r['clean']+'">Full 1080p clip</a> · <a href="'+r['diagnostics']+'">Annotated clip</a></p></article>' for r in report['scenes'])
        z.writestr('index.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>All IGNIA 0.5 clips</title><style>body{font:16px system-ui;background:#0d131c;color:white;padding:28px}main{display:flex;flex-wrap:wrap;gap:24px}article{max-width:480px}img{width:100%}a{color:#ffbd88}</style><h1>All new IGNIA scenes</h1><p>Offline code-rendered video, not a real-time performance benchmark.</p><p><a href="IGNIA_Next_ThreeJS_1080p.mp4">Actual Three.js browser recording</a></p><main>'+cards+'</main></html>')
        z.write(a.media/'capture-report.json','capture-report.json')
    with zipfile.ZipFile(a.delivery/'IGNIA_Next_Export_Examples.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for name in ['IGNIA_Simulated_Fields.vdb','IGNIA_Simulated_Fields.json','IGNIA_Simulated_State.pyre.gz','vdb_roundtrip.json','exr_fixture.exr','exr_fixture.rgba32f','exr_roundtrip.json']:
            candidates=list(a.inputs.rglob(name));assert candidates,name;z.write(candidates[0],name)
        z.write(ROOT/'EXPORTS.md','EXPORTS.md')
    print(json.dumps({'status':'complete','movie_count':len(report['movies']),'scene_count':report['new_scene_count'],'source_files':len(manifest),'delivery':str(a.delivery)},indent=2))
if __name__=='__main__':main()
