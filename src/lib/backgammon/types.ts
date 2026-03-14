/**
 * Core backgammon domain types.
 *
 * Board layout: points 1–24 from the perspective of the current player.
 * Positive values = player's checkers, negative = opponent's.
 * Index 0 = point 1 (player's home board), index 23 = point 24.
 */

export type Player = 'player' | 'opponent';

/** Standard dice value 1-6 */
export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export interface DiceRoll {
	die1: DieValue;
	die2: DieValue;
}

/** The dice values available for individual checker moves */
export function diceValues(roll: DiceRoll): DieValue[] {
	if (roll.die1 === roll.die2) {
		return [roll.die1, roll.die1, roll.die1, roll.die1];
	}
	return [roll.die1, roll.die2];
}

/**
 * Board state representation.
 *
 * points[0] = point 1 (player's ace point)
 * points[23] = point 24 (opponent's ace point)
 *
 * Positive = player checkers, negative = opponent checkers.
 */
export interface BoardState {
	/** 24 points, each holding a signed checker count */
	points: number[];
	/** Player's checkers on the bar */
	playerBar: number;
	/** Opponent's checkers on the bar */
	opponentBar: number;
	/** Player's checkers borne off */
	playerBorneOff: number;
	/** Opponent's checkers borne off */
	opponentBorneOff: number;
	/** Doubling cube value */
	cubeValue: number;
	/** Who owns the cube: null = centered */
	cubeOwner: Player | null;
}

/** A single checker move: from → to, with special values for bar/off */
export interface CheckerMove {
	/** Source point (1-24), or 25 for bar */
	from: number;
	/** Destination point (1-24), or 0 for bear off */
	to: number;
	/** Whether this move hits an opponent blot */
	isHit?: boolean;
}

/** A complete move (sequence of checker moves for one turn) */
export interface Move {
	checkerMoves: CheckerMove[];
}

export type MatchScore = {
	player: number;
	opponent: number;
	matchLength: number;
};

export interface GameState {
	id: string;
	board: BoardState;
	turn: Player;
	dice: DiceRoll | null;
	/** Whether dice have been rolled this turn */
	diceRolled: boolean;
	moveHistory: MoveRecord[];
	/** Current move number (incremented each turn) */
	moveNumber: number;
	matchScore: MatchScore | null;
	gameOver: boolean;
	winner: Player | null;
	/** Computer difficulty for play mode */
	difficulty: Difficulty;
}

export interface MoveRecord {
	moveNumber: number;
	player: Player;
	dice: DiceRoll;
	move: Move;
	board: BoardState;
}

export type Difficulty = 'beginner' | 'intermediate' | 'strong';

export interface CandidateMoveAnalysis {
	move: Move;
	equity: number;
	/** Win/gammon/backgammon probabilities */
	winProb: number;
	gammonProb: number;
	bgProb: number;
	loseProb: number;
	loseGammonProb: number;
	loseBgProb: number;
}

export interface PositionAnalysis {
	bestMove: CandidateMoveAnalysis;
	playedMove: CandidateMoveAnalysis | null;
	candidates: CandidateMoveAnalysis[];
	equityLoss: number;
	/** Position classification for display */
	positionType: PositionType;
}

export type PositionType =
	| 'race'
	| 'contact'
	| 'blitz'
	| 'holding'
	| 'primeVsPrime'
	| 'backgame'
	| 'unknown';

export type BlunderLevel = 'none' | 'inaccuracy' | 'mistake' | 'blunder' | 'hugeBlunder';

export interface BlunderThresholdConfig {
	/** Preset name */
	preset: 'strict' | 'normal' | 'lenient' | 'custom';
	/** Blunder threshold in equity */
	blunderThreshold: number;
}

export const THRESHOLD_PRESETS: Record<string, number> = {
	strict: 0.04,
	normal: 0.08,
	lenient: 0.15
};

export interface UserSettings {
	blunderConfig: BlunderThresholdConfig;
	difficulty: Difficulty;
	llmProvider: string;
	autoAnalyze: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
	blunderConfig: { preset: 'normal', blunderThreshold: 0.08 },
	difficulty: 'strong',
	llmProvider: 'anthropic',
	autoAnalyze: true
};

/** Bar point constant */
export const BAR = 25;
/** Bear off constant */
export const OFF = 0;
/** Total checkers per player */
export const CHECKERS_PER_PLAYER = 15;
