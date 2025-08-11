// 파일: handlers.js
const { setFirestoreData, generateNextQuestion, analyzeConversation, archiveToBigQuery, deleteFirestoreData } = require('./services');
const { createResponseFormat } = require('./utils');
const { TERMINATION_PHRASES, AFFIRMATIVE_PHRASES, ALL_SYMPTOM_FIELDS } = require('./prompts');
const { judgeAsthma, formatReport } = require('./analysis');

// 초기 상태 핸들러
async function handleInit(userKey, utterance, history) {
    const initialData = ALL_SYMPTOM_FIELDS.reduce((acc, field) => ({ ...acc, [field]: null }), {});

    history.push(`사용자: ${utterance}`);
    await setFirestoreData(userKey, { state: 'COLLECTING', history, extracted_data: initialData });
    
    const nextQuestion = await generateNextQuestion(history, initialData);
    history.push(`챗봇: ${nextQuestion}`);
    await setFirestoreData(userKey, { state: 'COLLECTING', history });
    
    return createResponseFormat(nextQuestion);
}

// 증상 수집 상태 핸들러
async function handleCollecting(userKey, utterance, history, extracted_data) {
    if (AFFIRMATIVE_PHRASES.some(phrase => utterance.includes('분석'))) {
        return handleConfirmAnalysis(userKey, utterance, history, extracted_data);
    }

    history.push(`사용자: ${utterance}`);
    const nextQuestion = await generateNextQuestion(history, extracted_data);
    history.push(`챗봇: ${nextQuestion}`);
    
    await setFirestoreData(userKey, { state: 'COLLECTING', history });
    return createResponseFormat(nextQuestion);
}

// 분석 확인 상태 핸들러
async function handleConfirmAnalysis(userKey, utterance, history) {
    await setFirestoreData(userKey, { state: 'ANALYZING' }); // 상태를 분석 중으로 변경하여 중복 요청 방지
    try {
        const updated_extracted_data = await analyzeConversation(history);
        const judgement = judgeAsthma(updated_extracted_data);
        const reportText = formatReport(judgement, updated_extracted_data);
        const responseText = `${reportText}\n\n이 분석 외에 더 추가하거나 수정하고 싶은 내용이 있으신가요?\n(대화를 마치려면 '종료'라고 말씀해주세요.)`;
        
        await setFirestoreData(userKey, { state: 'POST_ANALYSIS', extracted_data: updated_extracted_data });
        return createResponseFormat(responseText, ["네, 추가할 내용이 있어요", "아니요, 종료할게요"]);
    } catch (e) {
        console.error("Analysis failed:", e);
        await setFirestoreData(userKey, { state: 'COLLECTING' }); // 실패 시 다시 수집 상태로
        return createResponseFormat("죄송합니다, 분석 중 오류가 발생했어요. 다시 시도해 주시겠어요?");
    }
}

// 분석 후 상태 핸들러
async function handlePostAnalysis(userKey, utterance, history, extracted_data) {
    if (TERMINATION_PHRASES.some(phrase => utterance.includes(phrase))) {
        return handleTerminated(userKey, history, extracted_data);
    }
    history.push(`사용자: ${utterance}`);
    const nextQuestion = await generateNextQuestion(history, extracted_data);
    history.push(`챗봇: ${nextQuestion}`);
    
    await setFirestoreData(userKey, { state: 'COLLECTING', history });
    return createResponseFormat(nextQuestion);
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
    'ANALYZING': (userKey) => createResponseFormat("분석을 진행하고 있으니 잠시만 기다려주세요..."), // 분석 중 중복 입력 방지
    'POST_ANALYSIS': handlePostAnalysis,
};

module.exports = stateHandlers;