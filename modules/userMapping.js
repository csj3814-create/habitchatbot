/**
 * userMapping.js
 * 카카오톡(메신저봇R) sender 닉네임 ↔ 해빛스쿨 앱 구글 UID 매핑
 * 
 * 챗봇의 Firebase Realtime DB에 매핑 정보 저장
 * path: user_mappings/{sender_name_encoded}
 */

const admin = require('firebase-admin');

// 챗봇 Firebase의 DB 레퍼런스
function getDb() {
    return admin.database();
}

// sender 이름에서 Firebase 경로에 사용 불가한 문자 제거
function encodeSender(sender) {
    return sender.replace(/[.#$[\]\/]/g, '_');
}

/**
 * 유저 매핑 등록
 * @param {string} sender - 카카오톡 sender 이름
 * @param {string} googleEmail - 구글 이메일 주소
 * @param {string} googleUid - 앱 Firebase의 유저 UID (이메일로 조회 후 설정)
 */
async function registerUser(sender, googleEmail, googleUid) {
    const db = getDb();
    const key = encodeSender(sender);

    await db.ref(`user_mappings/${key}`).set({
        sender,
        googleEmail,
        googleUid,
        registeredAt: new Date().toISOString()
    });

    console.log(`[UserMapping] 등록 완료: ${sender} → ${googleEmail} (uid: ${googleUid})`);
}

/**
 * 매핑 조회 (sender → google UID)
 */
async function getMapping(sender) {
    const db = getDb();
    const key = encodeSender(sender);

    const snapshot = await db.ref(`user_mappings/${key}`).once('value');
    return snapshot.val(); // null if not found
}

/**
 * 구글 이메일로 앱 Firebase에서 유저 검색
 * firebase-admin의 Auth를 사용하여 이메일 → UID 변환
 */
async function findAppUserByEmail(googleEmail) {
    try {
        // 앱 Firebase 인스턴스 확보 (lazy init 보장)
        let appInstance;
        try {
            appInstance = admin.app('habitsSchoolApp');
        } catch (_) {
            // 아직 초기화 안 된 경우 → initAppFirebase() 호출 후 재시도
            const { initAppFirebase } = require('./appFirebase');
            const db = initAppFirebase();
            if (!db) {
                console.error('[UserMapping] 앱 Firebase 초기화 실패 — appServiceAccountKey.json 확인 필요');
                return null;
            }
            appInstance = admin.app('habitsSchoolApp');
        }

        const userRecord = await appInstance.auth().getUserByEmail(googleEmail);
        return {
            uid: userRecord.uid,
            email: userRecord.email,
            displayName: userRecord.displayName || null
        };
    } catch (e) {
        if (e.code === 'auth/user-not-found') {
            return null; // 해당 이메일의 유저가 앱에 없음
        }
        console.error('[UserMapping] 앱 유저 검색 실패:', e.code, e.message);
        return null;
    }
}

/**
 * 전체 user_mappings 조회 (랭킹 uid→sender 역매핑용)
 * @returns {Object} { encodedSender: { sender, googleEmail, googleUid } }
 */
async function getAllMappings() {
    const db = getDb();
    const snapshot = await db.ref('user_mappings').once('value');
    return snapshot.val() || {};
}

/**
 * 매핑 삭제
 */
async function removeMapping(sender) {
    const db = getDb();
    const key = encodeSender(sender);
    await db.ref(`user_mappings/${key}`).remove();
}

module.exports = {
    registerUser,
    getMapping,
    getAllMappings,
    findAppUserByEmail,
    removeMapping
};
