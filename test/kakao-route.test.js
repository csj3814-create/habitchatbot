const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

function loadWithMocks(targetPath, mocks) {
    const resolvedTarget = require.resolve(targetPath);
    const targetDir = path.dirname(resolvedTarget);
    const originals = new Map();

    for (const [request, mockExports] of Object.entries(mocks)) {
        const resolvedDependency = require.resolve(request, { paths: [targetDir] });
        originals.set(resolvedDependency, require.cache[resolvedDependency]);
        require.cache[resolvedDependency] = {
            id: resolvedDependency,
            filename: resolvedDependency,
            loaded: true,
            exports: mockExports
        };
    }

    delete require.cache[resolvedTarget];

    try {
        return require(targetPath);
    } finally {
        delete require.cache[resolvedTarget];

        for (const [resolvedDependency, original] of originals.entries()) {
            if (original) {
                require.cache[resolvedDependency] = original;
            } else {
                delete require.cache[resolvedDependency];
            }
        }
    }
}

async function postJsonToRouter(router, body) {
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/', router);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    try {
        const response = await fetch(`http://127.0.0.1:${port}/`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        });

        return {
            status: response.status,
            json: await response.json()
        };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

function buildKakaoBody(utterance) {
    return {
        userRequest: {
            utterance,
            user: {
                id: 'kakao-user-1',
                properties: {
                    nickname: '테스트 사용자'
                }
            }
        }
    };
}

test('kakao help commands return immediately without habit logging or Gemini session', async () => {
    let habitLogCalls = 0;
    let chatSessionCalls = 0;

    const { createKakaoRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'kakao.js'),
        {
            '../utils/kakaoTemplate': {
                buildKakaoResponse: (text) => ({ template: { outputs: [{ simpleText: { text } }] } }),
                buildKakaoShareCardResponse: () => {
                    throw new Error('share response should not be built');
                },
                buildKakaoConnectCardResponse: () => {
                    throw new Error('connect response should not be built');
                }
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/guide': {
                handleGuide: async () => 'GUIDE',
                handleApp: async () => 'APP'
            },
            '../commands/register': { handleRegister: async () => 'REGISTER' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/categoryHabits': {
                handleDiet: async () => 'DIET',
                handleExercise: async () => 'EXERCISE',
                handleMind: async () => 'MIND'
            },
            '../commands/addFriend': {
                handleAddFriend: async () => 'FRIEND',
                handleMyCode: async () => 'MYCODE'
            },
            '../commands/connect': {
                handleConnect: async () => ({ type: 'text', text: 'CONNECT' })
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'text', text: 'SHARE' })
            }
        }
    );

    const router = createKakaoRouter({
        db: {},
        getChatSession() {
            chatSessionCalls += 1;
            throw new Error('getChatSession should not be called for help commands');
        },
        checkAndLogHabits: async () => {
            habitLogCalls += 1;
        },
        isAllowedImageUrl: () => true
    });

    const guideResponse = await postJsonToRouter(router, buildKakaoBody('!도움말'));
    assert.equal(guideResponse.status, 200);
    assert.equal(guideResponse.json.template.outputs[0].simpleText.text, 'GUIDE');

    const appResponse = await postJsonToRouter(router, buildKakaoBody('!앱'));
    assert.equal(appResponse.status, 200);
    assert.equal(appResponse.json.template.outputs[0].simpleText.text, 'APP');

    assert.equal(habitLogCalls, 0);
    assert.equal(chatSessionCalls, 0);
});
