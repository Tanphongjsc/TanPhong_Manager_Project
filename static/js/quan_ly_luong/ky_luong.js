/**
 * File: static/js/quan_ly_luong/ky_luong.js
 * Controller cho Kỳ lương
 * Version: 3.0 - Cross-month support + Month lock on edit
 */

class KyLuongManager extends BaseCRUDManager {
    constructor() {
        super({
            sidebarId: 'ky-luong-sidebar',
            overlayId: 'ky-luong-sidebar-overlay',
            formId: 'ky-luong-form',
            
            apiUrls: {
                detail: (id) => `/hrm/quan-ly-luong/api/ky-luong/${id}/detail/`,
                create: '/hrm/quan-ly-luong/api/ky-luong/create/',
                update: (id) => `/hrm/quan-ly-luong/api/ky-luong/${id}/update/`,
                delete: (id) => `/hrm/quan-ly-luong/api/ky-luong/${id}/delete/`,
                getDefaults: '/hrm/quan-ly-luong/api/ky-luong/get-defaults/',
                finalize: (id) => `/hrm/quan-ly-luong/api/ky-luong/${id}/finalize/`,
            },
            
            texts: {
                entityName: 'kỳ lương',
                createTitle: 'Thêm mới kỳ lương',
                editTitle: 'Chỉnh sửa kỳ lương',
            },
            
            onRefreshTable: () => this.tableManager?.refresh(),
            onBeforeOpen: (mode) => this.handleBeforeOpen(mode),
            onAfterClose: () => this.resetForm(),
            
            fillFormData: (data) => this.fillFormData(data),
            getFormData: (form) => this.getFormData(form),
        });
        
        this.tableManager = null;
        
        // State
        this.selectedMonth = null;
        this.selectedYear = null;
        this.periodDays = 30; // Default
        this.dateConstraints = null; // Store min/max dates
        this.monthYearPicker = null;
        this.customDatePickers = {};
    }

    init() {
        super.init();
        this.initTable();
        this.initMonthYearPicker();
        this.initCustomDatePickers();
        this.initDateSync();
    }

    // ============================================================
    // TABLE INITIALIZATION
    // ============================================================
    initTable() {
        this.tableManager = new TableManager({
            tableBody: document.getElementById('table-body-ky-luong'),
            paginationContainer: document.querySelector('.pagination-container'),
            searchInput: document.getElementById('search-ky-luong'),
            filtersForm: document.getElementById('filter-ky-luong'),
            
            enableBulkActions: true,
            selectAllCheckbox: document.getElementById('select-all-ky-luong'),
            bulkActionsContainer: document.getElementById('bulk-actions-ky-luong'),
            onBulkDelete: (ids) => this.deleteMultipleItems(ids),
            
            apiEndpoint: '/hrm/quan-ly-luong/api/ky-luong/list/',
            onRenderRow: (item) => this.renderRow(item)
        });
    }

    renderRow(item) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors';
        
        const statusColors = {
            'draft': 'bg-slate-100 text-slate-600',
            'open': 'bg-green-100 text-green-700',
            'pending': 'bg-yellow-100 text-yellow-700',
            'processing': 'bg-blue-100 text-blue-700',
            'calculated': 'bg-purple-100 text-purple-700',
            'finalized': 'bg-slate-200 text-slate-600',
        };
        const statusClass = statusColors[item.trang_thai] || 'bg-slate-100 text-slate-600';
        
        const editDisabled = !item.can_edit;
        const deleteDisabled = !item.can_delete;
        
        // ✅ MỚI: Nút chốt kỳ
        let finalizeBtn = '';
        if (item.can_finalize) {
            finalizeBtn = `
                <button type="button" 
                        onclick="window.KyLuongManager.finalizeKyLuong(${item.id}, '${item.thang_display}')"
                        class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 transition-colors"
                        title="Chốt kỳ lương">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    Chốt kỳ
                </button>`;
        }
        
        tr.innerHTML = `
            <td class="px-4 py-4 text-center">
                <input type="checkbox" 
                       class="row-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                       data-id="${item.id}"
                       ${deleteDisabled ? 'disabled' : ''}>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-sm font-semibold text-slate-900">${item.thang_display}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-sm text-slate-600">${item.ky_luong_display || '-'}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-sm text-slate-600">${item.ngay_chot_luong || '-'}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                    ${item.trang_thai_display}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex items-center justify-end gap-1">
                    ${finalizeBtn}
                    <button type="button" 
                            onclick="window.KyLuongManager.openSidebar('edit', ${item.id})"
                            class="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors ${editDisabled ? 'opacity-50 cursor-not-allowed' : ''}"
                            ${editDisabled ? 'disabled title="Không thể sửa kỳ lương này"' : 'title="Sửa"'}>
                        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                    </button>
                    <button type="button" 
                            class="delete-btn text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors ${deleteDisabled ? 'opacity-50 cursor-not-allowed' : ''}"
                            data-id="${item.id}" 
                            data-name="Kỳ lương ${item.thang_display}"
                            ${deleteDisabled ? 'disabled title="Không thể xóa kỳ lương này"' : 'title="Xóa"'}>
                        <svg class="w-5 h-5 pointer-events-none" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                    </button>
                </div>
            </td>
        `;
        
        return tr;
    }

    // ============================================================
    // ✅ MỚI: CHỐT KỲ LƯƠNG
    // ============================================================
    finalizeKyLuong(id, displayName) {
        AppUtils.Modal.showConfirm({
            title: 'Chốt kỳ lương',
            message: `Bạn có chắc chắn muốn chốt kỳ lương "${displayName}"? Sau khi chốt, mọi thay đổi sẽ bị khóa vĩnh viễn.`,
            confirmText: 'Chốt kỳ lương',
            type: 'warning',
            onConfirm: async () => {
                try {
                    const res = await AppUtils.API.post(this.config.apiUrls.finalize(id));
                    if (res.success) {
                        AppUtils.Notify.success(res.message || 'Đã chốt kỳ lương thành công');
                        this.tableManager?.refresh();
                    } else {
                        AppUtils.Notify.error(res.message || 'Có lỗi xảy ra');
                    }
                } catch (err) {
                    AppUtils.Notify.error(err.message || 'Có lỗi xảy ra');
                }
            }
        });
    }
    
    // ============================================================
    // MONTH-YEAR PICKER
    // ============================================================
    initMonthYearPicker() {
        const pickerLib = window.CustomDateComponents?.CustomMonthYearPicker;
        if (!pickerLib) return;

        this.monthYearPicker = new pickerLib({
            triggerId: 'month-year-trigger',
            popoverId: 'month-year-popover',
            displayId: 'month-year-display',
            pickerYearId: 'picker-year',
            prevYearId: 'prev-year',
            nextYearId: 'next-year',
            monthGridId: 'month-grid',
            selectedYear: this.selectedYear,
            selectedMonth: this.selectedMonth,
            monthGridColumns: 4,
            placeholder: '-- Chọn tháng --',
            displayFormatter: (year, month) => `${String(month).padStart(2, '0')}/${year}`,
            selectedClass: 'bg-green-500 text-white font-bold',
            currentClass: 'bg-green-100 text-green-700 font-medium ring-1 ring-green-300',
            defaultClass: 'hover:bg-green-50 hover:text-green-600 text-slate-700',
            canOpen: () => this.state.currentMode !== 'edit',
            onOpenDenied: () => {
                AppUtils.Notify.warning('Không thể thay đổi tháng khi chỉnh sửa');
            },
            onChange: ({ year, month }) => {
                if (!year || !month) return;

                this.selectedMonth = month;
                this.selectedYear = year;

                document.getElementById('input-thang').value = this.selectedMonth;
                document.getElementById('input-nam').value = this.selectedYear;

                this.loadDefaults();
            }
        });
    }

    initCustomDatePickers() {
        const pickerLib = window.CustomDateComponents?.CustomDatePicker;
        if (!pickerLib) return;

        const dateInputIds = [
            'input-ngay-bat-dau',
            'input-ngay-ket-thuc',
            'input-ngay-chot-luong'
        ];

        dateInputIds.forEach((id) => {
            this.customDatePickers[id] = new pickerLib({
                inputId: id,
                placeholder: 'Chọn ngày',
                selectedDayClass: 'bg-green-500 text-white border-green-500',
                todayDayClass: 'border-green-300 text-green-700',
                normalDayClass: 'text-slate-700 hover:bg-green-50 hover:border-green-200'
            });
        });

        this.syncCustomDatePickers();
    }

    syncCustomDatePickers() {
        Object.values(this.customDatePickers).forEach((picker) => {
            if (picker && typeof picker.syncFromInput === 'function') {
                picker.syncFromInput();
            }
        });
    }

    syncCustomDatePickerById(inputId) {
        const picker = this.customDatePickers[inputId];
        if (picker && typeof picker.syncFromInput === 'function') {
            picker.syncFromInput();
        }
    }

    // ============================================================
    // ✅ MỚI: DATE SYNCHRONIZATION (Cross-month support)
    // ============================================================
    initDateSync() {
        const startInput = document.getElementById('input-ngay-bat-dau');
        const endInput = document.getElementById('input-ngay-ket-thuc');
        
        if (!startInput || !endInput) return;
        
        // ✅ Khi chọn ngày bắt đầu → Auto tính ngày kết thúc (+ periodDays)
        this.eventManager.add(startInput, 'change', () => {
            const startDate = new Date(startInput.value);
            if (isNaN(startDate.getTime())) return;
            
            // Tính ngày kết thúc = ngày bắt đầu + (periodDays - 1)
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 29);
            
            endInput.value = this.formatDateForInput(endDate);
            this.syncCustomDatePickerById('input-ngay-ket-thuc');
            
            // Update ngày chốt
            this.updateClosingDateConstraints();
        });
        
        // ✅ Khi chọn ngày kết thúc → Auto tính ngày bắt đầu (- periodDays)
        this.eventManager.add(endInput, 'change', () => {
            const endDate = new Date(endInput.value);
            if (isNaN(endDate.getTime())) return;
            
            // Tính ngày bắt đầu = ngày kết thúc - (periodDays - 1)
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 29);
            
            startInput.value = this.formatDateForInput(startDate);
            this.syncCustomDatePickerById('input-ngay-bat-dau');
            
            // Update ngày chốt
            this.updateClosingDateConstraints();
        });
    }

    updateClosingDateConstraints() {
        const endInput = document.getElementById('input-ngay-ket-thuc');
        const closingInput = document.getElementById('input-ngay-chot-luong');
        
        if (!endInput?.value || !closingInput) return;
        
        const endDate = new Date(endInput.value);
        if (isNaN(endDate.getTime())) return;
        
        // Min: endDate + 1 day
        const minDate = new Date(endDate);
        minDate.setDate(minDate.getDate() + 1);
        
        // Max: endDate + 10 days
        const maxDate = new Date(endDate);
        maxDate.setDate(maxDate.getDate() + 10);
        
        // Default: endDate + 5 days
        const defaultDate = new Date(endDate);
        defaultDate.setDate(defaultDate.getDate() + 5);
        
        closingInput.min = this.formatDateForInput(minDate);
        closingInput.max = this.formatDateForInput(maxDate);
        
        // Set default if empty or out of range
        const currentClosing = closingInput.value ? new Date(closingInput.value) : null;
        if (!currentClosing || currentClosing < minDate || currentClosing > maxDate) {
            closingInput.value = this.formatDateForInput(defaultDate);
        }

        this.syncCustomDatePickerById('input-ngay-chot-luong');
    }

    // ============================================================
    // ✅ CẬP NHẬT: LOAD DEFAULTS WITH DATE CONSTRAINTS
    // ============================================================
    async loadDefaults() {
        if (!this.selectedMonth || !this.selectedYear) return;
        
        try {
            const res = await AppUtils.API.get(this.config.apiUrls.getDefaults, {
                month: this.selectedMonth,
                year: this.selectedYear
            });
            
            if (res.success && res.data) {
                const data = res.data;
                
                // Store period days
                this.periodDays = data.period_days || 30;
                
                // Store constraints
                this.dateConstraints = {
                    minStart: data.min_ngay_bat_dau,
                    maxStart: data.max_ngay_bat_dau,
                    minEnd: data.min_ngay_ket_thuc,
                    maxEnd: data.max_ngay_ket_thuc,
                };
                
                // Apply constraints to inputs
                this.applyDateConstraints();
                
                // Set values
                document.getElementById('input-ngay-bat-dau').value = data.ngay_bat_dau;
                document.getElementById('input-ngay-ket-thuc').value = data.ngay_ket_thuc;
                document.getElementById('input-ngay-chot-luong').value = data.ngay_chot_luong;
                
                // Set closing constraints
                const closingInput = document.getElementById('input-ngay-chot-luong');
                if (closingInput) {
                    closingInput.min = data.min_ngay_chot;
                    closingInput.max = data.max_ngay_chot;
                }

                this.syncCustomDatePickers();
            }
        } catch (err) {
            console.error('Error loading defaults:', err);
            AppUtils.Notify.error('Không thể tải thông tin mặc định');
        }
    }

    // ✅ MỚI: Apply date constraints to inputs
    applyDateConstraints() {
        if (!this.dateConstraints) return;
        
        const startInput = document.getElementById('input-ngay-bat-dau');
        const endInput = document.getElementById('input-ngay-ket-thuc');
        
        if (startInput) {
            startInput.min = this.dateConstraints.minStart;
            startInput.max = this.dateConstraints.maxStart;
        }
        
        if (endInput) {
            endInput.min = this.dateConstraints.minEnd;
            endInput.max = this.dateConstraints.maxEnd;
        }
    }

    // ============================================================
    // ✅ CẬP NHẬT: FORM HANDLING (Lock month on edit)
    // ============================================================
    handleBeforeOpen(mode) {
        const repeatWrapper = document.getElementById('repeat-checkbox-wrapper');
        const repeatCheckbox = document.getElementById('checkbox-lap-theo-thang');
        const monthTrigger = document.getElementById('month-year-trigger');
        
        if (mode === 'edit') {
            // Ẩn checkbox Lặp theo tháng
            if (repeatWrapper) repeatWrapper.classList.add('hidden');
            if (repeatCheckbox) repeatCheckbox.checked = false;
            
            // ✅ MỚI: Disable month picker (visual feedback)
            if (monthTrigger) {
                monthTrigger.classList.add('opacity-60', 'cursor-not-allowed', 'pointer-events-none');
                monthTrigger.setAttribute('title', 'Không thể thay đổi tháng khi chỉnh sửa');
            }
        } else {
            // Hiện checkbox
            if (repeatWrapper) repeatWrapper.classList.remove('hidden');
            
            // ✅ MỚI: Enable month picker
            if (monthTrigger) {
                monthTrigger.classList.remove('opacity-60', 'cursor-not-allowed', 'pointer-events-none');
                monthTrigger.removeAttribute('title');
            }
        }
    }

    resetForm() {
        this.selectedMonth = null;
        this.selectedYear = null;
        this.dateConstraints = null;

        document.getElementById('input-thang').value = '';
        document.getElementById('input-nam').value = '';

        if (this.monthYearPicker && typeof this.monthYearPicker.clear === 'function') {
            this.monthYearPicker.clear({ silent: true });
        }
        
        const repeatCheckbox = document.getElementById('checkbox-lap-theo-thang');
        if (repeatCheckbox) repeatCheckbox.checked = false;
        
        // Reset date constraints
        const startInput = document.getElementById('input-ngay-bat-dau');
        const endInput = document.getElementById('input-ngay-ket-thuc');
        const closingInput = document.getElementById('input-ngay-chot-luong');
        
        [startInput, endInput, closingInput].forEach(input => {
            if (input) {
                input.removeAttribute('min');
                input.removeAttribute('max');
            }
        });

        this.syncCustomDatePickers();
        
        // Re-enable month picker
        const monthTrigger = document.getElementById('month-year-trigger');
        if (monthTrigger) {
            monthTrigger.classList.remove('opacity-60', 'cursor-not-allowed', 'pointer-events-none');
            monthTrigger.removeAttribute('title');
        }
    }

    fillFormData(data) {
        // Set month/year (readonly on edit)
        this.selectedMonth = Number.parseInt(data.thang, 10) || null;
        this.selectedYear = Number.parseInt(data.nam, 10) || null;

        if (this.monthYearPicker && typeof this.monthYearPicker.setValue === 'function') {
            this.monthYearPicker.setValue(this.selectedYear, this.selectedMonth, { silent: true });
        }
        
        document.getElementById('input-thang').value = this.selectedMonth || '';
        document.getElementById('input-nam').value = this.selectedYear || '';
        
        // ✅ MỚI: Apply constraints from API response
        if (data.min_ngay_bat_dau) {
            this.dateConstraints = {
                minStart: data.min_ngay_bat_dau,
                maxStart: data.max_ngay_bat_dau,
                minEnd: data.min_ngay_ket_thuc,
                maxEnd: data.max_ngay_ket_thuc,
            };
            this.applyDateConstraints();
        }
        
        // Set dates
        document.getElementById('input-ngay-bat-dau').value = data.ngay_bat_dau_raw || '';
        document.getElementById('input-ngay-ket-thuc').value = data.ngay_ket_thuc_raw || '';
        document.getElementById('input-ngay-chot-luong').value = data.ngay_chot_luong_raw || '';
        
        // Update closing constraints
        this.updateClosingDateConstraints();
        this.syncCustomDatePickers();
    }

    getFormData(form) {
        return {
            thang: document.getElementById('input-thang').value,
            nam: document.getElementById('input-nam').value,
            ngay_bat_dau: document.getElementById('input-ngay-bat-dau').value,
            ngay_ket_thuc: document.getElementById('input-ngay-ket-thuc').value,
            ngay_chot_luong: document.getElementById('input-ngay-chot-luong').value,
            lap_theo_thang: document.getElementById('checkbox-lap-theo-thang')?.checked || false,
        };
    }

    // ============================================================
    // UTILITIES
    // ============================================================
    formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

// Initialize
window.KyLuongManager = new KyLuongManager();
document.addEventListener('DOMContentLoaded', () => window.KyLuongManager.init());