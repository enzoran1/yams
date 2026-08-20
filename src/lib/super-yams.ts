export const STORAGE_KEY = "super-yams-mobile-v2";

export const UPPER_CATEGORIES = [
  "ones",
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes"
] as const;

export const LOWER_CATEGORIES = [
  "brelan",
  "carre",
  "full",
  "smallStraight",
  "largeStraight",
  "yams",
  "underEight",
  "overTwentySeven",
  "minus",
  "plus",
  "chance"
] as const;

export type UpperCategoryKey = (typeof UPPER_CATEGORIES)[number];
export type LowerCategoryKey = (typeof LOWER_CATEGORIES)[number];
export type CategoryKey = UpperCategoryKey | LowerCategoryKey;

export type DiceSet = [number, number, number, number, number];

export type Rules = {
  bonusThreshold: number;
  bonusPoints: number;
  secMultiplier: number;
  fixedScores: {
    carre: number;
    full: number;
    smallStraight: number;
    largeStraight: number;
    yams: number;
    underEight: number;
    overTwentySeven: number;
  };
};

export type ScoreEntry = {
  category: CategoryKey;
  dice: DiceSet;
  isSec: boolean;
  isScratch: boolean;
  score: number;
  rawTotal: number;
  valid: boolean;
  detail: string;
  savedAt: string;
};

export type PlayerScores = Partial<Record<CategoryKey, ScoreEntry>>;

export type PlayerState = {
  id: string;
  name: string;
  scores: PlayerScores;
};

export type TurnRecord = {
  id: string;
  playerId: string;
  category: CategoryKey;
  score: number;
  savedAt: string;
};

export type GameState = {
  version: 1;
  createdAt: string;
  updatedAt: string;
  activePlayerId: string;
  players: PlayerState[];
  rules: Rules;
  history: TurnRecord[];
};

export type ScoreComputation = {
  score: number;
  rawTotal: number;
  valid: boolean;
  detail: string;
};

const UPPER_FACE_VALUES: Record<UpperCategoryKey, number> = {
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6
};

export const CATEGORY_META: Record<
  CategoryKey,
  {
    label: string;
    description: string;
    section: "upper" | "lower";
    supportsSec: boolean;
  }
> = {
  ones: {
    label: "As",
    description: "Somme des 1",
    section: "upper",
    supportsSec: false
  },
  twos: {
    label: "Deux",
    description: "Somme des 2",
    section: "upper",
    supportsSec: false
  },
  threes: {
    label: "Trois",
    description: "Somme des 3",
    section: "upper",
    supportsSec: false
  },
  fours: {
    label: "Quatre",
    description: "Somme des 4",
    section: "upper",
    supportsSec: false
  },
  fives: {
    label: "Cinq",
    description: "Somme des 5",
    section: "upper",
    supportsSec: false
  },
  sixes: {
    label: "Six",
    description: "Somme des 6",
    section: "upper",
    supportsSec: false
  },
  brelan: {
    label: "Brelan",
    description: "Somme des 5 des",
    section: "lower",
    supportsSec: true
  },
  carre: {
    label: "Carre",
    description: "Score fixe",
    section: "lower",
    supportsSec: true
  },
  full: {
    label: "Full",
    description: "Score fixe",
    section: "lower",
    supportsSec: true
  },
  smallStraight: {
    label: "Petite suite",
    description: "4 des qui se suivent",
    section: "lower",
    supportsSec: true
  },
  largeStraight: {
    label: "Grande suite",
    description: "5 des qui se suivent",
    section: "lower",
    supportsSec: true
  },
  yams: {
    label: "Yams",
    description: "5 des identiques",
    section: "lower",
    supportsSec: true
  },
  underEight: {
    label: "Moins de 8",
    description: "Somme stricte < 8",
    section: "lower",
    supportsSec: true
  },
  overTwentySeven: {
    label: "Plus de 27",
    description: "Somme stricte > 27",
    section: "lower",
    supportsSec: true
  },
  minus: {
    label: "Moins",
    description: "Somme des 5 des, doit etre < Plus",
    section: "lower",
    supportsSec: false
  },
  plus: {
    label: "Plus",
    description: "Somme des 5 des, doit etre > Moins",
    section: "lower",
    supportsSec: false
  },
  chance: {
    label: "Chance",
    description: "Somme des 5 des",
    section: "lower",
    supportsSec: false
  }
};

export const DEFAULT_RULES: Rules = {
  bonusThreshold: 60,
  bonusPoints: 30,
  secMultiplier: 2,
  fixedScores: {
    carre: 40,
    full: 20,
    smallStraight: 25,
    largeStraight: 35,
    yams: 60,
    underEight: 50,
    overTwentySeven: 50
  }
};

export const TOTAL_CATEGORY_COUNT =
  UPPER_CATEGORIES.length + LOWER_CATEGORIES.length;

export function createInitialGame(playerCount = 4): GameState {
  const players = Array.from({ length: playerCount }, (_, index) =>
    createPlayer(index + 1)
  );

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activePlayerId: players[0].id,
    players,
    rules: { ...DEFAULT_RULES, fixedScores: { ...DEFAULT_RULES.fixedScores } },
    history: []
  };
}

export function normalizeGameState(game: GameState): GameState {
  return {
    ...game,
    rules: cloneRules(game.rules),
    players: game.players.map((player) => {
      const normalizedScores: PlayerScores = {};

      for (const [categoryKey, entry] of Object.entries(player.scores) as Array<
        [CategoryKey, ScoreEntry]
      >) {
        const effectiveSec = CATEGORY_META[categoryKey].supportsSec ? entry.isSec : false;

        if (entry.isScratch) {
          normalizedScores[categoryKey] = {
            ...entry,
            isSec: false,
            score: 0,
            rawTotal: 0,
            valid: true,
            detail: "Case barree"
          };
          continue;
        }

        const computation = calculateScore(
          categoryKey,
          entry.dice,
          effectiveSec,
          game.rules,
          player.scores
        );

        normalizedScores[categoryKey] = {
          ...entry,
          isSec: effectiveSec,
          score: computation.score,
          rawTotal: computation.rawTotal,
          valid: computation.valid,
          detail: computation.detail
        };
      }

      return {
        ...player,
        scores: normalizedScores
      };
    })
  };
}

export function cloneRules(rules: Rules): Rules {
  return {
    ...rules,
    fixedScores: {
      ...rules.fixedScores
    }
  };
}

export function createGameFromPlayerNames(
  names: string[],
  rules: Rules = DEFAULT_RULES
): GameState {
  const players = names.map((name, index) =>
    createPlayer(index + 1, name.trim() || `Joueur ${index + 1}`)
  );

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activePlayerId: players[0]?.id ?? "",
    players,
    rules: cloneRules(rules),
    history: []
  };
}

export function createPlayer(index: number, name = `Joueur ${index}`): PlayerState {
  return {
    id: makeId("player"),
    name,
    scores: {}
  };
}

export function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getUpperFaceValue(category: UpperCategoryKey): number {
  return UPPER_FACE_VALUES[category];
}

export function getNextPlayerId(players: PlayerState[], currentId: string): string {
  const currentIndex = players.findIndex((player) => player.id === currentId);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  return players[(safeIndex + 1) % players.length].id;
}

export function getDiceTotal(dice: DiceSet): number {
  return dice.reduce((total, value) => total + value, 0);
}

export function getOccurrences(dice: DiceSet): number[] {
  const counts = new Map<number, number>();

  for (const value of dice) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.values()].sort((left, right) => right - left);
}

export function hasOfAKind(dice: DiceSet, amount: number): boolean {
  return getOccurrences(dice)[0] >= amount;
}

export function isFullHouse(dice: DiceSet): boolean {
  const counts = getOccurrences(dice);
  return counts.length === 2 && counts[0] === 3 && counts[1] === 2;
}

export function isSmallStraight(dice: DiceSet): boolean {
  const uniqueValues = [...new Set(dice)].sort((left, right) => left - right);
  const signatures = ["1234", "2345", "3456"];
  const condensed = uniqueValues.join("");

  return signatures.some((signature) => condensed.includes(signature));
}

export function isLargeStraight(dice: DiceSet): boolean {
  const uniqueValues = [...new Set(dice)].sort((left, right) => left - right);
  return (
    uniqueValues.length === 5 &&
    (uniqueValues.join("") === "12345" || uniqueValues.join("") === "23456")
  );
}

export function calculateScore(
  category: CategoryKey,
  dice: DiceSet,
  isSec: boolean,
  rules: Rules,
  existingScores: PlayerScores
): ScoreComputation {
  const total = getDiceTotal(dice);
  const multiplier =
    CATEGORY_META[category].supportsSec && isSec ? rules.secMultiplier : 1;

  switch (category) {
    case "ones":
    case "twos":
    case "threes":
    case "fours":
    case "fives":
    case "sixes": {
      const face = UPPER_FACE_VALUES[category];
      const matches = dice.filter((value) => value === face).length;
      return {
        score: matches * face,
        rawTotal: total,
        valid: matches > 0,
        detail: matches > 0 ? `${matches} x ${face}` : `Aucun ${face}`
      };
    }
    case "brelan": {
      const valid = hasOfAKind(dice, 3);
      return {
        score: valid ? total * multiplier : 0,
        rawTotal: total,
        valid,
        detail: valid ? `Somme ${total}${isSec ? " x2" : ""}` : "Pas de brelan"
      };
    }
    case "carre": {
      const valid = hasOfAKind(dice, 4);
      return {
        score: valid ? rules.fixedScores.carre * multiplier : 0,
        rawTotal: total,
        valid,
        detail: valid
          ? `${rules.fixedScores.carre}${isSec ? " x2" : ""}`
          : "Pas de carre"
      };
    }
    case "full": {
      const valid = isFullHouse(dice);
      return {
        score: valid ? rules.fixedScores.full * multiplier : 0,
        rawTotal: total,
        valid,
        detail: valid
          ? `${rules.fixedScores.full}${isSec ? " x2" : ""}`
          : "Pas de full"
      };
    }
    case "smallStraight": {
      const valid = isSmallStraight(dice);
      return {
        score: valid ? rules.fixedScores.smallStraight * multiplier : 0,
        rawTotal: total,
        valid,
        detail: valid
          ? `${rules.fixedScores.smallStraight}${isSec ? " x2" : ""}`
          : "Pas de petite suite"
      };
    }
    case "largeStraight": {
      const valid = isLargeStraight(dice);
      return {
        score: valid ? rules.fixedScores.largeStraight * multiplier : 0,
        rawTotal: total,
        valid,
        detail: valid
          ? `${rules.fixedScores.largeStraight}${isSec ? " x2" : ""}`
          : "Pas de grande suite"
      };
    }
    case "yams": {
      const valid = hasOfAKind(dice, 5);
      return {
        score: valid ? rules.fixedScores.yams * multiplier : 0,
        rawTotal: total,
        valid,
        detail: valid
          ? `${rules.fixedScores.yams}${isSec ? " x2" : ""}`
          : "Pas de yams"
      };
    }
    case "underEight": {
      const valid = total < 8;
      return {
        score: valid ? rules.fixedScores.underEight * multiplier : 0,
        rawTotal: total,
        valid,
        detail: valid
          ? `${rules.fixedScores.underEight}${isSec ? " x2" : ""}`
          : "Somme >= 8"
      };
    }
    case "overTwentySeven": {
      const valid = total > 27;
      return {
        score: valid ? rules.fixedScores.overTwentySeven * multiplier : 0,
        rawTotal: total,
        valid,
        detail: valid
          ? `${rules.fixedScores.overTwentySeven}${isSec ? " x2" : ""}`
          : "Somme <= 27"
      };
    }
    case "minus": {
      const plusReference = existingScores.plus?.rawTotal;
      const canCompare = typeof plusReference === "number" && !existingScores.plus?.isScratch;
      const valid = canCompare ? total < plusReference : true;
      return {
        score: valid ? total * multiplier : 0,
        rawTotal: total,
        valid,
        detail:
          canCompare
            ? valid
              ? `${total}${isSec ? " x2" : ""}`
              : `Doit etre < ${plusReference}`
            : `${total}${isSec ? " x2" : ""}`
      };
    }
    case "plus": {
      const minusReference = existingScores.minus?.rawTotal;
      const canCompare = typeof minusReference === "number" && !existingScores.minus?.isScratch;
      const valid = canCompare ? total > minusReference : true;
      return {
        score: valid ? total * multiplier : 0,
        rawTotal: total,
        valid,
        detail:
          canCompare
            ? valid
              ? `${total}${isSec ? " x2" : ""}`
              : `Doit etre > ${minusReference}`
            : `${total}${isSec ? " x2" : ""}`
      };
    }
    case "chance":
      return {
        score: total * multiplier,
        rawTotal: total,
        valid: true,
        detail: `${total}${isSec ? " x2" : ""}`
      };
  }

  const unreachableCategory: never = category;
  throw new Error(`Unhandled category: ${unreachableCategory}`);
}

export function getUpperSubtotal(scores: PlayerScores): number {
  return UPPER_CATEGORIES.reduce(
    (total, category) => total + (scores[category]?.score ?? 0),
    0
  );
}

export function getLowerSubtotal(scores: PlayerScores): number {
  return LOWER_CATEGORIES.reduce(
    (total, category) => total + (scores[category]?.score ?? 0),
    0
  );
}

export function getBonus(scores: PlayerScores, rules: Rules): number {
  return getUpperSubtotal(scores) >= rules.bonusThreshold ? rules.bonusPoints : 0;
}

export function getGrandTotal(scores: PlayerScores, rules: Rules): number {
  return getUpperSubtotal(scores) + getLowerSubtotal(scores) + getBonus(scores, rules);
}

export function getFilledCategoryCount(scores: PlayerScores): number {
  return Object.keys(scores).length;
}

export function getLeaderboard(players: PlayerState[], rules: Rules): PlayerState[] {
  return [...players].sort((left, right) => {
    const scoreGap = getGrandTotal(right.scores, rules) - getGrandTotal(left.scores, rules);

    if (scoreGap !== 0) {
      return scoreGap;
    }

    const completionGap =
      getFilledCategoryCount(right.scores) - getFilledCategoryCount(left.scores);

    if (completionGap !== 0) {
      return completionGap;
    }

    return left.name.localeCompare(right.name, "fr");
  });
}

export function getCurrentRound(historyLength: number, playerCount: number): number {
  return Math.min(
    TOTAL_CATEGORY_COUNT,
    Math.floor(historyLength / Math.max(playerCount, 1)) + 1
  );
}

export function clampDieValue(value: number): number {
  if (value < 1) {
    return 6;
  }

  if (value > 6) {
    return 1;
  }

  return value;
}

export function createUpperDice(face: number, count: number): DiceSet {
  const safeFace = Math.min(6, Math.max(1, face));
  const safeCount = Math.min(5, Math.max(1, count));
  const fillers = [1, 2, 3, 4, 5, 6].filter((value) => value !== safeFace);
  const dice = Array.from({ length: safeCount }, () => safeFace);

  while (dice.length < 5) {
    dice.push(fillers[(dice.length - safeCount) % fillers.length] ?? 1);
  }

  return dice.slice(0, 5) as DiceSet;
}

export function createDiceForTotal(total: number): DiceSet {
  const safeTotal = Math.min(30, Math.max(5, total));
  const dice = [1, 1, 1, 1, 1];
  let remaining = safeTotal - 5;

  for (let index = 0; index < dice.length && remaining > 0; index += 1) {
    const increment = Math.min(5, remaining);
    dice[index] += increment;
    remaining -= increment;
  }

  return dice as DiceSet;
}

export function createBrelanDice(total: number): DiceSet {
  const safeTotal = Math.min(30, Math.max(5, total));

  for (let triple = 1; triple <= 6; triple += 1) {
    for (let left = 1; left <= 6; left += 1) {
      for (let right = 1; right <= 6; right += 1) {
        if (triple * 3 + left + right === safeTotal) {
          return [triple, triple, triple, left, right];
        }
      }
    }
  }

  return [1, 1, 1, 1, 1];
}

export function createTemplateDice(category: Exclude<LowerCategoryKey, "brelan" | "minus" | "plus" | "chance">): DiceSet {
  switch (category) {
    case "carre":
      return [5, 5, 5, 5, 1];
    case "full":
      return [3, 3, 3, 2, 2];
    case "smallStraight":
      return [1, 2, 3, 4, 6];
    case "largeStraight":
      return [1, 2, 3, 4, 5];
    case "yams":
      return [4, 4, 4, 4, 4];
    case "underEight":
      return [1, 1, 1, 1, 3];
    case "overTwentySeven":
      return [6, 6, 6, 5, 5];
  }
}
