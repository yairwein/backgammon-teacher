/**
 * Computer player powered by GNU Backgammon.
 */

import type { BoardState, DiceRoll, Difficulty, Move } from '$lib/backgammon/types.js';
import { generateLegalMoves, isMoveLegal, applyMove } from '$lib/backgammon/rules.js';
import { getGnubgAdapter } from '$lib/analysis/gnubg.js';

/**
 * Get the computer's move for a position.
 * Difficulty affects move selection:
 * - strong: always plays the best move
 * - intermediate: occasionally plays 2nd or 3rd best
 * - beginner: plays randomly weighted toward better moves
 */
export async function getComputerMove(
	board: BoardState,
	dice: DiceRoll,
	difficulty: Difficulty
): Promise<Move> {
	try {
		const adapter = getGnubgAdapter();
		const analysis = await adapter.analyzePosition(board, dice);

		if (analysis.candidates.length === 0) {
			return { checkerMoves: [] };
		}

		if (analysis.bestMove.move.checkerMoves.length === 0) {
			console.warn(
				`gnubg returned empty best move with ${analysis.candidates.length} candidates. ` +
				`Dice: ${dice.die1}-${dice.die2}. ` +
				`Board: ${JSON.stringify(board.points)} bar=${board.playerBar}/${board.opponentBar}`
			);
			// Try to find a non-empty candidate
			const validCandidate = analysis.candidates.find(c => c.move.checkerMoves.length > 0);
			if (validCandidate) return validCandidate.move;
		}

		let selectedMove: Move;
		switch (difficulty) {
			case 'strong':
				selectedMove = analysis.bestMove.move;
				break;

			case 'intermediate': {
				const roll = Math.random();
				if (roll < 0.7 || analysis.candidates.length < 2) {
					selectedMove = analysis.candidates[0].move;
				} else if (roll < 0.9 || analysis.candidates.length < 3) {
					selectedMove = analysis.candidates[1].move;
				} else {
					selectedMove = analysis.candidates[2].move;
				}
				break;
			}

			case 'beginner': {
				const top = analysis.candidates.slice(0, Math.min(5, analysis.candidates.length));
				const weights = top.map((_, i) => 1 / (i + 1));
				const totalWeight = weights.reduce((a, b) => a + b, 0);
				let r = Math.random() * totalWeight;
				for (let i = 0; i < weights.length; i++) {
					r -= weights[i];
					if (r <= 0) { selectedMove = top[i].move; break; }
				}
				selectedMove ??= top[top.length - 1].move;
				break;
			}

			default:
				selectedMove = analysis.bestMove.move;
		}

		// Validate selected move against legal moves
		if (selectedMove.checkerMoves.length > 0 && !isMoveLegal(board, dice, selectedMove)) {
			const moveStr = selectedMove.checkerMoves.map(cm => `${cm.from}/${cm.to}`).join(' ');
			console.error(
				`[enginePlayer] gnubg returned illegal move: "${moveStr}" ` +
				`dice=${dice.die1}-${dice.die2} board=${JSON.stringify(board.points)} bar=${board.playerBar}/${board.opponentBar}`
			);

			// Try to find matching legal move by resulting board state
			const legalMoves = generateLegalMoves(board, dice);
			try {
				const gnubgBoard = applyMove(board, selectedMove);
				const gnubgKey = JSON.stringify(gnubgBoard.points) + gnubgBoard.playerBar + gnubgBoard.opponentBar + gnubgBoard.playerBorneOff;
				const match = legalMoves.find(lm => {
					const b = applyMove(board, lm);
					return JSON.stringify(b.points) + b.playerBar + b.opponentBar + b.playerBorneOff === gnubgKey;
				});
				if (match) {
					console.info(`[enginePlayer] Found matching legal move by board state`);
					return match;
				}
			} catch { /* gnubg move can't be applied */ }

			// Last resort: pick the first legal move (gnubg's #1 candidate usually)
			if (legalMoves.length > 0 && legalMoves[0].checkerMoves.length > 0) {
				console.info(`[enginePlayer] Falling back to first legal move`);
				return legalMoves[0];
			}
		}

		return selectedMove;
	} catch (error) {
		// Fallback: use local move generation and pick randomly
		console.warn('GNU Backgammon unavailable, using random move fallback:', error);
		const legalMoves = generateLegalMoves(board, dice);
		if (legalMoves.length === 0) return { checkerMoves: [] };
		return legalMoves[Math.floor(Math.random() * legalMoves.length)];
	}
}
