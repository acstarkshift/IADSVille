# IADSVille

A browser game about running the air defence of a town called the Ville.

You are a conscript of the **Trans-Mordovian People's Air Defence Forces** — not
a pilot and not a gun, but the person reading the scope. The job is triage:
sixteen contacts, four batteries, ninety seconds, and a command that reads your
log afterwards.

You are also from the Ville. It is the village at the centre of every scope you
will ever sit at, and your family is still in it. That is not set dressing; it
is the whole shape of the campaign.

Trans Mordovia is invented, and so is everything in it: the state, the service,
its equipment, its ranks, its decorations, and the Slavic language stencilled on
the panels. No real country, service or hardware is depicted.

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

## The soldier

The campaign is a service record, not a score table. You enlist once — a name, a
home town, and where you were before the army had you — and that person persists:
rank, experience, decorations, qualifications, and whether you are currently
carrying an injury.

Nothing in it is decorative. Every background and every qualification resolves
into numbers the simulation uses:

| | |
|---|---|
| **Backgrounds** | The works at Kubin taught you machinery, so you reload and displace faster. Never leaving the valley taught you to identify aircraft lying in a field. Two years at the academy in Mostrograd start you with standing — and with people who watch you more closely for losing it. A penal transfer starts you in disgrace and lets you climb faster. |
| **Home** | Fixed: the Ville. At enlistment you choose which household is still there — your mother, your sister and her children, your grandmother, your brother who failed the medical — and which quarter of the village they live in. Damage to the town is reported by quarter, and one of those quarters is theirs. |
| **Rank** | Eleven grades from Стрелец to Капитан. Promotion needs experience *and* standing: the army will not promote someone it does not trust. A catastrophic watch can reduce you, and it keeps the training you were given. |
| **Training** | One point per promotion. A steady hand gets rounds off the rail sooner; signal discipline slows enemy direction finding against your sets; a cool head shortens the blackout after a hit; a drilled crew holds an extra engagement channel. Qualifications apply in full at your own battery and at half strength across the sector — you drilled those crews, but you are not sitting in them. |
| **Decorations** | Awarded for things that are hard to do, including one for losing your position and holding the sector anyway. |
| **Injury** | If your battery is overrun you are wounded, and everything takes you longer until one more watch is behind you. |

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
| 7 | The Two Cities | tactical display | That the equipment was never the constraint |

### The last watch

Two formations cross the frontier eleven minutes apart on divergent axes. One is
tracking Mostrograd and the presidential palace. The other is tracking the
valley, and there is nothing in the valley but the river crossing and your
village.

The two are 117 kilometres apart. No medium battery covers both. Exactly one
does — the long-range battalion sitting halfway between them — and it has four
channels and eight rounds against eighteen aircraft, which is the point of it
being there. There is no resupply: the depots are committed to the capital, so
every battery fights with what is on its rails.

Before either raid is close enough to detect, sector command transmits its
priority of fires and asks you to acknowledge it on the net, in the clear, with
the log running. The capital's raid arrives first, so if you obey you will have
spent your rounds before you learn what the western axis is for.

Nothing ever asks you to choose. The game reads your choice off what you
actually shot at — rounds are attributed to a side of the sector as they leave
the rails — and there are five endings, **none of which is clean**. Obedience is
rewarded, decorated, and costs you the village. Defiance saves it and ends
everything else. Splitting your fires does neither well. And the near-impossible
outcome where both cities are held is not a victory either: there is no
decoration for it, because a citation would have to name what you defended, and
one of those two things does not officially exist.

## The console

The equipment is Trans-Mordovian and it is stencilled accordingly: bat-handle
toggle switches whose lever position *is* the state, domed indicator lamps,
legend-cap pushbuttons, a screwed bezel around the tube, riveted data plates
carrying a type and a works number, and a high-voltage placard nobody reads.

Every legend is bilingual — the Cyrillic is what is stamped on the panel, with
the export gloss etched underneath, the way export-marked equipment genuinely is.
That is also why the console stays playable if you cannot read the Cyrillic, and
legible if your system substitutes a font without it.

```
ИЗЛУЧЕНЬ / RADIATE      ЗАТИХ / SILENCE      ПУСК / LAUNCH
ЗАХВАТ / LOCK           ГОТОВ / READY        ОБЛУЧЕНЬЕ / INBOUND ARM
ЗАСВЕТКА / ELINT EXPOSURE                    СМЕНА МЕСТА / DISPLACE
```

None of it is decoration either: the switch you throw to go dark is the same
decision the whole game is built on, and it should feel like throwing a switch.

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
styles/               theme.css (palettes) + panel.css (hardware) + hud.css
src/engine/           the simulation — pure JS, no DOM, runs under node --test
  detection.js          radar physics, sweeps, plot-to-track fusion
  weapons.js            envelopes, guidance dependency, kill probability
  ai.js                 how the raid behaves, per type
  doctrine.js           engagement state machine + the AI in the other seat
  command.js            directives, constraints, standing
  character.js          ranks, training, decorations, injury — the service record
  endings.js            how the last watch ends, and what it costs either way
  campaign.js           the file that follows you between missions
  world.js              the fixed-step tick that orders all of it
src/ui/                scope, battery console, panels, dossier, themes, audio
  lexicon.js            every legend on the equipment, in both languages
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
- **One lexicon.** Every legend on the console comes from `src/ui/lexicon.js`, so
  a switch can never end up labelled differently from the thing it does.
- **The RPG layer is measured, not asserted.** The character tests build a real
  `World` and check that a qualification changed a number in it — a channel
  count, a reaction multiplier, a blackout duration.
- **The last watch is geometry, not scripting.** Its tests assert the properties
  that make the choice real: that the cities are more than 100 km apart, that no
  medium battery covers both, that exactly one battery does and cannot hold both,
  that point defence is sited forward of the release ring, and that every one of
  the five endings is reachable.

## Credits

Everything here is invented: Trans Mordovia, its air defence forces, their ranks
and decorations, the equipment designations, the language on the panels,
Mostrograd, and the Ville itself. The physics is deliberately simplified — the goal is a system that
*behaves* like an air defence problem, not a fidelity claim about any real
equipment, and nothing here corresponds to a real state or service.

MIT licensed.
