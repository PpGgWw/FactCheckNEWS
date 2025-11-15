/**
 * 네이버 뉴스 파서 모듈
 * 네이버 뉴스 페이지에서 제목, 본문, 시간 등의 데이터를 추출하고 하이라이트를 적용합니다.
 */

class NaverNewsParser {
  constructor() {
    this.siteName = 'naver';
    this.siteDisplayName = '네이버 뉴스';
  }

  /**
   * 현재 URL이 네이버 뉴스 페이지인지 확인
   */
  canParse(url) {
    // 다양한 네이버 뉴스 URL 형식 지원
    return url.includes('n.news.naver.com/article/') || 
           url.includes('n.news.naver.com/mnews/');
  }

  /**
   * 네이버 뉴스 데이터 추출
   * @param {Object} colorScheme - 하이라이트 색상 스킴 {background, border}
   * @returns {Array} 추출된 데이터 배열 [{type, text}, ...]
   */
  extractNewsData(colorScheme) {
    console.log(`${this.siteDisplayName} 데이터 추출 시작`);
    const extractedData = [];

    // 1. 제목 추출 및 하이라이트
    const titleSelector = 'h2.media_end_head_headline';
    const titleElement = document.querySelector(titleSelector);

    if (titleElement) {
      // 하이라이트 적용
      this._applyHighlight(titleElement, colorScheme, {
        padding: '5px',
        borderRadius: '5px'
      });

      // 데이터 수집
      const titleText = titleElement.textContent?.trim();
      if (titleText) {
        extractedData.push({ type: '제목', text: titleText });
      }
      console.log(`${this.siteDisplayName} 제목을 성공적으로 하이라이트하고 데이터를 수집했습니다.`);
    } else {
      console.log(`하이라이트할 ${this.siteDisplayName} 제목을 찾지 못했습니다.`);
    }

    // 2. 본문 내용 추출 및 하이라이트
    const contentSelectors = [
      '#dic_area',
      '.go_trans._article_content',
      '#articeBody'
    ];

    let contentFound = false;
    for (const selector of contentSelectors) {
      const contentElements = document.querySelectorAll(selector);
      
      if (contentElements.length > 0) {
        contentElements.forEach((element) => {
          // 하이라이트 적용
          this._applyHighlight(element, colorScheme, {
            padding: '10px',
            borderRadius: '5px'
          });

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
      console.log(`하이라이트할 ${this.siteDisplayName} 내용을 찾지 못했습니다.`);
    }

    // 3. 시간 정보 추출 및 하이라이트
    const timeSelector = '.media_end_head_info_datestamp_bunch .media_end_head_info_datestamp_time';
    const timeElement = document.querySelector(timeSelector);

    if (timeElement) {
      // 하이라이트 적용 (테두리 색상 사용)
      timeElement.style.backgroundColor = colorScheme.border;
      timeElement.style.padding = '3px';
      timeElement.style.borderRadius = '3px';

      // 데이터 수집
      const timeText = timeElement.textContent?.trim();
      if (timeText) {
        extractedData.push({ type: '시간', text: timeText });
      }
      console.log(`${this.siteDisplayName} 시간 정보를 성공적으로 하이라이트하고 데이터를 수집했습니다.`);
    } else {
      console.log(`하이라이트할 ${this.siteDisplayName} 시간 정보를 찾지 못했습니다.`);
    }

    return extractedData;
  }

  /**
   * 하이라이트 색상 업데이트
   * @param {Object} colorScheme - 새로운 색상 스킴
   */
  updateHighlightColors(colorScheme) {
    console.log(`[${this.siteName}] 하이라이트 색상 업데이트 시작`);
    let elementsUpdated = 0;

    // 제목 색상 변경
    const titleSelector = 'h2.media_end_head_headline';
    const titleElement = document.querySelector(titleSelector);
    
    if (titleElement) {
      this._applyHighlight(titleElement, colorScheme, {
        padding: '5px',
        borderRadius: '5px'
      });
      elementsUpdated++;
    }

    // 본문 색상 변경
    const contentSelectors = [
      '#dic_area',
      '.go_trans._article_content',
      '#articeBody'
    ];
    
    for (const selector of contentSelectors) {
      const contentElements = document.querySelectorAll(selector);
      
      contentElements.forEach((element) => {
        this._applyHighlight(element, colorScheme, {
          padding: '10px',
          borderRadius: '5px'
        });
        elementsUpdated++;
      });

      if (contentElements.length > 0) {
        break;
      }
    }

    console.log(`[${this.siteName}] ${elementsUpdated}개 요소의 색상을 업데이트했습니다.`);
    return elementsUpdated;
  }

  /**
   * 수상한 문장 하이라이트
   * @param {Array} suspiciousSentences - 수상한 문장 배열
   */
  highlightSuspiciousSentences(suspiciousSentences) {
    if (!suspiciousSentences || suspiciousSentences.length === 0) {
      return;
    }

    console.log(`[${this.siteName}] 수상한 문장 ${suspiciousSentences.length}개 하이라이트 시작`);

    const contentSelectors = [
      '#dic_area',
      '.go_trans._article_content',
      '#articeBody'
    ];

    for (const selector of contentSelectors) {
      const contentElements = document.querySelectorAll(selector);
      
      if (contentElements.length > 0) {
        contentElements.forEach(element => {
          suspiciousSentences.forEach(sentence => {
            if (!sentence || sentence.trim() === '') return;
            
            const cleanSentence = sentence.trim();
            const textContent = element.innerHTML;
            
            if (textContent.includes(cleanSentence)) {
              const highlightedText = textContent.replace(
                new RegExp(cleanSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                `<mark style="background-color: #ffeb3b; padding: 2px 4px; border-radius: 3px;">${cleanSentence}</mark>`
              );
              element.innerHTML = highlightedText;
            }
          });
        });
        break;
      }
    }
  }

  /**
   * 하이라이트 스타일 적용 헬퍼 함수
   * @private
   */
  _applyHighlight(element, colorScheme, styles = {}) {
    element.style.backgroundColor = colorScheme.background;
    element.style.border = `2px solid ${colorScheme.border}`;
    
    if (styles.padding) element.style.padding = styles.padding;
    if (styles.borderRadius) element.style.borderRadius = styles.borderRadius;
  }
}

// 전역에 등록
if (typeof window !== 'undefined') {
  window.NaverNewsParser = NaverNewsParser;
}
