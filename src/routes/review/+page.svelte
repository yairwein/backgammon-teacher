<script lang="ts">
	import Board from '$lib/components/Board.svelte';
	import AnalysisPanel from '$lib/components/AnalysisPanel.svelte';
	import { initialBoard } from '$lib/backgammon/board.js';
	import { generateLegalMoves, applyMove, formatMove } from '$lib/backgammon/rules.js';
	import type {
		BoardState, DiceRoll, DieValue, Move, PositionAnalysis, BlunderLevel
	} from '$lib/backgammon/types.js';
	import type { ExplanationResult } from '$lib/llm/prompt.js';
	import type { FeatureDelta } from '$lib/features/types.js';
	import { SAMPLE_POSITIONS } from '$lib/data/samples.js';

	let board: BoardState = $state(initialBoard());
	let originalBoard: BoardState = $state(initialBoard());
	let die1: number = $state(3);
	let die2: number = $state(1);
	let dice: DiceRoll = $derived({ die1: die1 as DieValue, die2: die2 as DieValue });

	let legalMoves: Move[] = $derived(generateLegalMoves(board, dice));

	let selectedMove: Move | null = $state(null);
	let analyzing = $state(false);
	let explaining = $state(false);
	let analysis: PositionAnalysis | null = $state(null);
	let explanation: ExplanationResult | null = $state(null);
	let blunderLevel: BlunderLevel = $state('none');
	let notableDeltas: FeatureDelta[] = $state([]);

	// Board view state
	let viewMode: 'original' | 'played' | 'best' = $state('original');
	let playedBoard: BoardState | null = $state(null);
	let bestBoard: BoardState | null = $state(null);

	let displayBoard = $derived.by(() => {
		if (viewMode === 'played' && playedBoard) return playedBoard;
		if (viewMode === 'best' && bestBoard) return bestBoard;
		return board;
	});

	function handleMoveSelected(move: Move) {
		selectedMove = move;
		// Apply the move so the board updates visually
		playedBoard = applyMove(board, move);
		viewMode = 'played';
		// Auto-trigger analysis
		analyzeSelectedMove();
	}

	async function analyzeSelectedMove() {
		if (!selectedMove) return;
		analyzing = true;
		analysis = null;
		explanation = null;
		viewMode = 'original';

		try {
			const res = await fetch('/api/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					board,
					dice,
					playedMove: selectedMove
				})
			});

			if (!res.ok) throw new Error('Analysis failed');

			const data = await res.json();
			analysis = data.analysis;
			blunderLevel = data.blunderLevel;
			notableDeltas = data.features?.notableDeltas || [];

			// Compute result boards
			playedBoard = applyMove(board, selectedMove);
			if (analysis?.bestMove) {
				bestBoard = applyMove(board, analysis.bestMove.move);
			}

			// Get explanation if blunder
			if (data.blunderLevel !== 'none') {
				explaining = true;
				const feat = data.features;
				const explainRes = await fetch('/api/explain', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						board,
						dice,
						playedMove: selectedMove,
						bestMove: data.analysis.bestMove.move,
						analysis: data.analysis,
						features: {
							playedFeatures: feat.played || feat.playedFeatures,
							bestFeatures: feat.best || feat.bestFeatures,
							notableDeltas: feat.notableDeltas || [],
							deltas: feat.deltas || []
						}
					})
				});

				if (explainRes.ok) {
					const explainData = await explainRes.json();
					explanation = explainData.explanation;
				}
				explaining = false;
			}
		} catch (e) {
			console.error(e);
		} finally {
			analyzing = false;
			explaining = false;
		}
	}

	function handleShowBoard(type: 'original' | 'played' | 'best') {
		viewMode = type;
	}

	function loadSample(sample: typeof SAMPLE_POSITIONS[0]) {
		board = JSON.parse(JSON.stringify(sample.board));
		originalBoard = JSON.parse(JSON.stringify(sample.board));
		die1 = sample.dice.die1;
		die2 = sample.dice.die2;
		selectedMove = null;
		analysis = null;
		explanation = null;
		viewMode = 'original';
	}

	function resetBoard() {
		board = JSON.parse(JSON.stringify(originalBoard));
		selectedMove = null;
		analysis = null;
		explanation = null;
		viewMode = 'original';
	}
</script>

<div class="review-page">
	<h2>Position Review</h2>

	<div class="review-layout">
		<div class="left-panel">
			<!-- Sample positions -->
			<div class="samples">
				<h3>Sample Positions</h3>
				{#each SAMPLE_POSITIONS as sample}
					<button class="sample-btn" onclick={() => loadSample(sample)}>
						{sample.name}
					</button>
				{/each}
			</div>

			<!-- Dice selection -->
			<div class="dice-select">
				<label>
					Dice:
					<select bind:value={die1}>
						{#each [1, 2, 3, 4, 5, 6] as v}
							<option value={v}>{v}</option>
						{/each}
					</select>
					<select bind:value={die2}>
						{#each [1, 2, 3, 4, 5, 6] as v}
							<option value={v}>{v}</option>
						{/each}
					</select>
				</label>
			</div>

			<!-- Legal moves list -->
			<div class="moves-list">
				<h3>Legal Moves ({legalMoves.length})</h3>
				<div class="moves-scroll">
					{#each legalMoves as move}
						<button
							class="move-btn"
							class:selected={selectedMove === move}
							onclick={() => handleMoveSelected(move)}
						>
							{formatMove(move)}
						</button>
					{/each}
				</div>
			</div>

			{#if selectedMove}
				<div class="action-bar">
					<span>Selected: {formatMove(selectedMove)}</span>
					<button class="analyze-btn" onclick={analyzeSelectedMove} disabled={analyzing}>
						{analyzing ? 'Analyzing...' : 'Analyze'}
					</button>
				</div>
			{/if}

			<button class="reset-btn" onclick={resetBoard}>Reset Board</button>
		</div>

		<div class="center-panel">
			<Board
				board={displayBoard}
				{dice}
				legalMoves={viewMode === 'original' ? legalMoves : []}
				interactive={viewMode === 'original'}
				onMoveSelected={handleMoveSelected}
			/>
			{#if viewMode !== 'original'}
				<div class="view-bar">
					<span class="view-label">Showing: {viewMode === 'played' ? 'After played move' : 'After best move'}</span>
					<button class="back-btn" onclick={() => { viewMode = 'original'; selectedMove = null; }}>Back to position</button>
				</div>
			{/if}
		</div>

		<div class="right-panel">
			<AnalysisPanel
				{analysis}
				{explanation}
				{blunderLevel}
				{notableDeltas}
				{explaining}
				onShowBoard={handleShowBoard}
			/>
		</div>
	</div>
</div>

<style>
	.review-page {
		max-width: 1200px;
		margin: 0 auto;
	}

	.review-page h2 {
		margin: 0 0 1rem;
	}

	.review-layout {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
		flex-wrap: wrap;
	}

	.left-panel {
		width: 200px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.center-panel {
		flex: 1;
		min-width: 400px;
	}

	.right-panel {
		width: 350px;
	}

	.samples h3,
	.moves-list h3 {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
	}

	.sample-btn {
		display: block;
		width: 100%;
		padding: 6px 10px;
		background: #1a1a2e;
		color: #e0e0e0;
		border: 1px solid #333;
		border-radius: 4px;
		cursor: pointer;
		text-align: left;
		font-size: 0.85rem;
		margin-bottom: 4px;
	}

	.sample-btn:hover {
		border-color: #4c6ef5;
	}

	.dice-select label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}

	.dice-select select {
		padding: 4px 8px;
		background: #1a1a2e;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
	}

	.moves-scroll {
		max-height: 200px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.move-btn {
		padding: 4px 8px;
		background: #222;
		color: #e0e0e0;
		border: 1px solid #333;
		border-radius: 3px;
		cursor: pointer;
		font-family: monospace;
		font-size: 0.8rem;
		text-align: left;
	}

	.move-btn:hover {
		border-color: #4c6ef5;
	}

	.move-btn.selected {
		background: #4c6ef5;
		border-color: #4c6ef5;
		color: white;
	}

	.action-bar {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.85rem;
		font-family: monospace;
	}

	.analyze-btn {
		padding: 8px 16px;
		background: #4c6ef5;
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.analyze-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.reset-btn {
		padding: 6px 12px;
		background: #333;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.85rem;
	}

	.view-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 0.5rem;
	}

	.view-label {
		font-size: 0.85rem;
		color: #aaa;
		font-style: italic;
	}

	.back-btn {
		padding: 4px 12px;
		background: #4c6ef5;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.back-btn:hover {
		background: #364fc7;
	}
</style>
