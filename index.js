// 파일: index.js
const express = require('express');
const { getFirestoreData, setFirestoreData, analyzeConversation } = require('./services');
const stateHandlers = require('./handlers');
const { createResponseFormat } = require('./utils');
const { judgeAsthma, formatReport } = require('./analysis');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(express.json());

// 헬스 체크용 엔드포인트
app.get('/', (req, res) => {
    res.status(200).send("Asthma Consultation Bot is running!");
});

// === 엔드포인트 1: 카카오 스킬 요청 접수 (실시간 대화 및 콜백 트리거) ===
app.post('/skill', async (req, res) => {
    try {
        const userKey = req.body.userRequest?.user?.id;
        const utterance = req.body.userRequest?.utterance;
        const callbackUrl = req.body.userRequest?.callbackUrl;

        if (!userKey || !utterance) {
            return res.status(400).json(createResponseFormat("잘못된 요청입니다."));
        }
        console.log(`[Request] user: ${userKey}, utterance: "${utterance}"`);

        let userData = await getFirestoreData(userKey);
        if (!userData) {
            userData = { state: 'INIT', history: [] };
        }
        
        console.log(`[State] current: ${userData.state}`);
        
        const handler = stateHandlers[userData.state] || stateHandlers['INIT'];
        // 핸들러에 callbackUrl을 전달
        const response = await handler(userKey, utterance, userData.history, userData.extracted_data, callbackUrl);
        
        return res.status(200).json(response);

    } catch (error) {
        console.error("'/skill' 처리 중 오류 발생:", error);
        return res.status(500).json(createResponseFormat("시스템에 오류가 발생했어요. 잠시 후 다시 시도해주세요."));
    }
});

// === 엔드포인트 2: Cloud Tasks 비동기 작업 처리 (최종 분석 및 콜백 전송) ===
app.post('/process-analysis-callback', async (req, res) => {
    const { userKey, history, callbackUrl } = req.body;
    if (!userKey || !history || !callbackUrl) {
        console.error("Invalid callback request:", req.body);
        return res.status(400).send("Bad Request: Missing required fields.");
    }
    
    let finalResponse;
    try {
        console.log(`[Callback Processing] user: ${userKey}`);
        // 1. 최종 분석 수행 (시간 제한 없음)
        const updated_extracted_data = await analyzeConversation(history);
        const judgement = judgeAsthma(updated_extracted_data);
        const reportText = formatReport(judgement, updated_extracted_data);
        const responseText = `${reportText}\n\n이 분석 외에 더 추가하거나 수정하고 싶은 내용이 있으신가요?\n(대화를 마치려면 '종료'라고 말씀해주세요.)`;
        
        finalResponse = createResponseFormat(responseText, ["네, 추가할 내용이 있어요", "아니요, 종료할게요"]);

        // 2. 분석 완료 후 상태를 POST_ANALYSIS로 업데이트
        await setFirestoreData(userKey, { state: 'POST_ANALYSIS', extracted_data: updated_extracted_data, history });

    } catch (error) {
        console.error(`[Callback Error] user: ${userKey}`, error);
        const errorText = "죄송합니다, 답변을 분석하는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요. 😥";
        finalResponse = createResponseFormat(errorText, []);
    }

    // 3. 카카오톡에 최종 결과 콜백 전송
    await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalResponse),
    }).catch(err => console.error("Failed to send callback to Kakao:", err));
    
    // 4. Cloud Tasks에 성공 응답 전송
    return res.status(200).send("Callback job processed.");
});

// Cloud Run 환경에서 제공하는 PORT 사용
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Asthma Bot server listening on port ${PORT}`);
});