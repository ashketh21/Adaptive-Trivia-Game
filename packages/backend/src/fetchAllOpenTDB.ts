import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { decode } from 'html-entities';

const prisma = new PrismaClient();
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function getSessionToken() {
    console.log("Requesting OpenTDB session token...");
    try {
        const resp = await axios.get('https://opentdb.com/api_token.php?command=request');
        if (resp.data.response_code === 0) {
            console.log(`Token received: ${resp.data.token}`);
            return resp.data.token;
        }
    } catch (e: any) {
        console.error("Failed to get session token:", e.message);
    }
    return null;
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
        const token = await getSessionToken();
        if (!token) {
            console.error("Cannot proceed without a session token.");
            return;
        }

        let isExhausted = false;
        let batchNum = 1;
        let totalAdded = 0;

        console.log("Loading existing questions from DB to check for duplicates...");
        const existingQuestions = await prisma.question.findMany({ select: { text: true } });
        const seenTexts = new Set<string>();
        existingQuestions.forEach(q => seenTexts.add(q.text));

        console.log(`Loaded ${seenTexts.size} existing questions from DB.`);

        console.log("Loading existing categories...");
        const existingCategories = await prisma.category.findMany();
        const categoryMap = new Map<string, string>();
        existingCategories.forEach(c => categoryMap.set(c.name, c.id));

        while (!isExhausted) {
            console.log(`\n--- Batch ${batchNum} ---`);
            try {
                const resp = await axios.get(`https://opentdb.com/api.php?amount=50&type=multiple&token=${token}`);
                const data = resp.data;

                if (data.response_code === 4) {
                    console.log("Token empty! All possible questions retrieved for this session.");
                    isExhausted = true;
                    break;
                } else if (data.response_code === 3 || data.response_code === 1 || data.response_code === 2) {
                    console.error("OpenTDB API error response code:", data.response_code);
                    break;
                }

                const questions = data.results || [];
                if (questions.length === 0) {
                    console.log("No questions returned (but no error code). Breaking.");
                    break;
                }

                let newAdded = 0;
                for (const q of questions) {
                    const text = decode(q.question);
                    if (seenTexts.has(text)) {
                        continue;
                    }

                    const answer = decode(q.correct_answer);
                    const incorrectOptions = q.incorrect_answers.map((opt: string) => decode(opt));
                    const options = [...incorrectOptions, answer].sort(() => 0.5 - Math.random());
                    const categoryName = decode(q.category);

                    let categoryId = categoryMap.get(categoryName);
                    if (!categoryId) {
                        const newCat = await prisma.category.create({ data: { name: categoryName } });
                        categoryMap.set(categoryName, newCat.id);
                        categoryId = newCat.id;
                    }

                    const stats = getStatsForDifficulty(q.difficulty);

                    await prisma.question.create({
                        data: {
                            text,
                            answer,
                            options,
                            categoryId: categoryId,
                            globalStats: {
                                create: stats
                            }
                        }
                    });

                    seenTexts.add(text);
                    newAdded++;
                    totalAdded++;
                }

                console.log(`Added ${newAdded} new unique questions in this batch. Total added this session: ${totalAdded}. Total in DB: ${seenTexts.size}`);

                if (!isExhausted) {
                    console.log("Waiting 6 seconds to respect API rate limits...");
                    await delay(6000);
                }
                batchNum++;
            } catch (err: any) {
                console.error("Error fetching batch:", err.message);
                console.log("Waiting 10 seconds before retrying...");
                await delay(10000);
            }
        }

        console.log(`\nDone! Database now has ${seenTexts.size} unique questions.`);
    } catch (e: any) {
        console.error("Error filling DB:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
