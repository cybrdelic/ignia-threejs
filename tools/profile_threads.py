from lab_common import *
import os
G=GL(160,90);M=Simulation(G,(48,72,48));D=Detail(G,M,2)
for i in range(6):advance(D)
G.Finish();t=time.perf_counter();c=os.times()
for i in range(24):advance(D)
G.Finish();c2=os.times();print('PROFILE',os.environ.get('LP_NUM_THREADS'),'wall',time.perf_counter()-t,'cpu',c2.user+c2.system-c.user-c.system,flush=True)
