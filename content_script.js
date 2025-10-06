console.log('Content script loaded');

// Chrome API 안전 확인 함수
function isChromeApiAvailable() {
  try {
    return chrome && chrome.runtime && chrome.runtime.id;
  } catch (error) {
    return false;
  }
}

// 전역 변수
let extractedData = [];

/**
 * 초기화 함수
 */
function initialize() {
  console.log('초기화 시작');
  
  // 이전 데이터 초기화
  extractedData = [];
  
  // 뉴스 데이터 추출 및 하이라이트
  extractNewsData();
  
  // 추출된 데이터가 있다면 패널에 추가
  if (extractedData.length > 0) {
    addNewsToPanel();
    
    // 이미 분석된 뉴스인지 확인하고 하이라이트 색상 적용
    checkAndApplyExistingAnalysis();
  } else {
    // 뉴스 데이터가 없어도 플로팅 버튼 항상 표시 설정이 켜져있다면 빈 패널과 플로팅 버튼 생성
    if (getAlwaysShowFloatingButtonSetting()) {
      createEmptyPanelWithFloatingButton();
    }
  }
}

/**
 * 뉴스 데이터 추출 및 하이라이트
 */
function extractNewsData() {
  console.log('뉴스 데이터 추출 시작');
  
  // 제목 처리
  const titleSelector = 'h2.media_end_head_headline';
  const titleElement = document.querySelector(titleSelector);

  if (titleElement) {
    // 하이라이트
    titleElement.style.backgroundColor = '#F2CEA2'; // 테마 primary 색상
    titleElement.style.padding = '5px';
    titleElement.style.borderRadius = '5px';
    titleElement.style.border = '2px solid #BF9780'; // 테두리 추가

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
        element.style.backgroundColor = '#F2CEA2'; // 테마 primary 색상
        element.style.padding = '10px';
        element.style.borderRadius = '5px';
        element.style.border = '2px solid #BF9780';

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
    subtitleElement.style.backgroundColor = '#BF9780';
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
}

/**
 * 자동 열기 설정 확인
 */
function getAutoOpenSetting() {
  try {
    const setting = localStorage.getItem('factcheck_auto_open');
    return setting !== null ? JSON.parse(setting) : true; // 기본값: true
  } catch (error) {
    console.error('Failed to get auto open setting:', error);
    return true;
  }
}

/**
 * 플로팅 버튼 항상 표시 설정 확인
 */
function getAlwaysShowFloatingButtonSetting() {
  try {
    const setting = localStorage.getItem('factcheck_always_show_floating_button');
    return setting !== null ? JSON.parse(setting) : false; // 기본값: false
  } catch (error) {
    console.error('Failed to get always show floating button setting:', error);
    return false;
  }
}

/**
 * 패널에 뉴스 블록 추가
 */
function addNewsToPanel() {
  console.log('패널에 현재 뉴스 설정 시작');
  
  const title = extractedData.find(item => item.type === '제목')?.text || '제목 없음';
  const content = extractedData.filter(item => item.type === '내용').map(item => item.text).join('\n');
  const url = window.location.href;
  
  console.log('추출된 데이터:', { title, content: content.substring(0, 100) + '...', url });
  
  // 패널 생성 또는 가져오기
  let panel = document.getElementById('news-analysis-panel');
  let analysisPanel;
  
  if (!panel) {
    // AnalysisPanel 클래스가 로드되었는지 확인
    if (typeof window.AnalysisPanel === 'undefined') {
      console.error('AnalysisPanel 클래스가 로드되지 않았습니다. 잠시 후 다시 시도합니다.');
      setTimeout(() => addNewsToPanel(), 500);
      return;
    }
    
    analysisPanel = new window.AnalysisPanel();
    panel = analysisPanel.create();
    
    // 패널에 인스턴스 참조 저장
    if (panel) {
      panel.__analysisPanel = analysisPanel;
    }
  } else {
    analysisPanel = panel.__analysisPanel;
  }
  
  if (analysisPanel) {
    // 현재 뉴스로 설정 (분석된 뉴스 리스트에 추가하지 않음)
    analysisPanel.setCurrentNews(title, url, content);
    console.log('현재 뉴스가 패널에 설정되었습니다.');

    const autoOpenEnabled = getAutoOpenSetting();

    // 자동 열기 설정 확인 후 패널 표시
    if (autoOpenEnabled) {
      console.log('자동 열기 설정이 활성화되어 패널을 표시합니다.');
      analysisPanel.show();

      // 패널이 열린 상태에서는 기존 플로팅 버튼 제거
      const existingButton = document.getElementById('floating-news-analysis-btn');
      if (existingButton) {
        existingButton.remove();
      }
    } else {
      console.log('자동 열기 설정이 비활성화되어 패널을 숨김 상태로 유지합니다.');

      // 뉴스 페이지 접근 시 항상 플로팅 버튼을 제공
      analysisPanel.createFloatingButton();
    }
  } else {
    console.error('AnalysisPanel 인스턴스를 찾을 수 없습니다.');
  }
}



/**
 * 빈 패널 생성 (뉴스 데이터가 없을 때)
 */
function createEmptyPanel() {
  // AnalysisPanel 클래스가 로드되었는지 확인
  if (typeof window.AnalysisPanel === 'undefined') {
    console.error('AnalysisPanel 클래스가 로드되지 않았습니다.');
    return null;
  }
  
  const analysisPanel = new window.AnalysisPanel();
  const panel = analysisPanel.create();
  
  // 패널에 인스턴스 참조 저장
  if (panel) {
    panel.__analysisPanel = analysisPanel;
    // 빈 상태로 설정 (뉴스 데이터 없음)
    analysisPanel.setCurrentNews('뉴스를 찾을 수 없음', window.location.href, '이 페이지에서 분석할 수 있는 뉴스 콘텐츠를 찾을 수 없습니다.');
  }
  
  return panel;
}

/**
 * 빈 패널과 플로팅 버튼 생성 (뉴스 데이터 없이 항상 표시 설정이 켜진 경우)
 */
function createEmptyPanelWithFloatingButton() {
  const panel = createEmptyPanel();
  if (panel && panel.__analysisPanel) {
    // 패널은 숨긴 상태로 생성하고 플로팅 버튼만 표시
    panel.__analysisPanel.hide();
    // AnalysisPanel의 기존 플로팅 버튼 생성 메서드 사용
    panel.__analysisPanel.createFloatingButton();
    console.log('뉴스 데이터가 없지만 항상 표시 설정에 따라 플로팅 버튼을 생성했습니다.');
  }
}

/**
 * 플로팅 버튼 가시성 업데이트 (설정 변경 시 호출)
 */
function updateFloatingButtonVisibility() {
  const hasNewsData = extractedData.length > 0;
  const alwaysShow = getAlwaysShowFloatingButtonSetting();
  const shouldShow = hasNewsData || alwaysShow;
  
  // AnalysisPanel의 플로팅 버튼 확인
  const existingButton = document.getElementById('floating-news-analysis-btn');
  const existingPanel = document.getElementById('news-analysis-panel');
  
  if (shouldShow) {
    if (!existingButton) {
      console.log('플로팅 버튼이 없어 새로 생성합니다. hasNewsData:', hasNewsData, 'existingPanel:', !!existingPanel);

      if (existingPanel && existingPanel.__analysisPanel) {
        const isPanelHidden = existingPanel.style.display === 'none' || existingPanel.style.opacity === '0' || existingPanel.style.opacity === '';
        if (isPanelHidden) {
          existingPanel.__analysisPanel.createFloatingButton();
        } else {
          console.log('패널이 표시 중이라 플로팅 버튼 생성은 보류합니다.');
        }
      } else if (hasNewsData) {
        addNewsToPanel();
      } else {
        createEmptyPanelWithFloatingButton();
      }
    }
  } else if (existingButton) {
    // 숨겨야 하는데 버튼이 있으면 제거
    existingButton.remove();
    console.log('설정 변경으로 플로팅 버튼을 숨깁니다.');
  }
}

/**
 * 진위 여부에 따라 하이라이트 색상 변경
 */
function updateHighlightColors(verdict) {
  console.log('하이라이트 색상 업데이트 시작:', verdict);
  
  // 진위 여부에 따른 색상 정의
  const colors = {
    '진짜 뉴스': {
      background: '#E8F5E8', // 연한 초록
      border: '#4CAF50'      // 진한 초록
    },
    '가짜일 가능성이 있는 뉴스': {
      background: '#F2CEA2', // 기존 색상 (주황)
      border: '#BF9780'      // 기존 색상
    },
    '가짜일 가능성이 높은 뉴스': {
      background: '#FFEBEE', // 연한 빨강
      border: '#F44336'      // 진한 빨강
    },
    '가짜 뉴스': {
      background: '#FFEBEE', // 연한 빨강
      border: '#D32F2F'      // 더 진한 빨강
    }
  };
  
  const colorScheme = colors[verdict] || colors['가짜일 가능성이 있는 뉴스']; // 기본값
  console.log('적용할 색상 스키마:', colorScheme);
  
  let elementsUpdated = 0;
  
  // 제목 하이라이트 색상 변경
  const titleSelector = 'h2.media_end_head_headline';
  const titleElement = document.querySelector(titleSelector);
  console.log('제목 요소 확인:', !!titleElement, titleElement?.style.backgroundColor);
  
  if (titleElement) {
    const wasHighlighted = !!titleElement.style.backgroundColor;
    titleElement.style.backgroundColor = colorScheme.background;
    titleElement.style.borderColor = colorScheme.border;
    titleElement.style.border = `2px solid ${colorScheme.border}`;
    
    console.log('제목 하이라이트 색상 변경 완료:', {
      wasHighlighted,
      newBackground: colorScheme.background,
      newBorder: colorScheme.border
    });
    elementsUpdated++;
  }
  
  // 내용 하이라이트 색상 변경
  const contentSelectors = [
    '#dic_area',
    '.go_trans._article_content',
    '#articeBody'
  ];
  
  for (const selector of contentSelectors) {
    const contentElements = document.querySelectorAll(selector);
    console.log(`${selector} 요소 확인:`, contentElements.length, '개');
    
    contentElements.forEach((element, index) => {
      const wasHighlighted = !!element.style.backgroundColor;
      element.style.backgroundColor = colorScheme.background;
      element.style.borderColor = colorScheme.border;
      element.style.border = `2px solid ${colorScheme.border}`;
      
      console.log(`${selector}[${index}] 하이라이트 색상 변경:`, {
        wasHighlighted,
        newBackground: colorScheme.background,
        newBorder: colorScheme.border
      });
      elementsUpdated++;
    });
  }
  
  // 시간 정보 하이라이트 색상 변경
  const subtitleSelector = '.media_end_head_info_datestamp_bunch .media_end_head_info_datestamp_time';
  const subtitleElement = document.querySelector(subtitleSelector);
  console.log('시간 요소 확인:', !!subtitleElement, subtitleElement?.style.backgroundColor);
  
  if (subtitleElement) {
    const wasHighlighted = !!subtitleElement.style.backgroundColor;
    subtitleElement.style.backgroundColor = colorScheme.border; // 조금 더 진한 색상 사용
    
    console.log('시간 정보 하이라이트 색상 변경 완료:', {
      wasHighlighted,
      newBackground: colorScheme.border
    });
    elementsUpdated++;
  }
  
  console.log(`전체 하이라이트 색상 업데이트 완료 - 판정: ${verdict}, 업데이트된 요소: ${elementsUpdated}개`);
  
  if (elementsUpdated === 0) {
    console.warn('업데이트된 요소가 없습니다. 하이라이트가 되지 않았거나 셀렉터가 잘못되었을 수 있습니다.');
  }
}

/**
 * 수상한 문장 하이라이트 적용
 */
function highlightSuspiciousSentences(suspiciousSentences) {
  console.log('수상한 문장 하이라이트 시작:', suspiciousSentences);
  
  if (!suspiciousSentences || Object.keys(suspiciousSentences).length === 0) {
    console.log('수상한 문장이 없습니다.');
    return;
  }
  
  // 이전 하이라이트 제거
  document.querySelectorAll('.suspicious-sentence-highlight').forEach(el => {
    const parent = el.parentNode;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
  
  // 툴팁 스타일 추가 (한 번만)
  if (!document.getElementById('suspicious-tooltip-style')) {
    const style = document.createElement('style');
    style.id = 'suspicious-tooltip-style';
    style.textContent = `
      .suspicious-sentence-highlight {
        background: linear-gradient(180deg, transparent 60%, #FFD700 60%);
        cursor: help;
        position: relative;
        border-bottom: 2px dotted #FF6B6B;
        font-weight: 500;
      }
      
      .suspicious-sentence-highlight:hover {
        background: linear-gradient(180deg, transparent 50%, #FFA500 50%);
      }
      
      .suspicious-tooltip {
        visibility: hidden;
        position: absolute;
        bottom: 125%;
        left: 50%;
        transform: translateX(-50%);
        background-color: #2C3E50;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 13px;
        white-space: normal;
        max-width: 300px;
        z-index: 10000;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        line-height: 1.4;
        opacity: 0;
        transition: opacity 0.3s, visibility 0.3s;
      }
      
      .suspicious-tooltip::after {
        content: "";
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border-width: 6px;
        border-style: solid;
        border-color: #2C3E50 transparent transparent transparent;
      }
      
      .suspicious-sentence-highlight:hover .suspicious-tooltip {
        visibility: visible;
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }
  
  // 내용 영역에서 수상한 문장 찾기
  const contentSelectors = [
    '#dic_area',
    '.go_trans._article_content',
    '#articeBody'
  ];
  
  let highlightedCount = 0;
  
  for (const selector of contentSelectors) {
    const contentElements = document.querySelectorAll(selector);
    
    contentElements.forEach(element => {
      let html = element.innerHTML;
      
      // 각 수상한 문장에 대해 하이라이트 적용
      Object.entries(suspiciousSentences).forEach(([sentence, reason]) => {
        // HTML 태그를 제외한 텍스트에서 문장 찾기
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const text = tempDiv.textContent || tempDiv.innerText;
        
        if (text.includes(sentence)) {
          // 이스케이프 처리
          const escapedSentence = sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escapedSentence})`, 'gi');
          
          // 하이라이트 적용 (기존 태그 보존)
          html = html.replace(regex, (match) => {
            highlightedCount++;
            return `<span class="suspicious-sentence-highlight">
              ${match}
              <span class="suspicious-tooltip">⚠️ ${reason}</span>
            </span>`;
          });
        }
      });
      
      if (html !== element.innerHTML) {
        element.innerHTML = html;
      }
    });
  }
  
  console.log(`수상한 문장 하이라이트 완료: ${highlightedCount}개 문장 처리`);
}

/**
 * 이미 분석된 뉴스인지 확인하고 하이라이트 색상 적용
 */
function checkAndApplyExistingAnalysis() {
  console.log('기존 분석 결과 확인 시작');
  
  const currentUrl = window.location.href;
  console.log('현재 URL:', currentUrl);
  
  // 패널이 생성될 때까지 여러 번 시도
  let attempts = 0;
  const maxAttempts = 10;
  
  function tryCheckAnalysis() {
    attempts++;
    console.log(`분석 결과 확인 시도 ${attempts}/${maxAttempts}`);
    
    const panel = document.getElementById('news-analysis-panel');
    if (!panel || !panel.__analysisPanel) {
      if (attempts < maxAttempts) {
        setTimeout(tryCheckAnalysis, 200);
        return;
      } else {
        console.log('패널을 찾을 수 없어 기존 분석 결과 확인을 중단합니다.');
        return;
      }
    }
    
    const analysisPanel = panel.__analysisPanel;
    console.log('패널 발견, 데이터 확인 중...');
    console.log('현재 뉴스:', analysisPanel.currentNews);
    console.log('분석된 블록들:', analysisPanel.analysisBlocks);
    
    // 현재 뉴스 블록 확인
    if (analysisPanel.currentNews && analysisPanel.currentNews.url === currentUrl) {
      console.log('현재 뉴스 블록 확인:', analysisPanel.currentNews.status, analysisPanel.currentNews.result);
      if (analysisPanel.currentNews.status === 'completed' && analysisPanel.currentNews.result && analysisPanel.currentNews.result.진위) {
        console.log('현재 뉴스에 분석 결과 있음:', analysisPanel.currentNews.result.진위);
        console.log('하이라이트 색상 적용 시작...');
        updateHighlightColors(analysisPanel.currentNews.result.진위);
        
        // 수상한 문장 하이라이트 적용
        if (analysisPanel.currentNews.result.수상한문장) {
          console.log('수상한 문장 하이라이트 적용...');
          highlightSuspiciousSentences(analysisPanel.currentNews.result.수상한문장);
        }
        return;
      }
    }
    
    // 분석된 뉴스 리스트에서 확인
    if (analysisPanel.analysisBlocks && analysisPanel.analysisBlocks.length > 0) {
      console.log('분석된 뉴스 리스트 확인:', analysisPanel.analysisBlocks.length, '개');
      
      for (const block of analysisPanel.analysisBlocks) {
        console.log('블록 상세:', {
          url: block.url,
          currentUrl: currentUrl,
          urlMatch: block.url === currentUrl,
          status: block.status,
          hasResult: !!block.result,
          verdict: block.result?.진위
        });
        
        if (block.url === currentUrl && block.status === 'completed' && block.result && block.result.진위) {
          console.log('매칭되는 분석 결과 발견:', block.result.진위);
          console.log('하이라이트 색상 적용 시작...');
          updateHighlightColors(block.result.진위);
          
          // 수상한 문장 하이라이트 적용
          if (block.result.수상한문장) {
            console.log('수상한 문장 하이라이트 적용...');
            highlightSuspiciousSentences(block.result.수상한문장);
          }
          return;
        }
      }
    }
    
    console.log('기존 분석 결과 없음 - 기본 색상 유지');
  }
  
  // 즉시 시도 및 지연 시도
  tryCheckAnalysis();
}

// 전역 함수로 설정하여 AnalysisPanel에서 접근 가능하도록
window.updateFloatingButtonVisibility = updateFloatingButtonVisibility;
window.createEmptyPanel = createEmptyPanel;
window.updateHighlightColors = updateHighlightColors;
window.checkAndApplyExistingAnalysis = checkAndApplyExistingAnalysis;
window.highlightSuspiciousSentences = highlightSuspiciousSentences;

// 테스트용 함수들
window.testHighlightColors = function(verdict) {
  console.log('테스트: 하이라이트 색상 변경 -', verdict);
  updateHighlightColors(verdict || '진짜 뉴스');
};

window.forceCheckAnalysis = function() {
  console.log('강제 분석 결과 확인 실행');
  checkAndApplyExistingAnalysis();
};

window.testSuspiciousSentences = function() {
  console.log('테스트: 수상한 문장 하이라이트');
  const testData = {
    "익명의 관계자에 따르면": "출처가 불분명하여 신뢰도 낮음",
    "전문가들은 입을 모아 말한다": "구체적인 전문가 명시 없음"
  };
  highlightSuspiciousSentences(testData);
};

/**
 * Gemini로 분석 요청을 보내는 함수
 */
function sendToGeminiForAnalysis(blockId) {
  console.log('sendToGeminiForAnalysis 함수 시작, blockId:', blockId);
  console.log('추출된 데이터:', extractedData);
  
  if (extractedData.length === 0) {
    console.log('추출된 데이터가 없음');
    return;
  }

  const title = extractedData.find(item => item.type === '제목')?.text || '';
  const content = extractedData.filter(item => item.type === '내용').map(item => item.text).join('\n');
  const articleContent = `${title}\n${content}`;

  const fullPrompt = `
## **이 기사를 가짜뉴스로 가정하고 분석 결과를 작성하세요. 수상한문장도 2-3개 찾아서 포함하세요.**

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

## 비교분석 특별 지시사항
**비교분석**은 두 뉴스의 내용의 실체, 정확성, 차이점을 찾아내어 그 주제의 뉴스가 진짜인지 가짜인지를 구분하기 위한 분석입니다. 두 뉴스의 내용에서 일관되게 같은 이야기를 하는지, 서로의 내용이 일관되지 않고 묘하게 다른지를 완벽하게 분석해내어 적어야 합니다. 비교분석 시에는 다음 사항을 반드시 포함해야 합니다:

1. **내용 일치성 분석**: 두 뉴스가 같은 사실을 다루는지, 핵심 내용이 일치하는지 분석
2. **관점 차이 분석**: 같은 사건을 다른 시각에서 보는지, 편향된 시각이 있는지 분석  
3. **정보 정확성 비교**: 제시된 사실, 수치, 인용문 등이 서로 일치하는지 분석
4. **종합 신뢰도 판단**: 두 뉴스를 종합했을 때의 전체적인 신뢰도 평가

---

## 출력 형식
"
[
  {
    "instruction": "해당 기사는 진위 여부판단을 목적으로 수집되었습니다. 조건에 따라서 종합적으로 검토 후 판단 결과를 진위,근거,분석,수상한문장 항목으로 나누어 출력하세요.",
    "input": "주어진 텍스트 전체",
    "output": {
      "분석진행": "분석을 위한 당신의 추론 내용을 투명하게 꼼꼼히 적으세요. 추론은 반드시 어떻게 분석할 것인지, 어떤 분석을 해야 할지를 순서를 정하여 순서대로 하나씩 분석합니다. (정확한 분석을 위하여 최소 4개 이상의 분석 단계를 만드세요. 정말 필요 없을 정도로 간단한 경우만 2개까지 허용합니다.) 모든 단계별 분석이 끝나면 그 분석된 내용들을 전부 합치고 정리하여 최종 진위, 근거, 분석, 요약을 도출합니다. 비교분석의 경우 진위/근거는 두 기사 내용의 일치성과 신뢰도를 기준으로 판단하세요. **이 내용은 반드시 마크다운 문법으로 작성하세요 (## 제목, **강조**, - 리스트 등 사용).**",
      "진위": "판단 결과('가짜 뉴스' / '가짜일 가능성이 높은 뉴스' / '가짜일 가능성이 있는 뉴스' / '진짜 뉴스')가 여기에 위치합니다.",
      "근거": "탐지된 중요도의 조건 번호와 이름이 위치합니다. 여러 개일 경우 '1. 첫 번째 근거\\n2. 두 번째 근거\\n' 형식으로 숫자 리스트로 나열하세요. 예시: 1. 2-2. 근거 없는 의혹 제기\\n2. 3-1. 단정적·선동적 어조\\n",
      "분석": "위 근거들을 종합하여 기사의 어떤 부분이 왜 문제인지 혹은 신뢰할 수 있는지를 구체적으로 서술합니다. 여러 항목이 있는 경우 '1. 첫 번째 분석 내용\\n2. 두 번째 분석 내용\\n' 형식으로 숫자 리스트로 작성하세요.",
      "요약": "기사의 핵심 내용을 간결하면서 정확하게 요약합니다. 비교분석을 대비하여 핵심 내용 / 단어를 최대한 많이 포함합니다. 여러 항목이 있는 경우 '1. 첫 번째 요약 내용\\n2. 두 번째 요약 내용\\n' 형식으로 숫자 리스트로 작성하세요.",
      "수상한문장": "기사에서 발견된 논리적 결함, 근거 없는 주장, 모호한 표현 등의 문제가 있는 문장을 **원문 그대로** 키로 사용하고, 왜 수상한지 그 이유를 값으로 하는 JSON 객체입니다. 문장은 기사에서 추출한 원본 텍스트를 그대로 복사해야 합니다. 예시: { \"익명의 관계자에 따르면\": \"출처가 불분명하여 신뢰도 낮음\", \"전문가들은 입을 모아 말한다\": \"구체적인 전문가 명시 없음\" }. '진짜 뉴스'인 경우 빈 객체 {}를 반환하세요."
    }
  }
]
"
### 다음은 **반드시 지켜야 할** 출력 형식에 대한 설명입니다.
- 반드시 명시된 키("진위", "근거", "분석", "요약", "수상한문장")를 가진 유효한(valid) JSON 형식으로만 응답해주세요.
- 다른 설명이나 부가적인 텍스트 없이 JSON 객체만 출력해야 합니다.
- '진짜 뉴스'라면 '근거'란이 비어있어야 합니다.(예시: "근거": "",) 그리고 '수상한문장'은 빈 객체여야 합니다.(예시: "수상한문장": {})
- 진짜 뉴스 '분석'란은 왜 진짜인지를 뉴스 기사의 적힌 텍스트를 최대한 인용해서 작성하세요.
- **'수상한문장' 필드의 키는 반드시 기사 원문에서 그대로 복사한 문장이어야 합니다.** 요약하거나 변경하지 마세요.
- 출력 텍스트는 **한국어**여야 합니다. 특정 사람 이름이나, 기사에서 따로 표시해둔 명사 형태의 언어는 원본 언어 그대로 유지해도 됩니다.
- instruction 필드는 예시에 **주어진 내용과 동일하게 고정**됩니다.
- input 필드에는 당신에게 **입력으로 주어진 기사 원문**을 그대로 넣어야 합니다.

---
[뉴스 기사 본문]
${articleContent}
---`;

  console.log('Gemini 프롬프트:', fullPrompt);
  console.log('Chrome runtime 메시지 전송 중...');
  
  // Chrome API 안전 확인 후 메시지 전송
  if (isChromeApiAvailable()) {
    try {
      chrome.runtime.sendMessage({
        action: "analyzeNewsWithGemini",
        prompt: fullPrompt,
        blockId: blockId
      }).then(response => {
        console.log('Chrome runtime 메시지 전송 완료:', response);
      }).catch(error => {
        console.error('Chrome runtime 메시지 전송 오류:', error);
        // 패널에 오류 표시
        const panel = document.getElementById('news-analysis-panel');
        if (panel && panel.__analysisPanel) {
          panel.__analysisPanel.failAnalysis(blockId, '확장 연결 오류: ' + error.message);
        }
      });
    } catch (error) {
      console.error('Chrome API 호출 오류:', error);
      // 패널에 오류 표시
      const panel = document.getElementById('news-analysis-panel');
      if (panel && panel.__analysisPanel) {
        panel.__analysisPanel.failAnalysis(blockId, '확장 API 오류: ' + error.message);
      }
    }
  } else {
    console.error('Chrome extension context is not available');
    // 패널에 오류 표시
    const panel = document.getElementById('news-analysis-panel');
    if (panel && panel.__analysisPanel) {
      panel.__analysisPanel.failAnalysis(blockId, '확장 컨텍스트가 무효화되었습니다. 페이지를 새로고침해주세요.');
    }
  }
  console.log('Chrome runtime 메시지 전송 처리 완료');
}

// service_worker로부터 메시지를 수신하는 리스너
if (isChromeApiAvailable()) {
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('메시지 수신:', message);
      
      if (message.action === "displayAnalysisResult" && message.result) {
        // 결과를 패널에 표시
        const panel = document.getElementById('news-analysis-panel');
        if (panel && panel.__analysisPanel) {
          console.log('분석 결과 표시:', message.blockId, message.result);
          panel.__analysisPanel.completeAnalysis(message.blockId, message.result);
          
          // 분석 결과에 따라 페이지 하이라이트 색상 업데이트
          if (message.result && message.result.진위) {
            console.log('하이라이트 색상 업데이트 시작:', message.result.진위);
            updateHighlightColors(message.result.진위);
          }
          
          // 수상한 문장 하이라이트 적용
          if (message.result && message.result.수상한문장) {
            console.log('수상한 문장 하이라이트 적용 시작:', message.result.수상한문장);
            highlightSuspiciousSentences(message.result.수상한문장);
          }
        }
      } else if (message.action === "displayError" && message.error) {
        // 오류를 패널에 표시
        const panel = document.getElementById('news-analysis-panel');
        if (panel && panel.__analysisPanel) {
          console.log('분석 오류 표시:', message.blockId, message.error);
          panel.__analysisPanel.failAnalysis(message.blockId, message.error);
        }
      } else if (message.action === "updateStreamingResult" && message.partialResult) {
        // 실시간 스트리밍 결과 업데이트
        const panel = document.getElementById('news-analysis-panel');
        if (panel && panel.__analysisPanel) {
          console.log('스트리밍 결과 업데이트:', message.blockId, message.partialResult.length, '글자');
          panel.__analysisPanel.updateStreamingResult(message.blockId, message.partialResult);
        }
      }
      
      sendResponse({ status: "메시지 처리 완료" });
    });
  } catch (error) {
    console.error('메시지 리스너 등록 오류:', error);
  }
} else {
  console.error('Chrome API를 사용할 수 없습니다. 메시지 리스너를 등록하지 않습니다.');
}

// 페이지 로딩 완료 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// 페이지 변경 감지 (SPA 지원)
let currentUrl = window.location.href;

// History API 변경 감지
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function() {
  originalPushState.apply(history, arguments);
  setTimeout(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      console.log('페이지 변경 감지 (pushState):', currentUrl);
      setTimeout(initialize, 500); // 페이지 로딩 대기
    }
  }, 100);
};

history.replaceState = function() {
  originalReplaceState.apply(history, arguments);
  setTimeout(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      console.log('페이지 변경 감지 (replaceState):', currentUrl);
      setTimeout(initialize, 500); // 페이지 로딩 대기
    }
  }, 100);
};

// popstate 이벤트 (뒤로가기/앞으로가기)
window.addEventListener('popstate', () => {
  setTimeout(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      console.log('페이지 변경 감지 (popstate):', currentUrl);
      setTimeout(initialize, 500); // 페이지 로딩 대기
    }
  }, 100);
});

console.log('Content script 초기화 완료');
