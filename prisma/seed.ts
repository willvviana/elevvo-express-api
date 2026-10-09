// prisma/seed.ts
//
// Run with: npx tsx prisma/seed.ts
//
// Inserts three users with shared password "password123".
// Uses upsert so re-running is safe.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const SEED_PASSWORD = "password123";

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  const users = [
    { email: "will@elevvo.dev", name: "Will Viana", role: "ADMIN" as const },
    { email: "maya@elevvo.dev", name: "Maya Rivera", role: "CUSTOMER" as const },
    { email: "sam@elevvo.dev", name: "Sam Okafor", role: "CUSTOMER" as const },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},   // exists — leave as-is
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
      },
    });
    console.log(`Upserted: ${u.email}`);
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());