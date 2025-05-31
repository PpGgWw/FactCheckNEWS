## 📋 목차

* [작동 방식](#작동-방식)
* [작동 순서](#작동-순서)
* [API 사용 방법](#api-사용-방법)
* [사용 라이브러리](#사용-라이브러리)
* [프로젝트 구조](#프로젝트-구조)
* [설치 및 실행](#설치-및-실행)

## 🔄 작동 방식

### 1. 웹 크롤링 방식

* **네이버 뉴스 URL 입력**: BeautifulSoup으로 HTML 파싱하여 제목, 본문, 작성날짜, 언론사 추출
* **직접 텍스트 입력**: 입력된 텍스트를 그대로 분석 대상으로 사용

### 2. AI 분석 방식

* text-generation-webui API 서버 사용 (OpenAI ChatCompletion API 호환)
* Llama-3 8B 모델을 통한 가짜뉴스 탐지
* 6가지 판단 기준으로 분석 (사실 오류, 출처 불명확, 통계 왜곡, 제목 낚시, 공포 조장, 감정적 표현)

## 📝 작동 순서

![Editor \_ Mermaid Chart-2025-05-30-145909](https://github.com/user-attachments/assets/206dafab-8cb9-408d-8ee9-f57c96cc410f)

### 상세 처리 과정

1. **입력 처리** (`app.py` → `process_input()`)
2. **URL 판별** (http/https로 시작하는지 확인)
3. **크롤링** (`modules/crawler.py` → `extract_news_data()`)
4. **API 호출** (`modules/analyzer_api_simulator.py` → `call_fake_analysis_api()`)
5. **결과 반환** (`templates/result.html`)

## 🔌 API 사용 방법

### API 엔드포인트

```
POST http://127.0.0.1:5000/v1/chat/completions
```

> **참고**: text-generation-webui의 API 서버를 사용합니다 (`python server.py --api`)

### 요청 파라미터

```json
{
  "model": "Llama-3-8B-Instruct-NewsAnalyzer",
  "messages": [
    {
      "role": "system",
      "content": "가짜 뉴스 탐지 전문가 시스템 프롬프트..."
    },
    {
      "role": "user",
      "content": "뉴스 제목: [제목]\n뉴스 본문: [본문]"
    }
  ],
  "max_tokens": 1536,
  "temperature": 0.1,
  "stream": false
}
```

### 응답 형식

```json
{
  "choices": [{
    "message": {
      "content": "{\"진위\": \"가짜 뉴스\", \"근거\": \"판단 근거\", \"분석\": \"상세 분석\"}"
    }
  }]
}
```

## 📚 사용 라이브러리

### 백엔드 (Python)

| 라이브러리              | 용도                       | 버전 |
| ------------------ | ------------------------ | -- |
| **Flask**          | 웹 애플리케이션 프레임워크           | -  |
| **requests**       | HTTP 요청 처리 (크롤링, API 호출) | -  |
| **BeautifulSoup4** | HTML 파싱 및 데이터 추출         | -  |
| **re**             | 정규표현식을 통한 텍스트 정제         | 내장 |
| **json**           | JSON 데이터 처리              | 내장 |
| **html**           | HTML 이스케이프 처리            | 내장 |

### 프론트엔드

| 기술             | 용도             |
| -------------- | -------------- |
| **HTML5**      | 웹 페이지 구조       |
| **CSS3**       | 스타일링 및 반응형 디자인 |
| **JavaScript** | UI 상호작용 (메뉴 등) |

### AI 모델

| 모델                        | 설명                       |
| ------------------------- | ------------------------ |
| **Llama-3 8B Instruct**   | Meta의 대화형 언어모델 (현재 테스트용) |
| **text-generation-webui** | 모델 서빙을 위한 웹 인터페이스        |
| **파인튜닝 모델**               | 가짜뉴스 탐지 전용 모델 (개발 예정)    |

## 📁 프로젝트 구조

```
FactCheckNEWS2/
├── app.py                          # Flask 메인 애플리케이션
├── requirements.txt                # 의존성 패키지 목록
│
├── modules/                        # 핵심 기능 모듈
│   ├── crawler.py                  # 뉴스 크롤링
│   ├── analyzer_api_simulator.py   # text-generation-webui API 클라이언트
│   └── highlighter.py              # 텍스트 강조 (미사용)
│
├── static/                         # 정적 파일
│   ├── style.css                   # 전체 스타일시트
│   └── script.js                   # 공통 JavaScript
│
├── templates/                      # HTML 템플릿
│   ├── index.html                  # 메인 입력 페이지
│   └── result.html                 # 결과 출력 페이지
```

## 🚀 설치 및 실행

### 필수 환경 설정

* **Python 3.10** 버전이 필수입니다. 다른 버전 사용 시 오류가 발생할 수 있습니다.

### 가상환경 설정

각 폴더 (`프로젝트 폴더`, `text-generation-webui`)에서 독립된 Python 가상환경을 권장합니다.

```bash
cd "프로젝트 폴더 경로"
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

**text-generation-webui 설정 예시:**

```bash
cd "text-generation-webui 경로"
python -m venv venv
venv\Scripts\activate
pip install -r requirements\full\<자신의 환경에 맞춰 requirements.txt 설치>
```

* CUDA가 없는 경우 CPU only requirements.txt를 사용합니다.

### text-generation-webui 실행

* 서버 실행 후 반드시 모델을 로드합니다.
* 모델 추론 시간이 길 경우 `analyzer_api_simulator.py`에서 타임아웃 시간을 조정하세요 (기본 5분).

## 📈 최신 업데이트

### ✅ 완료된 작업

* API 동작 확인 및 연결 안정화
* API 사용하여 테스트 질문 추론 성공
* Nginx 도입 완료
* HTML 디자인 변경 완료

### 🔄 진행 중

* HTML 애니메이션 추가 (GSAP 사용)
* 코드 전체 이모티콘, 아이콘 정리

### 📋 예정된 작업

* React 또는 Vue.js 도입
* 다중 언론사 크롤링 지원
* 실시간 분석 성능 최적화
* **가짜뉴스 탐지 전용 파인튜닝 모델 개발 및 적용**
