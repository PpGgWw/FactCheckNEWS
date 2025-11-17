// AnalysisPanel.js - 뉴스 분석 패널 컴포넌트 (리팩토링됨)

class AnalysisPanel {
  constructor() {
    this.panelId = 'news-analysis-panel';
    this.newsBlocks = new Map(); // 분석된 뉴스 블록들을 관리하는 Map
    this.activeNewsStates = new Map(); // 각 URL별 분석 상태 관리
    this.activeNewsUrl = null; // 현재 패널에 표시 중인 뉴스 URL
    Object.defineProperty(this, 'currentNews', {
      get: () => {
        if (!this.activeNewsUrl) {
          return null;
        }
        return this.activeNewsStates.get(this.activeNewsUrl) || null;
      }
    });
    this.currentAnalyzingBlockId = null; // 현재 분석 중인 블록 ID (순차 분석용)
    this.palette = this.initializePalette();
    this.panelOpacity = this.getPanelOpacitySetting();
    this.blockIdCounter = 0;
    this.analysisTimeouts = new Map();
    this.abortControllers = new Map();
    this.crossVerificationInProgress = new Set();
    this.streamingResults = new Map();
    this.streamingDiffCache = new Map();
    this.searchInProgress = new Set();
    this.autoFactCheckQueue = new Set();
    this.persistentSearchCache = new Map();
    this.persistentCrawlCache = new Map();
    
    // API_KEY_PLACEHOLDER 상수 정의
    this.API_KEY_PLACEHOLDER = 'NONE';
    
    // 자기 피드백 루프 모듈 초기화 (기본 비활성화)
    this.selfFeedbackModule = new SelfFeedbackModule(this);
    this.selfFeedbackModule.setEnabled(false); // 비활성화
    this.crossVerificationDepth = this.selfFeedbackModule.getDepth();
    
    // USE_REAL_API 초기화 (Google Search API 설정과 동기화)
    this.USE_REAL_API = this.getGoogleSearchEnabled();

    try {
      this.loadPersistentCache();
    } catch (error) {
      console.warn('Failed to load persistent caches on init:', error);
    }

    if (this.isChromeApiAvailable()) {
      this.setupMessageListener();
    }
  }

  hasLocalApiKey(key) {
    try {
      const value = localStorage.getItem(key);
      return Boolean(value && value !== this.API_KEY_PLACEHOLDER);
    } catch (error) {
      console.warn('Failed to access localStorage while reading API key:', error);
      return false;
    }
  }

  syncApiKeysFromStorage() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
      console.warn('Chrome storage unavailable for syncing API keys');
      return;
    }

    try {
      chrome.storage.sync.get(['gemini_api_key', 'google_search_api_key'], (result = {}) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn('Failed to sync API keys:', chrome.runtime.lastError.message);
          return;
        }
        if (typeof result.gemini_api_key !== 'undefined') {
          try {
            localStorage.setItem('gemini_api_key', result.gemini_api_key);
          } catch (error) {
            console.warn('Failed to cache Gemini API key locally:', error);
          }
        }
        if (typeof result.google_search_api_key !== 'undefined') {
          try {
            localStorage.setItem('google_search_api_key', result.google_search_api_key);
          } catch (error) {
            console.warn('Failed to cache Google API key locally:', error);
          }
        }
        this.refreshApiKeyFlags();
        this.updatePanel();
      });
    } catch (error) {
      console.warn('Chrome storage unavailable while syncing API keys:', error);
      this.refreshApiKeyFlags();
    }
  }

  refreshApiKeyFlags() {
    this.geminiKeyReady = this.hasLocalApiKey('gemini_api_key');
    this.googleKeyReady = this.hasLocalApiKey('google_search_api_key');

    const panel = document.getElementById(this.panelId);
    if (panel) {
      this.updateApiStatusBadges(panel);
      this.updateApiKeyDependentControls(panel);
    }

    this.updateHeaderApiIndicator();
    this.updateApiQuotaDisplay();
    this.enforceApiKeyDependencies();
  }
  
  isGeminiKeyConfigured() {
    return Boolean(this.geminiKeyReady);
  }
  
  isGoogleApiConfigured() {
    return Boolean(this.googleKeyReady);
  }

  getApiIndicatorState() {
    const geminiReady = this.isGeminiKeyConfigured();
    const googleReady = this.isGoogleApiConfigured();
    if (!geminiReady) {
      return {
        text: '안됨',
        color: '#EF4444',
        description: 'Gemini API 키가 없습니다.'
      };
    }
    if (!googleReady) {
      return {
        text: '입력됨',
        color: '#FBBF24',
        description: 'Google API 키가 없어 일부 기능이 제한됩니다.'
      };
    }
    return {
      text: '입력됨',
      color: '#10B981',
      description: '모든 API 키가 준비되었습니다.'
    };
  }

  updateHeaderApiIndicator() {
    const panel = document.getElementById(this.panelId);
    if (!panel) return;

    const dot = panel.querySelector('[data-role="api-status-dot"]');
    const textEl = panel.querySelector('[data-role="api-status-text"]');
    if (!dot || !textEl) return;

    const { text, color } = this.getApiIndicatorState();
    dot.style.background = color;
    dot.style.boxShadow = `0 0 12px ${this.hexToRgba(color, 0.6)}`;
    textEl.textContent = text;
    textEl.style.color = this.hexToRgba(color, 0.85);
  }

  // API 할당량 표시 업데이트
  updateApiQuotaDisplay() {
    const panel = document.getElementById(this.panelId);
    if (!panel) return;

    const geminiKeyStatus = panel.querySelector('#gemini-key-status');
    const googleKeyStatus = panel.querySelector('#google-key-status');
    const geminiQuota = panel.querySelector('#gemini-quota');
    const googleQuota = panel.querySelector('#google-quota');

    // Gemini API 상태 업데이트
    if (geminiKeyStatus) {
      const geminiReady = this.isGeminiKeyConfigured();
      geminiKeyStatus.textContent = geminiReady ? '입력됨' : '미입력';
      geminiKeyStatus.style.color = geminiReady ? '#10B981' : '#EF4444';
    }

    // Google Search API 상태 업데이트
    if (googleKeyStatus) {
      const googleReady = this.isGoogleApiConfigured();
      googleKeyStatus.textContent = googleReady ? '입력됨' : '미입력';
      googleKeyStatus.style.color = googleReady ? '#10B981' : '#EF4444';
    }

    // 할당량 표시 (오늘 사용량 기준)
    const today = new Date().toDateString();
    const geminiUsage = this.getApiUsageCount('gemini', today);
    const googleUsage = this.getApiUsageCount('google', today);

    if (geminiQuota) {
      geminiQuota.textContent = geminiUsage > 0 ? `(총 ${geminiUsage}회)` : '';
    }

    if (googleQuota) {
      googleQuota.textContent = googleUsage > 0 ? `(총 ${googleUsage}회)` : '';
    }
  }

  // API 사용 횟수 가져오기
  getApiUsageCount(apiType, date) {
    try {
      const key = `api_usage_${apiType}_${date}`;
      const stored = localStorage.getItem(key);
      return stored ? parseInt(stored) : 0;
    } catch (error) {
      console.warn('Failed to get API usage count:', error);
      return 0;
    }
  }

  // API 사용 횟수 증가
  incrementApiUsage(apiType, count = 1) {
    try {
      const today = new Date().toDateString();
      const key = `api_usage_${apiType}_${today}`;
      const current = this.getApiUsageCount(apiType, today);
      localStorage.setItem(key, (current + count).toString());
      console.log(`[API Usage] ${apiType} API 사용: +${count}, 총 ${current + count}회 (오늘)`);
      this.updateApiQuotaDisplay();
    } catch (error) {
      console.warn('Failed to increment API usage:', error);
    }
  }

  updateApiStatusBadges(rootEl, snapshot = null) {
    if (!rootEl) return;
    const geminiBadge = rootEl.querySelector('[data-role="gemini-status"]');
    const googleBadge = rootEl.querySelector('[data-role="google-status"]');
    const geminiReady = this.isGeminiKeyConfigured();
    const googleReady = this.isGoogleApiConfigured();

    if (geminiBadge) {
      geminiBadge.textContent = geminiReady ? '입력됨' : '미입력';
      geminiBadge.style.background = geminiReady ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)';
      geminiBadge.style.color = geminiReady ? '#047857' : '#B91C1C';
    }
    if (googleBadge) {
      googleBadge.textContent = googleReady ? '입력됨' : '미입력';
      googleBadge.style.background = googleReady ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)';
      googleBadge.style.color = googleReady ? '#047857' : '#B91C1C';
    }

    if (snapshot) {
      const geminiInput = rootEl.querySelector('.gemini-key-input');
      const googleInput = rootEl.querySelector('.google-key-input');
      if (geminiInput && typeof snapshot.gemini === 'string') {
        geminiInput.value = snapshot.gemini;
      }
      if (googleInput && typeof snapshot.google === 'string') {
        googleInput.value = snapshot.google;
      }
    }
  }

  updateApiKeyDependentControls(rootEl) {
    if (!rootEl) return;
    const geminiReady = this.isGeminiKeyConfigured();
    const googleReady = this.isGoogleApiConfigured();
    const googleToggle = rootEl.querySelector('.google-search-toggle-btn');
    const autoFactCheckBtn = rootEl.querySelector('.auto-factcheck-btn');
    const autoCrossBtn = rootEl.querySelector('.auto-crossverify-btn');
    const filterBtn = rootEl.querySelector('.article-filter-btn');
    const integratedToggle = rootEl.querySelector('.integrated-search-toggle-btn');

    const disableButton = (button, enabled, tooltip) => {
      if (!button) return;
      button.disabled = !enabled;
      button.style.opacity = enabled ? '1' : '0.5';
      button.style.cursor = enabled ? 'pointer' : 'not-allowed';
      if (tooltip) {
        button.title = enabled ? '' : tooltip;
      }
    };

    disableButton(googleToggle, googleReady, 'Google Search API 키를 먼저 입력하세요.');
    disableButton(autoFactCheckBtn, geminiReady && googleReady, 'Gemini와 Google API 키 모두 필요합니다.');
    disableButton(autoCrossBtn, geminiReady, 'Gemini API 키를 먼저 입력하세요.');
    disableButton(filterBtn, geminiReady, 'Gemini API 키를 먼저 입력하세요.');
    disableButton(integratedToggle, googleReady && this.getGoogleSearchEnabled(), 'Google Search API 사용을 먼저 켜세요.');
  }

  enforceApiKeyDependencies() {
    const geminiReady = this.isGeminiKeyConfigured();
    const googleReady = this.isGoogleApiConfigured();

    if (!googleReady && this.getGoogleSearchEnabled()) {
      this.setGoogleSearchEnabled(false);
    }
    if ((!geminiReady || !googleReady) && this.getAutoFactCheckSetting()) {
      this.setAutoFactCheckSetting(false);
    }
    if (!geminiReady && this.getAutoCrossVerificationSetting()) {
      this.setAutoCrossVerificationSetting(false);
    }
    if (!geminiReady && this.getArticleFilterSetting()) {
      this.setArticleFilterSetting(false);
    }
    if ((!googleReady || !this.getGoogleSearchEnabled()) && this.getIntegratedSearchSetting()) {
      this.setIntegratedSearchSetting(false);
    }
  }

  async loadApiKeySnapshot() {
    const [gemini, google] = await Promise.all([
      this.fetchStoredApiKey('gemini_api_key'),
      this.fetchStoredApiKey('google_search_api_key')
    ]);
    return { gemini, google };
  }

  async fetchStoredApiKey(keyName) {
    const decodeValue = async (value) => {
      if (!value || value === this.API_KEY_PLACEHOLDER) {
        return '';
      }
      try {
        return await this.decryptApiKey(value);
      } catch (error) {
        console.warn(`[API Key] Failed to decrypt ${keyName}:`, error);
        return '';
      }
    };

    let localValue = null;
    try {
      localValue = localStorage.getItem(keyName);
    } catch (error) {
      console.warn(`[API Key] Failed to read ${keyName} from localStorage:`, error);
    }

    const localPlain = await decodeValue(localValue);
    if (localPlain) {
      return localPlain;
    }

    if (!this.isChromeApiAvailable()) {
      return '';
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([keyName], async (result) => {
          if (chrome.runtime.lastError) {
            console.warn(`[API Key] Chrome storage read failed for ${keyName}:`, chrome.runtime.lastError.message);
            resolve('');
            return;
          }
          const storedValue = result[keyName];
          resolve(await decodeValue(storedValue));
        });
      } catch (error) {
        console.warn(`[API Key] Chrome storage access failed for ${keyName}:`, error);
        resolve('');
      }
    });
  }

  async persistApiKeyValue(keyName, plainValue) {
    const sanitized = (plainValue || '').trim();
    const shouldClear = sanitized.length === 0 || sanitized.toUpperCase() === this.API_KEY_PLACEHOLDER;
    let valueToStore = this.API_KEY_PLACEHOLDER;

    if (!shouldClear) {
      valueToStore = await this.encryptApiKey(sanitized);
    }

    this.safeSetLocalItem(keyName, valueToStore);
    await this.safeSetChromeLocal(keyName, valueToStore);
    return shouldClear ? '' : sanitized;
  }

  safeSetLocalItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`[Storage] Failed to set ${key} locally:`, error);
    }
  }

  async safeSetChromeLocal(key, value) {
    if (!this.isChromeApiAvailable()) return;
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            console.warn(`[Storage] Chrome storage set failed for ${key}:`, chrome.runtime.lastError.message);
          }
          resolve();
        });
      } catch (error) {
        console.warn(`[Storage] Chrome storage exception for ${key}:`, error);
        resolve();
      }
    });
  }

  async saveGeminiApiKey(apiKey) {
    await this.persistApiKeyValue('gemini_api_key', apiKey);
    this.refreshApiKeyFlags();
  }
  
  // 메시지 리스너 설정
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'notifyQuotaError') {
        console.warn('[AnalysisPanel] 할당량 오류 알림 수신');
        const apiType = message.resetApiUsageType || 'gemini';
        if (typeof this.resetApiUsageCount === 'function') {
          this.resetApiUsageCount(apiType);
          this.updateApiQuotaDisplay();
        }
        this.showQuotaErrorToast(message.blockId || null);
        if (typeof sendResponse === 'function') {
          sendResponse({ success: true });
        }
        return true;
      }
      return false;
    });
  }

  // 초기 실행 시 기본 설정 값 주입
  applyDefaultSettings() {
    const ensureLocal = (key, value, serializer) => {
      try {
        if (localStorage.getItem(key) !== null) return;
        const serialized = typeof serializer === 'function'
          ? serializer(value)
          : (typeof value === 'string' ? value : JSON.stringify(value));
        localStorage.setItem(key, serialized);
      } catch (error) {
        console.warn(`[Defaults] Failed to set ${key}:`, error);
      }
    };

    const ensureChrome = (key, value) => {
      if (!this.isChromeApiAvailable()) return;
      chrome.storage.local.get([key], (data) => {
        if (chrome.runtime.lastError) {
          console.warn(`[Defaults] Chrome storage get failed for ${key}:`, chrome.runtime.lastError.message);
          return;
        }
        if (typeof data[key] === 'undefined') {
          try {
            chrome.storage.local.set({ [key]: value }, () => {
              if (chrome.runtime.lastError) {
                console.warn(`[Defaults] Chrome storage set failed for ${key}:`, chrome.runtime.lastError.message);
              }
            });
          } catch (error) {
            console.warn(`[Defaults] Chrome storage exception for ${key}:`, error);
          }
        }
      });
    };

    ensureLocal('crawling_priority', 'speed');
    ensureChrome('crawling_priority', 'speed');

    ensureLocal('article_filter_enabled', 'false');
    ensureChrome('article_filter_enabled', false);

    ensureLocal('factcheck_auto_fact_check', false);
    ensureLocal('factcheck_auto_cross_verify', false);
    ensureLocal('factcheck_integrated_search_enabled', false);
    ensureLocal('factcheck_auto_open', true);
    ensureLocal('factcheck_panel_opacity', '1');
    ensureLocal('factcheck_cross_verification_depth', '3');
  }

  // 패널 테마 색상 초기화
  initializePalette() {
    const fallback = this.getDefaultPalette();

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return fallback;
    }

    try {
      const root = document.documentElement;
      if (!root) {
        return fallback;
      }

      const computed = window.getComputedStyle(root);
      const readVar = (name) => {
        if (!name) return '';
        const value = computed.getPropertyValue(name);
        return typeof value === 'string' ? value.trim() : '';
      };

      const cssPalette = {
        base: readVar('--factcheck-panel-base'),
        surface: readVar('--factcheck-panel-surface'),
        surfaceAlt: readVar('--factcheck-panel-surface-alt'),
        accent: readVar('--factcheck-panel-accent'),
        text: readVar('--factcheck-panel-text'),
        textAlt: readVar('--factcheck-panel-text-alt'),
        textMuted: readVar('--factcheck-panel-text-muted'),
        border: readVar('--factcheck-panel-border')
      };

      return Object.entries(cssPalette).reduce((palette, [key, value]) => {
        if (value) {
          palette[key] = value;
        }
        return palette;
      }, { ...fallback });
    } catch (error) {
      console.warn('[AnalysisPanel] Failed to read palette variables:', error);
      return fallback;
    }
  }

  getDefaultPalette() {
    return {
      base: '#0D0D0D',
      surface: '#151515',
      surfaceAlt: '#1E1E1E',
      accent: '#F2CEA2',
      text: '#F8FAFC',
      textAlt: '#E2E8F0',
      textMuted: '#94A3B8',
      border: 'rgba(255, 255, 255, 0.15)'
    };
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
    
    // 패널 생성 후 저장된 블록 복원
    this.loadSavedData();
    
    // API 키 상태 초기화
    this.refreshApiKeyFlags();
    
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

      let verdict =
        normalizedResult.진위 ||
        normalizedResult.verdict ||
        normalizedResult.result?.진위 ||
        normalizedResult.result?.verdict;

      // 진위 값 정규화: "진짜 뉴스" → "사실", "가짜 뉴스" → "거짓"
      if (verdict) {
        const verdictMap = {
          '진짜 뉴스': '사실',
          '진짜뉴스': '사실',
          '가짜 뉴스': '거짓',
          '가짜뉴스': '거짓',
          '사실입니다': '사실',
          '거짓입니다': '거짓',
          '사실임': '사실',
          '거짓임': '거짓',
          // 비교분석에서 나올 수 있는 표현들
          '일치하는 진짜 뉴스': '사실',
          '일부 차이가 있지만 신뢰할 수 있는 뉴스': '대체로 사실',
          '상당한 차이가 있어 주의가 필요한 뉴스': '일부 사실',
          '상충되는 내용으로 추가 검증 필요': '대체로 거짓',
          // AI가 반환할 수 있는 기타 표현들
          '부분적으로 신뢰': '일부 사실',
          '부분적으로 사실': '일부 사실',
          '부분적 사실': '일부 사실',
          '신뢰할 수 있음': '사실',
          '신뢰 가능': '사실'
        };
        verdict = verdictMap[verdict] || verdict;
      }

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
      '사실': {
        base: '#22C55E',
        badgeBackground: 'rgba(34, 197, 94, 0.18)',
        badgeText: '#BBF7D0',
        badgeBorder: 'rgba(34, 197, 94, 0.55)'
      },
      '대체로 사실': {
        base: '#10B981',
        badgeBackground: 'rgba(16, 185, 129, 0.18)',
        badgeText: '#A7F3D0',
        badgeBorder: 'rgba(16, 185, 129, 0.55)'
      },
      '일부 사실': {
        base: '#F59E0B',
        badgeBackground: 'rgba(245, 158, 11, 0.18)',
        badgeText: '#FDE68A',
        badgeBorder: 'rgba(245, 158, 11, 0.55)'
      },
      '대체로 거짓': {
        base: '#F97316',
        badgeBackground: 'rgba(249, 115, 22, 0.18)',
        badgeText: '#FDBA74',
        badgeBorder: 'rgba(249, 115, 22, 0.55)'
      },
      '거짓': {
        base: '#EF4444',
        badgeBackground: 'rgba(239, 68, 68, 0.18)',
        badgeText: '#FCA5A5',
        badgeBorder: 'rgba(239, 68, 68, 0.55)'
      }
    };

    const selected = palette[verdict] || palette['일부 사실'];
    return {
      ...selected,
      text: selected.base,
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
          transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.8s cubic-bezier(0.4, 0, 0.2, 1), height 0.6s cubic-bezier(0.4, 0, 0.2, 1), --glow-opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), --glow-scale 0.8s cubic-bezier(0.4, 0, 0.2, 1), --glow-blur 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: var(--base-box-shadow, 0 4px 12px rgba(0, 0, 0, 0.25));
          --glow-opacity: var(--glow-opacity-base, 0);
          --glow-scale: var(--glow-scale-base, 1);
          --glow-blur: var(--glow-blur-base, 0px);
          --analysis-expanded-height: 240px;
        }

        .news-content-area,
        .news-actions-area {
          max-height: 1200px;
          transition: max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), padding 0.4s cubic-bezier(0.4, 0, 0.2, 1), margin 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease;
        }

        .news-block--analyzing .news-content-area,
        .news-block--analyzing .news-actions-area {
          max-height: 0;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          margin-top: 0 !important;
          margin-bottom: 0 !important;
          opacity: 0;
          border-width: 0 !important;
          overflow: hidden;
          pointer-events: none;
        }

        .news-block--analyzing .news-actions-area {
          gap: 0 !important;
        }

        .analysis-height-expander {
          height: 0;
          transition: height 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          pointer-events: none;
        }

        .news-block--analyzing .analysis-height-expander {
          height: var(--analysis-expanded-height);
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

    // 패널이 다시 렌더링되면 API 사용량 뱃지들도 즉시 갱신
    this.updateApiQuotaDisplay();
  }

  // 헤더 렌더링
  renderHeader() {
    const { accent, surfaceAlt, surface, text, textMuted, border } = this.palette;
    return `
      <div class="analysis-panel-collapsible" style="
        background: linear-gradient(135deg, ${surfaceAlt} 0%, ${accent} 100%);
        padding: 20px;
        border-bottom: none;
        border-radius: 20px 0 0 0;
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
              <div id="api-status-container" style="display: flex; flex-direction: column; gap: 2px; font-size: 10px; color: ${textMuted}; font-weight: 500;">
                <!-- Gemini API 상태 -->
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="color: ${text}; font-weight: 600; font-size: 10px;">Gemini:</span>
                  <span id="gemini-key-status" style="color: ${this.isGeminiKeyConfigured() ? '#10B981' : '#EF4444'}; font-weight: 600; font-size: 10px;">
                    ${this.isGeminiKeyConfigured() ? '입력됨' : '미입력'}
                  </span>
                  <span id="gemini-quota" style="color: #F8FAFC; font-size: 10px; font-weight: 600;"></span>
                </div>
                
                <!-- Google Search API 상태 -->
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="color: ${text}; font-weight: 600; font-size: 10px;">Google:</span>
                  <span id="google-key-status" style="color: ${this.isGoogleApiConfigured() ? '#10B981' : '#EF4444'}; font-weight: 600; font-size: 10px;">
                    ${this.isGoogleApiConfigured() ? '입력됨' : '미입력'}
                  </span>
                  <span id="google-quota" style="color: #F8FAFC; font-size: 10px; font-weight: 600;"></span>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
              
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

  // 현재 뉴스 렌더링 (병렬 분석 지원)
  renderCurrentNews() {
    const { textMuted } = this.palette;
    
    // 현재 활성 뉴스가 없으면 메시지 표시
    if (!this.activeNewsUrl || !this.activeNewsStates.has(this.activeNewsUrl)) {
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
    
    const currentNews = this.activeNewsStates.get(this.activeNewsUrl);
    currentNews.linkedId = this.getCurrentLinkedBlockId();
    return this.renderNewsBlock(currentNews, true);
  }

  isCurrentBlockId(blockId) {
    if (!blockId) {
      return false;
    }
    if (blockId === 'current') {
      return true;
    }
    if (typeof blockId === 'string') {
      return blockId.startsWith('current-');
    }
    return false;
  }

  getCurrentLinkedBlockId() {
    if (!this.currentNews || !this.currentNews.url || this.newsBlocks.size === 0) {
      return null;
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
    const entry = Array.from(this.newsBlocks.entries()).find(([, block]) => normalizeUrl(block.url) === currentUrl);
    return entry ? entry[0] : null;
  }

  resolveBlockKeyFromElement(element) {
    if (!element) {
      return null;
    }

    const parentBlock = element.closest('.news-block');
    if (parentBlock && parentBlock.dataset.blockKey) {
      const keyCandidate = parentBlock.dataset.blockKey;
      if (keyCandidate && keyCandidate !== 'current') {
        const parsed = parseInt(keyCandidate, 10);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
      if (keyCandidate === 'current') {
        const linkedId = this.getCurrentLinkedBlockId();
        return linkedId !== null && linkedId !== undefined ? linkedId : 'current';
      }
    }

    const rawId = element.dataset ? element.dataset.id : null;
    if (this.isCurrentBlockId(rawId)) {
      const linkedId = this.getCurrentLinkedBlockId();
      return linkedId !== null && linkedId !== undefined ? linkedId : 'current';
    }

    if (rawId) {
      const parsed = parseInt(rawId, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return null;
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
    const { surface, base, text, textMuted, border, accent } = this.palette;
    const isHistoryExpanded = this.collapsedHistoryExpanded;
    const toggleLabel = isHistoryExpanded ? '닫기' : '펼치기';
    const toggleBg = isHistoryExpanded ? this.hexToRgba(accent, 0.32) : 'rgba(140, 110, 84, 0.22)';
    const toggleBorder = this.hexToRgba(accent, 0.55);
    const listMaxHeight = 420;
    const listStyles = isHistoryExpanded
      ? `max-height: ${listMaxHeight}px; opacity: 1; padding: 12px 6px 6px 2px; pointer-events: auto;`
      : 'max-height: 0; opacity: 0; padding: 0; pointer-events: none;';
    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 15px; font-weight: 600; color: ${text};">요약 패널</span>
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
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 15px; font-weight: 600; color: ${text};">분석 기록</span>
              <span id="collapsed-summary-count" style="font-size: 12px; color: ${textMuted}; opacity: 0.9;">${this.getCollapsedSummaryCountText()}</span>
            </div>
            <button id="collapsed-history-toggle" data-expanded="${isHistoryExpanded}" style="
              padding: 6px 14px;
              border-radius: 999px;
              border: 1px solid ${toggleBorder};
              background: ${toggleBg};
              color: ${text};
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s ease;
            " onmouseover="this.style.filter='brightness(1.15)';" onmouseout="this.style.filter='none';">${toggleLabel}</button>
          </div>
        </div>
        <div id="collapsed-summary-list" style="
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: hidden;
          transition: max-height 0.25s ease, opacity 0.2s ease, padding 0.2s ease;
          ${listStyles}
        ">
          <div class="collapsed-history-scroll" style="
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-height: ${listMaxHeight}px;
            overflow-y: auto;
            padding-right: 6px;
          ">
            ${this.renderCollapsedSummaryItems()}
          </div>
          ${isHistoryExpanded ? `
          <div style="
            font-size: 11px;
            color: ${this.hexToRgba(textMuted, 0.9)};
            text-align: right;
            padding-right: 2px;
          ">최대 5개씩 표시 · 스크롤로 더 보기</div>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderCollapsedCurrentSection() {
    const { surface, base, text, textMuted, border } = this.palette;
    
    // 현재 활성 뉴스가 없으면 메시지 표시
    if (!this.activeNewsUrl || !this.activeNewsStates.has(this.activeNewsUrl)) {
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

    const currentNews = this.activeNewsStates.get(this.activeNewsUrl);
    const block = currentNews;
    const safeTitle = currentNews.title || '제목 없음';
    const status = currentNews.status || 'pending';
    const result = currentNews.result;
    // 다른 뉴스가 분석 중이면 버튼 비활성화
    const isOtherAnalyzing = this.currentAnalyzingBlockId !== null && block && this.currentAnalyzingBlockId !== block.id;
    const showAnalyzeBtn = (status === 'pending' || status === 'error') && !isOtherAnalyzing;
    const isAnalyzing = status === 'analyzing';
    const isCompleted = status === 'completed';
    const progress = currentNews.progress || '분석 중...';
    const analysisMode = block.factCheckMode || block.factCheckResult?.mode || 'standard';
    const modeMeta = this.getAnalysisModeMeta(analysisMode);
    const analyzedTimestamp = block.factCheckResult?.timestamp || block.timestamp;
    const analyzedAgo = analyzedTimestamp ? this.formatRelativeTime(analyzedTimestamp) : '';
    
    // 상세 패널과 동일한 색상 및 네온 효과 적용
    const verdictColors = result && result.진위 ? this.getVerdictColors(result.진위) : null;
    const hasGlow = isCompleted && verdictColors;
    const glowColor = hasGlow ? verdictColors.base : null;
    
    let blockBackground = this.blendColors(surface, base, 0.28);
    let borderColor = border;
    let boxShadow = 'none';
    let cursorStyle = '';
    
    if (hasGlow) {
      blockBackground = this.blendColors(verdictColors.base, base, 0.2);
      borderColor = verdictColors.border;
      const neonGlow = `0 0 24px ${this.hexToRgba(glowColor, 0.22)}, 0 0 48px ${this.hexToRgba(glowColor, 0.12)}, inset 0 0 80px ${this.hexToRgba(glowColor, 0.05)}`;
      boxShadow = neonGlow;
      cursorStyle = 'cursor: pointer;';
    }
    
    if (isAnalyzing) {
      const { accent } = this.palette;
      blockBackground = this.blendColors(accent, surface, 0.32);
      borderColor = this.hexToRgba(accent, 0.75);
    }
    
    // 상세 패널과 동일한 스타일 배지
    const statusBadge = this.getDetailedStatusBadge(currentNews);
    
    const modeIcon = `
      <div style="
        width: 24px;
        height: 24px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        background: ${modeMeta.background};
        border: 1px solid ${modeMeta.border};
        color: ${modeMeta.color};
        font-weight: 700;
      " title="${modeMeta.label}">${modeMeta.icon}</div>
    `;

    return `
      <div id="collapsed-current-clickable" style="
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px;
        border-radius: 14px;
        border: 1px solid ${borderColor};
        background: ${blockBackground};
        box-shadow: ${boxShadow};
        transition: all 0.3s ease;
        position: relative;
        ${cursorStyle}
      " ${isCompleted ? 'data-clickable="true"' : ''}>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-size: 14px; font-weight: 600; color: ${text};">현재 페이지</span>
                ${statusBadge}
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                ${modeIcon}
                ${analyzedAgo ? `
                  <div style="
                    background: rgba(13, 13, 13, 0.35);
                    border: 1px solid ${this.hexToRgba(borderColor, 0.5)};
                    color: ${this.hexToRgba(text, 0.9)};
                    padding: 2px 8px;
                    border-radius: 999px;
                    font-size: 11px;
                    font-weight: 600;
                  ">${analyzedAgo} 분석</div>
                ` : ''}
              </div>
            </div>
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
        ${showAnalyzeBtn ? `
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <button id="collapsed-current-analyze-btn" style="
              padding: 8px 14px;
              border-radius: 8px;
              border: 1px solid rgba(140, 110, 84, 0.5);
              background: rgba(140, 110, 84, 0.28);
              color: ${text};
              font-size: 13px;
              cursor: pointer;
              transition: all 0.2s ease;
            " onmouseover="this.style.background='rgba(140, 110, 84, 0.4)';" onmouseout="this.style.background='rgba(140, 110, 84, 0.28)';">분석하기</button>
          </div>
        ` : ''}
        ${isAnalyzing ? `
        <div style="
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid rgba(140, 110, 84, 0.5);
          background: rgba(140, 110, 84, 0.28);
          color: #0D0D0D;
          font-size: 12px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
        ">
          <div class="unified-spinner unified-spinner--small" style="margin-right: 2px;"></div>
          <span class="collapsed-progress-text" style="
            line-height: 1.2;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
            color: #0D0D0D;
          ">${progress}</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  renderCollapsedSummaryItems() {
    const { surface, base, text, textMuted, border, accent } = this.palette;
    const gradientStart = this.hexToRgba(surface, 0.95);
    const gradientEnd = this.hexToRgba(accent || border || '#BF9780', 0.2);
    const baseItemBackground = `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})`;
    const baseBorder = this.hexToRgba(accent || border || '#BF9780', 0.55);
    const itemShadow = `0 10px 25px ${this.hexToRgba('#000000', 0.35)}`;

    if (this.newsBlocks.size === 0) {
      return `
        <div style="
          padding: 16px;
          border-radius: 10px;
          border: 1px solid ${border};
          background: ${baseItemBackground};
          color: ${textMuted};
          font-size: 13px;
          text-align: center;
        ">아직 저장된 분석이 없습니다</div>
      `;
    }

    return Array.from(this.newsBlocks.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(block => {
        const title = block.title || '제목 없음';
        const subtitle = this.formatRelativeTime(block.timestamp);
        const encodedUrl = block.url ? encodeURIComponent(block.url) : '';
        const showAnalyze = block.status === 'pending' || block.status === 'error';
        const statusBadge = this.getCollapsedStatusBadge(block);
        const modeMeta = this.getAnalysisModeMeta(block.factCheckMode || block.factCheckResult?.mode || 'standard');
          const analyzeButton = showAnalyze ? `
              <div style="flex: 1 1 110px; display: flex; flex-direction: column; gap: 4px;">
                <button class="mini-action-btn mini-analyze-btn" data-block-id="${block.id}" style="
                  padding: 6px 10px;
                  border-radius: 6px;
                  border: 1px solid rgba(140, 110, 84, 0.45);
                  background: rgba(140, 110, 84, 0.22);
                  color: ${text};
                  font-size: 12px;
                  cursor: pointer;
                  transition: all 0.2s ease;
                " onmouseover="this.style.background='rgba(140, 110, 84, 0.34)';" onmouseout="this.style.background='rgba(140, 110, 84, 0.22)';">분석하기</button>
              </div>` : '';
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
        const verdictColors = block.result?.진위 ? this.getVerdictColors(block.result.진위) : null;
        const cardBackground = verdictColors ? this.hexToRgba(verdictColors.base, 0.2) : baseItemBackground;
        const cardBorder = verdictColors ? this.hexToRgba(verdictColors.border, 0.9) : baseBorder;

        return `
          <div class="collapsed-summary-item" data-block-id="${block.id}" data-url="${encodedUrl}" data-status="${block.status}" style="
            padding: 14px 16px;
            border-radius: 14px;
            border: 1px solid ${cardBorder};
            background: ${cardBackground};
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-height: 130px;
            max-height: 130px;
            justify-content: space-between;
            cursor: pointer;
            box-shadow: ${itemShadow};
            position: relative;
            overflow: hidden;
            transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 16px 32px rgba(0,0,0,0.35)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='${itemShadow}';">
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
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span style="font-size: 12px; color: ${textMuted};">${subtitle}</span>
                  ${statusBadge}
                </div>
                <div style="
                  background: ${modeMeta.background};
                  border: 1px solid ${modeMeta.border};
                  color: ${modeMeta.color};
                  padding: 3px 8px;
                  border-radius: 999px;
                  font-size: 11px;
                  font-weight: 600;
                  display: inline-flex;
                  align-items: center;
                  gap: 4px;
                  white-space: nowrap;
                " title="${modeMeta.label}">
                  <span>${modeMeta.icon}</span>
                  <span>${modeMeta.label}</span>
                </div>
              </div>
            </div>
            <div class="collapsed-summary-actions" style="
              display: flex;
              gap: 6px;
              flex-wrap: nowrap;
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

  // 상세 패널과 동일한 스타일의 배지 (네온 효과용)
  getDetailedStatusBadge(block) {
    const { text } = this.palette;
    const baseStyle = `display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;`;

    switch (block.status) {
      case 'pending':
        return `<span style="${baseStyle} background: rgba(140, 110, 84, 0.22); color: ${text}; border: 1px solid rgba(140, 110, 84, 0.5); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">대기 중</span>`;
      case 'analyzing':
        return `<span style="${baseStyle} background: rgba(59, 130, 246, 0.25); color: ${text}; border: 1px solid rgba(59, 130, 246, 0.5); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">분석 중</span>`;
      case 'error':
        return `<span style="${baseStyle} background: rgba(239, 68, 68, 0.25); color: ${text}; border: 1px solid rgba(239, 68, 68, 0.5); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">재시도 필요</span>`;
      case 'completed':
        if (block.result && block.result.진위) {
          const verdictColors = this.getVerdictColors(block.result.진위);
          return `<span style="${baseStyle} background: ${verdictColors.badgeBackground}; color: ${verdictColors.badgeText}; border: 1px solid ${verdictColors.badgeBorder}; box-shadow: 0 2px 8px ${this.hexToRgba(verdictColors.base, 0.3)}; font-weight: 700;">${block.result.진위}</span>`;
        }
        return `<span style="${baseStyle} background: rgba(16, 185, 129, 0.22); color: ${text}; border: 1px solid rgba(16, 185, 129, 0.5); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">완료</span>`;
      default:
        return `<span style="${baseStyle} background: rgba(107, 114, 128, 0.3); color: ${text}; border: 1px solid rgba(107, 114, 128, 0.4); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">알 수 없음</span>`;
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
    block.factCheckMode = 'standard';
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

  getAnalysisModeMeta(mode = 'standard') {
    const { text, textMuted } = this.palette;
    const modes = {
      speed: {
        label: '속도 우선',
        icon: '⚡',
        background: 'rgba(245, 158, 11, 0.18)',
        border: 'rgba(245, 158, 11, 0.5)',
        color: '#FBBF24'
      },
      accuracy: {
        label: '정확도 우선',
        icon: '🎯',
        background: 'rgba(59, 130, 246, 0.18)',
        border: 'rgba(59, 130, 246, 0.5)',
        color: '#60A5FA'
      },
      standard: {
        label: '일반 분석',
        icon: '🧠',
        background: 'rgba(16, 185, 129, 0.18)',
        border: 'rgba(16, 185, 129, 0.4)',
        color: text
      }
    };
    return modes[mode] || modes.standard || {
      label: '일반 분석',
      icon: '🧠',
      background: 'rgba(16, 185, 129, 0.18)',
      border: 'rgba(16, 185, 129, 0.4)',
      color: textMuted
    };
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
    const urlTextColor = this.hexToRgba(text, 0.92);
    const urlHoverColor = this.hexToRgba(accent, 0.9);
    const blockKey = typeof block.linkedId === 'number'
      ? block.linkedId
      : (typeof id === 'number' ? id : (this.isCurrentBlockId(id) ? 'current' : id));
    const blockKeyAttr = blockKey !== undefined && blockKey !== null ? blockKey : '';
    const encodedUrl = encodeURIComponent(url || '');
    const isCompleted = status === 'completed';
    const isAnalyzing = status === 'analyzing';
    const verdictColors = result && result.진위 ? this.getVerdictColors(result.진위) : null;
    const hasGlow = isCompleted && verdictColors;
    const glowColor = hasGlow ? verdictColors.base : null;
    const analysisMode = block.factCheckMode || (block.factCheckResult?.mode) || 'standard';
    const modeMeta = this.getAnalysisModeMeta(analysisMode);
    const analyzedTimestamp = block.factCheckResult?.timestamp || block.timestamp;
    const analyzedAgo = analyzedTimestamp ? this.formatRelativeTime(analyzedTimestamp) : '';

    let blockBackground = this.blendColors(surface, base, isCurrent ? 0.28 : 0.22);
    let borderColor = 'rgba(140, 110, 84, 0.55)';
    let boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';
    let neonGlow = '';
    let hoverNeonGlow = '';

    if (hasGlow) {
      blockBackground = this.blendColors(verdictColors.base, base, 0.2);
      borderColor = verdictColors.border;
      boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';

    neonGlow = `0 0 32px ${this.hexToRgba(glowColor, 0.26)}, 0 0 68px ${this.hexToRgba(glowColor, 0.14)}, 0 0 120px ${this.hexToRgba(glowColor, 0.08)}, inset 0 0 100px ${this.hexToRgba(glowColor, 0.06)}`;
    hoverNeonGlow = `0 0 50px ${this.hexToRgba(glowColor, 0.48)}, 0 0 110px ${this.hexToRgba(glowColor, 0.26)}, 0 0 160px ${this.hexToRgba(glowColor, 0.14)}, inset 0 0 130px ${this.hexToRgba(glowColor, 0.1)}`;
    }

    if (isAnalyzing) {
      blockBackground = this.blendColors(accent, surface, 0.32);
      borderColor = this.hexToRgba(accent, 0.75);
      boxShadow = '0 12px 30px rgba(191, 151, 128, 0.35)';
    }

    const baseBoxShadow = neonGlow ? `${boxShadow}, ${neonGlow}` : boxShadow;
    const hoverBoxShadow = hasGlow ? `${boxShadow}, ${hoverNeonGlow}` : '0 12px 24px rgba(0, 0, 0, 0.35)';
    const isClickable = isCompleted;
    const cursorStyle = isClickable ? 'cursor: pointer;' : '';

    const factCheckInProgress = Boolean(block.factCheckInProgress);
    const factCheckProgressText = block.factCheckProgress || '사실 검증 중...';

    let actionButtons = '';

    const primaryButtonBase = "rgba(140, 110, 84, 0.28)";
    const primaryButtonBorder = "rgba(140, 110, 84, 0.5)";
    const primaryButtonHover = "rgba(140, 110, 84, 0.4)";
    const neutralButtonBase = "rgba(26, 26, 26, 0.62)";
    const neutralButtonHover = "rgba(26, 26, 26, 0.5)";
    const dangerButtonBase = "rgba(239, 68, 68, 0.25)";
    const dangerButtonHover = "rgba(239, 68, 68, 0.4)";

    const factCheckProgressButton = `
      <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
        <div style="
          background: ${primaryButtonHover};
          color: ${text};
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid ${primaryButtonBorder};
          backdrop-filter: blur(12px);
          min-height: 48px;
        ">
          <div class="unified-spinner unified-spinner--small" style="margin-right: 8px;"></div>
          <span style="
            line-height: 1.4;
            font-weight: 600;
          ">${this.escapeHtml(factCheckProgressText)}</span>
        </div>
        <div style="
          font-size: 11px;
          color: ${this.hexToRgba(text, 0.75)};
          text-align: center;
        ">사실 검증이 진행 중입니다. 완료될 때까지 기다려주세요.</div>
      </div>
    `;

    if (isCurrent) {
      if (factCheckInProgress && isCompleted) {
        actionButtons = factCheckProgressButton;
      } else {
        switch (status) {
        case 'pending': {
          actionButtons = `
            <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
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
            </div>
          `;
          break;
        }
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
                <div class="unified-spinner unified-spinner--small" style="margin-right: 6px;"></div>
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
              ${isCompleted && verdictColors && block.crossVerified && !isCurrent ? `
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
      }
    } else {
      if (factCheckInProgress && isCompleted) {
        actionButtons = factCheckProgressButton;
      } else if (status === 'analyzing') {
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
              <div class="unified-spinner unified-spinner--small" style="margin-right: 6px;"></div>
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
                  display: none;
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
    if (isAnalyzing) blockClasses.push('news-block--analyzing');

    const factCheckOverlay = factCheckInProgress ? `
      <div class="fact-check-overlay" style="
        position: absolute;
        inset: 0;
        border-radius: 12px;
        background: rgba(8, 8, 8, 0.88);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        z-index: 20;
        pointer-events: all;
        backdrop-filter: blur(6px);
        text-align: center;
        padding: 22px;
      ">
        <div class="unified-spinner unified-spinner--large"></div>
        <div style="font-size: 13px; font-weight: 600; color: ${text};">사실 검증 중</div>
        <div style="font-size: 12px; color: ${this.hexToRgba(text, 0.85)}; line-height: 1.4;">
          ${this.escapeHtml(factCheckProgressText)}
        </div>
      </div>
    ` : '';

    return `
      <div class="${blockClasses.join(' ')}" data-id="${id}" data-block-key="${blockKeyAttr}" style="
        border-radius: 12px;
        background: ${this.blendColors(surface, base, 0.22)};
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
        ">
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
            flex-wrap: wrap;
          ">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              ${block.isComparison ? `
              <div style="
                background: ${primaryButtonHover};
                color: ${text};
                padding: 4px 8px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                display: inline-flex;
                border: 1px solid ${primaryButtonBorder};
              ">비교분석</div>
              ` : ''}
              ${analyzedAgo ? `
              <div style="
                background: rgba(15, 23, 42, 0.45);
                color: ${this.hexToRgba(text, 0.85)};
                padding: 4px 10px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 600;
                border: 1px solid ${this.hexToRgba(border, 0.6)};
              ">${analyzedAgo} 분석</div>
              ` : ''}
            </div>
            <div style="
              margin-left: auto;
              background: ${modeMeta.background};
              border: 1px solid ${modeMeta.border};
              color: ${modeMeta.color};
              padding: 4px 10px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: 700;
              display: inline-flex;
              align-items: center;
              gap: 4px;
              white-space: nowrap;
            " title="${modeMeta.label}">
              <span>${modeMeta.icon}</span>
              <span>${modeMeta.label}</span>
            </div>
          </div>
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
          <div class="news-url-text" style="
            color: ${urlTextColor};
            font-size: 12px;
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            width: 100%;
            letter-spacing: 0.01em;
            text-shadow: 0 0 8px rgba(0, 0, 0, 0.35);
            transition: color 0.2s ease;
          " onmouseover="this.style.color='${urlHoverColor}'" onmouseout="this.style.color='${urlTextColor}'">${this.escapeHtml(url)}</div>
        </div>

        <div class="news-actions-area" style="
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
        ${isAnalyzing ? `
        <div class="analysis-overlay" style="
          position: absolute;
          inset: 0;
          border-radius: 12px;
          background: linear-gradient(145deg, rgba(12, 10, 8, 0.95), rgba(38, 28, 22, 0.9));
          display: flex;
          align-items: stretch;
          justify-content: center;
          z-index: 20;
          pointer-events: all;
          backdrop-filter: blur(6px);
          border: 1px solid ${this.hexToRgba(accent, 0.55)};
          box-shadow: 0 24px 46px rgba(0, 0, 0, 0.55);
          overflow: hidden;
        ">
          <div class="analysis-overlay-content" style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding: 24px 20px;
            width: 100%;
          ">
            <div class="unified-spinner unified-spinner--large"></div>
            <div style="font-size: 14px; font-weight: 600; color: ${text}; margin-top: 12px;">분석 중</div>
            <div style="width: 100%; max-width: 320px; margin-top: 16px; display: flex; justify-content: center; overflow: hidden; flex-shrink: 0;">
              <div id="typing-stream-${id}" class="streaming-snippet-container"></div>
            </div>
            <div id="progress-status-${id}" style="font-size: 11px; color: ${this.hexToRgba(text, 0.8)}; margin-top: 12px; text-align: center; line-height: 1.6; max-width: 280px;">
              ${this.escapeHtml(progress || '분석 시작 중...')}
            </div>
          </div>
        </div>
        ` : ''}
          <div class="analysis-height-expander" aria-hidden="true"></div>
        ${factCheckOverlay}
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

  buildAnalysisDetailSections(block) {
    const result = block.result || {};
    const initialVerdict = result.진위 || '분석 결과 없음';
    const summary = result.요약 || 'N/A';
    const normalizedVerificationQueries = this.normalizeVerificationQueries(result.verification_queries);
    const { base, surface, surfaceAlt, accent, text, textMuted, border } = this.palette;
    const hasFinalAnalysis = Boolean(block.factCheckResult && block.factCheckResult.finalAnalysis);
    const finalVerdict = hasFinalAnalysis && block.factCheckResult.finalAnalysis.final_verdict
      ? block.factCheckResult.finalAnalysis.final_verdict
      : initialVerdict;
    const verdictColors = this.getVerdictColors(finalVerdict || '분석 결과 없음');
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

    const cardBackground = this.hexToRgba(surface, 0.22);
    const mutedTextColor = this.hexToRgba(text, 0.68);
    const verdictBackground = this.hexToRgba(verdictColors.base, 0.18);
    const verdictBorder = this.hexToRgba(verdictColors.base, 0.45);
    const summaryBackground = `linear-gradient(135deg, ${this.hexToRgba(accent, 0.18)} 0%, ${this.hexToRgba(surfaceAlt, 0.15)} 100%)`;
    const safeTitle = this.escapeHtml(block.title || '제목 없음');

    const finalAnalysisSection = (block.factCheckResult && block.factCheckResult.finalAnalysis) ? `
          <section>
            <h3 style="
              font-size: 16px;
              font-weight: 700;
              margin: 0 0 14px 0;
              color: ${text};
              display: flex;
              align-items: center;
              gap: 10px;
              padding-bottom: 12px;
              border-bottom: 2px solid ${this.hexToRgba(accent, 0.3)};
            ">
              <span style="font-size: 20px;">🎯</span>
              최종 통합 분석
            </h3>
            <div style="
              background: ${cardBackground};
              border: 1px solid ${border};
              border-radius: 10px;
              padding: 18px;
              margin-bottom: 16px;
            ">
              <div style="
                font-weight: 600;
                color: ${this.hexToRgba(text, 0.9)};
                margin-bottom: 10px;
                font-size: 14px;
              ">📝 최종 요약</div>
              <div style="
                line-height: 1.7;
                font-size: 14px;
                color: ${text};
              ">${block.factCheckResult.finalAnalysis.summary}</div>
            </div>
            ${block.factCheckResult.finalAnalysis.reasoning.reassessment_of_initial_analysis ? `
            <div style="
              background: ${this.hexToRgba('#3B82F6', 0.08)};
              border: 1px solid ${this.hexToRgba('#3B82F6', 0.3)};
              border-radius: 10px;
              padding: 16px;
              margin-bottom: 12px;
            ">
              <div style="
                font-weight: 600;
                color: #3B82F6;
                margin-bottom: 10px;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 6px;
              ">
                <span>🔄</span> 초기 분석 데이터 재검토
              </div>
              <div style="
                line-height: 1.7;
                font-size: 13px;
                color: ${text};
              ">${block.factCheckResult.finalAnalysis.reasoning.reassessment_of_initial_analysis}</div>
            </div>
            ` : ''}
            ${block.factCheckResult.finalAnalysis.reasoning.confirmations_from_external_data ? `
            <div style="
              background: ${this.hexToRgba('#10B981', 0.08)};
              border: 1px solid ${this.hexToRgba('#10B981', 0.3)};
              border-radius: 10px;
              padding: 16px;
              margin-bottom: 12px;
            ">
              <div style="
                font-weight: 600;
                color: #10B981;
                margin-bottom: 10px;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 6px;
              ">
                <span>✅</span> 외부 데이터 확증
              </div>
              <div style="
                line-height: 1.7;
                font-size: 13px;
                color: ${text};
              ">${block.factCheckResult.finalAnalysis.reasoning.confirmations_from_external_data}</div>
            </div>
            ` : ''}
            ${block.factCheckResult.finalAnalysis.reasoning.discrepancies_or_contradictions && block.factCheckResult.finalAnalysis.reasoning.discrepancies_or_contradictions !== '' ? `
            <div style="
              background: ${this.hexToRgba('#EF4444', 0.08)};
              border: 1px solid ${this.hexToRgba('#EF4444', 0.3)};
              border-radius: 10px;
              padding: 16px;
              margin-bottom: 12px;
            ">
              <div style="
                font-weight: 600;
                color: #EF4444;
                margin-bottom: 10px;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 6px;
              ">
                <span>⚠️</span> 불일치 또는 모순
              </div>
              <div style="
                line-height: 1.7;
                font-size: 13px;
                color: ${text};
              ">${block.factCheckResult.finalAnalysis.reasoning.discrepancies_or_contradictions}</div>
            </div>
            ` : ''}
            ${block.factCheckResult.finalAnalysis.reasoning.unverified_claims && block.factCheckResult.finalAnalysis.reasoning.unverified_claims !== '' ? `
            <div style="
              background: ${this.hexToRgba('#F59E0B', 0.08)};
              border: 1px solid ${this.hexToRgba('#F59E0B', 0.3)};
              border-radius: 10px;
              padding: 16px;
              margin-bottom: 12px;
            ">
              <div style="
                font-weight: 600;
                color: #F59E0B;
                margin-bottom: 10px;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 6px;
              ">
                <span>❓</span> 검증 불가 주장
              </div>
              <div style="
                line-height: 1.7;
                font-size: 13px;
                color: ${text};
              ">${block.factCheckResult.finalAnalysis.reasoning.unverified_claims}</div>
            </div>
            ` : ''}
          </section>
    ` : '';

    const previousResult = block.factCheckResult?.previousResult || block.firstAnalysis || null;
    const previousResultAvailable = Boolean(previousResult && (previousResult.진위 || previousResult.요약));

    const previousResultSection = previousResultAvailable ? `
          <section class="previous-result-section">
            <button type="button" class="previous-result-toggle" style="
              width: 100%;
              background: transparent;
              border: none;
              padding: 0;
              margin: 0 0 12px 0;
              cursor: pointer;
            ">
              <div style="
                font-size: 15px;
                font-weight: 600;
                color: ${text};
                display: flex;
                align-items: center;
                gap: 8px;
                border-radius: 8px;
                padding: 10px 12px;
                border: 1px solid ${this.hexToRgba(border, 0.6)};
                background: ${this.hexToRgba(surfaceAlt, 0.12)};
                transition: background 0.2s ease, border-color 0.2s ease;
              ">
                <span>⏮️ 이전 결과 확인</span>
                <span class="previous-result-arrow" style="margin-left: auto; font-size: 12px; color: ${mutedTextColor};">▼</span>
              </div>
            </button>
            <div class="previous-result-body" style="display: none;">
              ${previousResult?.진위 ? `
              <div style="
                color: ${verdictColors.text};
                background: ${this.hexToRgba(verdictColors.base, 0.12)};
                border: 1px solid ${this.hexToRgba(verdictColors.base, 0.35)};
                padding: 14px;
                border-radius: 10px;
                font-weight: 600;
                font-size: 14px;
                text-align: center;
                margin-bottom: 12px;
              ">이전 진위 판단: ${this.escapeHtml(previousResult.진위)}</div>
              ` : ''}
              ${previousResult?.요약 ? `
              <div style="
                background: ${summaryBackground};
                border: 1px solid ${this.hexToRgba(accent, 0.35)};
                border-radius: 10px;
                padding: 16px;
                margin-bottom: 14px;
                color: ${text};
                line-height: 1.6;
              ">
                <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px; color: ${this.hexToRgba(text, 0.85)};">📝 이전 요약</div>
                ${this.renderMarkdown(previousResult.요약)}
              </div>
              ` : ''}
              ${previousResult?.근거 ? `
              <div style="
                background: ${this.hexToRgba(surfaceAlt, 0.12)};
                border: 1px solid ${this.hexToRgba(border, 0.4)};
                border-radius: 10px;
                padding: 16px;
                margin-bottom: 14px;
                color: ${text};
                line-height: 1.6;
              ">
                <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px; color: ${this.hexToRgba(text, 0.85)};">📋 이전 근거</div>
                ${this.renderMarkdown(previousResult.근거)}
              </div>
              ` : ''}
              ${previousResult?.분석 ? `
              <div style="
                background: ${this.hexToRgba(surfaceAlt, 0.12)};
                border: 1px solid ${this.hexToRgba(border, 0.4)};
                border-radius: 10px;
                padding: 16px;
                margin-bottom: 14px;
                color: ${text};
                line-height: 1.6;
              ">
                <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px; color: ${this.hexToRgba(text, 0.85)};">🔍 이전 분석</div>
                ${this.renderMarkdown(previousResult.분석)}
              </div>
              ` : ''}
            </div>
          </section>
    ` : '';

    const sectionsHtml = `
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
              ${hasFinalAnalysis ? `
              <span style="
                background: linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(79, 70, 229, 0.25));
                color: rgba(79, 70, 229, 1);
                border: 1px solid rgba(99, 102, 241, 0.5);
                padding: 4px 10px;
                border-radius: 8px;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.3px;
              ">⚡ 최종 통합 분석</span>
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
            ">${finalVerdict}</div>
            ${hasFinalAnalysis && finalVerdict !== initialVerdict ? `
            <div style="
              margin-top: 12px;
              background: rgba(99, 102, 241, 0.1);
              border: 1px solid rgba(99, 102, 241, 0.3);
              border-radius: 10px;
              padding: 14px;
              font-size: 13px;
              color: ${text};
            ">
              <div style="font-weight: 600; color: rgba(99, 102, 241, 1); margin-bottom: 6px;">최종 분석으로 판단 업데이트</div>
              <div style="color: ${mutedTextColor};">초기 판단: <strong>${initialVerdict}</strong> → 최종 판단: <strong>${finalVerdict}</strong></div>
            </div>
            ` : ''}
            ${!hasFinalAnalysis && block.crossVerified && block.firstAnalysis && block.firstAnalysis.진위 !== finalVerdict ? `
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
              <div style="color: ${mutedTextColor};">1차 판단: <strong>${block.firstAnalysis.진위}</strong> → 2차 재검토: <strong>${finalVerdict}</strong></div>
            </div>
            ` : ''}
          </section>

          <section>
            <h3 style="
              font-size: 13px;
              font-weight: 600;
              margin: 0 0 12px 0;
              color: ${mutedTextColor};
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
            ">내용 요약</h3>
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

          ${!hasFinalAnalysis && result.근거 ? `
          <section>
            <h3 style="
              font-size: 15px;
              font-weight: 600;
              margin: 0 0 12px 0;
              color: ${text};
            ">📌 근거</h3>
            <div style="
              background: ${this.hexToRgba(surfaceAlt, 0.18)};
              border: 1px solid ${this.hexToRgba(border, 0.7)};
              border-radius: 10px;
              padding: 18px;
              line-height: 1.6;
              font-size: 14px;
              color: ${text};
            ">${this.renderMarkdown(result.근거)}</div>
          </section>
          ` : ''}

          ${!hasFinalAnalysis && result.분석 ? `
          <section>
            <h3 style="
              font-size: 15px;
              font-weight: 600;
              margin: 0 0 12px 0;
              color: ${text};
            ">🧠 분석</h3>
            <div style="
              background: ${this.hexToRgba(surface, 0.26)};
              border: 1px solid ${this.hexToRgba(border, 0.65)};
              border-radius: 10px;
              padding: 18px;
              line-height: 1.65;
              font-size: 14px;
              color: ${text};
            ">${this.renderMarkdown(result.분석)}</div>
          </section>
          ` : ''}

          ${finalAnalysisSection}

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

          ${(normalizedVerificationQueries || result.검색어) ? `
          <section>
            <h3 style="
              font-size: 15px;
              font-weight: 600;
              margin: 0 0 12px 0;
              color: ${text};
            ">🔍 검증 검색어</h3>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${normalizedVerificationQueries?.news ? `
              <div style="
                background: ${this.hexToRgba('#2563EB', 0.08)};
                border: 1px solid ${this.hexToRgba('#2563EB', 0.35)};
                border-radius: 10px;
                padding: 14px;
              ">
                <div style="
                  font-size: 12px;
                  font-weight: 700;
                  letter-spacing: 0.04em;
                  color: #1D4ED8;
                  text-transform: uppercase;
                  margin-bottom: 4px;
                ">뉴스 검색어</div>
                <div style="font-size: 14px; color: ${text}; font-weight: 500;">
                  ${this.escapeHtml(normalizedVerificationQueries.news)}
                </div>
                <div style="font-size: 12px; color: ${this.hexToRgba(text, 0.65)}; margin-top: 6px;">
                  Daum 뉴스 전용 검색 엔진
                </div>
              </div>
              ` : ''}
              ${normalizedVerificationQueries?.all ? `
              <div style="
                background: ${this.hexToRgba('#7C3AED', 0.08)};
                border: 1px solid ${this.hexToRgba('#7C3AED', 0.35)};
                border-radius: 10px;
                padding: 14px;
              ">
                <div style="
                  font-size: 12px;
                  font-weight: 700;
                  letter-spacing: 0.04em;
                  color: #5B21B6;
                  text-transform: uppercase;
                  margin-bottom: 4px;
                ">통합 검색어</div>
                <div style="font-size: 14px; color: ${text}; font-weight: 500;">
                  ${this.escapeHtml(normalizedVerificationQueries.all)}
                </div>
                <div style="font-size: 12px; color: ${this.hexToRgba(text, 0.65)}; margin-top: 6px;">
                  전체 웹(공식 문서·보도자료) 탐색용
                </div>
              </div>
              ` : ''}
              ${result.검색어 ? `
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
                <div>
                  <div style="font-size: 12px; color: ${this.hexToRgba(text, 0.65)}; font-weight: 600;">AI 추천 검색어</div>
                  <div>${this.escapeHtml(result.검색어)}</div>
                </div>
              </div>
              ` : ''}
            </div>
          </section>
          ` : ''}

          ${previousResultSection}

          ${(block.factCheckResult && block.factCheckResult.articles) ? `
          <div style="
            text-align: center; 
            margin-top: 8px;
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
          ">
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
            ">📰 비교 검증된 링크 보기 (${block.factCheckResult.articles.length})</button>
          </div>
          ` : ''}
    `;

    return {
      sectionsHtml,
      safeTitle
    };
  }

  attachAnalysisDetailContentEvents(container, block) {
    const comparisonButton = container.querySelector('.view-compared-articles');
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

    const previousToggle = container.querySelector('.previous-result-toggle');
    if (previousToggle) {
      const previousBody = container.querySelector('.previous-result-body');
      const previousArrow = container.querySelector('.previous-result-arrow');
      previousToggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!previousBody) return;
        const isOpen = previousBody.style.display !== 'none';
        previousBody.style.display = isOpen ? 'none' : 'block';
        if (previousArrow) {
          previousArrow.textContent = isOpen ? '▼' : '▲';
        }
      });
    }

    const sourceRefs = container.querySelectorAll('.source-ref');
    if (sourceRefs.length > 0 && block.factCheckResult && block.factCheckResult.articles) {
      const { surface, border, text, accent } = this.palette;
      sourceRefs.forEach(ref => {
        const index = parseInt(ref.dataset.index);
        const article = block.factCheckResult.articles[index];
        if (!article) return;

        const createTooltip = () => {
          const existingTooltip = document.querySelector('.source-tooltip');
          if (existingTooltip) existingTooltip.remove();

          const tooltip = document.createElement('div');
          tooltip.className = 'source-tooltip';
          tooltip.style.cssText = `
            position: fixed;
            background: ${this.hexToRgba(surface, 0.98)};
            border: 1px solid ${border};
            border-radius: 10px;
            padding: 12px;
            max-width: 320px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
            z-index: 99999;
            pointer-events: none;
            backdrop-filter: blur(12px);
          `;

          const imageUrl = article.pagemap?.cse_thumbnail?.[0]?.src || article.pagemap?.cse_image?.[0]?.src || '';
          const title = this.escapeHtml(article.title || '제목 없음');
          const snippet = this.escapeHtml(article.snippet || '내용 없음');
          const displayLink = this.escapeHtml(article.displayLink || '');

          tooltip.innerHTML = `
            ${imageUrl ? `
            <img src="${this.escapeHtml(imageUrl)}" style="
              width: 100%;
              height: 120px;
              object-fit: cover;
              border-radius: 6px;
              margin-bottom: 10px;
            " />
            ` : ''}
            <div style="
              font-weight: 600;
              color: ${text};
              font-size: 13px;
              margin-bottom: 6px;
              line-height: 1.4;
            ">${title}</div>
            <div style="
              font-size: 11px;
              color: ${this.hexToRgba(text, 0.6)};
              margin-bottom: 6px;
            ">${displayLink}</div>
            <div style="
              font-size: 12px;
              color: ${this.hexToRgba(text, 0.8)};
              line-height: 1.5;
            ">${snippet.substring(0, 120)}${snippet.length > 120 ? '...' : ''}</div>
            <div style="
              font-size: 10px;
              color: ${this.hexToRgba(accent, 0.9)};
              margin-top: 8px;
              text-align: center;
            ">클릭하여 기사 보기</div>
          `;

          document.body.appendChild(tooltip);
          return tooltip;
        };

        ref.addEventListener('mouseenter', () => {
          const tooltip = createTooltip();
          const rect = ref.getBoundingClientRect();
          let top = rect.bottom + 8;
          let left = rect.left;
          setTimeout(() => {
            const tooltipRect = tooltip.getBoundingClientRect();
            if (top + tooltipRect.height > window.innerHeight) {
              top = rect.top - tooltipRect.height - 8;
            }
            if (left + tooltipRect.width > window.innerWidth) {
              left = window.innerWidth - tooltipRect.width - 8;
            }
            tooltip.style.top = top + 'px';
            tooltip.style.left = left + 'px';
          }, 0);
        });

        ref.addEventListener('mouseleave', () => {
          const tooltip = document.querySelector('.source-tooltip');
          if (tooltip) tooltip.remove();
        });

        ref.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (article.link) window.open(article.link, '_blank');
        });
      });
    }
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

  // 출처 번호 [1], [2]를 인터랙티브 링크로 변환
  renderSourceNumbers(text, articles) {
    if (!text || !articles || articles.length === 0) return this.escapeHtml(text);
    
    let html = this.escapeHtml(text);
    
    // [1], [2], [3], [4] 형식의 출처 번호 찾기
    html = html.replace(/\[(\d+)\]/g, (match, num) => {
      const index = parseInt(num) - 1;
      if (index < 0 || index >= articles.length) return match;
      
      const article = articles[index];
      const title = this.escapeHtml(article.title || '제목 없음');
      const snippet = this.escapeHtml(article.snippet || '내용 없음');
      const displayLink = this.escapeHtml(article.displayLink || '');
      const imageUrl = article.pagemap?.cse_thumbnail?.[0]?.src || article.pagemap?.cse_image?.[0]?.src || '';
      const link = article.link || '#';
      
      return `<span class="source-ref" data-index="${index}" data-url="${this.escapeHtml(link)}" style="
        display: inline-block;
        background: linear-gradient(135deg, rgba(191, 151, 128, 0.2), rgba(140, 110, 84, 0.2));
        color: #BF9780;
        border: 1px solid rgba(191, 151, 128, 0.4);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
      " onmouseover="this.style.background='linear-gradient(135deg, rgba(191, 151, 128, 0.35), rgba(140, 110, 84, 0.35))'; this.style.transform='translateY(-1px)'" onmouseout="this.style.background='linear-gradient(135deg, rgba(191, 151, 128, 0.2), rgba(140, 110, 84, 0.2))'; this.style.transform='translateY(0)'">[${num}]</span>`;
    });
    
    return html;
  }

  // 블록 내부 타이핑 영역 업데이트
  updateBlockTypingArea(blockId, newText) {
    const container = document.getElementById(`typing-stream-${blockId}`);
    if (!container) return;
    const normalizedText = (newText || '').trim();
    if (!normalizedText) return;

    const compact = normalizedText.replace(/\s+/g, ' ').trim();
    if (!compact) return;

    const MAX_LEN = 6;
    const snippetText = compact.length > MAX_LEN
      ? `${compact.slice(0, MAX_LEN)}...`
      : compact;

    const snippet = document.createElement('div');
    snippet.className = 'streaming-snippet';
    snippet.textContent = snippetText;
    container.appendChild(snippet);
    snippet.addEventListener('animationend', () => {
      snippet.remove();
    });
  }

  // 현재 뉴스 설정 (병렬 분석 지원)
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
    console.log('[setCurrentNews] 설정된 뉴스 URL:', normalizedUrl);
    
    // 현재 활성 URL 변경 (기존 분석은 중단하지 않음)
    this.activeNewsUrl = normalizedUrl;
    
    // 이미 이 URL의 상태가 있는지 확인
    if (!this.activeNewsStates.has(normalizedUrl)) {
      // 분석 기록에서 동일한 URL의 뉴스 찾기
      const existingBlock = Array.from(this.newsBlocks.values()).find(block => 
        normalizeUrl(block.url) === normalizedUrl
      );
      
      if (existingBlock && existingBlock.status === 'completed') {
        // 완료된 분석이 있으면 그 결과를 표시
        this.activeNewsStates.set(normalizedUrl, {
          id: 'current-' + normalizedUrl,
          title,
          url,
          content,
          status: existingBlock.status,
          result: existingBlock.result,
          progress: existingBlock.progress,
          error: existingBlock.error,
          timestamp: Date.now()
        });
        console.log('[setCurrentNews] 기존 완료된 분석 결과 발견');
      } else {
        // 새로운 뉴스 또는 미완료 분석
        this.activeNewsStates.set(normalizedUrl, {
          id: 'current-' + normalizedUrl,
          title,
          url,
          content,
          status: 'pending',
          result: null,
          progress: null,
          error: null,
          timestamp: Date.now()
        });
        console.log('[setCurrentNews] 새 뉴스 상태 생성');
      }
    } else {
      console.log('[setCurrentNews] 기존 활성 상태 유지 (분석 진행 중)');
    }
    
    this.updatePanel();
    return 'current-' + normalizedUrl;
  }

  // 저장된 기록과 현재 뉴스 상태 동기화 (병렬 분석 지원)
  syncCurrentNewsWithHistory() {
    if (!this.activeNewsUrl || !this.activeNewsStates.has(this.activeNewsUrl) || this.newsBlocks.size === 0) {
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

    const currentNews = this.activeNewsStates.get(this.activeNewsUrl);
    const currentUrl = normalizeUrl(currentNews.url);
    const matchingBlock = Array.from(this.newsBlocks.values()).find((block) => {
      return normalizeUrl(block.url) === currentUrl;
    });

    if (!matchingBlock) {
      return;
    }

    // activeNewsStates 업데이트
    this.activeNewsStates.set(this.activeNewsUrl, {
      ...currentNews,
      status: matchingBlock.status,
      result: matchingBlock.result,
      progress: matchingBlock.progress,
      error: matchingBlock.error
    });

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

  // 뉴스 블록 상태 업데이트 (병렬 분석 지원)
  updateNewsStatus(id, status, result = null, progress = null, error = null) {
    console.log('updateNewsStatus 호출됨:', { id, status, result, progress, error });
    
    const isCurrentBlock = this.isCurrentBlockId(id);
    const numericId = !isCurrentBlock
      ? (typeof id === 'number' ? id : parseInt(id, 10))
      : null;
    let block;
    if (isCurrentBlock) {
      // 레거시 지원 - activeNewsUrl로 변환
      if (this.activeNewsUrl && this.activeNewsStates.has(this.activeNewsUrl)) {
        block = this.activeNewsStates.get(this.activeNewsUrl);
      } else {
        console.error('현재 활성 뉴스가 없습니다');
        return;
      }
    } else {
      if (numericId === null || Number.isNaN(numericId)) {
        console.warn('[updateNewsStatus] 잘못된 블록 ID 형식:', id);
        return;
      }
      block = this.newsBlocks.get(numericId);
      
      // 블록을 찾을 수 없는 경우 (확장 재시작 등)
      if (!block) {
        console.warn('[updateNewsStatus] 블록을 찾을 수 없음, ID:', id, '- 오래된 분석 결과로 무시됨');
        return;
      }
    }
    
    const oldStatus = block.status;
    block.status = status;
    if (progress) block.progress = progress;
    if (result !== null && result !== undefined) block.result = result;
    if (error) block.error = error;
    
    // 진행 상태 텍스트 실시간 업데이트
    if (status === 'analyzing' && progress) {
      const progressElement = document.getElementById(`progress-status-${id}`);
      if (progressElement) {
        progressElement.textContent = progress;
      }
    }
    
    // 이 블록의 URL과 같은 activeNewsStates가 있으면 업데이트
    if (!isCurrentBlock && block.url) {
      const normalizeUrl = (urlString) => {
        try {
          const urlObj = new URL(urlString);
          return urlObj.origin + urlObj.pathname;
        } catch {
          return urlString;
        }
      };
      
      const blockUrl = normalizeUrl(block.url);
      
      // 모든 activeNewsStates를 순회하며 같은 URL의 상태 업데이트
      for (const [stateUrl, state] of this.activeNewsStates.entries()) {
        if (normalizeUrl(state.url) === blockUrl) {
          state.status = status;
          if (progress) state.progress = progress;
          if (result !== null && result !== undefined) state.result = result;
          if (error) state.error = error;
        }
      }
    }
    
    // 분석 완료 시 진위 결과 저장
    if (status === 'completed' && result && !isCurrentBlock) {
      console.log('[updateNewsStatus] completeAnalysis 호출 전, id:', numericId, 'result 타입:', typeof result);
      this.completeAnalysis(numericId, result);
      
      // 분석 완료 시 currentAnalyzingBlockId 초기화
      if (numericId !== null && this.currentAnalyzingBlockId === numericId) {
        this.currentAnalyzingBlockId = null;
        console.log('[updateNewsStatus] 분석 완료, 다음 분석 가능');
      }
    }
    
    // 에러 발생 시에도 currentAnalyzingBlockId 초기화
    if (status === 'error' && numericId !== null && this.currentAnalyzingBlockId === numericId) {
      this.currentAnalyzingBlockId = null;
      console.log('[updateNewsStatus] 분석 에러, 다음 분석 가능');
    }
    
    // 저장 최적화: analyzing 상태에서는 저장하지 않음 (스트리밍 중)
    // 상태 변경이나 완료/에러 시에만 저장
    if (!isCurrentBlock && (status !== 'analyzing' || oldStatus !== 'analyzing')) {
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
      const previousStates = this.captureNewsBlockStates(panel);
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
        
        // 간단 보기 현재 섹션 업데이트
        const collapsedCurrentContainer = panel.querySelector('#collapsed-current-container');
        if (collapsedCurrentContainer) {
          collapsedCurrentContainer.innerHTML = this.renderCollapsedCurrentSection();
          // 분석 버튼 이벤트 재연결
          const analyzeBtn = collapsedCurrentContainer.querySelector('#collapsed-current-analyze-btn');
          if (analyzeBtn && this.currentNews && this.currentNews.status === 'pending') {
            analyzeBtn.addEventListener('click', () => {
              this.searchFactCheck(this.currentNews.id);
            });
          }
        }
      }
      
      // 이벤트 다시 연결
      this.attachBlockEvents(panel);
      this.updateCollapsedSummary(panel);
      this.attachCollapsedSummaryEvents(panel);
      this.syncAnalysisHeight(panel);
      this.applyNewsBlockTransitions(panel, previousStates);

      if (this.isHistoryCollapsed) {
        this.togglePanelCollapse(true);
      }
    }
  }

  syncAnalysisHeight(panel) {
    if (!panel) return;

    panel.querySelectorAll('.news-block').forEach(block => {
      const expander = block.querySelector('.analysis-height-expander');
      if (!expander) return;

      if (!block.classList.contains('news-block--analyzing')) {
        block.style.removeProperty('--analysis-expanded-height');
        return;
      }

      const overlay = block.querySelector('.analysis-overlay');
      if (!overlay) {
        block.style.removeProperty('--analysis-expanded-height');
        return;
      }

      const overlayContent = overlay.querySelector('.analysis-overlay-content');
      const targetElement = overlayContent || overlay;
      const measuredHeight = Math.ceil(targetElement.scrollHeight || 0);
      if (measuredHeight > 0) {
        block.style.setProperty('--analysis-expanded-height', `${measuredHeight}px`);
      } else {
        block.style.removeProperty('--analysis-expanded-height');
      }
    });
  }

  captureNewsBlockStates(panel) {
    const states = new Map();
    if (!panel) return states;

    panel.querySelectorAll('.news-block').forEach(block => {
      const id = block.dataset.id;
      if (!id) return;
      states.set(id, {
        height: block.getBoundingClientRect().height,
        isAnalyzing: block.classList.contains('news-block--analyzing')
      });
    });

    return states;
  }

  applyNewsBlockTransitions(panel, previousStates) {
    if (!panel || !previousStates || previousStates.size === 0) return;

    panel.querySelectorAll('.news-block').forEach(block => {
      const id = block.dataset.id;
      if (!id || !previousStates.has(id)) return;

      const prevState = previousStates.get(id);
      const isAnalyzing = block.classList.contains('news-block--analyzing');
      if (prevState.isAnalyzing === isAnalyzing) return;

      const startHeight = prevState.height;
      const endHeight = block.getBoundingClientRect().height;
      if (!startHeight || !endHeight || startHeight === endHeight) return;

      block.style.height = `${startHeight}px`;
      block.style.overflow = 'hidden';

      requestAnimationFrame(() => {
        block.style.height = `${endHeight}px`;
      });

      const handleTransitionEnd = (event) => {
        if (event.propertyName !== 'height') return;
        block.style.height = '';
        block.style.overflow = '';
        block.removeEventListener('transitionend', handleTransitionEnd);
      };

      block.addEventListener('transitionend', handleTransitionEnd);
    });
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
    if (this.streamingDiffCache.has(blockId)) {
      this.streamingDiffCache.delete(blockId);
    }
    
    // service_worker에 중단 요청 전송
    const runtimeId = isCurrentBlock && numericId !== null ? numericId : blockId;
    chrome.runtime.sendMessage({
      action: "stopAnalysis",
      blockId: runtimeId
    }).catch(error => {
      console.error('[stopAnalysis] service_worker 메시지 전송 오류:', error);
    });
    
    // 블록 상태를 pending으로 변경
    const isCurrentBlock = this.isCurrentBlockId(blockId);
    const numericId = !isCurrentBlock ? blockId : this.getCurrentLinkedBlockId();
    let block = isCurrentBlock ? this.currentNews : (numericId !== null ? this.newsBlocks.get(numericId) : null);
    if (block) {
      block.status = 'pending';
      block.progress = null;
      block.error = '사용자가 분석을 중단했습니다';
      
      // 저장 및 패널 업데이트
      if (!isCurrentBlock) {
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

    const historyToggle = panel.querySelector('#collapsed-history-toggle');
    if (historyToggle && !historyToggle.dataset.listenerAttached) {
      historyToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.collapsedHistoryExpanded = !this.collapsedHistoryExpanded;
        this.updateCollapsedSummary(panel);
      });
      historyToggle.dataset.listenerAttached = 'true';
    }

    // 현재 페이지 완료된 블록 클릭 (상세 보기)
    const currentClickable = panel.querySelector('#collapsed-current-clickable');
    if (currentClickable && !currentClickable.dataset.listenerAttached) {
      if (currentClickable.dataset.clickable === 'true') {
        currentClickable.addEventListener('click', (e) => {
          // 분석하기 버튼 클릭은 제외
          if (e.target.closest('#collapsed-current-analyze-btn')) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          console.log('[Collapsed] Current news clicked - showing details');
          this.showAnalysisResult('current');
        });
        currentClickable.style.cursor = 'pointer';
      }
      currentClickable.dataset.listenerAttached = 'true';
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
    
    // 분석 정지 버튼
    container.querySelectorAll('.stop-analysis-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const resolvedId = this.resolveBlockKeyFromElement(btn);
        if (resolvedId === null || resolvedId === 'current') {
          console.warn('분석 정지 대상 ID를 확인할 수 없습니다.');
          return;
        }
        console.log('분석 정지 버튼 클릭, ID:', resolvedId);
        this.stopAnalysis(resolvedId);
      });
    });
    
    // 삭제 버튼
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const resolvedId = this.resolveBlockKeyFromElement(btn);
        if (resolvedId === null || resolvedId === 'current') {
          console.warn('삭제할 블록을 찾을 수 없습니다.');
          return;
        }
        console.log('삭제 버튼 클릭, ID:', resolvedId);
        
        this.deleteNews(resolvedId);
      });
    });

    // 유사 기사 찾기 버튼
    container.querySelectorAll('.find-similar-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const resolvedId = this.resolveBlockKeyFromElement(btn);
        if (resolvedId === null || resolvedId === 'current') {
          console.warn('유사 기사 찾기 대상 ID 없음');
          return;
        }
        console.log('유사 기사 찾기 버튼 클릭, ID:', resolvedId);
        this.findSimilarArticles(resolvedId);
      });
    });

    // 사실 검증 버튼
    container.querySelectorAll('.fact-check-search-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const resolvedId = this.resolveBlockKeyFromElement(btn);
        if (resolvedId === null || resolvedId === 'current') {
          console.warn('사실 검증 대상 ID 없음');
          return;
        }
        console.log('사실 검증 버튼 클릭, ID:', resolvedId);
        this.searchFactCheck(resolvedId);
      });
    });

    // 디버그 정보 버튼
    container.querySelectorAll('.debug-result-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const resolvedId = this.resolveBlockKeyFromElement(btn);
        if (resolvedId === null || resolvedId === 'current') {
          console.warn('디버그 정보를 표시할 블록이 없습니다.');
          return;
        }
        console.log('디버그 정보 버튼 클릭, ID:', resolvedId);
        this.showDebugModal(resolvedId);
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
      
      if (this.isCurrentBlockId(id)) {
        newsData = this.currentNews;
      } else {
        const parsedId = parseInt(id, 10);
        newsData = Number.isNaN(parsedId) ? null : this.newsBlocks.get(parsedId);
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

  // 현재 뉴스 분석 (순차 분석)
  analyzeCurrentNews() {
    console.log('[analyzeCurrentNews] 시작');
    
    if (!this.activeNewsUrl || !this.activeNewsStates.has(this.activeNewsUrl)) {
      alert('현재 뉴스가 없습니다.');
      return;
    }
    
    // 이미 분석 중인 뉴스가 있는지 확인
    if (this.currentAnalyzingBlockId !== null) {
      const analyzingBlock = this.newsBlocks.get(this.currentAnalyzingBlockId);
      if (analyzingBlock && analyzingBlock.status === 'analyzing') {
        alert('⚠️ 이미 다른 뉴스를 분석 중입니다.\n\n현재 분석이 완료될 때까지 기다려주세요.');
        return;
      }
    }
    
    // Chrome API 사용 가능 여부 확인
    if (!this.isChromeApiAvailable()) {
      console.error('[analyzeCurrentNews] Chrome API를 사용할 수 없습니다. 확장 프로그램을 다시 로드해주세요.');
      alert('⚠️ 확장 프로그램 연결이 끊어졌습니다.\n\n페이지를 새로고침하거나 확장 프로그램을 다시 로드해주세요.');
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
    const currentNews = this.activeNewsStates.get(this.activeNewsUrl);
    
    // 이미 분석 목록에 있는지 확인
    const normalizeUrl = (urlString) => {
      try {
        const urlObj = new URL(urlString);
        return urlObj.origin + urlObj.pathname;
      } catch {
        return urlString;
      }
    };
    
    const normalizedUrl = normalizeUrl(currentNews.url);
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
    const updatedState = {
      ...currentNews,
      status: 'analyzing',
      progress: '🔍 분석 시작...',
      result: null,
      error: null,
      crossVerified: false,
      crossVerifiedResult: null,
      firstAnalysis: null
    };
    
    this.activeNewsStates.set(this.activeNewsUrl, updatedState);
    
    // UI 즉시 업데이트 (분석 중 상태 표시)
    this.updatePanel();
    
    // 현재 뉴스를 분석 목록에 추가
    console.log('[analyzeCurrentNews] 새 뉴스 추가 중... (analyzing 상태로, result 초기화)');
    const newsData = {
      id: ++this.blockIdCounter,
      title: currentNews.title,
      url: currentNews.url,
      content: currentNews.content,
      status: 'analyzing',
      result: null,
      progress: '🔍 분석 시작...',
      timestamp: Date.now(),
      activeUrl: this.activeNewsUrl  // URL 추적용
    };
    
    this.addNewsBlock(newsData);
    const newId = newsData.id;
    console.log('[analyzeCurrentNews] 추가된 ID:', newId);
    
    // 현재 분석 중인 블록 ID 설정
    this.currentAnalyzingBlockId = newId;
    
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
    const isCurrentBlock = this.isCurrentBlockId(id);
    let block;
    if (isCurrentBlock) {
      block = this.currentNews;
    } else {
      const numericId = typeof id === 'number' ? id : parseInt(id, 10);
      block = Number.isNaN(numericId) ? null : this.newsBlocks.get(numericId);
      id = numericId;
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
    // 자기 피드백 루프 모듈로 위임
    return this.selfFeedbackModule.performRecursiveVerification(id, block, abortController);
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
        this.loadApiKeySnapshot().then((apiKeys) => {
          const settingsModal = this.createSettingsPanel(apiKeys);
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

  getCurrentDateTimeInfo() {
    const now = new Date();
    const baseOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };

    const localResolved = Intl.DateTimeFormat().resolvedOptions();
    const localTimeZone = localResolved.timeZone || 'UTC';

    const formatWith = (locale, timeZone) => new Intl.DateTimeFormat(locale, {
      ...baseOptions,
      timeZone
    }).format(now);

    return {
      iso: now.toISOString(),
      kst: formatWith('ko-KR', 'Asia/Seoul'),
      local: formatWith('ko-KR', localTimeZone),
      utc: formatWith('en-GB', 'UTC'),
      timeZone: localTimeZone
    };
  }

  getDateTimeContext() {
    const dt = this.getCurrentDateTimeInfo();
    return [
      '### ⏱️ 분석 타임스탬프',
      `- 한국 표준시 (KST): ${dt.kst}`,
      `- 브라우저 기준 (${dt.timeZone}): ${dt.local}`,
      `- UTC: ${dt.utc}`,
      `- ISO8601: ${dt.iso}`,
      ''
    ].join('\n');
  }

  // 분석 프롬프트 생성
  generateAnalysisPrompt(title, content, isComparison = false) {
    const articleContent = `${title}\n${content}`;
    const dateTimeContext = this.getDateTimeContext();
    
    if (isComparison) {
      return this.generateComparisonPrompt(articleContent);
    }
    
    return `
${dateTimeContext}

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
※ **기본 판단:** 아래 조건 중 어느 것에도 해당하지 않는 경우, 해당 기사는 **'사실'**로 판단합니다.

---

### **[중요도: 최상] → 최종 판단: 거짓**
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

### **[중요도: 높음] → 최종 판단: 대체로 거짓**
**유형 2. 논리 및 구조적 허점**
- **2-1. 논리적 비약:** 근거는 존재하지만, 논리적 연계성이 약하거나 생략되어 결론에 합리적으로 도달하기 어려운 경우.  
  - 예시: "A가 발생했다. 따라서 Z가 틀림없다." (중간 단계 B, C, D 생략)
  - **판단 기준:** 근거와 결론 사이에 최소 2단계 이상의 논리적 연결고리가 누락된 경우
  
- **2-2. 근거 없는 의혹 제기:** 근거가 전혀 제시되지 않거나 "일부 관계자", "알려졌다", "추정된다" 등 불명확한 출처 표현이 반복되는 경우.
  - **판단 기준:** 전체 기사의 30% 이상이 추측성 표현으로 구성되거나, 핵심 주장에 구체적 근거가 0개인 경우
  - **예외:** 탐사보도 초기 단계에서 의혹 제기 자체가 목적인 경우는 제외

---

### **[중요도: 중간] → 최종 판단: 일부 사실**
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

### **[중요도: 보조] → 최종 판단: 대체로 사실**
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
- 존재하지 않거나 불확실하다면 → **"사실" 또는 "대체로 사실"**로 보수적 분류

### 과도한 판단 방지
- 1-2개의 경미한 문제로 "거짓" 판단하지 않았는가?
- 여러 조건 중 **가장 심각한 것**을 기준으로 최종 판단했는가?

### 문맥 재확인
- 부분적 표현을 전체 문맥과 분리하여 판단하지 않았는가?
- 인용문과 기자의 주장을 혼동하지 않았는가?

**중요:** 이 검증은 허위 근거 생성(hallucination)을 방지하기 위한 필수 단계입니다.  
**불확실하면 보수적으로 판단**하여 "사실" 또는 상위 단계로 분류하십시오.

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
      "진위": "**[5단계 진위 체계 - 정확히 하나만 선택]** '거짓' / '대체로 거짓' / '일부 사실' / '대체로 사실' / '사실' - 이 5가지 표현 외에는 절대 사용 금지. '진짜 뉴스', '가짜 뉴스', '사실입니다', '거짓입니다', '신뢰할 수 있음', '의심스러움', '가능성' 등의 표현 사용 시 분석 실패로 간주됨",
      "근거": "탐지된 중요도 조건을 <br> 태그로 반드시 구분하여 나열. 예: 1-1. 기사 내 명백한 내용상 모순<br>3-2. 감정적 표현 사용<br>4-1. 제목과 내용의 불일치",
      "분석": "다음 구조로 가독성 높게 작성하세요:<br><br>**✨ 기사 개요**<br>기사가 다루는 핵심 내용을 1-2문장으로 간단히 정리<br><br>**📊 주요 분석 결과**<br>위 근거에서 발견된 핵심 문제점 또는 신뢰할 수 있는 요소를 항목별로 명확히 설명<br><br>**⚠️ 검증 한계**<br>(있다면) 현재 검증으로는 확인 불가능한 정보나 추가 확인이 필요한 부분을 간단히 언급<br><br>**⚖️ 종합 판단**<br>위 내용을 바탕으로 최종 신뢰도 평가와 그 이유를 2-3문장으로 명확히 정리<br><br>※ 각 섹션은 <br><br>로 구분하고, 섹션 제목은 이모지+굵은 글씨(**텍스트**)로 표시하세요",
      "요약": "기사의 핵심 내용을 간결하고 정확하게 요약 (50-100자 이내, HTML 태그 사용 금지). 한 문장으로 핵심만 간결하게 작성",
      "키워드": "기사의 핵심 키워드 3-5개를 추출 (쉼표로 구분, HTML 태그 사용 금지). 예: 정치, 한동훈, 국민의힘, 대장동 사건, 여론",
      "검색어": "유사 기사 검색 또는 사실 검증에 적합한 검색어 1개 (20-50자, 고유명사 + 핵심 사건/주제 조합, HTML 태그 사용 금지). 예: 한동훈 대장동 사건 항소 포기",
      "verification_queries": {
        "news": "Daum 뉴스 전용 CSE에 사용할 검색어 (20-45자, 사건 핵심 키워드 + 인물/기관 조합, 따옴표/마침표/해시태그 금지)",
        "all": "전체 웹(정부·기관 보도자료, 공식 문서 등)에서 사실을 직접 확인하기 위한 검색어 (25-60자, 구체적 키워드 + 비교용 조건 포함, 특수문자 금지)"
      }
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
    const dateTimeContext = this.getDateTimeContext();
    
    return `
${dateTimeContext}

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
      "진위": "두 뉴스의 비교분석 결과 ('거짓' / '대체로 거짓' / '일부 사실' / '대체로 사실' / '사실'만 사용. 비교 결과에 따라 5단계 중 하나로 판단하며, '진짜 뉴스', '가짜 뉴스' 등 다른 표현 절대 금지)",
      "근거": "두 뉴스 간의 일치점과 차이점을 나열",
      "분석": "다음 구조로 가독성 높게 작성하세요:<br><br>**✨ 두 기사 개요**<br>각 기사가 다루는 핵심 내용을 1-2문장씩 간단히 정리<br><br>**📊 비교 분석 결과**<br>- 일치하는 부분: 공통적으로 확인되는 사실이나 관점 나열<br>- 차이나는 부분: 서로 다른 정보나 해석의 차이 명확히 설명<br><br>**⚖️ 신뢰도 평가**<br>두 기사를 종합했을 때의 전체적인 신뢰도와 주의사항을 2-3문장으로 정리<br><br>※ 각 섹션은 <br><br>로 구분하고, 섹션 제목은 이모지+굵은 글씨(**텍스트**)로 표시하세요",
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
    // 자기 피드백 루프 모듈로 위임
    return this.selfFeedbackModule.generateCrossVerificationPrompt(
      title, content, baselineAnalysis, previousVerification, currentStep, totalDepth, factCheckData
    );
  }


  // 분석 결과 보기 모달
  showAnalysisResult(id) {
    let block;
    if (this.isCurrentBlockId(id)) {
      block = this.currentNews;
    } else {
      const parsedId = typeof id === 'number' ? id : parseInt(id, 10);
      block = Number.isNaN(parsedId) ? null : this.newsBlocks.get(parsedId);
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

    const { base, surface, surfaceAlt, accent, text, border } = this.palette;
    const overlayBackground = `linear-gradient(180deg, ${this.hexToRgba(base, 0.97)} 0%, ${this.hexToRgba(base, 0.99)} 75%)`;
    const headerBackground = `linear-gradient(135deg, ${this.hexToRgba(surfaceAlt, 0.92)} 0%, ${this.hexToRgba(accent, 0.92)} 100%)`;
    const detailContent = this.buildAnalysisDetailSections(block);

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
            ">${detailContent.safeTitle}</span>
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
          ${detailContent.sectionsHtml}
        </div>
      </div>
    `;

    this.preDetailFocus = document.activeElement;
    panel.appendChild(overlay);
    this.activeDetailOverlay = overlay;

    const backButton = overlay.querySelector('.detail-back-button');
    if (backButton) {
      backButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.closeDetailInPanel();
      });
    }

    const scrollContainer = overlay.querySelector('.detail-scroll');
    if (scrollContainer) {
      const styleId = 'detail-scroll-style';
      let styleTag = document.getElementById(styleId);
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        styleTag.textContent = `
          .detail-scroll::-webkit-scrollbar {
            width: 6px;
          }
          .detail-scroll::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
          }
          .detail-scroll::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.15));
            border-radius: 999px;
            border: 1px solid rgba(0, 0, 0, 0.1);
          }
          .detail-scroll::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.3));
          }
        `;
        document.head.appendChild(styleTag);
      }

      scrollContainer.addEventListener('wheel', (event) => {
        event.stopPropagation();
      }, { passive: false });
    }

    this.attachAnalysisDetailContentEvents(overlay, block);

    this.detailEscapeHandler = (event) => {
      if (event.key === 'Escape') {
        this.closeDetailInPanel();
      }
    };
    document.addEventListener('keydown', this.detailEscapeHandler);

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      overlay.style.transform = 'translateY(0)';
    });
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

  // 에러 모달 표시
  showErrorModal(title, message, details = null) {
    const panel = document.getElementById(this.panelId);
    if (!panel) return;

    // 기존 에러 모달 제거
    const existingModal = panel.querySelector('.error-modal-overlay');
    if (existingModal) {
      existingModal.remove();
    }

    const { text, base, surface } = this.palette;
    
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'error-modal-overlay';
    modalOverlay.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      backdrop-filter: blur(4px);
      animation: fadeIn 0.2s ease;
    `;

    const detailsHtml = details ? `
      <details style="
        margin-top: 16px;
        padding: 12px;
        background: ${this.hexToRgba(base, 0.3)};
        border-radius: 8px;
        font-size: 12px;
        color: ${this.hexToRgba(text, 0.7)};
        cursor: pointer;
      ">
        <summary style="font-weight: 600; margin-bottom: 8px;">상세 정보</summary>
        <pre style="
          white-space: pre-wrap;
          word-break: break-word;
          margin: 0;
          font-family: 'Consolas', monospace;
          font-size: 11px;
        ">${this.escapeHtml(details)}</pre>
      </details>
    ` : '';

    modalOverlay.innerHTML = `
      <div style="
        background: linear-gradient(135deg, ${this.hexToRgba(surface, 0.98)} 0%, ${this.hexToRgba(base, 0.98)} 100%);
        border-radius: 16px;
        padding: 28px;
        max-width: 480px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        border: 1px solid ${this.hexToRgba(text, 0.1)};
        animation: slideUp 0.3s ease;
      ">
        <div style="
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        ">
          <div style="
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            flex-shrink: 0;
          ">⚠️</div>
          <h3 style="
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            color: ${text};
          ">${this.escapeHtml(title)}</h3>
        </div>
        <p style="
          margin: 0 0 20px 0;
          line-height: 1.6;
          color: ${this.hexToRgba(text, 0.85)};
          font-size: 15px;
          white-space: pre-wrap;
        ">${this.escapeHtml(message)}</p>
        ${detailsHtml}
        <button class="error-modal-close" style="
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          margin-top: 20px;
        "
        onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 8px 20px rgba(239, 68, 68, 0.4)';"
        onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';">확인</button>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    panel.appendChild(modalOverlay);

    const closeButton = modalOverlay.querySelector('.error-modal-close');
    closeButton.addEventListener('click', () => {
      modalOverlay.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => modalOverlay.remove(), 200);
    });

    // 모달 외부 클릭시 닫기
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeButton.click();
      }
    });
  }

  // API 에러 처리
  handleApiError(error, context = '') {
    console.error(`[handleApiError] ${context}:`, error);
    
    const errorMessage = error?.message || error?.error || String(error);
    
    // 429 에러 (할당량 초과) 감지
    if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      let retryDelay = '50초';
      
      // retryDelay 추출 시도
      const retryMatch = errorMessage.match(/retry.*?(\d+)s/i);
      if (retryMatch) {
        retryDelay = `${retryMatch[1]}초`;
      }
      
      // Gemini API 할당량 초과인 경우 카운트 초기화
      if (errorMessage.toLowerCase().includes('gemini') || errorMessage.includes('generativelanguage.googleapis.com')) {
        console.log('[handleApiError] Gemini API 할당량 초과 - 카운트 초기화');
        this.resetApiUsageCount('gemini');
        this.updateApiQuotaDisplay();
      }
      
      this.showErrorModal(
        'API 할당량 초과',
        `Gemini API의 일일 무료 할당량(200회)을 모두 사용하셨습니다.\n\n약 ${retryDelay} 후에 다시 시도하거나, 내일 다시 이용해주세요.\n\n또는 새로운 API 키를 발급받아 설정에서 변경할 수 있습니다.`,
        errorMessage.substring(0, 500)
      );
      return 'quota_exceeded';
    }
    
    // 기타 API 에러
    if (errorMessage.includes('API') || errorMessage.includes('401') || errorMessage.includes('403')) {
      this.showErrorModal(
        'API 요청 실패',
        'API 요청 중 오류가 발생했습니다.\n\nAPI 키가 유효한지 확인하거나, 잠시 후 다시 시도해주세요.',
        errorMessage.substring(0, 500)
      );
      return 'api_error';
    }
    
    return 'unknown_error';
  }
  
  // API 사용 횟수 초기화
  resetApiUsageCount(apiType) {
    const today = new Date().toDateString();
    const key = `api_usage_${apiType}_${today}`;
    try {
      localStorage.setItem(key, '0');
      console.log(`[resetApiUsageCount] ${apiType} API 사용 횟수 초기화 완료`);
    } catch (error) {
      console.error('[resetApiUsageCount] 초기화 실패:', error);
    }
  }

  // 실시간 스트리밍 결과 보기 모달
  showStreamingResult(id) {
    let block;
    if (this.isCurrentBlockId(id)) {
      block = this.currentNews;
    } else {
      const parsedId = typeof id === 'number' ? id : parseInt(id, 10);
      block = Number.isNaN(parsedId) ? null : this.newsBlocks.get(parsedId);
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
            <div class="unified-spinner unified-spinner--medium"></div>
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

    const { surface, text, textMuted, border } = this.palette;
    const detailContent = this.buildAnalysisDetailSections(block);

    modal.innerHTML = `
      <div class="modal-content" style="
        background: ${surface};
        border-radius: 16px;
        padding: 32px;
        width: 92%;
        max-width: 720px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        gap: 20px;
        position: relative;
        transform: scale(0.9);
        transition: transform 0.3s ease;
        box-shadow: 0 18px 48px rgba(0,0,0,0.55);
        border: 1px solid ${this.hexToRgba(border, 0.8)};
      ">
        <button class="close-modal" style="
          position: absolute;
          top: 16px;
          right: 16px;
          background: none;
          border: none;
          font-size: 24px;
          color: ${textMuted};
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background-color 0.2s;
        ">&times;</button>

        <div style="display: flex; flex-direction: column; gap: 4px; padding-right: 32px;">
          <span style="font-size: 13px; color: ${this.hexToRgba(text, 0.7)}; letter-spacing: 0.08em; text-transform: uppercase;">분석 결과</span>
          <h2 style="color: ${text}; font-size: 22px; font-weight: 700; margin: 0;">${detailContent.safeTitle}</h2>
        </div>

        <div class="detail-scroll" style="
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 8px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        ">
          ${detailContent.sectionsHtml}
        </div>
      </div>
    `;
    
    // 이벤트 리스너들
    const closeBtn = modal.querySelector('.close-modal');
    
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

    // 내용 인터랙션 연결
    this.attachAnalysisDetailContentEvents(modal, block);

    // 호버 효과
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = 'rgba(191, 151, 128, 0.2)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = 'transparent';
    });

    return modal;
  }

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
        
        this.loadApiKeySnapshot().then((apiKeys) => {
          console.log('[Settings] Creating settings panel with API key:', apiKeys?.gemini ? 'exists' : 'none');
          const modal = this.createSettingsPanel(apiKeys);
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

  getNewsBrandDomainMap() {
    return {
      yonhap: ['yna.co.kr', 'yonhapnewstv.co.kr', 'newsis.com'],
      chosun: ['chosun.com', 'biz.chosun.com', 'news.chosun.com'],
      joongang: ['joongang.co.kr', 'news.joins.com'],
      donga: ['donga.com', 'news.donga.com', 'm.donga.com'],
      khan: ['khan.co.kr'],
      hani: ['hani.co.kr'],
      sbs: ['sbs.co.kr', 'news.sbs.co.kr'],
      kbs: ['kbs.co.kr', 'news.kbs.co.kr'],
      mbc: ['mbc.co.kr', 'imnews.imbc.com'],
      jtbc: ['jtbc.co.kr', 'news.jtbc.co.kr']
    };
  }

  getPreferredFactCheckDomains() {
    const selectedBrands = this.getSelectedNewsBrands();
    const domainMap = this.getNewsBrandDomainMap();
    const allDomainValues = Object.values(domainMap).flat();
    const domains = new Set();

    if (!selectedBrands || selectedBrands.length === 0) {
      allDomainValues.forEach((domain) => domains.add(domain.toLowerCase()));
      return Array.from(domains);
    }

    selectedBrands.forEach((brandId) => {
      const brandDomains = domainMap[brandId];
      if (brandDomains && brandDomains.length > 0) {
        brandDomains.forEach((domain) => domains.add(domain.toLowerCase()));
      }
    });

    if (domains.size === 0) {
      allDomainValues.forEach((domain) => domains.add(domain.toLowerCase()));
    }

    return Array.from(domains);
  }

  matchesPreferredNewsDomain(result, preferredDomains) {
    if (!preferredDomains || preferredDomains.length === 0) {
      return false;
    }
    const link = (result.link || '').toLowerCase();
    const displayLink = (result.displayLink || '').toLowerCase();
    return preferredDomains.some((domain) => link.includes(domain) || displayLink.includes(domain));
  }

  async prioritizeFactCheckResults(results) {
    if (!results || results.length === 0) {
      return [];
    }

    const preferredDomains = this.getPreferredFactCheckDomains();
    const preferred = [];
    const others = [];

    results.forEach((item) => {
      if (this.matchesPreferredNewsDomain(item, preferredDomains)) {
        preferred.push(item);
      } else {
        others.push(item);
      }
    });

    const strictPreferred = [];
    for (const item of preferred) {
      if (await this.validateNewsArticleStrict(item)) {
        strictPreferred.push(item);
      }
    }

    const strictOthers = [];
    for (const item of others) {
      if (await this.validateNewsArticleStrict(item)) {
        strictOthers.push(item);
      }
    }

    if (strictPreferred.length > 0 || strictOthers.length > 0) {
      return [...strictPreferred, ...strictOthers];
    }

    return [...preferred, ...others];
  }

  getNewsBrandSelectionLabel(selectedBrands = null) {
    const allBrands = this.getNewsBrandDefinitions();
    const totalBrands = allBrands.length;
    let currentSelection = selectedBrands || this.getSelectedNewsBrands();

    if (!Array.isArray(currentSelection)) {
      currentSelection = [];
    }

    const uniqueSelection = Array.from(new Set(currentSelection)).filter((id) =>
      allBrands.some((brand) => brand.id === id)
    );

    if (uniqueSelection.length === 0 || uniqueSelection.length >= totalBrands) {
      return '전체 뉴스 사용 중';
    }

    if (uniqueSelection.length === 1) {
      const brandInfo = allBrands.find((brand) => brand.id === uniqueSelection[0]);
      return brandInfo ? `${brandInfo.name}만 사용` : '1개 뉴스만 사용';
    }

    return `${uniqueSelection.length}/${totalBrands}개 뉴스 사용`;
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
  createSettingsPanel(apiKeys = {}) {
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
    
    const geminiPrefill = (apiKeys && typeof apiKeys.gemini === 'string') ? apiKeys.gemini : '';
    const googlePrefill = (apiKeys && typeof apiKeys.google === 'string') ? apiKeys.google : '';
    const brandSelectionLabel = this.getNewsBrandSelectionLabel();
    const autoFactCheckEnabled = this.getAutoFactCheckSetting();
    const autoCrossVerificationEnabled = this.getAutoCrossVerificationSetting();
    const articleFilterEnabled = this.getArticleFilterSetting();
    
    const modalContent = document.createElement('div');
    modalContent.className = 'settings-panel-content';
    modalContent.style.cssText = `
      background: linear-gradient(135deg, #F2F2F2 0%, #E8E8E8 100%);
      border-radius: 16px;
      padding: 32px;
      width: 620px;
      max-width: 95vw;
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
      <div class="api-key-settings" style="
        padding: 16px 0;
        border-bottom: 1px solid #E5E5E5;
      ">
        <div style="
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        ">
          <div>
            <div style="
              font-size: 16px;
              font-weight: 600;
              color: #0D0D0D;
              margin-bottom: 4px;
            ">API 키 관리</div>
            <div style="
              font-size: 13px;
              color: #737373;
              line-height: 1.4;
            ">Gemini/Google 키를 입력하거나 NONE으로 초기화할 수 있습니다.</div>
          </div>
          <button class="api-key-btn" style="
            background: #BF9780;
            color: white;
            padding: 11px 20px;
            border-radius: 8px;
            font-weight: 700;
            border: none;
            cursor: pointer;
            transition: background-color 0.2s;
            font-size: 15px;
            min-width: 130px;
          ">API 키 입력</button>
        </div>

        <div style="
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 16px;
        ">
          <div style="
            padding: 12px;
            border-radius: 10px;
            border: 1px solid rgba(0,0,0,0.08);
            background: white;
          ">
            <div style="
              font-size: 13px;
              color: #737373;
              margin-bottom: 6px;
            ">Gemini API Key</div>
            <span data-role="gemini-status" style="
              display: inline-flex;
              align-items: center;
              padding: 4px 12px;
              border-radius: 999px;
              font-size: 12px;
              font-weight: 600;
              background: ${this.isGeminiKeyConfigured() ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'};
              color: ${this.isGeminiKeyConfigured() ? '#047857' : '#B91C1C'};
            ">${this.isGeminiKeyConfigured() ? '입력됨' : '미입력'}</span>
          </div>
          <div style="
            padding: 12px;
            border-radius: 10px;
            border: 1px solid rgba(0,0,0,0.08);
            background: white;
          ">
            <div style="
              font-size: 13px;
              color: #737373;
              margin-bottom: 6px;
            ">Google Search API Key</div>
            <span data-role="google-status" style="
              display: inline-flex;
              align-items: center;
              padding: 4px 12px;
              border-radius: 999px;
              font-size: 12px;
              font-weight: 600;
              background: ${this.isGoogleApiConfigured() ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'};
              color: ${this.isGoogleApiConfigured() ? '#047857' : '#B91C1C'};
            ">${this.isGoogleApiConfigured() ? '입력됨' : '미입력'}</span>
          </div>
        </div>

        <div class="api-key-inline-form" data-open="false" style="
          margin-top: 16px;
          padding: 16px;
          background: rgba(191, 151, 128, 0.08);
          border-radius: 10px;
          border: 1px dashed rgba(191, 151, 128, 0.4);
          max-height: 0;
          overflow: hidden;
          opacity: 0;
          transition: max-height 0.35s ease, opacity 0.25s ease;
        ">
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div>
              <label style="
                font-size: 13px;
                font-weight: 600;
                color: #0D0D0D;
                margin-bottom: 6px;
                display: block;
              ">Gemini API Key</label>
              <input type="text" class="gemini-key-input" value="${this.escapeHtml(geminiPrefill)}" placeholder="Gemini API 키를 입력하거나 비워두세요" style="
                width: 100%;
                padding: 10px 12px;
                border-radius: 8px;
                border: 1px solid rgba(0,0,0,0.15);
                font-size: 14px;
                font-family: inherit;
                background: #FFFFFF;
              " autocomplete="off" spellcheck="false" />
            </div>
            <div>
              <label style="
                font-size: 13px;
                font-weight: 600;
                color: #0D0D0D;
                margin-bottom: 6px;
                display: block;
              ">Google Search API Key</label>
              <input type="text" class="google-key-input" value="${this.escapeHtml(googlePrefill)}" placeholder="Google API 키를 입력하거나 비워두세요" style="
                width: 100%;
                padding: 10px 12px;
                border-radius: 8px;
                border: 1px solid rgba(0,0,0,0.15);
                font-size: 14px;
                font-family: inherit;
                background: #FFFFFF;
              " autocomplete="off" spellcheck="false" />
            </div>
            <div style="
              font-size: 12px;
              color: #6B7280;
              background: rgba(255,255,255,0.7);
              border-radius: 8px;
              padding: 10px 12px;
              border: 1px solid rgba(191, 151, 128, 0.3);
            ">입력을 비우고 저장하면 <strong style="color:#B45309;">NONE</strong> 값으로 저장되어 관련 기능이 비활성화됩니다.</div>
            <div class="api-key-inline-feedback" style="
              font-size: 12px;
              min-height: 16px;
              color: #047857;
            "></div>
            <div style="
              display: flex;
              justify-content: flex-end;
              gap: 10px;
            ">
              <button type="button" class="api-key-cancel-btn" style="
                padding: 10px 16px;
                border-radius: 8px;
                border: 1px solid rgba(0,0,0,0.1);
                background: white;
                font-weight: 600;
                cursor: pointer;
              ">취소</button>
              <button type="button" class="api-key-save-btn" style="
                padding: 10px 18px;
                border-radius: 8px;
                border: none;
                background: #BF9780;
                color: white;
                font-weight: 600;
                cursor: pointer;
                min-width: 96px;
              ">저장</button>
            </div>
          </div>
        </div>
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
                <strong>통합 검색:</strong> 전체 웹 공식 자료/보도자료
              </div>
            </div>
            <div style="
              margin-top: 16px;
              padding-top: 16px;
              border-top: 1px solid rgba(191, 151, 128, 0.2);
            ">
              <div style="
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 12px;
              ">
                <div>
                  <div style="
                    font-size: 14px;
                    font-weight: 600;
                    color: #0D0D0D;
                    margin-bottom: 4px;
                  ">통합 검색 (전체 웹)</div>
                  <div style="
                    font-size: 13px;
                    color: #737373;
                  ">뉴스 기사 외 정부·기관 자료까지 동시에 검색합니다.</div>
                </div>
                <button class="integrated-search-toggle-btn" style="
                  background: ${this.getIntegratedSearchSetting() ? '#10B981' : '#9CA3AF'};
                  color: white;
                  padding: 8px 16px;
                  border-radius: 6px;
                  font-weight: 600;
                  border: none;
                  cursor: pointer;
                  transition: background-color 0.2s;
                  font-size: 14px;
                ">${this.getIntegratedSearchSetting() ? '켜짐' : '꺼짐'}</button>
              </div>
              <div style="
                margin-top: 8px;
                font-size: 12px;
                color: #B45309;
                background: rgba(191, 151, 128, 0.18);
                padding: 8px 10px;
                border-radius: 6px;
                line-height: 1.5;
              ">⚠️ 통합 검색을 켜면 Google Search API가 <strong>1회 추가 호출</strong>됩니다. 사용량과 비용을 반드시 확인하세요.</div>
              
              <!-- 통합 검색 크롤링 개수 슬라이더 -->
              <div style="
                margin-top: 16px;
                padding: 12px;
                background: #F9FAFB;
                border-radius: 6px;
                border: 1px solid #E5E7EB;
              ">
                <div style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 8px;
                ">
                  <span style="
                    font-size: 14px;
                    font-weight: 600;
                    color: #0D0D0D;
                  ">크롤링 개수</span>
                  <span class="integrated-crawl-count-value" style="
                    font-size: 14px;
                    font-weight: 600;
                    color: #10B981;
                  ">${this.getIntegratedCrawlCountSettingFromCache()}개</span>
                </div>
                <input 
                  type="range" 
                  class="integrated-crawl-count-slider"
                  min="1" 
                  max="10" 
                  value="${this.getIntegratedCrawlCountSettingFromCache()}" 
                  style="
                    width: 100%;
                    height: 6px;
                    border-radius: 3px;
                    outline: none;
                    -webkit-appearance: none;
                    appearance: none;
                    background: linear-gradient(to right, #10B981 0%, #10B981 ${(this.getIntegratedCrawlCountSettingFromCache() - 1) / 9 * 100}%, #E5E7EB ${(this.getIntegratedCrawlCountSettingFromCache() - 1) / 9 * 100}%, #E5E7EB 100%);
                    cursor: pointer;
                  "
                />
                <div style="
                  display: flex;
                  justify-content: space-between;
                  margin-top: 4px;
                  font-size: 11px;
                  color: #9CA3AF;
                ">
                  <span>1</span>
                  <span>10</span>
                </div>
                <div style="
                  margin-top: 8px;
                  font-size: 12px;
                  color: #DC2626;
                  line-height: 1.4;
                ">💡 크롤링 개수가 많을수록 <strong>Gemini API 요청률이 증가</strong>합니다.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 크롤링 우선 순위 -->
      <div style="
        padding: 16px 0;
        border-bottom: 1px solid #E5E5E5;
      ">
        <div style="
          display: flex;
          flex-direction: column;
          gap: 12px;
        ">
          <div>
            <div style="
              font-size: 16px;
              font-weight: 600;
              color: #0D0D0D;
              margin-bottom: 4px;
            ">크롤링 우선 순위</div>
            <div style="
              font-size: 13px;
              color: #737373;
              line-height: 1.4;
            ">사실 검증 시 기사 본문 수집 방식을 선택합니다.</div>
          </div>
          
          <!-- 토글 버튼 -->
          <div style="
            display: flex;
            background: #F3F4F6;
            border-radius: 8px;
            padding: 4px;
            gap: 4px;
          ">
            <button class="crawling-priority-btn" data-mode="speed" style="
              flex: 1;
              padding: 10px 16px;
              border-radius: 6px;
              font-weight: 600;
              border: none;
              cursor: pointer;
              transition: all 0.2s;
              font-size: 14px;
              background: white;
              color: #0D0D0D;
              box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            ">
              <div style="font-weight: 700; margin-bottom: 2px;">⚡ 속도</div>
              <div style="font-size: 11px; color: #737373;">검색 요약만</div>
            </button>
            <button class="crawling-priority-btn" data-mode="accuracy" style="
              flex: 1;
              padding: 10px 16px;
              border-radius: 6px;
              font-weight: 600;
              border: none;
              cursor: pointer;
              transition: all 0.2s;
              font-size: 14px;
              background: transparent;
              color: #737373;
            ">
              <div style="font-weight: 700; margin-bottom: 2px;">🎯 정확도</div>
              <div style="font-size: 11px; color: #737373;">전체 본문</div>
            </button>
          </div>
          
          <!-- 정확도 선택 시 경고문 -->
          <div class="accuracy-warning" style="
            display: none;
            font-size: 12px;
            color: #B45309;
            background: rgba(191, 151, 128, 0.18);
            padding: 8px 10px;
            border-radius: 6px;
            line-height: 1.4;
          ">⚠️ <strong>정확도 모드</strong>는 각 기사를 크롤링하여 AI로 본문을 추출하고 재분석합니다.<br/>Gemini API 호출이 추가로 발생하며 <strong>속도가 느릴 수 있으니</strong> 사용량을 확인하세요.</div>
          
          <!-- 크롤링 개수 설정 (정확도 모드에서만 표시) -->
          <div class="crawling-count-setting" style="
            display: none;
            margin-top: 12px;
            padding: 12px;
            background: #F9FAFB;
            border-radius: 8px;
            border: 1px solid #E5E7EB;
          ">
            <div style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 8px;
            ">
              <div style="font-size: 14px; font-weight: 600; color: #0D0D0D;">크롤링 개수</div>
              <div class="crawling-count-value" style="
                font-size: 14px;
                font-weight: 700;
                color: #BF9780;
                min-width: 60px;
                text-align: right;
              ">3개</div>
            </div>
            
            <input type="range" class="crawling-count-slider" min="0" max="11" value="3" step="1" style="
              width: 100%;
              height: 6px;
              border-radius: 5px;
              background: linear-gradient(to right, #BF9780 0%, #BF9780 27.27%, #E5E7EB 27.27%, #E5E7EB 100%);
              outline: none;
              -webkit-appearance: none;
              margin: 8px 0;
            ">
            
            <!-- 커스텀 입력 (슬라이더 0일 때만 표시) -->
            <div class="crawling-custom-input" style="
              display: none;
              margin-top: 8px;
            ">
              <input type="number" class="crawling-custom-value" min="1" max="100" value="3" style="
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #D1D5DB;
                border-radius: 6px;
                font-size: 14px;
                font-family: inherit;
              " placeholder="크롤링할 기사 개수 입력 (1-100)">
            </div>
            
            <div style="
              font-size: 11px;
              color: #6B7280;
              margin-top: 6px;
              line-height: 1.4;
            ">0: 직접 입력 | 1-10: 지정 개수 | 최대: 전체 크롤링</div>
          </div>
        </div>
      </div>

      <!-- 유사 기사 필터링 -->
      <div style="
        padding: 16px 0;
        border-bottom: 1px solid #E5E5E5;
      ">
        <div style="
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        ">
          <div style="flex: 1;">
            <div style="
              font-size: 16px;
              font-weight: 600;
              color: #0D0D0D;
              margin-bottom: 4px;
            ">유사 기사 AI 필터링</div>
            <div style="
              font-size: 13px;
              color: #737373;
              line-height: 1.4;
            ">설정을 켜면 AI가 원본 뉴스와 관련 없는 기사를 자동으로 제거합니다. 설정을 끄면 필터링 없이 검색 결과를 그대로 표시합니다.</div>
            <div style="
              margin-top: 8px;
              font-size: 12px;
              color: #6B7280;
              background: #F3F4F6;
              padding: 8px 10px;
              border-radius: 6px;
            ">💡 끄기 권장: 관련성이 낮은 기사도 사실 검증에 유용할 수 있습니다.</div>
          </div>
          <button class="article-filter-btn" style="
            background: ${articleFilterEnabled ? '#10B981' : '#9CA3AF'};
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            font-weight: 600;
            border: none;
            cursor: pointer;
            transition: background-color 0.2s;
            font-size: 14px;
            min-width: 72px;
          ">${articleFilterEnabled ? '켜짐' : '꺼짐'}</button>
        </div>
      </div>

      <!-- 자동 사실 확인 -->
      <div style="
        padding: 16px 0;
        border-bottom: 1px solid #E5E5E5;
      ">
        <div style="
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        ">
          <div style="flex: 1;">
            <div style="
              font-size: 16px;
              font-weight: 600;
              color: #0D0D0D;
              margin-bottom: 4px;
            ">자동 사실 확인</div>
            <div style="
              font-size: 13px;
              color: #737373;
              line-height: 1.4;
            ">분석이 끝나면 Google Search와 Gemini로 즉시 사실 검증을 실행합니다.</div>
            <div style="
              margin-top: 8px;
              font-size: 12px;
              color: #B45309;
              background: rgba(191, 151, 128, 0.18);
              padding: 8px 10px;
              border-radius: 6px;
            ">⚠️ API 호출이 자동으로 발생하므로 Google Search API 키와 사용량을 반드시 확인하세요.</div>
          </div>
          <button class="auto-factcheck-btn" style="
            background: ${autoFactCheckEnabled ? '#10B981' : '#9CA3AF'};
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            font-weight: 600;
            border: none;
            cursor: pointer;
            transition: background-color 0.2s;
            font-size: 14px;
            min-width: 72px;
          ">${autoFactCheckEnabled ? '켜짐' : '꺼짐'}</button>
        </div>
      </div>

      <!-- 자동 교차 검증 -->
      <div style="
        padding: 16px 0;
        border-bottom: 1px solid #E5E5E5;
      ">
        <div style="
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        ">
          <div style="flex: 1;">
            <div style="
              font-size: 16px;
              font-weight: 600;
              color: #0D0D0D;
              margin-bottom: 4px;
            ">자동 교차 검증</div>
            <div style="
              font-size: 13px;
              color: #737373;
              line-height: 1.4;
            ">분석 결과를 지정된 깊이만큼 반복 검증합니다. 자동 사실 확인이 켜져 있으면 사실 검증 완료 후 순차적으로 실행됩니다.</div>
            <div style="
              margin-top: 8px;
              font-size: 12px;
              color: #93370D;
              background: rgba(244, 190, 150, 0.25);
              padding: 8px 10px;
              border-radius: 6px;
            ">⚠️ 각 단계마다 Gemini 호출이 발생하므로 사용 중인 API 쿼터와 비용 정책을 확인하세요.</div>
          </div>
          <button class="auto-crossverify-btn" style="
            background: ${autoCrossVerificationEnabled ? '#10B981' : '#9CA3AF'};
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            font-weight: 600;
            border: none;
            cursor: pointer;
            transition: background-color 0.2s;
            font-size: 14px;
            min-width: 72px;
          ">${autoCrossVerificationEnabled ? '켜짐' : '꺼짐'}</button>
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
    this.attachSettingsPanelEvents(modal, modalContent, apiKeys);
    
    return modal;
  }

  // 설정 패널 이벤트 연결
  attachSettingsPanelEvents(modal, modalContent, apiKeys = {}) {
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

    const inlineForm = modalContent.querySelector('.api-key-inline-form');
    const apiKeyBtn = modalContent.querySelector('.api-key-btn');
    const googleApiKeyBtn = modalContent.querySelector('.google-api-key-btn');
    const geminiInput = inlineForm ? inlineForm.querySelector('.gemini-key-input') : null;
    const googleInput = inlineForm ? inlineForm.querySelector('.google-key-input') : null;
    const inlineFeedback = inlineForm ? inlineForm.querySelector('.api-key-inline-feedback') : null;
    const saveApiKeyBtn = inlineForm ? inlineForm.querySelector('.api-key-save-btn') : null;
    const cancelApiKeyBtn = inlineForm ? inlineForm.querySelector('.api-key-cancel-btn') : null;
    const googleApiKeyStatus = modalContent.querySelector('#google-api-key-status');

    if (inlineForm) {
      inlineForm.style.pointerEvents = inlineForm.getAttribute('data-open') === 'true' ? 'auto' : 'none';
    }

    const updateInlineFormHeight = () => {
      if (!inlineForm || inlineForm.getAttribute('data-open') !== 'true') return;
      inlineForm.style.maxHeight = `${inlineForm.scrollHeight}px`;
    };

    const showInlineFeedback = (message = '', isError = false) => {
      if (!inlineFeedback) return;
      inlineFeedback.textContent = message;
      inlineFeedback.style.color = isError ? '#B91C1C' : '#047857';
      updateInlineFormHeight();
    };

    const toggleInlineForm = (forceState = null) => {
      if (!inlineForm) return;
      const isOpen = inlineForm.getAttribute('data-open') === 'true';
      const nextState = typeof forceState === 'boolean' ? forceState : !isOpen;
      inlineForm.setAttribute('data-open', String(nextState));
      if (nextState) {
        inlineForm.style.opacity = '1';
        inlineForm.style.pointerEvents = 'auto';
        inlineForm.style.maxHeight = `${inlineForm.scrollHeight}px`;
        setTimeout(updateInlineFormHeight, 200);
      } else {
        inlineForm.style.opacity = '0';
        inlineForm.style.pointerEvents = 'none';
        inlineForm.style.maxHeight = '0px';
        if (inlineFeedback) {
          inlineFeedback.textContent = '';
          inlineFeedback.style.color = '#047857';
        }
      }
    };

    const updateGoogleKeyStatus = () => {
      if (!googleApiKeyStatus) return;
      const ready = this.isGoogleApiConfigured();
      googleApiKeyStatus.textContent = ready ? 'API 키 입력됨 ✓' : 'API 키 없음';
      googleApiKeyStatus.style.color = ready ? '#10B981' : '#9CA3AF';
    };
    updateGoogleKeyStatus();

    const focusInlineInput = (preferGoogle = false) => {
      const target = preferGoogle ? googleInput || geminiInput : geminiInput || googleInput;
      if (target) {
        requestAnimationFrame(() => target.focus());
      }
    };

    const openInlineForm = (preferGoogle = false) => {
      toggleInlineForm(true);
      focusInlineInput(preferGoogle);
    };

    if (apiKeyBtn) {
      apiKeyBtn.addEventListener('click', () => openInlineForm(false));
    }

    if (googleApiKeyBtn) {
      googleApiKeyBtn.addEventListener('click', () => openInlineForm(true));
      googleApiKeyBtn.addEventListener('mouseenter', () => {
        googleApiKeyBtn.style.transform = 'translateY(-2px)';
        googleApiKeyBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
      });
      googleApiKeyBtn.addEventListener('mouseleave', () => {
        googleApiKeyBtn.style.transform = 'translateY(0)';
        googleApiKeyBtn.style.boxShadow = 'none';
      });
    }

    if (cancelApiKeyBtn) {
      cancelApiKeyBtn.addEventListener('click', () => {
        if (geminiInput) {
          geminiInput.value = apiKeys?.gemini || '';
        }
        if (googleInput) {
          googleInput.value = apiKeys?.google || '';
        }
        toggleInlineForm(false);
      });
    }

    if (saveApiKeyBtn && geminiInput && googleInput) {
      saveApiKeyBtn.addEventListener('click', async () => {
        const previousLabel = saveApiKeyBtn.textContent;
        showInlineFeedback('');
        saveApiKeyBtn.disabled = true;
        saveApiKeyBtn.textContent = '저장 중...';
        try {
          const [savedGemini, savedGoogle] = await Promise.all([
            this.persistApiKeyValue('gemini_api_key', geminiInput.value),
            this.persistApiKeyValue('google_search_api_key', googleInput.value)
          ]);
          apiKeys.gemini = savedGemini;
          apiKeys.google = savedGoogle;
          this.refreshApiKeyFlags();
          this.updateApiStatusBadges(modalContent, { gemini: savedGemini, google: savedGoogle });
          this.updateApiKeyDependentControls(modalContent);
          updateGoogleKeyStatus();
          showInlineFeedback('API 키가 저장되었습니다.');
          setTimeout(() => toggleInlineForm(false), 900);
        } catch (error) {
          console.error('Failed to save API keys inline:', error);
          showInlineFeedback('저장 중 문제가 발생했습니다. 다시 시도해주세요.', true);
        } finally {
          saveApiKeyBtn.disabled = false;
          saveApiKeyBtn.textContent = previousLabel;
        }
      });
    }

    // 크롤링 우선 순위 & 개수 설정
    const priorityButtons = modalContent.querySelectorAll('.crawling-priority-btn');
    const accuracyWarning = modalContent.querySelector('.accuracy-warning');
    const crawlingCountSection = modalContent.querySelector('.crawling-count-setting');
    const crawlingCountValue = modalContent.querySelector('.crawling-count-value');
    const crawlingCountSlider = modalContent.querySelector('.crawling-count-slider');
    const customCountWrapper = modalContent.querySelector('.crawling-custom-input');
    const customCountInput = modalContent.querySelector('.crawling-custom-value');

    let storedCrawlingCount = 3;

    const getCustomCountValue = () => {
      if (!customCountInput) return storedCrawlingCount > 11 ? storedCrawlingCount : 3;
      let value = parseInt(customCountInput.value, 10);
      if (Number.isNaN(value) || value < 1) value = 1;
      if (value > 100) value = 100;
      customCountInput.value = value;
      return value;
    };

    const formatCrawlingCountLabel = (sliderValue, resolvedValue) => {
      if (sliderValue === 11) {
        return '전체';
      }
      if (sliderValue === 0) {
        const customValue = resolvedValue || getCustomCountValue();
        return `${customValue}개 (직접 입력)`;
      }
      return `${sliderValue}개`;
    };

    const updateCrawlingCountUI = (sliderValue, resolvedValue = storedCrawlingCount) => {
      if (!crawlingCountSlider || !crawlingCountValue) return;
      const normalized = Math.min(Math.max(sliderValue, 0), 11);
      crawlingCountSlider.value = normalized;
      const percent = (normalized / 11) * 100;
      crawlingCountSlider.style.background = `linear-gradient(to right, #BF9780 0%, #BF9780 ${percent}%, #E5E7EB ${percent}%, #E5E7EB 100%)`;
      crawlingCountValue.textContent = formatCrawlingCountLabel(normalized, resolvedValue);
      if (customCountWrapper) {
        customCountWrapper.style.display = normalized === 0 ? 'block' : 'none';
      }
      if (customCountInput && normalized === 0 && resolvedValue) {
        customCountInput.value = resolvedValue;
      }
    };

    const initializeCrawlingCountControls = async () => {
      if (!crawlingCountSlider) return;
      try {
        storedCrawlingCount = await this.getCrawlingCountSetting();
      } catch (error) {
        console.warn('Failed to load crawling count:', error);
        storedCrawlingCount = 3;
      }
      let sliderValue = storedCrawlingCount;
      if (storedCrawlingCount === 0 || storedCrawlingCount > 11) {
        sliderValue = 0;
      }
      if (customCountInput) {
        if (storedCrawlingCount > 11) {
          customCountInput.value = storedCrawlingCount;
        } else if (!customCountInput.value) {
          customCountInput.value = storedCrawlingCount && storedCrawlingCount !== 0 ? storedCrawlingCount : '3';
        }
      }
      updateCrawlingCountUI(sliderValue, storedCrawlingCount || getCustomCountValue());
    };

    const updatePriorityUI = (mode) => {
      const normalized = mode === 'accuracy' ? 'accuracy' : 'speed';
      priorityButtons.forEach((btn) => {
        const isActive = btn.dataset.mode === normalized;
        btn.style.background = isActive ? '#FFFFFF' : 'transparent';
        btn.style.color = isActive ? '#0D0D0D' : '#737373';
        btn.style.boxShadow = isActive ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none';
      });
      if (accuracyWarning) {
        accuracyWarning.style.display = normalized === 'accuracy' ? 'block' : 'none';
      }
      if (crawlingCountSection) {
        crawlingCountSection.style.display = normalized === 'accuracy' ? 'block' : 'none';
      }
    };

    const initializeCrawlingSettings = async () => {
      await initializeCrawlingCountControls();
      if (priorityButtons.length) {
        try {
          const priority = await this.getCrawlingPrioritySetting();
          updatePriorityUI(priority);
        } catch (error) {
          console.warn('Failed to load crawling priority:', error);
          updatePriorityUI('speed');
        }
      }
    };

    initializeCrawlingSettings();

    if (priorityButtons.length) {
      priorityButtons.forEach((btn) => {
        btn.addEventListener('click', async () => {
          const mode = btn.dataset.mode === 'accuracy' ? 'accuracy' : 'speed';
          updatePriorityUI(mode);
          try {
            await this.setCrawlingPrioritySetting(mode);
            console.log('[Settings] 크롤링 우선 순위:', mode);
          } catch (error) {
            console.error('Failed to save crawling priority:', error);
            alert('설정을 저장하지 못했습니다. 다시 시도해주세요.');
          }
        });
      });
    }

    if (crawlingCountSlider) {
      crawlingCountSlider.addEventListener('input', (event) => {
        const sliderValue = parseInt(event.target.value, 10) || 0;
        const resolvedValue = sliderValue === 0 ? getCustomCountValue() : sliderValue;
        updateCrawlingCountUI(sliderValue, resolvedValue);
      });

      crawlingCountSlider.addEventListener('change', async (event) => {
        const sliderValue = parseInt(event.target.value, 10) || 0;
        const resolvedValue = sliderValue === 0 ? getCustomCountValue() : sliderValue;
        storedCrawlingCount = resolvedValue;
        updateCrawlingCountUI(sliderValue, resolvedValue);
        try {
          await this.setCrawlingCountSetting(resolvedValue);
          console.log('[Settings] 크롤링 개수:', resolvedValue);
        } catch (error) {
          console.error('Failed to save crawling count:', error);
        }
      });
    }

    if (customCountInput) {
      customCountInput.addEventListener('input', () => {
        const customValue = getCustomCountValue();
        updateCrawlingCountUI(0, customValue);
        if (crawlingCountSlider && crawlingCountSlider.value !== '0') {
          crawlingCountSlider.value = '0';
        }
      });

      customCountInput.addEventListener('change', async () => {
        const customValue = getCustomCountValue();
        storedCrawlingCount = customValue;
        updateCrawlingCountUI(0, customValue);
        try {
          await this.setCrawlingCountSetting(customValue);
          console.log('[Settings] 크롤링 개수 (커스텀):', customValue);
        } catch (error) {
          console.error('Failed to save custom crawling count:', error);
        }
      });
    }

    // 자동 사실 확인 토글 버튼
    const autoFactCheckBtn = modalContent.querySelector('.auto-factcheck-btn');
    if (autoFactCheckBtn) {
      const updateAutoFactCheckBtn = () => {
        const enabled = this.getAutoFactCheckSetting();
        autoFactCheckBtn.textContent = enabled ? '켜짐' : '꺼짐';
        autoFactCheckBtn.style.backgroundColor = enabled ? '#10B981' : '#9CA3AF';
      };
      updateAutoFactCheckBtn();

      autoFactCheckBtn.addEventListener('click', () => {
        const newSetting = !this.getAutoFactCheckSetting();
        this.setAutoFactCheckSetting(newSetting);
        updateAutoFactCheckBtn();
      });

      autoFactCheckBtn.addEventListener('mouseenter', () => {
        const enabled = this.getAutoFactCheckSetting();
        autoFactCheckBtn.style.backgroundColor = enabled ? '#0EA16F' : '#6B7280';
      });
      autoFactCheckBtn.addEventListener('mouseleave', () => {
        const enabled = this.getAutoFactCheckSetting();
        autoFactCheckBtn.style.backgroundColor = enabled ? '#10B981' : '#9CA3AF';
      });
    }

    // 유사 기사 필터링 토글 버튼
    const articleFilterBtn = modalContent.querySelector('.article-filter-btn');
    if (articleFilterBtn) {
      const updateArticleFilterBtn = () => {
        const enabled = this.getArticleFilterSetting();
        articleFilterBtn.textContent = enabled ? '켜짐' : '꺼짐';
        articleFilterBtn.style.backgroundColor = enabled ? '#10B981' : '#9CA3AF';
      };
      updateArticleFilterBtn();

      articleFilterBtn.addEventListener('click', () => {
        const newSetting = !this.getArticleFilterSetting();
        this.setArticleFilterSetting(newSetting);
        updateArticleFilterBtn();
      });

      articleFilterBtn.addEventListener('mouseenter', () => {
        const enabled = this.getArticleFilterSetting();
        articleFilterBtn.style.backgroundColor = enabled ? '#0EA16F' : '#6B7280';
      });
      articleFilterBtn.addEventListener('mouseleave', () => {
        const enabled = this.getArticleFilterSetting();
        articleFilterBtn.style.backgroundColor = enabled ? '#10B981' : '#9CA3AF';
      });
    }

    // 자동 교차 검증 토글 버튼
    const autoCrossVerifyBtn = modalContent.querySelector('.auto-crossverify-btn');
    if (autoCrossVerifyBtn) {
      const updateAutoCrossBtn = () => {
        const enabled = this.getAutoCrossVerificationSetting();
        autoCrossVerifyBtn.textContent = enabled ? '켜짐' : '꺼짐';
        autoCrossVerifyBtn.style.backgroundColor = enabled ? '#10B981' : '#9CA3AF';
      };
      updateAutoCrossBtn();

      autoCrossVerifyBtn.addEventListener('click', () => {
        const newSetting = !this.getAutoCrossVerificationSetting();
        this.setAutoCrossVerificationSetting(newSetting);
        updateAutoCrossBtn();
      });

      autoCrossVerifyBtn.addEventListener('mouseenter', () => {
        const enabled = this.getAutoCrossVerificationSetting();
        autoCrossVerifyBtn.style.backgroundColor = enabled ? '#0EA16F' : '#6B7280';
      });
      autoCrossVerifyBtn.addEventListener('mouseleave', () => {
        const enabled = this.getAutoCrossVerificationSetting();
        autoCrossVerifyBtn.style.backgroundColor = enabled ? '#10B981' : '#9CA3AF';
      });
    }

    // 패널 자동 열기 토글 버튼
    const autoOpenBtn = modalContent.querySelector('.auto-open-btn');
    if (autoOpenBtn) {
      const updateAutoOpenBtn = () => {
        const enabled = this.getAutoOpenSetting();
        autoOpenBtn.textContent = enabled ? '켜짐' : '꺼짐';
        autoOpenBtn.style.backgroundColor = enabled ? '#10B981' : '#9CA3AF';
      };
      updateAutoOpenBtn();

      autoOpenBtn.addEventListener('click', () => {
        const newSetting = !this.getAutoOpenSetting();
        this.setAutoOpenSetting(newSetting);
        updateAutoOpenBtn();
      });

      autoOpenBtn.addEventListener('mouseenter', () => {
        const enabled = this.getAutoOpenSetting();
        autoOpenBtn.style.backgroundColor = enabled ? '#0EA16F' : '#6B7280';
      });
      autoOpenBtn.addEventListener('mouseleave', () => {
        const enabled = this.getAutoOpenSetting();
        autoOpenBtn.style.backgroundColor = enabled ? '#10B981' : '#9CA3AF';
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
    const integratedSearchToggleBtn = modalContent.querySelector('.integrated-search-toggle-btn');
    
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

        this.updateApiKeyDependentControls(modalContent);
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

    if (integratedSearchToggleBtn) {
      const updateIntegratedToggle = () => {
        const enabled = this.getIntegratedSearchSetting();
        integratedSearchToggleBtn.textContent = enabled ? '켜짐' : '꺼짐';
        integratedSearchToggleBtn.style.backgroundColor = enabled ? '#10B981' : '#9CA3AF';
      };

      updateIntegratedToggle();

      integratedSearchToggleBtn.addEventListener('click', () => {
        if (!this.getGoogleSearchEnabled()) {
          alert('먼저 Google Search API 사용을 켠 뒤 통합 검색을 활성화하세요.');
          return;
        }
        const newSetting = !this.getIntegratedSearchSetting();
        this.setIntegratedSearchSetting(newSetting);
        updateIntegratedToggle();
      });

      integratedSearchToggleBtn.addEventListener('mouseenter', () => {
        integratedSearchToggleBtn.style.transform = 'translateY(-2px)';
        integratedSearchToggleBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
      });

      integratedSearchToggleBtn.addEventListener('mouseleave', () => {
        integratedSearchToggleBtn.style.transform = 'translateY(0)';
        integratedSearchToggleBtn.style.boxShadow = 'none';
      });
    }

    // 통합 검색 크롤링 개수 슬라이더 이벤트 리스너
    const integratedCrawlSlider = modalContent.querySelector('.integrated-crawl-count-slider');
    const integratedCrawlValue = modalContent.querySelector('.integrated-crawl-count-value');
    
    if (integratedCrawlSlider && integratedCrawlValue) {
      integratedCrawlSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        integratedCrawlValue.textContent = `${value}개`;
        
        // 슬라이더 배경 그라데이션 업데이트
        const percentage = (value - 1) / 9 * 100;
        e.target.style.background = `linear-gradient(to right, #10B981 0%, #10B981 ${percentage}%, #E5E7EB ${percentage}%, #E5E7EB 100%)`;
      });
      
      integratedCrawlSlider.addEventListener('change', async (e) => {
        const value = parseInt(e.target.value);
        await this.setIntegratedCrawlCountSetting(value);
        console.log(`통합 검색 크롤링 개수 설정: ${value}`);
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

    // 교차 검증 깊이 슬라이더 (비활성화 - 고정값 2)
    const depthSlider = modalContent.querySelector('.cross-verification-depth-slider');
    const depthValueLabel = modalContent.querySelector('.cross-verification-depth-value');
    // 슬라이더는 UI에서 제거되었으므로 이벤트 리스너 불필요

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

  // 자동 사실 검증 설정
  getAutoFactCheckSetting() {
    try {
      const setting = localStorage.getItem('factcheck_auto_fact_check');
      return setting !== null ? JSON.parse(setting) : false;
    } catch (error) {
      console.error('Failed to get auto fact check setting:', error);
      return false;
    }
  }

  setAutoFactCheckSetting(value) {
    try {
      localStorage.setItem('factcheck_auto_fact_check', JSON.stringify(value));
      this.autoFactCheckEnabled = value;
      console.log('Auto fact check setting updated:', value);
    } catch (error) {
      console.error('Failed to save auto fact check setting:', error);
    }
  }

  // 자동 교차 검증 설정
  getAutoCrossVerificationSetting() {
    try {
      const setting = localStorage.getItem('factcheck_auto_cross_verify');
      return setting !== null ? JSON.parse(setting) : false;
    } catch (error) {
      console.error('Failed to get auto cross verification setting:', error);
      return false;
    }
  }

  setAutoCrossVerificationSetting(value) {
    try {
      localStorage.setItem('factcheck_auto_cross_verify', JSON.stringify(value));
      this.autoCrossVerificationEnabled = value;
      console.log('Auto cross verification setting updated:', value);
    } catch (error) {
      console.error('Failed to save auto cross verification setting:', error);
    }
  }

  getIntegratedSearchSetting() {
    try {
      const setting = localStorage.getItem('factcheck_integrated_search_enabled');
      return setting !== null ? JSON.parse(setting) : false;
    } catch (error) {
      console.error('Failed to get integrated search setting:', error);
      return false;
    }
  }

  setIntegratedSearchSetting(value) {
    try {
      localStorage.setItem('factcheck_integrated_search_enabled', JSON.stringify(Boolean(value)));
      this.integratedSearchEnabled = Boolean(value);
      console.log('Integrated search setting updated:', this.integratedSearchEnabled);
    } catch (error) {
      console.error('Failed to save integrated search setting:', error);
    }
  }

  getCrawlingPrioritySettingFromCache() {
    try {
      const stored = localStorage.getItem('crawling_priority');
      return stored || 'speed';
    } catch (error) {
      console.error('Failed to read crawling priority from cache:', error);
      return 'speed';
    }
  }

  cacheCrawlingPrioritySetting(value) {
    try {
      localStorage.setItem('crawling_priority', value);
    } catch (error) {
      console.error('Failed to cache crawling priority:', error);
    }
  }

  async getCrawlingPrioritySetting() {
    const fallback = this.getCrawlingPrioritySettingFromCache();
    if (!this.isChromeApiAvailable()) {
      return fallback;
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['crawling_priority'], (data) => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to load crawling priority from Chrome storage:', chrome.runtime.lastError);
            resolve(fallback);
            return;
          }
          const priority = data.crawling_priority || 'speed';
          this.cacheCrawlingPrioritySetting(priority);
          resolve(priority);
        });
      } catch (error) {
        console.warn('Chrome storage unavailable, using cached crawling priority:', error);
        resolve(fallback);
      }
    });
  }

  async setCrawlingPrioritySetting(value) {
    this.cacheCrawlingPrioritySetting(value);

    if (!this.isChromeApiAvailable()) {
      return;
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ crawling_priority: value }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to persist crawling priority to Chrome storage:', chrome.runtime.lastError);
          }
          resolve();
        });
      } catch (error) {
        console.warn('Chrome storage unavailable while saving crawling priority:', error);
        resolve();
      }
    });
  }

  getCrawlingCountSettingFromCache() {
    try {
      const stored = localStorage.getItem('crawling_count');
      return stored ? parseInt(stored) : 3;
    } catch (error) {
      console.error('Failed to read crawling count from cache:', error);
      return 3;
    }
  }

  cacheCrawlingCountSetting(value) {
    try {
      localStorage.setItem('crawling_count', value.toString());
    } catch (error) {
      console.error('Failed to cache crawling count:', error);
    }
  }

  async getCrawlingCountSetting() {
    const fallback = this.getCrawlingCountSettingFromCache();
    if (!this.isChromeApiAvailable()) {
      return fallback;
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['crawling_count'], (data) => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to load crawling count from Chrome storage:', chrome.runtime.lastError);
            resolve(fallback);
            return;
          }
          const count = data.crawling_count !== undefined ? data.crawling_count : 3;
          this.cacheCrawlingCountSetting(count);
          resolve(count);
        });
      } catch (error) {
        console.warn('Chrome storage unavailable, using cached crawling count:', error);
        resolve(fallback);
      }
    });
  }

  async setCrawlingCountSetting(value) {
    this.cacheCrawlingCountSetting(value);

    if (!this.isChromeApiAvailable()) {
      return;
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ crawling_count: value }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to persist crawling count to Chrome storage:', chrome.runtime.lastError);
          }
          resolve();
        });
      } catch (error) {
        console.warn('Chrome storage unavailable while saving crawling count:', error);
        resolve();
      }
    });
  }

  // 통합 검색 크롤링 개수 설정
  getIntegratedCrawlCountSettingFromCache() {
    try {
      const stored = localStorage.getItem('integrated_crawl_count');
      return stored ? parseInt(stored) : 3;
    } catch (error) {
      console.error('Failed to read integrated crawl count from cache:', error);
      return 3;
    }
  }

  cacheIntegratedCrawlCountSetting(value) {
    try {
      localStorage.setItem('integrated_crawl_count', value.toString());
    } catch (error) {
      console.error('Failed to cache integrated crawl count:', error);
    }
  }

  async getIntegratedCrawlCountSetting() {
    const fallback = this.getIntegratedCrawlCountSettingFromCache();
    if (!this.isChromeApiAvailable()) {
      return fallback;
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['integrated_crawl_count'], (data) => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to load integrated crawl count from Chrome storage:', chrome.runtime.lastError);
            resolve(fallback);
            return;
          }
          const count = data.integrated_crawl_count !== undefined ? data.integrated_crawl_count : 3;
          this.cacheIntegratedCrawlCountSetting(count);
          resolve(count);
        });
      } catch (error) {
        console.warn('Chrome storage unavailable, using cached integrated crawl count:', error);
        resolve(fallback);
      }
    });
  }

  async setIntegratedCrawlCountSetting(value) {
    this.cacheIntegratedCrawlCountSetting(value);

    if (!this.isChromeApiAvailable()) {
      return;
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ integrated_crawl_count: value }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to persist integrated crawl count to Chrome storage:', chrome.runtime.lastError);
          }
          resolve();
        });
      } catch (error) {
        console.warn('Chrome storage unavailable while saving integrated crawl count:', error);
        resolve();
      }
    });
  }

  markSearchResultsSource(results = [], defaultSource = 'news') {
    if (!Array.isArray(results)) {
      return [];
    }
    return results.map((item) => {
      if (!item) return item;
      if (!item.searchSource) {
        item.searchSource = defaultSource;
      }
      return item;
    });
  }

  resolveAccuracyCrawlCount(requestedCount, maxAvailable) {
    if (!maxAvailable || maxAvailable <= 0) {
      return 0;
    }

    if (requestedCount === 11) {
      return maxAvailable;
    }

    if (requestedCount === 0) {
      const customInput = document.querySelector('.crawling-custom-value');
      let customValue = customInput ? parseInt(customInput.value, 10) : null;
      if (!customValue || Number.isNaN(customValue)) {
        customValue = this.getCrawlingCountSettingFromCache() || 3;
      }
      const normalized = Math.min(Math.max(customValue, 1), 100);
      return Math.min(normalized, maxAvailable);
    }

    const normalized = Math.min(Math.max(requestedCount || 3, 1), 100);
    return Math.min(normalized, maxAvailable);
  }

  prepareAccuracyCrawlingPlan({
    newsArticles = [],
    integratedArticles = [],
    fallbackArticles = [],
    requestedCount = 3,
    integratedActive = false,
    integratedLimit = 4
  } = {}) {
    if (integratedActive && integratedArticles.length > 0) {
      const limitedPool = integratedArticles.slice(0, integratedLimit);
      return {
        pool: limitedPool,
        targetCount: limitedPool.length,
        source: 'integrated',
        description: `통합 검색 결과 ${limitedPool.length}개`
      };
    }

    const pool = newsArticles.length > 0 ? newsArticles : fallbackArticles;

    if (!pool || pool.length === 0) {
      return {
        pool: [],
        targetCount: 0,
        source: 'news',
        description: '사용 가능한 검색 결과 없음'
      };
    }

    const targetCount = this.resolveAccuracyCrawlCount(requestedCount, pool.length) || pool.length;

    return {
      pool,
      targetCount,
      source: newsArticles.length > 0 ? 'news' : 'mixed',
      description: `${newsArticles.length > 0 ? '뉴스' : '결합'} 결과 ${targetCount}개`
    };
  }

  // 유사 기사 필터링 설정
  getArticleFilterSetting() {
    try {
      const stored = localStorage.getItem('article_filter_enabled');
      // 기본값 false (AI 필터링 비활성화 = API 절약)
      return stored === null ? false : stored === 'true';
    } catch (error) {
      console.error('Failed to read article filter setting:', error);
      return false;
    }
  }

  setArticleFilterSetting(value) {
    try {
      localStorage.setItem('article_filter_enabled', value.toString());
      if (this.isChromeApiAvailable()) {
        chrome.storage.local.set({ article_filter_enabled: value });
      }
    } catch (error) {
      console.error('Failed to save article filter setting:', error);
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
      if (!value && this.getIntegratedSearchSetting()) {
        this.setIntegratedSearchSetting(false);
      }
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
      const parsed = stored !== null ? parseFloat(stored) : 1;
      if (Number.isNaN(parsed)) {
        return 1;
      }
      return Math.min(Math.max(parsed, 0.4), 1);
    } catch (error) {
      console.error('Failed to get panel opacity setting:', error);
      return 1;
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

  // 교차 검증 깊이 설정 가져오기 (고정값 2)
  getCrossVerificationDepthSetting() {
    return 2; // 자기 피드백 루프 2회 고정
  }

  // 교차 검증 깊이 설정 저장 (고정값 2, 설정 변경 무시)
  setCrossVerificationDepthSetting(value) {
    this.crossVerificationDepth = 2; // 항상 2회 고정
    console.log('교차 검증 깊이는 2회로 고정되어 있습니다.');
    return 2;
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
      if (typeof partialResult === 'string') {
        const previousChunk = this.streamingDiffCache.get(blockId) || '';
        let deltaText = partialResult;
        if (previousChunk && partialResult.startsWith(previousChunk)) {
          deltaText = partialResult.substring(previousChunk.length);
        } else if (previousChunk.length > partialResult.length) {
          // 새 스트림으로 재시작한 경우 전체를 사용
          deltaText = partialResult;
        }
        this.streamingDiffCache.set(blockId, partialResult);
        if (deltaText && deltaText.trim()) {
          this.updateBlockTypingArea(blockId, deltaText);
        }
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
    if (collapsedProgressTextElement) {
      const linkedId = this.getCurrentLinkedBlockId();
      const isCurrentBlock = this.isCurrentBlockId(blockId) || (typeof blockId === 'number' && linkedId === blockId);
      if (isCurrentBlock) {
        collapsedProgressTextElement.textContent = progressMessage;
      }
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
    this.streamingDiffCache.delete(blockId);
    this.streamingDiffCache.delete(blockId); // 스트리밍 캐시 정리

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
          console.log('[completeAnalysis] normalizedResult 구조:', JSON.stringify(normalizedResult, null, 2));

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
          console.warn('[completeAnalysis] 저장할 진위 결과를 찾지 못했습니다.');
          console.warn('[completeAnalysis] normalizedResult:', JSON.stringify(normalizedResult, null, 2));
          console.warn('[completeAnalysis] verdict 값:', verdict);
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
    
    this.handlePostAnalysisAutomation(blockId);
  }

  // 분석 완료 후 자동 후속 작업 실행
  handlePostAnalysisAutomation(blockId) {
    if (this.isCurrentBlockId(blockId)) {
      return;
    }

    const block = this.newsBlocks.get(blockId);
    if (!block || block.isComparison || block.status !== 'completed') {
      return;
    }

    const autoFactCheckEnabled = !!this.autoFactCheckEnabled;
    const autoCrossEnabled = !!this.autoCrossVerificationEnabled;

    if (!autoFactCheckEnabled && !autoCrossEnabled) {
      return;
    }

    if (autoFactCheckEnabled && !block.factCheckResult) {
      this.executeAutoFactCheck(blockId, autoCrossEnabled);
      return;
    }

    if (autoCrossEnabled) {
      this.triggerAutoCrossVerification(blockId);
    }
  }

  // 자동 사실 검증 실행
  executeAutoFactCheck(blockId, cascadeToCrossVerification = false) {
    if (this.autoFactCheckQueue.has(blockId)) {
      return;
    }

    if (this.searchInProgress && this.searchInProgress.has(blockId)) {
      return;
    }

    const block = this.newsBlocks.get(blockId);
    if (!block || block.status !== 'completed') {
      return;
    }

    this.autoFactCheckQueue.add(blockId);
    console.log('[Automation] 자동 사실 검증 실행:', blockId);

    this.searchFactCheck(blockId)
      .then((success) => {
        if (cascadeToCrossVerification) {
          if (!success) {
            console.warn('[Automation] 자동 사실 검증이 완료되지 않았지만 교차 검증을 계속 진행합니다.');
          }
          this.triggerAutoCrossVerification(blockId);
        }
      })
      .catch((error) => {
        console.error('[Automation] 자동 사실 검증 실패:', error);
      })
      .finally(() => {
        this.autoFactCheckQueue.delete(blockId);
      });
  }

  // 자동 교차 검증 실행
  triggerAutoCrossVerification(blockId) {
    if (this.crossVerificationInProgress.has(blockId)) {
      return;
    }

    const block = this.newsBlocks.get(blockId);
    if (!block || block.isComparison || block.status !== 'completed' || block.crossVerified) {
      return;
    }

    console.log('[Automation] 자동 교차 검증 실행:', blockId);
    this.startCrossVerification(blockId);
  }

  // 교차 검증 완료 처리
  completeCrossVerification(blockId, crossVerifiedResult) {
    console.log('교차 검증 단계 완료, ID:', blockId);
    
    const isCurrentBlock = this.isCurrentBlockId(blockId);
    
    // 자기 피드백 루프 모듈로 위임
    if (this.selfFeedbackModule.isEnabled()) {
      this.selfFeedbackModule.handleCrossVerificationResult(blockId, crossVerifiedResult, isCurrentBlock);
    } else {
      // 비활성화 시 바로 완료 처리
      const block = isCurrentBlock ? this.currentNews : this.newsBlocks.get(blockId);
      if (block) {
        this.finalizeCrossVerification(blockId, block, isCurrentBlock);
      }
    }
  }
  
  finalizeCrossVerification(blockId, block, isCurrentBlock = false) {
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
    
    // 자기 피드백 루프가 활성화된 경우 최종 검증 결과 사용
    if (this.selfFeedbackModule.isEnabled() && block.verificationHistory && block.verificationHistory.length > 0) {
      // 교차 검증 플래그 설정
      block.crossVerified = true;
      
      // 최종 검증 결과 저장 (마지막 검증 결과)
      const finalResult = block.verificationHistory[block.verificationHistory.length - 1];
      block.crossVerifiedResult = finalResult;
      
      // 상태를 completed로 변경하고 최종 결과로 업데이트
      block.status = 'completed';
      block.result = finalResult;
    } else {
      // 비활성화일 경우 1차 분석 결과 사용
      block.status = 'completed';
      // result는 이미 1차 분석에서 설정됨
    }
    
    // 스트리밍 결과 정리
    this.streamingResults.delete(blockId);
    this.streamingDiffCache.delete(blockId);
    
    const { normalizedResult, verdict, suspicious } = this.parseAnalysisResult(block.result);
    
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
        this.currentNews.result = block.result;
        if (this.selfFeedbackModule.isEnabled()) {
          this.currentNews.crossVerified = true;
          this.currentNews.crossVerifiedResult = block.result;
          this.currentNews.verificationHistory = block.verificationHistory;
          this.currentNews.currentVerificationStep = block.currentVerificationStep;
        }
        this.currentNews.baselineAnalysis = block.baselineAnalysis;  // 1차 분석 결과도 함께 저장
      }
    }
    
    // 저장 및 패널 업데이트 (current가 아닌 경우만)
    if (!isCurrentBlock) {
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
  failAnalysis(blockId, error, shouldDeleteBlock = false) {
    this.streamingResults.delete(blockId); // 스트리밍 결과 정리
    
    // 블록 삭제가 필요한 경우 (치명적인 오류)
    if (shouldDeleteBlock) {
      console.warn('[failAnalysis] 치명적인 오류로 블록 삭제:', blockId, error);
      
      // 타임아웃 제거
      if (this.analysisTimeouts.has(blockId)) {
        clearTimeout(this.analysisTimeouts.get(blockId));
        this.analysisTimeouts.delete(blockId);
      }
      
      // AbortController 제거
      if (this.abortControllers.has(blockId)) {
        this.abortControllers.delete(blockId);
      }
      
      // 교차 검증 상태 제거
      this.crossVerificationInProgress.delete(blockId);
      
      // 블록 삭제
      this.newsBlocks.delete(blockId);
      
      // currentAnalyzingBlockId 초기화
      if (this.currentAnalyzingBlockId === blockId) {
        this.currentAnalyzingBlockId = null;
      }
      
      // currentNews 상태 초기화
      if (this.currentNews && this.activeNewsUrl) {
        const currentState = this.activeNewsStates.get(this.activeNewsUrl);
        if (currentState) {
          this.activeNewsStates.set(this.activeNewsUrl, {
            ...currentState,
            status: 'idle',
            result: null,
            error: error,
            progress: null
          });
        }
      }
      
      // UI 업데이트
      this.updatePanel();
      
      // 사용자에게 알림
      alert(`⚠️ 분석을 시작할 수 없습니다.\n\n${error}`);
      return;
    }
    
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
      if (this.isCurrentBlockId(blockId)) {
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
    
    // 에러 발생 시에도 기존 분석 결과는 유지 (result를 null로 넘기지 않음)
    let block;
    if (this.isCurrentBlockId(blockId)) {
      block = this.currentNews;
    } else {
      block = this.newsBlocks.get(blockId);
    }
    
    // block이 존재하고 기존 result가 있으면 유지, 없으면 null 전달
    const preservedResult = block?.result || null;
    this.updateNewsStatus(blockId, 'error', preservedResult, null, error);
    
    // currentNews가 실패한 경우 상태도 error로 변경 (결과는 유지)
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
    const isCurrentBlock = this.isCurrentBlockId(id);
    const resolvedId = !isCurrentBlock
      ? (typeof id === 'number' ? id : parseInt(id, 10))
      : this.getCurrentLinkedBlockId();
    const targetId = resolvedId !== null && resolvedId !== undefined && !Number.isNaN(resolvedId)
      ? resolvedId
      : id;
    
    // 타임아웃 제거
    if (this.analysisTimeouts.has(targetId)) {
      clearTimeout(this.analysisTimeouts.get(targetId));
      this.analysisTimeouts.delete(targetId);
    }
    
    // API 요청 중단
    if (this.abortControllers.has(targetId)) {
      const controller = this.abortControllers.get(targetId);
      controller.abort();
      this.abortControllers.delete(targetId);
    }
    
    // 스트리밍 결과 정리
    this.streamingResults.delete(targetId);
    this.streamingDiffCache.delete(targetId);
    
    // service_worker에 중단 요청 전송
    if (this.isChromeApiAvailable()) {
      chrome.runtime.sendMessage({
        action: "stopAnalysis",
        blockId: targetId
      }).catch(error => {
        console.error('[stopAnalysis] service_worker 메시지 전송 오류:', error);
      });
    }
    
    // 에러 상태로 변경
    this.failAnalysis(targetId, errorMessage);
  }

  // 뉴스 블록 데이터 저장
  saveNewsBlocks() {
    const blocksData = Array.from(this.newsBlocks.entries()).map(([id, block]) => [id, this.getPersistableBlock(block)]);
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

  getPersistableBlock(block) {
    const { factCheckInProgress, factCheckProgress, ...persistable } = block;
    return { ...persistable };
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
  loadSavedData() {
    if (this.isChromeApiAvailable()) {
      try {
        chrome.storage.local.get(['newsBlocks'], (result) => {
          if (chrome.runtime.lastError) {
            console.log('Chrome storage failed, falling back to localStorage:', chrome.runtime.lastError);
            this.loadFromLocalStorage();
          } else if (result.newsBlocks) {
            this.restoreNewsBlocks(result.newsBlocks);
            this.restoreAnalyzingState();
            this.reconcileAnalyzingBlocks();
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
        this.restoreAnalyzingState();
        this.reconcileAnalyzingBlocks();
        this.updatePanel();
        this.syncCurrentNewsWithHistory();
      }
    } catch (error) {
      console.error('Error parsing saved news blocks:', error);
    }
  }

  reconcileAnalyzingBlocks() {
    const analyzingIds = Array.from(this.newsBlocks.entries())
      .filter(([, block]) => block?.status === 'analyzing')
      .map(([id]) => id);
    if (analyzingIds.length === 0) {
      return;
    }

    const fallbackMessage = '페이지 또는 확장 프로그램이 새로 고쳐져 분석이 중단되었습니다. 다시 시도해주세요.';

    if (!this.isChromeApiAvailable()) {
      this.markAnalyzingBlocksAsInterrupted(new Set(), fallbackMessage);
      return;
    }

    try {
      chrome.runtime.sendMessage({ action: 'getActiveAnalyses' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[reconcileAnalyzingBlocks] runtime error:', chrome.runtime.lastError.message);
          this.markAnalyzingBlocksAsInterrupted(new Set(), fallbackMessage);
          return;
        }

        const activeIds = new Set(Array.isArray(response?.activeBlockIds) ? response.activeBlockIds : []);
        this.markAnalyzingBlocksAsInterrupted(activeIds, fallbackMessage);
      });
    } catch (error) {
      console.warn('[reconcileAnalyzingBlocks] 메시지 전송 실패:', error);
      this.markAnalyzingBlocksAsInterrupted(new Set(), fallbackMessage);
    }
  }

  markAnalyzingBlocksAsInterrupted(activeIds = new Set(), message = '이전 세션에서 분석이 중단되었습니다. 다시 시도해주세요.') {
    let hasChanges = false;
    const ensureNumber = (value) => {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? value : parsed;
    };
    const normalizedActiveIds = new Set(Array.from(activeIds || []).map(ensureNumber));

    for (const [id, block] of this.newsBlocks.entries()) {
      if (!block || block.status !== 'analyzing') {
        continue;
      }

      if (!normalizedActiveIds.has(id)) {
        block.status = 'error';
        block.progress = null;
        block.error = message;
        hasChanges = true;
      }
    }

    const currentIsActive = normalizedActiveIds.has(this.currentAnalyzingBlockId);
    if (!currentIsActive && this.currentAnalyzingBlockId !== null) {
      this.currentAnalyzingBlockId = normalizedActiveIds.values().next().value ?? null;
      hasChanges = true;
    }

    if (hasChanges) {
      this.saveNewsBlocks();
      this.updatePanel();
    }
  }

  // 뉴스 블록 데이터 복원
  restoreNewsBlocks(savedData) {
    if (savedData && savedData.blocks) {
      this.newsBlocks = new Map(savedData.blocks);
      this.blockIdCounter = savedData.counter || 0;
      this.newsBlocks.forEach(block => {
        if (block) {
          block.factCheckInProgress = false;
          block.factCheckProgress = null;
        }
      });
      console.log('Restored', this.newsBlocks.size, 'news blocks');
    }
  }

  restoreAnalyzingState() {
    let latestAnalyzing = null;
    for (const [id, block] of this.newsBlocks.entries()) {
      if (block && block.status === 'analyzing') {
        const timestamp = block.timestamp || 0;
        if (!latestAnalyzing || timestamp > latestAnalyzing.timestamp) {
          latestAnalyzing = { id, timestamp };
        }
      }
    }

    if (latestAnalyzing) {
      this.currentAnalyzingBlockId = latestAnalyzing.id;
      console.log('[restoreAnalyzingState] 분석 진행 중인 블록 복원:', latestAnalyzing.id);
    } else {
      this.currentAnalyzingBlockId = null;
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
    console.log('[addNewsBlock] 블록 추가 시작:', newsData.id, '제목:', newsData.title?.substring(0, 30));
    console.log('[addNewsBlock] 현재 블록 수:', this.newsBlocks.size, '상태:', newsData.status);
    
    // 블록 수 제한: 20개 초과 시 가장 오래된 블록 삭제
    if (this.newsBlocks.size >= this.MAX_NEWS_BLOCKS) {
      const sortedBlocks = Array.from(this.newsBlocks.entries())
        .sort((a, b) => a[1].id - b[1].id);
      const oldestId = sortedBlocks[0][0];
      console.log(`[addNewsBlock] 블록 수 제한(${this.MAX_NEWS_BLOCKS})에 도달, 가장 오래된 블록 삭제:`, oldestId);
      this.removeNewsBlock(oldestId);
    }

    // 기본 분석 모드 지정 (사실 검증 실행 전에는 일반 분석)
    if (!newsData.factCheckMode) {
      newsData.factCheckMode = 'standard';
    }

    // 기존 로직...
    this.newsBlocks.set(newsData.id, newsData);
    console.log('[addNewsBlock] 블록 추가 완료, 총 블록 수:', this.newsBlocks.size);
    console.log('[addNewsBlock] newsBlocks IDs:', Array.from(this.newsBlocks.keys()));
    
    this.updateAnalysisCount(); // 카운트 업데이트
    this.saveNewsBlocks();
    this.updatePanel();
  }

  // 뉴스 블록 제거할 때 카운트 업데이트 (병렬 분석 지원)
  removeNewsBlock(newsId) {
    if (!this.newsBlocks.has(newsId)) {
      return;
    }

    const removedBlock = this.newsBlocks.get(newsId);
    this.newsBlocks.delete(newsId);
    console.log('[removeNewsBlock] 블록 삭제:', newsId, '남은 블록 수:', this.newsBlocks.size);

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

    // 제거된 블록과 같은 URL의 activeNewsStates 업데이트
    if (removedBlock && removedBlock.url) {
      const removedNormalized = normalizeUrl(removedBlock.url);
      
      for (const [stateUrl, state] of this.activeNewsStates.entries()) {
        if (normalizeUrl(state.url) === removedNormalized) {
          state.status = 'pending';
          state.result = null;
          state.progress = null;
          state.error = null;
          
          if (typeof window.updateHighlightColors === 'function') {
            window.updateHighlightColors(null);
          }
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
    
    .unified-spinner {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: conic-gradient(#0f0f0f 0deg, #f5f5f5 330deg, #0f0f0f 360deg);
      mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
      -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
      animation: spinnerCycle 0.9s linear infinite;
    }

    .unified-spinner--small {
      width: 16px;
      height: 16px;
    }

    .unified-spinner--medium {
      width: 26px;
      height: 26px;
    }

    .unified-spinner--large {
      width: 44px;
      height: 44px;
    }

    @keyframes spinnerCycle {
      to { transform: rotate(360deg); }
    }

    .streaming-snippet-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      gap: 3px;
      width: 100%;
      height: 56px;
      max-height: 56px;
      position: relative;
      overflow: hidden;
      pointer-events: none;
      padding: 0;
      flex-shrink: 0;
    }

    .streaming-snippet {
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      font-size: 11px;
      color: #F8FAFC;
      line-height: 1.4;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
      opacity: 0;
      transform: translateY(14px) scale(0.9);
      animation: streamFloat 1.6s cubic-bezier(0.42, 0, 0.35, 1) forwards;
      will-change: transform, opacity;
      max-width: 85%;
      text-align: center;
      word-break: break-word;
    }

    @keyframes streamFloat {
      0% { opacity: 0; transform: translateY(14px) scale(0.88); }
      18% { opacity: 1; }
      75% { opacity: 0.9; transform: translateY(-16px) scale(0.87); }
      100% { opacity: 0; transform: translateY(-28px) scale(0.82); }
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

AnalysisPanel.prototype.findSimilarArticles = async function(blockId, skipLock = false) {
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

  // 이미 검색 중인지 확인 (skipLock이 false일 때만)
  if (!skipLock && this.searchInProgress.has(blockId)) {
    alert('이미 검색이 진행 중입니다.');
    return;
  }

  // Google API 키 확인
  const apiKey = await this.getGoogleApiKey();
  if (!apiKey && this.USE_REAL_API) {
    alert('Google Custom Search API 키가 필요합니다.\n설정에서 API 키를 입력해주세요.');
    return;
  }

  if (!skipLock) {
    this.searchInProgress.add(blockId);
  }
  
  // 로딩 인디케이터 표시
  this.showSearchLoading(blockId, 'similar');
  
  try {
    const querySet = this.buildVerificationQuerySet(block);
    const rawQuery = querySet.rawNews || block.title;
    const searchQuery = querySet.news || this.refineSearchQuery(block.title || '');
    const cacheKey = `similar_${searchQuery}`;

    // 영구 캐시 확인 (API 절약)
    const cachedResults = this.getFromSearchCache(cacheKey);
    if (cachedResults) {
      console.log('[findSimilarArticles] ✅ 캐시에서 결과 반환');
      this.hideSearchLoading(blockId);
      if (!skipLock) {
        this.showSearchResults(blockId, cachedResults, 'similar');
      } else {
        console.log('[findSimilarArticles] skipLock=true, 캐시 UI 표시 생략');
      }
      this.searchInProgress.delete(blockId);
      return;
    }

    console.log('[findSimilarArticles] 원본 뉴스 검색어:', rawQuery);
    console.log('[findSimilarArticles] 정제된 쿼리:', searchQuery);
    console.log('[findSimilarArticles] USE_REAL_API:', this.USE_REAL_API);

    let results;
    let integratedFallbackUsed = false;
    if (this.USE_REAL_API) {
      try {
        // 실제 Google Search API 호출 (최대 10개 요청)
        results = await this.callGoogleSearchAPI(searchQuery, 'news', 10);
        
        if (results.length === 0) {
          console.warn('[findSimilarArticles] 검색 결과 없음');
          this.hideSearchLoading(blockId);
          alert('유사한 뉴스 기사를 찾을 수 없습니다.\n다른 검색어로 시도해보세요.');
          this.searchInProgress.delete(blockId);
          return;
        }
      } catch (error) {
        console.error('[findSimilarArticles] Google Search API 호출 실패:', error);
        this.hideSearchLoading(blockId);
        
        // GOOGLE_QUOTA_EXCEEDED 에러는 이미 callGoogleSearchAPI에서 모달 표시됨
        if (error.message === 'GOOGLE_QUOTA_EXCEEDED') {
          console.log('[findSimilarArticles] 쿼터 초과 에러, 모달 이미 표시됨');
        } else {
          alert('뉴스 검색 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.');
        }
        
        this.searchInProgress.delete(blockId);
        return;
      }
    } else {
      // Mock 데이터 반환
      console.log('[findSimilarArticles] Mock 데이터 사용');
      results = this.getMockSimilarArticles();
    }

    console.log('[findSimilarArticles] 검증된 뉴스 결과:', results.length, '개');

    // AI 필터링 적용 (설정이 켜져 있을 때만)
    const articleFilterEnabled = this.getArticleFilterSetting();
    console.log('[findSimilarArticles] 필터링 설정 상태:', articleFilterEnabled ? 'ON (AI 필터링 활성화)' : 'OFF (필터링 비활성화)');
    
    if (articleFilterEnabled && results.length > 1) {
      console.log('[findSimilarArticles] 🤖 AI 필터링 시작:', results.length, '개');
      console.log('[findSimilarArticles] 필터링 전 제목 목록:');
      results.forEach((article, index) => {
        console.log(`  ${index + 1}. ${article.title}`);
      });
      
      // 로딩 표시
      this.showSearchLoading(blockId, '🤖 AI 필터링 중...');
      
      try {
        // 현재 블록 정보 가져오기
        const block = this.newsBlocks.get(blockId);
        
        // AI 필터링 실행
        const filteredResults = await this.filterArticlesWithAI(block, results);
        
        console.log('[findSimilarArticles] ✅ AI 필터링 완료:', filteredResults.length, '개 (제거:', results.length - filteredResults.length, '개)');
        console.log('[findSimilarArticles] 필터링 후 제목 목록:');
        filteredResults.forEach((article, index) => {
          console.log(`  ${index + 1}. ${article.title}`);
        });
        
        results = filteredResults;
        
        if (results.length > 0) {
          // 필터링된 결과를 캐시에 저장
          this.saveToSearchCache(cacheKey, results);
        }
      } catch (error) {
        console.error('[findSimilarArticles] AI 필터링 실패:', error);
        // 실패 시 원본 결과 사용
        console.log('[findSimilarArticles] ⚠️ AI 필터링 실패, 원본 결과 사용');
        
        // 429 에러인 경우 사용자에게 알림
        if (error.message && error.message.includes('429')) {
          this.showSearchLoading(blockId, '⚠️ API 할당량 초과 (설정에서 필터링 OFF 권장)');
          setTimeout(() => this.hideSearchLoading(blockId), 3000);
        }
        
        this.saveToSearchCache(cacheKey, results);
      }
    } else {
      console.log('[findSimilarArticles] ✅ 필터링 비활성화, 검색 결과 전체 표시:', results.length, '개');
      console.log('[findSimilarArticles] 전체 제목 목록:');
      results.forEach((article, index) => {
        console.log(`  ${index + 1}. ${article.title}`);
      });
      // 원본 캐시에 저장
      this.saveToSearchCache(cacheKey, results);
    }

    // 로딩 숨김
    this.hideSearchLoading(blockId);
    
    // skipLock=true일 때는 UI 표시 안 함 (자동 실행이므로)
    if (!skipLock) {
      this.showSearchResults(blockId, results, 'similar');
    } else {
      console.log('[findSimilarArticles] skipLock=true, UI 표시 생략 (자동 실행)');
    }

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
    return false;
  }

  if (block.status !== 'completed' || !block.result) {
    alert('분석이 완료된 뉴스만 사실 검증을 할 수 있습니다.');
    return false;
  }

  // 이미 검색 중인지 확인
  if (this.searchInProgress.has(blockId)) {
    if (this.autoFactCheckQueue && this.autoFactCheckQueue.has(blockId)) {
      console.log('[searchFactCheck] 자동 사실 검증이 이미 진행 중입니다.');
      return false;
    }
    alert('이미 검색이 진행 중입니다.');
    return false;
  }

  // Google API 키 확인
  const apiKey = await this.getGoogleApiKey();
  if (!apiKey && this.USE_REAL_API) {
    alert('Google Custom Search API 키가 필요합니다.\n설정에서 API 키를 입력해주세요.');
    return false;
  }

  this.searchInProgress.add(blockId);
  
  // 로딩 인디케이터 표시 + 실시간 상황 업데이트
  this.showSearchLoading(blockId, 'fact');
  this.updateFactCheckStatus(blockId, '🔍 검색 중...');
  
  try {
    const querySet = this.buildVerificationQuerySet(block);
    const newsRawQuery = querySet.rawNews || block.title;
    const integratedRawQuery = querySet.rawAll || newsRawQuery;
    const newsSearchQuery = querySet.news || this.refineSearchQuery(block.title || '');
    const integratedSearchQuery = querySet.all || newsSearchQuery;
    
    console.log('[searchFactCheck] 뉴스 검색어:', newsSearchQuery);
    console.log('[searchFactCheck] 통합 검색어:', integratedSearchQuery);
    this.updateFactCheckStatus(blockId, `🔎 "${newsSearchQuery.substring(0, 30)}..." 검색 중`);

    let results;
    let integratedFallbackUsed = false;
    const similarCacheKey = `similar_${newsSearchQuery}`;
    const cachedSimilarResults = this.getFromSearchCache(similarCacheKey);

    if (cachedSimilarResults && cachedSimilarResults.length > 0) {
      console.log('[searchFactCheck] 🔄 유사 기사 캐시 발견, 재사용:', cachedSimilarResults.length, '개');
      this.updateFactCheckStatus(blockId, `♻️ 유사 기사 ${cachedSimilarResults.length}개 재사용 중...`);
      results = this.markSearchResultsSource(cachedSimilarResults, 'news');
    } else {
      console.log('[searchFactCheck] 🔍 유사 기사 캐시 없음, 자동 검색 실행');
      this.updateFactCheckStatus(blockId, '🔍 유사 기사 검색 중...');
      
      // 유사 기사 자동 검색 실행
      try {
        await this.findSimilarArticles(blockId, true); // skipLock=true로 호출하여 중복 락 방지
        
        // 검색 후 캐시 재확인
        const newCachedResults = this.getFromSearchCache(similarCacheKey);
        if (newCachedResults && newCachedResults.length > 0) {
          console.log('[searchFactCheck] ✅ 유사 기사 검색 완료, 재사용:', newCachedResults.length, '개');
          this.updateFactCheckStatus(blockId, `✅ 유사 기사 ${newCachedResults.length}개 확보`);
          results = this.markSearchResultsSource(newCachedResults, 'news');
        } else if (this.USE_REAL_API) {
          console.error('[searchFactCheck] 유사 기사 검색 실패');
          this.updateFactCheckStatus(blockId, '❌ 유사 기사 검색 실패');
          setTimeout(() => this.clearFactCheckStatus(blockId), 3000);
          this.searchInProgress.delete(blockId);
          return false;
        } else {
          results = this.markSearchResultsSource(this.getMockFactCheckResults(), 'news');
        }
      } catch (error) {
        console.error('[searchFactCheck] 유사 기사 검색 중 오류:', error);
        this.updateFactCheckStatus(blockId, '❌ 검색 오류');
        setTimeout(() => this.clearFactCheckStatus(blockId), 3000);
        this.searchInProgress.delete(blockId);
        return false;
      }
    }

    console.log('[searchFactCheck] 검증된 뉴스 기사:', results.length, '개');
    
    // 통합 검색 병렬 실행 (필터링 없이)
    let integratedResults = [];
    const shouldRunIntegratedSearch = this.getIntegratedSearchSetting() && this.getGoogleSearchEnabled() && this.USE_REAL_API;
    
    console.log('[searchFactCheck] 통합 검색 조건 체크:', {
      integratedSearchEnabled: this.getIntegratedSearchSetting(),
      googleEnabled: this.getGoogleSearchEnabled(),
      useRealAPI: this.USE_REAL_API,
      shouldRun: shouldRunIntegratedSearch
    });
    
    if (shouldRunIntegratedSearch) {
      console.log('[searchFactCheck] 🌐 통합 검색 병렬 실행 시작');
      this.updateFactCheckStatus(blockId, '🌐 통합 검색 병행 중...');
      try {
        integratedResults = await this.callGoogleSearchAPI(integratedSearchQuery, 'integrated', 8);
        if (integratedResults.length > 0) {
          integratedResults = this.markSearchResultsSource(integratedResults, 'integrated');
          console.log('[searchFactCheck] 🌐 통합 검색 결과:', integratedResults.length, '개');
          this.updateFactCheckStatus(blockId, `🌐 통합 검색 ${integratedResults.length}개 확보`);
        } else {
          console.log('[searchFactCheck] 🌐 통합 검색 결과 없음');
        }
      } catch (error) {
        console.error('[searchFactCheck] 통합 검색 실패:', error);
        
        // GOOGLE_QUOTA_EXCEEDED 에러는 이미 callGoogleSearchAPI에서 모달 표시됨
        if (error.message === 'GOOGLE_QUOTA_EXCEEDED') {
          console.log('[searchFactCheck] 쿼터 초과 에러, 모달 이미 표시됨');
          this.updateFactCheckStatus(blockId, '⚠️ API 할당량 초과');
        } else {
          this.updateFactCheckStatus(blockId, '⚠️ 통합 검색 실패');
        }
      }
    }
    
    // 필터링 없이 뉴스 결과 사용
    console.log('[searchFactCheck] ✅ 필터링 비활성화, 뉴스 결과 전체 사용:', results.length, '개');
    if (integratedResults.length > 0) {
      console.log('[searchFactCheck] ✅ 통합 검색 결과도 필터링 없이 사용:', integratedResults.length, '개');
    }
    
    // 크롤링 우선순위 확인
    const crawlingPriority = await this.getCrawlingPrioritySetting();
    console.log('[searchFactCheck] 크롤링 우선순위:', crawlingPriority);
    
    // 속도 모드면 크롤링 스킵하고 snippet만 사용
    if (crawlingPriority === 'speed') {
      console.log('[searchFactCheck] ⚡ 속도 모드: 크롤링 생략, snippet만 사용');
      this.updateFactCheckStatus(blockId, '⚡ 빠른 검증 중...');
      
      // snippet이 있는 기사만 필터링
      const articlesWithSnippet = results.filter(article => article.snippet && article.snippet.length > 50);
      
      if (articlesWithSnippet.length < 2) {
        console.warn('[searchFactCheck] snippet이 충분한 기사 부족:', articlesWithSnippet.length, '개');
        this.updateFactCheckStatus(blockId, '❌ 검증 가능한 기사 부족');
        setTimeout(() => this.clearFactCheckStatus(blockId), 3000);
        this.searchInProgress.delete(blockId);
        return false;
      }
      
      // snippet만 사용하여 즉시 검증 진행
      const comparisonArticles = articlesWithSnippet.slice(0, 5);
      console.log('[searchFactCheck] snippet 검증 기사:', comparisonArticles.length, '개');
      
      // AI 검증으로 바로 이동 (재분석은 건너뛰기)
      this.updateFactCheckStatus(blockId, '🤖 AI 검증 중...');
      const verification = await this.verifyFactsWithAI(block, comparisonArticles);
      
      console.log('[searchFactCheck] ⚡ 속도 모드: 재분석 생략, 기존 분석 결과 유지');
      
      // 최종 통합 분석 수행 (속도 모드에서도 실행)
      this.updateFactCheckStatus(blockId, '🎯 최종 통합 분석 중...');
      let finalAnalysis = null;
      try {
        finalAnalysis = await this.performFinalIntegratedAnalysis(block, comparisonArticles, verification);
        console.log('[searchFactCheck] ⚡ 속도 모드: 최종 통합 분석 완료:', finalAnalysis);
      } catch (error) {
        console.error('[searchFactCheck] 최종 통합 분석 실패:', error);
      }
      
      const factCheckResult = {
        articles: comparisonArticles,
        verification: verification,
        reanalyzed: null, // 속도 모드에서는 재분석 없음
        finalAnalysis: finalAnalysis, // 최종 통합 분석 결과 추가
        timestamp: Date.now(),
        mode: 'speed'
      };
      
      block.factCheckResult = factCheckResult;
      block.factCheckMode = 'speed';
      
      // 기존 분석 결과에 사실검증 필드 추가 (패널 표시용)
      if (!block.result.사실검증) {
        block.result.사실검증 = verification;
        console.log('[searchFactCheck] ⚡ 속도 모드: 기존 분석에 검증 결과 추가');
      }
      
      console.log('[searchFactCheck] factCheckResult 저장 완료:', factCheckResult);
      
      this.saveNewsBlocks();
      
      // currentNews와 URL이 동일하면 함께 업데이트
      if (this.currentNews && this.currentNews.url) {
        const normalizeUrl = (urlString) => {
          try {
            const urlObj = new URL(urlString);
            return urlObj.origin + urlObj.pathname;
          } catch {
            return urlString;
          }
        };
        
        if (normalizeUrl(this.currentNews.url) === normalizeUrl(block.url)) {
          this.currentNews.factCheckResult = block.factCheckResult;
          console.log('[searchFactCheck] currentNews도 함께 업데이트됨');
        }
      }
      
      console.log('[searchFactCheck] 블록 저장 완료 (영구 저장)');
      this.updateFactCheckStatus(blockId, '✅ 검증 완료!');
      setTimeout(() => this.clearFactCheckStatus(blockId), 2000);
      
      this.renderPanel(document.getElementById(this.panelId));
      this.searchInProgress.delete(blockId);
      return true;
    }
    
    // 정확도 모드: 크롤링 수행
    console.log('[searchFactCheck] 🎯 정확도 모드: 크롤링으로 전체 본문 수집');
    
    const crawlingCountSetting = await this.getCrawlingCountSetting();
    const integratedCrawlCountSetting = await this.getIntegratedCrawlCountSetting();
    
    // 뉴스와 통합 검색 결과를 분리하여 크롤링
    const newsArticles = results.filter(article => (article.searchSource || 'news') === 'news');
    const integratedArticles = integratedResults.filter(article => article.searchSource === 'integrated');
    
    console.log('[searchFactCheck] 크롤링 대상 - 뉴스:', newsArticles.length, '개, 통합:', integratedArticles.length, '개');
    
    // 크롤링 계획: 뉴스 우선, 통합 검색은 설정값 사용
    // 방어 코드: 설정값이 실제 리스트 개수보다 크면 자동으로 조정
    const newsCrawlTarget = Math.min(crawlingCountSetting, newsArticles.length);
    const integratedCrawlTarget = integratedArticles.length > 0 ? Math.min(integratedCrawlCountSetting, integratedArticles.length) : 0;
    
    console.log('[searchFactCheck] 크롤링 목표 - 뉴스:', newsCrawlTarget, '개 (설정:', crawlingCountSetting, '), 통합:', integratedCrawlTarget, '개 (설정:', integratedCrawlCountSetting, ')');
    
    this.updateFactCheckStatus(blockId, `✅ 뉴스 ${newsCrawlTarget}개 크롤링 시작...`);
    
    // 뉴스 기사 크롤링
    const crawledArticles = [];
    const failedArticles = [];
    
    // 뉴스 기사 크롤링 (방어 코드: 목표 개수 도달 시 즉시 종료)
    for (let i = 0; i < newsArticles.length && crawledArticles.length < newsCrawlTarget; i++) {
      const article = { ...newsArticles[i], searchSource: 'news' };
      this.updateFactCheckStatus(blockId, `📰 ${i + 1}/${newsCrawlTarget}: "${article.title.substring(0, 25)}..." 크롤링 중`);
      
      try {
        const crawledContent = await this.crawlArticleContent(article.link);
        
        if (crawledContent) {
          crawledArticles.push({ ...article, crawledContent });
          this.updateFactCheckStatus(blockId, `✅ 뉴스 ${crawledArticles.length}/${newsCrawlTarget}개 크롤링 성공`);
          console.log('[searchFactCheck] 뉴스 크롤링 성공:', crawledArticles.length, '/', newsCrawlTarget);
          
          // 방어 코드: 목표 개수에 도달하면 즉시 루프 종료
          if (crawledArticles.length >= newsCrawlTarget) {
            console.log('[searchFactCheck] ✅ 뉴스 크롤링 목표 달성, 루프 종료');
            break;
          }
        } else {
          console.warn('[searchFactCheck] 크롤링 실패, 지능형 모드 재시도:', article.link);
          this.updateFactCheckStatus(blockId, `🤖 지능형 크롤링 시도 중...`);
          const advancedContent = await this.crawlArticleContent(article.link, true);
          
          if (advancedContent) {
            crawledArticles.push({ ...article, crawledContent: advancedContent });
            this.updateFactCheckStatus(blockId, `✅ 뉴스 ${crawledArticles.length}/${newsCrawlTarget}개 크롤링 성공 (지능형)`);
            console.log('[searchFactCheck] 지능형 크롤링 성공:', crawledArticles.length, '/', newsCrawlTarget);
            
            // 방어 코드: 목표 개수에 도달하면 즉시 루프 종료
            if (crawledArticles.length >= newsCrawlTarget) {
              console.log('[searchFactCheck] ✅ 뉴스 크롤링 목표 달성 (지능형), 루프 종료');
              break;
            }
          } else {
            failedArticles.push(article);
            console.log('[searchFactCheck] 뉴스 크롤링 실패:', i + 1, '/', newsCrawlTarget);
          }
        }
        
        await this.delay(500);
      } catch (error) {
        console.error('[searchFactCheck] 뉴스 크롤링 오류:', error);
        failedArticles.push(article);
      }
    }
    
    // 통합 검색 결과 크롤링
    const integratedCrawled = [];
    if (integratedCrawlTarget > 0) {
      console.log('[searchFactCheck] 🌐 통합 검색 결과 크롤링 시작:', integratedCrawlTarget, '개');
      this.updateFactCheckStatus(blockId, `🌐 통합 검색 ${integratedCrawlTarget}개 크롤링 시작...`);
      
      for (let i = 0; i < integratedArticles.length && integratedCrawled.length < integratedCrawlTarget; i++) {
        const article = { ...integratedArticles[i], searchSource: 'integrated' };
        this.updateFactCheckStatus(blockId, `🌐 ${i + 1}/${integratedCrawlTarget}: "${article.title.substring(0, 25)}..." 크롤링 중`);
        
        try {
          const crawledContent = await this.crawlArticleContent(article.link, true); // 통합은 바로 지능형 모드
          
          if (crawledContent) {
            integratedCrawled.push({ ...article, crawledContent });
            this.updateFactCheckStatus(blockId, `✅ 통합 ${integratedCrawled.length}/${integratedCrawlTarget}개 크롤링 성공`);
            console.log('[searchFactCheck] 통합 크롤링 성공:', integratedCrawled.length, '/', integratedCrawlTarget);
            
            // 방어 코드: 목표 개수에 도달하면 즉시 루프 종료
            if (integratedCrawled.length >= integratedCrawlTarget) {
              console.log('[searchFactCheck] ✅ 통합 크롤링 목표 달성, 루프 종료');
              break;
            }
          } else {
            console.log('[searchFactCheck] 통합 크롤링 실패:', i + 1, '/', integratedCrawlTarget);
          }
          
          await this.delay(500);
        } catch (error) {
          console.error('[searchFactCheck] 통합 크롤링 오류:', error);
        }
      }
      
      // 통합 검색 결과를 전체 목록에 추가
      crawledArticles.push(...integratedCrawled);
      console.log('[searchFactCheck] 최종 크롤링 결과 - 뉴스:', crawledArticles.length - integratedCrawled.length, '개, 통합:', integratedCrawled.length, '개');
    }
    
    // 최종 검증
    if (crawledArticles.length === 0 && failedArticles.length > 0) {
      console.warn('[searchFactCheck] 모든 크롤링 실패, 요약만 사용:', failedArticles.length, '개');
      this.updateFactCheckStatus(blockId, `⚠️ 크롤링 실패, ${Math.min(failedArticles.length, newsCrawlTarget)}개 기사 요약만 사용`);
      crawledArticles.push(...failedArticles.slice(0, newsCrawlTarget));
    }
    
    const successCount = crawledArticles.filter(a => a.crawledContent).length;
    const snippetCount = crawledArticles.filter(a => !a.crawledContent).length;
    const newsCount = crawledArticles.filter(a => a.searchSource === 'news').length;
    const integratedCount = crawledArticles.filter(a => a.searchSource === 'integrated').length;
    
    console.log('[searchFactCheck] 최종 결과 - 크롤링 성공:', successCount, '개, 요약만:', snippetCount, '개');
    console.log('[searchFactCheck] 출처별 - 뉴스:', newsCount, '개, 통합:', integratedCount, '개');
    console.log('[searchFactCheck] 📰 크롤링 우선 사용: snippet은 fallback으로만 사용됨');

    this.updateFactCheckStatus(blockId, '🤖 AI 비교 검증 중...');
    
    // AI 분석 요청 (원본 뉴스와 크롤링된 기사들 비교)
    const verificationResult = await this.verifyFactsWithAI(block, crawledArticles);
    
    this.updateFactCheckStatus(blockId, '✨ 전체 재분석 중...');
    
    // Gemini로 전체 재분석 (기존 분석 + 본문 + 사실 검증 결과)
    const previousResultSnapshot = block.result ? JSON.parse(JSON.stringify(block.result)) : null;
    const reanalyzedResult = await this.reanalyzeWithFactCheck(block, crawledArticles, verificationResult);
    
    this.updateFactCheckStatus(blockId, '🎯 최종 통합 분석 중...');
    
    // 최종 통합 분석 수행 (BACKUP service_worker 방식)
    let finalAnalysis = null;
    try {
      finalAnalysis = await this.performFinalIntegratedAnalysis(block, crawledArticles, verificationResult);
      console.log('[searchFactCheck] ✅ 최종 통합 분석 완료:', finalAnalysis);
    } catch (error) {
      console.error('[searchFactCheck] 최종 통합 분석 실패:', error);
      this.handleApiError(error, '최종 통합 분석');
      // 실패해도 계속 진행 (선택적 기능)
    }
    
    this.updateFactCheckStatus(blockId, '🎉 검증 완료!');
    
    // 결과를 블록에 저장
    block.factCheckResult = {
      articles: crawledArticles,
      verification: verificationResult,
      reanalyzed: reanalyzedResult,
      finalAnalysis: finalAnalysis, // 최종 통합 분석 결과 추가
      previousResult: previousResultSnapshot,
      timestamp: Date.now(),
      mode: 'accuracy'
    };
    if (previousResultSnapshot) {
      block.firstAnalysis = previousResultSnapshot;
    }
    block.factCheckMode = 'accuracy';
    
    console.log('[searchFactCheck] factCheckResult 저장 완료:', block.factCheckResult);
    
    // 재분석 결과로 블록 업데이트
    block.result = reanalyzedResult;
    this.newsBlocks.set(blockId, block);
    
    // currentNews와 URL이 동일하면 함께 업데이트
    if (this.currentNews && this.currentNews.url) {
      const normalizeUrl = (urlString) => {
        try {
          const urlObj = new URL(urlString);
          return urlObj.origin + urlObj.pathname;
        } catch {
          return urlString;
        }
      };
      
      if (normalizeUrl(this.currentNews.url) === normalizeUrl(block.url)) {
        this.currentNews.result = reanalyzedResult;
        this.currentNews.factCheckResult = block.factCheckResult;
        console.log('[searchFactCheck] currentNews도 함께 업데이트됨');
      }
    }
    
    // 영구 저장 (chrome.storage + localStorage)
    this.saveNewsBlocks();
    console.log('[searchFactCheck] 블록 저장 완료 (영구 저장)');
    this.updatePanel();
    
    // 사실 검증 완료 후 자동으로 상세 결과 표시
    setTimeout(() => {
      console.log('[searchFactCheck] 사실 검증 완료, 상세 결과 자동 표시');
      this.showAnalysisResult(blockId);
    }, 500);
    
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
    return true;
  } catch (error) {
    console.error('[searchFactCheck] 오류:', error);
    this.hideSearchLoading(blockId);
    this.updateFactCheckStatus(blockId, '❌ 오류 발생');
    
    const errorMessage = this.getSearchErrorMessage(error.message);
    alert(errorMessage);
    
    setTimeout(() => this.clearFactCheckStatus(blockId), 3000);
    return false;
  } finally {
    this.searchInProgress.delete(blockId);
  }
};

AnalysisPanel.prototype.getGoogleApiKey = async function() {
  const key = await this.fetchStoredApiKey('google_search_api_key');
  return key || null;
};

AnalysisPanel.prototype.saveGoogleApiKey = async function(apiKey) {
  try {
    await this.persistApiKeyValue('google_search_api_key', apiKey);
    this.refreshApiKeyFlags();
    return true;
  } catch (error) {
    console.error('Google API 키 저장 오류:', error);
    throw error;
  }
};

AnalysisPanel.prototype.callGoogleSearchAPI = async function(query, type, limit) {
  console.log('[callGoogleSearchAPI] 호출:', query, type, limit);
  
  // Google Search API 사용 횟수 증가 (호출 시작 시점에 카운트)
  this.incrementApiUsage('google', 1);
  console.log(`[API Count] Google Search API 호출 - 타입: ${type}, 쿼리: ${query}`);
  
  // CSE ID 고정값 사용
  const CSE_ID_NEWS = "70364eb765310426e";      // 뉴스 전용 검색 엔진
  const CSE_ID_KEYWORD = "241358ac91fe04cd8";   // 기존 키워드 검색
  const CSE_ID_INTEGRATED = "b26295ab5634547cd"; // 통합 검색 전용 CSE
  let cseId;
  if (type === 'news') {
    cseId = CSE_ID_NEWS;
  } else if (type === 'integrated') {
    cseId = CSE_ID_INTEGRATED;
  } else {
    cseId = CSE_ID_KEYWORD;
  }
  
  // API 키 확인
  const apiKey = await this.getGoogleApiKey();
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }
  
  // 날짜 필터 추가 (최근 1년 이내)
  const dt = this.getCurrentDateTimeInfo();
  const oneYearAgo = new Date(dt.iso);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const dateRestrict = oneYearAgo.toISOString().split('T')[0]; // YYYY-MM-DD
  
  let url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${cseId}&q=${encodeURIComponent(query)}&num=${limit}`;
  
  // 뉴스 검색 시 날짜 정렬 추가
  if (type === 'news') {
    url += `&sort=date&dateRestrict=y1`; // 최근 1년, 날짜순 정렬
  }
  
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
        const errorMessage = errorData.error?.message || '';
        if (errorMessage.includes('quota') || errorMessage.includes('Limit Exceeded') || errorMessage.includes('Daily Limit')) {
          // Google Search API 할당량 초과 - 카운트 초기화 및 모달 표시
          console.log('[callGoogleSearchAPI] Google Search API 할당량 초과 - 카운트 초기화');
          this.resetApiUsageCount('google');
          this.updateApiQuotaDisplay();
          
          this.showErrorModal(
            'Google Search API 할당량 초과',
            'Google Custom Search API의 일일 무료 할당량(100회)을 모두 사용하셨습니다.\n\n내일 다시 이용하거나, Google Cloud Console에서 유료 플랜으로 업그레이드할 수 있습니다.\n\n또는 새로운 API 키를 발급받아 설정에서 변경할 수 있습니다.',
            `상태 코드: ${response.status}\n메시지: ${errorMessage}`
          );
          
          throw new Error('GOOGLE_QUOTA_EXCEEDED');
        }
        throw new Error('API_KEY_INVALID');
      } else if (response.status === 429) {
        // Too Many Requests: 할당량 초과
        console.log('[callGoogleSearchAPI] Google Search API 할당량 초과 (429) - 카운트 초기화');
        this.resetApiUsageCount('google');
        this.updateApiQuotaDisplay();
        
        this.showErrorModal(
          'Google Search API 할당량 초과',
          'Google Custom Search API의 일일 무료 할당량(100회)을 모두 사용하셨습니다.\n\n내일 다시 이용하거나, Google Cloud Console에서 유료 플랜으로 업그레이드할 수 있습니다.\n\n또는 새로운 API 키를 발급받아 설정에서 변경할 수 있습니다.',
          `상태 코드: ${response.status}`
        );
        
        throw new Error('GOOGLE_QUOTA_EXCEEDED');
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
    
    // 뉴스 외 도메인 필터링 (소셜미디어, 쇼핑, 비뉴스 사이트 제외)
    const excludedDomains = [
      'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
      'youtube.com', 'tiktok.com', 'pinterest.com',
      'coupang.com', 'aliexpress.com', 'gmarket.co.kr', '11st.co.kr',
      'auction.co.kr', 'interpark.com', 'wemakeprice.com',
      'hypebeast.kr', 'hypebeast.com'
    ];
    
    const filteredItems = data.items.filter(item => {
      const link = (item.link || '').toLowerCase();
      const displayLink = (item.displayLink || '').toLowerCase();
      
      // 제외 도메인 체크
      const isExcluded = excludedDomains.some(domain => 
        link.includes(domain) || displayLink.includes(domain)
      );
      
      return !isExcluded;
    });
    
    let orderedItems = filteredItems;

    // 통합 검색은 필터링하지 않음 (신뢰 도메인 검증 스킵)
    if (type === 'keyword') {
      orderedItems = await this.prioritizeFactCheckResults(filteredItems);
    }

    // 결과 포맷팅
    const sourceTag = type === 'integrated' ? 'integrated' : 'news';
    let formattedResults = orderedItems.slice(0, limit).map(item => ({
      title: item.title || '제목 없음',
      snippet: item.snippet || '요약 없음',
      link: item.link || '',
      displayLink: item.displayLink || '',
      pagemap: item.pagemap || {},
      searchSource: sourceTag
    }));
    
    // ✅ 1단계: URL 정규화 및 중복 제거 (뉴스 검색에만 적용)
    if (type === 'news') {
      console.log('[callGoogleSearchAPI] 중복 제거 전:', formattedResults.length, '개');
      formattedResults = this.deduplicateArticles(formattedResults);
      console.log('[callGoogleSearchAPI] 중복 제거 후:', formattedResults.length, '개');
    }
    
    return formattedResults;
    
  } catch (error) {
    console.error('[callGoogleSearchAPI] 요청 실패:', error);
    
    // 네트워크 오류
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      throw new Error('NETWORK_ERROR');
    }
    
    throw error;
  }
};

// ✅ URL 정규화 함수: 추적 파라미터 제거
AnalysisPanel.prototype.normalizeURL = function(urlString) {
  try {
    const url = new URL(urlString);
    
    // 추적용 쿼리 파라미터 제거 (utm_, fbclid, gclid 등)
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'fbclid', 'gclid', 'msclkid', 
      'mc_cid', 'mc_eid', // Mailchimp
      '_ga', '_gl', // Google Analytics
      'ref', 'referrer', // 레퍼러
      'source', 'share', // 공유 추적
      'ncid', 'cmpid' // 뉴스 캠페인 ID
    ];
    
    trackingParams.forEach(param => {
      url.searchParams.delete(param);
    });
    
    // 정규화된 URL 반환 (origin + pathname + 정리된 쿼리)
    let normalized = url.origin + url.pathname;
    
    // 남은 쿼리가 있으면 추가
    const remainingParams = url.searchParams.toString();
    if (remainingParams) {
      normalized += '?' + remainingParams;
    }
    
    return normalized;
  } catch (error) {
    console.warn('[normalizeURL] URL 파싱 실패:', urlString, error);
    return urlString; // 실패 시 원본 반환
  }
};

// ✅ 제목 전처리 함수: 불필요한 태그/특수문자 제거
AnalysisPanel.prototype.normalizeTitle = function(title) {
  if (!title) return '';
  
  let normalized = title;
  
  // 1. 뉴스 태그 제거 ([단독], [속보], [영상] 등)
  normalized = normalized.replace(/\[.*?\]/g, '');
  normalized = normalized.replace(/【.*?】/g, '');
  
  // 2. 괄호 안 부가 설명 제거 (예: "사건 발생 (상세)")
  normalized = normalized.replace(/\(.*?\)/g, '');
  normalized = normalized.replace(/（.*?）/g, '');
  
  // 3. 따옴표 제거
  normalized = normalized.replace(/["'「」『』""'']/g, '');
  
  // 4. 특수문자 정리 (공백으로 치환)
  normalized = normalized.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');
  
  // 5. 연속 공백 제거
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // 6. 소문자 변환
  normalized = normalized.toLowerCase();
  
  return normalized;
};

// ✅ 제목 유사도 계산 함수 (단순 토큰 기반 Jaccard 유사도)
AnalysisPanel.prototype.calculateTitleSimilarity = function(title1, title2) {
  const tokens1 = new Set(this.normalizeTitle(title1).split(/\s+/).filter(t => t.length > 0));
  const tokens2 = new Set(this.normalizeTitle(title2).split(/\s+/).filter(t => t.length > 0));
  
  // 교집합
  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  
  // 합집합
  const union = new Set([...tokens1, ...tokens2]);
  
  if (union.size === 0) return 0;
  
  // Jaccard 유사도
  return intersection.size / union.size;
};

// ✅ 중복 기사 제거 (1단계: URL, 2단계: 언론사 + 제목)
AnalysisPanel.prototype.deduplicateArticles = function(articles) {
  console.log('[deduplicateArticles] 중복 제거 시작, 총:', articles.length, '개');
  
  // 1단계: URL 기준 중복 제거
  const urlMap = new Map();
  
  articles.forEach(article => {
    const normalizedURL = this.normalizeURL(article.link);
    
    // 같은 정규화 URL이 이미 있으면 스킵 (먼저 들어온 것 유지)
    if (!urlMap.has(normalizedURL)) {
      urlMap.set(normalizedURL, article);
    } else {
      console.log('[deduplicateArticles] 🔗 URL 중복 제거:', article.title);
    }
  });
  
  console.log('[deduplicateArticles] URL 정규화 후:', urlMap.size, '개');
  
  // 2단계: 같은 언론사 + 제목 유사도 기반 중복 제거
  const uniqueArticles = [];
  const urlMapValues = Array.from(urlMap.values());
  
  urlMapValues.forEach(article => {
    const currentDomain = article.displayLink || '';
    const currentTitle = article.title || '';
    
    // 이미 추가된 기사들 중 같은 언론사인 것들과 비교
    const isDuplicate = uniqueArticles.some(existing => {
      const existingDomain = existing.displayLink || '';
      
      // 같은 언론사인가?
      if (currentDomain !== existingDomain) {
        return false; // 다른 언론사면 중복 아님
      }
      
      // 제목 유사도 계산
      const similarity = this.calculateTitleSimilarity(currentTitle, existing.title);
      
      // 유사도 0.9 이상이면 중복으로 판단
      if (similarity >= 0.9) {
        console.log('[deduplicateArticles] 📰 제목 유사 중복 제거:', currentTitle, '(유사도:', similarity.toFixed(2), ')');
        return true;
      }
      
      return false;
    });
    
    if (!isDuplicate) {
      uniqueArticles.push(article);
    }
  });
  
  console.log('[deduplicateArticles] ✅ 최종 결과:', uniqueArticles.length, '개 (제거:', articles.length - uniqueArticles.length, '개)');
  
  return uniqueArticles;
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

// 뉴스 기사 여부 검증 (일반 모드 - 유사 기사 찾기용)
AnalysisPanel.prototype.validateNewsArticle = async function(result) {
  const link = (result.link || '').toLowerCase();
  const displayLink = (result.displayLink || '').toLowerCase();
  const title = (result.title || '').toLowerCase();
  
  // 1단계: 명확한 뉴스 도메인 화이트리스트
  const trustedNewsDomains = [
    'naver.com/news', 'news.naver.com',
    'news.daum.net', 'v.daum.net/v',
    'chosun.com', 'joongang.co.kr', 'donga.com',
    'hankyung.com', 'mk.co.kr', 'sedaily.com',
    'ytn.co.kr', 'yna.co.kr', 'newsis.com',
    'sbs.co.kr/news', 'kbs.co.kr/news', 'mbc.co.kr/news',
    'jtbc.co.kr/news', 'yonhapnewstv.co.kr',
    'hani.co.kr', 'khan.co.kr', 'seoul.co.kr',
    'mt.co.kr', 'etnews.com', 'edaily.co.kr'
  ];
  
  const isTrustedNews = trustedNewsDomains.some(domain => 
    link.includes(domain) || displayLink.includes(domain)
  );
  
  if (isTrustedNews) {
    return true;
  }
  
  // 2단계: 뉴스 패턴 검증
  const newsPatterns = [
    '/news/', '/article/', '/view/',
    'newsId=', 'articleId=', 'aid='
  ];
  
  const hasNewsPattern = newsPatterns.some(pattern => link.includes(pattern));
  
  // 3단계: 제외 패턴 (쇼핑, SNS, 포럼 등)
  const excludePatterns = [
    'shopping', 'shop', 'store', 'mall', 'product',
    'blog', 'cafe', 'community', 'forum',
    'youtube', 'instagram', 'facebook', 'twitter',
    'event', 'coupon', 'promotion'
  ];
  
  const hasExcludePattern = excludePatterns.some(pattern => 
    link.includes(pattern) || displayLink.includes(pattern) || title.includes(pattern)
  );
  
  // 뉴스 패턴이 있고 제외 패턴이 없으면 유효
  return hasNewsPattern && !hasExcludePattern;
};

// 뉴스 기사 엄격 검증 (사실 확인용 - 신뢰도 높은 뉴스만)
AnalysisPanel.prototype.validateNewsArticleStrict = async function(result) {
  const link = (result.link || '').toLowerCase();
  const displayLink = (result.displayLink || '').toLowerCase();
  
  // 1단계: 신뢰할 수 있는 주요 언론사만 허용
  const trustedNewsDomains = [
    // 포털 뉴스
    'naver.com/news', 'news.naver.com', 'n.news.naver.com',
    'news.daum.net', 'v.daum.net/v', 'v.daum.net',
    
    // 종합 일간지
    'chosun.com', 'joongang.co.kr', 'donga.com',
    'hani.co.kr', 'khan.co.kr', 'seoul.co.kr',
    
    // 경제지
    'hankyung.com', 'mk.co.kr', 'sedaily.com',
    'mt.co.kr', 'edaily.co.kr', 'fnnews.com',
    
    // 통신사
    'ytn.co.kr', 'yna.co.kr', 'newsis.com',
    'yonhapnewstv.co.kr',
    
    // 방송사 (모바일 포함)
    'sbs.co.kr', 'm.sbs.co.kr',
    'kbs.co.kr', 'm.kbs.co.kr',
    'mbc.co.kr', 'imnews.imbc.com',
    'jtbc.co.kr', 'news.jtbc.co.kr',
    'tvchosun.com',
    
    // IT/전문지
    'etnews.com', 'zdnet.co.kr', 'bloter.net'
  ];
  
  const isTrustedNews = trustedNewsDomains.some(domain => 
    link.includes(domain) || displayLink.includes(domain)
  );
  
  if (!isTrustedNews) {
    console.log('[validateNewsArticleStrict] 신뢰 도메인 아님:', displayLink);
    return false;
  }
  
  // 2단계: 뉴스 URL 패턴 선택 검증 (필수 아님, 기본적으로 통과)
  const newsPatterns = [
    '/news/', '/article/', '/view/', '/mnews/',
    'newsId=', 'articleId=', 'aid=', 'ncd='
  ];
  
  const hasNewsPattern = newsPatterns.some(pattern => link.includes(pattern));
  
  // 신뢰 도메인이면 패턴 검증 생략 가능 (예: v.daum.net/v/...)
  if (!hasNewsPattern) {
    console.log('[validateNewsArticleStrict] ⚠️ 패턴 없지만 신뢰 도메인이므로 통과:', link);
  }
  
  // 3단계: 제외 패턴 강화 (사설, 칼럼, 인터뷰 등 제외)
  const strictExcludePatterns = [
    'opinion', 'column', 'editorial', 'interview',
    'blog', 'review', 'essay', 'comment'
  ];
  
  const hasExcludePattern = strictExcludePatterns.some(pattern => 
    link.includes(pattern)
  );
  
  if (hasExcludePattern) {
    console.log('[validateNewsArticleStrict] 제외 패턴 발견:', link);
    return false;
  }
  
  console.log('[validateNewsArticleStrict] ✅ 검증 통과:', displayLink);
  return true;
};

AnalysisPanel.prototype.showSearchResults = function(blockId, results, type) {
  console.log('[showSearchResults] 결과 표시:', blockId, type, results);
  
  const typeName = type === 'similar' ? '유사 기사' : '사실 검증';
  const icon = type === 'similar' ? '📰' : '🔍';
  
  // 페이지네이션 설정
  const itemsPerPage = 5;
  let currentPage = 0;
  const totalPages = Math.ceil(results.length / itemsPerPage);
  
  // 검색 결과를 HTML로 렌더링
  const renderResults = (page = 0) => {
    if (!results || results.length === 0) {
      return '<p style="color: #737373; text-align: center; padding: 20px;">검색 결과가 없습니다.</p>';
    }
    
    // 현재 페이지의 결과만 추출
    const startIndex = page * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageResults = results.slice(startIndex, endIndex);
    
    return pageResults.map((r, i) => {
      const globalIndex = startIndex + i;
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
          ">${globalIndex + 1}번째 결과</div>
          
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
          ${renderResults(currentPage)}
        </div>
        
        ${totalPages > 1 ? `
          <div class="pagination-controls" style="
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #D1D5DB;
          ">
            <button class="prev-page-btn" style="
              padding: 8px 16px;
              background: #BF9780;
              color: white;
              border: none;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: background 0.2s;
              display: flex;
              align-items: center;
              gap: 6px;
            " ${currentPage === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
              ◀ 이전
            </button>
            
            <div class="page-info" style="
              font-size: 14px;
              color: #404040;
              font-weight: 600;
            ">
              <span class="current-page">${currentPage + 1}</span> / ${totalPages}
            </div>
            
            <button class="next-page-btn" style="
              padding: 8px 16px;
              background: #BF9780;
              color: white;
              border: none;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: background 0.2s;
              display: flex;
              align-items: center;
              gap: 6px;
            " ${currentPage === totalPages - 1 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
              다음 ▶
            </button>
          </div>
        ` : ''}
      `}
    </div>
  `;

  document.body.appendChild(modal);

  // 페이지 업데이트 함수
  const updatePage = () => {
    const container = modal.querySelector('.search-results-container');
    const pageInfo = modal.querySelector('.current-page');
    const prevBtn = modal.querySelector('.prev-page-btn');
    const nextBtn = modal.querySelector('.next-page-btn');
    
    if (container) {
      container.innerHTML = renderResults(currentPage);
      
      // 새로 렌더링된 항목에 이벤트 재적용
      const newItems = container.querySelectorAll('.search-result-item');
      newItems.forEach(item => {
        item.addEventListener('click', () => {
          const url = item.getAttribute('data-url');
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        });
        
        item.addEventListener('mouseenter', () => {
          item.style.transform = 'translateY(-2px)';
          item.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.transform = 'translateY(0)';
          item.style.boxShadow = 'none';
        });
      });
    }
    
    if (pageInfo) {
      pageInfo.textContent = currentPage + 1;
    }
    
    // 버튼 활성화/비활성화
    if (prevBtn) {
      if (currentPage === 0) {
        prevBtn.disabled = true;
        prevBtn.style.opacity = '0.5';
        prevBtn.style.cursor = 'not-allowed';
      } else {
        prevBtn.disabled = false;
        prevBtn.style.opacity = '1';
        prevBtn.style.cursor = 'pointer';
      }
    }
    
    if (nextBtn) {
      if (currentPage === totalPages - 1) {
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.5';
        nextBtn.style.cursor = 'not-allowed';
      } else {
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
        nextBtn.style.cursor = 'pointer';
      }
    }
  };

  // 애니메이션
  setTimeout(() => {
    modal.style.opacity = '1';
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.style.transform = 'scale(1)';
    }
  }, 10);

  // 페이지네이션 버튼 이벤트
  const prevBtn = modal.querySelector('.prev-page-btn');
  const nextBtn = modal.querySelector('.next-page-btn');
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 0) {
        currentPage--;
        updatePage();
      }
    });
    
    prevBtn.addEventListener('mouseenter', () => {
      if (!prevBtn.disabled) {
        prevBtn.style.background = '#A68570';
      }
    });
    prevBtn.addEventListener('mouseleave', () => {
      if (!prevBtn.disabled) {
        prevBtn.style.background = '#BF9780';
      }
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentPage < totalPages - 1) {
        currentPage++;
        updatePage();
      }
    });
    
    nextBtn.addEventListener('mouseenter', () => {
      if (!nextBtn.disabled) {
        nextBtn.style.background = '#A68570';
      }
    });
    nextBtn.addEventListener('mouseleave', () => {
      if (!nextBtn.disabled) {
        nextBtn.style.background = '#BF9780';
      }
    });
  }

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
      title: '[Mock] 연합뉴스 테스트 기사',
      snippet: '이것은 유사한 내용을 다루는 기사입니다. Mock 데이터입니다.',
      link: 'https://www.yna.co.kr/view/AKR20241115000100001'
    },
    {
      title: '[Mock] 조선일보 테스트 기사',
      snippet: '같은 주제를 다른 관점에서 다룬 기사입니다.',
      link: 'https://www.chosun.com/politics/2024/11/15/test-article/'
    },
    {
      title: '[Mock] 한겨레 테스트 기사',
      snippet: '비슷한 사건에 대한 다른 언론사의 보도입니다.',
      link: 'https://www.hani.co.kr/arti/society/society_general/test'
    },
    {
      title: '[Mock] 중앙일보 테스트 기사',
      snippet: '이 사건의 후속 보도 내용입니다.',
      link: 'https://www.joins.com/article/test-article'
    }
  ];
};

AnalysisPanel.prototype.getMockFactCheckResults = function() {
  return [
    {
      title: '[팩트체크 1] 공식 발표 자료',
      snippet: '정부 기관에서 발표한 공식 자료입니다. 해당 주장은 사실로 확인되었습니다.',
      link: 'https://factcheck.example.com/verify1',
      searchSource: 'news'
    },
    {
      title: '[팩트체크 2] 전문가 검증 의견',
      snippet: '전문가들이 검증한 결과 일부 과장된 내용이 포함되어 있습니다.',
      link: 'https://factcheck.example.com/verify2',
      searchSource: 'news'
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

AnalysisPanel.prototype.normalizeVerificationQueries = function(rawQueries) {
  if (!rawQueries || typeof rawQueries !== 'object') {
    return null;
  }

  const sanitized = {};

  if (typeof rawQueries.news === 'string') {
    const trimmed = rawQueries.news.trim();
    if (trimmed) {
      sanitized.news = trimmed;
    }
  }

  if (typeof rawQueries.all === 'string') {
    const trimmed = rawQueries.all.trim();
    if (trimmed) {
      sanitized.all = trimmed;
    }
  }

  return Object.keys(sanitized).length ? sanitized : null;
};

AnalysisPanel.prototype.buildVerificationQuerySet = function(block) {
  const result = block?.result || {};
  const normalized = this.normalizeVerificationQueries(result.verification_queries);

  const fallbackNews = result.검색어 || result.키워드 || result.요약 || block?.title || '';
  const fallbackAll = result.키워드 || result.근거 || result.요약 || block?.title || fallbackNews;

  const rawNews = normalized?.news || fallbackNews;
  const rawAll = normalized?.all || fallbackAll;

  const newsQuery = this.refineSearchQuery(rawNews);
  const allQueryCandidate = this.refineSearchQuery(rawAll);

  return {
    rawNews,
    rawAll,
    news: newsQuery || this.refineSearchQuery(fallbackNews) || this.refineSearchQuery(block?.title || ''),
    all: allQueryCandidate || newsQuery || this.refineSearchQuery(block?.title || ''),
    hasCustomNews: Boolean(normalized?.news),
    hasCustomAll: Boolean(normalized?.all)
  };
};

AnalysisPanel.prototype.mergeSearchResults = function(primary = [], secondary = []) {
  const merged = [];
  const seen = new Set();

  const pushUnique = (item) => {
    if (!item) return;
    const keySource = item.link || item.displayLink || JSON.stringify(item);
    if (!keySource) return;
    const normalizedKey = keySource.toLowerCase();
    if (seen.has(normalizedKey)) return;
    seen.add(normalizedKey);
    merged.push(item);
  };

  primary.forEach(pushUnique);
  secondary.forEach(pushUnique);

  return merged;
};

// 검색 로딩 인디케이터 표시 (패널 내부 처리만 사용, 전역 오버레이 제거)
AnalysisPanel.prototype.showSearchLoading = function() {
  // no-op: block 자체에 표시되는 로딩만 유지
};

// 검색 로딩 인디케이터 숨김
AnalysisPanel.prototype.hideSearchLoading = function() {
  // no-op: 상단과 동일
};

// 디버그 정보 모달 표시
AnalysisPanel.prototype.showDebugModal = function(blockId) {
  const block = this.newsBlocks.get(blockId);
  if (!block || !block.result) {
    alert('분석 결과가 없습니다.');
    return;
  }

  const result = block.result;
  
  // 값 포맷팅
  const formatValue = (value, key = '', depth = 0) => {
    if (value === null || value === undefined) {
      return '<span style="color: #9CA3AF; font-style: italic;">null</span>';
    }
    if (typeof value === 'boolean') {
      return `<span style="color: #10B981; font-weight: 600;">${value}</span>`;
    }
    if (typeof value === 'number') {
      return `<span style="color: #3B82F6; font-weight: 600;">${value}</span>`;
    }
    if (typeof value === 'string') {
      const escaped = this.escapeHtml(value);
      // 줄바꿈 유지
      const withBreaks = escaped.replace(/\n/g, '<br>');
      return `<span style="color: #0D0D0D; line-height: 1.6;">${withBreaks}</span>`;
    }
    if (Array.isArray(value)) {
      const uniqueId = `array-${key}-${depth}-${Math.random().toString(36).substr(2, 9)}`;
      const items = value.map((item, index) => `
        <div style="padding: 8px 12px; border-bottom: 1px solid rgba(191, 151, 128, 0.15);">
          <span style="color: #8B5A3C; font-weight: 600; margin-right: 8px;">[${index}]</span>
          ${formatValue(item, `${key}-${index}`, depth + 1)}
        </div>
      `).join('');
      
      return `
        <div style="display: inline-block; width: 100%;">
          <button onclick="
            const content = document.getElementById('${uniqueId}');
            const icon = this.querySelector('.toggle-icon');
            if (content.style.display === 'none') {
              content.style.display = 'block';
              icon.textContent = '▼';
            } else {
              content.style.display = 'none';
              icon.textContent = '▶';
            }
          " style="
            background: rgba(139, 92, 241, 0.12);
            border: 1px solid rgba(139, 92, 241, 0.35);
            color: #8B5CF6;
            padding: 4px 10px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s;
          " onmouseover="this.style.background='rgba(139, 92, 241, 0.2)'" onmouseout="this.style.background='rgba(139, 92, 241, 0.12)'">
            <span class="toggle-icon">▶</span> Array (${value.length}개 항목)
          </button>
          <div id="${uniqueId}" style="
            display: none;
            margin-top: 8px;
            border: 1px solid rgba(139, 92, 241, 0.25);
            border-radius: 8px;
            background: rgba(139, 92, 241, 0.05);
            overflow: hidden;
          ">
            ${items}
          </div>
        </div>
      `;
    }
    if (typeof value === 'object') {
      const uniqueId = `obj-${key}-${depth}-${Math.random().toString(36).substr(2, 9)}`;
      const entries = Object.entries(value).map(([k, v]) => `
        <div style="padding: 8px 12px; border-bottom: 1px solid rgba(191, 151, 128, 0.15); display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: start;">
          <span style="color: #8B5A3C; font-weight: 600;">${this.escapeHtml(k)}</span>
          <div>${formatValue(v, `${key}-${k}`, depth + 1)}</div>
        </div>
      `).join('');
      
      return `
        <div style="display: inline-block; width: 100%;">
          <button onclick="
            const content = document.getElementById('${uniqueId}');
            const icon = this.querySelector('.toggle-icon');
            if (content.style.display === 'none') {
              content.style.display = 'block';
              icon.textContent = '▼';
            } else {
              content.style.display = 'none';
              icon.textContent = '▶';
            }
          " style="
            background: rgba(245, 158, 11, 0.12);
            border: 1px solid rgba(245, 158, 11, 0.35);
            color: #F59E0B;
            padding: 4px 10px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s;
          " onmouseover="this.style.background='rgba(245, 158, 11, 0.2)'" onmouseout="this.style.background='rgba(245, 158, 11, 0.12)'">
            <span class="toggle-icon">▶</span> Object (${Object.keys(value).length}개 속성)
          </button>
          <div id="${uniqueId}" style="
            display: none;
            margin-top: 8px;
            border: 1px solid rgba(245, 158, 11, 0.25);
            border-radius: 8px;
            background: rgba(245, 158, 11, 0.05);
            overflow: hidden;
          ">
            ${entries}
          </div>
        </div>
      `;
    }
    return String(value);
  };

  // 섹션별 그룹화
  const sections = {
    '기본 정보': ['진위', '요약', '키워드', '검색어'],
    '상세 분석': ['분석', '근거', '사실검증완료'],
    '기타': []
  };

  // 각 키를 적절한 섹션에 배치
  const sortedKeys = Object.keys(result);
  sortedKeys.forEach(key => {
    let placed = false;
    for (const [section, keys] of Object.entries(sections)) {
      if (keys.includes(key)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      sections['기타'].push(key);
    }
  });

  // 섹션별 렌더링
  const renderSections = () => {
    return Object.entries(sections)
      .filter(([_, keys]) => keys.length > 0 && keys.some(k => result[k] !== undefined))
      .map(([sectionName, keys]) => {
        const rows = keys
          .filter(key => result[key] !== undefined)
          .map(key => `
            <div style="
              padding: 14px 18px;
              border-bottom: 1px solid rgba(191, 151, 128, 0.2);
              display: grid;
              grid-template-columns: 140px 1fr;
              gap: 16px;
              align-items: start;
            ">
              <div style="
                font-weight: 700;
                color: #8B5A3C;
                font-size: 13px;
                padding-top: 2px;
              ">${this.escapeHtml(key)}</div>
              <div style="
                color: #0D0D0D;
                font-size: 13px;
                word-break: break-word;
                line-height: 1.65;
              ">${formatValue(result[key])}</div>
            </div>
          `).join('');

        return `
          <div style="margin-bottom: 20px;">
            <div style="
              background: linear-gradient(135deg, #BF9780 0%, #A67F66 100%);
              padding: 10px 18px;
              border-radius: 8px 8px 0 0;
              display: flex;
              align-items: center;
              gap: 8px;
            ">
              <span style="font-size: 16px;">${this.getSectionIcon(sectionName)}</span>
              <h3 style="
                color: #FFFFFF;
                font-size: 15px;
                font-weight: 700;
                margin: 0;
              ">${sectionName}</h3>
            </div>
            <div style="
              background: #FFFFFF;
              border: 1px solid rgba(191, 151, 128, 0.3);
              border-top: none;
              border-radius: 0 0 8px 8px;
            ">
              ${rows}
            </div>
          </div>
        `;
      }).join('');
  };

  const modal = document.createElement('div');
  modal.className = 'debug-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(13,13,13,0.65);
    backdrop-filter: blur(4px);
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
      border-radius: 16px;
      padding: 0;
      width: 92%;
      max-width: 900px;
      max-height: 88vh;
      overflow: hidden;
      position: relative;
      transform: scale(0.85);
      transition: transform 0.3s ease;
      border: 2px solid #BF9780;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
      display: flex;
      flex-direction: column;
    ">
      <div style="
        background: linear-gradient(135deg, #8B5A3C 0%, #6B4423 100%);
        padding: 24px 32px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 2px solid #BF9780;
        flex-shrink: 0;
      ">
        <div>
          <h2 style="
            color: #FFFFFF;
            font-size: 22px;
            font-weight: 800;
            margin: 0 0 6px 0;
            display: flex;
            align-items: center;
            gap: 10px;
          ">
            <span>🐛</span>
            <span>디버그 정보</span>
          </h2>
          <p style="
            color: rgba(255, 255, 255, 0.85);
            font-size: 13px;
            margin: 0;
            font-weight: 500;
          ">Block ID: ${blockId} | 분석 결과 원본 데이터</p>
        </div>
        <button class="close-modal" style="
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.25);
          font-size: 24px;
          color: #FFFFFF;
          cursor: pointer;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          transition: all 0.2s;
          font-weight: 300;
        ">&times;</button>
      </div>
      
      <div style="
        padding: 28px 32px;
        overflow-y: auto;
        flex: 1;
      ">
        ${renderSections()}
        
        <div style="
          margin-top: 8px;
          padding: 18px 20px;
          background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
          border: 2px solid #F59E0B;
          border-radius: 10px;
          box-shadow: 0 4px 6px rgba(245, 158, 11, 0.15);
        ">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <span style="font-size: 20px;">💡</span>
            <strong style="color: #92400E; font-size: 15px; font-weight: 700;">개발자 팁</strong>
          </div>
          <p style="color: #78350F; font-size: 13px; line-height: 1.6; margin: 0;">
            이 정보는 AI가 반환한 원본 결과입니다. 브라우저 콘솔에서도 확인할 수 있습니다.
          </p>
        </div>
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
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.style.transform = 'scale(0.85)';
    }
    setTimeout(() => modal.remove(), 300);
  };

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // 호버 효과
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'rgba(255, 255, 255, 0.25)';
    closeBtn.style.transform = 'scale(1.08)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'rgba(255, 255, 255, 0.15)';
    closeBtn.style.transform = 'scale(1)';
  });

  // 콘솔에도 출력
  console.log('[Debug Modal] Block ID:', blockId);
  console.log('[Debug Modal] Result:', result);
};

// 섹션별 아이콘 반환
AnalysisPanel.prototype.getSectionIcon = function(sectionName) {
  const icons = {
    '기본 정보': '📋',
    '상세 분석': '🔍',
    '기타': '📦'
  };
  return icons[sectionName] || '📄';
};

// 실시간 사실 검증 상황 표시 함수들
AnalysisPanel.prototype.setFactCheckState = function(blockId, { inProgress, progressText }) {
  const block = this.newsBlocks.get(blockId);
  if (!block) {
    return;
  }

  let changed = false;

  if (typeof inProgress === 'boolean' && block.factCheckInProgress !== inProgress) {
    block.factCheckInProgress = inProgress;
    if (!inProgress) {
      block.factCheckProgress = null;
    }
    changed = true;
  }

  if (typeof progressText === 'string' && block.factCheckProgress !== progressText) {
    block.factCheckProgress = progressText;
    changed = true;
  }

  if (changed) {
    this.newsBlocks.set(blockId, block);
    this.updatePanel();
  }
};

AnalysisPanel.prototype.updateFactCheckStatus = function(blockId, statusText) {
  this.setFactCheckState(blockId, { inProgress: true, progressText: statusText });
};

AnalysisPanel.prototype.clearFactCheckStatus = function(blockId) {
  this.setFactCheckState(blockId, { inProgress: false });
};

// AI를 사용하여 유사 기사 필터링
AnalysisPanel.prototype.filterArticlesWithAI = async function(block, articles) {
  console.log('[filterArticlesWithAI] 필터링 시작, 기사:', articles.length, '개');
  console.log('[filterArticlesWithAI] 원본 뉴스 제목:', block.title);
  console.log('[filterArticlesWithAI] 원본 뉴스 내용 길이:', (block.content || block.result?.요약 || '').length, '자');
  
  if (!articles || articles.length === 0) {
    return articles;
  }
  
  try {
    // 현재 뉴스 정보
    const currentNews = {
      title: block.title,
      content: block.content || block.result?.요약 || '',
      summary: block.result?.요약 || ''
    };
    
    console.log('[filterArticlesWithAI] 📤 Gemini에 보낼 데이터:');
    console.log('  원본 제목:', currentNews.title);
    console.log('  원본 내용:', currentNews.content.substring(0, 200) + '...');
    
    // 검색된 기사 리스트 생성
    const articlesList = articles.map((article, index) => {
      return `${index + 1}. [제목] ${article.title}\n   [출처] ${article.displayLink || article.link}\n   [요약] ${article.snippet || '없음'}`;
    }).join('\n\n');
    
    console.log('[filterArticlesWithAI] 검색된 기사 목록:\n' + articlesList);
    
    // AI 프롬프트 생성
    const dateTimeContext = this.getDateTimeContext();
    const prompt = `${dateTimeContext}

당신은 뉴스 관련성 분석 전문가입니다. 주어진 원본 뉴스와 검색된 유사 기사들을 비교하여, **현재 뉴스와 관련 없는 기사들을 제외**해주세요.

**원본 뉴스:**
제목: ${currentNews.title}
내용: ${currentNews.content.substring(0, 500)}...

**검색된 유사 기사 목록:**
${articlesList}

**제외 기준:**
1. 완전히 다른 주제를 다루는 기사
2. 같은 키워드를 사용하지만 전혀 다른 맥락의 기사
3. 관련 없는 광고성 기사
4. 원본 뉴스와 시간적/공간적 연관성이 전혀 없는 기사

**유지 기준:**
1. 같은 사건이나 이슈를 다루는 기사
2. 관련된 배경 정보를 제공하는 기사
3. 동일 인물/기관에 대한 기사
4. 원본 뉴스의 사실 확인에 도움이 되는 기사

**중요:** 너무 엄격하게 제외하지 말고, 조금이라도 관련이 있다면 유지하세요.

다음 JSON 형식으로만 응답하세요:
{
  "Exclude": [제외할 기사 번호 배열, 예: [1, 4, 7]]
}`;

    console.log('[filterArticlesWithAI] 📤 프롬프트 길이:', prompt.length, '자');
    console.log('[filterArticlesWithAI] 🚀 Gemini API 호출 중...');
    
    // Gemini API 호출
    const response = await chrome.runtime.sendMessage({
      action: 'analyzeNewsWithGemini',
      prompt: prompt,
      isStreaming: false,
      newsContent: null
    });
    
    console.log('[filterArticlesWithAI] 📥 Gemini 응답 받음:', response);
    
    if (!response || !response.success) {
      const errorMsg = response?.error || 'Unknown error';
      console.error('[filterArticlesWithAI] ❌ API 호출 실패:', errorMsg);
      
      // 429 에러 (할당량 초과) 체크
      if (typeof errorMsg === 'string' && errorMsg.includes('429')) {
        console.warn('[filterArticlesWithAI] ⚠️ Gemini API 일일 할당량 초과');
        this.showQuotaErrorToast(null);
      }
      
      return articles;
    }
    
    console.log('[filterArticlesWithAI] 📥 AI 원본 응답:', response.result);
    
    // JSON 파싱
    let filterResult;
    const rawResult = response.result ?? response;
    try {
      if (rawResult && typeof rawResult === 'object') {
        const candidate = Array.isArray(rawResult)
          ? rawResult.find(item => item && typeof item === 'object')
          : rawResult;
        if (candidate?.output && typeof candidate.output === 'object') {
          filterResult = candidate.output;
        } else {
          filterResult = candidate;
        }
      } else {
        let jsonText = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult ?? {});
        jsonText = jsonText.trim();
        if (jsonText.includes('```json')) {
          jsonText = jsonText.split('```json')[1].split('```')[0].trim();
        } else if (jsonText.includes('```')) {
          jsonText = jsonText.split('```')[1].split('```')[0].trim();
        }
        
        filterResult = JSON.parse(jsonText);
      }
    } catch (error) {
      console.error('[filterArticlesWithAI] JSON 파싱 실패:', error);
      return articles;
    }
    
    // 제외 목록 확인
    const excludeIndices = filterResult.Exclude || [];
    console.log('[filterArticlesWithAI] 🗑️ 제외할 기사 번호:', excludeIndices);
    
    if (!Array.isArray(excludeIndices) || excludeIndices.length === 0) {
      console.log('[filterArticlesWithAI] ℹ️ 제외할 기사 없음, 전체 유지');
      return articles;
    }
    
    // 제외될 기사 제목 로깅
    excludeIndices.forEach(idx => {
      if (articles[idx - 1]) {
        console.log(`  ❌ 제외: ${idx}. ${articles[idx - 1].title}`);
      }
    });
    
    // 필터링된 결과 생성 (1-based index를 0-based로 변환)
    const filteredArticles = articles.filter((_, index) => {
      return !excludeIndices.includes(index + 1);
    });
    
    console.log('[filterArticlesWithAI] ✅ 필터링 완료:', filteredArticles.length, '개 유지,', excludeIndices.length, '개 제외');
    console.log('[filterArticlesWithAI] 유지된 기사:');
    filteredArticles.forEach((article, index) => {
      console.log(`  ✓ ${index + 1}. ${article.title}`);
    });
    
    return filteredArticles;
    
  } catch (error) {
    console.error('[filterArticlesWithAI] 오류:', error);
    return articles;
  }
};


// 할당량 부족 토스트 표시
AnalysisPanel.prototype.showQuotaErrorToast = function(blockId) {
  console.warn('[Quota] API 호출 실패 - 할당량 소진');

  const existingToast = document.getElementById('quota-toast-notification');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.id = 'quota-toast-notification';
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #EF4444 0%, #F97316 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 12px 30px rgba(239, 68, 68, 0.35);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideInRight 0.3s ease-out, fadeOut 0.3s ease-in 2.7s;
  `;

  toast.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
    <span>할당량을 전부 사용했습니다.</span>
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes fadeOut {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
    style.remove();
  }, 3000);

  if (blockId && !this.isCurrentBlockId(blockId)) {
    this.updateNewsStatus(blockId, 'error', null, '할당량을 전부 사용했습니다.');
  }
};

// 뉴스 기사 크롤링 함수
AnalysisPanel.prototype.crawlArticleContent = async function(url, retryWithTab = false) {
  console.log('[crawlArticleContent] 크롤링 시작:', url, retryWithTab ? '(탭 열기 허용)' : '');
  
  // 영구 캐시 확인 (크롤링 절약)
  const cachedContent = this.getFromCrawlCache(url);
  if (cachedContent) {
    console.log('[crawlArticleContent] ✅ 캐시에서 반환');
    return cachedContent;
  }
  
  try {
    // 먼저 Service Worker를 통한 CORS 우회 시도
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { 
          action: 'fetchWithCORS', 
          url: url,
          allowTabOpen: retryWithTab // 두 번째 시도에서만 탭 열기 허용
        },
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
      console.warn('[crawlArticleContent] ⚠️ fetchWithCORS 실패, iframe 방식 시도:', response.error);
      
      // CORS 실패 시 iframe 주입 방식으로 재시도
      const iframeContent = await this.crawlViaIframe(url);
      if (iframeContent && iframeContent.length > 100) {
        this.saveToCrawlCache(url, iframeContent);
        console.log('[crawlArticleContent] ✅ iframe 크롤링 성공, 길이:', iframeContent.length);
        return iframeContent;
      }
      
      // iframe도 실패 && 지능형 크롤링 모드 활성화 && 아직 탭 열기 안 했으면 재시도
      if (!retryWithTab) {
        // 설정 확인
        const settings = await new Promise((resolve) => {
          chrome.storage.local.get(['enable_advanced_crawling'], (data) => {
            resolve(data);
          });
        });
        
        if (settings.enable_advanced_crawling) {
          console.warn('[crawlArticleContent] iframe 실패, 지능형 크롤링 모드로 재시도');
          return this.crawlArticleContent(url, true);
        }
      }
      
      return null;
    }
    
    const html = response.html;
    const initialPreview = html ? html.substring(0, 200).replace(/\n/g, ' ') + '...' : '(없음)';
    console.log('[crawlArticleContent] 📄 HTML 수신:', html?.length || 0, '자');
    console.log('[crawlArticleContent] 📄 HTML 미리보기:', initialPreview);
    
    // HTML이 비어있으면 조기 종료
    if (!html || html.length < 100) {
      console.warn('[crawlArticleContent] ❌ HTML 길이 부족:', html?.length || 0, '자');
      return null;
    }
    
    // 🤖 AI-first 방식: HTML을 바로 AI에게 전송 (조선일보 등 모든 뉴스 사이트 지원)
    console.log('[crawlArticleContent] 🤖 AI 파싱 시작 (전체:', html.length, '자)');
    
    const aiParsedContent = await this.parseHtmlWithAI(html, url);
    if (aiParsedContent) {
      this.saveToCrawlCache(url, aiParsedContent);
      console.log('[crawlArticleContent] ✅ AI 파싱 성공, 길이:', aiParsedContent.length);
      return aiParsedContent;
    }
    
    // AI 실패 시 fallback: HTML 파싱하여 본문 추출 (기존 방식)
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

// AI를 사용한 HTML 파싱 (AI-first 방식: HTML을 바로 AI에게 전송)
AnalysisPanel.prototype.parseHtmlWithAI = async function(html, url) {
  try {
    console.log('[parseHtmlWithAI] 📥 원본 HTML 길이:', html.length, '자');
    
    // HTML을 바로 AI에게 전송 (최대 50000자)
    const truncatedHtml = html.substring(0, 50000);
    
    console.log('[parseHtmlWithAI] 📤 AI에게 전달할 HTML 길이:', truncatedHtml.length, '자');
    
    // Gemini API로 HTML에서 제목과 본문 추출 요청
    const dateTimeContext = this.getDateTimeContext();
    const prompt = `${dateTimeContext}

다음은 뉴스 기사 웹페이지의 HTML 코드입니다. 이 HTML에서 **기사 제목**과 **본문 내용**만 추출해서 JSON 형식으로 반환하세요.

규칙:
- 광고, 메뉴, 관련 기사 링크, 댓글, 네비게이션은 제외
- 본문은 기사의 실제 내용만 포함
- 기자 이름, 날짜는 포함해도 됨
- Next.js의 __NEXT_DATA__ JSON이 있으면 그 안에서 추출하세요

HTML:
${truncatedHtml}

다음 JSON 형식으로만 응답하세요:
\`\`\`json
{
  "title": "기사 제목",
  "content": "본문 내용"
}
\`\`\``;

    console.log('[parseHtmlWithAI] 📤 Gemini에 전달할 prompt 길이:', prompt.length, '자');

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'analyzeNewsWithGemini',
        blockId: 'html_parser_' + Date.now(),
        newsContent: prompt,
        isStreaming: false
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    // API 사용 횟수 증가 (HTML 파싱도 Gemini API 사용)
    if (response.incrementApiUsage) {
      this.incrementApiUsage(response.incrementApiUsage.type, response.incrementApiUsage.count);
      console.log(`[API Count] HTML 파싱 - ${response.incrementApiUsage.type} API 호출 +${response.incrementApiUsage.count}`);
    }
    
    // 비스트리밍 모드는 '분석 완료 및 결과 전송 성공' 반환
    if (!response.result) {
      console.error('[parseHtmlWithAI] AI 파싱 실패 - result 없음:', response);
      return null;
    }
    
    console.log('[parseHtmlWithAI] ✅ AI 응답 수신:', typeof response.result);
    
    // response.result가 이미 객체인 경우 vs 문자열인 경우 처리
    let parsed;
    if (typeof response.result === 'object' && response.result !== null) {
      parsed = response.result;
      console.log('[parseHtmlWithAI] 📦 이미 파싱된 객체 수신');
    } else if (typeof response.result === 'string') {
      parsed = this.extractJsonFromAiResponse(response.result);
      console.log('[parseHtmlWithAI] 📝 문자열에서 JSON 추출');
    } else {
      console.error('[parseHtmlWithAI] ❌ 알 수 없는 타입:', typeof response.result);
      return null;
    }
    
    if (parsed && parsed.title) {
      // content가 있으면 사용, 없으면 HTML에서 텍스트 추출 시도
      let content = parsed.content;
      
      if (!content || content.length < 50) {
        console.warn('[parseHtmlWithAI] ⚠️ AI 파싱 content 부족, HTML에서 텍스트 추출 시도');
        // HTML에서 간단하게 텍스트 추출
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html.substring(0, 10000); // 앞부분만
        const textContent = tempDiv.textContent || tempDiv.innerText || '';
        const cleaned = textContent.replace(/\s+/g, ' ').trim();
        content = cleaned.substring(0, 3000); // 최대 3000자
        console.log('[parseHtmlWithAI] 📄 HTML 텍스트 추출:', content.length, '자');
      }
      
      if (content && content.length >= 50) {
        const formatted = `제목: ${parsed.title}\n\n${content}`;
        console.log('[parseHtmlWithAI] ✅ AI 파싱 성공 - 제목:', parsed.title.substring(0, 30), '/ 본문:', content.length, '자');
        return formatted;
      }
    }
    
    console.error('[parseHtmlWithAI] JSON 파싱 실패 또는 content 부족:', parsed);
    return null;
    
  } catch (error) {
    console.error('[parseHtmlWithAI] AI 파싱 오류:', error);
    return null;
  }
};

// iframe을 통한 크롤링 (CORS 우회)
AnalysisPanel.prototype.crawlViaIframe = async function(url) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.sandbox = 'allow-same-origin';
    
    const timeout = setTimeout(() => {
      document.body.removeChild(iframe);
      console.warn('[crawlViaIframe] ⏱️ 타임아웃');
      resolve(null);
    }, 8000);
    
    iframe.onload = () => {
      try {
        clearTimeout(timeout);
        
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        
        const selectors = [
          'article',
          '[id*="article"]',
          '[class*="article"]',
          '[class*="content"]',
          '[id*="content"]',
          'main',
          '.news-content',
          '.article-body'
        ];
        
        let content = '';
        for (const selector of selectors) {
          const elements = iframeDoc.querySelectorAll(selector);
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
        
        document.body.removeChild(iframe);
        resolve(content || null);
        
      } catch (error) {
        clearTimeout(timeout);
        document.body.removeChild(iframe);
        console.warn('[crawlViaIframe] ❌ DOM 접근 실패:', error.message);
        resolve(null);
      }
    };
    
    iframe.onerror = () => {
      clearTimeout(timeout);
      document.body.removeChild(iframe);
      console.warn('[crawlViaIframe] ❌ iframe 로드 실패');
      resolve(null);
    };
    
    document.body.appendChild(iframe);
    iframe.src = url;
  });
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
  
  // 빈 데이터 검증 (Gemini API 400 에러 방지)
  if (!originalBlock || !originalBlock.title || !originalBlock.content) {
    console.error('[verifyFactsWithAI] 원본 기사 데이터 없음');
    return {
      일치하는_사실: [],
      불일치하는_사실: [],
      검증_불가: [],
      종합_평가: '원본 기사 데이터가 충분하지 않습니다.'
    };
  }
  
  if (!comparisonArticles || comparisonArticles.length === 0) {
    console.error('[verifyFactsWithAI] 비교 기사 없음');
    return {
      일치하는_사실: [],
      불일치하는_사실: [],
      검증_불가: [originalBlock.title],
      종합_평가: '비교할 기사가 없어 검증할 수 없습니다.'
    };
  }
  
  const dateTimeContext = this.getDateTimeContext();
  const prompt = `${dateTimeContext}

당신은 사실 검증 전문가입니다. 원본 뉴스 기사와 비교 기사들을 분석하여 사실 여부를 검증하세요.

## 원본 기사
제목: ${originalBlock.title}
내용: ${originalBlock.content.substring(0, 1000)}

## 비교 기사들
${comparisonArticles.map((article, i) => {
  // 🔥 크롤링 본문 우선 사용, snippet은 fallback
  const content = article.crawledContent || article.snippet;
  const source = article.crawledContent ? '(크롤링 본문)' : '(Google 검색 요약)';
  return `
### 비교 기사 ${i + 1}
제목: ${article.title}
출처: ${article.displayLink} ${source}
내용: ${content.substring(0, 800)}
`;
}).join('\n')}

## 작업
원본 기사의 핵심 주장들을 비교 기사들과 대조하여 다음을 분석하세요:
1. **일치하는 사실**: 비교 기사에서도 확인되는 내용 (각 사실 뒤에 참고한 기사 번호를 [1], [2] 형식으로 표기)
2. **불일치하는 사실**: 비교 기사와 다르게 보도된 내용 (각 불일치 뒤에 참고한 기사 번호 표기)
3. **검증 불가**: 비교 기사에서 언급되지 않은 내용
4. **종합 평가**: 원본 기사의 신뢰도를 5단계로 평가
   **[필수] '거짓' / '대체로 거짓' / '일부 사실' / '대체로 사실' / '사실' 중 하나만 사용**
   **[금지]** '신뢰할 수 있음', '부분적으로 신뢰', '신뢰하기 어려움' 등 다른 표현 사용 금지

**중요**: 각 사실/불일치 항목 뒤에 반드시 출처 번호를 [1], [2], [3], [4] 형식으로 표기하세요.

예시:
- "한동훈이 조국에게 공개토론을 제안했다 [1][2]"
- "대장동 항소 포기 사태가 논란이 되고 있다 [1][3]"

JSON 형식으로 응답:
{
  "일치하는_사실": ["사실1 [1][2]", "사실2 [3]", ...],
  "불일치하는_사실": ["불일치1 [2]", "불일치2 [1][4]", ...],
  "검증_불가": ["내용1", "내용2", ...],
  "종합_평가": "평가 텍스트"
}
`;

  try {
    // service_worker를 통해 비스트리밍 모드로 호출
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'analyzeNewsWithGemini',
        newsContent: prompt,
        blockId: 'fact_verify_' + Date.now(),
        isStreaming: false
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[verifyFactsWithAI] 메시지 전송 오류:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (response.status === '분석 완료 및 결과 전송 성공' && response.result) {
          // API 사용 횟수 증가 (사실 검증도 Gemini API 사용)
          if (response.incrementApiUsage) {
            this.incrementApiUsage(response.incrementApiUsage.type, response.incrementApiUsage.count);
            console.log(`[API Count] 사실 검증 - ${response.incrementApiUsage.type} API 호출 +${response.incrementApiUsage.count}`);
          }
          resolve(response.result);
        } else {
          console.warn('[verifyFactsWithAI] 응답 파싱 실패:', response);
          resolve({
            일치하는_사실: [],
            불일치하는_사실: [],
            검증_불가: [],
            종합_평가: '검증 결과를 파싱할 수 없습니다.'
          });
        }
      });
    });
    
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

// 최종 통합 분석 수행 (BACKUP service_worker 스타일)
AnalysisPanel.prototype.performFinalIntegratedAnalysis = async function(originalBlock, comparisonArticles, verificationResult) {
  console.log('[performFinalIntegratedAnalysis] 최종 통합 분석 시작');
  
  // 빈 데이터 검증
  if (!originalBlock || !originalBlock.result) {
    console.error('[performFinalIntegratedAnalysis] 원본 기사 데이터 부족');
    return null;
  }
  
  // 1차 분석 결과 포맷팅
  const originalArticleAnalysis = JSON.stringify(originalBlock.result, null, 2);
  const originalArticleContent = (originalBlock.content || '').substring(0, 1800) || '본문이 제공되지 않았습니다.';
  const safeVerification = verificationResult || {};
  const queryGuide = typeof this.buildVerificationQuerySet === 'function'
    ? this.buildVerificationQuerySet(originalBlock)
    : null;
  const newsQueryLabel = queryGuide?.rawNews || queryGuide?.news || originalBlock.result?.검색어 || originalBlock.result?.키워드 || originalBlock.title || '제공되지 않음';
  const integratedQueryLabel = queryGuide?.rawAll || queryGuide?.all || newsQueryLabel;
  const keywordCandidates = [
    originalBlock.result?.키워드,
    originalBlock.result?.핵심요약,
    originalBlock.result?.주장
  ].filter(Boolean);
  const keywordGuideLabel = keywordCandidates.length ? keywordCandidates.join(' / ') : '별도 키워드 없음';
  const searchKeywordGuideSection = `
#### 검색어 및 키워드 가이드
- 뉴스 검색어: ${newsQueryLabel}
- 통합 검색어: ${integratedQueryLabel}
- 추가 키워드/핵심어: ${keywordGuideLabel}

**가이드:** 각 비교 기사에는 실제 HTML을 파싱한 '크롤링 HTML 발췌'가 포함되어 있습니다. 위 검색어(정확 일치, 동의어, 파생형)와 키워드가 언급된 문장을 먼저 찾고, 해당 문장·수치·인용을 그대로 근거로 활용하세요. 검색어가 전혀 등장하지 않으면 '키워드 미일치'라고 명시하고 다른 증거를 제시하세요.
`;
  
  // 관련 기사 포맷팅
  const relatedArticlesSummary = comparisonArticles.length > 0
    ? comparisonArticles.map((article, index) => {
        const htmlExcerpt = article.crawledContent ? article.crawledContent.substring(0, 800) : null;
        const snippetExcerpt = article.snippet || '요약 정보가 제공되지 않았습니다.';
        return `
      [사실 검증 참고 기사 ${index + 1}]
      - 제목: ${article.title}
      - 언론사: ${article.displayLink}
      - 링크: ${article.link}
      - 크롤링 HTML 발췌: ${htmlExcerpt || '크롤링 실패 또는 미지원'}
      - Google 검색 요약: ${snippetExcerpt}
      `;
            }).join('\n')
    : '제공된 사실 검증 참고 기사가 없습니다.';
  // 사실 확인 포맷팅 (검증 결과)
  const factCheckSummary = `
### 사실 검증 요약 데이터
- 일치하는 사실: ${safeVerification.일치하는_사실?.join(', ') || '없음'}
- 불일치하는 사실: ${safeVerification.불일치하는_사실?.join(', ') || '없음'}
- 검증 불가: ${safeVerification.검증_불가?.join(', ') || '없음'}
- 종합 평가: ${safeVerification.종합_평가 || '평가 데이터 없음'}
`;

  const finalPrompt = `
당신은 뉴스 진위를 판단하는 전문가입니다. 아래 제공된 데이터(초기 분석, 원문, 사실 검증 자료)를 종합해 최종 판단을 작성하세요.

## 핵심 원칙
- **제공된 데이터만 사용**: 사전 지식 활용 금지
- **자료 간 맥락 비교**: 초기 분석과 원문, 사실 검증 자료 사이의 일관성을 확인
- **크롤링 HTML 근거 활용**: '크롤링 HTML 발췌'에서 검색어·키워드가 포함된 문장을 직접 찾아 인용하고, 일치 여부를 분명히 하세요.

## 입력 데이터
1. **초기 분석 데이터**: 뉴스 분석하기 기능이 생성한 첫 분석 결과 (JSON)
2. **원본 기사 본문 발췌**: 실제 기사 텍스트의 앞부분
3. **사실 검증 참고 기사**: 크롤링된 비교 기사 및 요약 정보
4. **사실 검증 요약 데이터**: 일치/불일치/검증 불가 항목과 종합 평가

## 분석 절차
1. 초기 분석 데이터와 원본 기사 본문을 살펴 핵심 주장과 맥락을 정리하세요.
2. 검색어 및 키워드 가이드를 따라 각 비교 기사(특히 크롤링 HTML 발췌)에서 일치하거나 의미상 동일한 문장·수치·기관명을 찾아 기록하세요.
3. 사실 검증 참고 기사와 사실 검증 요약 데이터를 대조하여 확인된 사실, 모순, 미확인 주장을 구분하세요.
4. 외부 증거를 근거로 초기 분석을 보완하거나 수정하고 최종 판단을 명확한 근거와 함께 작성하세요.

## 출력 형식 (HTML만 출력)
다음과 같은 구조의 HTML을 출력하세요. **반드시 가독성을 위해 다음 규칙을 따르세요:**
- 목록은 <ul>, <li> 태그 사용
- 강조는 <strong> 또는 <b> 태그 사용
- 인용문은 <blockquote> 태그 사용
- 단락 구분은 <p> 태그 사용
- 제목은 <h4>, <h5> 태그 사용

HTML 구조 예시:
<div class="final-analysis-result">
  <div class="verdict-section">
    <h3>🎯 최종 판단</h3>
    <p class="verdict-text">[사실|대체로 사실|일부 사실|대체로 거짓|거짓]</p>
    <p class="note" style="font-size: 0.9em; color: #888;">**[중요]** 반드시 5단계 중 하나만 사용. '진짜 뉴스', '가짜 뉴스' 등 다른 표현 금지</p>
  </div>
  
  <div class="summary-section">
    <h3>📝 최종 결론 요약</h3>
    <p>[2~3문장의 최종 결론. HTML 태그로 가독성 높게 작성]</p>
  </div>
  
  <div class="reasoning-section">
    <h3>🔍 상세 분석</h3>
    
    <div class="reasoning-item">
      <h4>📊 초기 분석 재검토</h4>
      <div class="content">
        <p>[초기 분석 내용. 목록으로 작성 시:]</p>
        <ul>
          <li><b>항목명:</b> 상세 내용</li>
          <li><b>항목명2:</b> 상세 내용</li>
        </ul>
      </div>
    </div>
    
    <div class="reasoning-item">
      <h4>✅ 외부 데이터로 확인된 사실</h4>
      <div class="content">
        <p>[확인된 사실들을 목록으로:]</p>
        <ul>
          <li><b>주요 사실:</b> 세부 내용 및 출처 <blockquote>"인용문 예시"</blockquote></li>
        </ul>
      </div>
    </div>
    
    <div class="reasoning-item">
      <h4>⚠️ 반박 또는 상충 증거</h4>
      <div class="content">
        <p>[반박 증거가 있으면 목록으로, 없으면 "발견되지 않음"]</p>
      </div>
    </div>
    
    <div class="reasoning-item">
      <h4>❓ 검증 불가능한 주장</h4>
      <div class="content">
        <p>[검증 불가 항목이 있으면 목록으로, 없으면 "없음"]</p>
      </div>
    </div>
  </div>
</div>

**중요:** 
1. 위 HTML 구조를 그대로 사용하되, 대괄호 [] 안의 내용을 실제 분석 결과로 채워서 출력하세요.
2. **목록, 강조, 인용문 등 HTML 태그를 적극 활용하여 가독성을 높이세요.**
3. 인용문은 반드시 <blockquote> 태그로 감싸서 표시하세요.

---

### 입력 데이터

#### 초기 분석 데이터
${originalArticleAnalysis}

#### 원본 기사 본문 발췌
${originalArticleContent}

${searchKeywordGuideSection}

#### 사실 검증 참고 기사
${relatedArticlesSummary}

#### 사실 검증 요약 데이터
${factCheckSummary}
`;

  try {
    // service_worker를 통해 비스트리밍 모드로 호출
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'analyzeNewsWithGemini',
        newsContent: finalPrompt,
        blockId: 'final_analysis_' + Date.now(),
        isStreaming: false
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[performFinalIntegratedAnalysis] 메시지 전송 오류:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (response.status === '분석 완료 및 결과 전송 성공' && response.result) {
          // API 사용 횟수 증가
          if (response.incrementApiUsage) {
            this.incrementApiUsage(response.incrementApiUsage.type, response.incrementApiUsage.count);
          }
          // HTML 응답을 JSON 구조로 변환
          const parsedResult = this.parseHtmlFinalAnalysis(response.result);
          resolve(parsedResult);
        } else {
          console.warn('[performFinalIntegratedAnalysis] 응답 파싱 실패:', response);
          resolve(null);
        }
      });
    });
    
  } catch (error) {
    console.error('[performFinalIntegratedAnalysis] 최종 통합 분석 오류:', error);
    return null;
  }
};

// HTML 형식의 최종 통합 분석 결과를 JSON 구조로 파싱
AnalysisPanel.prototype.parseHtmlFinalAnalysis = function(htmlString) {
  try {
    // HTML을 파싱하기 위한 임시 DOM 생성
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    
    // 각 섹션에서 데이터 추출
    const verdictText = doc.querySelector('.verdict-section .verdict-text')?.textContent?.trim() || '분석 결과 없음';
    
    // summary는 HTML을 그대로 유지
    const summaryElement = doc.querySelector('.summary-section p');
    const summaryText = summaryElement ? summaryElement.innerHTML : '';
    
    // reasoning 항목들 추출 (HTML 그대로 유지)
    const reasoningItems = doc.querySelectorAll('.reasoning-item');
    const reasoning = {
      reassessment_of_initial_analysis: '',
      confirmations_from_external_data: '',
      discrepancies_or_contradictions: '',
      unverified_claims: ''
    };
    
    reasoningItems.forEach((item) => {
      const title = item.querySelector('h4')?.textContent?.trim() || '';
      const contentElement = item.querySelector('.content');
      const content = contentElement ? contentElement.innerHTML : '';
      
      if (title.includes('초기 분석 재검토')) {
        reasoning.reassessment_of_initial_analysis = content;
      } else if (title.includes('외부 데이터로 확인된 사실')) {
        reasoning.confirmations_from_external_data = content;
      } else if (title.includes('반박 또는 상충 증거')) {
        reasoning.discrepancies_or_contradictions = content;
      } else if (title.includes('검증 불가능한 주장')) {
        reasoning.unverified_claims = content;
      }
    });
    
    return {
      final_verdict: verdictText,
      summary: summaryText,
      reasoning: reasoning
    };
  } catch (error) {
    console.error('[parseHtmlFinalAnalysis] HTML 파싱 오류:', error);
    // 파싱 실패 시 원본 텍스트를 그대로 사용
    return {
      final_verdict: '분석 결과 파싱 실패',
      summary: htmlString,
      reasoning: {
        reassessment_of_initial_analysis: '',
        confirmations_from_external_data: '',
        discrepancies_or_contradictions: '',
        unverified_claims: ''
      }
    };
  }
};

// 사실 검증 후 Gemini로 전체 재분석
AnalysisPanel.prototype.reanalyzeWithFactCheck = async function(originalBlock, comparisonArticles, verificationResult) {
  console.log('[reanalyzeWithFactCheck] 재분석 시작');
  
  // 빈 데이터 검증
  if (!originalBlock || !originalBlock.title || !originalBlock.content || !originalBlock.result) {
    console.error('[reanalyzeWithFactCheck] 원본 기사 데이터 부족');
    return {
      ...originalBlock?.result,
      사실검증완료: false,
      분석: '원본 기사 데이터가 충분하지 않아 재분석할 수 없습니다.'
    };
  }
  
  const prompt = `
당신은 뉴스 진위 판별 전문가입니다. 기존 분석 결과와 사실 검증 결과를 종합하여 **최종 분석을 업데이트**하세요.

## 원본 기사
제목: ${originalBlock.title}
본문: ${originalBlock.content.substring(0, 1500)}

## 기존 AI 분석 결과
${JSON.stringify(originalBlock.result, null, 2)}

## 사실 검증 결과 (${comparisonArticles.length}개 기사와 비교)
${comparisonArticles.map((article, i) => {
  // 🔥 크롤링 본문 우선 사용, snippet은 fallback
  const content = article.crawledContent || article.snippet;
  const source = article.crawledContent ? '크롤링 본문' : 'Google 검색 요약';
  return `
### 검증 기사 ${i + 1}
- 제목: ${article.title}
- 출처: ${article.displayLink}
- 유형: ${source}
- 내용: ${content.substring(0, 600)}
`;
}).join('\n')}

### 검증 분석
- 일치하는 사실: ${verificationResult.일치하는_사실?.join(', ') || '없음'}
- 불일치하는 사실: ${verificationResult.불일치하는_사실?.join(', ') || '없음'}
- 검증 불가: ${verificationResult.검증_불가?.join(', ') || '없음'}
- 종합 평가: ${verificationResult.종합_평가}

## 작업
위 사실 검증 결과를 **근거와 분석에 자연스럽게 통합**하여 업데이트하세요:

1. **진위**: 검증 결과를 반영하여 최종 판단
   **[필수] 5단계 진위 체계:**
   - '거짓': 명백한 허위 정보
   - '대체로 거짓': 대부분 사실과 다름
   - '일부 사실': 일부는 사실이나 상당 부분 불확실
   - '대체로 사실': 대부분 사실이나 일부 불일치
   - '사실': 검증된 사실
   **[금지]** '진짜 뉴스', '가짜 뉴스', '가짜일 가능성', '신뢰할 수 있음' 등 다른 표현 절대 사용 금지

2. **요약**: 사실 검증 결과를 포함한 핵심 요약 (2-3문장)

3. **근거**: 
   - 기존 근거를 유지하되, **사실 검증 결과를 자연스럽게 통합**
   - 형식 예시:
     "... (기존 근거 내용) ...
     
     **✅ 일치하는 사실 (${verificationResult.일치하는_사실?.length || 0}개)**
     ${verificationResult.일치하는_사실?.map((fact, i) => `${i + 1}. ${fact}`).join('\n') || '(없음)'}
     
     ${verificationResult.불일치하는_사실?.length > 0 ? `**❌ 불일치하는 사실 (${verificationResult.불일치하는_사실.length}개)**
     ${verificationResult.불일치하는_사실.map((fact, i) => `${i + 1}. ${fact}`).join('\n')}` : ''}
     
     ${verificationResult.검증_불가?.length > 0 ? `**⚠️ 검증 불가 (${verificationResult.검증_불가.length}개)**
     ${verificationResult.검증_불가.map((fact, i) => `${i + 1}. ${fact}`).join('\n')}` : ''}"

4. **분석**: 
   - 기존 분석을 유지하되, **사실 검증 내용을 상세히 통합**
   - ${comparisonArticles.length}개 기사와의 교차 검증 결과를 자연스럽게 서술
   - 확인된 사실, 의심스러운 부분, 불일치 사항을 맥락에 맞게 설명
   - 검증 불가한 주장이 있다면 그 이유와 함께 기술
   - 종합 평가 내용을 분석에 녹여서 표현

5. **키워드**: 기존 유지

6. **검색어**: 기존 유지

7. **사실검증완료**: true (새로 추가)

**중요 원칙**: 
- 근거와 분석이 **하나의 연속된 서술**처럼 읽히도록 작성 (별도 소제목·리스트만 나열하지 말 것)
- 사실 검증 결과를 별도 섹션이 아닌 **문단 안에 자연스럽게 포함**
- 일치(✅), 불일치(❌), 검증불가(⚠️) 마크를 사용하되 자연스럽게 배치
- 비교 검증된 기사 개수를 명시

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
    // service_worker를 통해 비스트리밍 모드로 호출
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'analyzeNewsWithGemini',
        newsContent: prompt,
        blockId: 'reanalyze_' + Date.now(),
        isStreaming: false
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[reanalyzeWithFactCheck] 메시지 전송 오류:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (response.status === '분석 완료 및 결과 전송 성공' && response.result) {
          // API 사용 횟수 증가 (재분석도 Gemini API 사용)
          if (response.incrementApiUsage) {
            this.incrementApiUsage(response.incrementApiUsage.type, response.incrementApiUsage.count);
            console.log(`[API Count] 재분석 - ${response.incrementApiUsage.type} API 호출 +${response.incrementApiUsage.count}`);
          }
          resolve(response.result);
        } else {
          console.warn('[reanalyzeWithFactCheck] 응답 파싱 실패:', response);
          resolve({
            ...originalBlock?.result,
            사실검증완료: false,
            분석: '재분석 중 오류가 발생했습니다.'
          });
        }
      });
    });
    
  } catch (error) {
    console.error('[reanalyzeWithFactCheck] 재분석 오류:', error);
    // 오류 시 기존 결과 반환
    return {
      ...originalBlock.result,
      사실검증완료: false,
      분석: '재분석 중 오류가 발생했습니다.'
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
    if (!(this.persistentSearchCache instanceof Map)) {
      this.persistentSearchCache = new Map();
    }
    if (!(this.persistentCrawlCache instanceof Map)) {
      this.persistentCrawlCache = new Map();
    }

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
  if (!(this.persistentSearchCache instanceof Map)) {
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
  if (!(this.persistentCrawlCache instanceof Map)) {
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


