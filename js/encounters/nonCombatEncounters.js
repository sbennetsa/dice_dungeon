// ════════════════════════════════════════════════════════════════
// NON-COMBAT ENCOUNTERS
// Social, political, and chance events that fire between floors.
// Each encounter connects to real game mechanics: gold, HP, XP.
// No combat — pure flavour + consequence.
// ════════════════════════════════════════════════════════════════

import { GS, gainGold, gainXP, heal } from '../state.js';
import { getAct } from '../constants.js';

// ── Result helper ─────────────────────────────────────────────
// Applies a Result object to live game state.
// Positive gold and HP rewards scale by act to stay relevant.
// Negative outcomes (damage, costs) are never scaled.
export function applyEncounterResult(result) {
  const act = getAct(GS.floor);
  const goldMult = [1, 1.5, 2.5][act - 1];
  const hpMult   = [1, 1.2, 1.5][act - 1];

  if (result.deltaHP) {
    const scaled = result.deltaHP > 0 ? Math.round(result.deltaHP * hpMult) : result.deltaHP;
    heal(scaled);
  }
  if (result.deltaGold) {
    const scaled = result.deltaGold > 0 ? Math.round(result.deltaGold * goldMult) : result.deltaGold;
    gainGold(scaled);
  }
  if (result.deltaXP) gainXP(result.deltaXP);
}

// ── Pool builder ──────────────────────────────────────────────
export function buildEncounterPool() {
  return NON_COMBAT_ENCOUNTERS
    .filter(e => !e.filter || e.filter(GS))
    .map(e => ({
      ...e,
      _weight: e.weight * (e.bias ? e.bias(GS) : 1),
    }));
}

// ── Weighted pick ─────────────────────────────────────────────
export function pickNonCombatEncounter() {
  const pool = buildEncounterPool();
  if (!pool.length) return null;

  // Optionally suppress recently seen encounters
  const seen = GS.seenEncounters || [];
  const fresh = pool.filter(e => !seen.includes(e.id));
  const active = fresh.length ? fresh : pool; // fallback if all seen

  const total = active.reduce((s, e) => s + e._weight, 0);
  let r = Math.random() * total;
  for (const e of active) {
    r -= e._weight;
    if (r <= 0) return e;
  }
  return active[active.length - 1];
}

// ── Mark as seen ──────────────────────────────────────────────
export function markEncounterSeen(id) {
  GS.seenEncounters = GS.seenEncounters || [];
  if (!GS.seenEncounters.includes(id)) {
    GS.seenEncounters.push(id);
    // Keep the last 8 to allow repeats after a while
    if (GS.seenEncounters.length > 8) GS.seenEncounters.shift();
  }
}

// ════════════════════════════════════════════════════════════════
// ENCOUNTER DATA
// ════════════════════════════════════════════════════════════════

export const NON_COMBAT_ENCOUNTERS = [

  // ── SOCIAL / POLITICAL ──────────────────────────────────────

  {
    id: 'toll_collector',
    family: 'social',
    title: 'The Toll Collector',
    flavour: 'A crossbow materialises from the shadows before you see the goblin holding it.',
    body: `A goblin mercenary blocks the only bridge forward. He's wearing a small badge that says "OFFICIAL TOLL AUTHORITY" in crooked letters. He looks underpaid. He looks tired. He still has the crossbow.`,
    weight: 6,
    filter: (gs) => gs.gold >= 5,
    bias:   (gs) => gs.act === 1 ? 1.5 : gs.act === 3 ? 0.4 : 1.0,
    choices: [
      {
        label: 'Pay the toll',
        hint: 'Costs 15 gold — safe passage',
        available: (gs) => gs.gold >= 15,
        effect: () => ({
          narrative: 'He tips his hat with surprising sincerity. "Safe travels." You believe him.',
          deltaGold: -15,
        }),
      },
      {
        label: 'Bluff your way through',
        hint: '50/50 — +20 XP or -8 HP',
        effect: () => {
          const roll = Math.ceil(Math.random() * 6);
          return roll >= 4
            ? { narrative: `You spin a tale about being a royal inspector. He buys it — barely. (Rolled ${roll})`, deltaXP: 20 }
            : { narrative: `He doesn't buy it. The bolt grazes your shoulder. (Rolled ${roll})`, deltaHP: -8 };
        },
      },
      {
        label: 'Turn back and find another route',
        hint: 'Safe — +10 gold from a stash you find along the way',
        effect: () => ({
          narrative: 'You double back through a service tunnel. It smells terrible. Someone left a coin purse wedged in a crack.',
          deltaGold: 10,
        }),
      },
    ],
  },

  {
    id: 'merchants_favour',
    family: 'social',
    title: "The Merchant's Favour",
    flavour: 'The crate is sealed tight. It ticks occasionally. She says that\'s normal.',
    body: `A travelling merchant intercepts you with the energy of someone who has already decided you're going to say yes. She's carrying a sealed crate and needs it delivered to the next checkpoint. Payment on delivery. "Perfectly legal," she adds, unprompted.`,
    weight: 5,
    choices: [
      {
        label: 'Accept the job',
        hint: '80% +25 gold / 20% -15 HP',
        effect: () => {
          const explodes = Math.random() < 0.2;
          return explodes
            ? { narrative: 'The crate explodes somewhere around floor three. On the bright side, you didn\'t have to carry it anymore.', deltaHP: -15 }
            : { narrative: 'You deliver it without incident. She\'s waiting, somehow. She pays without meeting your eyes.', deltaGold: 25 };
        },
      },
      {
        label: 'Decline',
        hint: 'Nothing lost',
        effect: () => ({
          narrative: 'She shrugs. "Your loss." She finds someone else within minutes.',
        }),
      },
      {
        label: 'Inspect the crate',
        hint: 'Costs 5 gold bribe — 50/50 find gold or lose the 5g',
        available: (gs) => gs.gold >= 5,
        effect: () => {
          const valuable = Math.random() < 0.5;
          return valuable
            ? { narrative: 'Valuables inside. You help yourself to a few before anyone notices.', deltaGold: 15 }
            : { narrative: 'The porter\'s eyes go wide. You both agree to walk away quickly.', deltaGold: -5 };
        },
      },
    ],
  },

  {
    id: 'wounded_soldier',
    family: 'social',
    title: 'The Wounded Soldier',
    flavour: 'She\'s still holding her sword, even now. Old habit.',
    body: `A soldier in colours you don't recognise is slumped against the wall, breathing shallowly. Her wounds are bad but not fatal — if someone helps. She looks up at you without asking.`,
    weight: 4,
    bias: (gs) => gs.hp > gs.maxHp * 0.6 ? 2.0 : 0.6,
    choices: [
      {
        label: 'Tend to her wounds',
        hint: 'Costs 10 HP — +20 gold reward',
        available: (gs) => gs.hp > 15,
        effect: () => ({
          narrative: 'She\'ll live. She presses something into your hand before you leave — coin purse, heavy.',
          deltaHP: -10,
          deltaGold: 20,
        }),
      },
      {
        label: 'Ask what she knows',
        hint: '+20 XP, no cost',
        effect: () => ({
          narrative: 'She shares what she knows about the dungeon. Hard-won knowledge.',
          deltaXP: 20,
        }),
      },
      {
        label: 'Leave her',
        hint: 'She\'ll probably survive',
        effect: () => ({
          narrative: 'You walk past. She doesn\'t call after you. The dungeon records it anyway.',
        }),
      },
    ],
  },

  {
    id: 'dice_shark',
    family: 'social',
    title: 'The Dice Shark',
    flavour: 'His dice are very clean. Suspiciously clean.',
    body: `A hooded figure has set up a table in an alcove. Folding table, velvet cloth, two cups. He doesn't look up when you approach. "One game," he says. "Your dice against mine."`,
    weight: 5,
    filter: (gs) => gs.gold > 0,
    choices: [
      {
        label: 'Play — wager 20 gold',
        hint: 'Win: +35g / Lose: -20g',
        available: (gs) => gs.gold >= 20,
        effect: () => {
          const win = Math.random() < 0.5;
          return win
            ? { narrative: 'Your roll is better. He pays without complaint, which is somehow unnerving.', deltaGold: 35 }
            : { narrative: 'His roll is better. He scoops the coins with practiced ease.', deltaGold: -20 };
        },
      },
      {
        label: 'Play — wager everything',
        hint: 'High risk — win 2× your stake (up to 100g) or lose it all',
        available: (gs) => gs.gold >= 20,
        effect: () => {
          const win = Math.random() < 0.5;
          const stake = Math.min(GS.gold, 100);
          return win
            ? { narrative: `Your roll is perfect. He pays double without a word. You leave richer than you arrived.`, deltaGold: stake * 2 }
            : { narrative: 'You walk away with nothing. He does not gloat.', deltaGold: -stake };
        },
      },
      {
        label: 'Watch, don\'t play',
        hint: '+20 XP — study his technique',
        effect: () => ({
          narrative: 'You study his technique. His tells are subtle. You file them away.',
          deltaXP: 20,
        }),
      },
      {
        label: 'Accuse him of cheating',
        hint: '50/50 — +15g or -12 HP',
        effect: () => {
          const roll = Math.ceil(Math.random() * 6);
          return roll >= 4
            ? { narrative: `He folds immediately. Hands you 15 gold. "Fair enough," he says. (Rolled ${roll})`, deltaGold: 15 }
            : { narrative: `He takes offence. The table goes over. Someone gets punched. (Rolled ${roll})`, deltaHP: -12 };
        },
      },
    ],
  },

  {
    id: 'guild_recruiter',
    family: 'social',
    title: 'The Guild Recruiter',
    flavour: 'The uniform is impeccable. Everything about this screams paperwork.',
    body: `An Adventurer's Guild recruiter materialises from nowhere, clipboard in hand. She's been waiting. She wants your registration fee — or, failing that, your combat stories. She'll file whatever you give her.`,
    weight: 4,
    choices: [
      {
        label: 'Pay the registration fee',
        hint: 'Costs 30 gold — +40 XP',
        available: (gs) => gs.gold >= 30,
        effect: () => ({
          narrative: 'You sign. The badge is heavier than expected. She hands you a pamphlet you will never read.',
          deltaGold: -30,
          deltaXP: 40,
        }),
      },
      {
        label: 'Tell her about your fights',
        hint: 'Free — +15 XP for the debrief',
        effect: () => ({
          narrative: 'She takes rapid notes. Asks good questions. Recounting it all, you realise how much you\'ve learned.',
          deltaXP: 15,
        }),
      },
      {
        label: 'Challenge her to prove you\'re worth a discount',
        hint: '50/50 — free registration (+40 XP) or pay double (-15g, +20 XP)',
        effect: () => {
          const roll = Math.ceil(Math.random() * 6);
          return roll >= 4
            ? { narrative: `She's impressed. "Provisional member." The badge costs nothing. (Rolled ${roll})`, deltaXP: 40 }
            : { narrative: `She's not impressed. You pay a processing fee for wasting her time. (Rolled ${roll})`, deltaGold: -15, deltaXP: 20 };
        },
      },
      {
        label: 'Decline',
        hint: 'Nothing lost',
        effect: () => ({
          narrative: 'She notes your name anyway. "We\'ll be in touch," she says.',
        }),
      },
    ],
  },

  // ── CHANCE / DISCOVERY ──────────────────────────────────────

  {
    id: 'forgotten_cache',
    family: 'chance',
    title: 'The Forgotten Cache',
    flavour: 'Someone hid this and never came back for it.',
    body: `A loose stone in the wall. Behind it: a leather satchel, well-preserved, clearly stashed in a hurry. The contents are a mystery until you open it.`,
    weight: 6,
    choices: [
      {
        label: 'Take everything',
        hint: '+20 gold +8 XP — small risk of HP loss',
        effect: () => {
          const trapped = Math.random() < 0.15;
          return trapped
            ? { narrative: 'Gold and trinkets — and a needle trap. Poison seeps into the wound.', deltaGold: 20, deltaXP: 8, deltaHP: -8 }
            : { narrative: 'Clean score. Whoever left this isn\'t coming back for it.', deltaGold: 20, deltaXP: 8 };
        },
      },
      {
        label: 'Take carefully',
        hint: '+15 gold +5 XP, no risk',
        effect: () => ({
          narrative: 'Slow and methodical. You check everything. 15 gold and your peace of mind.',
          deltaGold: 15,
          deltaXP: 5,
        }),
      },
      {
        label: 'Leave it',
        hint: 'Nothing',
        effect: () => ({
          narrative: 'You push the stone back. Maybe the next person needs it more.',
        }),
      },
    ],
  },

  {
    id: 'lucky_coin',
    family: 'chance',
    title: 'The Lucky Coin',
    flavour: 'Heads up. You notice these things.',
    body: `A single coin on the floor, face up, catching the light at exactly the right angle to catch your eye. It feels intentional.`,
    weight: 8,
    choices: [
      {
        label: 'Pocket it',
        hint: '50/50 — +15 gold or just 3 gold',
        effect: () => {
          const lucky = Math.random() < 0.5;
          return lucky
            ? { narrative: 'It hums in your palm. Worth more than it looks.', deltaGold: 15 }
            : { narrative: 'Just a coin. Still, 3 gold is 3 gold.', deltaGold: 3 };
        },
      },
      {
        label: 'Leave it',
        hint: 'Walk on',
        effect: () => ({
          narrative: 'You leave it for the next person. Heads up.',
        }),
      },
      {
        label: 'Examine it first',
        hint: '50/50 — +10 HP blessing or just 3 gold',
        effect: () => {
          const lucky = Math.random() < 0.5;
          return lucky
            ? { narrative: 'Inscribed on the edge: a blessing glyph. You feel invigorated.', deltaHP: 10 }
            : { narrative: 'Just copper, minted in a city that probably doesn\'t exist anymore. Worth 3 gold.', deltaGold: 3 };
        },
      },
    ],
  },

  {
    id: 'collapsed_shrine',
    family: 'chance',
    title: 'The Collapsed Shrine',
    flavour: 'The god is gone. The stone remembers something, though.',
    body: `A shrine to a deity whose name has been chiselled off the inscription. Half-buried in rubble. The inscription that remains is a simple instruction: give and receive.`,
    weight: 5,
    choices: [
      {
        label: 'Pray and offer gold (10g)',
        hint: 'Costs 10 gold — one of three blessings',
        available: (gs) => gs.gold >= 10,
        effect: () => {
          const roll = Math.ceil(Math.random() * 3);
          if (roll === 1) return { narrative: 'Warmth. Real warmth. Your wounds close a little.', deltaGold: -10, deltaHP: 15 };
          if (roll === 2) return { narrative: 'A sudden, vivid memory that isn\'t yours. Useful, somehow.', deltaGold: -10, deltaXP: 20 };
          return { narrative: 'The shrine hums. You feel lighter on your feet, ready for what\'s ahead.', deltaGold: -10, deltaHP: 10, deltaXP: 10 };
        },
      },
      {
        label: 'Pray without offering',
        hint: '50/50 — smaller blessing or nothing',
        effect: () => {
          const blessed = Math.random() < 0.5;
          return blessed
            ? { narrative: 'Something acknowledges you. A small warmth, a small mercy.', deltaHP: 8 }
            : { narrative: 'Silence. The old gods have priorities you don\'t understand.' };
        },
      },
      {
        label: 'Salvage what you can',
        hint: '+8 gold, small HP risk',
        effect: () => {
          const punished = Math.random() < 0.3;
          return punished
            ? { narrative: 'The moment you pocket the stone, something goes wrong.', deltaGold: 8, deltaHP: -10 }
            : { narrative: 'Sacred stonework fetches good money. No immediate consequences.', deltaGold: 8 };
        },
      },
    ],
  },

  {
    id: 'cartographers_mistake',
    family: 'chance',
    title: "The Cartographer's Mistake",
    flavour: "The X is very confident. The route to it less so.",
    body: `A dead adventurer, map pinned to their chest like a note to the finder. The map shows a shortcut — or what looks like one. Could be the cartographer was good. Could be the cartographer was optimistic.`,
    weight: 4,
    choices: [
      {
        label: 'Follow the map',
        hint: '60% +30 XP shortcut / 40% -8 HP dead end',
        effect: () => {
          const works = Math.random() < 0.6;
          return works
            ? { narrative: 'The route is good. You move quickly, learn the dungeon\'s layout. Time well spent.', deltaXP: 30 }
            : { narrative: 'The route is wrong. An hour of backtracking in the dark.', deltaHP: -8 };
        },
      },
      {
        label: 'Sell the map',
        hint: '+15 gold',
        effect: () => ({
          narrative: 'You fold it carefully. A cartographer\'s map is worth something to the right buyer. You find one quickly.',
          deltaGold: 15,
        }),
      },
      {
        label: 'Leave it',
        hint: 'Walk on',
        effect: () => ({
          narrative: 'You leave it with its original owner. It feels right.',
        }),
      },
    ],
  },

  {
    id: 'echoing_whisper',
    family: 'chance',
    title: 'The Echoing Whisper',
    flavour: 'It knew your name. Not your title. Your name.',
    body: `From nowhere — clearly, distinctly, in a voice you almost recognise — you hear your name. Not an echo. Not a trick of the stonework. The dungeon is aware of you.`,
    weight: 3, // rare
    choices: [
      {
        label: 'Answer it',
        hint: '+20 XP',
        effect: () => ({
          narrative: '"Yes," you say. The silence that follows feels like approval.',
          deltaXP: 20,
        }),
      },
      {
        label: 'Ignore it',
        hint: 'Small chance of bad outcome',
        effect: () => {
          const roll = Math.ceil(Math.random() * 6);
          return roll <= 2
            ? { narrative: 'It doesn\'t appreciate being ignored.', deltaHP: -5 }
            : { narrative: 'Nothing follows. Maybe you were imagining it.' };
        },
      },
      {
        label: 'Shout back',
        hint: '50/50 — +30 XP or -10 HP',
        effect: () => {
          const roll = Math.ceil(Math.random() * 6);
          return roll >= 4
            ? { narrative: `The dungeon roars back. Something shifts in you. (Rolled ${roll})`, deltaXP: 30 }
            : { narrative: `The sound turns on you. The walls ring for a long time. (Rolled ${roll})`, deltaHP: -10 };
        },
      },
    ],
  },

  // ── CURSES / BLESSINGS ──────────────────────────────────────

  {
    id: 'healers_camp',
    family: 'blessing',
    title: "The Healer's Camp",
    flavour: "They set up here deliberately. They know the dungeon's rhythms.",
    body: `Field medics in a torchlit alcove, equipment clean, prices chalked on a board. They've seen a lot of adventurers. Their bedside manner reflects this.`,
    weight: 5,
    bias: (gs) => gs.hp < gs.maxHp * 0.35 ? 3.0 : gs.hp < gs.maxHp * 0.6 ? 1.5 : 0.7,
    choices: [
      {
        label: 'Full restoration',
        hint: 'Costs 25 gold — heal to full',
        available: (gs) => gs.gold >= 25,
        effect: () => ({
          narrative: 'You leave in better shape than you entered. That\'s rarer than it sounds.',
          deltaGold: -25,
          deltaHP: GS.maxHp - GS.hp,
        }),
      },
      {
        label: 'Partial treatment',
        hint: 'Costs 10 gold — restore 20 HP',
        available: (gs) => gs.gold >= 10,
        effect: () => ({
          narrative: 'Bandaged, cleaned, functional. Not comfortable, but functional.',
          deltaGold: -10,
          deltaHP: 20,
        }),
      },
      {
        label: 'Donate blood for their research',
        hint: 'Costs 8 HP — +25 XP',
        available: (gs) => gs.hp > 12,
        effect: () => ({
          narrative: 'They ask a lot of questions while they work. You gain more than you expected.',
          deltaHP: -8,
          deltaXP: 25,
        }),
      },
    ],
  },

  {
    id: 'bone_altar',
    family: 'curse',
    title: 'The Bone Altar',
    flavour: "It pulses. Not like a heartbeat. Like something counting.",
    body: `An altar assembled from what was once alive, arranged with disturbing care. It shouldn't work. It does. It accepts offerings. It gives things back.`,
    weight: 3,
    filter: (gs) => gs.hp > 25,
    choices: [
      {
        label: 'Offer your blood (20 HP)',
        hint: 'High risk, high reward — +60 XP',
        available: (gs) => gs.hp > 25,
        effect: () => ({
          narrative: 'You leave a little of yourself on the altar. Knowledge floods in — ancient, useful, dangerous.',
          deltaHP: -20,
          deltaXP: 60,
        }),
      },
      {
        label: 'Offer gold (30g)',
        hint: '+25 XP and +10 HP',
        available: (gs) => gs.gold >= 30,
        effect: () => ({
          narrative: 'The coins vanish before they touch the stone. Warmth flows through you.',
          deltaGold: -30,
          deltaXP: 25,
          deltaHP: 10,
        }),
      },
      {
        label: 'Smash it',
        hint: '50/50 — +25 XP or -15 HP',
        effect: () => {
          const win = Math.random() < 0.5;
          return win
            ? { narrative: 'It breaks cleanly. You feel lighter.', deltaXP: 25 }
            : { narrative: 'It breaks badly. Something was still in there.', deltaHP: -15 };
        },
      },
    ],
  },

  {
    id: 'whispering_fungus',
    family: 'chance',
    title: 'The Whispering Fungus',
    flavour: "The hum is below hearing. You feel it in your back teeth.",
    body: `A vast mycelial network covers one wall entirely, bioluminescent, clearly conscious in some distributed way. It offers nothing directly. It simply exists, and waits to see what you'll do about it.`,
    weight: 4,
    choices: [
      {
        label: 'Eat a sample',
        hint: 'Random — could be anything',
        effect: () => {
          const outcomes = [
            { narrative: 'A rush of warmth. Genuine healing.', deltaHP: 20 },
            { narrative: 'Sudden clarity. You understand things you didn\'t before.', deltaXP: 25 },
            { narrative: 'Wrong kind. Very wrong kind.', deltaHP: -10 },
            { narrative: 'It tastes like gold smells. Literally.', deltaGold: 20 },
            { narrative: 'Nothing. You feel faintly embarrassed.' },
          ];
          return outcomes[Math.floor(Math.random() * outcomes.length)];
        },
      },
      {
        label: 'Inhale the spores',
        hint: '+25 XP — heightened awareness',
        effect: () => ({
          narrative: 'The spores are information. The dungeon\'s layout feels clearer somehow.',
          deltaXP: 25,
        }),
      },
      {
        label: 'Burn it',
        hint: '+15 gold, lose the mystery',
        effect: () => ({
          narrative: 'Valuable bioluminescent material. Practical choice. The hum stops.',
          deltaGold: 15,
        }),
      },
    ],
  },

  {
    id: 'mirror_pool',
    family: 'blessing',
    title: 'The Mirror Pool',
    flavour: "Your reflection shows someone slightly ahead of where you are.",
    body: `A perfectly still pool in a side chamber. No current, no drip, no disturbance. Your reflection looks back — but not quite accurately. It shows what you could be.`,
    weight: 3,
    choices: [
      {
        label: 'Gaze into it',
        hint: '+30 XP',
        effect: () => ({
          narrative: 'The reflection shows you older, harder, further along. Something about it steadies you.',
          deltaXP: 30,
        }),
      },
      {
        label: 'Reach in',
        hint: 'Roll d6 — +25 gold, +15 HP, or -10 HP',
        effect: () => {
          const roll = Math.ceil(Math.random() * 6);
          if (roll >= 5) return { narrative: `Your hand closes on something real. Cold coins from nowhere. (Rolled ${roll})`, deltaGold: 25 };
          if (roll >= 3) return { narrative: `A gentle warmth flows up your arm. (Rolled ${roll})`, deltaHP: 15 };
          return { narrative: `The pool takes something from you. (Rolled ${roll})`, deltaHP: -10 };
        },
      },
      {
        label: 'Drink from it',
        hint: '+15 HP',
        effect: () => ({
          narrative: 'The water tastes like nothing. Your wounds feel like nothing too.',
          deltaHP: 15,
        }),
      },
    ],
  },

  {
    id: 'dark_bargain',
    family: 'curse',
    title: 'The Dark Bargain',
    flavour: "No tricks. It just wants something. It's very clear about this.",
    body: `A voice. No body. No theatrics. It makes you an offer in plain, direct language. It wants something small. It will give you something in return. The exchange is modest. The reasons remain opaque.`,
    weight: 2, // rare
    choices: [
      {
        label: 'Trade some luck',
        hint: 'Gamble — 50/50: +20 HP or -20 gold',
        effect: () => {
          const win = Math.random() < 0.5;
          return win
            ? { narrative: 'Your luck holds. Something courses through you — borrowed vitality.', deltaHP: 20 }
            : { narrative: 'Your luck doesn\'t. A hand reaches through nothing and takes its payment.', deltaGold: -20 };
        },
      },
      {
        label: 'Trade something small',
        hint: '-10 HP, +25 XP',
        available: (gs) => gs.hp > 15,
        effect: () => ({
          narrative: 'It takes something from you that\'s hard to name. Knowledge fills the space it left.',
          deltaHP: -10,
          deltaXP: 25,
        }),
      },
      {
        label: 'Trade some gold',
        hint: '-25 gold, +30 XP',
        available: (gs) => gs.gold >= 25,
        effect: () => ({
          narrative: 'The coins disappear before you finish counting them. Something settles in your mind.',
          deltaGold: -25,
          deltaXP: 30,
        }),
      },
      {
        label: 'Refuse',
        hint: 'Nothing — it thanks you for your time',
        effect: () => ({
          narrative: '"As you wish," it says, without disappointment. That\'s the unsettling part.',
        }),
      },
    ],
  },

];
