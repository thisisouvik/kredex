import prisma from '../lib/prisma';
async function run() {
  const positions = await prisma.poolPosition.findMany({
    where: { lenderId: 'eafd8ee1-a10c-4ede-a097-4714913682a7' }
  });
  console.log("Positions:", positions);
  const txs = await prisma.ledgerTransaction.findMany({
    where: { userId: 'eafd8ee1-a10c-4ede-a097-4714913682a7' }
  });
  console.log("Txs:", txs);
}
run();
