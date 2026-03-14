<script lang="ts">
	import { THRESHOLD_PRESETS, type BlunderThresholdConfig, type Difficulty } from '$lib/backgammon/types.js';

	let preset: string = $state('normal');
	let customThreshold: number = $state(0.08);
	let difficulty: Difficulty = $state('strong');
	let autoAnalyze: boolean = $state(true);
	let saved = $state(false);

	let effectiveThreshold = $derived(
		preset === 'custom' ? customThreshold : THRESHOLD_PRESETS[preset] || 0.08
	);

	function saveSettings() {
		// In production this would persist to the database
		const settings = {
			blunderConfig: {
				preset: preset as BlunderThresholdConfig['preset'],
				blunderThreshold: effectiveThreshold
			} satisfies BlunderThresholdConfig,
			difficulty,
			autoAnalyze
		};

		localStorage.setItem('bgteacher-settings', JSON.stringify(settings));
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}

	// Load settings on mount
	$effect(() => {
		const stored = localStorage.getItem('bgteacher-settings');
		if (stored) {
			try {
				const s = JSON.parse(stored);
				preset = s.blunderConfig?.preset || 'normal';
				customThreshold = s.blunderConfig?.blunderThreshold || 0.08;
				difficulty = s.difficulty || 'strong';
				autoAnalyze = s.autoAnalyze ?? true;
			} catch {
				// ignore
			}
		}
	});
</script>

<div class="settings-page">
	<h2>Settings</h2>

	<div class="settings-grid">
		<section class="setting-group">
			<h3>Blunder Threshold</h3>
			<p class="desc">How sensitive the blunder detection should be.</p>

			<div class="preset-buttons">
				{#each Object.entries(THRESHOLD_PRESETS) as [name, value]}
					<button
						class:active={preset === name}
						onclick={() => (preset = name)}
					>
						{name} ({value})
					</button>
				{/each}
				<button class:active={preset === 'custom'} onclick={() => (preset = 'custom')}>
					Custom
				</button>
			</div>

			{#if preset === 'custom'}
				<div class="custom-threshold">
					<label>
						Threshold:
						<input
							type="number"
							bind:value={customThreshold}
							min="0.01"
							max="1.0"
							step="0.01"
						/>
					</label>
				</div>
			{/if}

			<p class="threshold-info">
				Current threshold: <strong>{effectiveThreshold.toFixed(2)}</strong> equity
			</p>
		</section>

		<section class="setting-group">
			<h3>Computer Difficulty</h3>
			<p class="desc">Strength of the computer opponent in play mode.</p>

			<div class="preset-buttons">
				<button class:active={difficulty === 'beginner'} onclick={() => (difficulty = 'beginner')}>
					Beginner
				</button>
				<button class:active={difficulty === 'intermediate'} onclick={() => (difficulty = 'intermediate')}>
					Intermediate
				</button>
				<button class:active={difficulty === 'strong'} onclick={() => (difficulty = 'strong')}>
					Strong
				</button>
			</div>
		</section>

		<section class="setting-group">
			<h3>Auto-Analyze</h3>
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={autoAnalyze} />
				Automatically analyze every move during play
			</label>
		</section>
	</div>

	<div class="save-bar">
		<button class="save-btn" onclick={saveSettings}>Save Settings</button>
		{#if saved}
			<span class="saved-msg">Settings saved</span>
		{/if}
	</div>
</div>

<style>
	.settings-page {
		max-width: 600px;
		margin: 0 auto;
	}

	.settings-page h2 {
		margin: 0 0 1.5rem;
	}

	.settings-grid {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.setting-group {
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 1.25rem;
	}

	.setting-group h3 {
		margin: 0 0 0.25rem;
		font-size: 1rem;
	}

	.desc {
		margin: 0 0 0.75rem;
		font-size: 0.85rem;
		color: #888;
	}

	.preset-buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.preset-buttons button {
		padding: 6px 14px;
		background: #333;
		color: #ccc;
		border: 1px solid #555;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.85rem;
		text-transform: capitalize;
	}

	.preset-buttons button.active {
		background: #4c6ef5;
		color: #fff;
		border-color: #4c6ef5;
	}

	.custom-threshold {
		margin-top: 0.75rem;
	}

	.custom-threshold input {
		width: 80px;
		padding: 4px 8px;
		background: #222;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.threshold-info {
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
		color: #aaa;
	}

	select {
		padding: 6px 12px;
		background: #222;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.save-bar {
		margin-top: 1.5rem;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.save-btn {
		padding: 10px 24px;
		background: #4c6ef5;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 1rem;
		cursor: pointer;
	}

	.save-btn:hover {
		background: #364fc7;
	}

	.saved-msg {
		color: #69db7c;
		font-size: 0.9rem;
	}
</style>
