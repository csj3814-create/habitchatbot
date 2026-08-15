/**
 * MessengerBot webhook: POST /api/messengerbot
 */

const { Router } = require('express');

const { apiKeyAuth } = require('../utils/apiKeyAuth');
const { buildStudentAddressPrompt } = require('../utils/addressing');
const { createChatIdentity } = require('../utils/chatIdentity');
const { handleToday } = require('../commands/today');
const { handleMyHabits } = require('../commands/myHabits');
const { handleWeekly } = require('../commands/weekly');
const { handleClassStatus } = require('../commands/classStatus');
const { handleRanking } = require('../commands/ranking');
const { handleBestRecords, resolveBestRecordsPeriod } = require('../commands/bestRecords');
const { handleGuide, handleApp } = require('../commands/guide');
const { handleDiet, handleExercise, handleMind } = require('../commands/categoryHabits');
const { handleAddFriend, handleMyCode } = require('../commands/addFriend');
const { handleGroupLink, buildGroupLinkGuideMessage } = require('../commands/groupLink');
const { handleShare } = require('../commands/share');
const { handleHaebit, handleHaebitVideo } = require('../commands/haebit');
const { handleHaebitIntroVideo, handleMeditationVideo } = require('../commands/staticVideos');
const { handleYoutubeRecommendation } = require('../commands/youtubeRecommendation');
const { getUserRecords } = require('../modules/appFirebase');
const { getMapping, getDisplayName } = require('../modules/userMapping');
const { hasDiet, hasExercise, hasMind } = require('../modules/statsHelpers');

function normalizeCommand(rawMessage) {
    const trimmed = String(rawMessage || '').trim();
    const body = trimmed.startsWith('!') ? trimmed.slice(1).trim() : trimmed;
    const command = body.toLowerCase();
    const args = body.includes(' ') ? body.slice(body.indexOf(' ') + 1).trim() : '';

    return { trimmed, command, args };
}

function isYoutubeRecommendationCommand(command) {
    return command === '영상추천' || command === '추천영상' || command === '유튜브추천';
}

// `!연결` is the name members are told to use; `!등록` stays as an alias so
// anyone following older guidance still works.
const LINK_COMMAND_NAMES = ['연결', '등록'];

function isLinkCommand(command) {
    return LINK_COMMAND_NAMES.some(
        (name) => command === name || command.startsWith(`${name} `)
    );
}

/**
 * Keep submitted link codes out of the logs.
 */
function redactForLog(message) {
    const { command } = normalizeCommand(message);

    if (!isLinkCommand(command)) {
        return message;
    }

    return `!${command.split(' ')[0]} <redacted>`;
}

/**
 * NOTE ON ROOM SCOPING — read before adding anything room-sensitive here.
 *
 * This endpoint cannot tell which chat room a message came from. MessengerBot R
 * v0.7.29a reports `room` as the Android notification title, which for the
 * production open chat is the *speaker's* nickname, so every participant
 * produces a different `room` value. `isGroupChat` is false even for open-chat
 * traffic, and the legacy `response()` API this version exposes has no stable
 * channel id (no `BotManager`/`Event` API, so no `channelId`).
 *
 * Room separation is therefore an operating agreement, not something the code
 * enforces: the 해빛스쿨 open chat uses `!`, and the other room the bot account
 * sits in (해피닥터) agreed to use `~`. Any `!` command from any room reaches
 * this handler.
 *
 * Do not add a `room`-based check here expecting it to hold.
 */
function createMessengerbotRouter({ getChatSession }) {
    const router = Router();

    router.post('/', apiKeyAuth, async (req, res) => {
        const { room, msg, sender } = req.body;

        if (!msg) {
            return res.status(400).json({ error: '메시지가 없습니다.' });
        }

        const user = createChatIdentity({
            platform: 'messengerbot',
            userId: sender,
            displayName: sender,
            legacySender: sender,
            room
        });

        console.log(`[MessengerBot] Room: ${room}, Sender: ${sender}, Message: ${redactForLog(msg)}`);

        try {
            const { command, args, trimmed } = normalizeCommand(msg);

            if (command === '오늘') {
                return res.json({ reply: await handleToday(getDisplayName(user)) });
            }

            if (command === '내습관' || command === '기록') {
                return res.json({ reply: await handleMyHabits(user) });
            }

            if (command === '주간' || command === '주간리포트') {
                return res.json({ reply: await handleWeekly(user) });
            }

            if (command === '클래스' || command === '현황') {
                return res.json({ reply: await handleClassStatus(getDisplayName(user)) });
            }

            if (isLinkCommand(command)) {
                const linkArg = command.includes(' ') ? args : '';

                // A magic-link card would let anyone in the room click through and
                // attach their own app account to this speaker's nickname. Codes
                // only, and only ones the speaker already holds.
                if (!linkArg) {
                    return res.json({ reply: buildGroupLinkGuideMessage() });
                }

                return res.json({ reply: await handleGroupLink(user, linkArg) });
            }

            if (command === '내코드') {
                return res.json({ reply: await handleMyCode(user) });
            }

            if (command === '친구' || command.startsWith('친구 ')) {
                const codeArg = command === '친구' ? '' : args;
                return res.json({ reply: await handleAddFriend(user, codeArg) });
            }

            if (command === '공유' || command === '인증공유') {
                const result = await handleShare(user);
                return res.json({ reply: result.text });
            }

            if (command === '해빛' || command === '햇빛') {
                return res.json({ reply: handleHaebitIntroVideo() });
            }

            if (command === '명상') {
                return res.json({ reply: handleMeditationVideo() });
            }

            if (command === '해빛기록' || command === '하루기록') {
                return res.json({ reply: await handleHaebit(user) });
            }

            if (command === '해빛영상' || command === '하루영상') {
                return res.json({ reply: await handleHaebitVideo(user) });
            }

            if (command === '안내' || command === '시작' || command === '가이드') {
                return res.json({ reply: await handleGuide(getDisplayName(user)) });
            }

            if (command === '앱') {
                return res.json({ reply: await handleApp() });
            }

            if (command === '도움말' || command === '명령어') {
                return res.json({ reply: await handleGuide(getDisplayName(user)) });
            }

            if (command === '순위' || command === '주간순위') {
                return res.json({ reply: await handleRanking() });
            }

            const bestRecordsPeriod = resolveBestRecordsPeriod(command);
            if (bestRecordsPeriod) {
                return res.json({ reply: await handleBestRecords(bestRecordsPeriod) });
            }

            if (isYoutubeRecommendationCommand(command)) {
                return res.json({ reply: await handleYoutubeRecommendation() });
            }

            if (command === '식단') {
                return res.json({ reply: await handleDiet(user, getChatSession) });
            }

            if (command === '운동') {
                return res.json({ reply: await handleExercise(user, getChatSession) });
            }

            if (command === '마음') {
                return res.json({ reply: await handleMind(user, getChatSession) });
            }

            // No habit-keyword logging on this path. The privacy policy for the
            // group room says only the command itself is collected, and keyword
            // extraction from free-form text goes beyond that. `!기록수` was the
            // only reader of that store and went away with it.
            const chatSession = getChatSession(`messengerbot:${sender}`);

            let appDataContext = '';

            try {
                const mapping = await getMapping(user);
                if (!mapping) {
                    appDataContext =
                        '\n\n[아직 해빛스쿨 앱 계정 연결이 없습니다. 자연스럽게 !연결 안내를 해 주세요.]';
                } else {
                    const recentRecords = await getUserRecords(mapping.googleUid, 3);
                    if (recentRecords.length > 0) {
                        const latest = recentRecords[recentRecords.length - 1];
                        const parts = [];

                        if (latest.diet) {
                            const meals = ['breakfastUrl', 'lunchUrl', 'dinnerUrl', 'snackUrl']
                                .filter((key) => latest.diet[key])
                                .map(
                                    (key) =>
                                        ({
                                            breakfastUrl: '아침',
                                            lunchUrl: '점심',
                                            dinnerUrl: '저녁',
                                            snackUrl: '간식'
                                        })[key]
                                );

                            if (meals.length > 0) parts.push(`식단: ${meals.join(', ')}`);
                        }

                        if (latest.exercise) {
                            const exercise = [];
                            if (latest.exercise.cardioList?.length) {
                                exercise.push(`유산소 ${latest.exercise.cardioList.length}개`);
                            }
                            if (latest.exercise.strengthList?.length) {
                                exercise.push(`근력 ${latest.exercise.strengthList.length}개`);
                            }
                            if (exercise.length > 0) parts.push(`운동: ${exercise.join(', ')}`);
                        }

                        if (latest.sleepAndMind) {
                            const mind = [];
                            if (latest.sleepAndMind.sleepImageUrl) mind.push('수면');
                            if (latest.sleepAndMind.meditationDone) mind.push('명상');
                            if (
                                latest.sleepAndMind.gratitudeJournal ||
                                latest.sleepAndMind.gratitude
                            ) {
                                mind.push('감사');
                            }
                            if (mind.length > 0) parts.push(`마음: ${mind.join(', ')}`);
                        }

                        if (latest.metrics?.weight) parts.push(`체중: ${latest.metrics.weight}kg`);
                        if (latest.metrics?.glucose) parts.push(`혈당: ${latest.metrics.glucose}`);

                        const dietDays = recentRecords.filter(hasDiet).length;
                        const exerciseDays = recentRecords.filter(hasExercise).length;
                        const mindDays = recentRecords.filter(hasMind).length;

                        if (parts.length > 0) {
                            appDataContext = `\n\n[최근 앱 기록]
마지막 기록일: ${latest.date}
${parts.join('\n')}
최근 3일 기록: 식단 ${dietDays}일 / 운동 ${exerciseDays}일 / 마음 ${mindDays}일`;
                        }
                    }
                }
            } catch (error) {
                console.warn('[MessengerBot] Failed to inject app data context:', error.message);
            }

            const displayName = getDisplayName(user);
            const prompt = `[현재 대화 사용자 이름: ${displayName}]
${buildStudentAddressPrompt(displayName)}${appDataContext}

사용자 메시지: ${trimmed}`;

            const result = await chatSession.sendMessage(prompt);
            return res.json({ reply: result.response.text() });
        } catch (error) {
            console.error('Error handling MessengerBot request:', error);
            return res.status(500).json({ reply: '죄송해요. 일시적인 오류가 발생했어요.' });
        }
    });

    return router;
}

module.exports = { createMessengerbotRouter };
