/**
 * Prompt construction for LLM explanation layer.
 */

import type { PositionAnalysis, Move, DiceRoll, BoardState } from '$lib/backgammon/types.js';
import { formatMove } from '$lib/backgammon/rules.js';
import { pipCount } from '$lib/backgammon/board.js';
import type { FeatureComparison, FeatureDelta } from '$lib/features/types.js';

export interface ExplanationRequest {
	board: BoardState;
	dice: DiceRoll;
	playedMove: Move;
	bestMove: Move;
	analysis: PositionAnalysis;
	features: FeatureComparison;
}

export interface SimpleExplanation {
	race: string;
	board: string;
	threat: string;
}

export interface ExplanationResult {
	summary: string;
	simple: SimpleExplanation;
	reasons: string[];
	coachTip: string;
	confidence: 'low' | 'medium' | 'high';
}

/**
 * Build the system prompt for blunder explanations.
 */
export function buildSystemPrompt(): string {
	return `You are a backgammon coach explaining why a move is a mistake.

RULES:
- Only reference facts provided in the data. Never invent strategic facts.
- Focus on strategic reasoning, not just equity numbers.
- Explain in plain language a casual player would understand.
- Be concise but insightful.

OUTPUT FORMAT (JSON):
{
  "summary": "One sentence overview of the mistake",
  "simple": {
    "race": "How this move affects the race (pip count, who is ahead/behind, escaping back checkers). Say 'No significant impact' if not relevant.",
    "board": "How this move affects board structure (home board strength, made points, primes, anchors). Say 'No significant impact' if not relevant.",
    "threat": "How this move affects safety and danger (blots, shots, hitting, being hit). Say 'No significant impact' if not relevant."
  },
  "reasons": ["Reason 1", "Reason 2", ...],
  "coach_tip": "A practical tip for similar positions",
  "confidence": "low|medium|high"
}

For the "simple" fields, use short everyday language (1-2 sentences each). Avoid jargon.
For example: "You leave a piece open where it can easily be hit" instead of "Creates a direct shot vulnerability".

Set confidence based on how clear the strategic reasoning is:
- high: the mistake is clearly explainable from the features
- medium: the explanation is reasonable but there may be deeper tactical reasons
- low: the position is complex and the explanation may be incomplete`;
}

/**
 * Build the user prompt with all the analysis data.
 */
export function buildExplanationPrompt(request: ExplanationRequest): string {
	const { board, dice, playedMove, bestMove, analysis, features } = request;

	const sections: string[] = [];

	// Position summary
	sections.push(`## Position
- Dice: ${dice.die1}-${dice.die2}
- Position type: ${features.playedFeatures.positionType}
- Player pip count: ${pipCount(board, 'player')}
- Opponent pip count: ${pipCount(board, 'opponent')}`);

	// Moves
	sections.push(`## Moves
- Played: ${formatMove(playedMove)}
- Best: ${formatMove(bestMove)}
- Equity loss: ${analysis.equityLoss.toFixed(3)}`);

	// Equity details
	if (analysis.bestMove) {
		sections.push(`## Best Move Analysis
- Equity: ${analysis.bestMove.equity.toFixed(3)}
- Win: ${(analysis.bestMove.winProb * 100).toFixed(1)}%
- Gammon: ${(analysis.bestMove.gammonProb * 100).toFixed(1)}%`);
	}

	if (analysis.playedMove) {
		sections.push(`## Played Move Analysis
- Equity: ${analysis.playedMove.equity.toFixed(3)}
- Win: ${(analysis.playedMove.winProb * 100).toFixed(1)}%
- Gammon: ${(analysis.playedMove.gammonProb * 100).toFixed(1)}%`);
	}

	// Notable feature deltas
	if (features.notableDeltas.length > 0) {
		sections.push(`## Key Differences (Best vs Played)
${formatNotableDeltas(features.notableDeltas)}`);
	}

	// Feature snapshot
	sections.push(`## Position Features After Played Move
${formatFeatureSnapshot(features)}`);

	return sections.join('\n\n');
}

function formatNotableDeltas(deltas: FeatureDelta[]): string {
	return deltas
		.map((d) => {
			const direction = d.delta > 0 ? 'better' : 'worse';
			const label = featureLabel(d.feature);
			return `- ${label}: ${d.playedValue} → ${d.bestValue} (best is ${Math.abs(d.delta)} ${direction})`;
		})
		.join('\n');
}

function formatFeatureSnapshot(features: FeatureComparison): string {
	const f = features.playedFeatures;
	return `- Blots: ${f.playerBlotCount} (direct shots: ${f.playerDirectShots}, indirect: ${f.playerIndirectShots})
- Made points: ${f.playerMadePoints}
- Home board: ${f.playerHomeBoardStrength}/6
- Longest prime: ${f.playerLongestPrime}
- Anchors: ${f.playerAnchors}
- Bar: ${f.playerBarCheckers}
- Escaped: ${f.playerEscapedCheckers}
- Trapped: ${f.playerTrappedCheckers}
- Wastage: ${f.playerWastage}`;
}

function featureLabel(key: string): string {
	const labels: Record<string, string> = {
		playerBlotCount: 'Player blots',
		opponentBlotCount: 'Opponent blots',
		playerDirectShots: 'Direct shots on player',
		playerIndirectShots: 'Indirect shots on player',
		playerMadePoints: 'Player made points',
		opponentMadePoints: 'Opponent made points',
		playerHomeBoardStrength: 'Home board strength',
		opponentHomeBoardStrength: 'Opponent home board',
		playerLongestPrime: 'Player prime length',
		opponentLongestPrime: 'Opponent prime length',
		playerAnchors: 'Player anchors',
		opponentAnchors: 'Opponent anchors',
		playerPipCount: 'Player pip count',
		opponentPipCount: 'Opponent pip count',
		pipDifference: 'Pip difference',
		playerBarCheckers: 'Player bar checkers',
		opponentBarCheckers: 'Opponent bar checkers',
		playerEscapedCheckers: 'Player escaped',
		opponentEscapedCheckers: 'Opponent escaped',
		playerTrappedCheckers: 'Player trapped',
		opponentTrappedCheckers: 'Opponent trapped',
		playerWastage: 'Player wastage',
		opponentWastage: 'Opponent wastage',
		playerMobility: 'Player mobility',
		opponentMobility: 'Opponent mobility'
	};
	return labels[key] || key;
}
