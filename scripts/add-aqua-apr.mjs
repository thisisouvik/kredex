import { PrismaClient } from '@prisma/client';
import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

// Use direct URL for migrations
const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: directUrl,
    },
  },
});

async function main() {
  try {
    await prisma.$executeRaw`ALTER TABLE lending_pools ADD COLUMN IF NOT EXISTS aqua_apr_bps NUMERIC DEFAULT 500;`;
    await prisma.$executeRaw`UPDATE lending_pools SET aqua_apr_bps = 850 WHERE name ILIKE '%USDC%';`;
    await prisma.$executeRaw`UPDATE lending_pools SET aqua_apr_bps = 500 WHERE name ILIKE '%XLM%';`;

    console.log("Successfully updated lending_pools with aqua_apr_bps");
  } catch (error) {
    console.error("Error altering table:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
