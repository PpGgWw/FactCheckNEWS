## 🔧 실제 `text-generation-webui` API 연동 가이드

만약 우리 프로젝트가 직접 `text-generation-webui`라는 실제 AI 모델 실행 도구의 API를 사용하게 된다면, 코드의 특정 부분을 수정해야 합니다.

**핵심 수정 파일**: `modules/analyzer_api_simulator.py`

이 파일은 현재 우리 프로젝트에서 AI 모델 서버와 "대화"하는 역할을 담당해요. 지금은 우리가 만든 `fake_api_server.py`라는 모의 서버와 대화하도록 설정되어 있죠.

---

### 🚗 1단계: 운전할 자동차(API 서버) 주소 변경

* **현재 설정**: 코드 속 `FAKE_API_ENDPOINT` 변수는 우리 모의 서버 주소 (`http://127.0.0.1:5005/v1/chat/completions`)를 가리키고 있어요.
    * **비유**: 우리 집 차고에 있는 미니 자동차를 타러 가는 길이에요.
* **변경할 내용**: 이 주소를 실제 `text-generation-webui`가 실행되고 있는 진짜 API 서버 주소로 바꿔야 해요.
    * `text-generation-webui`를 실행하면 보통 `http://127.0.0.1:5000/api` 와 같은 주소로 API가 열려요 (이 주소는 `text-generation-webui` 설정에 따라 다를 수 있으니, 실행 시 터미널 창이나 설정을 꼭 확인해야 해요!).
    * **비유**: 이제 진짜 스포츠카가 있는 레이싱 경기장의 주소를 네비게이션에 찍는 거예요!

---

### 🗺️ 2단계: 새로운 자동차(API 서버) 사용 설명서(요청 형식) 숙지

* **현재 방식**: `request_payload` (API에 보내는 요청 꾸러미)는 우리 모의 서버(`fake_api_server.py`)가 알아들을 수 있는 OpenAI API와 비슷한 형식으로 만들어져 있어요 (`model`, `messages` 등).
    * **비유**: 미니 자동차는 "출발!", "정지!" 같은 간단한 말로 움직일 수 있어요.
* **변경할 내용**: `text-generation-webui` API는 자신만의 "사용 설명서" (요청 형식)가 있어요. 예를 들어, AI에게 전달할 내용을 `prompt`라는 이름으로 보내야 할 수도 있고, 최대 생성 단어 수를 `max_new_tokens`로 지정해야 할 수도 있죠. 파라미터 이름이나 전체적인 요청 구조가 우리 모의 서버와 다를 거예요.
    * `SYSTEM_PROMPT_INSTRUCTIONS` (AI 역할 설명서)와 `USER_MESSAGE_TEMPLATE` (뉴스 내용 틀)을 조합해서 `text-generation-webui`가 이해할 수 있는 형태로 만들어 보내야 해요.
    * **비유**: 스포츠카는 더 복잡한 계기판과 조작 버튼이 있어요. "엔진 시동", "기어 변경", "가속 페달" 같은 정확한 용어와 조작법을 알아야 움직일 수 있죠. 이 조작법이 바로 API의 요청 형식(payload)이에요.

    ```python
    # modules/analyzer_api_simulator.py 파일 안에서 수정될 코드의 대략적인 모습 (예시일 뿐입니다!)

    # ... (기존 코드) ...

    # AI에게 전달할 최종 지시사항 (프롬프트) 만들기 - webui 형식에 맞게!
    # final_prompt_for_webui = f"{SYSTEM_PROMPT_INSTRUCTIONS}\n\n뉴스 제목: {news_title}\n뉴스 본문: {news_content}\n\n위 뉴스에 대해 JSON 형식으로 분석 결과를 제공해주세요."
    
    request_payload = {
        'prompt': final_prompt_for_webui,          # text-generation-webui가 요구하는 '프롬프트' 파라미터 이름
        'max_new_tokens': 1536,                  # text-generation-webui가 요구하는 '최대 새 토큰' 파라미터 이름
        'temperature': 0.1,
        # ... 기타 text-generation-webui API가 요구하는 다양한 설정값들
        # (예: 'do_sample', 'top_p', 'top_k', 'repetition_penalty', 'stop_strings' 등등...)
    }
    
    # ... (이후 API 호출 코드) ...
    ```

---

### 🎁 3단계: 새로운 자동차(API 서버)가 주는 선물(응답) 이해하기

* **현재 방식**: 우리 모의 서버는 응답을 주면, 그 안에 `choices[0]['message']['content']` 부분에 우리가 원하는 분석 결과(JSON 문자열)가 들어있을 거라고 기대해요.
    * **비유**: 미니 자동차는 "목표 달성!"이라고 적힌 쪽지를 줘요.
* **변경할 내용**: `text-generation-webui` API가 주는 응답은 다른 구조로 되어 있을 수 있어요. 예를 들어, 결과가 `{'results': [{'text': '여기에 분석 결과 JSON 문자열...'}]}` 와 같은 형태로 올 수도 있죠.
    * 그래서 응답을 받으면, 그 구조를 잘 살펴보고 우리가 필요한 분석 결과 문자열을 정확히 꺼내오도록 코드(특히 `_parse_json_from_ai_content_string` 함수 내부 또는 해당 로직)를 수정해야 해요.
    * **비유**: 스포츠카는 경주 결과를 알려줄 때, "순위: 1등, 기록: 1분 30초, 상태: 완벽!"과 같이 더 자세하고 구조화된 성적표를 줄 수 있어요. 이 성적표에서 우리가 원하는 정보를 정확히 찾아 읽어야 하는 거죠.

---

### 🔑 4단계: 보안 키(인증) - 필요하다면!

* **현재 방식**: 우리 모의 서버는 아무나 요청을 보낼 수 있어요 (별도의 인증 절차가 없죠).
* **변경 가능성**: 만약 `text-generation-webui` API 서버가 비밀번호나 특별한 열쇠(API 키)를 요구한다면, 우리가 요청을 보낼 때마다 이 열쇠를 함께 보내줘야 해요. (HTTP 요청의 헤더 부분에 추가하는 방식이 일반적이에요.)
    * **비유**: 고급 스포츠카는 아무나 탈 수 없어요! 특별한 스마트키가 있어야 시동을 걸 수 있는 것과 같아요.

---

### 🚫 `fake_api_server.py` 사용 중지!

* 실제 `text-generation-webui`를 사용하게 되면, 우리가 Llama 3 모델을 직접 돌리기 위해 만들었던 `fake_api_server.py` 파일은 더 이상 **실행할 필요가 없어져요.**
* 왜냐하면 `text-generation-webui` 자체가 진짜 AI 모델을 실행하고 API 요청을 처리하는 "진짜 서버" 역할을 해주기 때문이죠!
* 우리 `app.py`는 수정된 `modules/analyzer_api_simulator.py`를 통해 직접 `text-generation-webui` 서버와 "대화"하게 됩니다.

---

**✨ 가장 중요한 점!**

* 실제 `text-generation-webui`의 **공식 API 사용 설명서(문서)를 꼼꼼히 읽어보는 것**이 가장 중요해요. 거기에 모든 정답(정확한 API 주소, 요청/응답 형식, 필요한 파라미터 등)이 적혀 있답니다!
