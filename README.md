# IADSVille

A browser game about running the air defence of a town called the Ville.

You are not a pilot and you are not a gun. You are the person reading the scope,
and the job is triage: sixteen contacts, four batteries, ninety seconds, and a
command that reads your log afterwards.

**No dependencies, no build step.** Open `index.html` from any static server and
play.

```
npm start          # http://127.0.0.1:8080
npm test           # the simulation test suite (node's built-in runner)
npm run smoke      # drive the real page in a headless browser
```

---

## The one idea

A radar that is not radiating cannot see anything. A radar that *is* radiating
can be found, and suppression aircraft carry rounds that home on exactly that.
So:

> **Emit to see. Emit to shoot. Emit and they will find you. Pick two.**

Every mechanic hangs off that trade. Most sharply: a surface-to-air round is
guided by the radar that launched it. Shut that radar down to dodge an incoming
anti-radiation missile and the round you already have in the air goes stupid and
falls in a field. Leave it up and you may not be there when the round arrives.

## Two seats

Both are the same simulation. What changes is which half of it you drive; the AI
fills whichever seat you are not sitting in.

| Seat | You run | The feel |
|---|---|---|
| **Battle Manager** | The fused sector picture. Identify contacts, assign them to batteries, set weapons states, manage emissions across every radar you own. | Wide and cerebral. You will spend the whole watch deciding what to ignore. |
| **SAM Operator** | One battery. Your own radar's coverage, cues over the net, and the acquire → lock → launch → guide loop by hand. | Tight and personal. The rounds come at *you*. |
| **Commander** | Both — run the picture, and take a console yourself when a shot matters. | Delegate, then grab the one that counts. |

## What is actually being simulated

- **Sweep-gated detection.** A radar learns about a contact only when its beam
  crosses that bearing, so tracks update in steps at the scan rate. A twelve-second
  early-warning scan feels nothing like a three-second point-defence set.
- **Detection range** scales as the fourth root of radar cross-section — a tenth
  of the RCS is a bit over half the range, not a tenth — and is then capped by the
  radio horizon, `4.12 × (√h_radar + √h_target)` km. That single line is why a
  contact at ninety metres appears at forty kilometres and gives you two minutes.
- **Track fusion is a service, not a fact.** Plots from every radar correlate into
  one numbered track per aircraft — in the sector operations centre. Destroy that
  building and each radar reports for itself: one aircraft grows a track number on
  every set that can see it, cueing stops, and anything you delegated becomes
  nobody's job. It is the first thing a serious raid goes after, and you will
  finish that mission without it.
- **Standoff jamming** imposes a burnthrough range in a bearing wedge, and
  burnthrough *improves* the further out the jammer sits — so pushing it back, or
  killing it, is worth more than shooting at what it is hiding.
- **Decoys** are built to look like strike aircraft and they succeed, until they
  are close enough that their impossibly steady flight gives them away. By then
  you may have spent four rounds on them.
- **Nerve.** A striker that has a round go past its nose may jettison and turn for
  home. It never bombs anything. A miss can win the fight, and the log will tell
  you when it happens.
- **Civil traffic** crosses the sector on a schedule, knows nothing about any of
  this, and shooting one caps your assessment no matter how the rest of the watch
  went.

## The pressure

Sector command is not your ally and not quite your enemy. It is a filing system
with a radio.

Directives interrupt at the worst possible moment and must be **acknowledged or
refused on a timer, while the raid presses in** — spending the scarcest resource
in the game, which is your attention. Accepting one binds you: agree to "all sets
will radiate" and going dark to dodge an anti-radiation round becomes a logged
violation. Refusing costs standing immediately. Saying nothing costs more.

**Standing persists across the campaign.** A bad watch is not erased by a
restart; it is written down, and the next briefing opens with it. At the bottom
of the scale the consequences stop being text and become mission modifiers — a
forward posting with no resupply is both a punishment and a harder problem.

If you would rather have the simulation without the coercion, **Settings →
Narrative pressure: off** keeps every mechanic and drops the file entries.

## Missions

Six watches, each teaching one thing and then never letting you forget it. Each
names its own console theme, so the campaign visibly changes hardware as it
escalates.

| # | Watch | Console | Teaches |
|---|---|---|---|
| 1 | First Light | green phosphor | Tracking, assignment, and that a radar has to radiate to see |
| 2 | Low Riders | green phosphor | The radar horizon. Low contacts arrive close and stay close |
| 3 | Solo Battery | green phosphor | The whole engagement loop from the seat, alone *(operator only)* |
| 4 | Weasel Hour | amber phosphor | Emissions control — blink to survive, and pay for it in guidance |
| 5 | White Noise | amber phosphor | Jamming, burnthrough, decoys, ammunition discipline |
| 6 | Ville Under Fire | tactical display | All of it, and then the centre goes down |

## Controls

| Key | Action |
|---|---|
| `Space` | pause / resume |
| `1` `2` `3` | speed: 1× · 2× · 4× |
| `+` `−` | zoom the scope |
| `Y` `N` | acknowledge / refuse a directive |
| `Tab` | switch seat (commander) |
| `H` | full controls and a plain-English explanation of the mechanics |

**Battle manager:** click a contact to select it, drag it onto a battery to
assign the engagement, right-click a radar to blink it. `Q` `W` `E` set weapons
hold / tight / free, `R` reloads, `X` displaces.

**SAM operator:** click to designate, `L` to lock, `F` to fire, `E` to radiate or
shut down — that last one is the whole game.

## Layout

```
index.html            the page; everything below is loaded as ES modules
styles/               theme.css (palettes) + hud.css (chrome)
src/engine/           the simulation — pure JS, no DOM, runs under node --test
  detection.js          radar physics, sweeps, plot-to-track fusion
  weapons.js            envelopes, guidance dependency, kill probability
  ai.js                 how the raid behaves, per type
  doctrine.js           engagement state machine + the AI in the other seat
  command.js            directives, constraints, standing
  campaign.js           the file that follows you between missions
  world.js              the fixed-step tick that orders all of it
src/ui/                scope, battery console, panels, themes, audio
test/                  node:test suites over the engine
tools/                 zero-dependency static server and browser smoke test
```

The engine never touches `window`, which is why the same code that renders your
scope also runs a hundred missions a second in CI. Simulation steps at a fixed
0.1 s regardless of frame rate, and every mission is reproducible from its seed.

## Design notes

A few decisions worth knowing about if you read the source:

- **Sense, then decide, then move.** The tick order is fixed so nothing in the
  simulation ever acts on information from its own future.
- **Swept intercepts.** Rounds cover more ground per step than their lethal
  radius, so intercept uses closest approach along the step rather than endpoint
  distance — otherwise missiles tunnel through aircraft.
- **The player gets no private mechanics.** Every command the operator issues —
  assign, fire, blink, reload, displace — is the same call the AI makes. What the
  player has is judgement, not a faster reaction timer.
- **Only returns persist.** The phosphor layer holds radar echoes; the sweep is
  redrawn each frame. Painting the sweep into the persistence buffer saturates
  the tube in about four seconds, which is a mistake this code made once.

## Credits

Everything here is invented. The designations, the systems, the state, and the
Ville are fictional, and the physics is deliberately simplified — the goal is a
system that *behaves* like an air defence problem, not a fidelity claim about any
real equipment.

MIT licensed.
