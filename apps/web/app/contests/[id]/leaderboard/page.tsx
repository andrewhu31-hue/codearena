import { LeaderboardView } from "./LeaderboardView";

export default async function ContestLeaderboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LeaderboardView contestId={id} />;
}
