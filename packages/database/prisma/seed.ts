import { PrismaClient, Role, Difficulty, Language } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "ChangeMe123!";

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@codearena.dev" },
    update: {},
    create: {
      email: "admin@codearena.dev",
      username: "admin",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const contestantOne = await prisma.user.upsert({
    where: { email: "alice@codearena.dev" },
    update: {},
    create: {
      email: "alice@codearena.dev",
      username: "alice",
      passwordHash,
      role: Role.CONTESTANT,
    },
  });

  const contestantTwo = await prisma.user.upsert({
    where: { email: "bob@codearena.dev" },
    update: {},
    create: {
      email: "bob@codearena.dev",
      username: "bob",
      passwordHash,
      role: Role.CONTESTANT,
    },
  });

  const problems = [
    { slug: "two-sum", title: "Two Sum", difficulty: Difficulty.EASY },
    { slug: "reverse-string", title: "Reverse a String", difficulty: Difficulty.EASY },
    { slug: "fizz-buzz", title: "FizzBuzz", difficulty: Difficulty.EASY },
    { slug: "binary-search", title: "Binary Search", difficulty: Difficulty.MEDIUM },
    {
      slug: "longest-substring",
      title: "Longest Substring Without Repeats",
      difficulty: Difficulty.MEDIUM,
    },
    { slug: "merge-intervals", title: "Merge Intervals", difficulty: Difficulty.HARD },
  ];

  for (const p of problems) {
    await prisma.problem.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        title: p.title,
        description: `${p.title} — full statement to be added in Milestone 2.`,
        difficulty: p.difficulty,
        supportedLanguages: [Language.PYTHON, Language.JAVASCRIPT, Language.CPP],
      },
    });
  }

  const now = new Date();
  await prisma.contest.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "CodeArena Launch Contest",
      description: "Seed contest for local development; configured fully in Milestone 4.",
      startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 27 * 60 * 60 * 1000),
      visibility: "PUBLIC",
    },
  });

  console.log("Seeded:", {
    admin: admin.email,
    contestants: [contestantOne.email, contestantTwo.email],
    problems: problems.length,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
