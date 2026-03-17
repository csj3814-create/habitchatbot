const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        const result = await genAI.listModels();
        for (const model of result.models) {
            console.log(model.name);
        }
    } catch (error) {
        console.error('Error listing models:', error);
    }
}

listModels();
