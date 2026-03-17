/**
 * routes/broadcast.js
 * 하루 4회 자동 브로드캐스트 엔드포인트
 * 메신저봇R schedule() 함수에서 호출됨
 *
 * GET /api/broadcast/morning  — 아침 식사 독려 (08:00)
 * GET /api/broadcast/lunch    — 점심 식사 독려 (12:00)
 * GET /api/broadcast/dinner   — 저녁+운동 독려 (18:30)
 * GET /api/broadcast/night    — 오늘 마감 현황 요약 (21:00)
 */

const { Router } = require('express');
const { getGalleryByDate } = require('../modules/appFirebase');
const { hasDiet, hasExercise, hasMind, getKstDateStr } = require('../modules/statsHelpers');

const MORNING_QUOTES = [
    "오늘도 건강한 하루의 시작! 아침 한 끼가 하루의 에너지를 만들어요 🌞",
    "아침 식사는 하루 대사의 불씨 🔥 오늘도 든든하게 시작해요!",
    "좋은 아침이에요! 오늘 첫 번째 건강 기록을 남겨볼까요? 💚",
    "하루의 시작을 기록하면 하루가 달라져요 ✨ 오늘 아침 식단 기록 고고!",
    "아침을 먹는 사람은 하루가 다르다는 거 아시죠? 🍳 오늘도 파이팅!"
];

const LUNCH_QUOTES = [
    "점심 시간이에요! 균형 잡힌 한 끼로 오후 에너지 충전 🍱",
    "점심 식단 기록하셨나요? 단백질 챙기는 거 잊지 마세요 💪",
    "오후도 힘차게! 점심 한 끼 기록으로 오늘의 습관 이어가요 🌟",
    "점심은 먹고 나서 바로 기록이 제일 정확해요 📸 지금 바로!",
    "맛있는 점심 드셨나요? 앱에 기록하면 AI가 영양분석도 해줘요 🤖"
];

const DINNER_QUOTES = [
    "저녁 식사 기록하셨나요? 오늘 운동도 잊지 마세요 🏃",
    "저녁은 단백질 위주로! 오늘 저녁 기록 + 운동 인증까지 도전! 💪",
    "하루 세 끼 중 마지막 한 끼! 저녁 기록으로 오늘 식단 완성 🍽",
    "저녁 먹고 30분 산책 어때요? 운동 기록도 함께 남겨보세요 🚶",
    "저녁 식사 후엔 감사일기도 한 줄 써보세요 📝 마음도 건강해져요!"
];

async function buildNightMessage() {
    const dateStr = getKstDateStr();
    const [, monthStr, dayStr] = dateStr.split('-');

    let logs = [];
    try {
        logs = await getGalleryByDate(dateStr);
    } catch (e) {
        console.warn('[Broadcast/night] 갤러리 조회 실패:', e.message);
    }

    const uniqueUsers = new Set(logs.map(l => l.userId)).size;
    const dietCount = logs.filter(hasDiet).length;
    const exerciseCount = logs.filter(hasExercise).length;
    const mindCount = logs.filter(hasMind).length;

    let msg = `🌙 오늘 마감 현황 (${parseInt(monthStr)}/${parseInt(dayStr)})\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `👥 ${uniqueUsers}명이 오늘 기록했어요!\n`;
    msg += `🍽 식단 ${dietCount}건 | 🏃 운동 ${exerciseCount}건 | 📝 마음 ${mindCount}건\n`;
    msg += `━━━━━━━━━━━━━━━\n`;

    if (uniqueUsers === 0) {
        msg += `아직 오늘 기록이 없어요!\n오늘 자기 전에 한 가지만 기록해봐요 💪`;
    } else {
        msg += `자기 전에 감사일기 한 줄 어때요? 📝\n오늘도 수고하셨어요! 내일도 함께해요 🌟\n\n!랭킹 으로 이번 주 순위 확인!`;
    }

    return msg;
}

function createBroadcastRouter() {
    const router = Router();

    router.get('/morning', (req, res) => {
        const todayStr = getKstDateStr();
        const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(todayStr + 'T00:00:00+09:00').getDay()];
        const quote = MORNING_QUOTES[new Date().getDay() % MORNING_QUOTES.length];
        const msg = `🌞 좋은 아침이에요! (${dow}요일)\n━━━━━━━━━━━━━━━\n${quote}\n\n📱 아침 식단 기록하러 가기\n👉 해빛스쿨 앱 열기\n\n!우리반 으로 오늘 현황 확인!`;
        res.json({ message: msg });
    });

    router.get('/lunch', (req, res) => {
        const quote = LUNCH_QUOTES[new Date().getDay() % LUNCH_QUOTES.length];
        const msg = `🍱 점심 시간이에요!\n━━━━━━━━━━━━━━━\n${quote}\n\n📸 지금 바로 앱에서 점심 기록!\n오늘 !오늘 로 친구들 현황도 확인해요 👀`;
        res.json({ message: msg });
    });

    router.get('/dinner', (req, res) => {
        const quote = DINNER_QUOTES[new Date().getDay() % DINNER_QUOTES.length];
        const msg = `🍽 저녁 시간이에요!\n━━━━━━━━━━━━━━━\n${quote}\n\n💪 오늘 운동 아직 안 하셨다면 지금!\n!오늘 로 오늘 현황 확인해보세요 📊`;
        res.json({ message: msg });
    });

    router.get('/night', async (req, res) => {
        try {
            const msg = await buildNightMessage();
            res.json({ message: msg });
        } catch (e) {
            console.error('[Broadcast/night] 오류:', e.message);
            res.json({ message: `🌙 오늘도 수고하셨어요!\n자기 전에 감사일기 한 줄 써보세요 📝\n내일도 함께 건강해봐요! 💚` });
        }
    });

    return router;
}

module.exports = { createBroadcastRouter };
