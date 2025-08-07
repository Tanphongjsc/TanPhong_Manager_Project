document.addEventListener('DOMContentLoaded', function () {
    // --- KHAI BÁO CÁC PHẦN TỬ VÀ KEY ---
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const menuButton = document.getElementById('menu-button');
    const servicesMenuToggle = document.getElementById('services-menu-toggle');
    const servicesSubmenu = document.getElementById('services-submenu');
    const pageTitle = document.getElementById('page-title');
    const docTitle = document.querySelector('title');

    const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsedState';
    const SUBMENU_OPEN_KEY = 'servicesSubmenuState';

    // --- HÀM TIỆN ÍCH ---
    const isMobile = () => window.innerWidth < 1024;

    // --- XỬ LÝ SỰ KIỆN CLICK ---

    // 1. Mở/đóng sidebar (logic khác nhau cho mobile và desktop)
    menuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isMobile()) {
            sidebar.classList.toggle('mobile-open');
            sidebarOverlay.classList.toggle('hidden');
        } else {
            const isCollapsed = document.documentElement.classList.toggle('sidebar-is-collapsed');
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed);
            // Tự động đóng submenu khi thu gọn sidebar
            if (isCollapsed) {
                document.documentElement.classList.remove('submenu-is-open');
                localStorage.setItem(SUBMENU_OPEN_KEY, 'false');
            }
        }
    });

    // 2. Đóng sidebar khi click ra ngoài (chỉ trên mobile)
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        sidebarOverlay.classList.add('hidden');
    });

    // 3. Mở/đóng submenu
    if (servicesMenuToggle) {
        servicesMenuToggle.addEventListener('click', (e) => {
            e.preventDefault();
            // Không cho mở submenu khi sidebar đã thu gọn
            if (document.documentElement.classList.contains('sidebar-is-collapsed')) return;

            const isOpen = document.documentElement.classList.toggle('submenu-is-open');
            localStorage.setItem(SUBMENU_OPEN_KEY, isOpen);
        });
    }

    // 4. Xử lý click vào các link trong tooltip (khi sidebar thu gọn)
    document.querySelectorAll('.tooltip-link').forEach(link => {
        link.addEventListener('click', (e) => {
            // Cho phép navigation bình thường, chỉ cập nhật UI
            updateActiveStateForTooltipLink(e.target.closest('a'));
        });
    });

    // 5. Xử lý vị trí tooltip khi hover
    const submenuContainer = document.querySelector('.submenu-container');
    const tooltip = document.querySelector('.submenu-tooltip');
    
    if (submenuContainer && tooltip) {
        submenuContainer.addEventListener('mouseenter', () => {
            if (document.documentElement.classList.contains('sidebar-is-collapsed')) {
                updateTooltipPosition();
            }
        });
        
        // Cập nhật vị trí khi resize window
        window.addEventListener('resize', () => {
            if (document.documentElement.classList.contains('sidebar-is-collapsed')) {
                updateTooltipPosition();
            }
        });
    }

    function updateTooltipPosition() {
        const servicesMenuToggle = document.getElementById('services-menu-toggle');
        const tooltip = document.querySelector('.submenu-tooltip');
        
        if (!servicesMenuToggle || !tooltip) return;
        
        const rect = servicesMenuToggle.getBoundingClientRect();
        const sidebarWidth = 80; // 5rem = 80px
        
        // Tính toán vị trí
        const left = rect.right + 8; // 8px khoảng cách từ sidebar
        const top = rect.top;
        
        // Đảm bảo tooltip không bị tràn ra ngoài màn hình
        const tooltipHeight = 200; // Ước tính chiều cao tooltip
        const windowHeight = window.innerHeight;
        
        let finalTop = top;
        if (top + tooltipHeight > windowHeight) {
            finalTop = windowHeight - tooltipHeight - 20; // 20px margin từ bottom
        }
        
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(finalTop, 10)}px`; // Tối thiểu 10px từ top
    }

    // --- HÀM XỬ LÝ TRẠNG THÁI ACTIVE VÀ CẬP NHẬT TIÊU ĐỀ ---
    function initializeUI() {
        const currentPath = window.location.pathname;
        let activeLink = null;
        let activeTooltipLink = null;

        // Tìm link khớp với URL hiện tại trong sidebar thông thường
        document.querySelectorAll('#sidebar-nav a[href]:not(.tooltip-link)').forEach(link => {
            const linkPath = link.getAttribute('href');
            if (linkPath !== '#' && currentPath.startsWith(linkPath)) {
                // Ưu tiên khớp chính xác hơn
                if (!activeLink || linkPath.length > activeLink.getAttribute('href').length) {
                    activeLink = link;
                }
            }
        });

        // Tìm link khớp với URL hiện tại trong tooltip
        document.querySelectorAll('.tooltip-link[href]').forEach(link => {
            const linkPath = link.getAttribute('href');
            if (linkPath !== '#' && currentPath.startsWith(linkPath)) {
                if (!activeTooltipLink || linkPath.length > activeTooltipLink.getAttribute('href').length) {
                    activeTooltipLink = link;
                }
            }
        });

        // Xóa trạng thái active cũ
        document.querySelectorAll('#sidebar-nav .active, .tooltip-link.active').forEach(el => el.classList.remove('active'));

        if (activeLink) {
            activeLink.classList.add('active');
            const title = activeLink.dataset.title || 'Dashboard';

            // Cập nhật tiêu đề trang và tiêu đề tab
            updateTitle(title);

            // Nếu link active là con của submenu, highlight menu cha và đảm bảo submenu mở
            if (activeLink.closest('#services-submenu')) {
                servicesMenuToggle.classList.add('active');
                // Đồng bộ active state cho tooltip link tương ứng
                if (activeTooltipLink) {
                    activeTooltipLink.classList.add('active');
                }
                // Chỉ mở submenu nếu chưa được lưu trạng thái 'mở'
                if (localStorage.getItem(SUBMENU_OPEN_KEY) !== 'true') {
                    document.documentElement.classList.add('submenu-is-open');
                    localStorage.setItem(SUBMENU_OPEN_KEY, 'true');
                }
            } else {
                 // Nếu ở trang không thuộc submenu, đảm bảo submenu đóng lại
                document.documentElement.classList.remove('submenu-is-open');
                localStorage.setItem(SUBMENU_OPEN_KEY, 'false');
            }
        } else if (activeTooltipLink) {
            // Nếu chỉ có tooltip link active (trường hợp sidebar thu gọn)
            activeTooltipLink.classList.add('active');
            servicesMenuToggle.classList.add('active');
            const title = activeTooltipLink.dataset.title || 'Dashboard';
            updateTitle(title);
        } else {
            // Nếu không có link active, mặc định là Dashboard
            updateTitle('Dashboard');
        }
    }
    
    function updateActiveStateForTooltipLink(clickedLink) {
        // Xóa active state cũ
        document.querySelectorAll('.tooltip-link.active, .sub-link.active').forEach(el => el.classList.remove('active'));
        
        // Set active cho link được click
        clickedLink.classList.add('active');
        servicesMenuToggle.classList.add('active');
        
        // Tìm và active link tương ứng trong submenu thông thường
        const href = clickedLink.getAttribute('href');
        const correspondingSubLink = document.querySelector(`#services-submenu a[href="${href}"]`);
        if (correspondingSubLink) {
            correspondingSubLink.classList.add('active');
        }
        
        // Cập nhật title
        const title = clickedLink.dataset.title || 'Dashboard';
        updateTitle(title);
    }
    
    function updateTitle(newTitle) {
        if (pageTitle.textContent === newTitle) return;

        pageTitle.classList.add('title-fade-out');
        
        setTimeout(() => {
            pageTitle.textContent = newTitle;
            docTitle.textContent = `${newTitle} - AdminSystem`;
            pageTitle.classList.remove('title-fade-out');
            pageTitle.classList.add('title-fade-in');
        }, 150); // Phải khớp với thời gian transition trong CSS
    }

    initializeUI();
});