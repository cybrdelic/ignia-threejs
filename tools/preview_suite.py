from lab_common import *
import sys
names=sys.argv[1:] or ['candle','stove4','tornado','explosion','mushroom','baffle']
g=GL(1280,720);m=Simulation(g,(48,72,48));d=Detail(g,m,2);r=Renderer(g,d,1.,192)
for name in names:
 t=time.perf_counter();p=select(m,d,r,name)
 for _ in range(round((2.3 if name in ['explosion','mushroom'] else p['warm'])/(1/48))):advance(d)
 im=r.render();Image.fromarray(im).save(ROOT/'renders'/('preview_'+name+'.png'))
 print('PREVIEW',name,time.perf_counter()-t,read_metrics(d)['fine_reaction_integral'],flush=True)
