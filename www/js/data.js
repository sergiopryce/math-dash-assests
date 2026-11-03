// Game content: memes, wave looks, power-ups, shop items and mission types.
// Everything tunable lives here so balancing doesn't mean digging through the engine.
window.MD = window.MD || {};

// Meme projectiles: emoji, trail colour, and the line shown when it gets you.
MD.MEMES = [
  { e: '🩴', name: 'chanclas', color: '#3aa0ff', hit: 'NOT THE CHANCLA' },
  { e: '🗿', name: 'moai', color: '#9aa3b5', hit: 'Moai said no' },
  { e: '🦆', name: 'ducks', color: '#ffd23f', hit: 'Bonked by a duck' },
  { e: '🍌', name: 'bananas', color: '#ffe066', hit: 'Banana for scale' },
  { e: '🧻', name: 'toilet rolls', color: '#ffffff', hit: 'Wiped out' },
  { e: '🐸', name: 'frogs', color: '#5cd65c', hit: "It's Wednesday, my dudes" },
  { e: '🥔', name: 'potatoes', color: '#c9a26b', hit: 'Potato aim. Yours.' },
  { e: '💀', name: 'skulls', color: '#e6e6e6', hit: 'I am deceased' },
  { e: '🤡', name: 'clowns', color: '#ff4d6d', hit: 'Clowned' },
  { e: '🧀', name: 'cheeses', color: '#ffc43d', hit: 'Cheesed' },
  { e: '🐟', name: 'fish', color: '#4fc3f7', hit: 'Slapped by a fish' },
  { e: '🍕', name: 'pizzas', color: '#ff9a1f', hit: 'Pizza delivered. To your face.' },
  { e: '🪑', name: 'chairs', color: '#b07d4f', hit: 'Chair. Thrown.' },
  { e: '🦖', name: 'dinos', color: '#66bb6a', hit: 'Rawr means goodbye' },
  { e: '🐔', name: 'chickens', color: '#ffffff', hit: 'Chicken jockey got you' },
];

MD.DODGE_LINES = ['nope', 'ez', 'not today', 'lol', 'skill diff', 'too slow', 'missed me', 'dodged', 'bruh', 'yeet'];
MD.NEAR_LINES = ['CLOSE ONE', 'TOO CLOSE', 'WHOA', 'CLUTCH', 'BARELY'];

// Each wave blends to a new look. After the last, the later ones cycle.
MD.THEMES = [
  { skyTop: '#1a1546', skyBot: '#5b3fa8', sun: '#ff9a1f', groundTop: '#2b2466', groundBot: '#4a3c9e', floor: '#3b3285', edge: '#ff9a1f', portal: '#ff9a1f', stars: 0 }, // dusk
  { skyTop: '#3d1d5c', skyBot: '#ff6f61', sun: '#ffd23f', groundTop: '#5a2149', groundBot: '#a8435f', floor: '#7a2f5a', edge: '#ffd23f', portal: '#ffd23f', stars: 0 }, // sunset
  { skyTop: '#03061a', skyBot: '#14235e', sun: '#9ec9ff', groundTop: '#0a1238', groundBot: '#1c2d6e', floor: '#15215a', edge: '#4fc3f7', portal: '#4fc3f7', stars: 1 }, // night
  { skyTop: '#06200f', skyBot: '#2f7d32', sun: '#c6ff00', groundTop: '#0f2d17', groundBot: '#2a5c2e', floor: '#1d4424', edge: '#c6ff00', portal: '#76ff03', stars: 0.4 }, // toxic
  { skyTop: '#2a0505', skyBot: '#b3261e', sun: '#ffea00', groundTop: '#3a0b0b', groundBot: '#7a1a12', floor: '#5c140f', edge: '#ff6d00', portal: '#ff3d00', stars: 0 }, // inferno
  { skyTop: '#2b0a3d', skyBot: '#ff4fd8', sun: '#00f0ff', groundTop: '#1a0640', groundBot: '#5a1aa8', floor: '#3a1080', edge: '#00f0ff', portal: '#ff4fd8', stars: 0.7 }, // vapor
];

// How each wave plays: which movement types appear and which memes are featured.
MD.WAVES = [
  { moves: [], pool: null },
  { moves: ['bounce'], pool: ['🩴'] },
  { moves: ['bounce', 'switch'], pool: ['🗿', '💀'] },
  { moves: ['zigzag', 'switch'], pool: ['🐸', '🦆'] },
  { moves: ['bounce', 'zigzag', 'switch'], pool: ['🪑', '🍕', '🦖'] },
  { moves: ['bounce', 'zigzag', 'switch', 'switch'], pool: null },
];
MD.WAVE_LEN = 18; // seconds

// Power-ups that fly in like stars. Durations grow with shop upgrades.
MD.POWERUPS = {
  shield: { e: '🛡️', name: 'Shield', color: '#4fc3f7', base: 8, per: 3, about: 'Blocks one hit' },
  slowmo: { e: '⏳', name: 'Slow-mo', color: '#b388ff', base: 4, per: 1, about: 'Slows the memes down' },
  magnet: { e: '🧲', name: 'Magnet', color: '#ff5252', base: 6, per: 1.5, about: 'Pulls in stars from every lane' },
  double: { e: '💰', name: 'Double stars', color: '#ffd23f', base: 7, per: 1.5, about: 'Every star counts twice' },
};

// Shop: upgrades
MD.UPGRADE_COSTS = [60, 150, 300, 600, 1000];
MD.UPGRADES = [
  { id: 'shield', icon: '🛡️', name: 'Shield', max: 5, info: (l) => `Lasts ${MD.POWERUPS.shield.base + MD.POWERUPS.shield.per * l}s` },
  { id: 'slowmo', icon: '⏳', name: 'Slow-mo', max: 5, info: (l) => `Lasts ${MD.POWERUPS.slowmo.base + MD.POWERUPS.slowmo.per * l}s` },
  { id: 'magnet', icon: '🧲', name: 'Magnet', max: 5, info: (l) => `Lasts ${MD.POWERUPS.magnet.base + MD.POWERUPS.magnet.per * l}s` },
  { id: 'double', icon: '💰', name: 'Double stars', max: 5, info: (l) => `Lasts ${MD.POWERUPS.double.base + MD.POWERUPS.double.per * l}s` },
  { id: 'luck', icon: '🍀', name: 'Lucky', max: 5, info: (l) => `Power-ups ${l ? '+' + l * 20 + '% more often' : 'at normal rate'}` },
  { id: 'headstart', icon: '🚀', name: 'Head start', max: 1, costs: [400], info: (l) => (l ? 'Every run starts with a shield' : 'Start every run with a shield') },
];

// Shop: critter colours. Colours are [highlight, body, shade, feet, tail].
MD.SKINS = [
  { id: 'orange', name: 'Classic', price: 0, c: ['#ffb35c', '#ff8a1f', '#d9620f', '#c45a12', '#ffd9a8'] },
  { id: 'blue', name: 'Blueberry', price: 150, c: ['#8fd3ff', '#3aa0ff', '#1f6fd1', '#1a55a3', '#d6f0ff'] },
  { id: 'pink', name: 'Bubblegum', price: 200, c: ['#ffc2e2', '#ff6fb5', '#d94690', '#b83777', '#ffe3f2'] },
  { id: 'green', name: 'Pickle', price: 250, c: ['#c8f7a1', '#6ccf3b', '#3f9a1e', '#2f7a14', '#ecffd9'] },
  { id: 'purple', name: 'Grape', price: 350, c: ['#d9c2ff', '#9b6bff', '#6a3fd1', '#5330a8', '#efe6ff'] },
  { id: 'ghost', name: 'Ghost', price: 500, c: ['#ffffff', '#e8ecf5', '#b7bfd3', '#9aa3b5', '#ffffff'] },
  { id: 'gold', name: 'Golden', price: 1200, c: ['#fff3a8', '#ffcf33', '#d99a00', '#b07a00', '#fff8d6'] },
  { id: 'rainbow', name: 'Rainbow', price: 2500, rainbow: true, c: ['#ffb35c', '#ff8a1f', '#d9620f', '#c45a12', '#ffffff'] },
];

// Shop: hats (drawn on the critter's head)
MD.HATS = [
  { id: 'none', name: 'No hat', e: '', price: 0 },
  { id: 'cap', name: 'Cap', e: '🧢', price: 100 },
  { id: 'bow', name: 'Bow', e: '🎀', price: 150 },
  { id: 'tophat', name: 'Top hat', e: '🎩', price: 250 },
  { id: 'duck', name: 'Duck buddy', e: '🦆', price: 400 },
  { id: 'frog', name: 'Frog buddy', e: '🐸', price: 600 },
  { id: 'crown', name: 'Crown', e: '👑', price: 900 },
  { id: 'moai', name: 'Moai', e: '🗿', price: 1500 },
];

// Missions. "run" missions must be done inside one run; the rest add up across runs.
// Each completion moves that mission type up a tier for next time.
MD.MISSION_REWARDS = [25, 50, 90, 140, 200, 260];
MD.MISSION_TYPES = [
  { id: 'dodgeRun', run: true, stat: 'dodges', tiers: [25, 50, 90, 140, 200, 280], text: (n) => `Dodge ${n} memes in one run` },
  { id: 'waveRun', run: true, stat: 'wave', tiers: [2, 3, 4, 5, 7, 9], text: (n) => `Reach wave ${n}` },
  { id: 'starsRun', run: true, stat: 'stars', tiers: [5, 10, 18, 28, 40, 55], text: (n) => `Grab ${n} stars in one run` },
  { id: 'nearRun', run: true, stat: 'near', tiers: [2, 4, 7, 10, 15, 20], text: (n) => `Get ${n} close calls in one run` },
  { id: 'scoreRun', run: true, stat: 'score', tiers: [60, 150, 300, 550, 900, 1400], text: (n) => `Score ${n} in one run` },
  { id: 'starsTotal', run: false, stat: 'stars', tiers: [30, 80, 150, 300, 600, 1000], text: (n) => `Grab ${n} stars` },
  { id: 'powersTotal', run: false, stat: 'powers', tiers: [2, 5, 10, 20, 35, 50], text: (n) => `Pick up ${n} power-ups` },
  { id: 'savesTotal', run: false, stat: 'saves', tiers: [1, 3, 6, 10, 15, 25], text: (n) => `Get saved by a shield ${n} time${n > 1 ? 's' : ''}` },
  { id: 'runsTotal', run: false, stat: 'runs', tiers: [3, 8, 15, 25, 40, 60], text: (n) => `Play ${n} runs` },
  { id: 'memeTotal', run: false, stat: 'meme', tiers: [10, 25, 50, 80, 120, 180], text: (n, m) => `Dodge ${n} ${MD.MEMES.find((x) => x.e === m).name} ${m}` },
];
