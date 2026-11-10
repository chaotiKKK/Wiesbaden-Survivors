"""Item-Recycling live proof: real Chromium, real menu start, real shop UI.

Run: eval "$(bash tools/setup-browser.sh --env)"
     "$HOME/pwenv/bin/python" tools/_item-recycle-live.py
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

PORT = 8981
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=itemrecycle" % PORT
OUT = Path("docs/pw/item-recycle-live.json")
SHOT = Path("docs/pw/item-recycle-shop.png")


def dismiss_to_shop(page):
    """Click through level/relic screens if wave-end produced one."""
    for _ in range(20):
        cur = page.evaluate("() => UI.cur")
        if cur == "scShop":
            return True
        if cur == "scLevel":
            page.click("#lvlCards .lvlCard")
        elif cur == "scRelic":
            page.click("#relicCards .lvlCard")
        else:
            page.wait_for_timeout(100)
    return page.evaluate("() => UI.cur") == "scShop"


def set_offer(page, item_id):
    return page.evaluate("""(id) => {
      const P = Game.players[0];
      P.items = []; P.itemCounts = {}; P.curse = 0; P.turrets = []; P.recalc();
      Game.materials = 500;
      const price = ShopSystem.priceOf('item', id, 0, Game.wave);
      ShopSystem.offers = [{ kind: 'item', id: id, price: price }];
      ShopSystem.bought = {}; ShopSystem.locked = {}; ShopSystem.upgrades = [];
      ShopSystem.fusionSel = []; ShopSystem.attachTarget = -1;
      UI.shopPlayer = 0; UI.renderShop();
      return {
        id: id, price: price, baselineMat: Game.materials,
        speed: P.st.speed, atkSpd: P.st.atkSpd, maxHp: P.maxHp, curse: P.curse,
        turrets: P.turrets.length, items: P.items.length, row: !!document.querySelector('[data-sell-item="' + id + '"]')
      };
    }""", item_id)


def buy(page):
    page.click("#shopItems [data-buy]")
    ok, _ = wait_until(page, "() => Game.players[0].items.length", lambda n: n == 1, timeout_s=3)
    if not ok:
        raise AssertionError("shop buy did not add an item")
    page.wait_for_timeout(80)
    return page.evaluate("""() => {
      const P = Game.players[0];
      return {
        mat: Game.materials, speed: P.st.speed, atkSpd: P.st.atkSpd, maxHp: P.maxHp,
        curse: P.curse, turrets: P.turrets.length, items: P.items.length,
        counts: Object.assign({}, P.itemCounts),
        row: !!document.querySelector('[data-sell-item="' + P.items[0] + '"]'),
        rowText: document.querySelector('[data-sell-item="' + P.items[0] + '"]') ?
          document.querySelector('[data-sell-item="' + P.items[0] + '"]').textContent.trim() : null,
        toast: (document.querySelector('#toasts') || {}).textContent || ''
      };
    }""")


def sell(page, item_id):
    before = page.evaluate("() => Game.materials")
    page.click('[data-sell-item="%s"]' % item_id)
    ok, _ = wait_until(page, "() => Game.players[0].items.length", lambda n: n == 0, timeout_s=3)
    if not ok:
        raise AssertionError("recycle did not remove the item")
    page.wait_for_timeout(80)
    out = page.evaluate("""(id) => {
      const P = Game.players[0];
      return {
        mat: Game.materials, speed: P.st.speed, atkSpd: P.st.atkSpd, maxHp: P.maxHp,
        curse: P.curse, turrets: P.turrets.length, items: P.items.length,
        counts: Object.assign({}, P.itemCounts),
        row: !!document.querySelector('[data-sell-item="' + id + '"]'),
        toast: (document.querySelector('#toasts') || {}).textContent || ''
      };
    }""", item_id)
    out["beforeMat"] = before
    out["refund"] = out["mat"] - before
    return out


def main():
    errors = []
    result = {
        "test": "item-recycle-live",
        "when": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "rate": None,
        "buy": {},
        "sell": {},
        "curse": {},
        "turret": {},
        "price_matrix": [],
        "coop_menu": {},
        "next_wave": {},
        "console_errors": [],
        "screenshot": str(SHOT),
    }
    with Serve(PORT):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=[
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
            ])
            page = new_page(browser, BASE, console_errors=errors)
            page.evaluate("() => { localStorage.clear(); }")
            page.reload(wait_until="load")
            page.wait_for_load_state("networkidle")

            # Real menu entry: title -> play -> character -> controls -> start.
            page.click('[data-act="play"]')
            ok, last = wait_until(page, "() => UI.cur", lambda v: v == "scChar")
            if not ok:
                raise AssertionError("character screen did not open: %r" % (last,))
            page.click('[data-act="charConfirm"]')
            ok, last = wait_until(page, "() => UI.cur", lambda v: v == "scControls")
            if not ok:
                raise AssertionError("controls screen did not open: %r" % (last,))
            page.click('[data-act="controlsOK"]')
            ok, last = wait_until(page, "() => Game.state", lambda v: v == "play", timeout_s=5)
            if not ok:
                raise AssertionError("run did not start: %r" % (last,))

            # Force the real wave-end transition instead of waiting 20 seconds.
            page.evaluate("() => { Game.waveTimer = 0; Game.endWave(); }")
            if not dismiss_to_shop(page):
                raise AssertionError("shop did not open after wave end: %s" % page.evaluate("() => UI.cur"))

            # Warm-up: kaffee is a clean one-stat item; buy it through the real card.
            result["rate"] = page.evaluate("() => BROTATO_RULES.itemRecycleRate")
            base = set_offer(page, "kaffee")
            result["base"] = base
            buy_k = buy(page)
            result["buy"] = buy_k
            result["sell"] = sell(page, "kaffee")
            if result["sell"]["refund"] != result["base"]["price"] // 4:
                raise AssertionError("unexpected kaffee refund: %r" % (result["sell"],))
            if result["sell"]["speed"] != base["speed"] or result["sell"]["atkSpd"] != base["atkSpd"]:
                raise AssertionError("kaffee stats did not revert")
            if result["sell"]["mat"] >= base["baselineMat"]:
                raise AssertionError("buy/sell cycle made a profit")

            # Curse item: the item curse must leave with the item.
            c_base = set_offer(page, "c_gier")
            result["curse"]["base"] = c_base
            result["curse"]["buy"] = buy(page)
            result["curse"]["sell"] = sell(page, "c_gier")
            if result["curse"]["buy"]["curse"] != 5 or result["curse"]["sell"]["curse"] != 0:
                raise AssertionError("curse did not revert: %r" % (result["curse"],))

            # Turret item: the item-owned turret must be removed, not left free.
            t_base = set_offer(page, "drohne")
            result["turret"]["base"] = t_base
            result["turret"]["buy"] = buy(page)
            result["turret"]["sell"] = sell(page, "drohne")
            if result["turret"]["buy"]["turrets"] != 1 or result["turret"]["sell"]["turrets"] != 0:
                raise AssertionError("turret did not revert: %r" % (result["turret"],))

            # Screenshot with a live inventory row and the recycle action visible.
            page.evaluate("() => { const P=Game.players[0]; P.addItem(ITEM_BY_ID['kaffee']); UI.renderShop(); }")
            page.wait_for_timeout(100)
            SHOT.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(SHOT), full_page=True)
            page.evaluate("() => { const P=Game.players[0]; if (P.items.includes('kaffee')) ShopSystem.recycleItem(P,'kaffee'); }")

            # Price/refund matrix across rarities and waves.
            result["price_matrix"] = page.evaluate("""() => {
              const ids = ['kaffee', 'drohne', 'reaktor', 'kernspintomograph'];
              const waves = [1, 5, 10, 20];
              const out = [];
              const oldWave = Game.wave;
              for (const w of waves) {
                Game.wave = w;
                for (const id of ids) {
                  const price = ShopSystem.priceOf('item', id, 0, w);
                  const sell = ShopSystem.itemSellValue(id);
                  out.push({ wave: w, id: id, price: price, sell: sell,
                    ratio: +(sell / price).toFixed(4), lossPct: +((1 - sell / price) * 100).toFixed(2) });
                }
              }
              Game.wave = oldWave;
              return out;
            }""")
            if not all(r["sell"] < r["price"] and r["ratio"] >= .23 and r["ratio"] <= .26 for r in result["price_matrix"]):
                raise AssertionError("price matrix violates the 25% no-profit contract")

            # Co-op guest menu: both the action list and the host-side apply path.
            result["coop_menu"] = page.evaluate("""() => {
              const P = Game.players[0];
              const old = Game.players[1];
              P.addItem(ITEM_BY_ID['kaffee']);
              Game.players[1] = P;
              const menu = Net.buildMenu();
              const act = (menu.acts || []).find(a => a.id === 'isell:kaffee');
              const before = Game.materials;
              Net.applyPick('isell:kaffee');
              const after = Game.materials;
              P.sellItem('kaffee');
              if (old === undefined) Game.players.splice(1, 1); else Game.players[1] = old;
              return { found: !!act, label: act ? act.label : null, refund: after - before,
                removed: !P.items.includes('kaffee'), acts: (menu.acts || []).length };
            }""")
            if not result["coop_menu"]["found"] or not result["coop_menu"]["removed"]:
                raise AssertionError("co-op item recycle path missing: %r" % (result["coop_menu"],))

            # Close the loop: next wave starts and still runs with enemies.
            wave_before = page.evaluate("() => Game.wave")
            page.click('[data-act="nextWave"]')
            ok, last = wait_until(page, "() => Game.state", lambda v: v == "play", timeout_s=5)
            if not ok:
                raise AssertionError("next wave did not start: %r" % (last,))
            page.wait_for_timeout(1800)
            result["next_wave"] = page.evaluate("""() => ({
              state: Game.state, wave: Game.wave, enemies: Game.enemies.filter(e => !e.dead).length,
              playerAlive: Game.players[0].alive, materials: Game.materials
            })""")
            result["next_wave"]["before"] = wave_before
            if result["next_wave"]["wave"] != wave_before + 1 or result["next_wave"]["state"] != "play":
                raise AssertionError("wave progression regressed: %r" % (result["next_wave"],))
            if result["next_wave"]["enemies"] <= 0:
                raise AssertionError("next wave spawned no enemies: %r" % (result["next_wave"],))

            browser.close()
    result["console_errors"] = errors
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("rate", "buy", "sell", "curse", "turret", "price_matrix", "coop_menu", "next_wave", "console_errors")}, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit("console errors: %r" % errors)


if __name__ == "__main__":
    main()
