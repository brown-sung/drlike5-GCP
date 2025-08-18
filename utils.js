// 파일: utils.js

// ★ 썸네일 이미지 URL을 상수로 정의
const IMAGE_URL_HIGH_RISK =
  'https://private-user-images.githubusercontent.com/216835621/478826922-ab2c2a39-2d88-4963-9d68-8296eeffbfbc.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NTU0ODE5OTksIm5iZiI6MTc1NTQ4MTY5OSwicGF0aCI6Ii8yMTY4MzU2MjEvNDc4ODI2OTIyLWFiMmMyYTM5LTJkODgtNDk2My05ZDY4LTgyOTZlZWZmYmZiYy5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjUwODE4JTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI1MDgxOFQwMTQ4MTlaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT1hZmY3M2JiYjZmMzU4Y2E0MzkxYzRjYzdmNzEzM2ZlMDNlMjk0N2Y1NGQ0N2EzMGQ0YTIwOTJkZmJmMWZjMzY2JlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.gJJs0Va9L6LasflVzGs5s8K5Mf2nj47avsK_mrwQuiY';
const IMAGE_URL_LOW_RISK =
  'https://private-user-images.githubusercontent.com/216835621/478827162-86644dc2-767d-4beb-883e-8334389427bb.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NTU0ODIwMjUsIm5iZiI6MTc1NTQ4MTcyNSwicGF0aCI6Ii8yMTY4MzU2MjEvNDc4ODI3MTYyLTg2NjQ0ZGMyLTc2N2QtNGJlYi04ODNlLTgzMzQzODk0MjdiYi5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjUwODE4JTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI1MDgxOFQwMTQ4NDVaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT0xZDgxMGZkNTY2NzRhZTcwOTJhNTJlZTBhYWMwNGE0MzY3YzMzNjA2YjJkOWFjMDg2NGY3ZGE1NjFiZjAwMDZjJlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.A1PXphZ-bS7BVHPPqLGuPraODvr_NcQroIHcwU1IgXc';

// 일반 대화용 simpleText 응답 (변경 없음)
const createResponseFormat = (mainText, questions = []) => {
  const safeQuestions = Array.isArray(questions) ? questions.slice(0, 10) : [];
  const response = {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text: mainText } }],
    },
  };

  if (safeQuestions.length > 0) {
    response.template.quickReplies = safeQuestions.map((q) => ({
      label: q,
      action: 'message',
      messageText: q,
    }));
  }

  return response;
};

// 콜백 대기용 응답 (변경 없음)
const createCallbackWaitResponse = (text) => ({
  version: '2.0',
  useCallback: true,
  data: {
    text: text,
  },
});

// ★★★ 최종 분석 결과용 basicCard 응답 (신규) ★★★
const createResultCardResponse = (description, buttons, possibility) => {
  // 천식 가능성에 따라 적절한 썸네일 URL 선택
  const imageUrl = possibility === '있음' ? IMAGE_URL_HIGH_RISK : IMAGE_URL_LOW_RISK;
  const safeButtons = Array.isArray(buttons) ? buttons : [];

  return {
    version: '2.0',
    template: {
      outputs: [
        {
          basicCard: {
            // title은 요청대로 생략
            description: description, // simpleText의 내용을 description으로 사용
            thumbnail: {
              imageUrl: imageUrl,
            },
            buttons: safeButtons.map((btnLabel) => ({
              action: 'message',
              label: btnLabel,
              messageText: btnLabel,
            })),
          },
        },
      ],
    },
  };
};

module.exports = {
  createResponseFormat,
  createCallbackWaitResponse,
  createResultCardResponse, // ★ 새로 추가된 함수 export
};
