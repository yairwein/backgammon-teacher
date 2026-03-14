import type { BoardState, Player } from './types.js';
import { CHECKERS_PER_PLAYER } from './types.js';

/** Create the standard starting position */
export function initialBoard(): BoardState {
	const points = new Array(24).fill(0);

	// Standard starting position from player's perspective
	// Point 1 (index 0): 2 opponent checkers
	points[0] = -2;
	// Point 6 (index 5): 5 player checkers
	points[5] = 5;
	// Point 8 (index 7): 3 player checkers
	points[7] = 3;
	// Point 12 (index 11): 5 opponent checkers
	points[11] = -5;
	// Point 13 (index 12): 5 player checkers
	points[12] = 5;
	// Point 17 (index 16): 3 opponent checkers
	points[16] = -3;
	// Point 19 (index 18): 5 opponent checkers
	points[18] = -5;
	// Point 24 (index 23): 2 player checkers
	points[23] = 2;

	return {
		points,
		playerBar: 0,
		opponentBar: 0,
		playerBorneOff: 0,
		opponentBorneOff: 0,
		cubeValue: 1,
		cubeOwner: null
	};
}

/** Create an empty board */
export function emptyBoard(): BoardState {
	return {
		points: new Array(24).fill(0),
		playerBar: 0,
		opponentBar: 0,
		playerBorneOff: 0,
		opponentBorneOff: 0,
		cubeValue: 1,
		cubeOwner: null
	};
}

/** Deep clone a board state */
export function cloneBoard(board: BoardState): BoardState {
	return {
		points: [...board.points],
		playerBar: board.playerBar,
		opponentBar: board.opponentBar,
		playerBorneOff: board.playerBorneOff,
		opponentBorneOff: board.opponentBorneOff,
		cubeValue: board.cubeValue,
		cubeOwner: board.cubeOwner
	};
}

/** Flip the board to show the opponent's perspective */
export function flipBoard(board: BoardState): BoardState {
	const flipped = emptyBoard();
	for (let i = 0; i < 24; i++) {
		flipped.points[i] = -board.points[23 - i];
	}
	flipped.playerBar = board.opponentBar;
	flipped.opponentBar = board.playerBar;
	flipped.playerBorneOff = board.opponentBorneOff;
	flipped.opponentBorneOff = board.playerBorneOff;
	flipped.cubeValue = board.cubeValue;
	flipped.cubeOwner = board.cubeOwner === 'player' ? 'opponent' : board.cubeOwner === 'opponent' ? 'player' : null;
	return flipped;
}

/** Count total checkers for a player */
export function countCheckers(board: BoardState, player: Player): number {
	let count = player === 'player' ? board.playerBar + board.playerBorneOff : board.opponentBar + board.opponentBorneOff;
	for (let i = 0; i < 24; i++) {
		const val = board.points[i];
		if (player === 'player' && val > 0) count += val;
		if (player === 'opponent' && val < 0) count += Math.abs(val);
	}
	return count;
}

/** Calculate pip count for a player */
export function pipCount(board: BoardState, player: Player): number {
	let pips = 0;
	if (player === 'player') {
		pips += board.playerBar * 25;
		for (let i = 0; i < 24; i++) {
			if (board.points[i] > 0) {
				// Distance from bearing off: point i is (i+1) away from off
				pips += board.points[i] * (i + 1);
			}
		}
	} else {
		pips += board.opponentBar * 25;
		for (let i = 0; i < 24; i++) {
			if (board.points[i] < 0) {
				// Opponent's distance: (24 - i)
				pips += Math.abs(board.points[i]) * (24 - i);
			}
		}
	}
	return pips;
}

/** Check if all player's checkers are in the home board (points 1-6 = indices 0-5) */
export function allInHomeBoard(board: BoardState, player: Player): boolean {
	if (player === 'player') {
		if (board.playerBar > 0) return false;
		for (let i = 6; i < 24; i++) {
			if (board.points[i] > 0) return false;
		}
		return true;
	} else {
		if (board.opponentBar > 0) return false;
		for (let i = 0; i < 18; i++) {
			if (board.points[i] < 0) return false;
		}
		return true;
	}
}

/** Check if a game is over (one player has borne off all 15) */
export function isGameOver(board: BoardState): Player | null {
	if (board.playerBorneOff >= CHECKERS_PER_PLAYER) return 'player';
	if (board.opponentBorneOff >= CHECKERS_PER_PLAYER) return 'opponent';
	return null;
}

/** Validate that a board has the correct number of checkers */
export function validateBoard(board: BoardState): boolean {
	const playerCount = countCheckers(board, 'player');
	const opponentCount = countCheckers(board, 'opponent');
	return playerCount === CHECKERS_PER_PLAYER && opponentCount === CHECKERS_PER_PLAYER;
}

/**
 * Convert board to GNU Backgammon position ID format.
 * This is a simplified version — full GNUBG ID encoding is complex.
 * We use a textual representation for the subprocess interface instead.
 */
export function boardToGnubgCommand(board: BoardState): string {
	// Build a "set board" command for gnubg
	// Format: set board simple <player-points> <opponent-points>
	const playerPoints: string[] = [];
	const opponentPoints: string[] = [];

	// Player's bar
	playerPoints.push(board.playerBar.toString());
	// Points 1-24 from player perspective
	for (let i = 0; i < 24; i++) {
		playerPoints.push(Math.max(0, board.points[i]).toString());
	}
	// Player borne off
	playerPoints.push(board.playerBorneOff.toString());

	// Opponent bar
	opponentPoints.push(board.opponentBar.toString());
	// Points 1-24 from opponent perspective (reversed, negated)
	for (let i = 23; i >= 0; i--) {
		opponentPoints.push(Math.max(0, -board.points[i]).toString());
	}
	// Opponent borne off
	opponentPoints.push(board.opponentBorneOff.toString());

	return `set board ${playerPoints.join(' ')} ${opponentPoints.join(' ')}`;
}

/** Format a board as a human-readable string for debugging */
export function boardToString(board: BoardState): string {
	const lines: string[] = [];
	lines.push('+13-14-15-16-17-18------19-20-21-22-23-24-+');

	// Top half (points 13-24)
	const topRow: string[] = [];
	for (let i = 12; i < 24; i++) {
		const v = board.points[i];
		if (v > 0) topRow.push(` ${v > 9 ? '' : ' '}${v}`);
		else if (v < 0) topRow.push(` ${Math.abs(v) > 9 ? '' : ' '}${v}`);
		else topRow.push('  .');
		if (i === 17) topRow.push(' |');
	}
	lines.push(`|${topRow.join('')} |`);

	// Bar info
	lines.push(`| BAR: player=${board.playerBar} opponent=${board.opponentBar}`);
	lines.push(`| OFF: player=${board.playerBorneOff} opponent=${board.opponentBorneOff}`);

	// Bottom half (points 12-1, displayed right to left)
	const botRow: string[] = [];
	for (let i = 11; i >= 0; i--) {
		const v = board.points[i];
		if (v > 0) botRow.push(` ${v > 9 ? '' : ' '}${v}`);
		else if (v < 0) botRow.push(` ${Math.abs(v) > 9 ? '' : ' '}${v}`);
		else botRow.push('  .');
		if (i === 6) botRow.push(' |');
	}
	lines.push(`|${botRow.join('')} |`);
	lines.push('+12-11-10--9--8--7-------6--5--4--3--2--1-+');

	return lines.join('\n');
}
