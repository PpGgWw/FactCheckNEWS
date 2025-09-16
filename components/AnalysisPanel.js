// AnalysisPanel.js - 분석 결과 패널 컴포넌트

class AnalysisPanel {
  constructor() {
    this.panelId = 'news-analysis-panel';
  }

  create() {
    // 기존 패널이 있으면 제거
    const existingPanel = document.getElementById(this.panelId);
    if (existingPanel) {
      existingPanel.remove();
    }

    // 패널 컨테이너 생성
    const panelContainer = document.createElement('div');
    panelContainer.id = this.panelId;
    panelContainer.className = 'fixed bottom-1 right-1 w-96 max-h-96 bg-background shadow-2xl z-50 overflow-y-auto rounded-xl border border-secondary';
    
    // 애니메이션 효과 추가
    panelContainer.style.cssText += `
      transform: translateX(100%);
      transition: transform 0.3s ease-out, opacity 0.3s ease-out;
      opacity: 0;
    `;
    
    document.body.appendChild(panelContainer);
    
    // 애니메이션 시작
    setTimeout(() => {
      panelContainer.style.transform = 'translateX(0)';
      panelContainer.style.opacity = '1';
    }, 10);
    
    return panelContainer;
  }

  renderHeader() {
    return `
      <div class="flex items-center mb-4 pb-3 border-b border-secondary bg-secondary -m-4 p-4 rounded-t-xl">
        <h2 class="text-lg font-bold text-text-primary flex-1">뉴스 분석</h2>
        <div class="flex justify-end items-center gap-1">
          <button id="Settings" class="text-text-secondary hover:text-text-primary hover:bg-background rounded-full w-8 h-8 flex items-center justify-center transition-colors mr-1">⚙️</button>
          <button id="close-panel" class="text-text-secondary hover:text-text-primary hover:bg-background rounded-full w-8 h-8 flex items-center justify-center transition-colors">&times;</button>
        </div>
      </div>
    `;
  }

  renderError() {
    return `
      <div class="p-6">
        <div class="bg-status-error-light border border-status-error rounded-lg p-4">
          <div class="text-status-error font-medium">분석 결과가 없습니다</div>
        </div>
      </div>
    `;
  }

  attachCloseEvent(panel) {
    const closeBtn = panel.querySelector('#close-panel');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        // 닫기 애니메이션
        panel.style.transform = 'translateX(100%)';
        panel.style.opacity = '0';
        setTimeout(() => {
          panel.style.display = 'none';
          this.createFloatingButton();
        }, 300);
      });
    }
  }

  createFloatingButton() {
    // 기존 플로팅 버튼 제거
    const existingFloatingBtn = document.getElementById('floating-news-analysis-btn');
    if (existingFloatingBtn) {
      existingFloatingBtn.remove();
    }

    // 플로팅 버튼 생성
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

    // 애니메이션으로 나타나기
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

  attachSettingsEvent(panel) {
    console.log('attachSettingsEvent 호출됨'); // 디버그 로그
    const settingsBtn = panel.querySelector('#Settings');
    console.log('설정 버튼 찾기:', settingsBtn); // 디버그 로그
    
    if (settingsBtn) {
      settingsBtn.addEventListener('click', (e) => {
        console.log('설정 버튼 클릭됨!'); // 디버그 로그
        e.preventDefault();
        e.stopPropagation();
        
        if (document.getElementById('api-key-input-modal')) {
          console.log('모달이 이미 존재함');
          return;
        }
        
        console.log('모달 생성 시작'); // 디버그 로그
        
        // 저장된 API 키 확인
        this.checkSavedApiKey().then((savedApiKey) => {
          // 모달 배경 생성
          const modalDiv = document.createElement('div');
          modalDiv.id = 'api-key-input-modal';
          modalDiv.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(13,13,13,0.6) !important;
            z-index: 2147483647 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          `;
          
          const modalContent = document.createElement('div');
          modalContent.style.cssText = `
            background: #F2F2F2 !important;
            border-radius: 12px !important;
            box-shadow: 0 10px 25px rgba(13,13,13,0.3) !important;
            padding: 32px !important;
            width: 560px !important;
            height: 270px !important;
            position: relative !important;
            display: flex !important;
            flex-direction: column !important;
            transform: scale(0.8) !important;
            opacity: 0 !important;
            transition: all 0.3s ease !important;
          `;
          
          const isEdit = !!savedApiKey;
          const maskedKey = savedApiKey ? `${savedApiKey.substring(0, 8)}...${savedApiKey.substring(savedApiKey.length - 4)}` : '';
          
          if (isEdit) {
            // API 키가 저장되어 있는 경우 - 표시 모드
            modalContent.innerHTML = `
              <button id="modal-close" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; color: #737373; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">&times;</button>
              <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 32px; text-align: center; color: #0D0D0D;">API 키 설정</h2>
              <div style="background: #F2F2F2; border: 2px solid #BF9780; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; flex: 1; display: flex; align-items: center; justify-content: center;">
                <span style="font-family: monospace; font-size: 16px; color: #0D0D0D;">${maskedKey}</span>
              </div>
              <button id="api-key-edit" style="background: #BF9780; color: white; padding: 16px 32px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; width: 100%; transition: background-color 0.2s; font-size: 16px;">수정</button>
            `;
          } else {
            // API 키가 없는 경우 - 입력 모드
            modalContent.innerHTML = `
              <button id="modal-close" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; color: #737373; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">&times;</button>
              <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 32px; text-align: center; color: #0D0D0D;">API 키를 입력하세요</h2>
              <input id="api-key-input" type="text" placeholder="Gemini API Key" style="border: 2px solid #BF9780; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; width: 100%; font-size: 16px; box-sizing: border-box; flex: 1; outline: none; transition: border-color 0.2s;" />
              <button id="api-key-submit" style="background: #F2CEA2; color: #0D0D0D; padding: 16px 32px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; width: 100%; transition: background-color 0.2s; font-size: 16px;">확인</button>
            `;
          }
          
          modalDiv.appendChild(modalContent);
          document.body.appendChild(modalDiv);
          
          console.log('모달이 DOM에 추가됨'); // 디버그 로그
          
          // 애니메이션으로 나타나기
          setTimeout(() => {
            modalContent.style.transform = 'scale(1)';
            modalContent.style.opacity = '1';
          }, 10);
          
          // 닫기 기능
          const closeModal = () => {
            console.log('모달 닫기 시작'); // 디버그 로그
            modalContent.style.transform = 'scale(0.8)';
            modalContent.style.opacity = '0';
            setTimeout(() => {
              if (modalDiv.parentNode) {
                modalDiv.remove();
              }
            }, 300);
          };
          
          // 닫기 버튼 이벤트
          const closeBtn = modalContent.querySelector('#modal-close');
          if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
            closeBtn.addEventListener('mouseenter', () => {
              closeBtn.style.backgroundColor = '#BF9780';
            });
            closeBtn.addEventListener('mouseleave', () => {
              closeBtn.style.backgroundColor = 'transparent';
            });
          }
          
          // 배경 클릭으로 닫기
          modalDiv.addEventListener('click', (e) => {
            if (e.target === modalDiv) closeModal();
          });
          
          if (isEdit) {
            // 수정 버튼 이벤트 (표시 모드)
            const editBtn = modalContent.querySelector('#api-key-edit');
            if (editBtn) {
              editBtn.addEventListener('click', () => {
                // 입력 모드로 전환
                modalContent.innerHTML = `
                  <button id="modal-close" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; color: #737373; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">&times;</button>
                  <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 32px; text-align: center; color: #0D0D0D;">API 키 수정</h2>
                  <input id="api-key-input" type="text" placeholder="새로운 Gemini API Key" value="${savedApiKey}" style="border: 2px solid #BF9780; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; width: 100%; font-size: 16px; box-sizing: border-box; flex: 1; outline: none; transition: border-color 0.2s;" />
                  <button id="api-key-submit" style="background: #F2CEA2; color: #0D0D0D; padding: 16px 32px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; width: 100%; transition: background-color 0.2s; font-size: 16px;">저장</button>
                `;
                
                this.attachInputEvents(modalContent, closeModal);
              });
              
              // 호버 효과
              editBtn.addEventListener('mouseenter', () => {
                editBtn.style.backgroundColor = '#A68570';
              });
              editBtn.addEventListener('mouseleave', () => {
                editBtn.style.backgroundColor = '#BF9780';
              });
            }
          } else {
            // 입력 모드 이벤트
            this.attachInputEvents(modalContent, closeModal);
          }
          
          // ESC 키로 닫기
          document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
              closeModal();
              document.removeEventListener('keydown', escHandler);
            }
          });
        });
      });
    } else {
      console.log('설정 버튼을 찾을 수 없음'); // 디버그 로그
    }
  }

  // 저장된 API 키 확인
  async checkSavedApiKey() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.get(['apiKey'], (result) => {
            resolve(result.apiKey || '');
          });
        });
      } else {
        return localStorage.getItem('gemini_api_key') || '';
      }
    } catch (error) {
      console.log('API 키 확인 오류:', error);
      return '';
    }
  }

  // 입력 이벤트 연결
  attachInputEvents(modalContent, closeModal) {
    // 입력창 포커스 효과
    const input = modalContent.querySelector('#api-key-input');
    if (input) {
      input.addEventListener('focus', () => {
        input.style.borderColor = '#F2CEA2';
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = '#BF9780';
      });
      // 자동 포커스
      setTimeout(() => input.focus(), 100);
    }
    
    // 확인 버튼 이벤트
    const submitBtn = modalContent.querySelector('#api-key-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const apiKey = input.value.trim();
        console.log('API 키 입력값:', apiKey); // 디버그 로그
        
        if (apiKey) {
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ apiKey: apiKey }, () => {
              console.log('API 키 저장 완료'); // 디버그 로그
              alert('API 키가 저장되었습니다!');
              closeModal();
            });
          } else {
            console.log('chrome.storage를 사용할 수 없음, localStorage 사용'); // 디버그 로그
            localStorage.setItem('gemini_api_key', apiKey);
            alert('API 키가 저장되었습니다!');
            closeModal();
          }
        } else {
          alert('API 키를 입력해주세요.');
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
    
    // Enter 키로 제출
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          submitBtn.click();
        }
      });
    }
  }

  showAnalysisLoading() {
    const panel = this.create();
    panel.innerHTML = `
      ${this.renderHeader()}
      <div class="p-6 flex flex-col items-center">
        <div class="loader"></div>
        <div class="text-center mt-4">
          <span class="text-text-primary">분석 중입니다...</span>
        </div>
      </div>
    `;
    // 이벤트 연결
    this.attachCloseEvent(panel);
    this.attachSettingsEvent(panel);
    console.log('패널 이벤트 연결 완료');
  }

  displayAnalysisResult(result) {
    const panel = this.create();
    panel.innerHTML = `
      ${this.renderHeader()}
      <div class="p-6">
        <div class="bg-background rounded-lg shadow-md p-4">
          <h3 class="text-lg font-semibold mb-2">분석 결과</h3>
          <pre class="whitespace-pre-wrap text-text-primary">${JSON.stringify(result, null, 2)}</pre>
        </div>
      </div>
    `;
    // 이벤트 연결
    this.attachCloseEvent(panel);
    this.attachSettingsEvent(panel);
  }

  displayError(error) {
    const panel = this.create();
    panel.innerHTML = `
      ${this.renderHeader()}
      ${this.renderError()}
    `;
    // 이벤트 연결
    this.attachCloseEvent(panel);
    this.attachSettingsEvent(panel);
  }
}

// Export for use in content_script.js
window.AnalysisPanel = AnalysisPanel;
