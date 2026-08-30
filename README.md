# IADSVille

A browser game about running the air defence of a town called the Ville.

You are an officer of the **Trans-Mordovian People's Air Defence Forces** — not
a pilot and not a gun, but the person reading the scope. The job is triage:
sixteen contacts, four batteries, ninety seconds, and a command that reads your
log afterwards.

The campaign is a promotion. You begin commanding a battalion, four batteries in
one valley, every one of them yours to point personally. You end commanding the
air defence of a country. The equipment never changes. What changes is the kind
of decision you are making — and every promotion takes something away.

You are also from the Ville. It is the village at the centre of the first scope
you sit at, and your family is still in it. That is not set dressing; it is the
whole shape of the campaign, and it is why the last appointment is the one that
costs you something.

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
falls in a field. Leave it up and you may not be there when the round arrives —
or give the one order the crew will never give itself (`G`, **RIDE — HOLD THE
BEAM**) and keep guiding with the enemy's round inbound on your own set.

And attention is priced. A crew on weapons *free* engages at first opportunity:
the earliest shot there is, taken at the edge of the envelope where kill
probability is worst, at whatever is nearest — including the decoys. A net
assignment holds for a sweet-spot shot when there is time to spend, skips the
contact whose impossibly steady flight a well-held track has already given away,
re-engages after a miss while the shot is still its own, and hands a runner off
to the next layer in when it is not. Measured over sixteen seeded watches of
White Noise, a commander who works the picture beats one who sets everything
free and walks away by **20% on the mean, winning 13 of 16 seeds, on a third
fewer rounds and a third the decoys** — and beats one who does nothing at all
by a thousand points.

And then Ville Under Fire kills the operations centre mid-watch, cueing dies
with it, and the same sixteen seeds run the other way: the released crews take
the mean and the two postures trade per-seed wins, exactly as the brief warns —
*anything you delegated becomes nobody's job*. There is no posture that is
right twice. Working out which lever each watch answers to is the job, and both
shapes are measured into the regression tests so neither can quietly rot.
Delegation is viable — the AI net over free crews now adds value instead of
taxing them — and one more thing about it is true: crews follow the orders you
acknowledged. Accept the expenditure freeze and no battery on free will defend
the hospital for you. Quiet insubordination requires the pen.

## The four appointments

| | Appointment | You decide | It costs you |
|---|---|---|---|
| **ДИВИЗИОН** | Battalion commander | Which battery shoots this track | — |
| **СЕКТОР** | Sector commander | Which tracks are worth a round at all | The illusion that you can answer everything |
| **ОКРУГ ПВО** | District commander | *Which sector you are standing in* | The console. You never sit in a launcher again |
| **ГЛАВНЫЙ ШТАБ ПВО** | Chief of Air Defence | *Which region is allowed to be defended* | Everything else |

The mechanism is the number of subordinate commands you may hold under your own
hand at once. At battalion and sector level there is one formation and it is
yours, so those watches play exactly as they always did — you assign every
track, you set every battery's emissions state, you can take a console yourself.

From district command upward there are four sectors and you may stand in **two**.
At national command there are two and you may stand in **one**. Everything you
are not standing in fights on the **standing order** you left it with — hold,
tight, or free — carried out by a named officer with their own competence and
their own reading of their orders, whom you will never meet. Taking a formation
under your own hand costs a **handover**: eighteen seconds at district level,
twenty-six at national, during which nobody at all is commanding it.

So the standing order stops being a convenience and becomes your principal
weapon: issued in advance, to somebody you cannot see, about a raid that has not
happened yet. And one of those officers, at the level where it matters most, is
a political appointee who will not expend a round on anything the priority of
fires does not name — not out of cowardice, but because he has read the same
order you have and, unlike you, has never once considered not obeying it.

Your own **headquarters battalion** is the exception. It is always under your
hand, it never counts against the limit, and on the last watch it is what the
enemy is coming for.

At national command you also hold the **strategic reserve**: rounds nobody below
you can release, four minutes of road between the order and a rail, and never
enough to cover two of anything. Sending it somewhere the priority of fires does
not name is the largest single act of disobedience available in the game, and it
is recorded in exactly the same column as everything else.

Appointments open on watches stood, not on marks — a bad night is still a night
stood, and a campaign that locked you out of its second half for one raid is a
campaign nobody finishes. The rank comes with the job: an officer appointed to a
district is gazetted Major on the same order, which is how most people in this
service find out they have been promoted.

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
| **Home** | Fixed: the Ville. At enlistment you choose which household is still there — your mother, your sister and her children, your grandmother, your brother who failed the medical — and which quarter of the village they live in. Damage to the town is reported by quarter, and one of those quarters is theirs — and when it is theirs, a few seconds after the strike report, the net carries one line only you have any use for: the trunk lines to that quarter are down. |
| **The letters** | The household writes, all campaign long, and the post goes through the political section. A commended file gets its letter unopened — and is told so. An ordinary file gets it opened and resealed. A flagged file gets a notice of withholding, and the letter itself comes back watches later under the wrong seal, or is still held at the finale, where it becomes a clause in the ending. The letters never mention the war, and what they conspicuously do not say — a repainted kitchen, children moved to the room facing away from the valley, an enamel box taken down and kept by the door — is the war arriving anyway. You never get to write back. The one unmonitored telephone call in this game is in the epilogue, and it costs what it costs to get there. |
| **Rank** | Eleven grades from Стрелец to Капитан. Promotion needs experience *and* standing: the army will not promote someone it does not trust. A catastrophic watch can reduce you, and it keeps the training you were given. |
| **Training** | One point per promotion. A steady hand gets rounds off the rail sooner; signal discipline slows enemy direction finding against your sets; a cool head shortens the blackout after a hit; a drilled crew holds an extra engagement channel. Qualifications apply in full at your own battery and at half strength across the sector — you drilled those crews, but you are not sitting in them. |
| **Decorations** | Awarded for things that are hard to do, including one for losing your position and holding the sector anyway. |
| **Injury** | If your battery is overrun you are wounded, and everything takes you longer until one more watch is behind you. |

## The arc

The campaign runs from devoted defence of the homeland to knowing exactly what
you are defending it for, and it is not delivered by anybody making a speech. It
arrives the way this kind of knowledge actually arrives: as a form, a figure that
does not reconcile, a remark from a clerk who assumed you already knew.

Crucially, every step of it is anchored in something you have already *felt*.
The ammunition has been short since the third watch. The allocation has been
queried. Reloads have been denied. By the time the ledger explains why, you have
spent hours inside the consequence.

**Economy of Force** is where it turns. An expenditure freeze comes down: rounds
are to be spent only against aircraft threatening *designated defended places*,
and the district hospital is not one. The hospital sits twenty-one kilometres
from a battery that covers it comfortably, with rounds on the rails.

You do not know where a contact is going until it commits — so obeying is not
declining to assign. It is calling a battery off a target it is already tracking.

Then the debrief shows you two numbers that have agreed all campaign and now do
not (means over eight seeded watches, competently fought — reproduce them with
`node tools/measure-moral.mjs`; the hospital package comes in on the deck, down
the Kubin road, and obedience loses the building on all eight nights while a
deliberate defence saves it on seven):

| | Standing | Score |
|---|---|---|
| Obey the freeze | **90** | 174 |
| Defend it anyway | 81 | **1156** |
| Refuse the order outright | 62 | 1156 |

Defending the hospital is worth nearly a thousand points of actual value, and
the file prices the whole transgression at nine: a query for rounds
expended outside the freeze, worth rather less than two leakers. A weapon that
arrives at the struck-off place is billed at exactly nothing — the ledger
cannot simultaneously declare a building undesignated and grieve for it — and
the building's own loss appears on the state's books at nothing at all. Only
the third row really moves. Refusing on the net, for the identical night's
fighting, costs nineteen points more than quietly disobeying, plus a
referral that stays in the file. Sector command barely prices what you did.
It punishes having said no, and that is the whole lesson.

**Across the Line** goes further. A cruise missile has strayed off course, west
over the ridge and across the Listonian border, and it is going to come down on a
camp at Gorna — four hundred Trans-Mordovians who left, living in tents, whose
continued existence the ministry does not enjoy. Two batteries hold it
comfortably. Sector command's position is that engaging outside national
territory is a border incident.

Acknowledging it stands your own subordinates down: no officer and no crew on
weapons free takes that shot on its own authority afterwards, so the camp is
defended by you personally or not at all. Measured over eight seeded watches
with everything on free and nobody at the console, obeying loses the camp on
all eight and kills a hundred and sixty-five people; refusing saves it outright
on three, halves it on four, and costs twenty-two points of standing plus the
referral, which stays in the file. Afterwards you look the grid reference up and
find it handwritten inside the back cover of the sector target folder, in a
folder that has no business containing a point in Listonia at all. The word for
what happened over Gorna is not "stray".

And in the chaos of **Ville Under Fire**, the political section comes on the net
about the scheduled civil transit. There is a passenger aboard subject to a
detention order. You will engage it.

The game has spent eight watches teaching that destroying a civil aircraft is the
one thing no amount of otherwise-good work offsets — a hard ceiling that drops
your assessment to a referral however well the night went. Comply with this order
and the ceiling is lifted, the referral does not happen, and your standing goes
*up*, from 18 to 31. The score does not move an inch: four hundred points and
several hundred people. The rule was never a principle. It was an exposure, and
the order removes the exposure.

After that the documents start turning up: an allocation spent before the quarter
began, a depot return properly countersigned at three levels showing four hundred
rounds that are not in the magazines, and finally the transfer manifests, filed
in a room nobody has a reason to enter, with a column headed ADMINISTRATIVE
RECOVERY. The rounds were sold. The expenditure freeze exists so the magazines
are never opened and counted.

Then you are promoted, and the arc changes register. At district command the
orders stop being about your conscience and start being about equipment: the
directorate takes your long-range battalion for a capital that is not under
attack, and you watch a district town burn in a sector that battalion covered.
Afterwards the movement order turns up where freight paperwork is filed: same
numbered series, same week, road movement from the palace annexe to Demobodedovo,
freight class four — household and administrative effects — dated two days
*before* the assessed threat that took your guns. The air defence of the country
was rearranged around a departure schedule, and the schedule came first.
And at national command you find that the officer holding one of your two
sectors is a colonel of the political section who will not expend a round on
anything the priority of fires does not name — which means the thing you spent
eleven watches learning to resent is now working *for* you, in the city you were
told to save, while you are standing in the valley.

By the last watch, "the depots are committed to the capital" is a sentence you
can no longer hear the way it is meant — and you are the one who signs it.

## Two seats

Both are the same simulation. What changes is which half of it you drive; the AI
fills whichever seat you are not sitting in.

| Seat | You run | The feel |
|---|---|---|
| **Battle Manager** | The fused sector picture. Identify contacts, assign them to batteries, set weapons states, manage emissions across every radar you own. | Wide and cerebral. You will spend the whole watch deciding what to ignore. |
| **SAM Operator** | One battery. Your own radar's coverage, cues over the net, and the acquire → lock → launch → guide loop by hand. | Tight and personal. The rounds come at *you*. |
| **Commander** | Both — run the picture, and take a console yourself when a shot matters. | Delegate, then grab the one that counts. |

The air picture down the left is not one list. It is a set of shootlists:
everything nobody is on, at the top, under a heading that turns red while any of
it is hostile — that section *is* the job — and beneath it one list per battery,
each headed with whether that battery can take another one (rounds ready,
reloading, displacing, empty) and closed off by a line naming the batteries with
nothing to do. A contact two batteries are both on appears under both. From the
cabin you see your own board and nothing else, which is all you would have.

Which seats are available is decided by the appointment you hold. A battalion or
sector commander may sit anywhere. A district commander may not: there is no
console at that level, and losing it is part of what the promotion costs. At
national command you keep one — your own headquarters battalion's — because on
the last watch that battery is in the room you are sitting in.

## The four classes of air defence

A sector is built out of four layers, each covering what the next one down
cannot. Losing one leaves a hole nothing else can fill.

| Class | System | Envelope | What it is for |
|---|---|---|---|
| **ЗЕНИТНАЯ АРТИЛЛЕРИЯ** · Guns | ZU-4 HAMMER | 0.2–4 km, to 2,500 m | Shells, not rounds. No minimum range and no guidance to lose — which is what you want when something is already overhead. |
| **МАЛАЯ ДАЛЬНОСТЬ** · Short-range | S-12 THISTLE | 0.8–12 km, to 6,000 m | Point defence. Must be sited *forward on the threat axis* or it never sees a target before the weapons are off. |
| **СРЕДНЯЯ ДАЛЬНОСТЬ** · Medium-range | S-75 LANCE | 3–42 km, to 15,000 m | The workhorse. Covers the release ring, and the class you run out of first. |
| **БОЛЬШАЯ ДАЛЬНОСТЬ** · Long-range | S-200 BASTION | 6–120 km, to 25,000 m | Owns the approach, and reaches the standoff aircraft nothing else can touch — through one arc at a time. |

### The battalion's two antennas

Every other class runs a single set that searches its patch and guides its
rounds. A long-range battalion runs two, because you cannot search a frontier
with the antenna you are using to hold a target:

- an **acquisition set**, omnidirectional, 150 km — the battalion's own search
  picture, and what the rest of the game means by "the battery's radar";
- a **fire-control set** on a mount that covers **120°** and traverses at
  **5°/s** — so swinging it from one edge of its arc to the other is the better
  part of half a minute.

Nothing is guided that the fire-control antenna is not pointing at. An
engagement's reaction sequence does not even start until the mount bears on the
target, and a crew that slews away to answer something else drops what it was
guiding. The crew slews automatically — covering everything it is engaging when
that fits inside the arc, and taking the most urgent when it does not — so this
is not micromanagement; it is a constraint you plan around. The arc is drawn on
the scope and in the cabin, with the boresight dashed down its middle, because
which way a battalion is looking is a decision the operator is making whether
they can see it or not.

That is what a long-range battalion actually is: enormous reach through one
soda straw. It is also why the ministry taking yours matters so much, and why
two raids on divergent axes is a genuinely different problem from one raid
twice the size.

## The map

The battle manager's scope carries an underlay of Trans Mordovia: the Mordava
running down from the northern hills through the Ville and under the crossing the
raids keep trying to drop, the Kubin ridge and the northern hills the western
axis comes down between, Lake Yasen, the trunk road to Mostrograd, the towns, and
the frontier every raid crosses.

The geography is invented but consistent with the scenarios rather than
decorative — the river really does pass under the bridge, and the trunk road
really is 129 km by road against 117 direct. An operator reads a scope against
ground they know, and it turns "a contact at 285 for 90" into "something coming
down the valley". It also makes the river line sector command keeps issuing
orders about an actual line. `M` toggles it.

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
- **What they launch is a target too.** An anti-radiation round or a released
  weapon is an air object like any other — small, low, and fast, so the horizon
  hides it until late, and the net calls it out on its own line the moment it goes
  firm rather than burying it among the aircraft. It can be intercepted, and
  sometimes is. The battery that can reach it takes it; the net does not send one
  three sectors away to try.
- **Civil traffic** crosses the sector on a schedule, knows nothing about any of
  this, and shooting one caps your assessment no matter how the rest of the watch
  went.
- **Air-to-air**, on one watch only. Enemy fighters ignore the ground completely
  and fly a lead-pursuit solution on a single aircraft, launching from twenty-six
  kilometres. Their rounds are guided by nothing of yours, so blinking a radar
  does not save what they are chasing — the only thing that does is killing the
  fighter before it reaches its launch point.

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

The orders escalate with the appointment. A battalion commander is told to keep
radiating. A sector commander is told a hospital is not a designated defended
place. A district commander is told to hand over the only long-range battalion
between two of his sectors, for a capital that is not under attack. And a
national commander is told which of two cities is allowed to matter, and asked
to acknowledge it on the net, in the clear, with the log running.

If you would rather have the simulation without the coercion, **Settings →
Narrative pressure: off** keeps every mechanic and drops the file entries.

## Missions

Eleven watches across four appointments, each teaching one thing and then never
letting you forget it, and a twelfth that only some records ever see. Each names
its own console theme, so the campaign visibly changes hardware as it escalates.

**Act I — battalion command.** *Green phosphor. Four batteries in one valley.*

| Watch | Teaches |
|---|---|
| First Light | Tracking, assignment, and that a radar has to radiate to see |
| Low Riders | The radar horizon. Low contacts arrive close and stay close |
| Solo Battery | The whole engagement loop from the seat, alone *(operator only)* |

**Act II — sector command.** *Amber phosphor, then the tactical display. A sector,
its radars, and more contacts than you have rounds.*

| Watch | Teaches |
|---|---|
| Weasel Hour | Emissions control — blink to survive, and pay for it in guidance |
| White Noise | Jamming, burnthrough, decoys, ammunition discipline |
| Economy of Force | What the allocation is actually for |
| Across the Line | What the schedule of defended places is really a schedule of |
| Ville Under Fire | All of it, and then the centre goes down |

**Act III — district command.** *Four sectors, a hundred and ninety kilometres,
and one of you. No console from here on.*

| Watch | Teaches |
|---|---|
| Four Sectors | That a standing order given to somebody you cannot see is a real weapon, and usually the only one you have |
| Reinforce the Capital | What a redeployment order costs, and who it is actually for |

**Act IV — national command.** *The whole country, one seat, and a reserve that
will not cover two of anything.*

| Watch | Teaches |
|---|---|
| The Two Cities | That the equipment was never the constraint |
| The President's Flight | That the last decision was never about a building either *(sealed)* |

### The district

Four sectors — the valley you are from, Kubin on the western road, Lozan under
the northern hills, and Brasov in the south where nothing has happened yet. They
are built identically on purpose: a town, something industrial, three batteries,
and an officer. They are interchangeable in every respect except which one you
are from, and the two watches at this level are about discovering that the
ranking you are being asked to do is not the arithmetic you think it is.

**Reinforce the Capital** is where the corruption arc stops being about your
own conscience and starts being about equipment. The directorate withdraws your
long-range battalion — the only thing that reaches two of your four sectors —
for a capital that is not under attack, has not been under attack all week, and
whose air picture you are looking at. Obeying keeps your file and costs a
district town. Refusing saves the town and ends your career. The two documents
disagree by about two hundred points and a place with people in it, and neither
of them mentions the other.

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

And a third formation is tracking the post you are sitting in, which is where
that battalion is. Answering it spends the rounds the cities need; displacing to
survive takes the only battery that reaches either city off the air for three
and a half minutes. There is no arrangement of those rounds that serves all
three.

At national command the choice is sharper still, because you may stand in one
city and not the other. The valley's sector commander is competent and has
nothing. The capital's is a colonel of the political section who will hold the
palace beautifully and will not expend a round on the valley, because the valley
contains no designated defended places and he has read the order.

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

### And the watch after it

One scenario is not on the roster. It appears as a sealed entry with its name
redacted, and it opens for exactly one kind of service record: an operator who
held the presidential palace on the last watch. Nothing else unlocks it, and
flying it does not lock it again.

Two days later, a state aircraft lifts from Demobodedovo, the state field
south-east of Mostrograd, and routes for the frontier with the hold loaded. The
hold was loaded overnight by a crane detail found from the sector — nine and a
half tonnes at freight class four, household and administrative effects, entered
against the forty-one seats it displaced. The passenger list is not being
transmitted, and by now you can work out why: it is a list of empty seats. The
same sector command that told you which city was allowed to matter now tells you
that this aircraft is protected **at all cost**, and asks you to acknowledge it
on the net.

Four enemy fighters are already up for it. They ignore the ground entirely — no
radars, no batteries, no city — and fly lead pursuit on the one aircraft they
came for, one round each from twenty-six kilometres. Every fighter you stop
before its launch point is a round that never leaves the rail. Meanwhile a
strike package is coming for the palace and the field, and the long-range
battalion that reaches the whole departure corridor is the same battalion those
raids need.

And twice in those eight minutes, the net brings you what STATE 01 wants to
know: the delay in the corridor (there is no delay in the corridor), then the
damage figure for the palace, with the advisory that the aircraft is carrying
people who matter. He never transmits to you and is never named — everything
arrives relayed by sector command, as received, awaiting your acknowledgement
while the fighters close. His questions cost you seconds. On this watch,
seconds are the only currency there is.

There are three ways it ends, and the game does not favour any of them. Hold the
corridor open and watch him go. Defend the city instead and let the fighters do
what fighters do. Or select a track your own system has already identified as
friendly and give a fire order against it — which is a thing the interface will
let you do, without comment.

Nothing asks you which you meant. The tape only records what left the rails, and
whose battery it left from.

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
| `Alt`+`1`…`4` | take or hand back a subordinate command (district and national) |
| `G` | RIDE — hold the selected battery's emissions through guidance with an ARM inbound |
| `H` | full controls and a plain-English explanation of the mechanics |

**Battle manager:** click a contact to select it, drag it onto a battery to
assign the engagement, right-click a radar to blink it. `Q` / `W` set weapons
hold / tight, `Shift`+`E` sets weapons free, plain `E` toggles the selected
battery's radar (mind the difference — one of those silences your own set),
`R` reloads, `X` displaces.

**SAM operator:** click to designate, `L` to lock, `F` to fire, `E` to radiate or
shut down — that last one is the whole game.

**District and national command:** the formations panel is above the batteries.
`Alt`+`1`…`4` takes or hands back a subordinate command; the posture button
sets the standing order it fights on while you are somewhere else; and at
national command the reserve strip releases four rounds at a time to a sector
that will not see them for four minutes. Batteries in a command you are not
holding are shown detached, with their controls disabled — they are still on the
board and still shooting, they are simply not on your net.

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
  echelon.js            the four appointments, and how little each one may touch
  geography.js          the country: rivers, ridges, roads, frontier, towns
  revelations.js        what the operator works out about their own side, and when
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
- **The promotion is one number.** `directLimit` — how many subordinate commands
  an appointment may hold at once. Everything else about high command falls out
  of it: the standing order matters because you cannot be everywhere, the
  handover matters because changing your mind is not free, and the political
  officer matters because he is running a quarter of the country while you are
  looking at a different quarter. A battalion watch has one formation and is
  therefore bit-for-bit the game it always was.
- **Subordinates are fixed before the raid starts.** A sector commander's
  competence and their reading of their orders are set at build time and nothing
  you do changes either. That is the actual experience of commanding through
  other people, and it is why the only lever you have is what you said before
  you left.
- **Eagerness is the price of delegation.** Crews on weapons free snap the
  earliest shot at whatever is nearest; net assignments hold for the sweet spot
  when the target's time-to-impact allows and fire instantly when it does not —
  a terminal cruise missile grants no second chances. Launch geometry is priced
  at intercept (`edgeLaunchPk`), so a maximum-range snap shot stays a bad shot
  even against a closing target, and only a credible launch can break a pilot's
  nerve — spraying edge shots used to farm aborts.
- **Discrimination is bought with exposure.** A decoy reveals itself at forty
  kilometres for free — after most batteries have fired — or early, to anyone
  who holds its track above 0.85 quality for thirty continuous seconds, which
  means radars radiating on it. A splashed decoy scores as plywood.
- **The bookends are alive.** Watches open on handover chatter and a spoken
  first contact instead of two silent minutes; an unengaged egressor nothing
  can reach no longer holds the watch open, which removed one and a half to
  four minutes of terminal dead air from every long mission; and the debrief
  waits two and a half seconds so the last splash is actually seen.
- **The event log is capped; its sequence is not.** Everything that consumes
  events keys on a monotonic `seq` — comparing against the capped array's
  length once silenced every sound in the game for the finale's last two
  minutes.
- **The state's ledger grieves by its own valuation.** Losing a place it
  refuses to recognise moves the file not at all, an account at its floor
  keeps being billed (and the bill is shown), and the debrief closes with THE
  FILE AND THE NIGHT — the watch's two currencies, side by side, for every
  decision on which they parted company.
- **Only returns persist.** The phosphor layer holds radar echoes; the sweep is
  redrawn each frame. Painting the sweep into the persistence buffer saturates
  the tube in about four seconds, which is a mistake this code made once.
- **One lexicon.** Every legend on the console comes from `src/ui/lexicon.js`, so
  a switch can never end up labelled differently from the thing it does.
- **Two valuations.** Assets carry `value` (what sector command's ledger says
  they are worth) and `scoreValue` (what they are actually worth). Every
  structure in the game sets these to the same number except one, and the watch
  that one appears on is the watch the campaign turns on.
- **Aeroplanes do not know what things are worth.** Predicting a track's
  objective is a question about its flight path, with value only breaking ties.
  Getting that backwards had contacts flying straight down the Kubin road at the
  hospital predicted as going for the airbase, because the ministry values an
  airbase at thirty and a hospital at eight.
- **The RPG layer is measured, not asserted.** The character tests build a real
  `World` and check that a qualification changed a number in it — a channel
  count, a reaction multiplier, a blackout duration.
- **The last watch is geometry, not scripting.** Its tests assert the properties
  that make the choice real: that the cities are more than 100 km apart, that no
  medium battery covers both, that exactly one battery does and cannot hold both,
  that point defence is sited forward of the release ring, that being overrun
  does not spare the cities, and that every one of the seven endings is
  reachable.
- **A strike package flies to a grid reference, not a live feed.** Sorties record
  the coordinates they were briefed on; if the target has moved by the time they
  arrive, the weapons land on empty ground. That one rule is what makes
  displacing a battery a real way to survive rather than a cosmetic order.

## Credits

Everything here is invented: Trans Mordovia, its air defence forces, their ranks
and decorations, the equipment designations, the language on the panels,
Mostrograd, and the Ville itself. The physics is deliberately simplified — the goal is a system that
*behaves* like an air defence problem, not a fidelity claim about any real
equipment, and nothing here corresponds to a real state or service.

MIT licensed.
