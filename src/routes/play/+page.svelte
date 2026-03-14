<script lang="ts">
	import Board from '$lib/components/Board.svelte';
	import AnalysisPanel from '$lib/components/AnalysisPanel.svelte';
	import type {
		GameState, Move, PositionAnalysis, BlunderLevel, BoardState, DiceRoll, CheckerMove
	} from '$lib/backgammon/types.js';
	import type { ExplanationResult } from '$lib/llm/prompt.js';
	import type { FeatureDelta } from '$lib/features/types.js';
	import { formatMove } from '$lib/backgammon/rules.js';
	import { flipBoard, pipCount } from '$lib/backgammon/board.js';
	import { BAR, OFF } from '$lib/backgammon/types.js';
	import { auth } from '$lib/auth/authStore.js';

	let game: GameState | null = $state(null);
	let legalMoves: Move[] = $state([]);
	let loading = $state(false);
	let error: string | null = $state(null);
	let difficulty: string = $state('strong');
	let status = $state('');

	// Analysis state
	let currentAnalysis: PositionAnalysis | null = $state(null);
	let currentExplanation: ExplanationResult | null = $state(null);
	let currentBlunderLevel: BlunderLevel = $state('none');
	let notableDeltas: FeatureDelta[] = $state([]);
	let showAnalysis = $state(false);
	let explaining = $state(false);
	let lastEquity: number | null = $state(null);
	let lastWinProb: number | null = $state(null);
	let showStatsInfo = $state(false);
	let pauseOnBlunders = $state(true);
	let preMoveBoard: BoardState | null = $state(null);
	let currentPlayedMove: Move | null = $state(null);

	// Roll / computer move display state
	let waitingForRoll = $state(false);
	let lastComputerDice: DiceRoll | null = $state(null);
	let lastComputerGhostMove: { checkerMoves: { from: number; to: number }[] } | null = $state(null);

	// Board component reference for calling animation methods
	let boardRef: any = $state(null);

	/** Convert a computer move (in flipped/computer perspective) to player perspective for ghost display */
	function flipMoveToPlayerPerspective(move: Move): { checkerMoves: { from: number; to: number }[] } {
		return {
			checkerMoves: move.checkerMoves.map(cm => ({
				from: cm.from === BAR ? BAR : cm.from === OFF ? OFF : 25 - cm.from,
				to: cm.to === BAR ? BAR : cm.to === OFF ? OFF : 25 - cm.to
			}))
		};
	}

	// Per-move analysis history (keyed by moveNumber)
	interface MoveAnalysisRecord {
		equityLoss: number;
		blunderLevel: BlunderLevel;
	}
	let moveAnalysisMap: Map<number, MoveAnalysisRecord> = $state(new Map());

	/** Save completed game to server if user is signed in */
	async function saveCompletedGame() {
		if (!game?.gameOver || !game.winner) return;

		// Get a fresh token (refreshes silently if expired)
		const token = await auth.getFreshToken();
		if (!token) return;

		const now = new Date();
		const date = now.toISOString().slice(0, 10);
		let totalEquityLoss = 0;
		let blunderCount = 0;
		let mistakeCount = 0;
		for (const [, rec] of moveAnalysisMap) {
			totalEquityLoss += rec.equityLoss;
			if (rec.blunderLevel === 'blunder' || rec.blunderLevel === 'hugeBlunder') blunderCount++;
			if (rec.blunderLevel === 'mistake') mistakeCount++;
		}

		try {
			await fetch('/api/games', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				body: JSON.stringify({
					game: {
						id: game.id,
						date,
						timestamp: now.getTime(),
						difficulty: game.difficulty,
						winner: game.winner,
						moveCount: game.moveNumber,
						moveHistory: game.moveHistory,
						analysis: { totalEquityLoss, blunderCount, mistakeCount }
					}
				})
			});
		} catch {
			// Save failure is non-critical
		}
	}

	// --- localStorage persistence ---
	const STORAGE_KEY = 'bgteacher-game';
	let restoredFromStorage = false;

	interface SavedState {
		game: GameState;
		waitingForRoll: boolean;
		status: string;
		legalMoves: Move[];
		lastComputerDice: DiceRoll | null;
		lastComputerGhostMove: { checkerMoves: { from: number; to: number }[] } | null;
		moveAnalysisMap: [number, MoveAnalysisRecord][];
		lastEquity?: number | null;
		lastWinProb?: number | null;
		// Blunder review state
		showAnalysis?: boolean;
		currentAnalysis?: PositionAnalysis | null;
		currentExplanation?: ExplanationResult | null;
		currentBlunderLevel?: BlunderLevel;
		notableDeltas?: FeatureDelta[];
		preMoveBoard?: BoardState | null;
		currentPlayedMove?: Move | null;
		pendingGameData?: { game: GameState; legalMoves: Move[] } | null;
	}

	function saveToStorage() {
		if (!game || game.gameOver) {
			localStorage.removeItem(STORAGE_KEY);
			return;
		}
		const data: SavedState = {
			game,
			waitingForRoll,
			status,
			legalMoves,
			lastComputerDice,
			lastComputerGhostMove,
			moveAnalysisMap: Array.from(moveAnalysisMap.entries()),
			lastEquity,
			lastWinProb,
			showAnalysis,
			currentAnalysis,
			currentExplanation,
			currentBlunderLevel,
			notableDeltas,
			preMoveBoard,
			currentPlayedMove,
			pendingGameData
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}

	/** Wrapper for game API calls: includes game state so server can auto-restore on any instance */
	async function gameApiFetch(url: string, body: Record<string, any>): Promise<Response> {
		// Always include current game state for multi-instance auto-restore
		const payload = game ? { ...body, game } : body;
		return fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
	}

	async function restoreFromStorage(): Promise<boolean> {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return false;

		try {
			const data: SavedState = JSON.parse(raw);
			if (!data.game?.id || data.game.gameOver) {
				localStorage.removeItem(STORAGE_KEY);
				return false;
			}

			// Re-register game on server
			const res = await fetch('/api/game?action=restore', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ game: data.game })
			});

			if (!res.ok) {
				localStorage.removeItem(STORAGE_KEY);
				return false;
			}

			const result = await res.json();
			game = result.game;
			legalMoves = result.legalMoves;
			difficulty = data.game.difficulty || 'strong';
			waitingForRoll = data.waitingForRoll || false;
			status = data.status || '';
			lastComputerDice = data.lastComputerDice || null;
			lastComputerGhostMove = data.lastComputerGhostMove || null;
			if (data.moveAnalysisMap) {
				moveAnalysisMap = new Map(data.moveAnalysisMap);
			}
			if (data.lastEquity != null) lastEquity = data.lastEquity;
			if (data.lastWinProb != null) lastWinProb = data.lastWinProb;

			// Restore blunder review state
			if (data.showAnalysis) {
				showAnalysis = true;
				currentAnalysis = data.currentAnalysis || null;
				currentExplanation = data.currentExplanation || null;
				currentBlunderLevel = data.currentBlunderLevel || 'none';
				notableDeltas = data.notableDeltas || [];
				preMoveBoard = data.preMoveBoard || null;
				currentPlayedMove = data.currentPlayedMove || null;
				pendingGameData = data.pendingGameData || null;
			}

			// If it was the computer's turn mid-move, re-trigger
			if (!data.showAnalysis && result.game.turn === 'opponent' && result.game.diceRolled) {
				await computerTurn();
			}

			return true;
		} catch {
			localStorage.removeItem(STORAGE_KEY);
			return false;
		}
	}

	// Save to localStorage whenever game state changes
	$effect(() => {
		if (game && restoredFromStorage) {
			saveToStorage();
		}
	});

	// Restore on mount
	$effect(() => {
		if (restoredFromStorage) return;
		restoredFromStorage = true;

		// Init from localStorage (only runs in browser)
		pauseOnBlunders = localStorage.getItem('bgteacher-pause-blunders') !== 'false';

		restoreFromStorage().then(restored => {
			if (!restored) {
				// No saved game — user sees the start screen
			}
		});
	});

	async function startGame() {
		localStorage.removeItem(STORAGE_KEY);
		loading = true;
		error = null;
		currentAnalysis = null;
		showAnalysis = false;
		moveAnalysisMap = new Map();
		lastEquity = null;
		lastWinProb = null;
		waitingForRoll = false;
		lastComputerDice = null;
		lastComputerGhostMove = null;

		try {
			const res = await fetch('/api/game?action=create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ difficulty })
			});
			if (!res.ok) {
				error = `Failed to create game (${res.status})`;
				loading = false;
				return;
			}
			const data = await res.json();
			game = data.game;
			legalMoves = data.legalMoves || [];

			if (game?.turn === 'opponent') {
				status = "Computer's turn...";
				await computerTurn();
			} else {
				status = `Your turn. Dice: ${game?.dice?.die1}-${game?.dice?.die2}`;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to start game';
		} finally {
			loading = false;
		}
	}

	// Stored game data after player's move, used when resuming after blunder pause
	let pendingGameData: { game: GameState; legalMoves: Move[] } | null = $state(null);

	async function handleMoveSelected(move: Move) {
		if (!game) return;
		loading = true;
		showAnalysis = false;
		currentAnalysis = null;
		preMoveBoard = null;
		currentPlayedMove = null;
		lastComputerDice = null;
		lastComputerGhostMove = null;

		try {
			const moveNumber = game.moveNumber;
			const boardBeforeMove = game.board;

			// Submit the move
			const res = await gameApiFetch('/api/game?action=move', { gameId: game.id, move });
			const data = await res.json();

			if (!res.ok) {
				error = data.message || 'Invalid move';
				loading = false;
				return;
			}

			// Analyze the player's move
			await analyzeMove(boardBeforeMove, game.dice!, move, moveNumber);

			// If blunder detected, pause and wait for Continue
			if (showAnalysis) {
				pendingGameData = { game: data.game, legalMoves: data.legalMoves || [] };
				preMoveBoard = boardBeforeMove;
				currentPlayedMove = move;
				game = data.game;
				legalMoves = [];
				status = 'Review your move...';
				loading = false;
				return;
			}

			game = data.game;
			legalMoves = data.legalMoves || [];
			await continueAfterMove();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Move failed';
		} finally {
			loading = false;
		}
	}

	async function continueAfterMove() {
		if (!game) return;
		if (game.gameOver) {
			status = game.winner === 'player' ? 'You win!' : 'Computer wins!';
			saveCompletedGame();
		} else if (game.turn === 'opponent') {
			loading = true;
			try {
				await rollAndComputerTurn();
			} finally {
				loading = false;
			}
		} else {
			// Wait for user to click Roll
			waitingForRoll = true;
		}
	}

	async function dismissAnalysis() {
		showAnalysis = false;
		preMoveBoard = null;
		currentPlayedMove = null;
		if (pendingGameData) {
			game = pendingGameData.game;
			legalMoves = pendingGameData.legalMoves;
			pendingGameData = null;
			await continueAfterMove();
		}
	}

	async function takeBack() {
		if (!game) return;
		const moveNumber = game.moveNumber - 1; // the move we're undoing
		try {
			const res = await gameApiFetch('/api/game?action=undo', { gameId: game.id });
			if (!res.ok) return;
			const data = await res.json();
			game = data.game;
			legalMoves = data.legalMoves || [];
			showAnalysis = false;
			pendingGameData = null;
			preMoveBoard = null;
			currentPlayedMove = null;
			moveAnalysisMap.delete(moveNumber);
			status = `Your turn. Dice: ${game?.dice?.die1}-${game?.dice?.die2}`;
		} catch {
			// undo failed, non-critical
		}
	}

	async function rollForPlayer() {
		if (!game) return;
		waitingForRoll = false;
		lastComputerDice = null;
		lastComputerGhostMove = null;

		const res = await gameApiFetch('/api/game?action=roll', { gameId: game.id });
		if (!res.ok) {
			error = `Roll failed (${res.status}). Try starting a new game.`;
			return;
		}
		const data = await res.json();
		game = data.game;
		legalMoves = data.legalMoves || [];

		// Auto-play pass if no legal moves
		const isPass = legalMoves.length === 1 && legalMoves[0].checkerMoves.length === 0;
		if (isPass) {
			status = `You rolled ${game?.dice?.die1}-${game?.dice?.die2} — no legal moves.`;
			await new Promise(r => setTimeout(r, 1500));
			await handleMoveSelected(legalMoves[0]);
			return;
		}

		status = `Your turn. Dice: ${game?.dice?.die1}-${game?.dice?.die2}`;
	}

	async function rollAndComputerTurn() {
		if (!game) return;
		// Roll dice for computer
		const rollRes = await gameApiFetch('/api/game?action=roll', { gameId: game.id });
		if (!rollRes.ok) {
			error = `Computer roll failed (${rollRes.status}). Try starting a new game.`;
			return;
		}
		const rollData = await rollRes.json();
		game = rollData.game;
		status = `Computer rolls ${game?.dice?.die1}-${game?.dice?.die2}...`;

		await computerTurn();
	}

	async function computerTurn() {
		if (!game || !game.dice) return;
		const computerDice = game.dice;

		try {
			// Start fetching computer's move and dice animation delay in parallel
			const movePromise = fetch('/api/computer-move', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					board: flipBoard(game.board),
					dice: game.dice,
					difficulty: game.difficulty
				})
			});

			// Let dice animation play
			await new Promise((r) => setTimeout(r, 350));

			const moveRes = await movePromise;
			if (!moveRes.ok) {
				error = `Computer move failed (${moveRes.status}). Try starting a new game.`;
				return;
			}
			const moveData = await moveRes.json();

			// Apply the computer's move on server (don't update client game yet)
			const applyRes = await gameApiFetch('/api/game?action=move', { gameId: game.id, move: moveData.move });
			if (!applyRes.ok) {
				const errBody = await applyRes.json().catch(() => ({}));
				error = errBody.message || `Move apply failed (${applyRes.status}). Try starting a new game.`;
				return;
			}
			const applyData = await applyRes.json();

			const isPass = !moveData.move || moveData.move.checkerMoves.length === 0;

			// Animate checker moves before updating board state
			if (!isPass && boardRef?.animateOpponentMove) {
				const flipped = flipMoveToPlayerPerspective(moveData.move);
				await boardRef.animateOpponentMove(flipped.checkerMoves);
			}

			// Now update client state
			game = applyData.game;
			lastComputerDice = computerDice;
			lastComputerGhostMove = isPass ? null : flipMoveToPlayerPerspective(moveData.move);

			if (game?.gameOver) {
				status = game.winner === 'player' ? 'You win!' : 'Computer wins!';
				saveCompletedGame();
			} else if (isPass) {
				status = `Computer rolled ${computerDice.die1}-${computerDice.die2} — no legal moves. Your turn to roll.`;
				waitingForRoll = true;
			} else {
				status = `Computer rolled ${computerDice.die1}-${computerDice.die2}: ${formatMove(moveData.move)}. Your turn to roll.`;
				waitingForRoll = true;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Computer move failed';
		}
	}

	async function analyzeMove(board: BoardState, dice: { die1: number; die2: number }, move: Move, moveNumber: number) {
		try {
			const res = await fetch('/api/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ board, dice, playedMove: move })
			});

			if (!res.ok) return;

			const data = await res.json();
			currentAnalysis = data.analysis;
			currentBlunderLevel = data.blunderLevel;
			notableDeltas = data.features?.notableDeltas || [];

			// Track position equity and win probability
			const src = data.analysis.playedMove ?? data.analysis.bestMove;
			if (src?.equity != null) lastEquity = src.equity;
			if (src?.winProb != null) lastWinProb = src.winProb;

			// Store per-move analysis
			moveAnalysisMap.set(moveNumber, {
				equityLoss: data.analysis.equityLoss ?? 0,
				blunderLevel: data.blunderLevel
			});

			if (data.blunderLevel !== 'none' && pauseOnBlunders) {
				// Get explanation for blunders
				showAnalysis = true;
				await getExplanation(board, dice, move, data);
			}
		} catch {
			// Analysis failure is non-critical
		}
	}

	async function getExplanation(
		board: BoardState,
		dice: { die1: number; die2: number },
		move: Move,
		analysisData: any
	) {
		explaining = true;
		try {
			const feat = analysisData.features;
			const res = await fetch('/api/explain', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					board,
					dice,
					playedMove: move,
					bestMove: analysisData.analysis.bestMove.move,
					analysis: analysisData.analysis,
					features: {
						playedFeatures: feat.played || feat.playedFeatures,
						bestFeatures: feat.best || feat.bestFeatures,
						notableDeltas: feat.notableDeltas || [],
						deltas: feat.deltas || []
					}
				})
			});

			if (res.ok) {
				const data = await res.json();
				currentExplanation = data.explanation;
			}
		} catch {
			// Explanation failure is non-critical
		} finally {
			explaining = false;
		}
	}
</script>

<div class="play-page">
	<div class="play-header">
		<h2>Play vs Computer</h2>
		<div class="game-controls">
			<select bind:value={difficulty}>
				<option value="beginner">Beginner</option>
				<option value="intermediate">Intermediate</option>
				<option value="strong">Strong</option>
			</select>
			<label class="toggle-label">
				<input type="checkbox" bind:checked={pauseOnBlunders} onchange={() => localStorage.setItem('bgteacher-pause-blunders', String(pauseOnBlunders))} />
				Pause on blunders
			</label>
			<button class="start-btn" onclick={startGame} disabled={loading}>
				{game ? 'New Game' : 'Start Game'}
			</button>
		</div>
	</div>

	{#if error}
		<div class="error">{error}</div>
	{/if}

	{#if game}
		<div class="game-layout">
			<div class="board-area">
				<div class="status-bar">
					<span>{status}</span>
					<span class="status-stats">
						Pips: {pipCount(showAnalysis && preMoveBoard ? preMoveBoard : game.board, 'player')} / {pipCount(showAnalysis && preMoveBoard ? preMoveBoard : game.board, 'opponent')}
						{#if lastWinProb != null}
							<span class="stats-sep">|</span>
							Win: {(lastWinProb * 100).toFixed(0)}%
						{/if}
						{#if lastEquity != null}
							<span class="stats-sep">|</span>
							EV: {lastEquity >= 0 ? '+' : ''}{lastEquity.toFixed(3)}
						{/if}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<span class="info-icon" onclick={() => showStatsInfo = !showStatsInfo}>
							<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
								<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
								<text x="8" y="12" text-anchor="middle" font-size="11" font-weight="bold">i</text>
							</svg>
						</span>
					</span>
					{#if showStatsInfo}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div class="stats-info-overlay" onclick={() => showStatsInfo = false}></div>
						<div class="stats-info-popup">
							<strong>Pips</strong>: Total distance each player's checkers must travel to bear off. Lower is better. Shown as You / CPU.<br>
							<strong>Win</strong>: Your estimated winning chance based on GNU Backgammon analysis.<br>
							<strong>EV</strong>: Expected value of the position. Ranges from -3 (lose backgammon) to +3 (win backgammon). A single game win/loss is +1/-1, gammon is +2/-2, backgammon +3/-3.
						</div>
					{/if}
				</div>
				<Board
					bind:this={boardRef}
					board={showAnalysis && preMoveBoard ? preMoveBoard : game.board}
					dice={game.dice || lastComputerDice}
					{legalMoves}
					interactive={game.turn === 'player' && !game.gameOver && game.diceRolled && !showAnalysis}
					bestMove={showAnalysis ? currentAnalysis?.bestMove.move : null}
					playedMove={showAnalysis ? currentPlayedMove : null}
					ghostMove={lastComputerGhostMove}
					onMoveSelected={handleMoveSelected}
				/>
				{#if showAnalysis}
					<div class="arrow-legend">
						<span class="legend-best">&#x2192; Best move</span>
						<span class="legend-played">&#x2192; Your move</span>
					</div>
				{/if}
				{#if waitingForRoll}
					<div class="roll-area">
						<button class="roll-btn" onclick={rollForPlayer}>
							Roll Dice
						</button>
					</div>
				{/if}
				{#if loading}
					<div class="loading">Thinking...</div>
				{/if}
			</div>
		</div>

		{#if showAnalysis}
			<div class="analysis-area">
				<AnalysisPanel
					analysis={currentAnalysis}
					explanation={currentExplanation}
					blunderLevel={currentBlunderLevel}
					{notableDeltas}
					{explaining}
				/>
				<div class="analysis-buttons">
					<button class="takeback-btn" onclick={takeBack}>
						Take Back
					</button>
					<button class="dismiss-btn" onclick={dismissAnalysis}>
						Continue
					</button>
				</div>
			</div>
		{/if}

		<!-- Move history -->
		{#if game.moveHistory.length > 0}
			<div class="move-history">
				<h3>Move History</h3>
				<div class="history-list">
					{#each game.moveHistory as record}
						{@const analysis = moveAnalysisMap.get(record.moveNumber)}
						<div class="history-entry">
							<span class="move-num">{record.moveNumber}.</span>
							<span class="move-player">{record.player === 'player' ? 'You' : 'CPU'}</span>
							<span class="move-dice">{record.dice.die1}-{record.dice.die2}</span>
							<span class="move-text">{formatMove(record.move)}</span>
							{#if analysis}
								<span class="move-ev {analysis.blunderLevel}">
									{analysis.equityLoss > 0 ? `-${analysis.equityLoss.toFixed(3)}` : '0.000'}
								</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.play-page {
		max-width: 1000px;
		margin: 0 auto;
	}

	.play-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.play-header h2 {
		margin: 0;
	}

	.game-controls {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.game-controls select {
		padding: 6px 12px;
		background: #1a1a2e;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.85rem;
		color: #aaa;
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
	}

	.toggle-label input {
		accent-color: #4c6ef5;
	}

	.start-btn {
		padding: 8px 20px;
		background: #4c6ef5;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 1rem;
		cursor: pointer;
	}

	.start-btn:hover {
		background: #364fc7;
	}

	.start-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error {
		background: #c92a2a;
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		margin-bottom: 1rem;
	}

	.game-layout {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
		flex-wrap: wrap;
	}

	.board-area {
		flex: 1;
		min-width: 400px;
	}

	.status-bar {
		background: #1a1a2e;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		margin-bottom: 0.5rem;
		font-size: 0.95rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		position: relative;
	}

	.status-stats {
		color: #aaa;
		font-size: 0.85rem;
		white-space: nowrap;
	}

	.stats-sep {
		color: #555;
		margin: 0 0.25rem;
	}

	.info-icon {
		cursor: pointer;
		color: #556;
		margin-left: 0.4rem;
		vertical-align: middle;
		display: inline-flex;
	}

	.info-icon:hover {
		color: #99a;
	}

	.stats-info-overlay {
		position: fixed;
		inset: 0;
		z-index: 9;
	}

	.stats-info-popup {
		position: absolute;
		right: 0;
		top: 100%;
		background: #252540;
		border: 1px solid #444;
		border-radius: 6px;
		padding: 0.6rem 0.85rem;
		font-size: 0.8rem;
		color: #ccc;
		line-height: 1.6;
		white-space: normal;
		z-index: 10;
		width: 320px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.4);
	}

	.loading {
		text-align: center;
		padding: 0.5rem;
		color: #aaa;
		font-style: italic;
	}

	.analysis-area {
		max-width: 600px;
	}

	.analysis-buttons {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.dismiss-btn {
		padding: 6px 16px;
		background: #333;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
		cursor: pointer;
		flex: 1;
	}

	.dismiss-btn:hover {
		background: #444;
	}

	.takeback-btn {
		padding: 6px 16px;
		background: #4c6ef5;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		flex: 1;
	}

	.takeback-btn:hover {
		background: #364fc7;
	}

	.move-history {
		margin-top: 1.5rem;
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 1rem;
	}

	.move-history h3 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 200px;
		overflow-y: auto;
	}

	.history-entry {
		display: flex;
		gap: 0.5rem;
		font-size: 0.85rem;
		font-family: monospace;
	}

	.move-num {
		color: #888;
		width: 30px;
	}

	.move-player {
		width: 30px;
		color: #aaa;
	}

	.move-dice {
		width: 30px;
		color: #888;
	}

	.move-ev {
		margin-left: auto;
		font-size: 0.8rem;
	}

	.move-ev.none {
		color: #6b7;
	}

	.move-ev.inaccuracy {
		color: #9b9;
	}

	.move-ev.mistake {
		color: #db6;
	}

	.move-ev.blunder {
		color: #e66;
	}

	.move-ev.hugeBlunder {
		color: #f44;
		font-weight: bold;
	}

	.roll-area {
		display: flex;
		justify-content: center;
		margin-top: 0.5rem;
	}

	.roll-btn {
		padding: 10px 32px;
		background: #4c6ef5;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 1.1rem;
		cursor: pointer;
		font-weight: 600;
	}

	.roll-btn:hover {
		background: #364fc7;
	}

	.arrow-legend {
		display: flex;
		gap: 1.5rem;
		padding: 0.4rem 1rem;
		font-size: 0.85rem;
	}

	.legend-best {
		color: #4ade80;
		font-weight: 600;
	}

	.legend-played {
		color: #f87171;
		opacity: 0.7;
	}

	@media (max-width: 600px) {
		.play-page {
			padding: 0;
		}

		.play-header {
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.play-header h2 {
			font-size: 1.1rem;
		}

		.board-area {
			min-width: unset;
			width: 100%;
		}

		.game-layout {
			gap: 0.75rem;
		}

		.analysis-area {
			width: 100%;
			max-width: none;
		}

		.status-bar {
			font-size: 0.85rem;
			padding: 0.4rem 0.75rem;
		}
	}
</style>
