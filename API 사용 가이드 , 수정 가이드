# 다른 AI API 엔드포인트 연동 가이드

본 프로젝트를 다른 AI API 서비스와 연동하는 방법을 설명합니다. (OpenAI API, Anthropic Claude API, 로컬 API 서버 등)

## 📋 목차
- [지원 가능한 API 서비스](#지원-가능한-api-서비스)
- [기본 설정 변경](#기본-설정-변경)
- [API별 상세 설정](#api별-상세-설정)
- [인증 설정](#인증-설정)
- [테스트 방법](#테스트-방법)

## 🌐 지원 가능한 API 서비스

### 1. 상용 클라우드 API
- **OpenAI API** (GPT-4, GPT-3.5-turbo)
- **Anthropic Claude API** (Claude-3, Claude-2)
- **Google PaLM API** (Bard)
- **Cohere API**

### 2. 로컬/자체 호스팅 API
- **text-generation-webui** (현재 사용 중)
- **Ollama API**
- **LocalAI**
- **FastChat API**
- **커스텀 FastAPI 서버**

## 🔧 기본 설정 변경

모든 API 변경 작업은 `modules/analyzer_api_simulator.py` 파일에서 진행됩니다.

### 1. API 엔드포인트 변경

```python
# 파일: modules/analyzer_api_simulator.py

# 현재 설정 (text-generation-webui)
FAKE_API_ENDPOINT = "http://127.0.0.1:5000/v1/chat/completions"

# 다른 API로 변경 예시
# OpenAI API
# FAKE_API_ENDPOINT = "https://api.openai.com/v1/chat/completions"

# Anthropic Claude API  
# FAKE_API_ENDPOINT = "https://api.anthropic.com/v1/messages"

# 다른 로컬 서버
# FAKE_API_ENDPOINT = "http://127.0.0.1:8000/v1/chat/completions"
```

### 2. 타임아웃 조정

```python
# API 응답 시간에 맞게 조정
API_TIMEOUT_SECONDS = 300  # 5분 (로컬 모델용)
# API_TIMEOUT_SECONDS = 30   # 30초 (클라우드 API용)
```

## 🔑 API별 상세 설정

### OpenAI API 연동

```python
# 1. 엔드포인트 설정
FAKE_API_ENDPOINT = "https://api.openai.com/v1/chat/completions"

# 2. 헤더 설정 (인증 추가)
headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {OPENAI_API_KEY}'  # API 키 필요
}

# 3. 요청 페이로드 (현재 코드 그대로 사용 가능)
request_payload = {
    "model": "gpt-4",  # 또는 "gpt-3.5-turbo"
    "messages": messages_payload,
    "max_tokens": 1536,
    "temperature": 0.1
}

# 4. API 호출
response = requests.post(FAKE_API_ENDPOINT, json=request_payload, 
                        headers=headers, timeout=30)
```

### Anthropic Claude API 연동

```python
# 1. 엔드포인트 설정
FAKE_API_ENDPOINT = "https://api.anthropic.com/v1/messages"

# 2. 헤더 설정
headers = {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
}

# 3. 요청 페이로드 (형식 변경 필요)
request_payload = {
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1536,
    "messages": [
        {
            "role": "user",
            "content": f"{SYSTEM_PROMPT_INSTRUCTIONS}\n\n{user_message_content}"
        }
    ]
}

# 4. 응답 처리 (형식이 다름)
api_response_data = response.json()
content = api_response_data['content'][0]['text']
```

### Ollama API 연동

```python
# 1. 엔드포인트 설정
FAKE_API_ENDPOINT = "http://127.0.0.1:11434/api/chat"

# 2. 요청 페이로드 (Ollama 형식)
request_payload = {
    "model": "llama3",  # 설치된 모델명
    "messages": messages_payload,
    "stream": False,
    "options": {
        "temperature": 0.1,
        "num_predict": 1536
    }
}

# 3. 응답 처리
api_response_data = response.json()
content = api_response_data['message']['content']
```

## 🔐 인증 설정

### 환경 변수로 API 키 관리

**1. `.env` 파일 생성** (프로젝트 루트에)
```bash
# .env 파일
OPENAI_API_KEY=sk-your-openai-api-key-here
ANTHROPIC_API_KEY=sk-ant-your-claude-api-key-here
COHERE_API_KEY=your-cohere-api-key-here
```

**2. 코드에서 환경 변수 사용**
```python
import os
from dotenv import load_dotenv

# 환경 변수 로드
load_dotenv()

# API 키 가져오기
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')

# 헤더에 API 키 추가
def get_auth_headers(api_type):
    if api_type == 'openai':
        return {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {OPENAI_API_KEY}'
        }
    elif api_type == 'anthropic':
        return {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
        }
    # 로컬 API는 인증 없음
    return {'Content-Type': 'application/json'}
```

## 🧪 테스트 방법

### 1. API 연결 테스트

```python
# test_api_connection.py (새 파일 생성)
import requests

def test_api_connection(endpoint, headers=None):
    """API 연결 상태 확인"""
    try:
        # 간단한 테스트 요청
        test_payload = {
            "model": "gpt-3.5-turbo",  # API에 맞게 조정
            "messages": [{"role": "user", "content": "Hello, test"}],
            "max_tokens": 50
        }
        
        response = requests.post(endpoint, json=test_payload, 
                               headers=headers, timeout=30)
        
        if response.status_code == 200:
            print("✅ API 연결 성공!")
            print(f"응답: {response.json()}")
        else:
            print(f"❌ API 연결 실패: {response.status_code}")
            print(f"오류: {response.text}")
            
    except Exception as e:
        print(f"💥 연결 오류: {e}")

# 사용 예시
if __name__ == "__main__":
    # OpenAI API 테스트
    openai_headers = {'Authorization': f'Bearer {OPENAI_API_KEY}'}
    test_api_connection("https://api.openai.com/v1/chat/completions", openai_headers)
```

### 2. 응답 형식 확인

각 API의 응답 형식을 확인하고 파싱 로직을 조정하세요:

```python
def parse_api_response(api_response, api_type):
    """API 타입별 응답 파싱"""
    try:
        if api_type == 'openai' or api_type == 'text-generation-webui':
            # OpenAI 호환 형식
            content = api_response['choices'][0]['message']['content']
        
        elif api_type == 'anthropic':
            # Claude API 형식
            content = api_response['content'][0]['text']
        
        elif api_type == 'ollama':
            # Ollama 형식
            content = api_response['message']['content']
        
        # JSON 파싱은 기존 함수 사용
        return _parse_json_from_ai_content_string(content)
        
    except (KeyError, IndexError) as e:
        print(f"응답 파싱 오류: {e}")
        return FALLBACK_RESPONSES["response_parse_failed"]
```

## 📝 설정 파일 관리

### `config.py` 파일 생성

```python
# config.py (새 파일)
import os
from dotenv import load_dotenv

load_dotenv()

# API 설정
API_CONFIGS = {
    'text-generation-webui': {
        'endpoint': 'http://127.0.0.1:5000/v1/chat/completions',
        'headers': {'Content-Type': 'application/json'},
        'timeout': 300,
        'model': 'llama-3-8b-instruct'
    },
    'openai': {
        'endpoint': 'https://api.openai.com/v1/chat/completions',
        'headers': {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {os.getenv("OPENAI_API_KEY")}'
        },
        'timeout': 30,
        'model': 'gpt-4'
    },
    'anthropic': {
        'endpoint': 'https://api.anthropic.com/v1/messages',
        'headers': {
            'Content-Type': 'application/json',
            'x-api-key': os.getenv('ANTHROPIC_API_KEY'),
            'anthropic-version': '2023-06-01'
        },
        'timeout': 30,
        'model': 'claude-3-sonnet-20240229'
    }
}

# 현재 사용할 API 선택
CURRENT_API = 'text-generation-webui'  # 이 값만 변경하면 API 전환
```

### `analyzer_api_simulator.py`에서 설정 사용

```python
from config import API_CONFIGS, CURRENT_API

def call_fake_analysis_api(news_content: str, news_title: str) -> Dict[str, str]:
    """설정 파일 기반으로 API 호출"""
    
    # 현재 API 설정 가져오기
    api_config = API_CONFIGS[CURRENT_API]
    
    # API 요청
    response = requests.post(
        api_config['endpoint'],
        json=request_payload,
        headers=api_config['headers'],
        timeout=api_config['timeout']
    )
    
    # 응답 처리 (API 타입별로 분기)
    return parse_api_response(response.json(), CURRENT_API)
```

## 🎯 API 전환 체크리스트

- [ ] 새 API의 엔드포인트 URL 확인
- [ ] 인증 방식 확인 (API 키, Bearer 토큰 등)
- [ ] 요청 형식 확인 (OpenAI 호환 여부)
- [ ] 응답 형식 확인 및 파싱 로직 수정
- [ ] 타임아웃 설정 조정
- [ ] API 키 환경 변수 설정
- [ ] 연결 테스트 수행
- [ ] 실제 뉴스 분석 테스트
