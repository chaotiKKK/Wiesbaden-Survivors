"""Live evidence for the Veedel item families.

Starts a real run, gives the player two of the new Kurpark items, forces the
production shop generator to show at least one new Kurpark card, buys the
focus offer through ShopSystem.buy(), and captures the shop + item codex.

Run:
  eval "$(bash tools/setup-browser.sh --env)"
  "$HOME/pwenv/bin/python" tools/_veedel-evidence.py
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_DIR = os.path.join(ROOT, "docs", "pw", "veedel-families")
PORT = 8981
BASE = "http://127.0.0.1:%d/index.html?qa=1" % PORT
NEW_IDS = [
    "schlauchrolle", "kastanienblatt", "fahrradkette", "loetkolben",
    "schaufenster", "atemschutz", "loeschdecke", "taubenpaar", "lichtung",
    "stroemung", "faehrmannstueck", "messsonde", "kuehlkreislauf",
    "marktschreier", "hydrant", "kurmusik", "promenade", "pruefstand",
    "uhrturm", "wachbuch", "parkbank", "rheinbruecke", "reaktorhandschuh",
    "goldener_adler",
]

SETUP_JS = """() => {
  Game.coop = false; Game.daily = false; Game.endless = false;
  Game.manualSeed = 0x51ee; Game.sel = ['leonidas']; Game.danger = 0;
  Game.state = 'title'; Game.mods = [];
  Game.startRun();
  const p = Game.players[0];
  p.items = []; p.itemCounts = {}; p.evolutions = []; p.relics = []; p.buffs = [];
  p.weapons.length = 0; p.recalc();
  /* Two of the newly added Kurpark items: the focus comes from real inventory. */
  p.addItem(ITEM_BY_ID['kastanienblatt']); p.addItem(ITEM_BY_ID['parkbank']);
  Game.materials = 9999;
  const newIds = %s;
  /* Reach the shop through the production wave-end path, not UI.show(). */
  p.pendingLevels = 0; Game.levelQueue = []; Game.relicQueue = [];
  Game.wave = 5; Game.waveEnding = false; Game.wager = null; Game.waveEvent = null;
  Game.state = 'play';
  Game.endWave();
  const natural = { cur: UI.cur, state: Game.state };
  let attempts = 0;
  for (; attempts < 60; attempts++) {
    const focus = p.focusFamily();
    const hasNewFocus = ShopSystem.offers.some(o => o.kind === 'item' &&
      ITEM_FAMILY_BY_ID[o.id] && ITEM_FAMILY_BY_ID[o.id].id === focus &&
      newIds.indexOf(o.id) >= 0);
    if (hasNewFocus) break;
    ShopSystem.generate(5, Game.players);
  }
  Game.state = 'shop';
  UI.show('scShop'); UI.renderShop();
  const focus = p.focusFamily();
  const offers = ShopSystem.offers.map(o => ({
    kind: o.kind, id: o.id,
    fam: o.kind === 'item' && ITEM_FAMILY_BY_ID[o.id] ? ITEM_FAMILY_BY_ID[o.id].id : null,
    name: o.kind === 'item' && ITEM_BY_ID[o.id] ? ITEM_BY_ID[o.id].name : o.id,
    price: o.price
  }));
  return {
    screen: UI.cur, focus: focus, attempts: attempts, natural: natural,
    counts: p.familyCounts(),
    items: p.items.slice(),
    offers: offers,
    focusOffer: offers.find(o => o.fam === focus),
    shopText: document.getElementById('shopItems').innerText,
    invText: document.getElementById('invItems').innerText,
    hint: document.getElementById('shopItems').innerText.indexOf('Veedel-Fokus') >= 0,
    tag: document.getElementById('shopItems').innerText.indexOf('Kurpark') >= 0,
    invFamily: document.getElementById('invItems').innerText.indexOf('Veedel:') >= 0,
    invFocus: document.getElementById('invItems').innerText.indexOf('Fokus:') >= 0
  };
}""" % json.dumps(NEW_IDS)

BUY_JS = """() => {
  const p = Game.players[0];
  const focus = p.focusFamily();
  const idx = ShopSystem.offers.findIndex(o => o.kind === 'item' &&
    ITEM_FAMILY_BY_ID[o.id] && ITEM_FAMILY_BY_ID[o.id].id === focus);
  const offer = ShopSystem.offers[idx];
  const it = ITEM_BY_ID[offer.id];
  const key = Object.keys(it.stats)[0];
  const before = p.st[key] || 0;
  ShopSystem.buy(idx, p);
  Game.state = 'shop';
  UI.show('scShop'); UI.renderShop();
  return {
    bought: offer.id, name: it.name, price: offer.price,
    stat: key, before: before, after: p.st[key] || 0,
    items: p.items.slice(), counts: p.familyCounts(),
    focus: p.focusFamily(),
    shopText: document.getElementById('shopItems').innerText,
    invText: document.getElementById('invItems').innerText
  };
}"""

CODEX_JS = """() => {
  UI.codexTab = 'items';
  UI.renderCodex(); UI.show('scCodex'); UI.renderCodex();
  /* 100% is a deliberate evidence zoom: auto would shrink this dense list to
     58% on a 900px viewport. The real default remains Save.data.opts.uiScale. */
  Save.data.opts.uiScale = '1'; UI.fit();
  const list = document.getElementById('codexList');
  return {
    screen: UI.cur,
    text: list.innerText,
    families: ITEM_FAMILIES.map(f => ({
      id: f.id, name: f.name,
      count: ITEMS.filter(it => ITEM_FAMILY_BY_ID[it.id] &&
        ITEM_FAMILY_BY_ID[it.id].id === f.id).length
    }))
  };
}"""


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    console_errors = []
    evidence = {"date": "2026-11-09", "url": BASE, "new_ids": NEW_IDS}
    with Serve(PORT, ROOT), sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        page = new_page(browser, BASE, console_errors=console_errors)
        page.set_viewport_size({"width": 1440, "height": 900})
        ok, boot = wait_until(
            page,
            "() => typeof Game === 'object' && typeof ShopSystem === 'object' && Array.isArray(ITEM_FAMILIES)",
            lambda v: v is True,
            timeout_s=15,
        )
        if not ok:
            raise SystemExit("engine did not boot: %r" % (boot,))

        # Dismiss the studio splash (#intro, z-200). Any pointer gesture does
        # it; until then it is the only thing in a screenshot.
        if page.locator("#intro").count():
            page.locator("#intro").click(force=True)
        ok_intro, intro = wait_until(
            page,
            "() => { const i = document.getElementById('intro'); return !i || getComputedStyle(i).visibility === 'hidden' || getComputedStyle(i).display === 'none'; }",
            lambda v: v is True,
            timeout_s=5,
        )
        if not ok_intro:
            raise SystemExit("splash did not dismiss: %r" % (intro,))

        # The dismissed #intro starts Sebbo's saw intro (#sawfx, z-70): a
        # full-viewport canvas that paints over every screen for ~11 s. Hide it
        # and neutralise the intro hook; it is unrelated to the shop evidence.
        page.evaluate("""() => {
          const saw = document.getElementById('sawfx');
          if (saw) { saw.classList.remove('on'); saw.style.display = 'none'; }
          Game.sebboIntro = function (done) { if (done) done(); };
        }""")
        shop = page.evaluate(SETUP_JS)
        # Readable shop: auto-fit would shrink the full shop to 58% at 1440x900.
        page.evaluate("() => { Save.data.opts.uiScale = '1'; UI.fit(); }")
        page.wait_for_timeout(350)
        page.wait_for_timeout(300)
        shop_png = os.path.join(OUT_DIR, "shop-focus.png")
        page.screenshot(path=shop_png, full_page=False)
        evidence["shop"] = shop
        evidence["shop"]["screenshot"] = "docs/pw/veedel-families/shop-focus.png"

        buy = page.evaluate(BUY_JS)
        page.wait_for_timeout(300)
        buy_png = os.path.join(OUT_DIR, "shop-after-buy.png")
        page.screenshot(path=buy_png, full_page=False)
        evidence["purchase"] = buy
        evidence["purchase"]["screenshot"] = "docs/pw/veedel-families/shop-after-buy.png"

        codex = page.evaluate(CODEX_JS)
        page.wait_for_timeout(300)
        codex_png = os.path.join(OUT_DIR, "codex-families.png")
        page.screenshot(path=codex_png, full_page=False)
        evidence["codex"] = codex
        evidence["codex"]["screenshot"] = "docs/pw/veedel-families/codex-families.png"

        evidence["consoleErrors"] = console_errors
        evidence["catalog"] = page.evaluate("""() => ({
          items: ITEMS.length,
          families: ITEM_FAMILIES.map(f => ({
            id: f.id, name: f.name, col: f.col,
            count: ITEMS.filter(it => ITEM_FAMILY_BY_ID[it.id] &&
              ITEM_FAMILY_BY_ID[it.id].id === f.id).length
          })),
          newItems: %s.map(id => {
            const it = ITEM_BY_ID[id], fam = ITEM_FAMILY_BY_ID[id];
            return it ? { id: id, name: it.name, price: it.price, r: it.r,
              family: fam ? fam.id : null, stats: it.stats } : { id: id, missing: true };
          })
        })""" % json.dumps(NEW_IDS))

        # Basic screen sanity: the shop/codex screens must actually be on screen.
        saw_state = page.evaluate("() => { const e = document.getElementById('sawfx'); return !e || getComputedStyle(e).display === 'none' || !e.classList.contains('on'); }")
        evidence["checks"] = {
            "sawfxOff": bool(saw_state),
            "naturalEndWave": bool(shop.get("natural") and shop["natural"].get("cur") == "scShop" and shop["natural"].get("state") == "shop"),
            "shopScreen": shop.get("screen") == "scShop",
            "focus": shop.get("focus") == "kurpark",
            "focusOffer": bool(shop.get("focusOffer")),
            "focusOfferIsNew": bool(shop.get("focusOffer") and shop["focusOffer"]["id"] in NEW_IDS),
            "hint": bool(shop.get("hint")),
            "tag": bool(shop.get("tag")),
            "invFamily": bool(shop.get("invFamily")),
            "purchase": bool(buy.get("bought") and buy.get("after") != buy.get("before")),
            "codexScreen": codex.get("screen") == "scCodex",
            "codexFamilies": all(f["name"] in codex.get("text", "") for f in codex.get("families", [])),
            "consoleClean": not console_errors,
        }
        browser.close()

    with open(os.path.join(OUT_DIR, "evidence.json"), "w", encoding="utf-8") as fh:
        json.dump(evidence, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print(json.dumps(evidence["checks"], ensure_ascii=False, indent=2))
    print("shop focus:", shop["focus"], "offers:", len(shop["offers"]),
          "focus offer:", shop["focusOffer"], "attempts:", shop["attempts"])
    print("purchase:", {k: buy[k] for k in ("name", "price", "stat", "before", "after")})
    print("console errors:", len(console_errors))
    print("wrote:", OUT_DIR)
    if not all(evidence["checks"].values()):
        raise SystemExit("evidence checks failed")


if __name__ == "__main__":
    main()
