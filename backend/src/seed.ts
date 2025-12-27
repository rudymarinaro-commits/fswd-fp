import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const adminEmail = "admin@example.com";
    const adminPassword = "Admin123!";

    const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

    const admin = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
            email: adminEmail,
            passwordHash: adminPasswordHash,
            role: "ADMIN",
        },
    });

    const userEmail = "user@example.com";
    const userPassword = "User123!";

    const userPasswordHash = await bcrypt.hash(userPassword, 10);

    const user = await prisma.user.upsert({
        where: { email: userEmail },
        update: {},
        create: {
            email: userEmail,
            passwordHash: userPasswordHash,
        },
    });

    console.log("✅ Seed ok:", {
        admin: { id: admin.id, email: admin.email, role: admin.role },
        user: { id: user.id, email: user.email, role: user.role },
    });
}

main()
    .catch((e) => {
        console.error("❌ Seed error:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
