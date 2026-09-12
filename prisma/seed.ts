import { prisma } from "../src/lib/db";

async function main() {
  const roomCount = await prisma.room.count();
  console.log(`Richman seed check complete. Current rooms: ${roomCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
