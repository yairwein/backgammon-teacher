import { env } from '$env/dynamic/private';
import type { GameStorage } from './types.js';
import { LocalGameStorage } from './local.js';
import { GcsGameStorage } from './gcs.js';

let instance: GameStorage | null = null;

export function getStorage(): GameStorage {
	if (!instance) {
		if (env.STORAGE_BACKEND === 'gcs') {
			const bucket = env.GCS_GAMES_BUCKET;
			if (!bucket) throw new Error('GCS_GAMES_BUCKET env var required when STORAGE_BACKEND=gcs');
			instance = new GcsGameStorage(bucket);
		} else {
			instance = new LocalGameStorage();
		}
	}
	return instance;
}
