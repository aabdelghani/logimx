#!/usr/bin/env python3
"""Walks NotLogi's pages, panels and dialogs over the DevTools port and saves a screenshot of each,
in the light and dark themes, so a refactor can be compared against a baseline.

  python3 walk.py OUT_DIR            (NotLogi running with --remote-debugging-port=9333)
  python3 walk.py --diff BASE NEW    (per-image share of changed pixels)
"""
import base64, json, os, sys, time, urllib.request
import websocket

PORT = 9333
MOUSE, KEYBOARD = 'b034', 'b378'

def connect():
    pages = json.load(urllib.request.urlopen(f'http://localhost:{PORT}/json'))
    url = [p for p in pages if p['type'] == 'page' and 'index.html' in p['url']][0]['webSocketDebuggerUrl']
    return websocket.create_connection(url, suppress_origin=True)

class Page:
    def __init__(self):
        self.ws, self.n = connect(), 0
    def call(self, m, **p):
        self.n += 1
        self.ws.send(json.dumps({'id': self.n, 'method': m, 'params': p}))
        while True:
            r = json.loads(self.ws.recv())
            if r.get('id') == self.n:
                return r.get('result', {})
    def js(self, expr):
        r = self.call('Runtime.evaluate', expression=expr, returnByValue=True, awaitPromise=True)
        return r.get('result', {}).get('value')
    def click(self, sel, wait=0.9):
        # a dispatched click, so SVG hotspots (no .click()) work too
        ok = self.js(f"(()=>{{const e=document.querySelector({json.dumps(sel)});if(!e)return false;e.dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));return true}})()")
        time.sleep(wait)
        return ok
    def shot(self, path):
        d = self.call('Page.captureScreenshot', format='png')['data']
        open(path, 'wb').write(base64.b64decode(d))

def home(p):
    p.js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); time.sleep(.3)
    p.js("document.body.click()"); time.sleep(.5)   # closes an open menu (and lets the redraw land)
    for _ in range(4):
        if not p.click('[data-act=go-home]', .6): break

# through the app's own theme menu (it saves the choice; the walk puts the first one back at the end)
THEMES = ('ubuntu', 'ubuntu-dark')
def set_theme(p, k):
    home(p)
    p.click('[data-act=menu-theme]', .4)
    p.click(f'[data-act=theme][data-key="{k}"]', .6)

# each step: (name, [selectors to click in order]) starting from Home
STEPS = [
    ('home', []),
    ('mouse-buttons', [f'[data-act=home-open][data-key={MOUSE}]']),
    ('mouse-button-panel', [f'[data-act=home-open][data-key={MOUSE}]', '.hotspot.ms[data-cid="195"]']),
    ('ring-settings', [f'[data-act=home-open][data-key={MOUSE}]', '.hotspot.ms[data-cid="195"]', '[data-act=ring-config]']),
    ('ring-folder', [f'[data-act=home-open][data-key={MOUSE}]', '.hotspot.ms[data-cid="195"]', '[data-act=ring-config]', '.rs-chip.folder']),
    ('mouse-pointer', [f'[data-act=home-open][data-key={MOUSE}]', f'[data-act=home-page][data-key={MOUSE}][data-page=pointer]']),
    ('mouse-easy', [f'[data-act=home-open][data-key={MOUSE}]', f'[data-act=home-page][data-key={MOUSE}][data-page=easy]']),
    ('mouse-flow', [f'[data-act=home-open][data-key={MOUSE}]', f'[data-act=home-page][data-key={MOUSE}][data-page=flow]']),
    ('mouse-info', [f'[data-act=home-open][data-key={MOUSE}]', f'[data-act=home-page][data-key={MOUSE}][data-page=info]']),
    ('kb-keys', [f'[data-act=home-open][data-key={KEYBOARD}]']),
    ('kb-backlight', [f'[data-act=home-open][data-key={KEYBOARD}]', f'[data-act=home-page][data-key={KEYBOARD}][data-page=backlight]']),
    ('kb-easy', [f'[data-act=home-open][data-key={KEYBOARD}]', f'[data-act=home-page][data-key={KEYBOARD}][data-page=easy]']),
    ('kb-info', [f'[data-act=home-open][data-key={KEYBOARD}]', f'[data-act=home-page][data-key={KEYBOARD}][data-page=info]']),
    ('settings', ['[data-act=page][data-page=settings]']),
    ('menu-main', ['[data-act=menu-main]']),
    ('about', ['[data-act=menu-main]', '[data-act=page][data-page=about]']),
    ('notif', ['[data-act=menu-main]', '[data-act=page][data-page=notif]']),
    ('backup', ['[data-act=menu-main]', '[data-act=page][data-page=backup]']),
    ('apps', ['[data-act=menu-main]', '[data-act=page][data-page=apps]']),
    ('wish', ['[data-act=wish]']),
    ('report', ['[data-act=report]']),
    ('pair', ['[data-act=pair]']),
    ('theme-menu', ['[data-act=menu-theme]']),
]

def walk(out):
    os.makedirs(out, exist_ok=True)
    p = Page()
    theme0 = p.js("document.documentElement.getAttribute('data-theme')")
    missing = []
    for theme in THEMES:
        set_theme(p, theme)
        for name, clicks in STEPS:
            home(p)
            for sel in clicks:
                if not p.click(sel):
                    missing.append(f'{name}: {sel}')
                    break
            time.sleep(1.1)   # glides and pop-ins settle
            p.shot(os.path.join(out, f'{theme}-{name}.png'))
    set_theme(p, theme0)
    print(f'{len(STEPS) * 2} screenshots in {out}')
    for m in missing: print('not found:', m)

def diff(a, b):
    from PIL import Image, ImageChops
    bad = 0
    for f in sorted(os.listdir(a)):
        if not f.endswith('.png'): continue
        if not os.path.exists(os.path.join(b, f)): print(f'{f}: missing'); bad += 1; continue
        x, y = Image.open(os.path.join(a, f)).convert('RGB'), Image.open(os.path.join(b, f)).convert('RGB')
        if x.size != y.size: print(f'{f}: size {x.size} vs {y.size}'); bad += 1; continue
        d = ImageChops.difference(x, y).convert('L').point(lambda v: 255 if v > 24 else 0)
        share = sum(d.histogram()[255:]) / (x.size[0] * x.size[1])
        if share > 0.001: print(f'{f}: {share:.2%} changed'); bad += 1
    print('no differences' if not bad else f'{bad} differ')

if __name__ == '__main__':
    if sys.argv[1] == '--diff': diff(sys.argv[2], sys.argv[3])
    else: walk(sys.argv[1])
