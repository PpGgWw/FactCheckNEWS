/**
 * 다음 뉴스 파서 모듈
 * 다음 뉴스 페이지에서 제목, 본문, 저자/언론사, 작성일, 요약, 사진 설명 등의 데이터를 추출하고 하이라이트를 적용합니다.
 * 
 * Python 크롤러 로직을 JavaScript로 변환하여 구현
 */

class DaumNewsParser {
  constructor() {
    this.siteName = 'daum';
    this.siteDisplayName = '다음 뉴스';
  }

  /**
   * 현재 URL이 다음 뉴스 페이지인지 확인
   * 메인 페이지(news.daum.net)는 제외하고 실제 기사 페이지만 대상으로 함
   */
  canParse(url) {
    // 메인 페이지 제외 (정확히 news.daum.net/ 또는 news.daum.net으로 끝나는 경우)
    const isMainPage = /^https?:\/\/news\.daum\.net\/?(\?.*)?$/.test(url);
    if (isMainPage) {
      return false;
    }
    
    // 실제 뉴스 기사 URL 패턴 확인
    return url.includes('v.daum.net/v/') || 
           url.includes('news.v.daum.net/') || 
           url.includes('news.daum.net/breakingnews/') ||
           url.includes('news.daum.net/cluster/');
  }

  /**
   * 다음 뉴스 데이터 추출
   * @param {Object} colorScheme - 하이라이트 색상 스킴 {background, border}
   * @returns {Array} 추출된 데이터 배열 [{type, text}, ...]
   */
  extractNewsData(colorScheme) {
    console.log(`${this.siteDisplayName} 데이터 추출 시작`);
    const extractedData = [];

    // 1. 제목 추출 및 하이라이트
    let titleElement = document.querySelector('h3.tit_view');
    if (!titleElement) {
      titleElement = document.querySelector('h2.tit_head');
    }

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
        console.log(`${this.siteDisplayName} 제목 수집 성공`);
      }
    } else {
      console.log(`${this.siteDisplayName} 제목을 찾지 못했습니다.`);
    }

    // 2. 언론사 또는 저자 추출 및 하이라이트
    const pressElement = document.querySelector('a#kakaoServiceLogo');
    if (pressElement) {
      // 하이라이트 적용
      this._applyHighlight(pressElement, colorScheme, {
        padding: '3px',
        borderRadius: '3px'
      });

      const pressText = pressElement.textContent?.trim();
      if (pressText) {
        extractedData.push({ type: '언론사', text: pressText });
        console.log(`${this.siteDisplayName} 언론사 수집 성공`);
      }
    } else {
      // Fallback: meta 태그에서 저자(author) 정보 찾기
      const authorMeta = document.querySelector('meta[property="og:article:author"]');
      if (authorMeta) {
        const authorText = authorMeta.getAttribute('content');
        if (authorText) {
          extractedData.push({ type: '저자', text: authorText });
          console.log(`${this.siteDisplayName} 저자(작성자) 수집 성공`);
        }
      } else {
        console.log(`${this.siteDisplayName} 언론사 또는 저자를 찾지 못했습니다.`);
      }
    }

    // 3. 작성일시 추출
    let dateElement = document.querySelector('span.num_date');
    let dateText = null;

    if (dateElement) {
      dateText = dateElement.textContent?.trim();
    } else {
      // Fallback: meta 태그에서 날짜 정보 추출
      const dateMeta = document.querySelector('meta[property="og:regDate"]');
      if (dateMeta) {
        const dateContent = dateMeta.getAttribute('content'); // 예: "20251007070002"
        if (dateContent && dateContent.length >= 12) {
          // 사람이 읽기 좋은 형태로 포맷팅
          const year = dateContent.substring(0, 4);
          const month = dateContent.substring(4, 6);
          const day = dateContent.substring(6, 8);
          const hour = dateContent.substring(8, 10);
          const minute = dateContent.substring(10, 12);
          dateText = `${year}.${month}.${day}. ${hour}:${minute}`;
        }
      }
    }

    if (dateText) {
      extractedData.push({ type: '작성일자', text: dateText });
      console.log(`${this.siteDisplayName} 작성일시 수집 성공`);
    } else {
      console.log(`${this.siteDisplayName} 작성일시를 찾지 못했습니다.`);
    }

    // 4. 요약 추출 및 하이라이트
    let summaryElement = document.querySelector('strong.summary_view');
    let summaryText = null;

    if (summaryElement) {
      // 하이라이트 적용
      this._applyHighlight(summaryElement, colorScheme, {
        padding: '8px',
        borderRadius: '5px'
      });

      summaryText = summaryElement.textContent?.trim();
    } else {
      // Fallback: meta 태그에서 요약 정보 추출
      const summaryMeta = document.querySelector('meta[name="description"]');
      if (summaryMeta) {
        summaryText = summaryMeta.getAttribute('content');
      }
    }

    if (summaryText) {
      extractedData.push({ type: '요약', text: summaryText });
      console.log(`${this.siteDisplayName} 요약 수집 성공`);
    } else {
      console.log(`${this.siteDisplayName} 요약을 찾지 못했습니다. (해당 기사에 요약이 없을 수 있습니다)`);
    }

    // 5. 본문 및 사진 설명 추출
    let bodyContainer = document.querySelector('div.article_view');
    if (!bodyContainer) {
      bodyContainer = document.querySelector('#articleBody');
    }

    if (bodyContainer) {
      let processedCount = 0;
      
      // 다음 뉴스는 dmcf-ptype 속성을 사용하여 본문, 사진, 부제목 등을 구분
      const contentBlocks = bodyContainer.querySelectorAll('[dmcf-ptype]');
      
      contentBlocks.forEach(block => {
        const ptype = block.getAttribute('dmcf-ptype');

        // 사진(figure) 처리
        if (ptype === 'figure') {
          const caption = block.querySelector('figcaption.txt_caption');
          if (caption) {
            // 하이라이트 적용
            this._applyHighlight(caption, colorScheme, {
              padding: '5px',
              borderRadius: '3px'
            });

            const captionText = caption.textContent?.trim();
            if (captionText) {
              extractedData.push({ type: '사진', text: captionText });
              processedCount++;
            }
          }
        }
        // 본문(general, h3, blockquote 등) 처리
        // 버튼과 같이 불필요한 유형은 제외
        else if (ptype !== 'button') {
          // 하이라이트 적용
          this._applyHighlight(block, colorScheme, {
            enhancedSection: true,
            padding: '10px'
          });

          const bodyText = block.textContent?.trim();
          if (bodyText) {
            extractedData.push({ type: '내용', text: bodyText });
            processedCount++;
          }
        }
      });

      if (processedCount > 0) {
        console.log(`${this.siteDisplayName} 본문 및 사진설명(${processedCount}개 문단/사진) 수집 성공`);
      } else {
        console.log(`${this.siteDisplayName} 본문을 찾지 못했습니다. (기사 구조가 예상과 다를 수 있습니다)`);
      }
    } else {
      console.log(`${this.siteDisplayName} 본문 영역(div.article_view 또는 #articleBody)을 찾지 못했습니다.`);
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
    let titleElement = document.querySelector('h3.tit_view');
    if (!titleElement) {
      titleElement = document.querySelector('h2.tit_head');
    }
    
    if (titleElement) {
      this._applyHighlight(titleElement, colorScheme, {
        enhancedTitle: true,
        padding: '20px 28px 20px 58px'
      });
      elementsUpdated++;
    }

    // 언론사 색상 변경
    const pressElement = document.querySelector('a#kakaoServiceLogo');
    if (pressElement) {
      this._applyHighlight(pressElement, colorScheme, {
        padding: '3px',
        borderRadius: '3px'
      });
      elementsUpdated++;
    }

    // 요약 색상 변경
    const summaryElement = document.querySelector('strong.summary_view');
    if (summaryElement) {
      this._applyHighlight(summaryElement, colorScheme, {
        padding: '8px',
        borderRadius: '5px'
      });
      elementsUpdated++;
    }

    // 본문 및 사진 색상 변경
    let bodyContainer = document.querySelector('div.article_view');
    if (!bodyContainer) {
      bodyContainer = document.querySelector('#articleBody');
    }

    if (bodyContainer) {
      const contentBlocks = bodyContainer.querySelectorAll('[dmcf-ptype]');
      
      contentBlocks.forEach(block => {
        const ptype = block.getAttribute('dmcf-ptype');

        if (ptype === 'figure') {
          const caption = block.querySelector('figcaption.txt_caption');
          if (caption) {
            this._applyHighlight(caption, colorScheme, {
              padding: '5px',
              borderRadius: '3px'
            });
            elementsUpdated++;
          }
        } else if (ptype !== 'button') {
          this._applyHighlight(block, colorScheme, {
            enhancedSection: true,
            padding: '10px'
          });
          elementsUpdated++;
        }
      });
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

    let bodyContainer = document.querySelector('div.article_view');
    if (!bodyContainer) {
      bodyContainer = document.querySelector('#articleBody');
    }

    if (bodyContainer) {
      const contentBlocks = bodyContainer.querySelectorAll('[dmcf-ptype]');
      
      contentBlocks.forEach(block => {
        const ptype = block.getAttribute('dmcf-ptype');
        
        // 본문 요소에만 적용
        if (ptype !== 'button' && ptype !== 'figure') {
          suspiciousSentences.forEach(sentence => {
            if (!sentence || sentence.trim() === '') return;
            
            const cleanSentence = sentence.trim();
            const textContent = block.innerHTML;
            
            if (textContent.includes(cleanSentence)) {
              const highlightedText = textContent.replace(
                new RegExp(cleanSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                `<mark style="background-color: #ffeb3b; padding: 2px 4px; border-radius: 3px;">${cleanSentence}</mark>`
              );
              block.innerHTML = highlightedText;
            }
          });
        }
      });
    }
  }

  /**
   * 하이라이트 스타일 적용 헬퍼 함수
   * @private
   */
  _applyHighlight(element, colorScheme, styles = {}) {
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
      element.style.setProperty('--factcheck-title-bg', `linear-gradient(135deg, ${this._withAlpha(baseBackground, 0.95)} 0%, ${this._withAlpha(baseBackground, 0.72)} 100%)`);
      element.style.setProperty('--factcheck-title-border', this._withAlpha(baseBorder, 0.95));
      element.style.setProperty('--factcheck-title-accent', this._withAlpha(accent, 0.9));
      element.style.setProperty('--factcheck-title-shadow', this._withAlpha(baseBorder, 0.32));
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
    element.style.border = `2px solid ${baseBorder}`;
    
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
        background: var(--factcheck-title-bg, rgba(18, 18, 18, 0.08));
        border: 1.5px solid var(--factcheck-title-border, rgba(18, 18, 18, 0.35));
        box-shadow: 0 20px 46px var(--factcheck-title-shadow, rgba(8, 8, 8, 0.32));
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
        background: radial-gradient(circle at top left, rgba(255, 255, 255, 0.28), transparent 55%);
        pointer-events: none;
        opacity: 0.8;
      }

      .factcheck-title-highlight::after {
        content: '';
        position: absolute;
        top: 14px;
        bottom: 14px;
        left: 18px;
        width: 5px;
        border-radius: 999px;
        background: var(--factcheck-title-accent, rgba(255, 255, 255, 0.5));
        box-shadow: 0 0 22px var(--factcheck-title-accent, rgba(255, 255, 255, 0.35));
        pointer-events: none;
      }

      @media (max-width: 768px) {
        .factcheck-title-highlight {
          padding: var(--factcheck-title-padding, 16px 20px 16px 46px);
        }
      }

      /* Section Highlight Styles */
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
  window.DaumNewsParser = DaumNewsParser;
}
