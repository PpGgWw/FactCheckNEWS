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
        
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
        
        // Gemini API 호출 함수 실행 (재시도 로직 포함)
        callGeminiAPIWithRetry(message.prompt, API_URL, sender.tab.id, message.blockId, 3)
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
            
            // 오류를 content script로 전송 (blockId 포함, 에러 상세 포함)
            if (isChromeApiAvailable()) {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: "displayError",
                error: error.message,
                blockId: message.blockId,
                errorType: "API_ERROR"
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
  }
});

/**
 * Gemini API를 재시도 로직과 함께 호출하는 래퍼 함수
 * @param {string} prompt - API에 전송할 전체 프롬프트
 * @param {string} apiUrl - API URL (키 포함)
 * @param {number} tabId - 탭 ID
 * @param {string} blockId - 블록 ID
 * @param {number} maxRetries - 최대 재시도 횟수 (기본값: 3)
 * @returns {Promise<string>} - API가 반환한 최종 텍스트 결과
 */
async function callGeminiAPIWithRetry(prompt, apiUrl, tabId, blockId, maxRetries = 3) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`API 호출 시도 ${attempt}/${maxRetries}`);
      
      // 재시도 시 지수 백오프 대기 (첫 시도는 대기 없음)
      if (attempt > 1) {
        const delayMs = Math.pow(2, attempt - 2) * 1000; // 1초, 2초, 4초
        console.log(`${delayMs}ms 대기 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      const result = await callGeminiAPIWithStreaming(prompt, apiUrl, tabId, blockId);
      console.log(`API 호출 성공 (시도 ${attempt}/${maxRetries})`);
      return result;
      
    } catch (error) {
      lastError = error;
      console.error(`API 호출 실패 (시도 ${attempt}/${maxRetries}):`, error.message);
      
      // 마지막 시도가 아니면 계속 재시도
      if (attempt < maxRetries) {
        console.log('재시도 예정...');
      }
    }
  }
  
  // 모든 재시도 실패 시 에러 던지기
  console.error(`모든 재시도 실패 (${maxRetries}회 시도)`);
  throw new Error(`API 호출 ${maxRetries}회 재시도 실패: ${lastError.message}`);
}

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
    // 분석 단계별 진행 상황 전송 (간소화)
    const sendProgressUpdate = (message) => {
      if (isChromeApiAvailable()) {
        try {
          chrome.tabs.sendMessage(tabId, {
            action: "updateAnalysisProgress",
            blockId: blockId,
            message: message
          }).catch(error => {
            console.error("진행상황 메시지 전송 오류:", error);
          });
        } catch (error) {
          console.error("Chrome API 호출 오류:", error);
        }
      }
    };
    
    sendProgressUpdate('📡 API 요청 중...');
    
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

    sendProgressUpdate('📥 응답 분석 중...');
    
    const data = await response.json();
    const fullResult = extractNewsContent(data);
    
    sendProgressUpdate('✅ 분석 완료!');

    return fullResult;
  } catch (error) {
    console.error("API 호출 오류:", error);
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