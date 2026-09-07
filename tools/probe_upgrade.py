from lab_common import *
import argparse
ap=argparse.ArgumentParser();ap.add_argument('--key',default='hearth');ap.add_argument('--grid',type=int,default=48);ap.add_argument('--scale',type=int,default=2);ap.add_argument('--tag',default='v5');args=ap.parse_args()
g=GL(1920,1080);m=Simulation(g,(args.grid,args.grid*3//2,args.grid));d=Detail(g,m,args.scale);r=Renderer(g,d,1.,224)
p=select(m,d,r,args.key);r.eye=[1.,1.5,5.2];r.aim=[0,1.40,0];r.fov=43
print('ADAPTER',g.adapter,flush=True);start=time.perf_counter()
for i in range(144):
 advance(d)
 if(i+1)%48==0:print(i+1,time.perf_counter()-start,flush=True)
print('METRICS',json.dumps(read_metrics(d)),flush=True)
for j in range(3):
 if j:
  for i in range(24):advance(d)
 t=time.perf_counter();im=r.render();Image.fromarray(im).save(ROOT/'renders'/f'{args.tag}_{args.key}_{j}.png');print('RENDER',j,time.perf_counter()-t,flush=True)
 if j==0:
  snap=fine_snapshot(d);np.savez_compressed(ROOT/'renders'/f'{args.tag}_{args.key}_state.npz',v=snap['v'],c=snap['c'],mv=snap['macro']['v'],mc=snap['macro']['c'],mp=snap['macro']['p'],time=m.time)
