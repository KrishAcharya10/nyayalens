import { PrismaClient } from "../generated/client/index.js";

export * from "../generated/client/index.js";

let prisma: PrismaClient | undefined;

// Reuse a single client across hot reloads / imports instead of opening a
// new connection pool per import.
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}
