/**
 * File: static/js/quan_ly_luong/che_do_luong_form.js
 * Controller cho Form Chế độ lương (Tạo mới/Cập nhật)
 * Version: 2.0 - Không có chế độ mặc định, bổ sung ngày áp dụng
 */

class CheDoLuongFormController extends BaseFormManager {
    constructor() {
        super({
            formId: 'che-do-luong-form',
            submitBtnId: 'btn-save',
            
            apiUrls: {
                create: '/hrm/quan-ly-luong/api/che-do-luong/create/',
                update: (id) => `/hrm/quan-ly-luong/api/che-do-luong/${id}/update/`,
                detail: (id) => `/hrm/quan-ly-luong/api/che-do-luong/${id}/detail/`,
                checkConflict: '/hrm/quan-ly-luong/api/che-do-luong/check-conflicts/',
            },
            
            idParamRegex: /\/(\d+)\/(update|edit)\//,
            
            autoCode: {
                sourceField: 'ten_che_do',
                targetField: 'ma_che_do'
            },
            
            buildPayload: () => this.buildPayload(),
            validateLogic: (payload) => this.validateLogic(payload),
            fillFormData: (data) => this.fillFormData(data),
            onSuccess: () => this.onSuccess(),
        });

        // State
        this.selectedData = {
            depts: [],
            deptIds: [],
            emps: [],
            empIds: []
        };
        this.quyTacManager = null;
        this.employeeSelector = null;
        this.pendingPayload = null;
    }

    onAfterInit() {
        this.initEmployeeSelector();
        this.bindEmployeeSelectorButton();
        this.quyTacManager = new QuyTacManager();
        this.initDateFields();
    }

    // ============================================================
    // DATE FIELDS
    // ============================================================

    initDateFields() {
        const ngayApDung = document.getElementById('ngay_ap_dung');
        const ngayHetHan = document.getElementById('ngay_het_han');
        
        if (ngayApDung) {
            // Set min date là hôm nay
            const today = new Date().toISOString().split('T')[0];
            ngayApDung.min = today;
            
            ngayApDung.addEventListener('change', () => {
                if (ngayHetHan) {
                    ngayHetHan.min = ngayApDung.value;
                }
            });
        }
    }

    // ============================================================
    // EMPLOYEE SELECTOR
    // ============================================================

    initEmployeeSelector() {
        this.employeeSelector = new EmployeeSelectorController({
            scheduleId: this.state.currentId,
            onConfirm: (data) => this.handleEmployeeSelectionConfirm(data)
        });
    }

    bindEmployeeSelectorButton() {
        const btn = document.getElementById('btn-open-selector');
        if (btn) {
            btn.addEventListener('click', () => {
                this.employeeSelector.open({
                    deptIds: this.selectedData.deptIds,
                    emps: this.selectedData.emps
                });
            });
        }
    }

    handleEmployeeSelectionConfirm(data) {
        this.selectedData = data;
        
        document.getElementById('hidden-dept-ids').value = JSON.stringify(data.deptIds || []);
        document.getElementById('hidden-emp-ids').value = JSON.stringify(data.empIds || []);
        
        this.renderSelectedSummary();
    }

    renderSelectedSummary() {
        const container = document.getElementById('btn-open-selector');
        const placeholder = document.getElementById('emp-placeholder');
        
        if (!container) return;
        
        const totalDepts = this.selectedData.depts?.length || 0;
        const totalEmps = this.selectedData.emps?.length || 0;
        const total = totalDepts + totalEmps;
        
        if (total === 0) {
            placeholder.classList.remove('hidden');
            container.querySelectorAll('.selection-badge').forEach(el => el.remove());
            return;
        }
        
        placeholder.classList.add('hidden');
        container.querySelectorAll('.selection-badge').forEach(el => el.remove());
        
        // Render bộ phận
        (this.selectedData.depts || []).forEach(dept => {
            const badge = document.createElement('span');
            badge.className = 'selection-badge inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-100 text-orange-700 rounded-md text-xs font-medium border border-orange-200';
            badge.innerHTML = `
                <i class="fas fa-building text-[10px]"></i>
                <span>${dept.name}</span>
            `;
            container.appendChild(badge);
        });
        
        // Render nhân viên
        (this.selectedData.emps || []).forEach(emp => {
            const badge = document.createElement('span');
            badge.className = 'selection-badge inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium border border-blue-200';
            badge.innerHTML = `
                <i class="fas fa-user text-[10px]"></i>
                <span>${emp.name}</span>
            `;
            container.appendChild(badge);
        });
    }

    // ============================================================
    // FORM LOGIC
    // ============================================================

    buildPayload() {
        return {
            ten_che_do: this.getFieldValue('ten_che_do'),
            ma_che_do: this.getFieldValue('ma_che_do'),
            ghi_chu: this.getFieldValue('ghi_chu'),
            ngay_ap_dung: this.getFieldValue('ngay_ap_dung') || null,
            ngay_het_han: this.getFieldValue('ngay_het_han') || null,
            dept_ids: this.selectedData.deptIds || [],
            emp_ids: this.selectedData.empIds || [],
            quy_tac: this.quyTacManager ? this.quyTacManager.getData() : [],
        };
    }

    validateLogic(payload) {
        // Validate tên
        if (!payload.ten_che_do?.trim()) {
            return 'Vui lòng nhập tên chế độ lương';
        }
        
        // Validate tên max 200 ký tự
        if (payload.ten_che_do.trim().length > 200) {
            return 'Tên chế độ lương tối đa 200 ký tự';
        }
        
        // Validate mã
        if (!payload.ma_che_do?.trim()) {
            return 'Vui lòng nhập mã chế độ lương';
        }
        
        // Validate mã: 3-50 ký tự, chỉ CHỮ HOA, số, gạch ngang, gạch dưới
        const maCode = payload.ma_che_do.trim();
        if (maCode.length < 3 || maCode.length > 50) {
            return 'Mã chế độ lương phải có độ dài từ 3 đến 50 ký tự';
        }
        
        if (!/^[A-Z0-9_-]+$/.test(maCode)) {
            return 'Mã chế độ lương chỉ được chứa chữ HOA, số, gạch ngang (-) và gạch dưới (_)';
        }
        
        // Validate phải chọn ít nhất 1 nhân viên hoặc bộ phận
        const totalSelected = (payload.dept_ids?.length || 0) + (payload.emp_ids?.length || 0);
        if (totalSelected === 0) {
            return 'Vui lòng chọn ít nhất một nhân viên hoặc bộ phận áp dụng';
        }
        
        // Validate ngày
        if (payload.ngay_ap_dung) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const apDung = new Date(payload.ngay_ap_dung);
            
            if (apDung < today) {
                return 'Ngày áp dụng phải lớn hơn hoặc bằng ngày hiện tại';
            }
        }
        
        if (payload.ngay_het_han && payload.ngay_ap_dung) {
            const apDung = new Date(payload.ngay_ap_dung);
            const hetHan = new Date(payload.ngay_het_han);
            
            if (hetHan <= apDung) {
                return 'Ngày hết hạn phải lớn hơn ngày áp dụng';
            }
        }
        
        return null; // Valid
    }

    async fillFormData(data) {
        // Fill basic fields
        this.setFieldValue('ten_che_do', data.ten_che_do);
        this.setFieldValue('ma_che_do', data.ma_che_do);
        this.setFieldValue('ghi_chu', data.ghi_chu);
        
        // Fill date fields
        if (data.ngay_ap_dung) {
            this.setFieldValue('ngay_ap_dung', data.ngay_ap_dung);
        }
        if (data.ngay_het_han) {
            this.setFieldValue('ngay_het_han', data.ngay_het_han);
        }
        
        // Disable mã khi update (nếu đã có dữ liệu liên quan)
        if (this.state.isUpdateMode && !data.can_modify_code) {
            this.disableCodeField();
        }
        
        // Restore employee/department selection
        this.selectedData = {
            depts: data.depts || [],
            deptIds: data.dept_ids || [],
            emps: data.emps || [],
            empIds: data.emp_ids || []
        };
        
        if (this.quyTacManager && data.quy_tac) {
            this.quyTacManager.setData(data.quy_tac);
        }
        
        document.getElementById('hidden-dept-ids').value = JSON.stringify(this.selectedData.deptIds);
        document.getElementById('hidden-emp-ids').value = JSON.stringify(this.selectedData.empIds);
        
        this.renderSelectedSummary();
    }

    // ============================================================
    // SUBMIT WITH CONFLICT CHECK
    // ============================================================

    async submit() {
        if (this.state.isSubmitting) return;

        // HTML5 validation
        if (!this.form.checkValidity()) {
            this.form.reportValidity();
            return;
        }

        // Build payload
        const payload = this.config.buildPayload();
        
        // Custom validation
        const errorMsg = this.config.validateLogic(payload);
        if (errorMsg) {
            AppUtils.Notify.error(errorMsg);
            return;
        }

        // Check conflict trước khi submit
        const hasConflict = await this.checkConflicts(payload);
        if (hasConflict) {
            return; // Conflict modal sẽ xử lý confirm
        }

        // Không có conflict -> Submit
        this.doSubmit(payload);
    }

    async checkConflicts(payload) {
        try {
            const checkPayload = {
                dept_ids: payload.dept_ids || [],
                emp_ids: payload.emp_ids || [],
                exclude_id: this.state.currentId,
                effective_date: payload.ngay_ap_dung
            };
            
            const res = await AppUtils.API.post(this.config.apiUrls.checkConflict, checkPayload);
            
            if (res.success) {
                return false; // Không có conflict
            } else if (res.conflicts?.length > 0) {  // ← SỬA: Bỏ .data, check trực tiếp res.conflicts
                this.showConflictWarning(res.conflicts, payload);
                return true; // Có conflict
            }
            
            return false;
        } catch (e) {
            console.error('Check conflict error:', e);
            return false;
        }
    }

    showConflictWarning(conflicts, payload) {
        let listHtml = '';
        
        // Nhóm theo chế độ lương hiện tại
        const groupedBySchedule = {};
        conflicts.forEach(c => {
            const scheduleId = c.current_schedule_id;
            if (!groupedBySchedule[scheduleId]) {
                groupedBySchedule[scheduleId] = {
                    name: c.current_schedule_name,
                    items: []
                };
            }
            groupedBySchedule[scheduleId].items.push(c);
        });

        Object.values(groupedBySchedule).forEach(group => {
            listHtml += `<div class="mb-3 p-2 bg-orange-50 rounded border border-orange-200">
                <div class="font-semibold text-orange-700 text-xs mb-1">
                    <i class="fas fa-money-bill-wave mr-1"></i>${group.name}
                </div>
                <ul class="list-none pl-0 text-xs space-y-1">`;
            
            group.items.slice(0, 5).forEach(c => {
                const icon = c.type === 'dept' 
                    ? '<i class="fas fa-building text-orange-500 mr-1"></i>' 
                    : '<i class="fas fa-user text-orange-500 mr-1"></i>';
                const name = c.type === 'dept' ? c.dept_name : c.emp_name;
                listHtml += `<li>${icon}${name}</li>`;
            });
            
            if (group.items.length > 5) {
                listHtml += `<li class="text-slate-500 italic">...và ${group.items.length - 5} mục khác</li>`;
            }
            
            listHtml += `</ul></div>`;
        });

        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const formatDate = (d) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;

        const message = `
            <p class="text-sm text-slate-600 mb-2">Các nhân viên/bộ phận sau đang thuộc chế độ lương khác:</p>
            <div class="max-h-48 overflow-y-auto mb-3">${listHtml}</div>
            
            <div class="border-t border-slate-200 pt-3 mt-3">
                <p class="text-sm font-medium text-slate-700 mb-2">Chọn ngày bắt đầu áp dụng chế độ mới:</p>
                <div class="flex gap-4">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="confirm_effective_date" value="today" checked class="text-green-600 focus:ring-green-500">
                        <span class="text-sm">Hôm nay (${formatDate(today)})</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="confirm_effective_date" value="tomorrow" class="text-green-600 focus:ring-green-500">
                        <span class="text-sm">Ngày mai (${formatDate(tomorrow)})</span>
                    </label>
                </div>
            </div>
            
            <p class="text-sm text-slate-600 mt-3">Bạn có muốn <strong>chuyển</strong> các đối tượng này sang chế độ lương mới không?</p>
            <p class="text-xs text-slate-400 mt-1"><i class="fas fa-info-circle mr-1"></i>Dữ liệu trước ngày áp dụng sẽ được giữ nguyên.</p>
        `;

        this.pendingPayload = payload;

        this.showCustomConfirmModal({
            title: 'Phát hiện xung đột',
            message: message,
            confirmText: 'Đồng ý chuyển',
            cancelText: 'Hủy',
            type: 'warning',
            onConfirm: () => {
                const modal = document.getElementById('custom-conflict-modal');
                const selectedDate = modal?.querySelector('input[name="confirm_effective_date"]:checked')?.value || 'today';
                this.doSubmit({ ...this.pendingPayload, force_transfer: true, effective_date: selectedDate });
            },
            onCancel: () => {
                this.pendingPayload = null;
            }
        });
    }

    async doSubmit(payload) {
        this._setLoading(true);

        try {
            let res;
            if (this.state.isUpdateMode) {
                const url = this.config.apiUrls.update(this.state.currentId);
                res = await AppUtils.API.put(url, payload);
            } else {
                const url = this.config.apiUrls.create;
                res = await AppUtils.API.post(url, payload);
            }

            if (res.success) {
                AppUtils.Notify.success(res.message || "Lưu thành công!");
                
                // Show transferred info nếu có
                if (res.transferred?.length > 0) {
                    const count = res.transferred.length;
                    setTimeout(() => {
                        AppUtils.Notify.info(`Đã chuyển ${count} nhân viên/bộ phận sang chế độ lương mới`);
                    }, 500);
                }
                
                this.config.onSuccess(res);
            } else if (res.require_confirm && res.conflicts) {
                // Conflict từ server
                this._setLoading(false);
                this.showConflictWarning(res.conflicts, payload);
            } else {
                AppUtils.Notify.error(res.message || "Có lỗi xảy ra");
                this._setLoading(false);
            }
        } catch (err) {
            console.error('⛔ Submit error:', err);
            AppUtils.Notify.error("Lỗi hệ thống: " + (err.message || err));
            this._setLoading(false);
        }
    }

    showCustomConfirmModal(options) {
        const {
            title = 'Xác nhận',
            message = '',
            confirmText = 'Đồng ý',
            cancelText = 'Hủy',
            type = 'warning',
            onConfirm = () => {},
            onCancel = () => {}
        } = options;

        document.getElementById('custom-conflict-modal')?.remove();

        const iconHtml = `
            <svg class="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>`;

        const modal = document.createElement('div');
        modal.id = 'custom-conflict-modal';
        modal.className = 'fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full transform transition-all duration-300 scale-95 opacity-0" id="conflict-modal-content">
                <div class="p-6">
                    <div class="flex items-start gap-4 mb-4">
                        <div class="shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                            ${iconHtml}
                        </div>
                        <div class="flex-1">
                            <h3 class="text-lg font-semibold text-slate-900">${title}</h3>
                            <div class="mt-2 text-sm text-slate-600">${message}</div>
                        </div>
                    </div>
                    
                    <div class="flex justify-end gap-3 mt-6">
                        <button type="button" id="conflict-cancel-btn" class="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                            ${cancelText}
                        </button>
                        <button type="button" id="conflict-confirm-btn" class="px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm">
                            ${confirmText}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const modalContent = modal.querySelector('#conflict-modal-content');
        const confirmBtn = modal.querySelector('#conflict-confirm-btn');
        const cancelBtn = modal.querySelector('#conflict-cancel-btn');

        requestAnimationFrame(() => {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        });

        const closeModal = () => {
            modalContent.classList.add('scale-95', 'opacity-0');
            modalContent.classList.remove('scale-100', 'opacity-100');
            setTimeout(() => modal.remove(), 200);
        };

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
                onCancel();
            }
        });

        cancelBtn.addEventListener('click', () => {
            closeModal();
            onCancel();
        });

        confirmBtn.addEventListener('click', () => {
            closeModal();
            onConfirm();
        });
    }

    onSuccess() {
        setTimeout(() => {
            window.location.href = '/hrm/quan-ly-luong/che-do-luong/';
        }, 1000);
    }
}

// Init
window.cheDoLuongFormController = new CheDoLuongFormController();
document.addEventListener('DOMContentLoaded', () => {
    window.cheDoLuongFormController.init();
});