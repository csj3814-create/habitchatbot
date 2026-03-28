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
            new java.lang.Thread(function() {
                // 10초 후 자기소개 유도
                java.lang.Thread.sleep(10000);
                replier.reply("😊 새로 오신 분, 간단하게 자기소개 부탁드려도 될까요?\n\n"
                    + "예: 이름, 참여 계기, 만들고 싶은 습관 등\n"
                    + "자유롭게 편하게 적어주세요! ✍️");

                // 2초 후 앱 사용방법 안내
                java.lang.Thread.sleep(2000);
                replier.reply("📖 해빛스쿨 앱 사용방법\n"
                    + "━━━━━━━━━━━━━━━\n\n"
                    + "🏫 해빛스쿨이란?\n"
                    + "식단·운동·수면·마음 4가지 습관을 매일 기록하며\n"
                    + "건강한 생활을 만들어가는 프로그램이에요.\n\n"
                    + "📱 시작하기\n"
                    + "1. 해빛스쿨 앱 설치 → 구글 로그인\n"
                    + "2. 여기서 !등록 구글 이메일 입력\n"
                    + "3. 연결 완료! 앱 기록이 코칭에 반영돼요\n\n"
                    + "💬 주요 명령어\n"
                    + "• !오늘 — 오늘 전체 기록 현황\n"
                    + "• !내습관 — 내 앱 기록 보기\n"
                    + "• !주간 — 주간 트렌드 분석\n"
                    + "• !우리반 — 우리 기수 현황\n"
                    + "• !오운완 — 운동 인증 (폭풍 칭찬!)\n"
                    + "• !목표 — 마이크로 해빗 설정\n\n"
                    + "🤖 AI 코칭\n"
                    + "! 뒤에 자유롭게 질문하세요!\n"
                    + "예: !오늘 뭐 먹으면 좋을까?\n\n"
                    + "궁금한 점은 언제든 !안내 로 다시 볼 수 있어요 😊");
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

