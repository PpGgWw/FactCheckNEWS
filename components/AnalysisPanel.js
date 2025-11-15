// AnalysisPanel.js - 뉴스 분석 패널 컴포넌트 (리팩토링됨)

class AnalysisPanel {
  constructor() {
    this.panelId = 'news-analysis-panel';
    this.newsBlocks = new Map(); // 분석된 뉴스 블록들을 관리하는 Map
    this.currentNews = null; // 현재 페이지의 뉴스
    this.blockIdCounter = 0; // 고유 ID 생성용
    this.streamingResults = new Map(); // 실시간 스트리밍 결과 저장
    this.analysisTimeouts = new Map(); // 분석 타임아웃 관리
    this.abortControllers = new Map(); // API 요청 중단용 AbortController
    
    // 실시간 타이핑 효과 관련 속성
    this.typingSpeed = 30; // 타이핑 속도 (ms)
    this.currentTypingIntervals = new Map(); // 현재 타이핑 중인 인터벌들
    this.analysisSteps = ['분석진행', '진위', '근거', '분석', '요약']; // 분석 단계
    this.panelOpacity = this.getPanelOpacitySetting();
    this.isHistoryCollapsed = this.getCollapsedStateSetting(); // localStorage에서 복원
    this.expandedPanelWidth = null;
    this.expandedPanelWidthValue = '';
    this.expandedPanelMinWidthValue = '';
    this.expandedPanelMaxWidthValue = '';
    this.palette = {
      base: '#0D0D0D',
      surface: '#485059',
      surfaceAlt: '#594539',
      accent: '#8C6E54',
      text: '#F2F2F2',
      textMuted: 'rgba(242, 242, 242, 0.75)',
      border: 'rgba(242, 242, 242, 0.08)'
    };

    this.pageWrapper = null;
    this.originalBodyStyles = null;
    this.originalWrapperStyles = null;
    this.originalHtmlOverflow = null;
    this.originalHtmlHeight = null;
    this.originalWindowScrollTo = null;
    this.originalWindowScrollBy = null;
    this.scrollPropertyDescriptors = null;
    this.scrollPropsOverridden = false;
    this.savedScrollPosition = { top: 0, left: 0 };
    this.boundWrapperScrollHandler = null;
    this.currentPageOffset = 0;
    this.activeDetailOverlay = null;
    this.detailEscapeHandler = null;
    this.preDetailFocus = null;
    this.crossVerificationInProgress = new Set(); // 교차 검증 중인 블록 ID들
    this.crossVerificationDepth = this.getCrossVerificationDepthSetting(); // 교차 검증 단계 수 (기본 3)
    
    // Google Search API 관련
    this.searchCache = new Map(); // 메모리 캐시 (세션 내)
    this.USE_REAL_API = this.getGoogleSearchEnabled();
    this.searchInProgress = new Set();
    
    // 영구 저장소 (localStorage) - API 효율성
    this.loadPersistentCache(); // 검색 결과 및 크롤링 결과 로드
    
    // 저장된 뉴스 블록 데이터 로드
    this.loadSavedNewsBlocks();
  }

  // 메인 패널 생성
  create() {
    const existingPanel = document.getElementById(this.panelId);
    if (existingPanel) {
      this.applyPanelLayout(existingPanel);
      return existingPanel;
    }

    const panelContainer = document.createElement('div');
    panelContainer.id = this.panelId;
    panelContainer.className = 'analysis-panel-base';
    panelContainer.dataset.open = 'false';
    panelContainer.dataset.desktopWidth = '520';
    
    // 초기 상태를 완전히 숨김으로 설정
  panelContainer.style.opacity = '0';
  panelContainer.style.transform = 'translateX(100%)';
  panelContainer.style.display = 'none';
  panelContainer.style.animation = 'none';
    
    document.body.appendChild(panelContainer);

    this.applyPanelLayout(panelContainer);

    panelContainer.dataset.userOpacity = String(this.panelOpacity);
    this.applyPanelOpacity(this.panelOpacity);
    
    // 반응형 리사이즈 이벤트 추가
    this.addResponsiveListener(panelContainer);
    
    // 초기 컨텐츠 렌더링
    this.renderPanel(panelContainer);
    
    return panelContainer;
  }

  // 두 색상을 블렌딩하는 헬퍼 함수
  blendColors(color1, color2, ratio) {
    // hex 색상을 RGB로 변환
    const hex2rgb = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return [r, g, b];
    };
    
    // RGB를 hex로 변환
    const rgb2hex = (r, g, b) => {
      return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    };
    
    const [r1, g1, b1] = hex2rgb(color1);
    const [r2, g2, b2] = hex2rgb(color2);
    
    const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
    const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
    const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
    
    return rgb2hex(r, g, b);
  }

  // HEX 색상을 RGBA로 변환
  hexToRgba(hex, alpha = 1) {
    const sanitized = hex.replace('#', '');
    const bigint = parseInt(sanitized, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Gemini 응답 포맷 차이를 흡수해 일관된 구조로 변환
  parseAnalysisResult(result) {
    const empty = { normalizedResult: null, verdict: null, suspicious: null };

    try {
      if (result === null || typeof result === 'undefined') {
        return empty;
      }

      const unwrap = (data) => {
        if (!data) return null;

        if (typeof data === 'string') {
          let trimmed = data.trim();

          if (typeof this.extractJsonFromAiResponse === 'function') {
            const extracted = this.extractJsonFromAiResponse(trimmed);
            if (extracted) {
              return unwrap(extracted);
            }
          }

          // 마크다운 코드 블록 제거 (```json ... ```)
          const fencedRegex = /^```(?:json)?[\t ]*\r?\n?([\s\S]*?)\r?\n?```$/i;
          const jsonFenceMatch = trimmed.replace(/\r\n/g, '\n').match(fencedRegex);
          if (jsonFenceMatch) {
            trimmed = jsonFenceMatch[1].trim();
          }
          
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
              return unwrap(JSON.parse(trimmed));
            } catch {
              return data;
            }
          }
          return data;
        }

        if (Array.isArray(data)) {
          if (data.length === 0) return null;
          const first = data[0];
          if (first && typeof first === 'object' && 'output' in first) {
            return unwrap(first.output);
          }
          return unwrap(first);
        }

        if (data && typeof data === 'object' && 'output' in data) {
          return unwrap(data.output);
        }

        return data;
      };

      const normalizedResult = unwrap(result);

      if (!normalizedResult || typeof normalizedResult !== 'object') {
        return { normalizedResult, verdict: null, suspicious: null };
      }

      const verdict =
        normalizedResult.진위 ||
        normalizedResult.verdict ||
        normalizedResult.result?.진위 ||
        normalizedResult.result?.verdict;

      const suspicious =
        normalizedResult.수상한문장 ||
        normalizedResult.수상문장 ||
        normalizedResult.suspicious ||
        normalizedResult.suspiciousSentences ||
        normalizedResult.result?.수상한문장 ||
        normalizedResult.result?.suspicious;

      return { normalizedResult, verdict, suspicious };
    } catch (error) {
      console.error('[parseAnalysisResult] 결과 파싱 실패:', error);
      return empty;
    }
  }

  // chrome.storage에 저장된 진위 결과 삭제
  removeSavedVerdict(rawUrl) {
    if (!rawUrl || !this.isChromeApiAvailable()) {
      return;
    }

    const normalizeUrl = (urlString) => {
      try {
        const urlObj = new URL(urlString);
        return urlObj.origin + urlObj.pathname;
      } catch {
        return urlString;
      }
    };

    const normalizedUrl = normalizeUrl(rawUrl);

    try {
      chrome.storage.local.get(['factcheck_verdicts'], (data) => {
        if (chrome.runtime.lastError) {
          console.error('[removeSavedVerdict] storage.get 에러:', chrome.runtime.lastError);
          return;
        }

        const verdicts = data.factcheck_verdicts || {};

        if (!Object.prototype.hasOwnProperty.call(verdicts, normalizedUrl)) {
          return;
        }

        delete verdicts[normalizedUrl];

        chrome.storage.local.set({ factcheck_verdicts: verdicts }, () => {
          if (chrome.runtime.lastError) {
            console.error('[removeSavedVerdict] storage.set 에러:', chrome.runtime.lastError);
          } else {
            console.log('[removeSavedVerdict] ✅ 진위 결과 삭제 완료:', normalizedUrl);
          }
        });
      });
    } catch (error) {
      console.error('[removeSavedVerdict] 저장된 진위 결과 삭제 실패:', error);
    }
  }

  // 페이지 래퍼 생성 또는 반환
  ensurePageWrapper() {
    // 페이지 밀기 기능 비활성화 - 패널을 오버레이로만 표시
    return null;
  }

  // 패널 레이아웃 적용 (우측 슬라이드만 - 모바일/데스크톱 통일)
  applyPanelLayout(panelContainer) {
    // 모바일/데스크톱 모두 우측에서 슬라이드
    panelContainer.style.position = 'fixed';
    panelContainer.style.top = '0';
    panelContainer.style.right = '0';
    panelContainer.style.bottom = '0';
    panelContainer.style.left = 'auto';
    panelContainer.style.height = '100vh';
    panelContainer.style.maxHeight = '100vh';
  panelContainer.style.borderRadius = '20px 0 0 20px';
    panelContainer.style.boxShadow = '-4px 0 24px rgba(0, 0, 0, 0.25)';

    const desktopWidth = parseInt(panelContainer.dataset.desktopWidth || '520', 10);
    panelContainer.style.width = `${desktopWidth}px`;
    panelContainer.style.minWidth = `${Math.max(320, desktopWidth * 0.6)}px`;
    panelContainer.style.maxWidth = `${Math.min(800, desktopWidth * 1.5)}px`;
    panelContainer.style.transform = panelContainer.dataset.open === 'true' ? 'translateX(0)' : 'translateX(100%)';

    panelContainer.style.zIndex = '2147483647';
    panelContainer.style.display = 'flex';
    panelContainer.style.flexDirection = 'column';
    panelContainer.style.background = this.palette.base;
    panelContainer.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
    panelContainer.style.overflow = 'hidden auto';  // overflow-x: hidden, overflow-y: auto
  }

  // 페이지 오프셋 업데이트 (비활성화 - 페이지를 밀지 않음)
  updatePageOffset(panelWidth) {
    // 페이지 밀기 기능 비활성화 - 아무 작업도 하지 않음
    console.log('[UpdateOffset] 페이지 밀기 비활성화됨');
    return;
  }

  // 진위 여부에 따른 색상 반환
  getVerdictColors(verdict) {
    const palette = {
      '진짜 뉴스': {
        base: '#22C55E',
        badgeBackground: 'rgba(34, 197, 94, 0.18)',
        badgeText: '#BBF7D0',
        badgeBorder: 'rgba(34, 197, 94, 0.55)'
      },
      '가짜일 가능성이 있는 뉴스': {
        base: '#F59E0B',
        badgeBackground: 'rgba(245, 158, 11, 0.18)',
        badgeText: '#FDE68A',
        badgeBorder: 'rgba(245, 158, 11, 0.55)'
      },
      '가짜일 가능성이 높은 뉴스': {
        base: '#F97316',
        badgeBackground: 'rgba(249, 115, 22, 0.18)',
        badgeText: '#FDBA74',
        badgeBorder: 'rgba(249, 115, 22, 0.55)'
      },
      '가짜 뉴스': {
        base: '#EF4444',
        badgeBackground: 'rgba(239, 68, 68, 0.18)',
        badgeText: '#FCA5A5',
        badgeBorder: 'rgba(239, 68, 68, 0.55)'
      }
    };

    const selected = palette[verdict] || palette['가짜일 가능성이 있는 뉴스'];
    return {
      ...selected,
      shadow: this.hexToRgba(selected.base, 0.35),
      border: this.hexToRgba(selected.base, 0.45)
    };
  }

  // 패널 표시
  show() {
    const panel = document.getElementById(this.panelId);
    if (!panel) return;
    
    console.log('[Show] Opening panel');
    
    // 1. display를 먼저 설정
    panel.style.display = 'flex';
    
    // 2. 초기 상태 강제 설정 (애니메이션 시작점)
    panel.dataset.open = 'false';
    panel.style.opacity = '0';
    panel.style.transform = 'translateX(100%)';
    
    // 3. 레이아웃 적용
    this.applyPanelLayout(panel);

    if (this.isHistoryCollapsed) {
      this.togglePanelCollapse(true);
    }
    
    // 4. 강제 reflow로 초기 상태 확정
    void panel.offsetHeight;

    // 5. 애니메이션 시작
    requestAnimationFrame(() => {
      panel.dataset.open = 'true';
      const targetOpacity = this.panelOpacity ?? this.getPanelOpacitySetting();
      const measuredWidth = panel.getBoundingClientRect().width;
      
      // 패널 애니메이션 - 항상 우->좌
      panel.style.opacity = String(targetOpacity);
      panel.style.transform = 'translateX(0)';
      
      if (!this.isHistoryCollapsed) {
        panel.dataset.desktopWidth = String(Math.round(measuredWidth));
      }
      
      console.log('[Show] Panel animation started, opacity:', targetOpacity, 'width:', measuredWidth);
    });
  }

  // 패널 숨기기
  hide() {
    const panel = document.getElementById(this.panelId);
    if (!panel) return;
    
    this.closeDetailInPanel(true);

    console.log('[Hide] Closing panel');
    
    // 패널 닫기 애니메이션 - 항상 좌->우
    panel.dataset.open = 'false';
    panel.style.transform = 'translateX(100%)';
    panel.style.opacity = '0';
    
    console.log('[Hide] Panel closing animation started');
    
    // 애니메이션 완료 후 정리
    setTimeout(() => {
      if (panel.dataset.open === 'false') {
        panel.style.display = 'none';
        console.log('[Hide] Panel closed');
        this.createFloatingButton();
      }
    }, 150);
  }

  // 반응형 리사이즈 리스너 추가
  addResponsiveListener(panelContainer) {
    const resizeHandler = () => {
      if (!document.body.contains(panelContainer)) {
        return;
      }

      this.applyPanelLayout(panelContainer);

      if (panelContainer.dataset.open === 'true') {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
          this.updatePageOffset(0);
        } else {
          const measuredWidth = panelContainer.getBoundingClientRect().width;
          this.updatePageOffset(measuredWidth);
        }
      } else {
        this.updatePageOffset(0);
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

        @property --glow-opacity {
          syntax: '<number>';
          inherits: false;
          initial-value: 0;
        }

        @property --glow-scale {
          syntax: '<number>';
          inherits: false;
          initial-value: 1;
        }

        @property --glow-blur {
          syntax: '<length>';
          inherits: false;
          initial-value: 0px;
        }

        .news-block {
          position: relative;
          transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.8s cubic-bezier(0.4, 0, 0.2, 1), --glow-opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), --glow-scale 0.8s cubic-bezier(0.4, 0, 0.2, 1), --glow-blur 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: var(--base-box-shadow, 0 4px 12px rgba(0, 0, 0, 0.25));
          --glow-opacity: var(--glow-opacity-base, 0);
          --glow-scale: var(--glow-scale-base, 1);
          --glow-blur: var(--glow-blur-base, 0px);
        }

        .news-block--interactive {
          cursor: pointer;
        }

        .news-block--interactive:hover {
          transform: translateY(-4px) scale(1.01);
          box-shadow: var(--hover-box-shadow, var(--base-box-shadow, 0 4px 12px rgba(0, 0, 0, 0.25)));
          --glow-opacity: var(--glow-opacity-hover, var(--glow-opacity-base, 0));
          --glow-scale: var(--glow-scale-hover, var(--glow-scale-base, 1));
          --glow-blur: var(--glow-blur-hover, var(--glow-blur-base, 0px));
        }

        .news-block--glow::before {
          content: '';
          position: absolute;
          inset: -20px;
          border-radius: inherit;
          background: radial-gradient(circle at center, var(--glow-color, rgba(255, 255, 255, 0.5)) 0%, rgba(0, 0, 0, 0) 72%);
          opacity: var(--glow-opacity);
          transform: scale(var(--glow-scale));
          filter: blur(var(--glow-blur));
          transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: -1;
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
    }
  const { base, surface, surfaceAlt, accent, text, textMuted, border } = this.palette;
    const surfaceSoft = this.blendColors(surface, base, 0.35);
    const surfaceAltSoft = this.blendColors(surfaceAlt, base, 0.4);

    panel.innerHTML = `
      ${this.renderHeader()}
      
      <!-- 현재 뉴스 블록 (고정) -->
      <div id="current-news-section" class="analysis-panel-collapsible" style="
        padding: 20px;
        background: linear-gradient(180deg, ${surface} 0%, ${surfaceAltSoft} 100%);
        border-bottom: 1px solid ${border};
        flex-shrink: 0;
      ">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
          <h3 style="
            font-size: 16px;
            font-weight: 600;
            color: ${text};
            margin: 0;
          ">
            현재 페이지
          </h3>
        </div>
        <div id="current-news-container" style="
          background: ${surfaceSoft};
          border-radius: 12px;
          border: 1px solid ${border};
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.25);
          overflow: hidden;
        ">
          ${this.renderCurrentNews()}
        </div>
      </div>
      
      <!-- 분석된 뉴스 리스트 (스크롤) -->
      <div class="analysis-panel-list-wrapper" style="
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: linear-gradient(180deg, ${base} 0%, rgba(13, 13, 13, 0.92) 100%);
      ">
        <div style="
          padding: 20px 20px 12px 20px;
          flex-shrink: 0;
          background: linear-gradient(180deg, ${surfaceAlt} 0%, ${surface} 100%);
          border-bottom: 1px solid ${border};
          box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.4);
        ">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <button id="collapse-history-btn" style="
                width: 32px;
                height: 32px;
                background: rgba(140, 110, 84, 0.16);
                border: 1px solid rgba(140, 110, 84, 0.4);
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                backdrop-filter: blur(10px);
                flex-shrink: 0;
                color: ${text};
              " onmouseover="this.style.background='rgba(140, 110, 84, 0.3)'; this.style.transform='scale(1.05)';" 
                 onmouseout="this.style.background='rgba(140, 110, 84, 0.16)'; this.style.transform='scale(1)';">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 18l6-6-6-6"></path>
                </svg>
              </button>
              <h3 class="analysis-panel-collapsible" style="
                font-size: 16px;
                font-weight: 600;
                color: ${text};
                margin: 0;
              ">
                분석 기록
              </h3>
            </div>
            <span id="analysis-count" class="analysis-panel-collapsible" style="
              background: rgba(140, 110, 84, 0.25);
              color: ${text};
              padding: 4px 10px;
              border-radius: 12px;
              font-size: 12px;
              font-weight: 600;
              min-width: 20px;
              text-align: center;
              border: 1px solid rgba(140, 110, 84, 0.45);
            ">${this.newsBlocks.size}</span>
          </div>
        </div>
        <div class="analysis-panel-collapsible" style="
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 16px 20px 20px 20px;
          background: linear-gradient(180deg, rgba(13, 13, 13, 0.94) 0%, ${base} 100%);
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

      <div id="collapsed-summary" style="
        display: none;
        flex-direction: column;
        gap: 14px;
        padding: 18px 20px 24px 20px;
        background: linear-gradient(180deg, ${this.blendColors(surface, base, 0.1)} 0%, rgba(13, 13, 13, 0.92) 100%);
        border-top: 1px solid ${border};
      ">
        ${this.renderCollapsedSummary()}
      </div>
    `;
    
    // panel에 AnalysisPanel 인스턴스 저장
    panel.__analysisPanel = this;
    
    this.attachEvents(panel);
    this.updateCollapsedSummary(panel);

    if (this.isHistoryCollapsed) {
      this.togglePanelCollapse(true);
    }
  }

  // 헤더 렌더링
  renderHeader() {
    const { accent, surfaceAlt, surface, text, textMuted, border } = this.palette;
    return `
      <div class="analysis-panel-collapsible" style="
        background: linear-gradient(135deg, ${surfaceAlt} 0%, ${accent} 100%);
        padding: 20px;
        border-bottom: none;
        border-radius: 20px 20px 0 0;
        flex-shrink: 0;
        position: relative;
        overflow: hidden;
      ">
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: radial-gradient(circle at 20% 50%, rgba(242, 242, 242, 0.15) 1px, transparent 1px),
                           radial-gradient(circle at 80% 50%, rgba(242, 242, 242, 0.15) 1px, transparent 1px);
          background-size: 50px 50px;
          pointer-events: none;
          opacity: 0.6;
        "></div>
        
        <div style="position: relative; z-index: 1;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="flex: 1;">
              <h2 style="
                font-size: 20px;
                font-weight: 700;
                color: ${text};
                margin: 0 0 4px 0;
                letter-spacing: -0.5px;
              ">뉴스 팩트체크</h2>
              <p style="
                font-size: 13px;
                color: ${textMuted};
                margin: 0;
                font-weight: 500;
              ">AI 기반 실시간 신뢰도 검증</p>
            </div>
            
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 6px; margin-right: 8px;">
                <div style="
                  width: 10px;
                  height: 10px;
                  background: #10B981;
                  border-radius: 50%;
                  animation: pulse 2s infinite;
                  box-shadow: 0 0 12px rgba(16, 185, 129, 0.6);
                "></div>
                <span style="
                  font-size: 11px;
                  color: ${textMuted};
                  font-weight: 500;
                ">연결됨</span>
              </div>
              
              <button id="settings-btn" style="
                width: 36px;
                height: 36px;
                background: rgba(13, 13, 13, 0.25);
                border: 1px solid ${border};
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 16px;
                backdrop-filter: blur(10px);
                color: ${text};
              " onmouseover="this.style.background='rgba(13, 13, 13, 0.4)'; this.style.transform='scale(1.05)';" 
                 onmouseout="this.style.background='rgba(13, 13, 13, 0.25)'; this.style.transform='scale(1)';">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              
              <button id="close-panel" style="
                width: 36px;
                height: 36px;
                background: rgba(13, 13, 13, 0.25);
                border: 1px solid ${border};
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 18px;
                font-weight: 300;
                backdrop-filter: blur(10px);
                color: ${text};
              " onmouseover="this.style.background='rgba(239, 68, 68, 0.25)'; this.style.transform='scale(1.05)';" 
                 onmouseout="this.style.background='rgba(13, 13, 13, 0.25)'; this.style.transform='scale(1)';">&times;</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 빈 상태 렌더링
  renderEmptyState() {
    const { surface, surfaceAlt, accent, text, textMuted, border, base } = this.palette;
    const cardBackground = this.blendColors(surface, base, 0.25);
    return `
      <div style="
        text-align: center; 
        padding: 40px 20px;
        background: ${cardBackground};
        border-radius: 12px;
        border: 1px solid ${border};
        box-shadow: 0 18px 32px rgba(0, 0, 0, 0.35);
      ">
        <div style="
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, ${surfaceAlt}, ${accent});
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        ">
          <span style="font-size: 24px;">📰</span>
        </div>
        <h4 style="
          font-size: 16px;
          font-weight: 600;
          color: ${text};
          margin: 0 0 8px 0;
        ">분석할 뉴스가 없습니다</h4>
        <p style="
          font-size: 13px;
          color: ${textMuted};
          margin: 0;
          line-height: 1.4;
        ">뉴스 기사를 선택하면<br>자동으로 분석을 시작합니다</p>
      </div>
    `;
  }

  // 현재 뉴스 렌더링
  renderCurrentNews() {
    const { textMuted } = this.palette;
    if (!this.currentNews) {
      return `
        <div style="
          text-align: center; 
          padding: 24px 16px;
          color: ${textMuted};
        ">
          <p style="
            font-size: 14px;
            margin: 0;
            line-height: 1.4;
            color: ${textMuted};
          ">현재 페이지에서<br>뉴스를 찾을 수 없습니다</p>
        </div>
      `;
    }
    
    return this.renderNewsBlock(this.currentNews, true);
  }

  // 분석된 뉴스들 렌더링
  renderAnalyzedNews() {
    const { surface, base, text, textMuted, border } = this.palette;
    const cardBackground = this.blendColors(surface, base, 0.25);
    if (this.newsBlocks.size === 0) {
      return `
        <div style="
          text-align: center; 
          padding: 32px 16px;
          background: ${cardBackground};
          border-radius: 12px;
          border: 1px solid ${border};
          color: ${text};
        ">
          <p style="
            font-size: 14px;
            color: ${textMuted};
            margin: 0;
            line-height: 1.4;
          ">아직 분석된 뉴스가 없습니다<br><span style='font-size: 12px; color: ${textMuted}; opacity: 0.8;'>뉴스를 선택하여 분석을 시작하세요</span></p>
        </div>
      `;
    }
    
    return Array.from(this.newsBlocks.values())
      .sort((a, b) => b.timestamp - a.timestamp) // 최신 뉴스가 맨 위로
      .map(block => this.renderNewsBlock(block, false))
      .join('');
  }

  renderCollapsedSummary() {
    const { surface, base, text, textMuted, border } = this.palette;
    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 15px; font-weight: 600; color: ${text};">간단 보기</span>
          <div style="display: flex; gap: 8px;">
            <button id="expand-panel-btn" style="
              padding: 6px 12px;
              border-radius: 7px;
              border: 1px solid rgba(140, 110, 84, 0.5);
              background: rgba(140, 110, 84, 0.22);
              color: ${text};
              font-size: 12px;
              cursor: pointer;
              transition: all 0.2s ease;
            " onmouseover="this.style.background='rgba(140, 110, 84, 0.34)';" onmouseout="this.style.background='rgba(140, 110, 84, 0.22)';">패널 확장</button>
            <button id="collapsed-close-btn" style="
              width: 30px;
              height: 30px;
              border-radius: 8px;
              border: 1px solid ${border};
              background: rgba(26, 26, 26, 0.55);
              color: ${text};
              font-size: 14px;
              cursor: pointer;
              line-height: 1;
              transition: all 0.2s ease;
            " onmouseover="this.style.background='rgba(26, 26, 26, 0.7)';" onmouseout="this.style.background='rgba(26, 26, 26, 0.55)';">✕</button>
          </div>
        </div>
        <div id="collapsed-current-container">
          ${this.renderCollapsedCurrentSection()}
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 15px; font-weight: 600; color: ${text};">분석 기록</span>
          <span id="collapsed-summary-count" style="font-size: 12px; color: ${textMuted}; opacity: 0.9;">${this.getCollapsedSummaryCountText()}</span>
        </div>
        <div id="collapsed-summary-list" style="
          display: flex;
          flex-direction: column;
          gap: 10px;
        ">
          ${this.renderCollapsedSummaryItems()}
        </div>
      </div>
    `;
  }

  renderCollapsedCurrentSection() {
    const { surface, base, text, textMuted, border } = this.palette;
    if (!this.currentNews) {
      return `
        <div style="
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid ${border};
          background: ${this.blendColors(surface, base, 0.24)};
          color: ${textMuted};
          font-size: 13px;
          text-align: center;
        ">현재 페이지에서 분석할 뉴스를 찾지 못했습니다</div>
      `;
    }

    const safeTitle = this.currentNews.title || '제목 없음';
    const status = this.currentNews.status || 'pending';
    const showAnalyzeBtn = status === 'pending' || status === 'error';
    const isAnalyzing = status === 'analyzing';
    const progress = this.currentNews.progress || '분석 중...';
    const statusBadge = this.getCollapsedStatusBadge(this.currentNews);
    
    return `
      <div style="
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 16px;
        border-radius: 12px;
        border: 1px solid ${border};
        background: ${this.blendColors(surface, base, 0.28)};
      ">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 14px; font-weight: 600; color: ${text};">현재 페이지</span>
            ${statusBadge}
          </div>
          <span style="
            font-size: 13px;
            color: ${text};
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          ">${safeTitle}</span>
        </div>
        ${showAnalyzeBtn ? `<button id="collapsed-current-analyze-btn" style="
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid rgba(140, 110, 84, 0.5);
          background: rgba(140, 110, 84, 0.28);
          color: ${text};
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        " onmouseover="this.style.background='rgba(140, 110, 84, 0.4)';" onmouseout="this.style.background='rgba(140, 110, 84, 0.28)';">분석하기</button>` : ''}
        ${isAnalyzing ? `
        <div style="
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid rgba(140, 110, 84, 0.5);
          background: rgba(140, 110, 84, 0.28);
          color: ${text};
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
        ">
          <div style="
            width: 10px;
            height: 10px;
            border: 2px solid ${text};
            border-top: 2px solid transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            flex-shrink: 0;
          "></div>
          <span class="collapsed-progress-text" style="
            line-height: 1.2;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
          ">${progress}</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  renderCollapsedSummaryItems() {
    const { surface, base, text, textMuted, border } = this.palette;
    const itemBackground = this.blendColors(surface, base, 0.28);
    const shimmerBorder = this.hexToRgba(border, 0.6);

    if (this.newsBlocks.size === 0) {
      return `
        <div style="
          padding: 16px;
          border-radius: 10px;
          border: 1px solid ${border};
          background: ${itemBackground};
          color: ${textMuted};
          font-size: 13px;
          text-align: center;
        ">아직 저장된 분석이 없습니다</div>
      `;
    }

    return Array.from(this.newsBlocks.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 3)
      .map(block => {
        const title = block.title || '제목 없음';
        const subtitle = this.formatRelativeTime(block.timestamp);
        const encodedUrl = block.url ? encodeURIComponent(block.url) : '';
        const showAnalyze = block.status === 'pending' || block.status === 'error';
        const statusBadge = this.getCollapsedStatusBadge(block);
        const analyzeButton = showAnalyze ? `
              <button class="mini-action-btn mini-analyze-btn" data-block-id="${block.id}" style="
                flex: 1 1 110px;
                padding: 6px 10px;
                border-radius: 6px;
                border: 1px solid rgba(140, 110, 84, 0.45);
                background: rgba(140, 110, 84, 0.22);
                color: ${text};
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
              " onmouseover="this.style.background='rgba(140, 110, 84, 0.34)';" onmouseout="this.style.background='rgba(140, 110, 84, 0.22)';">분석하기</button>` : '';
        const openButton = encodedUrl ? `
              <button class="mini-action-btn mini-open-btn" data-url="${encodedUrl}" style="
                flex: 1 1 90px;
                padding: 6px 10px;
                border-radius: 6px;
                border: 1px solid rgba(242, 242, 242, 0.2);
                background: rgba(26, 26, 26, 0.5);
                color: ${text};
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
              " onmouseover="this.style.background='rgba(26, 26, 26, 0.65)';" onmouseout="this.style.background='rgba(26, 26, 26, 0.5)';">원문 열기</button>` : '';
        return `
          <div class="collapsed-summary-item" data-block-id="${block.id}" data-url="${encodedUrl}" data-status="${block.status}" style="
            padding: 12px 14px;
            border-radius: 10px;
            border: 1px solid ${shimmerBorder};
            background: ${itemBackground};
            display: flex;
            flex-direction: column;
            gap: 8px;
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 24px rgba(0,0,0,0.25)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span style="
                font-size: 13px;
                font-weight: 600;
                color: ${text};
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
              ">${title}</span>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-size: 12px; color: ${textMuted};">${subtitle}</span>
                ${statusBadge}
              </div>
            </div>
            <div class="collapsed-summary-actions" style="
              display: flex;
              gap: 6px;
              flex-wrap: wrap;
            ">
              ${analyzeButton}
              ${openButton}
            </div>
          </div>
        `;
      })
      .join('');
  }

  getCollapsedSummaryCountText() {
    if (this.newsBlocks.size === 0) {
      return '저장된 분석이 없습니다';
    }
    const previewCount = Math.min(this.newsBlocks.size, 3);
    return `최근 ${previewCount}개 항목 미리보기`;
  }

  getCollapsedStatusBadge(block) {
    const { text, accent, textMuted } = this.palette;
    const baseStyle = `display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;`;

    switch (block.status) {
      case 'pending':
        return `<span style="${baseStyle} background: rgba(140, 110, 84, 0.18); color: ${text}; border: 1px solid rgba(140, 110, 84, 0.45);">대기 중</span>`;
      case 'analyzing':
        return `<span style="${baseStyle} background: rgba(59, 130, 246, 0.2); color: ${text}; border: 1px solid rgba(59, 130, 246, 0.45);">분석 중</span>`;
      case 'error':
        return `<span style="${baseStyle} background: rgba(239, 68, 68, 0.2); color: ${text}; border: 1px solid rgba(239, 68, 68, 0.45);">재시도 필요</span>`;
      case 'completed':
        if (block.result && block.result.진위) {
          const verdictColors = this.getVerdictColors(block.result.진위);
          return `<span style="${baseStyle} background: ${verdictColors.badgeBackground}; color: ${verdictColors.badgeText}; border: 1px solid ${verdictColors.badgeBorder};">${block.result.진위}</span>`;
        }
        return `<span style="${baseStyle} background: rgba(16, 185, 129, 0.18); color: ${text}; border: 1px solid rgba(16, 185, 129, 0.45);">완료</span>`;
      default:
        return `<span style="${baseStyle} background: rgba(107, 114, 128, 0.25); color: ${textMuted}; border: 1px solid rgba(107, 114, 128, 0.35);">알 수 없음</span>`;
    }
  }

  resetBlockForAnalysis(blockId) {
    const block = this.newsBlocks.get(blockId);
    if (!block) {
      return false;
    }
    block.status = 'pending';
    block.result = null;
    block.progress = null;
    block.error = null;
    block.timestamp = Date.now();
    this.saveNewsBlocks();
    return true;
  }

  formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 30) return '방금 전';
    if (seconds < 60) return `${seconds}초 전`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}일 전`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}주 전`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}개월 전`;
    const years = Math.floor(days / 365);
    return `${years}년 전`;
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
    const { base, surface, surfaceAlt, accent, text, textMuted, border } = this.palette;
    const encodedUrl = encodeURIComponent(url || '');
    const isCompleted = status === 'completed';
    const isCompareMode = block.compareMode || false;
    const verdictColors = result && result.진위 ? this.getVerdictColors(result.진위) : null;
    const hasGlow = isCompleted && verdictColors && !isCompareMode;
    const glowColor = hasGlow ? verdictColors.base : null;

    const defaultBackground = this.blendColors(surface, base, isCurrent ? 0.28 : 0.22);
    const compareBackground = this.blendColors(accent, base, 0.32);
    let blockBackground = isCompareMode ? compareBackground : defaultBackground;
    let borderColor = isCompareMode ? this.hexToRgba(accent, 0.6) : 'rgba(140, 110, 84, 0.55)';
    let boxShadow = isCompareMode ? '0 14px 26px rgba(0, 0, 0, 0.35)' : '0 4px 12px rgba(0, 0, 0, 0.25)';
    let neonGlow = '';
    let hoverNeonGlow = '';

    if (hasGlow) {
      blockBackground = this.blendColors(verdictColors.base, base, 0.2);
      borderColor = verdictColors.border;
      boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';

    neonGlow = `0 0 32px ${this.hexToRgba(glowColor, 0.26)}, 0 0 68px ${this.hexToRgba(glowColor, 0.14)}, 0 0 120px ${this.hexToRgba(glowColor, 0.08)}, inset 0 0 100px ${this.hexToRgba(glowColor, 0.06)}`;
    hoverNeonGlow = `0 0 50px ${this.hexToRgba(glowColor, 0.48)}, 0 0 110px ${this.hexToRgba(glowColor, 0.26)}, 0 0 160px ${this.hexToRgba(glowColor, 0.14)}, inset 0 0 130px ${this.hexToRgba(glowColor, 0.1)}`;
    }

    const baseBoxShadow = neonGlow ? `${boxShadow}, ${neonGlow}` : boxShadow;
    const hoverBoxShadow = hasGlow ? `${boxShadow}, ${hoverNeonGlow}` : '0 12px 24px rgba(0, 0, 0, 0.35)';
    const isClickable = isCompleted && !isCompareMode;
    const cursorStyle = isClickable ? 'cursor: pointer;' : '';
    const blockOpacity = isCompareMode ? '0.8' : '1';

    let actionButtons = '';

    const primaryButtonBase = "rgba(140, 110, 84, 0.28)";
    const primaryButtonBorder = "rgba(140, 110, 84, 0.5)";
    const primaryButtonHover = "rgba(140, 110, 84, 0.4)";
    const neutralButtonBase = "rgba(26, 26, 26, 0.62)";
    const neutralButtonHover = "rgba(26, 26, 26, 0.5)";
    const dangerButtonBase = "rgba(239, 68, 68, 0.25)";
    const dangerButtonHover = "rgba(239, 68, 68, 0.4)";

    if (isCurrent) {
      switch (status) {
        case 'pending':
          actionButtons = `
            <button class="analyze-current-btn" data-id="${id}" style="
              background: ${primaryButtonBase};
              color: ${text};
              padding: 8px 16px;
              border-radius: 6px;
              font-size: 14px;
              border: 1px solid ${primaryButtonBorder};
              cursor: pointer;
              transition: all 0.2s;
              width: 100%;
              backdrop-filter: blur(8px);
            " onmouseover="this.style.background='${primaryButtonHover}'" onmouseout="this.style.background='${primaryButtonBase}'">분석하기</button>
          `;
          break;
        case 'analyzing':
          actionButtons = `
            <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
              <button class="analyzing-progress-btn" data-id="${id}" disabled style="
                background: ${primaryButtonHover};
                color: ${text};
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 40px;
                font-weight: 500;
                border: 1px solid ${primaryButtonBorder};
                backdrop-filter: blur(10px);
                cursor: wait;
              ">
                <div style="
                  width: 12px;
                  height: 12px;
                  border: 2px solid ${text};
                  border-top: 2px solid transparent;
                  border-radius: 50%;
                  margin-right: 6px;
                  animation: spin 1s linear infinite;
                  flex-shrink: 0;
                "></div>
                <span class="progress-text" style="
                  line-height: 1.2;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                ">${progress || '분석 중...'}</span>
              </button>
              <button class="stop-analysis-btn" data-id="${id}" style="
                background: ${dangerButtonBase};
                color: ${text};
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 14px;
                border: 1px solid rgba(239, 68, 68, 0.5);
                cursor: pointer;
                transition: all 0.2s;
                backdrop-filter: blur(8px);
                white-space: nowrap;
              " onmouseover="this.style.background='${dangerButtonHover}'" onmouseout="this.style.background='${dangerButtonBase}'">정지</button>
            </div>
          `;
          break;
        case 'completed':
        case 'error':
          actionButtons = `
            <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
              <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                <button class="analyze-current-btn" data-id="${id}" style="
                  background: ${primaryButtonBase};
                  color: ${text};
                  padding: 8px 16px;
                  border-radius: 6px;
                  font-size: 14px;
                  border: 1px solid ${primaryButtonBorder};
                  cursor: pointer;
                  transition: all 0.2s;
                  flex: 1;
                  backdrop-filter: blur(8px);
                " onmouseover="this.style.background='${primaryButtonHover}'" onmouseout="this.style.background='${primaryButtonBase}'">다시 분석</button>
                ${isCompleted && !block.crossVerified && id !== 'current' ? `
                <button class="cross-verify-btn" data-id="${id}" style="
                  background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.3));
                  color: ${text};
                  padding: 8px 16px;
                  border-radius: 6px;
                  font-size: 14px;
                  border: 1px solid rgba(99, 102, 241, 0.5);
                  cursor: pointer;
                  transition: all 0.2s;
                  flex: 1;
                  backdrop-filter: blur(8px);
                  font-weight: 600;
                " onmouseover="this.style.background='linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(139, 92, 246, 0.4))'" onmouseout="this.style.background='linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.3))'">🔄 교차 검증</button>
                ` : ''}
                ${isCompleted && block.crossVerified && id !== 'current' ? `
                <button disabled style="
                  background: rgba(99, 102, 241, 0.15);
                  color: rgba(242, 242, 242, 0.5);
                  padding: 8px 16px;
                  border-radius: 6px;
                  font-size: 14px;
                  border: 1px solid rgba(99, 102, 241, 0.3);
                  cursor: not-allowed;
                  flex: 1;
                  backdrop-filter: blur(8px);
                  font-weight: 600;
                ">✓ 검증 완료</button>
                ` : ''}
                ${isCompleted ? `
                <button class="open-site-btn" data-id="${id}" data-url="${encodedUrl}" style="
                  background: ${neutralButtonBase};
                  color: ${text};
                  padding: 8px 18px;
                  border-radius: 6px;
                  font-size: 14px;
                  border: 1px solid ${border};
                  cursor: pointer;
                  transition: all 0.2s;
                  flex: 1.2;
                  white-space: nowrap;
                  backdrop-filter: blur(6px);
                " onmouseover="this.style.background='${neutralButtonHover}'" onmouseout="this.style.background='${neutralButtonBase}'">사이트 이동</button>
                ` : ''}
              </div>
              ${isCompleted && verdictColors && block.crossVerified && id !== 'current' ? `
                <div style="display: flex; gap: 8px; align-items: center;">
                  <div style="
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2));
                    color: rgba(99, 102, 241, 1);
                    border: 1px solid rgba(99, 102, 241, 0.4);
                    padding: 6px 12px;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 600;
                    text-align: center;
                    white-space: nowrap;
                  ">🔄 2차 검증</div>
                </div>
              ` : ''}
            </div>
          `;
          break;
      }
    } else {
      if (status === 'analyzing') {
        actionButtons = `
          <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
            <div style="
              background: ${primaryButtonHover};
              color: ${text};
              padding: 8px 12px;
              border-radius: 6px;
              font-size: 12px;
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 40px;
              font-weight: 500;
              border: 1px solid ${primaryButtonBorder};
              backdrop-filter: blur(10px);
            ">
              <div style="
                width: 12px;
                height: 12px;
                border: 2px solid ${text};
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
            <button class="stop-analysis-btn" data-id="${id}" style="
              background: ${dangerButtonBase};
              color: ${text};
              padding: 8px 12px;
              border-radius: 6px;
              font-size: 14px;
              border: 1px solid rgba(239, 68, 68, 0.5);
              cursor: pointer;
              transition: all 0.2s;
              backdrop-filter: blur(8px);
              white-space: nowrap;
            " onmouseover="this.style.background='${dangerButtonHover}'" onmouseout="this.style.background='${dangerButtonBase}'">정지</button>
          </div>
        `;
      } else {
        const compareButtonText = isCompareMode ? '취소' : '비교';

        actionButtons = `
          <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
            ${isCompleted ? `
            <button class="open-site-btn" data-id="${id}" data-url="${encodedUrl}" style="
              background: ${neutralButtonBase};
              color: ${text};
              padding: 8px 16px;
              border-radius: 6px;
              font-size: 14px;
              border: 1px solid ${border};
              cursor: pointer;
              transition: all 0.2s;
              flex: 1;
              white-space: nowrap;
              backdrop-filter: blur(6px);
            " onmouseover="this.style.background='${neutralButtonHover}'" onmouseout="this.style.background='${neutralButtonBase}'">사이트 이동</button>
            ` : ''}
            <div style="position: relative; flex: 1; z-index: 10;">
              <button class="more-menu-btn" data-id="${id}" style="
                background: ${primaryButtonBase};
                color: ${text};
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 14px;
                border: 1px solid ${primaryButtonBorder};
                cursor: pointer;
                transition: all 0.2s;
                width: 100%;
                backdrop-filter: blur(8px);
              " onmouseover="this.style.background='${primaryButtonHover}'" onmouseout="this.style.background='${primaryButtonBase}'">더보기 ▼</button>
              <div class="more-menu-dropdown" data-id="${id}" style="
                display: none;
                position: absolute;
                top: auto;
                bottom: calc(100% + 4px);
                right: 0;
                background: ${this.hexToRgba(surface, 0.98)};
                border: 1px solid ${border};
                border-radius: 8px;
                padding: 4px;
                min-width: 210px;
                max-height: 300px;
                overflow-y: auto;
                z-index: 9999;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(12px);
              ">
                ${isCompleted && !block.crossVerified ? `
                <button class="cross-verify-btn" data-id="${id}" style="
                  background: transparent;
                  color: ${text};
                  padding: 10px 14px;
                  border: none;
                  border-radius: 6px;
                  font-size: 14px;
                  cursor: pointer;
                  width: 100%;
                  text-align: left;
                  transition: background 0.2s;
                  white-space: nowrap;
                " onmouseover="this.style.background='${this.hexToRgba(accent, 0.2)}'" onmouseout="this.style.background='transparent'">🔄 교차 검증</button>
                ` : ''}
                ${isCompleted && block.crossVerified ? `
                <button disabled style="
                  background: transparent;
                  color: ${this.hexToRgba(text, 0.5)};
                  padding: 10px 14px;
                  border: none;
                  border-radius: 6px;
                  font-size: 14px;
                  cursor: not-allowed;
                  width: 100%;
                  text-align: left;
                  white-space: nowrap;
                ">✓ 검증 완료</button>
                ` : ''}
                ${isCompleted ? `
                <button class="find-similar-btn" data-id="${id}" style="
                  background: transparent;
                  color: ${text};
                  padding: 10px 14px;
                  border: none;
                  border-radius: 6px;
                  font-size: 14px;
                  cursor: pointer;
                  width: 100%;
                  text-align: left;
                  transition: background 0.2s;
                  white-space: nowrap;
                " onmouseover="this.style.background='${this.hexToRgba(accent, 0.2)}'" onmouseout="this.style.background='transparent'">📰 유사 기사 찾기</button>
                ${block.factCheckResult ? `
                <button disabled style="
                  background: transparent;
                  color: ${this.hexToRgba(text, 0.5)};
                  padding: 10px 14px;
                  border: none;
                  border-radius: 6px;
                  font-size: 14px;
                  cursor: not-allowed;
                  width: 100%;
                  text-align: left;
                  white-space: nowrap;
                ">✓ 사실 검증 완료</button>
                ` : `
                <button class="fact-check-search-btn" data-id="${id}" style="
                  background: transparent;
                  color: ${text};
                  padding: 10px 14px;
                  border: none;
                  border-radius: 6px;
                  font-size: 14px;
                  cursor: pointer;
                  width: 100%;
                  text-align: left;
                  transition: background 0.2s;
                  white-space: nowrap;
                " onmouseover="this.style.background='${this.hexToRgba(accent, 0.2)}'" onmouseout="this.style.background='transparent'">🔍 사실 검증</button>
                `}
                ` : ''}
                ${isCompleted ? `
                <button class="debug-result-btn" data-id="${id}" style="
                  background: transparent;
                  color: ${text};
                  padding: 10px 14px;
                  border: none;
                  border-radius: 6px;
                  font-size: 14px;
                  cursor: pointer;
                  width: 100%;
                  text-align: left;
                  transition: background 0.2s;
                  white-space: nowrap;
                " onmouseover="this.style.background='${this.hexToRgba(accent, 0.2)}'" onmouseout="this.style.background='transparent'">🐛 디버그 정보</button>
                ` : ''}
                <button class="compare-btn" data-id="${id}" style="
                  background: transparent;
                  color: ${text};
                  padding: 10px 14px;
                  border: none;
                  border-radius: 6px;
                  font-size: 14px;
                  cursor: pointer;
                  width: 100%;
                  text-align: left;
                  transition: background 0.2s;
                  white-space: nowrap;
                " onmouseover="this.style.background='${this.hexToRgba(accent, 0.2)}'" onmouseout="this.style.background='transparent'">${isCompareMode ? '✕ 비교 취소' : '⚖️ 비교하기'}</button>
              </div>
            </div>
            <button class="delete-btn" data-id="${id}" style="
              background: ${dangerButtonBase};
              color: ${text};
              padding: 8px 12px;
              border-radius: 6px;
              font-size: 14px;
              border: 1px solid rgba(239, 68, 68, 0.5);
              cursor: pointer;
              transition: all 0.2s;
              backdrop-filter: blur(8px);
              white-space: nowrap;
            " onmouseover="this.style.background='${dangerButtonHover}'" onmouseout="this.style.background='${dangerButtonBase}'">🗑️</button>
            ${isCompleted && block.crossVerified ? `
                <div style="
                  background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.3));
                  color: rgba(180, 190, 254, 1);
                  border: 1px solid rgba(99, 102, 241, 0.6);
                  padding: 4px 10px;
                  border-radius: 12px;
                  font-size: 11px;
                  font-weight: 700;
                  white-space: nowrap;
                  display: flex;
                  align-items: center;
                  gap: 3px;
                ">
                  <span style="font-size: 13px;">↻</span>
                  <span>${block.currentVerificationStep || this.crossVerificationDepth}차 검증</span>
                </div>
              ` : ''}
          </div>
        `;
      }
    }

    const blockClasses = ['news-block'];
    if (hasGlow) blockClasses.push('news-block--glow');
    if (isClickable) blockClasses.push('news-block--interactive');

    return `
      <div class="${blockClasses.join(' ')}" data-id="${id}" style="
        border-radius: 12px;
        background: ${this.blendColors(surface, base, 0.22)};
        opacity: ${blockOpacity};
        width: 100%;
        overflow: visible;
        position: relative;
        box-shadow: var(--base-box-shadow);
        --base-box-shadow: ${baseBoxShadow};
        --hover-box-shadow: ${hoverBoxShadow};
        ${hasGlow
          ? `--glow-color: ${glowColor}; --glow-opacity-base: 0.35; --glow-opacity-hover: 0.98; --glow-scale-base: 0.88; --glow-scale-hover: 1.28; --glow-blur-base: 26px; --glow-blur-hover: 64px;`
          : `--glow-opacity-base: 0; --glow-opacity-hover: 0; --glow-scale-base: 1; --glow-scale-hover: 1; --glow-blur-base: 0px; --glow-blur-hover: 0px;`}
      ">
        <div class="news-content-area" data-id="${id}" style="
          padding: 16px 16px 14px 16px;
          overflow: hidden;
          border-radius: 12px 12px 0 0;
          border: 2px solid ${borderColor};
          border-bottom: none;
          background: ${blockBackground};
          transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          ${cursorStyle}
          ${isCompareMode ? 'pointer-events: none;' : ''}
        ">
          ${block.isComparison ? `
          <div style="
            background: ${primaryButtonHover};
            color: ${text};
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 8px;
            display: inline-block;
            border: 1px solid ${primaryButtonBorder};
          ">비교분석</div>
          ` : ''}
          <h3 style="
            color: ${text};
            font-weight: 600;
            font-size: 15px;
            margin: 0 0 6px 0;
            line-height: 1.45;
            word-break: break-word;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            width: 100%;
          ">${this.escapeHtml(title)}</h3>
          <div style="
            color: ${textMuted};
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            width: 100%;
          ">${this.escapeHtml(url)}</div>
        </div>

        ${status === 'analyzing' ? `
        <div id="typing-area-${id}" style="
          border-top: 1px solid ${border};
          padding: 12px 16px;
          background: ${this.blendColors(surface, base, 0.18)};
          height: 84px;
          overflow: hidden;
          transition: all 0.3s ease;
        ">
          <div style="
            font-size: 12px;
            color: ${textMuted};
            margin-bottom: 8px;
            font-weight: 500;
          ">실시간 분석 결과</div>
          <div id="typing-content-${id}" style="
            font-size: 12px;
            line-height: 1.45;
            color: ${text};
            word-wrap: break-word;
            height: 48px;
            overflow-y: auto;
            overflow-x: hidden;
            border: 1px solid ${border};
            border-radius: 6px;
            padding: 8px;
            background: rgba(13, 13, 13, 0.45);
            scrollbar-width: thin;
            scrollbar-color: ${border} rgba(13, 13, 13, 0.3);
          " onscroll="this.setAttribute('data-user-scrolled', this.scrollTop < this.scrollHeight - this.offsetHeight ? 'true' : 'false')">분석을 시작합니다...</div>
        </div>
        ` : ''}

        <div style="
          border-top: 1px solid ${borderColor};
          padding: 10px 16px 16px 16px;
          background: ${this.blendColors(surface, base, 0.22)};
          backdrop-filter: blur(12px);
          border-radius: 0 0 12px 12px;
          overflow: visible;
        ">
          <div style="
            display: flex;
            gap: 10px;
            width: 100%;
            overflow: visible;
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
    
    // <br> 태그를 임시로 보호 (대소문자 구분 없이)
    let html = text.replace(/<br\s*\/?>/gi, '|||BR_TAG|||');
    
    // HTML 이스케이프로 XSS 방지
    html = this.escapeHtml(html);
    
    const { text: textColor, textMuted, accent, border, base, surface } = this.palette;
    const headingBorder = this.hexToRgba(accent, 0.45);
    const boldColor = this.hexToRgba(accent, 0.85);
    const quoteBackground = this.blendColors(surface, base, 0.22);
    const quoteBorder = this.hexToRgba(accent, 0.4);
    const listColor = textColor;
    
    // 마크다운 변환
    html = html
      // 제목 (## 제목)
      .replace(/^## (.+)$/gm, `<h2 style="color: ${textColor}; font-weight: 600; font-size: 16px; margin: 12px 0 6px 0; border-bottom: 1px solid ${headingBorder}; padding-bottom: 4px;">$1</h2>`)
      // 강조 (**텍스트**)
      .replace(/\*\*(.+?)\*\*/g, `<strong style="color: ${boldColor}; font-weight: 600;">$1</strong>`)
      // 숫자 리스트 (1. 항목, 2. 항목)
      .replace(/^(\d+)\.\s*(.+)$/gm, `<li style="margin: 6px 0; padding-left: 8px; list-style: decimal; color: ${listColor};">$2</li>`)
      // 일반 리스트 (- 항목)
      .replace(/^-\s*(.+)$/gm, `<li style="margin: 4px 0; padding-left: 8px; list-style: disc; color: ${listColor};">$1</li>`)
      // 인용 (> 텍스트)
      .replace(/^>\s*(.+)$/gm, `<blockquote style="border-left: 3px solid ${quoteBorder}; margin: 8px 0; padding: 8px 12px; background: ${quoteBackground}; font-style: italic; color: ${textColor};">$1</blockquote>`)
      // 보호했던 <br> 태그 복원 (다른 변환보다 먼저)
      .replace(/\|\|\|BR_TAG\|\|\|/g, '<br>')
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
  const cursorColor = this.palette.accent;
  typingContent.innerHTML = `${this.escapeHtml(updatedBuffer)}<span class="typing-cursor" style="display: inline-block; width: 1px; height: 12px; background: ${cursorColor}; margin-left: 2px; animation: blink 1.2s infinite;"></span>`;
    
    // 사용자가 수동 스크롤하지 않았으면 자동으로 맨 아래로 스크롤
    if (!userScrolled) {
      typingContent.scrollTop = typingContent.scrollHeight;
    }
  }

  // 현재 뉴스 설정
  setCurrentNews(title, url, content) {
    // URL 정규화
    const normalizeUrl = (urlString) => {
      try {
        const urlObj = new URL(urlString);
        return urlObj.origin + urlObj.pathname;
      } catch {
        return urlString;
      }
    };
    
    const normalizedUrl = normalizeUrl(url);
    
    // 분석 기록에서 동일한 URL의 뉴스 찾기 (UI 표시용)
    const existingBlock = Array.from(this.newsBlocks.values()).find(block => 
      normalizeUrl(block.url) === normalizedUrl
    );
    
    // 기존 분석 결과가 있어도 currentNews는 항상 pending 상태로 시작
    // (사용자가 원하면 "다시 분석" 버튼을 통해 새로 분석할 수 있음)
    if (existingBlock && existingBlock.status === 'completed') {
      // 완료된 분석이 있으면 그 결과를 표시
      this.currentNews = {
        id: 'current',
        title,
        url,
        content,
        status: existingBlock.status,
        result: existingBlock.result,
        progress: existingBlock.progress,
        error: existingBlock.error,
        timestamp: Date.now()
      };
      console.log('[setCurrentNews] 기존 완료된 분석 결과 발견, 상태 반영:', existingBlock.status);
    } else {
      // 새로운 뉴스 또는 미완료 분석
      this.currentNews = {
        id: 'current',
        title,
        url,
        content,
        status: 'pending',
        result: null,
        progress: null,
        error: null,
        timestamp: Date.now()
      };
      console.log('[setCurrentNews] 새 뉴스 또는 미완료 분석, pending 상태로 설정');
    }
    
    this.updatePanel();
    return 'current';
  }

  // 저장된 기록과 현재 뉴스 상태 동기화
  syncCurrentNewsWithHistory() {
    if (!this.currentNews || this.newsBlocks.size === 0) {
      return;
    }

    const normalizeUrl = (urlString) => {
      try {
        const urlObj = new URL(urlString);
        return urlObj.origin + urlObj.pathname;
      } catch {
        return urlString;
      }
    };

    const currentUrl = normalizeUrl(this.currentNews.url);
    const matchingBlock = Array.from(this.newsBlocks.values()).find((block) => {
      return normalizeUrl(block.url) === currentUrl;
    });

    if (!matchingBlock) {
      return;
    }

    this.currentNews = {
      ...this.currentNews,
      status: matchingBlock.status,
      result: matchingBlock.result,
      progress: matchingBlock.progress,
      error: matchingBlock.error
    };

    this.updatePanel();
  }

  // 새 뉴스 추가 (분석된 뉴스 리스트에 추가)
  addNews(title, url, content, startAnalyzing = false) {
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
      status: startAnalyzing ? 'analyzing' : 'pending',
      result: null,
      progress: startAnalyzing ? '🔍 분석 시작...' : null,
      timestamp: Date.now()
    };
    
    this.addNewsBlock(newsData);
    console.log('[addNews] 뉴스 블록 추가됨:', newsData);
    
    // 즉시 패널 업데이트하여 기록에 표시
    this.updatePanel();
    
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
    
    const oldStatus = block.status;
    block.status = status;
    if (progress) block.progress = progress;
    if (result) block.result = result;
    if (error) block.error = error;
    
    // currentNews와 URL이 같은 블록이면 currentNews도 함께 업데이트
    if (id !== 'current' && this.currentNews) {
      const normalizeUrl = (urlString) => {
        try {
          const urlObj = new URL(urlString);
          return urlObj.origin + urlObj.pathname;
        } catch {
          return urlString;
        }
      };
      
      if (normalizeUrl(block.url) === normalizeUrl(this.currentNews.url)) {
        this.currentNews.status = status;
        if (progress) this.currentNews.progress = progress;
        if (result) this.currentNews.result = result;
        if (error) this.currentNews.error = error;
      }
    }
    
    // 분석 완료 시 진위 결과 저장
    if (status === 'completed' && result && id !== 'current') {
      console.log('[updateNewsStatus] completeAnalysis 호출 전, id:', id, 'result 타입:', typeof result);
      this.completeAnalysis(id, result);
    }
    
    // 저장 최적화: analyzing 상태에서는 저장하지 않음 (스트리밍 중)
    // 상태 변경이나 완료/에러 시에만 저장
    if (id !== 'current' && (status !== 'analyzing' || oldStatus !== 'analyzing')) {
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
      
      // 축소된 요약 뷰 업데이트 (축소 상태일 때)
      if (this.isHistoryCollapsed) {
        const collapsedSummary = panel.querySelector('#collapsed-summary');
        if (collapsedSummary) {
          collapsedSummary.innerHTML = this.renderCollapsedSummary();
          // 축소 뷰 이벤트 재연결
          this.attachCollapsedSummaryEvents(panel);
        }
      }
      
      // 이벤트 다시 연결
      this.attachBlockEvents(panel);
      this.updateCollapsedSummary(panel);
      this.attachCollapsedSummaryEvents(panel);

      if (this.isHistoryCollapsed) {
        this.togglePanelCollapse(true);
      }
    }
  }

  // 이벤트 연결
  attachEvents(panel) {
    this.attachCloseEvent(panel);
    this.attachSettingsEvent(panel);
    this.attachBlockEvents(panel);
    this.attachCollapseToggle(panel);
    this.attachCollapsedSummaryEvents(panel);
    this.attachScrollPrevention(panel);
  }

  // 분석 중단 처리
  stopAnalysis(blockId) {
    console.log('[stopAnalysis] 분석 중단 요청:', blockId);
    
    // 타이핑 효과 중단
    if (this.currentTypingIntervals.has(blockId)) {
      clearInterval(this.currentTypingIntervals.get(blockId));
      this.currentTypingIntervals.delete(blockId);
    }
    
    // 분석 타임아웃 중단
    if (this.analysisTimeouts.has(blockId)) {
      clearTimeout(this.analysisTimeouts.get(blockId));
      this.analysisTimeouts.delete(blockId);
    }
    
    // 스트리밍 결과 삭제
    if (this.streamingResults.has(blockId)) {
      this.streamingResults.delete(blockId);
    }
    
    // service_worker에 중단 요청 전송
    chrome.runtime.sendMessage({
      action: "stopAnalysis",
      blockId: blockId
    }).catch(error => {
      console.error('[stopAnalysis] service_worker 메시지 전송 오류:', error);
    });
    
    // 블록 상태를 pending으로 변경
    let block = blockId === 'current' ? this.currentNews : this.newsBlocks.get(blockId);
    if (block) {
      block.status = 'pending';
      block.progress = null;
      block.error = '사용자가 분석을 중단했습니다';
      
      // 저장 및 패널 업데이트
      if (blockId !== 'current') {
        this.saveNewsBlocks();
      }
      this.updatePanel();
    }
    
    console.log('[stopAnalysis] 분석 중단 완료:', blockId);
  }

  // 패널 스크롤 시 페이지 스크롤 방지
  attachScrollPrevention(panel) {
    panel.addEventListener('wheel', (e) => {
      const scrollContainer = panel;
      const isScrollable = scrollContainer.scrollHeight > scrollContainer.clientHeight;
      
      if (isScrollable) {
        // 스크롤이 가능한 경우, 패널 내부에서만 스크롤
        const scrollTop = scrollContainer.scrollTop;
        const scrollHeight = scrollContainer.scrollHeight;
        const clientHeight = scrollContainer.clientHeight;
        
        // 맨 위에서 위로 스크롤하려고 하거나, 맨 아래에서 아래로 스크롤하려고 하는 경우가 아니면 이벤트 전파 방지
        if (!(scrollTop === 0 && e.deltaY < 0) && !(scrollTop + clientHeight >= scrollHeight && e.deltaY > 0)) {
          e.stopPropagation();
        }
      }
    }, { passive: false });
  }

  // 패널 축소 토글 버튼 이벤트
  attachCollapseToggle(panel) {
    const collapseBtn = panel.querySelector('#collapse-history-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.togglePanelCollapse();
      });
    }
  }

  // 패널 축소/확장 처리
  togglePanelCollapse(forceState = null) {
    const panel = document.getElementById(this.panelId);
    if (!panel) return;

    this.closeDetailInPanel(true);

    const collapseBtn = panel.querySelector('#collapse-history-btn');
    if (!collapseBtn) return;

    const shouldCollapse = forceState !== null ? forceState : !this.isHistoryCollapsed;
    const collapsibleElements = panel.querySelectorAll('.analysis-panel-collapsible');
    const collapsedSummary = panel.querySelector('#collapsed-summary');

    if (shouldCollapse) {
      if (!this.isHistoryCollapsed) {
        this.expandedPanelWidth = panel.getBoundingClientRect().width || this.expandedPanelWidth || 560;
        this.expandedPanelHeight = panel.getBoundingClientRect().height || this.expandedPanelHeight || window.innerHeight;
        this.expandedPanelWidthValue = panel.style.width;
        this.expandedPanelMinWidthValue = panel.style.minWidth;
        this.expandedPanelMaxWidthValue = panel.style.maxWidth;
      }

      const collapsedWidth = Math.min(Math.max(320, Math.round((this.expandedPanelWidth || 520) * 0.7)), 380);
      panel.style.width = `${collapsedWidth}px`;
      panel.style.minWidth = `${collapsedWidth}px`;
      panel.style.maxWidth = `${collapsedWidth}px`;
      panel.style.height = 'auto';
      panel.style.maxHeight = '70vh';
      panel.style.top = 'auto';
      panel.style.bottom = '24px';
      panel.style.right = '24px';
      panel.style.left = 'auto';
      panel.style.borderRadius = '18px';
      panel.style.boxShadow = '-4px 0 24px rgba(0, 0, 0, 0.25)';

      panel.classList.add('analysis-panel-collapsed');

      const icon = collapseBtn.querySelector('svg path');
      if (icon) {
        icon.setAttribute('d', 'M15 18l-6-6 6-6');
      }

      collapseBtn.style.display = 'none';

      collapsibleElements.forEach((el) => {
        if (!('prevDisplay' in el.dataset)) {
          el.dataset.prevDisplay = el.style.display || '';
        }
        el.style.display = 'none';
      });

      if (collapsedSummary) {
        collapsedSummary.style.display = 'flex';
      }
    } else {
      const widthToRestore = this.expandedPanelWidthValue || `${this.expandedPanelWidth || 560}px`;
      panel.style.width = widthToRestore;
      panel.style.minWidth = this.expandedPanelMinWidthValue || '';
      panel.style.maxWidth = this.expandedPanelMaxWidthValue || '';
      
      // 높이 원래대로
      panel.style.height = '100vh';
      panel.style.maxHeight = '100vh';
      panel.style.top = '0';
      panel.style.bottom = '0';
      panel.style.right = '0';
      panel.style.left = 'auto';
      panel.style.borderRadius = '20px 0 0 20px';
      
      panel.classList.remove('analysis-panel-collapsed');
      

      // Update button icon to right arrow
      const icon = collapseBtn.querySelector('svg path');
      if (icon) {
        icon.setAttribute('d', 'M9 18l6-6-6-6');
      }
      collapseBtn.style.display = '';

      collapsibleElements.forEach((el) => {
        if (el.dataset.prevDisplay !== undefined) {
          el.style.display = el.dataset.prevDisplay;
          delete el.dataset.prevDisplay;
        } else {
          el.style.display = '';
        }
      });

      if (collapsedSummary) {
        collapsedSummary.style.display = 'none';
      }
    }

    this.isHistoryCollapsed = shouldCollapse;
    this.saveCollapsedStateSetting(shouldCollapse); // localStorage에 저장
    this.updateCollapsedSummary(panel);
  }

  updateCollapsedSummary(panelRef = null) {
    const panel = panelRef || document.getElementById(this.panelId);
    if (!panel) return;

    // 축소 뷰 전체를 다시 렌더링하여 최신 상태 반영
    const collapsedSummary = panel.querySelector('#collapsed-summary');
    if (collapsedSummary && this.isHistoryCollapsed) {
      collapsedSummary.innerHTML = this.renderCollapsedSummary();
      // 이벤트 재연결
      this.attachCollapsedSummaryEvents(panel);
    }
  }

  attachCollapsedSummaryEvents(panelRef = null) {
    const panel = panelRef || document.getElementById(this.panelId);
    if (!panel) {
      console.warn('[attachCollapsedSummaryEvents] 패널을 찾을 수 없습니다.');
      return;
    }

    const expandBtn = panel.querySelector('#expand-panel-btn');
    if (expandBtn && !expandBtn.dataset.listenerAttached) {
      expandBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.togglePanelCollapse(false);
      });
      expandBtn.dataset.listenerAttached = 'true';
    }

    const collapsedCloseBtn = panel.querySelector('#collapsed-close-btn');
    if (collapsedCloseBtn && !collapsedCloseBtn.dataset.listenerAttached) {
      collapsedCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      });
      collapsedCloseBtn.dataset.listenerAttached = 'true';
    }

    const currentAnalyzeBtn = panel.querySelector('#collapsed-current-analyze-btn');
    if (currentAnalyzeBtn && !currentAnalyzeBtn.dataset.listenerAttached) {
      currentAnalyzeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Collapsed] Current analyze button clicked');
        console.log('[Collapsed] currentNews:', this.currentNews);
        
        if (!this.currentNews) {
          console.error('[Collapsed] No current news available');
          alert('현재 뉴스가 없습니다.');
          return;
        }
        
        // 축소 상태에서도 분석 진행 (패널 확장하지 않음)
        console.log('[Collapsed] Starting analysis in collapsed view');
        this.analyzeCurrentNews();
      });
      currentAnalyzeBtn.dataset.listenerAttached = 'true';
    }

    const summaryList = panel.querySelector('#collapsed-summary-list');
    if (summaryList && !summaryList.dataset.listenerAttached) {
      summaryList.addEventListener('click', (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) {
          return;
        }

        if (target.classList.contains('mini-analyze-btn')) {
          event.preventDefault();
          event.stopPropagation();
          const blockId = parseInt(target.dataset.blockId, 10);
          if (!Number.isNaN(blockId)) {
            const block = this.newsBlocks.get(blockId);
            if (block && block.status !== 'pending') {
              this.resetBlockForAnalysis(blockId);
            }
            this.startAnalysis(blockId);
          }
          return;
        }

        if (target.classList.contains('mini-open-btn')) {
          event.preventDefault();
          event.stopPropagation();
          const url = target.dataset.url ? decodeURIComponent(target.dataset.url) : '';
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
          return;
        }

        const item = event.target.closest('.collapsed-summary-item');
        if (!item) return;
        event.preventDefault();
        const blockId = parseInt(item.dataset.blockId, 10);
        if (!Number.isNaN(blockId)) {
          const status = item.dataset.status;
          if (status === 'completed') {
            this.showAnalysisResult(String(blockId));
          } else if (status === 'pending') {
            this.startAnalysis(blockId);
          } else if (status === 'error') {
            if (this.resetBlockForAnalysis(blockId)) {
              this.startAnalysis(blockId);
            }
          }
        }
      });
      summaryList.dataset.listenerAttached = 'true';
    }
  }

  scrollToBlock(blockId) {
    const panel = document.getElementById(this.panelId);
    if (!panel) return;
    const listWrapper = panel.querySelector('#analyzed-news-container');
    if (!listWrapper) return;
    const target = listWrapper.querySelector(`.news-block[data-id="${blockId}"]`);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const originalBoxShadow = target.style.boxShadow;
    target.style.boxShadow = '0 0 0 3px rgba(191, 151, 128, 0.6)';
    setTimeout(() => {
      target.style.boxShadow = originalBoxShadow;
    }, 1200);
  }

  // 블록 이벤트 연결
  attachBlockEvents(container) {
    // 더보기 메뉴 토글
    container.querySelectorAll('.more-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const dropdown = container.querySelector(`.more-menu-dropdown[data-id="${id}"]`);
        if (dropdown) {
          const isVisible = dropdown.style.display === 'block';
          
          // 모든 드롭다운 닫기 및 z-index 초기화
          container.querySelectorAll('.more-menu-dropdown').forEach(d => {
            d.style.display = 'none';
            // 부모 뉴스 블록의 z-index 초기화
            const parentBlock = d.closest('.news-block');
            if (parentBlock) {
              parentBlock.style.zIndex = '';
            }
          });
          
          if (!isVisible) {
            // 드롭다운 위치 계산
            const btnRect = btn.getBoundingClientRect();
            const panel = document.getElementById(this.panelId);
            const panelRect = panel.getBoundingClientRect();
            
            // 부모 뉴스 블록의 z-index를 높게 설정
            const parentBlock = dropdown.closest('.news-block');
            if (parentBlock) {
              parentBlock.style.zIndex = '100';
            }
            
            // 버튼이 패널 상단에 가까우면 아래로, 아니면 위로
            const spaceAbove = btnRect.top - panelRect.top;
            const spaceBelow = panelRect.bottom - btnRect.bottom;
            
            if (spaceAbove < 200 || spaceBelow > spaceAbove) {
              // 아래로 표시
              dropdown.style.bottom = 'auto';
              dropdown.style.top = 'calc(100% + 4px)';
            } else {
              // 위로 표시 (기본값)
              dropdown.style.top = 'auto';
              dropdown.style.bottom = 'calc(100% + 4px)';
            }
            
            dropdown.style.display = 'block';
          }
        }
      });
    });
    
    // 드롭다운 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.more-menu-btn')) {
        container.querySelectorAll('.more-menu-dropdown').forEach(d => {
          d.style.display = 'none';
          // 부모 뉴스 블록의 z-index 초기화
          const parentBlock = d.closest('.news-block');
          if (parentBlock) {
            parentBlock.style.zIndex = '';
          }
        });
      }
    });
    
    // 현재 뉴스 분석 버튼
    container.querySelectorAll('.analyze-current-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('현재 뉴스 분석 버튼 클릭');
        this.analyzeCurrentNews();
      });
    });
    
    // 교차 검증 버튼
    container.querySelectorAll('.cross-verify-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id === 'current' ? 'current' : parseInt(btn.dataset.id);
        console.log('교차 검증 버튼 클릭, ID:', id);
        this.startCrossVerification(id);
      });
    });
    
    // 분석 정지 버튼
    container.querySelectorAll('.stop-analysis-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        console.log('분석 정지 버튼 클릭, ID:', id);
        this.stopAnalysis(id);
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

    // 비교하기 버튼 (기능 비활성화)
    container.querySelectorAll('.compare-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        alert('비교 분석 기능은 현재 준비 중입니다.');
        // const id = parseInt(btn.dataset.id);
        // console.log('비교하기 버튼 클릭, ID:', id, 'waitingForComparison:', this.waitingForComparison);
        // this.toggleCompareMode(id);
      });
    });

    // 유사 기사 찾기 버튼
    container.querySelectorAll('.find-similar-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        console.log('유사 기사 찾기 버튼 클릭, ID:', id);
        this.findSimilarArticles(id);
      });
    });

    // 사실 검증 버튼
    container.querySelectorAll('.fact-check-search-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        console.log('사실 검증 버튼 클릭, ID:', id);
        this.searchFactCheck(id);
      });
    });

    // 디버그 정보 버튼
    container.querySelectorAll('.debug-result-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        console.log('디버그 정보 버튼 클릭, ID:', id);
        this.showDebugModal(id);
      });
    });

    // 사이트 이동 버튼
    container.querySelectorAll('.open-site-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          const encoded = btn.dataset.url || '';
          const targetUrl = encoded ? decodeURIComponent(encoded) : '';
          if (targetUrl) {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
          } else {
            console.warn('사이트 이동 URL이 비어 있습니다.');
          }
        } catch (error) {
          console.error('사이트 이동 중 오류 발생:', error);
        }
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
          // 완료된 뉴스 - 결과 보기
          contentArea.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('완료된 뉴스 클릭, ID:', id);
            // 일반 결과 보기
            this.showAnalysisResult(id);
          });
        }
        // 분석 중인 뉴스는 클릭 이벤트 없음 (타이핑 효과만 표시)
      }
    });
  }

  // 현재 뉴스 분석
  analyzeCurrentNews() {
    console.log('[analyzeCurrentNews] 시작, currentNews:', this.currentNews);
    
    if (!this.currentNews) {
      alert('현재 뉴스가 없습니다.');
      return;
    }
    
    // API 키 먼저 확인
    chrome.storage.local.get(['gemini_api_key'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Storage 오류:', chrome.runtime.lastError);
        this.showApiKeyWarning();
        return;
      }
      
      const apiKey = result.gemini_api_key;
      
      if (!apiKey || apiKey.trim() === '') {
        console.warn('[analyzeCurrentNews] API 키가 설정되지 않았습니다.');
        this.showApiKeyWarning();
        return;
      }
      
      // API 키가 있으면 분석 진행
      this.proceedWithCurrentNewsAnalysis();
    });
  }
  
  proceedWithCurrentNewsAnalysis() {
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
      console.log('[analyzeCurrentNews] 이미 존재하는 뉴스:', existingBlock.id);
      
      // 교차 검증 관련 상태 초기화
      existingBlock.crossVerified = false;
      existingBlock.crossVerifiedResult = null;
      existingBlock.firstAnalysis = null;
      this.crossVerificationInProgress.delete(existingBlock.id);
      
      alert('이 뉴스는 이미 분석 목록에 있습니다.');
      return;
    }
    
    // 현재 뉴스 상태를 analyzing으로 변경 (기존 결과 초기화!)
    this.currentNews.status = 'analyzing';
    this.currentNews.progress = '🔍 분석 시작...';
    this.currentNews.result = null;  // 기존 결과 제거
    this.currentNews.error = null;
    this.currentNews.crossVerified = false;
    this.currentNews.crossVerifiedResult = null;
    this.currentNews.firstAnalysis = null;
    
    // UI 즉시 업데이트 (분석 중 상태 표시)
    this.updatePanel();
    
    // 현재 뉴스를 분석 목록에 추가 (새로운 분석이므로 analyzing 상태로, result는 null)
    console.log('[analyzeCurrentNews] 새 뉴스 추가 중... (analyzing 상태로, result 초기화)');
    const newsData = {
      id: ++this.blockIdCounter,
      title: this.currentNews.title,
      url: this.currentNews.url,
      content: this.currentNews.content,
      status: 'analyzing',
      result: null,  // 새 분석이므로 null
      progress: '🔍 분석 시작...',
      timestamp: Date.now()
    };
    
    this.addNewsBlock(newsData);
    const newId = newsData.id;
    console.log('[analyzeCurrentNews] 추가된 ID:', newId);
    
    // 분석 시작
    console.log('[analyzeCurrentNews] 분석 시작 호출');
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
    
    // 재분석인 경우에만 API 키 확인 (현재 뉴스에서 호출된 경우는 이미 체크됨)
    const isRetry = block.status === 'error' || block.status === 'pending';
    
    if (isRetry) {
      // 재분석 시에만 API 키 확인
      chrome.storage.local.get(['gemini_api_key'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('Storage 오류:', chrome.runtime.lastError);
          this.showApiKeyWarning();
          return;
        }
        
        const apiKey = result.gemini_api_key;
        
        if (!apiKey || apiKey.trim() === '') {
          console.warn('API 키가 설정되지 않았습니다.');
          this.showApiKeyWarning();
          return;
        }
        
        // API 키가 있으면 분석 진행
        this.proceedWithAnalysis(id, block);
      });
    } else {
      // 현재 뉴스에서 호출된 경우 바로 진행 (이미 체크됨)
      this.proceedWithAnalysis(id, block);
    }
  }
  
  proceedWithAnalysis(id, block) {
    // 기존 타임아웃 제거
    if (this.analysisTimeouts.has(id)) {
      clearTimeout(this.analysisTimeouts.get(id));
    }
    
    // 5분 타임아웃 설정 (300초)
    const timeoutId = setTimeout(() => {
      console.warn(`[Timeout] 분석 시간 초과 (5분), ID: ${id}`);
      this.stopAnalysis(id, '⏱️ 분석 시간이 초과되었습니다 (5분). 다시 시도해주세요.');
    }, 5 * 60 * 1000);
    
    this.analysisTimeouts.set(id, timeoutId);
    
    // AbortController 생성 (API 요청 중단용)
    const abortController = new AbortController();
    this.abortControllers.set(id, abortController);
    
    this.updateNewsStatus(id, 'analyzing', null, '🔍 API 연결 및 인증 확인 중...');
    this.updateProgressTextInDOM(id, '🔍 API 연결 및 인증 확인 중...');
    
    // API 키 확인
    setTimeout(() => {
      this.updateNewsStatus(id, 'analyzing', null, '📝 기사 내용 파싱 및 분석 준비 중...');
      this.updateProgressTextInDOM(id, '📝 기사 내용 파싱 및 분석 준비 중...');
      
      setTimeout(() => {
        this.updateNewsStatus(id, 'analyzing', null, '🤖 Gemini AI에 팩트체킹 요청 전송 중...');
        this.updateProgressTextInDOM(id, '🤖 Gemini AI에 팩트체킹 요청 전송 중...');
        
        setTimeout(() => {
          this.updateNewsStatus(id, 'analyzing', null, '⚡ AI가 기사의 신뢰성을 검증하고 있습니다...');
          this.updateProgressTextInDOM(id, '⚡ AI가 기사의 신뢰성을 검증하고 있습니다...');
          
          // Gemini 분석 요청
          const fullPrompt = this.generateAnalysisPrompt(block.title, block.content, block.isComparison);
          
          console.log('Gemini로 분석 요청 전송, blockId:', id);
          chrome.runtime.sendMessage({
            action: "analyzeNewsWithGemini",
            prompt: fullPrompt,
            blockId: id,
            signal: abortController.signal
          });
        }, 800);
      }, 500);
    }, 300);
  }

  // 교차 검증 시작
  startCrossVerification(id) {
    console.log('교차 검증 시작, ID:', id);
    
    // current인 경우 currentNews 사용, 아니면 newsBlocks에서 찾기
    let block;
    if (id === 'current') {
      block = this.currentNews;
    } else {
      block = this.newsBlocks.get(id);
    }
    
    // 블록 존재 확인
    if (!block) {
      console.error('블록을 찾을 수 없음, ID:', id);
      return;
    }
    
    // 1차 분석 완료 확인
    if (!block.result || block.status !== 'completed') {
      console.warn('1차 분석이 완료되지 않았습니다.');
      return;
    }
    
    // 이미 교차 검증 중이면 중복 방지
    if (this.crossVerificationInProgress.has(id)) {
      console.warn('이미 교차 검증이 진행 중입니다.');
      return;
    }
    
    // 이미 교차 검증 완료된 경우 중복 방지
    if (block.crossVerified) {
      console.warn('이미 교차 검증이 완료되었습니다.');
      return;
    }
    
    // 교차 검증 진행 상태 추가
    this.crossVerificationInProgress.add(id);
    
    // 기존 타임아웃 제거
    if (this.analysisTimeouts.has(id)) {
      clearTimeout(this.analysisTimeouts.get(id));
    }
    
    // 10분 타임아웃 설정 (다단계 검증이므로 더 긴 시간)
    const timeoutId = setTimeout(() => {
      console.warn(`[Timeout] 교차 검증 시간 초과 (10분), ID: ${id}`);
      this.crossVerificationInProgress.delete(id);
      this.stopAnalysis(id, '⏱️ 교차 검증 시간이 초과되었습니다 (10분). 다시 시도해주세요.');
    }, 10 * 60 * 1000);
    
    this.analysisTimeouts.set(id, timeoutId);
    
    // AbortController 생성
    const abortController = new AbortController();
    this.abortControllers.set(id, abortController);
    
    // 1차 분석 결과를 기준점으로 저장 (이후 모든 검증에 포함)
    if (!block.baselineAnalysis) {
      block.baselineAnalysis = JSON.parse(JSON.stringify(block.result));
      console.log('[교차 검증] 기준점(1차 분석) 저장:', block.baselineAnalysis.진위);
    }
    
    // 검증 히스토리 초기화
    if (!block.verificationHistory) {
      block.verificationHistory = [];
    }
    
    // 현재 검증 단계 초기화 (0부터 시작)
    block.currentVerificationStep = 0;
    
    // 다단계 교차 검증 시작
    this.performRecursiveVerification(id, block, abortController);
  }
  
  // 재귀적 교차 검증 수행
  async performRecursiveVerification(id, block, abortController) {
    const depth = this.crossVerificationDepth;
    const currentStep = block.currentVerificationStep + 1;
    
    console.log(`[재귀 검증] ${currentStep}/${depth}차 검증 시작, ID: ${id}`);
    
    // 진행 상태 메시지
    const progressMessages = [
      `🔄 ${currentStep}/${depth}차 검증 준비 중...`,
      `🧐 ${currentStep}/${depth}차 재검토 수행 중...`,
      `🔍 ${currentStep}/${depth}차 교차 검증 중...`,
      `⚡ ${currentStep}/${depth}차 메타인지적 재평가 중...`
    ];
    
    // 상태 업데이트 (순차적 메시지)
    for (let i = 0; i < progressMessages.length; i++) {
      await new Promise(resolve => setTimeout(resolve, i === 0 ? 0 : 400));
      this.updateNewsStatus(id, 'analyzing', null, progressMessages[i]);
    }
    
    // 직전 검증 결과 가져오기 (첫 번째는 null, 이후는 직전 검증 결과)
    const previousResult = currentStep === 1 
      ? null  // 첫 검증은 1차 분석만 참조
      : block.verificationHistory[currentStep - 2];
    
    // 사실 검증 결과 가져오기 (있으면 포함)
    const factCheckData = block.factCheckResult ? {
      articles: block.factCheckResult.articles,
      verification: block.factCheckResult.verification,
      timestamp: block.factCheckResult.timestamp
    } : null;
    
    // 교차 검증 프롬프트 생성 (항상 기준점인 1차 분석 + 직전 검증 결과 + 사실 검증 결과 포함)
    const crossVerifyPrompt = this.generateCrossVerificationPrompt(
      block.title,
      block.content,
      block.baselineAnalysis,  // 1차 분석 결과 (고정 기준점)
      previousResult,          // 직전 검증 결과 (첫 번째는 null)
      currentStep,
      depth,
      factCheckData            // 사실 검증 결과 (있으면 포함)
    );
    
    console.log(`[재귀 검증] ${currentStep}/${depth}차 API 요청 전송, blockId: ${id}`);
    
    // API 요청 전송
    chrome.runtime.sendMessage({
      action: "analyzeNewsWithGemini",
      prompt: crossVerifyPrompt,
      blockId: id,
      isCrossVerification: true,
      verificationStep: currentStep,
      verificationDepth: depth,
      signal: abortController.signal
    });
  }
  
  showApiKeyWarning() {
    const { base, surface, accent, text, textMuted, border } = this.palette;
    
    // 기존 모달이 있으면 제거
    const existingModal = document.getElementById('api-key-warning-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    // 모달 오버레이 생성
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'api-key-warning-modal';
    modalOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      animation: fadeIn 0.2s ease;
    `;
    
    // 모달 컨텐츠
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: linear-gradient(180deg, ${surface} 0%, ${base} 100%);
      border-radius: 16px;
      border: 2px solid ${accent};
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(140, 110, 84, 0.3);
      padding: 32px;
      max-width: 480px;
      width: 90%;
      animation: slideUp 0.3s ease;
      position: relative;
    `;
    
    modalContent.innerHTML = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, rgba(255, 193, 7, 0.2) 0%, rgba(255, 152, 0, 0.2) 100%);
          border: 2px solid rgba(255, 193, 7, 0.5);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px auto;
        ">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <h3 style="
          font-size: 20px;
          font-weight: 700;
          color: ${text};
          margin: 0 0 12px 0;
          letter-spacing: -0.02em;
        ">API 키가 설정되지 않았습니다</h3>
        <p style="
          font-size: 15px;
          color: ${textMuted};
          line-height: 1.6;
          margin: 0;
        ">
          뉴스 분석을 시작하려면<br>
          먼저 Gemini API 키를 입력해주세요.
        </p>
      </div>
      
      <div style="display: flex; gap: 12px; margin-top: 28px;">
        <button id="api-warning-settings-btn" style="
          flex: 1;
          padding: 14px 24px;
          background: linear-gradient(135deg, ${accent} 0%, #705A46 100%);
          border: 1px solid rgba(140, 110, 84, 0.6);
          border-radius: 10px;
          color: ${text};
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(140, 110, 84, 0.3);
        ">
          ⚙️ 설정 열기
        </button>
        <button id="api-warning-close-btn" style="
          flex: 1;
          padding: 14px 24px;
          background: rgba(72, 80, 89, 0.5);
          border: 1px solid ${border};
          border-radius: 10px;
          color: ${text};
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        ">
          닫기
        </button>
      </div>
    `;
    
    // 애니메이션 CSS 추가
    if (!document.getElementById('modal-animation-styles')) {
      const style = document.createElement('style');
      style.id = 'modal-animation-styles';
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        #api-warning-settings-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(140, 110, 84, 0.4) !important;
          background: linear-gradient(135deg, #9D7F66 0%, #8A6E5A 100%) !important;
        }
        #api-warning-close-btn:hover {
          background: rgba(72, 80, 89, 0.7) !important;
          border-color: rgba(242, 242, 242, 0.2) !important;
        }
      `;
      document.head.appendChild(style);
    }
    
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
    
    // 설정 열기 버튼
    const settingsBtn = document.getElementById('api-warning-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        modalOverlay.remove();
        
        // 설정 패널 생성 및 열기
        this.checkSavedApiKey().then((savedApiKey) => {
          const settingsModal = this.createSettingsPanel(savedApiKey);
          document.body.appendChild(settingsModal);
          
          settingsModal.style.display = 'flex';
          settingsModal.style.visibility = 'visible';
          
          setTimeout(() => {
            settingsModal.style.opacity = '1';
            const settingsContent = settingsModal.querySelector('.settings-panel-content');
            if (settingsContent) {
              settingsContent.style.transform = 'scale(1)';
            }
          }, 10);
        });
      });
    }
    
    // 닫기 버튼
    const closeBtn = document.getElementById('api-warning-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modalOverlay.style.animation = 'fadeOut 0.2s ease';
        modalContent.style.animation = 'slideDown 0.2s ease';
        setTimeout(() => modalOverlay.remove(), 200);
      });
    }
    
    // 오버레이 클릭 시 닫기
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.style.animation = 'fadeOut 0.2s ease';
        modalContent.style.animation = 'slideDown 0.2s ease';
        setTimeout(() => modalOverlay.remove(), 200);
      }
    });
    
    // fadeOut, slideDown 애니메이션 추가
    const fadeOutStyle = document.createElement('style');
    fadeOutStyle.textContent = `
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes slideDown {
        from { 
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to { 
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
      }
    `;
    document.head.appendChild(fadeOutStyle);
  }

  // 현재 날짜/시간 포맷 (한국 시간)
  getCurrentDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
    
    return `${year}년 ${month}월 ${day}일 (${dayOfWeek}) ${hours}:${minutes}`;
  }

  // 분석 프롬프트 생성
  generateAnalysisPrompt(title, content, isComparison = false) {
    const articleContent = `${title}\n${content}`;
    const currentDateTime = this.getCurrentDateTime();
    
    if (isComparison) {
      return this.generateComparisonPrompt(articleContent);
    }
    
    return `
**[현재 시각: ${currentDateTime}]**

## 역할
당신은 주어진 기사 텍스트의 **논리적 구조, 근거 제시 방식, 표현의 적절성**만을 분석하는 **'뉴스 텍스트 분석가'** 입니다.  
당신의 유일한 임무는 아래의 '절대적 분석 원칙'과 '판단 조건'에 따라, 외부 세계의 사실이나 당신의 사전 지식과 비교하지 않고 오직 **주어진 텍스트 자체**만을 평가하는 것입니다.

---

### **[매우 중요] 절대적 분석 원칙: 외부 정보 및 사전 지식 사용 금지**
1. **오직 텍스트만 분석:** 제공된 기사 원문 **내부의 정보만을** 분석 대상으로 삼습니다.  
2. **사전 지식 금지:** 당신의 학습 데이터에 저장된 **인물, 직책, 사건, 날짜 등 어떠한 외부 정보도 판단의 근거로 사용해서는 안 됩니다.**  
3. **내부 논리 중심 판단:** 당신의 임무는 '이 내용이 현실 세계에서 사실인가?'를 검증하는 것이 아니라, **'이 기사가 주장과 근거를 논리적으로 제시하고 있는가?'** 를 평가하는 것입니다.

---

## 판단 조건 및 중요도

※ **판단 원칙:** 여러 조건에 해당하는 경우, **가장 심각한 유형(가장 높은 중요도)**을 기준으로 '진위'를 최종 결정합니다.  
※ **기본 판단:** 아래 조건 중 어느 것에도 해당하지 않는 경우, 해당 기사는 **'진짜 뉴스'**로 판단합니다.

---

### **[중요도: 최상] → 최종 판단: 가짜 뉴스**
**유형 1. 사실 및 출처의 신뢰도 문제**
- **1-1. 기사 내 명백한 내용상 모순:** 앞뒤 문단의 진술이 서로 충돌하거나 모순되는 경우.  
  - 예시: "A는 B라고 말했다"와 "A는 B가 아니라고 말했다"가 동시에 등장
  - **주의:** 시간 흐름에 따른 입장 변화는 모순이 아님
  
- **1-2. 불분명하거나 신뢰할 수 없는 출처:** 주장의 근거를 제시하지 않거나, 의도적으로 모호한 표현으로 권위를 부여하는 경우.  
  - 문제가 되는 표현: "일각에서는", "알려진 바에 따르면", "소식통에 의하면" (3회 이상 반복 시)
  - **예외:** 속보성 기사에서 1-2회 사용은 허용 가능
  
- **1-3. 통계 왜곡 및 오용:** 통계의 일부만 발췌하거나 출처가 명시되지 않은 수치를 근거로 사용하는 경우.
  - 예시: "90% 증가"라고만 표기하고 기준 시점이나 표본 크기 누락
  - **예외:** 공식 기관 발표 수치를 직접 인용하는 경우는 출처 명시로 인정

---

### **[중요도: 높음] → 최종 판단: 가짜일 가능성이 높은 뉴스**
**유형 2. 논리 및 구조적 허점**
- **2-1. 논리적 비약:** 근거는 존재하지만, 논리적 연계성이 약하거나 생략되어 결론에 합리적으로 도달하기 어려운 경우.  
  - 예시: "A가 발생했다. 따라서 Z가 틀림없다." (중간 단계 B, C, D 생략)
  - **판단 기준:** 근거와 결론 사이에 최소 2단계 이상의 논리적 연결고리가 누락된 경우
  
- **2-2. 근거 없는 의혹 제기:** 근거가 전혀 제시되지 않거나 "일부 관계자", "알려졌다", "추정된다" 등 불명확한 출처 표현이 반복되는 경우.
  - **판단 기준:** 전체 기사의 30% 이상이 추측성 표현으로 구성되거나, 핵심 주장에 구체적 근거가 0개인 경우
  - **예외:** 탐사보도 초기 단계에서 의혹 제기 자체가 목적인 경우는 제외

---

### **[중요도: 중간] → 최종 판단: 가짜일 가능성이 있는 뉴스**
**유형 3. 선동적·감정적 표현 방식**
- **3-1. 단정적·선동적 어조:** 검증되지 않은 사실을 확정된 것처럼 표현하여 독자의 판단을 강요하는 경우.  
  - 문제 표현: "~임이 확실하다", "~로 밝혀졌다" (근거 없이 사용)
  - **판단 기준:** 미확인 정보를 확정 사실처럼 표현한 문장이 3개 이상
  - **예외:** 공식 발표나 법원 판결 등 확정된 사실을 전달하는 경우
  
- **3-2. 감정적 표현 사용:** "충격", "분노", "경악", "끔찍한" 등 감정 유발형 단어가 기사 핵심 논지를 강화하거나 반복되는 경우.
  - **판단 기준:** 감정 유발 단어가 5회 이상 사용되거나, 제목과 본문에서 과도하게 반복
  - **예외:** 인터뷰 대상자의 직접 인용문 내 감정 표현은 제외
  - **주의:** 사건 자체가 심각한 경우 적절한 형용사 사용은 문제 없음

**유형 4. 기사의 의도 문제**
- **4-1. 제목과 내용의 불일치 (낚시성 제목):** 자극적·과장된 제목으로 클릭을 유도하지만 본문은 무관하거나 일부만 다루는 경우.  
  - **판단 기준:** 제목의 핵심 주장이 본문에서 30% 미만으로만 다뤄지거나, 제목과 정반대 결론인 경우
  
- **4-2. 홍보 및 광고성 기사:** 특정 인물·상품·서비스를 일방적으로 긍정적으로 묘사하는 경우.
  - **판단 기준:** 부정적 측면이나 반론이 전혀 없고, 구매/이용 유도 표현이 포함된 경우
  - **예외:** 명확히 "[PR]", "[광고]" 등으로 표시된 경우는 판단 대상 제외

---

### **[중요도: 보조] → 최종 판단: 부분적으로 신뢰할 수 있는 뉴스**
**유형 5. 근거는 있으나 불충분한 기사**
- **5-1. 일부 근거는 신뢰 가능하지만, 특정 문단의 주장이 모호하거나 불완전한 경우.**  
  - 예시: 70%는 명확한 근거가 있지만, 30%는 추측성 표현으로 구성
  
- **5-2. 통계나 인용은 정확하나, 결론 부분에서 과도한 일반화가 이루어진 경우.**
  - 예시: 소규모 설문조사 결과를 "국민 전체의 의견"으로 확대 해석

---

## 오탐 방지 체크리스트 (판단 전 필수 확인)

판단하기 전에 다음 사항을 **반드시** 점검하여 오탐을 방지하십시오:

### 1. 전문 용어 및 고유명사 오인 방지
- ❌ **잘못된 판단:** 법률·의학·기술 용어를 "모호한 표현"으로 오인
- ✅ **올바른 판단:** 전문 분야의 정확한 용어 사용은 신뢰도 향상 요소

### 2. 기사 장르별 특성 고려
- **속보:** 출처가 일부 불명확해도 시간 정보가 정확하면 허용
- **칼럼/사설:** 주관적 의견 표현은 "감정적 표현"이 아님
- **인터뷰:** 인터뷰 대상자의 발언은 기자의 주장과 구분
- **탐사보도:** 초기 단계 의혹 제기는 "근거 없는 의혹"이 아님

### 3. 문맥 이해
- 인용문 내 표현 ≠ 기자의 주장
- 반어법, 비유적 표현 인식 필요
- 사실 서술과 의견 서술을 명확히 구분

### 4. 내용의 부정성 ≠ 가짜 뉴스
- 비판적 내용이라는 이유만으로 "선동적"이라 판단하지 말것
- 심각한 사건을 다룰 때 강한 표현은 적절할 수 있음

### 5. 기사 구조 이해
- 역피라미드 구조: 결론이 먼저 나오는 것은 정상
- 요약-상세 전개: 앞부분의 요약이 뒤에서 상세히 설명되는 구조 인식

---

## 단계별 분석 절차

다음 순서로 체계적으로 분석하십시오:

**1단계: 기사 구조 파악**
- 제목, 리드문, 본문의 핵심 주장 3가지 추출
- 기사 장르 식별 (속보/일반기사/칼럼/인터뷰)

**2단계: 근거 확인**
- 각 주장마다 제시된 근거 나열
- 출처의 명확성 평가 (구체적 이름/기관 vs 모호한 표현)

**3단계: 논리 구조 분석**
- 근거 → 결론 사이의 논리적 연결 확인
- 생략된 단계가 있는지 점검

**4단계: 표현 분석**
- 감정 유발 단어 개수 세기
- 단정적 표현의 적절성 판단

**5단계: 오탐 체크리스트 확인**
- 위의 5가지 체크리스트 항목 재확인

**6단계: 종합 판단**
- 가장 심각한 문제점 식별
- 해당하는 중요도에 따라 최종 판단

---

## 자기 검증 절차 (Self-consistency Check)

판단을 내리기 전, 당신은 다음을 반드시 점검해야 합니다:

### 근거 실존 확인
- 근거로 인용한 문장이나 표현이 **실제 기사 내에 존재**하는가?  
- 존재하지 않거나 불확실하다면 → **"진짜 뉴스" 또는 "부분적으로 신뢰할 수 있는 뉴스"**로 보수적 분류

### 과도한 판단 방지
- 1-2개의 경미한 문제로 "가짜 뉴스" 판단하지 않았는가?
- 여러 조건 중 **가장 심각한 것**을 기준으로 최종 판단했는가?

### 문맥 재확인
- 부분적 표현을 전체 문맥과 분리하여 판단하지 않았는가?
- 인용문과 기자의 주장을 혼동하지 않았는가?

**중요:** 이 검증은 허위 근거 생성(hallucination)을 방지하기 위한 필수 단계입니다.  
**불확실하면 보수적으로 판단**하여 "진짜 뉴스" 또는 상위 단계로 분류하십시오.

---

## 출력 형식
다음 **JSON 배열 형식**으로만 응답하십시오.  
JSON 외의 문장, 주석, 코드 블록(\\\`\\\`\\\`json\\\`\\\`\\\`)은 절대 포함하지 마십시오.

**[중요] 텍스트 포맷팅 필수 규칙:**
- **줄바꿈 필수**: 여러 항목 나열 시 반드시 <br> 태그로 구분 (쉼표 사용 금지)
  - 올바른 예: "첫 번째 근거입니다<br>두 번째 근거입니다<br>세 번째 근거입니다"
  - 잘못된 예: "첫 번째 근거, 두 번째 근거, 세 번째 근거"
- **강조**: **텍스트** 형식 사용 (예: **핵심 근거**)
- **제목/리스트**: 필요시 ## 제목, - 항목, 1. 항목 사용

[
  {
    "instruction": "해당 기사는 진위 여부 판단을 목적으로 수집되었습니다. 조건에 따라 종합적으로 검토 후 판단 결과를 진위, 근거, 분석 항목으로 나누어 출력하세요.",
    "input": "주어진 텍스트 전체",
    "output": {
      "분석진행": "기사 구조 파악 → 근거 확인 → 논리 구조 분석 → 표현 분석 → 오탐 체크리스트 확인 → 종합 판단 순으로 단계별 추론 과정을 작성",
      "진위": "판단 결과('가짜 뉴스' / '가짜일 가능성이 높은 뉴스' / '가짜일 가능성이 있는 뉴스' / '부분적으로 신뢰할 수 있는 뉴스' / '진짜 뉴스')",
      "근거": "탐지된 중요도 조건을 <br> 태그로 반드시 구분하여 나열. 예: 1-1. 기사 내 명백한 내용상 모순<br>3-2. 감정적 표현 사용<br>4-1. 제목과 내용의 불일치",
      "분석": "위 근거들을 종합하여 기사의 어떤 부분이 왜 문제인지 혹은 신뢰할 수 있는지를 구체적으로 설명. 문단 구분이 필요하면 <br><br> 사용",
      "요약": "기사의 핵심 내용을 간결하고 정확하게 요약 (50-100자 이내, HTML 태그 사용 금지). 한 문장으로 핵심만 간결하게 작성",
      "키워드": "기사의 핵심 키워드 3-5개를 추출 (쉼표로 구분, HTML 태그 사용 금지). 예: 정치, 한동훈, 국민의힘, 대장동 사건, 여론",
      "검색어": "유사 기사 검색 또는 사실 검증에 적합한 검색어 1개 (20-50자, 고유명사 + 핵심 사건/주제 조합, HTML 태그 사용 금지). 예: 한동훈 대장동 사건 항소 포기"
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
    const currentDateTime = this.getCurrentDateTime();
    
    return `
**[현재 시각: ${currentDateTime}]**

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

**[중요] 텍스트 포맷팅 문법:**
- **줄바꿈**: <br> 태그, **강조**: **텍스트**, **제목**: ## 제목, **리스트**: - 항목 또는 1. 항목

[
  {
    "instruction": "해당 기사들은 비교분석을 목적으로 수집되었습니다. 두 기사의 내용 일치성, 관점 차이, 신뢰도를 종합적으로 검토 후 판단 결과를 출력하세요.",
    "input": "주어진 두 뉴스 텍스트 전체",
    "output": {
      "분석진행": "비교분석을 위한 단계별 추론 과정을 작성",
      "진위": "두 뉴스의 비교분석 결과 ('일치하는 진짜 뉴스' / '일부 차이가 있지만 신뢰할 수 있는 뉴스' / '상당한 차이가 있어 주의가 필요한 뉴스' / '상충되는 내용으로 추가 검증 필요')",
      "근거": "두 뉴스 간의 일치점과 차이점을 나열",
      "분석": "두 뉴스의 비교분석 결과를 상세히 서술",
      "요약": "두 뉴스의 핵심 내용과 주요 차이점을 간결하게 요약"
    }
  }
]

---
[비교분석 대상 뉴스]
${comparisonContent}
---`;
  }

  // 2차 교차 검증용 프롬프트 생성
  generateCrossVerificationPrompt(title, content, baselineAnalysis, previousVerification = null, currentStep = 1, totalDepth = 1, factCheckData = null) {
    const articleContent = `${title}\n${content}`;
    const currentDateTime = this.getCurrentDateTime();
    
    // 사실 검증 정보 섹션 생성 (토큰 최적화)
    let factCheckSection = '';
    if (factCheckData && factCheckData.articles && factCheckData.articles.length > 0) {
      factCheckSection = `

---

[사실 검증 결과 (외부 기사 비교)]

**검증된 기사 수: ${factCheckData.articles.length}개**

${factCheckData.articles.map((article, index) => `
**비교 기사 ${index + 1}:**
- 제목: ${article.title}
- 출처: ${article.displayLink}
- 요약: ${article.snippet}
${article.crawledContent ? `- 핵심 내용: ${article.crawledContent.substring(0, 300)}...` : '- 본문: (크롤링 실패)'}
`).join('\n')}

**AI 비교 검증 결과:**
- ✅ 일치: ${factCheckData.verification?.일치하는_사실?.length || 0}개
- ❌ 불일치: ${factCheckData.verification?.불일치하는_사실?.length || 0}개
- 평가: ${factCheckData.verification?.종합_평가 || 'N/A'}

**[참고]** 위 검증 결과는 이미 AI가 분석 완료했으므로, 교차 검증 시 참고만 하세요.

---`;
    }
    
    // 첫 번째 검증 (1차 분석 결과만 검토)
    if (currentStep === 1) {
      return `
**[현재 시각: ${currentDateTime}]**

## 역할
당신은 **'AI 분석 검증 전문가'**입니다. 다른 AI가 수행한 뉴스 분석 결과를 재검토하고, 오류나 과도한 판단이 있는지 교차 검증하는 것이 당신의 임무입니다.

---

### **교차 검증 원칙**
1. **독립적 재평가**: 1차 분석 결과에 영향받지 않고 원문을 다시 독립적으로 평가
2. **오판 가능성 점검**: 1차 분석이 놓친 맥락이나 과도한 판단이 있는지 확인
3. **근거의 타당성 재검토**: 제시된 근거가 실제로 원문에 존재하고 타당한지 검증
4. **False Positive 방지**: 정상적인 기사를 가짜 뉴스로 오판하지 않았는지 특별히 주의
5. **최종 균형 판단**: 1차 분석과 재평가를 종합하여 더 정확하고 신중한 결론 도출

---

### **검증 체크리스트**
□ 1차 분석에서 제시한 근거가 실제로 원문에 존재하는가?
□ 전문 용어나 업계 표현을 "모호한 표현"으로 오인하지 않았는가?
□ 기사 장르(속보/칼럼/인터뷰/탐사보도)의 특성을 고려했는가?
□ 부정적 내용을 "가짜 뉴스"로 오판하지 않았는가?
□ 인용문과 기자의 주장을 명확히 구분했는가?
□ 감정 표현이 사건의 심각성에 비례하는 적절한 수준인가?
□ 1차 분석의 판정이 너무 가혹하거나 너무 관대하지 않은가?

---

## 출력 형식

**[중요] 텍스트 포맷팅 문법:**
- **줄바꿈**: <br> 태그, **강조**: **텍스트**, **제목**: ## 제목, **리스트**: - 항목 또는 1. 항목

[
  {
    "instruction": "아래는 동일한 기사에 대한 1차 AI 분석 결과입니다. 이를 참고하되, 원문을 독립적으로 재평가하여 최종 판단을 내리세요.",
    "input": "원문 기사 + 1차 분석 결과",
    "output": {
      "분석진행": "1차 분석 검토 → 원문 재평가 → 오류/과도한 판단 확인 → 최종 판단 도출 과정을 단계별로 작성",
      "진위": "교차 검증 후 최종 판단 ('가짜 뉴스' / '가짜일 가능성이 높은 뉴스' / '가짜일 가능성이 있는 뉴스' / '부분적으로 신뢰할 수 있는 뉴스' / '진짜 뉴스')",
      "근거": "최종 판단의 근거를 나열",
      "분석": "1차 분석의 타당성 검토 + 원문 재평가 결과를 종합하여 상세히 설명",
      "요약": "교차 검증을 거친 최종 결론을 간결하게 요약",
      "검증의견": "1차 분석과 비교하여 달라진 점, 보완된 점, 또는 동의하는 이유를 명시"
    }
  }
]

---

[원문 기사]
${articleContent}
${factCheckSection}

[1차 AI 분석 결과]
진위: ${baselineAnalysis.진위 || 'N/A'}
근거: ${baselineAnalysis.근거 || 'N/A'}
분석: ${baselineAnalysis.분석 || 'N/A'}
요약: ${baselineAnalysis.요약 || 'N/A'}

---`;
    }
    
    // 2차 이상의 재귀적 검증 (원문 + 1차 분석 + 직전 검증 결과 모두 참조)
    return `
**[현재 시각: ${currentDateTime}]**

## 역할
당신은 **'재귀적 검증 전문가'**입니다. 이전 AI의 검증 결과를 다시 한번 재검토하여, 판단의 정확도를 더욱 높이는 것이 당신의 임무입니다.

**현재 진행 상황: ${currentStep}/${totalDepth}차 검증**

---

### **재귀적 검증 원칙**
1. **원문 기반 재평가**: 항상 원문을 기준점으로 하여 이전 검증들이 원문의 실제 내용과 일치하는지 확인
2. **1차 분석 참조**: 초기 AI 분석이 제시한 관점을 염두에 두되, 맹신하지 않기
3. **이전 검증의 맹점 탐색**: 직전 검증에서 놓쳤을 수 있는 세부사항을 집중적으로 재검토
4. **자기 강화적 피드백**: 이전 판단을 무조건 수용하지 않고, 원문 기반으로 독립적 재평가
5. **점진적 정밀화**: 매 단계마다 판단의 근거와 논리를 더욱 정교하게 다듬기
6. **과잉 수정 방지**: 이전 검증이 타당하다면 불필요하게 뒤집지 않고 보강만 하기

---

### **재검증 체크리스트**
□ 직전 검증의 판단 근거가 원문과 정확히 일치하는가?
□ 1차 분석과 직전 검증 사이에 일관성이 있는가?
□ 원문에서 간과한 중요한 맥락이나 뉘앙스가 있는가?
□ 이전 검증들의 결론이 지나치게 확신적이거나 모호하지 않은가?
□ 감정적 표현과 객관적 사실을 명확히 구분했는가?
□ 기사의 장르와 의도를 충분히 고려했는가?
□ 인용문의 출처와 신뢰성을 재확인했는가?
□ 최종 판단이 원문의 전체 맥락과 일관되는가?

---

## 출력 형식

**[중요] 텍스트 포맷팅 문법:**
- **줄바꿈**: <br> 태그, **강조**: **텍스트**, **제목**: ## 제목, **리스트**: - 항목 또는 1. 항목

[
  {
    "instruction": "아래는 동일한 기사에 대한 1차 분석 및 ${currentStep - 1}차 검증 결과입니다. 원문을 기준점으로 이들을 재검토하여 더 정확한 판단을 내리세요.",
    "input": "원문 기사 + 1차 분석 결과 + ${currentStep - 1}차 검증 결과",
    "output": {
      "분석진행": "원문 재확인 → 1차 분석 검토 → ${currentStep - 1}차 검증 검토 → 놓친 맥락 확인 → 최종 정밀화된 판단 도출 과정을 단계별로 작성",
      "진위": "${currentStep}차 재귀적 검증 후 최종 판단 ('가짜 뉴스' / '가짜일 가능성이 높은 뉴스' / '가짜일 가능성이 있는 뉴스' / '부분적으로 신뢰할 수 있는 뉴스' / '진짜 뉴스')",
      "근거": "최종 판단의 근거를 나열",
      "분석": "원문 기반으로 1차 분석과 ${currentStep - 1}차 검증의 타당성 재검토",
      "요약": "${currentStep}차 재귀적 검증을 거친 최종 결론을 간결하게 요약",
      "검증의견": "${currentStep - 1}차 검증 및 1차 분석과 비교하여 달라진 점, 보완된 점, 또는 동의하는 이유를 명시"
    }
  }
]

---

[원문 기사]
${articleContent}
${factCheckSection}

[1차 AI 분석 결과 (기준점)]
진위: ${baselineAnalysis.진위 || 'N/A'}
근거: ${baselineAnalysis.근거 || 'N/A'}
분석: ${baselineAnalysis.분석 || 'N/A'}
요약: ${baselineAnalysis.요약 || 'N/A'}

---

[${currentStep - 1}차 검증 결과]
진위: ${previousVerification.진위 || 'N/A'}
근거: ${previousVerification.근거 || 'N/A'}
분석: ${previousVerification.분석 || 'N/A'}
요약: ${previousVerification.요약 || 'N/A'}
검증의견: ${previousVerification.검증의견 || 'N/A'}

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

    // 모든 열린 드롭다운 메뉴 닫기
  const openDropdowns = document.querySelectorAll('.more-menu-dropdown');
    openDropdowns.forEach(dropdown => {
      dropdown.style.display = 'none';
      // 부모 블록의 z-index도 원래대로
      const parentBlock = dropdown.closest('.news-block');
      if (parentBlock) {
        parentBlock.style.zIndex = '';
      }
    });

    const panel = document.getElementById(this.panelId);
    const shouldUseModal = !panel || panel.classList.contains('analysis-panel-collapsed');

    if (shouldUseModal) {
      const modal = this.createResultModal(block);
      document.body.appendChild(modal);

      setTimeout(() => {
        modal.style.opacity = '1';
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
          modalContent.style.transform = 'scale(1)';
        }
      }, 10);
      return;
    }

    this.showDetailInPanel(block);
  }

  showDetailInPanel(block) {
    const panel = document.getElementById(this.panelId);
    if (!panel) {
      return;
    }

    this.closeDetailInPanel(true);

    // 뉴스 블록 리스트 숨기기
    const newsBlocksList = panel.querySelector('#analyzed-news-container');
    if (newsBlocksList) {
      if (!('prevVisibility' in newsBlocksList.dataset)) {
        newsBlocksList.dataset.prevVisibility = newsBlocksList.style.visibility || '';
      }
      if (!('prevOpacity' in newsBlocksList.dataset)) {
        newsBlocksList.dataset.prevOpacity = newsBlocksList.style.opacity || '';
      }
      if (!('prevPointerEvents' in newsBlocksList.dataset)) {
        newsBlocksList.dataset.prevPointerEvents = newsBlocksList.style.pointerEvents || '';
      }
      if (!('prevMinHeight' in newsBlocksList.dataset)) {
        newsBlocksList.dataset.prevMinHeight = newsBlocksList.style.minHeight || '';
      }

      const currentHeight = newsBlocksList.offsetHeight;
      if (!newsBlocksList.dataset.placeholderHeight) {
        newsBlocksList.dataset.placeholderHeight = String(currentHeight);
      }

      if (currentHeight > 0) {
        newsBlocksList.style.minHeight = `${currentHeight}px`;
      }
      newsBlocksList.style.visibility = 'hidden';
      newsBlocksList.style.opacity = '0';
      newsBlocksList.style.pointerEvents = 'none';
    }

    if (!('prevOverflow' in panel.dataset)) {
      panel.dataset.prevOverflow = panel.style.overflow || '';
    }
    panel.style.overflow = 'hidden';

    const result = block.result || {};
    const analysisProcess = result.분석진행 || '';
    const verdict = result.진위 || '분석 결과 없음';
    const evidence = result.근거 || 'N/A';
    const analysis = result.분석 || 'N/A';
    const summary = result.요약 || 'N/A';
    const { base, surface, surfaceAlt, accent, text, textMuted, border } = this.palette;
    const verdictColors = this.getVerdictColors(verdict);
    const suspiciousBorder = this.hexToRgba(verdictColors.base, 0.35);
    const suspiciousBackground = this.hexToRgba(verdictColors.base, 0.08);
    const suspiciousEntries = result.수상한문장 && Object.keys(result.수상한문장).length > 0
      ? Object.entries(result.수상한문장).map(([sentence, reason]) => `
          <div style="
            padding: 14px 16px;
            border-radius: 10px;
            border: 1px solid ${suspiciousBorder};
            background: ${suspiciousBackground};
            line-height: 1.6;
          ">
            <div style="font-weight: 600; color: ${text}; margin-bottom: 8px;">"${this.escapeHtml(sentence)}"</div>
            <div style="color: ${this.hexToRgba(text, 0.7)}; font-size: 13px;">${this.escapeHtml(reason)}</div>
          </div>
        `).join('')
      : '';

    const overlayBackground = `linear-gradient(180deg, ${this.hexToRgba(base, 0.97)} 0%, ${this.hexToRgba(base, 0.99)} 75%)`;
    const headerBackground = `linear-gradient(135deg, ${this.hexToRgba(surfaceAlt, 0.92)} 0%, ${this.hexToRgba(accent, 0.92)} 100%)`;
    const cardBackground = this.hexToRgba(surface, 0.22);
    const mutedText = this.hexToRgba(text, 0.68);
    const verdictBackground = this.hexToRgba(verdictColors.base, 0.18);
    const verdictBorder = this.hexToRgba(verdictColors.base, 0.45);
    const summaryBackground = `linear-gradient(135deg, ${this.hexToRgba(accent, 0.18)} 0%, ${this.hexToRgba(surfaceAlt, 0.15)} 100%)`;
    const safeTitle = this.escapeHtml(block.title || '제목 없음');
    const showProcessButton = Boolean(analysisProcess && analysisProcess !== 'N/A');

    const overlay = document.createElement('div');
    overlay.className = 'analysis-detail-layer';
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      background: ${overlayBackground};
      opacity: 0;
      transform: translateY(16px);
      transition: opacity 0.18s ease, transform 0.18s ease;
      z-index: 9;
      overflow: hidden;
    `;

    overlay.innerHTML = `
      <div style="display: flex; flex-direction: column; flex: 1; color: ${text}; min-height: 0;">
        <div style="
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 20px 24px;
          background: ${headerBackground};
          border-bottom: 1px solid ${border};
          flex-shrink: 0;
        ">
          <button type="button" class="detail-back-button" style="
            background: rgba(13, 13, 13, 0.4);
            color: ${text};
            border: 1px solid ${this.hexToRgba(text, 0.2)};
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s ease, transform 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          ">&larr; 뒤로가기</button>
          <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
            <span style="font-size: 16px; font-weight: 600; letter-spacing: -0.01em;">분석 결과 상세</span>
            <span style="
              font-size: 12px;
              color: ${this.hexToRgba(text, 0.72)};
              max-width: 320px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            ">${safeTitle}</span>
          </div>
        </div>

        <div class="detail-scroll" style="
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 26px 28px 32px 28px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          min-height: 0;
          scrollbar-width: thin;
          scrollbar-color: #BF9780 rgba(13, 13, 13, 0.3);
        ">
          <section>
            <h3 style="
              font-size: 15px;
              font-weight: 600;
              margin: 0 0 12px 0;
              color: ${text};
              display: flex;
              align-items: center;
              gap: 8px;
            ">
              진위 판단
              ${block.crossVerified ? `
              <span style="
                background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(139, 92, 246, 0.25));
                color: rgba(99, 102, 241, 1);
                border: 1px solid rgba(99, 102, 241, 0.5);
                padding: 4px 10px;
                border-radius: 8px;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.3px;
              ">✅ 교차 검증됨</span>
              ` : ''}
              ${result.사실검증완료 ? `
              <span style="
                background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.25));
                color: rgba(5, 150, 105, 1);
                border: 1px solid rgba(16, 185, 129, 0.5);
                padding: 4px 10px;
                border-radius: 8px;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.3px;
              ">✅ 사실 검증 완료</span>
              ` : ''}
            </h3>
            <div style="
              color: ${verdictColors.text};
              background: ${verdictBackground};
              border: 2px solid ${verdictBorder};
              padding: 18px;
              border-radius: 12px;
              font-weight: 600;
              font-size: 16px;
              text-align: center;
            ">${verdict}</div>
            ${block.crossVerified && block.firstAnalysis && block.firstAnalysis.진위 !== verdict ? `
            <div style="
              margin-top: 12px;
              background: rgba(255, 193, 7, 0.1);
              border: 1px solid rgba(255, 193, 7, 0.3);
              border-radius: 10px;
              padding: 14px;
              font-size: 13px;
              color: ${text};
            ">
              <div style="font-weight: 600; color: rgba(255, 193, 7, 1); margin-bottom: 6px;">⚠️ 1차 분석과 다른 결과</div>
              <div style="color: ${mutedText};">1차 판단: <strong>${block.firstAnalysis.진위}</strong> → 2차 재검토: <strong>${verdict}</strong></div>
            </div>
            ` : ''}
          </section>

          <section>
            <h3 style="
              font-size: 13px;
              font-weight: 600;
              margin: 0 0 12px 0;
              color: ${mutedText};
              text-transform: uppercase;
              letter-spacing: 0.05em;
            ">제목</h3>
            <div style="
              background: ${cardBackground};
              border: 1px solid ${border};
              border-radius: 10px;
              padding: 18px;
              line-height: 1.6;
              font-size: 14px;
              color: ${text};
            ">${safeTitle}</div>
          </section>

          <section>
            <h3 style="
              font-size: 15px;
              font-weight: 600;
              margin: 0 0 12px 0;
              color: ${text};
            ">핵심 요약</h3>
            <div style="
              background: ${summaryBackground};
              border: 1px solid ${this.hexToRgba(accent, 0.35)};
              border-radius: 10px;
              padding: 18px;
              line-height: 1.6;
              font-size: 14px;
              color: ${text};
              font-weight: 500;
            ">${this.renderMarkdown(summary)}</div>
          </section>

          <section>
            <h3 style="
              font-size: 15px;
              font-weight: 600;
              margin: 0 0 12px 0;
              color: ${text};
            ">근거</h3>
            <div style="
              background: ${cardBackground};
              border: 1px solid ${border};
              border-radius: 10px;
              padding: 18px;
              line-height: 1.65;
              font-size: 14px;
              color: ${text};
            ">${this.renderMarkdown(evidence)}</div>
          </section>

          <section>
            <h3 style="
              font-size: 15px;
              font-weight: 600;
              margin: 0 0 12px 0;
              color: ${text};
            ">상세 분석</h3>
            <div style="
              background: ${cardBackground};
              border: 1px solid ${border};
              border-radius: 10px;
              padding: 18px;
              line-height: 1.7;
              font-size: 14px;
              color: ${text};
            ">${this.renderMarkdown(analysis)}</div>
          </section>
          </section>

          ${suspiciousEntries ? `
          <section>
            <h3 style="
              font-size: 15px;
              font-weight: 600;
              margin: 0 0 12px 0;
              color: ${text};
            ">수상한 문장</h3>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${suspiciousEntries}
            </div>
          </section>` : ''}

          ${result.키워드 ? `
          <section>
            <h3 style="
              font-size: 15px;
              font-weight: 600;
              margin: 0 0 12px 0;
              color: ${text};
            ">🔖 핵심 키워드</h3>
            <div style="
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
            ">
              ${result.키워드.split(',').map(keyword => `
                <span style="
                  background: ${this.hexToRgba(accent, 0.15)};
                  color: ${text};
                  border: 1px solid ${this.hexToRgba(accent, 0.3)};
                  padding: 6px 12px;
                  border-radius: 16px;
                  font-size: 13px;
                  font-weight: 500;
                ">${this.escapeHtml(keyword.trim())}</span>
              `).join('')}
            </div>
          </section>
          ` : ''}

          ${result.검색어 ? `
          <section>
            <h3 style="
              font-size: 15px;
              font-weight: 600;
              margin: 0 0 12px 0;
              color: ${text};
            ">🔍 추천 검색어</h3>
            <div style="
              background: ${this.hexToRgba(surfaceAlt, 0.2)};
              border: 1px solid ${this.hexToRgba(accent, 0.4)};
              border-radius: 10px;
              padding: 16px;
              line-height: 1.6;
              font-size: 14px;
              color: ${text};
              font-weight: 500;
              display: flex;
              align-items: center;
              gap: 10px;
            ">
              <span style="font-size: 18px;">💡</span>
              <span>${this.escapeHtml(result.검색어)}</span>
            </div>
          </section>
          ` : ''}

          ${showProcessButton || block.factCheckResult ? `
          <div style="
            text-align: center; 
            margin-top: 8px;
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
          ">
            ${showProcessButton ? `
            <button type="button" class="detail-analysis-process" style="
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              padding: 12px 22px;
              border-radius: 10px;
              border: none;
              background: linear-gradient(135deg, ${this.hexToRgba(accent, 0.9)} 0%, ${this.hexToRgba(surfaceAlt, 0.9)} 100%);
              color: ${text};
              font-weight: 600;
              cursor: pointer;
              transition: transform 0.2s ease, box-shadow 0.2s ease;
              box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
            ">추론과정 확인</button>
            ` : ''}
            
            ${block.factCheckResult && block.factCheckResult.articles ? `
            <button type="button" class="view-compared-articles" data-block-id="${block.id}" style="
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              padding: 12px 22px;
              border-radius: 10px;
              border: none;
              background: linear-gradient(135deg, rgba(16, 185, 129, 0.9) 0%, rgba(5, 150, 105, 0.9) 100%);
              color: white;
              font-weight: 600;
              cursor: pointer;
              transition: transform 0.2s ease, box-shadow 0.2s ease;
              box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
            ">📰 비교 검증된 뉴스 보기 (${block.factCheckResult.articles.length})</button>
            ` : ''}
          </div>
          ` : ''}
        </div>
      </div>
    `;

    panel.appendChild(overlay);

    // 스크롤바 스타일 추가
    const scrollContainer = overlay.querySelector('.detail-scroll');
    if (scrollContainer) {
      // webkit 브라우저용 스크롤바 스타일
      const styleId = 'detail-scroll-style';
      let styleTag = document.getElementById(styleId);
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        styleTag.textContent = `
          .detail-scroll::-webkit-scrollbar {
            width: 8px;
          }
          .detail-scroll::-webkit-scrollbar-track {
            background: rgba(13, 13, 13, 0.3);
            border-radius: 4px;
          }
          .detail-scroll::-webkit-scrollbar-thumb {
            background: #BF9780;
            border-radius: 4px;
          }
          .detail-scroll::-webkit-scrollbar-thumb:hover {
            background: #D4A88A;
          }
        `;
        document.head.appendChild(styleTag);
      }
    }

    this.activeDetailOverlay = overlay;
    this.preDetailFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      overlay.style.transform = 'translateY(0)';
    });

    const backButton = overlay.querySelector('.detail-back-button');
    if (backButton) {
      backButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.closeDetailInPanel();
      });
      backButton.addEventListener('mouseenter', () => {
        backButton.style.background = 'rgba(13, 13, 13, 0.55)';
        backButton.style.transform = 'translateX(-2px)';
      });
      backButton.addEventListener('mouseleave', () => {
        backButton.style.background = 'rgba(13, 13, 13, 0.4)';
        backButton.style.transform = 'translateX(0)';
      });
      backButton.focus({ preventScroll: true });
    }

    const processButton = overlay.querySelector('.detail-analysis-process');
    if (processButton && showProcessButton) {
      processButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showAnalysisProcessModal(analysisProcess);
      });
      processButton.addEventListener('mouseenter', () => {
        processButton.style.transform = 'translateY(-2px)';
        processButton.style.boxShadow = '0 14px 28px rgba(0, 0, 0, 0.4)';
      });
      processButton.addEventListener('mouseleave', () => {
        processButton.style.transform = 'translateY(0)';
        processButton.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.35)';
      });
    }

    const comparisonButton = overlay.querySelector('.view-compared-articles');
    if (comparisonButton && block.factCheckResult) {
      comparisonButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const btnBlockId = comparisonButton.dataset.blockId;
        this.showComparisonNewsPanel(btnBlockId);
      });
      comparisonButton.addEventListener('mouseenter', () => {
        comparisonButton.style.transform = 'translateY(-2px)';
        comparisonButton.style.boxShadow = '0 14px 28px rgba(0, 0, 0, 0.3)';
      });
      comparisonButton.addEventListener('mouseleave', () => {
        comparisonButton.style.transform = 'translateY(0)';
        comparisonButton.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.25)';
      });
    }

    this.detailEscapeHandler = (event) => {
      if (event.key === 'Escape') {
        this.closeDetailInPanel();
      }
    };
    document.addEventListener('keydown', this.detailEscapeHandler);
  }

  closeDetailInPanel(skipAnimation = false) {
    if (!this.activeDetailOverlay) {
      return;
    }

    const overlay = this.activeDetailOverlay;

    // 뉴스 블록 리스트 다시 표시
    const panel = document.getElementById(this.panelId);
    if (panel) {
      const newsBlocksList = panel.querySelector('#analyzed-news-container');
      if (newsBlocksList) {
        const prevVisibility = newsBlocksList.dataset.prevVisibility;
        const prevOpacity = newsBlocksList.dataset.prevOpacity;
        const prevPointerEvents = newsBlocksList.dataset.prevPointerEvents;
        const prevMinHeight = newsBlocksList.dataset.prevMinHeight;

        if (prevVisibility !== undefined) {
          newsBlocksList.style.visibility = prevVisibility;
          delete newsBlocksList.dataset.prevVisibility;
        } else {
          newsBlocksList.style.visibility = '';
        }

        if (prevOpacity !== undefined) {
          newsBlocksList.style.opacity = prevOpacity;
          delete newsBlocksList.dataset.prevOpacity;
        } else {
          newsBlocksList.style.opacity = '';
        }

        if (prevPointerEvents !== undefined) {
          newsBlocksList.style.pointerEvents = prevPointerEvents;
          delete newsBlocksList.dataset.prevPointerEvents;
        } else {
          newsBlocksList.style.pointerEvents = '';
        }

        if (prevMinHeight !== undefined) {
          newsBlocksList.style.minHeight = prevMinHeight;
          delete newsBlocksList.dataset.prevMinHeight;
        } else {
          newsBlocksList.style.minHeight = '';
        }

        if (newsBlocksList.dataset.placeholderHeight) {
          delete newsBlocksList.dataset.placeholderHeight;
        }
      }

    }

    if (this.detailEscapeHandler) {
      document.removeEventListener('keydown', this.detailEscapeHandler);
      this.detailEscapeHandler = null;
    }

    const removeOverlay = () => {
      if (overlay.parentElement) {
        overlay.parentElement.removeChild(overlay);
      }

      if (panel) {
        const prevOverflow = panel.dataset.prevOverflow;
        if (prevOverflow !== undefined) {
          panel.style.overflow = prevOverflow;
          delete panel.dataset.prevOverflow;
        } else {
          panel.style.overflow = 'hidden auto';
        }
      }

      if (!skipAnimation && this.preDetailFocus && typeof this.preDetailFocus.focus === 'function') {
        try {
          this.preDetailFocus.focus({ preventScroll: true });
        } catch (error) {
          this.preDetailFocus.focus();
        }
      }
      this.activeDetailOverlay = null;
      this.preDetailFocus = null;
    };

    if (skipAnimation) {
      removeOverlay();
      return;
    }

    overlay.style.opacity = '0';
    overlay.style.transform = 'translateY(16px)';

    const timeoutId = setTimeout(() => {
      overlay.removeEventListener('transitionend', handleTransitionEnd);
      removeOverlay();
    }, 220);

    const handleTransitionEnd = () => {
      clearTimeout(timeoutId);
      removeOverlay();
    };

    overlay.addEventListener('transitionend', handleTransitionEnd, { once: true });
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
      const modalContent = modal.querySelector('.modal-content');
      if (modalContent) {
        modalContent.style.transform = 'scale(1) translateY(0)';
      }
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
      background: #E8E8E8;
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
    
    // 진위 여부에 따른 색상 가져오기
    const verdictColors = this.getVerdictColors(verdict);
    
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
          <div style="
            color: ${verdictColors.text}; 
            background: ${verdictColors.background}; 
            border: 2px solid ${verdictColors.border};
            padding: 12px; 
            border-radius: 8px; 
            font-weight: 600;
            font-size: 16px;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          ">${this.renderMarkdown(verdict)}</div>
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
        
        ${result.수상한문장 && Object.keys(result.수상한문장).length > 0 ? `
        <div style="margin-bottom: 16px;">
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">⚠️ 수상한 문장</h3>
          <div style="background: #FFF4E6; border: 2px solid #FFA726; padding: 12px; border-radius: 8px;">
            ${Object.entries(result.수상한문장).map(([sentence, reason]) => `
              <div style="
                margin-bottom: 12px;
                padding: 10px;
                background: white;
                border-left: 3px solid #FF9800;
                border-radius: 4px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              ">
                <div style="
                  color: #0D0D0D;
                  font-weight: 600;
                  margin-bottom: 6px;
                  font-size: 14px;
                  line-height: 1.5;
                ">"${this.escapeHtml(sentence)}"</div>
                <div style="
                  color: #737373;
                  font-size: 13px;
                  line-height: 1.5;
                  padding-left: 8px;
                  border-left: 2px solid #FFE0B2;
                ">→ ${this.escapeHtml(reason)}</div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
        
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
      this.closeBrandSelectionMenu();
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
  // 비교 뉴스 패널 표시
  showComparisonNewsPanel(blockId) {
    // blockId 타입 변환 (문자열 → 숫자)
    const numericBlockId = typeof blockId === 'string' ? parseInt(blockId, 10) : blockId;
    
    console.log('[showComparisonNewsPanel] blockId:', blockId, '→', numericBlockId);
    console.log('[showComparisonNewsPanel] newsBlocks keys:', Array.from(this.newsBlocks.keys()));
    
    const block = this.newsBlocks.get(numericBlockId);
    
    if (!block) {
      console.warn('[showComparisonNewsPanel] Block not found, blockId:', numericBlockId);
      return;
    }
    
    console.log('[showComparisonNewsPanel] block.factCheckResult:', block.factCheckResult);
    
    if (!block.factCheckResult || !block.factCheckResult.articles) {
      console.warn('[showComparisonNewsPanel] No fact check articles found');
      return;
    }

    const articles = block.factCheckResult.articles;
    console.log('[showComparisonNewsPanel] articles:', articles.length, '개');
    
    // 테마 색상 가져오기
    const { base, surface, surfaceAlt, accent, text, textAlt, border } = this.palette;
    
    // textAlt가 없으면 textMuted 사용
    const textAltColor = textAlt || this.palette.textMuted || this.hexToRgba(text, 0.7);
    const cardBackground = this.hexToRgba(surface, 0.95);

    // 오버레이 생성
    const overlay = document.createElement('div');
    overlay.className = 'comparison-news-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(13,13,13,0.6);
      z-index: 2147483650;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    // 패널 컨테이너
    const panelContainer = document.createElement('div');
    panelContainer.style.cssText = `
      background: ${cardBackground};
      border-radius: 16px;
      width: 90%;
      max-width: 600px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      border: 1px solid ${border};
      transform: translateX(100%);
      transition: transform 0.4s ease;
      overflow: hidden;
    `;

    // 헤더
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 24px;
      border-bottom: 1px solid ${border};
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;
    header.innerHTML = `
      <h3 style="
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: ${text};
        display: flex;
        align-items: center;
        gap: 10px;
      ">
        <span style="
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.25));
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid rgba(16, 185, 129, 0.4);
        ">📰</span>
        비교 검증된 뉴스
        <span style="
          font-size: 14px;
          font-weight: 500;
          color: ${textAltColor};
          background: ${surfaceAlt}40;
          padding: 4px 8px;
          border-radius: 6px;
        ">${articles.length}개</span>
      </h3>
      <button class="close-panel-btn" style="
        background: none;
        border: none;
        font-size: 28px;
        color: ${textAltColor};
        cursor: pointer;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.2s;
      ">&times;</button>
    `;

    // 기사 목록
    const articlesList = document.createElement('div');
    articlesList.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px 24px;
    `;

    articles.forEach((article, index) => {
      const articleItem = document.createElement('div');
      articleItem.style.cssText = `
        background: ${surface};
        border: 1px solid ${border};
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        gap: 14px;
      `;
      articleItem.addEventListener('mouseenter', () => {
        articleItem.style.transform = 'translateY(-2px)';
        articleItem.style.boxShadow = `0 8px 16px ${border}80`;
      });
      articleItem.addEventListener('mouseleave', () => {
        articleItem.style.transform = 'translateY(0)';
        articleItem.style.boxShadow = 'none';
      });
      articleItem.addEventListener('click', () => {
        window.open(article.link, '_blank');
      });

      // 썸네일
      let thumbnailHtml = '';
      if (article.pagemap?.cse_thumbnail?.[0]?.src) {
        thumbnailHtml = `
          <img src="${article.pagemap.cse_thumbnail[0].src}" style="
            width: 80px;
            height: 80px;
            object-fit: cover;
            border-radius: 8px;
            flex-shrink: 0;
          " alt="thumbnail">
        `;
      } else if (article.pagemap?.cse_image?.[0]?.src) {
        thumbnailHtml = `
          <img src="${article.pagemap.cse_image[0].src}" style="
            width: 80px;
            height: 80px;
            object-fit: cover;
            border-radius: 8px;
            flex-shrink: 0;
          " alt="thumbnail">
        `;
      }

      articleItem.innerHTML = `
        ${thumbnailHtml}
        <div style="flex: 1; min-width: 0;">
          <div style="
            display: inline-block;
            background: ${surfaceAlt}40;
            color: ${accent};
            font-size: 11px;
            font-weight: 600;
            padding: 3px 8px;
            border-radius: 6px;
            margin-bottom: 6px;
          ">#${index + 1}</div>
          <h4 style="
            margin: 0 0 8px 0;
            font-size: 15px;
            font-weight: 600;
            color: ${text};
            line-height: 1.4;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          ">${this.escapeHtml(article.title)}</h4>
          <p style="
            margin: 0 0 8px 0;
            font-size: 13px;
            color: ${textAltColor};
            line-height: 1.5;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          ">${this.escapeHtml(article.snippet)}</p>
          <a href="${article.link}" target="_blank" style="
            font-size: 12px;
            color: ${accent};
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 4px;
          ">
            <span>${this.escapeHtml(article.displayLink)}</span>
            <span style="font-size: 10px;">↗</span>
          </a>
        </div>
      `;

      articlesList.appendChild(articleItem);
    });

    panelContainer.appendChild(header);
    panelContainer.appendChild(articlesList);
    overlay.appendChild(panelContainer);
    document.body.appendChild(overlay);

    // 애니메이션 시작
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      panelContainer.style.transform = 'translateX(0)';
    });

    // 닫기 버튼 이벤트
    const closeBtn = header.querySelector('.close-panel-btn');
    closeBtn.addEventListener('click', () => {
      overlay.style.opacity = '0';
      panelContainer.style.transform = 'translateX(100%)';
      setTimeout(() => {
        document.body.removeChild(overlay);
      }, 300);
    });
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = `${surfaceAlt}60`;
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'none';
    });

    // 오버레이 클릭 시 닫기
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeBtn.click();
      }
    });

    // ESC 키로 닫기
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeBtn.click();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  showAnalysisProcessModal(analysisProcess) {
    // 마크다운 렌더링 (검은색 텍스트 강제)
    const renderProcessText = (text) => {
      if (!text) return '추론과정이 없습니다.';
      
      // <br> 태그 보호
      let html = text.replace(/<br\s*\/?>/gi, '|||BR_TAG|||');
      
      // HTML 이스케이프
      html = this.escapeHtml(html);
      
      // 마크다운 변환 (검은색 강제)
      html = html
        // 제목 (## 제목)
        .replace(/^## (.+)$/gm, '<h2 style="color: #0D0D0D; font-weight: 600; font-size: 16px; margin: 12px 0 6px 0; border-bottom: 1px solid #BF9780; padding-bottom: 4px;">$1</h2>')
        // 강조 (**텍스트**)
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color: #0D0D0D; font-weight: 600;">$1</strong>')
        // 숫자 리스트
        .replace(/^(\d+)\.\s*(.+)$/gm, '<li style="margin: 6px 0; padding-left: 8px; list-style: decimal; color: #0D0D0D;">$2</li>')
        // 일반 리스트
        .replace(/^-\s*(.+)$/gm, '<li style="margin: 4px 0; padding-left: 8px; list-style: disc; color: #0D0D0D;">$1</li>')
        // 보호했던 <br> 태그 복원
        .replace(/\|\|\|BR_TAG\|\|\|/g, '<br>')
        // 줄바꿈 처리
        .replace(/\n/g, '|||NEWLINE|||');
      
      // 리스트 감싸기
      html = html.replace(/(<li[^>]*list-style: decimal;[^>]*>.*?<\/li>(?:\s*\|\|\|NEWLINE\|\|\|\s*<li[^>]*list-style: decimal;[^>]*>.*?<\/li>)*)/gs, 
        '<ol style="margin: 8px 0; padding-left: 20px; color: #0D0D0D;">$1</ol>');
      html = html.replace(/(<li[^>]*list-style: disc;[^>]*>.*?<\/li>(?:\s*\|\|\|NEWLINE\|\|\|\s*<li[^>]*list-style: disc;[^>]*>.*?<\/li>)*)/gs, 
        '<ul style="margin: 8px 0; padding-left: 20px; color: #0D0D0D;">$1</ul>');
      
      // NEWLINE 제거 및 변환
      html = html.replace(/(<[ou]l[^>]*>.*?)\|\|\|NEWLINE\|\|\|(?=\s*<li)/gs, '$1');
      html = html.replace(/(<\/li>)\s*\|\|\|NEWLINE\|\|\|/g, '$1');
      html = html.replace(/\|\|\|NEWLINE\|\|\|/g, '<br>');
      
      return html;
    };
    
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
        background: #E8E8E8;
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
        ">${renderProcessText(analysisProcess)}</div>
      </div>
    `;

    document.body.appendChild(modal);

    // 애니메이션
    setTimeout(() => {
      modal.style.opacity = '1';
      const modalContent = modal.querySelector('.modal-content');
      if (modalContent) {
        modalContent.style.transform = 'scale(1)';
      }
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
        this.hide();
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
    floatingBtn.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        position: relative;
      ">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
      </div>
    `;
    floatingBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #8B5CF6 100%);
      color: white;
      border: none;
      cursor: pointer;
      box-shadow: 
        0 8px 25px rgba(99, 102, 241, 0.5),
        0 4px 12px rgba(0, 0, 0, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.25);
      z-index: 999998;
      transform: scale(0);
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(10px);
      border: 2px solid rgba(255, 255, 255, 0.15);
    `;

    document.body.appendChild(floatingBtn);

    setTimeout(() => {
      floatingBtn.style.transform = 'scale(1)';
    }, 10);

    // 호버 효과
    floatingBtn.addEventListener('mouseenter', () => {
      floatingBtn.style.transform = 'scale(1.15)';
      floatingBtn.style.boxShadow = `
        0 12px 35px rgba(99, 102, 241, 0.7),
        0 8px 20px rgba(0, 0, 0, 0.25),
        inset 0 1px 0 rgba(255, 255, 255, 0.35)
      `;
      floatingBtn.style.background = 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A78BFA 100%)';
    });

    floatingBtn.addEventListener('mouseleave', () => {
      floatingBtn.style.transform = 'scale(1)';
      floatingBtn.style.boxShadow = `
        0 8px 25px rgba(99, 102, 241, 0.5),
        0 4px 12px rgba(0, 0, 0, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.25)
      `;
      floatingBtn.style.background = 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #8B5CF6 100%)';
    });

    // 클릭 효과
    floatingBtn.addEventListener('mousedown', () => {
      floatingBtn.style.transform = 'scale(1.05)';
    });

    floatingBtn.addEventListener('mouseup', () => {
      floatingBtn.style.transform = 'scale(1.15)';
    });

    // 클릭 시 패널 토글
    floatingBtn.addEventListener('click', () => {
      console.log('플로팅 버튼 클릭됨');
      const panel = document.getElementById('news-analysis-panel');
      
      if (panel) {
        console.log('패널 발견:', panel);
        console.log('패널 __analysisPanel:', panel.__analysisPanel);
        console.log('패널 data-open:', panel.dataset.open);
        
        if (panel.__analysisPanel) {
          // 패널이 이미 열려있으면 닫기, 닫혀있으면 열기
          if (panel.dataset.open === 'true') {
            console.log('패널이 이미 열려있음 - 닫기 시도');
            panel.__analysisPanel.hide();
          } else {
            console.log('패널 열기 시도');
            panel.__analysisPanel.show();
            floatingBtn.style.transform = 'scale(0)';
            setTimeout(() => {
              floatingBtn.remove();
            }, 150);
          }
        } else {
          // 패널은 있지만 인스턴스가 손상된 경우, 패널을 제거하고 새로 생성
          console.log('패널 인스턴스가 손상됨, 패널 제거 후 새로 생성');
          panel.remove();
          
          if (typeof window.createEmptyPanel === 'function') {
            const newPanel = window.createEmptyPanel();
            if (newPanel && newPanel.__analysisPanel) {
              newPanel.__analysisPanel.show();
              floatingBtn.style.transform = 'scale(0)';
              setTimeout(() => {
                floatingBtn.remove();
              }, 300);
            } else {
              console.error('새 패널 생성 실패');
            }
          } else {
            console.error('createEmptyPanel 함수를 찾을 수 없음');
          }
        }
      } else {
        // 패널이 없는 경우 (뉴스 데이터가 없을 때)
        console.log('플로팅 버튼 클릭: 패널이 없어서 빈 패널을 생성합니다.');
        if (typeof window.createEmptyPanel === 'function') {
          const newPanel = window.createEmptyPanel();
          if (newPanel && newPanel.__analysisPanel) {
            newPanel.__analysisPanel.show();
            floatingBtn.style.transform = 'scale(0)';
            setTimeout(() => {
              floatingBtn.remove();
            }, 300);
          } else {
            console.error('새 패널 생성 실패');
          }
        } else {
          console.error('createEmptyPanel 함수를 찾을 수 없음');
        }
      }
    });
  }

  // 설정 이벤트 (API 키 관리)
  attachSettingsEvent(panel) {
    console.log('[Settings] Attaching settings event...');
    const settingsBtn = panel.querySelector('#settings-btn');
    
    if (settingsBtn) {
      console.log('[Settings] Settings button found:', settingsBtn);
      
      // 기존 이벤트 제거 후 재연결
      const newBtn = settingsBtn.cloneNode(true);
      settingsBtn.parentNode.replaceChild(newBtn, settingsBtn);
      
      console.log('[Settings] Event listener attached');
      
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[Settings] Settings button clicked!');
        
        if (document.getElementById('settings-panel-modal')) {
          console.log('[Settings] Settings panel already exists');
          return;
        }
        
        this.checkSavedApiKey().then((savedApiKey) => {
          console.log('[Settings] Creating settings panel with API key:', savedApiKey ? 'exists' : 'none');
          const modal = this.createSettingsPanel(savedApiKey);
          document.body.appendChild(modal);
          
          // 강제로 스타일 적용
          modal.style.display = 'flex';
          modal.style.visibility = 'visible';
          
          setTimeout(() => {
            modal.style.opacity = '1';
            const modalContent = modal.querySelector('.settings-panel-content');
            if (modalContent) {
              modalContent.style.transform = 'scale(1)';
            }
            console.log('[Settings] Settings panel animation completed');
          }, 10);
        }).catch(error => {
          console.error('[Settings] Error creating settings panel:', error);
        });
      });
    } else {
      console.error('[Settings] Settings button NOT found! Panel:', panel);
      console.error('[Settings] Panel HTML:', panel ? panel.innerHTML.substring(0, 500) : 'Panel is null');
    }
  }

  // 뉴스 브랜드 정의
  getNewsBrandDefinitions() {
    return [
      { id: 'yonhap', name: '연합뉴스', icon: '연' },
      { id: 'chosun', name: '조선일보', icon: '조' },
      { id: 'joongang', name: '중앙일보', icon: '중' },
      { id: 'donga', name: '동아일보', icon: '동' },
      { id: 'khan', name: '경향신문', icon: '경' },
      { id: 'hani', name: '한겨레', icon: '한' },
      { id: 'sbs', name: 'SBS', icon: 'S' },
      { id: 'kbs', name: 'KBS', icon: 'K' },
      { id: 'mbc', name: 'MBC', icon: 'M' },
      { id: 'jtbc', name: 'JTBC', icon: 'J' }
    ];
  }

  getNewsBrandSelectionLabel(selectedBrands = null) {
    const currentSelection = selectedBrands || this.getSelectedNewsBrands();
    const allBrands = this.getNewsBrandDefinitions();
    if (!currentSelection || currentSelection.length === 0 || currentSelection.length === allBrands.length) {
      return '전체 뉴스 사용 중';
    }
    if (currentSelection.length === 1) {
      const brandInfo = allBrands.find((brand) => brand.id === currentSelection[0]);
      return brandInfo ? `${brandInfo.name}만 사용` : '1개 뉴스만 사용';
    }
    return `${currentSelection.length}/${allBrands.length}개 뉴스 사용`;
  }

  toggleBrandSelectionMenu(triggerEl) {
    if (this.activeBrandSelectionMenu && this.activeBrandSelectionMenu.trigger === triggerEl) {
      this.closeBrandSelectionMenu();
      return;
    }
    this.openBrandSelectionMenu(triggerEl);
  }

  openBrandSelectionMenu(triggerEl) {
    this.closeBrandSelectionMenu();

    const brands = this.getNewsBrandDefinitions();
    const selectedBrands = this.getSelectedNewsBrands();
    const modalContent = triggerEl.closest('.settings-panel-content');
    const container = modalContent || document.body;
    const menu = document.createElement('div');
    menu.className = 'brand-selection-menu';
    menu.style.cssText = `
      position: absolute;
      width: 280px;
      background: #FFFFFF;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 18px 36px rgba(0, 0, 0, 0.18);
      z-index: 10000;
      opacity: 0;
      transform: translateY(-6px);
      transition: opacity 0.2s ease, transform 0.2s ease;
    `;

    const buttonRect = triggerEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const left = Math.min(
      Math.max(16, buttonRect.left - containerRect.left),
      (container.clientWidth || 540) - 300
    );
    const top = buttonRect.bottom - containerRect.top + 8;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
        <div style="font-size: 14px; font-weight: 600; color: #0D0D0D;">뉴스 브랜드 선택</div>
        <button type="button" class="brand-menu-close" style="
          background: none;
          border: none;
          color: #6B7280;
          font-size: 18px;
          cursor: pointer;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          transition: background-color 0.2s ease;
        ">&times;</button>
      </div>
      <p style="font-size: 12px; color: #6B7280; margin: 0 0 12px 0;">사용할 뉴스 출처를 선택하세요. 최소 1개 이상 유지해야 합니다.</p>
    `;

    const listWrapper = document.createElement('div');
    listWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; padding-right: 4px;';

    brands.forEach((brand) => {
      const row = document.createElement('label');
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        color: #0D0D0D;
        padding: 6px 6px;
        border-radius: 8px;
        cursor: pointer;
        transition: background-color 0.15s ease;
      `;
      row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = 'rgba(191, 151, 128, 0.12)';
      });
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = 'transparent';
      });

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.brand = brand.id;
      checkbox.checked = selectedBrands.includes(brand.id);
      checkbox.style.cssText = 'width: 16px; height: 16px; accent-color: #BF9780; flex-shrink: 0;';
      checkbox.addEventListener('change', (event) => {
        this.handleBrandSelectionChange(brand.id, event.target.checked, event.target, triggerEl);
      });

      const icon = document.createElement('div');
      icon.textContent = brand.icon;
      icon.style.cssText = `
        width: 24px;
        height: 24px;
        border-radius: 6px;
        background: rgba(191, 151, 128, 0.15);
        color: #8B5E3C;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
        flex-shrink: 0;
      `;

      const label = document.createElement('span');
      label.textContent = brand.name;
      label.style.cssText = 'flex: 1;';

      row.appendChild(checkbox);
      row.appendChild(icon);
      row.appendChild(label);
      listWrapper.appendChild(row);
    });

    menu.appendChild(listWrapper);

    container.appendChild(menu);
    requestAnimationFrame(() => {
      menu.style.opacity = '1';
      menu.style.transform = 'translateY(0)';
    });

    const closeBtn = menu.querySelector('.brand-menu-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeBrandSelectionMenu());
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.backgroundColor = 'rgba(13, 13, 13, 0.08)';
      });
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.backgroundColor = 'transparent';
      });
    }

    const outsideHandler = (event) => {
      if (!menu.contains(event.target) && event.target !== triggerEl) {
        this.closeBrandSelectionMenu();
      }
    };

    const keyHandler = (event) => {
      if (event.key === 'Escape') {
        this.closeBrandSelectionMenu();
      }
    };

    document.addEventListener('mousedown', outsideHandler, true);
    document.addEventListener('keydown', keyHandler, true);

    this.activeBrandSelectionMenu = {
      menu,
      trigger: triggerEl,
      outsideHandler,
      keyHandler
    };
  }

  closeBrandSelectionMenu() {
    if (!this.activeBrandSelectionMenu) return;
    const { menu, outsideHandler, keyHandler } = this.activeBrandSelectionMenu;
    if (menu && menu.parentElement) {
      menu.parentElement.removeChild(menu);
    }
    if (outsideHandler) {
      document.removeEventListener('mousedown', outsideHandler, true);
    }
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true);
    }
    this.activeBrandSelectionMenu = null;
  }

  handleBrandSelectionChange(brandId, isChecked, checkboxEl, triggerEl) {
    let selectedBrands = this.getSelectedNewsBrands();
    if (isChecked) {
      if (!selectedBrands.includes(brandId)) {
        selectedBrands.push(brandId);
      }
    } else {
      if (selectedBrands.length <= 1) {
        checkboxEl.checked = true;
        alert('최소 한 개 이상의 뉴스 브랜드를 유지해야 합니다.');
        return;
      }
      selectedBrands = selectedBrands.filter((id) => id !== brandId);
    }
    this.setSelectedNewsBrands(selectedBrands);
    this.updateBrandSelectorButtonLabel(triggerEl);
  }

  updateBrandSelectorButtonLabel(buttonEl) {
    if (!buttonEl) return;
    buttonEl.textContent = this.getNewsBrandSelectionLabel();
  }

  // 선택된 뉴스 브랜드 가져오기
  getSelectedNewsBrands() {
    // 항상 localStorage에서 동기적으로 가져오기
    try {
      const stored = localStorage.getItem('selectedNewsBrands');
      const defaultBrands = this.getNewsBrandDefinitions().map((brand) => brand.id);
      if (!stored) {
        return defaultBrands;
      }
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      return defaultBrands;
    } catch (error) {
      console.error('Failed to get selected news brands:', error);
      return this.getNewsBrandDefinitions().map((brand) => brand.id);
    }
  }

  // 선택된 뉴스 브랜드 설정
  setSelectedNewsBrands(brands) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ selectedNewsBrands: brands });
    }
    localStorage.setItem('selectedNewsBrands', JSON.stringify(brands));
  }

  // 새로운 설정 패널 생성
  createSettingsPanel(savedApiKey) {
    const modal = document.createElement('div');
    modal.id = 'settings-panel-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(13,13,13,0.5);
      z-index: 2147483648;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
      backdrop-filter: blur(4px);
    `;
    
    const isApiKeySet = !!savedApiKey;
    const maskedKey = savedApiKey ? `${savedApiKey.substring(0, 8)}...${savedApiKey.substring(savedApiKey.length - 4)}` : '';
    const brandSelectionLabel = this.getNewsBrandSelectionLabel();
    
    const modalContent = document.createElement('div');
    modalContent.className = 'settings-panel-content';
    modalContent.style.cssText = `
      background: linear-gradient(135deg, #F2F2F2 0%, #E8E8E8 100%);
      border-radius: 16px;
      padding: 32px;
      width: 540px;
      max-width: 90vw;
      max-height: 85vh;
      overflow-y: auto;
      position: relative;
      display: flex;
      flex-direction: column;
      transform: scale(0.8);
      transition: all 0.3s ease;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    `;
    
    modalContent.innerHTML = `
      <button class="close-modal" style="
        position: absolute; 
        top: 12px; 
        right: 12px; 
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
      
      <h2 style="
        font-size: 24px; 
        font-weight: bold; 
        margin-bottom: 32px; 
        text-align: center; 
        color: #0D0D0D;
      ">설정</h2>
      
      <!-- API 키 설정 -->
      <div style="
        display: flex; 
        align-items: center; 
        justify-content: space-between; 
        padding: 16px 0; 
        border-bottom: 1px solid #E5E5E5;
      ">
        <div>
          <div style="
            font-size: 16px; 
            font-weight: 600; 
            color: #0D0D0D; 
            margin-bottom: 4px;
          ">API 키 설정</div>
          <div style="
            font-size: 13px; 
            color: #737373;
          ">${isApiKeySet ? `설정됨: ${maskedKey}` : '설정되지 않음'}</div>
        </div>
        <button class="api-key-btn" style="
          background: #BF9780; 
          color: white; 
          padding: 8px 16px; 
          border-radius: 6px; 
          font-weight: 600; 
          border: none; 
          cursor: pointer; 
          transition: background-color 0.2s; 
          font-size: 14px;
        ">${isApiKeySet ? '수정' : '설정'}</button>
      </div>
      
      <!-- Google Search API 사용 설정 -->
      <div style="
        padding: 16px 0;
        border-bottom: 1px solid #E5E5E5;
      ">
        <div style="
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          margin-bottom: 12px;
        ">
          <div>
            <div style="
              font-size: 16px; 
              font-weight: 600; 
              color: #0D0D0D; 
              margin-bottom: 4px;
            ">Google Search API 사용</div>
            <div style="
              font-size: 13px; 
              color: #737373;
            ">유사 기사 찾기, 사실 검증 기능 활성화</div>
          </div>
          <button class="google-search-toggle-btn" style="
            background: ${this.getGoogleSearchEnabled() ? '#10B981' : '#9CA3AF'}; 
            color: white; 
            padding: 8px 16px; 
            border-radius: 6px; 
            font-weight: 600; 
            border: none; 
            cursor: pointer; 
            transition: background-color 0.2s; 
            font-size: 14px;
          ">${this.getGoogleSearchEnabled() ? '켜짐' : '꺼짐'}</button>
        </div>
        
        <div class="google-api-key-section" style="
          display: ${this.getGoogleSearchEnabled() ? 'block' : 'none'};
          margin-top: 12px;
          padding: 12px;
          background: rgba(191, 151, 128, 0.08);
          border-radius: 8px;
        ">
          <div style="
            font-size: 14px; 
            font-weight: 600; 
            color: #0D0D0D; 
            margin-bottom: 8px;
          ">Google Search API Key</div>
          <div style="
            font-size: 13px; 
            color: #737373;
            margin-bottom: 8px;
          " id="google-api-key-status">API 키 확인 중...</div>
          <button class="google-api-key-btn" style="
            background: #BF9780; 
            color: white; 
            padding: 8px 16px; 
            border-radius: 6px; 
            font-weight: 600; 
            border: none; 
            cursor: pointer; 
            transition: background-color 0.2s; 
            font-size: 14px;
            width: 100%;
            margin-bottom: 12px;
          ">API 키 설정</button>
          <div style="
            margin-top: 12px;
            padding: 12px;
            background: rgba(255, 255, 255, 0.6);
            border-radius: 8px;
            border: 1px solid rgba(191, 151, 128, 0.25);
          ">
            <div style="
              font-size: 14px;
              font-weight: 600;
              color: #0D0D0D;
              margin-bottom: 4px;
            ">뉴스 브랜드 선택</div>
            <div style="
              font-size: 12px;
              color: #6B7280;
              margin-bottom: 10px;
            ">Google Search API가 사용할 뉴스 출처를 선택합니다.</div>
            <button class="brand-selector-btn" style="
              width: 100%;
              text-align: left;
              background: #FFFFFF;
              border: 1px solid rgba(0, 0, 0, 0.1);
              border-radius: 8px;
              padding: 10px 12px;
              font-size: 13px;
              color: #0D0D0D;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
              cursor: pointer;
              transition: border-color 0.2s ease, box-shadow 0.2s ease;
            ">
              <span>${brandSelectionLabel}</span>
              <span style="font-size: 16px; color: #9CA3AF;">▾</span>
            </button>
          </div>
          
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(191, 151, 128, 0.2);">
            <div style="
              font-size: 14px; 
              font-weight: 600; 
              color: #0D0D0D; 
              margin-bottom: 8px;
            ">Custom Search Engine ID</div>
            <div style="
              font-size: 12px; 
              color: #737373;
              line-height: 1.5;
              background: rgba(139, 115, 85, 0.08);
              padding: 8px;
              border-radius: 4px;
            ">
              <div style="margin-bottom: 4px;">
                <strong>뉴스 검색:</strong> Daum 뉴스 전용
              </div>
              <div>
                <strong>사실 검증:</strong> 전체 웹 검색
              </div>
            </div>
          </div>
        </div>
      </div>

        <!-- 패널 자동 열기 -->
        <div style="
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          padding: 16px 0;
          border-bottom: 1px solid #E5E5E5;
        ">
          <div>
            <div style="
              font-size: 16px; 
              font-weight: 600; 
              color: #0D0D0D; 
              margin-bottom: 4px;
            ">패널 자동 열기</div>
            <div style="
              font-size: 13px; 
              color: #737373;
            ">뉴스 페이지 방문 시 자동으로 패널 표시</div>
          </div>
          <button class="auto-open-btn" style="
            background: ${this.getAutoOpenSetting() ? '#10B981' : '#9CA3AF'}; 
            color: white; 
            padding: 8px 16px; 
            border-radius: 6px; 
            font-weight: 600; 
            border: none; 
            cursor: pointer; 
            transition: background-color 0.2s; 
            font-size: 14px;
          ">${this.getAutoOpenSetting() ? '켜짐' : '꺼짐'}</button>
        </div>

      <!-- 패널 투명도 조절 -->
      <div style="
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-top: 16px;
      ">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="
              font-size: 16px;
              font-weight: 600;
              color: #0D0D0D;
              margin-bottom: 4px;
            ">패널 투명도</div>
            <div style="font-size: 13px; color: #737373;">UI를 더 밝거나 더 투명하게 조절합니다</div>
          </div>
          <span class="panel-opacity-value" style="
            font-size: 14px;
            font-weight: 600;
            color: #0D0D0D;
            min-width: 48px;
            text-align: right;
          ">${Math.round(this.getPanelOpacitySetting() * 100)}%</span>
        </div>
        <input type="range" class="panel-opacity-slider" min="0.4" max="1" step="0.05" value="${this.getPanelOpacitySetting()}" style="
          width: 100%;
          accent-color: #BF9780;
        " />
      </div>

      <!-- 교차 검증 깊이 설정 -->
      <div style="padding: 16px; background: rgba(191, 151, 128, 0.08); border-radius: 8px; margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 14px; font-weight: 600; color: #0D0D0D;">교차 검증 깊이</span>
            <span style="font-size: 12px; color: rgba(13, 13, 13, 0.6);">(재귀적 피드백 루프)</span>
          </div>
          <span class="cross-verification-depth-value" style="
            font-size: 14px;
            font-weight: 600;
            color: #0D0D0D;
            min-width: 48px;
            text-align: right;
          ">${this.getCrossVerificationDepthSetting()}회</span>
        </div>
        <input type="range" class="cross-verification-depth-slider" min="2" max="4" step="1" value="${this.getCrossVerificationDepthSetting()}" style="
          width: 100%;
          accent-color: #BF9780;
        " />
        <div style="font-size: 11px; color: rgba(13, 13, 13, 0.5); margin-top: 6px;">
          매 단계마다 직전 결과를 참고하여 새로운 판단을 내립니다
        </div>
      </div>

      <!-- 전체 뉴스 블록 삭제 -->
      <div style="padding: 16px; background: rgba(239, 68, 68, 0.08); border-radius: 8px; margin-top: 12px; border: 1px solid rgba(239, 68, 68, 0.2);">
        <div style="margin-bottom: 8px;">
          <span style="font-size: 14px; font-weight: 600; color: #0D0D0D;">데이터 관리</span>
        </div>
        <button class="delete-all-news-btn" style="
          background: rgba(239, 68, 68, 0.1);
          color: rgba(239, 68, 68, 1);
          padding: 10px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid rgba(239, 68, 68, 0.3);
          cursor: pointer;
          width: 100%;
          transition: all 0.2s;
        " onmouseover="this.style.background='rgba(239, 68, 68, 0.2)'; this.style.borderColor='rgba(239, 68, 68, 0.5)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.1)'; this.style.borderColor='rgba(239, 68, 68, 0.3)'">🗑️ 모든 뉴스 블록 삭제</button>
        <div style="font-size: 11px; color: rgba(13, 13, 13, 0.5); margin-top: 6px;">
          저장된 모든 분석 결과를 영구적으로 삭제합니다
        </div>
      </div>
    `;
    
    modal.appendChild(modalContent);
    
    // 이벤트 연결
    this.attachSettingsPanelEvents(modal, modalContent, savedApiKey);
    
    return modal;
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

  // 설정 패널 이벤트 연결
  attachSettingsPanelEvents(modal, modalContent, savedApiKey) {
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
    
    // API 키 설정 버튼
    const apiKeyBtn = modalContent.querySelector('.api-key-btn');
    if (apiKeyBtn) {
      apiKeyBtn.addEventListener('click', () => {
        closeModal();
        // API 키 모달 열기
        setTimeout(() => {
          if (document.getElementById('api-key-input-modal')) {
            return;
          }
          
          const apiModal = this.createApiKeyModal(savedApiKey);
          document.body.appendChild(apiModal);
          
          apiModal.style.display = 'flex';
          apiModal.style.visibility = 'visible';
          
          setTimeout(() => {
            apiModal.style.opacity = '1';
            const apiModalContent = apiModal.querySelector('.modal-content');
            if (apiModalContent) {
              apiModalContent.style.transform = 'scale(1)';
            }
          }, 10);
        }, 100);
      });
      
      apiKeyBtn.addEventListener('mouseenter', () => {
        apiKeyBtn.style.backgroundColor = '#A68570';
      });
      apiKeyBtn.addEventListener('mouseleave', () => {
        apiKeyBtn.style.backgroundColor = '#BF9780';
      });
    }
    
    // 패널 자동 열기 토글 버튼
    const autoOpenBtn = modalContent.querySelector('.auto-open-btn');
    if (autoOpenBtn) {
      autoOpenBtn.addEventListener('click', () => {
        const currentSetting = this.getAutoOpenSetting();
        const newSetting = !currentSetting;
        this.setAutoOpenSetting(newSetting);
        
        // 버튼 상태 업데이트
        autoOpenBtn.style.backgroundColor = newSetting ? '#10B981' : '#9CA3AF';
        autoOpenBtn.textContent = newSetting ? '켜짐' : '꺼짐';
      });
      
      autoOpenBtn.addEventListener('mouseenter', () => {
        const currentSetting = this.getAutoOpenSetting();
        autoOpenBtn.style.backgroundColor = currentSetting ? '#0EA16F' : '#6B7280';
      });
      autoOpenBtn.addEventListener('mouseleave', () => {
        const currentSetting = this.getAutoOpenSetting();
        autoOpenBtn.style.backgroundColor = currentSetting ? '#10B981' : '#9CA3AF';
      });
    }

    // 뉴스 브랜드 선택 버튼
    const brandSelectorBtn = modalContent.querySelector('.brand-selector-btn');
    if (brandSelectorBtn) {
      brandSelectorBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleBrandSelectionMenu(brandSelectorBtn);
      });
      brandSelectorBtn.addEventListener('mouseenter', () => {
        brandSelectorBtn.style.borderColor = '#BF9780';
        brandSelectorBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
      });
      brandSelectorBtn.addEventListener('mouseleave', () => {
        brandSelectorBtn.style.borderColor = 'rgba(0, 0, 0, 0.1)';
        brandSelectorBtn.style.boxShadow = 'none';
      });
    }

    // Google Search API 토글 버튼
    const googleSearchToggleBtn = modalContent.querySelector('.google-search-toggle-btn');
    const googleApiKeySection = modalContent.querySelector('.google-api-key-section');
    
    if (googleSearchToggleBtn) {
      // 초기 상태 설정
      const isEnabled = this.getGoogleSearchEnabled();
      googleSearchToggleBtn.textContent = isEnabled ? '켜짐' : '꺼짐';
      googleSearchToggleBtn.style.backgroundColor = isEnabled ? '#10B981' : '#9CA3AF';
      if (googleApiKeySection) {
        googleApiKeySection.style.display = isEnabled ? 'block' : 'none';
      }

      googleSearchToggleBtn.addEventListener('click', () => {
        const newSetting = !this.getGoogleSearchEnabled();
        this.setGoogleSearchEnabled(newSetting);
        
        // 버튼 상태 업데이트
        googleSearchToggleBtn.textContent = newSetting ? '켜짐' : '꺼짐';
        googleSearchToggleBtn.style.backgroundColor = newSetting ? '#10B981' : '#9CA3AF';
        
        // API 키 섹션 표시/숨김
        if (googleApiKeySection) {
          googleApiKeySection.style.display = newSetting ? 'block' : 'none';
        }
        if (!newSetting) {
          this.closeBrandSelectionMenu();
        }
      });

      // 호버 효과
      googleSearchToggleBtn.addEventListener('mouseenter', () => {
        googleSearchToggleBtn.style.transform = 'translateY(-2px)';
        googleSearchToggleBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
      });
      googleSearchToggleBtn.addEventListener('mouseleave', () => {
        googleSearchToggleBtn.style.transform = 'translateY(0)';
        googleSearchToggleBtn.style.boxShadow = 'none';
      });
    }

    // Google API 키 설정 버튼
    const googleApiKeyBtn = modalContent.querySelector('.google-api-key-btn');
    const googleApiKeyStatus = modalContent.querySelector('#google-api-key-status');
    
    if (googleApiKeyBtn) {
      // 초기 API 키 상태 확인
      this.getGoogleApiKey().then(key => {
        if (googleApiKeyStatus) {
          googleApiKeyStatus.textContent = key ? 'API 키 설정됨 ✓' : 'API 키 없음';
          googleApiKeyStatus.style.color = key ? '#10B981' : '#9CA3AF';
        }
      });

      googleApiKeyBtn.addEventListener('click', async () => {
        const inputKey = prompt('Google Custom Search API 키를 입력하세요:');
        if (inputKey && inputKey.trim()) {
          try {
            await this.saveGoogleApiKey(inputKey.trim());
            if (googleApiKeyStatus) {
              googleApiKeyStatus.textContent = 'API 키 설정됨 ✓';
              googleApiKeyStatus.style.color = '#10B981';
            }
            alert('API 키가 저장되었습니다.');
          } catch (error) {
            console.error('API 키 저장 실패:', error);
            alert('API 키 저장에 실패했습니다.');
          }
        }
      });

      // 호버 효과
      googleApiKeyBtn.addEventListener('mouseenter', () => {
        googleApiKeyBtn.style.transform = 'translateY(-2px)';
        googleApiKeyBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
      });
      googleApiKeyBtn.addEventListener('mouseleave', () => {
        googleApiKeyBtn.style.transform = 'translateY(0)';
        googleApiKeyBtn.style.boxShadow = 'none';
      });
    }

    // Google CSE ID 설정 버튼 제거됨 (기본값 사용)
    // - 뉴스 검색: a6724cd0397f24747 (Daum 뉴스 전용)
    // - 사실 검증: 241358ac91fe04cd8 (전체 웹)

    // 패널 투명도 슬라이더
    const opacitySlider = modalContent.querySelector('.panel-opacity-slider');
    const opacityValueLabel = modalContent.querySelector('.panel-opacity-value');
    if (opacitySlider && opacityValueLabel) {
      const updateOpacity = (rawValue, persist = false) => {
        const parsed = parseFloat(rawValue);
        const numeric = Math.min(Math.max(Number.isNaN(parsed) ? this.panelOpacity : parsed, 0.4), 1);
        opacityValueLabel.textContent = `${Math.round(numeric * 100)}%`;
        opacitySlider.value = numeric;
        if (persist) {
          this.setPanelOpacitySetting(numeric);
        } else {
          this.applyPanelOpacity(numeric);
        }
      };

      opacitySlider.addEventListener('input', (event) => {
        updateOpacity(event.target.value, false);
      });

      opacitySlider.addEventListener('change', (event) => {
        updateOpacity(event.target.value, true);
      });
    }

    // 교차 검증 깊이 슬라이더
    const depthSlider = modalContent.querySelector('.cross-verification-depth-slider');
    const depthValueLabel = modalContent.querySelector('.cross-verification-depth-value');
    if (depthSlider && depthValueLabel) {
      const updateDepth = (rawValue, persist = false) => {
        const parsed = parseInt(rawValue, 10);
        const numeric = Math.min(Math.max(Number.isNaN(parsed) ? this.crossVerificationDepth : parsed, 2), 4);
        depthValueLabel.textContent = `${numeric}회`;
        depthSlider.value = numeric;
        if (persist) {
          this.setCrossVerificationDepthSetting(numeric);
        } else {
          this.crossVerificationDepth = numeric;
        }
      };

      depthSlider.addEventListener('input', (event) => {
        updateDepth(event.target.value, false);
      });

      depthSlider.addEventListener('change', (event) => {
        updateDepth(event.target.value, true);
      });
    }

    // 전체 뉴스 블록 삭제 버튼
    const deleteAllBtn = modalContent.querySelector('.delete-all-news-btn');
    if (deleteAllBtn) {
      deleteAllBtn.addEventListener('click', () => {
        if (confirm('모든 뉴스 블록을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
          // 모든 뉴스 블록 삭제
          this.newsBlocks.clear();
          this.saveNewsBlocks();
          
          // URL별 진위 결과 저장 데이터도 삭제
          chrome.storage.local.remove('factcheck_verdicts', () => {
            console.log('URL별 진위 결과 저장 데이터가 삭제되었습니다.');
          });
          
          this.updatePanel();
          
          // 모달 닫기
          modal.style.opacity = '0';
          setTimeout(() => modal.remove(), 300);
          
          console.log('모든 뉴스 블록이 삭제되었습니다.');
        }
      });
    }
  }

  // API 키 모달 생성 (별도)
  createApiKeyModal(savedApiKey) {
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

  // 자동 열기 설정 가져오기
  getAutoOpenSetting() {
    try {
      const setting = localStorage.getItem('factcheck_auto_open');
      return setting !== null ? JSON.parse(setting) : true; // 기본값: true
    } catch (error) {
      console.error('Failed to get auto open setting:', error);
      return true;
    }
  }

  // 자동 열기 설정 저장
  setAutoOpenSetting(value) {
    try {
      localStorage.setItem('factcheck_auto_open', JSON.stringify(value));
      console.log('Auto open setting updated:', value);
    } catch (error) {
      console.error('Failed to save auto open setting:', error);
    }
  }

  // Google Search API 사용 설정 가져오기
  getGoogleSearchEnabled() {
    try {
      const setting = localStorage.getItem('factcheck_google_search_enabled');
      return setting !== null ? JSON.parse(setting) : false; // 기본값: false (꺼짐)
    } catch (error) {
      console.error('Failed to get Google Search setting:', error);
      return false;
    }
  }

  // Google Search API 사용 설정 저장
  setGoogleSearchEnabled(value) {
    try {
      localStorage.setItem('factcheck_google_search_enabled', JSON.stringify(value));
      console.log('Google Search API setting updated:', value);
      // USE_REAL_API 플래그도 동기화
      this.USE_REAL_API = value;
    } catch (error) {
      console.error('Failed to save Google Search setting:', error);
    }
  }

  // Google CSE ID는 기본값으로 고정됨 (함수 제거)
  // - 뉴스: a6724cd0397f24747 (Daum 뉴스)
  // - 일반: 241358ac91fe04cd8 (전체 웹)

  // 축소 상태 설정 가져오기
  getCollapsedStateSetting() {
    try {
      const setting = localStorage.getItem('factcheck_panel_collapsed');
      return setting !== null ? JSON.parse(setting) : false;
    } catch (error) {
      console.error('Failed to get collapsed state setting:', error);
      return false;
    }
  }

  // 축소 상태 설정 저장
  saveCollapsedStateSetting(value) {
    try {
      localStorage.setItem('factcheck_panel_collapsed', JSON.stringify(value));
      console.log('Collapsed state setting updated:', value);
    } catch (error) {
      console.error('Failed to save collapsed state setting:', error);
    }
  }

  // 패널 투명도 설정 가져오기
  getPanelOpacitySetting() {
    try {
      const stored = localStorage.getItem('factcheck_panel_opacity');
      const parsed = stored !== null ? parseFloat(stored) : 0.95;
      if (Number.isNaN(parsed)) {
        return 0.95;
      }
      return Math.min(Math.max(parsed, 0.4), 1);
    } catch (error) {
      console.error('Failed to get panel opacity setting:', error);
      return 0.95;
    }
  }

  // 패널 투명도 설정 저장 및 적용
  setPanelOpacitySetting(value) {
    const clamped = Math.min(Math.max(value, 0.4), 1);
    try {
      localStorage.setItem('factcheck_panel_opacity', String(clamped));
      console.log('Panel opacity setting updated:', clamped);
    } catch (error) {
      console.error('Failed to save panel opacity setting:', error);
    }

    this.panelOpacity = clamped;
    this.applyPanelOpacity(clamped);
  }

  // 교차 검증 깊이 설정 가져오기
  getCrossVerificationDepthSetting() {
    try {
      const stored = localStorage.getItem('factcheck_cross_verification_depth');
      const parsed = stored !== null ? parseInt(stored, 10) : 3;
      if (Number.isNaN(parsed)) {
        return 3;
      }
      return Math.min(Math.max(parsed, 2), 4);
    } catch (error) {
      console.error('Failed to get cross verification depth setting:', error);
      return 3;
    }
  }

  // 교차 검증 깊이 설정 저장
  setCrossVerificationDepthSetting(value) {
    const clamped = Math.min(Math.max(value, 2), 4);
    try {
      localStorage.setItem('factcheck_cross_verification_depth', String(clamped));
      console.log('Cross verification depth setting updated:', clamped);
    } catch (error) {
      console.error('Failed to save cross verification depth setting:', error);
    }
    this.crossVerificationDepth = clamped;
    return clamped;
  }

  // 패널에 투명도 적용
  applyPanelOpacity(value) {
    const panel = document.getElementById(this.panelId);
    if (!panel) return;

    const clamped = Math.min(Math.max(value, 0.4), 1);
    this.panelOpacity = clamped;
    panel.dataset.userOpacity = String(clamped);
    const baseColor = this.palette.base || '#0D0D0D';
    panel.style.background = `rgba(${parseInt(baseColor.slice(1, 3), 16)}, ${parseInt(baseColor.slice(3, 5), 16)}, ${parseInt(baseColor.slice(5, 7), 16)}, ${Math.min(clamped + 0.05, 1)})`;
    panel.style.backdropFilter = '';

    if (panel.style.opacity !== '0') {
      panel.style.opacity = String(clamped);
    }
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
      const handleSubmit = async () => {
        const apiKey = input.value.trim();
        
        if (apiKey) {
          // API 키 암호화
          let encryptedKey;
          try {
            encryptedKey = await this.encryptApiKey(apiKey);
          } catch (error) {
            console.error('API 키 암호화 오류:', error);
            alert('API 키 암호화에 실패했습니다. 다시 시도해주세요.');
            return;
          }
          
          if (this.isChromeApiAvailable()) {
            try {
              chrome.storage.local.set({ gemini_api_key: encryptedKey }, () => {
                if (chrome.runtime.lastError) {
                  console.log('Chrome storage failed, using localStorage:', chrome.runtime.lastError);
                  localStorage.setItem('gemini_api_key', encryptedKey);
                  alert('API 키가 암호화되어 저장되었습니다! (localStorage)');
                } else {
                  alert('API 키가 암호화되어 저장되었습니다!');
                }
                closeModal();
              });
            } catch (error) {
              console.log('Chrome storage error, using localStorage:', error);
              localStorage.setItem('gemini_api_key', encryptedKey);
              alert('API 키가 암호화되어 저장되었습니다! (localStorage)');
              closeModal();
            }
          } else {
            localStorage.setItem('gemini_api_key', encryptedKey);
            alert('API 키가 암호화되어 저장되었습니다!');
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
          chrome.storage.local.get(['gemini_api_key'], (result) => {
            if (chrome.runtime.lastError) {
              console.log('Chrome storage failed, using localStorage:', chrome.runtime.lastError);
              resolve(localStorage.getItem('gemini_api_key') || '');
            } else {
              resolve(result.gemini_api_key || '');
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
        background: #E8E8E8;
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
      const modalContent = modal.querySelector('div');
      if (modalContent) {
        modalContent.style.transform = 'scale(1)';
      }
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
        progressMessage = '✍️ 진위 판정 결과 작성 중...';
      } else if (partialResult.includes('근거') || partialResult.includes('증거')) {
        progressMessage = '📊 검증 근거 정리 중...';
      } else if (partialResult.includes('분석') || partialResult.includes('의견')) {
        progressMessage = '📝 상세 분석 의견 작성 중...';
      }
    }
    
    // 블록의 progress만 업데이트 (저장하지 않음 - 성능 최적화)
    const block = this.newsBlocks.get(blockId);
    if (block && block.status === 'analyzing') {
      block.progress = progressMessage;
      
      // 진행 상황 텍스트 실시간 업데이트 (전체 패널 렌더링 없이 DOM 직접 조작)
      this.updateProgressTextInDOM(blockId, progressMessage);
      
      // 타이핑 영역만 업데이트
      if (partialResult) {
        this.updateBlockTypingArea(blockId, partialResult);
      }
      
      // 패널 전체 렌더링하지 않음 (성능 최적화)
    }
  }

  // 진행 상황 텍스트를 DOM에서 직접 업데이트 (성능 최적화)
  updateProgressTextInDOM(blockId, progressMessage) {
    // 확장된 뷰의 진행 상황 텍스트 업데이트
    const progressTextElement = document.querySelector(`.analyzing-progress-btn[data-id="${blockId}"] .progress-text`);
    if (progressTextElement) {
      progressTextElement.textContent = progressMessage;
    }
    
    // 축소된 뷰의 진행 상황 텍스트 업데이트
    const collapsedProgressTextElement = document.querySelector('.collapsed-progress-text');
    if (collapsedProgressTextElement && blockId === 'current') {
      collapsedProgressTextElement.textContent = progressMessage;
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
    // 교차 검증 완료 처리
    if (this.crossVerificationInProgress.has(blockId)) {
      this.completeCrossVerification(blockId, result);
      return;
    }
    
    // 타임아웃 제거
    if (this.analysisTimeouts.has(blockId)) {
      clearTimeout(this.analysisTimeouts.get(blockId));
      this.analysisTimeouts.delete(blockId);
    }
    
    // AbortController 제거
    if (this.abortControllers.has(blockId)) {
      this.abortControllers.delete(blockId);
    }
    
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

    const { normalizedResult, verdict, suspicious } = this.parseAnalysisResult(result);
    
    // ===== 진위 결과를 URL별로 따로 저장 (하이라이트용) =====
    const block = this.newsBlocks.get(blockId);
    if (block && block.url) {
      try {
        if (verdict) {
          const normalizeUrl = (urlString) => {
            try {
              const urlObj = new URL(urlString);
              return urlObj.origin + urlObj.pathname;
            } catch {
              return urlString;
            }
          };

          const normalizedUrl = normalizeUrl(block.url);

          console.log('[completeAnalysis] 진위 결과 저장 시작:', normalizedUrl, verdict);

          chrome.storage.local.get(['factcheck_verdicts'], (data) => {
            if (chrome.runtime.lastError) {
              console.error('[completeAnalysis] storage.get 에러:', chrome.runtime.lastError);
              return;
            }

            const savedVerdicts = data.factcheck_verdicts || {};
            savedVerdicts[normalizedUrl] = {
              verdict,
              suspicious,
              timestamp: Date.now()
            };

            chrome.storage.local.set({ factcheck_verdicts: savedVerdicts }, () => {
              if (chrome.runtime.lastError) {
                console.error('[completeAnalysis] storage.set 에러:', chrome.runtime.lastError);
              } else {
                console.log('[completeAnalysis] ✅ 진위 결과 저장 완료:', normalizedUrl, verdict);
              }
            });
          });
        } else {
          console.warn('[completeAnalysis] 저장할 진위 결과를 찾지 못했습니다.', normalizedResult);
        }
      } catch (error) {
        console.error('[completeAnalysis] 진위 결과 저장 실패:', error);
      }
    }

    if (verdict && typeof window.updateHighlightColors === 'function') {
      window.updateHighlightColors(verdict);
    }

    if (suspicious && typeof window.highlightSuspiciousSentences === 'function') {
      window.highlightSuspiciousSentences(suspicious);
    }
    
    // currentNews가 분석된 경우 상태도 completed로 변경
    if (this.currentNews) {
      const normalizeUrl = (urlString) => {
        try {
          const urlObj = new URL(urlString);
          return urlObj.origin + urlObj.pathname;
        } catch {
          return urlString;
        }
      };
      
      if (block && normalizeUrl(block.url) === normalizeUrl(this.currentNews.url)) {
        this.currentNews.status = 'completed';
        this.currentNews.result = result;
        this.updatePanel();
      }
    }
    
  }

  // 교차 검증 완료 처리
  completeCrossVerification(blockId, crossVerifiedResult) {
    console.log('교차 검증 단계 완료, ID:', blockId);
    
    // current인 경우 currentNews 사용, 아니면 newsBlocks에서 찾기
    let block;
    if (blockId === 'current') {
      block = this.currentNews;
    } else {
      block = this.newsBlocks.get(blockId);
    }
    
    if (!block) {
      console.error('블록을 찾을 수 없음, ID:', blockId);
      return;
    }
    
    // 현재 단계 증가
    block.currentVerificationStep = (block.currentVerificationStep || 0) + 1;
    
    // 검증 결과를 히스토리에 저장
    if (!block.verificationHistory) {
      block.verificationHistory = [];
    }
    block.verificationHistory.push(crossVerifiedResult);
    
    console.log(`[교차 검증] ${block.currentVerificationStep}/${this.crossVerificationDepth}차 검증 완료`);
    
    // 모든 검증 단계가 완료되었는지 확인
    if (block.currentVerificationStep >= this.crossVerificationDepth) {
      // 최종 검증 완료
      this.finalizeCrossVerification(blockId, block);
    } else {
      // 다음 단계 검증 계속 진행
      const abortController = this.abortControllers.get(blockId);
      this.performRecursiveVerification(blockId, block, abortController);
    }
  }
  
  finalizeCrossVerification(blockId, block) {
    console.log(`[교차 검증] 모든 검증 완료, ID: ${blockId}, 총 ${block.currentVerificationStep}차 검증`);
    
    // 타임아웃 제거
    if (this.analysisTimeouts.has(blockId)) {
      clearTimeout(this.analysisTimeouts.get(blockId));
      this.analysisTimeouts.delete(blockId);
    }
    
    // AbortController 제거
    if (this.abortControllers.has(blockId)) {
      this.abortControllers.delete(blockId);
    }
    
    // 교차 검증 진행 상태 제거
    this.crossVerificationInProgress.delete(blockId);
    
    // 교차 검증 플래그 설정
    block.crossVerified = true;
    
    // 최종 검증 결과 저장 (마지막 검증 결과)
    const finalResult = block.verificationHistory[block.verificationHistory.length - 1];
    block.crossVerifiedResult = finalResult;
    
    // 상태를 completed로 변경하고 최종 결과로 업데이트
    block.status = 'completed';
    block.result = finalResult;
    
    // 스트리밍 결과 정리
    this.streamingResults.delete(blockId);
    
    const { normalizedResult, verdict, suspicious } = this.parseAnalysisResult(finalResult);
    
    // 진위 결과를 URL별로 저장 (최종 검증 결과로 업데이트)
    if (block.url && verdict) {
      try {
        const normalizeUrl = (urlString) => {
          try {
            const urlObj = new URL(urlString);
            return urlObj.origin + urlObj.pathname;
          } catch {
            return urlString;
          }
        };
        
        const normalizedUrl = normalizeUrl(block.url);
        
        console.log(`[최종 검증] ${block.currentVerificationStep}차 검증 진위 결과 저장:`, normalizedUrl, verdict);
        
        chrome.storage.local.get(['factcheck_verdicts'], (data) => {
          if (chrome.runtime.lastError) {
            console.error('[최종 검증] storage.get 에러:', chrome.runtime.lastError);
            return;
          }
          
          const savedVerdicts = data.factcheck_verdicts || {};
          savedVerdicts[normalizedUrl] = {
            verdict,
            suspicious,
            timestamp: Date.now(),
            crossVerified: true,
            verificationDepth: block.currentVerificationStep
          };
          
          chrome.storage.local.set({ factcheck_verdicts: savedVerdicts }, () => {
            if (chrome.runtime.lastError) {
              console.error('[최종 검증] storage.set 에러:', chrome.runtime.lastError);
            } else {
              console.log(`[최종 검증] ✅ ${block.currentVerificationStep}차 검증 결과 저장 완료:`, normalizedUrl, verdict);
            }
          });
        });
      } catch (error) {
        console.error('[최종 검증] 검증 결과 저장 실패:', error);
      }
    }
    
    // 하이라이트 업데이트 (최종 검증 결과 반영)
    if (verdict && typeof window.updateHighlightColors === 'function') {
      window.updateHighlightColors(verdict);
    }
    
    if (suspicious && typeof window.highlightSuspiciousSentences === 'function') {
      window.highlightSuspiciousSentences(suspicious);
    }
    
    // currentNews 동기화
    if (this.currentNews) {
      const normalizeUrl = (urlString) => {
        try {
          const urlObj = new URL(urlString);
          return urlObj.origin + urlObj.pathname;
        } catch {
          return urlString;
        }
      };
      
      if (normalizeUrl(block.url) === normalizeUrl(this.currentNews.url)) {
        this.currentNews.status = 'completed';
        this.currentNews.result = finalResult;
        this.currentNews.crossVerified = true;
        this.currentNews.crossVerifiedResult = finalResult;
        this.currentNews.verificationHistory = block.verificationHistory;
        this.currentNews.currentVerificationStep = block.currentVerificationStep;
        this.currentNews.baselineAnalysis = block.baselineAnalysis;  // 1차 분석 결과도 함께 저장
      }
    }
    
    // 저장 및 패널 업데이트 (current가 아닌 경우만)
    if (blockId !== 'current') {
      this.saveNewsBlocks();
    }
    this.updatePanel();
    
    // 완료 알림
    this.highlightCompletedBlock(blockId);
    
    console.log(`[최종 검증] ${block.currentVerificationStep}차 교차 검증 완료, 최종 결과 적용됨`);
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
    
    // 429 에러 (할당량 초과) 체크
    const is429Error = error && (
      error.includes('429') || 
      error.includes('RESOURCE_EXHAUSTED') ||
      error.includes('Resource exhausted')
    );
    
    // 교차 검증 중 429 에러 발생 시 처리
    if (is429Error && this.crossVerificationInProgress.has(blockId)) {
      console.warn('[교차 검증] API 할당량 초과, 진행 중단:', blockId);
      
      // 교차 검증 진행 상태 제거
      this.crossVerificationInProgress.delete(blockId);
      
      // 타임아웃 제거
      if (this.analysisTimeouts.has(blockId)) {
        clearTimeout(this.analysisTimeouts.get(blockId));
        this.analysisTimeouts.delete(blockId);
      }
      
      // AbortController 제거
      if (this.abortControllers.has(blockId)) {
        this.abortControllers.delete(blockId);
      }
      
      // 현재까지의 검증 결과가 있으면 그것을 사용, 없으면 1차 분석 유지
      let block;
      if (blockId === 'current') {
        block = this.currentNews;
      } else {
        block = this.newsBlocks.get(blockId);
      }
      
      if (block && block.verificationHistory && block.verificationHistory.length > 0) {
        // 마지막 성공한 검증 결과 사용
        const lastSuccessfulResult = block.verificationHistory[block.verificationHistory.length - 1];
        block.crossVerified = true;
        block.crossVerifiedResult = lastSuccessfulResult;
        block.result = lastSuccessfulResult;
        block.status = 'completed';
        
        const errorMsg = `⚠️ API 할당량 초과로 ${block.currentVerificationStep}/${this.crossVerificationDepth}차까지만 검증 완료. 마지막 검증 결과를 사용합니다.`;
        console.warn(errorMsg);
        
        this.updateNewsStatus(blockId, 'completed', lastSuccessfulResult, errorMsg);
        return;
      } else {
        // 검증 히스토리가 없으면 1차 분석 결과 유지
        error = `⚠️ API 할당량 초과로 교차 검증 실패. 1차 분석 결과를 유지합니다.\n\n원본 오류: ${error}`;
      }
    }
    
    // 타임아웃 제거
    if (this.analysisTimeouts.has(blockId)) {
      clearTimeout(this.analysisTimeouts.get(blockId));
      this.analysisTimeouts.delete(blockId);
    }
    
    // AbortController 제거
    if (this.abortControllers.has(blockId)) {
      this.abortControllers.delete(blockId);
    }
    
    this.updateNewsStatus(blockId, 'error', null, null, error);
    
    // currentNews가 실패한 경우 상태도 error로 변경
    if (this.currentNews) {
      const normalizeUrl = (urlString) => {
        try {
          const urlObj = new URL(urlString);
          return urlObj.origin + urlObj.pathname;
        } catch {
          return urlString;
        }
      };
      
      const block = this.newsBlocks.get(blockId);
      if (block && normalizeUrl(block.url) === normalizeUrl(this.currentNews.url)) {
        this.currentNews.status = 'error';
        this.currentNews.error = error;
        this.updatePanel();
      }
    }
  }

  // 분석 정지
  stopAnalysis(id, errorMessage = '🛑 사용자에 의해 분석이 중지되었습니다.') {
    console.log('[stopAnalysis] 분석 정지, ID:', id);
    
    // 타임아웃 제거
    if (this.analysisTimeouts.has(id)) {
      clearTimeout(this.analysisTimeouts.get(id));
      this.analysisTimeouts.delete(id);
    }
    
    // API 요청 중단
    if (this.abortControllers.has(id)) {
      const controller = this.abortControllers.get(id);
      controller.abort();
      this.abortControllers.delete(id);
    }
    
    // 스트리밍 결과 정리
    this.streamingResults.delete(id);
    
    // 타이핑 버퍼 정리
    if (this.typingBuffer && this.typingBuffer.has(id)) {
      this.typingBuffer.delete(id);
    }
    
    // service_worker에 중단 요청 전송
    if (this.isChromeApiAvailable()) {
      chrome.runtime.sendMessage({
        action: "stopAnalysis",
        blockId: id
      }).catch(error => {
        console.error('[stopAnalysis] service_worker 메시지 전송 오류:', error);
      });
    }
    
    // 에러 상태로 변경
    this.failAnalysis(id, errorMessage);
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

  // API 키 암호화 유틸리티 함수들
  async getDeviceKey() {
    const userAgent = navigator.userAgent;
    const language = navigator.language;
    const platform = navigator.platform;
    const deviceString = `${userAgent}-${language}-${platform}`;
    
    const encoder = new TextEncoder();
    const data = encoder.encode(deviceString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  }

  async deriveKey(password) {
    const SALT = new Uint8Array([
      0x49, 0x73, 0x20, 0x74, 0x68, 0x69, 0x73, 0x20,
      0x73, 0x65, 0x63, 0x75, 0x72, 0x65, 0x3f, 0x21
    ]);
    
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: SALT,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encryptApiKey(apiKey) {
    try {
      const deviceKey = await this.getDeviceKey();
      const key = await this.deriveKey(deviceKey);
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(apiKey);
      
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        encodedData
      );
      
      const combined = new Uint8Array(iv.length + encryptedData.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encryptedData), iv.length);
      
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('암호화 오류:', error);
      throw new Error('API 키 암호화에 실패했습니다.');
    }
  }

  async decryptApiKey(encryptedData) {
    try {
      const deviceKey = await this.getDeviceKey();
      const key = await this.deriveKey(deviceKey);
      
      const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
      
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      
      const decryptedData = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        data
      );
      
      const decoder = new TextDecoder();
      return decoder.decode(decryptedData);
    } catch (error) {
      console.error('복호화 오류:', error);
      throw new Error('API 키 복호화에 실패했습니다.');
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
            this.syncCurrentNewsWithHistory();
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
        this.syncCurrentNewsWithHistory();
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
      background: linear-gradient(135deg, #FFFFFF, #F0F0F0);
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
    if (!this.newsBlocks.has(newsId)) {
      return;
    }

    const removedBlock = this.newsBlocks.get(newsId);
    this.newsBlocks.delete(newsId);

    if (removedBlock && removedBlock.url) {
      this.removeSavedVerdict(removedBlock.url);
    }

    const normalizeUrl = (urlString) => {
      try {
        const urlObj = new URL(urlString);
        return urlObj.origin + urlObj.pathname;
      } catch {
        return urlString;
      }
    };

    if (this.currentNews && removedBlock && this.currentNews.url) {
      const currentNormalized = normalizeUrl(this.currentNews.url);
      const removedNormalized = normalizeUrl(removedBlock.url);

      if (currentNormalized === removedNormalized) {
        this.currentNews.status = 'pending';
        this.currentNews.result = null;
        this.currentNews.progress = null;
        this.currentNews.error = null;

        if (typeof window.updateHighlightColors === 'function') {
          window.updateHighlightColors(null);
        }
      }
    }

    this.updateAnalysisCount(); // 카운트 업데이트
    this.saveNewsBlocks();
    this.updatePanel();
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
      background: rgba(13, 13, 13, 0.3);
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

// =============================================================================
// Google Search API 통합 기능 (BACKUP에서 이식)
// =============================================================================

AnalysisPanel.prototype.findSimilarArticles = async function(blockId) {
  console.log('[findSimilarArticles] 시작, blockId:', blockId);
  
  const block = this.newsBlocks.get(blockId);
  if (!block) {
    console.error('블록을 찾을 수 없음:', blockId);
    return;
  }

  if (block.status !== 'completed' || !block.result) {
    alert('분석이 완료된 뉴스만 유사 기사를 찾을 수 있습니다.');
    return;
  }

  // 이미 검색 중인지 확인
  if (this.searchInProgress.has(blockId)) {
    alert('이미 검색이 진행 중입니다.');
    return;
  }

  // Google API 키 확인
  const apiKey = await this.getGoogleApiKey();
  if (!apiKey && this.USE_REAL_API) {
    alert('Google Custom Search API 키가 필요합니다.\n설정에서 API 키를 입력해주세요.');
    return;
  }

  this.searchInProgress.add(blockId);
  
  // 로딩 인디케이터 표시
  this.showSearchLoading(blockId, 'similar');
  
  try {
    // 검색 쿼리 생성: AI 생성 검색어 > 키워드 > 요약 > 제목 순서로 우선
    let rawQuery = block.result.검색어 || block.result.키워드 || block.result.요약 || block.title;
    const searchQuery = this.refineSearchQuery(rawQuery);
    const cacheKey = `similar_${searchQuery}`;

    // 영구 캐시 확인 (API 절약)
    const cachedResults = this.getFromSearchCache(cacheKey);
    if (cachedResults) {
      console.log('[findSimilarArticles] ✅ 캐시에서 결과 반환');
      this.hideSearchLoading(blockId);
      this.showSearchResults(blockId, cachedResults, 'similar');
      this.searchInProgress.delete(blockId);
      return;
    }

    console.log('[findSimilarArticles] 원본 쿼리:', rawQuery);
    console.log('[findSimilarArticles] 정제된 쿼리:', searchQuery);
    console.log('[findSimilarArticles] USE_REAL_API:', this.USE_REAL_API);

    let results;
    if (this.USE_REAL_API) {
      // 실제 Google Search API 호출
      results = await this.callGoogleSearchAPI(searchQuery, 'news', 4);
    } else {
      // Mock 데이터 반환
      console.log('[findSimilarArticles] Mock 데이터 사용');
      results = this.getMockSimilarArticles();
    }

    console.log('[findSimilarArticles] 검색 결과:', results);

    // 영구 캐시에 저장 (API 절약)
    this.saveToSearchCache(cacheKey, results);

    // 로딩 숨김 및 결과 표시
    this.hideSearchLoading(blockId);
    this.showSearchResults(blockId, results, 'similar');

  } catch (error) {
    console.error('[findSimilarArticles] 오류:', error);
    this.hideSearchLoading(blockId);
    
    // 에러 메시지 처리
    const errorMessage = this.getSearchErrorMessage(error.message);
    alert(errorMessage);
  } finally {
    this.searchInProgress.delete(blockId);
  }
};

AnalysisPanel.prototype.searchFactCheck = async function(blockId) {
  console.log('[searchFactCheck] 시작, blockId:', blockId);
  
  const block = this.newsBlocks.get(blockId);
  if (!block) {
    console.error('블록을 찾을 수 없음:', blockId);
    return;
  }

  if (block.status !== 'completed' || !block.result) {
    alert('분석이 완료된 뉴스만 사실 검증을 할 수 있습니다.');
    return;
  }

  // 이미 검색 중인지 확인
  if (this.searchInProgress.has(blockId)) {
    alert('이미 검색이 진행 중입니다.');
    return;
  }

  // Google API 키 확인
  const apiKey = await this.getGoogleApiKey();
  if (!apiKey && this.USE_REAL_API) {
    alert('Google Custom Search API 키가 필요합니다.\n설정에서 API 키를 입력해주세요.');
    return;
  }

  this.searchInProgress.add(blockId);
  
  // 로딩 인디케이터 표시 + 실시간 상황 업데이트
  this.showSearchLoading(blockId, 'fact');
  this.updateFactCheckStatus(blockId, '🔍 검색 중...');
  
  try {
    // 검색 쿼리 생성
    let rawQuery = block.result.검색어 || block.result.키워드 || block.result.근거 || block.result.요약 || block.title;
    const searchQuery = this.refineSearchQuery(rawQuery);
    
    console.log('[searchFactCheck] 검색어:', searchQuery);
    this.updateFactCheckStatus(blockId, `🔎 "${searchQuery.substring(0, 30)}..." 검색 중`);

    let results;
    if (this.USE_REAL_API) {
      results = await this.callGoogleSearchAPI(searchQuery, 'keyword', 2);
    } else {
      results = this.getMockFactCheckResults();
    }

    if (!results || results.length === 0) {
      this.updateFactCheckStatus(blockId, '❌ 검색 결과 없음');
      setTimeout(() => this.clearFactCheckStatus(blockId), 3000);
      return;
    }

    console.log('[searchFactCheck] 검색 결과:', results.length, '개');
    this.updateFactCheckStatus(blockId, `📄 ${results.length}개 기사 발견, 크롤링 중...`);
    
    // 각 기사 크롤링 및 분석
    const crawledArticles = [];
    for (let i = 0; i < results.length; i++) {
      const article = results[i];
      this.updateFactCheckStatus(blockId, `📰 ${i + 1}/${results.length}: "${article.title.substring(0, 25)}..." 분석 중`);
      
      try {
        // 크롤링 시도
        const crawledContent = await this.crawlArticleContent(article.link);
        
        if (crawledContent) {
          crawledArticles.push({
            ...article,
            crawledContent: crawledContent
          });
          this.updateFactCheckStatus(blockId, `✅ ${i + 1}/${results.length}: 크롤링 완료`);
        } else {
          crawledArticles.push(article);
          this.updateFactCheckStatus(blockId, `⚠️ ${i + 1}/${results.length}: 크롤링 실패 (요약만 사용)`);
        }
        
        await this.delay(500); // 크롤링 간격
      } catch (error) {
        console.error('[searchFactCheck] 크롤링 오류:', error);
        crawledArticles.push(article);
      }
    }

    this.updateFactCheckStatus(blockId, '🤖 AI 비교 검증 중...');
    
    // AI 분석 요청 (원본 뉴스와 크롤링된 기사들 비교)
    const verificationResult = await this.verifyFactsWithAI(block, crawledArticles);
    
    this.updateFactCheckStatus(blockId, '✨ 전체 재분석 중...');
    
    // Gemini로 전체 재분석 (기존 분석 + 본문 + 사실 검증 결과)
    const reanalyzedResult = await this.reanalyzeWithFactCheck(block, crawledArticles, verificationResult);
    
    this.updateFactCheckStatus(blockId, '🎉 검증 완료!');
    
    // 결과를 블록에 저장
    block.factCheckResult = {
      articles: crawledArticles,
      verification: verificationResult,
      reanalyzed: reanalyzedResult,
      timestamp: Date.now()
    };
    
    console.log('[searchFactCheck] factCheckResult 저장 완료:', block.factCheckResult);
    
    // 재분석 결과로 블록 업데이트
    block.result = reanalyzedResult;
    this.newsBlocks.set(blockId, block);
    
    // 영구 저장 (chrome.storage + localStorage)
    this.saveNewsBlocks();
    console.log('[searchFactCheck] 블록 저장 완료 (영구 저장)');
    
    // 상세 패널이 열려있으면 새로고침
    if (this.activeDetailOverlay) {
      console.log('[searchFactCheck] 상세 패널 새로고침');
      this.closeDetailInPanel(true);
      setTimeout(() => {
        this.showDetailInPanel(block);
      }, 100);
    }
    
    // UI 업데이트
    this.hideSearchLoading(blockId);
    setTimeout(() => this.clearFactCheckStatus(blockId), 2000);

  } catch (error) {
    console.error('[searchFactCheck] 오류:', error);
    this.hideSearchLoading(blockId);
    this.updateFactCheckStatus(blockId, '❌ 오류 발생');
    
    const errorMessage = this.getSearchErrorMessage(error.message);
    alert(errorMessage);
    
    setTimeout(() => this.clearFactCheckStatus(blockId), 3000);
  } finally {
    this.searchInProgress.delete(blockId);
  }
};

AnalysisPanel.prototype.getGoogleApiKey = async function() {
  // localStorage를 우선 사용 (Extension context invalidated 오류 방지)
  try {
    const encryptedKey = localStorage.getItem('google_search_api_key');
    if (encryptedKey) {
      const decrypted = await this.decryptApiKey(encryptedKey);
      if (decrypted) {
        return decrypted;
      }
    }
  } catch (error) {
    console.error('localStorage에서 Google API 키 조회 실패:', error);
  }
  
  // localStorage 실패 시 chrome.storage 시도
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(['google_search_api_key'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('chrome.storage API 키 조회 오류:', chrome.runtime.lastError);
          resolve(null);
          return;
        }
        const encryptedKey = result.google_search_api_key;
        if (encryptedKey) {
          this.decryptApiKey(encryptedKey).then(decrypted => resolve(decrypted)).catch(() => resolve(null));
        } else {
          resolve(null);
        }
      });
    } catch (error) {
      console.error('chrome.storage 접근 실패:', error);
      resolve(null);
    }
  });
};

AnalysisPanel.prototype.saveGoogleApiKey = async function(apiKey) {
  if (!apiKey) return false;
  
  try {
    const encryptedKey = await this.encryptApiKey(apiKey);
    
    // localStorage에 우선 저장 (Extension context invalidated 오류 방지)
    try {
      localStorage.setItem('google_search_api_key', encryptedKey);
      console.log('API 키가 localStorage에 저장되었습니다.');
    } catch (error) {
      console.error('localStorage 저장 실패:', error);
    }
    
    // chrome.storage에도 저장 시도 (백업)
    try {
      await new Promise((resolve) => {
        chrome.storage.local.set({ google_search_api_key: encryptedKey }, () => {
          if (chrome.runtime.lastError) {
            console.log('chrome.storage 저장 실패:', chrome.runtime.lastError);
          } else {
            console.log('API 키가 chrome.storage에도 저장되었습니다.');
          }
          resolve(true);
        });
      });
    } catch (error) {
      console.error('chrome.storage 접근 실패:', error);
    }
    
    return true;
  } catch (error) {
    console.error('Google API 키 저장 오류:', error);
    return false;
  }
};

AnalysisPanel.prototype.callGoogleSearchAPI = async function(query, type, limit) {
  console.log('[callGoogleSearchAPI] 호출:', query, type, limit);
  
  // CSE ID 고정값 사용
  const CSE_ID_NEWS = "a6724cd0397f24747";      // Daum 뉴스 전용
  const CSE_ID_KEYWORD = "241358ac91fe04cd8";   // 전체 웹 검색
  const cseId = type === 'news' ? CSE_ID_NEWS : CSE_ID_KEYWORD;
  
  // API 키 확인
  const apiKey = await this.getGoogleApiKey();
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }
  
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${cseId}&q=${encodeURIComponent(query)}&num=${limit}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    // 상태 코드별 에러 처리
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 403) {
        // API 키 문제 또는 쿼터 초과
        if (errorData.error && errorData.error.message && errorData.error.message.includes('quota')) {
          throw new Error('QUOTA_EXCEEDED');
        }
        throw new Error('API_KEY_INVALID');
      } else if (response.status === 429) {
        // Too Many Requests: 할당량 초과
        throw new Error('QUOTA_EXCEEDED');
      } else if (response.status === 400) {
        throw new Error('INVALID_REQUEST');
      } else if (response.status === 404) {
        throw new Error('CSE_NOT_FOUND');
      } else if (response.status >= 500) {
        throw new Error('SERVER_ERROR');
      }
      
      throw new Error(`API_ERROR_${response.status}`);
    }
    
    const data = await response.json();
    
    // 검색 결과 없음
    if (!data.items || data.items.length === 0) {
      console.log('[callGoogleSearchAPI] 검색 결과 없음');
      return [];
    }
    
    // 결과 포맷팅
    return data.items.map(item => ({
      title: item.title || '제목 없음',
      snippet: item.snippet || '요약 없음',
      link: item.link || '',
      displayLink: item.displayLink || '',
      pagemap: item.pagemap || {}
    }));
    
  } catch (error) {
    console.error('[callGoogleSearchAPI] 요청 실패:', error);
    
    // 네트워크 오류
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      throw new Error('NETWORK_ERROR');
    }
    
    throw error;
  }
};

// 검색 에러 메시지 변환
AnalysisPanel.prototype.getSearchErrorMessage = function(errorCode) {
  const messages = {
    'API_KEY_MISSING': '⚠️ Google Search API 키가 설정되지 않았습니다.\n\n설정 → Google Search API → API 키 설정에서 키를 입력해주세요.',
    'API_KEY_INVALID': '🔑 API 키가 유효하지 않습니다.\n\nAPI 키를 확인하고 다시 입력해주세요.',
    'QUOTA_EXCEEDED': '📊 일일 API 사용량 한도를 초과했습니다.\n\n📌 무료 플랜: 하루 100개 쿼리\n🕒 리셋 시간: 매일 자정 (PST 기준)\n\n💡 해결 방법:\n• 내일 다시 시도\n• 유료 플랜: $5 per 1,000 queries',
    'CSE_NOT_FOUND': '🔍 검색 엔진(CSE) ID를 찾을 수 없습니다.\n\nCSE ID를 확인하고 다시 입력해주세요.',
    'INVALID_REQUEST': '❌ 잘못된 검색 요청입니다.\n\n검색어나 설정을 확인해주세요.',
    'SERVER_ERROR': '🌐 Google 서버에 일시적인 문제가 발생했습니다.\n\n잠시 후 다시 시도해주세요.',
    'NETWORK_ERROR': '📡 네트워크 연결에 문제가 있습니다.\n\n인터넷 연결을 확인해주세요.',
    'NO_RESULTS': '📭 검색 결과가 없습니다.\n\n다른 검색어로 시도해보세요.'
  };
  
  return messages[errorCode] || `⚠️ 검색 중 오류가 발생했습니다.\n\n오류 코드: ${errorCode}`;
};

AnalysisPanel.prototype.showSearchResults = function(blockId, results, type) {
  console.log('[showSearchResults] 결과 표시:', blockId, type, results);
  
  const typeName = type === 'similar' ? '유사 기사' : '사실 검증';
  const icon = type === 'similar' ? '📰' : '🔍';
  
  // 검색 결과를 HTML로 렌더링
  const renderResults = () => {
    if (!results || results.length === 0) {
      return '<p style="color: #737373; text-align: center; padding: 20px;">검색 결과가 없습니다.</p>';
    }
    
    return results.map((r, i) => {
      // 썸네일 이미지 추출 (유사 기사일 때만)
      let thumbnailHtml = '';
      if (type === 'similar' && r.pagemap) {
        const thumbnail = r.pagemap.cse_thumbnail?.[0]?.src || r.pagemap.cse_image?.[0]?.src;
        if (thumbnail) {
          thumbnailHtml = `
            <img src="${this.escapeHtml(thumbnail)}" alt="썸네일" style="
              width: 80px;
              height: 80px;
              object-fit: cover;
              border-radius: 6px;
              flex-shrink: 0;
            " onerror="this.style.display='none'">
          `;
        }
      }
      
      return `
      <div style="
        background: #F2F2F2;
        border: 1px solid #BF9780;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
        transition: transform 0.2s, box-shadow 0.2s;
        cursor: pointer;
        display: flex;
        gap: 12px;
      " class="search-result-item" data-url="${this.escapeHtml(r.link)}">
        ${thumbnailHtml}
        
        <div style="flex: 1; min-width: 0;">
          <div style="
            color: #BF9780;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 6px;
          ">${i + 1}번째 결과</div>
          
          <h3 style="
            color: #0D0D0D;
            font-size: 15px;
            font-weight: 600;
            margin-bottom: 8px;
            line-height: 1.4;
          ">${this.escapeHtml(r.title)}</h3>
          
          <p style="
            color: #404040;
            font-size: 13px;
            line-height: 1.5;
            margin-bottom: 8px;
          ">${this.escapeHtml(r.snippet)}</p>
          
          <a href="${this.escapeHtml(r.link)}" target="_blank" rel="noopener noreferrer" style="
            color: #8B7355;
            font-size: 12px;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            transition: color 0.2s;
          " onclick="event.stopPropagation();">
            🔗 ${this.escapeHtml(r.displayLink || r.link.substring(0, 30) + '...')}
          </a>
        </div>
      </div>
    `}).join('');
  };
  
  const modal = document.createElement('div');
  modal.className = 'search-results-modal';
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
      background: #E8E8E8;
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
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-right: 40px;">
        <h2 style="color: #0D0D0D; font-size: 20px; font-weight: bold; margin: 0;">
          ${icon} ${typeName} 검색 결과 (${results.length}개)
        </h2>
      </div>
      
      ${results.length === 0 ? `
        <div style="
          text-align: center;
          padding: 60px 20px;
          color: #737373;
        ">
          <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">검색 결과가 없습니다</div>
          <div style="font-size: 14px;">다른 검색어로 시도해보세요</div>
        </div>
      ` : `
        <div class="search-results-container">
          ${renderResults()}
        </div>
      `}
    </div>
  `;

  document.body.appendChild(modal);

  // 애니메이션
  setTimeout(() => {
    modal.style.opacity = '1';
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.style.transform = 'scale(1)';
    }
  }, 10);

  // 검색 결과 항목 클릭 이벤트
  const resultItems = modal.querySelectorAll('.search-result-item');
  resultItems.forEach(item => {
    item.addEventListener('click', () => {
      const url = item.getAttribute('data-url');
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
    
    // 호버 효과
    item.addEventListener('mouseenter', () => {
      item.style.transform = 'translateY(-2px)';
      item.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.transform = 'translateY(0)';
      item.style.boxShadow = 'none';
    });
  });

  // 닫기 이벤트
  const closeBtn = modal.querySelector('.close-modal');
  const closeModal = () => {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 300);
  };

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // ESC 키로 닫기
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // 호버 효과
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.backgroundColor = '#BF9780';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.backgroundColor = 'transparent';
  });
};

AnalysisPanel.prototype.getMockSimilarArticles = function() {
  return [
    {
      title: '[유사 기사 1] 관련 뉴스 제목',
      snippet: '이것은 유사한 내용을 다루는 기사입니다. Mock 데이터입니다.',
      link: 'https://news.example.com/article1'
    },
    {
      title: '[유사 기사 2] 비슷한 보도 내용',
      snippet: '같은 주제를 다른 관점에서 다룬 기사입니다.',
      link: 'https://news.example.com/article2'
    },
    {
      title: '[유사 기사 3] 관련 언론 보도',
      snippet: '비슷한 사건에 대한 다른 언론사의 보도입니다.',
      link: 'https://news.example.com/article3'
    },
    {
      title: '[유사 기사 4] 후속 보도',
      snippet: '이 사건의 후속 보도 내용입니다.',
      link: 'https://news.example.com/article4'
    }
  ];
};

AnalysisPanel.prototype.getMockFactCheckResults = function() {
  return [
    {
      title: '[팩트체크 1] 공식 발표 자료',
      snippet: '정부 기관에서 발표한 공식 자료입니다. 해당 주장은 사실로 확인되었습니다.',
      link: 'https://factcheck.example.com/verify1'
    },
    {
      title: '[팩트체크 2] 전문가 검증 의견',
      snippet: '전문가들이 검증한 결과 일부 과장된 내용이 포함되어 있습니다.',
      link: 'https://factcheck.example.com/verify2'
    }
  ];
};

// 검색 쿼리 정제 함수
AnalysisPanel.prototype.refineSearchQuery = function(rawQuery) {
  if (!rawQuery) return '';
  
  let refined = rawQuery;
  
  // HTML 태그 제거
  refined = refined.replace(/<[^>]*>/g, ' ');
  
  // 특수 문자 제거 (단, 공백과 한글, 영문, 숫자는 유지)
  refined = refined.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');
  
  // 연속된 공백을 하나로
  refined = refined.replace(/\s+/g, ' ').trim();
  
  // 길이 제한 (100자)
  if (refined.length > 100) {
    refined = refined.substring(0, 100);
    // 마지막 단어가 잘리지 않도록 마지막 공백까지만
    const lastSpace = refined.lastIndexOf(' ');
    if (lastSpace > 50) {
      refined = refined.substring(0, lastSpace);
    }
  }
  
  return refined;
};

// 검색 로딩 인디케이터 표시
AnalysisPanel.prototype.showSearchLoading = function(blockId, type) {
  const typeName = type === 'similar' ? '유사 기사' : '사실 검증';
  const icon = type === 'similar' ? '📰' : '🔍';
  
  const loading = document.createElement('div');
  loading.id = `search-loading-${blockId}`;
  loading.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(13, 13, 13, 0.9);
    color: #F2F2F2;
    padding: 24px 32px;
    border-radius: 12px;
    border: 1px solid #BF9780;
    z-index: 2147483650;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
  `;
  
  loading.innerHTML = `
    <div style="
      width: 20px;
      height: 20px;
      border: 3px solid #BF9780;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    "></div>
    <span>${icon} ${typeName} 검색 중...</span>
    <style>
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  `;
  
  document.body.appendChild(loading);
};

// 검색 로딩 인디케이터 숨김
AnalysisPanel.prototype.hideSearchLoading = function(blockId) {
  const loading = document.getElementById(`search-loading-${blockId}`);
  if (loading) {
    loading.remove();
  }
};

// 디버그 정보 모달 표시
AnalysisPanel.prototype.showDebugModal = function(blockId) {
  const block = this.newsBlocks.get(blockId);
  if (!block || !block.result) {
    alert('분석 결과가 없습니다.');
    return;
  }

  const result = block.result;
  
  // JSON을 HTML로 포맷팅
  const formatValue = (value) => {
    if (value === null || value === undefined) {
      return '<span style="color: #9CA3AF;">null</span>';
    }
    if (typeof value === 'boolean') {
      return `<span style="color: #10B981;">${value}</span>`;
    }
    if (typeof value === 'number') {
      return `<span style="color: #3B82F6;">${value}</span>`;
    }
    if (typeof value === 'string') {
      // HTML 태그를 실제로 렌더링하지 않고 보여주기 위해 이스케이프
      const escaped = this.escapeHtml(value);
      return `<span style="color: #0D0D0D;">${escaped}</span>`;
    }
    if (typeof value === 'object') {
      return '<span style="color: #F59E0B;">object</span>';
    }
    return String(value);
  };

  const renderResultRows = () => {
    return Object.entries(result).map(([key, value]) => `
      <tr style="border-bottom: 1px solid #D4D4D4;">
        <td style="
          padding: 12px 16px;
          font-weight: 600;
          color: #BF9780;
          white-space: nowrap;
          vertical-align: top;
          width: 120px;
        ">${this.escapeHtml(key)}</td>
        <td style="
          padding: 12px 16px;
          color: #0D0D0D;
          word-break: break-word;
          line-height: 1.6;
        ">${formatValue(value)}</td>
      </tr>
    `).join('');
  };

  const modal = document.createElement('div');
  modal.className = 'debug-modal';
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
      background: #E8E8E8;
      border-radius: 12px;
      padding: 32px;
      width: 90%;
      max-width: 800px;
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
      
      <h2 style="color: #0D0D0D; font-size: 20px; font-weight: bold; margin-bottom: 8px; padding-right: 40px;">
        🐛 디버그 정보
      </h2>
      
      <p style="color: #737373; font-size: 13px; margin-bottom: 20px;">
        Block ID: ${blockId} | 분석 결과 원본 데이터
      </p>
      
      <div style="
        background: #F2F2F2;
        border: 1px solid #BF9780;
        border-radius: 8px;
        overflow: hidden;
      ">
        <table style="
          width: 100%;
          border-collapse: collapse;
        ">
          <thead>
            <tr style="background: #BF9780;">
              <th style="
                padding: 12px 16px;
                text-align: left;
                color: #F2F2F2;
                font-weight: 600;
                font-size: 14px;
              ">필드</th>
              <th style="
                padding: 12px 16px;
                text-align: left;
                color: #F2F2F2;
                font-weight: 600;
                font-size: 14px;
              ">값</th>
            </tr>
          </thead>
          <tbody>
            ${renderResultRows()}
          </tbody>
        </table>
      </div>
      
      <div style="
        margin-top: 20px;
        padding: 16px;
        background: #FEF3C7;
        border: 1px solid #F59E0B;
        border-radius: 8px;
      ">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 16px;">💡</span>
          <strong style="color: #92400E; font-size: 14px;">개발자 팁</strong>
        </div>
        <p style="color: #78350F; font-size: 13px; line-height: 1.5; margin: 0;">
          이 정보는 AI가 반환한 원본 결과입니다. 콘솔에서도 확인할 수 있습니다.
        </p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 애니메이션
  setTimeout(() => {
    modal.style.opacity = '1';
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.style.transform = 'scale(1)';
    }
  }, 10);

  // 닫기 이벤트
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

  // 콘솔에도 출력
  console.log('[Debug Modal] Block ID:', blockId);
  console.log('[Debug Modal] Result:', result);
};

// 실시간 사실 검증 상황 표시 함수들
AnalysisPanel.prototype.updateFactCheckStatus = function(blockId, statusText) {
  const block = this.newsBlocks.get(blockId);
  if (!block) return;
  
  // 블록의 더보기 버튼 영역에 상황 텍스트 표시
  const moreBtn = document.querySelector(`[data-block-id="${blockId}"] .show-more-btn`);
  if (moreBtn) {
    // 기존 상황 표시 요소 찾기 또는 생성
    let statusEl = moreBtn.parentElement.querySelector('.fact-check-status');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.className = 'fact-check-status';
      statusEl.style.cssText = `
        margin-top: 8px;
        padding: 8px 12px;
        background: rgba(191, 151, 128, 0.1);
        border-left: 3px solid #BF9780;
        border-radius: 4px;
        font-size: 13px;
        color: #0D0D0D;
        font-weight: 500;
        animation: fadeIn 0.3s ease;
      `;
      moreBtn.parentElement.appendChild(statusEl);
    }
    statusEl.textContent = statusText;
  }
};

AnalysisPanel.prototype.clearFactCheckStatus = function(blockId) {
  const statusEl = document.querySelector(`[data-block-id="${blockId}"] .fact-check-status`);
  if (statusEl) {
    statusEl.style.opacity = '0';
    statusEl.style.transition = 'opacity 0.3s ease';
    setTimeout(() => statusEl.remove(), 300);
  }
};

// 뉴스 기사 크롤링 함수
AnalysisPanel.prototype.crawlArticleContent = async function(url) {
  console.log('[crawlArticleContent] 크롤링 시작:', url);
  
  // 영구 캐시 확인 (크롤링 절약)
  const cachedContent = this.getFromCrawlCache(url);
  if (cachedContent) {
    console.log('[crawlArticleContent] ✅ 캐시에서 반환');
    return cachedContent;
  }
  
  try {
    // Service Worker를 통한 CORS 우회 크롤링
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'fetchWithCORS', url: url },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });
    
    if (!response.success) {
      console.warn('[crawlArticleContent] ⚠️ fetchWithCORS 실패:', response.error);
      return null;
    }
    
    const html = response.html;
    
    // HTML 파싱하여 본문 추출
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 다양한 뉴스 사이트의 본문 선택자
    const selectors = [
      'article',
      '[id*="article"]',
      '[class*="article"]',
      '[class*="content"]',
      '[id*="content"]',
      'main',
      '.news-content',
      '.article-body',
      '[id*="newsBody"]',
      '[class*="news_body"]'
    ];
    
    let content = '';
    for (const selector of selectors) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        content = Array.from(elements)
          .map(el => el.textContent)
          .join('\n')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (content.length > 100) {
          break;
        }
      }
    }
    
    if (content.length > 5000) {
      content = content.substring(0, 5000) + '...';
    }
    
    // 영구 캐시에 저장 (크롤링 절약)
    if (content && content.length > 100) {
      this.saveToCrawlCache(url, content);
      console.log('[crawlArticleContent] ✅ 크롤링 성공, 길이:', content.length);
    } else {
      console.warn('[crawlArticleContent] ⚠️ 본문 추출 실패 (길이: ' + content.length + ')');
    }
    
    return content || null;
    
  } catch (error) {
    console.warn('[crawlArticleContent] ❌ 크롤링 실패:', error?.message || error);
    return null;
  }
};

// AI 응답에서 JSON 안전 추출
AnalysisPanel.prototype.extractJsonFromAiResponse = function(resultText) {
  if (!resultText) {
    return null;
  }

  const normalized = resultText.replace(/\r\n/g, '\n');
  const codeBlockMatch = normalized.match(/```(?:json)?[\t ]*\n?([\s\S]*?)```/i);
  const braceMatch = normalized.match(/\{[\s\S]*\}/);
  const bracketMatch = normalized.match(/\[[\s\S]*\]/);
  const rawCandidate = codeBlockMatch ? codeBlockMatch[1] : (braceMatch ? braceMatch[0] : (bracketMatch ? bracketMatch[0] : null));
  if (!rawCandidate) {
    return null;
  }

  return this.safeParseJsonString(rawCandidate);
};

AnalysisPanel.prototype.safeParseJsonString = function(jsonString) {
  if (!jsonString) {
    return null;
  }

  const sanitizers = [
    (str) => str,
    (str) => str.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'),
    (str) => str.replace(/,(\s*[}\]])/g, '$1'),
    (str) => str.replace(/'(\s*:\s*)/g, '"$1').replace(/:(\s*)'(.*?)'/g, ':$1"$2"'),
    (str) => str.replace(/'/g, '"')
  ];

  let working = jsonString;
  for (const sanitize of sanitizers) {
    try {
      working = sanitize(working).trim();
      return JSON.parse(working);
    } catch (error) {
      continue;
    }
  }

  console.warn('[safeParseJsonString] JSON 파싱 실패, 원본 유지');
  return null;
};

// AI를 사용한 사실 검증 함수
AnalysisPanel.prototype.verifyFactsWithAI = async function(originalBlock, comparisonArticles) {
  console.log('[verifyFactsWithAI] AI 검증 시작');
  
  const prompt = `
당신은 사실 검증 전문가입니다. 원본 뉴스 기사와 비교 기사들을 분석하여 사실 여부를 검증하세요.

## 원본 기사
제목: ${originalBlock.title}
내용: ${originalBlock.content.substring(0, 1000)}

## 비교 기사들
${comparisonArticles.map((article, i) => `
### 비교 기사 ${i + 1}
제목: ${article.title}
출처: ${article.displayLink}
요약: ${article.snippet}
${article.crawledContent ? `본문 일부: ${article.crawledContent.substring(0, 500)}` : '(본문 크롤링 실패)'}
`).join('\n')}

## 작업
원본 기사의 핵심 주장들을 비교 기사들과 대조하여 다음을 분석하세요:
1. **일치하는 사실**: 비교 기사에서도 확인되는 내용
2. **불일치하는 사실**: 비교 기사와 다르게 보도된 내용
3. **검증 불가**: 비교 기사에서 언급되지 않은 내용
4. **종합 평가**: 원본 기사의 신뢰도 평가 (신뢰할 수 있음 / 부분적으로 신뢰 / 신뢰하기 어려움)

JSON 형식으로 응답:
{
  "일치하는_사실": ["사실1", "사실2", ...],
  "불일치하는_사실": ["불일치1", "불일치2", ...],
  "검증_불가": ["내용1", "내용2", ...],
  "종합_평가": "평가 텍스트"
}
`;

  try {
    const apiKey = 'AIzaSyCj9T9GNDQLduYbwPAGn6ovK44RlCnZHDU'; // Gemini API 키
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`AI API 오류: ${response.status}`);
    }
    
    const data = await response.json();
    const resultText = data.candidates[0]?.content?.parts[0]?.text || '{}';
    const parsed = this.extractJsonFromAiResponse(resultText);
    if (parsed) {
      return parsed;
    }
    
    console.warn('[verifyFactsWithAI] JSON 파싱 실패, 기본값 반환');
    return {
      일치하는_사실: [],
      불일치하는_사실: [],
      검증_불가: [],
      종합_평가: '검증 결과를 파싱할 수 없습니다.'
    };
    
  } catch (error) {
    console.error('[verifyFactsWithAI] AI 검증 오류:', error);
    return {
      일치하는_사실: [],
      불일치하는_사실: [],
      검증_불가: [],
      종합_평가: 'AI 검증 중 오류가 발생했습니다.'
    };
  }
};

// 사실 검증 후 Gemini로 전체 재분석
AnalysisPanel.prototype.reanalyzeWithFactCheck = async function(originalBlock, comparisonArticles, verificationResult) {
  console.log('[reanalyzeWithFactCheck] 재분석 시작');
  
  const prompt = `
당신은 뉴스 진위 판별 전문가입니다. 기존 분석 결과와 사실 검증 결과를 종합하여 **최종 분석을 업데이트**하세요.

## 원본 기사
제목: ${originalBlock.title}
본문: ${originalBlock.content.substring(0, 1500)}

## 기존 AI 분석 결과
${JSON.stringify(originalBlock.result, null, 2)}

## 사실 검증 결과 (${comparisonArticles.length}개 기사와 비교)
${comparisonArticles.map((article, i) => `
### 검증 기사 ${i + 1}
- 제목: ${article.title}
- 출처: ${article.displayLink}
- 요약: ${article.snippet}
${article.crawledContent ? `- 본문 일부: ${article.crawledContent.substring(0, 400)}` : ''}
`).join('\n')}

### 검증 분석
- 일치하는 사실: ${verificationResult.일치하는_사실?.join(', ') || '없음'}
- 불일치하는 사실: ${verificationResult.불일치하는_사실?.join(', ') || '없음'}
- 검증 불가: ${verificationResult.검증_불가?.join(', ') || '없음'}
- 종합 평가: ${verificationResult.종합_평가}

## 작업
위 사실 검증 결과를 반영하여 **기존 분석을 업데이트**하세요:

1. **진위**: 검증 결과를 반영하여 최종 판단 (진짜 뉴스 / 가짜일 가능성이 높은 뉴스 / 가짜일 가능성이 있는 뉴스 / 진짜 뉴스)
2. **요약**: 사실 검증 결과를 포함한 핵심 요약 (2-3문장)
3. **근거**: 
   - 기존 근거 유지
   - **✅ 사실 검증**: ${comparisonArticles.length}개 기사와 교차 검증 완료
   - 일치/불일치하는 사실 요약
4. **분석**: 
   - 기존 분석 내용
   - **사실 검증 반영**: 비교 기사들에서 확인된 사항, 의심스러운 부분 등 상세히 기술
5. **키워드**: 기존 유지
6. **검색어**: 기존 유지
7. **사실검증완료**: true (새로 추가)

**중요**: 
- "사실 검증 완료" 또는 "교차 검증됨" 등의 표시를 명확히 포함
- 일치하는 사실은 ✅, 불일치는 ❌ 마크 사용
- 비교 검증된 기사 개수 명시

JSON 형식으로 응답:
\`\`\`json
{
  "진위": "...",
  "요약": "...",
  "근거": "...",
  "분석": "...",
  "키워드": "...",
  "검색어": "...",
  "사실검증완료": true
}
\`\`\`
`;

  try {
    const apiKey = 'AIzaSyCj9T9GNDQLduYbwPAGn6ovK44RlCnZHDU';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`AI API 오류: ${response.status}`);
    }
    
    const data = await response.json();
    const resultText = data.candidates[0]?.content?.parts[0]?.text || '{}';
    const parsed = this.extractJsonFromAiResponse(resultText);
    if (parsed) {
      console.log('[reanalyzeWithFactCheck] 재분석 완료');
      return parsed;
    }
    
    // 파싱 실패 시 기존 결과에 사실검증완료 플래그만 추가
    console.warn('[reanalyzeWithFactCheck] JSON 파싱 실패, 기존 결과 사용');
    return {
      ...originalBlock.result,
      사실검증완료: true
    };
    
  } catch (error) {
    console.error('[reanalyzeWithFactCheck] 재분석 오류:', error);
    // 오류 시 기존 결과 반환
    return {
      ...originalBlock.result,
      사실검증완료: true
    };
  }
};

// 사실 검증 결과로 블록 업데이트 (더 이상 사용 안 함 - reanalyzeWithFactCheck로 대체)
AnalysisPanel.prototype.updateBlockWithFactCheck = function(blockId, verification) {
  const block = this.newsBlocks.get(blockId);
  if (!block) return;
  
  // result 객체에 검증 결과 추가
  if (!block.result) block.result = {};
  block.result.사실검증 = verification;
  
  // UI 업데이트
  this.newsBlocks.set(blockId, block);
  
  // 상세 패널이 열려있으면 새로고침
  const detailPanel = document.getElementById(`detail-panel-${blockId}`);
  if (detailPanel) {
    // 기존 패널 제거하고 재생성
    detailPanel.remove();
    this.showDetailedResult(blockId);
  }
  
  console.log('[updateBlockWithFactCheck] 블록 업데이트 완료:', blockId);
};

// 지연 함수 (크롤링 간격용)
AnalysisPanel.prototype.delay = function(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// ============= 영구 캐시 관리 (API 효율성) =============

// 영구 캐시 로드
AnalysisPanel.prototype.loadPersistentCache = function() {
  try {
    // 검색 결과 캐시 로드
    const searchCacheData = localStorage.getItem('factcheck_search_cache');
    if (searchCacheData) {
      const parsed = JSON.parse(searchCacheData);
      this.persistentSearchCache = new Map(Object.entries(parsed));
      console.log('[loadPersistentCache] 검색 캐시 로드:', this.persistentSearchCache.size, '개');
    } else {
      this.persistentSearchCache = new Map();
    }
    
    // 크롤링 결과 캐시 로드
    const crawlCacheData = localStorage.getItem('factcheck_crawl_cache');
    if (crawlCacheData) {
      const parsed = JSON.parse(crawlCacheData);
      this.persistentCrawlCache = new Map(Object.entries(parsed));
      console.log('[loadPersistentCache] 크롤링 캐시 로드:', this.persistentCrawlCache.size, '개');
    } else {
      this.persistentCrawlCache = new Map();
    }
  } catch (error) {
    console.error('[loadPersistentCache] 로드 실패:', error);
    this.persistentSearchCache = new Map();
    this.persistentCrawlCache = new Map();
  }
};

// 영구 캐시 저장
AnalysisPanel.prototype.savePersistentCache = function() {
  try {
    // 검색 결과 캐시 저장
    const searchCacheObj = Object.fromEntries(this.persistentSearchCache);
    localStorage.setItem('factcheck_search_cache', JSON.stringify(searchCacheObj));
    
    // 크롤링 결과 캐시 저장
    const crawlCacheObj = Object.fromEntries(this.persistentCrawlCache);
    localStorage.setItem('factcheck_crawl_cache', JSON.stringify(crawlCacheObj));
    
    console.log('[savePersistentCache] 캐시 저장 완료:', 
      this.persistentSearchCache.size, '개 검색,', 
      this.persistentCrawlCache.size, '개 크롤링');
  } catch (error) {
    console.error('[savePersistentCache] 저장 실패:', error);
  }
};

// 검색 결과를 영구 캐시에서 가져오기
AnalysisPanel.prototype.getFromSearchCache = function(cacheKey) {
  if (this.persistentSearchCache && this.persistentSearchCache.has(cacheKey)) {
    const cached = this.persistentSearchCache.get(cacheKey);
    // 캐시 유효기간 체크 (7일)
    if (cached.timestamp && Date.now() - cached.timestamp < 7 * 24 * 60 * 60 * 1000) {
      console.log('[getFromSearchCache] ✅ 캐시 히트:', cacheKey);
      return cached.results;
    } else {
      // 만료된 캐시 제거
      this.persistentSearchCache.delete(cacheKey);
      this.savePersistentCache();
    }
  }
  return null;
};

// 검색 결과를 영구 캐시에 저장
AnalysisPanel.prototype.saveToSearchCache = function(cacheKey, results) {
  if (!this.persistentSearchCache) {
    this.persistentSearchCache = new Map();
  }
  this.persistentSearchCache.set(cacheKey, {
    results: results,
    timestamp: Date.now()
  });
  this.savePersistentCache();
  console.log('[saveToSearchCache] 💾 캐시 저장:', cacheKey);
};

// 크롤링 결과를 영구 캐시에서 가져오기
AnalysisPanel.prototype.getFromCrawlCache = function(url) {
  if (this.persistentCrawlCache && this.persistentCrawlCache.has(url)) {
    const cached = this.persistentCrawlCache.get(url);
    // 캐시 유효기간 체크 (30일)
    if (cached.timestamp && Date.now() - cached.timestamp < 30 * 24 * 60 * 60 * 1000) {
      console.log('[getFromCrawlCache] ✅ 캐시 히트:', url.substring(0, 50));
      return cached.content;
    } else {
      // 만료된 캐시 제거
      this.persistentCrawlCache.delete(url);
      this.savePersistentCache();
    }
  }
  return null;
};

// 크롤링 결과를 영구 캐시에 저장
AnalysisPanel.prototype.saveToCrawlCache = function(url, content) {
  if (!this.persistentCrawlCache) {
    this.persistentCrawlCache = new Map();
  }
  this.persistentCrawlCache.set(url, {
    content: content,
    timestamp: Date.now()
  });
  this.savePersistentCache();
  console.log('[saveToCrawlCache] 💾 캐시 저장:', url.substring(0, 50));
};

// 캐시 통계 보기
AnalysisPanel.prototype.getCacheStats = function() {
  return {
    searchCache: this.persistentSearchCache ? this.persistentSearchCache.size : 0,
    crawlCache: this.persistentCrawlCache ? this.persistentCrawlCache.size : 0
  };
};


