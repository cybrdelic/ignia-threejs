"""Independently decode the generated FLOAT EXR fixture. GPL-2.0-only."""
from pathlib import Path
import hashlib,json,subprocess
import numpy as np
import OpenEXR
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'validation';OUT.mkdir(exist_ok=True)
subprocess.run(['node','tools/test_exr.cjs'],cwd=ROOT,check=True)
fixture=OUT/'exr_fixture.exr'
expected=np.fromfile(OUT/'exr_fixture.rgba32f',np.float32).reshape(4,8,4)
with OpenEXR.File(str(fixture)) as file:
    observed=file.channels()['RGBA'].pixels
    assert observed.shape==expected.shape
    assert np.isfinite(observed).all()
    error=float(np.abs(observed-expected).max())
    assert error==0,error
    assert observed.min()<0 and observed.max()>1
report={'pass':True,'independent_decoder':'Official OpenEXR Python module','decoder_version':OpenEXR.__version__,'maximum_absolute_error':error,'shape':list(observed.shape),'negative_values_preserved':True,'hdr_values_preserved':True,'file_sha256':hashlib.sha256(fixture.read_bytes()).hexdigest()}
(OUT/'exr_roundtrip.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
