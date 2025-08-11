// 파일: services.js
const { Firestore } = require('@google-cloud/firestore');
const { BigQuery } = require('@google-cloud/bigquery');
const { SYSTEM_PROMPT_GENERATE_QUESTION, SYSTEM_PROMPT_ANALYZE_COMPREHENSIVE } = require('./prompts');

// 클라이언트 초기화
const firestore = new Firestore();
const bigquery = new BigQuery();
const { GoogleAuth } = require('google-auth-library');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// --- Firestore 서비스 ---
const getFirestoreData = async (userKey) => (await firestore.collection('conversations').doc(userKey).get()).data();
const setFirestoreData = async (userKey, data) => await firestore.collection('conversations').doc(userKey).set(data, { merge: true }); // merge 옵션으로 부분 업데이트 지원
const deleteFirestoreData = async (userKey) => await firestore.collection('conversations').doc(userKey).delete();

// --- Gemini API 서비스 ---
async function callGemini(systemPrompt, context, model = 'gemini-1.5-flash', isJson = false) {
    const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
    const client = await auth.getClient();
    const accessToken = (await client.getAccessToken()).token;

    const url = `https://asia-northeast3-aiplatform.googleapis.com/v1/projects/${process.env.GCP_PROJECT}/locations/asia-northeast3/publishers/google/models/${model}:streamGenerateContent`;

    const contents = [{ role: 'user', parts: [{ text: systemPrompt }] }];
    if (context) {
        contents.push({ role: 'user', parts: [{ text: context }] });
    }

    const body = { contents };
    if (isJson) {
        body.generationConfig = { responseMimeType: "application/json" };
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // 25초 타임아웃

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) throw new Error(`Gemini API Error: ${response.status} ${await response.text()}`);
        
        const data = await response.json();
        const text = data[0]?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Invalid response from Gemini API.");
        return text;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Gemini API call timed out.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

// 다음 질문 생성 (JSON 데이터도 함께 전달)
const generateNextQuestion = async (history, extracted_data) => {
    const context = `---대화 기록 시작---\n${history.join('\n')}\n---대화 기록 끝---\n\n[현재까지 분석된 환자 정보]\n${JSON.stringify(extracted_data, null, 2)}`;
    return await callGemini(SYSTEM_PROMPT_GENERATE_QUESTION, context, 'gemini-1.5-flash');
};

// 종합 분석 함수 (한 번에 모든 정보 추출)
const analyzeConversation = async (history) => {
    const result = await callGemini(SYSTEM_PROMPT_ANALYZE_COMPREHENSIVE, history.join('\n'), 'gemini-1.5-pro', true);
    return JSON.parse(result);
};

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
};