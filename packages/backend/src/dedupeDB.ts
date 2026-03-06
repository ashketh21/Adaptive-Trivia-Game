import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Fetching all questions...");
        const allQuestions = await prisma.question.findMany();

        const seenTexts = new Set<string>();
        const idsToDelete: string[] = [];

        for (const q of allQuestions) {
            if (seenTexts.has(q.text)) {
                idsToDelete.push(q.id);
            } else {
                seenTexts.add(q.text);
            }
        }

        console.log(`Found ${idsToDelete.length} duplicate questions.`);

        if (idsToDelete.length > 0) {
            console.log("Deleting global stats for duplicates...");
            await prisma.globalStats.deleteMany({
                where: { questionId: { in: idsToDelete } }
            });

            console.log("Deleting duplicate questions...");
            const deleteResult = await prisma.question.deleteMany({
                where: { id: { in: idsToDelete } }
            });

            console.log(`Deleted ${deleteResult.count} duplicate questions.`);
        }

        const finalCount = await prisma.question.count();
        console.log(`\nFinal unique question count: ${finalCount}`);

    } catch (e) {
        console.error("Error deduplicating DB:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
