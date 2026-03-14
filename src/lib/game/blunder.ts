/**
 * Blunder classification — pure function.
 */

import type { BlunderLevel, BlunderThresholdConfig } from '$lib/backgammon/types.js';

/**
 * Classify a move based on equity loss and threshold configuration.
 * Currently supports: none | blunder.
 * Designed to expand to: none | inaccuracy | mistake | blunder | hugeBlunder.
 */
export function classifyMove(
	equityLoss: number,
	config: BlunderThresholdConfig
): BlunderLevel {
	if (equityLoss >= config.blunderThreshold) {
		return 'blunder';
	}
	return 'none';
}

/**
 * Extended classification with multiple levels.
 * The thresholds are derived from the base blunder threshold.
 */
export function classifyMoveExtended(
	equityLoss: number,
	config: BlunderThresholdConfig
): BlunderLevel {
	const t = config.blunderThreshold;

	if (equityLoss >= t * 3) return 'hugeBlunder';
	if (equityLoss >= t) return 'blunder';
	if (equityLoss >= t * 0.5) return 'mistake';
	if (equityLoss >= t * 0.25) return 'inaccuracy';
	return 'none';
}

/**
 * Get a display label for a blunder level.
 */
export function blunderLabel(level: BlunderLevel): string {
	switch (level) {
		case 'none': return '';
		case 'inaccuracy': return 'Inaccuracy';
		case 'mistake': return 'Mistake';
		case 'blunder': return 'Blunder';
		case 'hugeBlunder': return 'Huge Blunder';
	}
}

/**
 * Get a CSS class for a blunder level.
 */
export function blunderClass(level: BlunderLevel): string {
	switch (level) {
		case 'none': return '';
		case 'inaccuracy': return 'blunder-inaccuracy';
		case 'mistake': return 'blunder-mistake';
		case 'blunder': return 'blunder-blunder';
		case 'hugeBlunder': return 'blunder-huge';
	}
}
