import { ProblemWorkspace } from "./ProblemWorkspace";

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProblemWorkspace slug={slug} />;
}
