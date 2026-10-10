// tests/helpers/db.ts

import { PrismaClient } from "@prisma/client";
import { closeRedis } from "../../src/lib/redis.js";

export const prisma = new PrismaClient();

/**
 * Wipe all tables. ORDER MATTERS: children before parents.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Disconnect from Postgres AND Redis. Called in afterAll.
 */
export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  await closeRedis();
}