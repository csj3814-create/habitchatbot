const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function diagnose() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    console.log("--- Diagnostic Start ---");

    const modelsToTry = [
        "gemini-2.5-flash",
        "gemini-flash-latest",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-1.5-flash-latest"
    ];

    for (const modelName of modelsToTry) {
        try {
            console.log(`Testing [${modelName}]...`);
            const testModel = genAI.getGenerativeModel({ model: modelName });
            const testResult = await testModel.generateContent("Hi");
            console.log(`Result for [${modelName}]: SUCCESS`);
            console.log("Response:", testResult.response.text().substring(0, 50) + "...");
        } catch (e) {
            console.log(`Result for [${modelName}]: FAILED - ${e.message}`);
        }
    }
}

diagnose();
