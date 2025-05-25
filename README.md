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
  
📄 각 파일 및 폴더 상세 설명:   
```
app.py:  
Flask 프레임워크를 사용하여 웹 애플리케이션을 실행하는 중심 파일입니다.
사용자 요청을 받아 URL을 처리하고, 크롤링 또는 AI 분석을 지시하며, 결과를 HTML 페이지로 렌더링합니다.
/, /process, /get_analysis_stream과 같은 라우트(URL 경로)를 정의합니다.
```
`fake_api_server.py:  `  
```  
FastAPI 프레임워크를 사용하여 models/ 폴더 내의 Llama-3 모델을 로드하고, 뉴스 분석 요청을 받아 JSON 형식으로 응답하는 API 서버입니다.  
app.py의 analyzer_api_simulator.py 모듈로부터 /v1/chat/completions 엔드포인트로 요청을 받습니다.  
```
`modules/: 이 폴더는 애플리케이션의 주요 기능들을 모듈화하여 관리합니다.  `  
```  
__init__.py: 이 파일이 있으면 modules 폴더를 파이썬 패키지로 만들 수 있습니다. 내용은 비어 있어도 됩니다.    
  
crawler.py: 웹에서 뉴스 기사의 제목, 본문, 날짜, 언론사 등의 정보를 수집(크롤링)하는 기능을 담당합니다.    
  
analyzer_api_simulator.py: fake_api_server.py로 실제 뉴스 분석 요청을 보내고, 그 결과를 받아 처리하는 클라이언트 역할을 합니다.    
  
highlighter.py: 텍스트 내에서 특정 키워드나 문장을 찾아 HTML 태그로 감싸 강조 표시하는 기능을 제공합니다. (현재 앱에서는 AI 분석 기능 제거로 인해 사용 빈도가 낮을 수 있다고 언급되었습니다.)    
```
`static/: 웹 페이지에서 사용되는 정적 파일들을 모아둡니다.  `  
```
style.css: 웹 페이지의 전반적인 디자인과 레이아웃을 정의하는 CSS 파일입니다.  

script.js: 모든 페이지에 공통적으로 적용될 수 있는 JavaScript 코드를 포함합니다. 예를 들어, 내비게이션 메뉴(햄버거 메뉴)의 동작 등을 처리합니다.  

processing.js: processing.html 페이지에서 사용되며, 서버로부터 실시간으로 분석 상태를 받아 표시하고(SSE), 최종 결과를 동적으로 result.html의 구조에 맞게 생성하여 보여주는 역할을 합니다.  
```
`templates/: Flask가 웹 페이지를 동적으로 생성할 때 사용하는 HTML 템플릿 파일들을 저장합니다.  `  
```
index.html: 사용자가 처음 접속하는 메인 페이지로, 뉴스 URL이나 텍스트를 입력받는 폼이 있습니다.  
processing.html: 뉴스 분석이 진행되는 동안 사용자에게 로딩 상태나 진행 상황을 보여주는 페이지입니다. processing.js에 의해 내용이 업데이트됩니다.  
result.html: 분석이 완료된 후, 신뢰도 점수, AI 분석 결과, 하이라이트된 본문 등을 표시하는 페이지입니다. 이 페이지의 실제 내용은 processing.js에 의해 동적으로 채워집니다.  
```
`models/:`   
```
Meta-Llama-3-8B-Instruct.Q5_K_M.gguf: fake_api_server.py에서 로드하여 실제 뉴스 분석에 사용되는 Llama-3 모델 파일입니다.
```
