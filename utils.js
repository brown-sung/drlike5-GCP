// 파일: utils.js
const createResponseFormat = (mainText, questions = []) => {
  const safeQuestions = Array.isArray(questions) ? questions.slice(0, 10) : [];
  const response = {
    version: "2.0",
    template: {
      outputs: [
        { simpleText: { text: mainText } }
      ],
    },
  };

  if (safeQuestions.length > 0) {
    response.template.quickReplies = safeQuestions.map(q => ({
      label: q,
      action: 'message',
      messageText: q
    }));
  }
  
  return response;
};

const createCallbackWaitResponse = (text) => ({
    version: "2.0",
    useCallback: true,
    data: {
        text: text
    }
});

module.exports = {
    createResponseFormat,
    createCallbackWaitResponse,
};