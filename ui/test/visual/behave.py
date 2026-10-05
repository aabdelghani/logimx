#!/usr/bin/env python3
"""Runs real commands through NotLogi's window (clicks over the DevTools port) and checks what the
agent saved. The agent's config file is copied first and put back at the end (then reloaded), so
the settings come back as they were. It does not use the agent's backups: those keep only the
newest 15, and test runs would push the real ones out.

  python3 behave.py        (NotLogi running with --remote-debugging-port=9333)
"""
import json, os, sys, time
from walk import Page, home, MOUSE

ok = True
def check(name, cond, detail=''):
    global ok
    ok &= bool(cond)
    print(('PASS ' if cond else 'FAIL ') + name + (f'  ({detail})' if detail and not cond else ''))

def main():
    p = Page()
    agent = lambda m, params=None: p.js(f"window.agent.call({json.dumps(m)}, {json.dumps(params or {})})")
    cfg = os.path.join(os.environ.get('XDG_CONFIG_HOME') or os.path.expanduser('~/.config'), 'logimx', 'config.json')
    saved = open(cfg, 'rb').read()
    saved_ui = p.js('window.agent.uiSettings()') or {}   # the window's own settings, put back the same way
    general = lambda: (agent('status') or {}).get('general', {})
    mouse = lambda: next(d for d in agent('devices') if d['id'] == MOUSE)
    try:
        # assigning an action from the panel beside the mouse
        home(p)
        p.click(f'[data-act=home-open][data-key={MOUSE}]')
        p.click('.hotspot.ms[data-cid="82"]')
        p.click('[data-act=pick-item][data-key=overview]', 1.2)
        prof = (mouse().get('config') or {}).get('profiles', {}).get('default', {})
        check('assign Overview to the middle button', (prof.get('buttons') or {}).get('82') == 'overview', prof.get('buttons'))
        check('the photo shows it', 'Activities / Overview' in (p.js("document.querySelector('#root').innerText") or ''))

        # a switch in Settings flips a window setting (kept by the main process), and flips it back
        home(p)
        p.click('[data-act=page][data-page=settings]')
        # what the switch shows is what a click turns the other way
        shown = lambda: p.js("document.querySelector('.switch[data-act=ui][data-key=updates]').classList.contains('on')")
        ui = lambda: (p.js('window.agent.uiSettings()') or {}).get('updates')
        before = shown()
        p.click('.switch[data-act=ui][data-key=updates]', 1.0)
        mid = ui()
        p.click('.switch[data-act=ui][data-key=updates]', 1.0)
        check('Settings switch saves', mid == (not before) and ui() == before, f'shown {before}, saved {mid}, then {ui()}')
        # a notification switch is a general (agent) setting
        p.click('.row[data-act=page][data-page=notif]')
        key = p.js("(()=>{const s=document.querySelector('.switch[data-act=general]');return s&&s.dataset.key})()")
        if key:
            g0 = general().get(key)
            p.click(f'.switch[data-act=general][data-key="{key}"]', 1.0); g1 = general().get(key)
            p.click(f'.switch[data-act=general][data-key="{key}"]', 1.0)
            on = lambda v: v is not False   # unset means on
            check(f'Notifications switch {key} saves', on(g1) != on(g0) and on(general().get(key)) == on(g0), f'{g0} -> {g1} -> {general().get(key)}')

        # renaming a ring folder from its page
        home(p)
        p.click(f'[data-act=home-open][data-key={MOUSE}]')
        p.click('.hotspot.ms[data-cid="195"]')
        p.click('[data-act=ring-config]')
        if p.click('.rs-chip.folder', 1.2):
            p.js("(()=>{const n=document.querySelector('.folder-name');n.focus();n.value='Window check';n.dispatchEvent(new Event('input'));n.dispatchEvent(new Event('change'))})()")
            time.sleep(1.2)
            check('rename a ring folder', 'Window check' in json.dumps(general().get('ring', {})))
            check('the name field shows it', p.js("(document.querySelector('.folder-name')||{}).value") == 'Window check')
            # typing survives the redraws background events cause (battery, device state, ...)
            p.js("(()=>{const n=document.querySelector('.folder-name');n.focus();window.__redraws=0;new MutationObserver(()=>window.__redraws++).observe(document.querySelector('#root'),{childList:true})})()")
            time.sleep(.3)   # focusing selects the name (to type over it); type at its end instead
            p.js("(()=>{const n=document.querySelector('.folder-name');n.setSelectionRange(n.value.length,n.value.length)})()")
            p.call('Input.insertText', text=' typed')
            # device events from the agent redraw the window: the middle button saved again as it
            # is sends one, twice
            mid = ((mouse().get('config') or {}).get('profiles', {}).get('default', {}).get('buttons') or {}).get('82', 'native')
            for _ in range(2):
                agent('set_assignment', {'id': MOUSE, 'profile': 'default', 'section': 'buttons', 'control': '82', 'action': mid})
                time.sleep(1.2)
            st = p.js("({v:(document.querySelector('.folder-name')||{}).value, f:document.activeElement&&document.activeElement.classList.contains('folder-name'), r:window.__redraws})")
            check('typing survives redraws', st and st['v'] == 'Window check typed' and st['f'], st)
            check('the window was redrawn meanwhile', st and st['r'] >= 1, st)
            p.js("document.querySelector('.folder-name').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); time.sleep(.5)
            # back to the ring with the arrow in the middle
            p.click('.rs-hub.back', 1.0)
            check('back from the folder', not p.js("!!document.querySelector('.folder-name')"))
        else:
            check('a folder on the ring', False)

        # the ring's profiles: picking another one in the bar makes it the one in use
        n = len(general().get('ring', {}).get('profiles', []))
        if n > 1:
            act0 = general()['ring'].get('active', 0)
            other = 0 if act0 else 1
            pid = general()['ring']['profiles'][other]['id']
            picked = p.click(f'[data-act=rp-use][data-key="{pid}"]', 1.0)
            check('switch the ring profile', picked and general()['ring'].get('active') == other, f"active {general()['ring'].get('active')}")
        # dialogs open and Esc closes them
        home(p)
        p.click('[data-act=wish]')
        opened = p.js("!!document.querySelector('textarea[data-field=wish]')")
        p.js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); time.sleep(.5)
        check('wish dialog opens and Esc closes it', opened and not p.js("!!document.querySelector('textarea[data-field=wish]')"))
    finally:
        with open(cfg, 'wb') as f: f.write(saved)
        agent('reload')                          # the agent reads it again (no backup made)
        p.js(f'window.agent.uiSettings({json.dumps(saved_ui)})')
        p.js('window.agent.generalChanged()')   # and the main process
        print('settings put back' if open(cfg, 'rb').read() == saved else 'SETTINGS DIFFER after putting them back')
        p.js('location.reload()')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
