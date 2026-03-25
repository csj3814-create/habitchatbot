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
 * [v3 업데이트] 하루 4회 자동 브로드캐스트 추가
 * 아침(08:00) / 점심(12:00) / 저녁(18:30) / 취침전(21:00)
 *
 * [v4 업데이트] 신규 멤버 온보딩
 * 단톡방 입장 시스템 메시지 감지 → 자동 환영 + 10초 후 자기소개 유도
 */

const SERVER_URL = "https://habitchatbot.onrender.com/api/messengerbot";
const BROADCAST_BASE_URL = "https://habitchatbot.onrender.com/api/broadcast";

// ⚠️ 아래 값을 실제 단톡방 이름으로 변경하세요 (정확히 일치해야 함)
const GROUP_ROOM_NAME = "최석재";

// ⚠️ 서버의 MESSENGER_API_KEY 환경변수와 동일한 값으로 변경하세요
const API_KEY = "5e89f10d34289f460dee36dcaf92e9a21ebb159aaa8000b0118a11109b3b843d";

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
    try {
        Log.i("수신 -> 방: " + room + " / 보낸분: " + sender + " / 메시지: " + msg);

        // ✅ 신규 멤버 입장 감지 (오픈채팅봇 환영 메세지 수신 시)
        // 오픈채팅방에서 "OOO님이 들어왔습니다" 시스템 메세지는 메신저봇R에 수신되지 않음
        // 대신 카카오 오픈채팅봇이 보내는 환영 메세지를 트리거로 사용
        if (sender === "오픈채팅봇") {
            // 10초 후 자기소개 유도 메세지 (별도 스레드)
            new java.lang.Thread(function() {
                java.lang.Thread.sleep(10000);
                replier.reply("😊 새로 오신 분, 간단하게 자기소개 부탁드려도 될까요?\n\n"
                    + "예: 이름, 참여 계기, 만들고 싶은 습관 등\n"
                    + "자유롭게 편하게 적어주세요! ✍️");
            }).start();
            return;
        }

        // '!'로 시작하는 메시지만 처리
        if (!msg.startsWith("!")) {
            return;
        }

        // '!' 이후의 텍스트 추출
        var cleanMsg = msg.substring(1).trim();

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

/**
 * schedule() — 메신저봇R이 1분마다 자동 호출하는 함수
 * 하루 4회 브로드캐스트: 아침(08:00) / 점심(12:00) / 저녁(18:30) / 취침전(21:00)
 *
 * [설정 방법]
 * 메신저봇R 앱 → 스크립트 설정 → '스케줄' 활성화 → 1분 간격
 */
function schedule() {
    try {
        // KST 시간 계산 (UTC+9)
        var now = new Date();
        var kstHour = (now.getUTCHours() + 9) % 24;
        var kstMinute = now.getMinutes();

        // 브로드캐스트 타입 결정 (정각±0분에만 전송)
        var broadcastType = null;
        if (kstHour === 8  && kstMinute === 0) broadcastType = "morning";
        if (kstHour === 12 && kstMinute === 0) broadcastType = "lunch";
        if (kstHour === 18 && kstMinute === 30) broadcastType = "dinner";
        if (kstHour === 21 && kstMinute === 0) broadcastType = "night";

        if (!broadcastType) return;

        Log.i("[Schedule] 브로드캐스트 시작: " + broadcastType);

        // 서버에서 메시지 가져오기
        var url = BROADCAST_BASE_URL + "/" + broadcastType;
        var doc = org.jsoup.Jsoup.connect(url)
            .ignoreContentType(true)
            .timeout(10000)
            .get();

        var responseJson = JSON.parse(doc.body().text());
        if (!responseJson || !responseJson.message) {
            Log.e("[Schedule] 빈 응답: " + broadcastType);
            return;
        }

        // 단톡방에 메시지 전송
        // 메신저봇R API: com.xfl.msgbot.application.services.NotificationListener.replyRoom
        com.xfl.msgbot.application.services.NotificationListener
            .replyRoom(GROUP_ROOM_NAME, responseJson.message);

        Log.i("[Schedule] 전송 완료: " + broadcastType);

    } catch (e) {
        Log.e("[Schedule] 오류: " + e.message);
    }
}
