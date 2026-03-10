/**
 * appFirebase.js
 * 해빛스쿨 앱의 Firebase Firestore에 읽기 전용 연결
 * 
 * 사용법:
 * 1. 해빛스쿨 앱의 serviceAccountKey를 appServiceAccountKey.json으로 저장
 * 2. .env에 APP_FIREBASE_DB_URL 설정 (필요 시)
 */

const admin = require('firebase-admin');

// 앱 Firebase를 두 번째 앱으로 초기화
let appDb = null;

function initAppFirebase() {
    if (appDb) return appDb;

    try {
        // 방법 1: 파일에서 읽기 (로컬 개발)
        // 방법 2: 환경변수에서 읽기 (Render 배포)
        let appServiceAccount;
        try {
            appServiceAccount = require('../appServiceAccountKey.json');
        } catch (_) {
            try {
                // Render Secret Files는 /etc/secrets/ 에 위치
                appServiceAccount = require('/etc/secrets/appServiceAccountKey.json');
            } catch (__) {
                if (process.env.APP_FIREBASE_KEY) {
                    appServiceAccount = JSON.parse(process.env.APP_FIREBASE_KEY);
                } else {
                    console.warn('[AppFirebase] appServiceAccountKey.json을 찾을 수 없음 (프로젝트 루트, /etc/secrets/, 환경변수 모두 확인)');
                    return null;
                }
            }
        }

        const appInstance = admin.initializeApp({
            credential: admin.credential.cert(appServiceAccount),
        }, 'habitsSchoolApp');

        appDb = appInstance.firestore();
        console.log('[AppFirebase] 해빛스쿨 앱 Firestore 연결 성공');
        return appDb;
    } catch (e) {
        console.error('[AppFirebase] 앱 Firebase 초기화 실패:', e.message);
        return null;
    }
}

/**
 * 오늘 날짜의 전체 갤러리(공개) 기록 조회
 * daily_logs 컬렉션에서 특정 날짜의 모든 문서를 가져옴
 */
async function getGalleryByDate(dateStr) {
    const db = initAppFirebase();
    if (!db) return [];

    try {
        const snapshot = await db.collection('daily_logs')
            .where('date', '==', dateStr)
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error('[AppFirebase] 갤러리 조회 실패:', e.message);
        return [];
    }
}

/**
 * 특정 유저의 최근 N일 기록 조회 (구글 UID 기반)
 */
async function getUserRecords(googleUid, days = 7) {
    const db = initAppFirebase();
    if (!db) return [];

    try {
        const snapshot = await db.collection('daily_logs')
            .where('userId', '==', googleUid)
            .orderBy('date', 'desc')
            .limit(days)
            .get();

        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        records.reverse(); // 오래된 순서로 정렬
        return records;
    } catch (e) {
        console.error('[AppFirebase] 유저 기록 조회 실패:', e.message);
        return [];
    }
}

/**
 * 특정 유저의 특정 날짜 기록 조회
 */
async function getUserRecordByDate(googleUid, dateStr) {
    const db = initAppFirebase();
    if (!db) return null;

    try {
        const docId = `${googleUid}_${dateStr}`;
        const docRef = await db.collection('daily_logs').doc(docId).get();
        if (!docRef.exists) return null;
        return { id: docRef.id, ...docRef.data() };
    } catch (e) {
        console.error('[AppFirebase] 유저 일별 기록 조회 실패:', e.message);
        return null;
    }
}

/**
 * 특정 유저의 프로필 조회 (users 컬렉션)
 */
async function getUserProfile(googleUid) {
    const db = initAppFirebase();
    if (!db) return null;

    try {
        const docRef = await db.collection('users').doc(googleUid).get();
        if (!docRef.exists) return null;
        return { id: docRef.id, ...docRef.data() };
    } catch (e) {
        console.error('[AppFirebase] 유저 프로필 조회 실패:', e.message);
        return null;
    }
}

/**
 * 전체 유저 수 조회 (갤러리 통계용)
 */
async function getActiveUserCount(dateStr) {
    const db = initAppFirebase();
    if (!db) return 0;

    try {
        const snapshot = await db.collection('daily_logs')
            .where('date', '==', dateStr)
            .get();

        const uniqueUsers = new Set(snapshot.docs.map(doc => doc.data().userId));
        return uniqueUsers.size;
    } catch (e) {
        console.error('[AppFirebase] 유저 수 조회 실패:', e.message);
        return 0;
    }
}

/**
 * 최근 7일간 전체 기록 통계 (기수 현황용)
 */
async function getWeeklyStats() {
    const db = initAppFirebase();
    if (!db) return null;

    try {
        const today = new Date();
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }

        const allLogs = [];
        // Firestore 'in' 쿼리는 최대 30개까지
        const snapshot = await db.collection('daily_logs')
            .where('date', 'in', dates)
            .get();

        snapshot.docs.forEach(doc => allLogs.push(doc.data()));

        // 통계 계산
        const stats = {
            totalRecords: allLogs.length,
            uniqueUsers: new Set(allLogs.map(l => l.userId)).size,
            dietCount: allLogs.filter(l => l.diet && (l.diet.breakfastUrl || l.diet.lunchUrl || l.diet.dinnerUrl || l.diet.snackUrl)).length,
            exerciseCount: allLogs.filter(l => l.exercise && ((l.exercise.cardioList?.length > 0) || (l.exercise.strengthList?.length > 0))).length,
            mindCount: allLogs.filter(l => l.sleepAndMind && (l.sleepAndMind.sleepImageUrl || l.sleepAndMind.meditationDone || l.sleepAndMind.gratitude)).length,
            dates,
            dailyBreakdown: dates.map(date => {
                const dayLogs = allLogs.filter(l => l.date === date);
                return {
                    date,
                    total: dayLogs.length,
                    users: new Set(dayLogs.map(l => l.userId)).size
                };
            })
        };

        return stats;
    } catch (e) {
        console.error('[AppFirebase] 주간 통계 조회 실패:', e.message);
        return null;
    }
}

module.exports = {
    initAppFirebase,
    getGalleryByDate,
    getUserRecords,
    getUserRecordByDate,
    getUserProfile,
    getActiveUserCount,
    getWeeklyStats
};
