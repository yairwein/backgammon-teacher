/**
 * Jellyfish .mat format parser and exporter.
 *
 * Format example:
 *   ; [Event ""]
 *   Game 1
 *   Player 1 : 0    Player 2 : 0
 *    1) 31: 8/5 6/5                     42: 24/20 13/11
 *    2) 63: 24/15                        54: 20/15 13/9
 *   ...
 *   Wins 1 point
 */

import { initialBoard, flipBoard } from './board.js';
import { applyMove, formatMove } from './rules.js';
import { BAR, OFF, type BoardState, type DiceRoll, type DieValue, type Move, type MoveRecord, type CheckerMove } from './types.js';
import type { SavedGame } from '$lib/storage/types.js';

/** Format a move in .mat notation (e.g., "8/5 6/5", "bar/20", "6/off") */
function formatMoveMat(move: Move): string {
	if (move.checkerMoves.length === 0) return '';

	// Group consecutive moves from the same chain
	const parts: string[] = [];
	for (const cm of move.checkerMoves) {
		const from = cm.from === BAR ? 'bar' : cm.from.toString();
		const to = cm.to === OFF ? 'off' : cm.to.toString();
		const hit = cm.isHit ? '*' : '';
		parts.push(`${from}/${to}${hit}`);
	}
	return parts.join(' ');
}

/** Export a saved game to .mat format text */
export function exportMat(game: SavedGame): string {
	const lines: string[] = [];
	const date = new Date(game.timestamp).toISOString().slice(0, 10);

	lines.push(`; Exported from Backgammon Teacher`);
	lines.push(`; Date: ${date}`);
	lines.push('');
	lines.push(`Game 1`);
	lines.push(` Player : 0${' '.repeat(20)}CPU : 0`);

	if (!game.moveHistory) return lines.join('\n');

	let moveNum = 0;
	let i = 0;
	while (i < game.moveHistory.length) {
		const rec = game.moveHistory[i];
		if (rec.player === 'player') {
			moveNum++;
			const dice = `${rec.dice.die1}${rec.dice.die2}`;
			const moveText = rec.move.checkerMoves.length > 0 ? formatMoveMat(rec.move) : '';
			let line = `${String(moveNum).padStart(3)}) ${dice}: ${moveText}`;

			// Check if next move is CPU
			if (i + 1 < game.moveHistory.length && game.moveHistory[i + 1].player === 'opponent') {
				const cpuRec = game.moveHistory[i + 1];
				const cpuDice = `${cpuRec.dice.die1}${cpuRec.dice.die2}`;
				const cpuMove = cpuRec.move.checkerMoves.length > 0 ? formatMoveMat(cpuRec.move) : '';
				line = line.padEnd(38) + `${cpuDice}: ${cpuMove}`;
				i++;
			}
			lines.push(line);
		} else {
			// CPU move without preceding player move (e.g., first move)
			moveNum++;
			const dice = `${rec.dice.die1}${rec.dice.die2}`;
			const moveText = rec.move.checkerMoves.length > 0 ? formatMoveMat(rec.move) : '';
			lines.push(`${String(moveNum).padStart(3)}) `.padEnd(38) + `${dice}: ${moveText}`);
		}
		i++;
	}

	lines.push(`  ${game.winner === 'player' ? 'Wins' : 'Loses'} 1 point`);
	return lines.join('\n');
}

/** Parse a .mat/.gam format string into SavedGame(s) */
export function parseMat(text: string): SavedGame[] {
	const games: SavedGame[] = [];
	const lines = text.split('\n');

	let currentGame: {
		moveHistory: MoveRecord[];
		winner: 'player' | 'opponent' | null;
		player1Name: string;
		player2Name: string;
	} | null = null;

	let board = initialBoard();
	let moveNumber = 0;

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const line = lines[lineIdx].trim();

		// Skip comments and empty lines
		if (line.startsWith(';') || line === '') continue;

		// Game header
		if (/^Game\s+\d+/i.test(line)) {
			// Save previous game if exists
			if (currentGame && currentGame.moveHistory.length > 0) {
				games.push(buildSavedGame(currentGame));
			}
			currentGame = {
				moveHistory: [],
				winner: null,
				player1Name: 'Player',
				player2Name: 'CPU'
			};
			board = initialBoard();
			moveNumber = 0;
			continue;
		}

		// Player names line (e.g., " Player 1 : 0    Player 2 : 0")
		if (currentGame && /:\s*\d+/.test(line) && !line.match(/^\d+\)/)) {
			const nameMatch = line.match(/(.+?)\s*:\s*\d+\s+(.+?)\s*:\s*\d+/);
			if (nameMatch) {
				currentGame.player1Name = nameMatch[1].trim();
				currentGame.player2Name = nameMatch[2].trim();
			}
			continue;
		}

		// Win/loss line
		if (currentGame && /wins?\s+\d+\s+point/i.test(line)) {
			// The last game's winner depends on context — we'll infer from the line position
			currentGame.winner = 'player'; // Default assumption
			continue;
		}
		if (currentGame && /loses?\s+\d+\s+point/i.test(line)) {
			currentGame.winner = 'opponent';
			continue;
		}

		// Move line: " 1) 31: 8/5 6/5                     42: 24/20 13/11"
		if (currentGame && /^\d+\)/.test(line)) {
			// Start new game implicitly if none started
			if (!currentGame) {
				currentGame = {
					moveHistory: [],
					winner: null,
					player1Name: 'Player',
					player2Name: 'CPU'
				};
				board = initialBoard();
				moveNumber = 0;
			}

			// Parse player 1 move and player 2 move
			const moveLineMatch = line.match(/^\d+\)\s*(.*)/);
			if (!moveLineMatch) continue;

			const rest = moveLineMatch[1];

			// Split into two halves: player1 and player2
			// Format: "31: 8/5 6/5                     42: 24/20 13/11"
			// Look for the second dice pattern after some whitespace
			const twoMoveMatch = rest.match(/^(\d{2}:\s*[^\s].*?)\s{2,}(\d{2}:.*)$/);

			if (twoMoveMatch) {
				// Both player moves
				const p1Move = parseSingleMove(twoMoveMatch[1].trim(), board, 'player', ++moveNumber);
				if (p1Move) {
					currentGame.moveHistory.push(p1Move);
					if (p1Move.move.checkerMoves.length > 0) {
						board = applyMove(board, p1Move.move);
					}
				}
				// Opponent move: coordinates in .mat are from opponent's perspective.
				// Flip board → apply → flip back to keep board in player perspective.
				const p2Move = parseSingleMove(twoMoveMatch[2].trim(), board, 'opponent', ++moveNumber);
				if (p2Move) {
					currentGame.moveHistory.push(p2Move);
					if (p2Move.move.checkerMoves.length > 0) {
						board = flipBoard(applyMove(flipBoard(board), p2Move.move));
					}
				}
			} else {
				// Only one move on this line
				const trimmed = rest.trim();
				if (trimmed.match(/^\d{2}:/)) {
					const move = parseSingleMove(trimmed, board, 'player', ++moveNumber);
					if (move) {
						currentGame.moveHistory.push(move);
						if (move.move.checkerMoves.length > 0) {
							board = applyMove(board, move.move);
						}
					}
				}
			}
		}
	}

	// Save last game
	if (currentGame && currentGame.moveHistory.length > 0) {
		games.push(buildSavedGame(currentGame));
	}

	return games;
}

function parseSingleMove(
	text: string,
	board: BoardState,
	player: 'player' | 'opponent',
	moveNumber: number
): MoveRecord | null {
	// Format: "31: 8/5 6/5" or "42: 24/20 13/11" or "63: Cannot Move"
	const match = text.match(/^(\d)(\d):\s*(.*)/);
	if (!match) return null;

	const die1 = parseInt(match[1]) as DieValue;
	const die2 = parseInt(match[2]) as DieValue;
	const moveStr = match[3].trim();
	const dice: DiceRoll = { die1, die2 };

	if (!moveStr || /cannot\s+move/i.test(moveStr) || moveStr === '') {
		return {
			moveNumber,
			player,
			dice,
			move: { checkerMoves: [] },
			board: structuredClone(board)
		};
	}

	// Parse individual checker moves: "8/5" "bar/20" "6/off" "8/5*"
	const checkerMoves: CheckerMove[] = [];
	const moveParts = moveStr.split(/\s+/);
	for (const part of moveParts) {
		// Handle repeated moves like "8/3(2)"
		const repeatMatch = part.match(/^(.+)\((\d+)\)$/);
		const count = repeatMatch ? parseInt(repeatMatch[2]) : 1;
		const movePart = repeatMatch ? repeatMatch[1] : part;

		// Parse chain notation: "13/10*/7"
		const segments = movePart.split('/');
		if (segments.length < 2) continue;

		for (let s = 0; s < segments.length - 1; s++) {
			const fromStr = segments[s].replace('*', '');
			const toStr = segments[s + 1].replace('*', '');
			const isHit = segments[s + 1].includes('*');

			const from = fromStr.toLowerCase() === 'bar' ? BAR : parseInt(fromStr);
			const to = toStr.toLowerCase() === 'off' ? OFF : parseInt(toStr);

			if (isNaN(from) && from !== BAR) continue;
			if (isNaN(to) && to !== OFF) continue;

			for (let r = 0; r < (s === 0 ? count : 1); r++) {
				checkerMoves.push({ from, to, isHit });
			}
		}
	}

	return {
		moveNumber,
		player,
		dice,
		move: { checkerMoves },
		board: structuredClone(board)
	};
}

function buildSavedGame(data: {
	moveHistory: MoveRecord[];
	winner: 'player' | 'opponent' | null;
	player1Name: string;
	player2Name: string;
}): SavedGame {
	return {
		id: crypto.randomUUID(),
		date: new Date().toISOString().slice(0, 10),
		timestamp: Date.now(),
		difficulty: 'strong' as const,
		winner: data.winner || 'player',
		moveCount: data.moveHistory.length,
		moveHistory: data.moveHistory
	};
}
