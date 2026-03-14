import { describe, it, expect } from 'vitest';
import { initialBoard, cloneBoard } from '$lib/backgammon/board.js';
import { generateLegalMoves, isMoveLegal, applyMove, formatMove } from '$lib/backgammon/rules.js';
import type { DiceRoll, Move, BoardState } from '$lib/backgammon/types.js';

describe('generateLegalMoves', () => {
	it('generates moves for opening 31', () => {
		const board = initialBoard();
		const dice: DiceRoll = { die1: 3, die2: 1 };
		const moves = generateLegalMoves(board, dice);

		expect(moves.length).toBeGreaterThan(0);

		// All moves should have 2 checker moves (using both dice)
		for (const move of moves) {
			expect(move.checkerMoves.length).toBe(2);
		}
	});

	it('generates moves for doubles', () => {
		const board = initialBoard();
		const dice: DiceRoll = { die1: 6, die2: 6 };
		const moves = generateLegalMoves(board, dice);

		expect(moves.length).toBeGreaterThan(0);
	});

	it('returns pass when no moves possible', () => {
		const board = initialBoard();
		// Put player on bar with opponent holding all entry points
		board.points.fill(0);
		board.playerBar = 1;
		// Block all entry points (points 19-24 from player perspective = indices 18-23)
		for (let i = 18; i < 24; i++) {
			board.points[i] = -2;
		}
		// Remaining player checkers
		board.points[5] = 14;

		const dice: DiceRoll = { die1: 3, die2: 1 };
		const moves = generateLegalMoves(board, dice);

		expect(moves).toHaveLength(1);
		expect(moves[0].checkerMoves).toHaveLength(0); // forced pass
	});

	it('forces bar entry before other moves', () => {
		const board = initialBoard();
		board.playerBar = 1;
		board.points[5] = 4; // reduce from 5 to keep 15 checkers

		const dice: DiceRoll = { die1: 3, die2: 1 };
		const moves = generateLegalMoves(board, dice);

		// Every move must start from the bar
		for (const move of moves) {
			expect(move.checkerMoves[0].from).toBe(25); // BAR
		}
	});
});

describe('isMoveLegal', () => {
	it('accepts a valid opening move', () => {
		const board = initialBoard();
		const dice: DiceRoll = { die1: 3, die2: 1 };
		// 8/5 6/5 — making the 5 point
		const move: Move = {
			checkerMoves: [
				{ from: 8, to: 5 },
				{ from: 6, to: 5 }
			]
		};
		expect(isMoveLegal(board, dice, move)).toBe(true);
	});

	it('rejects an invalid move', () => {
		const board = initialBoard();
		const dice: DiceRoll = { die1: 3, die2: 1 };
		// Can't move to a blocked point
		const move: Move = {
			checkerMoves: [
				{ from: 24, to: 21 },
				{ from: 21, to: 20 } // point 20 doesn't exist in starting position context
			]
		};
		// This might or might not be legal depending on what's at those points
		// Let's use a definitely invalid move
		const badMove: Move = {
			checkerMoves: [
				{ from: 1, to: -2 } // nonsensical
			]
		};
		expect(isMoveLegal(board, dice, badMove)).toBe(false);
	});
});

describe('applyMove', () => {
	it('correctly applies a move', () => {
		const board = initialBoard();
		const move: Move = {
			checkerMoves: [
				{ from: 8, to: 5 },
				{ from: 6, to: 5 }
			]
		};
		const newBoard = applyMove(board, move);

		// Point 5 (index 4) starts at 0, gains 2 checkers = 2
		expect(newBoard.points[4]).toBe(2);
		// Point 8 (index 7) starts at 3, loses 1 = 2
		expect(newBoard.points[7]).toBe(2);
		// Point 6 (index 5) starts at 5, loses 1 = 4
		expect(newBoard.points[5]).toBe(4);
	});

	it('handles hitting', () => {
		const board = cloneBoard(initialBoard());
		// Put an opponent blot on point 5
		board.points[4] = -1;
		board.points[5] = 4; // adjust to keep 15 checkers valid

		const move: Move = {
			checkerMoves: [{ from: 8, to: 5 }]
		};

		const newBoard = applyMove(board, move);
		expect(newBoard.points[4]).toBe(1); // player now occupies
		expect(newBoard.opponentBar).toBe(1); // opponent hit to bar
	});

	it('does not mutate original board', () => {
		const board = initialBoard();
		const original = cloneBoard(board);
		const move: Move = {
			checkerMoves: [{ from: 8, to: 5 }]
		};
		applyMove(board, move);
		expect(board.points).toEqual(original.points);
	});
});

describe('formatMove', () => {
	it('formats a standard move', () => {
		const move: Move = {
			checkerMoves: [
				{ from: 24, to: 18 },
				{ from: 13, to: 11 }
			]
		};
		expect(formatMove(move)).toBe('24/18 13/11');
	});

	it('formats bar entry', () => {
		const move: Move = {
			checkerMoves: [{ from: 25, to: 22 }]
		};
		expect(formatMove(move)).toBe('bar/22');
	});

	it('formats bear off', () => {
		const move: Move = {
			checkerMoves: [{ from: 3, to: 0 }]
		};
		expect(formatMove(move)).toBe('3/off');
	});

	it('formats empty move', () => {
		expect(formatMove({ checkerMoves: [] })).toBe('Cannot move');
	});
});

describe('bearing off', () => {
	it('allows exact bear off', () => {
		const board = initialBoard();
		board.points.fill(0);
		board.points[0] = 3;  // point 1
		board.points[1] = 3;  // point 2
		board.points[2] = 3;  // point 3
		board.points[3] = 3;  // point 4
		board.points[4] = 3;  // point 5
		// 15 checkers in home board

		const dice: DiceRoll = { die1: 3, die2: 1 };
		const moves = generateLegalMoves(board, dice);

		// Should be able to bear off from point 3 and point 1
		const bearOffMove = moves.find(
			(m) =>
				m.checkerMoves.some((cm) => cm.to === 0 && cm.from === 3) &&
				m.checkerMoves.some((cm) => cm.to === 0 && cm.from === 1)
		);
		expect(bearOffMove).toBeDefined();
	});
});
