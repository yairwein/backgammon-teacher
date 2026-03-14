import { promises as fs } from 'fs';
import path from 'path';
import type { GameStorage, SavedGame } from './types.js';

const DATA_DIR = path.resolve('./data');

export class LocalGameStorage implements GameStorage {
	private filePath(userId: string, date: string): string {
		return path.join(DATA_DIR, userId, `${date}.json`);
	}

	async saveGame(userId: string, game: SavedGame): Promise<void> {
		const fp = this.filePath(userId, game.date);
		await fs.mkdir(path.dirname(fp), { recursive: true });

		let games: SavedGame[] = [];
		try {
			const raw = await fs.readFile(fp, 'utf-8');
			games = JSON.parse(raw);
		} catch {
			// file doesn't exist yet
		}

		games.push(game);
		await fs.writeFile(fp, JSON.stringify(games, null, 2));
	}

	async loadGames(userId: string, date: string): Promise<SavedGame[]> {
		try {
			const raw = await fs.readFile(this.filePath(userId, date), 'utf-8');
			return JSON.parse(raw);
		} catch {
			return [];
		}
	}

	async loadGamesByRange(userId: string, fromDate: string, toDate: string): Promise<SavedGame[]> {
		const userDir = path.join(DATA_DIR, userId);
		let files: string[];
		try {
			files = await fs.readdir(userDir);
		} catch {
			return [];
		}

		const results: SavedGame[] = [];
		for (const file of files.sort()) {
			const date = file.replace('.json', '');
			if (date >= fromDate && date <= toDate) {
				const games = await this.loadGames(userId, date);
				results.push(...games);
			}
		}
		return results;
	}

	async loadLatestGames(userId: string, count: number): Promise<SavedGame[]> {
		const userDir = path.join(DATA_DIR, userId);
		let files: string[];
		try {
			files = await fs.readdir(userDir);
		} catch {
			return [];
		}

		const results: SavedGame[] = [];
		for (const file of files.sort().reverse()) {
			if (!file.endsWith('.json')) continue;
			const date = file.replace('.json', '');
			const games = await this.loadGames(userId, date);
			results.push(...games);
			if (results.length >= count) break;
		}
		return results.slice(0, count);
	}
}
