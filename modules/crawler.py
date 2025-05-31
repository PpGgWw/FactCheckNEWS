import requests # 웹 페이지 요청을 위한 라이브러리
from bs4 import BeautifulSoup # HTML 파싱을 위한 라이브러리
import re # 정규 표현식 사용을 위한 라이브러리
from typing import Dict, Optional

# 기본 User-Agent 설정: 웹 서버에 요청 시 브라우저처럼 보이도록 하여 차단을 피하는 데 도움
DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'

def clean_content(text: Optional[str]) -> str:
    # 크롤링된 뉴스 본문 텍스트에서 불필요한 부분을 정규식을 사용하여 제거하고 정리하는 함수
    # Args:
    #   text (Optional[str]): 정리할 원본 텍스트.
    # Returns:
    #   str: 정리된 텍스트.
    if not text: # 입력 텍스트가 없는 경우 빈 문자열 반환
        return ""
    
    # HTML 주석 제거 (여러 줄에 걸친 주석 포함)
    text = re.sub(r'', '', text, flags=re.DOTALL)
    # 일반적인 URL 패턴 제거 (기사 내 유의미한 링크도 제거될 수 있으므로 주의)
    text = re.sub(r'http[s]?://\S+', '', text)
    # 광고 문구 제거 (예: [광고], (광고), 대소문자 무시)
    text = re.sub(r'\[.*?광고.*?\]', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\(.*?광고.*?\)', '', text, flags=re.IGNORECASE)
    # 기자 정보 패턴 제거 (예: OOO 기자 (email@example.com), OOO 기자 email@example.com)
    text = re.sub(r'[\w\s]+기자\s*(?:\([\w@.]+\)|[\w@.]+)?', '', text) 
    # 순수 이메일 주소 제거
    text = re.sub(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '', text)
    # 이미지/자료 출처 표시 제거 (예: [사진=연합뉴스], (자료제공=OOO), 대소문자 무시)
    text = re.sub(r'[\[\(]?\s*(사진|자료|이미지)\s*[:=]\s*[^\]\)]+\s*[\]\)]?', '', text, flags=re.IGNORECASE)
    text = re.sub(r'/\s*(사진|자료|이미지)\s*[:=]\s*\S+', '', text, flags=re.IGNORECASE) # / 사진=OOO 형식
    # 기타 불필요 문구 제거 (예: ▶ 관련기사, ⓒ 뉴스1코리아, 무단전재 및 재배포 금지 등)
    text = re.sub(r'▶\s*관련\s*기사\s*.*', '', text)
    text = re.sub(r'ⓒ\s*[\w\s]+(?:뉴스|신문|미디어|일보|경제|방송)\s*(?:코리아|특파원)?\s*(?:무단전재\s*및\s*재배포\s*금지)?', '', text, flags=re.IGNORECASE)
    text = re.sub(r'무단\s*전재\s*및\s*재배포\s*금지', '', text, flags=re.IGNORECASE)
    # 개행(엔터), 탭 문자를 공백으로 변경
    text = re.sub(r'[\r\n\t]+', ' ', text)
    # 연속된 공백을 하나의 공백으로 축소
    text = re.sub(r'\s{2,}', ' ', text)
    
    return text.strip() # 양 끝의 불필요한 공백 최종 제거

def fetch_html(url: str) -> Optional[str]:
    # 주어진 URL의 HTML 내용을 가져오는 함수
    # Args:
    #   url (str): 가져올 웹 페이지의 URL.
    # Returns:
    #   Optional[str]: HTML 내용 문자열. 실패 시 None.
    try:
        headers = {'User-Agent': DEFAULT_USER_AGENT} # User-Agent 헤더 설정
        # HTTP GET 요청 (타임아웃 10초 설정)
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status() # HTTP 오류(4xx, 5xx) 발생 시 예외를 발생시킴

        # 인코딩 처리: 네이버 뉴스가 간혹 ISO-8859-1로 잘못 감지될 경우 UTF-8로 재시도
        if response.encoding and response.encoding.lower() == 'iso-8859-1':
            # 내용 기반으로 추측된 인코딩(apparent_encoding)이 'iso-8859-1'이 아니면 그것을 사용,
            # 그렇지 않으면 'utf-8'을 기본값으로 사용
            final_encoding = response.apparent_encoding if response.apparent_encoding and response.apparent_encoding.lower() != 'iso-8859-1' else 'utf-8'
            response.encoding = final_encoding
        
        return response.text # HTML 내용을 문자열로 반환
    except requests.exceptions.RequestException as e: # 네트워크 관련 예외 처리
        print(f"[Crawler] URL 요청 실패: {url}, 오류: {e}")
        return None
    except Exception as e: # 기타 예외 처리
        print(f"[Crawler] HTML 가져오기 중 알 수 없는 오류: {url}, 오류: {e}")
        return None

def parse_news_data(html_content: str) -> Dict[str, str]:
    # HTML 내용에서 뉴스 제목, 작성 날짜/시간, 본문, 언론사를 추출하는 함수
    # Args:
    #   html_content (str): 파싱할 HTML 내용.
    # Returns:
    #   Dict[str, str]: 추출된 뉴스 정보 (제목, 작성날짜 및 시간, 본문, 언론사). 오류 시 'error' 키 포함.
    if not html_content: # HTML 내용이 없는 경우 오류 정보 반환
        return {
            "제목": "HTML 내용 없음", "작성날짜 및 시간": "날짜 없음",
            "본문": "HTML 내용이 없어 본문을 추출할 수 없습니다.", "언론사": "언론사 정보 없음",
            "error": "HTML 내용이 비어있습니다."
        }

    soup = BeautifulSoup(html_content, 'html.parser') # BeautifulSoup 객체 생성하여 HTML 파싱
    
    # 뉴스 제목 추출을 위한 CSS 선택자 목록
    title_selectors = [
        'h2.media_end_head_headline', 
        'h2#title_area span',        
        'div.news_headline h4',      
        '#ct h1.title'               
    ]
    title_tag = None
    # 각 선택자를 순서대로 시도하여 제목 태그 탐색
    for selector in title_selectors:
        title_tag = soup.select_one(selector)
        if title_tag: break # 태그를 찾으면 반복 중단
    title = title_tag.get_text(strip=True) if title_tag else "제목 없음"

    # 작성 날짜 및 시간 추출을 위한 CSS 선택자 목록
    date_selectors = [
        'span.media_end_head_info_datestamp_time._ARTICLE_DATE_TIME', 
        'div.article_info span.author em',                          
        'span.article_info span.date',                              
        'div.info span.time',                                       
        'div.news_info span.time',                                  
        'span.date'                                                 
    ]
    date_tag = None
    # 각 선택자를 순서대로 시도하여 날짜 태그 탐색
    for selector in date_selectors:
        date_tag = soup.select_one(selector)
        if date_tag: break
        
    date_text = "날짜 없음"
    if date_tag:
        # data-date-time 또는 data-modify-date-time 속성이 있으면 해당 값을 우선 사용
        if date_tag.has_attr('data-date-time'):
            date_text = date_tag['data-date-time']
        elif date_tag.has_attr('data-modify-date-time'):
             date_text = date_tag['data-modify-date-time']
        else: # 속성이 없으면 태그의 텍스트 내용을 사용하고 정리
            date_text = date_tag.get_text(strip=True)
            date_text = re.sub(r'^(입력|수정)\s*', '', date_text).strip()


    # 뉴스 본문 추출을 위한 CSS 선택자 목록 (가장 중요)
    content_selectors = [
        'article#dic_area',         
        'div#articleBodyContents',  
        'div.article_body',         
        'div#newsct_article',       
        'div.news_end_content',     
        'section.article_content'   
    ]
    content_tag = None
    # 각 선택자를 순서대로 시도하여 본문 태그 탐색
    for selector in content_selectors:
        content_tag = soup.select_one(selector)
        if content_tag: break
    
    raw_content = ""
    if content_tag:
        # 본문 내 불필요한 요소(스크립트, 스타일, 광고 등)를 미리 제거하기 위한 선택자 목록
        elements_to_remove_selectors = [
            'script', 'style', 'iframe', '.ad_area', '.da_obj', '.vod_player', 
            '.u_rmcplayer', 'figure.nbd_imput_class', '.promotion_area', 
            '.link_news', '.news_end_btn_wrap', '.reporter_area', '.copyright',
            'div.supporter_layer_01', 'div.news_like_block', 
            'div.u_cbox', 
            'div.media_end_linked_news_box', 'div.media_end_channel_subscribe',
            'div.media_end_bottom_sticky_ad', 'div.NCS_AD' 
        ]
        # 선택된 불필요한 요소들을 본문에서 제거 (decompose)
        for selector_to_remove in elements_to_remove_selectors:
            for unwanted_tag in content_tag.select(selector_to_remove):
                unwanted_tag.decompose()
        
        # 순수 텍스트만 추출 (자식 태그들의 텍스트를 공백으로 구분하여 합침)
        raw_content = content_tag.get_text(separator=' ', strip=True) 
    
    # 추출된 원본 내용을 clean_content 함수로 정리
    cleaned_body = clean_content(raw_content) if raw_content else "본문 없음"
    # 정리 후에도 내용이 없다면, 원본에 문제가 있었음을 명시
    if not cleaned_body.strip() and raw_content:
        cleaned_body = "본문 내용을 추출했으나, 정리 과정에서 모두 제거되었거나 유효한 내용이 없습니다."


    # 언론사 정보 추출을 위한 CSS 선택자 목록
    press_selectors = [
        'span.media_end_head_top_logo_name_text',
        'a.media_end_head_top_logo img[alt]',    
        'div.press_logo img[alt]',               
        'div.organization_info a.link_media',    
        'span.ofhd_float_title_text_press',      
        'em.media_summary_company'               
    ]
    press_tag = None
    press_name = "언론사 정보 없음"

    # 각 선택자를 순서대로 시도하여 언론사 정보 태그 탐색
    for selector in press_selectors:
        press_tag = soup.select_one(selector)
        if press_tag:
            # 이미지 태그의 alt 속성 또는 일반 텍스트 내용 사용
            if press_tag.name == 'img' and press_tag.has_attr('alt'):
                press_name = press_tag['alt'].strip()
            else:
                press_name = press_tag.get_text(strip=True)
            
            press_name = press_name.replace("언론사 선정", "").strip() # 불필요한 문구 제거
            if press_name: # 유효한 이름이 추출되면 반복 중단
                break 
        if press_name and press_name != "언론사 정보 없음": break

    # 위 선택자들로 찾지 못한 경우, meta 태그에서 언론사 정보 시도 (최후의 수단)
    if not press_name or press_name == "언론사 정보 없음":
        meta_press_selectors = [
            "meta[property='og:site_name']", 
            "meta[name='twitter:site']"     
        ]
        for meta_selector in meta_press_selectors:
            meta_tag = soup.select_one(meta_selector)
            if meta_tag and meta_tag.has_attr('content'):
                press_name = meta_tag['content'].strip()
                if press_name: break


    # 제목이나 본문이 모두 없는 경우 오류로 간주
    if title == "제목 없음" and cleaned_body == "본문 없음":
        return {
            "제목": title, "작성날짜 및 시간": date_text, "본문": cleaned_body, "언론사": press_name,
            "error": "기사 제목과 본문을 모두 찾을 수 없습니다. 페이지 구조가 다르거나 내용이 없습니다."
        }

    # 최종 추출 결과 반환
    return { 
        "제목": title,
        "작성날짜 및 시간": date_text,
        "본문": cleaned_body,
        "언론사": press_name
    }

def extract_news_data(url: str) -> Dict[str, str]:
    # 주어진 URL에서 뉴스 데이터를 추출하는 전체 과정을 총괄하는 함수
    # Args:
    #   url (str): 크롤링할 뉴스의 URL.
    # Returns:
    #   Dict[str, str]: 추출된 뉴스 데이터. 실패 시 'error' 키를 포함.
    print(f"[Crawler] 뉴스 데이터 추출 시도: {url}")
    html_content = fetch_html(url) # 1. HTML 내용 가져오기
    if not html_content: # HTML 가져오기 실패 시 오류 반환
        return {"error": "URL로부터 HTML 내용을 가져오는데 실패했습니다.", "제목": "크롤링 실패", "본문": ""}
    
    news_data = parse_news_data(html_content) # 2. HTML 파싱하여 정보 추출
    
    # 본문 내용이 너무 짧을 경우 (30자 미만) 경고 메시지 추가
    if not news_data.get("error") and (not news_data.get("본문") or len(news_data.get("본문")) < 30):
        warning_msg = "추출된 본문 내용이 매우 짧습니다 (30자 미만). 확인이 필요합니다."
        news_data["warning"] = warning_msg # 경고 메시지를 결과 딕셔너리에 추가
        if not news_data.get("본문"): # 본문이 아예 없는 경우
             news_data["본문"] = "본문 내용을 찾을 수 없거나 내용이 매우 짧습니다."
             if not news_data.get("error"): # 기존 에러가 없다면, 이 상황을 에러로 설정
                 news_data["error"] = "본문 내용을 찾을 수 없거나 내용이 매우 짧습니다."
        print(f"[Crawler] 경고: {warning_msg} (URL: {url})")


    # 최종 결과 로그 출력
    if news_data.get("error"):
         print(f"[Crawler] 뉴스 데이터 파싱 실패: {url}, 오류: {news_data.get('error')}")
    elif news_data.get("warning"):
         print(f"[Crawler] 뉴스 데이터 파싱 경고: {url}, 경고: {news_data.get('warning')}")
    else:
        print(f"[Crawler] 뉴스 데이터 추출 성공: '{news_data.get('제목', '제목 없음')[:30]}...' (언론사: {news_data.get('언론사', '정보없음')})")
        
    return news_data

# 스크립트 직접 실행 시 테스트 코드 (현재 주석 처리됨)
# if __name__ == '__main__':
#     test_url = "여기에 테스트할 네이버 뉴스 URL을 입력하세요"
#     data = extract_news_data(test_url)
#     import json
#     print(json.dumps(data, ensure_ascii=False, indent=2))
