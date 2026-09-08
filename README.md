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
free and walks away by **10% on the mean, winning fourteen of sixteen seeds, on
a quarter fewer rounds, half the decoys and one leaker against ten** — and
beats one who does nothing at all by a thousand points.

That first figure was 22% until the scrub repaired the picture the crews are
working from, and the honest reading of where it went is worth stating,
because it is not the commander who got worse. Paired on the same sixteen
seeds, hand play scores 23976 against 23988 — unchanged to a tenth of a per
cent — while the walk-away arm climbed from 19614 to 21808 and its leakers
fell from sixteen to ten. A correlator that issued four hundred track numbers
for thirty aeroplanes, and a battery that could never radiate again once its
acquisition antenna died, were costing the AI crews far more than they were
costing a person, because a person compensates and a duty cycle does not.
Some of the dividend was the machine being crippled. The part of it that is
real — a quarter fewer rounds, half the decoys, and the leakers — is
unchanged, and buying the score gap back up is a design job for the watches,
not a reason to break the crews again.

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
the Kubin road, and obedience loses the building on five nights of eight while
a deliberate defence saves it on all eight):

| | Standing | Score |
|---|---|---|
| Obey the freeze | **93** | 657 |
| Defend it anyway | 91 | **1644** |
| Refuse the order outright | 77 | 1644 |

Defending the hospital is worth a thousand points of actual value, and the
file prices the whole transgression at two: a query for rounds
expended outside the freeze, worth rather less than a leaker. A weapon that
arrives at the struck-off place is billed at exactly nothing — the ledger
cannot simultaneously declare a building undesignated and grieve for it — and
the building's own loss appears on the state's books at nothing at all. Only
the third row really moves. Refusing on the net, for the identical night's
fighting, costs fourteen points more than quietly disobeying, plus a
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
(`c1`…`c8`) with everything on free and nobody at the console, obeying leaves
the camp 68% destroyed and kills a hundred and ten people; refusing leaves it
15% destroyed and kills twenty-five, and costs twenty-five points of standing
plus the referral, which stays in the file. Afterwards you look the grid reference up and
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
loading, displacing, empty) and closed off by a line naming the batteries with
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
  of the reference target's RCS is a bit over half the range, not a tenth — and is
  then capped by the radio horizon, `4.12 × (√h_radar + √h_target)` km. A set's
  quoted range is the range it sees a standard strike aircraft at, so the plate
  and the tube agree: the coverage ring drawn on the scope is where contacts
  actually appear. The horizon is why a cruise missile at ninety metres is not
  seen until sixty kilometres however big the set is — the four-hundred-kilometre
  early-warning radar and the two-hundred-kilometre battalion set both hold it at
  sixty, and that is about two minutes.
- **Track fusion is a service, not a fact.** Plots from every radar correlate into
  one numbered track per aircraft — in the sector operations centre. Destroy that
  building and each radar reports for itself: one aircraft grows a track number on
  every set that can see it, cueing stops, and anything you delegated becomes
  nobody's job. It is the first thing a serious raid goes after, and you will
  finish that mission without it. (A battery still reads its own two antennas
  together, because the acquisition set and the fire-control set share a cabin
  and two people; what the centre took away was reconciliation *between* units.)
- **A track number is a promise, and the sector keeps it.** Plots correlate
  against where the track is PREDICTED to be, through a gate that opens with
  the time since anybody last looked — because a target has had that long to be
  somewhere else, and a velocity estimate three looks old is wrong by more
  kilometres than a fresh one. And a track the sector held is remembered for a
  minute after contact is lost: a raid crossing a seam in the coverage comes
  out the other side as the same aeroplanes, on the same numbers, with the
  identification work already done on them and no NEW CONTACT called. The
  quality has to be re-earned from a single plot, so a re-acquired contact is
  not immediately shootable — it is recognised, not restored.

  This is the difference between a plot board and a snowstorm, and until the
  instruments pass of the gameplay scrub it was a snowstorm: six anti-radiation
  rounds arriving as up to twenty-eight track numbers with three live tracks on
  one of them, sixteen aeroplanes collecting four hundred and thirty numbers, a
  net announcing a fresh contact every four to ten seconds about aircraft that
  were already leaving, and duplicates that were separately shootable so the
  sector spent real rounds on ghosts. Measured over three seeds a cell, numbers
  issued against objects ever detected: Ville Under Fire 261.7 for 39.8,
  Weasel Hour 52.3 for 21.7, Solo Battery 44.3 for 18. After: 81.7 for 38.7,
  27.7 for 21.8, 21 for 18 — and the residue on Ville Under Fire is entirely
  after its operations centre dies, which is the paragraph above working as
  designed.
- **Standoff jamming** imposes a burnthrough range in a bearing wedge, and
  burnthrough *improves* the further out the jammer sits — so pushing it back, or
  killing it, is worth more than shooting at what it is hiding.
- **Decoys** are built to look like strike aircraft and they succeed, until they
  are close enough that their impossibly steady flight gives them away. By then
  you may have spent four rounds on them.
- **Nerve.** A striker that has a round go past its nose may jettison and turn for
  home. It never bombs anything. A miss can win the fight, and the log will tell
  you when it happens.
- **An antenna is not a battery.** A long-range battalion runs two sets and can
  lose one and keep fighting: the emissions switch, the lamp and the harness
  all follow whichever antenna is still standing. Lose the GUIDANCE set and the
  battery is finished for the watch — it drops the engagements it can no longer
  guide so the channel count stops reading four of four over wreckage, and the
  cabin says АНТЕННЫ УНИЧТОЖЕНЫ · ANTENNAS DESTROYED rather than advising the
  operator to select a target.
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

**Two of them contradict each other, on purpose.** Sector command wants the
sets up, because sector command wants the picture and has to answer for what
gets through. The political section wants them down, because it has read the
loss returns and because an emissions log is a thing that can be produced at a
hearing. On a watch where somebody is shooting at antennas you will be asked
for both, and you will answer both. Accepting the emissions restriction binds
your crews the way every accepted order binds your crews: a battery with
nothing near it and nothing to guide stops running its search sweeps, so the
sector genuinely sees less, which is the trade. What it bills YOU for is a
battery you held up by hand with nothing in reach — a deliberate act, priced
like one, the same shape as spending rounds outside the freeze.

That order is only answerable because the switch on the battery card now
works. Every battery nobody is sitting in runs its own emissions doctrine once
a tick, and it used to rewrite the lamp unconditionally: the operator's
SILENCE was accepted and undone a tenth of a second later, silently, on the
watch whose stated lesson is emissions control. An order from the net now
stands for the rest of the watch and the card says **ПО ПРИКАЗУ · BY ORDER**
so you can see whose switch it is. The one thing that still overrides it is
the crew's anti-radiation duck, because nobody at a set dies for a switch —
and the commander who wants them to has RIDE for exactly that.

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
`R` sends the selected battery's loaders out — the rack fills itself whenever
the rails go bare, and this is the order to fill one that is merely short —
and `X` displaces.

**SAM operator:** click to designate, `L` to lock, `F` to fire, `E` to radiate or
shut down — that last one is the whole game. `R` is LOADERS OUT: the tube lamps
go green one at a time on their own when the rails run dry, and this starts them
early, on a rack that is only half spent.

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
tools/                 static server, browser smoke test, and playtest.mjs —
                       four scripted operators playing every seat of every watch
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
- **A sortie you turned back is a sortie you stopped.** Breaking a raid up is
  the second of the two ways to win a watch, and it was invisible half the
  time: the counter only ever moved when an aborted aircraft finished flying
  off the map, so one that turned under fire and was still on the board at the
  end went uncounted and unpaid. Probed over forty-eight teaching watches,
  seventy-nine sorties aborted and six were counted, with twenty of the
  forty-eight ending with an aborted aircraft still airborne — and the debrief
  printing TURNED BACK 0 over a ticker that had announced them by name. They
  are counted at settlement now, at the same eighteen points as one that flew
  home. Over the 896-run campaign matrix not one watch changed hands and
  per-mission mean score moved between +0.1% and +6.9%, the two largest being
  the two watches whose raids abort most.
- **The ticker says a thing once.** A refusal repeated is a refusal nobody
  reads, and it costs the operator the watch's actual traffic to say it: one
  First Light cabin watch printed two hundred and eleven copies of NO FIRING
  SOLUTION, and at nine minutes every visible line was that sentence. Refusals
  now go through one gate at twenty seconds — the interval the engine already
  used for a set announcing it was shutting down — keyed per battery and per
  reason, so two batteries declining the same track are still both heard. And
  the shootlist's UNPAIRED count is work you can actually do: contacts nothing
  of yours can reach stay on the panel under OUT OF REACH with their reason,
  and neither the count nor the red header sees them. It was telling the
  operator they were failing at ten contacts that were all outbound, for six
  minutes, in a coda.
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
- **Every seat is playtested by machine.** The suite proves the engine is
  correct; `tools/playtest.mjs` proves the game is playable, which is a
  different question. It builds a real `World` and drives it through the same
  public calls the console does — assign, fire, radiate, salvo, acknowledge,
  take a sector — with four scripted operators: **nothing** (never touches a
  control: the floor every other figure is read against), **novice** (notices
  at forty-five seconds, works one contact at a time, eight seconds to react
  and six more to press LAUNCH), **competent** (radiates at once, hands every
  firm hostile to the best battery that can take it, blinks under an
  anti-radiation round) and **expert** (competent, plus priority by
  `engagementValue`, salvo sizing, a duty cycle on its own set, RIDE when its
  rounds land first, DISPLACE when the position itself is the objective, the
  national reserve committed whole to the formation carrying the raid, and
  standing in the sector under the main effort). It
  writes down what the watch *felt* like: time to the first legal shot, time
  to the first hostile actually inside an own battery's envelope, the first
  round away, dead air over thirty seconds, how much of the watch had a shot
  nobody took, how much of it was spent with the magazine as the only thing in
  the way, how much of *that* was the loaders rather than an empty store, and
  how much of it the seat spent with no surviving guidance antenna anywhere.

  Two of those verbs were added by the scrub, and the reason is worth keeping:
  no player model had ever pressed DISPLACE or released the reserve, so the
  line of the difficulty bar that asks whether skill buys anything was being
  judged on three watches without the two most expert-flavoured actions on the
  console — and reporting their absence as "this watch has no depth". On the
  finale, from both seats over eight seeds, adding them takes the expert from
  0 of 8 watches held and a mean of −455 to 6 of 8 and +1064. Its most useful finding so far is a table it disagreed with:
  measured over eight seeds a row, this player refuses nothing in the whole
  campaign, because acceptance binds your *subordinates* and the operator
  defends the place anyway — refusing the border restriction scores identically
  to the decimal on both seats, refusing the expenditure freeze scores the same
  on the net and slightly worse from the cabin, and each costs nine to
  twenty-five points of standing. The withdrawal of the district battalion was the one
  exception until the ready rack started coming back a rail at a time, and
  then the district covered the ground without it; a commander who fights
  that district by hand rather than by greedy pairing still does better
  refusing (`test/echelon.test.js`, eight seeds: 1616 against 916, thirty-one
  leakers against forty-seven, and six places lost against ten). Two
  player models, two answers, both measured.
  Reproduce a watch's table with:

  ```
  node tools/playtest.mjs --mission white-noise --seat all --policy all \
    --seeds 8 --jobs 4 --md /tmp/white-noise.md
  ```

- **The rack comes back a rail at a time.** A reload used to put the battery
  at zero ready rounds for its full ninety-five seconds and then drop eight
  rounds in at once, and — because the automatic reload sat inside the AI
  crew's loop, behind the check for whose battery it was — the one battery
  with a person in it never started one at all. The loaders now go to work on
  a bare rack for every battery including yours, and the rounds arrive singly,
  `reloadS / rails` apart. A whole rack still costs exactly `reloadS`, so no
  battery gets a round it did not have before; what it gets is the first of
  them in eight seconds instead of sixty-two, tube lamps that go green one at
  a time, and a bar counting down to the next rail rather than to a full rack.
  Measured over eight seeds in the cabin, competently played, the share of a
  watch with a legal target in reach and nothing on the rails is now 10% on
  Solo Battery, 10% on Low Riders, 20% on Weasel Hour and 10% on First Light.
  Before the rack refilled a rail at a time the same three watches read 15%,
  35% and 40%, against raids half again smaller than the ones those figures
  are measured on now. First Light's is almost entirely the guidance pause
  below, on a tutorial whose reload multiplier is 0.35 — a rail there takes
  4.2 seconds, so it is a tenth of a watch in four-second pieces. (That knob
  was wired during the instruments scrub; the README had been quoting it for
  a while and nothing had ever read it.)

  The half of that number the loaders actually own is small, and the harness
  now separates it (`reloadWaitShare`): six to eleven per cent of a watch. The
  rest is a battery that has fired its whole allocation, which no amount of
  loading faster will touch. Where that was the binding constraint the
  *allocation* was fixed rather than the hoist — Weasel Hour and Low Riders
  carry a `storeMult` in their own files, because sixteen rounds behind an
  eight-round rack is right for the watches those numbers were written for and
  not for a suppression watch with sixteen aeroplanes and six anti-radiation
  rounds on it. Weasel Hour's cabin was spending all twenty-four of its rounds
  and then watching 43% of the night go past.

  Two restraints on it were chosen by measurement rather than by taste. The
  loaders do **not** start while the launcher still has a round of its own in
  the air, and they do **not** top up a rack that is merely short. The first
  carries the campaign: let a battery load through its own guidance run and it
  never stops shooting, free crews gain more from that than a commander does,
  and the White Noise attention dividend falls by eight points of score — with
  a leaker appearing where there were none. That measurement was made again
  from scratch after the raid tables were retuned and it reproduces, which is
  worth saying because the pause is also what most of the residual
  sole-limiter share above actually is. It is a price, it is paid knowingly,
  and it buys the direction of the one number the whole game rests on. The
  second is a closer call and the source says so: topping up costs the
  dividend nothing and is worth a hundred and forty points to a competent
  commander on Low Riders. What it costs is the RELOAD key, which would then be duplicating
  something doctrine already did — and the expert's margin over the competent
  player at the seats where that key is the difference collapses with it.

  RELOAD survives as **LOADERS OUT**: the order that overrules both of those
  restraints, for your battery and your battery only. The second one is what
  it is really for, and it is the only control in the game that does something
  doctrine will not — the rails bare, something inside the ring, and the crew
  standing back because the launcher is still guiding. Overruling that safety
  with a raid on top of you is a judgement a person makes and an AI crew never
  does, the same shape as RIDE.

  It borrows nothing: same rail interval, same `reloadS` for a full rack, same
  store paying for every round. **What it buys is tempo and not rounds**, and
  the measurement says so plainly. Sixteen seeds a watch in the cabin against
  an operator who never touches the key, the share of the watch with a legal
  target in reach and nothing on the rails falls by roughly two thirds on
  First Light, three quarters on Solo Battery and a quarter on Low Riders —
  while the score does not move outside the seed noise on any of the four. A store is a store;
  every round the key puts on the rails now is a round not there later. That is
  the honest finding, it is why nothing has to ration the key, and it is why
  the ladder on this one button reads novice-mashes-it, competent-never-
  touches-it, expert-presses-it-in-the-one-state-doctrine-will-not. Two other
  rules for pressing it — whenever the rack is short, and whenever it is below
  half — both measured *worse* than leaving it alone, because they spend the
  store into a lull.

- **The net does not go quiet, and it says why.** Every watch has stretches
  with nothing shootable in them — a package turns for home, one straggler
  drifts thirty kilometres outside everybody's ring and takes three minutes to
  walk into a LANCE. Those are the shape of the fight. What was a defect is
  that the console fell silent through them, so a new operator could not tell
  "there is nothing you can do yet" from "you have missed something": measured
  over eight seeds of four watches, the worst such silence ran two hundred and
  twenty-two seconds. After twenty-five seconds with nothing at all on the
  ticker, sector reports what it is holding — the contact, its range, and
  which of your batteries will reach it and in how long, which turns a blank
  screen into a countdown. With every set cold it says that instead, because a
  watch spent blind is not a quiet watch. Measured across four missions, three
  seats and four player models, the longest silence on any of the 320 watches
  fell from 556 s to 25 s and dead air over thirty seconds went to zero
  everywhere, including the do-nothing floor. It also has to not be a tape
  loop: the first version cycled its variants on a counter and printed the same
  sentence eleven seconds apart, and one identical held-contact line eleven
  times across five minutes. It now refuses to say the same thing twice
  running, and will only report the same contact again after a minute, in
  different words.

  **How much silence is actually left, honestly measured.** The figures above
  were taken with a detector that counted ANY logged line as activity —
  including the `info` echo of the operator's own switch, and including a
  fresh NEW CONTACT every few seconds from a correlator that was inventing
  aeroplanes. Against 896 runs it reported zero holes and a worst silence of
  twenty-five seconds everywhere, on watches the playtesters described in
  prose as five minutes of nothing. The instruments pass of the gameplay
  scrub fixed both ends of that. The reading now: 457 of 896 runs carry a
  stretch of thirty seconds or more in which nothing was engageable, nothing
  was in flight, no order was pending and nothing an operator would look up
  for reached the ticker; the worst single stretch is 398 seconds; the worst
  watch spends 51% of itself inside one. That is not new behaviour — it is
  the first honest reading of behaviour that was always there, and it is what
  the pacing work now has to answer to.

- **The watches are not all the same length, and one of them is deliberately
  short.** Median watch length at 1x runs twelve to fourteen minutes across the
  first four watches and fourteen to eighteen later, with two documented
  exceptions. The President's Flight is a single escort problem and ends when
  the aircraft is down or away, at just under eight minutes. **First Light is
  four contacts and then two, high and unhurried, with a five-step interactive
  tutorial, a cut-down console and a reload multiplier of 0.35** — it is the
  watch that teaches the scope, and it runs five and a half minutes on
  purpose. It was measured at eight minutes once, and one seed in five ended
  the first watch of the game on a ninety-five-second reload bar with a single
  blip on the scope; that multiplier is what stops it, and until the
  instruments scrub wired it, nothing read it.

- **The last aeroplane of the night arrives in the second half of it.** Every
  watch used to be front-loaded: measured over eight seeds, the last hostile
  spawn landed at 29% of the watch on First Light, 41% on Low Riders, 35% on
  Weasel Hour and 52% on Solo Battery, and the rest of each was survivors being
  chased off the map. Worse, the chase decided the watch — one First Light seed
  spent its last three minutes on a single aircraft missed at 165 s, 275 s and
  333 s and finally killed at 386 s, so the tutorial ended when the dice
  agreed rather than on a designed beat. Each of the four now carries a late
  element that arrives close in and is engageable the moment it appears: the
  last spawn sits at 60-73% of the median watch on the four, and no watch in
  the set ends more than a minute and a half after its last engagement
  resolves except one Weasel Hour seed at 101 s. Across the campaign the same
  figure runs 39-73%, and the five watches under 55% — Across the Line and
  Ville Under Fire at 39%, Two Cities at 39%, White Noise at 46%, Economy of
  Force at 50% — are front-loaded raids with long codas, which is the pacing
  work those watches still owe. Late packages are deliberately spawned at fifty to
  sixty-five kilometres rather than the engine's default hundred and fifty-five,
  because an ingress nobody can reach is not pressure, it is a countdown — and
  pulling Weasel Hour's whole raid inside BASTION's reach took its worst seed
  from 22.6 minutes to 18.9.

- **How hard each watch is, measured rather than asserted.** Held rate over
  eight seeds a seat, `tools/playtest.mjs --policy all`:

  | Watch | nothing | novice | competent | expert |
  |---|--:|--:|--:|--:|
  | First Light | 0-75% | 100% | 100% | 100% |
  | Low Riders | 0% | 0-88% | 63-100% | 88-100% |
  | Solo Battery | 0% | 38% | 75% | 88% |
  | Weasel Hour | 0-50% | 38-100% | 88-100% | 88-100% |

  (Ranges are across the three seats; Solo Battery has only the cabin. At
  eight seeds one watch is twelve and a half points, so read a single cell's
  spread as noise and the columns as the shape.)

  Three things in that table are deliberate and worth stating plainly, because
  they are the exceptions to the campaign's own difficulty rule (competent
  should hold six to nine watches in ten, novice a quarter to three-fifths).

  **First Light is exempt, and it is the only watch that is.** It is the
  interactive tutorial: five steps, a cut-down console of two controls, and a
  brief that says nothing is shooting back at you tonight. A teaching watch that
  fails a learner is a teaching watch that has failed. What it must do instead
  is fail the *spectator*, and it does: a player who touches nothing holds none
  of eight seeds on the net or from both seats and loses five aircraft, while
  a player who so much as brings a set up and assigns holds all eight from
  every seat. The empty cabin is the exception at 6 of 8 — the sector's own
  crews fight the watch around a silent battery — and it is the reason the
  tutorial seats the player at the net.

  **Low Riders now forgives one leaker, not two.** With nineteen aircraft on
  four axes, forgiving two made an act-2 watch that competent play held 24 of
  24 times — no losing outcome at all. At one it holds 63-100% at eight seeds
  and 75-88% at sixteen, which is a watch you can fail.

  **Novice is shut out on the net seat of the two biggest watches** (0 of 8 on
  Low Riders' net and both-seats, against 88% in the cabin, where the sector's
  own battle manager covers for them). That is not a tuning miss, it is the
  shape of the game: on the net a beginner IS the sector, and the gap between
  handing out two targets at a time and re-pairing the whole sector every three
  seconds is worth three to five leakers a watch. It is the delegation ladder
  seen from the bottom, and it is why the cabin seats exist.

- **A watch that is lost says why it was lost.** Every losing watch used to end
  on the same three words — "WATCH ENDS — SECTOR PENETRATED" — whether four
  aircraft got through because no set was ever switched on, one got through on
  an axis nobody covered, or the position was overrun in the first ninety
  seconds. Now the ticker and the debrief both carry a clause naming the thing
  that actually settled it, read in the order the verdict is decided in:
  overrun, then a place that cannot be lost, then the count — and if nothing of
  yours ever radiated it says *that* instead of the count, because the count is
  the symptom.

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
