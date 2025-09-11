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

// 컴포넌트 로드 확인
console.log('컴포넌트 로드 상태 확인:');
console.log('AnalysisPanel:', typeof window.AnalysisPanel);
console.log('VerdictBlock:', typeof window.VerdictBlock);
console.log('EvidenceBlock:', typeof window.EvidenceBlock);
console.log('AnalysisDetailBlock:', typeof window.AnalysisDetailBlock);

/**
 * 분석 중 상태를 표시하는 함수
 */
function showAnalysisLoading() {
  console.log('showAnalysisLoading 함수 시작');
  
  try {
    console.log('AnalysisPanel 생성 중...');
    let panel = document.getElementById('news-analysis-panel');
    let analysisPanel;
    if (!panel) {
      analysisPanel = new window.AnalysisPanel();
      panel = analysisPanel.create();
      console.log('AnalysisPanel 생성 완료:', analysisPanel);
      console.log('패널 생성 완료:', panel);
    } else {
      analysisPanel = panel.__analysisPanel || new window.AnalysisPanel();
      console.log('기존 패널 재사용:', panel);
    }
    panel.__analysisPanel = analysisPanel;
    
    // 패널 위치와 스타일 강제 설정
    panel.className = ''; // 기존 클래스 초기화
    panel.classList.add('analysis-panel-base');
    panel.style.display = 'block'; // 보이도록 설정
    
    console.log('패널 스타일 강제 설정 완료');
    
    panel.innerHTML = `
      <div class="p-4">
        ${analysisPanel.renderHeader()}
        
        <div class="bg-container-and-border border border-container-and-border rounded-lg p-3 shadow-sm">
          <div class="flex items-center mb-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-text-title mr-2"></div>
            <div class="text-text-title font-medium text-lg">분석 중...</div>
          </div>
          <div class="text-text-main text-xl">Gemini가 뉴스를 분석하고 있습니다.</div>
        </div>
      </div>
    `;
    
    console.log('패널 HTML 설정 완료');
    
    // 닫기 버튼 이벤트 추가
    analysisPanel.attachCloseEvent(panel);
    console.log('패널 이벤트 연결 완료');
    
  } catch (error) {
    console.error('showAnalysisLoading 에러:', error);
  }
}

/**
 * 분석 결과를 패널에 표시하는 함수
 * @param {AnalysisResult} result
 */
function displayAnalysisResult(result) {
  let panel = document.getElementById('news-analysis-panel');
  let analysisPanel;
  if (!panel) {
    analysisPanel = new window.AnalysisPanel();
    panel = analysisPanel.create();
  } else {
    analysisPanel = panel.__analysisPanel || new window.AnalysisPanel();
    panel.style.display = 'block';
  }
  panel.__analysisPanel = analysisPanel;
  
  // 결과가 객체가 아니면(텍스트) 그대로 출력
  if (typeof result === 'string') {
    panel.innerHTML = `
      <div class="p-4">
        ${analysisPanel.renderHeader()}
        <div class="bg-status-warning-light border border-status-warning rounded-lg p-3 shadow-sm">
          <div class="text-status-warning font-medium text-lg">Gemini 응답(텍스트)</div>
          <div class="text-text-main text-xl mt-2 whitespace-pre-line">${result}</div>
        </div>
      </div>
    `;
    analysisPanel.attachCloseEvent(panel);
    return;
  }

  // 결과 안전하게 분리
  const verdict = typeof result.진위 === 'string' ? result.진위 : '';
  const evidence = typeof result.근거 === 'string' ? result.근거 : '';
  const analysis = typeof result.분석 === 'string' ? result.분석 : '';

  // 모두 비어있으면 에러 메시지
  if (!verdict && !evidence && !analysis) {
    panel.innerHTML = `
      <div class="p-4">
        ${analysisPanel.renderHeader()}
        <div class="bg-status-error-light border border-status-error rounded-lg p-3 shadow-sm">
          <div class="text-status-error font-medium text-lg">분석 결과가 없습니다</div>
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
  let panel = document.getElementById('news-analysis-panel');
  let analysisPanel;
  if (!panel) {
    analysisPanel = new window.AnalysisPanel();
    panel = analysisPanel.create();
  } else {
    analysisPanel = panel.__analysisPanel || new window.AnalysisPanel();
    panel.style.display = 'block';
  }
  panel.__analysisPanel = analysisPanel;
  
  panel.innerHTML = `
    <div class="p-4">
      ${analysisPanel.renderHeader()}
      <div class="bg-status-error-light border border-status-error rounded-lg p-3 shadow-sm">
        <div class="text-status-error font-medium text-lg">분석 실패</div>
        <div class="text-status-error text-lg mt-1">${error}</div>
      </div>
    </div>
  `;
  
  analysisPanel.attachCloseEvent(panel);
}

/**
 * Gemini로 분석 요청을 보내는 함수
 */
function sendToGeminiForAnalysis() {
  console.log('sendToGeminiForAnalysis 함수 시작');
  console.log('추출된 데이터:', extractedData);
  
  if (extractedData.length === 0) {
    console.log('추출된 데이터가 없음');
    displayError('추출된 데이터가 없습니다.');
    return;
  }

  const title = extractedData.find(item => item.type === '제목')?.text || '';
  const content = extractedData.filter(item => item.type === '내용').map(item => item.text).join('\n');
  const articleContent = `${title}\n${content}`;

  const fullPrompt = `
## 역할
당신은 주어진 기사 텍스트의 **논리적 구조, 근거 제시 방식, 표현의 적절성**만을 분석하는 **'뉴스 텍스트 분석가'** 입니다. 당신의 유일한 임무는 아래의 '절대적 분석 원칙'과 '판단 조건'에 따라, 외부 세계의 사실이나 당신의 사전 지식과 비교하지 않고 오직 **주어진 텍스트 자체**만을 평가하는 것입니다.

---

### **[매우 중요] 절대적 분석 원칙: 외부 정보 및 사전 지식 사용 금지**
1.  **오직 텍스트만 분석:** 당신은 제공된 기사 원문 **내부의 정보만을** 분석 대상으로 삼아야 합니다.
2.  **사전 지식 금지:** 당신의 학습 데이터에 저장된 **인물, 직책, 사건, 날짜 등 어떠한 외부 정보도 판단의 근거로 사용해서는 안 됩니다.** 예를 들어, 기사에 나온 인물의 직책이나 특정 사건의 발생 시점이 당신의 지식과 다르더라도, 그것을 '오류'나 '가짜 뉴스'의 근거로 삼아서는 **절대 안 됩니다.**
3.  **내부 논리 중심 판단:** 당신의 임무는 '이 내용이 현실 세계에서 사실인가?'를 검증하는 것이 아니라, **'이 기사가 주장과 근거를 논리적으로 제시하고 있는가?'** 를 평가하는 것입니다.
4. **엄격하고 문자적인 규칙 적용:** 아래 '판단 조건'의 모든 항목을 해석의 여지 없이 문자 그대로 엄격하게 적용해야 합니다. 일반적인 기사 작성 관행이나 맥락을 고려하여 규칙을 완화해서는 안 됩니다. **조금이라도 의심의 여지가 있다면, 가장 비판적인 관점에서 판단하십시오.**

---

## 판단 조건 및 중요도

※ **판단 원칙:** 여러 조건에 해당하는 경우, **가장 심각한 유형(가장 높은 중요도)을 기준으로 '진위'를 최종 결정**합니다.
※ **기본 판단:** 아래 조건 중 어느 것에도 해당하지 않는 경우, 해당 기사는 **'진짜 뉴스'**로 판단합니다.

#### **[중요도: 최상] → 최종 판단: 가짜뉴스**
*   **유형: 1. 사실 및 출처의 신뢰도 문제**
    *   기사의 주장을 뒷받침하는 근거 제시 방식에 심각한 결함이 있어 신뢰도를 근본적으로 훼손하는 유형입니다.
    *   **1-1. 기사 내 명백한 내용상 모순:** 기사의 앞부분과 뒷부분의 내용이 서로 충돌하거나 모순되는 경우. (예: 도입부에서는 'A가 발생했다'고 서술하고, 뒷부분에서는 'A는 발생하지 않았다'고 서술하는 경우)
    *   **1-2. 불분명하거나 신뢰할 수 없는 출처:** 주장의 근거를 제시하지 않거나, 의도적으로 모호하게 표현하여 권위를 부여하는 방식. (예: "익명의 관계자에 따르면", "전문가들은 입을 모아 말한다")
    *   **1-3. 통계 왜곡 및 오용:** 통계의 일부만 보여주거나(체리피킹), "출처가 명시되지 않은 통계 자료"를 근거로 삼는 등 의도적으로 표본이 편향된 설문조사 결과를 인용하여 독자의 판단을 흐리는 경우.

#### **[중요도: 높음] → 최종 판단: 가짜일 가능성이 높은 뉴스**
*   **유형: 2. 논리 및 구조적 허점**
    *   기사의 주장을 뒷받침하는 과정이 비논리적이거나 구조적으로 허술한 경우입니다.
    *   **2-1. 논리적 비약:** 제시된 근거만으로는 도저히 결론에 도달할 수 없을 정도로, 근거와 주장 사이에 합리적인 연결고리가 부족한 경우. (예: "A라는 작은 사건이 발생했다. 그러므로 B라는 거대한 음모가 있는 것이 틀림없다.")
    *   **2-2. 근거 없는 의혹 제기:** 명확한 근거 없이 언론사가 자체적으로 의혹을 만들고 "~라는 의혹이 있다", "~일 수 있다" 와 같이 애매한 표현으로 마무리하여 독자에게 의심과 불신을 심어주는 방식.
        *   **⚠️판단 가이드:** 언론사가 자체적으로 제기하는 근거 없는 의혹과, **특정 기관(검찰, 경찰, 감사원 등)의 수사나 공식 발표 내용을 인용하며 '의혹'을 보도하는 것은 명확히 구분**해야 합니다. 후자의 경우, 명확한 정보 출처가 있으므로 이 항목에 해당하지 않습니다.

#### **[중요도: 중간] → 최종 판단: 가짜일 가능성이 있는 뉴스**
*   **유형: 3. 선동적·감정적 표현 방식**
    *   객관적인 정보 전달보다 독자의 감정을 자극하여 특정 여론을 형성하려는 의도가 보이는 경우입니다.
    *   **3-1. 단정적·선동적 어조:** 검증되지 않은 사실을 확정된 것처럼 표현하여 독자의 판단을 '강요'하는 방식. (예: "이것은 명백한 조작이다.", "~임이 틀림없다.")
    *   **3-2. 감정적 표현 사용:** 중립적인 단어 대신 '참담한', '끔찍한', '충격적인' 등 감정을 자극하는 표현을 남발하여 이성적 판단을 방해하는 경우.

*   **유형: 4. 기사의 의도 문제**
    *   기사의 본래 목적인 '정보 전달'이 아닌 다른 의도가 명백히 보이는 경우입니다.
    *   **4-1. 제목과 내용의 불일치 (낚시성 제목):** 독자의 클릭을 유도하기 위해 자극적이거나 과장된 제목을 사용했으나, 본문 내용은 제목과 무관하거나 일부만 다루는 경우.
    *   **4-2. 홍보 및 광고성 기사:** 기사의 형식을 빌려 특정 상품, 서비스, 인물 등을 일방적으로 긍정적으로 묘사하는 경우.

---

## 출력 형식
"
[
  {
    "instruction": "해당 기사는 진위 여부판단을 목적으로 수집되었습니다. 조건에 따라서 종합적으로 검토 후 판단 결과를 진위,근거,분석 항목으로 나누어 출력하세요.",
    "input": "주어진 텍스트 전체",
    "output": {
      "진위": "판단 결과('가짜 뉴스' / '가짜일 가능성이 높은 뉴스' / '가짜일 가능성이 있는 뉴스' / '진짜 뉴스')가 여기에 위치합니다.",
      "근거": "탐지된 중요도의 조건 번호와 이름이 위치합니다. 여러 개일 경우 번호를 붙여서 한 줄의 문자열로 나열합니다. 예시: 2-2. 근거 없는 의혹 제기",
      "분석": "위 근거들을 종합하여 기사의 어떤 부분이 왜 문제인지 혹은 신뢰할 수 있는지를 구체적으로 서술"
    }
  }
]
"
### 다음은 **반드시 지켜야 할** 출력 형식에 대한 설명입니다.
- 반드시 명시된 키("진위", "근거", "분석")를 가진 유효한(valid) JSON 형식으로만 응답해주세요.
- 다른 설명이나 부가적인 텍스트 없이 JSON 객체만 출력해야 합니다.
- '진짜 뉴스'라면 '근거'란이 비어있어야 합니다.(예시: "근거": "",) 그리고 진짜 뉴스 '분석'란은 왜 진짜인지를 뉴스 기사의 적힌 텍스트를 최대한 인용해서 작성하세요.
- 출력 텍스트는 **한국어**여야 합니다. 특정 사람 이름이나, 기사에서 따로 표시해둔 명사 형태의 언어는 원본 언어 그대로 유지해도 됩니다.
- instruction 필드는 예시에 **주어진 내용과 동일하게 고정**됩니다.
- input 필드에는 당신에게 **입력으로 주어진 기사 원문**을 그대로 넣어야 합니다.

---
[뉴스 기사 본문]
${articleContent}
---`;

  console.log('Gemini 프롬프트:', fullPrompt);
  console.log('Chrome runtime 메시지 전송 중...');
  chrome.runtime.sendMessage({
    action: "analyzeNewsWithGemini",
    prompt: fullPrompt
  });
  console.log('Chrome runtime 메시지 전송 완료');
}

// --- 기존 하이라이트 로직을 데이터 수집 로직과 통합 ---

// 제목 처리
const titleSelector = 'h2.media_end_head_headline';
const titleElement = document.querySelector(titleSelector);

if (titleElement) {
  // 하이라이트
  titleElement.classList.add('highlight-title');

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
      element.classList.add('highlight-content');

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
  subtitleElement.classList.add('highlight-subtitle');

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
console.log('Timer 설정 중... 1초 후 분석 시작');
setTimeout(() => {
  console.log('Timer 실행됨 - 분석 시작');
  
  // 분석 중 상태 표시
  console.log('showAnalysisLoading 호출');
  showAnalysisLoading();
  
  console.log('sendToGeminiForAnalysis 호출');
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
