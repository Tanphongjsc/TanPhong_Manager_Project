class TreeTableComponent {
    /**
     * @param {Object} config
     * @param {string} config.tableId - ID của table
     * @param {Array} config.columns - Cấu hình cột
     * @param {Array} config.data - Dữ liệu dạng cây (mặc định các node có thể chứa 'children')
     * @param {Object} config.grandTotals - Dữ liệu dòng tổng cộng dưới tfoot (tùy chọn)
     * @param {string} config.emptyMessage - Thông báo khi không có dữ liệu
     * @param {boolean} config.defaultExpanded - Mặc định mở rộng hay thu gọn
     */
    constructor(config) {
        this.tableId = config.tableId;
        this.columns = config.columns || [];
        this.data = config.data || [];
        this.grandTotals = config.grandTotals || null;
        this.emptyMessage = config.emptyMessage || 'Không có dữ liệu';
        this.defaultExpanded = config.defaultExpanded !== undefined ? config.defaultExpanded : false;

        this.tbody = document.getElementById(`${this.tableId}-body`);
        this.tfoot = document.getElementById(`${this.tableId}-footer`);

        this.initData(this.data);
    }

    // Đệ quy để set isExpanded mặc định cho các node có children
    initData(nodes) {
        if (!nodes) return;
        nodes.forEach(node => {
            if (node.isExpanded === undefined) {
                node.isExpanded = this.defaultExpanded;
            }
            if (node.children && node.children.length > 0) {
                this.initData(node.children);
            }
        });
    }

    updateData(newData, grandTotals = null) {
        this.data = newData || [];
        if (grandTotals) {
            this.grandTotals = grandTotals;
        }
        this.initData(this.data);
        this.render();
    }

    toggleNode(nodeId, nodes = this.data) {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === nodeId) {
                nodes[i].isExpanded = !nodes[i].isExpanded;
                return true;
            }
            if (nodes[i].children && nodes[i].children.length > 0) {
                if (this.toggleNode(nodeId, nodes[i].children)) {
                    return true;
                }
            }
        }
        return false;
    }

    flattenTree(nodes, level = 0, result = []) {
        if (!nodes) return result;
        
        nodes.forEach(node => {
            node.level = level;
            result.push(node);
            if (node.isExpanded && node.children && node.children.length > 0) {
                this.flattenTree(node.children, level + 1, result);
            }
        });
        return result;
    }

    render() {
        if (!this.tbody) return;

        if (this.data.length === 0) {
            this.tbody.innerHTML = `<tr><td colspan="${this.columns.length}" class="px-4 py-8 text-center text-gray-500">${this.emptyMessage}</td></tr>`;
            if (this.tfoot) this.tfoot.innerHTML = '';
            return;
        }

        const flatData = this.flattenTree(this.data);
        
        let html = '';
        flatData.forEach((row, index) => {
            const hasChildren = row.children && row.children.length > 0;
            // Dùng style đặc biệt cho dòng group (level 0, 1...) và dòng lá
            const isGroup = hasChildren || row.type === 'group';
            
            let rowClass = 'cursor-pointer transition-colors';
            if (row.level === 0) {
                rowClass += ' tree-row-level-0';
            } else if (row.level === 1 && isGroup) {
                rowClass += ' tree-row-level-1';
            } else {
                rowClass += ' tree-row-leaf bg-white';
            }

            if (this.activeRowId === row.id) {
                rowClass += ' tree-row-active';
            }

            html += `<tr class="${rowClass}" data-node-id="${row.id}">`;
            
            this.columns.forEach(col => {
                let alignClass = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                let extraClass = col.className || '';
                
                if (col.isTreeColumn) {
                    const indent = row.level * 1.5; // rem
                    let iconHtml = '';
                    if (hasChildren) {
                        const iconClass = row.isExpanded ? 'fa-caret-down' : 'fa-caret-right';
                        iconHtml = `<button class="tree-toggle-btn w-5 h-5 inline-flex items-center justify-center mr-1 text-gray-500 hover:text-gray-800 transition-colors" data-id="${row.id}">
                                        <i class="fas ${iconClass} text-sm"></i>
                                    </button>`;
                    } else {
                        // Spacer cho các dòng lá
                        iconHtml = `<span class="inline-block w-5 h-5 mr-1"></span>`;
                    }
                    
                    const cellValue = col.render ? col.render(row.data ? row.data[col.key] : '', row) : (row.label || row.data[col.key]);
                    
                    html += `<td class="px-4 py-2 ${alignClass} ${extraClass}" style="padding-left: calc(1rem + ${indent}rem);">
                                <div class="flex items-center">
                                    ${iconHtml}
                                    <span>${cellValue}</span>
                                </div>
                             </td>`;
                } else {
                    // Cột bình thường
                    const rawValue = row.data ? row.data[col.key] : null;
                    const cellValue = col.render ? col.render(rawValue, row) : (rawValue !== null && rawValue !== undefined ? rawValue : '');
                    
                    html += `<td class="px-4 py-2 ${alignClass} ${extraClass}">${cellValue}</td>`;
                }
            });
            
            html += `</tr>`;
        });

        this.tbody.innerHTML = html;

        // Render footer
        if (this.tfoot) {
            if (this.grandTotals) {
                let footerHtml = '<tr>';
                this.columns.forEach((col, idx) => {
                    let alignClass = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                    let extraClass = col.className || '';
                    
                    if (idx === 0) {
                        footerHtml += `<td class="px-4 py-3 ${alignClass} uppercase tracking-wider ${extraClass}">${this.grandTotals.label || 'Tổng cộng'}</td>`;
                    } else {
                        const rawValue = this.grandTotals[col.key];
                        const cellValue = col.render ? col.render(rawValue, { isFooter: true }) : (rawValue !== null && rawValue !== undefined ? rawValue : '');
                        footerHtml += `<td class="px-4 py-3 ${alignClass} ${extraClass}">${cellValue}</td>`;
                    }
                });
                footerHtml += '</tr>';
                this.tfoot.innerHTML = footerHtml;
            } else {
                this.tfoot.innerHTML = '';
            }
        }

        // Attach events
        const toggleBtns = this.tbody.querySelectorAll('.tree-toggle-btn');
        toggleBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const nodeId = e.currentTarget.getAttribute('data-id');
                if (this.toggleNode(nodeId)) {
                    this.render();
                }
            });
        });

        // Row click for highlighting
        const rows = this.tbody.querySelectorAll('tr[data-node-id]');
        rows.forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.tree-toggle-btn')) return;
                this.activeRowId = row.getAttribute('data-node-id');
                this.render();
            });
        });
    }
}

window.TreeTableComponent = TreeTableComponent;
