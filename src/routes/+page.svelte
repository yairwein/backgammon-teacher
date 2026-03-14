<script lang="ts">
	import Board from '$lib/components/Board.svelte';
	import { initialBoard } from '$lib/backgammon/board.js';

	const board = initialBoard();
</script>

<div class="home">
	<div class="hero">
		<h1>Backgammon Teacher</h1>
		<p>Improve your backgammon by learning from your mistakes</p>
	</div>

	<div class="board-preview">
		<Board {board} />
	</div>

	<div class="modes">
		<a href="/play" class="mode-card">
			<h2>Play vs Computer</h2>
			<p>Play a full game. Your moves are analyzed in real-time. Blunders are explained so you learn as you play.</p>
		</a>
		<a href="/review" class="mode-card">
			<h2>Review Positions</h2>
			<p>Load a position, choose a move, and get detailed analysis with strategic explanations.</p>
		</a>
	</div>
</div>

<style>
	.home {
		text-align: center;
	}

	.hero {
		padding: 2rem 0 1rem;
	}

	.hero h1 {
		font-size: 2.5rem;
		margin: 0 0 0.5rem;
	}

	.hero p {
		font-size: 1.1rem;
		color: #aaa;
		margin: 0;
	}

	.board-preview {
		margin: 1rem auto 2rem;
		max-width: 700px;
	}

	.modes {
		display: flex;
		gap: 1.5rem;
		justify-content: center;
		flex-wrap: wrap;
		padding: 0 1rem;
	}

	.mode-card {
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 12px;
		padding: 1.5rem;
		width: 300px;
		text-decoration: none;
		color: #e0e0e0;
		transition: border-color 0.2s, transform 0.2s;
	}

	.mode-card:hover {
		border-color: #4c6ef5;
		transform: translateY(-2px);
	}

	.mode-card h2 {
		margin: 0 0 0.5rem;
		font-size: 1.25rem;
	}

	.mode-card p {
		margin: 0;
		font-size: 0.9rem;
		color: #aaa;
		line-height: 1.4;
	}
</style>
