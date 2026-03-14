/**
 * Game management endpoints.
 *
 * POST /api/game         — create a new game
 * POST /api/game/roll    — roll dice
 * POST /api/game/move    — make a move
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { Difficulty, Move } from '$lib/backgammon/types.js';
import { createGame, rollDice, makeMove, getLegalMoves, openingRoll, serializeGameState } from '$lib/game/gameState.js';
import type { GameState } from '$lib/backgammon/types.js';

// In-memory game store (would be DB-backed in production)
const games = new Map<string, GameState>();
// Previous state for undo (one level deep per game)
const undoStack = new Map<string, GameState>();

// Max age for stale games (2 hours)
const GAME_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** Extract creation timestamp from game ID format: {timestamp}-{uuid} */
function gameCreatedAt(id: string): number {
	const ts = parseInt(id.split('-')[0]);
	return isNaN(ts) ? 0 : ts;
}

/** Resolve a game: client state is the source of truth (multi-instance, no shared storage) */
function resolveGame(gameId: string, clientGame?: GameState): GameState | null {
	if (clientGame?.id === gameId) {
		games.set(gameId, clientGame);
		return clientGame;
	}
	return games.get(gameId) || null;
}

/** Periodically clean up finished and stale games */
function cleanupGames() {
	const now = Date.now();
	for (const [id, game] of games) {
		if (game.gameOver) {
			games.delete(id);
			undoStack.delete(id);
		} else {
			const ts = gameCreatedAt(id);
			if (ts > 0 && now - ts > GAME_MAX_AGE_MS) {
				games.delete(id);
				undoStack.delete(id);
			}
		}
	}
}

export const POST: RequestHandler = async ({ request, url }) => {
	const action = url.searchParams.get('action');

	// Periodic cleanup (cheap — runs inline)
	if (games.size > 50) cleanupGames();

	switch (action) {
		case 'create': {
			const body = await request.json().catch(() => ({}));
			const difficulty = (body.difficulty || 'strong') as Difficulty;
			let game = createGame(difficulty);

			// Opening roll
			const opening = openingRoll();
			game = {
				...game,
				dice: opening.dice,
				diceRolled: true,
				turn: opening.firstPlayer
			};

			games.set(game.id, game);
			console.log(`[game] New game: ${game.id}, difficulty=${difficulty}, first=${game.turn}`);

			return json({
				game: serializeGameState(game),
				legalMoves: game.turn === 'player' ? getLegalMoves(game) : []
			});
		}

		case 'roll': {
			const body = await request.json();
			const { gameId } = body;
			const game = resolveGame(gameId, body.game);
			if (!game) {
				console.error(`[roll] Game not found: ${gameId}. Active games: ${games.size}`);
				throw error(404, 'Game not found');
			}

			const updated = rollDice(game);
			games.set(gameId, updated);

			return json({
				game: serializeGameState(updated),
				legalMoves: updated.turn === 'player' ? getLegalMoves(updated) : []
			});
		}

		case 'restore': {
			const body = await request.json();
			const { game: gameData } = body as { game: GameState };
			if (!gameData?.id) {
				console.error('[restore] Invalid game state: missing id');
				throw error(400, 'Invalid game state');
			}

			games.set(gameData.id, gameData);
			console.log(`[restore] Game ${gameData.id} restored. Active games: ${games.size}`);

			return json({
				game: serializeGameState(gameData),
				legalMoves: gameData.turn === 'player' && gameData.diceRolled
					? getLegalMoves(gameData) : []
			});
		}

		case 'undo': {
			const body = await request.json();
			const { gameId } = body;
			const game = resolveGame(gameId, body.game);
			if (!game) {
				console.error(`[undo] Game not found: ${gameId}. Active games: ${games.size}`);
				throw error(404, 'Game not found');
			}
			const prev = undoStack.get(gameId);
			if (!prev) {
				console.error(`[undo] Nothing to undo for game: ${gameId}`);
				throw error(400, 'Nothing to undo');
			}

			games.set(gameId, prev);
			undoStack.delete(gameId);

			return json({
				game: serializeGameState(prev),
				legalMoves: prev.turn === 'player' && prev.dice ? getLegalMoves(prev) : []
			});
		}

		case 'move': {
			const body = await request.json();
			const { gameId, move } = body as { gameId: string; move: Move };
			const game = resolveGame(gameId, body.game);
			if (!game) {
				console.error(`[move] Game not found: ${gameId}. Active games: ${games.size}`);
				throw error(404, 'Game not found');
			}

			try {
				// Save for undo (only player moves)
				if (game.turn === 'player') {
					undoStack.set(gameId, game);
				}
				const updated = makeMove(game, move);
				games.set(gameId, updated);

				// Clean up completed games
				if (updated.gameOver) {
					setTimeout(() => {
						games.delete(gameId);
						undoStack.delete(gameId);
					}, 5000);
				}

				return json({
					game: serializeGameState(updated),
					legalMoves: updated.turn === 'player' && updated.dice ? getLegalMoves(updated) : []
				});
			} catch (err) {
				const moveStr = move.checkerMoves.map((cm: { from: number; to: number }) => `${cm.from}/${cm.to}`).join(' ');
				console.error(`Illegal move: ${moveStr} | turn=${game.turn} dice=${game.dice?.die1}-${game.dice?.die2} | board=${JSON.stringify(game.board.points)} bar=${game.board.playerBar}/${game.board.opponentBar}`);
				const legal = getLegalMoves(game);
				console.error(`Legal moves (${legal.length}): ${legal.slice(0, 3).map(m => m.checkerMoves.map((cm: { from: number; to: number }) => `${cm.from}/${cm.to}`).join(' ')).join(' | ')}`);
				throw error(400, err instanceof Error ? err.message : 'Invalid move');
			}
		}

		default:
			console.error(`[game] Unknown action: ${action}`);
			throw error(400, `Unknown action: ${action}`);
	}
};
