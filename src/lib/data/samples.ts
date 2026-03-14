/**
 * Sample positions for the review mode.
 */

import type { BoardState, DiceRoll } from '$lib/backgammon/types.js';

export interface SamplePosition {
	name: string;
	description: string;
	board: BoardState;
	dice: DiceRoll;
}

export const SAMPLE_POSITIONS: SamplePosition[] = [
	{
		name: 'Opening 31',
		description: 'Standard opening position with a 3-1 roll',
		board: {
			points: [
				-2, 0, 0, 0, 0, 5, // 1-6
				0, 3, 0, 0, 0, -5,  // 7-12
				5, 0, 0, 0, -3, 0,  // 13-18
				-5, 0, 0, 0, 0, 2   // 19-24
			],
			playerBar: 0,
			opponentBar: 0,
			playerBorneOff: 0,
			opponentBorneOff: 0,
			cubeValue: 1,
			cubeOwner: null
		},
		dice: { die1: 3, die2: 1 }
	},
	{
		name: 'Opening 64',
		description: 'Standard opening position with a 6-4 roll — run or split?',
		board: {
			points: [
				-2, 0, 0, 0, 0, 5,
				0, 3, 0, 0, 0, -5,
				5, 0, 0, 0, -3, 0,
				-5, 0, 0, 0, 0, 2
			],
			playerBar: 0,
			opponentBar: 0,
			playerBorneOff: 0,
			opponentBorneOff: 0,
			cubeValue: 1,
			cubeOwner: null
		},
		dice: { die1: 6, die2: 4 }
	},
	{
		name: 'Blitz position',
		description: 'Strong home board, opponent on the bar',
		board: {
			points: [
				-1, 3, 3, 2, 3, 2, // 1-6 (strong home board)
				0, 0, 0, 0, -2, -4, // 7-12
				2, 0, 0, 0, -3, 0,  // 13-18
				-4, 0, 0, 0, 0, 0   // 19-24
			],
			playerBar: 0,
			opponentBar: 1,
			playerBorneOff: 0,
			opponentBorneOff: 0,
			cubeValue: 1,
			cubeOwner: null
		},
		dice: { die1: 5, die2: 5 }
	},
	{
		name: 'Race position',
		description: 'Pure race — optimize pip count',
		board: {
			points: [
				0, 2, 3, 3, 4, 3,  // 1-6
				0, 0, 0, 0, 0, 0,   // 7-12
				0, 0, 0, 0, 0, 0,   // 13-18
				0, -3, -4, -3, -3, -2 // 19-24
			],
			playerBar: 0,
			opponentBar: 0,
			playerBorneOff: 0,
			opponentBorneOff: 0,
			cubeValue: 1,
			cubeOwner: null
		},
		dice: { die1: 6, die2: 5 }
	},
	{
		name: 'Holding game',
		description: 'Player holds the 20-point anchor',
		board: {
			points: [
				0, 0, 2, 2, 3, 3,  // 1-6
				0, 2, 0, 0, 0, -3,  // 7-12
				1, 0, 0, 0, -2, 0,  // 13-18
				2, -5, -3, 0, -2, 0 // 19-24
			],
			playerBar: 0,
			opponentBar: 0,
			playerBorneOff: 0,
			opponentBorneOff: 0,
			cubeValue: 1,
			cubeOwner: null
		},
		dice: { die1: 6, die2: 1 }
	}
];
