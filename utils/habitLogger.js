/**
 * utils/habitLogger.js
 * 습관 키워드 감지 → Firebase Realtime DB 저장
 * SSRF 방지를 위한 이미지 URL 검증 포함
 */

const ALLOWED_IMAGE_HOSTS = [
    'k.kakaocdn.net',
    'mud-kage.kakao.com',
    'dn-m.talk.kakao.com',
    'img1.kakaocdn.net',
    'firebasestorage.googleapis.com'
];

/**
 * 카카오/Firebase 이미지 URL 검증 (SSRF 방지)
 */
function isAllowedImageUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' &&
            ALLOWED_IMAGE_HOSTS.some(host =>
                parsed.hostname === host || parsed.hostname.endsWith('.' + host)
            );
    } catch {
        return false;
    }
}

/**
 * Firebase DB를 받아 habit 로거 함수들을 반환하는 팩토리
 * @param {import('firebase-admin').database.Database} db
 */
function createHabitLogger(db) {
    async function logHabit(userId, habitType, keyword) {
        try {
            const ref = db.ref(`users/${userId}/records/${Date.now()}`);
            await ref.set({ habitType, keyword, timestamp: new Date().toISOString() });
            console.log(`[DB 저장 완료] ${userId} - ${habitType}`);
        } catch (e) {
            console.error('Firebase DB Error:', e.message);
        }
    }

    async function checkAndLogHabits(userId, msg) {
        // 운동 관련
        if (msg.includes('오운완'))                                                          await logHabit(userId, 'exercise', '오운완');
        else if (msg.includes('스쿼트'))                                                     await logHabit(userId, 'exercise', '스쿼트');
        else if (msg.includes('런지'))                                                       await logHabit(userId, 'exercise', '런지');
        else if (msg.includes('플랭크'))                                                     await logHabit(userId, 'exercise', '플랭크');
        else if (msg.includes('조깅') || msg.includes('러닝') || msg.includes('달리기'))    await logHabit(userId, 'exercise', '달리기');
        else if (msg.includes('산책') || msg.includes('걸었') || msg.includes('걸음'))      await logHabit(userId, 'exercise', '산책');
        else if (msg.includes('스트레칭'))                                                   await logHabit(userId, 'exercise', '스트레칭');
        else if (msg.includes('운동'))                                                       await logHabit(userId, 'exercise', '운동');
        // 식단 관련
        else if (msg.includes('식단') || msg.includes('먹었어') || msg.includes('밥 먹') || msg.includes('식사'))
                                                                                             await logHabit(userId, 'diet', '식단/식사');
        else if (msg.includes('물') && msg.includes('잔'))                                  await logHabit(userId, 'water', '물 마시기');
        // 마음습관 관련
        else if (msg.includes('감사') || msg.includes('감사일기'))                          await logHabit(userId, 'mind', '감사일기');
        else if (msg.includes('명상') || msg.includes('마음챙김') || msg.includes('호흡'))  await logHabit(userId, 'mind', '명상/마음챙김');
        else if (msg.includes('수면') || msg.includes('잠') || msg.includes('잤어'))        await logHabit(userId, 'mind', '수면');
    }

    return { logHabit, checkAndLogHabits };
}

module.exports = { isAllowedImageUrl, createHabitLogger };
