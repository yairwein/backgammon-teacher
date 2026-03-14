<script lang="ts">
	import type { ExplanationResult } from '$lib/llm/prompt.js';
	import type { PositionAnalysis, BlunderLevel, Move } from '$lib/backgammon/types.js';
	import type { FeatureDelta } from '$lib/features/types.js';
	import { formatMove } from '$lib/backgammon/rules.js';
	import { blunderLabel, blunderClass } from '$lib/game/blunder.js';

	interface Props {
		analysis: PositionAnalysis | null;
		explanation: ExplanationResult | null;
		blunderLevel: BlunderLevel;
		notableDeltas?: FeatureDelta[];
		explaining?: boolean;
		onShowBoard?: (type: 'original' | 'played' | 'best') => void;
	}

	let {
		analysis,
		explanation,
		blunderLevel,
		notableDeltas = [],
		explaining = false,
		onShowBoard
	}: Props = $props();

	let detailLevel: 'simple' | 'detailed' | 'raw' = $state('simple');

	const featureDescriptions: Record<string, string> = {
		playerPipCount: 'Total pips your checkers need to bear off. Lower is better.',
		opponentPipCount: "Total pips opponent's checkers need to bear off.",
		pipDifference: 'Your pip count minus opponent. Negative means you lead the race.',
		playerMadePoints: 'Points you control (2+ checkers). More points = stronger position.',
		opponentMadePoints: 'Points opponent controls.',
		playerAnchors: 'Your made points in opponent home board. Key for holding games.',
		opponentAnchors: 'Opponent made points in your home board.',
		playerLongestPrime: 'Your longest sequence of consecutive made points. 6-prime traps checkers.',
		opponentLongestPrime: 'Opponent longest consecutive made points.',
		playerHomeBoardStrength: 'Made points in your home board (1-6). Stronger = harder to re-enter.',
		opponentHomeBoardStrength: 'Made points in opponent home board.',
		playerBlotCount: 'Your exposed single checkers. Each is a target.',
		opponentBlotCount: 'Opponent exposed single checkers.',
		playerDirectShots: 'Your blots within 6 pips of an opponent checker (high hit chance).',
		playerIndirectShots: 'Your blots 7-12 pips from opponent (lower but real hit chance).',
		opponentDirectShots: 'Opponent blots within 6 pips of your checkers.',
		opponentIndirectShots: 'Opponent blots 7-12 pips from your checkers.',
		playerMobility: 'Estimated number of legal moves. Higher = more flexibility.',
		opponentMobility: 'Opponent estimated legal moves.',
		playerBarCheckers: 'Your checkers on the bar waiting to re-enter.',
		opponentBarCheckers: 'Opponent checkers on the bar.',
		playerEscapedCheckers: 'Your checkers past all opponent checkers. Safe from being hit.',
		opponentEscapedCheckers: 'Opponent checkers past all yours.',
		playerTrappedCheckers: 'Your checkers stuck behind opponent primes.',
		opponentTrappedCheckers: 'Opponent checkers stuck behind your primes.',
		playerBorneOff: 'Your checkers already borne off.',
		opponentBorneOff: 'Opponent checkers already borne off.',
		playerWastage: 'Wasted pips from deep stacking. High wastage = poor timing.',
		opponentWastage: 'Opponent wasted pips from deep stacking.',
	};

	function formatFeatureName(camelCase: string): string {
		return camelCase
			.replace(/^(player|opponent)/, (m) => m.charAt(0).toUpperCase() + m.slice(1) + ' ')
			.replace(/([A-Z])/g, ' $1')
			.replace(/  +/g, ' ')
			.trim();
	}

	function getFeatureDescription(feature: string): string {
		return featureDescriptions[feature] || '';
	}
</script>

{#if analysis}
	<div class="analysis-panel">
		<div class="panel-header">
			<h3>Move Analysis</h3>
			{#if blunderLevel !== 'none'}
				<span class="blunder-badge {blunderClass(blunderLevel)}">
					{blunderLabel(blunderLevel)}
				</span>
			{/if}
		</div>

		<!-- Move comparison -->
		<div class="move-comparison">
			<div class="move-row">
				<span class="move-label">Best move:</span>
				<span class="move-notation">{formatMove(analysis.bestMove.move)}</span>
				<span class="equity">Eq: {analysis.bestMove.equity.toFixed(3)}</span>
			</div>
			{#if analysis.playedMove}
				<div class="move-row played">
					<span class="move-label">Played:</span>
					<span class="move-notation">{formatMove(analysis.playedMove.move)}</span>
					<span class="equity">Eq: {analysis.playedMove.equity.toFixed(3)}</span>
				</div>
			{/if}
			<div class="equity-loss">
				Equity loss: <strong>{analysis.equityLoss.toFixed(3)}</strong>
			</div>
		</div>

		<!-- Board replay buttons -->
		{#if onShowBoard}
			<div class="board-replay">
				<button onclick={() => onShowBoard?.('original')}>Original</button>
				<button onclick={() => onShowBoard?.('played')}>After played</button>
				<button onclick={() => onShowBoard?.('best')}>After best</button>
			</div>
		{/if}

		<!-- Detail level toggle -->
		<div class="detail-toggle">
			<button class:active={detailLevel === 'simple'} onclick={() => (detailLevel = 'simple')}>
				Simple
			</button>
			<button class:active={detailLevel === 'detailed'} onclick={() => (detailLevel = 'detailed')}>
				Detailed
			</button>
			<button class:active={detailLevel === 'raw'} onclick={() => (detailLevel = 'raw')}>
				Raw
			</button>
		</div>

		<!-- Explanation -->
		{#if explaining && !explanation}
			<div class="explaining-indicator">
				<span class="spinner"></span>
				Getting coach explanation...
			</div>
		{/if}

		{#if detailLevel === 'simple' && explanation}
			<div class="explanation">
				<p class="summary">{explanation.summary}</p>
				{#if explanation.simple}
					<div class="simple-breakdown">
						{#if explanation.simple.race && explanation.simple.race !== 'No significant impact'}
							<div class="simple-item">
								<span class="simple-label">Race <span class="info-icon">i<span class="tooltip">How far ahead or behind you are in moving all your pieces off the board. A lower pip count means you are winning the race.</span></span></span>
								<span class="simple-text">{explanation.simple.race}</span>
							</div>
						{/if}
						{#if explanation.simple.board && explanation.simple.board !== 'No significant impact'}
							<div class="simple-item">
								<span class="simple-label">Board <span class="info-icon">i<span class="tooltip">How strong your position is: points you control, walls of checkers blocking your opponent, and how well your home board is built up.</span></span></span>
								<span class="simple-text">{explanation.simple.board}</span>
							</div>
						{/if}
						{#if explanation.simple.threat && explanation.simple.threat !== 'No significant impact'}
							<div class="simple-item">
								<span class="simple-label">Threat <span class="info-icon">i<span class="tooltip">How safe or exposed your pieces are. A single piece on a point can be hit and sent to the bar, costing you turns to re-enter.</span></span></span>
								<span class="simple-text">{explanation.simple.threat}</span>
							</div>
						{/if}
					</div>
				{/if}
				{#if explanation.coachTip}
					<p class="coach-tip">Tip: {explanation.coachTip}</p>
				{/if}
			</div>
		{:else if detailLevel === 'simple' && !explanation && !explaining}
			<!-- No explanation available yet -->
		{/if}

		{#if detailLevel === 'detailed' && explanation}
			<div class="explanation detailed">
				<p class="summary">{explanation.summary}</p>
				{#if explanation.reasons.length > 0}
					<ul class="reasons">
						{#each explanation.reasons as reason}
							<li>{reason}</li>
						{/each}
					</ul>
				{/if}
				{#if explanation.coachTip}
					<p class="coach-tip">Tip: {explanation.coachTip}</p>
				{/if}
				{#if notableDeltas.length > 0}
					<div class="feature-deltas">
						<h4>Feature Comparison</h4>
						<table>
							<thead>
								<tr>
									<th>Feature</th>
									<th>Played</th>
									<th>Best</th>
									<th>Delta</th>
								</tr>
							</thead>
							<tbody>
								{#each notableDeltas as delta}
									<tr>
										<td class="feature-name">
											{formatFeatureName(delta.feature)}
											{#if getFeatureDescription(delta.feature)}
												<span class="info-icon">i
													<span class="tooltip">{getFeatureDescription(delta.feature)}</span>
												</span>
											{/if}
										</td>
										<td>{delta.playedValue}</td>
										<td>{delta.bestValue}</td>
										<td class:positive={delta.delta > 0} class:negative={delta.delta < 0}>
											{delta.delta > 0 ? '+' : ''}{delta.delta}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
				<span class="confidence">Confidence: {explanation.confidence}</span>
			</div>
		{/if}

		{#if detailLevel === 'raw'}
			<div class="raw-output">
				<h4>Engine Output</h4>
				{#each analysis.candidates.slice(0, 5) as candidate, i}
					<div class="candidate">
						<span class="rank">{i + 1}.</span>
						<span class="move-notation">{formatMove(candidate.move)}</span>
						<span class="equity">Eq: {candidate.equity.toFixed(3)}</span>
						<span class="probs">
							W: {(candidate.winProb * 100).toFixed(1)}%
							G: {(candidate.gammonProb * 100).toFixed(1)}%
						</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.analysis-panel {
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 1rem;
		color: #e0e0e0;
		max-width: 500px;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.panel-header h3 {
		margin: 0;
		font-size: 1.1rem;
	}

	.blunder-badge {
		padding: 2px 8px;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: bold;
	}

	.blunder-inaccuracy {
		background: #ffd43b;
		color: #333;
	}

	.blunder-mistake {
		background: #ff922b;
		color: #fff;
	}

	.blunder-blunder {
		background: #ff6b6b;
		color: #fff;
	}

	.blunder-huge {
		background: #c92a2a;
		color: #fff;
	}

	.move-comparison {
		margin-bottom: 0.75rem;
	}

	.move-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 4px 0;
	}

	.move-label {
		font-size: 0.85rem;
		color: #aaa;
		width: 80px;
	}

	.move-notation {
		font-family: monospace;
		font-size: 0.9rem;
		flex: 1;
	}

	.equity {
		font-family: monospace;
		font-size: 0.8rem;
		color: #aaa;
	}

	.move-row.played .move-notation {
		color: #ff8787;
	}

	.equity-loss {
		margin-top: 4px;
		font-size: 0.9rem;
	}

	.board-replay {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.board-replay button {
		padding: 4px 10px;
		background: #333;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.board-replay button:hover {
		background: #444;
	}

	.detail-toggle {
		display: flex;
		gap: 0;
		margin-bottom: 0.75rem;
		border: 1px solid #555;
		border-radius: 4px;
		overflow: hidden;
	}

	.detail-toggle button {
		flex: 1;
		padding: 4px 8px;
		background: #333;
		color: #ccc;
		border: none;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.detail-toggle button.active {
		background: #4c6ef5;
		color: #fff;
	}

	.explaining-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
		font-size: 0.9rem;
		color: #aaa;
	}

	.spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid #555;
		border-top-color: #4c6ef5;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.explanation {
		margin-bottom: 0.5rem;
	}

	.simple-breakdown {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}

	.simple-item {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}

	.simple-label {
		font-size: 0.75rem;
		font-weight: bold;
		text-transform: uppercase;
		color: #4c6ef5;
		min-width: 50px;
		flex-shrink: 0;
	}

	.simple-text {
		font-size: 0.9rem;
		line-height: 1.3;
	}

	.summary {
		font-size: 0.95rem;
		line-height: 1.4;
		margin: 0 0 0.5rem;
	}

	.reasons {
		margin: 0.5rem 0;
		padding-left: 1.2rem;
	}

	.reasons li {
		font-size: 0.85rem;
		margin-bottom: 0.25rem;
		line-height: 1.3;
	}

	.coach-tip {
		font-style: italic;
		color: #69db7c;
		font-size: 0.85rem;
		margin: 0.5rem 0 0;
	}

	.feature-deltas {
		margin-top: 0.75rem;
	}

	.feature-deltas h4 {
		font-size: 0.85rem;
		margin: 0 0 0.25rem;
	}

	.feature-deltas table {
		width: 100%;
		font-size: 0.8rem;
		border-collapse: collapse;
	}

	.feature-deltas th,
	.feature-deltas td {
		padding: 3px 6px;
		text-align: left;
		border-bottom: 1px solid #333;
	}

	.feature-name {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.info-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #444;
		color: #aaa;
		font-size: 0.65rem;
		font-style: italic;
		cursor: help;
		flex-shrink: 0;
		position: relative;
	}

	.info-icon:hover {
		background: #4c6ef5;
		color: #fff;
	}

	.tooltip {
		display: none;
		position: absolute;
		left: 50%;
		bottom: 100%;
		transform: translateX(-50%);
		margin-bottom: 6px;
		background: #222;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
		padding: 6px 8px;
		font-size: 0.75rem;
		font-style: normal;
		white-space: normal;
		width: 200px;
		line-height: 1.3;
		z-index: 10;
		pointer-events: none;
	}

	.info-icon:hover .tooltip {
		display: block;
	}

	.positive {
		color: #69db7c;
	}

	.negative {
		color: #ff6b6b;
	}

	.confidence {
		font-size: 0.75rem;
		color: #888;
	}

	.raw-output {
		font-family: monospace;
		font-size: 0.8rem;
	}

	.raw-output h4 {
		font-size: 0.85rem;
		margin: 0 0 0.5rem;
	}

	.candidate {
		display: flex;
		gap: 0.5rem;
		padding: 2px 0;
	}

	.rank {
		color: #aaa;
		width: 20px;
	}

	.probs {
		color: #888;
		font-size: 0.75rem;
	}
</style>
