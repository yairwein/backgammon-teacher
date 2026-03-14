/**
 * Local analysis fallback when GNU Backgammon is not available.
 * Uses our move generator + feature extraction to rank moves by heuristic.
 */

import type { BoardState, CandidateMoveAnalysis, DiceRoll, Move, PositionAnalysis } from '$lib/backgammon/types.js';
import { generateLegalMoves, applyMove } from '$lib/backgammon/rules.js';
import { extractFeatures, classifyPosition } from '$lib/features/extract.js';
import { pipCount } from '$lib/backgammon/board.js';

/**
 * Score a resulting board position using heuristics.
 * Higher = better for the player.
 */
function scorePosition(board: BoardState): number {
	const f = extractFeatures(board);
	let score = 0;

	// Pip count advantage (lower is better for player)
	score += (f.opponentPipCount - f.playerPipCount) * 0.005;

	// Made points are good
	score += f.playerMadePoints * 0.04;

	// Home board strength is very good
	score += f.playerHomeBoardStrength * 0.06;

	// Blots are bad
	score -= f.playerBlotCount * 0.03;

	// Direct shots on our blots are very bad
	score -= f.playerDirectShots * 0.05;
	score -= f.playerIndirectShots * 0.02;

	// Prime length is good
	score += f.playerLongestPrime * 0.05;

	// Anchors are good in non-race positions
	score += f.playerAnchors * 0.03;

	// Being on the bar is bad
	score -= f.playerBarCheckers * 0.15;

	// Opponent on bar is good
	score += f.opponentBarCheckers * 0.10;

	// Trapped checkers are bad
	score -= f.playerTrappedCheckers * 0.03;

	// Wastage is bad
	score -= f.playerWastage * 0.01;

	// Borne off is good
	score += f.playerBorneOff * 0.02;

	return score;
}

/**
 * Analyze a position locally without GNU Backgammon.
 */
export function analyzePositionLocal(
	board: BoardState,
	dice: DiceRoll,
	playedMove?: Move
): PositionAnalysis {
	const legalMoves = generateLegalMoves(board, dice);

	// Score each legal move
	const candidates: CandidateMoveAnalysis[] = legalMoves.map((move) => {
		const resultBoard = applyMove(board, move);
		const equity = scorePosition(resultBoard);

		return {
			move,
			equity,
			winProb: 0.5 + equity * 0.5, // rough estimate
			gammonProb: Math.max(0, equity * 0.1),
			bgProb: 0,
			loseProb: 0.5 - equity * 0.5,
			loseGammonProb: Math.max(0, -equity * 0.1),
			loseBgProb: 0
		};
	});

	// Sort by equity descending
	candidates.sort((a, b) => b.equity - a.equity);

	const bestMove = candidates[0] || createEmptyCandidate();

	let playedMoveAnalysis: CandidateMoveAnalysis | null = null;
	let equityLoss = 0;

	if (playedMove) {
		const moveKey = moveToKey(playedMove);
		playedMoveAnalysis = candidates.find((c) => moveToKey(c.move) === moveKey) || null;

		if (playedMoveAnalysis) {
			equityLoss = Math.max(0, bestMove.equity - playedMoveAnalysis.equity);
		}
	}

	return {
		bestMove,
		playedMove: playedMoveAnalysis,
		candidates: candidates.slice(0, 10),
		equityLoss,
		positionType: classifyPosition(board)
	};
}

function moveToKey(move: Move): string {
	return move.checkerMoves
		.map((cm) => `${cm.from}-${cm.to}`)
		.sort()
		.join(',');
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
