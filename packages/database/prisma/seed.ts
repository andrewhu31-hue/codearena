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
    {
      slug: "two-sum",
      title: "Two Sum",
      difficulty: Difficulty.EASY,
      description:
        "Given an array of integers `nums` and an integer `target`, return the indices of the " +
        "two numbers that add up to `target`. Each input has exactly one solution, and the same " +
        "element may not be used twice.",
      inputFormat: "First line: space-separated integers `nums`. Second line: integer `target`.",
      outputFormat: "Two space-separated indices (0-indexed), in either order.",
      constraints: "2 <= nums.length <= 10^4; -10^9 <= nums[i], target <= 10^9",
      examples: [{ input: "2 7 11 15\n9", output: "0 1" }],
      sampleTests: [{ input: "2 7 11 15\n9", expectedOutput: "0 1" }],
      hiddenTests: [
        { input: "3 2 4\n6", expectedOutput: "1 2" },
        { input: "3 3\n6", expectedOutput: "0 1" },
      ],
    },
    {
      slug: "reverse-string",
      title: "Reverse a String",
      difficulty: Difficulty.EASY,
      description: "Given a string `s`, return the string reversed.",
      inputFormat: "A single line containing `s`.",
      outputFormat: "The reversed string.",
      constraints: "1 <= s.length <= 10^5",
      examples: [{ input: "hello", output: "olleh" }],
      sampleTests: [{ input: "hello", expectedOutput: "olleh" }],
      hiddenTests: [
        { input: "CodeArena", expectedOutput: "anerAedoC" },
        { input: "a", expectedOutput: "a" },
      ],
    },
    {
      slug: "fizz-buzz",
      title: "FizzBuzz",
      difficulty: Difficulty.EASY,
      description:
        "Given an integer `n`, print the numbers from 1 to `n`, one per line. For multiples of " +
        "3 print `Fizz`, for multiples of 5 print `Buzz`, for multiples of both print `FizzBuzz`.",
      inputFormat: "A single integer `n`.",
      outputFormat: "`n` lines, one value per line.",
      constraints: "1 <= n <= 10^4",
      examples: [{ input: "5", output: "1\n2\nFizz\n4\nBuzz" }],
      sampleTests: [{ input: "5", expectedOutput: "1\n2\nFizz\n4\nBuzz" }],
      hiddenTests: [
        {
          input: "15",
          expectedOutput: "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz",
        },
      ],
    },
    {
      slug: "binary-search",
      title: "Binary Search",
      difficulty: Difficulty.MEDIUM,
      description:
        "Given a sorted array of integers `nums` and a target `target`, return the index of " +
        "`target` in `nums`, or -1 if it is not present.",
      inputFormat: "First line: sorted, space-separated integers `nums`. Second line: `target`.",
      outputFormat: "A single integer: the index, or -1.",
      constraints: "1 <= nums.length <= 10^4; nums is sorted ascending",
      examples: [{ input: "-1 0 3 5 9 12\n9", output: "4" }],
      sampleTests: [{ input: "-1 0 3 5 9 12\n9", expectedOutput: "4" }],
      hiddenTests: [
        { input: "-1 0 3 5 9 12\n2", expectedOutput: "-1" },
        { input: "5\n5", expectedOutput: "0" },
      ],
    },
    {
      slug: "longest-substring",
      title: "Longest Substring Without Repeats",
      difficulty: Difficulty.MEDIUM,
      description:
        "Given a string `s`, return the length of the longest substring without repeating " +
        "characters.",
      inputFormat: "A single line containing `s`.",
      outputFormat: "A single integer: the length.",
      constraints: "0 <= s.length <= 5 * 10^4",
      examples: [{ input: "abcabcbb", output: "3" }],
      sampleTests: [{ input: "abcabcbb", expectedOutput: "3" }],
      hiddenTests: [
        { input: "bbbbb", expectedOutput: "1" },
        { input: "pwwkew", expectedOutput: "3" },
      ],
    },
    {
      slug: "merge-intervals",
      title: "Merge Intervals",
      difficulty: Difficulty.HARD,
      description:
        "Given an array of intervals where `intervals[i] = [start_i, end_i]`, merge all " +
        "overlapping intervals and return the non-overlapping intervals sorted by start.",
      inputFormat: "One interval per line as `start end`, terminated by end of input.",
      outputFormat: "The merged intervals, one per line, as `start end`.",
      constraints: "1 <= intervals.length <= 10^4",
      examples: [{ input: "1 3\n2 6\n8 10\n15 18", output: "1 6\n8 10\n15 18" }],
      sampleTests: [{ input: "1 3\n2 6\n8 10\n15 18", expectedOutput: "1 6\n8 10\n15 18" }],
      hiddenTests: [{ input: "1 4\n4 5", expectedOutput: "1 5" }],
    },
  ];

  for (const p of problems) {
    await prisma.problem.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        title: p.title,
        description: p.description,
        inputFormat: p.inputFormat,
        outputFormat: p.outputFormat,
        constraints: p.constraints,
        examples: p.examples,
        difficulty: p.difficulty,
        supportedLanguages: [Language.PYTHON, Language.JAVASCRIPT, Language.CPP],
        testCases: {
          create: [
            ...p.sampleTests.map((t) => ({ ...t, isSample: true })),
            ...p.hiddenTests.map((t) => ({ ...t, isSample: false })),
          ],
        },
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
