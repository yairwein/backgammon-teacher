/**
 * Types for the feature extraction layer.
 */

import type { PositionType } from '$lib/backgammon/types.js';

export interface FeatureVector {
	/** Position classification */
	positionType: PositionType;

	// Structure
	playerPipCount: number;
	opponentPipCount: number;
	pipDifference: number;
	playerMadePoints: number;
	opponentMadePoints: number;
	playerAnchors: number; // made points in opponent's home board
	opponentAnchors: number;
	playerLongestPrime: number;
	opponentLongestPrime: number;
	playerHomeBoardStrength: number; // number of made points in home board (1-6)
	opponentHomeBoardStrength: number;

	// Risk
	playerBlotCount: number;
	opponentBlotCount: number;
	playerDirectShots: number; // blots within 6 pips of opponent
	playerIndirectShots: number; // blots within 7-12 pips of opponent
	opponentDirectShots: number;
	opponentIndirectShots: number;

	// Mobility
	/** Estimated legal move count (after a hypothetical average roll) */
	playerMobility: number;
	opponentMobility: number;

	// Bar / escape
	playerBarCheckers: number;
	opponentBarCheckers: number;
	playerEscapedCheckers: number; // checkers past opponent's farthest point
	opponentEscapedCheckers: number;
	playerTrappedCheckers: number; // checkers behind opponent primes
	opponentTrappedCheckers: number;

	// Bearing off
	playerBorneOff: number;
	opponentBorneOff: number;

	// Timing / wastage
	/** Rough timing metric: high wastage = checkers stacked deep with no purpose */
	playerWastage: number;
	opponentWastage: number;
}

export interface FeatureDelta {
	/** Feature name */
	feature: string;
	/** Value in played move result */
	playedValue: number;
	/** Value in best move result */
	bestValue: number;
	/** Difference (best - played) */
	delta: number;
	/** Whether this delta is notable (large enough to mention) */
	notable: boolean;
}

export interface FeatureComparison {
	playedFeatures: FeatureVector;
	bestFeatures: FeatureVector;
	deltas: FeatureDelta[];
	notableDeltas: FeatureDelta[];
}
