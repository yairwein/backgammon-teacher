import { describe, it, expect } from 'vitest';
import { parseMoveNotation } from '$lib/analysis/gnubg.js';
import { OFF, BAR, type DiceRoll } from '$lib/backgammon/types.js';

/** Helper to format moves for readable assertions */
function fmt(moves: { checkerMoves: { from: number; to: number }[] }[]): string[] {
	return moves.map(m =>
		m.checkerMoves.map(cm => {
			const from = cm.from === BAR ? 'bar' : String(cm.from);
			const to = cm.to === OFF ? 'off' : String(cm.to);
			return `${from}/${to}`;
		}).join(' ')
	);
}

function dice(d1: number, d2: number): DiceRoll {
	return { die1: d1, die2: d2 } as DiceRoll;
}

describe('parseMoveNotation — bearing off with combined dice', () => {
	it('2/off with dice 3-1: single die bear-off (die 3 >= point 2)', () => {
		const moves = parseMoveNotation('2/off', dice(3, 1));
		const formatted = fmt(moves);
		expect(formatted).toContain('2/off');
	});

	it('6/off with dice 1-5: should expand to use both dice (neither die >= 6)', () => {
		const moves = parseMoveNotation('6/off', dice(1, 5));
		const formatted = fmt(moves);
		expect(formatted).toContain('6/5 5/off');
		expect(formatted).toContain('6/1 1/off');
	});

	it('3/off with dice 5-2: single die bear-off (die 5 >= point 3)', () => {
		const moves = parseMoveNotation('3/off', dice(5, 2));
		const formatted = fmt(moves);
		expect(formatted).toContain('3/off');
	});

	it('1/off with dice 4-3: single step (both dice higher, no intermediate)', () => {
		const moves = parseMoveNotation('1/off', dice(4, 3));
		const formatted = fmt(moves);
		expect(formatted).toContain('1/off');
	});
});

describe('parseMoveNotation — exact bearing off', () => {
	it('6/off with dice 6-3: exact match on die 6', () => {
		const moves = parseMoveNotation('6/off', dice(6, 3));
		const formatted = fmt(moves);
		expect(formatted).toContain('6/off');
	});

	it('3/off with dice 3-1: exact match on die 3', () => {
		const moves = parseMoveNotation('3/off', dice(3, 1));
		const formatted = fmt(moves);
		expect(formatted).toContain('3/off');
	});
});

describe('parseMoveNotation — doubles bearing off', () => {
	it('4/off with dice 3-3: should expand to 4/1 1/off', () => {
		const moves = parseMoveNotation('4/off', dice(3, 3));
		const formatted = fmt(moves);
		expect(formatted).toContain('4/1 1/off');
	});

	it('5/off with dice 3-3: should expand to 5/2 2/off', () => {
		const moves = parseMoveNotation('5/off', dice(3, 3));
		const formatted = fmt(moves);
		expect(formatted).toContain('5/2 2/off');
	});

	it('2/off with dice 2-2: exact match', () => {
		const moves = parseMoveNotation('2/off', dice(2, 2));
		const formatted = fmt(moves);
		expect(formatted).toContain('2/off');
	});
});

describe('parseMoveNotation — normal combined moves', () => {
	it('24/13 with dice 6-5: two orderings', () => {
		const moves = parseMoveNotation('24/13', dice(6, 5));
		const formatted = fmt(moves);
		expect(formatted).toContain('24/18 18/13');
		expect(formatted).toContain('24/19 19/13');
	});

	it('8/2 with dice 3-3: doubles intermediate steps', () => {
		const moves = parseMoveNotation('8/2', dice(3, 3));
		const formatted = fmt(moves);
		expect(formatted).toContain('8/5 5/2');
	});
});

describe('parseMoveNotation — chain notation', () => {
	it('13/10*/7 with dice 3-3: chain with hit', () => {
		const moves = parseMoveNotation('13/10*/7', dice(3, 3));
		const formatted = fmt(moves);
		expect(formatted.some(m => m.includes('13/10') && m.includes('10/7'))).toBe(true);
	});

	it('bar/20 with dice 5-3: entering from bar', () => {
		const moves = parseMoveNotation('bar/20', dice(5, 3));
		const formatted = fmt(moves);
		expect(formatted).toContain('bar/20');
	});
});

describe('parseMoveNotation — repeat notation', () => {
	it('6/1(2) with dice 5-5: repeated move', () => {
		const moves = parseMoveNotation('6/1(2)', dice(5, 5));
		const formatted = fmt(moves);
		expect(formatted).toContain('6/1 6/1');
	});
});

describe('parseMoveNotation — multi-part bearing off', () => {
	it('6/1 1/off with dice 5-1: two separate parts', () => {
		const moves = parseMoveNotation('6/1 1/off', dice(5, 1));
		const formatted = fmt(moves);
		expect(formatted).toContain('6/1 1/off');
	});

	it('3/off 2/off with dice 4-3: two bear offs', () => {
		const moves = parseMoveNotation('3/off 2/off', dice(4, 3));
		const formatted = fmt(moves);
		expect(formatted).toContain('3/off 2/off');
	});

	it('4/off 2/off with dice 2-6: two single-die bear offs (the reported bug)', () => {
		const moves = parseMoveNotation('4/off 2/off', dice(2, 6));
		const formatted = fmt(moves);
		// Each part should be a single checker move, total = 2
		expect(moves[0].checkerMoves).toHaveLength(2);
		expect(formatted).toContain('4/off 2/off');
	});
});
