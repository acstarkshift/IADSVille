/**
 * The letters that do or do not arrive.
 *
 * At enlistment the soldier names who is still in the Ville, and the household
 * table has promised ever since that the choice would be "referred to for the
 * rest of the campaign — in the letters that do or do not arrive". This module
 * is that promise kept.
 *
 * The post works the way everything in this service works: through the
 * political section. A commended file gets its letter unopened, and is told
 * so, because the not-opening is itself a favour with a ledger entry. An
 * ordinary file gets the letter opened and resealed, competently. A flagged
 * file gets a notice of withholding instead — the letter exists, has a
 * postmark, and is somewhere in the sector office being read by people it was
 * not written to — and the letter itself is released watches later under the
 * wrong seal, or is still held at the finale, where it becomes a number in a
 * clause. The condemned tier's residence-permit sentence ("You will be
 * informed of the outcome") is also closed here, one way or the other,
 * because a threat nothing ever resolves stops being a threat and starts
 * being set dressing.
 *
 * Nothing in this file is a lever. The family's post follows the file, the
 * file follows the player's answers on the net, and there is no way to farm a
 * letter — which is the point being made. Everything is deterministic and
 * driven off campaign state, modelled on revelations.js.
 *
 * The player never writes back. The traffic is one-way and monitored, all
 * campaign long, so that the epilogue's twenty-minute unmonitored telephone
 * call means what it means.
 *
 * Tone rule, rewritten. The player: "The letter from home shouldn't be a 3rd
 * party describing the letter. I should be the text of the letter from home."
 * So every letter below IS the letter: a salutation in the writer's own way,
 * a body in their voice, a sign-off and a name. Nobody stands between the
 * player and the paper. Four households, four people who write nothing like
 * each other — Ksenia keeps the house and closes every letter the same way,
 * Nata writes about the children and numbers her sheets, Vera writes six lines
 * and means all of them, Ilya says the thing and then says it again harder.
 *
 * How the letter arrived is never narrated either. It is shown once, on the
 * section's own slip clipped to the sheet, and stencilled on the plate above
 * the paper only on the surfaces that have no room for a slip. When a letter
 * is withheld there is no letter, and the notice the section sends stands in
 * its place, signed by the section.
 */

import { districtOf, rankOf } from './character.js';

/* ------------------------------------------------------------- the writers */

/**
 * How each household begins and ends a letter.
 *
 * The salutation uses the given name the player chose at enlistment; the
 * fallback is only reached by a caller that has no character, which in the
 * game is nobody.
 */
const firstName = (ctx) => String(ctx?.name ?? '').trim().split(/\s+/)[0] ?? '';

const OPENING = {
  mother: (ctx) => (firstName(ctx) ? `Dear ${firstName(ctx)},` : 'Dear heart,'),
  sister: (ctx) => (firstName(ctx) ? `${firstName(ctx)},` : 'Hello there,'),
  grandmother: (ctx) => (firstName(ctx) ? `To ${firstName(ctx)},` : 'Child,'),
  brother: (ctx) => (firstName(ctx) ? `Well, ${firstName(ctx)},` : 'Well then,'),
};

/** The four hands, so a letter is a letter and not a paragraph with a name on it. */
function letterOf(hh, ctx, parts) {
  const open = (OPENING[hh] ?? OPENING.mother)(ctx);
  const { body, sign } = parts[hh] ?? parts.mother;
  return [open, ...body, sign];
}

/* ---------------------------------------------------------------- letters */

/**
 * The correspondence, in campaign order. `after` names the watch (or watches —
 * first one completed wins) whose debrief the letter arrives with; `lines`
 * builds the body for the household chosen at enlistment.
 *
 * ctx: { hit: homeDistrictHit this watch, permit: current permit state,
 *        watch: 1-based watch number }.
 */
export const LETTERS = [
  {
    id: 'first-post',
    after: 'first-light',
    tm: 'ПИСЬМО ИЗ ВИЛЛЫ',
    title: 'A LETTER FROM THE VILLE',
    lines: (hh, ctx) => letterOf(hh, ctx, {
      mother: {
        body: [
          'The weather has turned and the dispensary queue is indoors for the winter. The stove is'
            + ' drawing well and I have not touched the flue since you set it.',
          'They have taken Veselin\'s boy as well. His mother has been impossible about it in the'
            + ' shop, twice this week.',
          'I am not going to ask what you do at night. Somebody at your sector office reads this'
            + ' before you do, and I am writing it anyway.',
        ],
        sign: 'All well here. Your mother, Ksenia.',
      },
      sister: {
        body: [
          'The younger one draws aircraft now. They all fly away to the left, off the edge of the'
            + ' paper, every single one.',
          'The elder has learned your rank and corrects anybody who gets it wrong. He is'
            + ' insufferable and I have not stopped him.',
          'I number the sheets, 2 of 3 and 3 of 3, because pages went missing in the post last'
            + ' spring. If a number is missing you will know to ask.',
        ],
        sign: 'Your sister, Nata.',
      },
      grandmother: {
        body: [
          'I have written letters that other people read before, in the last war. There is nothing'
            + ' in this one for them.',
          'The garden is finished for the year and the frost came on the ninth. Paraffin is up by'
            + ' two again and the shop pretends not to know why.',
        ],
        sign: 'Keep your boots dry. Your grandmother, Vera.',
      },
      brother: {
        body: [
          'The pump at the river road is fixed. It was the seal, as I said in June, and it took me'
            + ' one afternoon.',
          'I have appealed the board again. They have my heart on a piece of paper and will not look'
            + ' at the rest of me.',
          'What is the service like? You need not answer. I have underlined nothing in this letter,'
            + ' which you will have checked before you read a word of it.',
        ],
        sign: 'Your brother, Ilya.',
      },
    }),
  },

  {
    id: 'dispensary',
    /** The fortnightly register arrives with whichever early watch lands first. */
    after: ['low-riders', 'solo-battery', 'weasel-hour'],
    tm: 'ОЧЕРЕДНОЕ ПИСЬМО',
    title: 'THE FORTNIGHTLY LETTER',
    lines: (hh, ctx) => letterOf(hh, ctx, {
      mother: {
        body: [
          'The dispensary queue was an hour and ten on Tuesday and an hour on Friday, which they'
            + ' call an improvement. Flour is steady. Paraffin is not.',
          'You will hear things about the valley at night. I would rather write to you about'
            + ' flour.',
          'I have repainted the kitchen. I last did that the month you enlisted, so you can work out'
            + ' how much time I have on my hands.',
        ],
        sign: 'All well here. Ksenia.',
      },
      sister: {
        body: [
          'The dispensary takes the whole morning now, so I bring both children and we make a day of'
            + ' it. Flour is the same. Paraffin has gone up twice since I last wrote.',
          'The children sleep in the back room now, the one that faces away from the valley. It is'
            + ' the warmer room, and that is the reason I have given them.',
        ],
        sign: 'Nata. 3 of 3.',
      },
      grandmother: {
        body: [
          'I have had the cellar aired and the shelves stocked. Do not ask me what for.',
          'Rain all fortnight. The queue at the dispensary is the same queue it was in the last war,'
            + ' with different people standing in it.',
        ],
        sign: 'Keep your boots dry. Vera.',
      },
      brother: {
        body: [
          'I have been up on the mill roof after the weathervane. You can see a long way from the'
            + ' mill roof.',
          'Flour is holding and paraffin is a disgrace. The dispensary queue goes round the corner'
            + ' now and everybody in it has an opinion about the weather.',
        ],
        sign: 'Ilya.',
      },
    }),
  },

  {
    id: 'hospital-road',
    after: 'economy-of-force',
    tm: 'ПИСЬМО О ДОРОГЕ',
    title: 'THE ROAD IS CLOSED FOR WORKS',
    lines: (hh, ctx) => letterOf(hh, ctx, {
      mother: {
        body: [
          'The Kubin road is shut at the twenty-first kilometre for works. The dispensary run goes'
            + ' the long way round now, which adds an hour each way.',
          'I have done it twice this week. It is the same queue at the far end of it, only an hour'
            + ' further away.',
          'Nobody here has seen any works. I only mention it because you will hear the buses are'
            + ' late.',
        ],
        sign: 'All well here. Ksenia.',
      },
      sister: {
        body: [
          'They have shut the Kubin road at the twenty-first kilometre. Works, the notice says, and'
            + ' not one person in the Ville has seen a man with a shovel.',
          'The elder asked me why the buses stop at the twenty-first kilometre. I told him it was'
            + ' works. He is nine and he did not believe me either.',
        ],
        sign: 'Nata.',
      },
      grandmother: {
        body: [
          'The Kubin road is closed at the twenty-first kilometre. There is a notice on it and the'
            + ' notice says works.',
          'The last time that road was closed for works I was younger than you are now, and it was'
            + ' not works then either.',
        ],
        sign: 'Keep your boots dry. Vera.',
      },
      brother: {
        body: [
          'The Kubin road is shut at the twenty-first kilometre and the dispensary run is an hour'
            + ' longer each way. Works, they tell us.',
          'I walked out to the closure on Sunday and two men turned me back. They had service boots'
            + ' on, new ones, and there was not a mark of a road on either pair.',
        ],
        sign: 'Ilya.',
      },
    }),
  },

  {
    id: 'aftermath',
    after: 'ville-under-fire',
    tm: 'ПИСЬМО ПОСЛЕ НАЛЁТА',
    title: 'A LETTER, AFTER',
    /**
     * Two letters per household: one from a quarter that was on the damage
     * returns and one from a quarter that was not. The writer knows which of
     * those they are living in; nobody has to tell them.
     */
    lines: (hh, ctx) => (ctx?.hit ? letterOf(hh, ctx, {
      mother: {
        body: [
          'We are all here. The glazier has a list and we are eleventh on it, and Kolyo\'s cart'
            + ' carried our roof beam up and would not take anything for it.',
          'There was some excitement here on the Thursday. That is all I am putting in a letter.',
          'I am writing small to keep this to one sheet. The tarpaulin is holding and the stove is'
            + ' drawing well.',
        ],
        sign: 'All well here. Ksenia.',
      },
      sister: {
        body: [
          'We are all here and the children slept through the worst of it. The mill took it hardest.'
            + ' Our roof is under a tarpaulin and Petar\'s cart brought the tiles up on Saturday.',
          'The children have drawn you a house. The roof has been gone over so many times the paper'
            + ' has torn, and I am sending it anyway.',
        ],
        sign: 'Nata.',
      },
      grandmother: {
        body: [
          'The high street had it on the Thursday. Our windows are boarded and the roof held.',
          'The cellar shelving held as well. You will remember I had it aired in the summer.',
        ],
        sign: 'Keep your boots dry. Vera.',
      },
      brother: {
        body: [
          'Our end of the river road is open to the sky and I have been up on it since Friday. Four'
            + ' houses are gone below us.',
          'Nobody has said one word to me about my heart all week. There is a ladder to be carried'
            + ' and I am suddenly the man for it.',
        ],
        sign: 'Ilya.',
      },
    }) : letterOf(hh, ctx, {
      mother: {
        body: [
          'The mill quarter got it worst and the river road after that. Two streets are without'
            + ' glass. The dispensary queue was back to its usual length by Monday.',
          'I am not going to write about our own street, and I have stopped asking you questions.'
            + ' Both of those are new, and I want you to know I chose them.',
        ],
        sign: 'All well here. Ksenia.',
      },
      sister: {
        body: [
          'The mill quarter took it worst, which you will have seen on whatever it is you look at.'
            + ' Two streets on the river road as well. We are all here.',
          'The children went back to school on Tuesday. The elder has a new teacher who cannot say'
            + ' our name and will not be told how.',
        ],
        sign: 'Nata.',
      },
      grandmother: {
        body: [
          'The mill quarter and the river road took it. The high street was not touched.',
          'We sat in the cellar for two hours. The shelving held and nobody said very much.',
        ],
        sign: 'Keep your boots dry. Vera.',
      },
      brother: {
        body: [
          'The mill took it worst and the river road after that, though our end of it was spared. I'
            + ' have been up on other people\'s roofs since Friday.',
          'Nobody has mentioned my heart all week. There is a ladder to be carried and I am suddenly'
            + ' the man for it.',
        ],
        sign: 'Ilya.',
      },
    })),
  },

  {
    id: 'shorter',
    after: 'four-sectors',
    tm: 'КОРОТКОЕ ПИСЬМО',
    title: 'A SHORTER LETTER',
    /**
     * The one letter that opens with the rank instead of the name. Nothing in
     * it is untrue and nothing in it is warm; each household arrives at that in
     * their own way rather than sharing a sentence with the other three.
     */
    lines: (hh, ctx) => {
      // Addressed to the rank and the surname, the way the sector office
      // addresses him. Every other letter opens with his given name.
      const rank = String(ctx?.rank ?? '').trim();
      const parts = String(ctx?.name ?? '').trim().split(/\s+/);
      const surname = parts.length > 1 ? parts[parts.length - 1] : '';
      const open = rank && surname ? `To ${rank} ${surname},`
        : rank ? `To ${rank},` : 'To the addressee,';
      const { body, sign } = {
        mother: {
          body: [
            'The queue at the dispensary is much as it was. The weather has been dry. The Kubin road'
              + ' is still closed at the twenty-first kilometre.',
            'The stove is drawing well. I wrote you that in the summer and it is still true, and I'
              + ' find I have nothing to put after it.',
          ],
          sign: 'Ksenia.',
        },
        sister: {
          body: [
            'I have written about the dispensary, the weather and the road, and there is nothing on'
              + ' this page you could not read out to somebody.',
            'I have written both children\'s names and their ages at the bottom of this page. The'
              + ' younger one insisted on it and wrote her own.',
          ],
          sign: 'Nata.',
        },
        grandmother: {
          body: [
            'The road is still closed at the twenty-first kilometre. It has rained for nine days.'
              + ' The queue is no shorter.',
            'I have enclosed a list of what is in the cellar, itemised, with the quantities. Keep it'
              + ' in the back of your pay book.',
          ],
          sign: 'Vera.',
        },
        brother: {
          body: [
            'The road is still shut. The pump is holding. The weather has been filthy.',
            'I have read this back and there is not one word in it worth the paper. I am sending it'
              + ' because the fortnight is up.',
          ],
          sign: 'Ilya (brother).',
        },
      }[hh] ?? {};
      return [open, ...(body ?? []), sign ?? ''];
    },
  },

  {
    id: 'last-before',
    after: 'reinforce-the-capital',
    tm: 'ПОСЛЕДНЕЕ ПИСЬМО',
    title: 'THE LAST LETTER BEFORE',
    lines: (hh, ctx) => letterOf(hh, ctx, {
      mother: {
        body: [
          'It has been loud at night. I have taken the photographs down off the west wall and put'
            + ' them in the drawer. For cleaning.',
          'When are you next permitted to telephone? I have not asked you for one thing since you'
            + ' went, and I am asking for this.',
        ],
        sign: 'All well here. Your mother, Ksenia.',
      },
      sister: {
        body: [
          'The younger one still draws aircraft. They fly to the right now, toward the edge of the'
            + ' page, and I could not tell you when that changed.',
          'The elder has stopped correcting people about your rank. I did not ask him to and I have'
            + ' not asked him why.',
          'There is a line under my name that I started and crossed out. I have left it where you'
            + ' can see it, because I would rather you knew there was something.',
        ],
        sign: 'Your sister, Nata.',
      },
      grandmother: {
        body: [
          'Paraffin again. The frost is early this year. The cellar is as I left it.',
          'I have taken the enamel box down off the shelf. You know the one. It sits by the door'
            + ' now.',
        ],
        sign: 'Keep your boots dry. Vera.',
      },
      brother: {
        body: [
          'The pump held through the frost. The weather has been filthy and I will spare you the'
            + ' rest of it.',
          'The board can keep its decision. I have joined the fire pickets at the mill, and not one'
            + ' man on the pickets has asked me about my heart.',
        ],
        sign: 'Your brother, Ilya.',
      },
    }),
  },

  /**
   * The seventh letter, on the last watch's own desk.
   *
   * The thread used to stop before the two watches that matter. This one is
   * posted the night a column went south through the village with its lights
   * off — the household does not know what it was, and the letter does not
   * say, because on the night the depots are committed to the capital a
   * column goes south whichever way the movement order was answered.
   */
  {
    id: 'column-south',
    after: 'two-cities',
    tm: 'НОЧЬ, КОГДА КОЛОННА УШЛА',
    title: 'THE NIGHT THE COLUMN WENT SOUTH',
    lines: (hh, ctx) => letterOf(hh, ctx, {
      mother: {
        body: [
          'A column went through the village at two in the morning with its lights off, going'
            + ' south. I counted nine lorries and something long on a trailer, and then I stopped'
            + ' counting and put the kettle on.',
          'I have not asked anybody where it was going. I know where the road goes.',
        ],
        sign: 'All well here. Your mother, Ksenia.',
      },
      sister: {
        body: [
          'The children slept through the column going down the river road. I did not. Nine lorries'
            + ' and something long on a trailer, and not one light between them.',
          'The elder asked at breakfast why the soldiers had gone. I said they had been sent for. He'
            + ' asked by whom, and I said I did not know, which is the first true thing I have said'
            + ' to him about this war.',
        ],
        sign: 'Your sister, Nata. 1 of 1.',
      },
      grandmother: {
        body: [
          'A column went south in the night. I heard it from the cellar.',
          'In the last war they moved the guns before the town was hit, not after. I am telling you'
            + ' so that you know I know.',
        ],
        sign: 'Keep your boots dry. Vera.',
      },
      brother: {
        body: [
          'A column went through at two. I was on the mill roof with the pickets and we counted it'
            + ' out: nine and the trailer. Nine and the trailer.',
          'Nobody on the roof said where it was going. Everybody on the roof knew.',
        ],
        sign: 'Your brother, Ilya.',
      },
    }),
  },
];

/* ------------------------------------------------------------------ the call */

/**
 * The telephone, at the end.
 *
 * The traffic has been one-way and monitored for the whole campaign so that
 * the call at the end means what it means — and then the ending reported the
 * call in a subordinate clause and stopped. This is the household's end of
 * it: their side only, in the voice their letters use, about eight lines.
 * After a decision taken at the console the line is clear and nobody is on
 * it but them; after a departure from the order it goes through from the
 * crossing at first light and it is monitored, and everybody on it knows;
 * after both cities held it is the one call that was permitted, with the
 * whole house on the other end of it and the street in the kitchen.
 */
export const CALLS = {
  judgement: {
    id: 'judgement',
    tm: 'ТЕЛЕФОН',
    title: 'THE TELEPHONE',
    plate: '0900 · TWENTY MINUTES · NOBODY LISTENING',
    lines: (hh, ctx) => {
      const first = firstName(ctx) || 'You';
      return {
        mother: [
          `${first}. Yes. Wait, I am sitting down.`,
          'The stove is drawing. I say that first because it is the thing you would ask, and now'
            + ' you can ask the rest.',
          'There are no clicks on the line. I know what the clicks were; I have known for a year.'
            + ' There are none this morning.',
          'Veselin\'s boy came home on Tuesday. His mother has not been impossible once. I did not'
            + ' know I would mind that.',
          'I took the photographs out of the drawer this morning. I had not decided to. They are'
            + ' on the west wall, and the wall is holding them.',
          'I am not going to ask what you did. I am going to ask when you are coming, and you are'
            + ' going to say you do not know, and then I am going to ask again.',
          'All well here. All well here. I will say it until you believe it, and then I will say'
            + ' it once more.',
        ],
        sister: [
          `${first}. It is you. Hold on, the younger one wants the receiver and she is not`
            + ' getting it.',
          'They are both here. The elder has been told to sit down and is not sitting down. Say'
            + ' something so he can hear it is you.',
          'The younger one drew you an aircraft this morning. It is flying up, off the top of the'
            + ' page. I do not know what that means and I am not going to ask her.',
          'The elder wants to know your rank. I have told him it does not matter this morning, and'
            + ' he has told me it always matters. He is nine.',
          'There is nobody on this line but us. I can hear that there is nobody. I have not heard'
            + ' that in a year.',
          'I am going to number this call one of one, and when you are home I am going to tell'
            + ' you which sheet it was.',
          'Nata. Both children. One of one.',
        ],
        grandmother: [
          `${first}. Good.`,
          'The line is clear. I have had a telephone through two wars and I know a clear line when'
            + ' I hear one.',
          'The cellar is stocked and the enamel box is by the door. Neither of them is needed'
            + ' now. I will leave them where they are for a week.',
          'I have twenty minutes and I am going to use them listening to you breathe. Say'
            + ' something, so that I can hear you doing it.',
          'Keep your boots dry. I mean it more than I have meant it before.',
          'Vera. That is all.',
        ],
        brother: [
          `Well, ${first}. Well. It is you.`,
          'The pump is holding. The pump is holding; I am saying it twice because the line is'
            + ' clear and I can.',
          'Nobody is listening. I have said things down this line for a year with somebody'
            + ' listening, and I do not know what to say down it now that nobody is.',
          'The pickets on the mill roof asked this morning if it was one of ours. I said yes. I'
            + ' said it twice.',
          'I worked out what you did from the roof. I am keeping it on the roof.',
          'The board can keep its decision. I have a ladder to carry and a telephone that works,'
            + ' and I am going to talk until it stops.',
          'Ilya. Your brother. Ilya.',
        ],
      }[hh] ?? [];
    },
  },
  defiant: {
    id: 'defiant',
    tm: 'ТЕЛЕФОН',
    title: 'THE TELEPHONE',
    plate: 'FIRST LIGHT · FROM THE CROSSING · MONITORED',
    lines: (hh, ctx) => {
      const first = firstName(ctx) || 'You';
      return {
        mother: [
          `${first}. I can hear you. I can hear the other one too, and he can hear me say it.`,
          'Everybody in the house is accounted for. That is what they told me to say, and it is'
            + ' also true.',
          'The stove is drawing. The photographs are on the wall. I am not going to say anything'
            + ' else that somebody can write down.',
          'I am going to stay on this line until it is taken off me, and you are going to stay on'
            + ' it too.',
          'All well here. Ksenia.',
        ],
        sister: [
          `${first}. The children are here and they are both quiet, which they have never been.`,
          'The house is standing. Everybody in it is accounted for. I will say that for whoever is'
            + ' listening, and then I will say it for you.',
          'The younger one drew nothing this morning. She wanted to hold the receiver instead.'
            + ' She is holding it now.',
          'I am not asking anything and you are not to answer anything. We are going to use the'
            + ' minutes anyway.',
          'Nata. Both children. And somebody else.',
        ],
        grandmother: [
          `${first}.`,
          'The house is standing and everybody in it is accounted for. Whoever is on this line can'
            + ' write that down; it is true.',
          'Whoever is writing this down can write that I have the kettle on. That is the whole of'
            + ' my news, and I am giving it slowly.',
          'Keep your boots dry. Vera.',
        ],
        brother: [
          `${first}. It is Ilya. Everybody is here, everybody is here.`,
          'Four houses below us are gone and ours is not. I am saying it for the man on the line'
            + ' and I am saying it for you.',
          'I am not asking what happens now. I am not asking. I know what a monitored line is for,'
            + ' and it is not for that.',
          'The pump is holding. The pump is holding. Ilya.',
        ],
      }[hh] ?? [];
    },
  },
  exemplary: {
    id: 'exemplary',
    tm: 'ТЕЛЕФОН',
    title: 'THE TELEPHONE',
    plate: 'BY MORNING · ONE CALL · PERMITTED',
    lines: (hh, ctx) => {
      const first = firstName(ctx) || 'You';
      return {
        mother: [
          `${first}. Yes. I have half the street in the kitchen and they can all hear me say it is`
            + ' you.',
          'We heard it. All of it, from the kitchen, with the stove drawing the whole time. I want'
            + ' you to know that the valley heard it.',
          'There is somebody on the line, and he can hear that the street is in my kitchen. I am'
            + ' told to keep it short, and I was told politely, so I am going to be polite back and'
            + ' then I am going to hand you round the room.',
          'Veselin\'s wife wants the receiver. The glazier wants the receiver. The glazier says he'
            + ' has not been asked to start a list and is not starting one.',
          'The photographs are on the wall, and I am not taking them down again.',
          'All well here. Everybody in this kitchen says all well here. Your mother, Ksenia.',
        ],
        sister: [
          `${first}. Both of them are here and both of them are talking, so you will have to take`
            + ' it in turns.',
          'The younger one has drawn the valley, with the aircraft going the other way. She wants'
            + ' you to know they went the other way.',
          'The elder has stopped correcting people about your rank. He has started correcting'
            + ' them about the valley, and I have let him.',
          'There is somebody on the line. I am used to it, and this morning I do not mind him,'
            + ' because there is nothing I would say to you this morning that I would not say in'
            + ' front of him.',
          'The house is standing and everybody in it is on this telephone. Nata. Both children,'
            + ' at once.',
        ],
        grandmother: [
          `${first}. I have the neighbours in. They are listening, and so is the line, and I do`
            + ' not care about either.',
          'We heard the guns from the cellar and I came up. I came up. I have not come up for one'
            + ' of them since the last war.',
          'The enamel box is going back on the shelf. The cellar can stay as it is; it is a'
            + ' cellar.',
          'Keep your boots dry. Vera. The neighbours say the same, and they are shouting it.',
        ],
        brother: [
          `${first}. The whole picket is here. They came down off the roof when the line rang and`
            + ' I have not had the receiver to myself since.',
          'We watched it from the roof. Every man up there knows which battery that was, and not'
            + ' one of them has said it out loud, and every one of them is going to say it later.',
          'The pump is holding. The mill is standing. Four men are shouting at me to tell you'
            + ' something, and I am telling you the pump is holding.',
          'The board wrote to me on Monday. I have not opened it. I am on the pickets, and the'
            + ' pickets held, and the board can read that in the returns like everybody else.',
          'Your brother. Ilya. And the roof.',
        ],
      }[hh] ?? [];
    },
  },
};

/** The call an ending promises, as a scene's worth of lines, or null. */
export function callFor(endingId, campaign) {
  const call = CALLS[endingId];
  const character = campaign?.character;
  if (!call || !character) return null;
  const lines = call.lines(character.household, { name: character.name });
  if (!lines.length) return null;
  return { id: call.id, tm: call.tm, title: call.title, plate: call.plate, lines };
}

export const letterById = (id) => LETTERS.find((l) => l.id === id) ?? null;

/* ---------------------------------------------------------------- notices */

/**
 * Not letters: the paperwork that stands where a letter should be. Bilingual
 * headings like everything else; the political section is nothing if not
 * correctly stencilled.
 */
const WITHHELD_NOTICE = {
  id: 'withheld-notice',
  tm: 'УВЕДОМЛЕНИЕ О ЗАДЕРЖАНИИ',
  title: 'NOTICE OF WITHHOLDING',
  lines: () => [
    'A letter addressed to you, posted from the Ville eleven days ago, is held by the sector'
      + ' political section pending assessment of your file.',
    'You are informed of this as regulation requires. The regulation does not require anything'
      + ' further, and nothing further is provided.',
    'For the sector political section.',
  ],
};

const PERMIT_NOTICE = {
  id: 'permit-close',
  tm: 'РАЗРЕШЕНИЕ НА ПРОЖИВАНИЕ',
  title: 'THE RESIDENCE PERMIT',
  lines: () => [
    'The review of your family\'s residence permit is concluded. No action is taken.',
    'You have now been informed of the outcome, as undertaken. The review remains in the file.',
    'For the sector political section.',
  ],
};

/**
 * How the post arrived, shown rather than narrated.
 *
 * `slip` is the section's own docket, a piece of paper clipped to the sheet.
 * `plate` is the same fact stencilled short, for the surfaces that have no
 * room for a slip — the dossier's correspondence list. One of the two, never
 * both on one screen: the quarters scene and the report used to stencil
 * OPENED AND RESEALED on the plate above the letter and then clip a slip to
 * the sheet saying the envelope had been opened and resealed, which is the
 * same sentence twice, eighteen inches apart.
 */
const DISPOSITIONS = {
  unopened: {
    plate: 'DELIVERED UNOPENED',
    slip: 'Delivered. It was not opened first.',
  },
  resealed: {
    plate: 'OPENED AND RESEALED',
    slip: 'The envelope has been opened and resealed. The resealing is competent.',
  },
  released: {
    plate: 'HELD, THEN RELEASED',
    slip: 'Released without comment. The postmark and the delivery date disagree. The seal is not'
      + ' the original seal.',
  },
  withheld: { plate: 'WITHHELD BY THE POLITICAL SECTION', slip: null },
  notice: { plate: 'SECTOR POLITICAL SECTION', slip: null },
};

/** The stencilled line above the paper, for a disposition the table knows. */
export const dispositionPlate = (disposition) => DISPOSITIONS[disposition]?.plate ?? null;

/** The section's docket, where it has one. */
function dispositionNote(disposition) {
  return DISPOSITIONS[disposition]?.slip ?? null;
}

/* ---------------------------------------------------------------- state */

export function emptyFamily() {
  return {
    /** Letters that reached you: { id, at, disposition, excerpt }. */
    delivered: [],
    /** Letters the political section is sitting on: { id, sinceWatch }. */
    withheld: [],
    /** The residence-permit thread: 'standing' | 'review' | 'closed'. */
    permit: 'standing',
    /** The watch the review opened on, so the office can say so once. */
    permitOpenedAt: null,
    permitClosedAt: null,
    /** Consecutive clean watches, for the release and permit machinery. */
    goodStreak: 0,
    /** The last thing the post did, for the next briefing to lean on. */
    lastDisposition: null,
    /** A concluded review still owes its one line of paperwork. */
    permitNoticeDue: false,
  };
}

/* ---------------------------------------------------------------- record */

function recordOnFile(campaign, id, disposition) {
  campaign.character?.record?.push({
    kind: 'family', id, at: campaign.character.watches, disposition,
  });
}

/**
 * The one line of paperwork a concluded review owes, when it goes out on the
 * docket of a released letter rather than on a sheet of its own.
 */
const PERMIT_DOCKET = 'The review of the residence permit is concluded. No action is taken, and'
  + ' you have now been informed of it, as undertaken.';

function letterPayload(template, disposition, hh, ctx, family, { closing = false } = {}) {
  const lines = template.lines(hh, ctx) ?? [];
  const docket = dispositionNote(disposition);
  const slip = closing && docket ? `${docket} ${PERMIT_DOCKET}` : docket;
  return {
    id: template.id,
    tm: template.tm,
    title: template.title,
    disposition,
    /** The stencil above the paper, only where no slip says the same thing. */
    plate: slip ? null : dispositionPlate(disposition),
    /** The section's slip, clipped to the sheet. */
    note: slip,
    heldCount: family.withheld.length,
    lines,
    /** The letter without its salutation and signature, for a one-line quote. */
    body: lines.slice(1, -1),
    /** A letter is a letter; a notice is the section's paperwork. */
    isLetter: true,
  };
}

function noticePayload(notice, disposition, family, standsFor = false) {
  return {
    id: notice.id,
    tm: notice.tm,
    title: notice.title,
    disposition,
    /*
     * A notice of withholding says on its face what it is standing in for, and
     * it says it as English. It used to stencil the withheld letter's own
     * headline after the words IN PLACE OF, and the headlines are sentences,
     * so four of the six produced NOTICE OF WITHHOLDING · IN PLACE OF THE ROAD
     * IS CLOSED FOR WORKS.
     */
    plate: standsFor ? 'IN PLACE OF A LETTER FROM THE VILLE' : dispositionPlate(disposition),
    note: null,
    heldCount: family.withheld.length,
    lines: notice.lines(),
    body: notice.lines(),
    isLetter: false,
  };
}

/**
 * Fold one finished watch into the family thread. Called from recordMission
 * with the tier the watch settled on; returns the debrief's letter card
 * payload, or null on a watch the post has nothing to say about.
 *
 * One card per debrief, by precedence: this watch's own letter (delivered or
 * withheld), then the release of a held letter, then the permit paperwork.
 * Deterministic — no RNG anywhere — and idempotent per letter: replays never
 * deliver the same letter twice.
 */
export function recordFamily(campaign, result, tierId) {
  if (!campaign.character) return null;
  campaign.family = { ...emptyFamily(), ...(campaign.family ?? {}) };
  const family = campaign.family;
  const watch = campaign.history.length;

  const good = tierId === 'commended' || tierId === 'satisfactory';
  const withholding = tierId === 'flagged' || tierId === 'condemned';

  // The residence permit. Opened by the condemned tier's own sentence;
  // closed after two clean watches, with its promised outcome: none.
  family.goodStreak = good ? (family.goodStreak ?? 0) + 1 : 0;
  if (tierId === 'condemned' && family.permit === 'standing') {
    family.permit = 'review';
    family.permitOpenedAt = watch;
  } else if (family.permit === 'review' && family.goodStreak >= 2) {
    family.permit = 'closed';
    family.permitClosedAt = watch;
    family.permitNoticeDue = true;
  }

  const seen = (id) => family.delivered.some((d) => d.id === id)
    || family.withheld.some((h) => h.id === id);
  const candidate = LETTERS.find((l) => [].concat(l.after).includes(result.missionId)
    && !seen(l.id));

  const ctx = {
    hit: !!result.stats?.homeDistrictHit,
    permit: family.permit,
    watch,
    /** The salutation is a person writing to a person, so it needs the name. */
    name: campaign.character.name,
    /** And one letter is addressed to the rank instead, which is the point of it. */
    rank: rankOf(campaign.character).en,
  };
  const hh = campaign.character.household;

  let payload = null;
  if (candidate && withholding) {
    family.withheld.push({ id: candidate.id, sinceWatch: watch });
    recordOnFile(campaign, candidate.id, 'withheld');
    payload = noticePayload(WITHHELD_NOTICE, 'withheld', family, true);
  } else if (candidate) {
    const disposition = tierId === 'commended' ? 'unopened' : 'resealed';
    const built = letterPayload(candidate, disposition, hh, ctx, family);
    family.delivered.push({
      id: candidate.id, at: watch, disposition, excerpt: built.body[0] ?? built.lines[0] ?? '',
    });
    recordOnFile(campaign, candidate.id, disposition);
    payload = built;
  } else if (good && family.withheld.length) {
    const held = family.withheld.shift();
    const template = letterById(held.id);
    /*
     * The section closes one file with one docket. If the review of the
     * permit concluded while the post was still being held, the notice of it
     * goes out clipped to the letter it was holding rather than waiting for
     * a quiet evening of its own, which the last watches do not offer: the
     * household writes on every one of them now.
     */
    const closing = !!family.permitNoticeDue;
    const built = letterPayload(template, 'released', hh, ctx, family, { closing });
    family.delivered.push({
      id: held.id, at: watch, disposition: 'released', excerpt: built.body[0] ?? built.lines[0] ?? '',
    });
    recordOnFile(campaign, held.id, 'released');
    if (closing) {
      family.permitNoticeDue = false;
      recordOnFile(campaign, 'permit', 'closed');
    }
    payload = built;
  } else if (family.permitNoticeDue) {
    family.permitNoticeDue = false;
    recordOnFile(campaign, 'permit', 'closed');
    payload = noticePayload(PERMIT_NOTICE, 'notice', family);
  }

  if (payload) {
    family.lastDisposition = { id: payload.id, disposition: payload.disposition, watch };
  }
  return payload;
}

/* ---------------------------------------------------------------- surfaces */

/**
 * One conditional line for the pre-watch briefing, beside the tier note.
 * Character-aware where the static brief arrays cannot be.
 */
export function briefLine(campaign, missionId) {
  const character = campaign.character;
  if (!character) return null;
  if (missionId === 'ville-under-fire') {
    const quarter = districtOf(character);
    return 'The main effort is coming down the valley tonight, and your people are in'
      + ` ${quarter.en}. The sector chart marks the crossing, the headquarters and the town. It`
      + ' does not mark which street they live on.';
  }
  if ((campaign.family?.permit ?? 'standing') === 'review') {
    return 'Your family\'s residence permit is still listed as under review. The office that writes'
      + ' to you about it writes when the review closes, and it has not closed.';
  }
  return null;
}

/**
 * A family override for the quiet line before the shooting starts. Returns
 * null to let the tier note speak instead.
 */
export function familyBriefingNote(campaign, missionId = null) {
  const family = campaign.family;
  if (!family) return null;
  /*
   * Only on the watch after the campaign ended. This line used to print on
   * every briefing once an ending existed, including a replayed First Light,
   * where a sector office that has stopped reading anything is two watches in
   * the future.
   */
  if (campaign.ending && missionId === 'presidents-flight') {
    return 'No letter this week. The office that reads them first has stopped reading anything.';
  }
  const last = family.lastDisposition;
  if (last?.disposition === 'withheld' && last.watch === (campaign.history?.length ?? 0)) {
    return 'Somewhere in the sector office there is a letter addressed to you, and somebody there'
      + ' has read it.';
  }
  return null;
}

/**
 * The clause the finale endings append to the household line when the post has
 * unfinished business — held letters, an unresolved permit. Null when every
 * thread is closed, which is the only way a thread is allowed to end here.
 */
export function familyClause(family) {
  if (!family) return null;
  const parts = [];
  const held = family.withheld?.length ?? 0;
  if (held) {
    const count = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'][held] ?? String(held);
    parts.push(`${count} ${held === 1 ? 'letter' : 'letters'} addressed to you`
      + ` ${held === 1 ? 'remains' : 'remain'} with the political section, to be forwarded when`
      + ' the assessment concludes.');
  }
  if (family.permit === 'review') {
    parts.push('The question of the residence permit is recorded as overtaken by events.');
  }
  return parts.length ? parts.join(' ') : null;
}
