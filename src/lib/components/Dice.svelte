<script lang="ts">
	import type { DiceRoll } from '$lib/backgammon/types.js';

	interface Props {
		dice: DiceRoll | null;
		onRoll?: () => void;
		canRoll?: boolean;
	}

	let { dice, onRoll, canRoll = false }: Props = $props();
</script>

<div class="dice-container">
	{#if dice}
		<div class="dice-display">
			<div class="die">{dice.die1}</div>
			<div class="die">{dice.die2}</div>
		</div>
	{:else if canRoll}
		<button class="roll-btn" onclick={onRoll}>Roll Dice</button>
	{/if}
</div>

<style>
	.dice-container {
		display: flex;
		justify-content: center;
		padding: 0.5rem;
	}

	.dice-display {
		display: flex;
		gap: 0.75rem;
	}

	.die {
		width: 48px;
		height: 48px;
		background: #fff;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: bold;
		color: #333;
		box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.3);
	}

	.roll-btn {
		padding: 10px 24px;
		background: #4c6ef5;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	.roll-btn:hover {
		background: #364fc7;
	}
</style>
