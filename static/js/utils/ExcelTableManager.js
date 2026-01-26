/**
 * ExcelTableManager (Final Optimized Version)
 * @extends TableManager
 * @description Quản lý bảng dữ liệu dạng Excel: Dynamic Columns, Sticky, Drag & Drop, Bulk Actions, Dirty Checking, High Performance Rendering.
 */
class ExcelTableManager extends TableManager {
    constructor(options) {
        const defaultOptions = {
            enableSearch: false,
            enableFilters: false,
            enableBulkActions: false,
            tableHeader: null,
            columns: [], 
            rowIdField: null, // Tự động phát hiện (id, nhanvien_id, pk...)
            onCellChange: null, 
            ...options
        };

        super(defaultOptions);

        // State quản lý thay đổi
        this.originalDataMap = new Map(); 

        // State Drag & Drop
        this.dragState = {
            isDragging: false,
            startCell: null,
            endCell: null,
            rafId: null // Request Animation Frame ID
        };

        // Bind functions một lần để dùng cho Event Listener
        this.boundHandleDragMove = this.handleDragMove.bind(this);
        this.boundHandleDragEnd = this.handleDragEnd.bind(this);

        this.initExcelFeatures();
    }

    initExcelFeatures() {
        if (!this.options.tableBody) return;

        // 1. EVENT DELEGATION: Chỉ dùng 1 listener cho input và mousedown trên toàn bộ body
        this.eventManager.add(this.options.tableBody, 'input', (e) => {
            if (e.target.matches('input[data-key]')) {
                this.handleDelegatedInput(e.target);
            }
        });

        this.eventManager.add(this.options.tableBody, 'mousedown', (e) => {
            if (e.target.classList.contains('cell-drag-handle')) {
                e.preventDefault();
                this.handleDragStart(e.target);
            }
        });

        // Global listeners cho Drag
        document.addEventListener('mousemove', this.boundHandleDragMove);
        document.addEventListener('mouseup', this.boundHandleDragEnd);
    }

    setColumns(newColumns) {
        this.options.columns = newColumns;
        this.render();
    }

    /**
     * Nạp dữ liệu và tạo Snapshot
     */
    setData(data) {
        this.state.data = data || [];
        this.originalDataMap.clear();
        
        // Tạo snapshot dữ liệu gốc (Baseline) chỉ cho các cột Input
        this.state.data.forEach(item => {
            const id = this.getRowId(item);
            if (id) {
                const snapshot = {};
                this.options.columns.forEach(col => {
                    if (col.type === 'input') {
                        // Lưu giá trị string đã trim để so sánh chính xác
                        const val = this.getValueByPath(item, col.key);
                        snapshot[col.key] = val == null ? '' : String(val).trim();
                    }
                });
                this.originalDataMap.set(String(id), snapshot);
            }
        });

        this.render();
    }

    /**
     * Khôi phục dữ liệu về snapshot gốc đã lưu khi setData
     */
    resetToOriginal() {
        if (!Array.isArray(this.state.data)) return;

        this.state.data.forEach(item => {
            const id = String(this.getRowId(item));
            const snapshot = this.originalDataMap.get(id);
            if (!snapshot) return;

            Object.entries(snapshot).forEach(([key, val]) => {
                this.setValueByPath(item, key, val);
            });
        });

        this.render();
    }

    /**
     * Kiểm tra thay đổi (Dirty Checking)
     */
    getChanges() {
        const changes = {};
        let count = 0;

        this.state.data.forEach(currentItem => {
            const id = String(this.getRowId(currentItem));
            const originalSnapshot = this.originalDataMap.get(id);
            
            if (!originalSnapshot) return; 
            
            // Thu thập giá trị hiện tại và kiểm tra thay đổi so với baseline
            const currentValues = {};
            let hasChange = false;

            this.options.columns.forEach(col => {
                if (col.type !== 'input') return;

                const rawVal = this.getValueByPath(currentItem, col.key);
                const currentVal = rawVal == null ? '' : String(rawVal).trim();
                currentValues[col.key] = currentVal;

                const originalVal = originalSnapshot[col.key] || '';
                if (currentVal !== originalVal) hasChange = true;
            });

            if (!hasChange) return;

            // Khi có thay đổi, gửi toàn bộ các cột đang có giá trị (không gửi cột rỗng)
            const itemPayload = {};
            this.options.columns.forEach(col => {
                if (col.type !== 'input') return;
                const currentVal = currentValues[col.key];
                if (currentVal === '') return; // Bỏ qua cột đã xoá/để trống

                // Nếu có elementId (ID phần tử lương) thì ưu tiên dùng, fallback về key path cuối
                const finalKey = col.elementId ? String(col.elementId) : this.extractLastKey(col.key);
                itemPayload[finalKey] = currentVal;
            });

            changes[id] = itemPayload;
            count++;
        });

        return { changes, count };
    }

    // ============================================================
    // RENDERING
    // ============================================================

    render() {
        this.renderHeader();
        
        if (!this.options.tableBody) return;
        this.options.tableBody.innerHTML = '';
        this.state.selectedItems.clear();
        this.updateBulkActions();

        if (!this.state.data || this.state.data.length === 0) {
            this.showEmpty();
            return;
        }

        const fragment = document.createDocumentFragment();
        this.state.data.forEach((item, index) => {
            const row = this.renderExcelRow(item, index);
            if (row) fragment.appendChild(row);
        });

        this.options.tableBody.appendChild(fragment);
    }

    renderHeader() {
        if (!this.options.tableHeader) return;

        let html = '';
        let leftOffset = 0;

        // Checkbox All
        if (this.options.enableBulkActions) {
            html += `
                <th class="sticky-col px-4 py-3 bg-slate-50 border-b border-r border-slate-200 w-[50px] min-w-[50px] text-center z-40 left-0">
                    <input type="checkbox" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" id="select-all-checkbox">
                </th>`;
            leftOffset += 50;
        }

        // Columns
        this.options.columns.forEach((col, index) => {
            const isSticky = col.sticky === true;
            const widthStyle = col.width ? `width: ${col.width}px; min-width: ${col.width}px;` : 'min-width: 120px;';
            const stickyClass = isSticky ? 'sticky-col z-30' : '';
            const stickyStyle = isSticky ? `left: ${leftOffset}px;` : '';
            
            if (isSticky) leftOffset += (col.width || 120);

            html += `
                <th class="${stickyClass} px-4 py-3 bg-slate-50 border-b border-r border-slate-200 text-left whitespace-nowrap" 
                    style="${widthStyle} ${stickyStyle}">
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-700">${col.title}</span>
                        ${col.subtitle ? `<span class="text-[10px] text-slate-400 font-mono">${col.subtitle}</span>` : ''}
                    </div>
                </th>`;
        });

        this.options.tableHeader.innerHTML = html;

        if (this.options.enableBulkActions) {
            const selectAll = this.options.tableHeader.querySelector('#select-all-checkbox');
            if (selectAll) {
                this.options.selectAllCheckbox = selectAll; 
                this.eventManager.add(selectAll, 'change', (e) => this.handleSelectAll(e.target.checked));
            }
        }
    }

    renderExcelRow(item, rowIndex) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors group';

        let leftOffset = 0;
        const itemId = this.getRowId(item);

        // Checkbox Row
        if (this.options.enableBulkActions) {
            const tdCheck = document.createElement('td');
            tdCheck.className = 'sticky-col px-4 py-2 border-b border-r border-slate-100 bg-white z-10 align-middle text-center';
            tdCheck.style.left = '0px';
            tdCheck.innerHTML = `<input type="checkbox" class="row-checkbox w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" data-id="${itemId}">`;
            
            const checkbox = tdCheck.querySelector('.row-checkbox');
            this.eventManager.add(checkbox, 'change', () => this.handleItemCheckbox(checkbox));
            
            tr.appendChild(tdCheck);
            leftOffset += 50;
        }

        // Data Cells
        this.options.columns.forEach((col, colIndex) => {
            const td = document.createElement('td');
            const isSticky = col.sticky === true;
            let baseClass = 'border-b border-r border-slate-100 bg-white align-middle';
            let style = '';

            if (isSticky) {
                baseClass += ' sticky-col z-10';
                style += `left: ${leftOffset}px;`;
                leftOffset += (col.width || 120);
            }

            if (col.type === 'input') {
                td.className = `${baseClass} excel-cell p-0 relative`;
                const val = this.getValueByPath(item, col.key);
                const displayVal = val == null ? '' : val;
                
                // KHÔNG gắn event listener ở đây để tối ưu
                td.innerHTML = `
                    <input type="text" 
                           class="w-full h-full px-3 py-2 bg-transparent focus:bg-blue-50 focus:outline-none text-right font-mono text-sm" 
                           value="${displayVal}" 
                           data-row="${rowIndex}" 
                           data-col="${colIndex}" 
                           data-key="${col.key}">
                    <div class="cell-drag-handle absolute bottom-0 right-0 w-2 h-2 bg-blue-600 cursor-crosshair opacity-0 group-hover:opacity-100 z-20" 
                         data-row="${rowIndex}" 
                         data-col="${colIndex}"></div>
                `;
            } else {
                td.className = `${baseClass} px-4 py-2 text-sm text-slate-700`;
                if (col.render && typeof col.render === 'function') {
                    td.innerHTML = col.render(item, rowIndex);
                } else {
                    const val = this.getValueByPath(item, col.key);
                    td.textContent = val != null ? val : '-';
                }
            }

            if (style) td.setAttribute('style', style);
            tr.appendChild(td);
        });

        return tr;
    }

    // ============================================================
    // LOGIC EVENT & DRAG DROP (OPTIMIZED)
    // ============================================================

    handleDelegatedInput(inputEl) {
        const rowIndex = parseInt(inputEl.dataset.row);
        const key = inputEl.dataset.key;
        const value = inputEl.value;
        const item = this.state.data[rowIndex];

        if (item) {
            // Update Model trực tiếp
            this.setValueByPath(item, key, value);
            
            if (this.options.onCellChange) {
                // Debounce callback nếu cần thiết bên ngoài, ở đây gọi trực tiếp
                this.options.onCellChange([{ row: rowIndex, key, value, item }]);
            }
        }
    }

    handleDragStart(handleEl) {
        this.dragState.isDragging = true;
        const rowIndex = parseInt(handleEl.dataset.row);
        const colIndex = parseInt(handleEl.dataset.col);
        
        // Offset cho checkbox nếu có
        const domColIndex = colIndex + (this.options.enableBulkActions ? 1 : 0);
        const cell = this.options.tableBody.rows[rowIndex]?.cells[domColIndex];
        const input = cell?.querySelector('input');

        if (!input) return;

        this.dragState.startCell = { rowIndex, colIndex, value: input.value };
        
        document.body.style.cursor = 'crosshair';
        document.body.style.userSelect = 'none';
    }

    handleDragMove(e) {
        if (!this.dragState.isDragging) return;

        // THROTTLING: Sử dụng requestAnimationFrame để tránh giật lag
        if (this.dragState.rafId) return;

        this.dragState.rafId = requestAnimationFrame(() => {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const cell = target?.closest('.excel-cell');
            
            if (cell) {
                const input = cell.querySelector('input');
                if (input) {
                    const targetRow = parseInt(input.dataset.row);
                    const targetCol = parseInt(input.dataset.col);

                    const start = this.dragState.startCell;
                    const dRow = Math.abs(targetRow - start.rowIndex);
                    const dCol = Math.abs(targetCol - start.colIndex);

                    let endRow = start.rowIndex;
                    let endCol = start.colIndex;

                    // Snap: Ưu tiên kéo dọc hoặc ngang
                    if (dRow >= dCol) endRow = targetRow; 
                    else endCol = targetCol;

                    this.dragState.endCell = { rowIndex: endRow, colIndex: endCol };
                    this.highlightCells(start, this.dragState.endCell);
                }
            }
            this.dragState.rafId = null;
        });
    }

    handleDragEnd() {
        if (!this.dragState.isDragging) return;
        
        if (this.dragState.rafId) {
            cancelAnimationFrame(this.dragState.rafId);
            this.dragState.rafId = null;
        }

        this.dragState.isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        this.clearHighlight();

        if (this.dragState.startCell && this.dragState.endCell) {
            this.applyDragValues(this.dragState.startCell, this.dragState.endCell);
        }
        
        this.dragState.startCell = null;
        this.dragState.endCell = null;
    }

    highlightCells(start, end) {
        this.clearHighlight();
        const minRow = Math.min(start.rowIndex, end.rowIndex);
        const maxRow = Math.max(start.rowIndex, end.rowIndex);
        const minCol = Math.min(start.colIndex, end.colIndex);
        const maxCol = Math.max(start.colIndex, end.colIndex);
        
        const offset = this.options.enableBulkActions ? 1 : 0;

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                // Kiểm tra xem cột có tồn tại và là loại input không
                const col = this.options.columns[c];
                if (col && col.type === 'input') {
                    const cell = this.options.tableBody.rows[r]?.cells[c + offset];
                    if (cell) cell.classList.add('bg-blue-100');
                }
            }
        }
    }

    clearHighlight() {
        // Sử dụng querySelectorAll trực tiếp trên tableBody để nhanh hơn
        const highlighted = this.options.tableBody.querySelectorAll('.bg-blue-100');
        for (let i = 0; i < highlighted.length; i++) {
            highlighted[i].classList.remove('bg-blue-100');
        }
    }

    applyDragValues(start, end) {
        const valueToCopy = start.value;
        const minRow = Math.min(start.rowIndex, end.rowIndex);
        const maxRow = Math.max(start.rowIndex, end.rowIndex);
        const minCol = Math.min(start.colIndex, end.colIndex);
        const maxCol = Math.max(start.colIndex, end.colIndex);

        const offset = this.options.enableBulkActions ? 1 : 0;
        let changedData = [];

        for (let r = minRow; r <= maxRow; r++) {
            const rowData = this.state.data[r];
            if (!rowData) continue;

            for (let c = minCol; c <= maxCol; c++) {
                const col = this.options.columns[c];
                if (!col || col.type !== 'input') continue;

                const cell = this.options.tableBody.rows[r]?.cells[c + offset];
                const input = cell?.querySelector('input');
                
                if (input && input.value !== valueToCopy) {
                    input.value = valueToCopy;
                    
                    // Hiệu ứng flash nhẹ
                    cell.animate([
                        { backgroundColor: '#bfdbfe' },
                        { backgroundColor: 'transparent' }
                    ], { duration: 300 });

                    // Update Model
                    this.setValueByPath(rowData, col.key, valueToCopy);

                    changedData.push({
                        row: r, col: c, key: col.key, value: valueToCopy, item: rowData
                    });
                }
            }
        }

        if (changedData.length > 0 && this.options.onCellChange) {
            this.options.onCellChange(changedData);
        }
    }

    // ============================================================
    // UTILITIES
    // ============================================================

    showLoading() {
        if (!this.options.tableBody) return;
        const totalCols = (this.options.enableBulkActions ? 1 : 0) + this.options.columns.length;
        this.options.tableBody.innerHTML = `
            <tr><td colspan="${totalCols}" class="px-6 py-10 text-center text-slate-500">
                <i class="fas fa-spinner fa-spin text-3xl text-blue-600 mb-3"></i><p>Đang tải dữ liệu...</p>
            </td></tr>`;
    }

    showEmpty(message = 'Không tìm thấy dữ liệu') {
        if (!this.options.tableBody) return;
        const totalCols = (this.options.enableBulkActions ? 1 : 0) + this.options.columns.length;
        this.options.tableBody.innerHTML = `
            <tr><td colspan="${totalCols}" class="px-6 py-12 text-center text-slate-400">
                <i class="fas fa-inbox text-4xl mb-3 opacity-50"></i><p>${message}</p>
            </td></tr>`;
    }

    getRowId(item) {
        if (this.options.rowIdField) return item[this.options.rowIdField];
        // Fallback IDs thường gặp
        return item.id || item.nhanvien_id || item.pk;
    }

    getValueByPath(obj, path) {
        if (!path) return '';
        return path.split('.').reduce((o, i) => (o ? o[i] : null), obj);
    }

    setValueByPath(obj, path, value) {
        if (!path || !obj) return;
        const parts = path.split('.');
        const last = parts.pop();
        let cursor = obj;
        parts.forEach((key) => {
            if (cursor[key] === undefined || cursor[key] === null) {
                cursor[key] = {};
            }
            cursor = cursor[key];
        });
        cursor[last] = value;
    }

    extractLastKey(path) {
        return path ? path.split('.').pop() : '';
    }

    destroy() {
        document.removeEventListener('mousemove', this.boundHandleDragMove);
        document.removeEventListener('mouseup', this.boundHandleDragEnd);
        // Hủy animation frame nếu đang chạy
        if (this.dragState.rafId) cancelAnimationFrame(this.dragState.rafId);
        super.destroy();
    }
}
window.ExcelTableManager = ExcelTableManager;