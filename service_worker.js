// service_worker.js

// Chrome API 안전 확인 함수
function isChromeApiAvailable() {
  try {
    return chrome && chrome.runtime && chrome.runtime.id;
  } catch (error) {
    return false;
  }
}

// content_script로부터 메시지를 수신하는 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      chrome.storage.local.get(['apiKey'], (result) => {
        if (chrome.runtime.lastError) {
          console.error("API 키 로드 오류:", chrome.runtime.lastError);
          sendResponse({ status: "저장소 오류", error: chrome.runtime.lastError.message });
          return;
        }
        
        const API_KEY = result.apiKey;
        
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
        
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
        
        // Gemini API 호출 함수 실행 (스트리밍 방식)
        callGeminiAPIWithStreaming(message.prompt, API_URL, sender.tab.id, message.blockId)
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
            
            sendResponse({ status: "분석 완료 및 결과 전송 성공" });
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
      });
    } catch (error) {
      console.error("저장소 접근 오류:", error);
      sendResponse({ status: "저장소 오류", error: error.message });
    }

    // 비동기 응답을 위해 true를 반환
    return true; 
  } else if (message.action === "saveVerdict") {
    console.log("Content Script로부터 진위 결과 저장 요청을 받았습니다.", message);
    const { url, result } = message;

    if (!url || !result) {
      console.error("[ServiceWorker] 저장할 URL 또는 결과가 없습니다.");
      sendResponse({ status: "저장 실패", error: "URL 또는 결과 없음" });
      return true;
    }

    const normalizeUrl = (urlString) => {
      try {
        const urlObj = new URL(urlString);
        return urlObj.origin + urlObj.pathname;
      } catch {
        return urlString;
      }
    };

    const normalizedUrl = normalizeUrl(url);
    const verdict = result.진위;
    const suspicious = result.수상한문장;

    if (!verdict) {
      console.warn("[ServiceWorker] 저장할 진위 결과(verdict)가 없습니다.");
      sendResponse({ status: "저장 실패", error: "진위 결과 없음" });
      return true;
    }

    chrome.storage.local.get(['factcheck_verdicts'], (storageResult) => {
      if (chrome.runtime.lastError) {
        console.error('[ServiceWorker] 저장소 읽기 오류:', chrome.runtime.lastError);
        sendResponse({ status: "저장 실패", error: chrome.runtime.lastError.message });
        return;
      }

      const savedVerdicts = storageResult.factcheck_verdicts || {};
      savedVerdicts[normalizedUrl] = {
        verdict: verdict,
        suspicious: suspicious,
        timestamp: Date.now()
      };

      chrome.storage.local.set({ factcheck_verdicts: savedVerdicts }, () => {
        if (chrome.runtime.lastError) {
          console.error('[ServiceWorker] 🚨 저장 실패:', chrome.runtime.lastError);
          sendResponse({ status: "저장 실패", error: chrome.runtime.lastError.message });
        } else {
          console.log('[ServiceWorker] ✅ 진위 결과 저장 완료:', normalizedUrl, verdict);
          sendResponse({ status: "저장 성공" });
        }
      });
    });

    return true; // 비동기 응답
  }
});

/**
 * Gemini API를 스트리밍 방식으로 호출하는 비동기 함수
 * @param {string} prompt - API에 전송할 전체 프롬프트
 * @param {string} apiUrl - API URL (키 포함)
 * @param {number} tabId - 탭 ID
 * @param {string} blockId - 블록 ID
 * @returns {Promise<string>} - API가 반환한 최종 텍스트 결과
 */
async function callGeminiAPIWithStreaming(prompt, apiUrl, tabId, blockId) {
  try {
    // 일단 기본 API로 전체 결과를 받은 후 타이핑 효과 시뮬레이션
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
    const fullResult = extractNewsContent(data);
    
    // 결과를 문자 단위로 타이핑 효과 시뮬레이션
    if (typeof fullResult === 'string') {
      await simulateTypingEffect(fullResult, tabId, blockId);
    } else {
      // JSON 객체인 경우 문자열로 변환 후 타이핑 효과
      const resultString = JSON.stringify(fullResult, null, 2);
      await simulateTypingEffect(resultString, tabId, blockId);
    }

    return fullResult;
  } catch (error) {
    console.error("API 호출 오류:", error);
    throw error;
  }
}

/**
 * 타이핑 효과 시뮬레이션
 * @param {string} text - 전체 텍스트
 * @param {number} tabId - 탭 ID
 * @param {string} blockId - 블록 ID
 */
async function simulateTypingEffect(text, tabId, blockId) {
  const words = text.split(' ');
  let currentText = '';
  
  for (let i = 0; i < words.length; i++) {
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
        break; // 오류 발생 시 루프 중단
      }
    }
    
    // 타이핑 속도 조절 (단어 길이에 따라 조절)
    const delay = Math.max(50, Math.min(200, words[i].length * 20));
    await new Promise(resolve => setTimeout(resolve, delay));
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