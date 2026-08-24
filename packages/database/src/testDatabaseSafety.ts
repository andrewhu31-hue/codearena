const DEFAULT_TEST_DB_NAME = "codearena_test";
const DEFAULT_LOADTEST_DB_NAME = "codearena_loadtest";

function inferDatabaseName(databaseUrl: string): string | null {
    try {
        const parsed = new URL(databaseUrl);
        const pathname = parsed.pathname.startsWith("/") ? parsed.pathname.slice(1) : parsed.pathname;
        return pathname || null;
    } catch {
        return null;
    }
}

export function isDedicatedTestDatabase(databaseUrl: string, expectedName?: string): boolean {
    const databaseName = inferDatabaseName(databaseUrl);
    if (!databaseName) return false;
    const expected = expectedName ?? process.env.TEST_DATABASE_NAME ?? DEFAULT_TEST_DB_NAME;
    return databaseName === expected;
}

export function assertDedicatedTestDatabase(databaseUrl: string, context: string): void {
    const expected = process.env.TEST_DATABASE_NAME ?? DEFAULT_TEST_DB_NAME;
    if (!isDedicatedTestDatabase(databaseUrl, expected)) {
        throw new Error(
            `${context} refused: DATABASE_URL must point to dedicated test database '${expected}'.`,
        );
    }
}

export function assertLoadTestDatabase(databaseUrl: string, context: string): void {
    const expected = process.env.LOADTEST_DATABASE_NAME ?? DEFAULT_LOADTEST_DB_NAME;
    if (!isDedicatedTestDatabase(databaseUrl, expected)) {
        throw new Error(
            `${context} refused: DATABASE_URL must point to dedicated load-test database '${expected}'.`,
        );
    }
}
