/**
 * QuyTacManager - Quản lý bảng quy tắc chế độ lương
 * Version: 2.0 - Bổ sung thứ tự hiển thị và danh mục nguồn dữ liệu chi tiết
 */
class QuyTacManager {
    static FIXED_ELEMENT_CODE = 'THUC_LINH';
    static DEFAULT_SYSTEM_SOURCE = 'thietlapsolieucodinh.giatrimacdinh';
    static DEFAULT_SYSTEM_SOURCE_LUONG_THUC_TE = 'bangluong.luong_thuc_te_phan_bo';

    constructor(options = {}) {
        this.options = {
            tbodyId: 'quy-tac-tbody',
            emptyId: 'quy-tac-empty',
            countId: 'quy-tac-count',
            hiddenInputId: 'hidden-quy-tac-data',
            btnAddId: 'btn-add-quy-tac',
            ...options
        };

        this.quyTacList = [];
        this.fixedElement = null;
        this.draggingId = null;

        this.tbody = document.getElementById(this.options.tbodyId);
        this.emptyState = document.getElementById(this.options.emptyId);
        this.countEl = document.getElementById(this.options.countId);
        this.hiddenInput = document.getElementById(this.options.hiddenInputId);
        this.btnAdd = document.getElementById(this.options.btnAddId);

        this.nguonDuLieuOptions = [
            { value: 'manual', label: 'Tự nhập' },
            { value: 'system', label: 'Từ hệ thống' },
            { value: 'formula', label: 'Công thức' }
        ];

        this.systemNguonDuLieuOptions = [
            { value: 'thietlapsolieucodinh.giatrimacdinh', label: 'Thiết lập số liệu cố định' },
            { value: 'bangluong.luong_thuc_te_phan_bo', label: 'Lương thực tế phân bổ công VP + SX' },
            { value: 'bangchamcong.tong_cong_lamviec', label: 'Bảng công - Tổng công làm việc' },
            { value: 'bangchamcong.tong_thoigian_lamviec', label: 'Bảng công - Tổng giờ làm việc' },
            { value: 'bangchamcong.tong_thoigian_lamthem', label: 'Bảng công - Tổng giờ làm thêm' },
            { value: 'bangchamcong.tong_so_luong_an', label: 'Bảng công - Số suất ăn' },
            { value: 'bangchamcong.tong_di_muon_phut', label: 'Bảng công - Tổng phút đi muộn' },
            { value: 'bangchamcong.tong_ve_som_phut', label: 'Bảng công - Tổng phút về sớm' },
            { value: 'bangchamcong.tong_ngay_vang', label: 'Bảng công - Số ngày vắng' },
            { value: 'bangchamcong.tong_cong_vp_thucte', label: 'Bảng công - Công VP thực tế' },
            { value: 'bangchamcong.tong_tien_sx', label: 'Bảng công - Thành tiền sản xuất' },
            { value: 'lichlamviecthucte.tong_cong_lamviec_thucte', label: 'Lịch thực tế - Công chuẩn tháng' },
            { value: 'lichlamviecthucte.tong_gio_lamviec_chuan', label: 'Lịch thực tế - Giờ chuẩn tháng' }
        ];

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadFixedElement();
    }

    async loadFixedElement() {
        try {
            const res = await AppUtils.API.get('/hrm/quan-ly-luong/api/phan-tu-luong/list', {
                page_size: 999
            });

            if (res.success && res.data) {
                const fixedEl = res.data.find(pt => pt.maphantu === QuyTacManager.FIXED_ELEMENT_CODE);
                if (fixedEl) {
                    this.fixedElement = {
                        phantuluong_id: fixedEl.id,
                        tenphantu: fixedEl.tenphantu,
                        maphantu: fixedEl.maphantu,
                        nguondulieu: 'formula',
                        nguondulieu_chitiet: '',
                        bieuthuc: '',
                        mota: '',
                        thutuhienthi: 999999,
                        isFixed: true
                    };
                    this.ensureFixedElement();
                }
            }
        } catch (e) {
            console.error('Load fixed element error:', e);
        }
    }

    ensureFixedElement() {
        if (!this.fixedElement) return;

        const idx = this.quyTacList.findIndex(q => q.maphantu === QuyTacManager.FIXED_ELEMENT_CODE);
        if (idx === -1) {
            this.quyTacList.push({ ...this.fixedElement });
        } else {
            this.quyTacList[idx].nguondulieu = 'formula';
            this.quyTacList[idx].nguondulieu_chitiet = '';
            this.quyTacList[idx].isFixed = true;
        }

        this.sortWithFixedAtEnd();
        this.render();
    }

    isFixedElement(maphantu) {
        return String(maphantu || '').toUpperCase() === QuyTacManager.FIXED_ELEMENT_CODE;
    }

    getDefaultSystemSource(item) {
        return this.isLuongThucTe(item)
            ? QuyTacManager.DEFAULT_SYSTEM_SOURCE_LUONG_THUC_TE
            : QuyTacManager.DEFAULT_SYSTEM_SOURCE;
    }

    static normalizeSystemSourceKey(sourceKey) {
        const normalized = String(sourceKey || '').trim().toLowerCase();
        if (!normalized) return '';
        return normalized;
    }

    isLuongThucTe(item) {
        return String(item?.maphantu || '').trim().toUpperCase() === 'LUONG_THUC_TE';
    }

    normalizeDisplayOrder() {
        const nonFixed = this.quyTacList.filter(q => !this.isFixedElement(q.maphantu));
        const fixed = this.quyTacList.filter(q => this.isFixedElement(q.maphantu));

        nonFixed.forEach((item, idx) => {
            item.thutuhienthi = idx + 1;
        });
        fixed.forEach((item, idx) => {
            item.thutuhienthi = nonFixed.length + idx + 1;
        });

        this.quyTacList = [...nonFixed, ...fixed];
    }

    sortWithFixedAtEnd() {
        this.quyTacList.sort((a, b) => {
            const aIsFixed = this.isFixedElement(a.maphantu);
            const bIsFixed = this.isFixedElement(b.maphantu);

            if (aIsFixed && !bIsFixed) return 1;
            if (!aIsFixed && bIsFixed) return -1;

            const aOrder = Number(a.thutuhienthi || 999999);
            const bOrder = Number(b.thutuhienthi || 999999);
            if (aOrder !== bOrder) return aOrder - bOrder;

            return Number(a.phantuluong_id || 0) - Number(b.phantuluong_id || 0);
        });

        this.normalizeDisplayOrder();
    }

    bindEvents() {
        if (this.btnAdd) {
            this.btnAdd.addEventListener('click', () => this.openPhanTuSelector());
        }

        if (this.tbody) {
            this.tbody.addEventListener('change', (e) => this.handleRowChange(e));
            this.tbody.addEventListener('click', (e) => this.handleRowClick(e));
            this.tbody.addEventListener('input', (e) => this.handleRowInput(e));
            this.tbody.addEventListener('dragstart', (e) => this.handleDragStart(e));
            this.tbody.addEventListener('dragover', (e) => this.handleDragOver(e));
            this.tbody.addEventListener('drop', (e) => this.handleDrop(e));
            this.tbody.addEventListener('dragend', () => this.handleDragEnd());
        }
    }

    render() {
        if (!this.tbody) return;

        this.sortWithFixedAtEnd();
        this.tbody.innerHTML = '';

        if (this.quyTacList.length === 0) {
            this.showEmpty(true);
            this.updateCount();
            return;
        }

        this.showEmpty(false);

        const fragment = document.createDocumentFragment();
        this.quyTacList.forEach((item, index) => {
            fragment.appendChild(this.createRow(item, index));
        });

        this.tbody.appendChild(fragment);
        this.updateCount();
        this.syncHiddenInput();
    }

    createRow(item, index) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors';
        tr.dataset.id = item.phantuluong_id;

        const isFixed = this.isFixedElement(item.maphantu);
        // Row itself is NOT draggable — only the drag handle is

        const isFormula = item.nguondulieu === 'formula';
        const isManual = item.nguondulieu === 'manual';
        const isSystem = item.nguondulieu === 'system';

        const nguonOptions = this.nguonDuLieuOptions.map(opt => (
            `<option value="${opt.value}" ${item.nguondulieu === opt.value ? 'selected' : ''}>${opt.label}</option>`
        )).join('');

        const selectedSystemSource = isSystem
            ? (QuyTacManager.normalizeSystemSourceKey(item.nguondulieu_chitiet) || this.getDefaultSystemSource(item))
            : '';

        if (isSystem && item.nguondulieu_chitiet !== selectedSystemSource) {
            item.nguondulieu_chitiet = selectedSystemSource;
        }

        const systemSourceOptions = this.systemNguonDuLieuOptions.map(opt => (
            `<option value="${opt.value}" ${selectedSystemSource === opt.value ? 'selected' : ''}>${opt.label}</option>`
        )).join('');

        const draggableBadge = isFixed
            ? `
                <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400" title="Phần tử bắt buộc, không thể di chuyển">
                    <i class="fas fa-lock text-[10px]"></i>
                </span>
            `
            : `
                <span class="drag-handle inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-semibold text-sm cursor-grab active:cursor-grabbing" draggable="true" title="Kéo để sắp xếp">
                    +
                </span>
            `;

        const sourceConfigCell = isSystem
            ? `
                <select data-field="nguondulieu_chitiet" class="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    ${systemSourceOptions}
                </select>
            `
            : isFormula
                ? `
                    <input type="text"
                        data-field="bieuthuc"
                        value="${this.escapeHtml(item.bieuthuc || '')}"
                        placeholder="VD: LUONG_THUC_TE + PHU_CAP - BAO_HIEM"
                        class="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-mono focus:ring-2 focus:ring-blue-500">
                `
                : `
                    <span class="text-slate-500 text-sm italic">
                        <i class="fas fa-keyboard mr-1"></i>Giá trị sẽ nhập thủ công khi tính lương
                    </span>
                `;

        tr.innerHTML = `
            <td class="px-3 py-3 text-center align-middle">
                ${draggableBadge}
            </td>
            <td class="px-3 py-3 text-slate-600 text-center align-middle">${index + 1}</td>
            <td class="px-3 py-3 align-middle">
                <span class="font-medium text-slate-800">${this.escapeHtml(item.tenphantu)}</span>
                ${isFixed ? '<span class="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">Bắt buộc</span>' : ''}
            </td>
            <td class="px-3 py-3 align-middle">
                <span class="inline-flex items-center gap-1 group/code">
                    <code class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs select-all">${this.escapeHtml(item.maphantu)}</code>
                    <button type="button" data-action="copy" data-copy-value="${this.escapeHtml(item.maphantu)}" class="p-0.5 text-slate-300 hover:text-blue-600 opacity-0 group-hover/code:opacity-100 transition-all" title="Sao chép mã phần tử">
                        <i class="fas fa-copy text-[10px]"></i>
                    </button>
                </span>
            </td>
            <td class="px-3 py-3 align-middle">
                <select data-field="nguondulieu" class="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isFixed ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}" ${isFixed ? 'disabled' : ''}>
                    ${nguonOptions}
                </select>
            </td>
            <td class="px-3 py-3 align-middle">
                ${sourceConfigCell}
            </td>
            <td class="px-3 py-3 align-middle">
                <input type="text"
                    data-field="mota"
                    value="${this.escapeHtml(item.mota || '')}"
                    placeholder="Nhập mô tả..."
                    class="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            </td>
            <td class="px-3 py-3 text-center align-middle">
                ${isFormula ? `
                    <button type="button" data-action="test" class="px-2 py-1 text-xs text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors inline-flex items-center justify-center" title="Kiểm thử công thức">
                        <i class="fas fa-play"></i>
                    </button>
                ` : `<span class="text-slate-300">-</span>`}
            </td>
            <td class="px-3 py-3 text-center align-middle">
                ${isFixed ? `
                    <span class="p-1.5 text-slate-300 cursor-not-allowed inline-flex items-center justify-center" title="Phần tử bắt buộc, không thể xóa">
                        <i class="fas fa-lock"></i>
                    </span>
                ` : `
                    <button type="button" data-action="remove" class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors inline-flex items-center justify-center" title="Xóa">
                        <i class="fas fa-times"></i>
                    </button>
                `}
            </td>
        `;

        return tr;
    }

    showEmpty(show) {
        if (this.emptyState) {
            this.emptyState.classList.toggle('hidden', !show);
        }
        if (this.tbody) {
            this.tbody.classList.toggle('hidden', show);
        }
    }

    updateCount() {
        if (this.countEl) {
            this.countEl.textContent = this.quyTacList.length;
        }
    }

    syncHiddenInput() {
        if (this.hiddenInput) {
            this.hiddenInput.value = JSON.stringify(this.quyTacList);
        }
    }

    handleRowChange(e) {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;

        const id = row.dataset.id;
        const field = target.dataset.field;

        if (field === 'nguondulieu') {
            this.updateNguonDuLieu(id, target.value);
            return;
        }

        if (field === 'nguondulieu_chitiet') {
            this.updateFieldValue(id, field, target.value);
            return;
        }
    }

    handleRowInput(e) {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;

        const id = row.dataset.id;
        const field = target.dataset.field;

        if (field === 'bieuthuc' || field === 'mota') {
            this.updateFieldValue(id, field, target.value);
        }
    }

    handleRowClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const row = btn.closest('tr');
        const id = row?.dataset.id;

        switch (action) {
            case 'remove':
                this.removeQuyTac(id);
                break;
            case 'test':
                this.testFormula(id);
                break;
            case 'copy':
                this.copyToClipboard(btn.dataset.copyValue, btn);
                break;
            default:
                break;
        }
    }

    handleDragStart(e) {
        // Only allow drag from the drag handle
        const handle = e.target.closest('.drag-handle');
        if (!handle) {
            e.preventDefault();
            return;
        }

        const row = handle.closest('tr');
        if (!row) return;

        const id = row.dataset.id;
        const item = this.quyTacList.find(q => String(q.phantuluong_id) === String(id));
        if (!item || this.isFixedElement(item.maphantu)) {
            e.preventDefault();
            return;
        }

        this.draggingId = String(id);
        row.style.opacity = '0.6';

        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.draggingId);
        }
    }

    handleDragOver(e) {
        if (!this.draggingId) return;

        const row = e.target.closest('tr');
        if (!row) return;

        const targetId = String(row.dataset.id || '');
        if (!targetId || targetId === this.draggingId) return;

        e.preventDefault();

        const rect = row.getBoundingClientRect();
        const isAfter = (e.clientY - rect.top) > (rect.height / 2);

        this.clearDropIndicators();
        row.dataset.dropPosition = isAfter ? 'after' : 'before';
        row.style.backgroundColor = '#eff6ff';
        if (isAfter) {
            row.style.borderBottom = '2px solid #3b82f6';
            row.style.borderTop = '';
        } else {
            row.style.borderTop = '2px solid #3b82f6';
            row.style.borderBottom = '';
        }
    }

    handleDrop(e) {
        if (!this.draggingId) return;
        e.preventDefault();

        const row = e.target.closest('tr');
        if (!row) {
            this.handleDragEnd();
            return;
        }

        const targetId = String(row.dataset.id || '');
        if (!targetId || targetId === this.draggingId) {
            this.handleDragEnd();
            return;
        }

        const isAfter = row.dataset.dropPosition === 'after';
        this.reorderByDrag(this.draggingId, targetId, isAfter);
        this.handleDragEnd();
        this.render();
    }

    handleDragEnd() {
        this.clearDropIndicators();

        const draggingRow = this.tbody?.querySelector(`tr[data-id="${this.draggingId}"]`);
        if (draggingRow) {
            draggingRow.style.opacity = '';
        }

        this.draggingId = null;
    }

    clearDropIndicators() {
        if (!this.tbody) return;

        this.tbody.querySelectorAll('tr').forEach(row => {
            row.style.borderTop = '';
            row.style.borderBottom = '';
            if (String(row.dataset.id || '') !== this.draggingId) {
                row.style.backgroundColor = '';
            }
            delete row.dataset.dropPosition;
        });
    }

    reorderByDrag(draggedId, targetId, isAfter) {
        const draggedIndex = this.quyTacList.findIndex(q => String(q.phantuluong_id) === String(draggedId));
        const targetIndex = this.quyTacList.findIndex(q => String(q.phantuluong_id) === String(targetId));

        if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
            return;
        }

        const [draggedItem] = this.quyTacList.splice(draggedIndex, 1);

        let insertIndex = targetIndex;
        if (draggedIndex < targetIndex) {
            insertIndex -= 1;
        }
        if (isAfter) {
            insertIndex += 1;
        }

        const fixedIndex = this.quyTacList.findIndex(item => this.isFixedElement(item.maphantu));
        if (fixedIndex >= 0) {
            insertIndex = Math.min(insertIndex, fixedIndex);
        }

        if (insertIndex < 0) {
            insertIndex = 0;
        }

        this.quyTacList.splice(insertIndex, 0, draggedItem);
        this.normalizeDisplayOrder();
    }

    addQuyTac(phanTuList) {
        phanTuList.forEach(pt => {
            const exists = this.quyTacList.some(q => Number(q.phantuluong_id) === Number(pt.id));
            if (exists) return;

            if (this.isFixedElement(pt.maphantu)) return;

            this.quyTacList.push({
                phantuluong_id: pt.id,
                tenphantu: pt.tenphantu,
                maphantu: pt.maphantu,
                nguondulieu: 'manual',
                nguondulieu_chitiet: '',
                bieuthuc: '',
                mota: '',
                thutuhienthi: this.quyTacList.length + 1,
                isFixed: false
            });
        });

        this.sortWithFixedAtEnd();
        this.render();
    }

    removeQuyTac(phantuluongId) {
        const item = this.quyTacList.find(q => String(q.phantuluong_id) === String(phantuluongId));
        if (item && this.isFixedElement(item.maphantu)) {
            AppUtils.Notify.warning('Không thể xóa phần tử bắt buộc "Thực lĩnh"');
            return;
        }

        this.quyTacList = this.quyTacList.filter(q => String(q.phantuluong_id) !== String(phantuluongId));
        this.sortWithFixedAtEnd();
        this.render();
    }

    updateDisplayOrder(phantuluongId, value) {
        const item = this.quyTacList.find(q => String(q.phantuluong_id) === String(phantuluongId));
        if (!item || this.isFixedElement(item.maphantu)) return;

        const next = Number(value);
        if (Number.isFinite(next) && next > 0) {
            item.thutuhienthi = next;
        }

        this.sortWithFixedAtEnd();
        this.render();
    }

    updateNguonDuLieu(phantuluongId, value) {
        const item = this.quyTacList.find(q => String(q.phantuluong_id) === String(phantuluongId));
        if (!item) return;

        if (this.isFixedElement(item.maphantu)) {
            item.nguondulieu = 'formula';
            item.nguondulieu_chitiet = '';
            this.render();
            return;
        }

        item.nguondulieu = value;

        if (value === 'system') {
            item.nguondulieu_chitiet = item.nguondulieu_chitiet || this.getDefaultSystemSource(item);
            item.bieuthuc = '';
        } else if (value === 'formula') {
            item.nguondulieu_chitiet = '';
        } else {
            item.nguondulieu_chitiet = '';
            item.bieuthuc = '';
        }

        this.render();
    }

    updateFieldValue(phantuluongId, field, value) {
        const item = this.quyTacList.find(q => String(q.phantuluong_id) === String(phantuluongId));
        if (!item) return;

        item[field] = value;
        this.syncHiddenInput();
    }

    testFormula(phantuluongId) {
        const item = this.quyTacList.find(q => String(q.phantuluong_id) === String(phantuluongId));
        if (!item || !item.bieuthuc) {
            AppUtils.Notify.warning('Vui lòng nhập công thức trước');
            return;
        }

        const vars = this.quyTacList.map(q => q.maphantu);
        const result = AppUtils.Formula.validate(item.bieuthuc, vars);

        if (result.ok) {
            AppUtils.Notify.success('Công thức hợp lệ!');
        } else {
            AppUtils.Notify.error(`Lỗi công thức: ${result.msg}`);
        }
    }

    openPhanTuSelector() {
        const event = new CustomEvent('openPhanTuSelector', {
            detail: {
                excludeIds: this.getExcludeIds(),
                fixedElementCode: QuyTacManager.FIXED_ELEMENT_CODE,
                onConfirm: (selected) => this.addQuyTac(selected)
            }
        });
        document.dispatchEvent(event);
    }

    getData() {
        return this.quyTacList;
    }

    setData(data) {
        const raw = Array.isArray(data) ? data : [];

        this.quyTacList = raw.map((item, index) => {
            let nguondulieu = String(item.nguondulieu || 'manual').toLowerCase();
            if (!['manual', 'system', 'formula'].includes(nguondulieu)) {
                nguondulieu = 'manual';
            }

            let thutuhienthi = Number(item.thutuhienthi);
            if (!Number.isFinite(thutuhienthi) || thutuhienthi <= 0) {
                thutuhienthi = index + 1;
            }

            const normalized = {
                phantuluong_id: item.phantuluong_id,
                tenphantu: item.tenphantu,
                maphantu: item.maphantu,
                nguondulieu,
                nguondulieu_chitiet: QuyTacManager.normalizeSystemSourceKey(item.nguondulieu_chitiet || item.nguondulieuchitiet || ''),
                bieuthuc: item.bieuthuc || '',
                mota: item.mota || '',
                thutuhienthi,
                isFixed: this.isFixedElement(item.maphantu)
            };

            if (normalized.nguondulieu === 'system' && !normalized.nguondulieu_chitiet) {
                normalized.nguondulieu_chitiet = this.getDefaultSystemSource(normalized);
            }

            if (normalized.nguondulieu !== 'system') {
                normalized.nguondulieu_chitiet = '';
            }

            if (normalized.isFixed) {
                normalized.nguondulieu = 'formula';
                normalized.nguondulieu_chitiet = '';
            }

            return normalized;
        });

        if (this.fixedElement) {
            this.ensureFixedElement();
        } else {
            const fixedInData = this.quyTacList.find(q => this.isFixedElement(q.maphantu));
            if (fixedInData) {
                fixedInData.isFixed = true;
                fixedInData.nguondulieu = 'formula';
                fixedInData.nguondulieu_chitiet = '';
            }
            this.sortWithFixedAtEnd();
            this.render();
        }
    }

    clear() {
        const fixedItem = this.quyTacList.find(q => this.isFixedElement(q.maphantu));
        this.quyTacList = fixedItem ? [{ ...fixedItem }] : [];
        this.sortWithFixedAtEnd();
        this.render();
    }

    getExcludeIds() {
        return this.quyTacList.map(q => q.phantuluong_id);
    }

    async copyToClipboard(text, btnEl) {
        try {
            await navigator.clipboard.writeText(text);

            // Visual feedback
            const icon = btnEl.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-check text-[10px]';
                btnEl.classList.add('text-green-500');
                btnEl.classList.remove('text-slate-300');
                btnEl.style.opacity = '1';
                setTimeout(() => {
                    icon.className = 'fas fa-copy text-[10px]';
                    btnEl.classList.remove('text-green-500');
                    btnEl.classList.add('text-slate-300');
                    btnEl.style.opacity = '';
                }, 1200);
            }
        } catch {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

window.QuyTacManager = QuyTacManager;