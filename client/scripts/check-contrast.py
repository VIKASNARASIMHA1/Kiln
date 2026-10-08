"""Checks WCAG contrast for the colour pairings used in client/src/index.css, in both themes.
Run after changing any colour token:  python client/scripts/check-contrast.py
"""
import re
import os
css=open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'index.css')).read()
def block(sel):
    i=css.index(sel); j=css.index('}',i); return dict(re.findall(r'--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})',css[i:j]))
light=block(':root {'); dark={**light, **block(':root[data-theme="dark"] {')}
def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def ratio(a,b):
    la,lb=sorted((lum(a),lum(b)),reverse=True); return (la+0.05)/(lb+0.05)
SIDE={'light':'#14163b','dark':'#0a0b1c'}
def pairs(T,mode):
    t=lambda k:T[k]
    P=[]
    for bg in ('bg','panel','panel-2'): P+= [('ink',bg,4.5,'body text'),('muted',bg,4.5,'muted text'),('link',bg,4.5,'links')]
    for tint in ('blue-t','coral-t','violet-t','sun-t','mint-t','orange-t'): P.append(('ink',tint,4.5,'text on '+tint))
    P+= [('on-sun','sun',4.5,'button text'),('on-accent','accent',4.5,'user chat bubble'),
         ('mint-ink','mint-t',4.5,'pass label'),('mint-ink','panel',4.5,'solved text'),('red-ink','panel',4.5,'error text'),('red-ink','coral-t',4.5,'fail label'),
         ('focus','panel',3,'focus ring on panel'),('focus','bg',3,'focus ring on page')]
    out=[]
    for fg,bg,need,why in P: out.append((why,fg,bg,t(fg),t(bg),need))
    on_t = {'light':{'blue':'#ffffff','coral':'#14163b','violet':'#ffffff'},'dark':{k:'#0e1024' for k in ('blue','coral','violet')}}[mode]
    for k,c in on_t.items(): out.append((f'course icon on {k}','on-t',k,c,t(k),3,)) if False else out.append((f'course icon on {k}','icon',k,c,t(k),3))
    icon='#14163b' if mode=='light' else '#0e1024'
    for k in ('blue','orange','mint','violet','coral','sun'): out.append((f'stat icon on {k}','icon',k,icon,t(k),3))
    sd=SIDE[mode]
    for c,why,need in (('#c9cdf5','sidebar nav',4.5),('#a9aed8','sidebar small text',4.5)): out.append((why,c,'side',c,sd,need))
    out.append(('active nav','#14163b','sun','#14163b',t('sun'),4.5))
    out.append(('focus ring on sidebar','focus','side',t('focus'),sd,3))
    out+= [('hero lead','#d6d9ff','hero','#d6d9ff',sd,4.5),('hero fine print','#a9aed8','hero','#a9aed8',sd,4.5),('white on hero','#fff','hero','#ffffff',sd,4.5)]
    return out
bad=0
for mode,T in (('light',light),('dark',dark)):
    rows=pairs(T,mode); fails=[]
    for why,fg,bg,a,b,need in rows:
        r=ratio(a,b)
        if r<need: fails.append((why,a,b,round(r,2),need))
    print(f'{mode}: {len(rows)} pairs checked, {len(fails)} below target')
    for f in fails: print('   FAIL',f); bad+=1
print('ALL PASS' if not bad else f'{bad} failing pairs')
