import { spawn } from 'child_process';
import type { BoardState, CandidateMoveAnalysis, DiceRoll, Move, PositionAnalysis, PositionType, CheckerMove } from '$lib/backgammon/types.js';
import { BAR, OFF } from '$lib/backgammon/types.js';
import { generateLegalMoves, applyMove } from '$lib/backgammon/rules.js';
import { flipBoard } from '$lib/backgammon/board.js';
import { env } from '$env/dynamic/private';

const GNUBG_PATH = () => env.GNU_BG_PATH || 'gnubg';
const GNUBG_TIMEOUT = 30_000; // 30 seconds

interface GnubgConfig {
	/** Number of candidates to return */
	numCandidates?: number;
	/** Whether to include rollout data */
	rollout?: boolean;
	/** Ply depth for evaluation */
	ply?: number;
}

const DEFAULT_CONFIG: GnubgConfig = {
	numCandidates: 10,
	rollout: false,
	ply: 2
};

/**
 * Adapter for invoking GNU Backgammon as a subprocess.
 * All interaction with the engine goes through this module.
 */
export class GnubgAdapter {
	private config: GnubgConfig;

	constructor(config: Partial<GnubgConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Analyze a position: given a board state and dice roll,
	 * return the best move and candidate moves with equity values.
	 */
	async analyzePosition(
		board: BoardState,
		dice: DiceRoll,
		playedMove?: Move
	): Promise<PositionAnalysis> {
		const commands = this.buildAnalysisCommands(board, dice);
		const output = await this.execute(commands);
		const analysis = this.parseAnalysisOutput(output, board, dice, playedMove);

		// If the played move wasn't found among candidates, evaluate the resulting position
		if (playedMove && !analysis.playedMove && analysis.candidates.length > 0) {
			try {
				const boardAfterMove = applyMove(board, playedMove);
				// After the player moves, it's the opponent's turn.
				// Flip the board so gnubg evaluates from the opponent's perspective,
				// then negate to get the player's equity.
				const flippedBoard = flipBoard(boardAfterMove);
				const oppEquity = await this.evaluatePositionEquity(flippedBoard);
				const playerEquity = -oppEquity;
				analysis.equityLoss = Math.max(0, analysis.bestMove.equity - playerEquity);
				console.info(
					`Played move not in candidates — evaluated position. ` +
					`Best equity: ${analysis.bestMove.equity.toFixed(3)}, ` +
					`Played position equity: ${playerEquity.toFixed(3)}, ` +
					`Loss: ${analysis.equityLoss.toFixed(3)}`
				);
			} catch (err) {
				console.warn('Position evaluation fallback failed:', err);
			}
		}

		return analysis;
	}

	/**
	 * Get the computer's move for a given position.
	 */
	async getComputerMove(board: BoardState, dice: DiceRoll): Promise<Move> {
		const analysis = await this.analyzePosition(board, dice);
		return analysis.bestMove.move;
	}

	/**
	 * Evaluate a position's equity (no dice — static position evaluation).
	 * Returns equity from the perspective of the player on roll.
	 */
	async evaluatePositionEquity(board: BoardState): Promise<number> {
		const lines: string[] = [
			'set automatic game off',
			'set automatic roll off',
			`set evaluation chequerplay evaluation plies ${this.config.ply}`,
		];
		lines.push(this.boardToGnubgSetup(board));
		lines.push('set turn 1');
		lines.push('eval');
		lines.push('quit');

		const output = await this.execute(lines.join('\n'));
		return parseEvalOutput(output);
	}

	/**
	 * Build the command sequence for gnubg.
	 */
	private buildAnalysisCommands(board: BoardState, dice: DiceRoll): string {
		const lines: string[] = [
			'set automatic game off',
			'set automatic roll off',
			`set evaluation chequerplay evaluation plies ${this.config.ply}`,
		];

		// Set up the board position and ensure it's the player's turn
		lines.push(this.boardToGnubgSetup(board));
		lines.push('set turn 1');
		lines.push(`set dice ${dice.die1} ${dice.die2}`);
		lines.push('hint');
		lines.push('quit');

		return lines.join('\n');
	}

	/**
	 * Convert board state to gnubg commands to set up the position.
	 * Uses gnubg's "simple" board format:
	 *   set board simple <26 numbers>
	 * where positions are: bar-player, point1..point24, bar-opponent
	 * Positive = player (X), negative = opponent (O).
	 */
	private boardToGnubgSetup(board: BoardState): string {
		const lines: string[] = ['new game'];

		// gnubg simple format: bar-player, point1..point24, bar-opponent
		// Our board: points[0]=point1, points[23]=point24
		// Positive = player, negative = opponent (same as gnubg)
		const values: number[] = [
			board.playerBar,
			...board.points,
			-board.opponentBar
		];

		lines.push(`set board simple ${values.join(' ')}`);

		return lines.join('\n');
	}

	/**
	 * Execute gnubg commands and return output.
	 */
	private async execute(commands: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				proc.kill();
				reject(new Error(`GNU Backgammon timed out after ${GNUBG_TIMEOUT}ms`));
			}, GNUBG_TIMEOUT);

			const proc = spawn(GNUBG_PATH(), ['--tty', '-q'], {
				stdio: ['pipe', 'pipe', 'pipe']
			});

			let stdout = '';
			let stderr = '';

			proc.stdout.on('data', (data) => {
				stdout += String(data);
			});

			proc.stderr.on('data', (data) => {
				stderr += String(data);
			});

			proc.on('close', (code) => {
				clearTimeout(timer);
				if (code !== 0 && !stdout) {
					reject(new Error(`GNU Backgammon exited with code ${code}: ${stderr}`));
				} else {
					resolve(stdout);
				}
			});

			proc.on('error', (err) => {
				clearTimeout(timer);
				reject(new Error(`Failed to start GNU Backgammon: ${err.message}`));
			});

			proc.stdin.write(commands);
			proc.stdin.end();
		});
	}

	/**
	 * Parse the hint output from gnubg.
	 */
	private parseAnalysisOutput(output: string, board: BoardState, dice: DiceRoll, playedMove?: Move): PositionAnalysis {
		const candidates = parseHintOutput(output, dice);

		// Resolve move alternatives against legal moves
		const legalMoves = generateLegalMoves(board, dice);
		for (const candidate of candidates) {
			if (candidate.moveAlternatives && candidate.moveAlternatives.length > 1) {
				const resolved = resolveAlternative(candidate.moveAlternatives, legalMoves);
				if (resolved) {
					candidate.move = resolved;
				}
			}
			delete candidate.moveAlternatives;
		}

		if (candidates.length === 0) {
			// Check if this is genuinely a position with no legal moves
			const legalMoves = generateLegalMoves(board, dice);
			if (legalMoves.length === 0) {
				// Forced pass — no moves possible
				const emptyCandidate = createEmptyCandidate();
				return {
					bestMove: emptyCandidate,
					playedMove: emptyCandidate,
					candidates: [emptyCandidate],
					equityLoss: 0,
					positionType: 'unknown'
				};
			}
			// gnubg failed to produce output — log and return graceful result
			console.warn('GNU Backgammon returned no candidate moves for a position with legal moves. Output:', output.slice(0, 500));
			const emptyCandidate = createEmptyCandidate();
			return {
				bestMove: emptyCandidate,
				playedMove: null,
				candidates: [],
				equityLoss: 0,
				positionType: 'unknown'
			};
		}

		const bestMove = candidates[0];
		let playedMoveAnalysis: CandidateMoveAnalysis | null = null;
		let equityLoss = 0;

		if (playedMove) {
			playedMoveAnalysis = findMatchingCandidate(candidates, playedMove, board) || null;
			if (playedMoveAnalysis) {
				equityLoss = bestMove.equity - playedMoveAnalysis.equity;
			}
		}

		return {
			bestMove,
			playedMove: playedMoveAnalysis,
			candidates,
			equityLoss: Math.max(0, equityLoss),
			positionType: 'unknown'
		};
	}
}

/**
 * Parse gnubg hint output into candidate moves.
 * Actual gnubg output format:
 *   1. Cubeful 0-ply    8/5 6/5                      Eq.: +0.060
 *      0.517 0.145 0.006 - 0.483 0.132 0.006
 */
function parseHintOutput(output: string, dice: DiceRoll): CandidateWithAlternatives[] {
	const candidates: CandidateWithAlternatives[] = [];
	const lines = output.split('\n');

	// Match: "  1. Cubeful 0-ply    8/5 6/5    Eq.: +0.060"
	const moveLineRegex = /^\s*(\d+)\.\s+\S+\s+\S+\s+(.+?)\s+Eq\.:\s+([+-]?\d+\.\d+)/;
	// Match: "  0.517 0.145 0.006 - 0.483 0.132 0.006"
	const probLineRegex = /^\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+-\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)/;

	let currentCandidate: Partial<CandidateWithAlternatives> | null = null;

	for (const line of lines) {
		const moveMatch = line.match(moveLineRegex);
		if (moveMatch) {
			if (currentCandidate) {
				candidates.push(fillCandidate(currentCandidate));
			}
			const moveNotation = moveMatch[2].trim();
			const moveAlternatives = parseMoveNotation(moveNotation, dice);
			const validMove = moveAlternatives.find(m => m.checkerMoves.length > 0) || moveAlternatives[0];
			if (validMove.checkerMoves.length === 0) {
				console.warn(`Failed to parse gnubg move notation: "${moveNotation}" with dice ${dice.die1}-${dice.die2}`);
			}
			currentCandidate = {
				move: validMove,
				moveAlternatives,
				equity: parseFloat(moveMatch[3])
			};
			continue;
		}

		if (currentCandidate) {
			const probMatch = line.match(probLineRegex);
			if (probMatch) {
				currentCandidate.winProb = parseFloat(probMatch[1]);
				currentCandidate.gammonProb = parseFloat(probMatch[2]);
				currentCandidate.bgProb = parseFloat(probMatch[3]);
				currentCandidate.loseProb = parseFloat(probMatch[4]);
				currentCandidate.loseGammonProb = parseFloat(probMatch[5]);
				currentCandidate.loseBgProb = parseFloat(probMatch[6]);
			}
		}
	}

	if (currentCandidate) {
		candidates.push(fillCandidate(currentCandidate));
	}

	return candidates;
}

type CandidateWithAlternatives = CandidateMoveAnalysis & { moveAlternatives?: Move[] };

function fillCandidate(partial: Partial<CandidateWithAlternatives>): CandidateWithAlternatives {
	const w = partial.winProb ?? 0.5;
	const g = partial.gammonProb ?? 0;
	const bg = partial.bgProb ?? 0;
	const l = partial.loseProb ?? 0.5;
	const lg = partial.loseGammonProb ?? 0;
	const lbg = partial.loseBgProb ?? 0;
	// Use cubeless equity (computed from probabilities) instead of gnubg's cubeful Eq.
	// Cubeful equity caps at ±1.000, hiding real differences between moves in lopsided positions.
	const cubelessEquity = w + g + bg - l - lg - lbg;
	return {
		move: partial.move || { checkerMoves: [] },
		equity: cubelessEquity,
		winProb: w,
		gammonProb: g,
		bgProb: bg,
		loseProb: l,
		loseGammonProb: lg,
		loseBgProb: lbg,
		moveAlternatives: partial.moveAlternatives
	};
}

/**
 * Parse a move notation string like "24/18 13/11" or "8/7(2) 6/5(2)" into a Move object.
 * The (N) suffix means "repeat this move N times" (used for doubles).
 * Combined moves like "24/13" (using both dice 6+5) are expanded into individual steps.
 * Returns multiple candidate expansions when a combined move can be decomposed in different orderings.
 */
/** @internal — exported for testing */
export function parseMoveNotation(notation: string, dice: DiceRoll): Move[] {
	const parts = notation.split(/\s+/);

	// Parse raw parts first
	interface RawPart { from: number; to: number; isHit: boolean; count: number; }
	const rawParts: RawPart[] = [];

	for (const part of parts) {
		// Handle chained notation like "13/10*/9" → [{13,10,hit}, {10,9}]
		// Also handles simple "13/10*", "bar/20", "6/off", "13/7(2)"
		const chainMatch = part.match(/^(bar|\d+)((?:\/(?:off|\d+)\*?)+)(?:\((\d+)\))?$/i);
		if (chainMatch) {
			const startPoint = chainMatch[1].toLowerCase() === 'bar' ? BAR : parseInt(chainMatch[1]);
			const segments = chainMatch[2].match(/\/(off|\d+)(\*)?/gi) || [];
			const count = chainMatch[3] ? parseInt(chainMatch[3]) : 1;

			// Parse chain segments
			interface ChainSeg { from: number; to: number; isHit: boolean; }
			const chainSegs: ChainSeg[] = [];
			let currentFrom = startPoint;
			for (const seg of segments) {
				const segMatch = seg.match(/\/(off|\d+)(\*)?/i);
				if (!segMatch) continue;
				const to = segMatch[1].toLowerCase() === 'off' ? OFF : parseInt(segMatch[1]);
				const isHit = !!segMatch[2];
				chainSegs.push({ from: currentFrom, to, isHit });
				currentFrom = to;
			}

			// For count > 1 (e.g., "6/1(2)"), repeat the entire chain
			for (let c = 0; c < count; c++) {
				for (const seg of chainSegs) {
					rawParts.push({ from: seg.from, to: seg.to, isHit: seg.isHit, count: 1 });
				}
			}
		}
	}

	const diceVals = dice.die1 === dice.die2
		? [dice.die1, dice.die1, dice.die1, dice.die1]
		: [dice.die1, dice.die2];

	// Expand each part, collecting all possible expansions
	let expansions: CheckerMove[][] = [[]];

	for (const raw of rawParts) {
		for (let i = 0; i < raw.count; i++) {
			const isHit = raw.isHit && i === 0;
			const distance = raw.to === OFF ? raw.from : raw.from - raw.to;
			const alternatives = expandCombinedMove(raw.from, raw.to, distance, isHit, diceVals);

			const newExpansions: CheckerMove[][] = [];
			for (const existing of expansions) {
				for (const alt of alternatives) {
					newExpansions.push([...existing, ...alt]);
				}
			}
			expansions = newExpansions;
		}
	}

	return expansions.map(cms => ({ checkerMoves: cms }));
}

/**
 * Expand a combined gnubg move into individual die steps.
 * Returns multiple alternatives when there are different valid orderings.
 * e.g., "24/13" with dice 6,5 → [[{24,18}, {18,13}], [{24,19}, {19,13}]]
 */
function expandCombinedMove(
	from: number,
	to: number,
	distance: number,
	isHit: boolean,
	diceValues: number[]
): CheckerMove[][] {
	// If it matches a single die value, it's already a single step
	if (diceValues.includes(distance)) {
		return [[{ from, to, isHit }]];
	}
	// Bear-off with a single die: exact match or higher die
	// e.g., "4/off" with die 6 (6 > 4), or "3/off" with die 3
	if (to === OFF && diceValues.some(d => d >= from)) {
		return [[{ from, to: OFF, isHit }]];
	}

	const alternatives: CheckerMove[][] = [];

	// For non-doubles: try both orderings
	if (diceValues.length >= 2 && diceValues[0] !== diceValues[1]) {
		const d1 = diceValues[0];
		const d2 = diceValues[1];

		// Bear-off using both dice combined: e.g., "6/off" with dice 1-5 → 6/5, 5/off
		// This handles cases where neither single die can bear off the checker
		if (to === OFF) {
			// Try each die as the first step, bear off with the other
			const mid1 = from - d1;
			if (mid1 >= 1) {
				alternatives.push([
					{ from, to: mid1, isHit: false },
					{ from: mid1, to: OFF, isHit }
				]);
			}
			const mid2 = from - d2;
			if (mid2 >= 1 && mid2 !== mid1) {
				alternatives.push([
					{ from, to: mid2, isHit: false },
					{ from: mid2, to: OFF, isHit }
				]);
			}
		} else if (d1 + d2 === distance) {
			const mid1 = from - d1;
			if (mid1 > 0 && mid1 <= 24) {
				alternatives.push([
					{ from, to: mid1, isHit: false },
					{ from: mid1, to, isHit }
				]);
			}
			const mid2 = from - d2;
			if (mid2 > 0 && mid2 <= 24 && mid2 !== mid1) {
				alternatives.push([
					{ from, to: mid2, isHit: false },
					{ from: mid2, to, isHit }
				]);
			}
		}
	}

	// For doubles: use multiple dice for one checker
	if (diceValues.length >= 2 && diceValues[0] === diceValues[1]) {
		const die = diceValues[0];
		if (to === OFF) {
			// Bearing off with doubles: step down by die until we can bear off
			// e.g., "4/off" with dice 3-3 → 4/1, 1/off
			const moves: CheckerMove[] = [];
			let pos = from;
			let usedDice = 0;
			while (pos > 0 && usedDice < diceValues.length) {
				const next = pos - die;
				if (next <= 0) {
					// This step bears off (exact or higher die)
					moves.push({ from: pos, to: OFF, isHit: isHit && usedDice === 0 });
					usedDice++;
					break;
				}
				moves.push({ from: pos, to: next, isHit: false });
				pos = next;
				usedDice++;
			}
			if (moves.length > 0) {
				alternatives.push(moves);
			}
		} else {
			const steps = Math.round(distance / die);
			if (steps * die === distance && steps <= diceValues.length) {
				const moves: CheckerMove[] = [];
				let pos = from;
				for (let i = 0; i < steps; i++) {
					const next = pos - die;
					moves.push({
						from: pos,
						to: next,
						isHit: isHit && i === steps - 1
					});
					pos = next;
				}
				alternatives.push(moves);
			}
		}
	}

	// Fallback: return as-is
	if (alternatives.length === 0) {
		alternatives.push([{ from, to, isHit }]);
	}

	return alternatives;
}

/**
 * Resolve which move alternative matches a legal move.
 */
function resolveAlternative(alternatives: Move[], legalMoves: Move[]): Move | null {
	const legalKeys = new Set(
		legalMoves.map(m =>
			m.checkerMoves.map(cm => `${cm.from}-${cm.to}`).sort().join(',')
		)
	);

	for (const alt of alternatives) {
		const key = alt.checkerMoves.map(cm => `${cm.from}-${cm.to}`).sort().join(',');
		if (legalKeys.has(key)) {
			return alt;
		}
	}
	return null;
}

function boardKey(board: BoardState): string {
	return `${board.points.join(',')}|${board.playerBar}|${board.opponentBar}|${board.playerBorneOff}|${board.opponentBorneOff}`;
}

function findMatchingCandidate(
	candidates: CandidateMoveAnalysis[],
	move: Move,
	board?: BoardState
): CandidateMoveAnalysis | undefined {
	// First try exact checker move match (sorted)
	const moveKey = move.checkerMoves
		.map((cm) => `${cm.from}-${cm.to}`)
		.sort()
		.join(',');

	const exact = candidates.find((c) => {
		const key = c.move.checkerMoves
			.map((cm) => `${cm.from}-${cm.to}`)
			.sort()
			.join(',');
		return key === moveKey;
	});
	if (exact) return exact;

	// Fall back to comparing resulting board states
	if (board) {
		const playedBoard = boardKey(applyMove(board, move));
		return candidates.find((c) => {
			if (c.move.checkerMoves.length === 0) return false;
			try {
				return boardKey(applyMove(board, c.move)) === playedBoard;
			} catch {
				return false;
			}
		});
	}

	return undefined;
}

/**
 * Parse gnubg `eval` output to extract equity.
 * Tries to find an explicit equity line, then falls back to computing from probabilities.
 */
function parseEvalOutput(output: string): number {
	// Look for explicit equity line: "Eq.: +0.060" or "Cubeful eq.: +0.060"
	const eqMatch = output.match(/[Ee]q\.?:?\s*([+-]?\d+\.\d+)/);
	if (eqMatch) {
		return parseFloat(eqMatch[1]);
	}

	// Compute from win/gammon/backgammon probabilities
	// Format: "0.517 0.145 0.006 - 0.483 0.132 0.006"
	const probRegex = /(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+-\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)/;
	const probMatch = output.match(probRegex);
	if (probMatch) {
		const w = parseFloat(probMatch[1]);
		const g = parseFloat(probMatch[2]);
		const bg = parseFloat(probMatch[3]);
		const l = parseFloat(probMatch[4]);
		const lg = parseFloat(probMatch[5]);
		const lbg = parseFloat(probMatch[6]);
		// Cubeless equity: W + G + BG - L - LG - LBG
		return w + g + bg - l - lg - lbg;
	}

	throw new Error(`Could not parse gnubg eval output: ${output.slice(0, 200)}`);
}

function createEmptyCandidate(): CandidateMoveAnalysis {
	return {
		move: { checkerMoves: [] },
		equity: 0,
		winProb: 0.5,
		gammonProb: 0,
		bgProb: 0,
		loseProb: 0.5,
		loseGammonProb: 0,
		loseBgProb: 0
	};
}

/** Singleton adapter for convenience */
let _adapter: GnubgAdapter | null = null;
export function getGnubgAdapter(config?: Partial<GnubgConfig>): GnubgAdapter {
	if (!_adapter || config) {
		_adapter = new GnubgAdapter(config);
	}
	return _adapter;
}
