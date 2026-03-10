/**
 * !등록 — 구글 이메일로 해빛스쿨 앱 계정 연결
 * 사용법: !등록 user@gmail.com
 */

const { registerUser, getMapping, findAppUserByEmail, removeMapping } = require('../modules/userMapping');

// 이메일 형식 검증
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleRegister(sender, args) {
    // 이미 등록된 경우
    const existing = await getMapping(sender);

    // !등록 해제
    if (args === '해제' || args === '삭제') {
        if (!existing) {
            return `${sender}님, 현재 연결된 계정이 없어요!`;
        }
        await removeMapping(sender);
        return `✅ ${sender}님의 계정 연결이 해제되었습니다.\n다시 연결하려면 !등록 이메일 을 입력해주세요.`;
    }

    // 이메일 없이 호출 → 현재 상태 표시
    if (!args || args.trim() === '') {
        if (existing) {
            return `✅ ${sender}님은 이미 연결되어 있어요!\n📧 ${existing.googleEmail}\n\n!내습관 으로 기록을 확인해보세요! 📊\n연결 해제: !등록 해제`;
        }
        return `📱 해빛스쿨 앱 계정 연결\n━━━━━━━━━━━━━━━\n\n사용법: !등록 your@gmail.com\n\n해빛스쿨 앱에 로그인할 때 사용하는\n구글 이메일을 입력해주세요!\n\n연결하면 사용 가능한 기능:\n• !내습관 — 내 앱 기록 조회\n• !주간 — 주간 트렌드 분석\n• AI 코칭 강화 — 내 습관 데이터 반영`;
    }

    const email = args.trim().toLowerCase();

    // 이메일 형식 검증
    if (!isValidEmail(email)) {
        return `⚠️ 올바른 이메일 형식이 아니에요!\n예시: !등록 example@gmail.com`;
    }

    // 이미 같은 이메일로 등록된 경우
    if (existing && existing.googleEmail === email) {
        return `✅ ${sender}님은 이미 ${email}로 연결되어 있어요!\n!내습관 으로 기록을 확인해보세요! 📊`;
    }

    // 앱 Firebase에서 해당 이메일의 유저 검색
    const appUser = await findAppUserByEmail(email);

    if (!appUser) {
        return `⚠️ 해빛스쿨 앱에서 ${email} 계정을 찾을 수 없어요.\n\n확인해주세요:\n1. 해빛스쿨 앱에 가입된 이메일인가요?\n2. 구글 로그인에 사용하는 이메일이 맞나요?\n\n다시 시도: !등록 올바른이메일@gmail.com`;
    }

    // 매핑 등록
    await registerUser(sender, email, appUser.uid);

    const displayName = appUser.displayName ? ` (${appUser.displayName})` : '';

    return `🎉 연결 성공!\n━━━━━━━━━━━━━━━\n👤 ${sender}님${displayName}\n📧 ${email}\n\n이제 사용 가능한 명령어:\n• !내습관 — 내 앱 기록 보기\n• !주간 — 주간 트렌드 분석\n\nAI 코치가 앱 기록을 참고해서\n더 맞춤형 코칭을 해드릴게요! 💪`;
}

module.exports = { handleRegister };
