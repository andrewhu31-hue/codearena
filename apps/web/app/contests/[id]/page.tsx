import { ContestDetailView } from "./ContestDetailView";

export default async function ContestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContestDetailView contestId={id} />;
}
