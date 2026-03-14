<script lang="ts">
	import { onMount } from 'svelte';
	import Board from '$lib/components/Board.svelte';
	import AnalysisPanel from '$lib/components/AnalysisPanel.svelte';
	import { auth } from '$lib/auth/authStore.js';
	import { initialBoard, flipBoard } from '$lib/backgammon/board.js';
	import { applyMove, formatMove } from '$lib/backgammon/rules.js';
	import { exportMat, parseMat } from '$lib/backgammon/matFormat.js';
	import type { SavedGame } from '$lib/storage/types.js';
	import type { BoardState, DiceRoll, MoveRecord, PositionAnalysis, BlunderLevel } from '$lib/backgammon/types.js';
	import type { ExplanationResult } from '$lib/llm/prompt.js';
	import type { FeatureDelta } from '$lib/features/types.js';

	let signedIn = $state(false);
	let games: SavedGame[] = $state([]);
	let loading = $state(false);
	let error: string | null = $state(null);

	// Game review state
	let selectedGame: SavedGame | null = $state(null);
	let currentMoveIndex = $state(0);
	let displayBoard: BoardState = $state(initialBoard());
	let currentDice: DiceRoll | null = $state(null);
	let currentRecord: MoveRecord | null = $state(null);

	// Analysis state
	let analysis: PositionAnalysis | null = $state(null);
	let explanation: ExplanationResult | null = $state(null);
	let blunderLevel: BlunderLevel = $state('none');
	let notableDeltas: FeatureDelta[] = $state([]);
	let analyzing = $state(false);
	let explaining = $state(false);

	// Analysis cache: moveIndex -> { analysis, blunderLevel, notableDeltas, features, explanation }
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	interface CachedAnalysis {
		analysis: PositionAnalysis;
		blunderLevel: BlunderLevel;
		notableDeltas: FeatureDelta[];
		features: any;
		explanation: ExplanationResult | null;
	}
	let analysisCache: Map<number, CachedAnalysis> = $state(new Map());

	function setCached(index: number, cached: CachedAnalysis) {
		analysisCache.set(index, cached);
		analysisCache = new Map(analysisCache); // trigger Svelte reactivity
	}

	auth.subscribe((s) => {
		signedIn = s.signedIn;
	});

	onMount(() => {
		auth.restore();
		const unsub = auth.subscribe((s) => {
			if (s.signedIn && s.idToken) {
				loadGames();
			}
		});
		return unsub;
	});

	async function loadGames() {
		loading = true;
		error = null;
		try {
			const token = await auth.getFreshToken();
			if (!token) throw new Error('Not signed in');
			const res = await fetch('/api/games', {
				headers: { 'Authorization': `Bearer ${token}` }
			});
			if (!res.ok) throw new Error(`Failed to load games (${res.status})`);
			const data = await res.json();
			games = data.games;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load games';
		} finally {
			loading = false;
		}
	}

	let batchAnalyzing = $state(false);
	let batchProgress = $state(0);
	let batchTotal = $state(0);
	let batchAbortController: AbortController | null = null;

	function selectGame(game: SavedGame) {
		// Cancel any previous batch analysis
		batchAbortController?.abort();
		selectedGame = game;
		currentMoveIndex = 0;
		analysisCache = new Map();
		clearAnalysis();
		goToMove(0);
		// Start batch analysis of all moves
		batchAnalyzeAll(game);
	}

	async function batchAnalyzeAll(game: SavedGame) {
		if (!game.moveHistory || game.moveHistory.length === 0) return;

		batchAbortController?.abort();
		const controller = new AbortController();
		batchAbortController = controller;

		const movesToAnalyze = game.moveHistory
			.map((rec, i) => ({ rec, index: i + 1 }))
			.filter(({ rec }) => rec.move.checkerMoves.length > 0); // Skip passes

		batchAnalyzing = true;
		batchProgress = 0;
		batchTotal = movesToAnalyze.length;

		for (const { rec, index } of movesToAnalyze) {
			if (controller.signal.aborted) break;
			if (analysisCache.has(index)) {
				batchProgress++;
				continue;
			}

			try {
				const ctx = getMoveContext(rec);
				const res = await fetch('/api/analyze', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						board: ctx.board,
						dice: rec.dice,
						playedMove: ctx.move
					}),
					signal: controller.signal
				});
				if (!res.ok) {
					batchProgress++;
					continue;
				}
				const data = await res.json();

				const cached: CachedAnalysis = {
					analysis: data.analysis,
					blunderLevel: data.blunderLevel,
					notableDeltas: data.features?.notableDeltas || [],
					features: data.features || null,
					explanation: null
				};
				setCached(index, cached);

				// Update current view if we're looking at this move
				if (currentMoveIndex === index) {
					analysis = cached.analysis;
					blunderLevel = cached.blunderLevel;
					notableDeltas = cached.notableDeltas;
				}
			} catch (e) {
				if (e instanceof DOMException && e.name === 'AbortError') break;
				console.warn(`Batch analysis failed for move ${index}:`, e);
			}
			batchProgress++;
		}

		if (!controller.signal.aborted) {
			batchAnalyzing = false;
		}
	}

	function clearAnalysis() {
		analysis = null;
		explanation = null;
		blunderLevel = 'none';
		notableDeltas = [];
	}

	/**
	 * Get the board and move in the correct perspective for a move record.
	 * For opponent moves, rec.board is player-perspective but rec.move is opponent-perspective,
	 * so we flip the board to match the move.
	 */
	function getMoveContext(rec: MoveRecord): { board: BoardState; move: typeof rec.move } {
		if (rec.player === 'opponent') {
			return { board: flipBoard(rec.board), move: rec.move };
		}
		return { board: rec.board, move: rec.move };
	}

	function goToMove(index: number) {
		if (!selectedGame?.moveHistory) return;
		currentMoveIndex = index;

		if (index === 0) {
			displayBoard = initialBoard();
			currentDice = selectedGame.moveHistory[0]?.dice || null;
			currentRecord = null;
			clearAnalysis();
		} else {
			// Replay moves up to this point — show board BEFORE this move was played
			const rec = selectedGame.moveHistory[index - 1];
			// Board is always stored in player perspective; show it as-is
			displayBoard = rec.board;
			currentRecord = rec;
			currentDice = rec.dice;

			// Check cache first
			const cached = analysisCache.get(index);
			if (cached) {
				analysis = cached.analysis;
				blunderLevel = cached.blunderLevel;
				notableDeltas = cached.notableDeltas;
				explanation = cached.explanation;
			} else {
				clearAnalysis();
				autoAnalyze(index);
			}
		}
	}

	function prevMove() {
		if (currentMoveIndex > 0) goToMove(currentMoveIndex - 1);
	}

	function nextMove() {
		if (selectedGame?.moveHistory && currentMoveIndex < selectedGame.moveHistory.length) {
			goToMove(currentMoveIndex + 1);
		}
	}

	let analyzeAbortController: AbortController | null = null;

	async function autoAnalyze(moveIndex: number) {
		if (!selectedGame?.moveHistory || moveIndex === 0) return;
		const rec = selectedGame.moveHistory[moveIndex - 1];
		if (rec.move.checkerMoves.length === 0) return; // Skip pass moves

		// Abort previous in-flight analysis
		analyzeAbortController?.abort();
		const controller = new AbortController();
		analyzeAbortController = controller;

		analyzing = true;

		try {
			const ctx = getMoveContext(rec);
			// If batch analysis hasn't reached this move yet, do a single analysis
			if (!analysisCache.has(moveIndex)) {
				const res = await fetch('/api/analyze', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						board: ctx.board,
						dice: rec.dice,
						playedMove: ctx.move
					}),
					signal: controller.signal
				});
				if (!res.ok) throw new Error('Analysis failed');
				const data = await res.json();

				if (currentMoveIndex !== moveIndex) return;

				const cached: CachedAnalysis = {
					analysis: data.analysis,
					blunderLevel: data.blunderLevel,
					notableDeltas: data.features?.notableDeltas || [],
					features: data.features || null,
					explanation: null
				};
				setCached(moveIndex, cached);
			}

			const cached = analysisCache.get(moveIndex)!;
			if (currentMoveIndex !== moveIndex) return;

			analysis = cached.analysis;
			blunderLevel = cached.blunderLevel;
			notableDeltas = cached.notableDeltas;
			explanation = cached.explanation;
			analyzing = false;

			// Fetch LLM explanation on demand for non-trivial moves (if not already cached)
			if (cached.blunderLevel !== 'none' && !cached.explanation) {
				explaining = true;
				const feat = cached.features || {};
				const explainRes = await fetch('/api/explain', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						board: ctx.board,
						dice: rec.dice,
						playedMove: ctx.move,
						bestMove: cached.analysis.bestMove.move,
						analysis: cached.analysis,
						features: {
							playedFeatures: feat.played || feat.playedFeatures || {},
							bestFeatures: feat.best || feat.bestFeatures || {},
							notableDeltas: feat.notableDeltas || cached.notableDeltas || [],
							deltas: feat.deltas || []
						}
					}),
					signal: controller.signal
				});
				if (explainRes.ok && currentMoveIndex === moveIndex) {
					const explainData = await explainRes.json();
					explanation = explainData.explanation;
					setCached(moveIndex, { ...cached, explanation: explainData.explanation });
				}
				explaining = false;
			}
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			console.error(e);
		} finally {
			if (currentMoveIndex === moveIndex) {
				analyzing = false;
				explaining = false;
			}
		}
	}

	function handleShowBoard(type: 'original' | 'played' | 'best') {
		if (!selectedGame?.moveHistory || currentMoveIndex === 0) return;
		const rec = selectedGame.moveHistory[currentMoveIndex - 1];
		const ctx = getMoveContext(rec);
		if (type === 'played') {
			// Apply move in correct perspective, then flip back if opponent
			let result = applyMove(ctx.board, ctx.move);
			if (rec.player === 'opponent') result = flipBoard(result);
			displayBoard = result;
		} else if (type === 'best' && analysis?.bestMove) {
			let result = applyMove(ctx.board, analysis.bestMove.move);
			if (rec.player === 'opponent') result = flipBoard(result);
			displayBoard = result;
		} else {
			displayBoard = rec.board;
		}
	}

	function getEquityLoss(moveIndex: number): number | null {
		const cached = analysisCache.get(moveIndex);
		return cached ? cached.analysis.equityLoss : null;
	}

	function getBlunderLevel(moveIndex: number): BlunderLevel {
		const cached = analysisCache.get(moveIndex);
		return cached ? cached.blunderLevel : 'none';
	}

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleString();
	}

	// --- Export / Import ---

	function downloadGame(game: SavedGame) {
		const content = exportMat(game);
		const date = new Date(game.timestamp).toISOString().slice(0, 10);
		const filename = `backgammon-${date}-${game.id.slice(0, 8)}.mat`;

		const blob = new Blob([content], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	let importError: string | null = $state(null);
	let showImport = $state(false);
	let pasteText = $state('');
	let importedGames: SavedGame[] = $state([]);

	function triggerUpload() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.mat,.gam,.txt';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			importError = null;
			try {
				const text = await file.text();
				const parsed = parseMat(text);
				if (parsed.length === 0) throw new Error('No games found in file');
				importedGames = parsed;
				if (parsed.length === 1) {
					selectGame(parsed[0]);
					showImport = false;
				}
			} catch (e) {
				importError = e instanceof Error ? e.message : 'Failed to parse file';
			}
		};
		input.click();
	}

	function importFromPaste() {
		importError = null;
		try {
			const parsed = parseMat(pasteText);
			if (parsed.length === 0) throw new Error('No games found in pasted text');
			importedGames = parsed;
			if (parsed.length === 1) {
				selectGame(parsed[0]);
				showImport = false;
				pasteText = '';
			}
		} catch (e) {
			importError = e instanceof Error ? e.message : 'Failed to parse text';
		}
	}

	function selectImportedGame(game: SavedGame) {
		selectGame(game);
		showImport = false;
		pasteText = '';
		importedGames = [];
	}
</script>

<div class="my-games-page">
	<h2>My Games</h2>

	{#if !signedIn}
		<p class="sign-in-msg">Sign in with Google to save and review your games.</p>
		<div class="toolbar" style="margin-top: 1rem">
			<button class="tool-btn" onclick={() => { showImport = !showImport; importedGames = []; importError = null; }}>
				{showImport ? 'Cancel' : 'Import Game (.mat)'}
			</button>
		</div>
		{#if showImport}
			<div class="import-panel">
				<div class="import-options">
					<button class="tool-btn" onclick={triggerUpload}>Upload .mat file</button>
					<span class="import-or">or paste below:</span>
				</div>
				<textarea class="paste-area" bind:value={pasteText} rows="8"
					placeholder="Paste .mat game text here..."></textarea>
				{#if pasteText.trim()}
					<button class="tool-btn primary" onclick={importFromPaste}>Parse</button>
				{/if}
				{#if importError}
					<p class="error">{importError}</p>
				{/if}
				{#if importedGames.length > 1}
					<div class="imported-list">
						<p>{importedGames.length} games found. Select one:</p>
						{#each importedGames as game, i}
							<button class="game-card" onclick={() => selectImportedGame(game)}>
								<div class="game-info">Game {i + 1} — {game.moveCount} moves</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{:else if loading}
		<p>Loading games...</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else if !selectedGame}
		<div class="toolbar">
			<button class="tool-btn" onclick={() => { showImport = !showImport; importedGames = []; importError = null; }}>
				{showImport ? 'Cancel' : 'Import Game'}
			</button>
		</div>

		{#if showImport}
			<div class="import-panel">
				<div class="import-options">
					<button class="tool-btn" onclick={triggerUpload}>Upload .mat file</button>
					<span class="import-or">or paste below:</span>
				</div>
				<textarea class="paste-area" bind:value={pasteText} rows="8"
					placeholder="Paste .mat game text here..."></textarea>
				{#if pasteText.trim()}
					<button class="tool-btn primary" onclick={importFromPaste}>Parse</button>
				{/if}
				{#if importError}
					<p class="error">{importError}</p>
				{/if}
				{#if importedGames.length > 1}
					<div class="imported-list">
						<p>{importedGames.length} games found. Select one:</p>
						{#each importedGames as game, i}
							<button class="game-card" onclick={() => selectImportedGame(game)}>
								<div class="game-info">Game {i + 1} — {game.moveCount} moves</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Game list -->
		{#if games.length === 0 && !showImport}
			<p class="empty">No games saved yet. Complete a game to see it here.</p>
		{:else if games.length > 0}
			<div class="game-list">
				{#each games as game}
					<button class="game-card" onclick={() => selectGame(game)}>
						<div class="game-date">{formatDate(game.timestamp)}</div>
						<div class="game-info">
							<span class="game-result" class:win={game.winner === 'player'} class:loss={game.winner === 'opponent'}>
								{game.winner === 'player' ? 'Won' : 'Lost'}
							</span>
							<span class="game-diff">{game.difficulty}</span>
							<span class="game-moves">{game.moveCount} moves</span>
						</div>
						{#if game.analysis}
							<div class="game-stats">
								{#if game.analysis.blunderCount > 0}
									<span class="stat blunder">{game.analysis.blunderCount} blunder{game.analysis.blunderCount > 1 ? 's' : ''}</span>
								{/if}
								{#if game.analysis.mistakeCount > 0}
									<span class="stat mistake">{game.analysis.mistakeCount} mistake{game.analysis.mistakeCount > 1 ? 's' : ''}</span>
								{/if}
								<span class="stat equity">Equity loss: {game.analysis.totalEquityLoss.toFixed(3)}</span>
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	{:else}
		<!-- Game review -->
		<div class="review-toolbar">
			<button class="back-link" onclick={() => { selectedGame = null; clearAnalysis(); }}>
				&larr; Back to games
			</button>
			<button class="tool-btn small" onclick={() => downloadGame(selectedGame!)}>
				Download .mat
			</button>
		</div>

		<div class="review-layout">
			<div class="game-meta">
				<div>{formatDate(selectedGame.timestamp)}</div>
				<div>
					<span class="game-result" class:win={selectedGame.winner === 'player'} class:loss={selectedGame.winner === 'opponent'}>
						{selectedGame.winner === 'player' ? 'Won' : 'Lost'}
					</span>
					vs {selectedGame.difficulty}
				</div>
			</div>

			<div class="board-panel">
				<Board board={displayBoard} dice={currentDice}
					bestMove={analysis?.bestMove ? analysis.bestMove.move : null}
					playedMove={currentRecord ? currentRecord.move : null}
					isOpponentMove={currentRecord?.player === 'opponent'} />
			</div>

			{#if selectedGame.moveHistory}
				<div class="move-nav">
					<button onclick={prevMove} disabled={currentMoveIndex === 0}>&laquo; Prev</button>
					<span>Move {currentMoveIndex} / {selectedGame.moveHistory.length}</span>
					<button onclick={nextMove} disabled={currentMoveIndex >= selectedGame.moveHistory.length}>Next &raquo;</button>
					{#if batchAnalyzing}
						<span class="batch-progress">
							<span class="spinner"></span>
							Analyzing {batchProgress}/{batchTotal}
						</span>
					{/if}
				</div>

				<div class="below-board">
					<div class="moves-panel">
						<div class="move-list">
							<button class="move-item" class:active={currentMoveIndex === 0}
								onclick={() => goToMove(0)}>Start</button>
							{#each selectedGame.moveHistory as rec, i}
								{@const eqLoss = getEquityLoss(i + 1)}
								{@const bl = getBlunderLevel(i + 1)}
								<button class="move-item" class:active={currentMoveIndex === i + 1}
									class:player-move={rec.player === 'player'}
									class:opp-move={rec.player === 'opponent'}
									class:is-blunder={bl === 'blunder' || bl === 'hugeBlunder'}
									class:is-mistake={bl === 'mistake'}
									class:is-inaccuracy={bl === 'inaccuracy'}
									onclick={() => goToMove(i + 1)}>
									<span class="move-num">#{rec.moveNumber}</span>
									<span class="move-player">{rec.player === 'player' ? 'You' : 'CPU'}</span>
									<span class="move-dice">{rec.dice.die1}-{rec.dice.die2}</span>
									<span class="move-text">{rec.move.checkerMoves.length > 0 ? formatMove(rec.move) : 'pass'}</span>
									{#if eqLoss !== null}
										{#if eqLoss > 0.001}
											<span class="move-eq-loss" class:eq-bad={eqLoss > 0.05} class:eq-terrible={eqLoss > 0.15}>
												-{eqLoss.toFixed(3)}
											</span>
										{:else}
											<span class="move-eq-loss eq-perfect">0.000</span>
										{/if}
									{/if}
								</button>
							{/each}
						</div>
					</div>

					<div class="analysis-side">
						{#if currentMoveIndex === 0}
							<div class="analysis-placeholder">
								Select a move to see analysis.
							</div>
						{:else if analyzing}
							<div class="analysis-placeholder">
								<span class="spinner"></span>
								Analyzing...
							</div>
						{:else if analysis}
							<AnalysisPanel {analysis} {explanation} {blunderLevel} {notableDeltas} {explaining}
								onShowBoard={handleShowBoard} />
						{:else if currentRecord?.move.checkerMoves.length === 0}
							<div class="analysis-placeholder">
								Pass — no moves to analyze.
							</div>
						{:else}
							<div class="analysis-placeholder">
								Analysis unavailable.
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<p class="no-history">Move history not available for this game.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.my-games-page {
		max-width: 1200px;
		margin: 0 auto;
	}

	.my-games-page h2 {
		margin: 0 0 1rem;
	}

	.sign-in-msg, .empty {
		color: #888;
		font-style: italic;
	}

	.error {
		color: #ff6b6b;
	}

	/* Game list */
	.game-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 600px;
	}

	.game-card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.75rem 1rem;
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 8px;
		cursor: pointer;
		text-align: left;
		color: #e0e0e0;
		transition: border-color 0.2s;
	}

	.game-card:hover {
		border-color: #4c6ef5;
	}

	.game-date {
		font-size: 0.8rem;
		color: #888;
	}

	.game-info {
		display: flex;
		gap: 1rem;
		font-size: 0.9rem;
	}

	.game-result {
		font-weight: bold;
	}

	.game-result.win { color: #51cf66; }
	.game-result.loss { color: #ff6b6b; }

	.game-diff {
		color: #aaa;
		text-transform: capitalize;
	}

	.game-moves {
		color: #888;
	}

	.game-stats {
		display: flex;
		gap: 0.75rem;
		font-size: 0.8rem;
	}

	.stat.blunder { color: #ff6b6b; }
	.stat.mistake { color: #ffa94d; }
	.stat.equity { color: #888; }

	/* Toolbar */
	.toolbar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.tool-btn {
		padding: 6px 14px;
		background: #333;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.85rem;
	}

	.tool-btn:hover {
		background: #444;
	}

	.tool-btn.primary {
		background: #4c6ef5;
		border-color: #4c6ef5;
		color: white;
	}

	.tool-btn.small {
		padding: 3px 10px;
		font-size: 0.8rem;
	}

	.review-toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	/* Import panel */
	.import-panel {
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 1rem;
		max-width: 600px;
	}

	.import-options {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.import-or {
		color: #888;
		font-size: 0.85rem;
	}

	.paste-area {
		width: 100%;
		background: #0f0f23;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
		padding: 0.5rem;
		font-family: monospace;
		font-size: 0.8rem;
		resize: vertical;
		margin-bottom: 0.5rem;
	}

	.imported-list {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.imported-list p {
		font-size: 0.85rem;
		color: #aaa;
		margin: 0 0 0.25rem;
	}

	/* Review layout */
	.back-link {
		background: none;
		border: none;
		color: #4c6ef5;
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0;
		margin-bottom: 1rem;
	}

	.back-link:hover {
		text-decoration: underline;
	}

	.review-layout {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.game-meta {
		font-size: 0.9rem;
		color: #ccc;
	}

	.board-panel {
		max-width: 600px;
	}

	.move-nav {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.75rem;
		font-size: 0.85rem;
	}

	.move-nav button {
		padding: 4px 10px;
		background: #333;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.move-nav button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.batch-progress {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		color: #888;
		margin-left: 0.5rem;
	}

	.below-board {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
	}

	.moves-panel {
		width: 280px;
		flex-shrink: 0;
	}

	.analysis-side {
		flex: 1;
		min-width: 0;
	}

	.analysis-placeholder {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #666;
		font-size: 0.9rem;
		padding: 1rem;
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 8px;
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

	.move-list {
		max-height: 400px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.move-item {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		padding: 3px 6px;
		background: #1a1a2e;
		border: 1px solid transparent;
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.75rem;
		font-family: monospace;
		color: #ccc;
		text-align: left;
	}

	.move-item:hover {
		border-color: #4c6ef5;
	}

	.move-item.active {
		background: #4c6ef5;
		color: white;
	}

	.move-item.is-blunder {
		border-left: 3px solid #ff6b6b;
	}

	.move-item.is-mistake {
		border-left: 3px solid #ffa94d;
	}

	.move-item.is-inaccuracy {
		border-left: 3px solid #ffd43b;
	}

	.move-item.player-move .move-player { color: #51cf66; }
	.move-item.opp-move .move-player { color: #ff8787; }
	.move-item.active .move-player { color: white; }

	.move-num { color: #666; min-width: 20px; }
	.move-item.active .move-num { color: rgba(255,255,255,0.7); }

	.move-eq-loss {
		margin-left: auto;
		font-size: 0.7rem;
		color: #ffa94d;
	}

	.move-eq-loss.eq-bad {
		color: #ff6b6b;
	}

	.move-eq-loss.eq-terrible {
		color: #c92a2a;
		font-weight: bold;
	}

	.move-eq-loss.eq-perfect {
		color: #51cf66;
	}

	.move-item.active .move-eq-loss {
		color: rgba(255,255,255,0.8);
	}

	.no-history {
		color: #888;
		font-size: 0.85rem;
		font-style: italic;
	}

	@media (max-width: 600px) {
		.below-board {
			flex-direction: column;
		}

		.moves-panel {
			width: 100%;
		}

		.board-panel {
			max-width: none;
		}

		.game-list {
			max-width: none;
		}

		.move-list {
			max-height: 200px;
		}
	}
</style>
