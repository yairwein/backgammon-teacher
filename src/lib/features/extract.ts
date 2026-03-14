/**
 * Feature extraction from board states.
 * Computes interpretable features for LLM explanation.
 */

import type { BoardState, PositionType } from '$lib/backgammon/types.js';
import { pipCount, allInHomeBoard } from '$lib/backgammon/board.js';
import type { FeatureVector, FeatureDelta, FeatureComparison } from './types.js';

/**
 * Extract a full feature vector from a board state.
 */
export function extractFeatures(board: BoardState): FeatureVector {
	const playerPip = pipCount(board, 'player');
	const opponentPip = pipCount(board, 'opponent');

	return {
		positionType: classifyPosition(board),
		playerPipCount: playerPip,
		opponentPipCount: opponentPip,
		pipDifference: playerPip - opponentPip,
		playerMadePoints: countMadePoints(board, 'player'),
		opponentMadePoints: countMadePoints(board, 'opponent'),
		playerAnchors: countAnchors(board, 'player'),
		opponentAnchors: countAnchors(board, 'opponent'),
		playerLongestPrime: longestPrime(board, 'player'),
		opponentLongestPrime: longestPrime(board, 'opponent'),
		playerHomeBoardStrength: homeBoardStrength(board, 'player'),
		opponentHomeBoardStrength: homeBoardStrength(board, 'opponent'),
		playerBlotCount: countBlots(board, 'player'),
		opponentBlotCount: countBlots(board, 'opponent'),
		playerDirectShots: countDirectShots(board, 'player'),
		playerIndirectShots: countIndirectShots(board, 'player'),
		opponentDirectShots: countDirectShots(board, 'opponent'),
		opponentIndirectShots: countIndirectShots(board, 'opponent'),
		playerMobility: estimateMobility(board, 'player'),
		opponentMobility: estimateMobility(board, 'opponent'),
		playerBarCheckers: board.playerBar,
		opponentBarCheckers: board.opponentBar,
		playerEscapedCheckers: countEscaped(board, 'player'),
		opponentEscapedCheckers: countEscaped(board, 'opponent'),
		playerTrappedCheckers: countTrapped(board, 'player'),
		opponentTrappedCheckers: countTrapped(board, 'opponent'),
		playerBorneOff: board.playerBorneOff,
		opponentBorneOff: board.opponentBorneOff,
		playerWastage: computeWastage(board, 'player'),
		opponentWastage: computeWastage(board, 'opponent')
	};
}

/**
 * Compare features between played move result and best move result.
 */
export function compareFeatures(
	playedBoard: BoardState,
	bestBoard: BoardState
): FeatureComparison {
	const playedFeatures = extractFeatures(playedBoard);
	const bestFeatures = extractFeatures(bestBoard);

	const deltas = computeDeltas(playedFeatures, bestFeatures);
	const notableDeltas = deltas.filter((d) => d.notable);

	return { playedFeatures, bestFeatures, deltas, notableDeltas };
}

function computeDeltas(played: FeatureVector, best: FeatureVector): FeatureDelta[] {
	const numericKeys: (keyof FeatureVector)[] = [
		'playerPipCount', 'opponentPipCount', 'pipDifference',
		'playerMadePoints', 'opponentMadePoints',
		'playerAnchors', 'opponentAnchors',
		'playerLongestPrime', 'opponentLongestPrime',
		'playerHomeBoardStrength', 'opponentHomeBoardStrength',
		'playerBlotCount', 'opponentBlotCount',
		'playerDirectShots', 'playerIndirectShots',
		'opponentDirectShots', 'opponentIndirectShots',
		'playerMobility', 'opponentMobility',
		'playerBarCheckers', 'opponentBarCheckers',
		'playerEscapedCheckers', 'opponentEscapedCheckers',
		'playerTrappedCheckers', 'opponentTrappedCheckers',
		'playerBorneOff', 'opponentBorneOff',
		'playerWastage', 'opponentWastage'
	];

	return numericKeys.map((key) => {
		const playedValue = played[key] as number;
		const bestValue = best[key] as number;
		const delta = bestValue - playedValue;

		// Determine if notable based on the feature type
		const threshold = getNotableThreshold(key);

		return {
			feature: key,
			playedValue,
			bestValue,
			delta,
			notable: Math.abs(delta) >= threshold
		};
	});
}

function getNotableThreshold(feature: string): number {
	if (feature.includes('PipCount') || feature.includes('pipDifference')) return 5;
	if (feature.includes('Blot') || feature.includes('Shot')) return 1;
	if (feature.includes('Prime') || feature.includes('Anchor')) return 1;
	if (feature.includes('HomeBoard')) return 1;
	if (feature.includes('Bar') || feature.includes('Trapped')) return 1;
	if (feature.includes('Wastage')) return 2;
	return 1;
}

// --- Feature computation helpers ---

function countMadePoints(board: BoardState, player: 'player' | 'opponent'): number {
	let count = 0;
	for (let i = 0; i < 24; i++) {
		if (player === 'player' && board.points[i] >= 2) count++;
		if (player === 'opponent' && board.points[i] <= -2) count++;
	}
	return count;
}

function countAnchors(board: BoardState, player: 'player' | 'opponent'): number {
	let count = 0;
	if (player === 'player') {
		// Player's anchors: made points in opponent's home board (points 19-24 = indices 18-23)
		for (let i = 18; i < 24; i++) {
			if (board.points[i] >= 2) count++;
		}
	} else {
		// Opponent's anchors: made points in player's home board (points 1-6 = indices 0-5)
		for (let i = 0; i < 6; i++) {
			if (board.points[i] <= -2) count++;
		}
	}
	return count;
}

function longestPrime(board: BoardState, player: 'player' | 'opponent'): number {
	let maxLen = 0;
	let current = 0;
	for (let i = 0; i < 24; i++) {
		const hasMade = player === 'player' ? board.points[i] >= 2 : board.points[i] <= -2;
		if (hasMade) {
			current++;
			maxLen = Math.max(maxLen, current);
		} else {
			current = 0;
		}
	}
	return maxLen;
}

function homeBoardStrength(board: BoardState, player: 'player' | 'opponent'): number {
	let count = 0;
	if (player === 'player') {
		for (let i = 0; i < 6; i++) {
			if (board.points[i] >= 2) count++;
		}
	} else {
		for (let i = 18; i < 24; i++) {
			if (board.points[i] <= -2) count++;
		}
	}
	return count;
}

function countBlots(board: BoardState, player: 'player' | 'opponent'): number {
	let count = 0;
	for (let i = 0; i < 24; i++) {
		if (player === 'player' && board.points[i] === 1) count++;
		if (player === 'opponent' && board.points[i] === -1) count++;
	}
	return count;
}

function countDirectShots(board: BoardState, player: 'player' | 'opponent'): number {
	// Count blots that an opponent checker can reach in exactly 1-6 pips
	let shots = 0;
	for (let i = 0; i < 24; i++) {
		const isBlot = player === 'player' ? board.points[i] === 1 : board.points[i] === -1;
		if (!isBlot) continue;

		// Check if any opponent checker is within 6 pips
		for (let d = 1; d <= 6; d++) {
			if (player === 'player') {
				const from = i + d;
				if (from < 24 && board.points[from] < 0) {
					shots++;
					break;
				}
				if (from >= 24 && board.opponentBar > 0) {
					shots++;
					break;
				}
			} else {
				const from = i - d;
				if (from >= 0 && board.points[from] > 0) {
					shots++;
					break;
				}
				if (from < 0 && board.playerBar > 0) {
					shots++;
					break;
				}
			}
		}
	}
	return shots;
}

function countIndirectShots(board: BoardState, player: 'player' | 'opponent'): number {
	let shots = 0;
	for (let i = 0; i < 24; i++) {
		const isBlot = player === 'player' ? board.points[i] === 1 : board.points[i] === -1;
		if (!isBlot) continue;

		for (let d = 7; d <= 12; d++) {
			if (player === 'player') {
				const from = i + d;
				if (from < 24 && board.points[from] < 0) {
					shots++;
					break;
				}
			} else {
				const from = i - d;
				if (from >= 0 && board.points[from] > 0) {
					shots++;
					break;
				}
			}
		}
	}
	return shots;
}

function estimateMobility(board: BoardState, player: 'player' | 'opponent'): number {
	// Simple heuristic: count non-blocked points the player could move to
	let mobility = 0;
	for (let i = 0; i < 24; i++) {
		const blocked = player === 'player' ? board.points[i] <= -2 : board.points[i] >= 2;
		if (!blocked) mobility++;
	}
	return mobility;
}

function countEscaped(board: BoardState, player: 'player' | 'opponent'): number {
	// Checkers past the opponent's farthest checker
	if (player === 'player') {
		let opFarthest = -1;
		for (let i = 0; i < 24; i++) {
			if (board.points[i] < 0) opFarthest = i;
		}
		if (opFarthest === -1) return 15 - board.playerBar;
		let count = 0;
		for (let i = 0; i < opFarthest; i++) {
			if (board.points[i] > 0) count += board.points[i];
		}
		count += board.playerBorneOff;
		return count;
	} else {
		let plFarthest = 24;
		for (let i = 23; i >= 0; i--) {
			if (board.points[i] > 0) { plFarthest = i; break; }
		}
		if (plFarthest === 24) return 15 - board.opponentBar;
		let count = 0;
		for (let i = plFarthest + 1; i < 24; i++) {
			if (board.points[i] < 0) count += Math.abs(board.points[i]);
		}
		count += board.opponentBorneOff;
		return count;
	}
}

function countTrapped(board: BoardState, player: 'player' | 'opponent'): number {
	// Checkers behind a 3+ consecutive prime of the opponent
	if (player === 'player') {
		// Find opponent primes (3+ consecutive made points)
		for (let i = 0; i < 22; i++) {
			if (board.points[i] <= -2 && board.points[i + 1] <= -2 && board.points[i + 2] <= -2) {
				// Count player checkers behind this prime (higher index)
				let trapped = 0;
				for (let j = i + 3; j < 24; j++) {
					if (board.points[j] > 0) trapped += board.points[j];
				}
				return trapped;
			}
		}
	} else {
		for (let i = 23; i >= 2; i--) {
			if (board.points[i] >= 2 && board.points[i - 1] >= 2 && board.points[i - 2] >= 2) {
				let trapped = 0;
				for (let j = i - 3; j >= 0; j--) {
					if (board.points[j] < 0) trapped += Math.abs(board.points[j]);
				}
				return trapped;
			}
		}
	}
	return 0;
}

function computeWastage(board: BoardState, player: 'player' | 'opponent'): number {
	// Wastage: stacked checkers beyond 3 on a single point
	let wastage = 0;
	for (let i = 0; i < 24; i++) {
		if (player === 'player' && board.points[i] > 3) {
			wastage += board.points[i] - 3;
		}
		if (player === 'opponent' && board.points[i] < -3) {
			wastage += Math.abs(board.points[i]) - 3;
		}
	}
	return wastage;
}

/**
 * Classify the position type based on features.
 */
export function classifyPosition(board: BoardState): PositionType {
	const playerPip = pipCount(board, 'player');
	const opponentPip = pipCount(board, 'opponent');

	// Check if it's a pure race (no contact)
	const hasContact = checkContact(board);
	if (!hasContact) return 'race';

	const playerAnchors = countAnchors(board, 'player');
	const opponentAnchors = countAnchors(board, 'opponent');
	const playerPrime = longestPrime(board, 'player');
	const opponentPrime = longestPrime(board, 'opponent');
	const playerHomeStrength = homeBoardStrength(board, 'player');

	// Blitz: strong home board + opponent on bar or back
	if (playerHomeStrength >= 4 && (board.opponentBar > 0 || opponentAnchors === 0)) {
		return 'blitz';
	}

	// Prime vs prime: both players have 4+ primes
	if (playerPrime >= 4 && opponentPrime >= 4) {
		return 'primeVsPrime';
	}

	// Backgame: player has 2+ anchors deep in opponent's board
	if (playerAnchors >= 2 && playerPip > opponentPip + 30) {
		return 'backgame';
	}

	// Holding: player has exactly one strong anchor
	if (playerAnchors >= 1 && playerPrime < 4) {
		return 'holding';
	}

	return 'contact';
}

function checkContact(board: BoardState): boolean {
	// There is contact if any player checker is behind any opponent checker
	let playerFarthest = -1;
	let opponentFarthest = 24;

	for (let i = 23; i >= 0; i--) {
		if (board.points[i] > 0) { playerFarthest = i; break; }
	}
	for (let i = 0; i < 24; i++) {
		if (board.points[i] < 0) { opponentFarthest = i; break; }
	}

	// Contact exists if player's farthest checker hasn't passed opponent's farthest
	return playerFarthest >= opponentFarthest;
}
