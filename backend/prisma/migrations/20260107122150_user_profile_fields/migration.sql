-- AlterTable
ALTER TABLE `users` ADD COLUMN `address` VARCHAR(255) NULL,
    ADD COLUMN `avatarUrl` VARCHAR(500) NULL,
    ADD COLUMN `firstName` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `lastName` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `phone` VARCHAR(30) NULL,
    ADD COLUMN `username` VARCHAR(191) NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX `users_username_idx` ON `users`(`username`);
