class DetailManager {
    constructor() {
        this.empId = document.getElementById('config-emp-id')?.value;
        this.redirectUrl = document.getElementById('config-redirect-url')?.value;

        this.apiUrls = {
            detail: `/hrm/to-chuc-nhan-su/api/v1/nhan-vien/${this.empId}/`,
            history: `/hrm/to-chuc-nhan-su/api/v1/lich-su-cong-tac/?nhanvien_id=${this.empId}`,
            resign: `/hrm/to-chuc-nhan-su/api/v1/nhan-vien/${this.empId}/`
        };

        this.els = {
            // SỬA: Target vào nav bên trong container mới
            tabNav: document.querySelector('#detail-tab-container nav'),
            panes: document.querySelectorAll('.tab-pane'),
            btnEdit: document.getElementById('btn-edit-profile'),
            btnDelete: document.getElementById('btn-delete'),
            btnResign: document.getElementById('btn-resign'),
            btnRefreshHistory: document.getElementById('btn-refresh-history'),
            historyBody: document.getElementById('history-table-body'),

            verticalNav: document.getElementById('vertical-nav'),
            verticalPanes: document.querySelectorAll('.vertical-tab-pane')
        };

        // Class CSS được định nghĩa trong component tab_nav.html
        this.classes = {
            active: ['border-blue-600', 'text-blue-600'],
            inactive: ['border-transparent', 'text-slate-500', 'hover:text-slate-700', 'hover:border-slate-300']
        };

        this.advancedTabInitialized = false; // Flag check đã init chưa

        this.loadedTabs = new Map([
            ['#tab-basic', true],
            ['#tab-history', false],
            ['#tab-advanced', false]
        ]);

        this.tabLoaders = {
            '#tab-history': () => this.loadHistory(),
            '#tab-advanced': () => this.initVerticalTabs()
        };

        this.eventManager = AppUtils.EventManager.create();
        this.currentController = null;
        this.employeeManagerRetry = 0;
        window.DetailManager = this;
    }

    init() {
        if (!this.empId) {
            console.error('⛔ Employee ID not found');
            return;
        }
        this.initTabs();
        this.initActions();
        this.ensureEmployeeManager();
        console.log('✅ DetailManager initialized:', this.empId);
    }


    // ---------------- VERTICAL TABS LOGIC (MỚI) ----------------
    initVerticalTabs() {
        if (this.advancedTabInitialized) return;

        // Gọi Class Manager mới
        // 'advanced-info-sidebar' là ID ta đã truyền ở bước 4
        new VerticalTabManager('advanced-info-sidebar');
        
        this.advancedTabInitialized = true;
    }

    // ---------------- TABS (UPDATED) ----------------
    initTabs() {
        if (this.els.tabNav) {
            // Tab component sinh ra thẻ <a>, không có class .detail-tab-link
            const links = this.els.tabNav.querySelectorAll('a');
            
            links.forEach(link => {
                this.eventManager.add(link, 'click', (e) => {
                    e.preventDefault();
                    this.activateTab(link);
                });
            });

            // Active tab đầu tiên hoặc theo hash
            this.activateHashIfAny(links);
        }
    }

    activateHashIfAny(links) {
        const hash = window.location.hash;
        let targetLink = null;
        
        if (hash) {
            // Tìm link có href khớp với hash
            targetLink = Array.from(links).find(a => a.getAttribute('href') === hash);
        }

        // Nếu không có hash hoặc hash sai, active tab đầu tiên
        if (!targetLink && links.length > 0) {
            targetLink = links[0];
        }

        if (targetLink) {
            requestAnimationFrame(() => this.activateTab(targetLink));
        }
    }

    activateTab(tabEl) {
        // Lấy target từ href (ví dụ: #tab-basic)
        const targetId = tabEl.getAttribute('href');
        if (!targetId) return;

        // 1. Reset style tất cả các tabs về trạng thái inactive
        const allLinks = this.els.tabNav.querySelectorAll('a');
        allLinks.forEach(link => {
            link.classList.remove(...this.classes.active);
            link.classList.add(...this.classes.inactive);
        });

        // 2. Active tab hiện tại
        tabEl.classList.remove(...this.classes.inactive);
        tabEl.classList.add(...this.classes.active);

        // 3. Hiển thị nội dung pane
        this.els.panes.forEach(p => p.classList.add('hidden'));
        const pane = document.querySelector(targetId);
        if (pane) {
            pane.classList.remove('hidden');
            if (!this.loadedTabs.get(targetId)) {
                this.loadTabContent(targetId);
            }
        }
        
        // Cập nhật URL hash không reload
        history.replaceState(null, '', targetId);
    }

    loadTabContent(tabId) {
        const loader = this.tabLoaders[tabId];
        if (loader) loader();
        this.loadedTabs.set(tabId, true);
    }

    // ---------------- ACTION BUTTONS (GIỮ NGUYÊN) ----------------
    initActions() {
        if (this.els.btnEdit) {
            this.eventManager.add(this.els.btnEdit, 'click', () => {
                if (window.EmployeeManager) {
                    window.EmployeeManager.openSidebar('edit', this.empId);
                } else {
                    AppUtils.Notify.error('Không thể mở form chỉnh sửa.');
                }
            });
        }
        if (this.els.btnDelete) {
            this.eventManager.add(this.els.btnDelete, 'click', () => this.handleDelete());
        }
        if (this.els.btnResign) {
            this.eventManager.add(this.els.btnResign, 'click', () => this.handleResign());
        }
        if (this.els.btnRefreshHistory) {
            this.eventManager.add(this.els.btnRefreshHistory, 'click', () => this.refreshHistory());
        }
    }

    ensureEmployeeManager() {
        if (window.EmployeeManager) {
            window.EmployeeManager.config.onRefreshTable = () => window.location.reload();
            return;
        }
        if (this.employeeManagerRetry > 40) {
            console.warn('⚠️ EmployeeManager init timeout');
            return;
        }
        this.employeeManagerRetry++;
        setTimeout(() => this.ensureEmployeeManager(), 150);
    }

    // ---------------- HISTORY LOADING (GIỮ NGUYÊN) ----------------
    refreshHistory() {
        this.loadedTabs.set('#tab-history', false);
        const icon = this.els.btnRefreshHistory?.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
        this.loadHistory().finally(() => {
            setTimeout(() => icon && icon.classList.remove('fa-spin'), 500);
        });
    }

    async loadHistory() {
        if (!this.els.historyBody) return;

        this.abortCurrent();
        this.currentController = new AbortController();
        this.renderHistoryLoading();

        try {
            const res = await AppUtils.API.get(
                this.apiUrls.history,
                {},
                { signal: this.currentController.signal }
            );
            const data = res.data || res;
            if (!data || data.length === 0) {
                this.renderHistoryEmpty();
                return;
            }
            this.renderHistoryData(data);
            this.loadedTabs.set('#tab-history', true);
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('⛔ History load error:', err);
            this.renderHistoryError();
        } finally {
            this.currentController = null;
        }
    }

    abortCurrent() {
        if (this.currentController) {
            this.currentController.abort();
            this.currentController = null;
        }
    }

    renderHistoryLoading() {
        this.els.historyBody.innerHTML = `
            <tr>
                <td colspan="4" class="py-10 text-center">
                    <div class="flex flex-col items-center">
                        <i class="fas fa-circle-notch fa-spin text-2xl text-blue-500 mb-3"></i>
                        <span class="text-sm text-slate-500">Đang tải dữ liệu...</span>
                    </div>
                </td>
            </tr>`;
    }

    renderHistoryEmpty() {
        AppUtils.UI.renderEmptyState(this.els.historyBody, {
            message: 'Chưa có lịch sử công tác',
            colspan: 4,
            icon: 'default'
        });
    }

    renderHistoryError() {
        this.els.historyBody.innerHTML = `
            <tr>
                <td colspan="4" class="py-10 text-center">
                    <div class="flex flex-col items-center">
                        <div class="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
                            <i class="fas fa-exclamation-triangle text-xl text-red-500"></i>
                        </div>
                        <span class="text-sm text-red-600">Không thể tải dữ liệu</span>
                        <button type="button" class="mt-2 text-sm text-blue-600 hover:text-blue-700"
                                onclick="window.DetailManager.refreshHistory()">Thử lại</button>
                    </div>
                </td>
            </tr>`;
    }

    renderHistoryData(data) {
        const frag = document.createDocumentFragment();
        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors';

            const dateStr = AppUtils.DateUtils.format(item.created_at || item.ngaybatdau, 'dd/MM/yyyy HH:mm') || '--';
            const deptName = item.phongban?.tenphongban || item.noicongtac || '--';
            const positionName = item.chucvu?.tenvitricongviec || '--';
            const isCurrent = item.trangthai === 'active';

            const badge = isCurrent
                ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                     <i class="fas fa-check-circle mr-1 text-[10px]"></i>Hiện tại
                   </span>`
                : `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                     <i class="fas fa-history mr-1 text-[10px]"></i>Lịch sử
                   </span>`;

            tr.innerHTML = `
                <td class="px-4 py-3.5 whitespace-nowrap text-sm text-slate-600">${dateStr}</td>
                <td class="px-4 py-3.5 text-sm font-medium text-slate-900">${deptName}</td>
                <td class="px-4 py-3.5 text-sm text-slate-600">${positionName}</td>
                <td class="px-4 py-3.5 whitespace-nowrap">${badge}</td>
            `;
            frag.appendChild(tr);
        });
        this.els.historyBody.innerHTML = '';
        this.els.historyBody.appendChild(frag);
    }

    // ---------------- DELETE / RESIGN (GIỮ NGUYÊN) ----------------
    handleDelete() {
        AppUtils.Modal.showConfirm({
            title: 'Xóa nhân viên?',
            message: 'Hành động này <strong class="text-red-600">không thể hoàn tác</strong>. Toàn bộ dữ liệu liên quan sẽ bị xóa.',
            type: 'danger',
            confirmText: 'Xóa',
            cancelText: 'Hủy',
            onConfirm: async () => {
                try {
                    await AppUtils.API.delete(this.apiUrls.detail);
                    AppUtils.Notify.success('Đã xóa nhân viên');
                    setTimeout(() => window.location.href = this.redirectUrl, 500);
                } catch (e) {
                    console.error('⛔ Delete error:', e);
                    AppUtils.Notify.error(e.message || 'Lỗi khi xóa');
                }
            }
        });
    }

    handleResign() {
        AppUtils.Modal.showConfirm({
            title: 'Xác nhận nghỉ việc?',
            message: 'Trạng thái sẽ chuyển sang <strong class="text-orange-600">"Đã nghỉ việc"</strong>.',
            type: 'warning',
            confirmText: 'Xác nhận',
            cancelText: 'Hủy',
            onConfirm: async () => {
                try {
                    await AppUtils.API.patch(this.apiUrls.resign, { trangthainv: 'Đã nghỉ việc' });
                    AppUtils.Notify.success('Cập nhật trạng thái thành công');
                    setTimeout(() => window.location.reload(), 800);
                } catch (e) {
                    console.error('⛔ Resign error:', e);
                    AppUtils.Notify.error(e.message || 'Lỗi cập nhật');
                }
            }
        });
    }

    destroy() {
        this.abortCurrent();
        this.eventManager.removeAll();
        this.loadedTabs.clear();
        console.log('✅ DetailManager destroyed');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DetailManager().init();
});