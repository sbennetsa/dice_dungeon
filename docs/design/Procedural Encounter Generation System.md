# Procedural Encounter Generation System - Implementation Spec

## Overview
This system generates procedurally varied encounters for a dice-based roguelike dungeon crawler. It layers three systems: **enemy selection**, **environmental effects**, and **elite opt-in modifiers**. Players see full encounter information before choosing difficulty level (Standard or Elite).

## File Structure

```
/src
  /encounters
    encounterGenerator.js      # Main generation logic
    environmentSystem.js       # Environment definitions and selection
    eliteModifierSystem.js     # Elite modifier definitions and application
    anomalySystem.js          # Rare encounter anomalies
    encounterUI.js            # UI display functions
  /data
    enemies.js                # Enemy definitions (already exists)
    bosses.js                 # Boss definitions (already exists)
```

## Core Data Structures

### Encounter Object
```javascript
{
  enemy: {
    // Copy of enemy definition from enemies.js
    name: string,
    hp: number,
    maxHp: number,
    dice: number[],
    gold: [number, number],
    xp: [number, number],
    abilities: {},
    passives: [],
    pattern: string[],
    phases: [] | null,
    // Runtime state
    isElite: boolean,
    appliedModifiers: [],
    cursePlayerOnStart: boolean
  },
  environment: {
    id: string,
    name: string,
    icon: string,
    desc: string,
    // Handler functions
    onTurnStart: function | null,
    onTurnEnd: function | null,
    onDiceRoll: function | null,
    onDamageDealt: function | null,
    healingMultiplier: number | null
  } | null,
  anomaly: {
    id: string,
    name: string,
    rewardMult: number
  } | null,
  floor: number,
  isBossFloor: boolean,
  isElite: boolean,
  rewards: {
    gold: [number, number],
    xp: [number, number],
    artifactPick: boolean,
    artifactCount: number,
    legendaryChance: number
  }
}
```

### Elite Modifier Object
```javascript
{
  id: string,                    // Unique identifier
  prefix: string,                // Display name with emoji
  diceUpgrade: number | null,    // Add to each die size
  extraDice: number[] | null,    // Additional dice to add
  hpMult: number,                // HP multiplier
  goldMult: number,              // Gold reward multiplier
  xpMult: number,                // XP reward multiplier
  addPassive: {                  // Passive to add
    id: string,
    name: string,
    desc: string,
    params: {}
  } | null,
  conflictsWith: string[],       // IDs of conflicting modifiers
  applyStartingCurse: boolean,   // Special effect flags
  doublePhases: boolean,         // Boss-specific
  artifactPicks: number | null,  // Boss-specific
  legendaryChance: number | null // Boss-specific
}
```

### Environment Object
```javascript
{
  id: string,
  name: string,
  icon: string,
  desc: string,
  act: number,                   // Minimum act level (1, 2, or 3)
  // Callback functions for combat integration
  onTurnStart: (combat) => void,
  onTurnEnd: (combat) => void,
  onDiceRoll: (dice, isPlayer) => number[],
  onDamageDealt: (damage, attacker, defender) => void,
  healingMultiplier: number | 1.0
}
```

## encounterGenerator.js

### Main Function
```javascript
/**
 * Generate a complete encounter for the given floor
 * @param {number} floor - Current floor number (1-15+)
 * @returns {Encounter} Complete encounter object ready for player choice
 */
function generateEncounter(floor) {
  // 1. Determine if boss floor
  const isBossFloor = floor % 5 === 0;
  
  // 2. Select base enemy
  const enemy = isBossFloor 
    ? getBossForFloor(floor)
    : selectRandomEnemyForFloor(floor);
  
  // 3. Apply floor scaling
  applyFloorScaling(enemy, floor);
  
  // 4. Roll for anomaly (overrides normal generation if triggered)
  const anomaly = rollForAnomaly(floor);
  if (anomaly) {
    applyAnomaly(enemy, anomaly);
  }
  
  // 5. Select environment
  const environment = selectEnvironment(floor);
  
  // 6. Prepare elite modifiers (don't apply yet)
  const eliteModifiers = isBossFloor
    ? selectBossEliteModifiers()
    : selectEliteModifiers();
  
  // 7. Return encounter for UI display
  return {
    enemy: deepClone(enemy),
    environment,
    anomaly,
    eliteModifiers,
    floor,
    isBossFloor,
    isElite: false // Set by player choice
  };
}
```

### Enemy Selection
```javascript
/**
 * Select random enemy appropriate for floor
 */
function selectRandomEnemyForFloor(floor) {
  const act = Math.ceil(floor / 5);
  
  const act1Pool = ['Goblin Scout', 'Skeleton Guard', 'Orc Warrior', 'Venomspitter', 'Shadow Stalker'];
  const act2Pool = ['Stone Guardian', 'Necromancer', 'Fire Imp', 'Bandit', 'Ghoul'];
  const act3Pool = ['Iron Golem', 'Vampire', 'Demon', 'Lich', 'Wraith'];
  
  const pools = [act1Pool, act2Pool, act3Pool];
  const pool = pools[Math.min(act - 1, 2)];
  
  const enemyName = pool[Math.floor(Math.random() * pool.length)];
  
  // Get enemy definition from enemies.js
  return getEnemyByName(enemyName);
}

/**
 * Get boss for specific floor
 */
function getBossForFloor(floor) {
  const bossMap = {
    5: 'The Bone King',
    10: 'Crimson Wyrm',
    15: 'The Void Lord'
  };
  
  const bossName = bossMap[floor] || bossMap[15]; // Default to final boss for 20+
  return getBossByName(bossName);
}

/**
 * Apply HP scaling based on floor
 */
function applyFloorScaling(enemy, floor) {
  const scale = Math.pow(1.04, floor - 1);
  enemy.hp = Math.round(enemy.hp * scale);
  enemy.maxHp = enemy.hp;
}
```

### Player Choice Handler
```javascript
/**
 * Apply elite modifiers after player chooses elite difficulty
 * @param {Enemy} enemy - Enemy object to modify
 * @param {Object} eliteModifiers - {visible, hidden} modifier pair
 * @returns {Object} Reveal data for UI display
 */
function applyEliteChoice(enemy, eliteModifiers) {
  // Apply both modifiers
  applyEliteModifier(enemy, eliteModifiers.visible);
  applyEliteModifier(enemy, eliteModifiers.hidden);
  
  // Mark as elite
  enemy.isElite = true;
  enemy.appliedModifiers = [eliteModifiers.visible, eliteModifiers.hidden];
  
  // Calculate final stats for reveal
  return {
    visibleModifier: eliteModifiers.visible,
    hiddenModifier: eliteModifiers.hidden,
    finalStats: {
      hp: enemy.hp,
      dice: enemy.dice,
      avgDamage: calculateAvgDamage(enemy),
      passives: enemy.passives
    }
  };
}

/**
 * Apply a single elite modifier to enemy
 */
function applyEliteModifier(enemy, modifier) {
  // Dice upgrade
  if (modifier.diceUpgrade) {
    enemy.dice = enemy.dice.map(d => d + modifier.diceUpgrade);
  }
  
  // Extra dice
  if (modifier.extraDice) {
    enemy.dice = [...enemy.dice, ...modifier.extraDice];
  }
  
  // HP multiplier
  if (modifier.hpMult !== 1.0) {
    enemy.hp = Math.round(enemy.hp * modifier.hpMult);
    enemy.maxHp = enemy.hp;
  }
  
  // Add passive
  if (modifier.addPassive) {
    enemy.passives.push(modifier.addPassive);
  }
  
  // Boss-specific: phase trigger adjustment
  if (modifier.doublePhases && enemy.phases) {
    enemy.phases = enemy.phases.map(phase => ({
      ...phase,
      trigger: {
        hpPercent: Math.min(1.0, phase.trigger.hpPercent + 0.25)
      }
    }));
  }
  
  // Special flags
  if (modifier.applyStartingCurse) {
    enemy.cursePlayerOnStart = true;
  }
}

/**
 * Calculate average damage output per turn
 */
function calculateAvgDamage(enemy) {
  const avgPerDie = enemy.dice.map(d => (d + 1) / 2);
  const totalAvg = avgPerDie.reduce((sum, avg) => sum + avg, 0);
  return Math.round(totalAvg);
}

/**
 * Deep clone object (use structured clone if available)
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
```

## eliteModifierSystem.js

### Modifier Definitions
```javascript
/**
 * Standard elite modifiers for regular enemies
 */
const ELITE_MODIFIERS = [
  { 
    id: 'deadly',
    prefix: '💀 Deadly',
    diceUpgrade: 2,
    hpMult: 1.3,
    goldMult: 2.0,
    xpMult: 1.5,
    conflictsWith: ['enraged']
  },
  { 
    id: 'armored',
    prefix: '🛡️ Armored',
    addPassive: { 
      id: 'armor', 
      name: 'Elite Armor', 
      desc: 'Reduces ALL incoming damage by 3',
      params: { reduction: 3 } 
    },
    hpMult: 1.5,
    goldMult: 1.5,
    xpMult: 1.5,
    conflictsWith: ['brittle']
  },
  { 
    id: 'swift',
    prefix: '⚡ Swift',
    extraDice: [6],
    hpMult: 1.0,
    goldMult: 1.8,
    xpMult: 1.5,
    conflictsWith: []
  },
  { 
    id: 'enraged',
    prefix: '🔥 Enraged',
    diceUpgrade: 4,
    hpMult: 1.0,
    goldMult: 2.5,
    xpMult: 2.0,
    conflictsWith: ['deadly']
  },
  { 
    id: 'regenerating',
    prefix: '💚 Regenerating',
    addPassive: { 
      id: 'regen', 
      name: 'Elite Regeneration',
      desc: 'Heal 5 HP at start of turn',
      params: { amount: 5 } 
    },
    hpMult: 1.2,
    goldMult: 1.6,
    xpMult: 1.4,
    conflictsWith: ['brittle']
  },
  { 
    id: 'vampiric',
    prefix: '🩸 Vampiric',
    addPassive: { 
      id: 'lifesteal', 
      name: 'Elite Lifesteal',
      desc: 'Heal 50% of damage dealt',
      params: { percent: 0.5 } 
    },
    hpMult: 1.1,
    goldMult: 1.7,
    xpMult: 1.6,
    conflictsWith: []
  },
  { 
    id: 'brittle',
    prefix: '💎 Brittle',
    addPassive: { 
      id: 'brittle', 
      name: 'Elite Brittleness',
      desc: 'Takes +5 bonus damage from every hit',
      params: { bonus: 5 } 
    },
    hpMult: 0.8,
    goldMult: 1.3,
    xpMult: 1.2,
    conflictsWith: ['armored', 'regenerating']
  },
  { 
    id: 'cursed',
    prefix: '💜 Cursed',
    applyStartingCurse: true,
    hpMult: 1.2,
    goldMult: 1.8,
    xpMult: 1.7,
    conflictsWith: []
  },
  { 
    id: 'berserker',
    prefix: '😈 Berserker',
    addPassive: { 
      id: 'bloodFrenzy', 
      name: 'Elite Frenzy',
      desc: 'Below 50% HP, gains 2d6',
      params: { hpPercent: 0.5, extraDice: [6, 6] } 
    },
    hpMult: 1.3,
    goldMult: 2.0,
    xpMult: 1.8,
    conflictsWith: []
  }
];

/**
 * Boss-specific elite modifiers (more impactful)
 */
const BOSS_ELITE_MODIFIERS = [
  { 
    id: 'deadly',
    prefix: '💀 Deadly',
    diceUpgrade: 4,
    hpMult: 1.4,
    goldMult: 2.5,
    xpMult: 2.0,
    artifactPicks: 2,
    conflictsWith: ['enraged']
  },
  { 
    id: 'enraged',
    prefix: '🔥 Enraged',
    diceUpgrade: 6,
    hpMult: 1.2,
    goldMult: 3.0,
    xpMult: 2.5,
    artifactPicks: 2,
    conflictsWith: ['deadly']
  },
  { 
    id: 'phasing',
    prefix: '🌀 Phasing',
    addPassive: { 
      id: 'phase', 
      name: 'Phase Shift',
      desc: 'Alternates 50% damage resistance each turn',
      params: { resistPercent: 0.5 } 
    },
    hpMult: 1.5,
    goldMult: 2.5,
    xpMult: 2.0,
    artifactPicks: 2,
    legendaryChance: 0.25,
    conflictsWith: []
  },
  { 
    id: 'timewarped',
    prefix: '⏰ Timewarped',
    doublePhases: true,
    hpMult: 1.3,
    goldMult: 2.8,
    xpMult: 2.2,
    artifactPicks: 2,
    legendaryChance: 0.20,
    conflictsWith: []
  },
  { 
    id: 'armored',
    prefix: '🛡️ Armored',
    addPassive: { 
      id: 'armor', 
      name: 'Boss Armor',
      desc: 'Reduces ALL incoming damage by 5',
      params: { reduction: 5 } 
    },
    hpMult: 1.6,
    goldMult: 2.5,
    xpMult: 2.0,
    artifactPicks: 2,
    conflictsWith: ['brittle']
  }
];
```

### Selection Logic
```javascript
/**
 * Select two non-conflicting elite modifiers
 * @param {boolean} isBoss - Whether this is for a boss
 * @returns {Object} {visible, hidden} modifier pair
 */
function selectEliteModifiers(isBoss = false) {
  const pool = isBoss ? BOSS_ELITE_MODIFIERS : ELITE_MODIFIERS;
  
  // Select first (visible) modifier
  const visible = pool[Math.floor(Math.random() * pool.length)];
  
  // Filter valid second modifiers (no conflicts, not same)
  const validSecond = pool.filter(m => 
    m.id !== visible.id &&
    !visible.conflictsWith.includes(m.id) &&
    !m.conflictsWith.includes(visible.id)
  );
  
  // Select second (hidden) modifier
  const hidden = validSecond[Math.floor(Math.random() * validSecond.length)];
  
  return { visible, hidden };
}

/**
 * Convenience wrapper for boss modifiers
 */
function selectBossEliteModifiers() {
  return selectEliteModifiers(true);
}

/**
 * Calculate total reward multipliers from modifiers
 */
function calculateRewardMultipliers(modifiers) {
  return modifiers.reduce((acc, mod) => ({
    gold: acc.gold * (mod.goldMult || 1.0),
    xp: acc.xp * (mod.xpMult || 1.0)
  }), { gold: 1.0, xp: 1.0 });
}
```

## environmentSystem.js

### Environment Definitions
```javascript
/**
 * All environment definitions
 * Organized by act (minimum floor requirement)
 */
const ENVIRONMENTS = {
  // ACT 1 - Simple, direct effects
  burningGround: {
    id: 'burningGround',
    name: 'Burning Ground',
    icon: '🔥',
    desc: 'Both combatants take 3 damage at end of turn',
    act: 1,
    onTurnEnd: (combat) => {
      combat.player.hp -= 3;
      combat.enemy.hp -= 3;
      combat.log('The flames sear both fighters for 3 damage');
    }
  },
  
  healingAura: {
    id: 'healingAura',
    name: 'Healing Aura',
    icon: '💚',
    desc: 'Both combatants heal 4 HP at start of turn',
    act: 1,
    onTurnStart: (combat) => {
      const playerHeal = Math.min(4, combat.player.maxHp - combat.player.hp);
      const enemyHeal = Math.min(4, combat.enemy.maxHp - combat.enemy.hp);
      
      combat.player.hp = Math.min(combat.player.maxHp, combat.player.hp + 4);
      combat.enemy.hp = Math.min(combat.enemy.maxHp, combat.enemy.hp + 4);
      
      if (playerHeal > 0 || enemyHeal > 0) {
        combat.log(`The aura mends wounds (Player: +${playerHeal}, Enemy: +${enemyHeal})`);
      }
    }
  },
  
  slipperyFloor: {
    id: 'slipperyFloor',
    name: 'Slippery Floor',
    icon: '💧',
    desc: 'All dice show -1 result (minimum 1)',
    act: 1,
    onDiceRoll: (dice, isPlayer, combat) => {
      const modified = dice.map(d => Math.max(1, d - 1));
      combat.log('The slippery floor disrupts precision (-1 to all dice)');
      return modified;
    }
  },
  
  // ACT 2 - Interactive effects
  arcaneNexus: {
    id: 'arcaneNexus',
    name: 'Arcane Nexus',
    icon: '✨',
    desc: 'First die rolled each turn is automatically maximum value',
    act: 2,
    onDiceRoll: (dice, isPlayer, combat) => {
      if (dice.length > 0) {
        const maxValue = isPlayer 
          ? combat.player.dice[0].max 
          : combat.enemy.dice[0];
        dice[0] = maxValue;
        combat.log(`Arcane energy surges through the first die! (${maxValue})`);
      }
      return dice;
    }
  },
  
  narrowCorridor: {
    id: 'narrowCorridor',
    name: 'Narrow Corridor',
    icon: '🚪',
    desc: 'First attacker each turn deals +5 damage',
    act: 2,
    // Applied during damage resolution based on initiative
    onDamageDealt: (damage, attacker, defender, combat) => {
      if (combat.firstAttacker === attacker) {
        combat.log('Initiative advantage in narrow space! (+5 damage)');
        return damage + 5;
      }
      return damage;
    }
  },
  
  thornsAura: {
    id: 'thornsAura',
    name: 'Thorns Aura',
    icon: '🌿',
    desc: 'Attacker takes 20% of damage dealt as recoil',
    act: 2,
    onDamageDealt: (damage, attacker, defender, combat) => {
      const recoil = Math.floor(damage * 0.2);
      if (recoil > 0) {
        attacker.hp -= recoil;
        combat.log(`Thorns recoil: ${recoil} damage to ${attacker.name || 'Player'}`);
      }
      return damage;
    }
  },
  
  // ACT 3 - Complex effects
  voidZone: {
    id: 'voidZone',
    name: 'Void Zone',
    icon: '🌑',
    desc: 'All dice faces below 3 become 0',
    act: 3,
    onDiceRoll: (dice, isPlayer, combat) => {
      const modified = dice.map(d => d < 3 ? 0 : d);
      const voided = dice.filter((d, i) => d < 3 && modified[i] === 0).length;
      if (voided > 0) {
        combat.log(`The void consumes ${voided} weak roll(s)`);
      }
      return modified;
    }
  },
  
  bloodMoon: {
    id: 'bloodMoon',
    name: 'Blood Moon',
    icon: '🌙',
    desc: 'All healing effects doubled',
    act: 3,
    healingMultiplier: 2.0
    // Applied in passive effect resolution (regen, lifesteal, heal abilities)
  },
  
  chaosStorm: {
    id: 'chaosStorm',
    name: 'Chaos Storm',
    icon: '⚡',
    desc: 'After each turn, reroll one random die for both combatants',
    act: 3,
    onTurnEnd: (combat) => {
      // This affects NEXT turn's roll
      combat.chaosStormActive = true;
      combat.log('The chaos storm warps reality...');
    }
  },
  
  consecratedGround: {
    id: 'consecratedGround',
    name: 'Consecrated Ground',
    icon: '✝️',
    desc: 'Undead enemies weakened (-30% stats), others empowered (+15% stats)',
    act: 2,
    // Applied during encounter generation based on enemy type
  },
  
  unstableGround: {
    id: 'unstableGround',
    name: 'Unstable Ground',
    icon: '💥',
    desc: 'Each turn, 25% chance for 10 damage to random combatant',
    act: 2,
    onTurnEnd: (combat) => {
      if (Math.random() < 0.25) {
        const target = Math.random() < 0.5 ? combat.player : combat.enemy;
        target.hp -= 10;
        combat.log(`The ground collapses! ${target.name || 'Player'} takes 10 damage!`);
      }
    }
  }
};
```

### Selection Logic
```javascript
/**
 * Select environment based on floor
 * @param {number} floor - Current floor
 * @returns {Environment | null}
 */
function selectEnvironment(floor) {
  const act = Math.ceil(floor / 5);
  
  // Environment spawn chance increases per act
  const chances = [0.30, 0.50, 0.70];
  if (Math.random() > chances[act - 1]) {
    return null; // No environment
  }
  
  // Filter environments available for this act
  const availableEnvs = Object.values(ENVIRONMENTS).filter(env => env.act <= act);
  
  // Random selection
  return availableEnvs[Math.floor(Math.random() * availableEnvs.length)];
}

/**
 * Get environment by ID
 */
function getEnvironmentById(id) {
  return ENVIRONMENTS[id] || null;
}
```

## anomalySystem.js

### Anomaly Definitions
```javascript
/**
 * Rare encounter variations that override normal generation
 */
const ANOMALIES = {
  perfectStorm: {
    id: 'perfectStorm',
    name: 'Perfect Storm',
    chance: 0.05,
    rewardMult: 1.5,
    apply: (enemy, currentEnvironment) => {
      // Find synergistic environment for enemy mechanics
      let synergyEnv = null;
      
      // Regen passive + Healing Aura
      if (enemy.passives.some(p => p.id === 'regen')) {
        synergyEnv = getEnvironmentById('healingAura');
      }
      // Poison abilities + Thorns Aura
      else if (Object.values(enemy.abilities).some(a => a.type === 'poison')) {
        synergyEnv = getEnvironmentById('thornsAura');
      }
      // High dice count + Arcane Nexus
      else if (enemy.dice.length >= 4) {
        synergyEnv = getEnvironmentById('arcaneNexus');
      }
      
      return {
        environment: synergyEnv || currentEnvironment,
        logMessage: `The stars align — a perfect storm of power!`
      };
    }
  },
  
  wounded: {
    id: 'wounded',
    name: 'Wounded Prey',
    chance: 0.08,
    rewardMult: 0.8,
    apply: (enemy) => {
      enemy.hp = Math.floor(enemy.hp * 0.7);
      enemy.maxHp = enemy.hp;
      return {
        logMessage: `The ${enemy.name} is already wounded!`
      };
    }
  },
  
  enraged: {
    id: 'enraged',
    name: 'Enraged Beast',
    chance: 0.06,
    rewardMult: 1.4,
    apply: (enemy) => {
      enemy.dice = enemy.dice.map(d => d + 2);
      return {
        logMessage: `The ${enemy.name} is consumed by fury!`
      };
    }
  },
  
  doubleTrouble: {
    id: 'doubleTrouble',
    name: 'Double Trouble',
    chance: 0.03,
    rewardMult: 2.0,
    apply: (enemy) => {
      enemy.doubleAction = true;
      return {
        logMessage: `Two ${enemy.name}s coordinate their assault!`
      };
    }
  },
  
  glitched: {
    id: 'glitched',
    name: 'Reality Glitch',
    chance: 0.04,
    rewardMult: 1.6,
    apply: (enemy) => {
      // Randomize one ability to a different type
      const abilityKeys = Object.keys(enemy.abilities);
      const randomKey = abilityKeys[Math.floor(Math.random() * abilityKeys.length)];
      const types = ['attack', 'heal', 'buff', 'poison', 'shield'];
      const newType = types[Math.floor(Math.random() * types.length)];
      
      enemy.abilities[randomKey].type = newType;
      
      return {
        logMessage: `Reality fractures — the ${enemy.name}'s abilities shift unpredictably!`
      };
    }
  }
};
```

### Selection Logic
```javascript
/**
 * Roll for anomaly occurrence
 * @param {number} floor - Current floor (affects chances slightly)
 * @returns {Anomaly | null}
 */
function rollForAnomaly(floor) {
  // Slight increase in anomaly chance per act
  const actBonus = Math.ceil(floor / 5) * 0.01;
  
  // Roll for each anomaly
  for (const [key, anomaly] of Object.entries(ANOMALIES)) {
    const adjustedChance = anomaly.chance + actBonus;
    if (Math.random() < adjustedChance) {
      return anomaly;
    }
  }
  
  return null;
}

/**
 * Apply anomaly to enemy and encounter
 * @param {Enemy} enemy
 * @param {Anomaly} anomaly
 * @param {Environment} currentEnvironment
 * @returns {Object} { environment, logMessage }
 */
function applyAnomaly(enemy, anomaly, currentEnvironment = null) {
  return anomaly.apply(enemy, currentEnvironment);
}
```

## encounterUI.js

### Display Functions
```javascript
/**
 * Display encounter choice screen
 * @param {Encounter} encounter - Generated encounter
 * @returns {Promise<'standard' | 'elite'>} Player's choice
 */
async function displayEncounterChoice(encounter) {
  const { enemy, environment, anomaly, eliteModifiers, floor, isBossFloor } = encounter;
  
  // Build UI data object
  const uiData = {
    floor,
    isBossFloor,
    enemy: {
      name: enemy.name,
      hp: enemy.hp,
      dice: formatDicePool(enemy.dice),
      abilities: Object.values(enemy.abilities).map(a => a.name),
      passives: enemy.passives.map(p => p.name),
      phases: isBossFloor ? formatPhases(enemy.phases) : null
    },
    environment: environment ? {
      icon: environment.icon,
      name: environment.name,
      desc: environment.desc
    } : null,
    anomaly: anomaly ? {
      name: anomaly.name
    } : null,
    standard: {
      hp: enemy.hp,
      rewards: formatRewards(enemy.gold, enemy.xp, false, isBossFloor)
    },
    elite: {
      visibleModifier: {
        prefix: eliteModifiers.visible.prefix,
        effects: formatModifierEffects(eliteModifiers.visible, enemy)
      },
      hiddenCount: 1,
      estimatedStats: calculateElitePreview(enemy, eliteModifiers.visible),
      rewards: formatRewards(
        enemy.gold, 
        enemy.xp, 
        true, 
        isBossFloor,
        eliteModifiers
      )
    }
  };
  
  // Render UI (implementation depends on your UI framework)
  return await renderEncounterScreen(uiData);
}

/**
 * Display elite modifier reveal screen
 * @param {Object} revealData - Data from applyEliteChoice
 */
async function displayEliteReveal(revealData) {
  const uiData = {
    visibleModifier: revealData.visibleModifier.prefix,
    hiddenModifier: revealData.hiddenModifier.prefix,
    finalStats: {
      hp: `${revealData.finalStats.hp} HP`,
      dice: formatDicePool(revealData.finalStats.dice),
      avgDamage: `~${revealData.finalStats.avgDamage} damage/turn`,
      passives: revealData.finalStats.passives.map(p => p.name)
    }
  };
  
  // Render reveal screen
  await renderEliteRevealScreen(uiData);
}

/**
 * Helper: Format dice pool for display
 */
function formatDicePool(dice) {
  const counts = {};
  dice.forEach(d => {
    counts[d] = (counts[d] || 0) + 1;
  });
  
  return Object.entries(counts)
    .map(([size, count]) => `${count}×d${size}`)
    .join(' + ');
}

/**
 * Helper: Format rewards for display
 */
function formatRewards(gold, xp, isElite, isBoss, modifiers = null) {
  let goldMult = 1.0;
  let xpMult = 1.0;
  
  if (isElite && modifiers) {
    const mults = calculateRewardMultipliers([modifiers.visible, modifiers.hidden]);
    goldMult = mults.gold;
    xpMult = mults.xp;
  }
  
  return {
    gold: `${Math.floor(gold[0] * goldMult)}-${Math.floor(gold[1] * goldMult)} gold`,
    xp: `${Math.floor(xp[0] * xpMult)}-${Math.floor(xp[1] * xpMult)} XP`,
    special: isElite 
      ? (isBoss ? '2 Boss artifacts + Legendary chance' : 'Artifact pick (1 of 3)')
      : (isBoss ? 'Boss artifact' : null)
  };
}

/**
 * Helper: Format modifier effects for display
 */
function formatModifierEffects(modifier, enemy) {
  const effects = [];
  
  if (modifier.diceUpgrade) {
    const example = enemy.dice[0];
    effects.push(`Dice: d${example} → d${example + modifier.diceUpgrade}`);
  }
  
  if (modifier.extraDice) {
    effects.push(`+${modifier.extraDice.map(d => `d${d}`).join(', ')}`);
  }
  
  if (modifier.hpMult !== 1.0) {
    const change = Math.round((modifier.hpMult - 1.0) * 100);
    effects.push(`HP ${change > 0 ? '+' : ''}${change}%`);
  }
  
  if (modifier.addPassive) {
    effects.push(modifier.addPassive.name);
  }
  
  return effects;
}

/**
 * Helper: Calculate elite preview stats
 */
function calculateElitePreview(enemy, visibleModifier) {
  const tempEnemy = JSON.parse(JSON.stringify(enemy));
  applyEliteModifier(tempEnemy, visibleModifier);
  
  return {
    hp: tempEnemy.hp,
    dice: formatDicePool(tempEnemy.dice),
    avgDamage: calculateAvgDamage(tempEnemy)
  };
}

/**
 * Helper: Format boss phases for display
 */
function formatPhases(phases) {
  if (!phases) return null;
  
  return phases.map((phase, i) => ({
    number: i + 1,
    trigger: `${Math.round(phase.trigger.hpPercent * 100)}% HP`,
    changes: Object.keys(phase.changes).filter(k => k !== 'log')
  }));
}
```

## Combat Integration Points

### Combat Initialization
```javascript
/**
 * Initialize combat with encounter data
 * @param {Encounter} encounter - The encounter object
 * @param {Player} player - Player state
 */
function initializeCombat(encounter, player) {
  const combat = {
    player,
    enemy: encounter.enemy,
    environment: encounter.environment,
    floor: encounter.floor,
    isElite: encounter.isElite,
    isBoss: encounter.isBossFloor,
    log: [],
    turnCount: 0,
    firstAttacker: null,
    chaosStormActive: false
  };
  
  // Apply starting curses if elite has curse modifier
  if (encounter.enemy.cursePlayerOnStart) {
    applyStartingCurse(player);
  }
  
  // Apply consecrated ground modifier if present
  if (encounter.environment?.id === 'consecratedGround') {
    applyConsecratedGroundModifier(encounter.enemy);
  }
  
  return combat;
}

/**
 * Apply starting curse to player
 */
function applyStartingCurse(player) {
  player.dice.forEach(die => {
    die.cursed = true; // All dice show -1 this fight
  });
}

/**
 * Apply consecrated ground stat changes
 */
function applyConsecratedGroundModifier(enemy) {
  const isUndead = ['Skeleton', 'Ghoul', 'Necromancer', 'Lich', 'Bone King'].some(
    name => enemy.name.includes(name)
  );
  
  if (isUndead) {
    enemy.hp = Math.floor(enemy.hp * 0.7);
    enemy.dice = enemy.dice.map(d => Math.max(1, Math.floor(d * 0.7)));
  } else {
    enemy.hp = Math.floor(enemy.hp * 1.15);
    enemy.dice = enemy.dice.map(d => Math.floor(d * 1.15));
  }
}
```

### Environment Hook Calls
```javascript
/**
 * Call environment onTurnStart hook
 */
function processEnvironmentTurnStart(combat) {
  if (combat.environment?.onTurnStart) {
    combat.environment.onTurnStart(combat);
  }
}

/**
 * Call environment onTurnEnd hook
 */
function processEnvironmentTurnEnd(combat) {
  if (combat.environment?.onTurnEnd) {
    combat.environment.onTurnEnd(combat);
  }
}

/**
 * Call environment onDiceRoll hook
 * @param {number[]} dice - Raw dice results
 * @param {boolean} isPlayer - True if player, false if enemy
 * @returns {number[]} Modified dice results
 */
function processEnvironmentDiceRoll(combat, dice, isPlayer) {
  if (combat.environment?.onDiceRoll) {
    return combat.environment.onDiceRoll(dice, isPlayer, combat);
  }
  return dice;
}

/**
 * Call environment onDamageDealt hook
 * @returns {number} Modified damage value
 */
function processEnvironmentDamage(combat, damage, attacker, defender) {
  if (combat.environment?.onDamageDealt) {
    return combat.environment.onDamageDealt(damage, attacker, defender, combat);
  }
  return damage;
}

/**
 * Apply environment healing multiplier
 */
function applyHealingMultiplier(combat, healAmount) {
  const mult = combat.environment?.healingMultiplier || 1.0;
  return Math.floor(healAmount * mult);
}
```

### Chaos Storm Special Handling
```javascript
/**
 * Process chaos storm reroll if active
 * Called during dice rolling phase
 */
function processChaosStorm(combat, rolledDice, isPlayer) {
  if (!combat.chaosStormActive) return rolledDice;
  
  // Reroll one random die
  const randomIndex = Math.floor(Math.random() * rolledDice.length);
  const dieSize = isPlayer 
    ? combat.player.dice[randomIndex].max 
    : combat.enemy.dice[randomIndex];
  
  const newRoll = Math.floor(Math.random() * dieSize) + 1;
  rolledDice[randomIndex] = newRoll;
  
  combat.log(`Chaos storm rerolls die ${randomIndex + 1}: ${newRoll}`);
  
  // Reset flag after both combatants have rolled
  if (!isPlayer) {
    combat.chaosStormActive = false;
  }
  
  return rolledDice;
}
```

## Testing Checklist

### Unit Tests
```javascript
// encounterGenerator.js
- [ ] selectRandomEnemyForFloor returns valid enemies for each act
- [ ] getBossForFloor returns correct boss for floors 5, 10, 15
- [ ] applyFloorScaling scales HP correctly
- [ ] applyEliteModifier correctly applies each modifier type
- [ ] calculateAvgDamage returns reasonable values

// eliteModifierSystem.js
- [ ] selectEliteModifiers never returns conflicting pairs
- [ ] selectEliteModifiers never returns same modifier twice
- [ ] calculateRewardMultipliers compounds correctly

// environmentSystem.js
- [ ] selectEnvironment respects act restrictions
- [ ] selectEnvironment returns null at correct rates
- [ ] All environment callbacks have correct signatures

// anomalySystem.js
- [ ] rollForAnomaly respects probability distribution
- [ ] applyAnomaly modifies enemy correctly
- [ ] anomaly.apply returns required fields
```

### Integration Tests
```javascript
- [ ] Full encounter generation produces valid encounter object
- [ ] Elite choice correctly applies both modifiers
- [ ] Environment effects integrate with combat system
- [ ] Boss elite modifiers work with phase transitions
- [ ] Anomalies + environments don't conflict
- [ ] Consecrated ground modifies undead/non-undead correctly
```

### Balance Tests
```javascript
- [ ] Act 1 enemies survivable with starter dice
- [ ] Elite encounters feel challenging but fair
- [ ] Environment effects create interesting decisions
- [ ] Boss elite encounters are appropriately difficult
- [ ] Reward scaling matches difficulty increase
```

## Configuration Constants

```javascript
// encounterGenerator.js
const FLOOR_SCALING_BASE = 1.04;
const BOSS_FLOORS = [5, 10, 15];

// environmentSystem.js
const ENVIRONMENT_CHANCES_BY_ACT = [0.30, 0.50, 0.70];

// anomalySystem.js
const ANOMALY_ACT_BONUS = 0.01; // +1% per act

// eliteModifierSystem.js
const ELITE_ARTIFACT_COUNT = 3; // Player chooses 1 of 3
const BOSS_ELITE_ARTIFACT_COUNT = 2; // Player gets 2 artifacts
```

## Notes for Coding Agent

1. **Deep Clone**: Use `structuredClone()` if available (Node 17+), otherwise `JSON.parse(JSON.stringify())` is fine for this data structure

2. **Random Selection**: All `Math.random()` calls should be replaceable with a seeded RNG if needed later

3. **Environment Callbacks**: The `combat` object passed to callbacks should have methods like `combat.log(message)` for displaying messages to the player

4. **UI Framework Agnostic**: The `encounterUI.js` functions return data structures — actual rendering depends on your UI framework (React, Vue, vanilla JS, etc.)

5. **Combat Integration**: The combat system needs to call environment hooks at appropriate times. Add these calls to existing combat turn flow.

6. **Boss Phase Transitions**: Existing boss phase system should continue to work. Elite modifiers layer on top.

7. **Passives**: Elite modifiers can add passives. Ensure passive processing system handles runtime-added passives.

8. **Performance**: With deep cloning and multiple random selections, cache boss/enemy definitions and clone only when needed.

9. **Logging**: All system state changes should produce log messages for debugging and player feedback.

10. **Save/Load**: Encounter state needs to serialize for save games. Store applied modifiers and environment ID to reconstruct on load.