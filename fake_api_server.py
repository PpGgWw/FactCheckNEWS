import json
import re
import uuid # 🆔 고유 ID 생성을 위함
import time # ⏰ 생성 시간 기록을 위함
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field # ⚙️ 데이터 유효성 검사 및 스키마 정의
from typing import Dict, Optional, Tuple, List, Union
from llama_cpp import Llama # 🦙 Llama 모델 라이브러리

# --- ⚙️ 모델 설정 ---
# ❗ 중요: MODEL_PATH를 실제 모델 파일 경로로 정확히 수정해주세요.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FILENAME = "Meta-Llama-3-8B-Instruct-Q5_K_M.gguf" # 📄 사용할 모델 파일명
# 예시: fake_api_server.py가 있는 폴더의 상위 폴더에 models 폴더가 있는 경우
MODEL_PATH = os.path.join(BASE_DIR, "models", MODEL_FILENAME)
# MODEL_PATH = "C:/path/to/your/models/Meta-Llama-3-8B-Instruct.Q5_K_M.gguf" # 윈도우 절대 경로 예시

MODEL_API_NAME = "Llama-3-8B-Instruct-NewsAnalyzer" # API에서 사용할 모델 이름
N_GPU_LAYERS = 0  # 🎮 GPU 오프로딩 레이어 수 (0 = CPU만 사용)
N_CTX = 4096      # 🧠 컨텍스트 크기 (모델이 한 번에 처리할 수 있는 토큰 수)

app = FastAPI(
    title="Real News Analysis API Server (Llama-3)",
    description=f"{MODEL_API_NAME} 모델을 사용하여 뉴스 분석 결과를 제공합니다. 🤖📰",
    version="1.1.1"
)

llm_model: Optional[Llama] = None # Llama 모델 객체를 저장할 변수
if not os.path.exists(MODEL_PATH): # 🧐 모델 파일 존재 여부 확인
    print(f"❌ 모델 파일을 찾을 수 없습니다: {MODEL_PATH}")
    print(f"현재 작업 디렉토리: {os.getcwd()}")
    print(f"BASE_DIR (스크립트 위치 기준): {BASE_DIR}")
    print("MODEL_PATH 환경 변수나 코드 내 경로 설정을 다시 확인해주세요. 😥")
else:
    try:
        print(f"⏳ '{MODEL_PATH}'에서 Llama-3 모델 로드 중... 시간이 다소 소요될 수 있습니다.")
        llm_model = Llama(
            model_path=MODEL_PATH,
            n_gpu_layers=N_GPU_LAYERS,
            n_ctx=N_CTX,
            chat_format="llama-3", # 모델에 맞는 채팅 형식 지정
            verbose=True, # 로드 과정 상세 정보 출력
            use_mmap=False  # ❗ PrefetchVirtualMemory 오류 해결을 위해 False로 설정 (메모리 매핑 사용 안 함)
        )
        print(f"✅ Llama-3 모델 로드 완료: {MODEL_API_NAME}")
    except Exception as e:
        print(f"❌ 모델 로드 중 오류 발생: {e}")
        import traceback
        traceback.print_exc() # 상세 오류 정보 출력
        llm_model = None

# --- 📦 Pydantic 모델 (OpenAI API 형식 모방) ---
# API 요청/응답 데이터 구조를 정의합니다.
class ChatMessageInput(BaseModel):
    """ 💬 채팅 메시지 입력 모델 """
    role: str # "system", "user", "assistant" 중 하나
    content: str # 메시지 내용

class ChatCompletionRequestReal(BaseModel):
    """ 🤖 채팅 완료 요청 모델 """
    model: Optional[str] = MODEL_API_NAME # 사용할 모델 이름
    messages: List[ChatMessageInput] # 채팅 메시지 목록
    temperature: Optional[float] = 0.1 # 🌡️ 다양성 제어 (낮을수록 결정적)
    max_tokens: Optional[int] = 1536 #  tokens 최대 생성 토큰 수
    stream: Optional[bool] = False # 💨 스트리밍 응답 여부 (현재는 False만 지원)
    top_p: Optional[float] = 0.9 # 🔝 확률 분포에서 상위 p%의 토큰만 고려
    stop: Optional[Union[str, List[str]]] = ["\n```", "```\n", "\n\n", "}\n", "}\r\n", "<|eot_id|>"] # 🛑 생성 중단 토큰

class ResponseMessageOutput(BaseModel):
    """ 💬 응답 메시지 모델 """
    role: str = "assistant" # 응답 역할은 항상 "assistant"
    content: str # 응답 내용 (JSON 문자열)

class ChatCompletionChoiceOutput(BaseModel):
    """ ✅ 채팅 완료 선택지 모델 """
    index: int = 0
    message: ResponseMessageOutput
    finish_reason: Optional[str] = "stop" # 완료 이유 (예: "stop", "length")

class ChatCompletionResponseReal(BaseModel):
    """ 🎁 채팅 완료 전체 응답 모델 """
    id: str = Field(default_factory=lambda: f"chatcmpl-realmodel-{uuid.uuid4().hex}") # 고유 응답 ID
    object: str = "chat.completion" # 객체 타입
    created: int = Field(default_factory=lambda: int(time.time())) # 생성 타임스탬프
    model: str # 사용된 모델 이름
    choices: List[ChatCompletionChoiceOutput] # 선택지 목록 (일반적으로 하나)

# --- 📝 프롬프트 구성 및 뉴스 정보 추출 ---
SYSTEM_PROMPT_FOR_MODEL = """당신은 가짜 뉴스 탐지 전문가입니다. 아래 조건과 중요도에 따라 기사를 판단하세요.
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
""" # 🧑‍🏫 모델에게 역할을 부여하고 지시하는 시스템 프롬프트

def parse_news_data_from_user_message(user_message_content: str) -> Tuple[Optional[str], Optional[str]]:
    """
    USER_MESSAGE_TEMPLATE 형식의 사용자 메시지에서 뉴스 제목과 본문을 추출합니다. 🔍
    Args:
        user_message_content (str): 사용자가 보낸 메시지 내용.
    Returns:
        Tuple[Optional[str], Optional[str]]: (뉴스 제목, 뉴스 본문). 추출 실패 시 None 또는 기본값 반환.
    """
    news_title = None
    news_content = None

    # analyzer_api_simulator.py의 USER_MESSAGE_TEMPLATE 형식과 일치해야 함:
    # "뉴스 제목: {news_title}\n뉴스 본문: {news_content}\n---\n위 뉴스에 대해 JSON 형식으로 분석 결과를 제공해주세요."
    title_match = re.search(r"뉴스 제목:\s*(.*?)\n뉴스 본문:", user_message_content, re.DOTALL)
    content_match = re.search(r"뉴스 본문:\s*([\s\S]*?)\n---", user_message_content, re.DOTALL)

    if title_match:
        news_title = title_match.group(1).strip()
    if content_match:
        news_content = content_match.group(1).strip()
    
    # ☝️ 만약 위 패턴으로 본문 추출 실패 시, 좀 더 넓은 범위로 본문 추출 시도
    if news_content is None and "뉴스 본문:" in user_message_content:
        content_start_index = user_message_content.find("뉴스 본문:") + len("뉴스 본문:")
        # "---" 마커 또는 "JSON 형식으로 분석 결과" 마커를 찾아 그 전까지를 본문으로 간주
        end_marker1 = "\n---"
        end_marker2 = "JSON 형식으로 분석 결과"
        
        idx1 = user_message_content.find(end_marker1, content_start_index)
        idx2 = user_message_content.find(end_marker2, content_start_index)

        end_idx = -1
        if idx1 != -1 and idx2 != -1: end_idx = min(idx1, idx2)
        elif idx1 != -1: end_idx = idx1
        elif idx2 != -1: end_idx = idx2
            
        if end_idx != -1:
            news_content = user_message_content[content_start_index:end_idx].strip()
        else: # 마커가 없으면 메시지 끝까지 본문으로 간주
            news_content = user_message_content[content_start_index:].strip()

    if news_title is None: news_title = "제목 파싱 실패" # 😥 제목 추출 실패 시
    if news_content is None: news_content = "본문 파싱 실패" # 😥 본문 추출 실패 시
    
    return news_title, news_content

def clean_model_output_to_valid_json(model_text_output: str) -> str:
    """모델 출력을 최대한 유효한 JSON 문자열로 정리합니다. ✨"""
    text = model_text_output.strip()
    
    # ```json ... ``` 또는 ``` ... ``` 와 같은 마크다운 코드 블록 제거
    if text.startswith("```json"): text = text[len("```json"):].strip()
    elif text.startswith("```"): text = text[len("```"):].strip()
    if text.endswith("```"): text = text[:-len("```")].strip()

    # 첫 번째 '{'와 마지막 '}'를 찾아 그 사이의 내용을 JSON으로 간주
    first_brace = text.find('{')
    last_brace = text.rfind('}')
    
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        text = text[first_brace : last_brace+1]
    else:
        # JSON 객체 경계를 찾지 못한 경우, 오류를 나타내는 JSON 반환
        print(f"[JSON Cleaner] ⚠️ 모델 출력에서 JSON 객체 경계를 찾지 못했습니다. 원본 일부: {model_text_output[:100]}")
        return json.dumps({
            "진위": "판단 오류 (모델 응답 형식 문제)",
            "근거": f"모델이 유효한 JSON 객체 형태의 문자열을 생성하지 못했습니다. 모델 출력 (일부): {model_text_output[:100]}...",
            "분석": "모델의 프롬프트나 stop 토큰 설정을 확인해야 할 수 있습니다."
        }, ensure_ascii=False, indent=2) # ensure_ascii=False로 한글 유지, indent로 가독성 확보
    
    return text.strip()

@app.post("/v1/chat/completions", response_model=ChatCompletionResponseReal)
async def create_real_chat_completion(request: ChatCompletionRequestReal):
    """ 🤖 Llama-3 모델을 사용하여 실제 뉴스 분석을 수행하는 API 엔드포인트 """
    if llm_model is None: # 모델이 로드되지 않은 경우
        raise HTTPException(status_code=503, detail="Llama-3 모델이 로드되지 않았습니다. 서버 로그를 확인해주세요. 😥")

    if not request.messages: # 요청에 메시지가 없는 경우
        raise HTTPException(status_code=400, detail={"error": {"message": "messages 필드가 필요합니다."}})

    # 사용자 메시지 찾기 (보통 마지막 메시지)
    user_message_content = ""
    for msg in request.messages:
        if msg.role == "user":
            user_message_content = msg.content
            break
    
    if not user_message_content: # 사용자 메시지가 없는 경우
        raise HTTPException(status_code=400, detail={"error": {"message": "User message를 찾을 수 없습니다."}})

    # 사용자 메시지에서 뉴스 제목과 본문 파싱
    news_title, news_content = parse_news_data_from_user_message(user_message_content)

    # 파싱 실패 또는 본문이 없는 경우
    if news_title == "제목 파싱 실패" or news_content == "본문 파싱 실패" or not news_content:
        print(f"[Real API] ⚠️ 사용자 메시지에서 뉴스 정보 파싱 실패 또는 본문 없음. 제목: {news_title}, 내용 일부: {news_content[:50] if news_content else 'N/A'}")
        error_json_content = json.dumps({
            "진위": "판단 불가 (입력 정보 파싱 오류)",
            "근거": "클라이언트가 보낸 메시지에서 뉴스 제목 또는 본문을 정확히 추출할 수 없었습니다.",
            "분석": "입력 형식을 확인해주세요. (예: '뉴스 제목: ... 뉴스 본문: ... ---')"
        }, ensure_ascii=False, indent=2)
        response_message = ResponseMessageOutput(content=error_json_content)
        choice = ChatCompletionChoiceOutput(message=response_message)
        return ChatCompletionResponseReal(model=request.model or MODEL_API_NAME, choices=[choice])

    print(f"[Real API] 🧠 분석 요청 수신: 제목='{news_title[:30]}...'")

    # 내용이 너무 짧은 경우 (모델에게 보내기 전에 API 서버에서 판단)
    if len(news_content) < 50: # 📏
        print("[Real API] ⚠️ 내용이 너무 짧아 (50자 미만) '판단 불가' JSON 반환.")
        short_content_json = json.dumps({
            "진위": "판단 불가 (내용 부족)",
            "근거": "제공된 뉴스 내용이 너무 짧아 (50자 미만) 분석에 필요한 충분한 정보를 포함하고 있지 않습니다.",
            "분석": "뉴스 내용이 부족하여 가짜 뉴스 판단 기준을 적용하기 어렵습니다."
        }, ensure_ascii=False, indent=2)
        response_message = ResponseMessageOutput(content=short_content_json)
        choice = ChatCompletionChoiceOutput(message=response_message)
        return ChatCompletionResponseReal(model=request.model or MODEL_API_NAME, choices=[choice])

    # 클라이언트가 보낸 메시지 목록 (시스템 프롬프트 포함)을 모델에 전달
    final_messages_for_model = [msg.model_dump() for msg in request.messages]
    # analyzer_api_simulator.py에서 시스템 프롬프트를 이미 구성하여 보내므로, 여기서는 그대로 사용합니다.

    try:
        print(f"[Real API] 🚀 Llama-3 모델 추론 시작... (max_tokens: {request.max_tokens}, temp: {request.temperature})")
        
        # 🗣️ Llama 모델 호출 (OpenAI API v1 호환 형식 사용)
        completion = llm_model.create_chat_completion_openai_v1(
            messages=final_messages_for_model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            top_p=request.top_p,
            stop=request.stop, # stop 토큰 설정
            stream=False, # 스트리밍은 현재 False로 고정
        )
        
        # 모델의 원본 응답 텍스트 추출
        raw_model_output = completion.choices[0].message.content if completion.choices and completion.choices[0].message else ""
        print(f"[Real API] ✨ Llama-3 모델 원본 응답 (일부): {raw_model_output[:250]}...")

        # 모델 응답을 유효한 JSON으로 정리
        cleaned_json_string = clean_model_output_to_valid_json(raw_model_output)
        
        # 최종적으로 유효한 JSON인지 다시 파싱 시도하여, 실패 시 오류 JSON으로 대체
        try:
            json.loads(cleaned_json_string) # 파싱 시도 (성공하면 아무것도 안함)
            print("[Real API] ✅ 모델 출력이 유효한 JSON 형식임을 확인.")
        except json.JSONDecodeError as je:
            print(f"[Real API] ❌ 최종 정리된 문자열도 유효한 JSON이 아님! 오류: {je}")
            print(f"원본 모델 출력: {raw_model_output}")
            print(f"정리 시도한 문자열: {cleaned_json_string}")
            # 오류 상황을 나타내는 JSON으로 대체
            cleaned_json_string = json.dumps({
                "진위": "판단 오류 (모델 응답 형식 문제)",
                "근거": f"모델이 유효한 JSON을 생성하지 못했습니다. 모델 출력 (일부): {raw_model_output[:100]}...",
                "분석": "모델의 프롬프트나 설정을 확인해야 할 수 있습니다. 또는 모델이 요청된 작업을 수행하기 어려워할 수 있습니다."
            }, ensure_ascii=False, indent=2)

        # 최종 응답 구성
        response_message = ResponseMessageOutput(content=cleaned_json_string)
        choice = ChatCompletionChoiceOutput(message=response_message, finish_reason=completion.choices[0].finish_reason if completion.choices else "error")
        final_response_obj = ChatCompletionResponseReal(
            id=completion.id if hasattr(completion, 'id') else f"chatcmpl-realmodel-{uuid.uuid4().hex}",
            object=completion.object if hasattr(completion, 'object') else "chat.completion",
            created=completion.created if hasattr(completion, 'created') else int(time.time()),
            model=completion.model if hasattr(completion, 'model') else MODEL_API_NAME,
            choices=[choice]
        )
        return final_response_obj

    except Exception as e: # 모델 추론 중 예외 발생 시
        print(f"[Real API] 💥 Llama-3 모델 추론 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        # 오류 응답 JSON 생성
        error_content = json.dumps({
            "진위": "판단 오류 (서버 내부 문제)",
            "근거": f"모델 추론 중 서버 내부 오류 발생: {str(e)}",
            "분석": "서버 관리자에게 문의하거나 잠시 후 다시 시도해주세요."
        }, ensure_ascii=False, indent=2)
        
        response_message = ResponseMessageOutput(content=error_content)
        choice = ChatCompletionChoiceOutput(message=response_message, finish_reason="error")
        return ChatCompletionResponseReal(
            model=request.model or MODEL_API_NAME, 
            choices=[choice]
        )

if __name__ == '__main__':
    import uvicorn
    if llm_model is None: # 모델 로드 실패 시 서버 시작 안 함
         print("🔴 모델 로드에 실패하여 API 서버를 시작하지 않습니다. MODEL_PATH 설정을 확인해주세요.")
    else:
        print(f"✅ Real AI API Server (Llama-3: {MODEL_API_NAME})가 http://127.0.0.1:5005 에서 실행됩니다.")
        print("API 엔드포인트: POST http://127.0.0.1:5005/v1/chat/completions")
        # 0.0.0.0으로 호스트를 설정하면 외부에서도 접속 가능 (Docker 등 환경 고려)
        uvicorn.run(app, host='0.0.0.0', port=5005, log_level="info")