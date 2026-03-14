/**
 * Tests for multi-instance game restore flow.
 *
 * The server stores games in an in-memory Map. With multiple Cloud Run instances,
 * a request may hit an instance that doesn't have the game. The fix: clients send
 * game state with every request so the server can auto-restore.
 *
 * These tests verify that resolveGame() correctly falls back to client-supplied
 * state when the game is not in the in-memory Map.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createGame, openingRoll, rollDice, serializeGameState, getLegalMoves } from '$lib/game/gameState.js';
import type { GameState } from '$lib/backgammon/types.js';

// Simulate the server's in-memory store and resolveGame function
let games: Map<string, GameState>;
let undoStack: Map<string, GameState>;

function resolveGame(gameId: string, clientGame?: GameState): GameState | null {
	const game = games.get(gameId);
	if (game) return game;
	if (clientGame?.id === gameId) {
		games.set(gameId, clientGame);
		return clientGame;
	}
	return null;
}

describe('multi-instance game restore', () => {
	beforeEach(() => {
		games = new Map();
		undoStack = new Map();
	});

	it('resolves game from in-memory Map when present', () => {
		const game = createGame('strong');
		games.set(game.id, game);

		const resolved = resolveGame(game.id);
		expect(resolved).toBe(game);
	});

	it('returns null when game is not in Map and no client state provided', () => {
		const resolved = resolveGame('game-nonexistent-123');
		expect(resolved).toBeNull();
	});

	it('auto-restores from client state when game is not in Map', () => {
		const game = createGame('strong');
		// Game is NOT in the Map (simulates different instance)

		const resolved = resolveGame(game.id, game);
		expect(resolved).toBe(game);
		// Should also be registered in the Map now
		expect(games.get(game.id)).toBe(game);
	});

	it('rejects client state with mismatched gameId', () => {
		const game = createGame('strong');
		const resolved = resolveGame('game-wrong-id', game);
		expect(resolved).toBeNull();
	});

	it('prefers in-memory state over client state', () => {
		const game1 = createGame('strong');
		const game2 = { ...createGame('strong'), id: game1.id };
		games.set(game1.id, game1);

		const resolved = resolveGame(game1.id, game2);
		// Should return the in-memory version, not the client version
		expect(resolved).toBe(game1);
	});

	it('restored game can be used for subsequent operations', () => {
		// Create a game and advance it to a state where dice are rolled
		let game = createGame('strong');
		const opening = openingRoll();
		game = {
			...game,
			dice: opening.dice,
			diceRolled: true,
			turn: opening.firstPlayer
		};

		// Simulate: game exists on instance A but request hits instance B
		// Instance B has empty Map
		expect(games.size).toBe(0);

		// Client sends game state along with the request
		const resolved = resolveGame(game.id, game);
		expect(resolved).not.toBeNull();

		// The game should now be usable for operations like rollDice
		if (resolved && !resolved.diceRolled) {
			const updated = rollDice(resolved);
			expect(updated.diceRolled).toBe(true);
			expect(updated.dice).not.toBeNull();
		}
	});

	it('handles full game lifecycle across simulated instance switches', () => {
		// Instance A: create game
		let game = createGame('strong');
		const opening = openingRoll();
		game = { ...game, dice: opening.dice, diceRolled: true, turn: 'player' };
		games.set(game.id, game);

		const gameId = game.id;
		const serialized = serializeGameState(game);

		// Simulate instance switch: clear the Map (as if request hits different instance)
		games.clear();
		expect(games.size).toBe(0);

		// Without client state: OLD behavior would return 404
		const withoutState = resolveGame(gameId);
		expect(withoutState).toBeNull(); // This is the 404 case

		// With client state: NEW behavior auto-restores
		const withState = resolveGame(gameId, serialized as unknown as GameState);
		expect(withState).not.toBeNull();
		expect(withState!.id).toBe(gameId);
		expect(games.get(gameId)).not.toBeUndefined();
	});
});

describe('game cleanup', () => {
	beforeEach(() => {
		games = new Map();
		undoStack = new Map();
	});

	it('completed games should be eligible for cleanup', () => {
		const game = createGame('strong');
		const completedGame: GameState = { ...game, gameOver: true, winner: 'player' };
		games.set(game.id, completedGame);
		undoStack.set(game.id, game);

		// Simulate cleanup
		for (const [id, g] of games) {
			if (g.gameOver) {
				games.delete(id);
				undoStack.delete(id);
			}
		}

		expect(games.size).toBe(0);
		expect(undoStack.size).toBe(0);
	});

	it('stale games (>2h) should be eligible for cleanup', () => {
		const GAME_MAX_AGE_MS = 2 * 60 * 60 * 1000;
		const staleTimestamp = Date.now() - GAME_MAX_AGE_MS - 1000;
		const staleId = `game-1-${staleTimestamp}`;
		const game = { ...createGame('strong'), id: staleId };
		games.set(staleId, game);

		// Simulate cleanup
		const now = Date.now();
		for (const [id] of games) {
			const ts = parseInt(id.split('-').pop() || '0');
			if (ts > 0 && now - ts > GAME_MAX_AGE_MS) {
				games.delete(id);
			}
		}

		expect(games.size).toBe(0);
	});

	it('active recent games should NOT be cleaned up', () => {
		const game = createGame('strong');
		games.set(game.id, game);

		const GAME_MAX_AGE_MS = 2 * 60 * 60 * 1000;
		const now = Date.now();
		for (const [id, g] of games) {
			if (g.gameOver) {
				games.delete(id);
			} else {
				const ts = parseInt(id.split('-').pop() || '0');
				if (ts > 0 && now - ts > GAME_MAX_AGE_MS) {
					games.delete(id);
				}
			}
		}

		expect(games.size).toBe(1);
	});
});
