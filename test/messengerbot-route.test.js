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

test('messengerbot always blocks connect and register commands in shared rooms', async () => {
    const { createMessengerbotRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'messengerbot.js'),
        {
            '../utils/apiKeyAuth': {
                apiKeyAuth: (req, res, next) => next()
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender, room }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender,
                    room
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/guide': {
                handleGuide: async () => 'GUIDE',
                handleApp: async () => 'APP'
            },
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
                buildDirectChatOnlyMessage: () => 'DIRECT_ONLY'
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'text', text: 'SHARE' })
            },
            '../modules/appFirebase': {
                getUserRecords: async () => []
            },
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/statsHelpers': {
                hasDiet: () => false,
                hasExercise: () => false,
                hasMind: () => false
            }
        }
    );

    const router = createMessengerbotRouter({
        db: {
            ref() {
                throw new Error('db.ref should not be called for blocked commands');
            }
        },
        getChatSession() {
            throw new Error('getChatSession should not be called for blocked commands');
        },
        checkAndLogHabits: async () => {}
    });

    const connectResponse = await postJsonToRouter(router, {
        room: 'open-chat',
        msg: '!연결',
        sender: '테스트 사용자',
        isGroupChat: false
    });

    assert.equal(connectResponse.status, 200);
    assert.equal(connectResponse.json.reply, 'DIRECT_ONLY');

    const registerResponse = await postJsonToRouter(router, {
        room: 'open-chat',
        msg: '!등록 ABCD1234',
        sender: '테스트 사용자',
        isGroupChat: false
    });

    assert.equal(registerResponse.status, 200);
    assert.equal(registerResponse.json.reply, 'DIRECT_ONLY');
});
