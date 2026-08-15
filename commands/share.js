/**
 * `!공유` — hand the member into the app's own share card.
 *
 * This used to render a PNG on the chatbot server and post the image URL into
 * the room. The app's gallery card outgrew it: the member picks a template and
 * a hero photo there, and the app hands the finished image straight to the
 * platform share sheet, so it can go to any room they like rather than only the
 * one they typed the command in.
 *
 * Keeping a second renderer alive meant a card that could not be restyled, a
 * five-minute image token that broke if they came back to it, and a picture that
 * failed whenever the free instance was cold.
 */

const { getMapping, getDisplayName } = require('../modules/userMapping');
const { buildUnlinkedMessage } = require('../modules/chatLink');
const { getHabitsSchoolShareCardUrl } = require('../utils/appLinks');

async function handleShare(user) {
    const displayName = getDisplayName(user);
    const mapping = await getMapping(user);

    if (!mapping) {
        return {
            type: 'text',
            text: buildUnlinkedMessage(user)
        };
    }

    return {
        type: 'text',
        text: `${displayName}님, 오늘 기록으로 공유 카드를 만들어 보세요.

${getHabitsSchoolShareCardUrl()}

링크를 열면 갤러리에서 카드가 바로 준비돼요.
정돈형 · 겹침형 · 포커스형 중에 고르고, 공유하기를 누르면
원하는 단톡방이나 인스타로 바로 보낼 수 있어요.`
    };
}

module.exports = {
    handleShare
};
