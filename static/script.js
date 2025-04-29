// script.js

// DOM 요소 선택
const menuButton = document.getElementById('menu-button'); // 햄버거 버튼
const mainMenu = document.getElementById('main-menu');     // 네비게이션 메뉴

// 햄버거 버튼 클릭 이벤트 처리
menuButton.addEventListener('click', function() {
  // 버튼에 'active' 클래스 토글 (CSS에서 X 모양 제어)
  menuButton.classList.toggle('active');

  // 네비게이션 메뉴에 'menu-open' 클래스 토글 (CSS에서 메뉴 표시/숨김 제어)
  mainMenu.classList.toggle('menu-open');
});

// 메뉴 영역 바깥 클릭 시 메뉴 닫기 기능
document.addEventListener('click', function(event) {
  // 클릭된 요소가 메뉴 영역 내부도 아니고, 메뉴 버튼도 아닌 경우
  const isClickInsideMenu = mainMenu.contains(event.target);
  const isClickOnButton = menuButton.contains(event.target);

  if (!isClickInsideMenu && !isClickOnButton) {
    // 메뉴와 버튼에서 활성화 클래스 제거하여 닫기
    mainMenu.classList.remove('menu-open');
    menuButton.classList.remove('active');
  }
});