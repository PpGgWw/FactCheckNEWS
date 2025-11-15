// service_worker.js

// 암호화 유틸리티 함수들 (crypto-utils.js에서 가져온 것)
const SALT = new Uint8Array([
  0x49, 0x73, 0x20, 0x74, 0x68, 0x69, 0x73, 0x20,
  0x73, 0x65, 0x63, 0x75, 0x72, 0x65, 0x3f, 0x21
]);

async function getDeviceKey() {
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

async function deriveKey(password) {
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

async function decryptApiKey(encryptedData) {
  try {
    const deviceKey = await getDeviceKey();
    const key = await deriveKey(deviceKey);
    
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } catch (error) {
    console.error('복호화 오류:', error);
    throw new Error('API 키 복호화에 실패했습니다.');
  }
}

// Chrome API 안전 확인 함수
function isChromeApiAvailable() {
  try {
    return chrome && chrome.runtime && chrome.runtime.id;
  } catch (error) {
    return false;
  }
}

// 활성 중인 타이핑 효과 추적
const activeTypingEffects = new Map();

// content_script로부터 메시지를 수신하는 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // CORS 우회 크롤링 요청 처리 (강화된 우회 전략)
  if (message.action === "fetchWithCORS") {
    console.log("[fetchWithCORS] 크롤링 요청:", message.url);
    
    // 전략 1: 직접 fetch (가장 빠름)
    const tryDirectFetch = () => {
      return fetch(message.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        credentials: 'omit',
        mode: 'cors'
      }).then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      });
    };
    
    // 전략 2: AMP 버전 시도 (연합뉴스, 일부 언론사)
    const tryAmpVersion = () => {
      let ampUrl = message.url;
      if (message.url.includes('yna.co.kr')) {
        ampUrl = message.url.replace('/view/', '/amp/view/');
      } else if (message.url.includes('donga.com')) {
        ampUrl = message.url + '?amp=1';
      }
      
      if (ampUrl === message.url) {
        return Promise.reject(new Error('AMP not supported'));
      }
      
      console.log("[fetchWithCORS] AMP 버전 시도:", ampUrl);
      return fetch(ampUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Mobile Safari/537.36',
          'Accept': 'text/html'
        }
      }).then(response => {
        if (!response.ok) throw new Error(`AMP HTTP ${response.status}`);
        return response.text();
      });
    };
    
    // 전략 3: 모바일 버전 시도
    const tryMobileVersion = () => {
      let mobileUrl = message.url;
      if (message.url.includes('donga.com')) {
        mobileUrl = message.url.replace('www.', 'm.');
      } else if (message.url.includes('yna.co.kr')) {
        mobileUrl = message.url.replace('www.', 'm.');
      }
      
      if (mobileUrl === message.url) {
        return Promise.reject(new Error('Mobile not supported'));
      }
      
      console.log("[fetchWithCORS] 모바일 버전 시도:", mobileUrl);
      return fetch(mobileUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
        }
      }).then(response => {
        if (!response.ok) throw new Error(`Mobile HTTP ${response.status}`);
        return response.text();
      });
    };
    
    // 전략 4: 실제 탭 열기 (최후의 수단, 사용자 동의 필요)
    const tryRealTab = () => {
      if (!message.allowTabOpen) {
        return Promise.reject(new Error('Tab opening not allowed'));
      }

      console.log("[fetchWithCORS] 🚨 최후의 수단: 실제 탭 열기");

      return new Promise((resolve, reject) => {
        chrome.tabs.create({ url: message.url, active: false }, (tab) => {
          if (chrome.runtime.lastError || !tab || typeof tab.id !== 'number') {
            const error = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Failed to open tab';
            console.error('[fetchWithCORS] 탭 생성 실패:', error);
            reject(new Error(error));
            return;
          }

          const tabId = tab.id;
          let timeoutId = null;
          let updateListener = null;

          const cleanupAndFinish = (error, html = '') => {
            if (updateListener) {
              chrome.tabs.onUpdated.removeListener(updateListener);
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
            }

            chrome.tabs.remove(tabId, () => {
              if (error) {
                reject(error);
              } else {
                resolve(html);
              }
            });
          };

          const extractHtmlFromTab = async () => {
            if (chrome.scripting && chrome.scripting.executeScript) {
              try {
                // JavaScript 렌더링 대기
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const [result] = await chrome.scripting.executeScript({
                  target: { tabId },
                  func: () => {
                    // 전체 HTML 추출
                    const fullHtml = document.documentElement.outerHTML;
                    
                    // 본문 텍스트만 추출 (fallback)
                    const bodyText = document.body ? document.body.innerText : '';
                    
                    return {
                      html: fullHtml,
                      text: bodyText,
                      length: fullHtml.length
                    };
                  }
                });
                
                const extracted = result?.result || {};
                const htmlPreview = extracted.html ? extracted.html.substring(0, 200) + '...' : '(없음)';
                const textPreview = extracted.text ? extracted.text.substring(0, 200) + '...' : '(없음)';
                console.log('[fetchWithCORS] 추출 결과 - HTML:', extracted.length, '자');
                console.log('[fetchWithCORS] HTML 미리보기:', htmlPreview);
                console.log('[fetchWithCORS] Text 길이:', extracted.text?.length, '자, 미리보기:', textPreview);
                
                // HTML이 충분히 길면 사용
                if (extracted.html && extracted.html.length > 1000) {
                  console.log('[fetchWithCORS] ✅ HTML 사용 (', extracted.html.length, '자)');
                  return extracted.html;
                }
                
                // HTML이 짧으면 body text 사용
                if (extracted.text && extracted.text.length > 500) {
                  console.log('[fetchWithCORS] ⚠️ HTML 부족, body text 사용 (', extracted.text.length, '자)');
                  return `<html><body>${extracted.text}</body></html>`;
                }
                
                console.warn('[fetchWithCORS] ❌ 추출 실패 - HTML:', extracted.html?.length || 0, '자, Text:', extracted.text?.length || 0, '자');
                return extracted.html || '';
              } catch (error) {
                console.warn('[fetchWithCORS] executeScript 추출 실패, fallback 사용:', error.message);
              }
            } else {
              console.warn('[fetchWithCORS] chrome.scripting API 미지원, fallback 사용');
            }

            return new Promise((resolveExtract, rejectExtract) => {
              chrome.tabs.sendMessage(tabId, { action: 'extractContent' }, (response) => {
                if (chrome.runtime.lastError) {
                  rejectExtract(new Error('Content script communication failed'));
                  return;
                }
                resolveExtract(response?.html || '');
              });
            });
          };

          const handleExtraction = () => {
            extractHtmlFromTab()
              .then((html) => {
                if (html.length > 100) {
                  console.log('[fetchWithCORS] ✅ 탭에서 콘텐츠 추출 성공, 탭 닫음');
                  cleanupAndFinish(null, html);
                } else {
                  cleanupAndFinish(new Error('Extracted content too short'));
                }
              })
              .catch((error) => {
                console.error('[fetchWithCORS] 탭 콘텐츠 추출 실패:', error.message);
                cleanupAndFinish(error);
              });
          };

          updateListener = (tabIdUpdate, changeInfo) => {
            if (tabIdUpdate === tabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(updateListener);
              handleExtraction();
            }
          };

          chrome.tabs.onUpdated.addListener(updateListener);

          timeoutId = setTimeout(() => {
            console.error('[fetchWithCORS] ⏱️ 탭 크롤링 타임아웃 (15초)');
            cleanupAndFinish(new Error('Tab crawl timeout'));
          }, 15000); // 15초로 증가
        });
      });
    };
    
    // 순차적 fallback 시도
    tryDirectFetch()
      .catch(err => {
        console.log("[fetchWithCORS] 직접 fetch 실패, AMP 시도:", err.message);
        return tryAmpVersion();
      })
      .catch(err => {
        console.log("[fetchWithCORS] AMP 실패, 모바일 시도:", err.message);
        return tryMobileVersion();
      })
      .catch(err => {
        console.log("[fetchWithCORS] 모바일 실패, 탭 열기 시도:", err.message);
        return tryRealTab();
      })
      .then(html => {
        console.log("[fetchWithCORS] ✅ 크롤링 성공, 길이:", html.length);
        sendResponse({ success: true, html: html });
      })
      .catch(error => {
        console.error("[fetchWithCORS] ❌ 모든 전략 실패:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // 비동기 응답
  }
  
  // 분석 중단 요청 처리
  if (message.action === "stopAnalysis") {
    console.log("[stopAnalysis] 분석 중단 요청 받음, blockId:", message.blockId);
    
    // 활성 타이핑 효과 중단
    if (activeTypingEffects.has(message.blockId)) {
      const typingState = activeTypingEffects.get(message.blockId);
      typingState.shouldStop = true;
      activeTypingEffects.delete(message.blockId);
      console.log("[stopAnalysis] 타이핑 효과 중단됨:", message.blockId);
    }
    
    sendResponse({ status: "분석 중단 완료" });
    return true;
  }
  
  if (message.action === "analyzeNewsWithGemini") {
    console.log("Content Script로부터 뉴스 분석 요청을 받았습니다. blockId:", message.blockId);
    
    // 확장 컨텍스트 확인
    if (!isChromeApiAvailable()) {
      console.error("Extension context invalidated");
      sendResponse({ status: "확장 컨텍스트 오류", error: "확장이 비활성화되었습니다." });
      return;
    }
    
    // 저장된 API 키 가져오기
    try {
      chrome.storage.local.get(['gemini_api_key'], async (result) => {
        if (chrome.runtime.lastError) {
          console.error("API 키 로드 오류:", chrome.runtime.lastError);
          sendResponse({ status: "저장소 오류", error: chrome.runtime.lastError.message });
          return;
        }
        
        let API_KEY = result.gemini_api_key;
        
        if (!API_KEY) {
          console.error("API 키가 설정되지 않았습니다.");
          if (isChromeApiAvailable()) {
            chrome.tabs.sendMessage(sender.tab.id, {
              action: "displayError",
              error: "API 키가 설정되지 않았습니다. 설정 버튼을 클릭하여 API 키를 입력해주세요.",
              blockId: message.blockId
            }).catch(error => console.error("메시지 전송 오류:", error));
          }
          sendResponse({ status: "API 키 없음", error: "API 키가 설정되지 않았습니다." });
          return;
        }
        
        // API 키 복호화
        try {
          API_KEY = await decryptApiKey(API_KEY);
        } catch (decryptError) {
          console.error("API 키 복호화 오류:", decryptError);
          if (isChromeApiAvailable()) {
            chrome.tabs.sendMessage(sender.tab.id, {
              action: "displayError",
              error: "API 키 복호화에 실패했습니다. API 키를 다시 설정해주세요.",
              blockId: message.blockId
            }).catch(error => console.error("메시지 전송 오류:", error));
          }
          sendResponse({ status: "복호화 오류", error: "API 키 복호화에 실패했습니다." });
          return;
        }
        
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${API_KEY}`;
        
        // newsContent 또는 prompt 사용 (하위 호환성)
        const promptText = message.newsContent || message.prompt || '';
        
        if (!promptText || promptText.trim().length === 0) {
          console.error("[analyzeNewsWithGemini] 빈 prompt/newsContent 수신!");
          if (isChromeApiAvailable()) {
            chrome.tabs.sendMessage(sender.tab.id, {
              action: "displayError",
              error: "분석할 내용이 비어있습니다.",
              blockId: message.blockId
            }).catch(error => console.error("메시지 전송 오류:", error));
          }
          sendResponse({ status: "빈 콘텐츠", error: "분석할 내용이 없습니다." });
          return;
        }
        
        console.log("[analyzeNewsWithGemini] Prompt 길이:", promptText.length, "자");
        console.log("[analyzeNewsWithGemini] 스트리밍 모드:", message.isStreaming !== false ? "활성화" : "비활성화");
        
        // 스트리밍 여부 확인 (기본값: true)
        const useStreaming = message.isStreaming !== false;
        
        if (useStreaming) {
          // Gemini API 호출 함수 실행 (실제 스트리밍 방식)
          callGeminiAPIWithRealStreaming(promptText, API_URL, sender.tab.id, message.blockId)
            .then(result => {
              console.log("--- Gemini API 스트리밍 완료 ---");
              console.log(result);
              
              // 최종 결과를 content script로 다시 전송 (blockId 포함)
              if (isChromeApiAvailable()) {
                chrome.tabs.sendMessage(sender.tab.id, {
                  action: "displayAnalysisResult",
                  result: result,
                  blockId: message.blockId
                }).catch(error => console.error("결과 전송 오류:", error));
              }
              
              sendResponse({ status: "분석 완료 및 결과 전송 성공", result: result });
            })
            .catch(error => {
              console.error("Gemini API 처리 중 오류 발생:", error);
              
              // 오류를 content script로 전송 (blockId 포함)
              if (isChromeApiAvailable()) {
                chrome.tabs.sendMessage(sender.tab.id, {
                  action: "displayError",
                  error: error.message,
                  blockId: message.blockId
                }).catch(sendError => console.error("오류 전송 실패:", sendError));
              }
              
              sendResponse({ status: "API 처리 오류", error: error.message });
            });
        } else {
          // 비스트리밍 모드: 한번에 결과 받기
          callGeminiAPINonStreaming(promptText, API_KEY)
            .then(result => {
              console.log("--- Gemini API 비스트리밍 완료 ---");
              console.log(result);
              
              // sendResponse로 직접 반환 (content script로 전송 안 함)
              sendResponse({ status: "분석 완료 및 결과 전송 성공", result: result });
            })
            .catch(error => {
              console.error("Gemini API 비스트리밍 처리 중 오류:", error);
              sendResponse({ status: "API 처리 오류", error: error.message });
            });
        }
      });
    } catch (error) {
      console.error("저장소 접근 오류:", error);
      sendResponse({ status: "저장소 오류", error: error.message });
    }

    // 비동기 응답을 위해 true를 반환
    return true; 
  }
});

/**
 * Gemini API를 실제 스트리밍 방식으로 호출하는 비동기 함수 (재시도 로직 포함)
 * @param {string} prompt - API에 전송할 전체 프롬프트
 * @param {string} apiUrl - API URL (키 포함)
 * @param {number} tabId - 탭 ID
 * @param {string} blockId - 블록 ID
 * @returns {Promise<string>} - API가 반환한 최종 텍스트 결과
 */
async function callGeminiAPIWithRealStreaming(prompt, apiUrl, tabId, blockId) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1초
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`API 스트리밍 호출 시도 ${attempt}/${MAX_RETRIES}`);
      
      // 타이핑 상태 등록
      const typingState = { shouldStop: false };
      activeTypingEffects.set(blockId, typingState);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const errorMsg = `API 요청 실패: ${response.status} ${response.statusText} - ${errorBody}`;
        throw new Error(errorMsg);
      }

      // SSE 스트림 읽기
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      
      while (true) {
        // 중단 요청 확인
        if (typingState.shouldStop) {
          console.log('[callGeminiAPIWithRealStreaming] 스트리밍 중단됨:', blockId);
          reader.cancel();
          activeTypingEffects.delete(blockId);
          throw new Error('사용자가 분석을 중단했습니다.');
        }
        
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        // 청크를 텍스트로 변환
        buffer += decoder.decode(value, { stream: true });
        
        // SSE 형식 파싱 (data: 로 시작하는 라인들)
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 마지막 불완전한 라인은 버퍼에 보관
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6); // 'data: ' 제거
            
            if (jsonStr.trim() === '') continue;
            
            try {
              const data = JSON.parse(jsonStr);
              
              // 응답에서 텍스트 추출
              if (data.candidates && data.candidates[0] && 
                  data.candidates[0].content && 
                  data.candidates[0].content.parts && 
                  data.candidates[0].content.parts[0]) {
                const text = data.candidates[0].content.parts[0].text;
                
                if (text) {
                  fullText += text;
                  
                  // 실시간으로 content script에 전송
                  if (isChromeApiAvailable()) {
                    chrome.tabs.sendMessage(tabId, {
                      action: "updateStreamingResult",
                      partialResult: fullText,
                      blockId: blockId
                    }).catch(error => {
                      console.error("스트리밍 메시지 전송 오류:", error);
                    });
                  }
                }
              }
            } catch (parseError) {
              console.warn('JSON 파싱 오류 (스트림 중):', parseError, 'Line:', jsonStr);
            }
          }
        }
      }
      
      // 타이핑 상태 제거
      activeTypingEffects.delete(blockId);
      
      // 최종 결과 파싱
      const finalResult = extractNewsContentFromText(fullText);
      
      console.log(`API 스트리밍 호출 성공 (시도 ${attempt}/${MAX_RETRIES})`);
      return finalResult;
      
    } catch (error) {
      lastError = error;
      activeTypingEffects.delete(blockId);
      console.error(`API 스트리밍 호출 실패 (시도 ${attempt}/${MAX_RETRIES}):`, error.message);
      
      // 사용자가 중단한 경우 재시도하지 않음
      if (error.message.includes('중단')) {
        throw error;
      }
      
      // 마지막 시도가 아니면 재시도
      if (attempt < MAX_RETRIES) {
        console.log(`${RETRY_DELAY / 1000}초 후 재시도합니다...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  
  // 모든 재시도 실패 시 에러 메시지를 content script로 전송
  const errorMessage = `API 호출에 ${MAX_RETRIES}번 실패했습니다.\n\n오류 내용:\n${lastError.message}`;
  console.error("최종 실패:", errorMessage);
  
  if (isChromeApiAvailable()) {
    chrome.tabs.sendMessage(tabId, {
      action: "displayErrorModal",
      error: errorMessage,
      blockId: blockId
    }).catch(error => console.error("에러 모달 전송 오류:", error));
  }
  
  throw lastError;
}

/**
 * 타이핑 효과 시뮬레이션 (폴백용 - 실제 스트리밍 실패 시 사용)
 * @param {string} text - 전체 텍스트
 * @param {number} tabId - 탭 ID
 * @param {string} blockId - 블록 ID
 */
async function simulateTypingEffect(text, tabId, blockId) {
  // 타이핑 상태 등록
  const typingState = { shouldStop: false };
  activeTypingEffects.set(blockId, typingState);
  
  const words = text.split(' ');
  let currentText = '';
  
  for (let i = 0; i < words.length; i++) {
    // 중단 요청 확인
    if (typingState.shouldStop) {
      console.log('[simulateTypingEffect] 타이핑 중단됨:', blockId);
      activeTypingEffects.delete(blockId);
      return;
    }
    
    currentText += (i > 0 ? ' ' : '') + words[i];
    
    // 단어별로 실시간 업데이트 전송 (안전 확인)
    if (isChromeApiAvailable()) {
      try {
        chrome.tabs.sendMessage(tabId, {
          action: "updateStreamingResult",
          partialResult: currentText,
          blockId: blockId
        }).catch(error => {
          console.error("스트리밍 메시지 전송 오류:", error);
        });
      } catch (error) {
        console.error("Chrome API 호출 오류:", error);
        activeTypingEffects.delete(blockId);
        break; // 오류 발생 시 루프 중단
      }
    }
    
    // 타이핑 속도 조절 (단어 길이에 따라 조절)
    const delay = Math.max(50, Math.min(200, words[i].length * 20));
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  // 타이핑 완료 후 상태 제거
  activeTypingEffects.delete(blockId);
}

/**
 * Gemini API를 비스트리밍 방식으로 호출하는 함수
 * @param {string} prompt - API에 전송할 전체 프롬프트
 * @param {string} apiKey - Gemini API 키
 * @returns {Promise<object>} - API가 반환한 결과 객체
 */
async function callGeminiAPINonStreaming(prompt, apiKey) {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
  try {
    console.log('[callGeminiAPINonStreaming] 비스트리밍 API 호출 시작');
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(`API 요청 실패: ${response.status} ${response.statusText} - ${JSON.stringify(errorBody)}`);
    }

    const data = await response.json();
    const resultText = data.candidates[0]?.content?.parts[0]?.text || '{}';
    
    console.log('[callGeminiAPINonStreaming] 응답 텍스트 길이:', resultText.length);
    
    // JSON 파싱
    const parsed = extractNewsContentFromText(resultText);
    return parsed;
    
  } catch (error) {
    console.error("[callGeminiAPINonStreaming] API 호출 오류:", error);
    throw error;
  }
}

/**
 * Gemini API를 호출하는 비동기 함수 (기존 방식)
 * @param {string} prompt - API에 전송할 전체 프롬프트
 * @param {string} apiUrl - API URL (키 포함)
 * @returns {Promise<string>} - API가 반환한 텍스트 결과
 */
async function callGeminiAPI(prompt, apiUrl) {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(`API 요청 실패: ${response.status} ${response.statusText} - ${JSON.stringify(errorBody)}`);
    }

    const data = await response.json();
    return extractNewsContent(data);
  } catch (error) {
    console.error("fetch 또는 API 호출 오류:", error);
    throw error; // 오류를 상위로 전파
  }
}

/**
 * 스트리밍으로 받은 텍스트에서 뉴스 콘텐츠를 추출하는 함수
 * @param {string} text - 스트리밍으로 받은 전체 텍스트
 * @returns {object|string} - 분석 결과 객체 또는 텍스트
 */
function extractNewsContentFromText(text) {
  try {
    // 코드블록 제거
    const cleanText = text.replace(/```json|```/g, '').trim();
    
    // JSON 파싱 시도
    let parsed;
    try {
      parsed = JSON.parse(cleanText);
    } catch (e) {
      // 배열이 아닌 경우 객체만 파싱 시도
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // JSON 파싱에 실패하면 텍스트 그대로 반환
        return cleanText;
      }
    }
    
    // 배열이면 첫 번째 객체의 output 사용 (새로운 형식)
    if (Array.isArray(parsed) && parsed.length > 0) {
      if (parsed[0].output) {
        return parsed[0].output;
      }
      return parsed[0];
    }
    
    // 객체면 output 프로퍼티 확인
    if (parsed && typeof parsed === 'object' && parsed.output) {
      return parsed.output;
    }
    
    // 그 외의 경우 파싱된 객체 반환
    return parsed || cleanText;
  } catch (error) {
    console.error("텍스트 파싱 오류:", error);
    return text; // 파싱 실패 시 원본 텍스트 반환
  }
}

/**
 * Gemini API 응답에서 뉴스 콘텐츠를 추출하는 함수
 * @param {object} data - Gemini API의 JSON 응답
 * @returns {object|string} - 분석 결과 객체 또는 오류 메시지
 */
function extractNewsContent(data) {
  try {
    // candidates 배열에서 첫 번째 content.parts[0].text 추출
    let resultText = '';
    if (data.candidates && data.candidates.length > 0) {
      const content = data.candidates[0].content;
      if (content.parts && content.parts.length > 0) {
        resultText = content.parts[0].text;
      }
    }
    // 코드블록 제거
    resultText = resultText.replace(/```json|```/g, '').trim();
    // JSON 배열 또는 객체 파싱
    let parsed;
    try {
      parsed = JSON.parse(resultText);
    } catch (e) {
      // 배열이 아닌 경우 객체만 파싱 시도
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    }
    // 배열이면 첫 번째 객체의 output 사용
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].output) {
      return parsed[0].output;
    }
    // 배열 형식의 응답 처리 (새로운 형식)
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].output) {
      const output = parsed[0].output;
      return {
        분석진행: output.분석진행 || '',
        진위: output.진위 || '',
        근거: output.근거 || '',
        분석: output.분석 || '',
        요약: output.요약 || ''
      };
    }
    // 객체에 output 있으면 사용
    if (parsed && parsed.output) {
      return parsed.output;
    }
    // 객체에 진위/근거/분석 있으면 사용 (기존 형식)
    if (parsed && parsed.진위) {
      return {
        분석진행: parsed.분석진행 || '',
        진위: parsed.진위,
        근거: parsed.근거 || '',
        분석: parsed.분석 || '',
        요약: parsed.요약 || parsed.핵심요약 || ''
      };
    }
    // 파싱 실패 시 원본 텍스트 반환
    return resultText;
  } catch (error) {
    return {
      분석진행: '',
      진위: '분석 오류',
      근거: '',
      분석: 'JSON 파싱 오류: ' + error.message,
      요약: ''
    };
  }
}

/**
 * 테스트용: extractNewsContent 함수가 정상적으로 동작하는지 확인하는 함수
 */
function extractNewsContentTest() {
  // Gemini API의 응답을 흉내낸 샘플 데이터
  const sampleData = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: `[
                {
                  "instruction": "해당 기사는 진위 여부판단을 목적으로 수집되었습니다. 조건에 따라서 종합적으로 검토 후 판단 결과를 진위,근거,분석 항목으로 나누어 출력하세요.",
                  "input": "주어진 텍스트 전체",
                  "output": {
                    "진위": "진짜 뉴스",
                    "근거": "",
                    "분석": "이 뉴스는 논리적 구조와 근거 제시 방식이 명확하며, 외부 정보 없이도 신뢰할 수 있습니다."
                  }
                }
              ]`
            }
          ]
        }
      }
    ]
  };
  return extractNewsContent(sampleData);
}