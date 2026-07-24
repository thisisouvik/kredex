import prisma from "@/lib/prisma";

async function main() {
  const pool = await prisma.pool.create({
    data: {
      name: "XLM Test Pool",
      status: "active",
      totalLiquidity: BigInt(0),
      availableLiquidity: BigInt(0),
      aprBps: 500,
      aquaAprBps: 200,
    },
  });

  console.log("Pool created:", pool);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
