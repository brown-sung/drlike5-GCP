// 파일: index.js
const express = require('express');
const { getFirestoreData } = require('./services');
const stateHandlers = require('./handlers');
const { createResponseFormat } = require('./utils');

const app = express();
app.use(express.json());

// 헬스 체크용 엔드포인트
app.get('/', (req, res) => {
    res.status(200).send("Asthma Consultation Bot is running!");
});

// 카카오 스킬 요청을 처리하는 단일 엔드포인트
app.post('/skill', async (req, res) => {
    try {
        const userKey = req.body.userRequest?.user?.id;
        const utterance = req.body.userRequest?.utterance;

        if (!userKey || !utterance) {
            return res.status(400).json(createResponseFormat("잘못된 요청입니다."));
        }
        console.log(`[Request] user: ${userKey}, utterance: "${utterance}"`);

        // Firestore에서 사용자 데이터 가져오기 (없으면 초기 상태)
        let userData = await getFirestoreData(userKey);
        if (!userData) {
            userData = { state: 'INIT', history: [] };
        }
        
        console.log(`[State] current: ${userData.state}`);
        
        // 현재 상태에 맞는 핸들러 호출
        const handler = stateHandlers[userData.state] || stateHandlers['INIT'];
        const response = await handler(userKey, utterance, userData.history, userData.extracted_data);
        
        return res.status(200).json(response);

    } catch (error) {
        console.error("'/skill' 처리 중 오류 발생:", error);
        return res.status(500).json(createResponseFormat("시스템에 오류가 발생했어요. 잠시 후 다시 시도해주세요."));
    }
});

// Cloud Run 환경에서 제공하는 PORT 사용
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Asthma Bot server listening on port ${PORT}`);
});