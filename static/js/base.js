document.addEventListener('DOMContentLoaded', () => {
    // --- KHAI BÁO CÁC PHẦN TỬ VÀ KEY (CACHE DOM ELEMENTS) ---
    const ui = {
        sidebar: document.getElementById('sidebar'),
        sidebarOverlay: document.getElementById('sidebar-overlay'),
        menuButton: document.getElementById('menu-button'),
        servicesMenuToggle: document.getElementById('services-menu-toggle'),
        servicesSubmenu: document.getElementById('services-submenu'),
        sidebarNav: document.getElementById('sidebar-nav'),
        tooltip: document.querySelector('.submenu-tooltip'),
        pageTitle: document.getElementById('page-title'),
        docTitle: document.querySelector('title'),
        root: document.documentElement,
    };

    const KEYS = {
        SIDEBAR_COLLAPSED: 'sidebarCollapsedState',
        SUBMENU_OPEN: 'servicesSubmenuState',
    };

    // --- HÀM TIỆN ÍCH ---

    /** Kiểm tra màn hình mobile */
    const isMobile = () => window.innerWidth < 1024;

    /**
     * Debounce: Trì hoãn việc thực thi một hàm cho đến khi người dùng ngừng thao tác
     * trong một khoảng thời gian nhất định. Rất hữu ích cho các sự kiện như 'resize' hoặc 'scroll'.
     * @param {Function} func Hàm cần thực thi.
     * @param {number} delay Thời gian trì hoãn (ms).
     * @returns {Function} Hàm đã được "debounced".
     */
    const debounce = (func, delay = 250) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    };

    /** Cập nhật tiêu đề trang với hiệu ứng fade */
    const updateTitle = (newTitle) => {
        if (!newTitle || ui.pageTitle.textContent === newTitle) return;

        const transitionDuration = 200; // Phải khớp với CSS
        ui.pageTitle.classList.add('title-fade-out');

        setTimeout(() => {
            ui.pageTitle.textContent = newTitle;
            ui.docTitle.textContent = `${newTitle} - AdminSystem`;
            ui.pageTitle.classList.remove('title-fade-out');
        }, transitionDuration);
    };

    /**
     * Đặt trạng thái active cho một link và các thành phần liên quan.
     * @param {HTMLElement} linkElement Link được chọn là active.
     */
    const setActiveLink = (linkElement) => {
        if (!linkElement) return;

        // Xóa tất cả active cũ
        ui.sidebarNav.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
        if (ui.tooltip) {
            ui.tooltip.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
        }

        // Thêm active cho link được click và menu cha (nếu có)
        linkElement.classList.add('active');
        const parentSubmenu = linkElement.closest('.submenu');
        if (parentSubmenu && ui.servicesMenuToggle) {
            ui.servicesMenuToggle.classList.add('active');

            // Đồng bộ trạng thái active cho link tương ứng trong tooltip
            const href = linkElement.getAttribute('href');
            const correspondingTooltipLink = ui.tooltip?.querySelector(`.tooltip-link[href="${href}"]`);
            correspondingTooltipLink?.classList.add('active');
        } else if (linkElement.classList.contains('tooltip-link') && ui.servicesMenuToggle) {
             ui.servicesMenuToggle.classList.add('active');

             // Đồng bộ trạng thái active cho link tương ứng trong submenu
            const href = linkElement.getAttribute('href');
            const correspondingSubLink = ui.servicesSubmenu?.querySelector(`a[href="${href}"]`);
            correspondingSubLink?.classList.add('active');
        }
        
        updateTitle(linkElement.dataset.title);
    };


    /** Cập nhật vị trí tooltip của submenu */
    const updateTooltipPosition = () => {
        if (!ui.servicesMenuToggle || !ui.tooltip || !ui.root.classList.contains('sidebar-is-collapsed')) return;

        const rect = ui.servicesMenuToggle.getBoundingClientRect();
        const left = rect.right + 8;
        const top = rect.top;

        // Đảm bảo tooltip không bị tràn dưới màn hình
        const tooltipHeight = ui.tooltip.offsetHeight || 200; // Lấy chiều cao thực tế, fallback 200
        const windowHeight = window.innerHeight;
        let finalTop = top;
        if (top + tooltipHeight > windowHeight) {
            finalTop = windowHeight - tooltipHeight - 20;
        }

        ui.tooltip.style.left = `${left}px`;
        ui.tooltip.style.top = `${Math.max(finalTop, 10)}px`;
    };

    // --- KHỞI TẠO GIAO DIỆN BAN ĐẦU ---

    /** Tìm và active link dựa trên URL hiện tại */
    const initializeActiveState = () => {
        const currentPath = window.location.pathname;
        let bestMatch = null;

        // Duyệt qua tất cả các link có href và data-title
        ui.sidebar.querySelectorAll('a[href][data-title]').forEach(link => {
            const linkPath = link.getAttribute('href');
            // Bỏ qua các link điều khiển (vd: #)
            if (linkPath === '#' || linkPath === '') return;
            // Tìm link khớp nhất (dài nhất) với path hiện tại
            if (currentPath.startsWith(linkPath)) {
                if (!bestMatch || linkPath.length > bestMatch.getAttribute('href').length) {
                    bestMatch = link;
                }
            }
        });

        if (bestMatch) {
            setActiveLink(bestMatch);
            // Nếu link active nằm trong submenu, đảm bảo submenu mở
            if (bestMatch.closest('#services-submenu')) {
                ui.root.classList.add('submenu-is-open');
                localStorage.setItem(KEYS.SUBMENU_OPEN, 'true');
            }
        } else {
            // Mặc định là Dashboard
            updateTitle('Dashboard');
        }
    };


    // --- GÁN CÁC SỰ KIỆN ---

    /** Sự kiện click cho các control chính */
    const handleControlClicks = () => {
        // 1. Mở/đóng sidebar
        ui.menuButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isMobile()) {
                ui.sidebar.classList.toggle('mobile-open');
                ui.sidebarOverlay.classList.toggle('hidden');
            } else {
                const isCollapsed = ui.root.classList.toggle('sidebar-is-collapsed');
                localStorage.setItem(KEYS.SIDEBAR_COLLAPSED, isCollapsed);
                // Tự động đóng submenu khi thu gọn sidebar
                if (isCollapsed) {
                    ui.root.classList.remove('submenu-is-open');
                    localStorage.setItem(KEYS.SUBMENU_OPEN, 'false');
                }
            }
        });

        // 2. Đóng sidebar khi click ra ngoài (mobile)
        ui.sidebarOverlay.addEventListener('click', () => {
            ui.sidebar.classList.remove('mobile-open');
            ui.sidebarOverlay.classList.add('hidden');
        });

        // 3. Mở/đóng submenu
        if (ui.servicesMenuToggle) {
            ui.servicesMenuToggle.addEventListener('click', (e) => {
                e.preventDefault();
                if (ui.root.classList.contains('sidebar-is-collapsed')) return;
                const isOpen = ui.root.classList.toggle('submenu-is-open');
                localStorage.setItem(KEYS.SUBMENU_OPEN, isOpen);
            });
        }
    };

    /**
     * Sử dụng Event Delegation cho tất cả các link điều hướng trong sidebar và tooltip.
     * Một listener duy nhất cho hiệu suất tốt hơn.
     */
    const handleNavigationClicks = () => {
        const handleLinkClick = (e) => {
            const link = e.target.closest('a[href]');
            // Chỉ xử lý nếu click vào link có href và không phải link điều khiển submenu
            if (link && link.getAttribute('href') !== '#' && link.dataset.title) {
                setActiveLink(link);
            }
        };
        
        ui.sidebarNav.addEventListener('click', handleLinkClick);
        if (ui.tooltip) {
            ui.tooltip.addEventListener('click', handleLinkClick);
        }
    };

    /** Gán các sự kiện cho tooltip (hover, resize) */
    const handleTooltipEvents = () => {
        const submenuContainer = document.querySelector('.submenu-container');
        if (submenuContainer) {
            submenuContainer.addEventListener('mouseenter', updateTooltipPosition);
            window.addEventListener('resize', debounce(updateTooltipPosition, 150));
        }
    };
    
    // --- CHẠY KHỞI TẠO ---
    const init = () => {
        handleControlClicks();
        handleNavigationClicks();
        handleTooltipEvents();
        initializeActiveState();
    };

    init();
});