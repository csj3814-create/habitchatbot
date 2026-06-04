const test = require('node:test');
const assert = require('node:assert/strict');
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
        return require(resolvedTarget);
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

function createSnapshot(id, data) {
    return {
        id,
        exists: data !== null && data !== undefined,
        data: () => data
    };
}

function createFakeFriendDb({ myUid, myData, targetUid, targetData, friendshipData }) {
    const writes = [];
    let notificationId = 0;
    const friendshipId = [myUid, targetUid].sort().join('__');

    return {
        writes,
        collection(name) {
            if (name === 'users') {
                return {
                    where(field, operator, value) {
                        assert.equal(field, 'referralCode');
                        assert.equal(operator, '==');

                        return {
                            limit(count) {
                                assert.equal(count, 1);

                                return {
                                    async get() {
                                        if (targetData && value === targetData.referralCode) {
                                            return {
                                                empty: false,
                                                docs: [{ id: targetUid, data: () => targetData }]
                                            };
                                        }

                                        return { empty: true, docs: [] };
                                    }
                                };
                            }
                        };
                    }
                };
            }

            if (name === 'notifications') {
                return {
                    doc() {
                        notificationId += 1;
                        return { path: `notifications/${notificationId}` };
                    }
                };
            }

            throw new Error(`Unexpected collection: ${name}`);
        },
        doc(docPath) {
            return { path: docPath };
        },
        async runTransaction(handler) {
            const txWrites = [];
            const tx = {
                async get(ref) {
                    if (ref.path === `users/${myUid}`) {
                        return createSnapshot(myUid, myData);
                    }

                    if (ref.path === `users/${targetUid}`) {
                        return createSnapshot(targetUid, targetData);
                    }

                    if (ref.path === `friendships/${friendshipId}`) {
                        return createSnapshot(friendshipId, friendshipData);
                    }

                    throw new Error(`Unexpected tx.get path: ${ref.path}`);
                },
                set(ref, data, options) {
                    txWrites.push({ path: ref.path, data, options });
                }
            };

            const result = await handler(tx);
            writes.push(...txWrites);
            return result;
        }
    };
}

const adminMock = {
    firestore: {
        FieldValue: {
            serverTimestamp: () => 'SERVER_TIMESTAMP'
        },
        Timestamp: {
            fromDate: (date) => ({
                toMillis: () => date.getTime(),
                iso: date.toISOString()
            })
        }
    }
};

test('handleRegister shows link-code guidance for an unlinked user', async () => {
    const { handleRegister } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'register.js'),
        {
            '../modules/appFirebase': {
                consumeChatbotLinkCode: async () => null
            },
            '../modules/userMapping': {
                registerUser: async () => {},
                getMapping: async () => null,
                removeMapping: async () => {},
                getDisplayName: (user) => user.displayName
            }
        }
    );

    const result = await handleRegister({ displayName: '테스트' }, '');
    assert.match(result, /!등록 ABCD1234/);
    assert.match(result, /!연결/);
});

test('handleRegister consumes a valid code and stores the mapping', async () => {
    let capturedRegistration = null;

    const { handleRegister } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'register.js'),
        {
            '../modules/appFirebase': {
                consumeChatbotLinkCode: async (code) => {
                    assert.equal(code, 'ABCD1234');
                    return {
                        uid: 'app-user-1',
                        email: 'linked@example.com',
                        displayName: '연결 사용자'
                    };
                }
            },
            '../modules/userMapping': {
                registerUser: async (...args) => {
                    capturedRegistration = args;
                },
                getMapping: async () => null,
                removeMapping: async () => {},
                getDisplayName: (user) => user.displayName
            }
        }
    );

    const user = { displayName: '채팅 사용자', platform: 'kakao', userId: 'kakao-1' };
    const result = await handleRegister(user, 'abcd1234');

    assert.match(result, /!내습관/);
    assert.deepEqual(capturedRegistration, [user, 'linked@example.com', 'app-user-1']);
});

test('handleMyCode returns an invite link and fallback friend code', async () => {
    const { handleMyCode } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'addFriend.js'),
        {
            'firebase-admin': adminMock,
            '../modules/appFirebase': {
                initAppFirebase: () => ({
                    doc(docPath) {
                        assert.equal(docPath, 'users/app-user-1');
                        return {
                            async get() {
                                return createSnapshot('app-user-1', {
                                    referralCode: 'ABC123',
                                    displayName: '초대 사용자'
                                });
                            }
                        };
                    }
                })
            },
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'app-user-1' }),
                getDisplayName: (user) => user.displayName
            }
        }
    );

    const result = await handleMyCode({ displayName: '테스트 사용자' });

    assert.match(result, /https:\/\/habitschool\.web\.app\/\?ref=ABC123/);
    assert.match(result, /친구 코드: ABC123/);
    assert.match(result, /!친구 ABC123/);
});

test('handleAddFriend allows a new request even when the user already has many friends', async () => {
    const db = createFakeFriendDb({
        myUid: 'me',
        myData: {
            referralCode: 'ME0001',
            displayName: '나',
            friends: Array.from({ length: 10 }, (_, index) => `friend-${index}`)
        },
        targetUid: 'target',
        targetData: {
            referralCode: 'ABC123',
            displayName: '상대',
            friends: []
        },
        friendshipData: null
    });

    const { handleAddFriend } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'addFriend.js'),
        {
            'firebase-admin': adminMock,
            '../modules/appFirebase': {
                initAppFirebase: () => db
            },
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'me' }),
                getDisplayName: (user) => user.displayName
            }
        }
    );

    const result = await handleAddFriend({ displayName: '보내는 사람' }, 'ABC123');

    assert.match(result, /친구 요청을 보냈어요/);
    assert.ok(db.writes.some((write) => write.path.startsWith('friendships/')));
    assert.ok(db.writes.some((write) => write.path.startsWith('notifications/')));
});

test('handleAddFriend no longer mentions a global max-friends cap when users are already connected', async () => {
    const db = createFakeFriendDb({
        myUid: 'me',
        myData: {
            referralCode: 'ME0001',
            displayName: '나',
            friends: ['target']
        },
        targetUid: 'target',
        targetData: {
            referralCode: 'ABC123',
            displayName: '상대',
            friends: ['me']
        },
        friendshipData: {
            status: 'active'
        }
    });

    const { handleAddFriend } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'addFriend.js'),
        {
            'firebase-admin': adminMock,
            '../modules/appFirebase': {
                initAppFirebase: () => db
            },
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'me' }),
                getDisplayName: (user) => user.displayName
            }
        }
    );

    const result = await handleAddFriend({ displayName: '보내는 사람' }, 'ABC123');

    assert.match(result, /현재 친구 수: 1명/);
    assert.doesNotMatch(result, /\/3/);
});

test('handleShare asks the user to link their account first', async () => {
    const { handleShare } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'share.js'),
        {
            '../config': { RENDER_URL: 'https://habitchatbot.example.com' },
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/appFirebase': {
                getShareCardPayload: async () => null,
                createShareCardToken: async () => 'unused'
            }
        }
    );

    const result = await handleShare({ displayName: '테스트 사용자', userId: 'kakao-1' });

    assert.equal(result.type, 'text');
    assert.match(result.text, /!등록/);
});

test('handleShare explains when no shareable record exists yet', async () => {
    const { handleShare } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'share.js'),
        {
            '../config': { RENDER_URL: 'https://habitchatbot.example.com' },
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'app-user-1' }),
                getDisplayName: (user) => user.displayName
            },
            '../modules/appFirebase': {
                getShareCardPayload: async () => null,
                createShareCardToken: async () => 'unused'
            }
        }
    );

    const result = await handleShare({ displayName: '테스트 사용자', userId: 'kakao-1' });

    assert.equal(result.type, 'text');
    assert.match(result.text, /!공유/);
});

test('handleShare returns a share-card payload with a tokenized image URL', async () => {
    const { handleShare } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'share.js'),
        {
            '../config': { RENDER_URL: 'https://habitchatbot.example.com/' },
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'app-user-1' }),
                getDisplayName: (user) => user.displayName
            },
            '../modules/appFirebase': {
                getShareCardPayload: async () => ({
                    subtitle: '오늘의 해빛 요약을 카드로 정리했어요.',
                    appUrl: 'https://habitschool.web.app/#gallery',
                    inviteUrl: 'https://habitschool.web.app/?ref=ABC123',
                    referralCode: 'ABC123'
                }),
                createShareCardToken: async ({ googleUid, kakaoUserKey }) => {
                    assert.equal(googleUid, 'app-user-1');
                    assert.equal(kakaoUserKey, 'kakao-1');
                    return 'share-token-1';
                }
            }
        }
    );

    const result = await handleShare({ displayName: '테스트 사용자', userId: 'kakao-1' });

    assert.equal(result.type, 'share-card');
    assert.equal(result.imageUrl, 'https://habitchatbot.example.com/api/share-card/share-token-1.png');
    assert.equal(result.inviteUrl, 'https://habitschool.web.app/?ref=ABC123');
    assert.equal(result.shareCode, 'ABC123');
    assert.equal(result.webLinkUrl, 'https://habitschool.web.app/?ref=ABC123');
    assert.equal(result.galleryUrl, 'https://habitschool.web.app/#gallery');
});

test('handleHaebit asks the user to link their account first', async () => {
    const { handleHaebit } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'haebit.js'),
        {
            '../config': { RENDER_URL: 'https://habitchatbot.example.com' },
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/appFirebase': {
                getLatestShareableRecord: async () => null,
                createHaebitShareToken: async () => 'unused'
            }
        }
    );

    const result = await handleHaebit({ displayName: '테스트 사용자', userId: 'kakao-1' });

    assert.match(result, /계정이 연결되지/);
    assert.match(result, /!등록/);
});

test('handleHaebit explains when no shareable record exists yet', async () => {
    const { handleHaebit } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'haebit.js'),
        {
            '../config': { RENDER_URL: 'https://habitchatbot.example.com' },
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'app-user-1' }),
                getDisplayName: (user) => user.displayName
            },
            '../modules/appFirebase': {
                getLatestShareableRecord: async () => null,
                createHaebitShareToken: async () => 'unused'
            }
        }
    );

    const result = await handleHaebit({ displayName: '테스트 사용자', userId: 'kakao-1' });

    assert.match(result, /공유할 하루 기록/);
    assert.match(result, /!해빛/);
});

test('handleHaebit returns a persistent public gallery link', async () => {
    const record = { id: 'app-user-1_2026-06-04', date: '2026-06-04' };

    const { handleHaebit } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'haebit.js'),
        {
            '../config': { RENDER_URL: 'https://habitchatbot.example.com/' },
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'app-user-1' }),
                getDisplayName: (user) => user.displayName
            },
            '../modules/appFirebase': {
                getLatestShareableRecord: async (googleUid) => {
                    assert.equal(googleUid, 'app-user-1');
                    return record;
                },
                createHaebitShareToken: async ({ googleUid, record: tokenRecord, kakaoUserKey }) => {
                    assert.equal(googleUid, 'app-user-1');
                    assert.equal(tokenRecord, record);
                    assert.equal(kakaoUserKey, 'kakao-1');
                    return 'abc123XY';
                }
            }
        }
    );

    const result = await handleHaebit({ displayName: '테스트 사용자', userId: 'kakao-1' });

    assert.match(result, /테스트 사용자님의 해빛 기록 공유 링크/);
    assert.match(result, /https:\/\/habitchatbot\.example\.com\/abc123XY/);
    assert.match(result, /댓글\/좋아요\/식단\/운동/);
});

test('handleConnect returns a deep-link card for an unlinked user', async () => {
    const { handleConnect } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'connect.js'),
        {
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/chatbotConnect': {
                createChatbotConnectToken: async (user) => {
                    assert.equal(user.userId, 'kakao-1');
                    return {
                        token: 'connect-token-1',
                        expiresAt: '2026-04-05T00:10:00.000Z',
                        webLinkUrl: 'https://habitschool.web.app/?chatbotConnectToken=connect-token-1#profile'
                    };
                }
            }
        }
    );

    const result = await handleConnect({ displayName: '테스트 사용자', userId: 'kakao-1', platform: 'kakao' });

    assert.equal(result.type, 'connect-card');
    assert.equal(result.webLinkUrl, 'https://habitschool.web.app/?chatbotConnectToken=connect-token-1#profile');
    assert.equal(result.expiresAt, '2026-04-05T00:10:00.000Z');
});

test('handleConnect explains when the user is already linked', async () => {
    const { handleConnect } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'connect.js'),
        {
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'app-user-1', googleEmail: 'linked@example.com' }),
                getDisplayName: (user) => user.displayName
            },
            '../modules/chatbotConnect': {
                createChatbotConnectToken: async () => {
                    throw new Error('should not be called');
                }
            }
        }
    );

    const result = await handleConnect({ displayName: '테스트 사용자', userId: 'kakao-1', platform: 'kakao' });

    assert.equal(result.type, 'text');
    assert.match(result.text, /!등록/);
    assert.match(result.text, /!연결/);
});

test('handleGuide explains the step-by-step participation flow', async () => {
    const { handleGuide } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'guide.js'),
        {}
    );

    const result = await handleGuide('테스트 사용자');

    assert.match(result, /해빛코치 참여 안내/);
    assert.match(result, /1\. 아래 링크를 눌러서 들어가세요/);
    assert.match(result, /https:\/\/habitschool\.web\.app\/simple\//);
    assert.match(result, /2\. 구글 로그인을 하세요/);
    assert.match(result, /3\. 맨 아래 해빛스쿨 앱 설치를 누르세요/);
    assert.match(result, /4\. 매일의 식단 운동 마음을 기록하세요/);
    assert.match(result, /챗봇에서 바로 써보세요/);
    assert.match(result, /!오늘 - 오늘 기록 요약/);
    assert.match(result, /!내습관 - 내 기록 보기/);
    assert.match(result, /!주간 - 주간 리포트/);
    assert.match(result, /!공유 - 인증 카드 만들기/);
    assert.doesNotMatch(result, /!연결/);
});

test('handleApp keeps the app-start copy short and points to the web app', async () => {
    const { handleApp } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'guide.js'),
        {}
    );

    const result = await handleApp();

    assert.match(result, /심플형 앱/);
    assert.match(result, /처음엔 여기서 시작하세요/);
    assert.match(result, /https:\/\/habitschool\.web\.app\/simple\//);
    assert.match(result, /식단 운동 수면 마음 기록/);
    assert.match(result, /!오늘 !내습관 !주간 !공유/);
    assert.doesNotMatch(result, /!연결/);
});

test('buildDirectChatOnlyMessage explains that connect commands are 1:1 only', async () => {
    const { buildDirectChatOnlyMessage } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'connect.js'),
        {
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/chatbotConnect': {
                createChatbotConnectToken: async () => {
                    throw new Error('should not be called');
                }
            }
        }
    );

    const result = buildDirectChatOnlyMessage();

    assert.match(result, /1:1/);
    assert.match(result, /!연결/);
    assert.match(result, /pf\.kakao\.com\/_QDZZX\/chat/);
    assert.doesNotMatch(result, /!등록/);
});

test('loadLeaderboardLabels resolves app profile, mapping, account, and uid labels', async () => {
    const { loadLeaderboardLabels } = loadWithMocks(
        path.join(__dirname, '..', 'modules', 'leaderboardLabels.js'),
        {
            './appFirebase': {
                getUserProfilesByIds: async (uids) => {
                    assert.deepEqual(uids, ['profile-uid', 'mapping-uid', 'email-uid', 'fallback-uid']);
                    return {
                        'profile-uid': {
                            customDisplayName: '프로필이름',
                            email: 'profile@example.com'
                        },
                        'email-uid': {
                            displayName: '사용자',
                            email: 'emailuser@example.com'
                        }
                    };
                }
            },
            './userMapping': {
                getAllMappings: async () => ({
                    one: {
                        googleUid: 'mapping-uid',
                        displayName: '매핑이름',
                        googleEmail: 'mapping@example.com'
                    }
                })
            }
        }
    );

    const labels = await loadLeaderboardLabels([
        { uid: 'profile-uid', displayName: '참여자 1' },
        { uid: 'mapping-uid' },
        { uid: 'email-uid' },
        { uid: 'fallback-uid' }
    ]);

    assert.deepEqual(labels, {
        'profile-uid': '프로필이름',
        'mapping-uid': '매핑이름',
        'email-uid': '계정 emailuser',
        'fallback-uid': 'ID fallback'
    });
});

test('handleRanking uses resolved labels instead of participant placeholders', async () => {
    const { handleRanking } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'ranking.js'),
        {
            '../modules/appFirebase': {
                getWeeklyLeaderboard: async () => [
                    { uid: 'uid-name', diet: 7, exercise: 5, mind: 7, score: 21.5 },
                    { uid: 'uid-account', diet: 5, exercise: 4, mind: 5, score: 16 },
                    { uid: 'uid-fallback', diet: 3, exercise: 2, mind: 3, score: 9 }
                ]
            },
            '../modules/leaderboardLabels': {
                loadLeaderboardLabels: async (entries) => {
                    assert.deepEqual(entries.map((entry) => entry.uid), ['uid-name', 'uid-account', 'uid-fallback']);
                    return {
                        'uid-name': '김해빛',
                        'uid-account': '계정 routine',
                        'uid-fallback': 'ID uid-fall'
                    };
                }
            },
            '../modules/statsHelpers': {
                getKstDateStr: () => '2026-06-03'
            }
        }
    );

    const result = await handleRanking();

    assert.match(result, /김해빛/);
    assert.match(result, /계정 routine/);
    assert.match(result, /ID uid-fall/);
    assert.doesNotMatch(result, /참여자 \d+/);
});

test('handleMyHabits uses resolved account labels for linked users with generic chat names', async () => {
    const { handleMyHabits } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'myHabits.js'),
        {
            '../modules/appFirebase': {
                getUserRecords: async () => [
                    {
                        date: '2026-06-02',
                        diet: { breakfastUrl: 'https://example.com/b.jpg' },
                        exercise: { cardioList: [{ imageUrl: 'https://example.com/e.jpg' }] },
                        sleepAndMind: { gratitude: '감사합니다' }
                    }
                ]
            },
            '../modules/userMapping': {
                getMapping: async () => ({
                    googleUid: 'app-user-1',
                    googleEmail: 'routine@example.com'
                }),
                getDisplayName: () => '사용자'
            },
            '../modules/leaderboardLabels': {
                loadLeaderboardLabels: async (entries) => {
                    assert.deepEqual(entries, [{
                        uid: 'app-user-1',
                        displayName: '사용자',
                        email: 'routine@example.com'
                    }]);
                    return { 'app-user-1': '계정 routine' };
                }
            },
            '../modules/statsHelpers': {
                hasDiet: (record) => Boolean(record.diet),
                hasExercise: (record) => Boolean(record.exercise),
                hasSleep: () => false,
                hasGratitude: (record) => Boolean(record.sleepAndMind?.gratitude),
                hasMeditation: () => false,
                progressBar: (count) => `${count}/7일`,
                calculateStreak: () => 1
            }
        }
    );

    const result = await handleMyHabits({ displayName: '사용자' });

    assert.match(result, /계정 routine님의 습관 현황/);
    assert.doesNotMatch(result, /사용자님의 습관 현황/);
});

test('handleBestRecords summarizes the previous Monday-Sunday top 3', async () => {
    const queriedRanges = [];
    const { handleBestRecords } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'bestRecords.js'),
        {
            '../modules/appFirebase': {
                getLeaderboardByDateRange: async (startDate, endDate) => {
                    queriedRanges.push({ startDate, endDate });
                    return [
                        { uid: 'uid-b', displayName: '앱사용자B', diet: 5, exercise: 4, mind: 5, activeDays: 6, totalActivities: 14, score: 16 },
                        { uid: 'uid-a', displayName: '앱사용자A', diet: 7, exercise: 5, mind: 6, activeDays: 7, totalActivities: 18, score: 20.5 },
                        { uid: 'uid-c', displayName: '앱사용자C', diet: 4, exercise: 3, mind: 4, activeDays: 5, totalActivities: 11, score: 12.5 },
                        { uid: 'uid-d', displayName: '앱사용자D', diet: 1, exercise: 1, mind: 1, activeDays: 1, totalActivities: 3, score: 3.5 }
                    ];
                }
            },
            '../modules/leaderboardLabels': {
                loadLeaderboardLabels: async (entries) => {
                    assert.deepEqual(entries.map((entry) => entry.uid), ['uid-a', 'uid-b', 'uid-c']);
                    return {
                        'uid-a': '김해빛',
                        'uid-b': '이루틴'
                    };
                }
            }
        }
    );

    const result = await handleBestRecords('week', {
        now: new Date('2026-05-25T08:00:00+09:00')
    });

    assert.deepEqual(queriedRanges, [{ startDate: '2026-05-18', endDate: '2026-05-24' }]);
    assert.match(result, /지난 한 주 베스트 3 \(5\/18~5\/24\)/);
    assert.match(result, /🥇 김해빛 - 20\.5점/);
    assert.match(result, /🥈 이루틴 - 16점/);
    assert.match(result, /🥉 앱사용자C - 12\.5점/);
    assert.match(result, /총 4명 참여 \| 평균 13\.1점/);
    assert.match(result, /만점 24\.5점/);
});

test('handleBestRecords summarizes the previous calendar month', async () => {
    const queriedRanges = [];
    const { handleBestRecords } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'bestRecords.js'),
        {
            '../modules/appFirebase': {
                getLeaderboardByDateRange: async (startDate, endDate) => {
                    queriedRanges.push({ startDate, endDate });
                    return [
                        { uid: 'uid-a', displayName: '월간왕', diet: 30, exercise: 28, mind: 29, activeDays: 30, totalActivities: 87, score: 101 }
                    ];
                }
            },
            '../modules/leaderboardLabels': {
                loadLeaderboardLabels: async () => ({})
            }
        }
    );

    const result = await handleBestRecords('month', {
        now: new Date('2026-05-01T08:00:00+09:00')
    });

    assert.deepEqual(queriedRanges, [{ startDate: '2026-04-01', endDate: '2026-04-30' }]);
    assert.match(result, /지난 한 달 베스트 3 \(2026년 4월\)/);
    assert.match(result, /🥇 월간왕 - 101점/);
    assert.match(result, /만점 105점/);
});

test('resolveBestRecordsPeriod accepts compact and spaced scheduled commands', async () => {
    const { resolveBestRecordsPeriod } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'bestRecords.js'),
        {
            '../modules/appFirebase': {
                getLeaderboardByDateRange: async () => []
            },
            '../modules/leaderboardLabels': {
                loadLeaderboardLabels: async () => ({})
            }
        }
    );

    assert.equal(resolveBestRecordsPeriod('지난주베스트'), 'week');
    assert.equal(resolveBestRecordsPeriod('지난주 베스트'), 'week');
    assert.equal(resolveBestRecordsPeriod('월간 베스트'), 'month');
    assert.equal(resolveBestRecordsPeriod('지난주베스트\n지난 한 주의 베스트 3를 발표합니다.'), 'week');
    assert.equal(resolveBestRecordsPeriod('지난주\n지난 한 주의 베스트 3를 발표합니다.'), 'week');
    assert.equal(resolveBestRecordsPeriod('지난달베스트\n지난달 기록 성적입니다.'), 'month');
    assert.equal(resolveBestRecordsPeriod('월간베스트\n지난달 기록 성적입니다.'), 'month');
    assert.equal(resolveBestRecordsPeriod('오늘'), null);
});

test('handleToday appends weekly best records on KST Mondays', async () => {
    const queriedDates = [];
    const bestCalls = [];
    const { handleToday } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'today.js'),
        {
            '../modules/appFirebase': {
                getGalleryByDate: async (dateStr) => {
                    queriedDates.push(dateStr);
                    return [];
                }
            },
            '../modules/statsHelpers': {
                hasDiet: () => false,
                hasExercise: () => false,
                hasSleep: () => false,
                hasGratitude: () => false,
                hasMeditation: () => false,
                getKstDateStr: () => '2026-06-08'
            },
            './bestRecords': {
                handleBestRecords: async (period, options) => {
                    bestCalls.push({ period, now: options.now.toISOString() });
                    return `BEST_${period}`;
                }
            }
        }
    );

    const now = new Date('2026-06-08T22:30:00+09:00');
    const result = await handleToday('테스트 사용자', { now });

    assert.deepEqual(queriedDates, ['2026-06-08']);
    assert.deepEqual(bestCalls, [{ period: 'week', now: now.toISOString() }]);
    assert.match(result, /아직 오늘 기록이 없어요/);
    assert.match(result, /BEST_week/);
    assert.doesNotMatch(result, /BEST_month/);
});

test('handleToday appends monthly best records on KST first day of month', async () => {
    const bestCalls = [];
    const { handleToday } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'today.js'),
        {
            '../modules/appFirebase': {
                getGalleryByDate: async () => []
            },
            '../modules/statsHelpers': {
                hasDiet: () => false,
                hasExercise: () => false,
                hasSleep: () => false,
                hasGratitude: () => false,
                hasMeditation: () => false,
                getKstDateStr: () => '2026-07-01'
            },
            './bestRecords': {
                handleBestRecords: async (period) => {
                    bestCalls.push(period);
                    return `BEST_${period}`;
                }
            }
        }
    );

    const result = await handleToday('테스트 사용자', {
        now: new Date('2026-07-01T22:30:00+09:00')
    });

    assert.deepEqual(bestCalls, ['month']);
    assert.match(result, /BEST_month/);
    assert.doesNotMatch(result, /BEST_week/);
});

test('handleToday appends both weekly and monthly best records when KST date is Monday and the first', async () => {
    const bestCalls = [];
    const { handleToday } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'today.js'),
        {
            '../modules/appFirebase': {
                getGalleryByDate: async () => []
            },
            '../modules/statsHelpers': {
                hasDiet: () => false,
                hasExercise: () => false,
                hasSleep: () => false,
                hasGratitude: () => false,
                hasMeditation: () => false,
                getKstDateStr: () => '2026-06-01'
            },
            './bestRecords': {
                handleBestRecords: async (period) => {
                    bestCalls.push(period);
                    return `BEST_${period}`;
                }
            }
        }
    );

    const result = await handleToday('테스트 사용자', {
        now: new Date('2026-06-01T22:30:00+09:00')
    });

    assert.deepEqual(bestCalls, ['week', 'month']);
    assert.match(result, /BEST_week\n\nBEST_month/);
});
