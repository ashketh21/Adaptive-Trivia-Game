import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { decode } from 'html-entities';

const prisma = new PrismaClient();

async function fetchQuestions(amount: number) {
    console.log(`Fetching ${amount} questions from OpenTDB...`);
    const resp = await axios.get(`https://opentdb.com/api.php?amount=${amount}&type=multiple`);
    return resp.data.results;
}

function getStatsForDifficulty(difficulty: string) {
    // Math.max(1.2, 3 - (totalCorrect / totalAttempts) * 2) = multiplier
    // Easy: ~1.2x -> 90/100 correct
    // Medium: ~2.0x -> 50/100 correct
    // Hard: ~2.6x -> 20/100 correct
    if (difficulty === 'easy') {
        return { totalAttempts: 100, totalCorrect: 90 };
    } else if (difficulty === 'medium') {
        return { totalAttempts: 100, totalCorrect: 50 };
    } else {
        return { totalAttempts: 100, totalCorrect: 20 };
    }
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function main() {
    try {
        let totalSeeded = 0;
        for (let i = 0; i < 4; i++) {
            console.log(`\n--- Batch ${i + 1}/4 ---`);
            const questions = await fetchQuestions(50); // fetch 50 at a time

            for (const q of questions) {
                const categoryName = decode(q.category);

                // Find or create category
                let category = await prisma.category.findFirst({ where: { name: categoryName } });
                if (!category) {
                    category = await prisma.category.create({ data: { name: categoryName } });
                }

                const answer = decode(q.correct_answer);
                const incorrectOptions = q.incorrect_answers.map((opt: string) => decode(opt));
                const options = [...incorrectOptions, answer].sort(() => 0.5 - Math.random());

                const stats = getStatsForDifficulty(q.difficulty);

                await prisma.question.create({
                    data: {
                        text: decode(q.question),
                        answer,
                        options,
                        categoryId: category.id,
                        globalStats: {
                            create: stats
                        }
                    }
                });
                totalSeeded++;
            }
            console.log(`Seeded ${totalSeeded} questions so far.`);
            if (i < 9) {
                console.log("Waiting 6 seconds to respect API rate limits...");
                await delay(6000);
            }
        }
        console.log(`\nDatabase seeded with ${totalSeeded} new questions successfully.`);
    } catch (e) {
        console.error("Error seeding DB:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
