/**
 * LichNghiFormController
 * Extends BaseFormManager.
 * Orchestrates the entire create/update page for LichNghi.
 *
 * Responsibilities:
 *   - Manage master/days/deletedIds/dirty state
 *   - Initialize YearPicker, Calendar, Sidebar
 *   - Handle year change with confirmation
 *   - Resolve day conflicts
 *   - Build payload and submit API
 *   - Redirect after success
 *   - Warn on unsaved changes
 */
class LichNghiFormController extends BaseFormManager {
    constructor() {
        super({
            formId: 'lich-nghi-form',
            submitBtnId: 'btn-save',
            idParamRegex: /\/(\d+)\/(update|edit)\//,
            autoCode: {
                sourceField: 'tenlichnghi',
                targetField: 'malichnghi'
            },
            apiUrls: {
                create: '',       // set from page meta
                update: (id) => '',
                detail: (id) => '',
            },
            buildPayload: () => this._buildPayload(),
            validateLogic: (payload) => this._validatePayload(payload),
            fillFormData: (data) => this._fillFormData(data),
            onSuccess: (data) => this._onSuccess(data),
        });

        // ── State ──
        this._state = {
            master: { id: null, MaLichNghi: '', TenLichNghi: '', Nam: null, TrangThai: 'active' },
            days: new Map(),       // key: 'YYYY-MM-DD', value: day object
            originalDays: new Map(),
            deletedIds: new Set(),
            dirty: false,
            expectedUpdatedAt: null,
        };

        this._yearPicker = null;
        this._calendar = null;
        this._sidebar = null;

        // Read meta from page
        const meta = document.getElementById('page-meta');
        this._apiCreate = meta?.dataset.apiCreate || '';
        this._apiUpdateBase = meta?.dataset.apiUpdateBase || '';
        this._apiDetailBase = meta?.dataset.apiDetailBase || '';
        this._apiTemplates = meta?.dataset.apiTemplates || '';
        this._listUrl = meta?.dataset.listUrl || '/';
        this._isUpdate = meta?.dataset.isUpdate === 'true';
        this._itemId = meta?.dataset.itemId || null;

        // Update apiUrls with actual values
        this.config.apiUrls.create = this._apiCreate;
        this.config.apiUrls.update = (id) => `${this._apiUpdateBase}${id}/update/`;
        this.config.apiUrls.detail = (id) => `${this._apiDetailBase}${id}/detail/`;
    }

    // ── Init ─────────────────────────────────────────────────────

    onAfterInit() {
        this._initYearPicker();
        this._initCalendar();
        this._initSidebar();
        this._bindActionButtons();
        this._bindUnsavedWarning();
        this._bindDirtyTracking();

        // Disable mã trong update mode (BaseFormManager._setupAutoCode đã handle createMode)
        if (this._isUpdate) {
            const maInput = document.querySelector('[name="malichnghi"]');
            if (maInput) {
                maInput.readOnly = true;
                maInput.classList.add('bg-slate-50', 'cursor-not-allowed');
            }
        }
    }

    _todayISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    _minimumDateForSelectedYear() {
        const year = this._yearPicker?.getValue() || new Date().getFullYear();
        const firstDay = `${year}-01-01`;
        return firstDay > this._todayISO() ? firstDay : this._todayISO();
    }

    // ── Year Picker ───────────────────────────────────────────────

    _initYearPicker() {
        const initialYear = parseInt(document.getElementById('nam-value')?.value || new Date().getFullYear(), 10);

        this._yearPicker = new CustomYearPicker({
            trigger: 'year-picker-trigger',
            popover: 'year-picker-popover',
            display: 'year-display',
            hiddenInput: 'nam-value',
            grid: 'year-grid',
            prevBtn: 'year-prev-decade',
            nextBtn: 'year-next-decade',
            decadeLabel: 'year-decade-label',
            initialYear,
            minYear: new Date().getFullYear() - 5,
            maxYear: new Date().getFullYear() + 10,
        });

        if (!this._isUpdate) {
            this._yearPicker.onChange((year) => this._onYearChange(year));
        }

        this._state.master.Nam = initialYear;
    }

    _onYearChange(newYear) {
        if (this._state.days.size > 0) {
            AppUtils.Modal.showConfirm({
                title: 'Đổi năm lịch nghỉ',
                message: 'Bạn có dữ liệu ngày nghỉ đã setup. Đổi năm sẽ xóa toàn bộ dữ liệu này. Bạn có chắc muốn tiếp tục?',
                confirmText: 'Đổi năm',
                type: 'warning',
                onConfirm: () => {
                    this._state.days.clear();
                    this._state.deletedIds.clear();
                    this._state.master.Nam = newYear;
                    this._calendar?.setYear(newYear);
                    this._calendar?.setDays([]);
                    this._calendar?.render();
                    this._setDirty(true);
                },
                onCancel: () => {
                    // Revert year picker
                    this._yearPicker.setValue(this._state.master.Nam, { silent: true });
                }
            });
        } else {
            this._state.master.Nam = newYear;
            this._calendar?.setYear(newYear);
            this._setDirty(true);
        }
    }

    // ── Calendar ──────────────────────────────────────────────────

    _initCalendar() {
        const year = this._yearPicker?.getValue() || new Date().getFullYear();
        this._calendar = new HolidayYearCalendar('holiday-year-calendar', {
            year,
            minDate: this._todayISO(),
        });

        this._calendar.onCellClick(({ date, item, isPast, isToday }) => {
            this._onCellClick(date, item, isPast, isToday);
        });

        this._calendar.render();
    }

    _onCellClick(date, item, isPast, isToday) {
        // Check if it's in state (may not yet be persisted)
        const stateItem = this._state.days.get(date);

        if (stateItem) {
            // Existing item
            this._sidebar.openView(stateItem, isPast);
        } else if (!isPast) {
            // New cell
            this._sidebar.openFromCell(date);
        } else {
            // Past, no data — ignore
            AppUtils.Notify.info('Không thể thiết lập ngày nghỉ trong quá khứ.');
        }
    }

    // ── Sidebar ───────────────────────────────────────────────────

    _initSidebar() {
        this._sidebar = new HolidayDaySidebarController({
            getYear: () => this._yearPicker?.getValue() || new Date().getFullYear(),
            getMinDate: () => this._minimumDateForSelectedYear(),
            loadTemplates: (year) => this._fetchTemplates(year),
            onSubmit: (mode, data) => this._onSidebarSubmit(mode, data),
            onDelete: (dateStr, id) => this._onDeleteDay(dateStr, id),
        });
    }

    _fetchTemplates(year) {
        return AppUtils.API.get(`${this._apiTemplates}?year=${year}`)
            .then(res => {
                if (res.success) return res.data || [];
                return [];
            })
            .catch(() => []);
    }

    // ── State mutation ────────────────────────────────────────────

    /**
     * Process submitted data from sidebar.
     * Handles conflict detection before mutating state.
     */
    _onSidebarSubmit(mode, data) {
        if (mode === 'EDIT') {
            this._applyDay(data, mode);
            return;
        }

        if (Array.isArray(data.items)) {
            let added = 0;
            let skipped = 0;
            data.items.forEach(item => {
                const dateStr = item.Ngay || item.ngay;
                if (!dateStr || dateStr < this._todayISO() || this._state.days.has(dateStr)) {
                    skipped++;
                    return;
                }
                this._applyDay(this._buildDayObj(dateStr, item), 'create');
                added++;
            });
            if (added) AppUtils.Notify.success(`Đã thêm ${added} ngày nghỉ từ bản mẫu.`);
            if (skipped) AppUtils.Notify.warning(`Đã bỏ qua ${skipped} ngày đã tồn tại hoặc không hợp lệ.`);
            this._sidebar.closeSidebar();
            return;
        }

        // Mode CREATE_* — data.dates is array of 'YYYY-MM-DD'
        const dates = data.dates || [];
        const loai = data.LoaiLichNghi;

        let skipped = 0;
        let conflicts = []; // {date, existing, incoming}
        let toAdd = [];

        dates.forEach(dateStr => {
            const existing = this._state.days.get(dateStr);
            if (!existing) {
                toAdd.push(dateStr);
                return;
            }

            const existLoai = existing.LoaiLichNghi || existing.loailichnghi;
            const existingName = existing.TenNgayNghi || existing.tenngaynghi || '';
            const existingPaid = existing.ApDungTinhLuong !== undefined
                ? existing.ApDungTinhLuong
                : existing.apdungtinhluong;
            if (existLoai === loai &&
                existingName === data.TenNgayNghi &&
                Boolean(existingPaid) === Boolean(data.ApDungTinhLuong)) {
                // Exact duplicate
                skipped++;
                return;
            }

            conflicts.push({ date: dateStr, existing, incoming: data });
        });

        if (conflicts.length > 0 && toAdd.length === 0) {
            // All conflict — show summary
            this._resolveConflicts(conflicts, data, toAdd, skipped);
            return;
        }

        // Add non-conflicting days
        toAdd.forEach(dateStr => {
            const dayObj = this._buildDayObj(dateStr, data);
            this._applyDay(dayObj, 'create');
        });

        if (conflicts.length > 0) {
            this._resolveConflicts(conflicts, data, toAdd, skipped);
            return;
        }

        if (skipped > 0) {
            AppUtils.Notify.warning(`Đã bỏ qua ${skipped} ngày trùng lặp.`);
        } else {
            AppUtils.Notify.success(`Đã thêm ${toAdd.length} ngày nghỉ.`);
        }

        this._sidebar.closeSidebar();
    }

    _resolveConflicts(conflicts, incomingData, alreadyAdded, skipped) {
        const first = conflicts[0];
        const existLoai = first.existing.LoaiLichNghi || first.existing.loailichnghi;
        const incomingLoai = incomingData.LoaiLichNghi;

        // Conflict: NGAY_NGHI → NGHI_LE (allow with confirm)
        // Conflict: NGHI_LE → NGAY_NGHI (block)
        // Same type, different content (confirm replace)

        let message = '';
        let canOverride = false;

        if (existLoai === 'NGHI_LE' && incomingLoai === 'NGAY_NGHI') {
            message = `${conflicts.length} ngày đã được đặt là "Nghỉ lễ". Không thể ghi đè bằng "Nghỉ thường".`;
            canOverride = false;
        } else if (existLoai === 'NGAY_NGHI' && incomingLoai === 'NGHI_LE') {
            message = `${conflicts.length} ngày đã được đặt là "Nghỉ thường". Không thể đổi loại sang "Nghỉ lễ".`;
            canOverride = false;
        } else {
            message = `${conflicts.length} ngày đã có thông tin khác (${conflicts.map(c=>this._isoToDisplay(c.date)).slice(0,3).join(', ')}${conflicts.length>3?'...':''}). Bạn có muốn ghi đè?`;
            canOverride = true;
        }

        if (!canOverride) {
            AppUtils.Notify.warning(message);
            if (alreadyAdded.length > 0) AppUtils.Notify.success(`Đã thêm ${alreadyAdded.length} ngày không xung đột.`);
            this._sidebar.closeSidebar();
            return;
        }

        AppUtils.Modal.showConfirm({
            title: 'Xung đột ngày nghỉ',
            message,
            confirmText: 'Ghi đè',
            type: 'info',
            onConfirm: () => {
                conflicts.forEach(({ date }) => {
                    const dayObj = this._buildDayObj(date, incomingData);
                    this._applyDay(dayObj, 'create');
                });
                AppUtils.Notify.success(`Đã cập nhật ${conflicts.length} ngày.`);
                if (skipped > 0) AppUtils.Notify.info(`Đã bỏ qua ${skipped} ngày trùng lặp.`);
                this._sidebar.closeSidebar();
            }
        });
    }

    _buildDayObj(dateStr, data) {
        const existing = this._state.days.get(dateStr);
        return {
            id: existing?.id || null,
            Ngay: dateStr,
            TenNgayNghi: data.TenNgayNghi,
            LoaiLichNghi: data.LoaiLichNghi,
            ApDungTinhLuong: data.ApDungTinhLuong,
            HeSoLamViec: data.HeSoLamViec,
            NguonGoc: data.NguonGoc,
        };
    }

    _applyDay(dayObj, action) {
        const dateStr = dayObj.Ngay || dayObj.ngay;
        if (!dateStr) return;

        // Preserve existing DB id if editing
        if (action === 'EDIT') {
            const existing = this._state.days.get(dateStr);
            if (existing?.id) dayObj.id = existing.id;
        }

        this._state.days.set(dateStr, dayObj);
        this._calendar?.upsertDay(dayObj);
        this._setDirty(true);

        if (action === 'EDIT') {
            AppUtils.Notify.success('Đã cập nhật ngày nghỉ.');
            this._sidebar?.closeSidebar();
        }
    }

    _onDeleteDay(dateStr, id) {
        if (id) this._state.deletedIds.add(id);
        this._state.days.delete(dateStr);
        this._calendar?.removeDay(dateStr);
        this._setDirty(true);
        AppUtils.Notify.success('Đã xóa ngày nghỉ.');
    }

    _setDirty(isDirty) {
        this._state.dirty = isDirty;
    }

    _isoToDisplay(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    }

    // ── Action buttons ────────────────────────────────────────────

    _bindActionButtons() {
        document.getElementById('btn-them-nghi-le')?.addEventListener('click', () => {
            if (this._yearPicker?.getValue() < new Date().getFullYear()) {
                AppUtils.Notify.info('Không thể thiết lập ngày nghỉ cho năm đã qua.');
                return;
            }
            this._sidebar?.openCreateHoliday();
        });
        document.getElementById('btn-them-ngay-nghi')?.addEventListener('click', () => {
            if (this._yearPicker?.getValue() < new Date().getFullYear()) {
                AppUtils.Notify.info('Không thể thiết lập ngày nghỉ cho năm đã qua.');
                return;
            }
            this._sidebar?.openCreateDayOff();
        });
    }

    // ── Unsaved warning ───────────────────────────────────────────

    _fillFormData(data) {
        // Master
        document.querySelector('[name="tenlichnghi"]') && (document.querySelector('[name="tenlichnghi"]').value = data.TenLichNghi || '');
        document.querySelector('[name="malichnghi"]') && (document.querySelector('[name="malichnghi"]').value = data.MaLichNghi || '');
        this._yearPicker?.setValue(data.Nam, { silent: true });

        this._state.master = {
            id: data.id,
            MaLichNghi: data.MaLichNghi,
            TenLichNghi: data.TenLichNghi,
            Nam: data.Nam,
            TrangThai: data.TrangThai || 'active',
        };
        this._state.expectedUpdatedAt = data.UpdatedAt || null;
        this._state.deletedIds.clear();

        // Days
        const days = data.ChiTiet || [];
        this._state.days.clear();
        days.forEach(d => {
            this._state.days.set(d.Ngay, d);
        });
        this._state.originalDays = new Map(this._state.days);

        // Calendar
        this._calendar?.setDays(days);
        this._calendar?.setYear(data.Nam);
        this._setDirty(false);
    }

    // ── Build payload ─────────────────────────────────────────────

    _buildPayload() {
        const maEl = document.querySelector('[name="malichnghi"]');
        const tenEl = document.querySelector('[name="tenlichnghi"]');
        const nam = this._yearPicker?.getValue() || parseInt(document.getElementById('nam-value')?.value || 0, 10);

        const chiTiet = [];
        this._state.days.forEach((day, dateStr) => {
            chiTiet.push({
                id: day.id || null,
                Ngay: dateStr,
                TenNgayNghi: day.TenNgayNghi || day.tenngaynghi,
                LoaiLichNghi: day.LoaiLichNghi || day.loailichnghi,
                ApDungTinhLuong: day.ApDungTinhLuong !== undefined ? day.ApDungTinhLuong : day.apdungtinhluong,
                HeSoLamViec: day.HeSoLamViec !== undefined ? day.HeSoLamViec : day.hesolamviec,
                NguonGoc: day.NguonGoc || day.nguongoc || 'THU_CONG',
            });
        });

        return {
            MaLichNghi: maEl?.value.trim().toUpperCase() || '',
            TenLichNghi: tenEl?.value.trim() || '',
            Nam: nam,
            LoaiNghi: 'LICH_AP_DUNG',
            TrangThai: this._state.master.TrangThai || 'active',
            GhiChu: '',
            ExpectedUpdatedAt: this._state.expectedUpdatedAt,
            ChiTiet: chiTiet,
            DeletedIds: [...this._state.deletedIds],
        };
    }

    // ── Validate ──────────────────────────────────────────────────

    _validatePayload(payload) {
        if (!payload.TenLichNghi) return 'Vui lòng nhập tên lịch nghỉ.';
        if (!payload.MaLichNghi) return 'Vui lòng nhập mã nhóm.';
        if (!payload.Nam) return 'Vui lòng chọn năm.';
        if (!payload.ChiTiet.length) return 'Vui lòng thiết lập ít nhất một ngày nghỉ.';
        return null;
    }

    // ── Success ───────────────────────────────────────────────────

    _onSuccess(data) {
        this._setDirty(false);
        setTimeout(() => {
            window.location.href = this._listUrl;
        }, 800);
    }

    // ── Unsaved warning ───────────────────────────────────────────

    _bindUnsavedWarning() {
        window.addEventListener('beforeunload', (e) => {
            if (this._state.dirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        document.querySelector('.form-footer-fixed a')?.addEventListener('click', (event) => {
            if (!this._state.dirty) return;
            event.preventDefault();
            const targetUrl = event.currentTarget.href;
            AppUtils.Modal.showConfirm({
                title: 'Rời trang?',
                message: 'Các thay đổi chưa lưu sẽ bị mất.',
                confirmText: 'Rời trang',
                type: 'warning',
                onConfirm: () => {
                    this._setDirty(false);
                    window.location.href = targetUrl;
                },
            });
        });
    }

    _bindDirtyTracking() {
        ['ten-lich-nghi', 'ma-lich-nghi'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => this._setDirty(true));
        });
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    if (typeof AppUtils === 'undefined' || typeof BaseFormManager === 'undefined') {
        console.error('LichNghiFormController: AppUtils or BaseFormManager not loaded.');
        return;
    }
    AppUtils.init();
    const controller = new LichNghiFormController();
    controller.init();
});
