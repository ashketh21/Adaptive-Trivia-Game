import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { decode } from 'html-entities';

const prisma = new PrismaClient();

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function fetchQuestions(amount: number) {
    try {
        console.log(`Fetching ${amount} questions from OpenTDB...`);
        const resp = await axios.get(`https://opentdb.com/api.php?amount=${amount}&type=multiple`);
        return resp.data.results || [];
    } catch (e: any) {
        console.error("Fetch failed:", e.message);
        return [];
    }
}

function getStatsForDifficulty(difficulty: string) {
    if (difficulty === 'easy') {
        return { totalAttempts: 100, totalCorrect: 90 };
    } else if (difficulty === 'medium') {
        return { totalAttempts: 100, totalCorrect: 50 };
    } else {
        return { totalAttempts: 100, totalCorrect: 20 };
    }
}

async function main() {
    try {
        let currentCount = await prisma.question.count();
        console.log(`Initial count: ${currentCount} questions.`);

        const targetCount = 1000;
        let batchNum = 1;

        while (currentCount < targetCount) {
            console.log(`\n--- Batch ${batchNum} ---`);
            const questions = await fetchQuestions(50);

            if (questions.length === 0) {
                console.log("No questions returned. Waiting 10 seconds before retrying...");
                await delay(10000);
                continue;
            }

            let newAdded = 0;
            for (const q of questions) {
                const answer = decode(q.correct_answer);
                const incorrectOptions = q.incorrect_answers.map((opt: string) => decode(opt));
                const options = [...incorrectOptions, answer].sort(() => 0.5 - Math.random());
                const text = decode(q.question);

                // Check for duplicate
                const exists = await prisma.question.findFirst({ where: { text } });
                if (exists) continue;

                const categoryName = decode(q.category);
                let category = await prisma.category.findFirst({ where: { name: categoryName } });
                if (!category) {
                    category = await prisma.category.create({ data: { name: categoryName } });
                }

                const stats = getStatsForDifficulty(q.difficulty);

                await prisma.question.create({
                    data: {
                        text,
                        answer,
                        options,
                        categoryId: category.id,
                        globalStats: {
                            create: stats
                        }
                    }
                });
                newAdded++;
            }

            console.log(`Added ${newAdded} new unique questions in this batch.`);
            currentCount = await prisma.question.count();
            console.log(`Current DB count: ${currentCount}/${targetCount}`);

            if (currentCount < targetCount) {
                console.log("Waiting 6 seconds to respect API rate limits...");
                await delay(6000);
            }
            batchNum++;
        }

        console.log(`\nDone! Database now has ${currentCount} unique questions.`);
    } catch (e) {
        console.error("Error filling DB:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
