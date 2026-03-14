<script lang="ts">
	import type { BoardState, Move, CheckerMove, DiceRoll } from '$lib/backgammon/types.js';
	import { BAR, OFF } from '$lib/backgammon/types.js';
	import { cloneBoard } from '$lib/backgammon/board.js';
	import { applyCheckerMove } from '$lib/backgammon/rules.js';

	interface Props {
		board: BoardState;
		dice?: DiceRoll | null;
		legalMoves?: Move[];
		interactive?: boolean;
		highlightMove?: Move | null;
		/** Best move to show on the board (green arrows) */
		bestMove?: Move | null;
		/** Played move to show on the board (red, faded) */
		playedMove?: Move | null;
		/** Whether the played/best moves are from the opponent's perspective */
		isOpponentMove?: boolean;
		/** Ghost opponent checkers showing where pieces were before moving (player perspective coords) */
		ghostMove?: { checkerMoves: { from: number; to: number }[] } | null;
		onMoveSelected?: (move: Move) => void;
	}

	let {
		board,
		dice = null,
		legalMoves = [],
		interactive = false,
		highlightMove = null,
		bestMove = null,
		playedMove = null,
		isOpponentMove = false,
		ghostMove = null,
		onMoveSelected
	}: Props = $props();

	let selectedFrom: number | null = $state(null);
	let partialMoves: CheckerMove[] = $state([]);

	/** Board with partial moves applied — this is what we render during normal play */
	let workingBoard: BoardState = $derived.by(() => {
		if (partialMoves.length === 0) return board;
		const b = cloneBoard(board);
		for (const cm of partialMoves) {
			applyCheckerMove(b, { ...cm });
		}
		return b;
	});

	// --- Animation state ---
	let animBoard: BoardState | null = $state(null);
	let flyingChecker: { x: number; y: number; isOpp: boolean } | null = $state(null);
	let animRunId = 0;

	/** Board to render: animation board during animation, working board otherwise */
	let displayBoard: BoardState = $derived(animBoard ?? workingBoard);

	// Dice animation key — increments when dice values change to re-trigger CSS animation
	let diceAnimKey = $state(0);
	let prevDiceStr = '';

	$effect(() => {
		const key = dice ? `${dice.die1}-${dice.die2}` : '';
		if (key && key !== prevDiceStr) {
			prevDiceStr = key;
			diceAnimKey++;
		}
	});

	/** Animate opponent checkers moving. Returns a promise that resolves when done. */
	export async function animateOpponentMove(
		checkerMoves: { from: number; to: number }[]
	): Promise<void> {
		if (!checkerMoves || checkerMoves.length === 0) return;
		const id = ++animRunId;
		const isOpp = true;
		animBoard = cloneBoard(board);

		for (let i = 0; i < checkerMoves.length; i++) {
			if (animRunId !== id) return;
			await animateSingleChecker(checkerMoves[i], isOpp, id);
			if (animRunId !== id) return;
			if (i < checkerMoves.length - 1) {
				await new Promise((r) => setTimeout(r, 80));
			}
		}

		flyingChecker = null;
		animBoard = null;
	}

	function getAnimPos(
		point: number,
		b: BoardState,
		isOpp: boolean,
		isFrom: boolean
	): { x: number; y: number } {
		if (point === BAR) {
			if (isOpp) {
				const idx = isFrom ? Math.max(b.opponentBar - 1, 0) : b.opponentBar;
				return { x: barX(), y: barCheckerY(idx, true) };
			} else {
				const idx = isFrom ? Math.max(b.playerBar - 1, 0) : b.playerBar;
				return { x: barX(), y: barCheckerY(idx, false) };
			}
		}
		if (point === OFF) {
			if (isOpp) {
				return { x: BORDER + TRAY_W / 2, y: BORDER + 60 };
			}
			return { x: BORDER + TRAY_W / 2, y: H - BORDER - 60 };
		}
		const val = b.points[point - 1];
		const count = Math.abs(val);
		if (isFrom) {
			const idx = Math.max(Math.min(count, 10) - 1, 0);
			return { x: pointX(point), y: checkerY(point, idx, count) };
		}
		return { x: pointX(point), y: checkerY(point, count, count + 1) };
	}

	async function animateSingleChecker(
		cm: { from: number; to: number },
		isOpp: boolean,
		id: number
	) {
		if (!animBoard) return;

		const fromPos = getAnimPos(cm.from, animBoard, isOpp, true);

		// Remove checker from source
		if (cm.from === BAR) {
			if (isOpp) animBoard.opponentBar--;
			else animBoard.playerBar--;
		} else if (cm.from >= 1 && cm.from <= 24) {
			if (isOpp) animBoard.points[cm.from - 1]++;
			else animBoard.points[cm.from - 1]--;
		}

		const toPos = getAnimPos(cm.to, animBoard, isOpp, false);

		// Animate the flying checker
		await flyCheckerAnim(fromPos, toPos, isOpp, 200, id);

		// Add checker to destination
		if (!animBoard) return;
		if (cm.to === OFF) {
			if (isOpp) animBoard.opponentBorneOff++;
			else animBoard.playerBorneOff++;
		} else if (cm.to >= 1 && cm.to <= 24) {
			const destVal = animBoard.points[cm.to - 1];
			if (isOpp && destVal === 1) {
				// Opponent hits player's blot
				animBoard.points[cm.to - 1] = -1;
				animBoard.playerBar++;
			} else if (!isOpp && destVal === -1) {
				// Player hits opponent's blot
				animBoard.points[cm.to - 1] = 1;
				animBoard.opponentBar++;
			} else {
				if (isOpp) animBoard.points[cm.to - 1]--;
				else animBoard.points[cm.to - 1]++;
			}
		}

		flyingChecker = null;
	}

	function flyCheckerAnim(
		from: { x: number; y: number },
		to: { x: number; y: number },
		isOpp: boolean,
		durationMs: number,
		id: number
	): Promise<void> {
		return new Promise((resolve) => {
			const start = performance.now();
			function frame(now: number) {
				if (animRunId !== id) {
					resolve();
					return;
				}
				const t = Math.min((now - start) / durationMs, 1);
				const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
				const x = from.x + (to.x - from.x) * ease;
				const yLin = from.y + (to.y - from.y) * ease;
				const arc = -25 * Math.sin(Math.PI * ease); // slight upward arc
				flyingChecker = { x, y: yLin + arc, isOpp };
				if (t < 1) requestAnimationFrame(frame);
				else resolve();
			}
			requestAnimationFrame(frame);
		});
	}

	// --- Layout constants ---
	const W = 680;
	const H = 480;
	const BORDER = 12;
	const BAR_W = 32;
	const TRAY_W = 40;
	const POINT_W = 44;
	const POINT_H = 200;
	const CHECKER_R = 16;
	const CHECKER_GAP = 2;
	const LABEL_SIZE = 10;

	const Q1_X = BORDER + TRAY_W;
	const Q2_X = Q1_X + 6 * POINT_W + BAR_W;

	// Colors
	const BOARD_BG = '#1a6b1a';
	const FRAME_COLOR = '#5c3a1e';
	const DARK_POINT = '#8b4513';
	const LIGHT_POINT = '#d4a574';
	const BAR_COLOR = '#3d2b1f';
	const TRAY_COLOR = '#4a3020';
	const PLAYER_FILL = '#f0f0f0';
	const PLAYER_STROKE = '#b0b0b0';
	const OPP_FILL = '#2a1a0e';
	const OPP_STROKE = '#111';

	// --- Order-agnostic partial move matching ---
	function getRemainingMoves(legalMove: Move, partial: CheckerMove[]): CheckerMove[] | null {
		const used = new Array(legalMove.checkerMoves.length).fill(false);
		for (const pm of partial) {
			let matched = false;
			for (let i = 0; i < legalMove.checkerMoves.length; i++) {
				if (!used[i] && legalMove.checkerMoves[i].from === pm.from && legalMove.checkerMoves[i].to === pm.to) {
					used[i] = true;
					matched = true;
					break;
				}
			}
			if (!matched) return null;
		}
		return legalMove.checkerMoves.filter((_, i) => !used[i]);
	}

	// --- Derived interaction state ---
	let validSources = $derived.by(() => {
		if (!interactive || legalMoves.length === 0) return new Set<number>();
		const sources = new Set<number>();
		for (const move of legalMoves) {
			const remaining = getRemainingMoves(move, partialMoves);
			if (remaining && remaining.length > 0) {
				for (const cm of remaining) {
					sources.add(cm.from);
				}
			}
		}
		return sources;
	});

	function findChainsFromSource(source: number, remaining: CheckerMove[]): CheckerMove[][] {
		const results: CheckerMove[][] = [];
		const used = new Array(remaining.length).fill(false);

		function recurse(pos: number, chain: CheckerMove[]) {
			if (chain.length > 0) results.push([...chain]);
			for (let i = 0; i < remaining.length; i++) {
				if (!used[i] && remaining[i].from === pos) {
					used[i] = true;
					chain.push(remaining[i]);
					recurse(remaining[i].to, chain);
					chain.pop();
					used[i] = false;
				}
			}
		}
		recurse(source, []);
		return results;
	}

	let targetChains = $derived.by(() => {
		if (selectedFrom === null) return new Map<number, CheckerMove[]>();
		const chains = new Map<number, CheckerMove[]>();
		for (const move of legalMoves) {
			const remaining = getRemainingMoves(move, partialMoves);
			if (!remaining || remaining.length === 0) continue;
			for (const chain of findChainsFromSource(selectedFrom, remaining)) {
				const endpoint = chain[chain.length - 1].to;
				if (!chains.has(endpoint) || chains.get(endpoint)!.length > chain.length) {
					chains.set(endpoint, chain);
				}
			}
		}
		return chains;
	});

	let validTargets = $derived(new Set(targetChains.keys()));

	// --- Geometry helpers ---
	function pointX(point: number): number {
		if (point >= 13 && point <= 18) return Q1_X + (point - 13) * POINT_W + POINT_W / 2;
		if (point >= 19 && point <= 24) return Q2_X + (point - 19) * POINT_W + POINT_W / 2;
		if (point >= 7 && point <= 12) return Q1_X + (12 - point) * POINT_W + POINT_W / 2;
		return Q2_X + (6 - point) * POINT_W + POINT_W / 2;
	}

	function isTopPoint(point: number): boolean {
		return point >= 13 && point <= 24;
	}

	function trianglePoints(point: number): string {
		const cx = pointX(point);
		const halfW = POINT_W / 2 - 1;
		if (isTopPoint(point)) {
			const y0 = BORDER;
			return `${cx - halfW},${y0} ${cx + halfW},${y0} ${cx},${y0 + POINT_H}`;
		} else {
			const y0 = H - BORDER;
			return `${cx - halfW},${y0} ${cx + halfW},${y0} ${cx},${y0 - POINT_H}`;
		}
	}

	function checkerY(point: number, index: number, total: number): number {
		const maxNoOverlap = 5;
		const naturalSpacing = CHECKER_R * 2 + CHECKER_GAP;
		const availableH = POINT_H - CHECKER_R * 2;
		const visibleCount = Math.min(total, 10);
		const spacing = visibleCount <= maxNoOverlap
			? naturalSpacing
			: Math.min(naturalSpacing, availableH / (visibleCount - 1));

		if (isTopPoint(point)) {
			return BORDER + CHECKER_R + 6 + index * spacing;
		} else {
			return H - BORDER - CHECKER_R - 6 - index * spacing;
		}
	}

	function landingY(point: number): number {
		const val = workingBoard.points[point - 1];
		const count = Math.abs(val);
		if (count === 0) {
			return isTopPoint(point) ? BORDER + CHECKER_R + 6 : H - BORDER - CHECKER_R - 6;
		}
		return checkerY(point, count, count + 1);
	}

	function barCheckerY(index: number, isTop: boolean): number {
		const spacing = CHECKER_R * 2 + CHECKER_GAP;
		if (isTop) return BORDER + CHECKER_R + 8 + index * spacing;
		return H - BORDER - CHECKER_R - 8 - index * spacing;
	}

	function barX(): number {
		return Q1_X + 6 * POINT_W + BAR_W / 2;
	}

	function movePointPos(point: number, board: BoardState): { x: number; y: number } {
		if (point === BAR) {
			return { x: barX(), y: barCheckerY(Math.max(board.playerBar - 1, 0), false) };
		}
		if (point === OFF) {
			return { x: BORDER + TRAY_W / 2, y: H - BORDER - 60 };
		}
		const val = board.points[point - 1];
		const count = Math.abs(val);
		const topIdx = Math.max(Math.min(count, 10) - 1, 0);
		return { x: pointX(point), y: checkerY(point, topIdx, count) };
	}

	/**
	 * Map opponent-perspective move coordinates to screen positions on the player-perspective board.
	 * Opponent's point N = player's point (25-N). Opponent's BAR = top bar. Opponent's OFF = top tray.
	 */
	function opponentMovePointPos(point: number, board: BoardState): { x: number; y: number } {
		if (point === BAR) {
			// Opponent's bar is at the top
			return { x: barX(), y: barCheckerY(Math.max(board.opponentBar - 1, 0), true) };
		}
		if (point === OFF) {
			// Opponent's bear-off tray is at the top
			return { x: BORDER + TRAY_W / 2, y: BORDER + 60 };
		}
		// Convert opponent point to player point: opponent's N = player's (25-N)
		const playerPoint = 25 - point;
		const val = board.points[playerPoint - 1];
		const count = Math.abs(val);
		const topIdx = Math.max(Math.min(count, 10) - 1, 0);
		return { x: pointX(playerPoint), y: checkerY(playerPoint, topIdx, count) };
	}

	function pointColor(point: number): string {
		return (point - 1) % 2 === 0 ? DARK_POINT : LIGHT_POINT;
	}

	function pointHighlight(point: number): string | null {
		if (highlightMove) {
			for (const cm of highlightMove.checkerMoves) {
				if (cm.from === point) return '#ff6b6b';
				if (cm.to === point) return '#51cf66';
			}
		}
		return null;
	}

	// --- Interaction ---
	function handlePointClick(point: number) {
		if (!interactive) return;

		if (selectedFrom === null) {
			if (validSources.has(point)) {
				selectedFrom = point;
			}
		} else if (validTargets.has(point)) {
			const chain = targetChains.get(point) || [{ from: selectedFrom, to: point }];
			const newPartial = [...partialMoves, ...chain];

			const fullMatch = legalMoves.find((m) => {
				const remaining = getRemainingMoves(m, newPartial);
				return remaining !== null && remaining.length === 0;
			});

			if (fullMatch) {
				onMoveSelected?.(fullMatch);
				selectedFrom = null;
				partialMoves = [];
			} else {
				partialMoves = newPartial;
				selectedFrom = null;
			}
		} else {
			selectedFrom = null;
		}
	}

	function handlePointDblClick(point: number) {
		if (!interactive) return;
		if (!validSources.has(point)) return;

		// Collect all unique target endpoints from this source
		const targets = new Set<number>();
		for (const move of legalMoves) {
			const remaining = getRemainingMoves(move, partialMoves);
			if (!remaining || remaining.length === 0) continue;
			for (const chain of findChainsFromSource(point, remaining)) {
				targets.add(chain[chain.length - 1].to);
			}
		}

		// If only one target exists, auto-complete the move
		if (targets.size === 1) {
			const target = targets.values().next().value!;
			selectedFrom = point;
			Promise.resolve().then(() => handlePointClick(target));
			return;
		}

		// Legacy: if bear-off is among the targets, prefer it
		if (targets.has(OFF)) {
			selectedFrom = point;
			Promise.resolve().then(() => handlePointClick(OFF));
		}
	}

	function handleBarClick() {
		handlePointClick(BAR);
	}

	function handleOffClick() {
		if (selectedFrom !== null && validTargets.has(OFF)) {
			handlePointClick(OFF);
		}
	}

	function resetSelection() {
		selectedFrom = null;
		partialMoves = [];
	}

	/** Compute ghost checker positions (for showing where opponent pieces were) */
	let ghostPositions = $derived.by(() => {
		if (!ghostMove || ghostMove.checkerMoves.length === 0) return [];
		const positions: { x: number; y: number }[] = [];
		const perPoint = new Map<number, number>();

		for (const cm of ghostMove.checkerMoves) {
			const idx = perPoint.get(cm.from) ?? 0;
			perPoint.set(cm.from, idx + 1);

			if (cm.from >= 1 && cm.from <= 24) {
				const count = Math.abs(board.points[cm.from - 1]);
				positions.push({
					x: pointX(cm.from),
					y: checkerY(cm.from, count + idx, count + idx + 1)
				});
			} else if (cm.from === BAR) {
				positions.push({
					x: barX(),
					y: barCheckerY(board.opponentBar + idx, true)
				});
			}
		}
		return positions;
	});

	const dotPositions: Record<number, [number, number][]> = {
		1: [[0, 0]],
		2: [[-1, -1], [1, 1]],
		3: [[-1, -1], [0, 0], [1, 1]],
		4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
		5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
		6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
	};
</script>

<div class="board-container">
	<svg viewBox="0 0 {W} {H}" class="board-svg">
		<defs>
			<!-- Glow filter for movable checkers -->
			<filter id="glow-source" x="-40%" y="-40%" width="180%" height="180%">
				<feGaussianBlur stdDeviation="3" result="blur" />
				<feFlood flood-color="#4ade80" flood-opacity="0.7" result="color" />
				<feComposite in="color" in2="blur" operator="in" result="shadow" />
				<feMerge>
					<feMergeNode in="shadow" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
			<filter id="glow-selected" x="-40%" y="-40%" width="180%" height="180%">
				<feGaussianBlur stdDeviation="4" result="blur" />
				<feFlood flood-color="#facc15" flood-opacity="0.8" result="color" />
				<feComposite in="color" in2="blur" operator="in" result="shadow" />
				<feMerge>
					<feMergeNode in="shadow" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
			<!-- Arrow markers for move indicators -->
			<marker id="arrow-best" viewBox="0 0 10 10" refX="8" refY="5"
				markerWidth="6" markerHeight="6" orient="auto-start-reverse">
				<path d="M 0 0 L 10 5 L 0 10 z" fill="#4ade80" />
			</marker>
			<marker id="arrow-played" viewBox="0 0 10 10" refX="8" refY="5"
				markerWidth="6" markerHeight="6" orient="auto-start-reverse">
				<path d="M 0 0 L 10 5 L 0 10 z" fill="#f87171" />
			</marker>
			<!-- Subtle wood grain texture -->
			<pattern id="wood" patternUnits="userSpaceOnUse" width="6" height="6">
				<rect width="6" height="6" fill={FRAME_COLOR} />
				<line x1="0" y1="3" x2="6" y2="3" stroke="rgba(0,0,0,0.08)" stroke-width="0.5" />
			</pattern>
		</defs>

		<!-- Board frame with subtle texture -->
		<rect x="0" y="0" width={W} height={H} rx="8" fill="url(#wood)" />
		<rect x="0" y="0" width={W} height={H} rx="8" fill="none" stroke="#3a2010" stroke-width="2" />
		<rect x={BORDER} y={BORDER} width={W - 2 * BORDER} height={H - 2 * BORDER} fill={BOARD_BG} />

		<!-- Bear-off tray -->
		<rect x={BORDER} y={BORDER} width={TRAY_W} height={H - 2 * BORDER} fill={TRAY_COLOR} opacity="0.6" />

		<!-- Bar -->
		<rect x={Q1_X + 6 * POINT_W} y={BORDER} width={BAR_W} height={H - 2 * BORDER} fill={BAR_COLOR} />

		<!-- Triangles -->
		{#each Array.from({ length: 24 }, (_, i) => i + 1) as point}
			{@const highlight = pointHighlight(point)}
			<polygon
				points={trianglePoints(point)}
				fill={pointColor(point)}
				stroke={highlight || 'none'}
				stroke-width={highlight ? 2.5 : 0}
				pointer-events="none"
			/>
		{/each}

		<!-- Point labels -->
		{#each Array.from({ length: 24 }, (_, i) => i + 1) as point}
			<text
				x={pointX(point)}
				y={isTopPoint(point) ? BORDER - 2 : H - BORDER + LABEL_SIZE + 1}
				text-anchor="middle"
				font-size={LABEL_SIZE}
				fill="#777"
				pointer-events="none"
			>{point}</text>
		{/each}

		<!-- Checkers on points -->
		{#each Array.from({ length: 24 }, (_, i) => i + 1) as point}
			{@const val = displayBoard.points[point - 1]}
			{@const count = Math.abs(val)}
			{@const isPlayer = val > 0}
			{@const isSource = validSources.has(point) && isPlayer}
			{@const isSelected = selectedFrom === point}
			{#if count > 0}
				{#each Array(Math.min(count, 10)) as _, idx}
					{@const isTopOne = idx === Math.min(count, 10) - 1}
					{@const showGlow = isPlayer && isTopOne && (isSource || isSelected)}
					<circle
						cx={pointX(point)}
						cy={checkerY(point, idx, count)}
						r={CHECKER_R}
						fill={isPlayer ? PLAYER_FILL : OPP_FILL}
						stroke={isSelected && isTopOne ? '#facc15' : isSource && isTopOne ? '#4ade80' : isPlayer ? PLAYER_STROKE : OPP_STROKE}
						stroke-width={showGlow ? 3 : 2}
						filter={showGlow ? (isSelected ? 'url(#glow-selected)' : 'url(#glow-source)') : 'none'}
						pointer-events="none"
					/>
					<!-- Checker shine -->
					<circle
						cx={pointX(point) - 4}
						cy={checkerY(point, idx, count) - 4}
						r={5}
						fill={isPlayer ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)'}
						pointer-events="none"
					/>
					{#if isTopOne && count > 5}
						<text
							x={pointX(point)}
							y={checkerY(point, idx, count) + 4}
							text-anchor="middle"
							font-size="13"
							font-weight="bold"
							fill={isPlayer ? '#333' : '#eee'}
							pointer-events="none"
						>{count}</text>
					{/if}
				{/each}
			{/if}
		{/each}

		<!-- Flying checker (animation overlay) -->
		{#if flyingChecker}
			<circle
				cx={flyingChecker.x}
				cy={flyingChecker.y}
				r={CHECKER_R}
				fill={flyingChecker.isOpp ? OPP_FILL : PLAYER_FILL}
				stroke={flyingChecker.isOpp ? OPP_STROKE : PLAYER_STROKE}
				stroke-width="2"
				pointer-events="none"
			/>
			<circle
				cx={flyingChecker.x - 4}
				cy={flyingChecker.y - 4}
				r={5}
				fill={flyingChecker.isOpp ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.35)'}
				pointer-events="none"
			/>
		{/if}

		<!-- Ghost checkers (showing where opponent pieces were before moving) -->
		{#if ghostPositions.length > 0}
			{#each ghostPositions as ghost}
				<circle
					cx={ghost.x}
					cy={ghost.y}
					r={CHECKER_R}
					fill={OPP_FILL}
					stroke={OPP_STROKE}
					stroke-width="2"
					stroke-dasharray="4 3"
					opacity="0.3"
					pointer-events="none"
				/>
			{/each}
		{/if}

		<!-- Target landing indicators -->
		{#each Array.from(validTargets) as target}
			{#if target !== OFF && target >= 1 && target <= 24}
				<circle
					cx={pointX(target)}
					cy={landingY(target)}
					r={CHECKER_R - 2}
					fill="none"
					stroke="#60a5fa"
					stroke-width="2.5"
					stroke-dasharray="6 3"
					opacity="0.8"
					pointer-events="none"
				/>
				<circle
					cx={pointX(target)}
					cy={landingY(target)}
					r={CHECKER_R - 2}
					fill="rgba(96, 165, 250, 0.12)"
					pointer-events="none"
				/>
			{/if}
		{/each}

		<!-- Bar checkers -->
		{#each Array(displayBoard.opponentBar) as _, idx}
			<circle
				cx={barX()} cy={barCheckerY(idx, true)}
				r={CHECKER_R} fill={OPP_FILL} stroke={OPP_STROKE} stroke-width="2"
				pointer-events="none"
			/>
		{/each}
		{#each Array(displayBoard.playerBar) as _, idx}
			{@const isSource = validSources.has(BAR)}
			{@const isSelected = selectedFrom === BAR}
			{@const isTop = idx === displayBoard.playerBar - 1}
			<circle
				cx={barX()} cy={barCheckerY(idx, false)}
				r={CHECKER_R} fill={PLAYER_FILL}
				stroke={isSelected && isTop ? '#facc15' : isSource && isTop ? '#4ade80' : PLAYER_STROKE}
				stroke-width={isTop && (isSource || isSelected) ? 3 : 2}
				filter={isTop && isSelected ? 'url(#glow-selected)' : isTop && isSource ? 'url(#glow-source)' : 'none'}
				pointer-events="none"
			/>
		{/each}

		<!-- Invisible click hit areas (on top of everything) -->
		{#if interactive}
			{#each Array.from({ length: 24 }, (_, i) => i + 1) as point}
				<rect
					x={pointX(point) - POINT_W / 2}
					y={isTopPoint(point) ? BORDER : H / 2}
					width={POINT_W}
					height={H / 2 - BORDER}
					fill="transparent"
					class="point-hitarea"
					onclick={() => handlePointClick(point)}
					ondblclick={() => handlePointDblClick(point)}
					role="button"
					tabindex="-1"
					aria-label="Point {point}"
				/>
			{/each}

			<!-- Bar hit area -->
			{#if displayBoard.playerBar > 0}
				<rect
					x={Q1_X + 6 * POINT_W} y={H / 2}
					width={BAR_W} height={H / 2 - BORDER}
					fill="transparent"
					class="point-hitarea"
					onclick={handleBarClick}
					role="button" tabindex="-1" aria-label="Bar"
				/>
			{/if}
		{/if}

		<!-- Bear-off trays -->
		<text x={BORDER + TRAY_W / 2} y={BORDER + 30} text-anchor="middle" font-size="11" fill="#888" pointer-events="none">OFF</text>
		{#if displayBoard.opponentBorneOff > 0}
			{#each Array(Math.min(displayBoard.opponentBorneOff, 5)) as _, idx}
				<rect
					x={BORDER + TRAY_W / 2 - 12} y={BORDER + 40 + idx * 10}
					width="24" height="8" rx="2"
					fill={OPP_FILL} stroke={OPP_STROKE} stroke-width="1" pointer-events="none"
				/>
			{/each}
			{#if displayBoard.opponentBorneOff > 5}
				<text x={BORDER + TRAY_W / 2} y={BORDER + 110} text-anchor="middle" font-size="11" fill="#bbb" pointer-events="none">{displayBoard.opponentBorneOff}</text>
			{/if}
		{/if}

		<text x={BORDER + TRAY_W / 2} y={H - BORDER - 20} text-anchor="middle" font-size="11" fill="#888" pointer-events="none">OFF</text>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<rect
			x={BORDER + 2} y={H - BORDER - POINT_H}
			width={TRAY_W - 4} height={POINT_H}
			fill="transparent"
			stroke={validTargets.has(OFF) ? '#60a5fa' : 'none'}
			stroke-width="2.5"
			stroke-dasharray={validTargets.has(OFF) ? '6 3' : 'none'}
			rx="3"
			onclick={handleOffClick}
		/>
		{#if displayBoard.playerBorneOff > 0}
			{#each Array(Math.min(displayBoard.playerBorneOff, 5)) as _, idx}
				<rect
					x={BORDER + TRAY_W / 2 - 12} y={H - BORDER - 40 - idx * 10}
					width="24" height="8" rx="2"
					fill={PLAYER_FILL} stroke={PLAYER_STROKE} stroke-width="1" pointer-events="none"
				/>
			{/each}
			{#if displayBoard.playerBorneOff > 5}
				<text x={BORDER + TRAY_W / 2} y={H - BORDER - 100} text-anchor="middle" font-size="11" fill="#bbb" pointer-events="none">{displayBoard.playerBorneOff}</text>
			{/if}
		{/if}

		<!-- Dice with animation -->
		{#if dice}
			{@const diceY = H / 2}
			{#key diceAnimKey}
				{#each [dice.die1, dice.die2] as dieVal, i}
					{@const dx = W / 2 + (i === 0 ? -30 : 30)}
					<g class="die-anim" style="--die-cx: {dx}px; --die-cy: {diceY}px; --die-delay: {i * 60}ms">
						<rect x={dx - 18} y={diceY - 18} width="36" height="36" rx="6" fill="#fffef5" stroke="#ccc" stroke-width="1.5" />
						{#each dotPositions[dieVal] || [] as [dotX, dotY]}
							<circle cx={dx + dotX * 9} cy={diceY + dotY * 9} r="3.5" fill="#1a1a1a" />
						{/each}
					</g>
				{/each}
			{/key}
		{/if}

		<!-- Doubling cube -->
		<rect x={W - BORDER - 38} y={H / 2 - 14} width="28" height="28" rx="4" fill="#f5f0e0" stroke="#999" stroke-width="1.5" />
		<text x={W - BORDER - 24} y={H / 2 + 5} text-anchor="middle" font-size="14" font-weight="bold" fill="#333">{displayBoard.cubeValue}</text>

		<!-- Move arrows: played move (red, faded) and best move (green) -->
		{#if playedMove && playedMove.checkerMoves.length > 0}
			{#each playedMove.checkerMoves as cm}
				{@const from = isOpponentMove ? opponentMovePointPos(cm.from, board) : movePointPos(cm.from, board)}
				{@const to = isOpponentMove ? opponentMovePointPos(cm.to, board) : movePointPos(cm.to, board)}
				<line
					x1={from.x} y1={from.y} x2={to.x} y2={to.y}
					stroke="#f87171" stroke-width="3" stroke-linecap="round"
					opacity="0.5" marker-end="url(#arrow-played)"
					pointer-events="none"
				/>
			{/each}
		{/if}
		{#if bestMove && bestMove.checkerMoves.length > 0}
			{#each bestMove.checkerMoves as cm}
				{@const from = isOpponentMove ? opponentMovePointPos(cm.from, board) : movePointPos(cm.from, board)}
				{@const to = isOpponentMove ? opponentMovePointPos(cm.to, board) : movePointPos(cm.to, board)}
				<line
					x1={from.x} y1={from.y} x2={to.x} y2={to.y}
					stroke="#4ade80" stroke-width="3" stroke-linecap="round"
					opacity="0.85" marker-end="url(#arrow-best)"
					pointer-events="none"
				/>
			{/each}
		{/if}
	</svg>

	{#if interactive && partialMoves.length > 0}
		<div class="controls">
			<button class="undo-btn" onclick={resetSelection}>Undo</button>
		</div>
	{/if}
</div>

<style>
	.board-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.5rem;
	}

	.board-svg {
		width: min(720px, 95vw);
		height: auto;
		user-select: none;
	}

	.point-hitarea {
		cursor: pointer;
		outline: none;
	}

	.point-hitarea:hover {
		fill: transparent !important;
	}

	.controls {
		margin-top: 0.5rem;
	}

	.undo-btn {
		padding: 6px 16px;
		background: #444;
		color: #e0e0e0;
		border: 1px solid #666;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.85rem;
	}

	.undo-btn:hover {
		background: #555;
	}

	/* Dice pop-in animation */
	.die-anim {
		animation: dice-pop 0.35s ease-out both;
		animation-delay: var(--die-delay, 0ms);
		transform-origin: var(--die-cx) var(--die-cy);
	}

	@keyframes dice-pop {
		0% {
			transform: scale(0) rotate(-90deg);
			opacity: 0;
		}
		65% {
			transform: scale(1.15) rotate(5deg);
			opacity: 1;
		}
		85% {
			transform: scale(0.95) rotate(-2deg);
		}
		100% {
			transform: scale(1) rotate(0deg);
		}
	}
</style>
