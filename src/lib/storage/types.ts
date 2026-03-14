import type { Difficulty, BlunderLevel, MoveRecord } from '$lib/backgammon/types.js';

/** A completed game record saved to storage */
export interface SavedGame {
	id: string;
	date: string; // YYYY-MM-DD
	timestamp: number; // Date.now() at completion
	difficulty: Difficulty;
	winner: 'player' | 'opponent';
	moveCount: number;
	moveHistory?: MoveRecord[];
	analysis?: {
		totalEquityLoss: number;
		blunderCount: number;
		mistakeCount: number;
	};
}

/** Storage interface — implemented by GCS and local filesystem adapters */
export interface GameStorage {
	saveGame(userId: string, game: SavedGame): Promise<void>;
	loadGames(userId: string, date: string): Promise<SavedGame[]>;
	loadGamesByRange(userId: string, fromDate: string, toDate: string): Promise<SavedGame[]>;
	loadLatestGames(userId: string, count: number): Promise<SavedGame[]>;
}
