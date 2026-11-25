/**
 * !HBT — 해빛스쿨 토큰(HBT) 안내와 내 HBT 현황.
 *
 * 숫자는 앱 서버 코드 기준이다(habitschool functions/runtime.js, functions/challenge-utils.js, 2026-11-25).
 *  - 전환: 웹 앱 자산 탭, 최소 100P·100P 단위. 비율은 매주 바뀐다(mining_rate_history).
 *  - 예치 챌린지: 3일 미니(예치 없음), 7일 위클리(50~5,000 HBT), 30일 마스터(100~10,000 HBT).
 *    다 채우면 원금+보너스, 80% 이상이면 원금 반환, 그 아래·포기면 예치금 절반 소각·절반 반환.
 *  - 플레이 앱·안드로이드 앱에서는 HBT 화면이 숨겨진다(js/hbt-convert-nudge.js).
 *
 * 지갑 잔액은 체인에만 있다(Firestore 에 없음). 단톡방에 잔액을 올리지 않도록 여기서는 읽지 않는다.
 * 가격·시세·투자 이야기는 하지 않는다.
 */

const { getUserProfile, getLatestMiningRate } = require('../modules/appFirebase');
const { getMapping, getDisplayName } = require('../modules/userMapping');

const APP_URL = 'https://habitschool.kr/';

const CHALLENGE_TIERS = {
    mini: '3일 미니',
    weekly: '7일 위클리',
    master: '30일 마스터'
};

function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return number.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

function formatMonthDay(dateStr) {
    const match = String(dateStr || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    return match ? `${Number(match[1])}/${Number(match[2])}` : '';
}

function formatRateLine(rate) {
    if (!rate) return '';
    return `이번 주 전환 비율: 100P → ${formatNumber(rate.rate * 100)} HBT`;
}

/** users/{uid}.activeChallenges.{mini|weekly|master} — 빈 칸은 건너뛴다. */
function describeActiveChallenges(profile) {
    const active = profile?.activeChallenges && typeof profile.activeChallenges === 'object'
        ? profile.activeChallenges
        : {};

    return Object.keys(CHALLENGE_TIERS)
        .map((tier) => [tier, active[tier]])
        .filter(([, challenge]) => challenge && challenge.challengeId && challenge.totalDays)
        .map(([tier, challenge]) => {
            const parts = [`${CHALLENGE_TIERS[tier]} ${Number(challenge.completedDays) || 0}/${challenge.totalDays}일`];
            const end = formatMonthDay(challenge.endDate);
            if (challenge.status === 'claimable') {
                parts.push('정산을 기다려요');
            } else if (end) {
                parts.push(`${end}까지`);
            }
            if (Number(challenge.hbtStaked) > 0) {
                parts.push(`예치 ${formatNumber(challenge.hbtStaked)} HBT`);
            }
            return `· ${parts.join(' · ')}`;
        });
}

function buildHbtGuide(rate) {
    const lines = [
        '💰 HBT 안내',
        'HBT는 해빛스쿨 기록으로 모은 포인트를 바꿔 받는 해빛스쿨 토큰이에요.',
        '',
        '· 전환: 웹 앱 자산 탭에서 100P부터 100P 단위로'
    ];
    const rateLine = formatRateLine(rate);
    if (rateLine) lines.push(`  ${rateLine}`);
    lines.push(
        '· 예치 챌린지: 3일 미니(예치 없음), 7일 위클리(50~5,000 HBT), 30일 마스터(100~10,000 HBT)',
        '  다 채우면 원금과 보너스, 80% 이상이면 원금을 돌려받아요. 그 아래면 예치금 절반이 소각돼요.',
        '· 플레이 스토어 앱에서는 HBT가 보이지 않아요. 웹에서 열어 주세요.',
        APP_URL
    );
    return lines.join('\n');
}

async function handleHbt(user) {
    const [mapping, rate] = await Promise.all([
        getMapping(user).catch(() => null),
        getLatestMiningRate()
    ]);

    if (!mapping?.googleUid) {
        return `${buildHbtGuide(rate)}\n\n!연결 하면 내 포인트와 예치 챌린지 현황도 볼 수 있어요.`;
    }

    let profile = null;
    try {
        profile = await getUserProfile(mapping.googleUid);
    } catch (error) {
        console.warn('[HBT] Could not load the profile:', error.message);
    }
    if (!profile) {
        return buildHbtGuide(rate);
    }

    const displayName = getDisplayName(user);
    const lines = [
        `💰 ${displayName}님의 HBT`,
        '──────────',
        `포인트: ${formatNumber(profile.coins)}P`,
        `지금까지 받은 HBT: ${formatNumber(profile.totalHbtEarned)} HBT`
    ];

    const challenges = describeActiveChallenges(profile);
    if (challenges.length > 0) {
        lines.push('진행 중 예치 챌린지', ...challenges);
    } else {
        lines.push('진행 중 예치 챌린지: 없음');
    }

    lines.push('──────────');
    const rateLine = formatRateLine(rate);
    if (rateLine) lines.push(rateLine);
    lines.push(
        '전환·예치·지갑 잔액은 웹 앱 자산 탭에서 해요.',
        APP_URL
    );

    return lines.join('\n');
}

/** !HBT · !hbt · !토큰 · !해빛토큰 (앞의 ! 는 뗀 뒤) */
function isHbtCommand(text) {
    const command = String(text || '').trim().toLowerCase();
    return command === 'hbt' || command === '토큰' || command === '해빛토큰';
}

module.exports = { handleHbt, buildHbtGuide, describeActiveChallenges, isHbtCommand };
