import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const email = "admin@example.com";
    const plainPassword = "Admin123!";

    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, passwordHash },
    });

    console.log("✅ Seed ok:", { id: user.id, email: user.email });
}

main()
    .catch((e) => {
        console.error("❌ Seed error:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
