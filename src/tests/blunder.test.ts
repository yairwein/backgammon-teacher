import { describe, it, expect } from 'vitest';
import { classifyMove, classifyMoveExtended, blunderLabel } from '$lib/game/blunder.js';
import type { BlunderThresholdConfig } from '$lib/backgammon/types.js';

const normalConfig: BlunderThresholdConfig = {
	preset: 'normal',
	blunderThreshold: 0.08
};

const strictConfig: BlunderThresholdConfig = {
	preset: 'strict',
	blunderThreshold: 0.04
};

describe('classifyMove', () => {
	it('returns none for small equity loss', () => {
		expect(classifyMove(0.02, normalConfig)).toBe('none');
	});

	it('returns blunder for loss above threshold', () => {
		expect(classifyMove(0.10, normalConfig)).toBe('blunder');
	});

	it('returns blunder at exact threshold', () => {
		expect(classifyMove(0.08, normalConfig)).toBe('blunder');
	});

	it('uses strict threshold correctly', () => {
		expect(classifyMove(0.05, strictConfig)).toBe('blunder');
		expect(classifyMove(0.03, strictConfig)).toBe('none');
	});
});

describe('classifyMoveExtended', () => {
	it('classifies into multiple levels', () => {
		expect(classifyMoveExtended(0.01, normalConfig)).toBe('none');
		expect(classifyMoveExtended(0.03, normalConfig)).toBe('inaccuracy');
		expect(classifyMoveExtended(0.05, normalConfig)).toBe('mistake');
		expect(classifyMoveExtended(0.10, normalConfig)).toBe('blunder');
		expect(classifyMoveExtended(0.30, normalConfig)).toBe('hugeBlunder');
	});
});

describe('blunderLabel', () => {
	it('returns empty for none', () => {
		expect(blunderLabel('none')).toBe('');
	});

	it('returns display labels', () => {
		expect(blunderLabel('blunder')).toBe('Blunder');
		expect(blunderLabel('hugeBlunder')).toBe('Huge Blunder');
	});
});
