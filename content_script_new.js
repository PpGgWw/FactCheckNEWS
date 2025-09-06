// content_script.js (with JSDoc types for safety)

/**
 * @typedef {Object} ExtractedData
 * @property {string} type
 * @property {string} text
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {string} [진위]
 * @property {string} [근거]
 * @property {string} [분석]
 */

/** @type {ExtractedData[]} */
const extractedData = [];

/**
 * 분석 중 상태를 표시하는 함수
 */
function showAnalysisLoading() {
  const analysisPanel = new window.AnalysisPanel();
  const panel = analysisPanel.create();
  
  panel.innerHTML = `
    <div class="p-4">
      ${analysisPanel.renderHeader()}
      
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 shadow-sm">
        <div class="flex items-center mb-2">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
          <div class="text-blue-700 font-medium text-sm">분석 중...</div>
        </div>
        <div class="text-blue-600 text-xs">Gemini가 뉴스를 분석하고 있습니다.</div>
      </div>
    </div>
  `;
  
  // 닫기 버튼 이벤트 추가
  analysisPanel.attachCloseEvent(panel);
}

/**
 * 분석 결과를 패널에 표시하는 함수
 * @param {AnalysisResult} result
 */
function displayAnalysisResult(result) {
  const analysisPanel = new window.AnalysisPanel();
  const panel = analysisPanel.create();
  
  // 결과 안전하게 분리
  const verdict = typeof result.진위 === 'string' ? result.진위 : '';
  const evidence = typeof result.근거 === 'string' ? result.근거 : '';
  const analysis = typeof result.분석 === 'string' ? result.분석 : '';

  // 모두 비어있으면 에러 메시지
  if (!verdict && !evidence && !analysis) {
    panel.innerHTML = `
      <div class="p-4">
        ${analysisPanel.renderHeader()}
        <div class="bg-red-50 border border-red-200 rounded-lg p-3 shadow-sm">
          <div class="text-red-700 font-medium text-sm">분석 결과가 없습니다</div>
        </div>
      </div>
    `;
    analysisPanel.attachCloseEvent(panel);
    return;
  }

  // 블록 컴포넌트들 생성
  const verdictBlock = new window.VerdictBlock(verdict);
  const evidenceBlock = new window.EvidenceBlock(evidence);
  const analysisDetailBlock = new window.AnalysisDetailBlock(analysis);

  // 패널 렌더링
  panel.innerHTML = `
    <div class="p-4">
      ${analysisPanel.renderHeader()}
      
      <!-- 결과 블럭들 -->
      <div class="space-y-3">
        ${verdictBlock.render()}
        ${evidenceBlock.render()}
        ${analysisDetailBlock.render()}
      </div>
    </div>
  `;

  // 닫기 버튼 이벤트 추가
  analysisPanel.attachCloseEvent(panel);
}

/**
 * 오류 표시 함수
 * @param {string} error
 */
function displayError(error) {
  const analysisPanel = new window.AnalysisPanel();
  const panel = analysisPanel.create();
  
  panel.innerHTML = `
    <div class="p-4">
      ${analysisPanel.renderHeader()}
      <div class="bg-red-50 border border-red-200 rounded-lg p-3 shadow-sm">
        <div class="text-red-700 font-medium text-sm">분석 실패</div>
        <div class="text-red-600 text-xs mt-1">${error}</div>
      </div>
    </div>
  `;
  
  analysisPanel.attachCloseEvent(panel);
}

/**
 * Gemini로 분석 요청을 보내는 함수
 */
function sendToGeminiForAnalysis() {
  if (extractedData.length === 0) {
    displayError('추출된 데이터가 없습니다.');
    return;
  }

  const newsData = {
    title: extractedData.find(item => item.type === '제목')?.text || '',
    content: extractedData.filter(item => item.type === '내용').map(item => item.text).join('\n')
  };

  chrome.runtime.sendMessage({
    action: "analyzeNews",
    data: newsData
  });
}

// --- 기존 하이라이트 로직을 데이터 수집 로직과 통합 ---

// 제목 처리
const titleSelector = 'h2.media_end_head_headline';
const titleElement = document.querySelector(titleSelector);

if (titleElement) {
  // 하이라이트
  titleElement.style.backgroundColor = '#d2f5d2'; // 연한 초록색
  titleElement.style.padding = '5px';
  titleElement.style.borderRadius = '5px';

  // 데이터 수집
  const titleText = titleElement.textContent?.trim();
  if (titleText) {
    extractedData.push({ type: '제목', text: titleText });
  }
  console.log('네이버 뉴스 제목을 성공적으로 하이라이트하고 데이터를 수집했습니다.');
} else {
  console.log('하이라이트할 네이버 뉴스 제목을 찾지 못했습니다.');
}

// 내용 처리
const contentSelectors = [
  '#dic_area',
  '.go_trans._article_content',
  '#articeBody'
];

let contentFound = false;

for (const selector of contentSelectors) {
  const contentElements = document.querySelectorAll(selector);
  
  if (contentElements.length > 0) {
    contentElements.forEach((element, index) => {
      // 하이라이트
      element.style.backgroundColor = '#ffffcc'; // 연한 노란색
      element.style.padding = '10px';
      element.style.borderRadius = '5px';
      element.style.border = '2px solid #ffeb3b';

      // 데이터 수집
      const contentText = element.textContent?.trim();
      if (contentText) {
        extractedData.push({ type: '내용', text: contentText });
      }
    });
    
    console.log(`${selector}로 ${contentElements.length}개의 내용 요소를 하이라이트하고 데이터를 수집했습니다.`);
    contentFound = true;
    break;
  }
}

if (!contentFound) {
  console.log('하이라이트할 네이버 뉴스 내용을 찾지 못했습니다.');
}

// 부제목 처리
const subtitleSelector = '.media_end_head_info_datestamp_bunch .media_end_head_info_datestamp_time';
const subtitleElement = document.querySelector(subtitleSelector);

if (subtitleElement) {
  // 하이라이트
  subtitleElement.style.backgroundColor = '#e1f5fe';
  subtitleElement.style.padding = '3px';
  subtitleElement.style.borderRadius = '3px';

  // 데이터 수집
  const subtitleText = subtitleElement.textContent?.trim();
  if (subtitleText) {
    extractedData.push({ type: '시간', text: subtitleText });
  }
  console.log('네이버 뉴스 시간 정보를 성공적으로 하이라이트하고 데이터를 수집했습니다.');
} else {
  console.log('하이라이트할 네이버 뉴스 시간 정보를 찾지 못했습니다.');
}

// 페이지 로딩이 완료된 후 약간의 지연을 주어 모든 요소가 렌더링되도록 함
setTimeout(() => {
  // 분석 중 상태 표시
  showAnalysisLoading();
  sendToGeminiForAnalysis();
}, 1000);

// service_worker로부터 메시지를 수신하는 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "displayAnalysisResult" && message.result) {
    displayAnalysisResult(message.result);
  } else if (message.action === "displayError" && message.error) {
    displayError(message.error);
  }
});
