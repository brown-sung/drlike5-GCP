// 파일: index.js
const express = require('express');
const { getFirestoreData, setFirestoreData, analyzeConversation } = require('./services');
const stateHandlers = require('./handlers');
const { createResponseFormat, createResultCardResponse } = require('./utils'); // ★ createResultCardResponse 임포트
const { judgeAsthma, formatResult } = require('./analysis');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(express.json());

// ... (app.get('/') 및 app.post('/skill')은 이전과 동일) ...

// === 엔드포인트 2: Cloud Tasks 비동기 작업 처리 (최종 분석 및 콜백 전송) ===
app.post('/process-analysis-callback', async (req, res) => {
  const { userKey, history, callbackUrl } = req.body;
  if (!userKey || !history || !callbackUrl) {
    console.error('Invalid callback request:', req.body);
    return res.status(400).send('Bad Request: Missing required fields.');
  }

  let finalResponse;
  try {
    console.log(`[Callback Processing] user: ${userKey}`);
    const updated_extracted_data = await analyzeConversation(history);
    const judgement = judgeAsthma(updated_extracted_data);

    const { mainText, quickReplies } = formatResult(judgement);

    // ★★★ simpleText 대신 basicCard 형식으로 최종 응답 생성 ★★★
    finalResponse = createResultCardResponse(mainText, quickReplies, judgement.possibility);

    await setFirestoreData(userKey, {
      state: 'POST_ANALYSIS',
      extracted_data: updated_extracted_data,
      history,
    });
  } catch (error) {
    console.error(`[Callback Error] user: ${userKey}`, error);
    const errorText =
      '죄송합니다, 답변을 분석하는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요. 😥';
    // 오류 응답은 기존의 simpleText 방식을 유지
    finalResponse = createResponseFormat(errorText, ['다시 검사하기', '처음으로']);
  }

  await fetch(callbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(finalResponse),
  }).catch((err) => console.error('Failed to send callback to Kakao:', err));

  return res.status(200).send('Callback job processed.');
});

// ... (서버 실행 로직은 이전과 동일) ...
