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

    const qs  = (sel, root = document) => root.querySelector(sel);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const isMobile    = () => window.matchMedia('(max-width: 1023px)').matches;
    const isCollapsed = () => html.classList.contains('sidebar-is-collapsed');
    const setLocal = (k, v) => localStorage.setItem(k, String(v));
    const getLocal = (k)   => localStorage.getItem(k) === 'true';

    // State chống double-toggle khi đang animate
    let animating = false;
    const startAnim = (mode) => { animating = true; html.classList.add(mode); };
    const endAnim = () => { animating = false; html.classList.remove('sidebar-expanding','sidebar-collapsing'); };

    // Build menu model
    const MENUS = qsa('.submenu-container').map(container => {
        const toggle  = qs('.sidebar-link', container);
        const submenu = qs('.submenu', container);
        const tooltip = qs('.submenu-tooltip', container);
        const id = container.dataset.menu || (toggle?.id || '').replace('-menu-toggle','');
        return { key:id, container, toggle, submenu, tooltip, stateKey:`${id}SubmenuState`, openClass:`submenu-${id}-open` };
    }).filter(m => m.toggle && m.submenu);

    const setMenuOpen = (menu, open) => {
        html.classList.toggle(menu.openClass, open);
        menu.toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
        setLocal(menu.stateKey, open);
    };
    const closeAllMenus = () => MENUS.forEach(m => setMenuOpen(m, false));

    // Toggle sidebar
    menuBtn?.addEventListener('click', e => {
        e.stopPropagation();
        if (animating) return;

        if (isMobile()) {
            const open = !sidebar.classList.contains('mobile-open');
            sidebar.classList.toggle('mobile-open', open);
            overlay.classList.toggle('hidden', !open);
            body.classList.toggle('no-scroll', open);
            return;
        }

        // Desktop
        const wasCollapsed = isCollapsed();
        const onEnd = (ev) => {
            if (ev.target !== sidebar || ev.propertyName !== 'width') return;
            sidebar.removeEventListener('transitionend', onEnd);
            endAnim();
        };

        if (wasCollapsed) {
            startAnim('sidebar-expanding');
            html.classList.remove('sidebar-is-collapsed');
            setLocal(SIDEBAR_KEY, false);
            sidebar.addEventListener('transitionend', onEnd);
        } else {
            startAnim('sidebar-collapsing');
            closeAllMenus();
            html.classList.add('sidebar-is-collapsed');
            setLocal(SIDEBAR_KEY, true);
            sidebar.addEventListener('transitionend', onEnd);
        }
    });

    // Đóng sidebar mobile
    overlay?.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        overlay.classList.add('hidden');
        body.classList.remove('no-scroll');
    });

    // Submenu
    MENUS.forEach(menu => {
        menu.toggle.addEventListener('click', e => {
            e.preventDefault();
            if (isCollapsed() || animating) return;
            setMenuOpen(menu, !html.classList.contains(menu.openClass));
        });
        setMenuOpen(menu, getLocal(menu.stateKey));
    });

    // Tooltip định vị khi sidebar thu gọn
    let hoveredMenu = null, rafId = 0;
    const schedule = (fn) => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(fn); };
    function positionTooltip(menu) {
        if (!menu?.tooltip || !menu?.toggle) return;
        const rect = menu.toggle.getBoundingClientRect();
        const tip  = menu.tooltip;
        const tipH = tip.getBoundingClientRect().height;
        const winH = window.innerHeight;
        let top = Math.min(Math.max(10, rect.top), Math.max(10, winH - tipH - 20));
        tip.style.left = `${rect.right + 8}px`;
        tip.style.top  = `${top}px`;
    }
    MENUS.forEach(menu => {
        menu.container.addEventListener('mouseenter', () => { if (isCollapsed()) { hoveredMenu = menu; schedule(() => positionTooltip(menu)); } }, {passive:true});
        menu.container.addEventListener('mouseleave', () => { if (hoveredMenu === menu) hoveredMenu = null; }, {passive:true});
    });
    window.addEventListener('resize', () => { if (isCollapsed() && hoveredMenu) schedule(() => positionTooltip(hoveredMenu)); }, { passive: true });

    // Active + tiêu đề
    function updateTitle(newTitle) {
        if (!newTitle || pageTitle.textContent === newTitle) return;
        pageTitle.classList.add('title-fade-out');
        setTimeout(() => {
            pageTitle.textContent = newTitle;
            docTitle.textContent = `${newTitle} - AdminSystem`;
            pageTitle.classList.remove('title-fade-out');
            pageTitle.classList.add('title-fade-in');
            setTimeout(() => pageTitle.classList.remove('title-fade-in'), 120);
        }, 120);
    }
    const clearActive = () => qsa('#sidebar-nav .active, .submenu-tooltip .active').forEach(el => el.classList.remove('active'));
    function markActiveByHref(href) {
        if (!href || href === '#') return;
        const normal = qsa(`#sidebar-nav a[href="${href}"]:not(.tooltip-link)`);
        const inTip  = qsa(`.submenu-tooltip a[href="${href}"]`);
        normal.forEach(a => a.classList.add('active'));
        inTip.forEach(a => a.classList.add('active'));
        const any = normal[0] || inTip[0];
        if (any) {
            const container = any.closest('.submenu-container');
            const menu = MENUS.find(m => m.container === container);
            if (menu) { setMenuOpen(menu, true); menu.toggle.classList.add('active'); }
        }
    }
    function initActiveFromLocation() {
        const path = window.location.pathname;
        const links = qsa('#sidebar-nav a[href]:not(.tooltip-link)').map(a => a.getAttribute('href')).filter(h => h && h !== '#');
        const best = links.reduce((acc, cur) => path.startsWith(cur) && cur.length > (acc?.length || 0) ? cur : acc, null);
        clearActive();
        if (best) {
            markActiveByHref(best);
            updateTitle(qs(`#sidebar-nav a[href="${best}"]`)?.dataset?.title || 'Dashboard');
        } else {
            updateTitle('Dashboard');
        }
    }
    document.addEventListener('click', e => {
        const link = e.target.closest('.tooltip-link');
        if (!link) return;
        clearActive();
        markActiveByHref(link.getAttribute('href'));
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
    userMenuBtn?.addEventListener('click', e => { e.stopPropagation(); toggleUserMenu(userMenuDropdown.classList.contains('hidden')); });
    document.addEventListener('click', e => {
        if (!userMenuDropdown || userMenuDropdown.classList.contains('hidden')) return;
        if (!userMenuBtn.contains(e.target) && !userMenuDropdown.contains(e.target)) toggleUserMenu(false);
    }, {passive:true});
    document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleUserMenu(false); });

    // Khởi tạo
    initActiveFromLocation();

    // Đồng bộ khi đổi breakpoint
    const mq = window.matchMedia('(max-width: 1023px)');
    const onBpChange = (e) => {
        if (e.matches) {
            html.classList.remove('sidebar-is-collapsed');
            sidebar.classList.remove('mobile-open');
            overlay?.classList.add('hidden');
            body.classList.remove('no-scroll');
        } else {
            sidebar.classList.remove('mobile-open');
            overlay?.classList.add('hidden');
            body.classList.remove('no-scroll');
            html.classList.toggle('sidebar-is-collapsed', getLocal(SIDEBAR_KEY));
        }
    };
    (mq.addEventListener ? mq.addEventListener('change', onBpChange) : mq.addListener(onBpChange));
    onBpChange(mq);
});
