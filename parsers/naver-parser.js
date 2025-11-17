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
        enhancedTitle: true,
        padding: '20px 28px 20px 58px'
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
            enhancedSection: true,
            padding: '22px 26px 22px 38px'
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
        enhancedTitle: true,
        padding: '20px 28px 20px 58px'
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
          enhancedSection: true,
          padding: '22px 26px 22px 38px'
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
  _applyHighlight(element, colorScheme = {}, styles = {}) {
    if (!element) return;

    const { enhancedTitle, enhancedSection, padding, borderRadius } = styles;
    const baseBackground = colorScheme.background || 'rgba(18, 18, 18, 0.04)';
    const baseBorder = colorScheme.border || 'rgba(18, 18, 18, 0.22)';
    const accent = colorScheme.accent || 'rgba(18, 18, 18, 0.18)';

    // 초기화
    element.classList.remove('factcheck-title-highlight', 'factcheck-section-highlight');
    element.style.removeProperty('--factcheck-title-bg');
    element.style.removeProperty('--factcheck-title-border');
    element.style.removeProperty('--factcheck-title-accent');
    element.style.removeProperty('--factcheck-title-shadow');
    element.style.removeProperty('--factcheck-title-padding');
    element.style.removeProperty('--factcheck-section-bg');
    element.style.removeProperty('--factcheck-section-border');
    element.style.removeProperty('--factcheck-section-accent');
    element.style.removeProperty('--factcheck-section-shadow');
    element.style.removeProperty('--factcheck-section-padding');
    element.style.backgroundColor = '';
    element.style.border = '';
    element.style.padding = '';
    element.style.borderRadius = '';
    element.style.boxShadow = '';

    if (enhancedTitle) {
      this._ensureEnhancedHighlightStyles();
      element.classList.add('factcheck-title-highlight');
      element.style.setProperty('--factcheck-title-bg', `linear-gradient(135deg, ${this._withAlpha(baseBackground, 0.6)} 0%, ${this._withAlpha(baseBackground, 0.35)} 100%)`);
      element.style.setProperty('--factcheck-title-border', this._withAlpha(baseBorder, 0.65));
      element.style.setProperty('--factcheck-title-accent', this._withAlpha(accent, 0.45));
      element.style.setProperty('--factcheck-title-shadow', this._withAlpha(baseBorder, 0.18));
      if (padding) {
        element.style.setProperty('--factcheck-title-padding', padding);
      }
      return;
    }

    if (enhancedSection) {
      this._ensureEnhancedHighlightStyles();
      element.classList.add('factcheck-section-highlight');
      element.style.setProperty('--factcheck-section-bg', `linear-gradient(145deg, ${this._withAlpha(baseBackground, 0.5)} 0%, ${this._withAlpha(baseBackground, 0.28)} 100%)`);
      element.style.setProperty('--factcheck-section-border', this._withAlpha(baseBorder, 0.48));
      element.style.setProperty('--factcheck-section-accent', this._withAlpha(accent, 0.42));
      element.style.setProperty('--factcheck-section-shadow', this._withAlpha(baseBorder, 0.15));
      if (padding) {
        element.style.setProperty('--factcheck-section-padding', padding);
      }
      return;
    }

    element.style.backgroundColor = baseBackground;
    element.style.border = `1px solid ${this._withAlpha(baseBorder, 0.65)}`;
    element.style.boxShadow = `0 4px 12px ${this._withAlpha(baseBorder, 0.12)}`;
    
    if (padding) {
      element.style.padding = padding;
    }

    if (borderRadius) {
      element.style.borderRadius = borderRadius;
    }
  }

  _ensureEnhancedHighlightStyles() {
    if (document.getElementById('factcheck-title-highlight-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'factcheck-title-highlight-style';
    style.textContent = `
      .factcheck-title-highlight {
        position: relative;
        display: inline-block;
        width: 100%;
        padding: var(--factcheck-title-padding, 18px 24px 18px 52px);
        margin: 6px 0 12px;
        border-radius: 20px;
        background: var(--factcheck-title-bg, rgba(18, 18, 18, 0.04));
        border: 1px solid var(--factcheck-title-border, rgba(18, 18, 18, 0.2));
        box-shadow: 0 14px 26px var(--factcheck-title-shadow, rgba(8, 8, 8, 0.18));
        box-sizing: border-box;
        line-height: 1.45;
        overflow: hidden;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
        backdrop-filter: blur(2px);
      }

      .factcheck-title-highlight::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: radial-gradient(circle at top left, rgba(255, 255, 255, 0.18), transparent 55%);
        pointer-events: none;
        opacity: 0.7;
      }

      .factcheck-title-highlight::after {
        content: '';
        position: absolute;
        top: 14px;
        bottom: 14px;
        left: 18px;
        width: 5px;
        border-radius: 999px;
        background: var(--factcheck-title-accent, rgba(255, 255, 255, 0.35));
        box-shadow: 0 0 18px var(--factcheck-title-accent, rgba(255, 255, 255, 0.25));
        pointer-events: none;
      }

      @media (max-width: 768px) {
        .factcheck-title-highlight {
          padding: var(--factcheck-title-padding, 16px 20px 16px 46px);
        }
      }

      .factcheck-section-highlight {
        position: relative;
        display: block;
        width: 100%;
        padding: var(--factcheck-section-padding, 18px 22px 18px 30px);
        margin: 12px 0;
        border-radius: 18px;
        background: var(--factcheck-section-bg, rgba(18, 18, 18, 0.035));
        border: 1px solid var(--factcheck-section-border, rgba(18, 18, 18, 0.16));
        box-shadow: 0 12px 24px var(--factcheck-section-shadow, rgba(0, 0, 0, 0.12));
        box-sizing: border-box;
        line-height: 1.75;
        overflow: hidden;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
        backdrop-filter: blur(1px);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      .factcheck-section-highlight::before {
        content: '';
        position: absolute;
        inset: 10px;
        border-radius: inherit;
        border: 1px solid rgba(255, 255, 255, 0.12);
        pointer-events: none;
      }

      .factcheck-section-highlight::after {
        content: '';
        position: absolute;
        top: 14px;
        bottom: 14px;
        left: 16px;
        width: 4px;
        border-radius: 999px;
        background: var(--factcheck-section-accent, rgba(255, 255, 255, 0.32));
        box-shadow: 0 0 14px var(--factcheck-section-accent, rgba(255, 255, 255, 0.22));
        pointer-events: none;
      }

      .factcheck-section-highlight:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 28px rgba(0, 0, 0, 0.18);
      }

      @media (max-width: 768px) {
        .factcheck-section-highlight {
          padding: var(--factcheck-section-padding, 16px 18px 16px 26px);
        }
      }
    `;

    document.head.appendChild(style);
  }

  _withAlpha(color, alpha = 1) {
    if (!color) {
      return `rgba(0, 0, 0, ${alpha})`;
    }

    const rgbaMatch = color.match(/rgba?\(([^)]+)\)/i);
    if (rgbaMatch) {
      const parts = rgbaMatch[1].split(',').map(part => parseFloat(part.trim()));
      if (parts.length >= 3) {
        const [r, g, b] = parts;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }

    if (color.startsWith('#')) {
      let hex = color.replace('#', '');
      if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
      }
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return color;
  }
}

// 전역에 등록
if (typeof window !== 'undefined') {
  window.NaverNewsParser = NaverNewsParser;
}
