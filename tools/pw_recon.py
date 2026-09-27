"""Recon-then-act pass over the served copy of index.html (Playwright, headless Chromium).

Pass 1 (this file): discovery only.
  - fresh profile, no service-worker interference expected on first load
  - dump visible screens, clickable elements, inputs
  - check the pinned surface contracts (#codePanel / #scCode / Feedback row)
  - capture console + page errors and a title-screen screenshot
A second script (pw_walk.py) will walk the critical loop title -> game -> pause -> back
using the selectors discovered here.
"""

import json
import sys
from playwright.sync_api import sync_playwright

from pw_lib import Serve

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PORT = 8931
URL = "http://127.0.0.1:%d/index.html" % PORT
SHOT = sys.argv[1] if len(sys.argv) > 1 else "docs/pw/pw-recon-title.png"

VIS_JS = """() => {
  const vis = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return (r.width > 0 && r.height > 0);
  };
  const screens = [...document.querySelectorAll('section[id], div[id^="sc"], [data-screen]')].map((el) => ({
    id: el.id || el.getAttribute('data-screen'), tag: el.tagName,
    visible: vis(el), cls: String(el.className || '').slice(0, 60),
  })).filter((s) => s.id);
  const clickables = [...document.querySelectorAll('button, [data-act], [role="button"]')].map((el) => ({
    tag: el.tagName, id: el.id || null, act: el.getAttribute('data-act'),
    text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 50),
    visible: vis(el),
  }));
  const inputs = [...document.querySelectorAll('input, select, textarea')].map((el) => ({
    tag: el.tagName, id: el.id || null, type: el.type || '', visible: vis(el),
    value: String(el.value || '').slice(0, 30),
  }));
  const one = (id) => {
    const el = document.getElementById(id);
    if (!el) return 'missing';
    return vis(el) ? 'visible' : 'hidden';
  };
  const navRing = [...document.querySelectorAll('[data-act]')]
    .map((el) => el.getAttribute('data-act'))
    .filter((a, i, arr) => arr.indexOf(a) === i);
  return {
    title: document.title,
    url: location.href,
    swControlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    screens, clickables: clickables.slice(0, 100), inputs: inputs.slice(0, 30),
    navActs: navRing.slice(0, 60),
    contracts: {
      scTitle: one('scTitle'),
      scCode: one('scCode'),
      codePanel: one('codePanel'),
      scCodeRowVisible: one('scCode') ,
    },
  };
}"""

# Serve like the other keepers: recon used to hit 8931 without starting a server,
# so it only passed while some other process happened to be listening there.
with Serve(PORT), sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()
    page = ctx.new_page()
    console = []
    page.on("console", lambda m: console.append((m.type, m.text[:240])))
    page.on("pageerror", lambda e: console.append(("PAGEERROR", str(e)[:400])))
    page.add_init_script("window.confirm = () => true;")  # native confirm() blocks automation
    page.goto(URL, wait_until="load")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1200)

    info = page.evaluate(VIS_JS)
    print(json.dumps(info, indent=1, ensure_ascii=False))
    print("--- CONSOLE (%d entries) ---" % len(console))
    seen = set()
    for kind, txt in console:
        key = kind + "|" + txt[:80]
        if key in seen:
            continue
        seen.add(key)
        print(kind, "|", txt)
    page.screenshot(path=SHOT)
    print("screenshot:", SHOT)
    browser.close()
