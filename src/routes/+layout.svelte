<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { auth } from '$lib/auth/authStore.js';
	import { env } from '$env/dynamic/public';
	import { dev } from '$app/environment';

	let { children }: { children: Snippet } = $props();
	let authState = $state({ signedIn: false, name: '', picture: '' });

	auth.subscribe((s) => {
		authState = { signedIn: s.signedIn, name: s.name, picture: s.picture };
	});

	onMount(() => {
		auth.restore();

		if (dev) return; // Skip GSI in dev mode

		// Wait for GSI script to load
		const clientId = env.PUBLIC_GOOGLE_CLIENT_ID;
		if (!clientId) return; // No Google client ID configured

		const initGsi = () => {
			if (!window.google?.accounts?.id) {
				setTimeout(initGsi, 100);
				return;
			}
			window.google.accounts.id.initialize({
				client_id: clientId,
				callback: handleCredentialResponse,
				auto_select: true
			});
			// If not signed in, render the button
			if (!authState.signedIn) {
				renderButton();
			}
		};
		initGsi();
	});

	function handleCredentialResponse(response: { credential: string }) {
		// Decode JWT payload (no verification needed client-side, server verifies)
		const payload = JSON.parse(atob(response.credential.split('.')[1]));
		auth.signIn(response.credential, payload.name || '', payload.email || '', payload.picture || '');
	}

	function renderButton() {
		const el = document.getElementById('g_id_signin');
		if (el && window.google?.accounts?.id) {
			window.google.accounts.id.renderButton(el, {
				type: 'standard',
				shape: 'pill',
				theme: 'filled_black',
				size: 'medium',
				text: 'continue_with'
			});
		}
	}

	function handleSignOut() {
		auth.signOut();
		// Re-render sign-in button after sign out
		if (!dev) setTimeout(renderButton, 50);
	}

	function devSignIn() {
		auth.signIn('dev-test-token', 'Dev User', 'dev@localhost', '');
	}
</script>

<div class="app">
	<nav class="navbar">
		<a href="/" class="logo">Backgammon Teacher</a>
		<div class="nav-links">
			<a href="/play">Play</a>
			<a href="/review">Review</a>
			{#if authState.signedIn}
				<a href="/my-games">My Games</a>
			{:else}
				<a href="/my-games" class="disabled-link" title="Sign in to save and review your games"
					onclick={(e) => e.preventDefault()}>My Games</a>
			{/if}
			<a href="/settings">Settings</a>
		</div>
		<div class="auth-area">
			{#if authState.signedIn}
				<div class="user-info">
					{#if authState.picture}
						<img src={authState.picture} alt="" class="avatar" referrerpolicy="no-referrer" />
					{/if}
					<span class="user-name">{authState.name}</span>
					<button class="sign-out-btn" onclick={handleSignOut}>Sign out</button>
				</div>
			{:else if dev}
				<button class="sign-out-btn" onclick={devSignIn}>Dev Sign In</button>
			{:else}
				<div id="g_id_signin"></div>
			{/if}
		</div>
	</nav>
	<main>
		{@render children()}
	</main>
</div>

<style>
	:global(*, *::before, *::after) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
		background: #0f0f23;
		color: #e0e0e0;
	}

	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.navbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.5rem;
		background: #1a1a2e;
		border-bottom: 1px solid #333;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.logo {
		font-size: 1.25rem;
		font-weight: bold;
		color: #fff;
		text-decoration: none;
	}

	.nav-links {
		display: flex;
		gap: 1.5rem;
	}

	.nav-links a {
		color: #aaa;
		text-decoration: none;
		font-size: 0.95rem;
		transition: color 0.2s;
	}

	.nav-links a:hover {
		color: #fff;
	}

	.nav-links a.disabled-link {
		color: #555;
		cursor: not-allowed;
	}

	.nav-links a.disabled-link:hover {
		color: #555;
	}

	@media (max-width: 600px) {
		.navbar {
			padding: 0.5rem 0.75rem;
			gap: 0.5rem;
		}

		.logo {
			font-size: 1rem;
		}

		.nav-links {
			gap: 0.75rem;
			order: 3;
			width: 100%;
			justify-content: center;
		}

		.nav-links a {
			font-size: 0.85rem;
		}

		.auth-area {
			margin-left: auto;
		}
	}

	.auth-area {
		display: flex;
		align-items: center;
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
	}

	.user-name {
		color: #ccc;
		font-size: 0.85rem;
	}

	.sign-out-btn {
		background: none;
		border: 1px solid #555;
		color: #aaa;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.sign-out-btn:hover {
		color: #fff;
		border-color: #888;
	}

	main {
		flex: 1;
		padding: 1rem;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
	}
</style>
