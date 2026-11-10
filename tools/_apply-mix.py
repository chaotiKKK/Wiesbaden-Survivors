import io, sys
P = "index.html"
src = io.open(P, encoding="utf-8", newline="").read()
orig = src
E = [
(
"  drawCritFx(ctx) {\n    const o = OPT();\n    if (o.critFx === false || this.quality() < 1) return;",
"  drawCritFx(ctx) {\n    const o = OPT();\n"
"    /* Kein Qualitaets-Gate: ein gecachter Verlauf plus ein fillRect kosten auch\n"
"       im Niedrig-Preset praktisch nichts, und gerade dort ist die Warnung\n"
"       wichtig. (Gemessen: Headless-Rendering fiel per Auto-Qualitaet auf 0 und\n"
"       die Vignette war bei 7 % Leben unsichtbar.) */\n"
"    if (o.critFx === false) return;"
),
(
"    this.musicGain.connect(this.musicFilter); this.musicFilter.connect(this.dangerFilter); this.dangerFilter.connect(this.pump); this.pump.connect(this.musicComp); this.musicComp.connect(this.duck); this.duck.connect(this.crowdDuck); this.crowdDuck.connect(this.master);",
"    /* Makeup nach dem Musik-Kompressor: die Mischung lag gemessen bei\n"
"       -19,9 LUFS, also ~4,9 LU unter dem Zielband -16...-14. Der Trim hebt den\n"
"       fertig komprimierten Musikbus an, statt die Vorstufe weiter in den\n"
"       Kompressor zu treiben; die SFX-Kette bleibt unberuehrt, und der\n"
"       Master-Limiter haelt den Peak (vorher -7,6 dBFS). */\n"
"    this.musicTrim = c.createGain(); this.musicTrim.gain.value = 1.75;\n"
"    this.musicGain.connect(this.musicFilter); this.musicFilter.connect(this.dangerFilter); this.dangerFilter.connect(this.pump); this.pump.connect(this.musicComp); this.musicComp.connect(this.musicTrim); this.musicTrim.connect(this.duck); this.duck.connect(this.crowdDuck); this.crowdDuck.connect(this.master);"
),
(
"    const keys = ['master', 'comp', 'presence', 'limiter', 'masterLimiter', 'sfxGain', 'musicComp', 'musicGain', 'duck', 'crowdDuck', 'musicFilter', 'pump', 'dangerFilter', 'reverbSend', 'reverb', 'reverbWet', 'echoIn'];",
"    const keys = ['master', 'comp', 'presence', 'limiter', 'masterLimiter', 'sfxGain', 'musicComp', 'musicGain', 'musicTrim', 'duck', 'crowdDuck', 'musicFilter', 'pump', 'dangerFilter', 'reverbSend', 'reverb', 'reverbWet', 'echoIn'];"
),
]
for old, new in E:
    n = src.count(old)
    assert n == 1, "anchor matched %d: %r" % (n, old[:70])
    src = src.replace(old, new, 1)
io.open(P, "w", encoding="utf-8", newline="").write(src)
print("applied %d edits (+%d bytes)" % (len(E), len(src) - len(orig)))
