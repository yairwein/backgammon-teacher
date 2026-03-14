/**
 * Parsers for GNU Backgammon output formats.
 */

import type { BoardState, Move, CheckerMove } from '$lib/backgammon/types.js';
import { BAR, OFF } from '$lib/backgammon/types.js';
import { emptyBoard } from '$lib/backgammon/board.js';

/**
 * Parse a FIBS-style board string (used by some gnubg interfaces).
 * Format: board:You:opponent:length:turn:die1:die2:die1:die2:cube:you_may_double:opp_may_double:was_doubled:colour:direction:home:bar:point1:...
 */
export function parseFibsBoard(fibs: string): { board: BoardState; metadata: Record<string, string> } {
	const parts = fibs.split(':');
	const board = emptyBoard();

	// This is a simplified parser — full FIBS parsing would handle all fields
	if (parts.length < 30) {
		throw new Error('Invalid FIBS board format');
	}

	return { board, metadata: {} };
}

/**
 * Parse a simple position notation.
 * Format: "Player: 6/5(2) 8/3 13/5 24/2  Opponent: 1/2 12/5 17/3 19/5"
 */
export function parseSimplePosition(notation: string): BoardState {
	const board = emptyBoard();
	board.points.fill(0);

	const playerMatch = notation.match(/Player:\s*(.+?)(?:\s+Opponent:|$)/i);
	const opponentMatch = notation.match(/Opponent:\s*(.+)/i);

	if (playerMatch) {
		parseCheckerPlacement(playerMatch[1], board, 'player');
	}
	if (opponentMatch) {
		parseCheckerPlacement(opponentMatch[1], board, 'opponent');
	}

	return board;
}

function parseCheckerPlacement(
	text: string,
	board: BoardState,
	player: 'player' | 'opponent'
): void {
	// Format: point/count or point/count(n)
	const placements = text.trim().split(/\s+/);
	const sign = player === 'player' ? 1 : -1;

	for (const placement of placements) {
		const match = placement.match(/(\d+|bar)\/(\d+)(?:\((\d+)\))?/i);
		if (!match) continue;

		const point = match[1].toLowerCase() === 'bar' ? 'bar' : parseInt(match[1]);
		const countOrTarget = parseInt(match[2]);
		const count = match[3] ? parseInt(match[3]) : 1;

		if (point === 'bar') {
			if (player === 'player') board.playerBar = count;
			else board.opponentBar = count;
		} else if (typeof point === 'number' && point >= 1 && point <= 24) {
			board.points[point - 1] = sign * countOrTarget;
		}
	}
}

/**
 * Parse gnubg's "show board" text output back into a BoardState.
 */
export function parseGnubgBoard(output: string): BoardState {
	const board = emptyBoard();
	board.points.fill(0);

	// gnubg outputs various formats — this handles the basic text board
	const lines = output.split('\n');
	for (const line of lines) {
		// Look for point lines with checker counts
		const pointMatch = line.match(/point\s+(\d+):\s*([+-]?\d+)/gi);
		if (pointMatch) {
			for (const pm of pointMatch) {
				const m = pm.match(/point\s+(\d+):\s*([+-]?\d+)/i);
				if (m) {
					const point = parseInt(m[1]);
					const count = parseInt(m[2]);
					if (point >= 1 && point <= 24) {
						board.points[point - 1] = count;
					}
				}
			}
		}
	}

	return board;
}

/**
 * Parse a move list from gnubg output.
 * Handles formats like: "24/18 13/11" and "bar/22* 6/4"
 */
export function parseMoveList(text: string): Move[] {
	const moves: Move[] = [];
	const lines = text.split('\n');

	for (const line of lines) {
		// Look for numbered move lines
		const match = line.match(/^\s*\d+\.\s+(.+?)(?:\s+Eq\.|$)/);
		if (match) {
			const move = parseSingleMove(match[1].trim());
			if (move.checkerMoves.length > 0) {
				moves.push(move);
			}
		}
	}

	return moves;
}

/**
 * Parse a single move notation string.
 */
export function parseSingleMove(notation: string): Move {
	const checkerMoves: CheckerMove[] = [];
	const parts = notation.split(/\s+/);

	for (const part of parts) {
		// Handle combined notation like "24/18/12"
		const segments = part.split('/');
		if (segments.length < 2) continue;

		for (let i = 0; i < segments.length - 1; i++) {
			let fromStr = segments[i].replace('*', '');
			let toStr = segments[i + 1].replace('*', '');
			const isHit = segments[i + 1].includes('*');

			const from = fromStr.toLowerCase() === 'bar' ? BAR : parseInt(fromStr);
			const to = toStr.toLowerCase() === 'off' ? OFF : parseInt(toStr);

			if (!isNaN(from) || fromStr.toLowerCase() === 'bar') {
				if (!isNaN(to) || toStr.toLowerCase() === 'off') {
					checkerMoves.push({ from, to, isHit });
				}
			}
		}
	}

	return { checkerMoves };
}
