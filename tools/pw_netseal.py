"""End-to-end probe for the sealed co-op signaling (NetSeal / wbns2).

Two headless browser contexts connect as host and guest over the REAL public
MQTT broker the game uses, while a third page listens as an eavesdropper on the
broker. It subscribes ONLY to this test session's own topics (never a wildcard,
so no other player's traffic is touched):
  - wbns2/<tag>/c2h|h2c   the sealed topics this session actually uses
  - wbns/<CODE>/c2h|h2c   the old plaintext topics, which must now stay silent

Checks: the pair really connects; the eavesdropper sees traffic but no room
code, no IP address and no ICE candidate; even an eavesdropper who KNOWS the
code opens only envelopes, never the SDP; and the SDP that stays in the
browsers does contain IPs, so the "nothing leaked" result means something.

Needs internet + a reachable public broker, so it is a probe, not a gate leg.
WebRTC mDNS masking is switched off on purpose: the SDP then carries literal
local IPs, which makes the leak check stricter than real-world Chrome.
"""
import re
import sys
import time

from playwright.sync_api import sync_playwright

from pw_lib import Serve

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PORT = 8945
URL = "http://127.0.0.1:%d/index.html" % PORT
IP = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")
results = []


def check(ok, name, detail=""):
    results.append(bool(ok))
    print("%s | %s%s" % ("PASS" if ok else "FAIL", name, (" - " + detail) if detail else ""))


OBSERVE_JS = r"""async ([broker, topics]) => {
  window.__cap = [];
  const ws = new WebSocket(broker, 'mqtt');
  ws.binaryType = 'arraybuffer';
  let buf = new Uint8Array(0), acks = 0;
  const td = new TextDecoder();
  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('observer: no SUBACK')), 12000);
    ws.onopen = () => ws.send(MqttWire.connect('wbnsobs' + Math.random().toString(36).slice(2, 8)));
    ws.onmessage = (ev) => {
      const c = new Uint8Array(ev.data), m = new Uint8Array(buf.length + c.length);
      m.set(buf); m.set(c, buf.length);
      let i = 0;
      while (i < m.length) {
        const rl = MqttWire.readVarint(m, i + 1);
        if (!rl || rl.next + rl.val > m.length) break;
        const type = m[i] >> 4, body = m.subarray(rl.next, rl.next + rl.val);
        if (type === 2) for (const t of topics) ws.send(MqttWire.subscribe(t));
        else if (type === 9 && ++acks === topics.length) { clearTimeout(to); res(); }
        else if (type === 3) {
          const tl = (body[0] << 8) | body[1];
          window.__cap.push({ topic: td.decode(body.subarray(2, 2 + tl)), payload: td.decode(body.subarray(2 + tl)) });
        }
        i = rl.next + rl.val;
      }
      buf = m.subarray(i);
    };
  });
  window.__obsWs = ws;
  return acks;
}"""

STATE_JS = "() => ({ phase: Net.phase, status: Net.status, role: Net.role, coop: !!Game.coop })"


def wait_phase(page, want, secs):
    t0 = time.time()
    while time.time() - t0 < secs:
        st = page.evaluate(STATE_JS)
        if st["phase"] == want:
            return st
        if st["phase"] == "error":
            return st
        time.sleep(0.25)
    return page.evaluate(STATE_JS)


with Serve(PORT), sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--disable-features=WebRtcHideLocalIpsWithMdns"])
    errors = []
    pages = {}
    for name in ("host", "guest", "observer"):
        ctx = browser.new_context()
        pg = ctx.new_page()
        pg.on("pageerror", lambda e, n=name: errors.append("%s: %s" % (n, str(e)[:200])))
        pg.add_init_script("window.confirm = () => true;")
        pg.goto(URL, wait_until="load")
        pages[name] = pg
    host, guest, obs = pages["host"], pages["guest"], pages["observer"]

    host.evaluate("() => { Net.hostRoom(); }")
    t0 = time.time()
    while time.time() - t0 < 25:
        st = host.evaluate(STATE_JS)
        if st["status"].startswith("Raum offen") or st["phase"] == "error":
            break
        time.sleep(0.25)
    st = host.evaluate(STATE_JS)
    check(st["status"].startswith("Raum offen"), "host opens a sealed room", st["status"])
    info = host.evaluate("() => ({ code: Net.code, tag: Net.room && Net.room.tag, broker: NET_BROKERS[Net.wsIdx] })")
    code, tag, broker = info["code"], info["tag"], info["broker"]
    print("    session: code=%s tag=%s... broker=%s" % (code, (tag or "")[:8], broker))

    topics = ["wbns2/%s/c2h" % tag, "wbns2/%s/h2c" % tag, "wbns/%s/c2h" % code, "wbns/%s/h2c" % code]
    acks = obs.evaluate(OBSERVE_JS, [broker, topics])
    check(acks == 4, "eavesdropper subscribed to this session's sealed + legacy topics only", "%d SUBACKs" % acks)

    guest.evaluate("(c) => { Net.joinRoom(c); }", code)
    hs = wait_phase(host, "connected", 45)
    gs = wait_phase(guest, "connected", 15)
    check(hs["phase"] == "connected" and gs["phase"] == "connected", "host and guest really connect over the broker",
          "host=%s guest=%s" % (hs["status"], gs["status"]))
    check(hs["coop"], "host switched into co-op (guest is player 2)")

    time.sleep(1.0)
    cap = obs.evaluate("() => window.__cap")
    sealed = [m for m in cap if m["topic"].startswith("wbns2/")]
    legacy = [m for m in cap if m["topic"].startswith("wbns/")]
    check(len(sealed) >= 3, "eavesdropper saw the handshake traffic", "%d sealed messages" % len(sealed))
    check(len(legacy) == 0, "old plaintext topics stay silent", "%d messages" % len(legacy))

    wire = " ".join(m["topic"] + " " + m["payload"] for m in cap)
    check(code not in wire, "room code never appears on the broker")
    check(not IP.search(wire), "no IP address appears on the broker")
    check("candidate" not in wire and "v=0" not in wire, "no SDP / ICE candidate appears on the broker")

    opened = obs.evaluate(r"""async (code) => {
      const room = await NetSeal.room(code), out = [];
      for (const m of window.__cap) if (m.topic.startsWith('wbns2/')) {
        const dir = m.topic.split('/')[2];
        out.push(JSON.stringify(await NetSeal.open(room.key, m.payload, dir)));
      }
      return out;
    }""", code)
    kinds = sorted(set(re.findall(r'"t":"(\w+)"', " ".join(opened))))
    check(kinds == ["answer", "hello", "offer"], "an eavesdropper who KNOWS the code opens hello/offer/answer envelopes",
          ",".join(kinds))
    joined = " ".join(opened)
    check(not IP.search(joined) and "candidate" not in joined,
          "...but still sees no IP: the SDP stays inside the ECDH box")

    local = host.evaluate("() => Net.pc.localDescription.sdp") or ""
    check("candidate" in local and bool(IP.search(local)),
          "control: the SDP kept in the browser DOES contain IPs (so the result above is meaningful)",
          "%d candidate lines" % local.count("a=candidate"))

    obs.evaluate("() => window.__obsWs && window.__obsWs.close()")
    host.evaluate("() => Net.hangUp()")
    guest.evaluate("() => Net.hangUp()")
    check(not errors, "zero page errors across host, guest and eavesdropper", "; ".join(errors))
    browser.close()

print("\n%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)