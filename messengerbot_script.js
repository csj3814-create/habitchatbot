/**
 * 안드로이드 메신저봇R 앱 전용 스크립트입니다.
 * 
 * [주의] 
 * 1. 이 코드를 복사하여 메신저봇R 앱의 새 스크립트에 붙여넣으세요.
 * 2. 원활한 동작을 위해 Rhino 자바스크립트 엔진 버전을 사용하세요.
 * 3. 아래 'SERVER_URL' 부분을 ngrok 등 외부 접속이 가능한 노드 서버 주소로 변경하세요.
 */

const SERVER_URL = "https://habitchatbot.onrender.com/api/messengerbot";

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
    try {
        // [디버그용] 함수가 호출되는지 무조건 로그 찍어보기
        Log.i("수신 테스트 -> 방: " + room + " / 보낸분: " + sender + " / 메시지: " + msg);

        // '!'로 시작하는 메시지만 처리 
        if (!msg.startsWith("!")) {
            return;
        }

        // 서버로 전송할 데이터 구성
        const postData = {
            room: room,
            msg: msg.substring(1).trim(), // '!' 이후의 텍스트만 추출
            sender: sender,
            isGroupChat: isGroupChat
        };

        // HTTP POST 요청 전송 (Jsoup 사용)
        const document = org.jsoup.Jsoup.connect(SERVER_URL)
            .header("Content-Type", "application/json")
            .requestBody(JSON.stringify(postData))
            .ignoreContentType(true)
            .post();

        // 서버 응답 (JSON 형식: {"reply": "..."})
        const responseJson = JSON.parse(document.body().text());

        if (responseJson && responseJson.reply) {
            replier.reply(responseJson.reply);
        }

    } catch (e) {
        // 에러 발생 시 로그 출력 (디버깅용)
        Log.e("서버 통신 에러: " + e.message);
        // 에러 상황을 채팅방에 알리고 싶다면 아래 주석을 해제하세요.
        // replier.reply("서버와 통신하는 중 문제가 발생했어요. 🥲");
    }
}
