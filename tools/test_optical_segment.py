"""Execute the current renderer's integration segment against a homogeneous slab.

This isolates the optical segment arithmetic copied verbatim from the shipped
GLSL. It does not test scattering, reconstruction, jitter, empty-space traversal,
or calibrated flame appearance. Half-float readback tolerance is explicit.
"""
from pathlib import Path
import re,json,math,hashlib
import numpy as np
from egl_renderer import GL
ROOT=Path(__file__).resolve().parents[1]

def main():
    render=json.loads((ROOT/'tools/shaders.json').read_text())['render']
    segment=re.search(r'float segmentLength=min\(ds,end-distance\);.*?distance\+=ds;',render,re.S).group(0)
    g=GL(1,1);target=g.target(1,1)
    shader='''out vec4 O;uniform float uSigma,uLength,uStep,uCount;void main(){vec4 s=vec4(1.,.4,.2,uSigma);float tr=1.;vec3 col=vec3(0);float distance=0.;float end=uLength;float ds=uStep;for(int i=0;i<256;i++){if(float(i)>=uCount||distance>=end)break;'''+segment+'''}O=vec4(col,tr);}'''
    program=g.program(shader);tests=[]
    for sigma,length,count in [(0.,1.,1),(0.,2.33,23),(1e-8,1.,13),(1e-5,4.,208),(1e-4,1.,19),(.2,1.,13),(1.,2.,97),(12.,.3,128)]:
        step=length/(count-.37) if count>1 else length
        g.pass_(program,target,uSigma=sigma,uLength=length,uStep=step,uCount=float(count))
        val=g.read(target)[0,0].astype(float);expected_i=length if sigma==0 else -math.expm1(-sigma*length)/sigma
        expected=np.array([expected_i,.4*expected_i,.2*expected_i,math.exp(-sigma*length)])
        err=float(np.max(np.abs(val-expected)));tolerance=.001*max(1.,expected_i)
        tests.append({'extinction':sigma,'length':length,'maximum_segments':count,'step_length':step,'observed':val.tolist(),'analytic':expected.tolist(),'maximum_absolute_error':err,'acceptance_absolute_tolerance':tolerance,'pass':err<=tolerance})
    result={'scope':__doc__,'segment_sha256':hashlib.sha256(segment.encode()).hexdigest(),'segment':segment,'backend':g.adapter,'tests':tests,'all_passed':all(x['pass'] for x in tests),'readback_format':'RGBA16F converted to float32'}
    (ROOT/'validation/optical_segment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
    assert result['all_passed']
if __name__=='__main__':main()
