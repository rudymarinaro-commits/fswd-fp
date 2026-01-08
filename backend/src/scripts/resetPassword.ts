import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const userId = 2; //  cambia con l'id giusto (test2 o test3)
  const newPassword = "password123";

  const hash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hash },
  });

  console.log(`Password aggiornata per userId ${userId}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
