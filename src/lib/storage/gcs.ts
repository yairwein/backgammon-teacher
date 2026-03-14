import { Storage } from '@google-cloud/storage';
import type { GameStorage, SavedGame } from './types.js';

export class GcsGameStorage implements GameStorage {
	private storage: Storage;
	private bucket: string;

	constructor(bucketName: string) {
		this.storage = new Storage();
		this.bucket = bucketName;
	}

	private objectPath(userId: string, date: string): string {
		return `${userId}/${date}.json`;
	}

	async saveGame(userId: string, game: SavedGame): Promise<void> {
		const objPath = this.objectPath(userId, game.date);
		const file = this.storage.bucket(this.bucket).file(objPath);

		let games: SavedGame[] = [];
		try {
			const [contents] = await file.download();
			games = JSON.parse(contents.toString());
		} catch {
			// file doesn't exist yet
		}

		games.push(game);
		await file.save(JSON.stringify(games, null, 2), {
			contentType: 'application/json'
		});
	}

	async loadGames(userId: string, date: string): Promise<SavedGame[]> {
		const file = this.storage.bucket(this.bucket).file(this.objectPath(userId, date));
		try {
			const [contents] = await file.download();
			return JSON.parse(contents.toString());
		} catch {
			return [];
		}
	}

	async loadGamesByRange(userId: string, fromDate: string, toDate: string): Promise<SavedGame[]> {
		const [files] = await this.storage.bucket(this.bucket).getFiles({
			prefix: `${userId}/`
		});

		const results: SavedGame[] = [];
		for (const file of files) {
			const date = file.name.replace(`${userId}/`, '').replace('.json', '');
			if (date >= fromDate && date <= toDate) {
				const games = await this.loadGames(userId, date);
				results.push(...games);
			}
		}
		return results;
	}

	async loadLatestGames(userId: string, count: number): Promise<SavedGame[]> {
		const [files] = await this.storage.bucket(this.bucket).getFiles({
			prefix: `${userId}/`
		});

		const results: SavedGame[] = [];
		const sorted = files
			.map((f) => f.name.replace(`${userId}/`, '').replace('.json', ''))
			.sort()
			.reverse();

		for (const date of sorted) {
			const games = await this.loadGames(userId, date);
			results.push(...games);
			if (results.length >= count) break;
		}
		return results.slice(0, count);
	}
}
