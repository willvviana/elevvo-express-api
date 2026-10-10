// prisma/seed.ts
//
// Run with: npx tsx prisma/seed.ts
//
// Requires SEED_PASSWORD env var (12+ characters).
// Upserts three users. On re-run, refreshes the password hash
// so a changed SEED_PASSWORD takes effect immediately.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD;

if (!SEED_PASSWORD) {
  throw new Error(
    'SEED_PASSWORD env var is required. Example: $env:SEED_PASSWORD="..."',
  );
}
if (SEED_PASSWORD.length < 12) {
  throw new Error("SEED_PASSWORD must be at least 12 characters");
}

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
      update: { passwordHash },   // refresh hash on re-run
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