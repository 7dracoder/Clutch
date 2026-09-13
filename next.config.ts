import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const lanDevOrigins = Object.values(networkInterfaces())
  .flat()
  .filter(
    (address): address is NonNullable<typeof address> =>
      Boolean(address && address.family === "IPv4" && !address.internal),
  )
  .map((address) => address.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanDevOrigins,
  distDir: process.env.CLUTCH_NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
};

export default nextConfig;
