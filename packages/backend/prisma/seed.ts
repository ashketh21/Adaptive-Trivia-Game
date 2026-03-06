import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Clearing existing data...');
    await prisma.globalStats.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.roomSession.deleteMany({});

    console.log('Seeding Categories...');
    const cat90s = await prisma.category.create({ data: { name: '90s Anime' } });
    const catTech = await prisma.category.create({ data: { name: 'Tech History' } });
    const catSpace = await prisma.category.create({ data: { name: 'Space Exploration' } });

    console.log('Seeding Questions & Volatility Stats...');

    // HOT Question (High accuracy = low multiplier)
    await prisma.question.create({
        data: {
            text: 'Who was the creator of Dragon Ball?',
            answer: 'Akira Toriyama',
            options: ['Akira Toriyama', 'Eiichiro Oda', 'Masashi Kishimoto', 'Tite Kubo'],
            categoryId: cat90s.id,
            globalStats: {
                create: {
                    totalAttempts: 1000,
                    totalCorrect: 850 // 85% correct (HOT)
                }
            }
        }
    });

    // WARM Question (Moderate accuracy = med multiplier)
    await prisma.question.create({
        data: {
            text: 'What year was the first iPhone released?',
            answer: '2007',
            options: ['2005', '2006', '2007', '2008'],
            categoryId: catTech.id,
            globalStats: {
                create: {
                    totalAttempts: 500,
                    totalCorrect: 250 // 50% correct (WARM)
                }
            }
        }
    });

    // COLD Question (Low accuracy = massive multiplier)
    await prisma.question.create({
        data: {
            text: 'What was the name of the first dog in space?',
            answer: 'Laika',
            options: ['Balto', 'Laika', 'Snoopy', 'Astro'],
            categoryId: catSpace.id,
            globalStats: {
                create: {
                    totalAttempts: 1000,
                    totalCorrect: 150 // 15% correct (COLD)
                }
            }
        }
    });

    console.log('Database seeded successfully! 🌱');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
