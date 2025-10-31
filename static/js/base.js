document.addEventListener('DOMContentLoaded', () => {
    const html = document.documentElement;
    const body = document.body;
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const menuBtn = document.getElementById('menu-button');
    const pageTitle = document.getElementById('page-title');
    const docTitle = document.querySelector('title');
    const userMenuBtn = document.getElementById('user-menu-button');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    const SIDEBAR_KEY = 'sidebarCollapsedState';

    const qs = (sel, root = document) => root.querySelector(sel);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const isMobile = () => window.innerWidth < 1024;
    const isCollapsed = () => html.classList.contains('sidebar-is-collapsed');
    const setLocal = (k, v) => localStorage.setItem(k, String(v));
    const getLocal = k => localStorage.getItem(k) === 'true';

    // Build menu model từ DOM (tự động theo .submenu-container)
    const MENUS = qsa('.submenu-container').map(container => {
        const toggle = qs('.sidebar-link', container);
        const submenu = qs('.submenu', container);
        const tooltip = qs('.submenu-tooltip', container);
        const id = container.dataset.menu || (toggle?.id || '').replace('-menu-toggle', '') || crypto.randomUUID();
        return {
            key: id,
            container, toggle, submenu, tooltip,
            stateKey: `${id}SubmenuState`,
            openClass: `submenu-${id}-open`
        };
    }).filter(m => m.toggle && m.submenu);

    function setMenuOpen(menu, open) {
        html.classList.toggle(menu.openClass, open);
        menu.toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
        setLocal(menu.stateKey, open);
    }
    function closeAllMenus() { MENUS.forEach(m => setMenuOpen(m, false)); }

    // Toggle sidebar (desktop) / mở overlay (mobile)
    menuBtn?.addEventListener('click', e => {
        e.stopPropagation();
        if (isMobile()) {
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('hidden');
            body.style.overflow = sidebar.classList.contains('mobile-open') ? 'hidden' : '';
            return;
        }
        const collapsed = html.classList.toggle('sidebar-is-collapsed');
        setLocal(SIDEBAR_KEY, collapsed);
        if (collapsed) closeAllMenus();
    });

    // Đóng sidebar mobile
    overlay?.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        overlay.classList.add('hidden');
        body.style.overflow = '';
    });

    // Toggle từng submenu
    MENUS.forEach(menu => {
        menu.toggle.addEventListener('click', e => {
            e.preventDefault();
            if (isCollapsed()) return;
            setMenuOpen(menu, !html.classList.contains(menu.openClass));
        });
        // Khôi phục trạng thái mở
        setMenuOpen(menu, getLocal(menu.stateKey));
    });

    // Tooltip định vị khi sidebar thu gọn
    let hoveredMenu = null, rafId = 0;
    const schedule = (fn) => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(fn); };

    function positionTooltip(menu) {
        if (!menu?.tooltip || !menu?.toggle) return;
        const rect = menu.toggle.getBoundingClientRect();
        const tip = menu.tooltip;
        const tipH = tip.getBoundingClientRect().height;
        const winH = window.innerHeight;
        let top = rect.top;
        if (top + tipH > winH) top = Math.max(10, winH - tipH - 20);
        tip.style.left = `${rect.right + 8}px`;
        tip.style.top = `${top}px`;
    }

    MENUS.forEach(menu => {
        menu.container.addEventListener('mouseenter', () => {
            if (!isCollapsed()) return;
            hoveredMenu = menu;
            schedule(() => positionTooltip(menu));
        });
        menu.container.addEventListener('mouseleave', () => {
            if (hoveredMenu === menu) hoveredMenu = null;
        });
    });
    window.addEventListener('resize', () => {
        if (isCollapsed() && hoveredMenu) schedule(() => positionTooltip(hoveredMenu));
    }, { passive: true });

    // Active state + tiêu đề
    function updateTitle(newTitle) {
        if (!newTitle) return;
        if (pageTitle.textContent === newTitle) return;
        pageTitle.classList.add('title-fade-out');
        setTimeout(() => {
            pageTitle.textContent = newTitle;
            docTitle.textContent = `${newTitle} - AdminSystem`;
            pageTitle.classList.remove('title-fade-out');
            pageTitle.classList.add('title-fade-in');
            setTimeout(() => pageTitle.classList.remove('title-fade-in'), 120);
        }, 120);
    }
    function clearActive() { qsa('#sidebar-nav .active, .submenu-tooltip .active').forEach(el => el.classList.remove('active')); }
    function markActiveByHref(href) {
        if (!href || href === '#') return;
        const normal = qsa(`#sidebar-nav a[href="${href}"]:not(.tooltip-link)`);
        const inTooltip = qsa(`.submenu-tooltip a[href="${href}"]`);
        normal.forEach(a => a.classList.add('active'));
        inTooltip.forEach(a => a.classList.add('active'));
        const any = normal[0] || inTooltip[0];
        if (any) {
            const container = any.closest('.submenu-container');
            const menu = MENUS.find(m => m.container === container);
            if (menu) {
                setMenuOpen(menu, true);
                menu.toggle.classList.add('active');
            }
        }
    }
    function initActiveFromLocation() {
        const path = window.location.pathname;
        const links = qsa('#sidebar-nav a[href]:not(.tooltip-link)')
            .map(a => a.getAttribute('href'))
            .filter(h => h && h !== '#');
        const best = links.reduce((acc, cur) => path.startsWith(cur) && cur.length > (acc?.length || 0) ? cur : acc, null);
        clearActive();
        if (best) {
            markActiveByHref(best);
            updateTitle(qs(`#sidebar-nav a[href="${best}"]`)?.dataset?.title || 'Dashboard');
        } else {
            updateTitle('Dashboard');
        }
    }
    // Đồng bộ click trong tooltip
    document.addEventListener('click', e => {
        const link = e.target.closest('.tooltip-link');
        if (!link) return;
        clearActive(); markActiveByHref(link.getAttribute('href'));
        updateTitle(link.dataset.title || 'Dashboard');
    });

    // User dropdown
    function toggleUserMenu(show) {
        if (!userMenuDropdown) return;
        userMenuDropdown.classList.toggle('hidden', !show);
        requestAnimationFrame(() => {
            userMenuDropdown.style.opacity = show ? '1' : '0';
            userMenuDropdown.style.transform = show ? 'scale(1)' : 'scale(0.95)';
        });
        userMenuBtn?.setAttribute('aria-expanded', show ? 'true' : 'false');
    }
    userMenuBtn?.addEventListener('click', e => {
        e.stopPropagation();
        toggleUserMenu(userMenuDropdown.classList.contains('hidden'));
    });
    document.addEventListener('click', e => {
        if (!userMenuDropdown || userMenuDropdown.classList.contains('hidden')) return;
        if (!userMenuBtn.contains(e.target) && !userMenuDropdown.contains(e.target)) toggleUserMenu(false);
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') toggleUserMenu(false);
    });

    // Khởi tạo
    initActiveFromLocation();
});
