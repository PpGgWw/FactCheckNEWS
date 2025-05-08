# modules/naver_news_scraper.py
import requests
from bs4 import BeautifulSoup
import re

def extract_naver_news_content(url):
    """
    네이버 뉴스 기사 URL에서 주요 내용을 추출합니다.

    Args:
        url (str): 네이버 뉴스 기사 URL

    Returns:
        str: 기사의 주요 내용 (추출 실패 시 None 반환)
    """
    # URL에 HTTP 요청을 보냅니다.
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()  # HTTP 오류 발생 시 예외를 발생시킵니다.

        # HTML 내용을 파싱합니다.
        soup = BeautifulSoup(response.text, 'html.parser')

        # 기사 내용이 담긴 div를 찾습니다.
        # 이 선택자는 네이버 뉴스 기사에 특화되어 있습니다.
        article_content = soup.select_one('#dic_area')

        if article_content:
            # 이미지 설명을 제거합니다.
            for img_desc in article_content.select('.img_desc'):
                img_desc.decompose()

            # 이미지 div를 제거합니다.
            for img_div in article_content.select('.pic_c'):
                img_div.decompose()

            # 텍스트를 정리합니다.
            content = article_content.get_text(strip=True)

            # 불필요한 공백을 제거하고 적절한 간격을 추가합니다.
            content = re.sub(r'\s+', ' ', content)

            # 적절한 단락 나누기를 추가합니다.
            content = content.replace(' <br> ', '\n\n')
            content = content.replace('<br>', '\n\n')

            return content
        else:
            return "기사 내용을 찾을 수 없습니다. 웹사이트 구조가 변경되었을 수 있습니다."

    except requests.exceptions.RequestException as e:
        return f"웹사이트를 가져오는 중 오류 발생: {e}"

if __name__ == "__main__":
    url = "https://n.news.naver.com/article/584/0000032240?cds=news_media_pc&type=editn"
    article_content = extract_naver_news_content(url)
    print(article_content)
