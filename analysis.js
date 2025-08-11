// 파일: analysis.js

/**
 * 소아 천식 판정 로직 (제공된 순서도 기반)
 * @param {object} data - Gemini가 추출한 종합 분석 JSON
 * @returns {object} - { possibility: '있음' | '낮음', reason: '판단 근거' }
 */
function judgeAsthma(data) {
    // data가 null이거나 객체가 아니면 기본값 반환
    if (!data || typeof data !== 'object') {
        return { possibility: '정보 부족', reason: '분석할 증상 정보가 충분하지 않습니다.' };
    }

    // 1단계: 감기/천식 감별
    const hasAsthmaSymptoms = data.쌕쌕거림 === 'Y' || data.호흡곤란 === 'Y' || data['가슴 답답'] === 'Y' || data.야간 === 'Y';
    // '3개월' 이라는 키워드를 포함하는지 등으로 빈도 확인 (더 정교한 로직도 가능)
    const isFrequent = data['증상 지속']?.includes('3개월') || data['기관지확장제 사용']?.includes('3개월'); 
    
    if (data['증상 완화 여부'] === 'Y' || data.발열 === 'Y' || data.인후통 === 'Y') {
        return { possibility: '낮음', reason: '증상이 완화되고 있거나, 감기를 시사하는 증상(발열, 인후통)이 동반됩니다.' };
    }

    if (!hasAsthmaSymptoms || !isFrequent) {
        return { possibility: '낮음', reason: '천식을 의심할 만한 특징적인 증상이나 발생 빈도가 확인되지 않았습니다.' };
    }

    // 2단계: 천식예측지수(API) 평가
    const majorCriteriaCount = (data.가족력 === 'Y' ? 1 : 0) + (data['아토피 병력'] === 'Y' ? 1 : 0);
    // '감기와 무관한 쌕쌕거림' 항목은 프롬프트에 추가하여 추출하거나, 별도 질문으로 확인 필요
    const minorCriteriaCount = 
        (data['공중 항원'] === 'Y' ? 1 : 0) +
        (data['식품 항원'] === 'Y' ? 1 : 0);

    if (majorCriteriaCount >= 1 || minorCriteriaCount >= 2) {
        return { possibility: '있음', reason: '천식 예측지수(API) 평가 결과, 주요 인자 또는 부가 인자 조건을 충족합니다.' };
    }

    return { possibility: '낮음', reason: '천식 의심 증상은 있으나, 천식 예측지수(API)의 위험인자 조건을 충족하지 않습니다.' };
}

/**
 * 분석 결과를 사용자에게 보여줄 텍스트로 가공
 */
function formatReport(judgement, extractedData) {
    const { possibility, reason } = judgement;
    
    let report = `[AI 중간 분석 결과]\n천식 가능성이 **'${possibility}'**으로 생각됩니다.\n\n[판단 근거]\n${reason}\n\n[현재까지 파악된 증상 요약]\n`;
    const summary = Object.entries(extractedData || {})
        .filter(([, value]) => value !== null) // 언급된 내용만 요약
        .map(([key, value]) => `• ${key}: ${value}`)
        .join('\n');

    return `${report}${summary || '아직 파악된 정보가 없습니다.'}`;
}

module.exports = { judgeAsthma, formatReport };