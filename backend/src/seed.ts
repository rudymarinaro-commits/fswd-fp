import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";

  const userEmail = process.env.SEED_USER_EMAIL ?? "user@example.com";
  const userPassword = process.env.SEED_USER_PASSWORD ?? "User123!";

  const [adminHash, userHash] = await Promise.all([
    bcrypt.hash(adminPassword, 10),
    bcrypt.hash(userPassword, 10),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: adminHash, role: "ADMIN" },
    create: { email: adminEmail, passwordHash: adminHash, role: "ADMIN" },
  });

  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: { passwordHash: userHash, role: "USER" },
    create: { email: userEmail, passwordHash: userHash, role: "USER" },
  });

  // Room 4 (coerente col tuo Chat.tsx hard-coded)
  const room = await prisma.room.upsert({
    where: { id: 4 },
    update: { user1Id: admin.id, user2Id: user.id },
    create: { id: 4, user1Id: admin.id, user2Id: user.id },
  });

  const existing = await prisma.message.count({ where: { roomId: room.id } });
  if (existing === 0) {
    await prisma.message.createMany({
      data: [
        { roomId: room.id, userId: admin.id, content: "Ciao! Sono l'admin 👋" },
        {
          roomId: room.id,
          userId: user.id,
          content: "Ciao admin, presente ✅",
        },
      ],
      skipDuplicates: true,
    });
  }

  console.log("✅ Seed completato");
  console.log({
    admin: { email: adminEmail, password: adminPassword },
    user: { email: userEmail, password: userPassword },
    room: { id: room.id },
  });
}

main()
  .catch((err) => {
    console.error("❌ Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
