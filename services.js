// 파일: services.js
const { Firestore } = require('@google-cloud/firestore');
const { BigQuery } = require('@google-cloud/bigquery');
const { VertexAI } = require('@google-cloud/vertexai');
const { CloudTasksClient } = require('@google-cloud/tasks');
const { 
    SYSTEM_PROMPT_GENERATE_QUESTION, 
    SYSTEM_PROMPT_ANALYZE_COMPREHENSIVE,
    SYSTEM_PROMPT_WAIT_MESSAGE
} = require('./prompts');

// --- 클라이언트 초기화 ---
const firestore = new Firestore();
const bigquery = new BigQuery();
const tasksClient = new CloudTasksClient();
const vertex_ai = new VertexAI({
    project: process.env.GCP_PROJECT,
    location: 'asia-northeast3',
});

// --- Firestore 서비스 ---
const getFirestoreData = async (userKey) => (await firestore.collection('conversations').doc(userKey).get()).data();
const setFirestoreData = async (userKey, data) => await firestore.collection('conversations').doc(userKey).set(data, { merge: true });
const deleteFirestoreData = async (userKey) => await firestore.collection('conversations').doc(userKey).delete();

// --- Gemini API 서비스 ---
async function callGeminiWithSDK(systemPrompt, context, modelName = 'gemini-1.5-flash-lite', isJson = false, timeout = 25000) {
    const model = vertex_ai.getGenerativeModel({
        model: modelName,
        systemInstruction: { parts: [{ text: systemPrompt }] },
    });

    const request = {
        contents: [{ role: 'user', parts: [{ text: context }] }],
        generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.7,
        },
    };
    
    if (isJson) {
        request.generationConfig.responseMimeType = "application/json";
    }

    try {
        const result = await model.generateContent(request, { timeout });
        const response = result.response;
        const text = response.candidates[0].content.parts[0].text;
        if (!text) throw new Error("Invalid response structure from Gemini SDK.");
        return text;
    } catch (error) {
        console.error(`Gemini SDK Error (model: ${modelName}):`, JSON.stringify(error, null, 2));
        throw error;
    }
}

// 대기 메시지 생성 (짧은 타임아웃)
async function generateWaitMessage(history) {
    const context = `---대화 기록---\n${history.join('\n')}`;
    try {
        const resultText = await callGeminiWithSDK(SYSTEM_PROMPT_WAIT_MESSAGE, context, 'gemini-1.5-flash-lite', true, 3800);
        return JSON.parse(resultText).wait_text;
    } catch (error) {
        console.warn("Wait message generation failed. Using default.", error.message);
        return "네, 말씀해주신 내용을 분석하고 있어요. 잠시만 기다려주세요! 🤖";
    }
}

// 다음 질문 생성
const generateNextQuestion = async (history, extracted_data) => {
    const context = `---대화 기록 시작---\n${history.join('\n')}\n---대화 기록 끝---\n\n[현재까지 분석된 환자 정보]\n${JSON.stringify(extracted_data, null, 2)}`;
    return await callGeminiWithSDK(SYSTEM_PROMPT_GENERATE_QUESTION, context, 'gemini-1.5-flash-lite');
};

// 종합 분석 함수 (긴 타임아웃)
const analyzeConversation = async (history) => {
    const context = `다음은 분석할 대화록입니다:\n\n${history.join('\n')}`;
    const resultText = await callGeminiWithSDK(SYSTEM_PROMPT_ANALYZE_COMPREHENSIVE, context, 'gemini-1.5-flash-lite', true);
    return JSON.parse(resultText);
};

// --- Cloud Tasks 서비스 ---
async function createAnalysisTask(payload) {
    const { GCP_PROJECT, GCP_LOCATION, TASK_QUEUE_NAME, CLOUD_RUN_URL } = process.env;
    const queuePath = tasksClient.queuePath(GCP_PROJECT, GCP_LOCATION, TASK_QUEUE_NAME);
    const url = `${CLOUD_RUN_URL}/process-analysis-callback`;
    
    const task = {
        httpRequest: {
            httpMethod: 'POST',
            url,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        },
    };
    
    await tasksClient.createTask({ parent: queuePath, task });
    console.log(`[Task Created] for user: ${payload.userKey}`);
}

// BigQuery 아카이빙 서비스
async function archiveToBigQuery(userKey, finalData) {
    const { BIGQUERY_DATASET_ID, BIGQUERY_TABLE_ID } = process.env;
    const table = bigquery.dataset(BIGQUERY_DATASET_ID).table(BIGQUERY_TABLE_ID);

    const row = {
        conversation_id: `${userKey}-${new Date().getTime()}`,
        user_key: userKey,
        created_at: new Date(),
        final_judgement: finalData.judgement.possibility,
        judgement_reason: finalData.judgement.reason,
        extracted_entities: JSON.stringify(finalData.extracted_data),
        raw_conversation: finalData.history.join('\n'),
    };
    
    await table.insert([row]);
    console.log(`[BigQuery] Archived data for user: ${userKey}`);
}

module.exports = {
    getFirestoreData,
    setFirestoreData,
    deleteFirestoreData,
    generateNextQuestion,
    analyzeConversation,
    archiveToBigQuery,
    generateWaitMessage,
    createAnalysisTask,
};
