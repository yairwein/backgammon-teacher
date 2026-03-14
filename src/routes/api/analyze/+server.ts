/**
 * POST /api/analyze
 * Analyze a position: given board, dice, and played move,
 * return best move, equity loss, blunder classification.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { BoardState, DiceRoll, Move, BlunderThresholdConfig } from '$lib/backgammon/types.js';
import { getGnubgAdapter } from '$lib/analysis/gnubg.js';
import { extractFeatures, compareFeatures } from '$lib/features/extract.js';
import { applyMove } from '$lib/backgammon/rules.js';
import { classifyMove } from '$lib/game/blunder.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { board, dice, playedMove, thresholdConfig } = body as {
			board: BoardState;
			dice: DiceRoll;
			playedMove: Move;
			thresholdConfig?: BlunderThresholdConfig;
		};

		if (!board || !dice || !playedMove) {
			throw error(400, 'Missing required fields: board, dice, playedMove');
		}

		const config: BlunderThresholdConfig = thresholdConfig || {
			preset: 'normal',
			blunderThreshold: 0.08
		};

		// Run GNU Backgammon analysis
		const adapter = getGnubgAdapter();
		const analysis = await adapter.analyzePosition(board, dice, playedMove);

		// Apply moves to get resulting boards
		const playedBoard = applyMove(board, playedMove);
		const bestBoard = applyMove(board, analysis.bestMove.move);

		// Extract and compare features
		const features = compareFeatures(playedBoard, bestBoard);

		// Classify the move
		const blunderLevel = classifyMove(analysis.equityLoss, config);

		// Log analysis results for debugging
		const playedKey = playedMove.checkerMoves.map(cm => `${cm.from}/${cm.to}`).join(' ') || 'pass';
		const bestKey = analysis.bestMove.move.checkerMoves.map(cm => `${cm.from}/${cm.to}`).join(' ') || 'pass';
		console.info(
			`[analyze] dice=${dice.die1}-${dice.die2} played="${playedKey}" best="${bestKey}" ` +
			`eqLoss=${analysis.equityLoss.toFixed(3)} matched=${!!analysis.playedMove} ` +
			`candidates=${analysis.candidates.length}`
		);

		return json({
			analysis: {
				bestMove: analysis.bestMove,
				playedMove: analysis.playedMove,
				equityLoss: analysis.equityLoss,
				candidates: analysis.candidates.slice(0, 5),
				positionType: features.playedFeatures.positionType
			},
			blunderLevel,
			features: {
				played: features.playedFeatures,
				best: features.bestFeatures,
				notableDeltas: features.notableDeltas
			}
		});
	} catch (err) {
		console.error('Analysis error:', err);
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, `Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}
};
