// 파일: handlers.js
const { setFirestoreData, generateNextQuestion, createAnalysisTask, generateWaitMessage, archiveToBigQuery, deleteFirestoreData } = require('./services');
const { createResponseFormat, createCallbackWaitResponse } = require('./utils');
const { TERMINATION_PHRASES, AFFIRMATIVE_PHRASES, ALL_SYMPTOM_FIELDS } = require('./prompts');
const { judgeAsthma } = require('./analysis');

// 초기 상태 핸들러
async function handleInit(userKey, utterance, history) {
    const initialData = ALL_SYMPTOM_FIELDS.reduce((acc, field) => ({ ...acc, [field]: null }), {});
    history.push(`사용자: ${utterance}`);
    await setFirestoreData(userKey, { state: 'COLLECTING', history, extracted_data: initialData });
    
    // 다음 질문 생성은 5초 이내에 가능하므로 즉시 응답
    const nextQuestion = await generateNextQuestion(history, initialData);
    history.push(`챗봇: ${nextQuestion}`);
    await setFirestoreData(userKey, { state: 'COLLECTING', history });
    
    return createResponseFormat(nextQuestion);
}

// 증상 수집 상태 핸들러
async function handleCollecting(userKey, utterance, history, extracted_data) {
    if (AFFIRMATIVE_PHRASES.some(phrase => utterance.includes('분석'))) {
        // 분석 요청 시, 콜백을 사용해야 하므로 분석 확인 상태로 전환
        await setFirestoreData(userKey, { state: 'CONFIRM_ANALYSIS', history, extracted_data });
        return createResponseFormat("알겠습니다. 그럼 지금까지 말씀해주신 내용을 바탕으로 분석을 진행해볼까요?");
    }

    history.push(`사용자: ${utterance}`);
    const nextQuestion = await generateNextQuestion(history, extracted_data);
    history.push(`챗봇: ${nextQuestion}`);
    
    await setFirestoreData(userKey, { state: 'COLLECTING', history });
    return createResponseFormat(nextQuestion);
}

// 분석 확인 상태 핸들러 (비동기 콜백 트리거)
async function handleConfirmAnalysis(userKey, utterance, history, extracted_data, callbackUrl) {
    if (!callbackUrl) {
        return createResponseFormat("오류: 콜백 URL이 없습니다. 다시 시도해주세요.");
    }

    if (AFFIRMATIVE_PHRASES.some(phrase => utterance.includes(phrase))) {
        // 1. 동적 대기 메시지를 빠르게 생성 (3.8초 타임아웃)
        const waitMessage = await generateWaitMessage(history);
        
        // 2. Cloud Tasks에 비동기 분석 작업 생성
        await createAnalysisTask({ userKey, history, extracted_data, callbackUrl });
        
        // 3. 사용자에게 즉시 콜백 대기 응답 전송
        return createCallbackWaitResponse(waitMessage);
    }
    // 분석 거부 시 다시 수집 상태로 돌아감
    history.push(`사용자: ${utterance}`);
    await setFirestoreData(userKey, { state: 'COLLECTING', history });
    return createResponseFormat("알겠습니다. 더 말씀하고 싶은 증상이 있으신가요?");
}

// 분석 후 상태 핸들러
async function handlePostAnalysis(userKey, utterance, history, extracted_data) {
    if (TERMINATION_PHRASES.some(phrase => utterance.includes(phrase))) {
        return handleTerminated(userKey, history, extracted_data);
    }
    // 추가 대화 시 다시 수집 상태로
    return handleCollecting(userKey, utterance, history, extracted_data);
}

// 대화 종료 상태 핸들러
async function handleTerminated(userKey, history, extracted_data) {
    const judgement = judgeAsthma(extracted_data);
    
    await archiveToBigQuery(userKey, { history, extracted_data, judgement });
    await deleteFirestoreData(userKey);

    return createResponseFormat("네, 알겠습니다. 상담이 종료되었습니다. 이용해주셔서 감사합니다!");
}

const stateHandlers = {
    'INIT': handleInit,
    'COLLECTING': handleCollecting,
    'CONFIRM_ANALYSIS': handleConfirmAnalysis,
    'POST_ANALYSIS': handlePostAnalysis,
};

module.exports = stateHandlers;