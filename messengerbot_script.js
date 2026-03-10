/**
 * 안드로이드 메신저봇R 앱 전용 스크립트입니다.
 * 
 * [주의] 
 * 1. 이 코드를 복사하여 메신저봇R 앱의 새 스크립트에 붙여넣으세요.
 * 2. 원활한 동작을 위해 Rhino 자바스크립트 엔진 버전을 사용하세요.
 * 3. 아래 'SERVER_URL' 부분을 ngrok 등 외부 접속이 가능한 노드 서버 주소로 변경하세요.
 * 
 * [v2 업데이트] 해빛스쿨 앱 연동 명령어 추가
 * !오늘, !내습관, !주간, !우리반, !등록, !도움말
 */

const SERVER_URL = "https://habitchatbot.onrender.com/api/messengerbot";

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
    try {
        Log.i("수신 -> 방: " + room + " / 보낸분: " + sender + " / 메시지: " + msg);

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
