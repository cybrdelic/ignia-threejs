from lab_common import *
t=time.perf_counter();g=GL(1920,1080);print('GL',g.adapter,g.version,flush=True)
m=Simulation(g,(48,72,48));d=Detail(g,m,2);r=Renderer(g,d,1.,192);select(m,d,r,'hearth');print('INIT',time.perf_counter()-t,flush=True)
for j in range(144):
 advance(d)
 if j%24==23:print('STEP',j+1,time.perf_counter()-t,flush=True)
s=time.perf_counter();im=r.render();print('RENDER',time.perf_counter()-s, 'total',time.perf_counter()-t,flush=True)
Image.fromarray(im).save(ROOT/'renders'/'bench_hearth.png');print(json.dumps(read_metrics(d)),flush=True)
for j in range(3):
 s=time.perf_counter();advance(d);advance(d);r.render();print('FRAME',time.perf_counter()-s,flush=True)
