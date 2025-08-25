document.addEventListener('DOMContentLoaded', function () {
    // --- KHAI BÁO CÁC PHẦN TỬ VÀ KEY ---
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const menuButton = document.getElementById('menu-button');
    const servicesMenuToggle = document.getElementById('services-menu-toggle');
    const pageTitle = document.getElementById('page-title');
    const docTitle = document.querySelector('title');

    const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsedState';
    const SUBMENU_OPEN_KEY = 'servicesSubmenuState';

    // --- HÀM TIỆN ÍCH ---
    const isMobile = () => window.innerWidth < 1024;
    
    // Debounce function để tối ưu resize event
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // --- XỬ LÝ SỰ KIỆN CLICK ---
    
    // 1. Mở/đóng sidebar (logic khác nhau cho mobile và desktop)
    menuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isMobile()) {
            sidebar.classList.toggle('mobile-open');
            sidebarOverlay.classList.toggle('hidden');
            document.body.style.overflow = sidebar.classList.contains('mobile-open') ? 'hidden' : '';
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
        document.body.style.overflow = '';
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

    // 4. Sử dụng event delegation cho các link trong tooltip
    document.addEventListener('click', (e) => {
        if (e.target.matches('.tooltip-link') || e.target.closest('.tooltip-link')) {
            const link = e.target.matches('.tooltip-link') ? e.target : e.target.closest('.tooltip-link');
            updateActiveStateForTooltipLink(link);
        }
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
        
        // Sử dụng debounce để tối ưu resize event
        window.addEventListener('resize', debounce(() => {
            if (document.documentElement.classList.contains('sidebar-is-collapsed')) {
                updateTooltipPosition();
            }
        }, 100));
    }

    function updateTooltipPosition() {
        const servicesMenuToggle = document.getElementById('services-menu-toggle');
        const tooltip = document.querySelector('.submenu-tooltip');
        
        if (!servicesMenuToggle || !tooltip) return;
        
        const rect = servicesMenuToggle.getBoundingClientRect();
        const sidebarWidth = 80;
        
        // Tính toán vị trí
        const left = rect.right + 8;
        const top = rect.top;
        
        // Đảm bảo tooltip không bị tràn ra ngoài màn hình
        const tooltipHeight = tooltip.offsetHeight || 200;
        const windowHeight = window.innerHeight;
        
        let finalTop = top;
        if (top + tooltipHeight > windowHeight) {
            finalTop = windowHeight - tooltipHeight - 20;
        }
        
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(finalTop, 10)}px`;
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
            updateTitle(title);

            // Nếu link active là con của submenu, highlight menu cha
            if (activeLink.closest('#services-submenu')) {
                servicesMenuToggle.classList.add('active');
                if (activeTooltipLink) {
                    activeTooltipLink.classList.add('active');
                }
                // Chỉ mở submenu nếu chưa được lưu trạng thái 'mở'
                if (localStorage.getItem(SUBMENU_OPEN_KEY) !== 'true') {
                    document.documentElement.classList.add('submenu-is-open');
                    localStorage.setItem(SUBMENU_OPEN_KEY, 'true');
                }
            } else {
                document.documentElement.classList.remove('submenu-is-open');
                localStorage.setItem(SUBMENU_OPEN_KEY, 'false');
            }
        } else if (activeTooltipLink) {
            activeTooltipLink.classList.add('active');
            servicesMenuToggle.classList.add('active');
            const title = activeTooltipLink.dataset.title || 'Dashboard';
            updateTitle(title);
        } else {
            updateTitle('Dashboard');
        }
    }
    
    function updateActiveStateForTooltipLink(clickedLink) {
        document.querySelectorAll('.tooltip-link.active, .sub-link.active').forEach(el => el.classList.remove('active'));
        
        clickedLink.classList.add('active');
        servicesMenuToggle.classList.add('active');
        
        const href = clickedLink.getAttribute('href');
        const correspondingSubLink = document.querySelector(`#services-submenu a[href="${href}"]`);
        if (correspondingSubLink) {
            correspondingSubLink.classList.add('active');
        }
        
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
            
            // Xóa class fade-in sau khi hoàn thành animation
            setTimeout(() => {
                pageTitle.classList.remove('title-fade-in');
            }, 150);
        }, 150);
    }

    initializeUI();
});