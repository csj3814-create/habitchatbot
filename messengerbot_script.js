/**
 * 안드로이드 메신저봇R 앱 전용 스크립트입니다.
 *
 * [주의]
 * 1. 이 코드를 복사하여 메신저봇R 앱의 새 스크립트에 붙여넣으세요.
 * 2. 원활한 동작을 위해 Rhino 자바스크립트 엔진 버전을 사용하세요.
 * 3. 아래 'SERVER_URL' 부분을 ngrok 등 외부 접속이 가능한 노드 서버 주소로 변경하세요.
 * 4. GROUP_ROOM_NAME을 실제 단톡방 이름으로 변경하세요. (정확히 일치해야 함)
 *
 * [v2 업데이트] 해빛스쿨 앱 연동 명령어 추가
 * !오늘, !내습관, !주간, !우리반, !등록, !도움말, !랭킹, !안내
 *
 * [v4 업데이트] 신규 멤버 온보딩
 * 오픈채팅봇 환영 메세지 감지 → 10초 후 자기소개 유도 + 앱 사용방법 안내
 */

const SERVER_URL = "https://habitchatbot.onrender.com/api/messengerbot";
const OPEN_CHAT_BOT_NAME = "오픈채팅봇";
const OPEN_CHAT_WELCOME_PREFIX = "식습관 운동습관 잠습관";
const OPEN_CHAT_AUTO_COMMANDS = {
    "오늘": true
};

// ⚠️ 아래 값을 실제 단톡방 이름으로 변경하세요 (정확히 일치해야 함)
const GROUP_ROOM_NAME = "최석재";

// ⚠️ 서버의 MESSENGER_API_KEY 환경변수와 동일한 값으로 변경하세요
const API_KEY = "abde0e8382bc4d8c4f22504217e8a3d1";

function normalizeMessageText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}

function isOpenChatBotWelcomeMessage(sender, msg) {
    if (sender !== OPEN_CHAT_BOT_NAME) {
        return false;
    }

    var normalized = String(msg || "").trim();

    if (!normalized || normalized.charAt(0) === "!") {
        return false;
    }

    var firstLine = normalized.split(/\r?\n/)[0].trim();
    var normalizedFirstLine = normalizeMessageText(firstLine);

    return normalizedFirstLine === OPEN_CHAT_WELCOME_PREFIX;
}

function extractCommandMessage(msg, sender) {
    var trimmed = String(msg || "").trim();

    if (!trimmed || trimmed.charAt(0) !== "!") {
        return "";
    }

    var withoutBang = trimmed.substring(1).trim();

    if (sender !== OPEN_CHAT_BOT_NAME) {
        return withoutBang;
    }

    var firstLine = withoutBang.split(/\r?\n/)[0].trim();
    var firstToken = firstLine.split(/\s+/)[0].trim();

    if (OPEN_CHAT_AUTO_COMMANDS[firstToken]) {
        return firstToken;
    }

    return withoutBang;
}

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
    try {
        Log.i("수신 -> 방: " + room + " / 보낸분: " + sender + " / 메시지: " + msg);

        // ✅ 신규 멤버 입장 감지 (오픈채팅봇 환영 메세지 수신 시)
        // 오픈채팅방에서 "OOO님이 들어왔습니다" 시스템 메세지는 메신저봇R에 수신되지 않음
        // 대신 카카오 오픈채팅봇의 '환영/입장' 성격 메세지에만 반응한다.
        // 예약 알림은 `!오늘`처럼 명령으로 시작하면 서버로 그대로 전달된다.
        if (isOpenChatBotWelcomeMessage(sender, msg)) {
            new java.lang.Thread(function() {
                // 5초 후 일반 환영 + 자기소개 유도
                java.lang.Thread.sleep(5000);
                replier.reply("새로 오신 분 환영합니다 😊\n"
                    + "간단한 자기소개 부탁드려도 될까요?\n\n"
                    + "여러분, 환영해 주세요! 🎉");
            }).start();
            return;
        }

        // '!'로 시작하는 메시지만 처리
        if (!msg.startsWith("!")) {
            return;
        }

        // '!' 이후의 텍스트 추출
        // 오픈채팅봇 예약 메세지는 `!오늘` 뒤에 안내 문구가 붙어도 첫 명령만 전달한다.
        var cleanMsg = extractCommandMessage(msg, sender);

        if (!cleanMsg) {
            return;
        }

        // 서버로 전송할 데이터 구성
        var postData = {
            room: room,
            msg: cleanMsg,
            sender: sender,
            isGroupChat: isGroupChat
        };

        // HTTP POST 요청 전송 (Jsoup 사용, 타임아웃 15초)
        var document = org.jsoup.Jsoup.connect(SERVER_URL)
            .header("Content-Type", "application/json")
            .header("x-api-key", API_KEY)
            .requestBody(JSON.stringify(postData))
            .ignoreContentType(true)
            .timeout(15000)
            .post();

        // 서버 응답 (JSON 형식: {"reply": "..."})
        var responseJson = JSON.parse(document.body().text());

        if (responseJson && responseJson.reply) {
            replier.reply(responseJson.reply);
        }

    } catch (e) {
        Log.e("서버 통신 에러: " + e.message);
        // 타임아웃 등 에러 시 사용자에게 알림
        if (e.message && e.message.indexOf("timed out") > -1) {
            replier.reply("⏳ 서버 응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요!");
        }
    }
}
