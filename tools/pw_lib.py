"""Shared helpers for the keeper Playwright suites (pw_walk / pw_vol_probe / pw_abuse).

pytest-style fixture machinery is overkill here (four standalone scripts, no test
runner); this is the minimal shared core the skill's assertions/waiting guidance
maps onto Python sync API:

  - wait_until(page, js, want, ...): poll a page condition with deadline instead
    of fixed sleeps (fixed sleeps are the classic UI-flakiness cause)
  - serve(): in-process ThreadingHTTPServer (with_server.py leaked orphans here)
  - SCREEN/STATE JS: shared page-state probes so all suites read the same truth
"""

import functools
import sys
import threading
import time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


class Serve:
    """In-process static server; use as context manager."""

    def __init__(self, port, directory="."):
        self.port = port
        handler = functools.partial(SimpleHTTPRequestHandler, directory=directory)
        self.httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
        self.httpd.daemon_threads = True

    def __enter__(self):
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        return self

    def __exit__(self, *exc):
        self.httpd.shutdown()
        self.httpd.server_close()
        return False


def wait_until(page, js, want, name="condition", timeout_s=6.0, poll_s=0.1):
    """Poll a page-side JS expression until `want(value)` holds; return (ok, last).

    Replaces the fixed-sleep-after-click pattern: instead of assuming the UI
    settles in N ms, poll the actual condition up to a deadline.
    """
    deadline = time.time() + timeout_s
    last = None
    while True:
        try:
            last = page.evaluate(js)
            if want(last):
                return True, last
        except Exception:
            pass  # page mid-navigation or expression transiently invalid
        if time.time() >= deadline:
            return False, last
        time.sleep(poll_s)


def new_page(browser, url, console_errors=None, audio_reqs=None, confirm_stub=True):
    """Fresh context+page with the session's standard instrumentation."""
    ctx = browser.new_context()
    page = ctx.new_page()
    if console_errors is not None:
        page.on("console", lambda m: console_errors.append("console." + m.type + ": " + m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)[:200]))
    if audio_reqs is not None:
        page.on("request", lambda r: audio_reqs.append(r.url) if (r.url.endswith(".m4a") and "/audio/" in r.url) else None)
    if confirm_stub:
        page.add_init_script("window.confirm = () => true;")
    page.goto(url, wait_until="load")
    page.wait_for_load_state("networkidle")
    return page


SCREEN_JS = "() => { const s = document.querySelector('.screen:not(.hidden)'); return s ? s.id : '(none)'; }"
GAME_STATE_JS = "() => (typeof Game !== 'undefined' && Game.state) || 'n/a'"
OPT_MASTER_JS = "() => OPT().master"


def run_ui_hotkey_check(page):
    """Return True if typing 'ocexn' into the seed field stays on title (no hijack)."""
    page.evaluate("() => { UI.renderTitle(); UI.show('scTitle'); Game.state = 'title'; }")
    page.focus("#seedInput")
    page.keyboard.type("ocexn", delay=50)
    ok, st = wait_until(
        page,
        "() => ({ cur: UI.cur, val: document.getElementById('seedInput').value })",
        lambda v: isinstance(v, dict) and v.get("val") == "ocexn",
        name="seed text complete",
    )
    return ok and st and st.get("cur") == "scTitle"
