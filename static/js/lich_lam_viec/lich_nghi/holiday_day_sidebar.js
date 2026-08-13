/**
 * HolidayDaySidebarController
 * Controls the single dynamic sidebar for all holiday day operations.
 *
 * Modes:
 *   CREATE_HOLIDAY    — Thêm nghỉ lễ (thủ công | từ bản mẫu)
 *   CREATE_DAY_OFF    — Thêm ngày nghỉ (hàng loạt | từng ngày)
 *   CREATE_FROM_CELL  — Click vào ô ngày chưa setup
 *   VIEW              — Click vào ô ngày đã setup (view-only)
 *   EDIT              — Sửa ngày đã setup
 *
 * Does NOT:
 *   - Call save APIs
 *   - Mutate global state directly
 *   - Manage the calendar grid
 *
 * Emits data via onSubmit callback.
 */
class HolidayDaySidebarController {
    /**
     * @param {object} options
     * @param {Function} options.onSubmit    — callback(mode, data)
     * @param {Function} options.onDelete    — callback(dateStr)
     * @param {Function} options.getYear     — returns current year (number)
     * @param {Function} options.getMinDate  — returns 'YYYY-MM-DD' (today or later)
     * @param {Function} options.loadTemplates — async fn(year) → [{Ngay, TenNgayNghi, ...}]
     */
    constructor(options = {}) {
        this._onSubmit = options.onSubmit || (() => {});
        this._onDelete = options.onDelete || (() => {});
        this._getYear = options.getYear || (() => new Date().getFullYear());
        this._getMinDate = options.getMinDate || (() => this._todayISO());
        this._loadTemplates = options.loadTemplates || (() => Promise.resolve([]));

        this._mode = null;
        this._editingDate = null;
        this._editingItem = null;
        this._templatesYear = null;

        // Date pickers for sidebar fields — initialized lazily
        this._hTuNgayPicker = null;
        this._hDenNgayPicker = null;
        this._dTuNgayPicker = null;
        this._dDenNgayPicker = null;
        this._dsSinglePicker = null;
        this._sidebarApi = null;

        this._init();
    }

    // ── Utilities ────────────────────────────────────────────────

    _todayISO() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    }

    _isoToDisplay(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    }

    _displayToISO(display) {
        if (!display) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(display)) return display;
        const [d, m, y] = display.split('/');
        if (!d || !m || !y) return null;
        return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }

    _formatVn(isoStr) {
        if (!isoStr) return '';
        const [y, m, d] = isoStr.split('-');
        const date = new Date(+y, +m - 1, +d);
        const dow = ['Chủ Nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'][date.getDay()];
        return `${dow}, ${d}/${m}/${y}`;
    }

    _el(id) {
        return document.getElementById(id);
    }

    _show(id) {
        const el = this._el(id);
        if (el) el.classList.remove('hidden');
    }

    _hide(id) {
        const el = this._el(id);
        if (el) el.classList.add('hidden');
    }

    _setError(id, msg) {
        const el = this._el(id);
        if (!el) return;
        if (msg) {
            el.textContent = msg;
            el.classList.remove('hidden');
        } else {
            el.textContent = '';
            el.classList.add('hidden');
        }
    }

    _clearErrors() {
        document.querySelectorAll('[id^="err-"]').forEach(el => {
            el.textContent = '';
            el.classList.add('hidden');
        });
    }

    _readCoefficient(inputId, isPaid) {
        if (!isPaid) return 0;
        const value = Number(this._el(inputId)?.value);
        if (!Number.isFinite(value) || value < 0 || value > 10) {
            AppUtils.Notify.error('Hệ số công phải là số từ 0 đến 10.');
            return null;
        }
        return value;
    }

    // ── Sidebar open/close ───────────────────────────────────────

    _openSidebar(title, submitText, showSubmit = true, showExtraActions = false) {
        const sidebar = this._el('day-sidebar');
        const overlay = this._el('day-sidebar-overlay');
        const titleEl = this._el('day-sidebar-title');
        const submitBtn = this._el('day-sidebar-submit');
        const submitTextEl = this._el('day-sidebar-submit-text');
        const extraActions = this._el('day-sidebar-extra-actions');

        if (titleEl) titleEl.textContent = title;
        if (submitTextEl) submitTextEl.textContent = submitText;
        if (submitBtn) submitBtn.classList.toggle('hidden', !showSubmit);
        if (extraActions) extraActions.classList.toggle('hidden', !showExtraActions);

        this._sidebarApi?.open();
        this._clearErrors();
        requestAnimationFrame(() => {
            const activeSection = sidebar?.querySelector('div[id^="sidebar-"]:not(.hidden)');
            activeSection?.querySelector('input:not([type="hidden"]):not(:disabled), select:not(:disabled), button:not(:disabled)')?.focus();
        });
    }

    closeSidebar() {
        this._sidebarApi?.close();
        this._mode = null;
        this._editingDate = null;
        this._editingItem = null;
    }

    _hideAllSections() {
        ['sidebar-view-section', 'sidebar-holiday-section',
         'sidebar-dayoff-section', 'sidebar-cell-section'].forEach(id => this._hide(id));
    }

    // ── Mode: CREATE_HOLIDAY ─────────────────────────────────────

    openCreateHoliday() {
        this._mode = 'CREATE_HOLIDAY';
        this._hideAllSections();
        this._show('sidebar-holiday-section');
        this._resetHolidayForm();
        this._openSidebar('Thêm lịch nghỉ lễ', 'Thêm');

        // Switch tabs
        const manualRadio = document.querySelector('[name="holiday-method"][value="manual"]');
        if (manualRadio) {
            manualRadio.checked = true;
            this._showHolidayMethod('manual');
        }
    }

    _resetHolidayForm() {
        const fields = ['h-ten-ngay-nghi', 'h-tu-ngay', 'h-den-ngay', 'h-heso'];
        fields.forEach(id => {
            const el = this._el(id);
            if (el) el.value = id === 'h-heso' ? '1.00' : '';
        });
        const cb = this._el('h-apdung-tinluong');
        if (cb) cb.checked = false;
        const templatePaid = this._el('tmpl-apdung-tinluong');
        if (templatePaid) templatePaid.checked = true;
        document.querySelectorAll('[name="tmpl-day"]').forEach(input => {
            input.checked = false;
        });
        this._hide('h-heso-row');
        this._hide('holiday-template-form');
        this._show('holiday-manual-form');

        const maxDate = `${this._getYear()}-12-31`;
        if (!this._hTuNgayPicker) {
            this._hTuNgayPicker = new CustomDateRangePicker({
                startInput: 'h-tu-ngay',
                endInput: 'h-den-ngay',
                minDate: this._getMinDate(),
                maxDate,
            }).onChange(() => this._updateHPreview());
        } else {
            this._hTuNgayPicker.setBounds(this._getMinDate(), maxDate);
            this._hTuNgayPicker.clear({ silent: true });
        }
    }

    _updateHPreview() { /* reserved for future use */ }

    _showHolidayMethod(method) {
        if (method === 'template') {
            this._hide('holiday-manual-form');
            this._show('holiday-template-form');
            if (this._templatesYear !== this._getYear()) {
                this._loadTemplatesUI();
            }
        } else {
            this._show('holiday-manual-form');
            this._hide('holiday-template-form');
        }
    }

    _loadTemplatesUI() {
        const listEl = this._el('holiday-template-list');
        const yearLabel = this._el('template-year-label');
        const year = this._getYear();
        if (yearLabel) yearLabel.textContent = year;
        if (listEl) listEl.innerHTML = '<div class="text-center py-6 text-slate-400 text-sm">Đang tải bản mẫu...</div>';

        this._loadTemplates(year).then(templates => {
            this._templatesYear = year;
            this._renderTemplates(templates);
        }).catch(() => {
            if (listEl) listEl.innerHTML = '<div class="text-center py-4 text-red-400 text-sm">Không thể tải bản mẫu.</div>';
        });
    }

    _renderTemplates(templates) {
        const listEl = this._el('holiday-template-list');
        if (!listEl) return;

        if (!templates || templates.length === 0) {
            listEl.innerHTML = '<div class="text-center py-6 text-slate-400 text-sm italic">Chưa có bản mẫu ngày nghỉ lễ cho năm này.</div>';
            return;
        }

        listEl.innerHTML = '';
        templates.forEach((tmpl, idx) => {
            const displayDate = this._isoToDisplay(tmpl.Ngay || '');
            const row = document.createElement('label');
            row.className = 'flex items-center gap-3 p-2.5 rounded-lg hover:bg-blue-50 cursor-pointer border border-transparent hover:border-blue-200 transition-colors';
            row.innerHTML = `
                <input type="checkbox" name="tmpl-day" value="${this._escText(tmpl.Ngay || '')}"
                       data-ten="${this._escAttr(tmpl.TenNgayNghi || '')}"
                       class="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer">
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-slate-700 truncate">${this._escText(tmpl.TenNgayNghi || '')}</p>
                    <p class="text-xs text-slate-400">${displayDate}</p>
                </div>
            `;
            listEl.appendChild(row);
        });
    }

    _escText(str) { return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    _escAttr(str) { return this._escText(str); }

    // ── Mode: CREATE_DAY_OFF ─────────────────────────────────────

    openCreateDayOff() {
        this._mode = 'CREATE_DAY_OFF';
        this._hideAllSections();
        this._show('sidebar-dayoff-section');
        this._resetDayOffForm();
        this._openSidebar('Thêm ngày nghỉ', 'Thêm');

        const batchRadio = document.querySelector('[name="dayoff-method"][value="batch"]');
        if (batchRadio) {
            batchRadio.checked = true;
            this._showDayOffMethod('batch');
        }
    }

    _resetDayOffForm() {
        // Reset batch fields
        ['d-ten-ngay-nghi', 'd-tu-ngay', 'd-den-ngay'].forEach(id => {
            const el = this._el(id);
            if (el) el.value = '';
        });
        const heso = this._el('d-heso');
        if (heso) heso.value = '1.00';
        const lapSel = this._el('d-hinh-thuc-lap');
        if (lapSel) lapSel.value = '';
        const cb = this._el('d-apdung-tinluong');
        if (cb) cb.checked = false;
        document.querySelectorAll('[name="weekdays"]').forEach(input => {
            input.checked = input.value === '5' || input.value === '6';
        });
        this._hide('d-heso-row');
        this._hide('d-preview-count');

        // Reset single fields
        ['ds-ten-ngay-nghi', 'ds-chon-ngay'].forEach(id => {
            const el = this._el(id);
            if (el) el.value = '';
        });
        const heso2 = this._el('ds-heso');
        if (heso2) heso2.value = '1.00';
        const cb2 = this._el('ds-apdung-tinluong');
        if (cb2) cb2.checked = true;
        this._show('ds-heso-row');

        const Picker = window.CustomDateComponents?.CustomDatePicker;
        const minD = this._getMinDate();
        const maxD = `${this._getYear()}-12-31`;
        if (!this._dTuNgayPicker) {
            this._dTuNgayPicker = new CustomDateRangePicker({
                startInput: 'd-tu-ngay',
                endInput: 'd-den-ngay',
                minDate: minD,
                maxDate: maxD,
            }).onChange(() => this._updateDPreview());
        } else {
            this._dTuNgayPicker.setBounds(minD, maxD);
            this._dTuNgayPicker.clear({ silent: true });
        }
        const singleInput = this._el('ds-chon-ngay');
        if (singleInput) {
            singleInput.min = minD;
            singleInput.max = maxD;
        }
        if (!this._dsSinglePicker && Picker && singleInput) {
            this._dsSinglePicker = new Picker({ inputId: 'ds-chon-ngay', placeholder: 'Chọn ngày' });
        } else {
            this._dsSinglePicker?.setValue('', { silent: true });
            this._dsSinglePicker?.syncFromInput();
        }
    }

    _showDayOffMethod(method) {
        if (method === 'batch') {
            this._show('dayoff-batch-form');
            this._hide('dayoff-single-form');
        } else {
            this._hide('dayoff-batch-form');
            this._show('dayoff-single-form');
        }
    }

    _updateDPreview() {
        const tuNgay = this._el('d-tu-ngay')?.value;
        const denNgay = this._el('d-den-ngay')?.value;
        const lapVal = this._el('d-hinh-thuc-lap')?.value;
        const weekdays = [...document.querySelectorAll('[name="weekdays"]:checked')].map(c => parseInt(c.value));

        if (!tuNgay || !denNgay || !lapVal || weekdays.length === 0) {
            this._hide('d-preview-count');
            return;
        }

        const dates = HolidayRuleGenerator.generate({
            weekdays,
            interval: parseInt(lapVal),
            startDate: tuNgay,
            endDate: denNgay,
            year: this._getYear(),
            minDate: this._getMinDate(),
        });

        const preview = this._el('d-preview-count');
        const previewText = this._el('d-preview-text');
        if (preview && previewText) {
            preview.classList.remove('hidden');
            previewText.textContent = `Sẽ thêm ${dates.length} ngày`;
        }
    }

    // ── Mode: CREATE_FROM_CELL ───────────────────────────────────

    openFromCell(dateStr) {
        this._mode = 'CREATE_FROM_CELL';
        this._editingDate = dateStr;
        this._hideAllSections();
        this._show('sidebar-cell-section');

        const displayEl = this._el('cell-ngay-display');
        const hiddenEl = this._el('cell-ngay-value');
        if (displayEl) displayEl.textContent = this._formatVn(dateStr);
        if (hiddenEl) hiddenEl.value = dateStr;

        // Reset
        const tenEl = this._el('cell-ten-ngay-nghi');
        if (tenEl) tenEl.value = '';
        const cb = this._el('cell-apdung-tinluong');
        if (cb) cb.checked = true;
        const heso = this._el('cell-heso');
        if (heso) heso.value = '1.00';
        const loaiRadio = document.querySelector('[name="cell-loai"][value="NGAY_NGHI"]');
        if (loaiRadio) loaiRadio.checked = true;
        document.querySelectorAll('[name="cell-loai"]').forEach(radio => {
            radio.disabled = false;
        });
        this._el('cell-loai-current') && (this._el('cell-loai-current').value = '');
        this._show('cell-heso-row');

        this._openSidebar(`Thiết lập ngày ${this._isoToDisplay(dateStr)}`, 'Thêm');
    }

    // ── Mode: VIEW ───────────────────────────────────────────────

    openView(item, isPast) {
        this._mode = 'VIEW';
        this._editingDate = item.Ngay || item.ngay;
        this._editingItem = item;
        this._hideAllSections();
        this._show('sidebar-view-section');

        const loai = item.LoaiLichNghi || item.loailichnghi || '';
        const badge = this._el('view-loai-badge');
        if (badge) {
            if (loai === 'NGHI_LE') {
                badge.textContent = 'Ngày nghỉ lễ';
                badge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700';
            } else {
                badge.textContent = 'Ngày nghỉ thường';
                badge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600';
            }
        }

        const ngay = item.Ngay || item.ngay || '';
        const setView = (id, val) => {
            const el = this._el(id);
            if (el) el.textContent = val;
        };

        setView('view-ngay', this._formatVn(ngay));
        setView('view-ten', item.TenNgayNghi || item.tenngaynghi || '—');

        const tinLuong = (item.ApDungTinhLuong !== undefined ? item.ApDungTinhLuong : item.apdungtinhluong);
        setView('view-tinluong', tinLuong ? 'Có' : 'Không');

        const heso = item.HeSoLamViec || item.hesolamviec;
        if (heso !== undefined && heso !== null && tinLuong) {
            setView('view-heso', heso);
            this._show('view-heso-row');
        } else {
            this._hide('view-heso-row');
        }

        const nguon = item.NguonGoc || item.nguongoc || '';
        const nguonMap = { 'THU_CONG': 'Nhập tay', 'HANG_LOAT': 'Hàng loạt', 'TEMPLATE': 'Từ bản mẫu' };
        nguonMap.BAN_MAU = nguonMap.TEMPLATE;
        setView('view-nguongoc', nguonMap[nguon] || nguon);

        // View-only past: no submit, no extra actions
        const canEdit = !isPast;
        this._openSidebar(
            `Chi tiết ngày ${this._isoToDisplay(ngay)}`,
            'Sửa',
            canEdit, // submit = Sửa button
            canEdit  // show delete button
        );
    }

    // ── Mode: EDIT ───────────────────────────────────────────────

    openEdit(item) {
        this._mode = 'EDIT';
        this._editingDate = item.Ngay || item.ngay;
        this._editingItem = item;
        this._hideAllSections();
        this._show('sidebar-cell-section');

        const loai = item.LoaiLichNghi || item.loailichnghi || 'NGAY_NGHI';

        const displayEl = this._el('cell-ngay-display');
        const hiddenEl = this._el('cell-ngay-value');
        const loaiCurrentEl = this._el('cell-loai-current');

        if (displayEl) displayEl.textContent = this._formatVn(this._editingDate);
        if (hiddenEl) hiddenEl.value = this._editingDate;
        if (loaiCurrentEl) loaiCurrentEl.value = loai; // lock type in validation

        // Fill fields (type locked)
        const tenEl = this._el('cell-ten-ngay-nghi');
        if (tenEl) tenEl.value = item.TenNgayNghi || item.tenngaynghi || '';

        const cb = this._el('cell-apdung-tinluong');
        const tinLuong = item.ApDungTinhLuong !== undefined ? item.ApDungTinhLuong : item.apdungtinhluong;
        if (cb) cb.checked = !!tinLuong;

        const heso = this._el('cell-heso');
        if (heso) heso.value = item.HeSoLamViec || item.hesolamviec || '1.00';
        this._el('cell-heso-row')?.classList.toggle('hidden', !tinLuong);

        // Disable loai radio
        document.querySelectorAll('[name="cell-loai"]').forEach(radio => {
            radio.disabled = true;
            radio.checked = radio.value === loai;
        });

        this._openSidebar(`Sửa ngày ${this._isoToDisplay(this._editingDate)}`, 'Lưu thay đổi');
    }

    // ── Collect & Validate ───────────────────────────────────────

    collectAndSubmit() {
        this._clearErrors();
        let isValid = true;

        if (this._mode === 'CREATE_HOLIDAY') {
            const method = document.querySelector('[name="holiday-method"]:checked')?.value;

            if (method === 'manual') {
                const ten = this._el('h-ten-ngay-nghi')?.value.trim();
                const tuNgay = this._el('h-tu-ngay')?.value.trim();
                const denNgay = this._el('h-den-ngay')?.value.trim();

                if (!ten) { this._setError('err-h-ten', 'Vui lòng nhập tên ngày nghỉ'); isValid = false; }
                if (!tuNgay || !denNgay) { this._setError('err-h-ngay', 'Vui lòng chọn khoảng ngày nghỉ'); isValid = false; }
                if (tuNgay && denNgay) {
                    const tuISO = this._displayToISO(tuNgay);
                    const denISO = this._displayToISO(denNgay);
                    if (tuISO && denISO && tuISO > denISO) {
                        this._setError('err-h-ngay', 'Ngày bắt đầu không được lớn hơn ngày kết thúc');
                        isValid = false;
                    }
                }
                if (!isValid) return;

                const tinLuong = this._el('h-apdung-tinluong')?.checked;
                const heso = this._readCoefficient('h-heso', tinLuong);
                if (heso === null) return;

                const dates = HolidayRuleGenerator.generateRange(tuNgay, denNgay, {
                    year: this._getYear(),
                    minDate: this._getMinDate(),
                });

                this._onSubmit('CREATE_HOLIDAY', {
                    method: 'manual',
                    TenNgayNghi: ten,
                    LoaiLichNghi: 'NGHI_LE',
                    ApDungTinhLuong: !!tinLuong,
                    HeSoLamViec: heso,
                    NguonGoc: 'THU_CONG',
                    dates,
                });

            } else {
                // Template
                const checked = [...document.querySelectorAll('[name="tmpl-day"]:checked')];
                if (checked.length === 0) {
                    AppUtils.Notify.warning('Vui lòng chọn ít nhất một ngày nghỉ lễ.');
                    return;
                }
                const tinLuong = this._el('tmpl-apdung-tinluong')?.checked;
                const items = checked.map(cb => ({
                    Ngay: cb.value,
                    TenNgayNghi: cb.dataset.ten || '',
                    LoaiLichNghi: 'NGHI_LE',
                    ApDungTinhLuong: !!tinLuong,
                    HeSoLamViec: tinLuong ? 1.0 : 0,
                    NguonGoc: 'BAN_MAU',
                }));
                this._onSubmit('CREATE_HOLIDAY', { method: 'template', items });
            }

        } else if (this._mode === 'CREATE_DAY_OFF') {
            const method = document.querySelector('[name="dayoff-method"]:checked')?.value;

            if (method === 'batch') {
                const ten = this._el('d-ten-ngay-nghi')?.value.trim();
                const weekdays = [...document.querySelectorAll('[name="weekdays"]:checked')].map(c => parseInt(c.value));
                const lapVal = this._el('d-hinh-thuc-lap')?.value;
                const tuNgay = this._el('d-tu-ngay')?.value.trim();
                const denNgay = this._el('d-den-ngay')?.value.trim();

                if (!ten) { this._setError('err-d-ten', 'Vui lòng nhập tên ngày nghỉ'); isValid = false; }
                if (weekdays.length === 0) { this._setError('err-d-weekdays', 'Vui lòng chọn ít nhất một thứ trong tuần'); isValid = false; }
                if (!lapVal) { this._setError('err-d-lap', 'Vui lòng chọn hình thức lặp'); isValid = false; }
                if (!tuNgay || !denNgay) { this._setError('err-d-range', 'Vui lòng chọn khoảng áp dụng'); isValid = false; }
                if (!isValid) return;

                const tinLuong = this._el('d-apdung-tinluong')?.checked;
                const heso = this._readCoefficient('d-heso', tinLuong);
                if (heso === null) return;

                const dates = HolidayRuleGenerator.generate({
                    weekdays,
                    interval: parseInt(lapVal),
                    startDate: tuNgay,
                    endDate: denNgay,
                    year: this._getYear(),
                    minDate: this._getMinDate(),
                });

                if (dates.length === 0) {
                    AppUtils.Notify.warning('Không có ngày nào hợp lệ trong khoảng đã chọn.');
                    return;
                }

                this._onSubmit('CREATE_DAY_OFF', {
                    method: 'batch',
                    TenNgayNghi: ten,
                    LoaiLichNghi: 'NGAY_NGHI',
                    ApDungTinhLuong: !!tinLuong,
                    HeSoLamViec: heso,
                    NguonGoc: 'HANG_LOAT',
                    dates,
                });

            } else {
                // Single
                const ten = this._el('ds-ten-ngay-nghi')?.value.trim();
                const ngay = this._el('ds-chon-ngay')?.value.trim();

                if (!ten) { this._setError('err-ds-ten', 'Vui lòng nhập tên ngày nghỉ'); isValid = false; }
                if (!ngay) { this._setError('err-ds-ngay', 'Vui lòng chọn ngày'); isValid = false; }
                if (!isValid) return;

                const tinLuong = this._el('ds-apdung-tinluong')?.checked;
                const heso = this._readCoefficient('ds-heso', tinLuong);
                if (heso === null) return;
                const ngayISO = this._displayToISO(ngay);

                this._onSubmit('CREATE_DAY_OFF', {
                    method: 'single',
                    TenNgayNghi: ten,
                    LoaiLichNghi: 'NGAY_NGHI',
                    ApDungTinhLuong: !!tinLuong,
                    HeSoLamViec: heso,
                    NguonGoc: 'THU_CONG',
                    dates: [ngayISO],
                });
            }

        } else if (this._mode === 'CREATE_FROM_CELL') {
            const ten = this._el('cell-ten-ngay-nghi')?.value.trim();
            const loai = document.querySelector('[name="cell-loai"]:checked')?.value;
            const ngay = this._el('cell-ngay-value')?.value;

            if (!ten) { this._setError('err-cell-ten', 'Vui lòng nhập tên ngày nghỉ'); return; }

            const tinLuong = this._el('cell-apdung-tinluong')?.checked;
            const heso = this._readCoefficient('cell-heso', tinLuong);
            if (heso === null) return;

            this._onSubmit('CREATE_FROM_CELL', {
                Ngay: ngay,
                TenNgayNghi: ten,
                LoaiLichNghi: loai || 'NGAY_NGHI',
                ApDungTinhLuong: !!tinLuong,
                HeSoLamViec: heso,
                NguonGoc: 'THU_CONG',
                dates: [ngay],
            });

        } else if (this._mode === 'VIEW') {
            // Submit in VIEW mode = switch to EDIT
            if (this._editingItem) this.openEdit(this._editingItem);

        } else if (this._mode === 'EDIT') {
            const ten = this._el('cell-ten-ngay-nghi')?.value.trim();
            if (!ten) { this._setError('err-cell-ten', 'Vui lòng nhập tên ngày nghỉ'); return; }

            const loai = this._el('cell-loai-current')?.value || this._editingItem?.LoaiLichNghi;
            const tinLuong = this._el('cell-apdung-tinluong')?.checked;
            const heso = this._readCoefficient('cell-heso', tinLuong);
            if (heso === null) return;

            this._onSubmit('EDIT', {
                id: this._editingItem?.id || this._editingItem?.Id || null,
                Ngay: this._editingDate,
                TenNgayNghi: ten,
                LoaiLichNghi: loai,
                ApDungTinhLuong: !!tinLuong,
                HeSoLamViec: heso,
                NguonGoc: this._editingItem?.NguonGoc || this._editingItem?.nguongoc || 'THU_CONG',
                dates: [this._editingDate],
            });
        }
    }

    // ── Init bindings ────────────────────────────────────────────

    _init() {
        this._sidebarApi = AppUtils.Sidebar.init('day-sidebar', 'day-sidebar-overlay', {
            animationDuration: 300,
        });
        if (!this._sidebarApi) {
            console.error('HolidayDaySidebarController: cannot initialize sidebar.');
            return;
        }

        // Close button
        const closeBtn = this._el('day-sidebar-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeSidebar());

        const cancelBtn = this._el('day-sidebar-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeSidebar());

        // Overlay click
        const overlay = this._el('day-sidebar-overlay');
        if (overlay) overlay.addEventListener('click', () => this.closeSidebar());

        // Submit
        const submitBtn = this._el('day-sidebar-submit');
        if (submitBtn) submitBtn.addEventListener('click', () => this.collectAndSubmit());

        // Delete button
        const deleteBtn = this._el('btn-sidebar-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (this._editingDate) {
                    AppUtils.Modal.showConfirm({
                        title: 'Xác nhận xóa',
                        message: `Bạn có chắc muốn xóa ngày nghỉ ngày ${this._isoToDisplay(this._editingDate)}?`,
                        confirmText: 'Xóa',
                        type: 'danger',
                        onConfirm: () => {
                            this._onDelete(this._editingDate, this._editingItem?.id || null);
                            this.closeSidebar();
                        }
                    });
                }
            });
        }

        // Holiday method radio
        document.addEventListener('change', (e) => {
            if (e.target.name === 'holiday-method') {
                this._showHolidayMethod(e.target.value);
            }
            if (e.target.name === 'dayoff-method') {
                this._showDayOffMethod(e.target.value);
            }
            // Apply tinluong toggles
            if (['h-apdung-tinluong', 'cell-apdung-tinluong', 'd-apdung-tinluong', 'ds-apdung-tinluong'].includes(e.target.id)) {
                const prefixMap = {
                    'h-apdung-tinluong': 'h',
                    'cell-apdung-tinluong': 'cell',
                    'd-apdung-tinluong': 'd',
                    'ds-apdung-tinluong': 'ds',
                };
                const prefix = prefixMap[e.target.id];
                if (prefix) {
                    const row = this._el(`${prefix}-heso-row`);
                    if (row) row.classList.toggle('hidden', !e.target.checked);
                }
            }
            // Batch preview update
            if (e.target.name === 'weekdays' || e.target.id === 'd-hinh-thuc-lap') {
                this._updateDPreview();
            }
        });

        // Date pickers trigger preview update
        ['d-tu-ngay', 'd-den-ngay'].forEach(id => {
            const el = this._el(id);
            if (el) el.addEventListener('change', () => this._updateDPreview());
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !this._el('day-sidebar-overlay')?.classList.contains('hidden')) {
                this.closeSidebar();
            }
        });
    }
}
