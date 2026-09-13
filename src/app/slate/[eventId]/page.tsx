import { redirect } from "next/navigation";
import { slateGameHref } from "@/features/slate/slate-href";

export default async function GamePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  redirect(slateGameHref(decodeURIComponent(eventId)));
}
