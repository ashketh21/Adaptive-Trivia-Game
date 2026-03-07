"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    try {
        const count = await prisma.question.count();
        console.log(`\n\n=== TOTAL QUESTIONS IN DB: ${count} ===\n\n`);
    }
    catch (e) {
        console.error("Error:", e);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
