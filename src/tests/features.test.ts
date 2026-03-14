import { describe, it, expect } from 'vitest';
import { extractFeatures, classifyPosition, compareFeatures } from '$lib/features/extract.js';
import { initialBoard, cloneBoard } from '$lib/backgammon/board.js';
import type { BoardState } from '$lib/backgammon/types.js';

describe('extractFeatures', () => {
	it('extracts features from starting position', () => {
		const board = initialBoard();
		const features = extractFeatures(board);

		expect(features.playerPipCount).toBe(167);
		expect(features.opponentPipCount).toBe(167);
		expect(features.pipDifference).toBe(0);
		expect(features.playerBarCheckers).toBe(0);
		expect(features.opponentBarCheckers).toBe(0);
		expect(features.playerBorneOff).toBe(0);
		expect(features.opponentBorneOff).toBe(0);
	});

	it('counts blots correctly', () => {
		const board = cloneBoard(initialBoard());
		// Add a blot on point 10
		board.points[9] = 1;
		board.points[7] = 2; // adjust point 8 down to keep valid

		const features = extractFeatures(board);
		expect(features.playerBlotCount).toBeGreaterThan(0);
	});

	it('counts made points correctly', () => {
		const board = initialBoard();
		const features = extractFeatures(board);

		// Starting position: player has made points at 6, 8, 13, 24
		// (points with 2+ player checkers)
		expect(features.playerMadePoints).toBe(4);
	});

	it('measures home board strength', () => {
		const board = initialBoard();
		const features = extractFeatures(board);

		// Starting: only point 6 (index 5) has 5 checkers in home board
		expect(features.playerHomeBoardStrength).toBe(1);
	});
});

describe('classifyPosition', () => {
	it('classifies starting position as holding (has anchor on 24-point)', () => {
		const board = initialBoard();
		const type = classifyPosition(board);
		// Starting position has an anchor on point 24 (opponent's home board)
		expect(type).toBe('holding');
	});

	it('classifies a race position', () => {
		const board = cloneBoard(initialBoard());
		board.points.fill(0);
		// Player all in home board
		board.points[0] = 5;
		board.points[2] = 5;
		board.points[4] = 5;
		// Opponent all in their home board
		board.points[19] = -5;
		board.points[21] = -5;
		board.points[23] = -5;

		const type = classifyPosition(board);
		expect(type).toBe('race');
	});
});

describe('compareFeatures', () => {
	it('computes deltas between two positions', () => {
		const board1 = initialBoard();
		const board2 = cloneBoard(board1);
		// Move a checker to create a blot
		board2.points[7] = 2;  // point 8: 3->2
		board2.points[9] = 1;  // point 10: 0->1 (blot)

		const comparison = compareFeatures(board1, board2);

		expect(comparison.playedFeatures).toBeDefined();
		expect(comparison.bestFeatures).toBeDefined();
		expect(comparison.deltas.length).toBeGreaterThan(0);
	});
});
