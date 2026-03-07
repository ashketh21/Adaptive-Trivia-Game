"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const html_entities_1 = require("html-entities");
const prisma = new client_1.PrismaClient();
async function fetchQuestions(amount) {
    console.log(`Fetching ${amount} questions from OpenTDB...`);
    const resp = await axios_1.default.get(`https://opentdb.com/api.php?amount=${amount}&type=multiple`);
    return resp.data.results;
}
function getStatsForDifficulty(difficulty) {
    // Math.max(1.2, 3 - (totalCorrect / totalAttempts) * 2) = multiplier
    // Easy: ~1.2x -> 90/100 correct
    // Medium: ~2.0x -> 50/100 correct
    // Hard: ~2.6x -> 20/100 correct
    if (difficulty === 'easy') {
        return { totalAttempts: 100, totalCorrect: 90 };
    }
    else if (difficulty === 'medium') {
        return { totalAttempts: 100, totalCorrect: 50 };
    }
    else {
        return { totalAttempts: 100, totalCorrect: 20 };
    }
}
const delay = (ms) => new Promise(res => setTimeout(res, ms));
async function main() {
    try {
        let totalSeeded = 0;
        for (let i = 0; i < 4; i++) {
            console.log(`\n--- Batch ${i + 1}/4 ---`);
            const questions = await fetchQuestions(50); // fetch 50 at a time
            for (const q of questions) {
                const categoryName = (0, html_entities_1.decode)(q.category);
                // Find or create category
                let category = await prisma.category.findFirst({ where: { name: categoryName } });
                if (!category) {
                    category = await prisma.category.create({ data: { name: categoryName } });
                }
                const answer = (0, html_entities_1.decode)(q.correct_answer);
                const incorrectOptions = q.incorrect_answers.map((opt) => (0, html_entities_1.decode)(opt));
                const options = [...incorrectOptions, answer].sort(() => 0.5 - Math.random());
                const stats = getStatsForDifficulty(q.difficulty);
                await prisma.question.create({
                    data: {
                        text: (0, html_entities_1.decode)(q.question),
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
    }
    catch (e) {
        console.error("Error seeding DB:", e);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
