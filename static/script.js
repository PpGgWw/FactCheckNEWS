// DOM 콘텐츠가 완전히 로드된 후 스크립트를 실행하도록 이벤트 리스너 추가
document.addEventListener('DOMContentLoaded', function() {
  console.log("[ScriptJS] DOMContentLoaded event fired. Initializing common UI elements.");

  // --- DOM 요소 참조 ---
  const menuButton = document.getElementById('menu-button'); // 햄버거 메뉴 버튼 요소
  const mainMenu = document.getElementById('main-menu');     // 메인 네비게이션 메뉴 요소

  // --- 필수 요소 존재 여부 확인 ---
  // 메뉴 버튼 또는 메인 메뉴 요소가 페이지에 없는 경우, 스크립트 실행을 중단
  if (!menuButton || !mainMenu) {
      console.warn("[ScriptJS] Hamburger menu button or main menu element not found. Skipping menu initialization.");
      return; 
  }
  console.log("[ScriptJS] Menu button and main menu found.");

  // --- 햄버거 메뉴 버튼 클릭 이벤트 리스너 ---
  menuButton.addEventListener('click', function() {
      console.log("[ScriptJS] Menu button clicked.");
      // 메뉴 버튼에 'active' 클래스를 토글하여 버튼 모양 변경 (예: 햄버거 -> X)
      menuButton.classList.toggle('active');

      // 메인 메뉴에 'menu-open' 클래스를 토글하여 메뉴 표시/숨김
      mainMenu.classList.toggle('menu-open');

      // ARIA (Accessible Rich Internet Applications) 속성 업데이트
      // 메뉴의 확장 상태를 스크린 리더 등 보조 기술에 알림
      const isExpanded = menuButton.classList.contains('active');
      menuButton.setAttribute('aria-expanded', isExpanded);
      console.log(`[ScriptJS] Menu toggled. Is expanded: ${isExpanded}`);
  });

  // --- 메뉴 영역 외부 클릭 시 메뉴 닫기 기능 ---
  document.addEventListener('click', function(event) {
      // 클릭된 요소가 메뉴 자체 또는 메뉴 버튼 내부에 있는지 확인
      const isClickInsideMenu = mainMenu.contains(event.target);
      const isClickOnButton = menuButton.contains(event.target);

      // 메뉴가 열려 있고, 클릭된 지점이 메뉴나 버튼의 바깥 영역일 경우
      if (mainMenu.classList.contains('menu-open') && !isClickInsideMenu && !isClickOnButton) {
          console.log("[ScriptJS] Click outside menu detected. Closing menu.");
          // 메뉴와 버튼에서 활성화 관련 클래스 제거하여 메뉴를 닫음
          mainMenu.classList.remove('menu-open');
          menuButton.classList.remove('active');
          menuButton.setAttribute('aria-expanded', 'false'); // ARIA 상태 업데이트
      }
  });

  console.log("[ScriptJS] Common UI initialization complete.");

}); // DOMContentLoaded 이벤트 리스너 종료
