import { describe, it, expect } from 'vitest';
import { initialBoard, cloneBoard, flipBoard, pipCount, countCheckers, allInHomeBoard, isGameOver, validateBoard } from '$lib/backgammon/board.js';

describe('initialBoard', () => {
	it('creates a valid starting position', () => {
		const board = initialBoard();
		expect(board.points).toHaveLength(24);
		expect(board.playerBar).toBe(0);
		expect(board.opponentBar).toBe(0);
		expect(board.playerBorneOff).toBe(0);
		expect(board.opponentBorneOff).toBe(0);
	});

	it('has correct checker counts', () => {
		const board = initialBoard();
		expect(countCheckers(board, 'player')).toBe(15);
		expect(countCheckers(board, 'opponent')).toBe(15);
	});

	it('validates correctly', () => {
		const board = initialBoard();
		expect(validateBoard(board)).toBe(true);
	});
});

describe('cloneBoard', () => {
	it('creates an independent copy', () => {
		const board = initialBoard();
		const clone = cloneBoard(board);
		clone.points[0] = 99;
		expect(board.points[0]).toBe(-2);
	});
});

describe('flipBoard', () => {
	it('swaps player and opponent perspectives', () => {
		const board = initialBoard();
		const flipped = flipBoard(board);

		// Point 1 in original has -2 (opponent). After flip, point 24 should have 2 (player).
		expect(flipped.points[23]).toBe(2);
		// Point 24 in original has 2 (player). After flip, point 1 should have -2 (opponent).
		expect(flipped.points[0]).toBe(-2);
	});

	it('preserves checker counts after flip', () => {
		const board = initialBoard();
		const flipped = flipBoard(board);
		expect(countCheckers(flipped, 'player')).toBe(15);
		expect(countCheckers(flipped, 'opponent')).toBe(15);
	});
});

describe('pipCount', () => {
	it('calculates correct starting pip count', () => {
		const board = initialBoard();
		// Standard starting pip count is 167 for each player
		expect(pipCount(board, 'player')).toBe(167);
		expect(pipCount(board, 'opponent')).toBe(167);
	});
});

describe('allInHomeBoard', () => {
	it('returns false for starting position', () => {
		const board = initialBoard();
		expect(allInHomeBoard(board, 'player')).toBe(false);
	});

	it('returns true when all checkers are in home board', () => {
		const board = initialBoard();
		board.points.fill(0);
		board.points[0] = 5; // point 1
		board.points[2] = 5; // point 3
		board.points[4] = 5; // point 5
		expect(allInHomeBoard(board, 'player')).toBe(true);
	});
});

describe('isGameOver', () => {
	it('returns null for starting position', () => {
		expect(isGameOver(initialBoard())).toBeNull();
	});

	it('detects player win', () => {
		const board = initialBoard();
		board.points.fill(0);
		board.playerBorneOff = 15;
		expect(isGameOver(board)).toBe('player');
	});
});
