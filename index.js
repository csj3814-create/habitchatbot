require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

// 미들웨어 설정
app.use(express.json());

// Gemini API 초기화
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: '당신은 해빛스쿨 단톡방 멤버들의 운동 습관을 관리하는 따뜻한 응급의학과 전문의 선생님의 친구입니다. 다정하고 공감 능력이 뛰어나며, 의학/운동학적 지식을 바탕으로 짧고 명확하게 응원의 메시지와 조언을 건네주세요. 카카오톡 챗봇 사용자에게 답변하는 것이므로 모바일 화면에 어울리게 작성하세요.',
});

// 메인 페이지 (서버 상태 확인용)
app.get('/', (req, res) => {
    res.send('<h1>해빛스쿨 운동 챗봇 서버가 정상 동작 중입니다!</h1><p>카카오톡 챗봇 설정에서 이 주소를 사용하세요.</p>');
});

// 카카오톡 i 오픈빌더 스킬 엔드포인트
app.post('/api/chat', async (req, res) => {
    try {
        console.log('--- Incoming Request from Kakao ---');
        console.log(JSON.stringify(req.body, null, 2));

        // 카카오톡 발화 내용 (사용자가 보낸 메시지)
        const userMessage = req.body.userRequest?.utterance || '';

        if (!userMessage) {
            return res.status(200).json({
                version: "2.0",
                template: {
                    outputs: [{
                        simpleText: {
                            text: "메시지를 이해하지 못했어요. 운동 기록이나 식단 사진을 보내주시면 코칭해 드릴게요!"
                        }
                    }]
                }
            });
        }

        // Gemini API 호출
        const result = await model.generateContent(userMessage);
        const aiResponse = result.response.text();

        console.log('--- Gemini Response ---');
        console.log(aiResponse);

        // 카카오 형식에 맞춰 응답 반환
        const responseBody = {
            version: "2.0",
            template: {
                outputs: [
                    {
                        simpleText: {
                            text: aiResponse
                        }
                    }
                ]
            }
        };

        res.status(200).json(responseBody);
    } catch (error) {
        console.error('Error handling chat request:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Habits School Chatbot Server Runing on http://localhost:${port}`);
    console.log(`Kakao Endpoint: POST http://localhost:${port}/api/chat`);
});
