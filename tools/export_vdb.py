"""Convert an IGNIA browser snapshot into real OpenVDB grids. GPL-2.0-only.
Requires pyopenvdb/openvdb and NumPy. No simulation is rerun. Temperature is
normalized, not calibrated kelvin. Particle and render settings are not exported.
"""
from __future__ import annotations
import argparse,gzip,hashlib,json,math,struct
from pathlib import Path
import numpy as np
MAX_EXPANDED=512*1024*1024

def read_snapshot(path):
    path=Path(path)
    if path.stat().st_size>MAX_EXPANDED:raise ValueError('Snapshot exceeds 512 MiB')
    with (gzip.open if path.suffix=='.gz' else open)(path,'rb') as source:raw=source.read(MAX_EXPANDED+1)
    if len(raw)>MAX_EXPANDED or len(raw)<8:raise ValueError('Expanded snapshot too large or truncated')
    header_length=struct.unpack_from('<I',raw)[0]
    if header_length>65536 or header_length+4>len(raw):raise ValueError('Invalid header length')
    meta=json.loads(raw[4:4+header_length])
    if meta.get('format')!='pyre2-state-v1' or meta.get('dtype')!='float32-le':raise ValueError('Unsupported format')
    offset=4+header_length
    def field(grid):
        nonlocal offset
        if len(grid)!=3 or any(type(n) is not int or n<1 or n>512 for n in grid) or math.prod(grid)>12000000:raise ValueError('Grid exceeds validated allocation')
        nx,ny,nz=grid;rows=(nz+7)//8;count=rows*ny*8*nx*4;end=offset+count*4
        if end>len(raw):raise ValueError('Truncated field')
        atlas=np.frombuffer(raw,dtype='<f4',count=count,offset=offset).reshape(rows,ny,8,nx,4)
        xyz=atlas.transpose(0,2,1,3,4).reshape(rows*8,ny,nx,4)[:nz].transpose(2,1,0,3).copy();offset=end
        if not np.isfinite(xyz).all():raise ValueError('Nonfinite field')
        return xyz
    macro=meta['grid'];v=field(macro);c=field(macro);pressure=field(macro)[...,0];result={'pressure':pressure}
    if meta.get('refinement'):
        grid=meta['refinement']['grid'];v=field(grid);c=field(grid)
    else:
        grid=macro
        for axis in range(3):
            previous=np.take(v[...,axis],np.maximum(np.arange(grid[axis])-1,0),axis=axis)
            v[...,axis]=(v[...,axis]+previous)*0.5
    count=meta.get('particles',{}).get('count',0)
    if type(count) is not int or count<0 or count>262144:raise ValueError('Invalid particle count')
    if offset+count*32!=len(raw):raise ValueError('Snapshot payload length mismatch')
    size=np.asarray(meta['size'],dtype=np.float64)
    if size.shape!=(3,) or not np.isfinite(size).all() or (size<=0).any():raise ValueError('Invalid physical extent')
    result.update(temperature=v[...,3],density=c[...,2],fuel=c[...,0],oxygen=c[...,1],reaction=c[...,3],velocity=v[...,:3])
    meta['export_grid']=grid
    return meta,result

def export(snapshot,output):
    snapshot,output=Path(snapshot),Path(output)
    try:import pyopenvdb as vdb
    except ImportError:
        try:import openvdb as vdb
        except ImportError as error:raise RuntimeError('Install official OpenVDB Python bindings. Ubuntu: sudo apt install python3-openvdb python3-numpy; run /usr/bin/python3.') from error
    meta,arrays=read_snapshot(snapshot);size=np.asarray(meta['size'],np.float64);grids=[];specs=[]
    for name,array in arrays.items():
        shape=np.asarray(array.shape[:3]);cell=size/shape;origin=cell*.5-size*np.array([.5,0,.5])
        matrix=[[float(cell[0]),0.,0.,0.],[0.,float(cell[1]),0.,0.],[0.,0.,float(cell[2]),0.],[*map(float,origin),1.]]
        transform=vdb.createLinearTransform(matrix=matrix)
        assert np.allclose(transform.indexToWorld((0,0,0)),origin,rtol=0,atol=1e-12)
        background=float(meta.get('params',{}).get('ambientOxygen',1.)) if name=='oxygen' else 0.
        grid=vdb.Vec3SGrid() if array.ndim==4 else vdb.FloatGrid(background)
        grid.name=name;grid.transform=transform
        if name=='density':grid.gridClass=vdb.GridClass.FOG_VOLUME
        if name=='velocity':grid.vectorType=vdb.VectorType.CONTRAVARIANT_RELATIVE
        grid['creator']='IGNIA 0.5 snapshot export';grid['simulation_time']=float(meta['time']);grid['calibrated_physics']=False
        grid['units']='model velocity / world units per second' if name=='velocity' else 'normalized model field'
        if name=='temperature':grid['note']='Normalized temperature; viewer proxy 300 + 1420*T kelvin is not calibrated thermochemistry.'
        tolerance=(0.,0.,0.) if array.ndim==4 else 0.
        grid.copyFromArray(np.ascontiguousarray(array,np.float32),tolerance=tolerance)
        grids.append(grid);specs.append({'name':name,'shape':list(map(int,array.shape)),'voxel_size':cell.tolist(),'origin_cell_center':origin.tolist(),'active_voxels':int(grid.activeVoxelCount())})
    output.parent.mkdir(parents=True,exist_ok=True)
    vdb.write(str(output),grids=grids,metadata={'creator':'IGNIA snapshot-to-OpenVDB','simulation_time':float(meta['time']),'source_sha256':hashlib.sha256(snapshot.read_bytes()).hexdigest()})
    decoded,_=vdb.readAll(str(output));observed={g.name:g for g in decoded};checks=[]
    for spec in specs:
        name=spec['name'];actual=np.zeros(arrays[name].shape,np.float32);observed[name].copyToArray(actual);error=float(np.abs(actual-arrays[name]).max())
        if error!=0:raise AssertionError(f'{name}: OpenVDB round-trip error {error}')
        checks.append({**spec,'maximum_absolute_error':error,'pass':True})
    report={'pass':True,'format':'OpenVDB','source_snapshot':snapshot.name,'source_snapshot_sha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'output_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'output_bytes':output.stat().st_size,'native_library':str(getattr(vdb,'LIBRARY_VERSION','OpenVDB')),'grids':checks,'temperature_is_normalized':True,'retains_particles':False,'retains_browser_render_settings':False,'simulation_rerun':False}
    output.with_suffix('.json').write_text(json.dumps(report,indent=2));return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('snapshot',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args()
    print(json.dumps(export(args.snapshot,args.output),indent=2))
