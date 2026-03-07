"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const fs_1 = __importDefault(require("fs"));
const prisma = new client_1.PrismaClient();
async function main() {
    const categories = await prisma.category.findMany({
        select: { name: true, _count: { select: { Questions: true } } },
        orderBy: { name: 'asc' }
    });
    fs_1.default.writeFileSync('categories.json', JSON.stringify(categories, null, 2));
    await prisma.$disconnect();
}
main();
