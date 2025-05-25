추가 계획.  
**Gunicorn**: 여러 요청을 동시에, 더 안정적으로 처리할 수 있습니다.  
**Celery**: 요청만 받고, 실제 힘든 일은 보이지 않는 곳(백그라운드)에서 처리합니다. 그럼 서버는 계속 다른 클라이언트를 받아들일 수 있습니다. (앱이 바로바로 반응하는게 핵심입니다.)  
```
FaCtCheCKNEWS3/
├── app.py                         # 🌐 Flask 웹 애플리케이션의 메인 실행 파일
├── fake_api_server.py             # 🤖 (AI 모델) FastAPI 기반의 뉴스 분석 API 서버 (이 파일은 OpenAI, text-generation-webui 를 모방한 코드파일이며 실제와 다릅니다!)
|
├── modules/                       # 🛠️ 기능별 파이썬 모듈
│   ├── __init__.py                #    (이 폴더를 파이썬 패키지로 인식시킵니다. 내용은 비어있음)
│   ├── crawler.py                 #    📰 뉴스 기사 웹 크롤링 (수집) 기능 담당
│   ├── analyzer_api_simulator.py  #    📞 AI 분석 API 호출 및 응답 처리 담당 (클라이언트 역할)
│   └── highlighter.py             #    ✨ 텍스트 내 특정 부분을 강조하는 기능 (현재는 사용 빈도 낮음)
|
├── static/                        # 🎨 웹 페이지의 정적 파일 (CSS, JavaScript 등)
│   ├── style.css                  #    🎨 웹 페이지 전체 스타일 시트
│   ├── script.js                  #    ⚙️ 공통 UI 상호작용 (예: 햄버거 메뉴) JavaScript
│   └── processing.js              #    ⏳ 분석 중 페이지의 동적 처리 JavaScript (SSE 연동)
|
├── templates/                     # 📄 웹 페이지의 HTML 템플릿
│   ├── index.html                 #    🏠 사용자가 URL/텍스트를 입력하는 메인 페이지
│   ├── processing.html            #    ⚙️ 분석이 진행되는 동안 보여지는 로딩/상태 표시 페이지
│   └── result.html                #    📊 분석 결과를 사용자에게 보여주는 페이지
|
└── models/                        # 🧠 Llama 모델 파일 저장 폴더
    └── Meta-Llama-3-8B-Instruct.Q5_K_M.gguf # 💡 실제 Llama-3 모델 파일
```  

## 🚀 프로젝트 실행 가이드

**실행 순서가 중요합니다!** AI 분석 API 서버가 먼저 실행되어야 웹 애플리케이션이 정상적으로 AI 분석 기능을 호출할 수 있습니다.  

### 1️⃣ 단계: AI 분석 API 서버 실행

1.  **터미널**(명령 프롬프트 또는 PowerShell 등)을 엽니다.  
2.  프로젝트의 루트 폴더인 `FactCheckNEWS2/`로 이동합니다.  
    ```bash
    cd 경로/FactCheckNEWS2
    ```
3.  다음 명령어를 입력하여 FastAPI 기반의 AI 분석 API 서버를 실행합니다:  
    ```bash
    python fake_api_server.py
    ```
    * 성공적으로 실행되면, 터미널에 `Uvicorn running on http://0.0.0.0:5005 (Press CTRL+C to quit)` 와 유사한 메시지가 나타납니다.  
    * **주의:** `models/Meta-Llama-3-8B-Instruct.Q5_K_M.gguf` 모델 파일이 `FactCheckNEWS2/models/` 폴더 안에 정확히 위치해야 합니다. 모델 파일이 없거나 경로가 다르면 서버 실행 시 오류가 발생합니다.  

### 2️⃣ 단계: 웹 애플리케이션 (Flask) 실행

1.  **새로운 터미널 창**을 엽니다. (이전 터미널은 AI 분석 API 서버가 계속 실행 중이어야 합니다.)  
2.  마찬가지로 프로젝트의 루트 폴더인 `FactCheckNEWS2/`로 이동합니다.  
    ```bash
    cd 경로/FactCheckNEWS2
    ```
3.  다음 명령어를 입력하여 Flask 웹 애플리케이션을 실행합니다:  
    ```bash
    python app.py
    ```
    * 성공적으로 실행되면, 터미널에 `Running on http://0.0.0.0:5000/ (Press CTRL+C to quit)` 와 유사한 메시지가 나타납니다.  

### 3️⃣ 단계: 웹 브라우저에서 접속

1.  **웹 브라우저**를 엽니다.  
2.  주소창에 다음 URL을 입력하여 접속합니다:  
    `http://127.0.0.1:5000/`  
    (또는 Flask 서버 실행 시 터미널에 나타난 URL, 예를 들어 `http://0.0.0.0:5000/`의 경우에도 `http://127.0.0.1:5000/` 또는 `http://localhost:5000/`으로 접속)  

---

**✅ 실행 전 확인 사항:**

* **Python 설치:** 파이썬이 시스템에 설치되어 있어야 합니다.  
* **필수 라이브러리 설치:** `requirements.txt`에 명시된 모든 라이브러리가 설치되어 있어야 합니다. 프로젝트 루트 폴더(`FactCheckNEWS2/`)에서 다음 명령어를 실행하세요:  
    ```bash
    pip install -r requirements.txt
    ```
    (만약 `requirements.txt` 파일이 없다면, 다음 명령어로 주요 라이브러리를 설치할 수 있습니다: `pip install Flask requests beautifulsoup4 fastapi uvicorn pydantic llama-cpp-python`)  
* **모델 파일 위치:** `Meta-Llama-3-8B-Instruct.Q5_K_M.gguf` 파일이 `FactCheckNEWS2/models/` 폴더 안에 있는지 다시 한번 확인해주세요.  

---   
  
  
  
  
  
  
📄 각 파일 및 폴더 상세 설명:   
```
app.py:  
Flask 프레임워크를 사용하여 웹 애플리케이션을 실행하는 중심 파일입니다.  
사용자 요청을 받아 URL을 처리하고, 크롤링 또는 AI 분석을 지시하며, 결과를 HTML 페이지로 렌더링합니다.  
/, /process, /get_analysis_stream과 같은 라우트(URL 경로)를 정의합니다.  
```
`fake_api_server.py:  `  
```  
FastAPI 프레임워크를 사용하여 models/ 폴더 내의 Llama-3 모델을 로드하고,
뉴스 분석 요청을 받아 JSON 형식으로 응답하는 API 서버입니다.  
app.py의 analyzer_api_simulator.py 모듈로부터 /v1/chat/completions 엔드포인트로 요청을 받습니다.  
```
`modules/: 이 폴더는 애플리케이션의 주요 기능들을 모듈화하여 관리합니다.  `  
```  
__init__.py: 이 파일이 있으면 modules 폴더를 파이썬 패키지로 만들 수 있습니다. 내용은 비어 있어도 됩니다.    
  
crawler.py: 웹에서 뉴스 기사의 제목, 본문, 날짜, 언론사 등의 정보를 수집(크롤링)하는 기능을 담당합니다.    
  
analyzer_api_simulator.py: fake_api_server.py로 실제 뉴스 분석 요청을 보내고,
그 결과를 받아 처리하는 클라이언트 역할을 합니다.    
  
highlighter.py: 텍스트 내에서 특정 키워드나 문장을 찾아 HTML 태그로 감싸 강조 표시하는 기능을 제공합니다.
(현재 앱에서는 AI 분석 기능 제거로 인해 사용 빈도가 낮을 수 있다고 언급되었습니다.)    
```
`static/: 웹 페이지에서 사용되는 정적 파일들을 모아둡니다.  `  
```
style.css: 웹 페이지의 전반적인 디자인과 레이아웃을 정의하는 CSS 파일입니다.  

script.js: 모든 페이지에 공통적으로 적용될 수 있는 JavaScript 코드를 포함합니다.
예를 들어, 내비게이션 메뉴(햄버거 메뉴)의 동작 등을 처리합니다.  

processing.js: processing.html 페이지에서 사용되며, 서버로부터 실시간으로 분석 상태를 받아 표시하고(SSE),
최종 결과를 동적으로 result.html의 구조에 맞게 생성하여 보여주는 역할을 합니다.  
```
`templates/: Flask가 웹 페이지를 동적으로 생성할 때 사용하는 HTML 템플릿 파일들을 저장합니다.  `  
```
index.html: 사용자가 처음 접속하는 메인 페이지로, 뉴스 URL이나 텍스트를 입력받는 폼이 있습니다.

processing.html: 뉴스 분석이 진행되는 동안 사용자에게 로딩 상태나 진행 상황을 보여주는 페이지입니다.  
processing.js에 의해 내용이 업데이트됩니다.

result.html: 분석이 완료된 후, 신뢰도 점수, AI 분석 결과, 하이라이트된 본문 등을 표시하는 페이지입니다.  
이 페이지의 실제 내용은 processing.js에 의해 동적으로 채워집니다.  
```
`models/:`   
```
Meta-Llama-3-8B-Instruct.Q5_K_M.gguf: fake_api_server.py에서 로드하여 실제 뉴스 분석에 사용되는 Llama-3 모델 파일입니다.
```
