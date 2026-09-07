"""Deterministic procedural sound design; this is not a microphone recording.

Builds a quiet stereo bed of shaped noise, sparse crackle transients and short
low-frequency impacts matched to the cinematic chapter schedule. It does not
pretend to solve acoustic combustion physics.
"""
from pathlib import Path
import numpy as np
import wave
RATE=48000

def shaped_noise(rng,n,low=30.,high=3500.,pink=.4):
    data=rng.standard_normal(n)
    spec=np.fft.rfft(data)
    freq=np.fft.rfftfreq(n,1/RATE)
    shape=(np.maximum(freq,low)/100.)**(-pink)
    shape*=1./np.sqrt(1+(low/np.maximum(freq,1e-6))**8)
    shape*=1./np.sqrt(1+(freq/high)**8)
    value=np.fft.irfft(spec*shape,n)
    return value/(np.sqrt(np.mean(value**2))+1e-8)

def make_audio(path,chapters):
    rng=np.random.default_rng(807241)
    total=round(sum(ch['duration'] for ch in chapters)*RATE)
    mix=np.zeros((total,2),dtype=np.float64)
    for ch in chapters:
        start=round(ch['start']*RATE);n=round(ch['duration']*RATE);t=np.arange(n)/RATE;kind=ch['id']
        bed=shaped_noise(rng,n,low=35.,high=2400.,pink=.42)
        separate=shaped_noise(rng,n,low=65.,high=3100.,pink=.35)
        slow=shaped_noise(rng,n,low=.25,high=4.,pink=.1)
        breath=np.clip(.7+.17*slow,.28,1.15)
        gain=.043;crackles=4
        if kind=='candle':gain=.006;crackles=0
        elif kind in ['stove4','torch']:gain=.032 if kind=='stove4' else .055;crackles=0
        elif kind=='opposed':gain=.06;crackles=1
        elif kind=='oil':gain=.065;crackles=4
        elif kind=='tornado':gain=.07;crackles=2
        elif kind=='explosion':gain=.045;crackles=2
        elif kind=='mushroom':gain=.028;crackles=0
        left=gain*breath*bed;right=gain*breath*(.85*bed+.22*separate)
        for _ in range(round(crackles*ch['duration'])):
            pos=int(rng.uniform(.03,max(.04,ch['duration']-.1))*RATE)
            length=min(n-pos,int(rng.uniform(.009,.055)*RATE))
            if length<=0:continue
            q=np.arange(length)/RATE
            pulse=rng.standard_normal(length)*np.exp(-q/rng.uniform(.003,.012))*rng.uniform(.03,.1)
            pan=rng.uniform(.25,.75);left[pos:pos+length]+=pulse*pan;right[pos:pos+length]+=pulse*(1-pan)
        if kind=='explosion':
            env=(1-np.exp(-t*100))*np.exp(-t*1.4)
            rumble=shaped_noise(rng,n,low=26,high=180,pink=.45)*.12*env
            impact=shaped_noise(rng,n,low=60,high=3200,pink=.25)*.13*np.exp(-t*4)
            left+=rumble+impact;right+=rumble+.9*impact
        if kind=='mushroom':
            rumble=shaped_noise(rng,n,low=24,high=120,pink=.25)*.04*np.exp(-t*.45)
            left+=rumble;right+=rumble
        edge=min(round(.035*RATE),n//2);fade=np.ones(n)
        fade[:edge]=np.sin(np.linspace(0,np.pi/2,edge))**2;fade[-edge:]=np.cos(np.linspace(0,np.pi/2,edge))**2
        mix[start:start+n,0]+=left*fade;mix[start:start+n,1]+=right*fade
    intro=min(round(.35*RATE),total//2);outro=min(round(1.2*RATE),total//2)
    mix[:intro]*=(np.sin(np.linspace(0,np.pi/2,intro))**2)[:,None]
    mix[-outro:]*=(np.cos(np.linspace(0,np.pi/2,outro))**2)[:,None]
    peak=float(np.max(np.abs(mix)))
    if peak>.88:mix*=.88/peak
    pcm=(np.clip(mix,-1,1)*32767).astype('<i2')
    with wave.open(str(path),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(pcm.tobytes())
    return {'kind':'procedural sound design, not recorded or physically simulated audio','sample_rate':RATE,'channels':2,'peak':float(np.max(np.abs(mix))),'duration_seconds':total/RATE,'seed':807241}
