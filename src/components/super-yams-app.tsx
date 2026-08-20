"use client";

import { useEffect, useState } from "react";
import {
  CATEGORY_META,
  DEFAULT_RULES,
  LOWER_CATEGORIES,
  STORAGE_KEY,
  TOTAL_CATEGORY_COUNT,
  UPPER_CATEGORIES,
  calculateScore,
  cloneRules,
  createBrelanDice,
  createDiceForTotal,
  createGameFromPlayerNames,
  createInitialGame,
  createTemplateDice,
  createUpperDice,
  getBonus,
  getFilledCategoryCount,
  getGrandTotal,
  getLeaderboard,
  getLowerSubtotal,
  normalizeGameState,
  getUpperFaceValue,
  getUpperSubtotal,
  makeId,
  type CategoryKey,
  type DiceSet,
  type GameState,
  type LowerCategoryKey,
  type PlayerState,
  type ScoreComputation,
  type UpperCategoryKey,
  type Rules
} from "@/lib/super-yams";

type AppView = "home" | "setup" | "game";

type SetupPlayer = {
  id: string;
  name: string;
};

type EditorState = {
  playerId: string;
  category: CategoryKey;
};

const DEFAULT_PLAYER_COUNT = 4;
const DEFAULT_DICE: DiceSet = [1, 2, 3, 4, 5];
const FIXED_LOWER_CATEGORIES = [
  "carre",
  "full",
  "smallStraight",
  "largeStraight",
  "yams",
  "underEight",
  "overTwentySeven"
] as const;
const TOTAL_INPUT_CATEGORIES = ["brelan", "minus", "plus", "chance"] as const;

type FixedLowerCategory = (typeof FIXED_LOWER_CATEGORIES)[number];
type TotalInputCategory = (typeof TOTAL_INPUT_CATEGORIES)[number];
type PreviewState = ScoreComputation & { dice: DiceSet };

function createSetupPlayers(count: number, previous: SetupPlayer[] = []): SetupPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    id: previous[index]?.id ?? makeId("setup-player"),
    name: previous[index]?.name ?? `Joueur ${index + 1}`
  }));
}

function createSetupPlayersFromGame(players: PlayerState[]): SetupPlayer[] {
  return players.map((player, index) => ({
    id: makeId("setup-player"),
    name: player.name.trim() || `Joueur ${index + 1}`
  }));
}

function normalizePlayerNames(players: SetupPlayer[]): string[] {
  return players.map((player, index) => player.name.trim() || `Joueur ${index + 1}`);
}

function isUpperCategory(category: CategoryKey): category is UpperCategoryKey {
  return (UPPER_CATEGORIES as readonly string[]).includes(category);
}

function isTotalInputCategory(category: CategoryKey): category is TotalInputCategory {
  return (TOTAL_INPUT_CATEGORIES as readonly string[]).includes(category);
}

function isFixedLowerCategory(category: CategoryKey): category is FixedLowerCategory {
  return (FIXED_LOWER_CATEGORIES as readonly string[]).includes(category);
}

function clampCount(value: number): number {
  return Math.min(5, Math.max(1, value));
}

function clampTotal(value: number): number {
  return Math.min(30, Math.max(5, value));
}

function getDefaultTotal(category: TotalInputCategory): number {
  switch (category) {
    case "brelan":
      return 15;
    case "minus":
      return 10;
    case "plus":
      return 28;
    case "chance":
      return 20;
  }
}

function getSavedEntryLabel(category: CategoryKey, entry: NonNullable<PlayerState["scores"][CategoryKey]>): string {
  if (entry.isScratch) {
    return "Case barrée";
  }

  if (isUpperCategory(category)) {
    const face = getUpperFaceValue(category);
    const count = Math.max(1, Math.round(entry.score / face));
    return `${count} dé${count > 1 ? "s" : ""}`;
  }

  if (category === "brelan" || category === "minus" || category === "plus" || category === "chance") {
    return `Total des dés: ${entry.rawTotal}${entry.isSec ? " · sec" : ""}`;
  }

  return entry.isSec ? "Fait sec" : "Fait";
}

function getEditorMessage(
  category: CategoryKey,
  preview: PreviewState,
  count: number,
  isSec: boolean
): string {
  if (!preview.valid) {
    return "Cette case ne peut pas être remplie comme ça. Barre-la à 0 si besoin.";
  }

  if (isUpperCategory(category)) {
    return `${count} dé${count > 1 ? "s" : ""} dans cette case${isSec ? " · sec" : ""}`;
  }

  if (category === "brelan") {
    return `Brelan compté avec le total des 5 dés${isSec ? " · sec" : ""}`;
  }

  if (category === "minus" || category === "plus" || category === "chance") {
    return `${category === "minus" ? "Moins" : category === "plus" ? "Plus" : "Chance"} avec un total de ${preview.rawTotal}`;
  }

  return isSec ? "Figure faite sec" : "Figure faite";
}

function createPreview(
  category: CategoryKey,
  count: number,
  total: number,
  isSec: boolean,
  rules: Rules,
  scores: PlayerState["scores"]
): PreviewState {
  let dice: DiceSet;

  if (isUpperCategory(category)) {
    dice = createUpperDice(getUpperFaceValue(category), clampCount(count));
  } else if (category === "brelan") {
    dice = createBrelanDice(clampTotal(total));
  } else if (category === "minus" || category === "plus" || category === "chance") {
    dice = createDiceForTotal(clampTotal(total));
  } else if (isFixedLowerCategory(category)) {
    dice = createTemplateDice(category);
  } else {
    dice = DEFAULT_DICE;
  }

  const result = calculateScore(category, dice, isSec, rules, scores);
  return {
    ...result,
    dice
  };
}

export function SuperYamsApp() {
  const [bootGame] = useState<GameState>(() => createInitialGame(DEFAULT_PLAYER_COUNT));
  const [game, setGame] = useState<GameState>(bootGame);
  const [ready, setReady] = useState(false);
  const [hasSavedGame, setHasSavedGame] = useState(false);
  const [view, setView] = useState<AppView>("home");
  const [setupPlayers, setSetupPlayers] = useState<SetupPlayer[]>(() =>
    createSetupPlayers(DEFAULT_PLAYER_COUNT)
  );
  const [setupRules, setSetupRules] = useState<Rules>(() => cloneRules(DEFAULT_RULES));
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draftCount, setDraftCount] = useState(1);
  const [draftTotal, setDraftTotal] = useState(20);
  const [draftSec, setDraftSec] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const parsed = normalizeGameState(JSON.parse(stored) as GameState);
        setGame(parsed);
        setHasSavedGame(true);
        setSetupPlayers(createSetupPlayersFromGame(parsed.players));
        setSetupRules(cloneRules(parsed.rules));
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (hasSavedGame) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
      return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
  }, [game, hasSavedGame, ready]);

  const activeIndex = Math.max(
    0,
    game.players.findIndex((player) => player.id === game.activePlayerId)
  );
  const activePlayer = game.players[activeIndex] ?? game.players[0];
  const leaderboard = getLeaderboard(game.players, game.rules);
  const totalFilled = game.players.reduce(
    (total, player) => total + getFilledCategoryCount(player.scores),
    0
  );
  const maxSlots = Math.max(1, game.players.length * TOTAL_CATEGORY_COUNT);
  const overallProgress = Math.round((totalFilled / maxSlots) * 100);
  const isFinished =
    hasSavedGame &&
    game.players.length > 0 &&
    game.players.every((player) => getFilledCategoryCount(player.scores) === TOTAL_CATEGORY_COUNT);
  const winner = leaderboard[0];

  const editorPlayer = editor
    ? game.players.find((player) => player.id === editor.playerId) ?? null
    : null;
  const editorEntry =
    editor && editorPlayer ? editorPlayer.scores[editor.category] ?? null : null;
  const preview =
    editor && editorPlayer
      ? createPreview(
          editor.category,
          draftCount,
          draftTotal,
          draftSec,
          game.rules,
          editorPlayer.scores
        )
      : null;
  const editorIsUpper = editor ? isUpperCategory(editor.category) : false;
  const editorNeedsTotal = editor ? isTotalInputCategory(editor.category) : false;
  const editorUpperFace =
    editor && isUpperCategory(editor.category)
      ? getUpperFaceValue(editor.category)
      : null;

  function patchGame(updater: (previous: GameState) => GameState) {
    setGame((previous) => {
      const next = updater(previous);
      return {
        ...next,
        updatedAt: new Date().toISOString()
      };
    });
  }

  function beginNewGame() {
    const nextSetupPlayers =
      game.players.length > 0
        ? createSetupPlayersFromGame(game.players)
        : createSetupPlayers(DEFAULT_PLAYER_COUNT);

    setSetupPlayers(nextSetupPlayers);
    setSetupRules(cloneRules(game.rules));
    closeEditor();
    setView("setup");
  }

  function resumeGame() {
    if (!hasSavedGame) {
      beginNewGame();
      return;
    }

    closeEditor();
    setView("game");
  }

  function goHome() {
    closeEditor();
    setView("home");
  }

  function updateSetupCount(nextCount: number) {
    const safeCount = Math.min(10, Math.max(1, nextCount));
    setSetupPlayers((previous) => createSetupPlayers(safeCount, previous));
  }

  function renameSetupPlayer(playerId: string, name: string) {
    setSetupPlayers((previous) =>
      previous.map((player) => (player.id === playerId ? { ...player, name } : player))
    );
  }

  function moveSetupPlayer(playerId: string, direction: -1 | 1) {
    setSetupPlayers((previous) => {
      const index = previous.findIndex((player) => player.id === playerId);

      if (index < 0) {
        return previous;
      }

      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= previous.length) {
        return previous;
      }

      const players = [...previous];
      const [moved] = players.splice(index, 1);
      players.splice(nextIndex, 0, moved);
      return players;
    });
  }

  function updateSetupRuleValue(
    key:
      | "bonusThreshold"
      | "bonusPoints"
      | "carre"
      | "full"
      | "smallStraight"
      | "largeStraight"
      | "yams"
      | "underEight"
      | "overTwentySeven",
    value: number
  ) {
    const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;

    setSetupRules((previous) => {
      if (key === "bonusThreshold" || key === "bonusPoints") {
        return {
          ...previous,
          [key]: safeValue
        };
      }

      return {
        ...previous,
        fixedScores: {
          ...previous.fixedScores,
          [key]: safeValue
        }
      };
    });
  }

  function launchGame() {
    const nextGame = createGameFromPlayerNames(
      normalizePlayerNames(setupPlayers),
      cloneRules(setupRules)
    );

    setGame(nextGame);
    setHasSavedGame(true);
    closeEditor();
    setView("game");
  }

  function selectPlayer(playerId: string) {
    patchGame((previous) => ({
      ...previous,
      activePlayerId: playerId
    }));
  }

  function navigatePlayer(direction: -1 | 1) {
    if (game.players.length === 0) {
      return;
    }

    const nextIndex =
      (activeIndex + direction + game.players.length) % game.players.length;
    selectPlayer(game.players[nextIndex].id);
  }

  function openCategoryEditor(category: CategoryKey) {
    if (!activePlayer) {
      return;
    }

    const currentEntry = activePlayer.scores[category];
    setEditor({ playerId: activePlayer.id, category });

    if (isUpperCategory(category)) {
      const face = getUpperFaceValue(category);
      const existingCount =
        currentEntry && !currentEntry.isScratch
          ? clampCount(Math.round(currentEntry.score / face))
          : 1;
      setDraftCount(existingCount);
      setDraftTotal(face * existingCount);
    } else if (isTotalInputCategory(category)) {
      setDraftCount(1);
      setDraftTotal(
        currentEntry && !currentEntry.isScratch
          ? clampTotal(currentEntry.rawTotal)
          : getDefaultTotal(category)
      );
    } else {
      setDraftCount(1);
      setDraftTotal(20);
    }

    setDraftSec(currentEntry?.isSec ?? false);
  }

  function closeEditor() {
    setEditor(null);
    setDraftCount(1);
    setDraftTotal(20);
    setDraftSec(false);
  }

  function saveCurrentEntry() {
    if (!editor || !preview || !preview.valid) {
      return;
    }

    const savedAt = new Date().toISOString();

    patchGame((previous) => ({
      ...previous,
      players: previous.players.map((player) => {
        if (player.id !== editor.playerId) {
          return player;
        }

        return {
          ...player,
          scores: {
            ...player.scores,
            [editor.category]: {
              category: editor.category,
              dice: preview.dice,
              isSec: CATEGORY_META[editor.category].supportsSec ? draftSec : false,
              isScratch: false,
              score: preview.score,
              rawTotal: preview.rawTotal,
              valid: true,
              detail: preview.detail,
              savedAt
            }
          }
        };
      }),
      history: [
        ...previous.history,
        {
          id: makeId("turn"),
          playerId: editor.playerId,
          category: editor.category,
          score: preview.score,
          savedAt
        }
      ]
    }));

    closeEditor();
  }

  function scratchCurrentEntry() {
    if (!editor) {
      return;
    }

    const savedAt = new Date().toISOString();

    patchGame((previous) => ({
      ...previous,
      players: previous.players.map((player) => {
        if (player.id !== editor.playerId) {
          return player;
        }

        return {
          ...player,
          scores: {
            ...player.scores,
            [editor.category]: {
              category: editor.category,
              dice: preview?.dice ?? DEFAULT_DICE,
              isSec: false,
              isScratch: true,
              score: 0,
              rawTotal: 0,
              valid: true,
              detail: "Case barree",
              savedAt
            }
          }
        };
      }),
      history: [
        ...previous.history,
        {
          id: makeId("turn"),
          playerId: editor.playerId,
          category: editor.category,
          score: 0,
          savedAt
        }
      ]
    }));

    closeEditor();
  }

  function clearCategory(category: CategoryKey) {
    if (!activePlayer) {
      return;
    }

    patchGame((previous) => ({
      ...previous,
      players: previous.players.map((player) => {
        if (player.id !== activePlayer.id) {
          return player;
        }

        const scores = { ...player.scores };
        delete scores[category];

        return {
          ...player,
          scores
        };
      })
    }));

    closeEditor();
  }

  if (!ready) {
    return (
      <main className="page-shell">
        <section className="panel loading-panel">
          <span className="eyebrow">Chargement</span>
          <h1>Super Yams</h1>
          <p>Preparation de l&apos;interface mobile.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      {view === "home" ? (
        <>
          <section className="panel hero-panel fade-up home-panel">
            <span className="eyebrow">Feuille familiale mobile</span>
            <h1>Super Yams</h1>
            <p>
              Lance une partie, mets les joueurs dans l&apos;ordre, puis remplis la
              fiche joueur par joueur.
            </p>
            <div className="hero-actions">
              <button className="primary-button primary-button-large" type="button" onClick={beginNewGame}>
                Nouvelle partie
              </button>
              {hasSavedGame ? (
                <button className="ghost-button" type="button" onClick={resumeGame}>
                  Reprendre la partie
                </button>
              ) : null}
            </div>
          </section>

          {hasSavedGame ? (
            <section className="panel resume-panel fade-up">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Partie sauvegardee</span>
                  <h2>Resume rapide</h2>
                </div>
                <span className="status-badge">{game.players.length} joueurs</span>
              </div>
              <div className="hero-grid">
                <div className="metric-card">
                  <span className="metric-label">Joueur en cours</span>
                  <strong>{activePlayer?.name ?? "Joueur 1"}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Avancement</span>
                  <strong>{overallProgress}%</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Leader</span>
                  <strong>{winner?.name ?? "Aucun"}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Points leader</span>
                  <strong>{winner ? getGrandTotal(winner.scores, game.rules) : 0}</strong>
                </div>
              </div>
            </section>
          ) : (
            <section className="panel resume-panel fade-up">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Parcours</span>
                  <h2>Comment ca se joue</h2>
                </div>
              </div>
              <div className="instruction-list">
                <div className="instruction-item">1. Tu crées la partie et l’ordre des joueurs.</div>
                <div className="instruction-item">2. La fiche du joueur 1 s’affiche.</div>
                <div className="instruction-item">3. Tu passes au joueur suivant avec les boutons.</div>
                <div className="instruction-item">4. Si une case saute, tu peux la barrer a 0.</div>
              </div>
            </section>
          )}
        </>
      ) : null}

      {view === "setup" ? (
        <>
          <section className="panel hero-panel fade-up">
            <div className="section-head">
              <div>
                <span className="eyebrow">Nouvelle partie</span>
                <h1>Préparation</h1>
              </div>
              <button className="ghost-button compact-button" type="button" onClick={goHome}>
                Accueil
              </button>
            </div>
            <p>
              Choisis le nombre de joueurs, mets les noms dans l’ordre de passage,
              puis lance la partie.
            </p>
          </section>

          <section className="panel setup-panel fade-up">
            <div className="section-head">
              <div>
                <span className="eyebrow">Etape 1</span>
                <h2>Nombre de joueurs</h2>
              </div>
            </div>
            <div className="count-picker">
              <button
                className="ghost-button compact-button"
                type="button"
                onClick={() => updateSetupCount(setupPlayers.length - 1)}
                disabled={setupPlayers.length <= 1}
              >
                -
              </button>
              <div className="count-value">
                <strong>{setupPlayers.length}</strong>
                <span>joueurs</span>
              </div>
              <button
                className="ghost-button compact-button"
                type="button"
                onClick={() => updateSetupCount(setupPlayers.length + 1)}
                disabled={setupPlayers.length >= 10}
              >
                +
              </button>
            </div>
              <span className="count-caption">Minimum 1, maximum 10.</span>
          </section>

          <section className="panel setup-panel fade-up">
            <div className="section-head">
              <div>
                <span className="eyebrow">Etape 2</span>
                <h2>Ordre et noms</h2>
              </div>
            </div>
            <div className="setup-list">
              {setupPlayers.map((player, index) => (
                <div key={player.id} className="setup-row">
                  <span className="order-pill">#{index + 1}</span>
                  <input
                    className="text-input"
                    value={player.name}
                    onChange={(event) => renameSetupPlayer(player.id, event.target.value)}
                    placeholder={`Joueur ${index + 1}`}
                  />
                  <div className="player-order-actions">
                    <button
                      className="ghost-button compact-button"
                      type="button"
                      onClick={() => moveSetupPlayer(player.id, -1)}
                      disabled={index === 0}
                    >
                      Haut
                    </button>
                    <button
                      className="ghost-button compact-button"
                      type="button"
                      onClick={() => moveSetupPlayer(player.id, 1)}
                      disabled={index === setupPlayers.length - 1}
                    >
                      Bas
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="game-actions">
              <button className="primary-button primary-button-large" type="button" onClick={launchGame}>
                Lancer la partie
              </button>
            </div>
          </section>

          <details className="panel utility-panel fade-up">
            <summary>
              <span className="eyebrow">Etape 3</span>
              <span className="summary-title">Règles de votre famille</span>
            </summary>
            <div className="utility-stack">
              <p className="info-copy">
                Les règles restent libres. Tu peux ajuster les valeurs avant de lancer
                la partie.
              </p>
              <div className="rule-grid">
                <label className="number-field">
                  <span>Bonus seuil</span>
                  <input
                    type="number"
                    min={0}
                    value={setupRules.bonusThreshold}
                    onChange={(event) =>
                      updateSetupRuleValue("bonusThreshold", Number(event.target.value))
                    }
                  />
                </label>
                <label className="number-field">
                  <span>Bonus</span>
                  <input
                    type="number"
                    min={0}
                    value={setupRules.bonusPoints}
                    onChange={(event) =>
                      updateSetupRuleValue("bonusPoints", Number(event.target.value))
                    }
                  />
                </label>
                <label className="number-field">
                  <span>Carre</span>
                  <input
                    type="number"
                    min={0}
                    value={setupRules.fixedScores.carre}
                    onChange={(event) =>
                      updateSetupRuleValue("carre", Number(event.target.value))
                    }
                  />
                </label>
                <label className="number-field">
                  <span>Full</span>
                  <input
                    type="number"
                    min={0}
                    value={setupRules.fixedScores.full}
                    onChange={(event) =>
                      updateSetupRuleValue("full", Number(event.target.value))
                    }
                  />
                </label>
                <label className="number-field">
                  <span>Petite suite</span>
                  <input
                    type="number"
                    min={0}
                    value={setupRules.fixedScores.smallStraight}
                    onChange={(event) =>
                      updateSetupRuleValue("smallStraight", Number(event.target.value))
                    }
                  />
                </label>
                <label className="number-field">
                  <span>Grande suite</span>
                  <input
                    type="number"
                    min={0}
                    value={setupRules.fixedScores.largeStraight}
                    onChange={(event) =>
                      updateSetupRuleValue("largeStraight", Number(event.target.value))
                    }
                  />
                </label>
                <label className="number-field">
                  <span>Yams</span>
                  <input
                    type="number"
                    min={0}
                    value={setupRules.fixedScores.yams}
                    onChange={(event) =>
                      updateSetupRuleValue("yams", Number(event.target.value))
                    }
                  />
                </label>
                <label className="number-field">
                  <span>Moins de 8</span>
                  <input
                    type="number"
                    min={0}
                    value={setupRules.fixedScores.underEight}
                    onChange={(event) =>
                      updateSetupRuleValue("underEight", Number(event.target.value))
                    }
                  />
                </label>
                <label className="number-field">
                  <span>Plus de 27</span>
                  <input
                    type="number"
                    min={0}
                    value={setupRules.fixedScores.overTwentySeven}
                    onChange={(event) =>
                      updateSetupRuleValue("overTwentySeven", Number(event.target.value))
                    }
                  />
                </label>
              </div>
            </div>
          </details>
        </>
      ) : null}

      {view === "game" && activePlayer ? (
        <>
          <section className="panel hero-panel fade-up turn-panel">
            <div className="section-head">
              <div>
                <span className="eyebrow">Partie en cours</span>
                <h1>{activePlayer.name}</h1>
              </div>
              <button className="ghost-button compact-button" type="button" onClick={goHome}>
                Accueil
              </button>
            </div>
            <p>
              Fiche du joueur {activeIndex + 1} sur {game.players.length}. Tu peux
              passer au suivant ou revenir en arrière quand tu veux.
            </p>
            <div className="turn-nav">
              <button className="ghost-button" type="button" onClick={() => navigatePlayer(-1)}>
                Precedent
              </button>
              <span className="turn-index">
                {activeIndex + 1} / {game.players.length}
              </span>
              <button className="primary-button" type="button" onClick={() => navigatePlayer(1)}>
                Suivant
              </button>
            </div>
            <div className="hero-grid">
              <div className="metric-card">
                <span className="metric-label">Total</span>
                <strong>{getGrandTotal(activePlayer.scores, game.rules)} pts</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">Haut</span>
                <strong>
                  {getUpperSubtotal(activePlayer.scores)} / {game.rules.bonusThreshold}
                </strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">Bas</span>
                <strong>{getLowerSubtotal(activePlayer.scores)} pts</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">Cases</span>
                <strong>
                  {getFilledCategoryCount(activePlayer.scores)} / {TOTAL_CATEGORY_COUNT}
                </strong>
              </div>
            </div>
          </section>

          {isFinished && winner ? (
            <section className="panel resume-panel fade-up">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Fin de partie</span>
                  <h2>{winner.name} gagne</h2>
                </div>
                <span className="status-badge status-badge-strong">
                  {getGrandTotal(winner.scores, game.rules)} pts
                </span>
              </div>
            </section>
          ) : null}

          <section className="panel active-sheet-panel fade-up">
            <div className="section-head">
              <div>
                <span className="eyebrow">Fiche joueur</span>
                <h2>{activePlayer.name}</h2>
              </div>
              <span className="status-badge">Bonus {getBonus(activePlayer.scores, game.rules)}</span>
            </div>

            <div className="score-section">
              <div className="section-head compact-head">
                <div>
                  <span className="eyebrow">Partie haute</span>
                  <h3>1 a 6</h3>
                </div>
              </div>
              <div className="category-list">
                {UPPER_CATEGORIES.map((category) => (
                  <CategoryButton
                    key={category}
                    category={category}
                    entry={activePlayer.scores[category]}
                    onClick={() => openCategoryEditor(category)}
                  />
                ))}
              </div>
            </div>

            <div className="score-section">
              <div className="section-head compact-head">
                <div>
                  <span className="eyebrow">Partie basse</span>
                  <h3>Combinaisons</h3>
                </div>
              </div>
              <div className="category-list">
                {LOWER_CATEGORIES.map((category) => (
                  <CategoryButton
                    key={category}
                    category={category}
                    entry={activePlayer.scores[category]}
                    onClick={() => openCategoryEditor(category)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="panel leaderboard-panel fade-up">
            <div className="section-head">
              <div>
                <span className="eyebrow">Scores</span>
                <h2>Classement</h2>
              </div>
              <span className="status-badge">{overallProgress}% rempli</span>
            </div>

            <div className="leaderboard-list">
              {leaderboard.map((player, index) => (
                <button
                  key={player.id}
                  className={`leaderboard-item ${
                    player.id === activePlayer.id ? "leaderboard-item-active" : ""
                  }`}
                  type="button"
                  onClick={() => selectPlayer(player.id)}
                >
                  <span className="leaderboard-rank">#{index + 1}</span>
                  <span className="leaderboard-name">{player.name}</span>
                  <span className="leaderboard-progress">
                    {getFilledCategoryCount(player.scores)}/{TOTAL_CATEGORY_COUNT}
                  </span>
                  <strong className="leaderboard-score">
                    {getGrandTotal(player.scores, game.rules)}
                  </strong>
                </button>
              ))}
            </div>
          </section>

          <details className="panel utility-panel fade-up">
            <summary>
              <span className="eyebrow">Regles actives</span>
              <span className="summary-title">Règles de la partie</span>
            </summary>
            <div className="utility-stack">
              <div className="rules-summary">
                <span>Bonus: {game.rules.bonusThreshold} =&gt; +{game.rules.bonusPoints}</span>
                <span>Carre: {game.rules.fixedScores.carre}</span>
                <span>Full: {game.rules.fixedScores.full}</span>
                <span>Petite suite: {game.rules.fixedScores.smallStraight}</span>
                <span>Grande suite: {game.rules.fixedScores.largeStraight}</span>
                <span>Yams: {game.rules.fixedScores.yams}</span>
                <span>Moins de 8: {game.rules.fixedScores.underEight}</span>
                <span>Plus de 27: {game.rules.fixedScores.overTwentySeven}</span>
              </div>
            </div>
          </details>

          <section className="game-actions">
            <button className="ghost-button" type="button" onClick={beginNewGame}>
              Nouvelle partie
            </button>
          </section>
        </>
      ) : null}

      {editor && editorPlayer && preview ? (
        <div className="modal-overlay" role="presentation" onClick={closeEditor}>
          <section
            className="editor-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Saisie de score"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-head">
              <div>
                <span className="eyebrow">{editorPlayer.name}</span>
                <h2>{CATEGORY_META[editor.category].label}</h2>
              </div>
              <button className="ghost-button compact-button" type="button" onClick={closeEditor}>
                Fermer
              </button>
            </div>

            <p className="editor-copy">{CATEGORY_META[editor.category].description}</p>

            {editorIsUpper && editorUpperFace ? (
              <div className="editor-block">
                <span className="field-label">
                  Combien de des <strong>{editorUpperFace}</strong> ?
                </span>
                <div className="count-options">
                  {[1, 2, 3, 4, 5].map((count) => (
                    <button
                      key={`${editor.category}-${count}`}
                      className={`count-chip ${draftCount === count ? "count-chip-active" : ""}`}
                      type="button"
                      onClick={() => setDraftCount(count)}
                    >
                      {count}
                    </button>
                  ))}
                </div>
                <p className="editor-hint">
                  Exemple: 3 as = 3 points, 2 six = 12 points, max 5 des sur une case.
                </p>
              </div>
            ) : null}

            {editorNeedsTotal ? (
              <div className="editor-block">
                  <span className="field-label">Total des dés</span>
                <div className="count-picker total-picker">
                  <button
                    className="ghost-button compact-button"
                    type="button"
                    onClick={() => setDraftTotal((previous) => clampTotal(previous - 1))}
                  >
                    -
                  </button>
                  <div className="count-value">
                    <strong>{draftTotal}</strong>
                    <span>total</span>
                  </div>
                  <button
                    className="ghost-button compact-button"
                    type="button"
                    onClick={() => setDraftTotal((previous) => clampTotal(previous + 1))}
                  >
                    +
                  </button>
                </div>
              </div>
            ) : null}

            {!editorIsUpper && !editorNeedsTotal ? (
              <div className="editor-block editor-figure-card">
                <span className="field-label">Figure</span>
                <p className="editor-hint">
                  Si la figure est faite, tu enregistres. Si elle est faite sec, tu coches
                  l&apos;option sec.
                </p>
              </div>
            ) : null}

            {CATEGORY_META[editor.category].supportsSec ? (
              <label className="sec-toggle">
                <input
                  type="checkbox"
                  checked={draftSec}
                  onChange={(event) => setDraftSec(event.target.checked)}
                />
                <span>Fait sec: score double</span>
              </label>
            ) : null}

            <div
              className={`preview-card ${
                preview.valid ? "preview-valid" : "preview-zero"
              }`}
            >
              <span className="eyebrow">Score</span>
              <div className="preview-score-row">
                <strong>{preview.score} pts</strong>
                {editorNeedsTotal ? <span>Total des dés: {preview.rawTotal}</span> : null}
              </div>
              <p>{getEditorMessage(editor.category, preview, draftCount, draftSec)}</p>
            </div>

            <div className="utility-actions">
              <button
                className="primary-button"
                type="button"
                onClick={saveCurrentEntry}
                disabled={!preview.valid}
              >
                Enregistrer
              </button>
              <button className="ghost-button" type="button" onClick={scratchCurrentEntry}>
                Barrer a 0
              </button>
              {editorEntry ? (
                <button
                  className="ghost-button danger-button"
                  type="button"
                  onClick={() => clearCategory(editor.category)}
                >
                  Effacer
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function CategoryButton({
  category,
  entry,
  onClick
}: {
  category: CategoryKey;
  entry: PlayerState["scores"][CategoryKey];
  onClick: () => void;
}) {
  const detail = entry
    ? getSavedEntryLabel(category, entry)
    : CATEGORY_META[category].description;

  return (
    <button
      className={`category-button ${entry ? "category-button-filled" : ""} ${
        entry?.isScratch ? "category-button-scratch" : ""
      }`}
      type="button"
      onClick={onClick}
    >
      <div className="category-copy">
        <span className="category-name">{CATEGORY_META[category].label}</span>
        <span className="category-detail">{detail}</span>
      </div>
      <strong className="category-score">{entry ? entry.score : "+"}</strong>
    </button>
  );
}
