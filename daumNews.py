import requests
from bs4 import BeautifulSoup

def crawl_daum_news(url):
    
    # 1. 데이터를 순서대로 저장할 리스트
    extracted_data = []

    try:
        # User-Agent 헤더를 추가하여 봇으로 인식되는 것을 방지
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://www.daum.net/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        }
        
        response = requests.get(url, headers=headers)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # --- 데이터 수집 로직 ---

        # 2. 제목 (Title) 처리
        # [수정] 기존 'h3.tit_view' 외 새로운 구조의 'h2.tit_head'도 확인
        title_element = soup.select_one('h3.tit_view')
        if not title_element:
            title_element = soup.select_one('h2.tit_head')
            
        if title_element:
            title_text = title_element.get_text(strip=True)
            if title_text:
                extracted_data.append({'type': '제목', 'text': title_text})
                print("Daum 뉴스 제목 수집 성공")
        else:
            print("Daum 뉴스 제목을 찾지 못했습니다.")

        # 3. 언론사 (Press) 또는 이름(Author) 처리
        # [수정] 기존 언론사 로고 외에, 저자/채널 정보에 대한 처리 로직 추가
        press_element = soup.select_one('a#kakaoServiceLogo')
        if press_element:
            press_text = press_element.get_text(strip=True)
            if press_text:
                extracted_data.append({'type': '언론사', 'text': press_text})
                print("Daum 뉴스 언론사 수집 성공")
        else:
            # [추가] 언론사 정보가 없을 경우, meta 태그에서 저자(author) 정보를 찾아 '저자'로 저장
            author_element = soup.select_one('meta[property="og:article:author"]')
            if author_element:
                author_text = author_element.get('content')
                if author_text:
                    extracted_data.append({'type': '저자', 'text': author_text})
                    print("Daum 뉴스 저자(작성자) 수집 성공")
            else:
                print("Daum 뉴스 언론사 또는 저자를 찾지 못했습니다.")


        # 4. 작성일시 (Date) 처리
        # [수정] 기존 'span.num_date'가 없을 경우 meta 태그에서 날짜 정보를 가져오도록 수정
        date_element = soup.select_one('span.num_date')
        date_text = None
        if date_element:
            date_text = date_element.get_text(strip=True)
        else:
            # [추가] Fallback: meta 태그에서 작성일 정보 추출
            date_meta_element = soup.select_one('meta[property="og:regDate"]')
            if date_meta_element:
                date_content = date_meta_element.get('content') # 예: "20251007070002"
                if date_content and len(date_content) >= 12:
                    # 사람이 읽기 좋은 형태로 포맷팅
                    year, month, day = date_content[0:4], date_content[4:6], date_content[6:8]
                    hour, minute = date_content[8:10], date_content[10:12]
                    date_text = f"{year}.{month}.{day}. {hour}:{minute}"

        if date_text:
            extracted_data.append({'type': '작성일자', 'text': date_text})
            print("Daum 뉴스 작성일시 수집 성공")
        else:
            print("Daum 뉴스 작성일시를 찾지 못했습니다.")

        # 5. 요약 (Summary) 처리
        # [수정] 요약 정보가 없을 경우 meta 태그의 description 정보를 활용
        summary_element = soup.select_one('strong.summary_view')
        summary_text = None
        if summary_element:
            summary_text = summary_element.get_text(separator='\n', strip=True)
        else:
            # [추가] Fallback: meta 태그에서 요약 정보 추출
            summary_meta_element = soup.select_one('meta[name="description"]')
            if summary_meta_element:
                summary_text = summary_meta_element.get('content')

        if summary_text:
            extracted_data.append({'type': '요약', 'text': summary_text})
            print("Daum 뉴스 요약 수집 성공")
        else:
            print("Daum 뉴스 요약을 찾지 못했습니다. (해당 기사에 요약이 없을 수 있습니다)")

        # [수정된 로직] 6. 본문 (Body) 및 사진 설명 처리
        # 기사 구조 변경에 대응하기 위해 본문 컨테이너를 두 종류 모두 확인합니다.
        body_container = soup.select_one('div.article_view')
        if not body_container:
            body_container = soup.select_one('#articleBody')

        if body_container:
            processed_count = 0
            # Daum 뉴스는 dmcf-ptype 속성을 사용하여 본문, 사진, 부제목 등을 구분합니다.
            # 이 속성을 가진 모든 요소를 순서대로 찾습니다.
            content_blocks = body_container.find_all(attrs={'dmcf-ptype': True})
            
            for block in content_blocks:
                ptype = block.get('dmcf-ptype')

                # 사진(figure) 처리
                if ptype == 'figure':
                    caption = block.find('figcaption', class_='txt_caption')
                    if caption:
                        caption_text = caption.get_text(strip=True)
                        if caption_text:
                            extracted_data.append({'type': '사진', 'text': caption_text})
                            processed_count += 1
                
                # 본문(general, h3, blockquote 등) 처리
                # 버튼과 같이 불필요한 유형은 제외합니다.
                elif ptype not in ['button']:
                    body_text = block.get_text(separator='\n', strip=True)
                    if body_text:
                        extracted_data.append({'type': '본문', 'text': body_text})
                        processed_count += 1
            
            if processed_count > 0:
                print(f"Daum 뉴스 본문 및 사진설명({processed_count}개 문단/사진) 수집 성공")
            else:
                print("Daum 뉴스 본문을 찾지 못했습니다. (기사 구조가 예상과 다를 수 있습니다)")
        else:
            print("Daum 뉴스 본문 영역(div.article_view 또는 #articleBody)을 찾지 못했습니다.")


    except requests.exceptions.RequestException as e:
        print(f"URL 요청 중 에러 발생: {e}")
    except Exception as e:
        print(f"알 수 없는 에러 발생: {e}")

    return extracted_data

# --- 실행 예시 ---
if __name__ == "__main__":
    # 여기에 분석하고 싶은 Daum 뉴스 기사의 URL을 입력하세요.
    # 예시 URL을 실제 존재하지 않는 URL에서, 제공된 HTML에 해당하는 URL로 변경하였습니다.
    sample_daum_url = "https://v.daum.net/v/qeNqgeVZ4I" 
    
    print(f"'{sample_daum_url}' 크롤링을 시작합니다...")
    crawled_data = crawl_daum_news(sample_daum_url)
    
    print("\n--- 최종 수집 데이터 (요청 형식) ---")
    if crawled_data:
        for item in crawled_data:
            item_type = item['type']
            item_text = item['text']
            
            lines = item_text.split('\n')
            
            for line in lines:
                line = line.strip()
                if line:
                    print(f"[{item_type}] {line}")
    else:
        print("수집된 데이터가 없습니다.")