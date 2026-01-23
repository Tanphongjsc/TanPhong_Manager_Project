/**
 * File: static/js/quan_ly_luong/che_do_luong_form.js
 * Controller cho Form Chế độ lương (Tạo mới/Cập nhật)
 * Version: 1.0 - Thiết lập cơ bản + Employee Selector
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
            
            // ✅ Auto-generate mã từ tên
            autoCode: {
                sourceField: 'ten_che_do',
                targetField: 'ma_che_do'
            },
            
            buildPayload: () => this.buildPayload(),
            validateLogic: (payload) => this.validateLogic(payload),
            fillFormData: (data) => this.fillFormData(data),
            onSuccess: () => this.onSuccess(),
        });

        // State quản lý nhân viên/phòng ban
        this.selectedData = {
            depts: [],
            deptIds: [],
            emps: [],
            empIds:  []
        };

        this.employeeSelector = null;
    }

    onAfterInit() {
        this.initEmployeeSelector();
        this.bindEmployeeSelectorButton();
    }

    // ============================================================
    // EMPLOYEE SELECTOR INTEGRATION
    // ============================================================

    initEmployeeSelector() {
        this.employeeSelector = new EmployeeSelectorController({
            scheduleId: this.state.currentId, // Để exclude khi check conflict
            onConfirm: (data) => this.handleEmployeeSelectionConfirm(data)
        });
    }

    bindEmployeeSelectorButton() {
        const btn = document.getElementById('btn-open-selector');
        if (btn) {
            btn.addEventListener('click', () => {
                // Truyền dữ liệu hiện tại vào selector để restore selection
                this.employeeSelector.open({
                    deptIds: this.selectedData.deptIds,
                    emps: this.selectedData.emps
                });
            });
        }
    }

    handleEmployeeSelectionConfirm(data) {
        this.selectedData = data;
        
        // Update hidden inputs
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
            // Xóa các badges cũ
            container.querySelectorAll('.selection-badge').forEach(el => el.remove());
            return;
        }
        
        placeholder.classList.add('hidden');
        
        // Xóa badges cũ
        container.querySelectorAll('.selection-badge').forEach(el => el.remove());
        
        // Render bộ phận
        (this.selectedData.depts || []).forEach(dept => {
            const badge = document.createElement('span');
            badge.className = 'selection-badge inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-md text-xs font-medium border border-green-200';
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
            dept_ids: this.selectedData.deptIds || [],
            emp_ids: this.selectedData.empIds || [],
        };
    }

    validateLogic(payload) {
        // Validate tên
        if (!payload.ten_che_do?.trim()) {
            return 'Vui lòng nhập tên chế độ lương';
        }
        
        // Validate mã
        if (!payload.ma_che_do?.trim()) {
            return 'Vui lòng nhập mã chế độ lương';
        }
        
        // Validate mã chỉ chứa chữ, số, gạch ngang, gạch dưới
        if (! AppUtils.Validation.isValidCode(payload.ma_che_do)) {
            return 'Mã chế độ lương chỉ được chứa chữ, số, gạch ngang (-) và gạch dưới (_)';
        }
        
        // Validate phải chọn ít nhất 1 nhân viên hoặc bộ phận
        const totalSelected = (payload.dept_ids?.length || 0) + (payload.emp_ids?.length || 0);
        if (totalSelected === 0) {
            return 'Vui lòng chọn ít nhất một nhân viên hoặc bộ phận áp dụng';
        }
        
        return null; // Valid
    }

    async fillFormData(data) {
        // Fill basic fields
        this.setFieldValue('ten_che_do', data.ten_che_do);
        this.setFieldValue('ma_che_do', data.ma_che_do);
        this.setFieldValue('ghi_chu', data.ghi_chu);
        
        // ✅ Disable mã khi update (nếu đã có dữ liệu liên quan)
        if (this.state.isUpdateMode && ! data.can_modify_code) {
            this.disableCodeField();
        }
        
        // Restore employee/department selection
        this.selectedData = {
            depts:  data.depts || [],
            deptIds: data.dept_ids || [],
            emps: data.emps || [],
            empIds: data.emp_ids || []
        };
        
        document.getElementById('hidden-dept-ids').value = JSON.stringify(this.selectedData.deptIds);
        document.getElementById('hidden-emp-ids').value = JSON.stringify(this.selectedData.empIds);
        
        this.renderSelectedSummary();
    }

    // ✅ OVERRIDE submit để check conflict trước
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

        // ✅ CHECK CONFLICT trước khi submit
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
                emp_ids:  payload.emp_ids || [],
                exclude_id: this.state.currentId // Exclude chính nó khi update
            };
            
            const res = await AppUtils.API.post(this.config.apiUrls.checkConflict, checkPayload);
            
            if (res.success) {
                return false; // Không có conflict
            } else if (res.data?.conflicts?.length > 0) {
                this.showConflictWarning(res.data.conflicts, payload);
                return true; // Có conflict
            }
            
            return false;
        } catch (e) {
            console.error('Check conflict error:', e);
            return false; // Nếu API lỗi, vẫn cho submit
        }
    }

    showConflictWarning(conflicts, payload) {
        let listHtml = '';
        conflicts.slice(0, 10).forEach(c => {
            const icon = c.type === 'dept' 
                ? '<i class="fas fa-building text-orange-500 mr-1"></i>' 
                : '<i class="fas fa-user text-orange-500 mr-1"></i>';
            const name = c.type === 'dept' ?  c.dept_name : c.emp_name;
            const current = c.current_schedule_name;
            
            listHtml += `<li class="py-1 flex items-start gap-2">
                ${icon}
                <span><strong>${name}</strong> đang thuộc <strong class="text-orange-600">${current}</strong></span>
            </li>`;
        });
        
        if (conflicts.length > 10) {
            listHtml += `<li class="py-1 text-slate-500 italic">...và ${conflicts.length - 10} mục khác</li>`;
        }

        const message = `
            <p class="text-sm text-slate-600 mb-2">Các nhân viên/bộ phận sau đang thuộc chế độ lương khác:</p>
            <ul class="list-none pl-0 text-xs max-h-40 overflow-y-auto bg-slate-50 rounded p-3 mb-3 space-y-1">${listHtml}</ul>
            <p class="text-sm text-slate-600">Bạn có muốn <strong>chuyển</strong> họ sang chế độ lương này không?</p>
        `;

        AppUtils.Modal.showConfirm({
            title: 'Phát hiện xung đột',
            message:  message,
            type: 'warning',
            confirmText: 'Đồng ý chuyển',
            onConfirm: () => this.doSubmit({ ...payload, force_transfer: true })
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
            } else {
                AppUtils.Notify.error(res.message || "Có lỗi xảy ra");
                this._setLoading(false);
            }
        } catch (err) {
            console.error('⛔ Submit error:', err);
            AppUtils.Notify.error("Lỗi hệ thống:  " + (err.message || err));
            this._setLoading(false);
        }
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