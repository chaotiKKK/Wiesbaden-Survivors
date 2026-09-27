"""Throwaway: dump FAIL rows of the ?selftest panel (LUFS debugging)."""
import sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, "tools")
from pw_lib import Serve, new_page

PORT = 8951

with Serve(PORT):
    with sync_playwright() as p:
        pg = new_page(p.chromium.launch(headless=True), "http://127.0.0.1:%d/index.html?selftest&pw=lufsdbg" % PORT)
        pg.wait_for_selector("#selfTestPanel", timeout=30000)
        pg.wait_for_timeout(6000)
        rows = pg.evaluate("""() => Array.from(document.querySelectorAll('#selfTestPanel div'))
            .map(d => d.textContent.trim())""")
        fails = [r for r in rows if r.startswith('✘')]
        lufs = [r for r in rows if 'LUFS' in r]
        print("TOTAL ROWS:", len(rows))
        for r in lufs: print(" •", r)
        print("FAILS:", len(fails))
        for r in fails: print(" ✘", r)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.context.browser.close()
