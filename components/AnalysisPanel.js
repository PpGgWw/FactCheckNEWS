// AnalysisPanel.js - 뉴스 분석 패널 컴포넌트 (리팩토링됨)

class AnalysisPanel {
  constructor() {
    this.panelId = 'news-analysis-panel';
    this.newsBlocks = new Map(); // 분석된 뉴스 블록들을 관리하는 Map
    this.currentNews = null; // 현재 페이지의 뉴스
    this.blockIdCounter = 0; // 고유 ID 생성용
    this.streamingResults = new Map(); // 실시간 스트리밍 결과 저장
    
    // 실시간 타이핑 효과 관련 속성
    this.typingSpeed = 30; // 타이핑 속도 (ms)
    this.currentTypingIntervals = new Map(); // 현재 타이핑 중인 인터벌들
    this.analysisSteps = ['분석진행', '진위', '근거', '분석', '요약']; // 분석 단계
    
    // 저장된 뉴스 블록 데이터 로드
    this.loadSavedNewsBlocks();
  }

  // 메인 패널 생성
  create() {
    const existingPanel = document.getElementById(this.panelId);
    if (existingPanel) {
      return existingPanel;
    }

    const panelContainer = document.createElement('div');
    panelContainer.id = this.panelId;
    panelContainer.className = 'analysis-panel-base';
    
    // 반응형 스타일 적용
    const isMobile = window.innerWidth <= 768;
    panelContainer.style.cssText = `
      position: fixed;
      ${isMobile ? `
        bottom: 0;
        right: 0;
        left: 0;
        width: 100%;
        height: 70vh;
        border-radius: 20px 20px 0 0;
      ` : `
        bottom: 20px;
        right: 20px;
        width: 560px;
        height: 980px;
        border-radius: 20px;
      `}
      background: #FAFAFA;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(191, 151, 128, 0.1);
      z-index: 2147483646;
      border: 1px solid rgba(191, 151, 128, 0.3);
      transform: ${isMobile ? 'translateY(100%)' : 'translateX(120%)'};
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      backdrop-filter: blur(10px);
    `;
    
    document.body.appendChild(panelContainer);
    
    // 반응형 리사이즈 이벤트 추가
    this.addResponsiveListener(panelContainer);
    
    // 초기 컨텐츠 렌더링
    this.renderPanel(panelContainer);
    
    // 부드러운 애니메이션 시작
    requestAnimationFrame(() => {
      panelContainer.style.transform = 'translateX(0) translateY(0)';
      panelContainer.style.opacity = '1';
    });
    
    return panelContainer;
  }

  // 반응형 리사이즈 리스너 추가
  addResponsiveListener(panelContainer) {
    const resizeHandler = () => {
      const isMobile = window.innerWidth <= 768;
      
      if (isMobile) {
        panelContainer.style.cssText = panelContainer.style.cssText.replace(
          /bottom: 20px; right: 20px; width: 560px; height: 980px; border-radius: 20px;/,
          'bottom: 0; right: 0; left: 0; width: 100%; height: 70vh; border-radius: 20px 20px 0 0;'
        );
      } else {
        panelContainer.style.cssText = panelContainer.style.cssText.replace(
          /bottom: 0; right: 0; left: 0; width: 100%; height: 70vh; border-radius: 20px 20px 0 0;/,
          'bottom: 20px; right: 20px; width: 560px; height: 980px; border-radius: 20px;'
        );
      }
    };
    
    window.addEventListener('resize', resizeHandler);
    
    // 패널이 제거될 때 리스너도 제거
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (node === panelContainer) {
            window.removeEventListener('resize', resizeHandler);
            observer.disconnect();
          }
        });
      });
    });
    
    observer.observe(document.body, { childList: true });
  }

  // 패널 전체 렌더링
  renderPanel(panel) {
    // CSS 애니메이션 스타일 추가
    if (!document.getElementById('analysis-panel-styles')) {
      const style = document.createElement('style');
      style.id = 'analysis-panel-styles';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    
    panel.innerHTML = `
      ${this.renderHeader()}
      
      <!-- 현재 뉴스 블록 (고정) -->
      <div id="current-news-section" style="
        padding: 20px;
        background: linear-gradient(to bottom, #FAFAFA, #F5F5F5);
        border-bottom: 1px solid rgba(229, 229, 229, 0.8);
        flex-shrink: 0;
      ">
        <div style="display: flex; align-items: center; justify-content: between; margin-bottom: 16px;">
          <h3 style="
            font-size: 16px;
            font-weight: 600;
            color: #1A1A1A;
            margin: 0;
          ">
            현재 페이지
          </h3>
        </div>
        <div id="current-news-container" style="
          background: #FFFFFF;
          border-radius: 12px;
          border: 1px solid rgba(229, 229, 229, 0.6);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          overflow: hidden;
        ">
          ${this.renderCurrentNews()}
        </div>
      </div>
      
      <!-- 분석된 뉴스 리스트 (스크롤) -->
      <div style="
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: #FAFAFA;
      ">
        <div style="
          padding: 20px 20px 12px 20px;
          flex-shrink: 0;
          background: linear-gradient(to bottom, #FAFAFA, rgba(250, 250, 250, 0.95));
          border-bottom: 1px solid rgba(229, 229, 229, 0.3);
        ">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <h3 style="
              font-size: 16px;
              font-weight: 600;
              color: #1A1A1A;
              margin: 0;
            ">
              분석 기록
            </h3>
            <span id="analysis-count" style="
              background: #F2CEA2;
              color: #1A1A1A;
              padding: 4px 8px;
              border-radius: 12px;
              font-size: 12px;
              font-weight: 600;
              min-width: 20px;
              text-align: center;
            ">${this.newsBlocks.size}</span>
          </div>
        </div>
        <div style="
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 16px 20px 20px 20px;
          background: #FAFAFA;
        ">
          <div id="analyzed-news-container" style="
            display: flex; 
            flex-direction: column; 
            gap: 16px;
            width: 100%;
          ">
            ${this.renderAnalyzedNews()}
          </div>
        </div>
      </div>
    `;
    
    // panel에 AnalysisPanel 인스턴스 저장
    panel.__analysisPanel = this;
    
    this.attachEvents(panel);
  }

  // 헤더 렌더링
  renderHeader() {
    return `
      <div style="
        background: linear-gradient(135deg, #F2CEA2 0%, #BF9780 100%);
        padding: 20px;
        border-bottom: none;
        border-radius: 20px 20px 0 0;
        flex-shrink: 0;
        position: relative;
        overflow: hidden;
      ">
        <!-- Background Pattern -->
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 1px, transparent 1px),
                           radial-gradient(circle at 80% 50%, rgba(255,255,255,0.1) 1px, transparent 1px);
          background-size: 50px 50px;
          pointer-events: none;
        "></div>
        
        <div style="position: relative; z-index: 1;">
          <div style="display: flex; align-items: center; justify-content: between; margin-bottom: 8px;">
            <div style="flex: 1;">
              <h2 style="
                font-size: 20px;
                font-weight: 700;
                color: #1A1A1A;
                margin: 0 0 4px 0;
                letter-spacing: -0.5px;
              ">뉴스 팩트체크</h2>
              <p style="
                font-size: 13px;
                color: rgba(26, 26, 26, 0.7);
                margin: 0;
                font-weight: 500;
              ">AI 기반 실시간 신뢰도 검증</p>
            </div>
            
            <div style="display: flex; align-items: center; gap: 8px;">
              <!-- Status Indicator -->
              <div style="display: flex; align-items: center; gap: 6px; margin-right: 8px;">
                <div style="
                  width: 8px;
                  height: 8px;
                  background: #10B981;
                  border-radius: 50%;
                  animation: pulse 2s infinite;
                "></div>
                <span style="
                  font-size: 11px;
                  color: rgba(26, 26, 26, 0.6);
                  font-weight: 500;
                ">연결됨</span>
              </div>
              
              <!-- Action Buttons -->
              <button id="Settings" style="
                width: 36px;
                height: 36px;
                background: rgba(255, 255, 255, 0.15);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 16px;
                backdrop-filter: blur(10px);
              " onmouseover="this.style.background='rgba(255, 255, 255, 0.25)'; this.style.transform='scale(1.05)';" 
                 onmouseout="this.style.background='rgba(255, 255, 255, 0.15)'; this.style.transform='scale(1)';">⚙️</button>
              
              <button id="close-panel" style="
                width: 36px;
                height: 36px;
                background: rgba(255, 255, 255, 0.15);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 18px;
                font-weight: 300;
                backdrop-filter: blur(10px);
              " onmouseover="this.style.background='rgba(239, 68, 68, 0.2)'; this.style.transform='scale(1.05)';" 
                 onmouseout="this.style.background='rgba(255, 255, 255, 0.15)'; this.style.transform='scale(1)';">&times;</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 빈 상태 렌더링
  renderEmptyState() {
    return `
      <div style="
        text-align: center; 
        padding: 40px 20px;
        background: #FFFFFF;
        border-radius: 12px;
        border: 1px solid rgba(229, 229, 229, 0.6);
      ">
        <div style="
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #F2CEA2, #BF9780);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          box-shadow: 0 4px 12px rgba(242, 206, 162, 0.3);
        ">
          <span style="font-size: 24px;">📰</span>
        </div>
        <h4 style="
          font-size: 16px;
          font-weight: 600;
          color: #1A1A1A;
          margin: 0 0 8px 0;
        ">분석할 뉴스가 없습니다</h4>
        <p style="
          font-size: 13px;
          color: #6B6B6B;
          margin: 0;
          line-height: 1.4;
        ">뉴스 기사를 선택하면<br>자동으로 분석을 시작합니다</p>
      </div>
    `;
  }

  // 현재 뉴스 렌더링
  renderCurrentNews() {
    if (!this.currentNews) {
      return `
        <div style="
          text-align: center; 
          padding: 24px 16px;
          color: #6B6B6B;
        ">
          <p style="
            font-size: 14px;
            margin: 0;
            line-height: 1.4;
          ">현재 페이지에서<br>뉴스를 찾을 수 없습니다</p>
        </div>
      `;
    }
    
    return this.renderNewsBlock(this.currentNews, true);
  }

  // 분석된 뉴스들 렌더링
  renderAnalyzedNews() {
    if (this.newsBlocks.size === 0) {
      return `
        <div style="
          text-align: center; 
          padding: 32px 16px;
          background: #FFFFFF;
          border-radius: 12px;
          border: 1px solid rgba(229, 229, 229, 0.4);
        ">
          <p style="
            font-size: 14px;
            color: #6B6B6B;
            margin: 0;
            line-height: 1.4;
          ">아직 분석된 뉴스가 없습니다<br><span style='font-size: 12px; color: #9CA3AF;'>뉴스를 선택하여 분석을 시작하세요</span></p>
        </div>
      `;
    }
    
    return Array.from(this.newsBlocks.values())
      .sort((a, b) => b.timestamp - a.timestamp) // 최신 뉴스가 맨 위로
      .map(block => this.renderNewsBlock(block, false))
      .join('');
  }

  // 뉴스 블록들 렌더링
  renderNewsBlocks() {
    return Array.from(this.newsBlocks.values())
      .sort((a, b) => b.timestamp - a.timestamp) // 최신 뉴스가 맨 위로
      .map(block => this.renderNewsBlock(block))
      .join('');
  }

  // 개별 뉴스 블록 렌더링
  renderNewsBlock(block, isCurrent = false) {
    const { id, title, url, status, result, progress } = block;
    
    let actionButtons = '';
    
    if (isCurrent) {
      // 현재 뉴스의 경우
      switch (status) {
        case 'pending':
          actionButtons = `
            <button class="analyze-current-btn" data-id="${id}" style="
              background: #F2CEA2;
              color: #0D0D0D;
              padding: 6px 16px;
              border-radius: 4px;
              font-size: 14px;
              border: none;
              cursor: pointer;
              transition: all 0.2s;
              width: 100%;
            " onmouseover="this.style.background='#BF9780'" onmouseout="this.style.background='#F2CEA2'">분석하기</button>
          `;
          break;
        case 'analyzing':
          actionButtons = `
            <div style="
              background: linear-gradient(135deg, #F2CEA2, #BF9780);
              color: #1A1A1A;
              padding: 8px 12px;
              border-radius: 6px;
              font-size: 11px;
              width: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 36px;
              font-weight: 500;
            ">
              <div style="
                width: 12px;
                height: 12px;
                border: 2px solid #1A1A1A;
                border-top: 2px solid transparent;
                border-radius: 50%;
                margin-right: 6px;
                animation: spin 1s linear infinite;
                flex-shrink: 0;
              "></div>
              <span style="
                line-height: 1.2;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              ">${this.getTransparentProgress(progress)}</span>
            </div>
          `;
          break;
        case 'completed':
        case 'error':
          actionButtons = `
            <button class="analyze-current-btn" data-id="${id}" style="
              background: #F2CEA2;
              color: #0D0D0D;
              padding: 6px 16px;
              border-radius: 4px;
              font-size: 14px;
              border: none;
              cursor: pointer;
              transition: all 0.2s;
              width: 100%;
            " onmouseover="this.style.background='#BF9780'" onmouseout="this.style.background='#F2CEA2'">다시 분석</button>
          `;
          break;
      }
    } else {
      // 분석된 뉴스 리스트의 경우
      if (status === 'analyzing') {
        // 분석 중일 때는 투명한 진행상황을 삭제 버튼 위치에 표시
        actionButtons = `
          <div style="
            background: linear-gradient(135deg, #F2CEA2, #BF9780);
            color: #1A1A1A;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 10px;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 36px;
            font-weight: 500;
          ">
            <div style="
              width: 12px;
              height: 12px;
              border: 2px solid #1A1A1A;
              border-top: 2px solid transparent;
              border-radius: 50%;
              margin-right: 6px;
              animation: spin 1s linear infinite;
              flex-shrink: 0;
            "></div>
            <span style="
              line-height: 1.2;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            ">${this.getTransparentProgress(progress)}</span>
          </div>
        `;
      } else {
        // 분석 완료 또는 기타 상태일 때는 삭제 버튼과 비교하기 버튼 표시
        const isCompareMode = block.compareMode || false;
        const compareButtonText = isCompareMode ? '취소' : '비교';
        const compareButtonStyle = isCompareMode ? 
          'background: #6B7280; color: #F2F2F2;' : 
          'background: #F2CEA2; color: #1A1A1A;';
        
        actionButtons = `
          <div style="display: flex; gap: 8px;">
            <button class="delete-btn" data-id="${id}" style="
              background: #dc2626;
              color: #F2F2F2;
              padding: 6px 16px;
              border-radius: 4px;
              font-size: 14px;
              border: none;
              cursor: pointer;
              transition: opacity 0.2s;
              flex: 1;
            " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">삭제</button>
            <button class="compare-btn" data-id="${id}" style="
              ${compareButtonStyle}
              padding: 6px 16px;
              border-radius: 4px;
              font-size: 14px;
              border: none;
              cursor: pointer;
              transition: opacity 0.2s;
              flex: 1;
            " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">${compareButtonText}</button>
          </div>
        `;
      }
    }
    
    const isCompareMode = block.compareMode || false;
    const isClickable = status === 'completed' && !isCompareMode;
    const cursorStyle = isClickable ? 'cursor: pointer;' : '';
    const hoverStyle = isClickable ? 'onmouseover="this.style.background=\'#F2CEA2\'" onmouseout="this.style.background=\'#F2F2F2\'"' : '';
    
    // 비교 모드일 때 어두운 스타일 적용 (pointer-events는 제거하여 버튼 클릭 가능하도록)
    const blockBackground = isCompareMode ? '#E5E5E5' : '#F2F2F2';
    const blockOpacity = isCompareMode ? '0.7' : '1';
    
    return `
      <div class="news-block" data-id="${id}" style="
        border: 1px solid #BF9780;
        border-radius: 8px;
        background: ${blockBackground};
        opacity: ${blockOpacity};
        transition: all 0.3s ease;
        width: 100%;
        overflow: hidden;
      ">
        <!-- 뉴스 내용 영역 -->
        <div class="news-content-area" data-id="${id}" style="
          padding: 12px;
          ${cursorStyle}
          ${isCompareMode ? 'pointer-events: none;' : ''}
        " ${isClickable ? hoverStyle : ''}>
          ${block.isComparison ? `
          <div style="
            background: #F2CEA2;
            color: #1A1A1A;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            margin-bottom: 6px;
            display: inline-block;
          ">비교분석</div>
          ` : ''}
          <h3 style="
            color: #0D0D0D;
            font-weight: 500;
            font-size: 14px;
            margin-bottom: 4px;
            line-height: 1.4;
            word-break: break-word;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            width: 100%;
          ">${this.escapeHtml(title)}</h3>
          <div style="
            color: #737373;
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            width: 100%;
          ">${this.escapeHtml(url)}</div>
        </div>
        
        <!-- 분석 중일 때만 표시되는 타이핑 영역 -->
        ${status === 'analyzing' ? `
        <div id="typing-area-${id}" style="
          border-top: 1px solid #E5E5E5;
          padding: 12px;
          background: #FFFFFF;
          height: 72px;
          overflow: hidden;
          transition: all 0.3s ease;
        ">
          <div style="
            font-size: 12px;
            color: #6B6B6B;
            margin-bottom: 8px;
            font-weight: 500;
          ">실시간 분석 결과</div>
          <div id="typing-content-${id}" style="
            font-size: 11px;
            line-height: 1.4;
            color: #1A1A1A;
            word-wrap: break-word;
            height: 44px;
            overflow-y: auto;
            overflow-x: hidden;
            border: 1px solid #E5E5E5;
            border-radius: 4px;
            padding: 6px;
            background: #FAFAFA;
            scrollbar-width: thin;
            scrollbar-color: #BF9780 #F0F0F0;
          " onscroll="this.setAttribute('data-user-scrolled', this.scrollTop < this.scrollHeight - this.offsetHeight ? 'true' : 'false')">분석을 시작합니다...</div>
        </div>
        ` : ''}
        
        <!-- 상태 표시 또는 버튼 영역 -->
        <div style="
          border-top: 1px solid #BF9780;
          padding: 8px 12px;
          background: rgba(191, 151, 128, 0.1);
        ">
          <div style="
            display: flex;
            gap: 8px;
            width: 100%;
          ">
            ${actionButtons}
          </div>
        </div>
      </div>
    `;
  }

  // HTML 이스케이프
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 간단한 마크다운 렌더링
  renderMarkdown(text) {
    if (!text) return '';
    
    let html = this.escapeHtml(text);
    
    // 마크다운 변환
    html = html
      // 제목 (## 제목)
      .replace(/^## (.+)$/gm, '<h2 style="color: #0D0D0D; font-weight: 600; font-size: 16px; margin: 12px 0 6px 0; border-bottom: 1px solid #BF9780; padding-bottom: 4px;">$1</h2>')
      // 강조 (**텍스트**)
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color: #BF9780; font-weight: 600;">$1</strong>')
      // 숫자 리스트 (1. 항목, 2. 항목)
      .replace(/^(\d+)\.\s*(.+)$/gm, '<li style="margin: 6px 0; padding-left: 8px; list-style: decimal;">$2</li>')
      // 일반 리스트 (- 항목)
      .replace(/^-\s*(.+)$/gm, '<li style="margin: 4px 0; padding-left: 8px; list-style: disc;">$1</li>')
      // 인용 (> 텍스트)
      .replace(/^>\s*(.+)$/gm, '<blockquote style="border-left: 3px solid #BF9780; margin: 8px 0; padding: 8px 12px; background: #F9F9F9; font-style: italic;">$1</blockquote>')
      // 줄바꿈을 임시로 처리
      .replace(/\n/g, '|||NEWLINE|||');
    
    // 연속된 li 태그를 ol/ul로 감싸기 (숫자 리스트 우선)
    html = html.replace(/(<li[^>]*list-style: decimal;[^>]*>.*?<\/li>(?:\s*\|\|\|NEWLINE\|\|\|\s*<li[^>]*list-style: decimal;[^>]*>.*?<\/li>)*)/gs, 
      '<ol style="margin: 8px 0; padding-left: 20px; counter-reset: item;">$1</ol>');
    
    // 일반 리스트 처리
    html = html.replace(/(<li[^>]*list-style: disc;[^>]*>.*?<\/li>(?:\s*\|\|\|NEWLINE\|\|\|\s*<li[^>]*list-style: disc;[^>]*>.*?<\/li>)*)/gs, 
      '<ul style="margin: 8px 0; padding-left: 20px;">$1</ul>');
    
    // ol/ul 내부의 NEWLINE 제거
    html = html.replace(/(<[ou]l[^>]*>.*?)\|\|\|NEWLINE\|\|\|(?=\s*<li)/gs, '$1');
    html = html.replace(/(<\/li>)\s*\|\|\|NEWLINE\|\|\|/g, '$1');
    
    // 남은 NEWLINE을 br 태그로 변환
    html = html.replace(/\|\|\|NEWLINE\|\|\|/g, '<br>');
    
    return html;
  }

  // 분석 기록용 투명한 진행상황 텍스트 생성
  getTransparentProgress(progress) {
    if (!progress) return '분석 중...';
    
    // 투명하고 구체적인 진행상황 표시
    const progressMap = {
      'API': '🔑 API 인증 중',
      '준비': '📋 요청 준비 중', 
      '전송': '📤 AI에 전송 중',
      '분석': '🤖 AI 분석 중',
      '진위': '✅ 진위 판정 중',
      '근거': '📊 근거 수집 중',
      '의견': '📝 분석 완료 중'
    };
    
    for (const [key, value] of Object.entries(progressMap)) {
      if (progress.includes(key)) {
        return value;
      }
    }
    
    return progress;
  }

  // 블록 내부 타이핑 영역 업데이트
  updateBlockTypingArea(blockId, newText) {
    const typingContent = document.getElementById(`typing-content-${blockId}`);
    if (!typingContent) return;

    // 처음 타이핑이 시작되면 "분석을 시작합니다..." 텍스트 제거
    if (typingContent.textContent === '분석을 시작합니다...') {
      typingContent.innerHTML = '';
      this.typingBuffer = this.typingBuffer || new Map();
      this.typingBuffer.set(blockId, '');
      // 사용자 스크롤 상태 초기화
      typingContent.setAttribute('data-user-scrolled', 'false');
    }

    // 기존 누적된 텍스트에 새 텍스트 추가
    if (!this.typingBuffer) this.typingBuffer = new Map();
    const currentBuffer = this.typingBuffer.get(blockId) || '';
    const updatedBuffer = currentBuffer + newText;
    this.typingBuffer.set(blockId, updatedBuffer);
    
    // 사용자가 수동으로 스크롤했는지 확인
    const userScrolled = typingContent.getAttribute('data-user-scrolled') === 'true';
    
    // 커서와 함께 텍스트 업데이트 (일반 텍스트로, 줄바꿈은 자동)
    typingContent.innerHTML = this.escapeHtml(updatedBuffer) + '<span class="typing-cursor" style="display: inline-block; width: 1px; height: 12px; background: #BF9780; margin-left: 2px; animation: blink 1.2s infinite;"></span>';
    
    // 사용자가 수동 스크롤하지 않았으면 자동으로 맨 아래로 스크롤
    if (!userScrolled) {
      typingContent.scrollTop = typingContent.scrollHeight;
    }
  }

  // 현재 뉴스 설정
  setCurrentNews(title, url, content) {
    this.currentNews = {
      id: 'current',
      title,
      url,
      content,
      status: 'pending',
      result: null,
      progress: null,
      timestamp: Date.now()
    };
    this.updatePanel();
    return 'current';
  }

  // 새 뉴스 추가 (분석된 뉴스 리스트에 추가)
  addNews(title, url, content) {
    // URL 정규화 (쿼리 파라미터 제거)
    const normalizeUrl = (urlString) => {
      try {
        const urlObj = new URL(urlString);
        return urlObj.origin + urlObj.pathname;
      } catch {
        return urlString;
      }
    };
    
    const normalizedUrl = normalizeUrl(url);
    
    // 중복 URL 체크 (정규화된 URL로 비교)
    const existingBlock = Array.from(this.newsBlocks.values()).find(block => 
      normalizeUrl(block.url) === normalizedUrl
    );
    
    if (existingBlock) {
      console.log('이미 존재하는 뉴스입니다:', normalizedUrl);
      alert('이 뉴스는 이미 분석 목록에 있습니다.');
      return existingBlock.id;
    }
    
    const id = ++this.blockIdCounter;
    const newsData = {
      id,
      title,
      url,
      content,
      status: 'pending',
      result: null,
      progress: null,
      timestamp: Date.now()
    };
    
    this.addNewsBlock(newsData);
    return id;
  }

  // 뉴스 블록 상태 업데이트
  updateNewsStatus(id, status, result = null, progress = null, error = null) {
    console.log('updateNewsStatus 호출됨:', { id, status, result, progress, error });
    
    let block;
    if (id === 'current') {
      block = this.currentNews;
    } else {
      block = this.newsBlocks.get(id);
    }
    
    if (!block) {
      console.error('블록을 찾을 수 없음, ID:', id);
      return;
    }
    
    block.status = status;
    if (progress) block.progress = progress;
    if (result) block.result = result;
    if (error) block.error = error;
    
    // 분석된 뉴스만 저장 (현재 뉴스는 페이지별로 관리)
    if (id !== 'current') {
      this.saveNewsBlocks();
    }
    
    console.log('블록 상태 업데이트됨:', block);
    this.updatePanel();
  }

  // 뉴스 블록 삭제
  deleteNews(id) {
    this.removeNewsBlock(id);
  }

  // 패널 업데이트
  updatePanel() {
    const panel = document.getElementById(this.panelId);
    if (panel) {
      // 현재 뉴스 컨테이너 업데이트
      const currentContainer = panel.querySelector('#current-news-container');
      if (currentContainer) {
        currentContainer.innerHTML = this.renderCurrentNews();
      }
      
      // 분석된 뉴스 컨테이너 업데이트
      const analyzedContainer = panel.querySelector('#analyzed-news-container');
      if (analyzedContainer) {
        analyzedContainer.innerHTML = this.renderAnalyzedNews();
      }
      
      // 이벤트 다시 연결
      this.attachBlockEvents(panel);
    }
  }

  // 이벤트 연결
  attachEvents(panel) {
    this.attachCloseEvent(panel);
    this.attachSettingsEvent(panel);
    this.attachBlockEvents(panel);
  }

  // 블록 이벤트 연결
  attachBlockEvents(container) {
    // 현재 뉴스 분석 버튼
    container.querySelectorAll('.analyze-current-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('현재 뉴스 분석 버튼 클릭');
        this.analyzeCurrentNews();
      });
    });
    
    // 삭제 버튼
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        console.log('삭제 버튼 클릭, ID:', id);
        
        // 비교 모드가 활성화되어 있고 현재 블록이 비교 모드가 아니면 클릭 방지
        if (this.waitingForComparison && this.waitingForComparison !== id) {
          console.log('비교 모드 활성화 중 - 삭제 버튼 비활성화');
          return;
        }
        
        this.deleteNews(id);
      });
    });

    // 비교하기 버튼
    container.querySelectorAll('.compare-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        console.log('비교하기 버튼 클릭, ID:', id, 'waitingForComparison:', this.waitingForComparison);
        this.toggleCompareMode(id);
      });
    });
    
    // 뉴스 내용 영역 클릭 (완료된 것과 분석 중인 것)
    container.querySelectorAll('.news-content-area').forEach(contentArea => {
      const id = contentArea.dataset.id;
      let newsData;
      
      if (id === 'current') {
        newsData = this.currentNews;
      } else {
        newsData = this.newsBlocks.get(parseInt(id));
      }
      
      if (newsData) {
        if (newsData.status === 'completed') {
          // 완료된 뉴스 - 결과 보기 또는 비교 대상 선택
          contentArea.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('완료된 뉴스 클릭, ID:', id, 'waitingForComparison:', this.waitingForComparison);
            
            // 비교 모드 대기 중인지 확인
            if (this.waitingForComparison && parseInt(id) !== this.waitingForComparison) {
              console.log('비교 분석 실행:', this.waitingForComparison, '->', parseInt(id));
              // 비교 분석 실행
              this.createComparisonAnalysis(this.waitingForComparison, parseInt(id));
            } else {
              console.log('일반 결과 보기:', id);
              // 일반 결과 보기
              this.showAnalysisResult(id);
            }
          });
        }
        // 분석 중인 뉴스는 클릭 이벤트 없음 (타이핑 효과만 표시)
      }
    });
  }

  // 현재 뉴스 분석
  analyzeCurrentNews() {
    if (!this.currentNews) {
      alert('현재 뉴스가 없습니다.');
      return;
    }
    
    // 이미 분석 목록에 있는지 확인
    const normalizeUrl = (urlString) => {
      try {
        const urlObj = new URL(urlString);
        return urlObj.origin + urlObj.pathname;
      } catch {
        return urlString;
      }
    };
    
    const normalizedUrl = normalizeUrl(this.currentNews.url);
    const existingBlock = Array.from(this.newsBlocks.values()).find(block => 
      normalizeUrl(block.url) === normalizedUrl
    );
    
    if (existingBlock) {
      alert('이 뉴스는 이미 분석 목록에 있습니다.');
      return;
    }
    
    // 현재 뉴스를 분석 목록에 추가하고 분석 시작
    const newId = this.addNews(this.currentNews.title, this.currentNews.url, this.currentNews.content);
    this.startAnalysis(newId);
  }

  // 분석 시작
  startAnalysis(id) {
    console.log('startAnalysis 호출됨, ID:', id);
    const block = this.newsBlocks.get(id);
    if (!block) {
      console.error('블록을 찾을 수 없음, ID:', id);
      return;
    }
    
    console.log('분석할 블록:', block);
    
    this.updateNewsStatus(id, 'analyzing', null, '🔍 API 연결 및 인증 확인 중...');
    
    // API 키 확인
    setTimeout(() => {
      this.updateNewsStatus(id, 'analyzing', null, '📝 기사 내용 파싱 및 분석 준비 중...');
      
      setTimeout(() => {
        this.updateNewsStatus(id, 'analyzing', null, '🤖 Gemini AI에 팩트체킹 요청 전송 중...');
        
        setTimeout(() => {
          this.updateNewsStatus(id, 'analyzing', null, '⚡ AI가 기사의 신뢰성을 검증하고 있습니다...');
          
          // Gemini 분석 요청
          const fullPrompt = this.generateAnalysisPrompt(block.title, block.content, block.isComparison);
          
          console.log('Gemini로 분석 요청 전송, blockId:', id);
          chrome.runtime.sendMessage({
            action: "analyzeNewsWithGemini",
            prompt: fullPrompt,
            blockId: id
          });
        }, 800);
      }, 500);
    }, 300);
  }

  // 분석 프롬프트 생성
  generateAnalysisPrompt(title, content, isComparison = false) {
    const articleContent = `${title}\n${content}`;
    
    if (isComparison) {
      return this.generateComparisonPrompt(articleContent);
    }
    
    return `
## 역할
당신은 주어진 기사 텍스트의 **논리적 구조, 근거 제시 방식, 표현의 적절성**만을 분석하는 **'뉴스 텍스트 분석가'** 입니다. 당신의 유일한 임무는 아래의 '절대적 분석 원칙'과 '판단 조건'에 따라, 외부 세계의 사실이나 당신의 사전 지식과 비교하지 않고 오직 **주어진 텍스트 자체**만을 평가하는 것입니다.

---

### **[매우 중요] 절대적 분석 원칙: 외부 정보 및 사전 지식 사용 금지**
1.  **오직 텍스트만 분석:** 당신은 제공된 기사 원문 **내부의 정보만을** 분석 대상으로 삼아야 합니다.
2.  **사전 지식 금지:** 당신의 학습 데이터에 저장된 **인물, 직책, 사건, 날짜 등 어떠한 외부 정보도 판단의 근거로 사용해서는 안 됩니다.** 
3.  **내부 논리 중심 판단:** 당신의 임무는 '이 내용이 현실 세계에서 사실인가?'를 검증하는 것이 아니라, **'이 기사가 주장과 근거를 논리적으로 제시하고 있는가?'** 를 평가하는 것입니다.

## 판단 조건 및 중요도

※ **판단 원칙:** 여러 조건에 해당하는 경우, **가장 심각한 유형(가장 높은 중요도)을 기준으로 '진위'를 최종 결정**합니다.
※ **기본 판단:** 아래 조건 중 어느 것에도 해당하지 않는 경우, 해당 기사는 **'진짜 뉴스'**로 판단합니다.

#### **[중요도: 최상] → 최종 판단: 가짜뉴스**
*   **유형: 1. 사실 및 출처의 신뢰도 문제**
    *   **1-1. 기사 내 명백한 내용상 모순:** 기사의 앞부분과 뒷부분의 내용이 서로 충돌하거나 모순되는 경우.
    *   **1-2. 불분명하거나 신뢰할 수 없는 출처:** 주장의 근거를 제시하지 않거나, 의도적으로 모호하게 표현하여 권위를 부여하는 방식.
    *   **1-3. 통계 왜곡 및 오용:** 통계의 일부만 보여주거나, 출처가 명시되지 않은 통계 자료를 근거로 삼는 경우.

#### **[중요도: 높음] → 최종 판단: 가짜일 가능성이 높은 뉴스**
*   **유형: 2. 논리 및 구조적 허점**
    *   **2-1. 논리적 비약:** 제시된 근거만으로는 도저히 결론에 도달할 수 없을 정도로, 근거와 주장 사이에 합리적인 연결고리가 부족한 경우.
    *   **2-2. 근거 없는 의혹 제기:** 명확한 근거 없이 언론사가 자체적으로 의혹을 만들고 애매한 표현으로 마무리하여 독자에게 의심과 불신을 심어주는 방식.

#### **[중요도: 중간] → 최종 판단: 가짜일 가능성이 있는 뉴스**
*   **유형: 3. 선동적·감정적 표현 방식**
    *   **3-1. 단정적·선동적 어조:** 검증되지 않은 사실을 확정된 것처럼 표현하여 독자의 판단을 '강요'하는 방식.
    *   **3-2. 감정적 표현 사용:** 중립적인 단어 대신 감정을 자극하는 표현을 남발하여 이성적 판단을 방해하는 경우.

*   **유형: 4. 기사의 의도 문제**
    *   **4-1. 제목과 내용의 불일치 (낚시성 제목):** 독자의 클릭을 유도하기 위해 자극적이거나 과장된 제목을 사용했으나, 본문 내용은 제목과 무관하거나 일부만 다루는 경우.
    *   **4-2. 홍보 및 광고성 기사:** 기사의 형식을 빌려 특정 상품, 서비스, 인물 등을 일방적으로 긍정적으로 묘사하는 경우.

---

## 출력 형식
반드시 다음 JSON 배열 형식으로만 응답해주세요:

[
  {
    "instruction": "해당 기사는 진위 여부판단을 목적으로 수집되었습니다. 조건에 따라서 종합적으로 검토 후 판단 결과를 진위,근거,분석 항목으로 나누어 출력하세요.",
    "input": "주어진 텍스트 전체",
    "output": {
      "진위": "판단 결과('가짜 뉴스' / '가짜일 가능성이 높은 뉴스' / '가짜일 가능성이 있는 뉴스' / '진짜 뉴스')가 여기에 위치합니다.",
      "근거": "탐지된 중요도의 조건 번호와 이름이 위치합니다. 여러 개일 경우 번호를 붙여서 한 줄의 문자열로 나열합니다. 예시: 2-2. 근거 없는 의혹 제기",
      "분석": "위 근거들을 종합하여 기사의 어떤 부분이 왜 문제인지 혹은 신뢰할 수 있는지를 구체적으로 서술",
      "요약": "기사의 핵심 내용을 간결하면서 정확하게 요약합니다. 비교분석을 대비하여 핵심 내용 / 단어를 최대한 많이 포함합니다."
    }
  }
]

---
[뉴스 기사 본문]
${articleContent}
---`;
  }

  // 비교분석용 프롬프트 생성
  generateComparisonPrompt(comparisonContent) {
    return `
## 역할
당신은 두 개의 뉴스 기사를 비교분석하는 **'뉴스 비교분석 전문가'**입니다. 주어진 두 뉴스의 관점, 내용, 신뢰도를 객관적으로 비교하여 분석해주세요.

---

### **비교분석 원칙**
1. **내용 일치성 분석**: 두 뉴스가 같은 사실을 다루는지, 핵심 내용이 일치하는지 분석
2. **관점 차이 분석**: 같은 사건을 다른 시각에서 보는지, 편향된 시각이 있는지 분석  
3. **정보 정확성 비교**: 제시된 사실, 수치, 인용문 등이 서로 일치하는지 분석
4. **종합 신뢰도 판단**: 두 뉴스를 종합했을 때의 전체적인 신뢰도 평가

## 비교분석 방법론
- 두 기사의 핵심 주장을 명확히 파악
- 서로 상충하는 내용이나 일치하는 내용 식별
- 각 기사의 근거와 출처의 신뢰성 비교
- 감정적 표현이나 편향성 차이 분석
- 정보의 완전성과 정확성 평가

---

## 출력 형식
[
  {
    "instruction": "해당 기사들은 비교분석을 목적으로 수집되었습니다. 두 기사의 내용 일치성, 관점 차이, 신뢰도를 종합적으로 검토 후 판단 결과를 출력하세요.",
    "input": "주어진 두 뉴스 텍스트 전체",
    "output": {
      "분석진행": "비교분석을 위한 단계별 추론 과정을 투명하게 작성하세요. 1단계: 두 기사의 핵심 주장 파악, 2단계: 내용 일치성 분석, 3단계: 관점 및 편향성 분석, 4단계: 신뢰도 종합 평가 등 최소 4개 단계로 체계적으로 분석하세요.",
      "진위": "두 뉴스의 비교분석 결과 ('일치하는 진짜 뉴스' / '일부 차이가 있지만 신뢰할 수 있는 뉴스' / '상당한 차이가 있어 주의가 필요한 뉴스' / '상충되는 내용으로 추가 검증 필요')",
      "근거": "두 뉴스 간의 일치점과 차이점, 신뢰도 차이의 구체적인 근거",
      "분석": "두 뉴스의 비교분석 결과를 상세히 서술. 어떤 부분이 일치하고 어떤 부분이 다른지, 왜 그런 차이가 발생했는지 구체적으로 설명",
      "요약": "두 뉴스의 핵심 내용과 주요 차이점을 간결하게 요약"
    }
  }
]

---
[비교분석 대상 뉴스]
${comparisonContent}
---`;
  }


  // 분석 결과 보기 모달
  showAnalysisResult(id) {
    let block;
    if (id === 'current') {
      block = this.currentNews;
    } else {
      block = this.newsBlocks.get(parseInt(id));
    }
    
    if (!block || !block.result) {
      console.log('분석 결과가 없습니다:', id, block);
      return;
    }
    
    const modal = this.createResultModal(block);
    document.body.appendChild(modal);
    
    // 애니메이션
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.querySelector('.modal-content').style.transform = 'scale(1)';
    }, 10);
  }

  // 실시간 스트리밍 결과 보기 모달
  showStreamingResult(id) {
    let block;
    if (id === 'current') {
      block = this.currentNews;
    } else {
      block = this.newsBlocks.get(parseInt(id));
    }
    
    if (!block || block.status !== 'analyzing') {
      console.log('분석 중이 아닙니다:', id, block);
      return;
    }
    
    const modal = this.createStreamingModal(block, id);
    document.body.appendChild(modal);
    
    // 애니메이션
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.querySelector('.modal-content').style.transform = 'scale(1) translateY(0)';
    }, 10);
  }

  // 실시간 스트리밍 모달 생성
  createStreamingModal(block, blockId) {
    const modal = document.createElement('div');
    modal.className = 'streaming-modal';
    modal.setAttribute('data-streaming-modal', blockId);
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(26, 26, 26, 0.5);
      z-index: 2147483649;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = `
      background: #FAFAFA;
      border-radius: 16px;
      padding: 0;
      width: 90%;
      max-width: 700px;
      max-height: 85vh;
      position: relative;
      display: flex;
      flex-direction: column;
      transform: scale(0.95) translateY(10px);
      transition: all 0.3s ease;
      overflow: hidden;
      border: 1px solid #BF9780;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    `;

    const currentResult = this.streamingResults.get(blockId) || '';
    
    modalContent.innerHTML = `
      <!-- 헤더 섹션 -->
      <div style="
        background: linear-gradient(135deg, #F2CEA2 0%, #BF9780 100%);
        padding: 24px;
        position: relative;
      ">
        <button class="close-modal" style="
          position: absolute; 
          top: 16px; 
          right: 16px; 
          background: rgba(26, 26, 26, 0.1); 
          border: none; 
          color: #1A1A1A;
          cursor: pointer; 
          width: 32px; 
          height: 32px; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          border-radius: 50%; 
          transition: all 0.2s ease;
          font-size: 18px;
          font-weight: 600;
        " onmouseover="this.style.background='rgba(26, 26, 26, 0.2)'" onmouseout="this.style.background='rgba(26, 26, 26, 0.1)'">&times;</button>
        
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div style="
            width: 48px;
            height: 48px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 16px;
          ">
            <div style="
              width: 20px;
              height: 20px;
              border: 2px solid #1A1A1A;
              border-top: 2px solid transparent;
              border-radius: 50%;
              animation: spin 1.5s linear infinite;
            "></div>
          </div>
          <div>
            <h2 style="
              font-size: 20px; 
              font-weight: 600; 
              margin: 0 0 4px 0; 
              color: #1A1A1A;
            ">실시간 분석 진행중</h2>
            <p style="
              font-size: 14px; 
              color: #6B6B6B; 
              margin: 0;
            ">분석이 진행되고 있습니다</p>
          </div>
        </div>
        
        <div style="
          background: rgba(255, 255, 255, 0.4);
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.6);
        ">
          <h3 style="
            font-size: 12px; 
            font-weight: 600; 
            color: #6B6B6B; 
            margin: 0 0 6px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          ">분석 대상</h3>
          <p style="
            font-size: 14px; 
            color: #1A1A1A; 
            margin: 0; 
            line-height: 1.4; 
            word-break: break-word;
            font-weight: 500;
          ">${this.escapeHtml(block.title)}</p>
        </div>
      </div>
      
      <!-- 진행 상황 -->
      <div style="
        padding: 20px 24px;
        background: #F2F2F2;
        border-bottom: 1px solid #E5E5E5;
      ">
        <div style="margin-bottom: 8px;">
          <span style="
            color: #1A1A1A;
            font-size: 14px;
            font-weight: 600;
          ">현재 상황</span>
        </div>
        <p style="
          color: #6B6B6B;
          font-size: 13px;
          margin: 0;
        " id="live-progress">${block.progress || '분석을 준비하고 있습니다...'}</p>
      </div>
      
      <!-- 분석 결과 영역 -->
      <div style="
        flex: 1;
        padding: 24px;
        overflow-y: auto;
      ">
        <div style="
          display: flex;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #E5E5E5;
        ">
          <div>
            <h3 style="
              font-size: 16px;
              font-weight: 600;
              color: #1A1A1A;
              margin: 0 0 2px 0;
            ">분석 결과</h3>
            <p style="
              font-size: 12px;
              color: #6B6B6B;
              margin: 0;
            ">실시간으로 생성되는 분석 내용</p>
          </div>
        </div>
        
        <div class="streaming-content" style="
          font-size: 14px;
          line-height: 1.6;
          color: #1A1A1A;
          white-space: pre-wrap;
          word-break: break-word;
          min-height: 150px;
          background: #FFFFFF;
          padding: 20px;
          border-radius: 12px;
          border: 1px solid #E5E5E5;
        ">
          ${this.getSimpleStreamingMessage(block, currentResult)}
          <span class="typing-cursor" style="
            display: inline-block;
            width: 2px;
            height: 1.2em;
            background: #BF9780;
            margin-left: 2px;
            animation: blink 1.2s infinite;
          "></span>
        </div>
      </div>
    `;

    // 심플한 애니메이션 스타일
    if (!document.getElementById('simple-streaming-styles')) {
      const style = document.createElement('style');
      style.id = 'simple-streaming-styles';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    modal.appendChild(modalContent);

    // 모달 닫기 이벤트
    const closeBtn = modalContent.querySelector('.close-modal');
    closeBtn.addEventListener('click', () => {
      modal.style.opacity = '0';
      modalContent.style.transform = 'scale(0.95) translateY(10px)';
      setTimeout(() => modal.remove(), 300);
    });

    // 배경 클릭으로 닫기
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.opacity = '0';
        modalContent.style.transform = 'scale(0.95) translateY(10px)';
        setTimeout(() => modal.remove(), 300);
      }
    });

    return modal;
  }

  // 간단한 스트리밍 메시지 생성 (분석 기록만 투명하게)
  getSimpleStreamingMessage(block, currentResult) {
    if (currentResult) {
      return currentResult;
    }
    
    return `분석을 시작합니다...\n\n기사 내용을 검토하고 있습니다.`;
  }

  // 스트리밍 모달 내용 업데이트
  updateStreamingModal(modal, newContent, progressText = null) {
    const contentDiv = modal.querySelector('.streaming-content');
    const progressDiv = modal.querySelector('#live-progress');
    
    if (contentDiv) {
      contentDiv.innerHTML = `
        ${newContent}
        <span class="typing-cursor" style="
          display: inline-block;
          width: 2px;
          height: 1.2em;
          background: #BF9780;
          margin-left: 2px;
          animation: blink 1.2s infinite;
        "></span>
      `;
      
      // 스크롤을 맨 아래로
      const scrollContainer = contentDiv.parentElement;
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
    
    // 진행 상황 업데이트
    if (progressDiv && progressText) {
      progressDiv.textContent = progressText;
    }
  }

  // 초기 스트리밍 메시지 생성
  getInitialStreamingMessage(block, currentResult) {
    if (currentResult) {
      return currentResult;
    }
    
    // 진행상황에 따른 동적 메시지
    const progress = block.progress || 'AI가 분석을 시작하고 있습니다...';
    
    // 투명하고 상세한 진행상황 설명
    const detailedProgress = `
<span style="color: #BF9780; font-weight: bold; font-size: 16px;">🔍 실시간 팩트체킹 진행상황</span>

<span style="color: #0D0D0D; font-weight: 600;">📋 분석 단계:</span>
<span style="color: #737373;">1. 기사 내용 파싱 및 이해
2. 핵심 주장 및 사실 추출
3. 외부 신뢰 소스와 교차 검증
4. 논리적 일관성 및 편향성 검토
5. 종합적 진위 판단 및 근거 제시</span>

<span style="color: #0D0D0D; font-weight: 600;">🤖 사용 AI 모델:</span>
<span style="color: #737373;">Google Gemini Pro - 팩트체킹 전문 프롬프트</span>

<span style="color: #0D0D0D; font-weight: 600;">⏱️ 현재 상태:</span>
<span style="color: #D97706; font-weight: 500;">${progress}</span>

<span style="color: #0D0D0D; font-weight: 600;">📊 분석 결과 구성:</span>
<span style="color: #737373;">• 진위 판단 (참/거짓/불분명)
• 신뢰도 점수 (0-100%)
• 검증 근거 및 참고 자료
• 상세 분석 의견</span>

<div style="margin-top: 20px; padding: 12px; background: rgba(191, 151, 128, 0.1); border-radius: 6px; border-left: 3px solid #BF9780;">
<span style="color: #8B4513; font-size: 13px; font-weight: 500;">💡 투명성 원칙: 모든 분석 과정과 판단 근거를 명확히 제시합니다</span>
</div>

---

`;
    
    return detailedProgress;
  }

  // 결과 모달 생성
  createResultModal(block) {
    const modal = document.createElement('div');
    modal.className = 'result-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(13,13,13,0.6);
      z-index: 2147483648;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    
    const result = block.result;
    const analysisProcess = result.분석진행 || 'N/A';
    const verdict = result.진위 || 'N/A';
    const evidence = result.근거 || 'N/A';
    const analysis = result.분석 || 'N/A';
    const summary = result.요약 || 'N/A';
    
    modal.innerHTML = `
      <div class="modal-content" style="
        background: #F2F2F2;
        border-radius: 12px;
        padding: 32px;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        position: relative;
        transform: scale(0.8);
        transition: transform 0.3s ease;
      ">
        <button class="close-modal" style="
          position: absolute;
          top: 16px;
          right: 16px;
          background: none;
          border: none;
          font-size: 24px;
          color: #737373;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background-color 0.2s;
        ">&times;</button>
        
        <h2 style="color: #0D0D0D; font-size: 20px; font-weight: bold; margin-bottom: 16px; padding-right: 40px;">
          분석 결과
        </h2>
        
        <div style="margin-bottom: 16px;">
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">제목</h3>
          <p style="color: #737373; line-height: 1.5;">${this.escapeHtml(block.title)}</p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">진위 판단</h3>
          <div style="color: #0D0D0D; background: #BF9780; padding: 12px; border-radius: 8px; font-weight: 500;">${this.renderMarkdown(verdict)}</div>
        </div>
        
        <div style="margin-bottom: 16px;">
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">근거</h3>
          <div style="color: #737373; line-height: 1.5; background: #F2F2F2; border: 1px solid #BF9780; padding: 12px; border-radius: 8px;">${this.renderMarkdown(evidence)}</div>
        </div>
        
        <div style="margin-bottom: 16px;">
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">상세 분석</h3>
          <div style="color: #737373; line-height: 1.5; background: #F2F2F2; border: 1px solid #BF9780; padding: 12px; border-radius: 8px;">${this.renderMarkdown(analysis)}</div>
        </div>
        
        <div style="margin-bottom: 16px;">
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">핵심 요약</h3>
          <div style="color: #737373; line-height: 1.5; background: #F2CEA2; border: 1px solid #BF9780; padding: 12px; border-radius: 8px; font-weight: 500;">${this.renderMarkdown(summary)}</div>
        </div>
        
        ${block.title.includes('[비교분석]') ? `
        <div style="text-align: center; margin-top: 20px;">
          <button class="show-analysis-process" style="
            background: #BF9780;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          ">추론과정 확인</button>
        </div>` : ''}
      </div>
    `;
    
    // 이벤트 리스너들
    const closeBtn = modal.querySelector('.close-modal');
    const analysisProcessBtn = modal.querySelector('.show-analysis-process');
    
    const closeModal = () => {
      modal.style.opacity = '0';
      setTimeout(() => modal.remove(), 300);
    };
    
    // 닫기 이벤트
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // 추론과정 확인 버튼 이벤트
    if (analysisProcessBtn) {
      analysisProcessBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showAnalysisProcessModal(analysisProcess);
      });
    }
    
    // 호버 효과
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = '#BF9780';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = 'transparent';
    });
    
    return modal;
  }

  // 분석진행 모달 표시
  showAnalysisProcessModal(analysisProcess) {
    const modal = document.createElement('div');
    modal.className = 'analysis-process-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(13,13,13,0.6);
      z-index: 2147483649;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    modal.innerHTML = `
      <div class="modal-content" style="
        background: #FAFAFA;
        border-radius: 12px;
        padding: 32px;
        width: 90%;
        max-width: 700px;
        max-height: 85vh;
        overflow-y: auto;
        position: relative;
        transform: scale(0.8);
        transition: transform 0.3s ease;
        border: 1px solid #BF9780;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      ">
        <button class="close-modal" style="
          position: absolute;
          top: 16px;
          right: 16px;
          background: none;
          border: none;
          font-size: 24px;
          color: #737373;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background-color 0.2s;
        ">&times;</button>
        
        <h2 style="color: #0D0D0D; font-size: 20px; font-weight: bold; margin-bottom: 20px; padding-right: 40px;">
          🧠 AI 추론과정
        </h2>
        
        <div style="
          background: #F2F2F2;
          border: 1px solid #BF9780;
          border-radius: 8px;
          padding: 20px;
          line-height: 1.6;
          color: #0D0D0D;
          font-size: 14px;
          white-space: pre-wrap;
        ">${this.renderMarkdown(analysisProcess)}</div>
      </div>
    `;

    document.body.appendChild(modal);

    // 애니메이션
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.querySelector('.modal-content').style.transform = 'scale(1)';
    }, 10);

    // 이벤트 리스너
    const closeBtn = modal.querySelector('.close-modal');
    const closeModal = () => {
      modal.style.opacity = '0';
      setTimeout(() => modal.remove(), 300);
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // 호버 효과
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = '#BF9780';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = 'transparent';
    });
  }

  // 닫기 이벤트
  attachCloseEvent(panel) {
    const closeBtn = panel.querySelector('#close-panel');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        panel.style.transform = 'translateX(100%)';
        panel.style.opacity = '0';
        setTimeout(() => {
          panel.style.display = 'none';
          this.createFloatingButton();
        }, 300);
      });
    }
  }

  // 플로팅 버튼 생성
  createFloatingButton() {
    const existingFloatingBtn = document.getElementById('floating-news-analysis-btn');
    if (existingFloatingBtn) {
      existingFloatingBtn.remove();
    }

    const floatingBtn = document.createElement('button');
    floatingBtn.id = 'floating-news-analysis-btn';
    floatingBtn.innerHTML = '🔍';
    floatingBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #BF9780, #BF9780);
      color: white;
      border: none;
      font-size: 24px;
      cursor: pointer;
      box-shadow: 0 4px 12px #BF9780;
      z-index: 999998;
      transform: scale(0);
      transition: all 0.3s ease;
    `;

    document.body.appendChild(floatingBtn);

    setTimeout(() => {
      floatingBtn.style.transform = 'scale(1)';
    }, 10);

    // 호버 효과
    floatingBtn.addEventListener('mouseenter', () => {
      floatingBtn.style.transform = 'scale(1.1)';
      floatingBtn.style.boxShadow = '0 6px 20px #BF9780';
    });

    floatingBtn.addEventListener('mouseleave', () => {
      floatingBtn.style.transform = 'scale(1)';
      floatingBtn.style.boxShadow = '0 4px 12px #BF9780';
    });

    // 클릭 시 패널 다시 열기
    floatingBtn.addEventListener('click', () => {
      const panel = document.getElementById('news-analysis-panel');
      if (panel) {
        panel.style.display = 'block';
        panel.style.transform = 'translateX(0)';
        panel.style.opacity = '1';
        floatingBtn.style.transform = 'scale(0)';
        setTimeout(() => {
          floatingBtn.remove();
        }, 300);
      }
    });
  }

  // 설정 이벤트 (API 키 관리)
  attachSettingsEvent(panel) {
    const settingsBtn = panel.querySelector('#Settings');
    
    if (settingsBtn) {
      settingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('Settings button clicked'); // 디버깅용
        
        if (document.getElementById('api-key-input-modal')) {
          console.log('Modal already exists'); // 디버깅용
          return;
        }
        
        this.checkSavedApiKey().then((savedApiKey) => {
          console.log('Creating settings modal with API key:', savedApiKey ? 'exists' : 'none'); // 디버깅용
          const modal = this.createSettingsModal(savedApiKey);
          document.body.appendChild(modal);
          
          // 강제로 스타일 적용
          modal.style.display = 'flex';
          modal.style.visibility = 'visible';
          
          setTimeout(() => {
            modal.style.opacity = '1';
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
              modalContent.style.transform = 'scale(1)';
            }
            console.log('Modal animation completed'); // 디버깅용
          }, 10);
        });
      });
    }
  }

  // 설정 모달 생성
  createSettingsModal(savedApiKey) {
    const modal = document.createElement('div');
    modal.id = 'api-key-input-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(13,13,13,0.6);
      z-index: 2147483648;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    
    const isEdit = !!savedApiKey;
    const maskedKey = savedApiKey ? `${savedApiKey.substring(0, 8)}...${savedApiKey.substring(savedApiKey.length - 4)}` : '';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = `
      background: #F2F2F2;
      border-radius: 12px;
      padding: 32px;
      width: 560px;
      height: 270px;
      position: relative;
      display: flex;
      flex-direction: column;
      transform: scale(0.8);
      transition: all 0.3s ease;
    `;
    
    if (isEdit) {
      modalContent.innerHTML = `
        <button class="close-modal" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; color: #737373; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">&times;</button>
        <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 32px; text-align: center; color: #0D0D0D;">API 키 설정</h2>
        <div style="background: #F2F2F2; border: 2px solid #BF9780; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; flex: 1; display: flex; align-items: center; justify-content: center;">
          <span style="font-family: monospace; font-size: 16px; color: #0D0D0D;">${maskedKey}</span>
        </div>
        <div style="display: flex; gap: 12px;">
          <button class="edit-key-btn" style="background: #BF9780; color: white; padding: 16px 32px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; flex: 1; transition: background-color 0.2s; font-size: 16px;">수정</button>
          <button class="remove-key-btn" style="background: #E74C3C; color: white; padding: 16px 32px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; flex: 1; transition: background-color 0.2s; font-size: 16px;">해제</button>
        </div>
      `;
    } else {
      modalContent.innerHTML = `
        <button class="close-modal" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; color: #737373; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">&times;</button>
        <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 32px; text-align: center; color: #0D0D0D;">API 키를 입력하세요</h2>
        <input class="api-key-input" type="text" placeholder="Gemini API Key" style="border: 2px solid #BF9780; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; width: 100%; font-size: 16px; box-sizing: border-box; flex: 1; outline: none; transition: border-color 0.2s;" />
        <button class="submit-key-btn" style="background: #F2CEA2; color: #0D0D0D; padding: 16px 32px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; width: 100%; transition: background-color 0.2s; font-size: 16px;">확인</button>
      `;
    }
    
    modal.appendChild(modalContent);
    
    // 이벤트 연결
    this.attachModalEvents(modal, modalContent, savedApiKey);
    
    return modal;
  }

  // 모달 이벤트 연결
  attachModalEvents(modal, modalContent, savedApiKey) {
    const closeModal = () => {
      modal.style.opacity = '0';
      setTimeout(() => modal.remove(), 300);
    };
    
    // 닫기 버튼
    const closeBtn = modalContent.querySelector('.close-modal');
    closeBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = '#BF9780';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = 'transparent';
    });
    
    // 배경 클릭으로 닫기
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    // 수정 버튼 (표시 모드)
    const editBtn = modalContent.querySelector('.edit-key-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        modalContent.innerHTML = `
          <button class="close-modal" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; color: #737373; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">&times;</button>
          <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 32px; text-align: center; color: #0D0D0D;">API 키 수정</h2>
          <input class="api-key-input" type="text" placeholder="새로운 Gemini API Key" value="${savedApiKey}" style="border: 2px solid #BF9780; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; width: 100%; font-size: 16px; box-sizing: border-box; flex: 1; outline: none; transition: border-color 0.2s;" />
          <button class="submit-key-btn" style="background: #F2CEA2; color: #0D0D0D; padding: 16px 32px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; width: 100%; transition: background-color 0.2s; font-size: 16px;">저장</button>
        `;
        
        this.attachModalEvents(modal, modalContent, savedApiKey);
      });
      
      editBtn.addEventListener('mouseenter', () => {
        editBtn.style.backgroundColor = '#A68570';
      });
      editBtn.addEventListener('mouseleave', () => {
        editBtn.style.backgroundColor = '#BF9780';
      });
    }

    // 해제 버튼 (표시 모드)
    const removeBtn = modalContent.querySelector('.remove-key-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (confirm('API 키를 정말 해제하시겠습니까?\n해제하면 팩트체킹 기능을 사용할 수 없습니다.')) {
          this.removeApiKey();
          closeModal();
          alert('API 키가 해제되었습니다.');
        }
      });
      
      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.backgroundColor = '#C0392B';
      });
      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.backgroundColor = '#E74C3C';
      });
    }
    
    // 입력 및 제출 (입력 모드)
    const input = modalContent.querySelector('.api-key-input');
    const submitBtn = modalContent.querySelector('.submit-key-btn');
    
    if (input && submitBtn) {
      // 포커스 효과
      input.addEventListener('focus', () => {
        input.style.borderColor = '#F2CEA2';
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = '#BF9780';
      });
      
      // 자동 포커스
      setTimeout(() => input.focus(), 100);
      
      // 제출 버튼
      const handleSubmit = () => {
        const apiKey = input.value.trim();
        
        if (apiKey) {
          if (this.isChromeApiAvailable()) {
            try {
              chrome.storage.local.set({ apiKey: apiKey }, () => {
                if (chrome.runtime.lastError) {
                  console.log('Chrome storage failed, using localStorage:', chrome.runtime.lastError);
                  localStorage.setItem('gemini_api_key', apiKey);
                  alert('API 키가 저장되었습니다! (localStorage)');
                } else {
                  alert('API 키가 저장되었습니다!');
                }
                closeModal();
              });
            } catch (error) {
              console.log('Chrome storage error, using localStorage:', error);
              localStorage.setItem('gemini_api_key', apiKey);
              alert('API 키가 저장되었습니다! (localStorage)');
              closeModal();
            }
          } else {
            localStorage.setItem('gemini_api_key', apiKey);
            alert('API 키가 저장되었습니다!');
            closeModal();
          }
        } else {
          alert('API 키를 입력해주세요.');
        }
      };
      
      submitBtn.addEventListener('click', handleSubmit);
      
      // Enter 키로 제출
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleSubmit();
        }
      });
      
      // 호버 효과
      submitBtn.addEventListener('mouseenter', () => {
        submitBtn.style.backgroundColor = '#E6B892';
      });
      submitBtn.addEventListener('mouseleave', () => {
        submitBtn.style.backgroundColor = '#F2CEA2';
      });
    }
  }

  // 저장된 API 키 확인
  async checkSavedApiKey() {
    try {
      if (this.isChromeApiAvailable()) {
        return new Promise((resolve) => {
          chrome.storage.local.get(['apiKey'], (result) => {
            if (chrome.runtime.lastError) {
              console.log('Chrome storage failed, using localStorage:', chrome.runtime.lastError);
              resolve(localStorage.getItem('gemini_api_key') || '');
            } else {
              resolve(result.apiKey || '');
            }
          });
        });
      } else {
        return localStorage.getItem('gemini_api_key') || '';
      }
    } catch (error) {
      console.log('API 키 확인 오류:', error);
      return localStorage.getItem('gemini_api_key') || '';
    }
  }

  // API 키 해제
  async removeApiKey() {
    try {
      // Chrome 확장 프로그램 환경에서 storage API 사용
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove(['gemini_api_key']);
        console.log('API 키가 Chrome Storage에서 제거되었습니다.');
      } else {
        localStorage.removeItem('gemini_api_key');
        console.log('API 키가 localStorage에서 제거되었습니다.');
      }
    } catch (error) {
      console.log('API 키 제거 오류:', error);
      localStorage.removeItem('gemini_api_key');
    }
  }

  // 비교 모드 토글
  toggleCompareMode(id) {
    const block = this.newsBlocks.get(id);
    if (!block) return;

    if (block.compareMode) {
      // 비교 모드 해제
      block.compareMode = false;
      this.waitingForComparison = null; // 대기 상태도 초기화
      this.updatePanel();
    } else {
      // 첫 사용 시 경고 메시지 표시
      if (!this.hasShownComparisonWarning()) {
        this.showComparisonWarning(() => {
          // 경고 확인 후 비교 모드 활성화
          this.activateCompareMode(id);
        });
        return;
      }
      
      this.activateCompareMode(id);
    }
    
    this.saveNewsBlocks();
  }

  // 비교 모드 활성화
  activateCompareMode(id) {
    const block = this.newsBlocks.get(id);
    if (!block) return;
    
    block.compareMode = true;
    this.updatePanel();
    
    // 다른 뉴스 블록들 중에서 선택할 수 있도록 안내
    this.showCompareSelection(id);
  }

  // 비교할 뉴스 선택 안내
  showCompareSelection(sourceId) {
    const availableBlocks = Array.from(this.newsBlocks.values())
      .filter(block => block.id !== sourceId && block.status === 'completed');
    
    if (availableBlocks.length === 0) {
      alert('비교할 수 있는 다른 뉴스가 없습니다. 먼저 다른 뉴스를 분석해주세요.');
      // 비교 모드 해제
      const block = this.newsBlocks.get(sourceId);
      if (block) {
        block.compareMode = false;
        this.updatePanel();
        this.saveNewsBlocks();
      }
      return;
    }
    
    // 비교 대기 상태 설정
    this.waitingForComparison = sourceId;
    
    // 사용자에게 다른 뉴스 블록을 클릭하라고 안내
    this.showCompareInstructions(sourceId);
  }

  // 비교 경고를 표시했는지 확인
  hasShownComparisonWarning() {
    return localStorage.getItem('factcheck_comparison_warning_shown') === 'true';
  }

  // 비교 경고 표시 상태 저장
  setComparisonWarningShown() {
    localStorage.setItem('factcheck_comparison_warning_shown', 'true');
  }

  // 비교 분석 첫 사용 경고 모달
  showComparisonWarning(onConfirm) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(13,13,13,0.6);
      z-index: 2147483649;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    modal.innerHTML = `
      <div style="
        background: #FAFAFA;
        border-radius: 16px;
        padding: 32px;
        width: 90%;
        max-width: 500px;
        position: relative;
        transform: scale(0.95);
        transition: all 0.3s ease;
        border: 1px solid #BF9780;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      ">
        <div style="
          background: #F2CEA2;
          color: #1A1A1A;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 20px;
          text-align: center;
        ">⚠️ 비교분석 기능 안내</div>
        
        <h3 style="
          color: #0D0D0D;
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 16px;
          text-align: center;
        ">비교분석을 처음 사용하시는군요!</h3>
        
        <div style="color: #737373; line-height: 1.6; margin-bottom: 24px;">
          <p style="margin-bottom: 12px;">비교분석 기능은 두 개의 뉴스를 선택하여 다음과 같은 분석을 제공합니다:</p>
          <ul style="margin-left: 20px; margin-bottom: 12px;">
            <li>• 서로 다른 관점의 비교</li>
            <li>• 내용의 일치점과 차이점 분석</li>
            <li>• 각 뉴스의 신뢰도 비교</li>
          </ul>
          <p style="color: #BF9780; font-weight: 500; margin-bottom: 12px;">첫 번째 뉴스를 선택한 후, 비교할 두 번째 뉴스를 클릭하면 자동으로 비교분석이 시작됩니다.</p>
          <p style="color: #DC2626; font-weight: 500; background: #FEE2E2; padding: 8px 12px; border-radius: 6px;">⏱️ 두 기사에 대한 분석을 진행하므로 평소보다 시간이 더 걸릴 수 있습니다.</p>
        </div>
        
        <div style="display: flex; gap: 12px;">
          <button id="cancel-comparison" style="
            flex: 1;
            padding: 12px 24px;
            border: 1px solid #BF9780;
            background: transparent;
            color: #BF9780;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          ">취소</button>
          <button id="confirm-comparison" style="
            flex: 1;
            padding: 12px 24px;
            background: #BF9780;
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          ">확인</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 애니메이션
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.querySelector('div').style.transform = 'scale(1)';
    }, 10);

    // 이벤트 리스너
    const confirmBtn = modal.querySelector('#confirm-comparison');
    const cancelBtn = modal.querySelector('#cancel-comparison');

    const closeModal = () => {
      modal.style.opacity = '0';
      setTimeout(() => modal.remove(), 300);
    };

    confirmBtn.addEventListener('click', () => {
      this.setComparisonWarningShown();
      closeModal();
      onConfirm();
    });

    cancelBtn.addEventListener('click', () => {
      closeModal();
    });

    // 호버 효과
    confirmBtn.addEventListener('mouseenter', () => {
      confirmBtn.style.background = '#A67B5B';
    });
    confirmBtn.addEventListener('mouseleave', () => {
      confirmBtn.style.background = '#BF9780';
    });

    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = '#BF9780';
      cancelBtn.style.color = 'white';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'transparent';
      cancelBtn.style.color = '#BF9780';
    });
  }

  // 비교 안내 메시지 표시 (alert 제거됨)
  showCompareInstructions(sourceId) {
    // alert는 제거하고 패널에서만 안내
    console.log('비교 모드 활성화됨. 다른 뉴스를 클릭하세요.');
  }

  // 비교 분석 실행
  createComparisonAnalysis(sourceId, targetId) {
    const sourceBlock = this.newsBlocks.get(sourceId);
    const targetBlock = this.newsBlocks.get(targetId);
    
    if (!sourceBlock || !targetBlock) return;

    // 비교 분석 블록 생성
    const comparisonId = Date.now();
    const comparisonBlock = {
      id: comparisonId,
      title: `[비교분석] ${sourceBlock.title} vs ${targetBlock.title}`,
      url: '',
      content: `비교 대상 1: ${sourceBlock.title}\n${sourceBlock.content || ''}\n\n비교 대상 2: ${targetBlock.title}\n${targetBlock.content || ''}`,
      status: 'pending',
      result: null,
      progress: '',
      isComparison: true,
      sourceNews: {
        id: sourceId,
        title: sourceBlock.title,
        content: sourceBlock.content || '',
        result: sourceBlock.result
      },
      targetNews: {
        id: targetId,
        title: targetBlock.title,
        content: targetBlock.content || '',
        result: targetBlock.result
      }
    };

    // 비교 모드 해제 및 대기 상태 초기화
    sourceBlock.compareMode = false;
    this.waitingForComparison = null;

    // 비교 분석 블록 추가
    this.newsBlocks.set(comparisonId, comparisonBlock);
    this.saveNewsBlocks();
    this.updatePanel();

    console.log('비교 분석 블록 생성됨:', comparisonBlock);
    
    // 비교 분석 바로 시작
    this.startAnalysis(comparisonId);
  }

  // 분석 진행 상황 업데이트 (외부에서 호출)
  updateAnalysisProgress(blockId, progress) {
    this.updateNewsStatus(blockId, 'analyzing', null, progress);
  }

  // 스트리밍 결과 업데이트 (실시간 타이핑 효과)
  updateStreamingResult(blockId, partialResult) {
    console.log('updateStreamingResult 호출됨:', { blockId, partialResult });
    
    this.streamingResults.set(blockId, partialResult);
    
    // 스트리밍 내용에 따라 진행상황 메시지 업데이트
    let progressMessage = 'AI가 실시간으로 분석 중...';
    
    if (partialResult) {
      if (partialResult.includes('진위') || partialResult.includes('참') || partialResult.includes('거짓')) {
        progressMessage = '진위 판정 결과 작성 중...';
      } else if (partialResult.includes('근거') || partialResult.includes('증거')) {
        progressMessage = '검증 근거 정리 중...';
      } else if (partialResult.includes('분석') || partialResult.includes('의견')) {
        progressMessage = '상세 분석 의견 작성 중...';
      }
    }
    
    this.updateNewsStatus(blockId, 'analyzing', null, progressMessage);
    
    // 새로운 인라인 타이핑 업데이트
    if (partialResult) {
      this.updateBlockTypingArea(blockId, partialResult);
    }
  }

  // 기존 스트리밍 컨테이너 점진적 업데이트
  updateExistingStreamingContainer(container, newData) {
    console.log('기존 컨테이너 업데이트:', newData);
    
    Object.keys(newData).forEach(stepName => {
      const content = newData[stepName];
      
      // 해당 단계의 기존 블록 찾기
      const existingStepBlock = container.querySelector(`[data-step="${stepName}"]`);
      
      if (existingStepBlock) {
        // 기존 단계 업데이트
        const textElement = existingStepBlock.querySelector('.step-content');
        if (textElement && content !== '분석 중...') {
          // 타이핑 효과로 업데이트
          this.updateStepContent(textElement, content);
        }
      } else {
        // 새로운 단계 추가
        this.createStepBlock(container, stepName, content, null);
      }
    });
  }

  // 단계 컨텐츠 업데이트
  updateStepContent(element, newContent) {
    // 기존 타이핑 효과 중단
    const existingInterval = element.dataset.typingInterval;
    if (existingInterval) {
      clearInterval(parseInt(existingInterval));
    }
    
    // 새로운 내용으로 타이핑 효과 시작
    let index = 0;
    element.textContent = '';
    
    const cursor = document.createElement('span');
    cursor.textContent = '|';
    cursor.style.cssText = `
      animation: blink 1s infinite;
      color: #BF9780;
      font-weight: normal;
      margin-left: 1px;
    `;
    element.appendChild(cursor);

    const typeInterval = setInterval(() => {
      if (index < newContent.length) {
        element.textContent = newContent.substring(0, index + 1);
        element.appendChild(cursor);
        index++;
      } else {
        clearInterval(typeInterval);
        cursor.remove();
        delete element.dataset.typingInterval;
      }
    }, this.typingSpeed);
    
    element.dataset.typingInterval = typeInterval;
  }

  // 텍스트에서 진위, 근거, 분석 키워드 감지하여 파싱
  parseAnalysisText(text) {
    console.log('원본 텍스트:', text);
    
    const result = {};
    
    // 다양한 JSON 형식 처리
    try {
      // 완전한 JSON 객체 시도
      const jsonData = JSON.parse(text);
      if (jsonData['진위']) result['진위'] = jsonData['진위'];
      if (jsonData['근거']) result['근거'] = jsonData['근거'];  
      if (jsonData['분석']) result['분석'] = jsonData['분석'];
      
      console.log('JSON 파싱 성공:', result);
      return Object.keys(result).length > 0 ? result : null;
    } catch (e) {
      // JSON 파싱 실패 시 텍스트 패턴 매칭
    }
    
    // 개선된 패턴 매칭 - 다양한 형식 지원
    const patterns = [
      // "키": "값" 형식
      /"(진위|근거|분석)"\s*:\s*"([^"]*)"?/g,
      // '키': '값' 형식  
      /'(진위|근거|분석)'\s*:\s*'([^']*)'?/g,
      // 키: 값 형식 (따옴표 없음)
      /(진위|근거|분석)\s*:\s*([^\n,}]*)/g,
      // 키워드만 있는 경우
      /(진위|근거|분석)\s*[:]?\s*([^"'\n,}]+)/g
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const key = match[1].trim();
        let value = match[2].trim();
        
        // 불필요한 문자 제거
        value = value.replace(/[",}]$/, '').trim();
        
        if (value && value.length > 0) {
          result[key] = this.cleanAnalysisText(value);
        }
      }
    });
    
    // 부분적 스트리밍 감지 - 키만 나온 경우
    if (Object.keys(result).length === 0) {
      const partialMatches = text.match(/"(진위|근거|분석)"\s*:/g);
      if (partialMatches) {
        partialMatches.forEach(match => {
          const key = match.match(/"(진위|근거|분석)"/)[1];
          result[key] = '분석 중...';
        });
      }
    }
    
    console.log('개선된 파싱 결과:', result);
    return Object.keys(result).length > 0 ? result : null;
  }

  // 분석 텍스트 정리
  cleanAnalysisText(text) {
    return text
      .replace(/^["']|["']$/g, '') // 시작/끝 따옴표 제거
      .replace(/\\n/g, '\n')       // 이스케이프된 줄바꿈 처리
      .replace(/\\"/g, '"')        // 이스케이프된 따옴표 처리
      .replace(/^\s+|\s+$/g, '')   // 앞뒤 공백 제거
      .replace(/\s+/g, ' ');       // 연속된 공백을 하나로
  }

  // 분석 완료 (외부에서 호출)
  completeAnalysis(blockId, result) {
    // 실시간 모달이 열려있다면 완료 메시지 표시 후 닫기
    const streamingModal = document.querySelector(`[data-streaming-modal="${blockId}"]`);
    if (streamingModal) {
      const contentDiv = streamingModal.querySelector('.streaming-content');
      if (contentDiv) {
        contentDiv.innerHTML = `
          ${this.streamingResults.get(blockId) || ''}
          <div style="margin-top: 20px; padding: 15px; background: #e7f5e7; border: 1px solid #4CAF50; border-radius: 8px; color: #2e7d32; text-align: center;">
            <strong>분석이 완료되었습니다!</strong><br>
            <small style="color: #666;">분석 기록에서 결과를 확인할 수 있습니다</small>
          </div>
        `;
        
        // 스크롤을 맨 아래로
        const scrollContainer = contentDiv.parentElement;
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
      
      // 1.5초 후 모달 자동 닫기
      setTimeout(() => {
        streamingModal.style.opacity = '0';
        setTimeout(() => {
          streamingModal.remove();
          
          // 닫힌 후 해당 뉴스 블록에 완료 표시 강조 (잠깐 깜빡임)
          this.highlightCompletedBlock(blockId);
        }, 300);
      }, 1500);
    }
    
    this.streamingResults.delete(blockId); // 스트리밍 결과 정리
    this.updateNewsStatus(blockId, 'completed', result);
  }

  // 완료된 블록 강조 표시
  highlightCompletedBlock(blockId) {
    const newsBlocks = this.panelContent.querySelectorAll('.news-block');
    newsBlocks.forEach(block => {
      if (block.dataset.id === blockId) {
        // 잠깐 초록색 테두리로 강조
        block.style.border = '2px solid #4CAF50';
        block.style.backgroundColor = '#f8fff8';
        block.style.transform = 'scale(1.02)';
        
        setTimeout(() => {
          block.style.border = '';
          block.style.backgroundColor = '';
          block.style.transform = '';
        }, 2000);
      }
    });
  }

  // 분석 실패 (외부에서 호출)
  failAnalysis(blockId, error) {
    this.streamingResults.delete(blockId); // 스트리밍 결과 정리
    this.updateNewsStatus(blockId, 'error', null, null, error);
  }

  // 뉴스 블록 데이터 저장
  saveNewsBlocks() {
    const blocksData = Array.from(this.newsBlocks.entries()).map(([id, block]) => [id, block]);
    const dataToSave = {
      blocks: blocksData,
      counter: this.blockIdCounter
    };
    
    // Chrome API 안전 확인
    if (this.isChromeApiAvailable()) {
      try {
        chrome.storage.local.set({ newsBlocks: dataToSave }, () => {
          if (chrome.runtime.lastError) {
            console.log('Chrome storage failed, falling back to localStorage:', chrome.runtime.lastError);
            this.saveToLocalStorage(dataToSave);
          } else {
            console.log('News blocks saved to chrome storage');
          }
        });
      } catch (error) {
        console.log('Chrome storage error, using localStorage:', error);
        this.saveToLocalStorage(dataToSave);
      }
    } else {
      this.saveToLocalStorage(dataToSave);
    }
  }

  // localStorage에 저장
  saveToLocalStorage(dataToSave) {
    try {
      localStorage.setItem('factcheck_news_blocks', JSON.stringify(dataToSave));
      console.log('News blocks saved to localStorage');
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }

  // Chrome API 사용 가능 여부 확인
  isChromeApiAvailable() {
    try {
      return typeof chrome !== 'undefined' && 
             chrome.runtime && 
             chrome.runtime.id && 
             chrome.storage && 
             chrome.storage.local;
    } catch (error) {
      return false;
    }
  }

  // 저장된 뉴스 블록 데이터 로드
  loadSavedNewsBlocks() {
    if (this.isChromeApiAvailable()) {
      try {
        chrome.storage.local.get(['newsBlocks'], (result) => {
          if (chrome.runtime.lastError) {
            console.log('Chrome storage failed, falling back to localStorage:', chrome.runtime.lastError);
            this.loadFromLocalStorage();
          } else if (result.newsBlocks) {
            this.restoreNewsBlocks(result.newsBlocks);
            this.updatePanel();
          } else {
            // Chrome storage에 데이터가 없으면 localStorage도 확인
            this.loadFromLocalStorage();
          }
        });
      } catch (error) {
        console.log('Chrome storage error, using localStorage:', error);
        this.loadFromLocalStorage();
      }
    } else {
      this.loadFromLocalStorage();
    }
  }

  // localStorage에서 로드
  loadFromLocalStorage() {
    try {
      const savedData = localStorage.getItem('factcheck_news_blocks');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        this.restoreNewsBlocks(parsedData);
        this.updatePanel();
      }
    } catch (error) {
      console.error('Error parsing saved news blocks:', error);
    }
  }

  // 뉴스 블록 데이터 복원
  restoreNewsBlocks(savedData) {
    if (savedData && savedData.blocks) {
      this.newsBlocks = new Map(savedData.blocks);
      this.blockIdCounter = savedData.counter || 0;
      console.log('Restored', this.newsBlocks.size, 'news blocks');
    }
  }

  // 분석 기록 개수 업데이트
  updateAnalysisCount() {
    const countElement = document.getElementById('analysis-count');
    if (countElement) {
      countElement.textContent = this.newsBlocks.size;
      // 카운트 변경 애니메이션
      countElement.style.transform = 'scale(1.2)';
      countElement.style.background = '#10B981';
      countElement.style.color = '#FFFFFF';
      setTimeout(() => {
        countElement.style.transform = 'scale(1)';
        countElement.style.background = '#F2CEA2';
        countElement.style.color = '#1A1A1A';
      }, 200);
    }
  }

  // 실시간 스트리밍 분석 시작
  startStreamingAnalysis(newsId, analysisData) {
    this.clearPreviousTyping(newsId);
    
    // 스트리밍 컨테이너 생성
    const streamingContainer = this.createStreamingContainer(newsId);
    
    // 분석 단계별로 처리
    let currentStepIndex = 0;
    
    const processNextStep = () => {
      if (currentStepIndex >= this.analysisSteps.length) return;
      
      const step = this.analysisSteps[currentStepIndex];
      const stepData = analysisData[step];
      
      if (stepData) {
        this.createStepBlock(streamingContainer, step, stepData, () => {
          currentStepIndex++;
          setTimeout(processNextStep, 300); // 다음 단계까지 300ms 대기
        });
      } else {
        currentStepIndex++;
        setTimeout(processNextStep, 100);
      }
    };
    
    processNextStep();
  }

  // 이전 타이핑 효과 정리
  clearPreviousTyping(newsId) {
    if (this.currentTypingIntervals.has(newsId)) {
      const intervals = this.currentTypingIntervals.get(newsId);
      intervals.forEach(interval => clearInterval(interval));
      this.currentTypingIntervals.delete(newsId);
    }
  }

  // 스트리밍 컨테이너 생성
  createStreamingContainer(newsId) {
    const existingContainer = document.getElementById(`streaming-${newsId}`);
    if (existingContainer) {
      existingContainer.remove();
    }

    const container = document.createElement('div');
    container.id = `streaming-${newsId}`;
    container.style.cssText = `
      margin-top: 16px;
      padding: 20px;
      background: linear-gradient(135deg, #FFFFFF, #FAFAFA);
      border-radius: 16px;
      border: 1px solid rgba(229, 229, 229, 0.6);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      animation: fadeIn 0.5s ease-out;
      position: relative;
      overflow: hidden;
    `;

    // 분석 중임을 나타내는 헤더 추가
    const analysisHeader = document.createElement('div');
    analysisHeader.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(191, 151, 128, 0.2);
    `;
    
    analysisHeader.innerHTML = `
      <div style="
        width: 8px;
        height: 8px;
        background: #10B981;
        border-radius: 50%;
        animation: pulse 2s infinite;
      "></div>
      <span style="
        font-weight: 600;
        color: #1A1A1A;
        font-size: 16px;
      ">실시간 분석 중</span>
      <div style="
        flex: 1;
        height: 1px;
        background: linear-gradient(to right, rgba(191, 151, 128, 0.3), transparent);
        margin-left: 12px;
      "></div>
    `;
    
    container.appendChild(analysisHeader);

    // 현재 뉴스인 경우 current-news-container에 추가
    if (newsId === 'current' || newsId === this.currentNews?.id) {
      const currentContainer = document.getElementById('current-news-container');
      if (currentContainer) {
        currentContainer.appendChild(container);
      }
    } else {
      // 분석된 뉴스 블록에 추가
      const newsBlock = document.querySelector(`[data-id="${newsId}"]`);
      if (newsBlock) {
        newsBlock.appendChild(container);
      }
    }

    return container;
  }

  // 단계별 블록 생성 및 타이핑 효과
  createStepBlock(container, stepName, content, onComplete) {
    const stepBlock = document.createElement('div');
    stepBlock.setAttribute('data-step', stepName);
    stepBlock.style.cssText = `
      margin-bottom: 20px;
      opacity: 0;
      transform: translateY(15px);
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    `;

    // 단계 헤더 생성
    const header = this.createStepHeader(stepName);
    stepBlock.appendChild(header);

    // 컨텐츠 컨테이너 생성
    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = `
      margin-top: 12px;
      padding: 16px;
      background: ${this.getStepBackgroundColor(stepName)};
      border-radius: 12px;
      border-left: 4px solid ${this.getStepBorderColor(stepName)};
      min-height: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    `;

    const textElement = document.createElement('div');
    textElement.className = 'step-content';
    textElement.style.cssText = `
      font-size: 14px;
      line-height: 1.6;
      color: #1A1A1A;
      word-wrap: break-word;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    `;

    contentContainer.appendChild(textElement);
    stepBlock.appendChild(contentContainer);
    container.appendChild(stepBlock);

    // 부드러운 애니메이션으로 블록 표시
    requestAnimationFrame(() => {
      stepBlock.style.opacity = '1';
      stepBlock.style.transform = 'translateY(0)';
    });

    // "분석 중..." 이 아닌 경우에만 타이핑 효과 시작
    if (content && content !== '분석 중...') {
      setTimeout(() => {
        this.startTypingEffect(textElement, content, onComplete);
      }, 300);
    } else {
      // "분석 중..." 표시
      textElement.innerHTML = `
        <span style="color: #6B6B6B; font-style: italic;">
          ${content || '분석 중...'}
        </span>
      `;
    }
  }

  // 단계 헤더 생성
  createStepHeader(stepName) {
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      color: ${this.getStepColor(stepName)};
      font-size: 16px;
      margin-bottom: 4px;
    `;

    const icon = this.getStepIcon(stepName);
    header.innerHTML = `
      <div style="
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, ${this.getStepColor(stepName)}, ${this.getStepColorSecondary(stepName)});
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      ">${icon}</div>
      <div style="
        font-weight: 600;
        color: #1A1A1A;
        font-size: 16px;
      ">${stepName} 분석</div>
      <div style="
        flex: 1;
        height: 1px;
        background: linear-gradient(to right, ${this.getStepColor(stepName)}40, transparent);
        margin-left: 8px;
      "></div>
    `;

    return header;
  }

  // 타이핑 효과 구현
  startTypingEffect(element, text, onComplete) {
    let index = 0;
    element.textContent = '';
    
    // 커서 추가
    const cursor = document.createElement('span');
    cursor.textContent = '|';
    cursor.style.cssText = `
      animation: blink 1s infinite;
      color: #BF9780;
      font-weight: normal;
      margin-left: 1px;
    `;
    element.appendChild(cursor);

    const typeInterval = setInterval(() => {
      if (index < text.length) {
        // 텍스트를 한 글자씩 추가
        const currentText = text.substring(0, index + 1);
        element.textContent = currentText;
        element.appendChild(cursor);
        index++;
      } else {
        clearInterval(typeInterval);
        // 타이핑 완료 후 커서 제거
        setTimeout(() => {
          cursor.remove();
          if (onComplete) onComplete();
        }, 500);
      }
    }, this.typingSpeed);

    return typeInterval;
  }

  // 단계별 색상/아이콘 설정
  getStepColor(stepName) {
    const colors = {
      '진위': '#10B981',
      '근거': '#3B82F6', 
      '분석': '#8B5CF6'
    };
    return colors[stepName] || '#6B6B6B';
  }

  getStepColorSecondary(stepName) {
    const colors = {
      '진위': '#059669',
      '근거': '#2563EB', 
      '분석': '#7C3AED'
    };
    return colors[stepName] || '#4B5563';
  }

  getStepBackgroundColor(stepName) {
    const colors = {
      '진위': 'linear-gradient(135deg, #D1FAE5, #ECFDF5)',
      '근거': 'linear-gradient(135deg, #DBEAFE, #EFF6FF)',
      '분석': 'linear-gradient(135deg, #EDE9FE, #F5F3FF)'
    };
    return colors[stepName] || 'linear-gradient(135deg, #F9FAFB, #FFFFFF)';
  }

  getStepBorderColor(stepName) {
    const colors = {
      '진위': '#10B981',
      '근거': '#3B82F6',
      '분석': '#8B5CF6'
    };
    return colors[stepName] || '#D1D5DB';
  }

  getStepIcon(stepName) {
    const icons = {
      '진위': '⚖️',
      '근거': '🔍',
      '분석': '🧠'
    };
    return icons[stepName] || '📄';
  }

  // 뉴스 블록 추가할 때 카운트 업데이트
  addNewsBlock(newsData) {
    // 기존 로직...
    this.newsBlocks.set(newsData.id, newsData);
    this.updateAnalysisCount(); // 카운트 업데이트
    this.saveNewsBlocks();
    this.updatePanel();
  }

  // 뉴스 블록 제거할 때 카운트 업데이트  
  removeNewsBlock(newsId) {
    if (this.newsBlocks.has(newsId)) {
      this.newsBlocks.delete(newsId);
      this.updateAnalysisCount(); // 카운트 업데이트
      this.saveNewsBlocks();
      this.updatePanel();
    }
  }
}

// CSS 애니메이션 추가
if (!document.getElementById('analysis-panel-animations')) {
  const style = document.createElement('style');
  style.id = 'analysis-panel-animations';
  style.textContent = `
    @keyframes fadeIn {
      0% { opacity: 0; transform: translateY(20px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
    
    @keyframes pulse {
      0% { 
        transform: scale(1);
        opacity: 1;
      }
      50% { 
        transform: scale(1.2);
        opacity: 0.7;
      }
      100% { 
        transform: scale(1);
        opacity: 1;
      }
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    /* 타이핑 영역 스크롤바 스타일 */
    div[id^="typing-content-"]::-webkit-scrollbar {
      width: 6px;
    }
    
    div[id^="typing-content-"]::-webkit-scrollbar-track {
      background: #F0F0F0;
      border-radius: 3px;
    }
    
    div[id^="typing-content-"]::-webkit-scrollbar-thumb {
      background: #BF9780;
      border-radius: 3px;
    }
    
    div[id^="typing-content-"]::-webkit-scrollbar-thumb:hover {
      background: #A67E69;
    }
  `;
  document.head.appendChild(style);
}

// Export for use in content_script.js
window.AnalysisPanel = AnalysisPanel;

// 테스트용 함수들
window.testStreamingAnalysis = function() {
  const panel = window.analysisPanel || new AnalysisPanel();
  
  // 테스트 데이터
  const testData = {
    '진위': '이 뉴스는 사실로 확인되었습니다.',
    '근거': '여러 신뢰할 만한 언론사에서 동일한 내용을 보도했으며, 공식 기관의 발표와 일치합니다.',
    '분석': '종합적으로 검토한 결과, 해당 뉴스의 내용은 팩트체크를 통과했습니다.'
  };
  
  console.log('스트리밍 분석 테스트 시작');
  panel.startStreamingAnalysis('current', testData);
};

window.testStreamingText = function() {
  const panel = window.analysisPanel || new AnalysisPanel();
  
  // 실제 스트리밍 형태의 텍스트 테스트
  const streamingText = '"진위": "이 뉴스는 사실입니다"';
  
  console.log('스트리밍 텍스트 테스트 시작');
  panel.updateStreamingResult('current', streamingText);
};

window.testProgressiveStreaming = function() {
  const panel = window.analysisPanel || new AnalysisPanel();
  
  // 점진적 스트리밍 시뮬레이션
  setTimeout(() => {
    console.log('1단계: 진위 분석 시작');
    panel.updateStreamingResult('current', '{"진위": ""}');
  }, 500);
  
  setTimeout(() => {
    console.log('2단계: 진위 결과');
    panel.updateStreamingResult('current', '{"진위": "이 뉴스는 사실로 확인되었습니다."}');
  }, 1500);
  
  setTimeout(() => {
    console.log('3단계: 근거 분석 시작');
    panel.updateStreamingResult('current', '{"진위": "이 뉴스는 사실로 확인되었습니다.", "근거": ""}');
  }, 3000);
  
  setTimeout(() => {
    console.log('4단계: 근거 결과');
    panel.updateStreamingResult('current', '{"진위": "이 뉴스는 사실로 확인되었습니다.", "근거": "여러 신뢰할 만한 출처에서 확인되었습니다."}');
  }, 4500);
  
  setTimeout(() => {
    console.log('5단계: 분석 시작');
    panel.updateStreamingResult('current', '{"진위": "이 뉴스는 사실로 확인되었습니다.", "근거": "여러 신뢰할 만한 출처에서 확인되었습니다.", "분석": ""}');
  }, 6000);
  
  setTimeout(() => {
    console.log('6단계: 최종 분석 완료');
    panel.updateStreamingResult('current', '{"진위": "이 뉴스는 사실로 확인되었습니다.", "근거": "여러 신뢰할 만한 출처에서 확인되었습니다.", "분석": "종합적으로 검토한 결과 신뢰할 만한 뉴스입니다."}');
  }, 7500);
};

window.testMessyJsonStreaming = function() {
  const panel = window.analysisPanel || new AnalysisPanel();
  
  // 지저분한 JSON 형식들 테스트
  const messyFormats = [
    '"진위":"사실입니다",',
    '{"진위": "사실입니다", "근거":',
    '"근거": "출처가 확실합니다"}',
    '진위: 사실입니다',
    "'분석': '신뢰할 만합니다'"
  ];
  
  messyFormats.forEach((format, index) => {
    setTimeout(() => {
      console.log(`지저분한 JSON 테스트 ${index + 1}:`, format);
      panel.updateStreamingResult('current', format);
    }, index * 2000);
  });
};
