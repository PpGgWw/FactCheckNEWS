import json
import re
import requests # HTTP 요청을 보내기 위한 라이브러리
from typing import Dict, Optional, List, Union

# text-generation-webui API 엔드포인트
# 실제 text-generation-webui 실행 시 --api 옵션으로 활성화하고,
# 필요한 경우 --listen, --api-port 등으로 주소/포트를 확인하거나 변경하세요.
# 기본 포트는 5000번, 엔드포인트는 /v1/chat/completions 입니다.
TEXT_GENERATION_WEBUI_API_ENDPOINT = "http://127.0.0.1:5000/v1/chat/completions"

# 시스템 메시지 (AI의 역할 및 기본 지침 - text-generation-webui 프롬프트 형식에 맞게 조정 필요)
# text-generation-webui는 messages 형식의 system 프롬프트를 잘 지원합니다.
SYSTEM_PROMPT_INSTRUCTIONS = """당신은 가짜 뉴스 탐지 전문가입니다. 아래 조건과 중요도에 따라 기사를 판단하세요.
※ 조건이 여러 개 해당될 경우, **가장 높은 중요도의 조건을 기준으로 '진위'를 결정**하십시오.
※ 만약 어떤 조건에도 해당하지 않는 경우, 해당 기사는 **진짜 뉴스**로 판단하십시오.

■ 사실 오류 (중요도: 높음 = 가짜뉴스)
이 기사는 과학적·객관적 사실과 명백히 어긋난 내용을 포함하고 있나요? 예를 들어, '달에는 중력이 없다', '물은 불에 타기 쉽다'와 같은 명백한 오류가 있는 경우, 이를 근거로 가짜 뉴스로 판단하세요.

■ 출처 불명확 (중요도: 높음 = 가짜뉴스)
이 기사는 명확한 출처 없이 제3자의 말이나 익명의 관계자, 다른 기자에 의존하고 있나요? 출처 불명의 정보가 포함된 경우 이를 강조하여 판별하세요.

■ 통계 왜곡 (중요도: 높음 = 가짜뉴스)
이 기사는 통계 데이터를 왜곡하여 잘못된 인상을 주고 있나요? 예를 들어, 실제 차이가 크지만 수치를 왜곡하여 둘의 차이가 적은 것처럼 보이게 하는지 검토하세요.

■ 제목 낚시 (중요도: 중간 = 가짜일 가능성이 높은 뉴스)
이 기사의 제목은 본문 내용과 일치하나요? 제목이 본문 내용의 60% 이상과 관련이 없거나 제목만 보고 클릭을 유도하려는 과장된 형태인지 확인하세요.

■ 공포 조장 (중요도: 낮음 = 가짜일 가능성이 있는 뉴스)
이 기사는 사회적으로 혼란을 야기할 수 있는 공포감을 유발하는 표현이 포함되어 있나요? 예를 들어, '위험하다', '긴급하다', '불안하다' 등의 단어를 사용하여 독자에게 불안감을 주는지 분석하세요.

■ 감정적 표현 (중요도: 낮음 = 가짜일 가능성이 있는 뉴스)
이 기사는 감성적인 표현이나 주관적인 결론이 포함되어 있나요? 예를 들어, 감정적 언어(‘불쌍하다’, ‘어처구니없다’)나 강하게 개인적인 의견을 제시하는 결론이 포함되어 있는지 판단하세요.

아래 제공될 뉴스 제목과 본문에 대해, 다음 JSON 형식으로만 응답해주십시오 (다른 설명이나 추가 텍스트 없이 JSON 객체만 출력). 출력은 반드시 유효한 JSON이어야 합니다:
{{
  "진위": "여기에 판단 결과 (예: 가짜 뉴스, 진짜 뉴스 등)",
  "근거": "여기에 판단 근거 (조건에 맞는 이유, 여러 개일 경우 번호 매겨서)",
  "분석": "여기에 구체적인 분석 내용"
}}
"""

# 사용자 메시지 템플릿 (뉴스 제목과 본문 삽입용)
USER_MESSAGE_TEMPLATE = """뉴스 제목: {news_title}
뉴스 본문: {news_content}
---
위 뉴스에 대해 JSON 형식으로 분석 결과를 제공해주세요.
"""

#  fallback 응답: API 호출 실패 또는 특정 조건 만족 시 사용될 기본 응답
FALLBACK_RESPONSES = {
    "api_call_failed": { # API 호출 실패 시
        "진위": "판단 오류 (API 연결/응답 실패)",
        "근거": "AI 분석 서버에 연결하거나 응답을 받는 데 실패했습니다. 타임아웃이 발생했을 수도 있습니다.",
        "분석": "AI 분석 기능을 일시적으로 사용할 수 없습니다. 서버 상태를 확인하거나 잠시 후 다시 시도해주세요."
    },
    "response_parse_failed": { # API 응답 파싱 실패 시
        "진위": "판단 오류 (API 응답 형식 문제)",
        "근거": "AI 분석 서버로부터 응답을 받았으나, 예상된 JSON 형식이 아닙니다.",
        "분석": "AI 분석 서버의 응답을 처리하는 데 문제가 발생했습니다."
    },
    "content_too_short_client_side": { # 내용이 너무 짧을 때 (클라이언트 단에서 판단)
        "진위": "판단 불가 (내용 부족 - 클라이언트)",
        "근거": "제공된 뉴스 내용이 너무 짧아 (50자 미만) 분석을 요청하지 않았습니다.",
        "분석": "뉴스 내용이 부족하여 가짜 뉴스 판단 기준을 적용하기 어렵습니다. 더 많은 정보가 필요합니다."
    }
}

def _parse_json_from_ai_content_string(json_string: str) -> Optional[Dict[str, str]]:
    """
    AI 응답의 content 필드(JSON 형식의 문자열)를 파싱합니다.
    Args:
        json_string (str): AI가 반환한 JSON 형식의 문자열.
    Returns:
        Optional[Dict[str, str]]: 파싱된 딕셔너리. 실패 시 None.
    """
    try:
        cleaned_json_string = json_string.strip()
        # 마크다운 코드 블록 표시 (```json ... ``` 또는 ``` ... ```) 제거
        if cleaned_json_string.startswith("```json"):
            cleaned_json_string = cleaned_json_string[len("```json"):].strip()
        elif cleaned_json_string.startswith("```"):
            cleaned_json_string = cleaned_json_string[len("```"):].strip()
        if cleaned_json_string.endswith("```"):
            cleaned_json_string = cleaned_json_string[:-len("```")].strip()

        parsed_json = json.loads(cleaned_json_string)
        # 필수 키("진위", "근거", "분석") 존재 여부 확인
        if all(key in parsed_json for key in ["진위", "근거", "분석"]):
            return parsed_json
        else:
            print(f"[API Client Parser] AI 응답 JSON에 필수 키가 누락되었습니다. 정리된 문자열 (일부): {cleaned_json_string[:200]}...")
            return None
    except json.JSONDecodeError as e:
        print(f"[API Client Parser] AI 응답 JSON 파싱 실패: {e}. 원본 문자열 (일부): {json_string[:200]}...")
        return None
    except Exception as e: # 기타 예외
        print(f"[API Client Parser] AI 응답 JSON 처리 중 예기치 않은 예외 발생: {e}")
        return None

def call_fake_analysis_api(news_content: str, news_title: str) -> Dict[str, str]:
    """
    text-generation-webui의 OpenAI 호환 API를 호출하여 분석 결과를 가져옵니다.
    Args:
        news_content (str): 분석할 뉴스 본문.
        news_title (str): 분석할 뉴스 제목.
    Returns:
        Dict[str, str]: 분석 결과 딕셔너리.
    """
    print(f"[API Client] text-generation-webui API로 분석 요청 시작. 제목: '{news_title[:50]}...'")

    # 내용이 너무 짧으면 API 호출 없이 미리 정의된 응답 반환
    if len(news_content) < 50: #
        print("[API Client] 내용이 너무 짧아 API 호출 없이 '내용 부족'으로 처리합니다.")
        return FALLBACK_RESPONSES["content_too_short_client_side"]

    # API 요청에 사용할 사용자 메시지 생성
    user_message_content = USER_MESSAGE_TEMPLATE.format(news_title=news_title, news_content=news_content)

    # OpenAI ChatCompletion 형식에 맞춘 메시지 페이로드 구성
    messages_payload: List[Dict[str, str]] = [
        {"role": "system", "content": SYSTEM_PROMPT_INSTRUCTIONS}, # 시스템 역할 및 지침
        {"role": "user", "content": user_message_content}         # 사용자 입력 (뉴스 정보)
    ]

    # API 요청 본문 (payload)
    # text-generation-webui API 문서 (http://127.0.0.1:5000/docs)를 참고하여
    # 필요한 파라미터 (예: mode, character, instruction_template 등)를 추가하거나 조절.
    request_payload = {
        "model": "", # 실제 로드된 모델명으로 변경하거나, 생략 가능 (API가 기본 모델 사용)
        "messages": messages_payload,
        "max_tokens": 1536,  #  최대 생성 토큰 수
        "temperature": 0.1, # 결과의 다양성 (낮을수록 결정적)
        "stream": False,     # 스트리밍 응답 여부 (현재는 False만)
        # "mode": "instruct", # 필요한 경우 mode 지정
        # "instruction_template": "Alpaca", # 사용하는 모델에 맞는 instruction template 지정
        # "character": "Example", # 캐릭터 설정 (필요시)
        # "stop": ["\n```", "```\n", "\n\n", "}\n", "}\r\n", "<|eot_id|>"] # 필요시 stop 토큰 지정
    }
    # 중요: "model" 키에 들어갈 값은 text-generation-webui UI의 Model 탭에서
    # 현재 로드된 모델의 이름을 확인하고 적어주거나, API가 자동으로 감지하도록 비워둘 수 있습니다.
    # 비워두면 text-generation-webui의 기본 설정을 따릅니다.

    # API 호출 타임아웃 설정 (초 단위)
    API_TIMEOUT_SECONDS = 180

    try:
        print(f"[API Client] POST 요청 전송: {TEXT_GENERATION_WEBUI_API_ENDPOINT} (Timeout: {API_TIMEOUT_SECONDS}s)")
        # HTTP POST 요청
        # 만약 text-generation-webui 실행 시 --api-key YOUR_API_KEY 로 키를 설정했다면,
        # headers={'Authorization': f'Bearer {YOUR_API_KEY}'} 와 같이 헤더를 추가해야 합니다.
        response = requests.post(
            TEXT_GENERATION_WEBUI_API_ENDPOINT,
            json=request_payload,
            timeout=API_TIMEOUT_SECONDS
            # headers={"Authorization": "Bearer YOUR_API_KEY_HERE"} # API 키가 필요한 경우
        )
        response.raise_for_status() # HTTP 오류 발생 시 예외 발생 (4xx, 5xx 상태 코드)

        api_response_data = response.json() # 응답을 JSON으로 파싱

        # OpenAI ChatCompletion 응답 형식에 따라 결과 추출
        if 'choices' in api_response_data and \
           isinstance(api_response_data['choices'], list) and \
           len(api_response_data['choices']) > 0 and \
           isinstance(api_response_data['choices'][0], dict) and \
           'message' in api_response_data['choices'][0] and \
           isinstance(api_response_data['choices'][0]['message'], dict) and \
           'content' in api_response_data['choices'][0]['message']:

            # 실제 분석 결과가 담긴 JSON 문자열
            json_string_from_api_content = api_response_data['choices'][0]['message']['content']
            print(f"[API Client] API로부터 받은 content (JSON 문자열 일부): {json_string_from_api_content[:150]}...")

            # JSON 문자열을 파이썬 딕셔너리로 파싱
            parsed_result = _parse_json_from_ai_content_string(json_string_from_api_content)

            if parsed_result:
                print("[API Client] API 응답 성공적으로 파싱 및 반환.")
                return parsed_result
            else: # 파싱 실패 시
                print("[API Client] API content 파싱 실패. 대체 응답 사용.")
                return { # 직접 오류 응답 구성
                    "진위": "판단 오류 (API 응답 파싱 실패)",
                    "근거": f"API 응답 content 파싱 실패. 원본 content (일부): {json_string_from_api_content[:100]}...",
                    "분석": "API 서버가 예상치 못한 형식의 JSON 문자열을 반환했을 수 있습니다."
                }

        # FastAPI에서 HTTP 예외 발생 시 'detail' 필드에 오류 정보가 올 수 있음 (text-generation-webui도 FastAPI 기반)
        elif 'detail' in api_response_data:
            error_detail = api_response_data['detail']
            error_message = str(error_detail) # detail이 문자열일 수도, 객체일 수도 있음
            if isinstance(error_detail, dict) and 'error' in error_detail and isinstance(error_detail['error'], dict):
                error_message = error_detail['error'].get('message', str(error_detail))

            print(f"[API Client] API 서버에서 오류 응답: {error_message}")
            return {
                "진위": f"판단 오류 (API 서버 오류)",
                "근거": f"API 서버에서 오류 발생: {error_message}",
                "분석": "API 서버의 상태를 확인해주세요."
            }
        else: # 그 외 예상치 못한 응답 형식
            print(f"[API Client] API 응답 형식이 예상과 다릅니다. 응답 (일부): {str(api_response_data)[:200]}...")
            return FALLBACK_RESPONSES["response_parse_failed"]

    except requests.exceptions.Timeout: # 타임아웃 발생
        print(f"[API Client] API 호출 시간 초과 ({API_TIMEOUT_SECONDS}s): {TEXT_GENERATION_WEBUI_API_ENDPOINT}")
        return FALLBACK_RESPONSES["api_call_failed"]
    except requests.exceptions.ConnectionError: # 연결 실패
        print(f"[API Client] API 서버에 연결할 수 없습니다: {TEXT_GENERATION_WEBUI_API_ENDPOINT}")
        return FALLBACK_RESPONSES["api_call_failed"]
    except requests.exceptions.RequestException as e: # 기타 요청 관련 예외
        print(f"[API Client] API 호출 중 오류 발생: {e}")
        return FALLBACK_RESPONSES["api_call_failed"]
    except Exception as e: # 그 외 모든 예외 (JSON 파싱 오류 등)
        print(f"[API Client] API 응답 처리 중 예기치 않은 오류 발생: {e}")
        import traceback
        traceback.print_exc() # 상세 오류 로그
        return FALLBACK_RESPONSES["response_parse_failed"]

if __name__ == '__main__':
    # 이 파일을 직접 실행하면 API 호출 테스트를 수행합니다.
    print("text-generation-webui API 호출 테스트를 시작합니다.")
    print(f"호출 대상 API 엔드포인트: {TEXT_GENERATION_WEBUI_API_ENDPOINT}")
    print("별도의 터미널에서 text-generation-webui 서버가 --api 옵션과 함께 실행 중이어야 합니다.\n")

    test_cases = [
        {
            "title": "[영상] 또 전기차?",
            "content": "부산 터널 앞 아이오닉5 불...운전자 대피. 하지만 내연기관 차량이었다고 한다. 이 기사는 자극적인 제목을 사용하여 독자들의 클릭을 유도하고 있으며, 실제 내용과 다른 인상을 줄 수 있다. 전기차에 대한 막연한 불안감을 조성할 수 있다는 점도 문제다.",
            "desc": "가짜 뉴스 유형 (낚시성 제목 및 내용)"
        },
         {
            "title": "한국, OECD 디지털 정부 평가 2회 연속 1위",
            "content": "우리나라가 경제협력개발기구(OECD)가 실시하는 ‘2023년 디지털 정부 평가(OURdata Index: Digital Government)’에서 종합 1위를 차지하며 2회 연속 세계 최고 수준의 디지털 정부로 인정받았다. 행정안전부와 기획재정부는 26일 이 같은 내용의 평가 결과를 공개했다. 이번 평가는 OECD 회원국을 포함한 총 38개국을 대상으로 진행됐으며, 우리나라는 데이터 개방성, 정부 데이터 활용, 디지털 우선 정부 등 6개 평가항목 중 5개에서 1위를 기록했다.",
            "desc": "진짜 뉴스 유형 (구체적 사실 기반)"
        },
        {
            "title": "짧은 뉴스",
            "content": "오늘 날씨 매우 좋음.", # 50자 미만으로 내용 부족 케이스
            "desc": "내용이 매우 짧은 경우 (50자 미만)"
        }
    ]
    for i, case in enumerate(test_cases):
        print(f"\n--- 테스트 케이스 {i+1}: {case['desc']} ---")
        result = call_fake_analysis_api(case['content'], case['title'])
        print("API 최종 결과 (파싱된 Python Dict):")
        # ensure_ascii=False로 한글 깨짐 방지, indent로 예쁘게 출력
        print(json.dumps(result, ensure_ascii=False, indent=2))
        print("-" * 40)
