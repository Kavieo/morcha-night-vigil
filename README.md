# MORCHA :: NIGHT VIGIL

Border observation & infiltration-detection trainer — Punjab / Jammu IB sector.

## How it is run: two screens, two roles

**The trainee does not touch the machine.** He watches the border on a projector
or second monitor, exactly as he would watch his ground. His entire input is one
button.

1. He sees something → presses **SPACE** (or any USB buzzer that reports as a key).
2. He **points at it on the screen** — hand or laser — and calls the bearing.
3. The instructor, on his own laptop screen, sees the ground truth and confirms
   or rejects what the trainee indicated.
4. The trainee calls for binoculars, thermal, the radio, the light, the QRT. The
   instructor actions each one as it is called.

This is why there is no mouse aiming: a sentry does not aim a cursor, and letting
him do so trains the wrong thing. Pressing the button stamps the exact second he
saw it — which is what the after-action review judges him on.

### Setup
Open either page and press the button on it to pop the other as a **separate
window** — `OPEN INSTRUCTOR CONSOLE` on the trainee page, `OPEN TRAINEE SCREEN`
on the console. Drag the trainee window to the projector.

**Two windows, never two tabs of one window.** A browser freezes a hidden tab:
measured in Chrome, 0.1 fps hidden against 2.2 ms a frame (~450 fps) visible.
The shift clock would stop dead. The sim detects this, **holds the shift**, and
both screens say so; the console keeps its link through a timer heartbeat that
does not depend on the render loop, so it reads `TRAINEE SCREEN HIDDEN — HELD`
rather than going blank.

The trainee window ignores every key except the claim button, so he cannot
disturb the exercise even by accident.

### What the console shows
- **His screen, mirrored**, about 4–5 times a second — the same frame he is
  looking at, sent as a small JPEG over the link.
- **Every contact boxed and named on that mirror**: what it actually is, its
  range and bearing, and whether it is `MOVING` or `FROZEN`. Moving boxes pulse;
  frozen ones go dashed — a contact freezes precisely because the trainee's arc
  settled on it, which is the moment worth noticing. Red hostile, green
  civilian, blue own troops.
- **A plan view** of the arc from above, with the wedge he can currently see.
- **Picture controls** — brightness and lamp glow, live, to match the projector
  and the room.

- **You cannot watch the whole arc.** Binoculars give you 9°. Everything you gain
  in detail you lose in frontage. The post holds an **assigned arc** of 58° either
  side — physically enforced by the embrasure jambs, the way a real morcha is, with
  flanking posts holding the rest.
- **Contacts watch you back.** Hostiles move only while your arc is elsewhere and
  freeze within about a second of you settling on them. Sweeping fast finds
  nothing; sweeping slowly leaves the rest of the arc blind.
- **The cue is the grass, not the man.** A prone crawler at 250 m is a few pixels.
  What is actually visible is grass working *across* the prevailing wind, and the
  flattened path a body leaves behind it. A frozen man makes no sway at all — only
  the crushed patch gives him away.
- **Every sight costs something.** Thermal sees heat through cover but cannot tell
  a cultivator from an infiltrator. Only binoculars and the intensifier can confirm
  a weapon, and only inside about 260 m. Your own flare blanks the intensifier for
  four seconds.
- **The ground tells you where.** Three fence floodlights are u/s — those dark gaps
  are marked **U/S** on the bearing tape and are where a trained infiltrator goes.
  The nallah culvert on the left flank is dead ground the whole way in. So are the
  field bunds.
- **Noise is a lie.** From about the seven-minute mark a decoy group works one flank
  while the real crossing goes in on the other.
- **The QRT takes 42 seconds, and a crawler's final dash at the wire is quicker.** You must commit your
  reserve on a suspicion, and it arrives where you *said*, not where he *is*.
- **The night degrades.** Ground haze, then a fog bank that kills thermal contrast,
  then moonset. Searchlight battery and flares run out. Operator fatigue makes the
  sight swim.

- **You are inside the room.** The POV is the morcha interior: concrete revetment,
  sandbagged parapet, the rifle set down muzzle-out, binoculars, field telephone
  with its red panel lamp, the log register, ammunition box. Night discipline means
  no white light — the room is lit by the telephone panel and floodlight spill
  through the slit, so the frame reads as a silhouette, which is what it looks like.
- **The Pakistan Rangers are across the line.** Three BOPs sit 200–300 m inside
  Pakistan with their towers up and lamps burning, marked `PAK` on the bearing tape.
  They are a fixed reference, a standing distraction, and the reason for the
  cross-border rule below.
- **Our own patrol walks the home side.** The A Coy patrol crosses the frontage twice
  a shift — armed, upright, on the graded track. Trainees designate them constantly.

### Consequences

- One infiltrator through the wire **fails the shift**.
- Aimed fire on an unarmed man — a cultivator near the zero line, a smuggler with
  empty hands — is a **Court of Inquiry**, and scores worse than a breach.
- **Rounds across the International Boundary.** Anything still beyond the zero line
  is on Pakistani soil. You may engage a man in no-man's land; you may not engage the
  same man thirty metres further back, and the log names which Rangers BOP was behind
  him. Ends the shift.
- **Fratricide.** Aimed fire on the A Coy patrol ends the shift at the heaviest
  penalty in the scoring table.
- The after-action review shows, for every contact that got through, the exact
  minute it became readable, its bearing, **and where your arc was pointing at that
  moment**, in which sight.

---

## For instructors

### Press `I` for the control panel
Inject any contact class at any bearing · set visibility from clear to thick fog ·
**slew the trainee's arc onto a bearing** so you can point out what he walked past ·
force illumination · reveal all contacts · pause · end the shift and score ·
type remarks that are carried into the after-action review.

### `src/config.js` is yours
Everything that is doctrine rather than code lives at the top of that file and is
commented for a non-programmer: the escalation ladder, the ROE gates for aimed
fire, every timing, the stores, the scoring weights and pass mark, the full
scenario (every contact, its time, bearing and route), and the weather schedule.
Edit it, reload the page, and the simulation obeys. Nothing else needs touching.

> **This is a training aid, not a certified SOP reference.** The escalation ladder,
> ROE gates and timings shipped in `config.js` are a reasonable placeholder built to
> make the mechanic work. **They must be reviewed and corrected against current unit
> SOP by the training officer before this is used to assess any trainee.**

Time in the simulation is compressed: a twelve-minute shift stands in for a night,
and approach speeds in `config.js` are scaled to match. If you re-time the shift,
scale all six contact speeds together.

### Debrief with the AAR
`EXPORT AAR (.txt)` writes the verdict, score, missed-cue table, full contact
ledger and timestamped shift log to a file you can keep or print.

---

## Layout

```
index.html          HUD, briefing, styles, loader
src/config.js       DOCTRINE — instructor-owned. Ladder, ROE, scenario, scoring.
src/world.js        Terrain, AIOS fence, floodlights, nallah, bunds, grass shader
src/entities.js     Contact classes and their behaviour
src/optics.js       Camera, the four sights, HDR tone mapping
src/hud.js          HUD, instructor panel, after-action review
src/sim.js          Loop, actions, ladder enforcement, scoring, QRT
tex/                Ground and material textures — Poly Haven, CC0
vendor/three.min.js three.js r128, MIT
```

No asset is fetched at runtime. The sky, stars, grass blades, light pools and
border-pillar markings are all generated in the browser at load.

---

## Known scope limits

Built in one sitting. Deliberately out of scope so far: multiplayer, a second map,
animated character rigs (contacts are correctly-proportioned silhouettes with prone
/ crouched / standing / quadruped stances), voice challenge-and-response, and
recorded audio — all sound is synthesised.

**The layout is a reconstruction, not a survey.** Fence and floodlight spacing, the
dead-lamp positions, border-pillar numbering and the Rangers BOP placements are built
from open sources to be plausible and to make the exercise work. Anything a trainee
might memorise as fact must be corrected against real sector data before use.

---

## Assets

Everything is local. The folder still runs offline — copy it to a USB stick and
open `index.html`.

### 3D models — `models/`
Poly Haven, **CC0** (public domain, no attribution required; credited anyway).
Loaded as glTF and drawn with `InstancedMesh`, so 150 bushes cost one draw call.

| Model | Used for |
|---|---|
| `cement_bag` | every sandbag — sill course, jambs, corner stack, Rangers sangar |
| `bolt_action_rifle_7_62` | the weapon on the sill — **see the caveat below** |
| `ammo_box`, `old_military_crate` | ammunition on the morcha floor |
| `grass_medium_01`, `grass_medium_02` | near-field grass clumps over the parapet |
| `shrub_04`, `wild_rooibos_bush` | the scrub an infiltrator actually uses as cover |

> **The rifle is wrong and I know it.** It is a scanned 7.62 bolt-action — the
> closest CC0 rifle in existence. A BSF sentry carries an INSAS or an AK. Drop a
> correct model into `models/` and change one line in `world.js`; nothing else
> depends on it.

### Textures — `tex/`
Poly Haven, **CC0**: soil (diff/normal/rough), cultivated field (diff/normal),
concrete (diff/normal), rusted metal.

### Generated at runtime — no files
Tree silhouettes, grass blades, light-pool gradients, fog, border-pillar
numbering. At 600 m at night a tree is pure silhouette, so the **outline** is
what matters — trunk, branch structure, ragged canopy edge. Four species shapes
are drawn procedurally (kikar/acacia umbrella, eucalyptus, shisham broadleaf,
dead). A real tree model is 66–214 MB each and would buy nothing at that range.

### Terrain
`World.heightAt(x, z)` is the single source of ground height. The ground mesh,
grass, fence posts, border pillars, Rangers posts and **every contact** sample
it, so folds are real dead ground rather than an assertion. The nallah cuts
**2.7 m** below grade — a man in it is genuinely out of sight, which is why the
briefing tells the trainee to watch that lane.

### Hand-built geometry
No CC0 model of any of this exists, so it is modelled from the real thing:

**AIOS fence.** Twin rows 3.2 m apart, posts on 3 m centres. Posts are
**L-section angle iron** (75x75x6 mm profile, extruded) 2.7 m high, each crowned
with a **Y-fork outrigger** canted 40 degrees outward both ways. **18 barbed
strands per bay hanging in a catenary** — dead-straight strands are the single
clearest tell that a fence was computer-drawn. A **true helical concertina** (30
turns per 3 m bay, `TubeGeometry` on a helix curve) crowns each row, with the
**three-coil pyramid** stacked in the trough between them. Concrete footing
collar at every post. Full detail is built for the 300 m either side that is
inside the arc; the flanks fall back to a cheap version.

**Floodlight mast.** 11 m tapered steel pole on a bolted base flange, cable
conduit down the shaft, riser and 2.6 m bracket arm carrying **three 1000 W HPS
housings** — rectangular bodies with hoods and domed glass faces, canted 30
degrees down and splayed. Three real fixtures, not one glowing ball.

**Contacts.** Parametric humanoids from tapered capsules at real proportions
(1.72 m standing): head, neck, torso, upper and lower arms, thighs, shins, feet,
posed per stance. The prone pose is flat with splayed legs and raised head and
shoulders. At 250 m a contact is a few pixels and **the outline is the entire
detection cue** — a box teaches the trainee the wrong shape. The slung weapon is
modelled too, because confirming it in binos is what the ROE turns on.

**Border pillars.** Numbered block with a pyramidal cap.

### Still primitive
The morcha shell and the Rangers BOP buildings are boxes under their sandbag
revetment. Both are largely in shadow at night, so they are last in the queue.


## Verifying it

`Sim.step(dt, doRender)` advances the exercise without `requestAnimationFrame`,
and `Sim.cmd(name, args)` is the same entry point the console drives over the
link. Together they run a whole shift deterministically in a fraction of a
second — which is the only way to test it, because a hidden browser window
throttles the render loop to about 0.1 fps.

Note that in trainee mode **the keyboard is dead except the claim button**. A
test that presses `r` / `c` / `q` is silently doing nothing; use `Sim.cmd`.

Measured range, full 5-minute shift:

| Run | Breaches | Score | Verdict |
|---|---|---|---|
| Sentry does nothing | 4 | −600 | FAIL — BORDER BREACHED |
| Sentry works it properly | 0 | +465 | PASS (mark: 200) |

## Third-party assets
- `models/rig/Soldier.glb` — rigged character from the three.js examples (Mixamo rig and animations).
- `models/rig/Fox.glb` — glTF Sample Assets "Fox": model CC0 by PixelMannen; rigging and animation CC-BY 4.0 by @tomkranis; glTF conversion by @AsoboStudio and @scurest. Used as the stray dog / jackal.
- `tex/ph/*` — Poly Haven CC0 textures (hessian_230, dry_ground_01, aerial_grass_rock).
- `vendor/SkeletonUtils.js` — three.js r128 examples (MIT).
