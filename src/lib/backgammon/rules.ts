import { cloneBoard, allInHomeBoard } from './board.js';
import { BAR, OFF, type BoardState, type CheckerMove, type DiceRoll, type DieValue, type Move } from './types.js';
import { diceValues } from './types.js';

/**
 * Check if a point is open for the player (not blocked by 2+ opponent checkers).
 * Point is 1-indexed.
 */
function isPointOpen(board: BoardState, point: number): boolean {
	if (point < 1 || point > 24) return false;
	return board.points[point - 1] >= -1; // open if no opponent stack
}

/**
 * Apply a single checker move to the board (mutates the board).
 * Returns whether the move was valid.
 */
export function applyCheckerMove(board: BoardState, cm: CheckerMove): boolean {
	if (cm.from === BAR) {
		if (board.playerBar <= 0) return false;
		board.playerBar--;
	} else if (cm.from >= 1 && cm.from <= 24) {
		if (board.points[cm.from - 1] <= 0) return false;
		board.points[cm.from - 1]--;
	} else {
		return false;
	}

	if (cm.to === OFF) {
		board.playerBorneOff++;
	} else if (cm.to >= 1 && cm.to <= 24) {
		// Check for hit
		if (board.points[cm.to - 1] === -1) {
			board.points[cm.to - 1] = 0;
			board.opponentBar++;
			cm.isHit = true;
		}
		board.points[cm.to - 1]++;
	} else {
		return false;
	}

	return true;
}

/**
 * Apply a complete move to the board. Returns the new board state.
 */
export function applyMove(board: BoardState, move: Move): BoardState {
	const newBoard = cloneBoard(board);
	for (const cm of move.checkerMoves) {
		applyCheckerMove(newBoard, { ...cm });
	}
	return newBoard;
}

/**
 * Generate all legal moves for a given board and dice roll.
 * Backgammon rules require using as many dice as possible,
 * and if only one die can be used, the higher one must be used.
 */
export function generateLegalMoves(board: BoardState, roll: DiceRoll): Move[] {
	const dice = diceValues(roll);
	const isDoubles = roll.die1 === roll.die2;

	if (isDoubles) {
		return generateDoubleMoves(board, roll.die1);
	}

	// Try using both dice
	const bothDice = generateMovesForDiceSequence(board, [roll.die1, roll.die2]);
	const bothDiceReversed = generateMovesForDiceSequence(board, [roll.die2, roll.die1]);

	// Only keep moves that actually used both dice
	const allBoth = deduplicateMoves(
		[...bothDice, ...bothDiceReversed].filter(m => m.checkerMoves.length >= 2)
	);

	if (allBoth.length > 0) {
		return allBoth;
	}

	// If we can't use both, try each individually — must use the higher die if possible
	const movesHigh = generateMovesForDiceSequence(board, [Math.max(roll.die1, roll.die2) as DieValue]);
	const movesLow = generateMovesForDiceSequence(board, [Math.min(roll.die1, roll.die2) as DieValue]);

	if (movesHigh.length > 0) return movesHigh;
	if (movesLow.length > 0) return movesLow;

	// No moves possible — forced to pass
	return [{ checkerMoves: [] }];
}

function generateDoubleMoves(board: BoardState, die: DieValue): Move[] {
	// Try all 4, then 3, then 2, then 1
	for (let count = 4; count >= 1; count--) {
		const dice = Array(count).fill(die) as DieValue[];
		const moves = generateMovesForDiceSequence(board, dice);
		// Only keep moves that actually used all dice in this batch
		const fullMoves = moves.filter(m => m.checkerMoves.length >= count);
		if (fullMoves.length > 0) {
			return deduplicateMoves(fullMoves);
		}
	}
	return [{ checkerMoves: [] }];
}

/**
 * Generate moves using dice values in sequence (recursive).
 */
function generateMovesForDiceSequence(board: BoardState, dice: DieValue[]): Move[] {
	if (dice.length === 0) return [{ checkerMoves: [] }];

	const die = dice[0];
	const remainingDice = dice.slice(1);
	const results: Move[] = [];

	const singleMoves = generateSingleDieMoves(board, die);

	if (singleMoves.length === 0) {
		// Can't use this die; try remaining
		if (remainingDice.length > 0) {
			return generateMovesForDiceSequence(board, remainingDice);
		}
		return [];
	}

	for (const cm of singleMoves) {
		const newBoard = cloneBoard(board);
		applyCheckerMove(newBoard, { ...cm });

		const continuations = generateMovesForDiceSequence(newBoard, remainingDice);
		if (continuations.length === 0) {
			results.push({ checkerMoves: [cm] });
		} else {
			for (const cont of continuations) {
				results.push({ checkerMoves: [cm, ...cont.checkerMoves] });
			}
		}
	}

	return results;
}

/**
 * Generate all legal single-checker-moves for one die value.
 */
function generateSingleDieMoves(board: BoardState, die: DieValue): CheckerMove[] {
	const moves: CheckerMove[] = [];

	// Must enter from bar first
	if (board.playerBar > 0) {
		const target = 25 - die; // entering from opponent's home board
		if (isPointOpen(board, target)) {
			moves.push({ from: BAR, to: target });
		}
		return moves; // If on bar, must enter — no other moves allowed
	}

	const canBearOff = allInHomeBoard(board, 'player');

	for (let point = 1; point <= 24; point++) {
		if (board.points[point - 1] <= 0) continue; // no player checker here

		const target = point - die; // moving toward point 1 / off

		if (target >= 1) {
			if (isPointOpen(board, target)) {
				moves.push({ from: point, to: target });
			}
		} else if (target === 0 && canBearOff) {
			// Exact bear off
			moves.push({ from: point, to: OFF });
		} else if (target < 0 && canBearOff) {
			// Bearing off from a higher point — only if no checkers on higher points
			let hasHigher = false;
			for (let p = point + 1; p <= 6; p++) {
				if (board.points[p - 1] > 0) {
					hasHigher = true;
					break;
				}
			}
			if (!hasHigher) {
				moves.push({ from: point, to: OFF });
			}
		}
	}

	return moves;
}

/**
 * Deduplicate moves that produce the same result regardless of checker order.
 */
function deduplicateMoves(moves: Move[]): Move[] {
	const seen = new Set<string>();
	const result: Move[] = [];

	for (const move of moves) {
		const key = move.checkerMoves
			.map((cm) => `${cm.from}-${cm.to}`)
			.sort()
			.join(',');
		if (!seen.has(key)) {
			seen.add(key);
			result.push(move);
		}
	}

	return result;
}

/**
 * Check if a specific move is legal.
 */
export function isMoveLegal(board: BoardState, roll: DiceRoll, move: Move): boolean {
	const legalMoves = generateLegalMoves(board, roll);
	const moveKey = move.checkerMoves
		.map((cm) => `${cm.from}-${cm.to}`)
		.sort()
		.join(',');

	return legalMoves.some((lm) => {
		const key = lm.checkerMoves
			.map((cm) => `${cm.from}-${cm.to}`)
			.sort()
			.join(',');
		return key === moveKey;
	});
}

/**
 * Format a move in human-readable notation.
 * e.g., "24/18 13/11"
 */
export function formatMove(move: Move): string {
	if (move.checkerMoves.length === 0) return 'Cannot move';
	return move.checkerMoves
		.map((cm) => {
			const from = cm.from === BAR ? 'bar' : cm.from.toString();
			const to = cm.to === OFF ? 'off' : cm.to.toString();
			const hit = cm.isHit ? '*' : '';
			return `${from}/${to}${hit}`;
		})
		.join(' ');
}
