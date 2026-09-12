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
So the whole job is knowing when to radiate and when to go silent.

Every mechanic hangs off that trade. Most sharply: a surface-to-air round is
guided by the radar that launched it. Shut that radar down to dodge an incoming
anti-radiation missile and the round you already have in the air goes stupid and
falls in a field. Leave it up and you may not be there when the round arrives —
or give the one order the crew will never give itself (`G`, the beam switch at
**ДЕРЖАТЬ ЛУЧ / HOLD BEAM**) and keep guiding with the enemy's round inbound on
your own set.

And attention is priced. A crew on weapons *free* engages at first opportunity:
the earliest shot there is, taken at the edge of the envelope where kill
probability is worst, at whatever is nearest — including the decoys. A net
assignment holds for a sweet-spot shot when there is time to spend, skips the
contact whose impossibly steady flight a well-held track has already given away,
re-engages after a miss while the shot is still its own, and hands a runner off
to the next layer in when it is not. Measured over sixteen seeded watches of
White Noise, a commander who works the picture beats one who sets everything
free and walks away by **30% on the mean, winning fourteen of sixteen seeds, on
29% fewer rounds, 39% of the decoys, six leakers against twenty-five and one
structure lost against ten** — and beats one who does nothing at all by
two thousand points.

That figure was 22% before the instruments scrub, then fell to 10% when the
scrub repaired the picture the AI crews are working from — a correlator issuing
four hundred track numbers for thirty aeroplanes, and a battery that could
never radiate again once its acquisition antenna died, were costing a duty
cycle far more than they were costing a person, because a person compensates.
The note left at the time said that buying the gap back up was a design job for
the watches and not a reason to break the crews again, and the act-two pass is
where that was done: White Noise now runs two axes and nineteen strike
aircraft instead of one axis and twelve, so there is a real pairing decision in
it and the walk-away arm concedes twenty-five leakers to the commander's six.
The margin is honest work by the player, not a handicapped machine.

And then Ville Under Fire takes the operations centre off the air mid-watch —
one weapon through the roof is enough, and the building need not fall for the
fused picture to — cueing dies with it, and the same sixteen seeds run the other
way: the released crews take the mean and the two postures trade per-seed wins,
exactly as the brief warns — *anything you delegated becomes nobody's job*.
There is no posture that is right twice. Working out which lever each watch
answers to is the job, and both shapes are measured into the regression tests
so neither can quietly rot.
Delegation is viable — over twenty-four seeds of White Noise the AI net laid
over free crews scores 0.98 of what those crews score alone, where it used to
subtract about twelve per cent — and one more thing about it is true: crews
follow the orders you acknowledged. Accept the expenditure freeze and no
battery on free will defend the hospital for you. Quiet insubordination
requires the pen.

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

The order arrives at a hundred seconds, with the western probe committed and
the covering battery firing. It used to arrive at forty-five — fifteen seconds
after first contact, with one aircraft on the plot at a hundred and fifty
kilometres and the first hospital-bound track still a hundred and five seconds
from existing. The campaign's central decision was being answered before there
was anything on the board to weigh, and a player pressed Y and felt nothing.

Then the evening shows two numbers side by side — the standing and the score —
which have moved together all campaign and here move apart (means over eight
seeded watches, competently fought — reproduce them with
`node tools/measure-moral.mjs`; the hospital package comes in on the deck, down
the Kubin road, and obedience loses the building on four nights of eight while
a deliberate defence saves it on all eight):

| | Standing | Score |
|---|---|---|
| Obey the freeze | **51** | 48 |
| Defend it anyway | 34 | **380** |
| Refuse the order outright | 11 | 380 |

Defending the hospital is worth about three hundred and thirty points of actual
value — it is the difference between losing the building on eight nights of
eight and on three — and the file prices the whole transgression at seventeen:
a query for rounds expended outside the freeze, worth rather less than a
leaker. A weapon that arrives at the struck-off place is billed at exactly
nothing — the ledger cannot simultaneously declare a building undesignated and
grieve for it — and the building's own loss appears on the state's books at
nothing at all. Only the third row really moves. Refusing on the net, for the
identical night's fighting, costs twenty-three points more than quietly
disobeying, plus a referral that stays in the file. Sector command barely
prices what you did. It punishes having said no, and that is the whole lesson.

(Those figures fell a long way in the curve scrub, and both roads fell
together. This watch now flies four on the deck at the airbase out of a bearing
nothing has ever come from, so the freeze is finally an order about rounds
somebody else needs; a night that costs the sector something costs both
answers something. The three rows moved from 90 / 652, 89 / 1850 and 76 / 1850
and kept their order and their signs, which is the part the campaign rests on.)

**Across the Line** goes further. A cruise missile has strayed off course, west
over the ridge and across the Listonian border, and it is going to come down on a
camp at Gorna — four hundred Trans-Mordovians who left, living in tents, whose
continued existence the ministry does not enjoy. Two batteries hold it
comfortably. Sector command's position is that engaging outside national
territory is a border incident.

Two batteries hold it, and until the act-two scrub that sentence was a lie the
engine would not honour. The strays flew at 110 m and 95 m; BASTION's altitude
floor is 120 m, so the battery the brief names in the same breath as "reaches
it with sixty to spare" could not legally engage either one at any range, ever,
and the only seconds in which the console said otherwise were the altitude
estimate's own noise lifting the target over a floor it was under. LANCE WEST's
legal window was a median fifty-five seconds and, on one seed of eight, zero.
The strays now come in at 170 m and 160 m, and `test/revelations.test.js`
asserts both halves of the reach — range **and** height — for every wave aimed
at the camp, so the briefing cannot make that promise again without the wave
table keeping it.

Acknowledging it stands your own subordinates down: no officer and no crew on
weapons free takes that shot on its own authority afterwards, so the camp is
defended by you personally or not at all. Measured over eight seeded watches
(`c1`…`c8`) by the same scripted hand on both roads — reproduce it with
`node tools/measure-border.mjs`:

| | Camp destroyed | Dead | Standing | Score |
|---|--:|--:|--:|--:|
| Acknowledge the restriction | 100% | 154 | **75** | 478 |
| Refuse it and take the shot | 13% | 22 | 46 | **1502** |

Twenty-nine points of standing and a referral that stays in the file, against
four hundred people and a thousand points the file does not recognise. And
note which player model lets them burn: the harness's *expert*, who has the
whole craft and eighteen rounds to spend it with, scores 30% BELOW the
competent player here and holds nine watches of sixteen against its twelve.
This is one of exactly two watches in the campaign where careful play is worse
than competent play, and the other one is Economy of Force — the two with the
smallest allocations, and the two the campaign turns on. What it costs itself
is measured in the design notes: the pair of rounds it spends on the aeroplane
in front of it, which is right on the ten watches with rounds to spare and
wrong on the two without.

Afterwards you look the grid reference up and find it handwritten inside the
back cover of the sector target folder, in a folder that has no business
containing a point in Listonia at all. The word for what happened over Gorna is
not "stray".

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

And the other thing that watch promises — *"when it goes, the picture stops
being one picture… finish the watch anyway"* — did not happen. `loseCentralControl`
ran only when the operations centre was **destroyed**, and a destroyed critical
asset is an automatic SECTOR PENETRATED, so the decapitation and the defeat were
the same event and the watch had exactly two states. Measured over eight seeds
and all twelve cells: SECTOR OPS OFF THE AIR fired on **zero** of eight
competent nights on the net, zero of eight expert nights, and zero of eight
expert nights in the cabin. The lesson was unreachable by anyone who could hold
the sector.

A critical place now loses its function before it loses its walls
(`ASSET_TYPES.c2.offAirFrac`): at forty per cent of the building's hit points —
one weapon through — the fused plot stops being reconciled, cueing stops, and
anything you delegated becomes nobody's job, while the building itself still
stands and the watch is still winnable. Same eight seeds: the picture now dies
on **five of eight** competent nights on the net with the building lost on one,
four of eight from both seats with the building lost on one, and three of eight
in the cabin with the building lost on none. The decapitation happens, and you
finish the watch.

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

## The evening

A watch does not end on a page of tables. It ends the way an evening does:
the tape comes out of the printer into your own hands and types the night as
figures, a line at a time; you are stood in front of the political section,
whose commissar reads the log back to you — the hospital, the encampment, the
priority you refused — before the file entry and a dismissal that depends on
the tier; an order of appointment is read when there is one; a watch that has
taught you something puts the folder on the desk; and the letter from home,
when one comes, is read in quarters with the snow going past the window. The
last watches end on the valley at first light, or under a red sky. Every
scene is drawn — there is not an image file in the game — at 320 by 180 and
scaled in whole pixels, with the words laid over the picture as type, and a
key or a tap finishes a line and moves to the next; SKIP goes straight to the
card at the end, where STAND ANOTHER WATCH sits beside THE FULL REPORT, which
is the old page of tables, kept for anyone who wants the arithmetic.

**And the beginning.** Every watch opens first person, in the same drawn
style: the walk up to the console in the dark, with the watch's own hour on
the wall; the chair, as the view drops and your hands come to the desk; one
breath; your card into the reader — its lamps come up blue when the reader
sees it and green when it is seated — and the set booting, a dot on the glass
growing into rings and a sweep while the lamps come up in order, which ends on
the first live frame. Nobody speaks. Each beat runs its length and goes on by
itself, a key or a tap goes on early, and Escape or SKIP goes straight to the
console. The clock does not run until the boot ends: the console under the
scenes is the real one, but the watch's phase is held until the operator is
in the chair, and the smoke checks it.

## Two seats

Both are the same simulation. What changes is which half of it you drive; the AI
fills whichever seat you are not sitting in.

| Seat | You run | The feel |
|---|---|---|
| **Battle Manager** | The fused sector picture. Identify contacts, assign them to batteries, set weapons states, manage emissions across every radar you own. | Wide and cerebral. You will spend the whole watch deciding what to ignore. |
| **SAM Operator** | One battery. Your own radar's coverage, cues over the net — or your own call, which the net answers — and the acquire → lock → launch → guide loop by hand. | Tight and personal. The rounds come at *you*. |
| **Commander** | Both — run the picture, and take a console yourself when a shot matters. | Delegate, then grab the one that counts. |

**On your own authority.** The cabin can lock anything its battery can
physically take, cue or no cue. The net calls targets to you by name — a caret
on the row says which — and a contact it did not call is yours to take, under
one condition the console prints before you press LOCK — "NOT CUED — ON YOUR
OWN AUTHORITY": a shot at it is yours to answer for. The net answers the first round on the radio ("WHO CLEARED THAT
SHOT? YOU HAVE NO ORDER ON T-004."), the file is charged by what you fired at —
two points for a firm hostile, five for a contact nobody had identified, ten for
a friendly one, and ten more if the friendly one comes down — and the political
section speaks a few seconds later when it was more than a hostile, and again
at the third unordered engagement of a watch. The debrief counts them, the
commissar reads them back in the evening. None of it applies to a cue, and none
of it applies to a crew whose formation was put on WEAPONS FREE by order,
because free means exactly that; your own switch on the console is not an
order, and the net knows the difference.

The air picture down the left is not one list. It is a set of shootlists:
everything nobody is on, at the top, under a heading that turns red while any of
it is hostile — that section *is* the job — and beneath it one list per battery,
each headed with whether that battery can take another one (rounds ready,
loading, displacing, empty) and closed off by a line naming the batteries with
nothing to do. A contact two batteries are both on appears under both. From the
cabin you see your own board and nothing else, which is all you would have. The
glass under your own picture, though, carries the same ground the sector scope
does — the places you are defending by name, the town, the river, the roads, the
ridge you cannot see over, your own battery named at the middle — and the place
the standing order is about is ringed on it exactly as the sector scope rings
it, so the seat always knows where it is and what it is standing in front of.

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
  worked until about sixty kilometres however big the set is — the
  four-hundred-kilometre early-warning radar and the two-hundred-kilometre
  battalion set both hold it there, and that is about two minutes. Held there,
  not blind beyond it: in this model the horizon is the range at which a low
  contact paints on half of a set's scans, and the return fades past it — two
  fifths at a tenth beyond, a sixth at half again, one scan in ten at three
  quarters beyond — rather than stopping dead, so a low contact is glimpsed
  before it is held. Measured on Low Riders, the battalion's 26 m mast had a
  striker at 130 m on its board at 93 km, twenty-five past the 68 km horizon.
  A wall there instead of a fade was measured too: Across the Line goes from
  eighty-one per cent held to none, Economy of Force from sixty-nine to
  forty-four, and every cut short of the fade's own tail moves the district
  and national watches by a night either way. The fade is what the campaign
  was tuned on, and it stays until that is decided on purpose.

  The cabin's range-and-height chart draws that same formula inverted for its
  own mast — the ground out to 4.12 √h km, then (r / 4.12 − √h)² — tagged with
  the antenna height, titled with what the line means, and prints where the
  line crosses a hundred and three hundred metres ("100 m · 62 km" on the
  battalion's chart), because on a chart whose height is the weapon's ceiling
  the horizon hugs the floor and a line that hugs the floor looks like a
  mistake. A test holds the chart to the formula and the fade to its figures.
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
its own hardware, so the campaign visibly changes equipment as it escalates.

**Act I — battalion command.** *A cathode-ray cabin. Four batteries in one valley.*

| Watch | Teaches |
|---|---|
| First Light | Tracking, assignment, and that a radar has to radiate to see |
| Low Riders | The radar horizon. Low contacts arrive close and stay close |
| Solo Battery | The whole engagement loop from the seat, alone *(operator only)* |

**Act II — sector command.** *The same cabin, a bigger board. A sector,
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

An officer is three things, and the third one is what makes the appointment a
decision. He looks at his board every second or two rather than continuously;
he waits for a contact to look properly dangerous before he spends a round on
it; and **he can personally direct three engagements at a time and no more** —
one man, one radio, one map. The first two are rates and do not care how much
is coming. The third does: a package that arrives in file is four problems he
can solve one after another, and a package that arrives together is four
problems of which he can hold three. His card says so, and turns, and says
HANDS FULL.

That leaves exactly two answers, which are the appointment's two verbs. Go and
stand in the sector yourself — a formation under your own hand takes no orders
from its officer and is limited only by its batteries' channels — or take the
crews off his hand entirely with WEAPONS FREE, and let them engage what enters
their own envelopes on their own authority. Free is not a better setting. The
crews shoot nearest-first rather than most-dangerous-first, they snap at the
edge of the envelope instead of holding for the sweet spot, and they spend the
store doing it; a sector left free through the first two packages meets the
third on an empty rack. Measured over eight seeds on Four Sectors, standing in
the main effort is worth 11% of the watch's score and the standing orders are
worth 26%, and the one-click strategy that used to beat both hand players —
set every sector free at the top of the watch and never touch another control —
now finishes 3.3% behind an expert's hands.

The political section's colonel is the fourth sector's whole point, and his
obedience reaches his crews and not only his radio: a formation whose commander
will not expend a round outside the priority of fires does not expend one on
WEAPONS FREE either. Until that was true, one press of the standing order
deleted the device the district act is built on. He says so on the net, once,
naming the place he is declining to defend, so the connection between the order
you acknowledged and the sector that has gone quiet is available to be made
while there is still time to do something about it.

**Reinforce the Capital** is where the corruption arc stops being about your
own conscience and starts being about equipment. The directorate withdraws your
long-range battalion — the only thing that reaches two of your four sectors —
for a capital that is not under attack, has not been under attack all week, and
whose air picture you are looking at. Obeying keeps your file and costs the
district ground. Refusing saves it and ends your career. Measured over eight
seeds with a commander who actually fights the district: obedience scores 1028
against refusal's 1523, and thirty-six points of standing against zero;
refusal keeps weapons off the district on all eight nights — twenty-nine
arrivals against forty-one — and loses six places against obedience's eight.
The two documents disagree by about five hundred points and the Lozan power
station on two nights of eight, and neither of them mentions the other.

The four officers on this watch are the district's own establishment and are
deliberately left alone. Spans of control were tried here and taken out again:
an officer holding fewer engagements at once pushes more of the fight onto the
crews the withdrawn battalion was covering, and over the same eight seeds the
district's ground outcome inverted — ten places lost refusing against four
obeying, which is the opposite of what this level exists to say. Four Sectors is
the watch about the appointment. This one is about the order.

**The order now arrives with the battalion in the middle of something.** It used
to fire at fifty-five seconds — fourteen after the first contact, a hundred
before any battery had a legal shot, with the expenditure counter reading 0 of
36 — so the watch whose whole subject is what a redeployment order COSTS asked
you to answer it on an empty night, and obeying then cost the seat its own first
shot: a hundred and forty-eight seconds against a spectator's seventy-eight, the
worst first shot in the campaign. It now lands at a hundred and sixty-five, with
BASTION DISTRICT holding four tracks and its channels full, the brief's promise
of the order "in the next few minutes" finally true, and the sentence being put
to you the one the watch is about — *give me the battery that is currently
firing*. First legal shot: 148 s → 78 s.

### The last watch

Two formations cross the frontier eleven minutes apart on divergent axes. One is
tracking Mostrograd and the presidential palace. The other is tracking the
valley, and there is nothing in the valley but the river crossing and your
village.

The two are 117 kilometres apart. No medium battery covers both. Exactly one
does — the long-range battalion sitting halfway between them — and it has four
channels and sixteen rounds against twenty-two aircraft, which is the point of
it being there. There is no resupply: the depots are committed to the capital,
so the battalion has one refill in its own store and every other battery has a
third of one.

And a third formation is tracking the post you are sitting in, which is where
that battalion is. Answering it spends the rounds the cities need; displacing to
survive takes the only battery that reaches either city off the air for three
and a half minutes. There is no arrangement of those rounds that serves all
three.

**And that sentence had stopped being true against the player who arranges
nothing.** Measured over eighteen seeds with every battery set WEAPONS FREE and
the AI net running the picture — the one-click strategy — both cities AND the
post came through on eight of them. A trilemma a standing order solves half the
time is not a trilemma, and the six-seed regression test that guards the
property was passing on the seeds it happened to draw. The answer is the
campaign's own device rather than a heavier raid: four air-launched decoys now
come down the capital's axis at three and a half minutes, a hundred and twenty
kilometres out and forty-five seconds ahead of the missiles behind them. A crew
on weapons free snaps the earliest shot at whatever is nearest, which is
precisely what a decoy is built to be; a commander reading the shootlist pays
nothing, because the tell is thirty seconds of a well-held track or forty
kilometres for free. Eighteen seeds after: **one**. Nothing else about the raid
or the store moved, the net seat holds 69% competently played over sixteen
seeds exactly as before, and its score spread fell from a coefficient of
variation of 0.55 to 0.31.

It has to be answerable, and for a long time it was not. The package for the
post released at about ten minutes, and BASTION — the battery the post travels
with, and the only one that reaches either city — was dry at five and a half:
YOUR POSITION WAS OVERRUN happened at every skill level, in seventy-three per
cent of runs including the walk-away, and the one thing that saved it was a
single press of DISPLACE which cost nothing because the rack was empty anyway.
A trilemma with one free answer is not a trilemma. The third axis now arrives at
two and a half minutes with rounds still on the rails, the net says so out loud
(*the third formation has turned in on this post; it is not tracking either
city*), and every battery carries a small store behind its rack — a third, and a
full refill for the battalion — because a watch decided by a hoist is not a
watch about a choice. Measured over eight seeds: overrun in 73% of runs → 0% at
competent play and above, competent 25% of watches held → 69% on the net over
sixteen seeds, expert 0 of 8 → 13 of 16, and the magazine's share of the
cabin's watch down from 65% to 50%. (The last four figures are re-measured on
the honest leaker count — nine of this board's twenty-eight aircraft are cruise
missiles and none of them could fail the watch before the curve scrub — which
is also why the allowance in the file reads four rather than three.)

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
the rails — and there are seven endings, **none of which is clean**. Obedience is
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

Eight enemy fighters are already up for it, in two flights. They ignore the
ground entirely — no radars, no batteries, no city — and fly lead pursuit on the
one aircraft they came for, one round each, off one pass, from twenty
kilometres. Every fighter you stop before its launch point is a round that never
leaves the rail, and twenty kilometres is inside the reach of the battalion
holding the corridor, so stopping them is a shooting problem and not a hope. It
was four fighters releasing from twenty-six kilometres at a kill probability of
0.55, and that arithmetic made the ending a coin flip: with the best corridor
play the console allows, exactly one round still left a rail on eight seeds of
eight, and a player who stopped three fighters and a player who stopped none
faced the same draw. Meanwhile a
strike package is coming for the palace and the field, and the long-range
battalion that reaches the whole departure corridor is the same battalion those
raids need.

**And the corridor is yours, which it had never actually been.** The brief's own
sentence is that one battalion cannot cover the corridor and the city at once —
and it was false, because a second formation was covering the corridor for
nothing. The capital sector is commanded by a colonel of the political section,
the campaign's most carefully built device, who expends rounds only on what the
priority of fires names; on this watch nothing named anything, so the one
officer in the game written never to help was shooting down the fighters on his
own initiative. Measured with nobody at the console at all, sixteen seeds: five
of the six fighters were dead before they launched and the aeroplane lived
through five of sixteen undefended watches, which is why a spectator used to
outscore a competent player here. The capital's priority of fires — the palace,
settled two days ago, by the same section — is now in force from the handover,
and an aeroplane is not on any list of buildings. He says so on the net, once,
the first time he declines: *that contact is not tracking a designated defended
place. This sector holds the priority of fires. The corridor is yours.*
Thirty-two seeds after: a player who touches nothing holds 31% of the net's
watches against a competent player's 75%, and outscores nobody by 51%.

And twice in those seven minutes, the net brings you what STATE 01 wants to
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

**And the file finally knows which one happened.** The watch's verdict used to be
read off the reason, the critical places and the leaker count — none of which the
corridor touches — so on thirty runs of sixty-four the debrief printed SECTOR
HELD beside a flight strip reading DESTROYED, with no cause given, and the
aircraft was worth nothing at all in the score. The aeroplane is now worth six
hundred points, a little under the palace intact and more than anything else on
that board; losing it reads STATE 01 WAS LOST; and the cause clause names who
fired, because a round from these rails and a round from a fighter make the same
wreckage and are not the same act. Measured over eight seeds: a competent player
is now 7% ahead of one who touches nothing on the net and 36% from both seats,
and holds seven watches of eight against its four, where before the aeroplane
was scored the two were 7% and 4% apart and the verdict could not tell them
apart at all. Re-measured over thirty-two seeds after the corridor was handed
back, a competent player is 51% ahead of the spectator on the net and 61% from
both seats, and holds twenty-four of thirty-two watches against its ten.

Nothing asks you which you meant. The tape only records what left the rails, and
whose battery it left from.

## The console

The equipment is Trans-Mordovian and it is stencilled accordingly: bat-handle
toggle switches whose lever position *is* the state, domed indicator lamps,
legend-cap pushbuttons, a screwed bezel around the tube, riveted data plates
carrying a type and a works number, and a high-voltage placard nobody reads.

**Whose a contact is, as a shape.** A contact nobody holds is a plain symbol.
Once a battery has been given it, it wears dashed corner brackets and the
battery's name under its label ("→ BASTION"); once that battery has a round in
the air the brackets go solid and the name takes a missile mark ("▲ BASTION").
The tether to the battery stays, but a faint dashed line across a crowded plot
was the whole of the old marking and the player could not tell an assigned
contact from a loose one at a glance. The cabin's own glass uses the same
shapes on its channels — dashed until the round is away, solid while it is
guiding — and tags another battery's contact with that battery; the shootlist
carries ◇ for assigned and ◆ for a round in the air; hovering a contact says
who has it in words. Everything reverts the moment the claim is released. A
test holds the shape to the engine's state.

**One phosphor.** The glass is the same green on every watch. There used to be
an amber set, and then a flat blue-grey tactical panel on the district and
national watches, and the player said what a palette swap says: "one phosphor
colour, levels visually distinct by other means." So a watch is told from the
last one by what would actually differ: every watch declares its hour, its
weather and the temperature, the glass prints them under the range — "05:12 ·
CLEAR · −3 °C" on the tube, the same line on the cabin's plan view, and on the
posting order — and the chassis around the glass wears the echelon's issue of
hardware and the hour's light. Painted olive steel at the battalion, grey-green
at the sector, the blue-grey of a district command post, anodised grey at
national command; nothing on the metal at night, a cold blue-white at dawn, a
flat daylight on an afternoon watch, a warm dusk on an evening one. The
phosphor is never touched by either. A test holds every watch to declaring the
three, spread over the day, and holds the display to being one.

The plates carry the Cyrillic; nothing else does. A nomenclature plate, the
works plate, a placard, a rubber stamp and the operator's own identity card are
objects with a foundry's lettering on them, and they are what make the panel
read as manufactured:

```
С-200 «БАСТИОН» · S-200 BASTION        П-31 «ШИРОКИЙ ГЛАЗ» · P-31 WIDE EYE
ТИП 4М-2 · TYPE                        ЗАВ. 118-44 · WORKS NO.
ВЫСОКОЕ НАПРЯЖЕНИЕ · HIGH VOLTAGE      ДЕЛО / FILE 3050-10-Б
```

A cap, a switch position, a lamp caption and a readout are read in a second,
with something inbound, so they are in English at a size that can be read at
arm's length. Two languages stacked inside a 45-pixel switch was four lines of
8px type with 8.4px leading, which is a grey smear rather than a control.

None of it is decoration either: the switch you throw to go dark is the same
decision the whole game is built on, and it should feel like throwing a switch.

A switch carries **both** of its positions, engraved beside the lever and never
moving: up is RADIATE, down is SILENCE, one click throws it, and the position
the lever is standing in is a lit window rather than a colour — colour alone did
not survive the fill of the card underneath it. And throwing it moves nothing
but the lever. A lamp's caption is engraved once — the emissions lamp reads
RADIATING for the life of the panel, amber while the set warms up and green
once it is on the air — the seconds on an inbound anti-radar round sit in the
lamp's own figure column rather than in its word, and no row appears or
disappears with the switch's position. Measured across a single press on the
surveillance card, a battery card and the cabin at 1280, 1600 and 1920 wide:
every bounding box on the panel is identical before and after, lever excepted.
A cap carries **one** key, stamped in its own corner rather than added to
the legend — so a control says what pressing it will do, and the key that does
that is printed on it. Weapons state is three latching caps (HOLD · `Q`,
TIGHT · `W`, FREE · `E`) with the live one pressed in, rather than one cap that
printed the state it was in and then moved to the next one when you pressed it.

The caps, the switch positions and the lamp captions are in English, one line
each, and so is everything else the player reads to act: the tutorial card,
the tooltips, the ticker, the roster, the debrief's headings and figures, the
file's field labels, and the name of a rank, a skill or a quarter wherever it
is written in a sentence. The Cyrillic is on the plates — the nomenclature
plate on each battery, the works plate on the bezel, the placards, the stamps,
the identity card — and, small and second, on a medal's name and a class of
weapon in the handbook, which is where a foundry or a mint puts it and where
it can be read at leisure rather than at a glance. The player's verdict on the
earlier console was that it was littered with it, and it was: the lesson card
carried a stencil line under every instruction, the score cells were labelled
twice, and a rank was never once written alone.

Who is sitting at the console is a card in a reader. The player's reference for
it was a photograph of a white smart card pushed halfway into a black desktop
reader with a row of status lamps along its top, and that is what sits in the
console's top strip: a reader whose lamps are instruments — power, the card
read, and an amber one that lights while a directive from the net is waiting
for an answer — and the card standing out of its slot toward the operator,
white plastic on every theme because it is an object and not a display. On it,
surname first, is the holder's name; a photograph drawn from that name, so the
same operator always has the same face; the rank with its insignia; the
appointment; and the service number. The insignia are one family drawn for
all sixteen ranks — brass bars across an olive board for the enlisted, a
stripe and stars for the commissioned, a braided board with large stars for
the generals — and the same board is printed wherever a rank is written down:
the roster, the posting order, the file and the debrief.

A set has one name. The tutorial says "find WIDE EYE", the radio says "WIDE
EYE reports ready", and the card at the top of the rack says WIDE EYE, with
П-31 «ШИРОКИЙ ГЛАЗ» · P-31 WIDE EYE on the plate under it — the same head the
battery cards have, BASTION over its nomenclature. The card used to say P-31
WIDE EYE while the lesson two inches away said WIDE EYE, and a test now holds
every radar a lesson names to a callsign a set actually carries.

## Controls

| Key | Action |
|---|---|
Every key here is stencilled on the control it works, the way the ACKNOWLEDGE
cap has always carried its `Y`. The number on a speed cap is the number that
selects it — `4` selects 4×, and there is no 3× speed, so there is no `3`.

| Key | Action |
|---|---|
| `Space` `0` | hold — the simulation stops; a pending order's clock does not |
| `1` `2` `4` | speed: 1× · 2× · 4× |
| `Tab` | walk the console's controls; `Enter` or `Space` presses the one with the ring |
| `↑` `↓` | step through the contacts on the board |
| `←` `→` | change speed while the ring is on the speed caps |
| `+` `−` | zoom the scope |
| `Y` `N` | acknowledge / refuse a directive |
| `V` | switch seat (commander) |
| `Shift`+`1`…`4` | hand the selected contact to battery 1–4, in the order the cards are numbered |
| `Alt`+`1`…`4` | take or hand back a subordinate command (district and national) |
| `G` | throw the beam switch to HOLD BEAM — guide through an inbound ARM |
| `H` | full controls and a plain-English explanation of the mechanics |

A watch that removes a control removes its key with it: the teaching console
has no SALVO, RIDE or DISPLACE cap, so `S`, `G` and `X` are inert there and say
so once on the log rather than quietly putting your only battery on the road.

Every hint, legend and status line on and under the scope is written for a
person who has never seen a radar: it says what the action does for them
("Click a contact to make it your target"), where the control is, and what
will happen. "Right-click a radar to blink it", "designate", "nothing is being
painted", "no firing solution" and the board's UNPAIRED / UNCOMMITTED are gone
from the console, and a test in `test/console.test.js` keeps them gone. The
engraved one-word legends — READY, RADIATING, INBOUND ARM, LOCK, LAUNCH — stay,
with a plain sentence in each one's tooltip.

On a phone there is no keyboard, and the console is played by touch alone.
Under 900px a thumb rail docks above the ticker and never scrolls, carrying
whichever verbs the seat cannot be played without: NEXT TARGET, LOCK, LAUNCH
and the radar switch in the cabin; NEXT TARGET, ASSIGN and the switch on the
net; and, on a watch with two seats, TO CABIN / TO NET, because the topbar's
seat toggle is not drawn at that width and the cabin is the only view with a
LAUNCH cap. A tap commits the control it started on even if the thumb rolled
a few pixels or the panel moved under it. NEXT TARGET lights only when the
seat's own list has a row to step to — the cabin's list is the battery's own
picture and fills later than the sector's — so a live cap always does
something when tapped; the switch on the rail is as wide as its engraved
legends and never narrower. `tools/smoke.js` drives all three seats end to
end with touch only, in portrait and landscape, with taps that roll between
contact and release, and fails if a legend is clipped, a live cap selects
nothing, or a round does not leave a rail.

**Battle manager:** click a contact to select it, drag it onto a battery to
assign the engagement — or right-click the contact for its menu: every battery
on the net, one row each, with the range to the contact, how long until it is
inside that battery's ring, rounds on the rails and in store, the crew's own
estimate of the shot and whose command the battery is under; one click on a
live row hands the contact over, and a row that cannot take it says why in the
words the refusal on the net would use. The menu key, or Shift+F10, opens it
for the selected contact. Right-click a radar to switch it on or off. `Q`, `W` and
`E` are the three weapons caps — hold, tight, free — three adjacent keys for
three adjacent caps, each printed on the cap it presses; `A` throws the
selected battery's emissions switch — the one key on this console that takes a
battery off the air —
`R` sends the selected battery's loaders out — the rack fills itself whenever
the rails go bare, and this is the order to fill one that is merely short —
and `X` displaces.

**SAM operator:** click to designate, `L` to lock, `F` to fire, `A` to radiate or
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
- **An officer has a span of control, and it is the only one of his limits that
  scales with the raid.** `commander.span` — how many engagements he can
  personally direct at once, three at district and two on the last two watches.
  His competence is two rates (how often he looks at his board, and how
  dangerous a contact must be before he spends a round) and neither of them
  cares how much is coming, so before this existed a sector answered a
  two-aircraft package and a six-aircraft one equally well, and the officers
  out-fought the seat exactly where the weight was. It counts only what HE
  ordered: crews on WEAPONS FREE are on their own authority and not on his
  radio, which is why the standing order is the other way out of a saturated
  sector and why it is now worth pressing twice. His card prints the load
  against the limit and says HANDS FULL when he is out of them.
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
  the shootlist's NOT ASSIGNED count is work you can actually do: contacts nothing
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

  The expert reads the ledger, which is a verb the console has always shown and
  no model had ever used. Every watch is issued an allocation, the top bar
  counts against it from the first round, and logistics comes on the net at
  sixty per cent of it to say *single rounds only until further notice*. The
  model was doubling until that transmission landed and then being bound by
  it, which is the difference between discipline and compliance — and on
  Weasel Hour, which issues eighteen rounds against twenty-one aircraft and
  says so in the brief, it meant a careful player scored BELOW a competent one
  on all three seats. Stopping at sixty per cent of the allocation takes the
  expert's held rate from 78% to 84% on the net and 81% to 88% from both seats
  over thirty-two seeds.

  The cabin got two verbs of its own, ablated on thirty-two seeds before they
  were kept. It plans a channel ahead — locking what will be in reach inside
  the horizon the refusal line already quotes ("CANNOT LOCK T-002 — OUT OF
  REACH FOR 68S"), because the reaction sequence runs whether the target is
  inside the ring or a minute short of it — and it holds its last rack for the
  aircraft only its own battery can reach. Together they are worth six points
  of Low Riders' cabin dividend and take its both-seat arm from −4.2% to
  +2.6%; on Weasel Hour they cost the cabin six points of held rate, which is
  recorded rather than hidden.

  A model may only press what the seat has, and that is a rule of the harness
  and not a detail. The expert was selecting two-round salvos on First Light,
  whose `basicConsole` strips the salvo switch off the battery card — so the
  measured dividend on the teaching watch was, in its entirety, the cost of an
  imaginary button. `sizeSalvo` is now a no-op on a cut-down console.

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
  refusing (`test/echelon.test.js`, eight seeds: 1523 against 1028, twenty-nine
  arrivals against forty-one, and six places lost against eight). Two
  player models, two answers, both measured.

  The acts three and four scrub added three more verbs and one guard, all of
  them measured. The expert now leaves **standing orders** — the sector it
  cannot stand in goes WEAPONS FREE while it is saturated and back to TIGHT
  when its axis is spent — which no model had ever pressed on the two watches
  built around that order; on Four Sectors it is worth 26% of the watch's
  score, against 11% for standing in the main effort. It **guards the
  corridor** on the escort watch, pairing every fighter to a battery from the
  first second one paints and holding the headquarters battalion off the city
  entirely, which is the brief's own sentence about what that battalion cannot
  do twice; it takes the expert from 5 of 8 watches held to 8 of 8. And it
  **displaces only when the position cannot be answered with fire**: driving
  away used to be the reflex the moment anything turned in on the post, which
  was right when the finale's third axis released against an empty rack and
  wrong the moment it started arriving while there were rounds on the rails —
  measured in the cabin, two seeds of eight conceded eleven leakers apiece to a
  displacement taken with a full rack and the package inside the ring.
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
  Beside the rail lamps, on every card and in the cabin, is the count of
  rounds **in store** to reload with: the store the watch issued (the type's
  magazine times the scenario's `storeMult`), one fewer for every rail the
  loaders fill. At zero it turns the warning colour, the loaders' line reads
  NONE LEFT TO LOAD, the RELOAD cap greys, and an order that reaches the
  engine anyway is refused with STORE EMPTY, NOTHING LEFT TO LOAD — a
  different line from NO RESUPPLY AUTHORISED, which is a watch that was issued
  no store at all. `test/world.test.js` holds all of it: the issue, the
  count-down, and that no round ever appears from an empty store.
  Measured over eight seeds in the cabin, competently played, the share of a
  watch with a legal target in reach and nothing on the rails is now 10% on
  Solo Battery and on First Light, and 20% on Low Riders and on Weasel Hour —
  re-measured after the act-one pass grew two of those raids and the curve
  scrub grew one of them again. Before the rack refilled a rail at a time the
  same three watches read 15%, 35% and 40%, against raids half again smaller
  than the ones those figures are measured on now. First Light's is almost entirely the guidance pause
  below, on a tutorial whose reload multiplier is 0.35 — a rail there takes
  4.2 seconds, so it is a tenth of a watch in four-second pieces. (That knob
  was wired during the instruments scrub; the README had been quoting it for
  a while and nothing had ever read it.)

  The half of that number the loaders actually own is small, and the harness
  now separates it (`reloadWaitShare`): ten to twenty per cent of a watch. The
  rest is a battery that has fired its whole allocation, which no amount of
  loading faster will touch. Where that was the binding constraint the
  *allocation* was fixed rather than the hoist — Weasel Hour and Low Riders
  carry a `storeMult` in their own files, and so do the two watches the acts
  three and four scrub retuned — Four Sectors at three quarters, because
  thirteen batteries with a full store between them made "set every sector
  WEAPONS FREE and never touch another control" cost nothing whichever way the
  order was left, and Two Cities at a third with the long battalion carrying its
  own figure of a half, which is the one place in the game a battery declares a
  store of its own. Sixteen rounds behind an
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

- **A scripted line is somebody on the radio, and the room reads the room.**
  Every watch can script its own traffic — word from a border post, the town
  warden, the crew chief, logistics — and Solo Battery is built on eleven of
  them, because a battery alone in a valley has nobody to talk to but the room.
  Two things about them were wrong. They logged as `info`, the kind reserved
  for the echo of the operator's own switches, so the console rendered them
  like machine chatter and the dead-air detector — which counts what the watch
  does TO you and ignores what it does BECAUSE of you — scored them as silence.
  Eleven lines written and measured as pacing were worth nothing in the reading
  that judged them. They are `comms` now, which is what the console has always
  called radio traffic and what they always were.

  And a scripted line can be outrun by the watch it lands in. The teaching
  watch told you your set was dark at twelve seconds and where the switch was
  at thirty, whether or not you had already found it — measured, "THE SET IS
  NOT RADIATING" printed in twelve of twelve traced cells and was true in four,
  and in the cabin, where the sector's own crews raise the surveillance set a
  tenth of a second in, it was never true at all. Conditional lines now read
  the state their sentence claims (`whileCold` for the sets sector owns,
  `whileOwnCold` for the battery you are sitting in) and carry the OTHER true
  sentence for the same slot rather than leaving a hole where a line was
  scheduled. A watch either says the thing or says the other thing; it does not
  say the false one and it does not go quiet.

- **A hinge jumps the queue; it does not land on the answer to the last order.**
  Routine traffic keeps ninety seconds between transmissions and the orders a
  watch turns on are exempt from that, which is right — a hinge must not wait
  its turn behind a leaker order. But exempt from the cadence had become exempt
  from the room: traced on Ville Under Fire's cabin, four of four runs carried
  a directive pair seventy to seventy-six seconds apart, the POLITICAL
  SECTION's order about the civil transit arriving on top of the
  acknowledgement of a routine one. A hinge now waits for a clear minute after
  whatever went out last. It binds only where a hinge waits on something in the
  air: the expenditure freeze, the border restriction and the withdrawal of the
  battalion all hold the net clear until they have gone out, so nothing routine
  precedes them and the guard never fires there.

  The order to protect the state aircraft waits with it. It used to trigger on
  the wheels leaving Demobodedovo at sixty seconds, with the fighters painting
  at eleven — forty-nine seconds of fighting behind the escort watch's one
  hinge, against a bar of sixty. It now waits the minute out; the aircraft is
  still climbing and the order has lost nothing.

- **An order about a fight waits for the fight, not for the clock.** Sector
  command holds off the net for a scenario's opening minutes so the first
  interactive decision is an assignment rather than a loyalty test. That grace
  was counted from the handover, and first contact is not: Solo Battery paints
  anywhere between 26 s and 43 s across its eight seeds, so an operator got 86
  seconds of fighting before the first order on one and 52 on another, against
  a design bar of sixty. `directiveContactGraceS` counts the same minute from
  the first contact instead, and act 1 sets it to sixty on all four watches.
  Measured on Solo Battery with the sets up, the same eight seeds: the first
  order lands at 95-107 s with 60 to 78 s of fighting behind it and never less
  than sixty, and the routine cadence between orders is unchanged. A scenario
  that does not set the field is bit-identical, and a test asserts that only
  the watches measured with one carry one.

  Two more were measured onto it by the residue pass, and both were plain
  misses. Four Sectors traced first contact at 31 s and its first directive at
  43 s — twelve seconds of fighting, confirmed in the browser at 4x where
  SECTOR ACTUAL's order about the river line lands at 0:42 with one contact on
  the scope. Ville Under Fire traced 15 s and 43 s. With the field set to sixty
  on both, the same traces read 66 s and 63-75 s of fighting behind the first
  order, and no two routine orders inside ninety seconds anywhere.

- **The safety reaches the cabin.** A watch that starts its surveillance set
  cold names the moment sector stops waiting for you and brings it up — and
  that safety stopped at the sets sector owns. On the teaching watch the second
  half of the lesson is that the battery you are sitting in has an antenna of
  its own, and an operator who never found it rode the whole night on somebody
  else's picture with their own tube dark and nothing saying why. On Low Riders
  that was measured in the browser at 450 seconds with twenty aircraft on the
  plot. The crew chief now brings the cabin's own set up at the same moment,
  and says so — but only when EVERY set of that battery is cold, so an operator
  who has deliberately gone dark is never overruled. Weasel Hour, whose whole
  subject is going dark, sets no safety at all, and that is why.

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
  were once taken with a detector that counted ANY logged line as activity —
  including the `info` echo of the operator's own switch, and including a
  fresh NEW CONTACT every few seconds from a correlator that was inventing
  aeroplanes. Against 896 runs it reported zero holes everywhere, on watches
  the playtesters described in prose as five minutes of nothing. The
  instruments pass fixed the detector and the honest reading was ugly: 457 of
  896 runs carried a stretch of thirty seconds or more in which nothing was
  engageable, nothing was in flight, no order was pending and nothing an
  operator would look up for reached the ticker, the worst being 398 seconds
  and the worst watch spending 51% of itself inside one.

  The act-one pass then found the cause, and it was not the raids. Two of the
  three devices that exist to fill those stretches were invisible to the
  detector and, worse, to the console: scripted chatter logged as `info`, and
  the quiet-net reporter both logged as `info` AND waited on a clock that any
  `info` line reset — so the one function in the engine written to stop the
  console going quiet was being switched off by the console's own noise. Both
  now speak as `comms`, and the reporter's clock counts only the kinds that
  are the watch doing something to you, which is the same set the harness
  counts. The reading over the same 896 runs, re-measured after the residue
  scrub: **not one run of the eight hundred and ninety-six carries a stretch of
  thirty seconds or more, and the longest coda in the campaign is 24.7
  seconds** — against a
  ninety-second bar, and against a White Noise that used to spend 301 seconds
  of every seed watching decoys expire. The act-two pass had it down to
  thirty-six runs with a hole in them, worst 89 seconds; act four's late
  packages and act two's second axes closed the last of them.

- **A decoy is not something the watch waits for.** `strikersRemain` counted an
  air-launched decoy as a strike aircraft, so a jammer or a suppression
  aircraft would not turn for home while one was still in the air; and
  `holdsWatchOpen` counted the decoy itself. A decoy carries nothing, can
  arrive at nothing and falls out of the sky by itself after thirteen minutes,
  so both of those amounted to holding the watch open for an egg timer.
  Measured on White Noise: the last engagement of a seed resolved at 815 s and
  the debrief printed at 1116 s — five dead minutes of CONTACT FADED on every
  seed, and **fifty-one of seventy-two non-spectator runs past the
  eighteen-minute ceiling on that alone**. After: none of seventy-two, the
  median down from 18.4 to 14.6 minutes, and the watch ending a tenth of a
  second after its last action. The same two lines shortened Ville Under Fire,
  the campaign's other decoy watch, from a 21.4-minute worst seed to 18.0.

- **The watches are not all the same length, and one of them is deliberately
  short.** Median watch length at 1x, competently fought, runs twelve to
  thirteen minutes across the first four watches and thirteen to fifteen later,
  with two exceptions, both documented below. Act four was the third: Two Cities
  ran seventeen and a half minutes and is now fourteen to fifteen, and The
  President's Flight — a single escort problem that ends when the aircraft is
  down or away — ran nine and is now **seven**, which is below the eight-minute
  floor and is the one watch allowed to be. It holds one aeroplane for eight
  minutes of filed route and there is nothing to do after it: the watch used to
  stay open until STATE 01 crossed the two-hundred-and-ten-kilometre world rim
  at a quarter of a kilometre a second, which bought fifty to a hundred and
  ninety seconds of one friendly symbol crawling across an empty scope, every
  dead-air hole in the watch, and a last hostile spawn stranded at half the run
  time. It now ends when there is nothing left in the corridor, and says so. **First Light is
  four contacts and then two, high and unhurried, with a five-step interactive
  tutorial in whichever seat you took, a cut-down console and a reload
  multiplier of 0.35** — it is the watch that teaches the scope, and it runs
  five and a half minutes on purpose. (The walk-through used to be gated off
  for the cabin entirely, on the watch whose whole job is teaching the
  controls. The cabin has its own five now — radiate your own set, designate,
  lock, launch, answer the net — and every step times out, because a card
  still reading "2 / 5" at t=630 s of a 660 s watch is furniture.) It was measured at eight minutes once, and one seed in five ended
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
  resolves — no run of 896 does, where one Weasel Hour seed used to end 101 s
  after its last action. Re-measured across all twelve after the curve scrub,
  the last spawn of each watch as a fraction of its own median length, played
  competently on its primary seat: First Light 70%, Low Riders 59%, Solo
  Battery 72%, Weasel Hour 68%, White Noise 60%, Economy of Force 53%, Across
  the Line 56%, Ville Under Fire 59%, Four Sectors 62%, Reinforce the Capital
  59%, Two Cities 61%, The President's Flight 70%. Every one is in the back
  half; before the three scrubs they read 29 to 52 per cent and the back of
  each watch was survivors being chased off the map. Late packages are
  deliberately spawned at fifty to
  sixty-five kilometres rather than the engine's default hundred and fifty-five,
  because an ingress nobody can reach is not pressure, it is a countdown — and
  pulling Weasel Hour's whole raid inside BASTION's reach took its worst seed
  from 22.6 minutes to 18.9.

- **A point-defence cabin CAN have its first shot in ninety seconds, and the
  argument that said otherwise was arithmetic about the wrong thing.** For two
  scrubs this document recorded Ville Under Fire as the campaign's one exempt
  cabin: the main-effort watch designates THISTLE TOWN, a twelve-kilometre
  point section, and every package on that board spawned 82 to 168 kilometres
  out, so the first legal claim landed at 214 s and the first contact actually
  inside the ring at 573 s. Twelve kilometres divided by two hundred and forty
  metres a second was offered as the whole of the argument. It is not: it is
  the reason the raid AS WRITTEN could not be answered sooner, and says nothing
  about why the raid had to be written that way. Low Riders has carried the
  answer since act one — a low element that arrives close in and is engageable
  the moment it paints.

  Three of the eight deck-level cruise missiles that used to arrive together at
  250 s now come first instead, at eight seconds from forty-two kilometres,
  down the western approach, aimed at the town the section is sited on. Same
  eight rounds, same axis, same night; what changes is that the district is
  attacked in front of the person from it, which is the sentence the brief
  opens with. Forty-two kilometres is what ninety seconds is worth at a cruise
  missile's quarter-kilometre a second; cruise rather than a low striker
  because a striker releases at eighteen and turns away, and what it releases
  flies under the section's own fifteen-metre floor.

  **And they come in at forty metres, which is the part that makes it the
  cabin's fight rather than the cabin's turn.** At a hundred and thirty they
  were inside LANCE's sixty-metre floor, so on the unlucky seeds the sector's
  own medium batteries killed all three before any of them reached the point
  section's claim horizon and the cabin was back to waiting three minutes:
  measured on three named seeds, 200 s, 194 s and 90 s. Under every floor on
  the board except the section's own and the gun battery's four-kilometre
  ring, the same three seeds read 72 s, 86 s and 75 s, and there is no seed on
  which somebody else takes the work away. That is Low Riders' lesson used
  properly — a contact under the battalion's floor is the point defence's
  problem and nobody else's.

  Sixteen seeds, cabin, competently fought: **first legal shot 213.5 s → 63.5 s**
  (median; 38 s at best, 92 s at worst), **first contact actually inside the
  ring 573 s → 128.5 s**, engageable share 20% → 30%, ten to eighteen distinct
  shot opportunities, and the magazine the sole limiter for none of it at all.

  Two other things moved with it, and both were bar misses. The last package
  arrives forty seconds later and sixteen kilometres nearer — 470 s from 66 km
  rather than 430 s from 82 — which puts the watch's final spawn at 59% of its
  own median length instead of 52%, against a 55% bar, and takes the longest
  seed in the whole set from 18.45 minutes to 17.7. And the late run is six
  missiles rather than eight, because the three that moved to the front are
  three the sector still has to answer: at thirty-three aircraft the net seat
  fell to 50% held, with half of those failures the operations centre rather
  than the count. At thirty-one it reads 69% on the net, 88% in the cabin and
  63% from both seats, which is act two's floor kept exactly where the
  campaign's staircase needs it.

- **Lines of the difficulty bar that are missed on purpose, and why.** They are
  recorded here because a bar that is quietly rounded off is not a bar. All
  figures are sixteen seeds a seat.

  *A beginner is shut out of the net seat of the big watches, and no allowance
  can fix it.* The rule wants a novice holding a quarter to three-fifths of act
  one and two; on the net seat of Low Riders, White Noise, Ville Under Fire and
  Two Cities it holds 0 to 19 per cent. That is not a tuning miss, it is the
  delegation ladder seen from the bottom: on the net a beginner IS the sector,
  and the gap between handing out two targets at a time and re-pairing the
  whole sector every three seconds is worth three to five arrivals a watch. The
  two distributions are disjoint — on White Noise a beginner concedes five to
  twelve where a competent player concedes nought to five — so no single number
  can put one inside 25-60% and the other inside 60-90%. The cabin is where a
  beginner is in band, and it is why the cabin seats exist: the same watches
  read 44 to 88 per cent for a novice from the seat.

  *The careless player model is not separated from the careful one on
  Reinforce the Capital* (novice holds 56%, competent 69%, against a rule that
  wants the novice under half). On a thirteen-battery district board the
  competent model assigns by *nearest battery that can legally take it*, which
  is what a person with a scope and a mouse does — and on this board it
  pre-empts four subordinate officers with a worse pairing, so it leaks a
  shade MORE than the careless model that leaves them alone. The watch itself
  is sound (the expert holds 94% and is well ahead), and the fix is a better
  competent model rather than a heavier raid, which would only widen the gap
  between the two by making both worse.

  *The attention dividend on The President's Flight is +7.5% on the net and
  +0.6% from both seats* against a bar of +10%. It is a seven-minute escort
  with one decision in it — the corridor or the city — and once a model makes
  that decision correctly there is very little left above it: the expert holds
  94% against the competent player's 81% on the net and is still only a few per
  cent ahead, because the thing they differ on is worth six hundred points and
  they both usually get it. From both seats the two are level at 94% and 91%,
  and the one point over the ceiling there is the same fact as the finale's:
  the `both` seat is a national commander who is also crewing the one battery
  that reaches the corridor. An earlier miss on that seat had a nameable cause: the model swaps the formation it
  is standing in when threat mass moves, and on this watch the mass sits over
  the capital while the fight it must not lose is eighty kilometres down the
  corridor. Two rewrites of that rule were measured on sixteen seeds — owning a
  contact by the nearest battery that could reach it, and weighting it by
  whether its officer would decline it — and both cost the net seat nineteen
  points of held rate while moving the both seat by six. Neither was kept. The
  dividend is in held watches, not in score, and both are reported.

  *Twelve runs of eight hundred and ninety-six pass the eighteen-minute
  ceiling, and every one of them is the walk-away.* A player who touches
  nothing shoots nothing down, so every aircraft on the board flies its whole
  profile and the night takes as long as the raid does — eleven White Noise
  runs and one Reinforce the Capital, worst 19.1 minutes. It was sixteen before
  the residue pass, and the four that left the list were Ville Under Fire's,
  including the one competently-played seed in the whole set that ran over: the
  main-effort watch's last package now arrives forty seconds later and sixteen
  kilometres nearer, which is fifty seconds less ingress and fifty less egress,
  and its longest seed of any policy fell from 18.5 minutes to 17.7. No watch
  is lengthened for anybody who is at the console, and nothing at the console
  passes the ceiling at all.

  *Two Cities is magazine-bound for half its length, and the store is not what
  fixes it.* The harness reports the magazine as the ONLY thing between the
  operator and a legal shot for 50% of that watch, against a 25% ceiling. The
  obvious answer is a bigger store, and it was measured: raising `storeMult`
  from a third to a half and the long battalion's from a half to two thirds
  moves the sole-limiter share **not at all** — it reads 50% before and 50%
  after — while it does move the difficulty (net competent 69% to 100% over
  sixteen seeds) and it re-breaks the property below. What that share is
  measuring on this watch is tempo: three axes, thirty-one aircraft and
  seventy rounds fired means a battery is cycling its rack almost continuously,
  and most of the residue is the guidance pause the design notes above pay for
  knowingly (the loaders do not work while the launcher is guiding). The share
  stays, because the alternative is a watch about a hoist.

  *And careful play falls behind competent play there, at 56% against 69% over
  thirty-two seeds.* The cause is nameable: the expert model has the decoy tell
  in the cabin and not on the net, so its greedy pairing spends channels on the
  capital's decoy stream. Putting the tell on the net was re-measured this pass
  on thirty-two seeds and is catastrophic elsewhere — White Noise's net expert
  falls from 75% held to 9% — because that watch's decoys arrive alongside the
  strike and waiting hands the sector back its own release ring. The verb the
  finale wants and White Noise refuses is the same verb, and no version of it
  has been found that pays on both. It is a model gap, it is written here, and
  it is the next pass's.

  *A two-channel cabin reads as idle exactly when it is busiest, and the
  engageable-share floor is the wrong instrument for it.* The rule wants a
  crewed seat with a legal shot available for a fifth of its watch. Solo
  Battery's cabin reads 10% and Weasel Hour's 10%, and both are LANCE or
  BASTION batteries with two engagement channels: `cannotEngageReason` answers
  "all channels engaged" for exactly the stretch in which the operator has the
  most to do, so the share collapses while the seat is saturated. The honest
  companion column is beside it in every table the harness prints — busy share,
  which counts a legal shot OR a round of this battery's in the air OR a
  channel committed — and it reads 80% on Solo Battery and 90% on Weasel Hour
  against those two tens. Read together they say a launcher working at its
  ceiling, which is what the traces show: continuous engagements from 81 s to
  540 s on Solo Battery's competent cabin. Fifteen to sixteen distinct shot
  opportunities a seed on both, against a bar of four. The floor is not raised
  by moving the raid — Solo Battery's wave table carries a DO-NOT-RETUNE note
  with seven measured alternatives beside it, every one of which broke a line
  this one holds — and it is not a defect in the watch. It is a defect in
  reading one column without the other.

  *Economy of Force's cabin holds 81% and its careful player 75%*, and both are
  the same fact about the same watch — see the note on the ledger tax above.
  LANCE WEST covers the hospital road and the airbase approach at once, so a
  person sitting in it does not have to choose between them the way the sector
  does; and the model that orders its queue by the state's own valuation spends
  its twelve rounds where the state says they are worth most, which on this
  night is not where the arrivals are.

- **On the two moral watches the careful player model loses, and it is the pair
  of rounds that does it.** The attention dividend is positive on ten watches
  of twelve — from +2% on White Noise to +47% on Reinforce the Capital — and
  negative on exactly two: Economy of Force at −37% (ten watches held of
  sixteen against a competent thirteen) and Across the Line at −30% (nine
  against twelve). Those are the two act-two watches with the smallest
  allocations in the campaign, twelve rounds and eighteen.

  Four verbs were ablated one at a time over sixteen seeds to find out which,
  because a negative dividend is normally a watch with no depth in it and this
  claim should not rest on a story. The emissions duty cycle, standing in the
  main effort and the displacement rule move nothing at all on either watch.
  Replacing the value ordering with nearest-battery moves each by one watch, in
  opposite directions. What moves it is the salvo: with two-round salvos
  removed entirely, Economy of Force goes from ten watches held to eleven and
  its mean score from 347 to 918. A pair costs ten points and buys a better
  chance at one aeroplane; on twelve rounds against nineteen it is the whole
  difference between covering the raid and not, and the model spends it before
  the deck package out of the east has appeared.

  The salvo stays, because it is worth 22% on Low Riders, 34% on Four Sectors
  and 47% on Reinforce the Capital — watches with rounds to spare. Two
  allocation-aware rules for withholding it were measured and both cost more
  than they bought (stop doubling once the remaining allocation is under the
  live contact count: Low Riders −5 points of held rate, Economy of Force's
  score −48%; under one and a half times it: Low Riders three watches lost).
  So the careful player goes on being punished on the two nights the campaign
  turns on, for doing on those what works on the other ten — which, on a watch
  whose subject is an expenditure order, is the game agreeing with its own
  brief.

- **How hard each watch is, measured rather than asserted.** Held rate over
  **sixteen** seeds a seat, every watch, reproduced by:

  ```
  node tools/playtest.mjs --mission all --seat all --policy all \
    --seeds 16 --jobs 3 --md /tmp/campaign.md
  ```

  | Watch | nothing | novice | competent | expert |
  |---|--:|--:|--:|--:|
  | First Light | 0% | 100% | 100% | 100% |
  | Low Riders | 0% | 0-63% | 56-88% | 44-81% |
  | Solo Battery | 0% | 75% | 81% | 88% |
  | Weasel Hour | 0% | 6-75% | 75-81% | 56-94% |
  | White Noise | 0% | 6-81% | 81-88% | 75-88% |
  | Economy of Force | 0% | 31-88% | 69-81% | 63-75% |
  | Across the Line | 0-6% | 31-69% | 69-81% | 69-81% |
  | Ville Under Fire | 0-19% | 0-75% | 63-75% | 75-94% |
  | Four Sectors | 0% | 31% | 75% | 94% |
  | Reinforce the Capital | 6% | 100% | 69% | 94% |
  | The Two Cities | 0% | 0-25% | 69-88% | 56-69% |
  | The President's Flight | 6-38% | 31-38% | 56-75% | 63-81% |

  (Ranges are across the seats each watch offers; Solo Battery has only the
  cabin, and the last two only the net and both seats.)

- **The campaign is a staircase, and this is it.** Competent play, each watch's
  own primary seat, the same sixteen seeds:

  | Act | Watches | Competent HELD | Act mean |
  |---|---|--:|--:|
  | I — battalion | First Light \| Low Riders \| Solo Battery | 100%\* \| 75% \| 81% | **78.1%** |
  | II — sector | Weasel Hour \| White Noise \| Economy of Force \| Across the Line \| Ville Under Fire | 81% \| 81% \| 69% \| 81% \| 75% | **77.5%** |
  | III — district | Four Sectors \| Reinforce the Capital | 75% \| 69% | **71.9%** |
  | IV — national | The Two Cities \| The President's Flight | 69% \| 75% | **71.9%** |

  \* the documented teaching exception, below.

  The rule is that no watch may be easier than the hardest watch of the act
  before it, and each act clears it: act one's hardest holds 75 and act two's
  easiest holds 69; act two's hardest holds 69 and act three's easiest holds
  69; act three's hardest holds 69 and act four's easiest holds 69. The act
  means fall, or hold, act to act. Five watches sit a rung above the hardest
  watch of the act before them — Weasel Hour, White Noise and Across the Line
  at 81 against act one's 75, Four Sectors at 75 against act two's 69, and the
  sealed escort at 75 against act three's 69 — six points on a sixteen-seed
  sample, inside the one-night slack the test allows; the escort is recorded
  with its own six-row ladder in the exceptions above, because the alternative
  arrangement of that raid puts it thirteen points higher still.

  These are the figures since a handover a battery accepted stopped being
  dropped in silence (the early-handover repair, in `waitForRange` in
  doctrine.js). Kept handovers moved seven of the twelve watches by one or two
  nights of sixteen — Low Riders and Ville Under Fire up to 94, above the band,
  Economy of Force and Reinforce the Capital down a night or two — so three
  watches were retuned on the same seeds to put the staircase back: Low
  Riders' allowance from three to two, one more striker against the centre on
  Ville Under Fire, one fewer in the first package on Reinforce the Capital. It was not a staircase before this was measured: act two used
  to hold 100 / 88 / 100 / 100 / 88 against act one's 100 / 63 / 88, so the
  second act of four was the easiest thing in the game and three of its watches
  could not be lost by a competent player on any seat, while act four held 75
  and 75 against act three's 63.

  The other seats moved with the repair too, and the table above records them
  as measured rather than as hoped. A kept handover now holds a channel on its
  target for the claim horizon (forty-five seconds plus four tenths of a second
  a kilometre of the battery's reach), and the scripted expert, which hands
  contacts over early and often, pays for that where the careful player does
  not: Low Riders' both-seat expert fell from 88 to 44 and its crew seat from
  75 to 56 at competent, Weasel Hour's crew-seat expert from 81 to 56. On
  Reinforce the Capital the novice policy holds every night at 100 against the
  competent policy's 69, because taking one striker out of the first package
  leaves the novice — who gives that package no order and lets the formations
  work it — under the allowance of six every time, while the competent policy's
  early handovers pin the long-range channels and leak more late. None of
  these is on a watch's primary seat, and none was chased: the staircase is
  the claim the test pins, and a balance pass over the secondary seats is a
  separate piece of work.

  **Sixteen seeds and not eight, and the reason is arithmetic rather than
  taste.** At eight a held rate can only be a multiple of twelve and a half,
  and the difficulty band is sixty to ninety per cent: three rungs for four
  acts, before any noise. The escort watch is the plainest case — its verdict
  is one binary event, and the identical build reads 50% on the first eight
  seeds and 62% on sixteen. Run the table above at `--seeds 8` and two of the
  twelve watches land a rung away from where sixteen puts them, which is enough
  to make the staircase read out of order. That is a property of the sample,
  not of the game, and it is why this document quotes sixteen.

  Three things in that table are deliberate and worth stating plainly, because
  they are the exceptions to the campaign's own difficulty rule (competent
  should hold six to nine watches in ten, novice a quarter to three-fifths).

  **First Light is exempt, and it is the only watch that is.** It is the
  interactive tutorial: five steps, a cut-down console of two controls, and a
  brief that says nothing is shooting back at you tonight. A teaching watch that
  fails a learner is a teaching watch that has failed. What it must do instead
  is fail the *spectator*, and it does: a player who touches nothing holds none
  of eight seeds on the net or from both seats and concedes five to six
  aircraft, while a player who so much as brings a set up and assigns holds all
  eight from every seat. The empty cabin is the exception at 6 of 8 — the
  sector's own crews fight the watch around a silent battery.

  **The exemption covers the beginner too, and that half had never been
  written down.** The rule wants a novice losing two watches in five; on this
  one a novice holds 100% on all three seats, and so does careful play. The
  only allowance that would deliver a beginner's failure here is one leaker,
  and one leaker is the setting this watch was explicitly moved OFF, because
  the most common way to concede it was spending ninety seconds reading the
  interface — the watch that exists to teach the controls failing you for
  learning them. The 100% is deliberate at every rung above the spectator, the
  reason is the same reason, and it is now stated in `scenarios.js` beside the
  number as well as here, because two scrubs in a row had to rediscover it.

  **And nothing on it is worth being expert about, which is also deliberate
  and had to be measured before it could be said.** The attention dividend —
  does careful play beat competent play — reads +0.1% on the net, +0.7% in the
  cabin and +0.3% from both seats over eight seeds, and it cannot read anything
  else, because the watch has no room above competent play. Six aircraft, three
  batteries, nothing shooting back: a competent operator kills all six, loses
  nothing, and scores 1209 against a ceiling of about 1212 — eleven hundred and
  twenty points of intact ground, a hundred and twenty of kills, forty back for
  the rounds. There is no leaker to prevent, no antenna to save and no round to
  economise. The one thing that used to separate the two models was the expert
  selecting salvos of two, and *`basicConsole` removes the salvo switch from
  this console*: the model was pressing a control the player does not have and
  paying five points a round for it, which read as a NEGATIVE dividend of −1.7%
  and −1.8% on two seats. The model now presses only what the seat has, and the
  number it reports is the truth about the watch: the teaching watch is where
  skill is acquired, not where it pays.

  **Low Riders forgives two leakers, and every one of them is real.** Counted
  out of the built world: twenty-eight aircraft in seven packages on five axes,
  fifteen of them under BASTION's hundred-and-twenty-metre floor — the file and
  this document had both been saying nineteen on four axes since the watch was
  written, and the act-one scrub corrected that to thirty before the curve
  scrub found that twelve of the thirty were cruise missiles the verdict could
  not see. "One" therefore meant one bomb and twelve free missiles. The last
  package is four of them at fifty metres rather than six, because six arriving
  together on the one axis the battalion cannot see under is the single largest
  source of arrivals on the watch and nothing was counting them. On the honest
  count at sixteen seeds it held 56% at an allowance of two, 81% at three and
  94% at four, and three was the top of the band. Then a handover a battery
  had accepted stopped being dropped in silence, and on this watch — fifteen
  aircraft under the horizon, arriving already close, the one where an early
  handover was most often released at ready plus six with nobody told — the
  same sixteen seeds at an allowance of three held 94%, above the band. At two
  they hold 75%, which is where the second watch of the teaching act belongs;
  the raid, the store and the five axes are untouched.

  It is also nine minutes shorter at the back and two aircraft heavier at the
  front, for two separate measured reasons. The two low packages spawn at a
  hundred and thirty-five kilometres instead of the engine's default hundred
  and fifty-five: under the horizon that changes nothing about when they paint,
  but a striker at a hundred and thirty metres with its weapons gone crawls
  home through the band that holds the watch open, and six runs of a hundred
  and ninety-two used to pass the eighteen-minute ceiling doing it. And the
  high package on the north-east axis is five aircraft sixteen seconds apart
  rather than three at twenty-four, because it is the only package the crewed
  battalion owns — everything else is under its floor or inside somebody's
  gun section — and at three it was a problem four channels solved without
  being thought about. Thirty-two seeds, every seat: competent 81 / 94 / 94 per
  cent held becomes 72 / 59 / 66, a beginner in the cabin 81% becomes 63%, and
  the cabin's attention dividend goes from 8 of 16 seeds and +4.5% to 24 of 32
  and +20.1%. (Those two figures were taken before the missiles were counted;
  on the honest count at sixteen seeds the watch reads 81 / 75 / 75 competent
  and 100 / 88 / 88 expert.)

  **Weasel Hour is now a watch a beginner can lose, and it costs a competent
  net seat four points of the ceiling.** Fifteen aircraft against four
  batteries with an allowance of two leakers produced a mean of 0.1 leakers at
  competent play — nothing was getting through, so nothing below competent
  could fail: a beginner held 88% of the net's watches and 100% of the cabin's,
  and a player who touched nothing held 31% of the cabin's. The raid is
  twenty-one aircraft now (two more at height, one more low, and a three-ship
  cruise run at the power station in the 205-274 s hole the hole-window column
  found), and the strike package that comes out of the north-north-east spawns
  at eighty kilometres rather than ninety-five, because from ninety-five its
  egress was three hundred seconds of the sector shooting at an aeroplane with
  nothing left to drop. Thirty-two seeds a seat: a beginner falls to 41 / 84 /
  19 per cent, the do-nothing cabin to none, competent play sits at 94 / 88 /
  88, no run passes eighteen minutes (six of a hundred and ninety-two did) and
  none contains a thirty-second silence. Four raid sizes were measured at
  thirty-two seeds each: at twenty aircraft competent play holds 94-100% and
  the watch is not a test, at twenty-two 81-97%, at twenty-three the competent
  band is perfect at 81-84% but a beginner falls to 3-13% on two seats and the
  expert to 69% in the cabin.

  **It flies twenty-two now, and the twenty-second is a missile.** Every one of
  those raid sizes was chosen against a count that could not see a cruise
  missile arrive, and eight of this watch's aircraft are cruise missiles, so
  "an allowance of two" meant two bombs and eight free rounds. Counted
  honestly at twenty-one aircraft the net seat holds 88% and the cabin 94% —
  the top of the band on the third watch of the game, above act one's hardest,
  which breaks the curve at the first step of act two. The fix is one more
  missile on the late run at the operations centre, the package that arrives
  after the allocation has been spent, and an allowance of three: 75 / 88 / 81
  over sixteen seeds with the store left where the act-one pass put it, and the
  cabin's magazine-limited share unmoved at twenty per cent, because a missile
  at sixty metres is a horizon problem and not a store problem. Three
  twenty-two-aircraft variants were measured before this one was kept — an
  extra low striker instead reads 75 / 88 / 75 but takes the careful player
  down to 69 / 75 / 75, and twenty-three costs the cabin's expert twenty-six
  points of held rate.

  **Solo Battery's attention dividend is capped by a ceiling and a single
  building, and the wave table is not the problem.** Over thirty-two seeds the
  ladder is clean — 0 / 41 / 75 / 81 per cent held, score coefficient of
  variation 0.33 — but a careful operator beats a competent one on 19 seeds of
  32 and by 8.0%, under the bar on both counts. Two things cap it. A competent
  operator already scores 962-980 on a clean seed against roughly nine hundred
  points of ground and three hundred and fifty of kills, so there is little
  room above them; and SECTOR OPS is four hundred of that ground AND is marked
  critical, so its loss subtracts about five hundred points and converts the
  verdict at the same moment — a competent operator holds 21 of the 22 seeds
  where it survives and none of the 10 where it does not. Seven alternative
  wave tables were measured at thirty-two seeds each during the scrub and every
  one broke something this one holds (competent at 94-100%, or the operations
  centre destroyed on 32 of 32, or a beginner at 19%); they are recorded in the
  scenario file beside a DO-NOT-RETUNE note. The dividend is a watch-shape
  problem and the shape is load-bearing.

  **Novice is shut out on the net seat of the two biggest watches** (0 of 8 on
  Low Riders' net and both-seats, against 88% in the cabin, where the sector's
  own battle manager covers for them). That is not a tuning miss, it is the
  shape of the game: on the net a beginner IS the sector, and the gap between
  handing out two targets at a time and re-pairing the whole sector every three
  seconds is worth three to five leakers a watch. It is the delegation ladder
  seen from the bottom, and it is why the cabin seats exist.

- **A gauge with nothing behind it is dead weight, and so is a button that
  answers a threat the raid does not carry.** The battery card and the cabin
  both wear ЗАСВЕТКА · ELINT EXPOSURE — how much of your emissions somebody has
  collected — and DISPLACE, the only verb that empties the grid reference they
  collected it at. On Solo Battery neither means anything: not one of the
  sixteen aircraft in that raid carries an anti-radiation round, so the INBOUND
  ARM lamp never lights and the gauge sat pinned at 100% in red from the
  four-minute mark of three hand-played watches. First Light already hid both
  behind its cut-down console with a comment saying the exposure gauge belongs
  to watches where somebody shoots back; the console now asks the raid table
  instead of asking each scenario to remember — `raidHuntsRadars` for the
  gauge, and `positionCanBeHunted` for DISPLACE, which also answers a hostile
  tracking toward something that drives out with the battery. The keyboard row
  on the CONTROLS page follows the same test, so the help screen never names a
  key the console has taken away. Six watches lose the pair — First Light, Low
  Riders, Solo Battery, White Noise, Economy of Force and Across the Line, none
  of which fields an anti-radiation round — and the six where something really
  is hunting the antenna keep both. No measurement moves, because none of this
  touches the simulation.

- **What the residue pass measured across the whole matrix, and what it left
  open.** The 896-run campaign matrix — twelve watches, every seat, four player
  models, eight seeds — was taken before and after. Every crewed seat in the
  game now has its first legal shot inside the ninety-second bar: 38 to 79
  seconds across the eight watches with a cabin, where Ville Under Fire's read
  218. No run of the 896 carries a thirty-second stretch with nothing in it. No
  run played by anybody at the console passes the eighteen-minute ceiling; the
  twelve that do are all the walk-away. The last hostile of each watch arrives
  at 52 to 72 per cent of its own median length, and the one under the 55 per
  cent bar is Economy of Force at 52 — a three-point miss that predates this
  pass and is the freeze watch's own shape, since the last package is the deck
  run at the airbase the freeze is about.

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
