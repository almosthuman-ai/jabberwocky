export type PartOfSpeech = 'noun' | 'verb' | 'adj' | 'adv' | 'proper';

export interface NonsenseWord {
  word: string;
  partOfSpeech: PartOfSpeech;
  style: string; // Metadata for debugging or AI context
}

// 1. Phonetic Building Blocks - Prioritizing "Pops", Plosives, and Comedy
const ONSETS = [
  'B', 'Bl', 'Br', 
  'P', 'Pl', 'Pr', 
  'D', 'Dr', 
  'T', 'Tr', 'Tw',
  'G', 'Gl', 'Gr', 
  'K', 'Kl', 'Kr', 
  'F', 'Fl', 'Fr',
  'Sp', 'Spl', 'Squ', 'Sk', 'Sm', 'Sn', 
  'Z', 'Zw', 
  'Schm', 'W', 'J', 'Qu'
];

const NUCLEI = [
  'a', 'e', 'i', 'o', 'u', 
  'ee', 'oo', 'ai', 'oa'
];

const CODAS = [
  'b', 'd', 'g', 'p', 't', 'k', 
  'zz', 'bb', 'dd', 'gg', 'pp', 'tt', 'ck', 
  'm', 'mp', 'n', 'nk', 'ng', 'sh', 'ch', 'x'
];

// 2. Funny Morphemes
const FUNNY_SUFFIXES = [
  'pants', 'face', 'bottom', 'nose', 'toes', 'noodle', 'cake', 'pot', 
  'spoon', 'waddle', 'bop', 'kins', 'snout', 'sock', 'flop', 'whistle'
];

const BOUNCY_INFIXES = [
  'ity', 'a', 'o', 'le', 'er', 'y'
];

const VERB_ENDINGS = [
  'le', 'er', 'ify', 'ize', 'ate'
];

const ADJ_SUFFIXES = [
  'tastic', 'licious', 'y', 'ish', 'ful', 'less', 'able'
];

const getRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// --- Root Generator ---
// Generates a punchy syllable like "Zap", "Glox", "Flim"
const generateRoot = (): string => {
  return getRandom(ONSETS) + getRandom(NUCLEI) + (Math.random() > 0.2 ? getRandom(CODAS) : '');
};

// --- Strategy 1: Reduplication (Rhyme/Vowel Shift) ---
// e.g., Flimflam, Wigglewaggle, Hocuspocus
const generateReduplication = (): string => {
  const root1 = generateRoot();
  
  // Strategy A: Change Onset (Hanky-Panky)
  if (Math.random() > 0.5) {
     const nucleusCoda = root1.substring(root1.search(/[aeiou]/i)); // Roughly find vowel onward
     let newOnset = getRandom(ONSETS);
     while (root1.startsWith(newOnset)) newOnset = getRandom(ONSETS); // Ensure different
     return root1 + newOnset + nucleusCoda;
  } 
  
  // Strategy B: Change Vowel (Chit-Chat)
  // This is harder to do perfectly with strings, so we just generate a similar root structure
  const onset = getRandom(ONSETS);
  const coda = getRandom(CODAS);
  return onset + 'i' + coda + onset + 'o' + coda; // Fixed "i-o" pattern is classic (Dingdong)
};

// --- Strategy 2: Infixing (The "Bouncy" Word) ---
// e.g., Zippityzap, Flobberknocker
const generateInfixed = (): string => {
  const root = generateRoot();
  const root2 = generateRoot();
  const infix = getRandom(BOUNCY_INFIXES);
  return root + infix + root2.toLowerCase();
};

// --- Strategy 3: Compound Noun (The "Silly Object") ---
// e.g., Gumblepants, Snickerpot
const generateCompound = (): string => {
  const root = generateRoot();
  const suffix = getRandom(FUNNY_SUFFIXES);
  return root + suffix;
};

// --- Strategy 4: Simple Punchy Verb ---
// e.g., Bamboozle, Snurgle
const generateVerb = (): string => {
  const root = generateRoot();
  // 50% chance of suffix, 50% chance of simple root
  if (Math.random() > 0.5) {
      return root + getRandom(VERB_ENDINGS);
  }
  return root;
};

// --- Strategy 5: Whimsical Adjective ---
// e.g., Glooptastic, Snarky
const generateAdjective = (): string => {
  const root = generateRoot();
  const suffix = getRandom(ADJ_SUFFIXES);
  return root + suffix;
};

// --- Master Generator ---

export const generateNonsenseWord = (forcedPos?: PartOfSpeech): NonsenseWord => {
  let word = "";
  let pos: PartOfSpeech = forcedPos || 'noun';
  let style = "standard";

  // If no POS forced, pick based on weighted randomness prioritizing Nouns/Verbs
  if (!forcedPos) {
      const rand = Math.random();
      if (rand < 0.5) pos = 'noun';
      else if (rand < 0.75) pos = 'verb';
      else if (rand < 0.9) pos = 'adj';
      else pos = 'adv';
  }

  switch (pos) {
    case 'noun':
      const nounStrat = Math.random();
      if (nounStrat < 0.3) {
        word = generateReduplication();
        style = "reduplication";
      } else if (nounStrat < 0.6) {
        word = generateCompound();
        style = "compound";
      } else {
        word = generateInfixed();
        style = "infix";
      }
      break;
    
    case 'verb':
      word = generateVerb();
      style = "punchy-verb";
      break;

    case 'adj':
      word = generateAdjective();
      style = "whimsical-adj";
      break;

    case 'adv':
      // Adverbs are usually Adjectives + ly
      const base = generateAdjective();
      // Ensure we don't double 'ly' if the suffix was 'y' (messy -> messily logic is complex, simplify)
      if (base.endsWith('y')) word = base.slice(0, -1) + 'ily';
      else word = base + 'ly';
      style = "adverb";
      break;

    case 'proper':
      word = generateRoot() + getRandom(['ton', 'ville', 'berg', 'us', 'a']);
      word = word.charAt(0).toUpperCase() + word.slice(1);
      style = "proper-noun";
      break;
  }

  // Final cleanup: Capitalize first letter of Nouns/Proper only? 
  // Actually, standard English only capitalizes Proper.
  // But for the list generation, we usually capitalize the list item.
  // We'll return lowercase for general usage, capitalize in the UI/List.
  word = word.toLowerCase();
  
  // Make sure it looks nice (remove triple letters)
  word = word.replace(/(.)\1\1/g, '$1$1');

  // Capitalize return for list presentation
  word = word.charAt(0).toUpperCase() + word.slice(1);

  return { word, partOfSpeech: pos, style };
};

export const generateWordPool = (count: number): NonsenseWord[] => {
  const pool: NonsenseWord[] = [];
  const words = new Set<string>();

  // Ensure a mix of POS
  const minimums = {
    'noun': Math.floor(count * 0.4),
    'verb': Math.floor(count * 0.3),
    'adj': Math.floor(count * 0.2),
    'adv': Math.floor(count * 0.1) || 1,
    'proper': 0
  };

  // 1. Fill Minimums
  Object.entries(minimums).forEach(([pos, minCount]) => {
      for(let i=0; i<minCount; i++) {
        let candidate = generateNonsenseWord(pos as PartOfSpeech);
        // Retry loop for uniqueness
        let attempts = 0;
        while(words.has(candidate.word) && attempts < 10) {
            candidate = generateNonsenseWord(pos as PartOfSpeech);
            attempts++;
        }
        words.add(candidate.word);
        pool.push(candidate);
      }
  });

  // 2. Fill Remainder with Random
  while (pool.length < count) {
    let candidate = generateNonsenseWord();
    if (!words.has(candidate.word)) {
      words.add(candidate.word);
      pool.push(candidate);
    }
  }

  // Shuffle array
  return pool.sort(() => Math.random() - 0.5);
};