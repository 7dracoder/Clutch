import { Suspense } from "react";
import { LiveObservationPanel } from "@/features/live-capture/live-observation-panel";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ game?: string | string[] }>;
}) {
  const params = await searchParams;
  const game = Array.isArray(params.game) ? params.game[0] : params.game;
  return (
    <Suspense>
      <LiveObservationPanel gameId={game} />
    </Suspense>
  );
}
