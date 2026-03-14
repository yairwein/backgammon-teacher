/**
 * POST /api/computer-move
 * Get the computer's move for a given position.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { BoardState, DiceRoll, Difficulty } from '$lib/backgammon/types.js';
import { getComputerMove } from '$lib/game/enginePlayer.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { board, dice, difficulty } = body as {
			board: BoardState;
			dice: DiceRoll;
			difficulty?: Difficulty;
		};

		if (!board || !dice) {
			throw error(400, 'Missing required fields: board, dice');
		}

		const move = await getComputerMove(board, dice, difficulty || 'strong');

		return json({ move });
	} catch (err) {
		console.error('Computer move error:', err);
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, `Computer move failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}
};
