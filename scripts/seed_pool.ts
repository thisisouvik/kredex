import prisma from "@/lib/prisma";

async function main() {
  const pool = await prisma.pool.create({
    data: {
      name: "XLM Test Pool",
      status: "active",
      totalLiquidity: BigInt(0),
      apy: 5.0,
      minDeposit: BigInt(0),
      utilizationRate: 0,
    },
  });

  console.log("Pool created:", pool);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
