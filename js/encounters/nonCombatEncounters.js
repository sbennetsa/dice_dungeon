// ════════════════════════════════════════════════════════════════
// NON-COMBAT ENCOUNTERS
// Social, political, and chance events that fire between floors.
// Each encounter connects to real game mechanics: gold, HP, XP,
// artifacts, dice. No combat — pure flavour + consequence.
// ════════════════════════════════════════════════════════════════

import { GS, gainGold, gainXP, heal, log } from '../state.js';

// ── Result helper ─────────────────────────────────────────────
// Applies a Result object to live game state.
// Call this after the player picks a choice.
export function applyEncounterResult(result) {
  if (result.deltaHP)   heal(result.deltaHP);
  if (result.deltaGold) gainGold(result.deltaGold);
  if (result.deltaXP)   gainXP(result.deltaXP);

  if (result.artifact) {
    GS.artifacts.push(result.artifact);
    log(`Found artifact: ${result.artifact}`);
    // TODO: trigger artifact bar re-render
  }

  if (result.diceBonus) {
    // Add a bonus die to the pool
    // TODO: hook into engine.js die creation
    // GS.dice.push(createDie(result.diceBonus.faces));
    log(`Gained a d${result.diceBonus.faces}!`);
  }

  if (result.curse) {
    GS.curses = GS.curses || [];
    GS.curses.push(result.curse);
    log(`Cursed: ${result.curse}`);
    // TODO: passive effects applied in combat.js
  }

  if (result.flagNext) {
    // Arbitrary one-shot flags for cross-encounter continuity
    GS.encounterFlags = GS.encounterFlags || {};
    GS.encounterFlags[result.flagNext] = true;
  }
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
    body: `A goblin mercenary blocks the only bridge forward. He's wearing a small badge that says
           "OFFICIAL TOLL AUTHORITY" in crooked letters. He looks underpaid. He looks tired.
           He still has the crossbow.`,
    weight: 6,
    filter: (gs) => gs.gold >= 5,
    bias:   (gs) => gs.act === 1 ? 1.5 : gs.act === 3 ? 0.4 : 1.0,
    choices: [
      {
        label: 'Pay the toll',
        hint: 'Costs 15 gold',
        available: (gs) => gs.gold >= 15,
        effect: () => ({
          narrative: 'He tips his hat with surprising sincerity. "Safe travels." You believe him.',
          deltaGold: -15,
          deltaXP: 1,
        }),
      },
      {
        label: 'Bluff your way through',
        hint: 'Risky — he might shoot',
        effect: () => {
          const roll = Math.ceil(Math.random() * 6);
          return roll >= 4
            ? { narrative: `You spin a tale about being a royal inspector. He buys it — barely. (Rolled ${roll})`, deltaXP: 3 }
            : { narrative: `He doesn't buy it. The bolt grazes your shoulder. (Rolled ${roll})`, deltaHP: -8 };
        },
      },
      {
        label: 'Turn back and find another route',
        hint: 'Wastes time, no cost',
        effect: () => ({
          narrative: 'You double back through a service tunnel. It smells terrible. You arrive late but unharmed.',
          // In screens.js: re-roll the floor encounter on this result
          flagNext: 'reroll_floor',
        }),
      },
    ],
  },

  {
    id: 'merchants_favour',
    family: 'social',
    title: "The Merchant's Favour",
    flavour: 'The crate is sealed tight. It ticks occasionally. She says that\'s normal.',
    body: `A travelling merchant intercepts you with the energy of someone who has already decided
           you're going to say yes. She's carrying a sealed crate and needs it delivered to
           the next checkpoint. Payment on delivery. "Perfectly legal," she adds, unprompted.`,
    weight: 5,
    choices: [
      {
        label: 'Accept the job',
        hint: '+25 gold on next floor clear (probably)',
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
        hint: 'Costs 5 gold bribe to the porter',
        available: (gs) => gs.gold >= 5,
        effect: () => {
          // 50/50: artifact or bomb — but you find out safely
          const isBomb = Math.random() < 0.5;
          return isBomb
            ? { narrative: 'The porter\'s eyes go wide. You both agree to walk away quickly.', deltaGold: -5 }
            : { narrative: 'A genuine relic, misattributed. You pocket it before she notices.', deltaGold: -5, artifact: 'random_act_artifact' };
        },
      },
    ],
  },

  {
    id: 'wounded_soldier',
    family: 'social',
    title: 'The Wounded Soldier',
    flavour: 'She\'s still holding her sword, even now. Old habit.',
    body: `A soldier in colours you don't recognise is slumped against the wall, breathing shallowly.
           Her wounds are bad but not fatal — if someone helps. She looks up at you without asking.`,
    weight: 4,
    bias: (gs) => gs.hp > gs.maxHp * 0.6 ? 2.0 : 0.6,
    choices: [
      {
        label: 'Tend to her wounds',
        hint: 'Costs 10 HP worth of supplies',
        available: (gs) => gs.hp > 15,
        effect: () => ({
          narrative: 'She\'ll live. She presses something into your hand before you leave.',
          deltaHP: -10,
          artifact: 'random_act_artifact',
        }),
      },
      {
        label: 'Ask what she knows',
        hint: 'Information, no cost',
        effect: () => ({
          narrative: 'She describes the floor ahead in careful detail. You won\'t be surprised.',
          deltaXP: 15,
          flagNext: 'preview_next_enemy',
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
    body: `A hooded figure has set up a table in an alcove. Folding table, velvet cloth, two cups.
           He doesn't look up when you approach. "One game," he says. "Your dice against mine."`,
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
        hint: 'Win: double gold / Lose: lose all gold',
        available: (gs) => gs.gold >= 20,
        effect: () => {
          const win = Math.random() < 0.5;
          const stake = GS.gold;
          return win
            ? { narrative: `You walk away with ${stake * 2} gold. He's already looking for the next mark.`, deltaGold: stake }
            : { narrative: 'You walk away with nothing. He does not gloat.', deltaGold: -stake };
        },
      },
      {
        label: 'Watch, don\'t play',
        hint: '+5 XP, no risk',
        effect: () => ({
          narrative: 'You study his technique. His tells are subtle. You file them away.',
          deltaXP: 5,
        }),
      },
      {
        label: 'Accuse him of cheating',
        hint: 'Might go badly',
        effect: () => {
          const roll = Math.ceil(Math.random() * 6);
          return roll >= 5
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
    body: `An Adventurer's Guild recruiter materialises from nowhere, clipboard in hand.
           She's been waiting. The Guild offers real benefits — insurance, referrals, discounts.
           The fee is also real.`,
    weight: 4,
    filter: (gs) => !gs.artifacts.includes('guild_badge'),
    choices: [
      {
        label: 'Join the Guild',
        hint: 'Costs 30 gold — gain Guild Badge artifact',
        available: (gs) => gs.gold >= 30,
        effect: () => ({
          narrative: 'You sign. The badge is heavier than expected. She hands you a pamphlet.',
          deltaGold: -30,
          artifact: 'guild_badge',
        }),
      },
      {
        label: 'Negotiate the fee',
        hint: '50/50 — might join for 15g or offend her',
        effect: () => {
          const roll = Math.ceil(Math.random() * 6);
          return roll >= 4
            ? { narrative: `She checks a box. "New member discount." You join for 15 gold. (Rolled ${roll})`, deltaGold: -15, artifact: 'guild_badge' }
            : { narrative: `She closes her clipboard. "Full price or nothing." She walks away. (Rolled ${roll})` };
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
    body: `A loose stone in the wall. Behind it: a leather satchel, well-preserved, clearly stashed
           in a hurry. The contents are a mystery until you open it.`,
    weight: 6,
    choices: [
      {
        label: 'Take everything',
        hint: '+20 gold — small curse risk',
        effect: () => {
          const cursed = Math.random() < 0.15;
          return cursed
            ? { narrative: 'Gold and trinkets — and something else. Something that got into you.', deltaGold: 20, deltaXP: 5, curse: 'minor_hex' }
            : { narrative: 'Clean score. Whoever left this isn\'t coming back for it.', deltaGold: 20, deltaXP: 5 };
        },
      },
      {
        label: 'Take carefully',
        hint: '+15 gold, no risk',
        effect: () => ({
          narrative: 'Slow and methodical. You check everything. 15 gold and your peace of mind.',
          deltaGold: 15,
          deltaXP: 3,
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
    body: `A single coin on the floor, face up, catching the light at exactly the right angle
           to catch your eye. It feels intentional.`,
    weight: 8,
    choices: [
      {
        label: 'Pocket it',
        hint: 'Flip for luck — could be magic',
        effect: () => {
          const lucky = Math.random() < 0.5;
          return lucky
            ? { narrative: 'It hums in your palm. This is a Luck Token. You keep it somewhere safe.', artifact: 'luck_token' }
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
        hint: 'Identify safely before committing',
        effect: () => {
          const lucky = Math.random() < 0.5;
          // Reveals outcome — player still has to pick it up or leave after seeing
          return lucky
            ? { narrative: 'Inscribed on the edge: a blessing glyph. This is a Luck Token.', artifact: 'luck_token' }
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
    body: `A shrine to a deity whose name has been chiselled off the inscription. Half-buried
           in rubble. The inscription that remains is a simple instruction: give and receive.`,
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
          return { narrative: 'One of your dice feels different. Heavier. Better.', deltaGold: -10, diceBonus: { faces: 6, count: 1 } };
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
        hint: '+8 gold, small curse risk',
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
    body: `A dead adventurer, map pinned to their chest like a note to the finder. The map
           shows a shortcut to the boss floor — or what looks like one. Could be the cartographer
           was good. Could be the cartographer was optimistic.`,
    weight: 4,
    choices: [
      {
        label: 'Follow the map',
        hint: '60% skip a floor / 40% lose 8 HP',
        effect: () => {
          const works = Math.random() < 0.6;
          return works
            ? { narrative: 'The shortcut is real. You emerge one floor ahead, slightly smug.', flagNext: 'skip_floor' }
            : { narrative: 'The shortcut is not real. An hour of backtracking in the dark.', deltaHP: -8 };
        },
      },
      {
        label: 'Hold the map for later',
        hint: 'Sell at next shop for +15 gold',
        effect: () => ({
          narrative: 'You fold it carefully. A cartographer\'s map is worth something to the right buyer.',
          flagNext: 'has_map_to_sell',
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
    body: `From nowhere — clearly, distinctly, in a voice you almost recognise — you hear your
           name. Not an echo. Not a trick of the stonework. The dungeon is aware of you.`,
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
        hint: '+10 XP, reshuffles next encounter',
        effect: () => ({
          narrative: 'Your voice bounces back changed. Something shifts in the dungeon\'s order.',
          deltaXP: 10,
          flagNext: 'reshuffle_encounter_pool',
        }),
      },
    ],
  },

  // ── CURSES / BLESSINGS ──────────────────────────────────────

  {
    id: 'healers_camp',
    family: 'blessing',
    title: "The Healer's Camp",
    flavour: "They set up here deliberately. They know the dungeon's rhythms.",
    body: `Field medics in a torchlit alcove, equipment clean, prices chalked on a board.
           They've seen a lot of adventurers. Their bedside manner reflects this.`,
    weight: 5,
    bias: (gs) => gs.hp < gs.maxHp * 0.35 ? 3.0 : gs.hp < gs.maxHp * 0.6 ? 1.5 : 0.7,
    choices: [
      {
        label: 'Full restoration',
        hint: 'Costs 25 gold',
        available: (gs) => gs.gold >= 25,
        effect: () => ({
          narrative: 'You leave in better shape than you entered. That\'s rarer than it sounds.',
          deltaGold: -25,
          deltaHP: GS.maxHp - GS.hp, // full heal
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
        hint: 'Free — but costs 8 HP',
        available: (gs) => gs.hp > 12,
        effect: () => ({
          narrative: 'They ask a lot of questions while they work. You gain more than you expected.',
          deltaHP: -8,
          deltaXP: 15,
          artifact: 'random_consumable',
        }),
      },
    ],
  },

  {
    id: 'bone_altar',
    family: 'curse',
    title: 'The Bone Altar',
    flavour: "It pulses. Not like a heartbeat. Like something counting.",
    body: `An altar assembled from what was once alive, arranged with disturbing care.
           It shouldn't work. It does. It accepts offerings. It gives things back.`,
    weight: 3,
    filter: (gs) => gs.hp > 25,
    choices: [
      {
        label: 'Offer your blood (20 HP)',
        hint: 'One die gains +2 permanently — but it costs you',
        available: (gs) => gs.hp > 25,
        effect: () => ({
          narrative: 'You leave a little of yourself on the altar. One of your dice feels awake now.',
          deltaHP: -20,
          diceBonus: { faces: 2, count: 0, modifier: '+2_to_existing' }, // TODO: hook to specific die upgrade
        }),
      },
      {
        label: 'Offer gold (30g)',
        hint: 'Gain a random artifact',
        available: (gs) => gs.gold >= 30,
        effect: () => ({
          narrative: 'The coins vanish before they touch the stone. Something else appears in your hand.',
          deltaGold: -30,
          artifact: 'random_act_artifact',
        }),
      },
      {
        label: 'Smash it',
        hint: '50/50 — satisfaction or retribution',
        effect: () => {
          const win = Math.random() < 0.5;
          return win
            ? { narrative: 'It breaks cleanly. You feel lighter.', deltaXP: 10 }
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
    body: `A vast mycelial network covers one wall entirely, bioluminescent, clearly conscious
           in some distributed way. It offers nothing directly. It simply exists, and waits
           to see what you'll do about it.`,
    weight: 4,
    choices: [
      {
        label: 'Eat a sample',
        hint: 'Random outcome — could be anything',
        effect: () => {
          const outcomes = [
            { narrative: 'A rush of warmth. Genuine healing.', deltaHP: 20 },
            { narrative: 'Sudden clarity. You understand things you didn\'t before.', deltaXP: 25 },
            { narrative: 'Wrong kind. Very wrong kind.', deltaHP: -10 },
            { narrative: 'Something falls from your pocket that wasn\'t there before.', artifact: 'random_act_artifact' },
            { narrative: 'Nothing. You feel faintly embarrassed.' },
          ];
          return outcomes[Math.floor(Math.random() * outcomes.length)];
        },
      },
      {
        label: 'Inhale the spores',
        hint: 'Gain Spore Sight — reveals hidden elite modifier once',
        effect: () => ({
          narrative: 'The spores are information. You understand what\'s coming.',
          artifact: 'spore_sight',
        }),
      },
      {
        label: 'Burn it',
        hint: '+5 gold, lose the mystery',
        effect: () => ({
          narrative: 'Valuable bioluminescent material. Practical choice. The hum stops.',
          deltaGold: 5,
        }),
      },
    ],
  },

  {
    id: 'mirror_pool',
    family: 'blessing',
    title: 'The Mirror Pool',
    flavour: "Your reflection shows someone slightly ahead of where you are.",
    body: `A perfectly still pool in a side chamber. No current, no drip, no disturbance.
           Your reflection looks back — but not quite accurately. It shows what you could be.`,
    weight: 3,
    choices: [
      {
        label: 'Gaze into it',
        hint: '+30 XP — a vision of what\'s ahead',
        effect: () => ({
          narrative: 'You see the act\'s boss — not in detail, but in character. You know what you\'re walking toward.',
          deltaXP: 30,
          flagNext: 'boss_vision_seen',
        }),
      },
      {
        label: 'Reach in',
        hint: 'Roll d6 — artifact, gold, or lose HP',
        effect: () => {
          const roll = Math.ceil(Math.random() * 6);
          if (roll >= 5) return { narrative: `Your hand closes on something real. (Rolled ${roll})`, artifact: 'random_act_artifact' };
          if (roll >= 3) return { narrative: `Cold coins from nowhere. (Rolled ${roll})`, deltaGold: 15 };
          return { narrative: `The pool takes something from you. (Rolled ${roll})`, deltaHP: -10 };
        },
      },
      {
        label: 'Shatter the reflection',
        hint: 'Costs 10 HP — gain Shattered Mirror artifact',
        available: (gs) => gs.hp > 15,
        effect: () => ({
          narrative: 'The surface breaks. The shards are yours. One of them still shows your potential.',
          deltaHP: -10,
          artifact: 'shattered_mirror',
        }),
      },
    ],
  },

  {
    id: 'dark_bargain',
    family: 'curse',
    title: 'The Dark Bargain',
    flavour: "No tricks. It just wants something. It's very clear about this.",
    body: `A voice. No body. No theatrics. It makes you an offer in plain, direct language.
           It wants something you have. It will give you something in return.
           The exchange rate is generous. The reasons are opaque.`,
    weight: 2, // rare — impactful
    choices: [
      {
        label: 'Trade your luck token',
        hint: '+40 gold +20 XP — requires Luck Token',
        available: (gs) => gs.artifacts.includes('luck_token'),
        effect: () => {
          GS.artifacts = GS.artifacts.filter(a => a !== 'luck_token');
          return {
            narrative: 'It takes the coin from your pocket without touching you. The gold appears where the coin was.',
            deltaGold: 40,
            deltaXP: 20,
          };
        },
      },
      {
        label: 'Trade your gold',
        hint: 'Lose all gold — gain a powerful artifact',
        available: (gs) => gs.gold >= 20,
        effect: () => {
          const stake = GS.gold;
          return {
            narrative: `${stake} gold — gone. Something far more interesting takes its place.`,
            deltaGold: -stake,
            artifact: 'random_act_artifact_high_tier',
          };
        },
      },
      {
        label: 'Trade your blood (30 HP)',
        hint: '+50 XP',
        available: (gs) => gs.hp > 35,
        effect: () => ({
          narrative: 'It takes something from you that isn\'t quite blood. The XP is real, though.',
          deltaHP: -30,
          deltaXP: 50,
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
