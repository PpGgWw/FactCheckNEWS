"""
분석 결과 하이라이트 모듈 💡
AI 분석 결과(현재는 사용되지 않음)에서 지적된 문장들을 원본 텍스트에서 찾아 하이라이트합니다.
(AI 분석 기능이 제거된 현재 앱에서는 이 모듈의 실제 하이라이트 기능은 거의 사용되지 않을 수 있습니다.)
"""
import html # HTML 이스케이핑을 위함
import re   # 정규 표현식 사용
import traceback # 예외 발생 시 상세 정보 로깅
from typing import List, Dict, Any, Tuple

def normalize_whitespace(text: str) -> str:
    """
    텍스트 내의 모든 종류의 공백(스페이스, 탭, 개행 등)을 단일 스페이스로 변환하고,
    앞뒤 공백을 제거합니다. 🧹
    Args:
        text (str): 정규화할 텍스트.
    Returns:
        str: 공백이 정규화된 텍스트.
    """
    if not text:
        return ""
    # 모든 공백 문자(개행 포함)를 스페이스 하나로 대체 후 양 끝 공백 제거
    normalized = re.sub(r'\s+', ' ', text).strip()
    return normalized

def clean_target_text(text: str) -> str:
    """
    하이라이트 대상 문장에서 매칭을 방해할 수 있는 요소들을 제거합니다. ✨
    (예: 문장 끝 번호, 따옴표, 마크다운 서식 등)
    Args:
        text (str): 정리할 대상 문장.
    Returns:
        str: 정리된 대상 문장.
    """
    if not text:
        return ""
    
    # 문장 끝에 있는 번호 패턴 제거 (예: "문장입니다. 2.")
    text = re.sub(r'\s+\d+\.\s*$', "", text)
    # 앞뒤 큰따옴표 또는 작은따옴표 제거
    text = re.sub(r'^["\']+|["\']+$', "", text)
    # 별표(**)와 같은 마크다운 강조 서식 제거
    text = re.sub(r'\*\*|\*', "", text)
    
    return text.strip()

def highlight_targets(original_text: str, analysis_items: List[Dict[str, Any]]) -> str:
    """
    원본 텍스트에서 AI 분석 대상 문장(analysis_items 내 'target')을 찾아 <span> 태그로 감싸 하이라이트합니다.
    ⚠️ 현재 AI 분석 기능이 비활성화되어 이 함수는 주로 원본 텍스트를 HTML 이스케이프 처리하는 역할만 할 수 있습니다.

    Args:
        original_text (str): 원본 뉴스 기사 본문 텍스트.
        analysis_items (list): 구조화된 분석 결과 리스트. 각 항목은 'target' 키를 가질 수 있습니다.

    Returns:
        str: 하이라이트된 HTML 문자열 또는 (analysis_items가 비었거나 유효하지 않을 경우)
             단순히 HTML 이스케이프되고 개행이 <br>로 변환된 원본 텍스트.
    """
    if not original_text or not isinstance(original_text, str):
        print("[Highlighter] ⚠️ 경고: 원본 텍스트가 비어있거나 유효하지 않습니다.")
        return "" # 빈 문자열 반환
    if not analysis_items or not isinstance(analysis_items, list):
        print("[Highlighter] ℹ️ 정보: 분석 항목이 없거나 유효하지 않습니다. 원본 텍스트를 그대로 반환합니다.")
        # 원본 텍스트를 HTML에서 안전하게 표시하도록 이스케이프하고, 개행 문자를 <br>로 변경
        return html.escape(original_text).replace('\n', '<br>')

    print(f"[Highlighter] ✨ {len(analysis_items)}개의 분석 항목에 대해 하이라이트 시작.")

    # 1. 원본 텍스트를 HTML 이스케이프하고, 개행 문자를 <br> 태그로 변환 (기본 반환값으로도 사용)
    escaped_original_html = html.escape(original_text).replace('\n', '<br>')

    highlights: List[Tuple[int, int, str]] = [] # (시작 인덱스, 끝 인덱스, 분석 ID) 저장
    processed_indices = set() # 이미 하이라이트 적용된 HTML 인덱스 범위를 추적하여 중복 방지

    # 2. 각 분석 항목의 'target' 문장을 찾아 하이라이트할 범위(HTML 기준)를 기록
    for index, item in enumerate(analysis_items):
        if not isinstance(item, dict) or 'target' not in item: # 유효한 항목인지 확인
            continue
        
        target_raw = item.get('target') # AI가 지목한 문장 (원본 형태)
        if not target_raw or not isinstance(target_raw, str):
            continue

        analysis_id = item.get('id', f'analysis-target-{index}') # 각 하이라이트에 대한 고유 ID

        # 3. 매칭 시도: target 문장을 정리하고, 원본 HTML 내에서 유연하게 검색
        try:
            # 대상 문장의 공백 정규화 및 불필요 요소 제거
            normalized_target = normalize_whitespace(target_raw)
            cleaned_target = clean_target_text(normalized_target)
            if not cleaned_target: continue # 정리 후 내용이 없으면 건너뜀

            # 검색 대상이 될 원본 HTML의 공백도 정규화 (단, <br>은 유지)
            # 이 과정은 실제 하이라이트 위치를 찾는 데 직접 사용되기보다는,
            # cleaned_target이 normalized_original_for_search 내에 존재하는지 확인하는 용도.
            # 실제 매칭은 escaped_original_html에서 유연한 패턴으로 진행.
            # normalized_original_for_search = normalize_whitespace(re.sub('<br>', ' ', escaped_original_html))

            print(f"[Highlighter] 🔍 처리 중인 대상 ID '{analysis_id}': 정규화된 타겟='{cleaned_target[:70]}...'")

            # 유연한 검색 패턴 생성: 단어 사이에 다양한 공백 (<br> 포함) 허용
            words = [re.escape(word) for word in cleaned_target.split() if word] # 단어 분리 및 re.escape 처리
            if not words: continue
            
            # 예: "단어1 단어2" -> r"단어1(\s*<br>\s*|\s+)단어2"
            # (\s*<br>\s*|\s+): 0개 이상의 공백 후 <br> 후 0개 이상의 공백 OR 1개 이상의 공백
            flexible_pattern = r"(\s*<br\s*/?>\s*|\s+)".join(words) # <br> 또는 <br/>도 고려
            print(f"[Highlighter]   - HTML 내 유연한 패턴 검색 중: r'{flexible_pattern[:100]}...'")

            match_found_in_html = False
            # escaped_original_html (이스케이프된 원본)에서 유연한 패턴으로 검색 (대소문자 무시)
            for html_match in re.finditer(flexible_pattern, escaped_original_html, re.IGNORECASE):
                start, end = html_match.span() # HTML 내 매칭된 범위

                # 겹치는 하이라이트 방지
                is_overlapping = False
                for p_start, p_end in processed_indices:
                    if max(start, p_start) < min(end, p_end): # 겹치는 조건
                        is_overlapping = True
                        break
                
                if not is_overlapping: # 겹치지 않으면 하이라이트 목록에 추가
                    highlights.append((start, end, analysis_id))
                    processed_indices.add((start, end)) # 처리된 범위로 기록
                    match_found_in_html = True
                    print(f"[Highlighter]   ✅ HTML에서 유연한 패턴 매칭 성공! ID '{analysis_id}' at [{start}:{end}]")
                    break # 이 target에 대한 첫 번째 유효한 매칭만 사용
                else:
                    print(f"[Highlighter]   ⚠️ HTML에서 유연한 패턴 매칭되었으나 겹침 발생. ID '{analysis_id}' at [{start}:{end}] (건너뜀)")
            
            if not match_found_in_html:
                 print(f"[Highlighter]   ❌ 대상 ID '{analysis_id}'에 대한 매칭을 HTML에서 찾지 못함.")
        except re.error as e: # 정규식 오류
            print(f"[Highlighter] 🐛 정규식 오류 발생 (타겟: '{normalized_target[:50]}...'): {e}")
        except Exception as e: # 기타 예외
             print(f"[Highlighter] 💥 타겟 찾는 중 예외 발생 (타겟: '{normalized_target[:50]}...'): {e}")
             print(traceback.format_exc()) # 상세 오류 로깅

    if not highlights: # 하이라이트할 내용이 없으면
        print("[Highlighter] ℹ️ 하이라이트할 대상을 찾지 못했습니다. 원본 이스케이프 텍스트를 반환합니다.")
        return escaped_original_html # 이스케이프된 원본 HTML 반환

    # 하이라이트 시작 위치 기준으로 정렬 (순서대로 HTML 재구성 위함)
    highlights.sort(key=lambda x: x[0])
    
    final_html_parts = [] # 최종 HTML 조각들을 담을 리스트
    last_index = 0 # HTML 원본에서 마지막으로 처리된 인덱스
    applied_highlights_ranges = [] # 최종적으로 적용된 하이라이트 범위 (중복 확인용)

    # 정렬된 하이라이트 정보를 바탕으로 최종 HTML 생성
    for start, end, analysis_id in highlights:
        # 최종 적용 전 다시 한번 겹침 확인 (정렬 후 인접한 하이라이트 간의 미세 조정 때문)
        is_overlapping = False
        for applied_start, applied_end in applied_highlights_ranges:
            if max(start, applied_start) < min(end, applied_end):
                is_overlapping = True
                break
        if is_overlapping:
            print(f"[Highlighter] 🛡️ 최종 확인: 겹치는 하이라이트 건너뜀. ID '{analysis_id}' at [{start}:{end}]")
            continue

        # 시작 위치가 이전 끝 위치보다 작으면 (이론상 발생 안해야 하나, 안전장치)
        if start < last_index:
             start = last_index # 강제로 이전 끝 위치로 조정
             if start >= end: continue # 조정 후 시작이 끝보다 크거나 같으면 무효

        # 이전 끝 위치와 현재 시작 위치 사이의 텍스트 추가 (하이라이트 안 되는 부분)
        if start > last_index:
            final_html_parts.append(escaped_original_html[last_index:start])
        
        # 하이라이트 태그 추가
        highlight_span_start = f'<span class="highlighted-analysis" data-analysis-id="{analysis_id}">'
        highlight_span_end = '</span>'
        highlighted_text_segment = escaped_original_html[start:end] # 실제 하이라이트될 부분
        final_html_parts.append(highlight_span_start + highlighted_text_segment + highlight_span_end)
        
        applied_highlights_ranges.append((start, end)) # 적용된 범위 기록
        last_index = end # 마지막 처리 인덱스 갱신

    # 남은 텍스트 (마지막 하이라이트 이후의 부분) 추가
    if last_index < len(escaped_original_html):
        final_html_parts.append(escaped_original_html[last_index:])

    print(f"[Highlighter] ✅ 하이라이트 완료. 총 {len(applied_highlights_ranges)}개의 하이라이트 적용.")
    return "".join(final_html_parts) # 모든 HTML 조각을 합쳐 최종 결과 반환