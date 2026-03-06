import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    const categories = await prisma.category.findMany({
        select: { name: true, _count: { select: { Questions: true } } },
        orderBy: { name: 'asc' }
    });
    fs.writeFileSync('categories.json', JSON.stringify(categories, null, 2));
    await prisma.$disconnect();
}
main();
