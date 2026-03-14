/**
 * POST /api/explain
 * Generate an LLM explanation for a blunder.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { BoardState, DiceRoll, Move, PositionAnalysis } from '$lib/backgammon/types.js';
import type { FeatureComparison } from '$lib/features/types.js';
import { explainBlunder } from '$lib/llm/explainer.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { board, dice, playedMove, bestMove, analysis, features } = body as {
			board: BoardState;
			dice: DiceRoll;
			playedMove: Move;
			bestMove: Move;
			analysis: PositionAnalysis;
			features: FeatureComparison;
		};

		if (!board || !dice || !playedMove || !bestMove) {
			throw error(400, 'Missing required fields');
		}

		const explanation = await explainBlunder({
			board,
			dice,
			playedMove,
			bestMove,
			analysis,
			features
		});

		return json({ explanation });
	} catch (err) {
		console.error('Explain error:', err);
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, `Explanation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}
};
