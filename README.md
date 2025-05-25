추가 계획.  
**Celery**: 요청만 받고, 실제 힘든 일은 보이지 않는 곳(백그라운드)에서 처리합니다. 그럼 서버는 계속 다른 클라이언트를 받아들일 수 있습니다. (앱이 바로바로 반응하는게 핵심입니다.)  
```
FactCheckNEWS2/  # 프로젝트 루트 폴더명
├── app.py                         # 🌐 Flask 웹 애플리케이션의 메인 실행 파일
├── fake_api_server.py             # 🤖 (AI 모델) FastAPI 기반의 뉴스 분석 API 서버 (OpenAI, text-generation-webui 의 API 방식을 모방한 코드이며 실제와 다를 수 있습니다!)
├── requirements.txt               # 📦 프로젝트 실행에 필요한 파이썬 라이브러리 목록
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
    └── Meta-Llama-3-8B-Instruct.Q5_K_M.gguf # 💡 실제 Llama-3 모델 파일 (빠르게 코드 동작 테스트를 위한 경량화 / 양자화 모델입니다. 양자화는 CPU에서도 효율적으로 모델을 실행할 수 있도록 합니다.)
```
---
다이어 그램 입니다. 다운로드 받아서 보면 더 자세히 보입니다.   
![제목 없는 다이어그램 (4)](https://github.com/user-attachments/assets/897f5284-471e-457e-ba8d-d7e62e1c831d)   
다운로드 링크:   
https://drive.google.com/file/d/1TziU-X2hCEU_5JTOUiW9LAwwAwGAKLp6/view?usp=sharing   
---

# 저희 깃허브는 가독성을 높이기 위해, 아이콘, 비유를 적극 활용합니다.
> 코드 전체에도 가독성, 현재 상황을 잘 표현하기 위해, 아이콘을 적극 활용하였습니다.
---
## 🚀 GPU CUDA 사용 설정 가이드

우리 프로젝트의 AI 모델(`Meta-Llama-3-8B-Instruct-Q5_K_M.gguf`)을 GPU CUDA를 통해 실행하려면, `fake_api_server.py` 파일의 코드 일부를 다음과 같이 수정해야 합니다.

### 1. 수정 대상 파일

* `FactCheckNEWS2/fake_api_server.py` (또는 프로젝트 루트 폴더명이 `FactCheckNEWS3`이라면 해당 경로의 파일)

### 2. 수정할 코드 부분

`fake_api_server.py` 파일 상단 부근의 **모델 설정** 섹션에서 `N_GPU_LAYERS` 변수의 값을 변경합니다.  

### ✅ 추가 확인 사항 (중요!)

GPU를 사용하여 모델을 실행하려면 코드 수정 외에도 다음 환경 설정이 매우 중요합니다.

* **`llama-cpp-python` 라이브러리 CUDA 지원 설치**:
    * GPU를 사용하려면 `llama-cpp-python` 라이브러리가 **CUDA를 지원하도록 특별히 설치**되어야 합니다.
    * 일반적인 `pip install llama-cpp-python` 명령어로는 CPU 버전만 설치될 수 있습니다.
    * CUDA 지원 빌드를 위해서는 보통 CUDA Toolkit이 설치된 환경에서 다음과 유사한 방법으로 설치를 시도합니다 (정확한 방법은 `llama-cpp-python` 공식 문서 참고):
        ```bash
        # 예시: 환경 변수 설정 후 pip 설치 (Windows PowerShell)
        $env:CMAKE_ARGS="-DLLAMA_CUBLAS=on"
        $env:FORCE_CMAKE=1
        pip install --upgrade --force-reinstall llama-cpp-python --no-cache-dir

        # 예시: 환경 변수 설정 후 pip 설치 (Linux/macOS Bash)
        CMAKE_ARGS="-DLLAMA_CUBLAS=on" FORCE_CMAKE=1 pip install --upgrade --force-reinstall llama-cpp-python --no-cache-dir
        ```
    * 이미 라이브러리가 설치되어 있다면, CUDA 지원 버전으로 **재설치**해야 할 수 있습니다.

* **NVIDIA 드라이버 및 CUDA Toolkit**:
    * 시스템에 사용 중인 NVIDIA 그래픽 카드와 호환되는 **최신 NVIDIA 드라이버**가 설치되어 있어야 합니다.
    * `llama-cpp-python`이 요구하는 버전과 호환되는 **CUDA Toolkit**이 시스템에 설치되어 있어야 합니다. (보통 `llama-cpp-python` 설치 과정에서 필요한 CUDA 버전을 명시하거나, 시스템에 설치된 CUDA를 감지합니다.)

* **VRAM (그래픽 카드 메모리) 용량**:
    * GPU의 VRAM이 모델과 현재 컨텍스트 크기(`N_CTX`)를 로드하기에 충분해야 합니다.
    * `Meta-Llama-3-8B-Instruct.Q5_K_M.gguf` 모델 자체는 약 5.73GB이지만, 실제 실행 시에는 컨텍스트 캐시 등으로 인해 추가적인 VRAM이 필요합니다.
    * `N_GPU_LAYERS` 값을 너무 높게 설정하면 VRAM 부족으로 오류가 발생할 수 있습니다. 이 경우, `N_GPU_LAYERS` 값을 줄여서 GPU에 올리는 레이어 수를 조절해야 합니다.

---  
## 🚀 프로젝트 실행 가이드

**실행 순서가 중요합니다!** AI 분석 API 서버가 먼저 실행되어야 웹 애플리케이션이 정상적으로 AI 분석 기능을 호출할 수 있습니다.  

### 1️⃣ 단계: AI 분석 API 서버 실행

1.  **터미널**(명령 프롬프트 또는 PowerShell 등)을 엽니다.  
2.  프로젝트의 루트 폴더인 `FactCheckNEWS3/`로 이동합니다.  
    ```bash
    cd 경로/FactCheckNEWS3
    ```
3.  다음 명령어를 입력하여 FastAPI 기반의 AI 분석 API 서버를 실행합니다:  
    ```bash
    python fake_api_server.py
    ```
    * 성공적으로 실행되면, 터미널에 `Uvicorn running on http://0.0.0.0:5005 (Press CTRL+C to quit)` 와 유사한 메시지가 나타납니다.  
    * **주의:** `models/Meta-Llama-3-8B-Instruct.Q5_K_M.gguf` 모델 파일이 `FactCheckNEWS2/models/` 폴더 안에 정확히 위치해야 합니다. 모델 파일이 없거나 경로가 다르면 서버 실행 시 오류가 발생합니다.  

### 2️⃣ 단계: 웹 애플리케이션 (Flask) 실행

1.  **새로운 터미널 창**을 엽니다. (이전 터미널은 AI 분석 API 서버가 계속 실행 중이어야 합니다.)  
2.  마찬가지로 프로젝트의 루트 폴더인 `FactCheckNEWS3/`로 이동합니다.  
    ```bash
    cd 경로/FactCheckNEWS3
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
* **필수 라이브러리 설치:** `requirements.txt`에 명시된 모든 라이브러리가 설치되어 있어야 합니다. 프로젝트 루트 폴더(`FactCheckNEWS3/`)에서 다음 명령어를 실행하세요:  
    ```bash
    pip install -r requirements.txt
    ```
    (만약 `requirements.txt` 파일이 없다면, 다음 명령어로 주요 라이브러리를 설치할 수 있습니다: `pip install Flask requests beautifulsoup4 fastapi uvicorn pydantic llama-cpp-python openai`)  
* **모델 파일 위치:** `Meta-Llama-3-8B-Instruct-Q5_K_M.gguf` 파일이 `FactCheckNEWS3/models/` 폴더 안에 있는지 다시 한번 확인해주세요.  

---   
## 🧠 AI 모델 상세 정보 

### 1. 모델 이름

* 정식 명칭은 `Meta-Llama-3-8B-Instruct` 모델을 기반으로 합니다.  
* 실제 사용되는 파일명은 `Meta-Llama-3-8B-Instruct-Q5_K_M.gguf` 입니다.  
    * `8B`는 80억 개의 파라미터(매개변수)를 가진 모델이라는 의미입니다.  
    * `Instruct`는 특정 지시사항이나 질문에 잘 응답하도록 미세 조정된 버전임을 나타냅니다.  

### 2. 양자화 (Quantization) 모델인가?

* 네, 이 모델은 **양자화된 모델**입니다. 파일명의 `Q5_K_M` 부분이 양자화 방식과 관련된 정보입니다.  
* `GGUF`는 `llama.cpp` 프로젝트에서 사용하는 모델 파일 형식으로, 주로 CPU에서도 효율적으로 모델을 실행할 수 있도록 다양한 양자화 기법을 적용합니다.  
* `Q5_K_M`은 특정한 5비트 양자화 수준과 방식을 나타내는 코드입니다 (K-Means 클러스터링 기반의 중요한 가중치들을 더 정밀하게 유지하는 방식 중 하나).  

### 3. 사용 라이브러리

* **핵심 라이브러리**: `llama-cpp-python`  
    * C++로 작성된 `llama.cpp`를 파이썬에서 쉽게 사용할 수 있도록 해줍니다.  
    * 이를 통해 `.gguf` 형식의 모델을 로드하고 실행할 수 있습니다.  
* **API 서버 구축**: `FastAPI`, `uvicorn`  
    * `FastAPI`는 웹 API를 빠르고 쉽게 만들 수 있게 해줍니다.  
    * `uvicorn`은 이 FastAPI 애플리케이션을 실행하는 ASGI 서버입니다.  
* **데이터 유효성 검사**: `Pydantic`  
    * API 요청/응답 데이터의 형식을 정의하고 검증하는 데 사용됩니다.  

### 4. 동작 순서 및 방식

#### `fake_api_server.py` (AI 분석 API 서버) 관점:

1.  **모델 로드 ⚙️**:  
    * 서버 시작 시, `llama_cpp.Llama`를 사용하여 `models/Meta-Llama-3-8B-Instruct-Q5_K_M.gguf` 파일을 메모리에 로드합니다.  
2.  **API 엔드포인트 대기 👂**:  
    * `FastAPI`를 통해 `/v1/chat/completions` 주소에서 POST 요청을 기다립니다.  
3.  **요청 수신 및 처리 📥**:  
    * 웹 애플리케이션(`app.py`의 `analyzer_api_simulator.py`)으로부터 뉴스 분석 요청이 오면, 뉴스 제목과 본문을 추출합니다.  
    * 미리 정의된 **시스템 프롬프트**와 사용자 입력 뉴스 내용을 조합하여 모델에 전달할 최종 입력을 구성합니다.  
4.  **AI 모델 추론 (뉴스 분석) 🗣️**:  
    * 구성된 프롬프트를 Llama 3 모델에게 전달하여 뉴스 기사의 "진위", "근거", "분석" 내용을 담은 텍스트를 생성(추론)합니다.  
5.  **응답 정제 및 반환 📤**:  
    * 모델이 생성한 텍스트(주로 JSON 형식의 문자열)를 유효한 JSON 문자열로 정리합니다.  
    * 정제된 JSON 문자열을 API 응답으로 웹 애플리케이션에 다시 보내줍니다.  

#### 전체 시스템 관점 (사용자 입력부터 결과까지):

1.  사용자가 웹 브라우저 (`index.html`)에서 뉴스 URL/텍스트를 입력하고 "분석 시작" 버튼을 클릭합니다.  
2.  `app.py` (Flask 앱)의 `/process` 라우트가 요청을 받아, 필요시 `crawler.py`로 뉴스 내용을 가져오고, 분석할 제목과 본문을 `processing.html`로 전달합니다.  
3.  `processing.html` 페이지가 로드되면, `processing.js`가 `/get_analysis_stream` 라우트로 Server-Sent Events (SSE) 연결을 요청합니다.  
4.  `app.py`의 `/get_analysis_stream`은 `analyzer_api_simulator.py`를 통해 `fake_api_server.py` (AI 분석 API 서버)로 실제 분석 요청을 보냅니다.  
5.  `fake_api_server.py`는 위에서 설명한 **AI 모델 추론 과정**을 거쳐 분석 결과를 JSON 형태로 `analyzer_api_simulator.py`에게 반환합니다.  
6.  `analyzer_api_simulator.py`는 받은 결과를 다시 `/get_analysis_stream`으로 전달하고, 이는 SSE를 통해 `processing.js`로 스트리밍됩니다.  
7.  `processing.js`는 최종 분석 결과를 받아 `result.html` 형식으로 웹 페이지 내용을 동적으로 업데이트하여 사용자에게 보여줍니다.  

## 💻 주요 기술 개념 쉽게 이해하기 (AI 설명)

### 1. Server-Sent Events (SSE) 📡

서버가 클라이언트에게 단방향으로 지속적인 업데이트를 밀어주는(push) 웹 기술이에요. 클라이언트는 한 번 연결을 맺으면, 서버가 보내는 데이터를 계속 스트리밍 형태로 받을 수 있습니다.

* **쉬운 비유 (라디오 방송 📻)**:
    * **서버**는 라디오 방송국! 새로운 소식이 생길 때마다 청취자(클라이언트)에게 계속 보내주죠.
    * **클라이언트**는 라디오 수신기! 특정 주파수(서버 주소)에 맞춰두면, 방송 내용을 실시간으로 계속 들을 수 있어요.
    * 우리 프로젝트에서는 분석 과정을 "지금 크롤링 중!", "AI 분석 중!"처럼 실시간으로 사용자에게 알려주는 데 사용돼요.

### 2. FastAPI 애플리케이션을 실행하는 ASGI 서버 🚀

`FastAPI`는 고성능 웹 API를 쉽게 만들 수 있는 파이썬 웹 프레임워크예요. `ASGI 서버` (Asynchronous Server Gateway Interface 서버, 예: Uvicorn)는 이러한 비동기 FastAPI 애플리케이션을 실제로 실행하고 웹 요청을 처리하는 역할을 합니다.

* **쉬운 비유 (최첨단 레스토랑 👨‍🍳 + 🤵)**:
    * **`FastAPI` (애플리케이션)**는 아주 빠르고 효율적인 **셰프**와 같아요. 손님 주문(API 요청)에 맞춰 멋진 요리(응답)를 만들어내는 레시피(코드)를 가지고 있죠.
    * **`ASGI 서버` (예: Uvicorn)**는 그 레스토랑의 **총지배인 겸 완벽한 서빙 팀**이에요. 손님(인터넷)으로부터 주문을 받고, 셰프(FastAPI)에게 정확히 전달하며, 셰프가 만든 요리를 손님에게 빠르고 정확하게 가져다주는 역할을 해요. 특히, 여러 주문을 동시에 효율적으로 처리(비동기)할 수 있게 도와줘요.
    * 우리 `fake_api_server.py`는 FastAPI라는 셰프가 만든 AI 분석 요리법이고, Uvicorn이라는 총지배인이 이 요리법대로 식당을 운영하는 거예요.

### 3. 양자화 (Quantization) ⚖️

모델 양자화는 큰 머신러닝 모델의 가중치(파라미터)를 표현하는 데 사용되는 비트 수를 줄여 모델 크기를 작게 만들고 연산 속도를 높이는 기술이에요. 정확도 손실을 최소화하면서 효율성을 높이는 것이 목표죠.

* **쉬운 비유 (고화질 사진 압축 🖼️ -> 📉)**:
    * 아주 크고 상세한 **고화질 원본 사진**(원본 AI 모델)이 있다고 상상해 보세요. 파일 크기도 크고 열어보는 데 시간도 오래 걸리죠.
    * **양자화**는 이 사진의 색상 수를 줄이거나, 덜 중요한 디테일을 약간 뭉개서 **파일 크기는 훨씬 작지만 여전히 원본 사진의 핵심 내용을 알아볼 수 있는 버전**(양자화된 모델)으로 만드는 과정과 같아요.
    * `Meta-Llama-3-8B-Instruct.Q5_K_M.gguf` 모델의 `Q5_K_M`이 바로 이런 압축(양자화) 방법 중 하나를 의미해요. 덕분에 더 적은 자원으로도 모델을 돌릴 수 있게 되죠!

### 4. K-Means 클러스터링 (K-Means Clustering) 🧩

K-평균 클러스터링은 주어진 데이터들을 K개의 클러스터(그룹)로 묶는 대표적인 비지도 학습 알고리즘이에요. 각 데이터는 가장 가까운 클러스터의 중심(centroid)에 할당되며, 이 과정을 반복하여 클러스터 중심을 최적화합니다.

* **쉬운 비유 (과일 바구니 정리 🍎🍊🍌)**:
    * 여러 종류의 과일이 마구 섞여 있는 **커다란 과일 바구니**(데이터 포인트들)가 있다고 해볼게요.
    * **K-Means 클러스터링**은 이 과일들을 "사과 그룹", "오렌지 그룹", "바나나 그룹"처럼 **비슷한 특징(색깔, 모양, 크기 등)을 가진 것들끼리 K개의 그룹으로 나누는 작업**과 같아요.
    * 처음에는 대충 "여기가 사과 자리!", "여기가 오렌지 자리!" 하고 기준점(클러스터 중심)을 잡고 과일들을 나눠요. 그다음, 각 그룹에 모인 과일들의 평균적인 특징을 보고 기준점을 조금씩 옮겨가면서 가장 잘 나뉘는 지점을 찾아가는 거죠.
    * 모델 양자화에서 `Q5_K_M` 방식에 언급된 K-Means는 모델의 수많은 가중치들을 몇 개의 그룹으로 묶어서, 각 그룹을 대표하는 값으로 가중치들을 표현함으로써 효율성을 높이는 데 활용될 수 있어요. (어떤 가중치들이 서로 비슷한 성격인지 그룹핑하는 데 쓰이는 거죠!)
