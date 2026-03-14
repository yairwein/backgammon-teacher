/**
 * Game state management for play-vs-computer mode.
 */

import { initialBoard, cloneBoard, isGameOver, flipBoard } from '$lib/backgammon/board.js';
import { generateLegalMoves, applyMove, isMoveLegal } from '$lib/backgammon/rules.js';
import type {
	BoardState, DiceRoll, DieValue, GameState, Move, MoveRecord,
	Player, Difficulty
} from '$lib/backgammon/types.js';

/**
 * Create a new game state.
 */
export function createGame(difficulty: Difficulty = 'strong'): GameState {
	return {
		id: `${Date.now()}-${crypto.randomUUID()}`,
		board: initialBoard(),
		turn: 'player',
		dice: null,
		diceRolled: false,
		moveHistory: [],
		moveNumber: 1,
		matchScore: null,
		gameOver: false,
		winner: null,
		difficulty
	};
}

/**
 * Roll dice for the current turn.
 */
export function rollDice(game: GameState): GameState {
	if (game.diceRolled || game.gameOver) return game;

	const die1 = (Math.floor(Math.random() * 6) + 1) as DieValue;
	const die2 = (Math.floor(Math.random() * 6) + 1) as DieValue;

	return {
		...game,
		dice: { die1, die2 },
		diceRolled: true
	};
}

/**
 * Roll dice for the opening roll (each player rolls one die).
 * Returns dice and who goes first.
 */
export function openingRoll(): { dice: DiceRoll; firstPlayer: Player } {
	let die1: DieValue, die2: DieValue;
	do {
		die1 = (Math.floor(Math.random() * 6) + 1) as DieValue;
		die2 = (Math.floor(Math.random() * 6) + 1) as DieValue;
	} while (die1 === die2); // re-roll on ties

	return {
		dice: { die1, die2 },
		firstPlayer: die1 > die2 ? 'player' : 'opponent'
	};
}

/**
 * Apply a player's move to the game state.
 */
export function makeMove(game: GameState, move: Move): GameState {
	if (!game.dice || game.gameOver) return game;

	// For opponent moves, we need to flip perspective
	const board = game.turn === 'opponent' ? flipBoard(game.board) : game.board;
	const dice = game.dice;

	if (!isMoveLegal(board, dice, move)) {
		throw new Error('Illegal move');
	}

	let newBoard = applyMove(board, move);

	// Flip back if opponent
	if (game.turn === 'opponent') {
		newBoard = flipBoard(newBoard);
	}

	const record: MoveRecord = {
		moveNumber: game.moveNumber,
		player: game.turn,
		dice: game.dice,
		move,
		board: cloneBoard(game.board) // store the position before the move
	};

	const winner = isGameOver(newBoard);

	return {
		...game,
		board: newBoard,
		turn: game.turn === 'player' ? 'opponent' : 'player',
		dice: null,
		diceRolled: false,
		moveHistory: [...game.moveHistory, record],
		moveNumber: game.moveNumber + 1,
		gameOver: winner !== null,
		winner
	};
}

/**
 * Get legal moves for the current position.
 */
export function getLegalMoves(game: GameState): Move[] {
	if (!game.dice || game.gameOver) return [];

	const board = game.turn === 'opponent' ? flipBoard(game.board) : game.board;
	return generateLegalMoves(board, game.dice);
}

/**
 * Serialize game state for the client (strips functions, deep clones).
 */
export function serializeGameState(game: GameState): GameState {
	return JSON.parse(JSON.stringify(game));
}
