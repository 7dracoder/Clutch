import { networkInterfaces } from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const port = new URL(request.url).port || "3000";
  const addresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter(
      (entry) =>
        entry.family === "IPv4" &&
        !entry.internal &&
        !entry.address.startsWith("169.254."),
    )
    .map((entry) => `http://${entry.address}:${port}`);

  return Response.json({ addresses: [...new Set(addresses)] });
}
