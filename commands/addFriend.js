/**
 * !친구 [코드] — 친구 코드로 해빛스쿨 앱 친구 추가
 * !내코드      — 내 친구 코드 확인
 *
 * 친구 코드 = 기존 referralCode (6자리 영숫자) 재활용
 * 앱 friends 배열에 arrayUnion으로 추가 (최대 3명)
 */

const admin = require('firebase-admin');
const { initAppFirebase } = require('../modules/appFirebase');
const { getMapping } = require('../modules/userMapping');

const MAX_FRIENDS = 3;
const CODE_REGEX = /^[A-Z0-9]{6}$/i;

/**
 * !내코드 — 내 친구 코드(= referralCode) 반환
 */
async function handleMyCode(sender) {
    const mapping = await getMapping(sender);
    if (!mapping) {
        return `🔗 앱 계정이 연결되어 있지 않아요!\n먼저 !등록 이메일 로 연결해주세요.`;
    }

    const db = initAppFirebase();
    if (!db) return `⚠️ 앱 서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.`;

    try {
        const userSnap = await db.doc(`users/${mapping.googleUid}`).get();
        if (!userSnap.exists) return `⚠️ 앱 계정 정보를 찾을 수 없어요.`;

        const referralCode = userSnap.data().referralCode;
        if (!referralCode) return `⚠️ 아직 친구 코드가 생성되지 않았어요. 앱에 한 번 접속해보세요!`;

        return `👥 내 친구 코드\n━━━━━━━━━━━━━━━\n🔑 ${referralCode}\n\n친구에게 이 코드를 알려주고\n친구가 !친구 ${referralCode} 를 입력하면\n갤러리 상단에 내 기록이 뜹니다! 📌`;
    } catch (e) {
        console.error('[addFriend] 내코드 조회 실패:', e.message);
        return `⚠️ 코드 조회 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.`;
    }
}

/**
 * !친구 [코드] — 코드로 친구 추가
 */
async function handleAddFriend(sender, args) {
    // 코드 없이 호출 → 안내
    if (!args || args.trim() === '') {
        return `👥 친구 추가 방법\n━━━━━━━━━━━━━━━\n1. 친구에게 !내코드 를 입력해달라고 해요\n2. 친구의 코드를 받아서:\n   !친구 [친구코드] 를 입력하세요\n\n예시: !친구 ABC123\n\n최대 ${MAX_FRIENDS}명까지 등록 가능합니다 😊`;
    }

    const code = args.trim().toUpperCase();

    // 코드 형식 검증
    if (!CODE_REGEX.test(code)) {
        return `⚠️ 친구 코드는 영문+숫자 6자리예요!\n예시: !친구 ABC123`;
    }

    // 내 앱 계정 확인
    const myMapping = await getMapping(sender);
    if (!myMapping) {
        return `🔗 앱 계정이 연결되어 있지 않아요!\n먼저 !등록 이메일 로 연결해주세요.`;
    }

    const db = initAppFirebase();
    if (!db) return `⚠️ 앱 서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.`;

    try {
        // 코드로 상대방 조회
        const targetSnap = await db.collection('users')
            .where('referralCode', '==', code)
            .limit(1)
            .get();

        if (targetSnap.empty) {
            return `⚠️ ${code} 코드를 가진 회원을 찾을 수 없어요.\n코드를 다시 확인해주세요!`;
        }

        const targetUid = targetSnap.docs[0].id;
        const targetName = targetSnap.docs[0].data().customDisplayName
            || targetSnap.docs[0].data().displayName
            || '상대방';

        // 자기 자신 방지
        if (targetUid === myMapping.googleUid) {
            return `😅 자기 자신을 친구로 추가할 수 없어요!`;
        }

        // 내 현재 friends 배열 확인
        const myUserSnap = await db.doc(`users/${myMapping.googleUid}`).get();
        if (!myUserSnap.exists) return `⚠️ 내 앱 계정 정보를 찾을 수 없어요.`;

        const currentFriends = myUserSnap.data().friends || [];

        // 이미 친구
        if (currentFriends.includes(targetUid)) {
            return `✅ ${targetName}님은 이미 친구예요!\n갤러리에서 ${targetName}님의 기록이 상단에 뜹니다 📌`;
        }

        // 최대 인원 초과
        if (currentFriends.length >= MAX_FRIENDS) {
            return `⚠️ 친구는 최대 ${MAX_FRIENDS}명까지 등록할 수 있어요.\n앱에서 기존 친구를 삭제하고 다시 시도해주세요!`;
        }

        // 친구 추가 (Firestore arrayUnion)
        await db.doc(`users/${myMapping.googleUid}`).set(
            { friends: admin.firestore.FieldValue.arrayUnion(targetUid) },
            { merge: true }
        );

        console.log(`[addFriend] ${sender}(${myMapping.googleUid}) → ${targetName}(${targetUid}) 친구 추가`);

        return `🎉 ${targetName}님과 친구가 되었어요!\n━━━━━━━━━━━━━━━\n이제 해빛스쿨 앱 갤러리에서\n${targetName}님의 기록이 상단에 뜹니다 📌\n\n현재 친구: ${currentFriends.length + 1}/${MAX_FRIENDS}명`;

    } catch (e) {
        console.error('[addFriend] 친구 추가 실패:', e.message);
        return `⚠️ 친구 추가 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.`;
    }
}

module.exports = { handleAddFriend, handleMyCode };
