import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const count = await prisma.category.count();
    console.log('Total categories:', count);
    const cats = await prisma.category.findMany({ select: { name: true } });
    console.log('Categories:', cats.map(c => c.name).join(' | '));
}
main().catch(console.error).finally(() => prisma.$disconnect());
