# Standalone Node Data-Regression (tools/data-regression.mjs) — 2026-09-04

**Purpose.** BalanceSim and the in-page `?selftest` validate data only inside a
browser (~10 s gate). A balance/data edit to `data.js` therefore went unchecked
until the browser ran. The new suite imports `data.js` directly in Node and
asserts the *engine-consumed* table contracts in <100 ms:

    node tools/data-regression.mjs              # 19/19 PASS, exit 0
    node tools/data-regression.mjs --data <pfad>   # Fremdkopie pruefen

Dependency-free (plain Node ≥ 18, no npm install). The `--data` override
enables checking a scratch copy without touching the workspace file.

**What it asserts (each names its engine consumer):**
1. All 19 named exports resolve; core tables non-empty; `Data.validate()` clean
   over the data.js-registered tables. (Engine-side registries — quotes,
   classBonus, vox, groundTextures, attachments, runes, relics, pets — still
   live in index.html and remain covered by the in-page selftest Data group.)
2. Every `CHARS.startWeapon` exists **and** has ≥ 4 tier rows — the schema only
   requires ≥ 1 tier, but `BalanceSim` maps tiers `[0,1,2,3]` and `tierData()`
   (index.html:3874) clamps to index 3, so a 1–3-tier weapon silently reads
   `undefined`. All 42 weapons must have ≥ 4 tiers for the same reason.
3. Tier rows carry the full `tierData()` layout `[dmg, as, range, critC, critM,
   price, x]` with dmg>0 and as>0; tier damage strictly rises (else the
   r2/r3/r4 dev-rows of the Voll-Simulation invert).
4. Weapon `cls` tags are real `CLASS_BONUS` classes and `type` is a real
   combat type; enemy `ai` values are real Enemy-switch cases (vocabulary lists
   mirrored from index.html and commented as change-together).
5. Every enemy has an `ENEMY_VOX` entry (read from index.html at runtime, so a
   new enemy without a voice entry fails); boss phases start at 1.0 and fall
   strictly; item rarity stays inside the 4 `RARITY_NAME` bounds.
6. `DANGERS` levels are contiguous `0..8` (engine indexes `DANGERS[danger]`)
   and each tuning column (hp/dmg/spd/cnt/price) strictly rises with level —
   higher danger must be harder for `BalanceSim.simulateRun` and wave scaling.

**Negative proof (suite actually catches edits).** A mutated temp copy cut
`pistol` to 3 tiers and flattened danger n=3 hp to n=2's value:
`Data.validate()` still reported 0 errors (schemas can't see either defect),
but the suite FAILed 3 checks (both tier assertions + the danger monotonicity)
and exited 1 — precisely the gap the schema leaves open. Temp copy removed
after the proof; workspace `data.js` untouched.

**Current state:** 19/19 PASS on the workspace file, exit 0. No engine or
data.js change this pass — only the kept suite + this record. `index.html`
flag `H`, gate state untouched (browser legs still cover engine-side tables).
