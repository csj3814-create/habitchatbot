const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testAll() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const models = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-pro",
        "gemini-pro",
        "models/gemini-1.5-flash",
        "models/gemini-pro"
    ];

    console.log("--- Comprehensive Model Test ---");
    for (const m of models) {
        try {
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("test");
            console.log(`Model [${m}]: SUCCESS`);
            return; // 하나라도 성공하면 중지
        } catch (e) {
            console.log(`Model [${m}]: FAILED - ${e.message}`);
        }
    }
}

testAll();
