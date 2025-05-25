/**
 * 공통 UI 인터랙션을 처리하는 스크립트
 * - 햄버거 메뉴 버튼 클릭 및 메뉴 표시/숨김 기능
 * - DOM 로드 후 실행 및 요소 존재 확인 추가
 * - ARIA 속성 제어 추가
 */

// DOM 콘텐츠 로드가 완료되면 스크립트 실행
document.addEventListener('DOMContentLoaded', function() {
  console.log("[ScriptJS] DOMContentLoaded event fired. Initializing common UI elements.");

  // --- DOM 요소 선택 ---
  const menuButton = document.getElementById('menu-button'); // 햄버거 버튼
  const mainMenu = document.getElementById('main-menu');     // 네비게이션 메뉴

  // --- 요소 존재 확인 ---
  if (!menuButton || !mainMenu) {
      console.warn("[ScriptJS] Hamburger menu button or main menu element not found. Skipping menu initialization.");
      return; // 필수 요소 없으면 실행 중단
  }
  console.log("[ScriptJS] Menu button and main menu found.");

  // --- 햄버거 버튼 클릭 이벤트 처리 ---
  menuButton.addEventListener('click', function() {
      console.log("[ScriptJS] Menu button clicked.");
      // 버튼에 'active' 클래스 토글 (CSS에서 X 모양 제어)
      menuButton.classList.toggle('active');

      // 네비게이션 메뉴에 'menu-open' 클래스 토글 (CSS에서 메뉴 표시/숨김 제어)
      mainMenu.classList.toggle('menu-open');

      // ARIA 속성 업데이트: 메뉴 상태 변경 알림
      const isExpanded = menuButton.classList.contains('active');
      menuButton.setAttribute('aria-expanded', isExpanded);
      console.log(`[ScriptJS] Menu toggled. Is expanded: ${isExpanded}`);
  });

  // --- 메뉴 영역 바깥 클릭 시 메뉴 닫기 기능 ---
  document.addEventListener('click', function(event) {
      // 클릭된 요소가 메뉴 버튼이나 메뉴 영역 내부가 아닌지 확인
      const isClickInsideMenu = mainMenu.contains(event.target);
      const isClickOnButton = menuButton.contains(event.target);

      // 메뉴가 열려 있고, 클릭이 메뉴나 버튼 바깥에서 발생한 경우
      if (mainMenu.classList.contains('menu-open') && !isClickInsideMenu && !isClickOnButton) {
          console.log("[ScriptJS] Click outside menu detected. Closing menu.");
          // 메뉴와 버튼에서 활성화 클래스 제거하여 닫기
          mainMenu.classList.remove('menu-open');
          menuButton.classList.remove('active');
          menuButton.setAttribute('aria-expanded', 'false'); // ARIA 상태 업데이트
      }
  });

  console.log("[ScriptJS] Common UI initialization complete.");

}); // End of DOMContentLoaded listener
