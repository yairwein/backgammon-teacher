/**
 * Database client and helpers.
 */

import { PrismaClient } from '@prisma/client';

// Singleton Prisma client
let prisma: PrismaClient;

export function getDb(): PrismaClient {
	if (!prisma) {
		prisma = new PrismaClient();
	}
	return prisma;
}

export { prisma };
