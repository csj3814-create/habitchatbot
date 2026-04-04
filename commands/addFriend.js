/**
 * Friend code helpers for Habits School chatbot.
 * `!내코드` shows the user's public friend code.
 * `!친구 CODE` creates a pending request that must be accepted in the app.
 */

const admin = require('firebase-admin');
const { initAppFirebase } = require('../modules/appFirebase');
const { getMapping, getDisplayName } = require('../modules/userMapping');

const CODE_REGEX = /^[A-Z0-9]{6}$/i;
const FRIEND_REQUEST_TTL_DAYS = 3;

function getUserLabel(userData, fallback = '친구') {
    return userData?.customDisplayName || userData?.displayName || fallback;
}

function buildFriendshipId(uidA, uidB) {
    return [uidA, uidB].sort().join('__');
}

async function handleMyCode(user) {
    const displayName = getDisplayName(user);
    const mapping = await getMapping(user);

    if (!mapping) {
        return `${displayName}님은 아직 계정이 연결되어 있지 않아요.\n먼저 앱 프로필에서 연결 코드를 만든 뒤 !등록 코드 로 연결해 주세요.`;
    }

    const db = initAppFirebase();
    if (!db) {
        return `앱 서버 연결 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.`;
    }

    try {
        const userSnap = await db.doc(`users/${mapping.googleUid}`).get();
        if (!userSnap.exists) {
            return `앱 계정 정보를 찾을 수 없어요.`;
        }

        const referralCode = userSnap.data().referralCode;
        if (!referralCode) {
            return `아직 친구 코드가 준비되지 않았어요. 앱에 다시 접속한 뒤 !내코드 를 다시 확인해 주세요.`;
        }

        return `내 친구 코드\n────────\n${referralCode}\n\n친구에게 이 코드를 알려주고\n상대가 !친구 ${referralCode} 를 입력하면\n앱에서 친구 요청을 수락할 수 있어요.\n\n친구 요청은 ${FRIEND_REQUEST_TTL_DAYS}일 동안 유지돼요.`;
    } catch (error) {
        console.error('[addFriend] Failed to load my code:', error.message);
        return `코드를 불러오는 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.`;
    }
}

async function handleAddFriend(user, args) {
    const displayName = getDisplayName(user);

    if (!args || args.trim() === '') {
        return `친구 연결 방법\n────────\n1. 친구에게 !내코드 를 입력해 달라고 해요.\n2. 받은 코드를 아래처럼 입력해 주세요.\n!친구 ABC123\n3. 상대가 해빛스쿨 앱에서 요청을 수락하면 친구 연결이 완료돼요.\n\n친구가 되면 앱 갤러리와 소셜 챌린지에서 함께 볼 수 있어요.`;
    }

    const code = args.trim().toUpperCase();
    if (!CODE_REGEX.test(code)) {
        return `친구 코드는 영문과 숫자 6자리예요.\n예시: !친구 ABC123`;
    }

    const myMapping = await getMapping(user);
    if (!myMapping) {
        return `${displayName}님은 아직 계정이 연결되어 있지 않아요.\n먼저 앱 프로필에서 연결 코드를 만든 뒤 !등록 코드 로 연결해 주세요.`;
    }

    const db = initAppFirebase();
    if (!db) {
        return `앱 서버 연결 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.`;
    }

    try {
        const targetQuery = await db.collection('users')
            .where('referralCode', '==', code)
            .limit(1)
            .get();

        if (targetQuery.empty) {
            return `${code} 코드를 가진 사용자를 찾지 못했어요.\n코드를 다시 확인해 주세요.`;
        }

        const targetDoc = targetQuery.docs[0];
        const targetUid = targetDoc.id;
        const targetData = targetDoc.data();
        const targetName = getUserLabel(targetData);
        const myUid = myMapping.googleUid;
        const friendshipId = buildFriendshipId(myUid, targetUid);
        const nowMs = Date.now();
        const expiresAtDate = new Date(nowMs + FRIEND_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000);

        if (targetUid === myUid) {
            return `자기 자신을 친구로 추가할 수는 없어요.`;
        }

        const outcome = await db.runTransaction(async (tx) => {
            const myRef = db.doc(`users/${myUid}`);
            const targetRef = db.doc(`users/${targetUid}`);
            const friendshipRef = db.doc(`friendships/${friendshipId}`);

            const [mySnap, targetSnap, friendshipSnap] = await Promise.all([
                tx.get(myRef),
                tx.get(targetRef),
                tx.get(friendshipRef)
            ]);

            if (!mySnap.exists) {
                return { status: 'missing_me' };
            }

            if (!targetSnap.exists) {
                return { status: 'missing_target' };
            }

            const myData = mySnap.data() || {};
            const targetLatestData = targetSnap.data() || {};
            const myFriends = Array.isArray(myData.friends) ? myData.friends : [];
            const targetFriends = Array.isArray(targetLatestData.friends) ? targetLatestData.friends : [];
            const friendshipData = friendshipSnap.exists ? (friendshipSnap.data() || {}) : {};
            const existingExpiresAt = friendshipData.expiresAt;
            const isExpired = friendshipData.status === 'pending'
                && existingExpiresAt?.toMillis
                && existingExpiresAt.toMillis() < nowMs;
            const isMutualFriend = friendshipData.status === 'active'
                || (myFriends.includes(targetUid) && targetFriends.includes(myUid));

            if (isMutualFriend) {
                tx.set(friendshipRef, {
                    users: [myUid, targetUid].sort(),
                    userNames: {
                        [myUid]: getUserLabel(myData, displayName),
                        [targetUid]: getUserLabel(targetLatestData, targetName)
                    },
                    status: 'active',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                return {
                    status: 'already_friends',
                    friendCount: myFriends.length
                };
            }

            if (friendshipData.status === 'pending' && !isExpired) {
                if (friendshipData.pendingForUid === myUid) {
                    return {
                        status: 'incoming_pending',
                        friendName: getUserLabel(targetLatestData, targetName)
                    };
                }

                if (friendshipData.requesterUid === myUid) {
                    return {
                        status: 'pending_exists',
                        friendName: getUserLabel(targetLatestData, targetName)
                    };
                }

                return {
                    status: 'other_pending',
                    friendName: getUserLabel(targetLatestData, targetName)
                };
            }

            if (isExpired) {
                tx.set(friendshipRef, {
                    status: 'expired',
                    expiredAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            if (!myData.referralCode) {
                return { status: 'my_code_missing' };
            }

            const timestamp = admin.firestore.FieldValue.serverTimestamp();
            const expiresAt = admin.firestore.Timestamp.fromDate(expiresAtDate);

            tx.set(friendshipRef, {
                users: [myUid, targetUid].sort(),
                userNames: {
                    [myUid]: getUserLabel(myData, displayName),
                    [targetUid]: getUserLabel(targetLatestData, targetName)
                },
                status: 'pending',
                createdAt: friendshipData.createdAt || timestamp,
                updatedAt: timestamp,
                requesterUid: myUid,
                requesterName: getUserLabel(myData, displayName),
                pendingForUid: targetUid,
                requestedAt: timestamp,
                expiresAt,
                source: 'chatbot'
            }, { merge: true });

            const notificationRef = db.collection('notifications').doc();
            tx.set(notificationRef, {
                postOwnerId: targetUid,
                type: 'friend_request',
                fromUserId: myUid,
                fromUserName: getUserLabel(myData, displayName),
                friendshipId,
                createdAt: timestamp,
                expiresAt
            });

            return {
                status: 'pending_created',
                friendName: getUserLabel(targetLatestData, targetName),
                myCode: myData.referralCode
            };
        });

        switch (outcome.status) {
        case 'already_friends':
            return `${targetName}님은 이미 서로 친구예요.\n이제 앱 갤러리와 소셜 챌린지에서 함께 볼 수 있어요.\n\n현재 친구 수: ${outcome.friendCount}명`;
        case 'pending_created':
            return `${outcome.friendName}님에게 친구 요청을 보냈어요.\n────────\n상대가 해빛스쿨 앱에서 요청을 수락하면\n친구 연결이 완료돼요.\n\n요청 만료: ${FRIEND_REQUEST_TTL_DAYS}일\n내 코드: ${outcome.myCode}`;
        case 'pending_exists':
            return `${outcome.friendName}님에게 이미 친구 요청을 보냈어요.\n상대가 앱에서 수락하면 친구 연결이 완료돼요.\n\n요청은 ${FRIEND_REQUEST_TTL_DAYS}일 뒤 만료돼요.`;
        case 'incoming_pending':
            return `${outcome.friendName}님이 먼저 친구 요청을 보냈어요.\n해빛스쿨 앱에서 수락 또는 거절해 주세요.\n\n요청은 ${FRIEND_REQUEST_TTL_DAYS}일 뒤 만료돼요.`;
        case 'other_pending':
            return `${outcome.friendName}님과의 친구 요청이 이미 진행 중이에요.\n해빛스쿨 앱에서 현재 상태를 확인해 주세요.`;
        case 'my_code_missing':
            return `내 친구 코드가 아직 준비되지 않았어요.\n해빛스쿨 앱에 한 번 다시 접속한 뒤 !내코드 를 다시 확인해 주세요.`;
        case 'missing_me':
            return `내 앱 계정 정보를 찾을 수 없어요.`;
        case 'missing_target':
            return `${targetName}님의 앱 계정 정보를 찾을 수 없어요.`;
        default:
            return `친구 연결 중 예상하지 못한 문제가 발생했어요. 잠시 후 다시 시도해 주세요.`;
        }
    } catch (error) {
        console.error('[addFriend] Failed to manage friendship:', error.message);
        return `친구 연결 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.`;
    }
}

module.exports = { handleAddFriend, handleMyCode };
