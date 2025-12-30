/**
 * File: static/js/components/employee_selector.js
 * Version: 7.0 - Thêm validation trùng lặp & conflict detection
 * Sử dụng API có sẵn từ module to_chuc_nhan_su
 */
class EmployeeSelectorController {
    constructor(config) {
        this.config = {
            modalId: 'employee-selector-modal',
            formId:  'employee-selector-form',
            onConfirm: config.onConfirm || (() => {}),
            scheduleId: config.scheduleId || null,
            apiUrls: {
                deptTree: '/hrm/to-chuc-nhan-su/api/v1/phong-ban/tree/',
                empList: '/hrm/to-chuc-nhan-su/api/v1/phong-ban/employee/',
                checkConflict: '/hrm/lich-lam-viec/api/check-conflicts/'
            }
        };

        this.state = {
            selectedDepts: new Set(),
            deptMap: new Map(),
            selectedEmps: new Map(),
            
            // Cache nhân viên thuộc các phòng ban đã chọn
            deptEmployeeIds: new Set(),
            deptCache: new Map(),
            treeData: [],
            expandedNodes: new Set(),
            
            pagination: { 
                page: 1, 
                total_pages: 1, 
                total:  0, 
                page_size: 10,
                has_next: false, 
                has_prev: false 
            },
            searchEmp: '',
            deptFilterId: '',
            
            isInitialized: false,
            isDropdownOpen: false,
            
            // Flag đang loading cache
            isLoadingCache: false,

            isTreeLoaded: false,
            pendingInitialData: null
        };

        this.modal = document.getElementById(this.config.modalId);
        this.form = document.getElementById(this.config.formId);
        
        if (this.modal) this.init();
    }

    getInitials(name) {
        if (!name) return 'NV';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        if (this.modal) this.modal.removeAttribute('aria-hidden');
        
        if (this.form) {
            this.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleConfirm();
            });
        }
    }

    cacheElements() {
        const m = this.modal;
        this.els = {
            tabs: m.querySelectorAll('.selector-tab'),
            panes: m.querySelectorAll('.tab-content'),
            treeContainer: m.querySelector('#dept-tree-container'),
            
            empTbody: m.querySelector('#emp-list-body'),
            searchEmp: m.querySelector('#search-emp-input'),
            checkAllPage: m.querySelector('#check-all-emp-page'),
            
            filterDropdownWrapper: m.querySelector('#emp-dept-dropdown-wrapper'),
            filterDropdownBtn: m.querySelector('#emp-dept-dropdown-btn'),
            filterDropdownContent: m.querySelector('#emp-dept-dropdown-content'),
            filterSelectedText: m.querySelector('#emp-dept-selected-text'),

            paginationContainer: m.querySelector('.pagination-container'),
            btnPrev: m.querySelector('.pagination-prev'),
            btnNext: m.querySelector('.pagination-next'),
            pageSizeSelect: m.querySelector('.pagination-page-size'),
            pageCurrent: m.querySelector('.pagination-current'),
            pageTotal: m.querySelector('.pagination-total-pages'),
            totalInfo: m.querySelector('.pagination-info'),

            selectedContainer: m.querySelector('#selected-items-container'),
            countLabel: m.querySelector('#selected-count'),
            btnClear: m.querySelector('#btn-clear-all'),
            closeBtns: m.querySelectorAll('[data-modal-close]'),
            submitBtn: m.querySelector('[data-modal-submit]')
        };
    }

    bindEvents() {
        // 1.Close Modal
        this.els.closeBtns.forEach(btn => btn.addEventListener('click', (e) => { 
            e.preventDefault(); 
            this.close(); 
        }));

        // 2.Tabs
        this.els.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const target = e.target.dataset.tab;
                this.els.tabs.forEach(t => { 
                    t.classList.remove('active', 'border-green-600', 'text-green-600'); 
                    t.classList.add('border-transparent', 'text-slate-500'); 
                });
                e.target.classList.add('active', 'border-green-600', 'text-green-600');
                e.target.classList.remove('border-transparent', 'text-slate-500');
                this.els.panes.forEach(p => p.classList.add('hidden'));
                document.getElementById(`tab-content-${target}`).classList.remove('hidden');
            });
        });

        // 3.Tree Interaction
        if (this.els.treeContainer) {
            this.els.treeContainer.addEventListener('click', (e) => {
                const toggleBtn = e.target.closest('.tree-toggle-btn');
                if (toggleBtn) {
                    e.preventDefault(); 
                    e.stopPropagation();
                    this.toggleNodeExpand(toggleBtn.dataset.id, 'main-tree');
                    return;
                }
                if (e.target.classList.contains('dept-checkbox')) {
                    this.handleDeptCheck(e.target.dataset.id, e.target.checked);
                }
            });
        }

        // 4.Custom Filter Dropdown Logic
        if (this.els.filterDropdownBtn) {
            this.els.filterDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.state.isDropdownOpen = !this.state.isDropdownOpen;
                this.els.filterDropdownContent.classList.toggle('hidden', !this.state.isDropdownOpen);
            });

            document.addEventListener('click', (e) => {
                if (this.state.isDropdownOpen && !this.els.filterDropdownWrapper.contains(e.target)) {
                    this.state.isDropdownOpen = false;
                    this.els.filterDropdownContent.classList.add('hidden');
                }
            });

            this.els.filterDropdownContent.addEventListener('click', (e) => {
                const toggleBtn = e.target.closest('.tree-toggle-btn');
                if (toggleBtn) {
                    e.preventDefault(); 
                    e.stopPropagation();
                    this.toggleNodeExpand(toggleBtn.dataset.id, 'filter-tree');
                    return;
                }

                const item = e.target.closest('.filter-tree-item');
                if (item) {
                    e.stopPropagation();
                    const deptId = item.dataset.id;
                    const deptName = item.dataset.name;
                    this.els.filterSelectedText.textContent = deptName;
                    this.state.deptFilterId = deptId;
                    this.state.isDropdownOpen = false;
                    this.els.filterDropdownContent.classList.add('hidden');
                    this.state.pagination.page = 1;
                    this.fetchEmployees();
                }
            });
        }

        // 5.Search & Pagination Logic
        const debounceFetch = AppUtils.Helper.debounce(() => { 
            this.state.pagination.page = 1; 
            this.fetchEmployees(); 
        }, 300);

        if (this.els.searchEmp) {
            this.els.searchEmp.addEventListener('input', (e) => { 
                this.state.searchEmp = e.target.value; 
                debounceFetch(); 
            });
        }

        if (this.els.btnPrev) this.els.btnPrev.addEventListener('click', () => this.changePage(-1));
        if (this.els.btnNext) this.els.btnNext.addEventListener('click', () => this.changePage(1));

        if (this.els.pageSizeSelect) {
            this.els.pageSizeSelect.addEventListener('change', (e) => {
                this.state.pagination.page_size = parseInt(e.target.value);
                this.state.pagination.page = 1;
                this.fetchEmployees();
            });
        }

        // 6.Checkbox Emp - Thêm validation
        if (this.els.empTbody) {
            this.els.empTbody.addEventListener('change', (e) => {
                if (e.target.classList.contains('emp-checkbox')) {
                    const { id, name, dept, code } = e.target.dataset;
                    
                    if (e.target.checked) {
                        // Kiểm tra nhân viên có thuộc phòng ban đã chọn không
                        if (this.isEmployeeInSelectedDepts(id)) {
                            e.target.checked = false;
                            AppUtils.Notify.warning(`Nhân viên "${name}" đã thuộc bộ phận được chọn. Không cần thêm riêng.`);
                            return;
                        }
                        this.state.selectedEmps.set(id, { name, dept, code });
                    } else {
                        this.state.selectedEmps.delete(id);
                    }
                    this.renderSelectedList();
                    this.updateCheckAllStatus();
                }
            });
        }

        if (this.els.checkAllPage) {
            this.els.checkAllPage.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                const checkboxes = this.els.empTbody.querySelectorAll('.emp-checkbox:not(:disabled)');
                checkboxes.forEach(cb => {
                    const id = cb.dataset.id;
                    // Bỏ qua nhân viên đã thuộc phòng ban
                    if (this.isEmployeeInSelectedDepts(id)) return;
                    
                    if (cb.checked !== isChecked) {
                        cb.checked = isChecked;
                        const { name, dept, code } = cb.dataset;
                        if (isChecked) {
                            this.state.selectedEmps.set(id, { name, dept, code });
                        } else {
                            this.state.selectedEmps.delete(id);
                        }
                    }
                });
                this.renderSelectedList();
            });
        }

        // 7.Remove & Clear
        if (this.els.btnClear) this.els.btnClear.addEventListener('click', () => this.clearAll());
        
        if (this.els.selectedContainer) {
            this.els.selectedContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.remove-btn');
                if (btn) {
                    const { type, id } = btn.dataset;
                    if (type === 'dept') {
                        this.handleDeptCheck(id, false);
                    } else {
                        this.state.selectedEmps.delete(id);
                        this.renderSelectedList();
                        this.syncEmpCheckboxes();
                    }
                }
            });
        }
        
        if (this.els.submitBtn) {
            this.els.submitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleConfirm();
            });
        }
    }

    // Kiểm tra nhân viên có thuộc phòng ban đã chọn không
    isEmployeeInSelectedDepts(empId) {
        return this.state.deptEmployeeIds.has(empId.toString());
    }

    // Cập nhật cache nhân viên thuộc phòng ban đã chọn
    // Sử dụng API có sẵn:  api_phong_ban_nhan_vien

    async updateDeptEmployeesCache(deptIdsToCheck = []) {
        if (!deptIdsToCheck || deptIdsToCheck.length === 0) return;

        // Lọc ra những DeptID chưa có trong Cache
        const missingDeptIds = deptIdsToCheck.filter(id => !this.state.deptCache.has(id.toString()));

        if (missingDeptIds.length === 0) return;

        this.state.isLoadingCache = true;
        
        // --- GIẢI PHÁP MỚI: BATCHING REQUEST ---
        const BATCH_SIZE = 5; // Chỉ gửi 5 request cùng lúc
        
        try {
            // Chia mảng thành các chunk nhỏ
            for (let i = 0; i < missingDeptIds.length; i += BATCH_SIZE) {
                const batch = missingDeptIds.slice(i, i + BATCH_SIZE);
                
                // Xử lý song song trong lô này
                const batchPromises = batch.map(deptId => 
                    AppUtils.API.get(this.config.apiUrls.empList, {
                        phongban_id: deptId,
                        page_size: 1000
                    }).then(res => ({ deptId, res }))
                );

                // Đợi lô này xong mới làm lô tiếp theo
                const results = await Promise.all(batchPromises);

                // Lưu vào Cache ngay sau khi có kết quả
                results.forEach(({ deptId, res }) => {
                    if (res.success && res.data) {
                        const empIds = res.data.map(e => e.id.toString());
                        this.state.deptCache.set(deptId.toString(), empIds);
                    } else {
                        this.state.deptCache.set(deptId.toString(), []);
                    }
                });
            }
        } catch (e) {
            console.error('Error fetching dept employees:', e);
        } finally {
            this.state.isLoadingCache = false;
            // Gọi render lại 1 lần cuối để đảm bảo UI đồng bộ
            this.syncEmpCheckboxes();
        }
    }

    getEffectiveDeptIdsForEmployeeCache() {
        const selected = new Set(Array.from(this.state.selectedDepts).map(x => x.toString()));
        const effective = new Set(selected);

        // Nếu chọn đủ tất cả con của một cha => add cha
        // Lặp đến khi ổn định (trường hợp nhiều cấp)
        let changed = true;
        while (changed) {
            changed = false;

            this.state.deptMap.forEach((node, id) => {
                if (!node.childrenIds || node.childrenIds.length === 0) return;

                const allChildrenSelected = node.childrenIds.every(cid => effective.has(cid.toString()));
                if (allChildrenSelected && !effective.has(id.toString())) {
                    effective.add(id.toString());
                    changed = true;
                }
            });
        }

        return Array.from(effective);
    }

    // Thêm hàm rebuild cache khi xóa phòng ban
    rebuildDeptEmployeesCache() {
        // Clear set hiện tại
        this.state.deptEmployeeIds.clear();

        // Duyệt qua tất cả phòng ban đang được chọn
        this.state.selectedDepts.forEach(deptId => {
            const idStr = deptId.toString();
            // Lấy danh sách nhân viên từ Cache (nếu có)
            const empIds = this.state.deptCache.get(idStr);
            
            if (empIds && Array.isArray(empIds)) {
                empIds.forEach(empId => this.state.deptEmployeeIds.add(empId));
            }
        });
        
        // Không cần gọi API nào cả!
    }

    // Tự động loại bỏ nhân viên trùng khi chọn phòng ban
    cleanupDuplicateEmployees() {
        const toRemove = [];
        this.state.selectedEmps.forEach((_, empId) => {
            if (this.isEmployeeInSelectedDepts(empId)) {
                toRemove.push(empId);
            }
        });
        
        if (toRemove.length > 0) {
            toRemove.forEach(id => this.state.selectedEmps.delete(id));
            if (toRemove.length === 1) {
                AppUtils.Notify.info(`Đã tự động loại bỏ 1 nhân viên trùng với bộ phận đã chọn.`);
            } else {
                AppUtils.Notify.info(`Đã tự động loại bỏ ${toRemove.length} nhân viên trùng với bộ phận đã chọn.`);
            }
        }
    }

    open(initialData = null) {
        // Nếu chưa load tree, lưu data chờ xử lý sau
        if (!this.state.isTreeLoaded) {
            this.state. pendingInitialData = initialData;
            this.fetchDeptTree();
            this.fetchEmployees();
            this.state.isInitialized = true;
            AppUtils.Modal.open(this.modal);
            return;
        }
        
        // Đã load tree rồi, restore selection ngay
        if (initialData) {
            this._restoreSelection(initialData);
        }

        // Fetch employees nếu chưa
        if (!this. state.isInitialized) {
            this.fetchEmployees();
            this.state.isInitialized = true;
        }

        AppUtils.Modal.open(this.modal);
    }

    close() { 
        AppUtils.Modal.close(this.modal); 
    }

    clearAll() {
        this.state.selectedDepts.clear();
        this.state.selectedEmps.clear();
        this.state.deptEmployeeIds.clear();
        this.renderTree('main-tree');
        this.renderSelectedList();
        this.syncEmpCheckboxes();
    }

    // --- API DEPT TREE ---
    async fetchDeptTree() {
        try {
            const res = await AppUtils.API.get(this.config.apiUrls.deptTree);
            if (res.success) {
                this. state.treeData = res. data;
                this.buildDeptMap(res.data);
                this.renderTree('main-tree');
                this.renderTree('filter-tree');
                
                // ✅ THÊM:  Đánh dấu đã load xong
                this. state.isTreeLoaded = true;
                
                // ✅ THÊM: Nếu có data đang chờ, restore ngay
                if (this.state.pendingInitialData) {
                    this._restoreSelection(this.state.pendingInitialData);
                    this.state.pendingInitialData = null;
                }
            }
        } catch (e) { 
            console.error(e); 
        }
    }

    async _restoreSelection(initialData) {
        this.state.selectedDepts.clear();
        this.state.selectedEmps.clear();
        this.state.deptEmployeeIds.clear();

        // 1) Lấy consolidated deptIds
        let consolidatedDeptIds = [];
        if (initialData.deptIds && Array.isArray(initialData.deptIds)) {
            consolidatedDeptIds = initialData.deptIds.map(x => x.toString());
        } else if (initialData.depts) {
            consolidatedDeptIds = initialData.depts.map(d => d.id.toString());
        }

        // 2) EXPAND ra toàn bộ con cháu
        const expandedDeptIds = this.expandDeptIdsWithChildren(consolidatedDeptIds);
        expandedDeptIds.forEach(id => this.state.selectedDepts.add(id));

        // 3) Khôi phục Nhân viên
        if (initialData.emps) {
            initialData.emps.forEach(e => {
                this.state.selectedEmps.set(e.id.toString(), {
                    name: e.name,
                    dept: e.dept || '',
                    code: e.code || ''
                });
            });
        }

        // 4) ✅ TỐI ƯU: Fetch cache 1 lần cho tất cả phòng ban đã chọn
        await this.updateDeptEmployeesCache(expandedDeptIds);
        
        // 5) Build danh sách disable từ cache
        this.rebuildDeptEmployeesCache();

        this.renderTree('main-tree');
        this.renderSelectedList();
        this.syncEmpCheckboxes();
    }

    buildDeptMap(nodes, parentId = null) {
        nodes.forEach(node => {
            const id = node.id.toString();
            const isDept = node.maphongban !== undefined;
            const children = node.children || node.departments || [];
            if (isDept) {
                this.state.deptMap.set(id, { 
                    id, 
                    name: node.tenphongban, 
                    parentId, 
                    childrenIds: children.map(c => c.id.toString()) 
                });
            }
            this.buildDeptMap(children, isDept ? id : null);
        });
    }

    // --- API EMPLOYEES ---
    async fetchEmployees() {
        if (this.els.empTbody) {
            this.els.empTbody.innerHTML = '<tr><td colspan="3" class="text-center py-8 text-xs text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải dữ liệu...</td></tr>';
        }
        
        try {
            const params = {
                page: this.state.pagination.page,
                page_size: this.state.pagination.page_size,
                search: this.state.searchEmp,
                phongban_id: this.state.deptFilterId || ''
            };
            
            const res = await AppUtils.API.get(this.config.apiUrls.empList, params);
            if (res.success) {
                this.renderEmpList(res.data);
                
                const p = res.pagination || {};
                this.state.pagination = {
                    ...this.state.pagination,
                    page: p.page || 1,
                    total_pages: p.total_pages || 1,
                    total:  p.total || 0,
                    has_next: p.has_next,
                    has_prev: p.has_prev
                };
                this.updatePaginationUI();
            }
        } catch (e) {
            console.error(e);
            if (this.els.empTbody) {
                this.els.empTbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-xs text-red-400">Lỗi tải dữ liệu</td></tr>';
            }
        }
    }

    // --- RENDER TREE ---
    renderTree(targetType) {
        const container = targetType === 'main-tree' ? this.els.treeContainer : this.els.filterDropdownContent;
        if (!container) return;
        const isMain = targetType === 'main-tree';

        const buildHtml = (nodes, level = 0, visible = true) => {
            return nodes.map(node => {
                const id = node.id.toString();
                const isDept = node.maphongban !== undefined;
                const children = node.children || node.departments || [];
                const hasChild = children.length > 0;
                const expandKey = `${targetType}-${id}`;
                const isExpanded = this.state.expandedNodes.has(expandKey);
                
                const toggleBtn = hasChild 
                    ? `<button class="tree-toggle-btn w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors" data-id="${expandKey}"><i class="fas ${isExpanded ? 'fa-caret-down' : 'fa-caret-right'}"></i></button>` 
                    : '<span class="w-5"></span>';

                let contentHtml = '';
                if (isMain) {
                    const isChecked = isDept && this.state.selectedDepts.has(id);
                    const checkbox = isDept 
                        ? `<input type="checkbox" class="dept-checkbox w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500 cursor-pointer mr-2" data-id="${id}" ${isChecked ? 'checked' : ''}>` 
                        : `<i class="fas fa-building text-slate-300 mr-2 text-xs"></i>`;
                    const labelClass = isDept 
                        ? 'node-label cursor-pointer text-sm font-medium text-slate-700' 
                        : 'font-bold uppercase text-xs text-slate-500 tracking-wider';
                    contentHtml = `<div class="tree-node-row flex items-center py-1 hover:bg-slate-50 rounded pl-${level * 3} cursor-pointer">${toggleBtn}<div class="flex items-center select-none flex-1">${checkbox}<span class="${labelClass}" onclick="${isDept ? 'this.previousElementSibling.click()' : ''}">${node.tenphongban || node.tencongty_vi}</span></div></div>`;
                } else {
                    const isSelected = this.state.deptFilterId === id;
                    const rowClass = isDept 
                        ? `filter-tree-item cursor-pointer hover:bg-green-50 hover:text-green-700 ${isSelected ? 'bg-green-100 text-green-700 font-bold' : ''}` 
                        : 'text-slate-400 font-bold uppercase text-[10px] select-none pl-1';
                    contentHtml = `<div class="flex items-center py-1.5 rounded pl-${level * 3} ${rowClass}" data-id="${id}" data-name="${node.tenphongban}">${toggleBtn}<span class="text-xs truncate">${node.tenphongban || node.tencongty_vi}</span>${isSelected ? '<i class="fas fa-check ml-auto mr-2 text-green-600"></i>' : ''}</div>`;
                }

                return `<div class="${visible ? 'block' : 'hidden'}">${contentHtml}<div id="children-${expandKey}" class="${isExpanded ? '' : 'hidden'} ml-1 border-l border-slate-100">${buildHtml(children, level + 1, isExpanded)}</div></div>`;
            }).join('');
        };

        let finalHtml = '';
        if (! isMain) {
            finalHtml += `<div class="filter-tree-item py-2 px-3 hover:bg-green-50 cursor-pointer rounded flex items-center ${this.state.deptFilterId === '' ? 'bg-green-100 text-green-700 font-bold' : 'text-slate-600'}" data-id="" data-name="Tất cả bộ phận"><span class="text-xs">★ Tất cả bộ phận</span></div><div class="border-b border-slate-100 my-1"></div>`;
        }
        finalHtml += buildHtml(this.state.treeData);
        container.innerHTML = finalHtml;
    }

    toggleNodeExpand(key, targetType) {
        if (this.state.expandedNodes.has(key)) {
            this.state.expandedNodes.delete(key);
        } else {
            this.state.expandedNodes.add(key);
        }
        this.renderTree(targetType);
    }

    // Xử lý khi check/uncheck phòng ban - cập nhật cache
    async handleDeptCheck(deptId, isChecked) {
        deptId = deptId.toString();
        
        // Collect tất cả IDs sẽ bị ảnh hưởng (bao gồm con cháu)
        const affectedIds = [deptId];
        
        const collectChildren = (id) => {
            const node = this.state.deptMap.get(id);
            if (node && node.childrenIds) {
                node.childrenIds.forEach(cid => {
                    affectedIds. push(cid);
                    collectChildren(cid);
                });
            }
        };
        collectChildren(deptId);
        
        if (isChecked) {
            // Thêm vào selectedDepts
            affectedIds.forEach(id => this.state.selectedDepts.add(id));
            
            // Propagate lên cha
            this.propagateUpDeptCheck(deptId);
            
            // Chỉ fetch cache cho những phòng ban MỚI
            await this.updateDeptEmployeesCache(affectedIds);
        } else {
            // Xóa khỏi selectedDepts
            affectedIds.forEach(id => this. state.selectedDepts.delete(id));
            
            // Propagate lên cha (uncheck)
            this.propagateUpDeptUncheck(deptId);
            
            
        }
        
        await this.rebuildDeptEmployeesCache();
        // Tự động loại bỏ nhân viên trùng
        this.cleanupDuplicateEmployees();

        this.renderTree('main-tree');
        this.renderSelectedList();
        this.syncEmpCheckboxes();
    }

    // Tách riêng logic propagate up khi check
    propagateUpDeptCheck(deptId) {
        const node = this.state.deptMap.get(deptId);
        if (! node || !node.parentId) return;
        
        const pNode = this.state.deptMap.get(node.parentId);
        if (pNode) {
            const allChecked = pNode.childrenIds.every(cid => this. state.selectedDepts.has(cid));
            if (allChecked) {
                this.state.selectedDepts.add(node.parentId);
            }
            this.propagateUpDeptCheck(node.parentId);
        }
    }

    expandDeptIdsWithChildren(deptIds) {
        const result = new Set();
        const stack = (deptIds || []).map(x => x.toString());

        while (stack.length) {
            const id = stack.pop();
            if (!id || result.has(id)) continue;

            result.add(id);

            const node = this.state.deptMap.get(id);
            if (node && node.childrenIds && node.childrenIds.length) {
                node.childrenIds.forEach(cid => stack.push(cid.toString()));
            }
        }

        return Array.from(result);
    }

    // Tách riêng logic propagate up khi uncheck
    propagateUpDeptUncheck(deptId) {
        const node = this.state.deptMap.get(deptId);
        if (!node || !node. parentId) return;
        
        // Khi uncheck, parent cũng phải uncheck
        this.state.selectedDepts.delete(node.parentId);
        this.propagateUpDeptUncheck(node.parentId);
    }

    // --- RENDER EMP LIST ---
    // Hiển thị trạng thái disabled cho nhân viên đã thuộc phòng ban
    renderEmpList(employees) {
        if (!employees || employees.length === 0) {
            this.els.empTbody.innerHTML = '<tr><td colspan="3" class="text-center py-10 text-slate-400 text-xs italic">Không tìm thấy nhân viên nào</td></tr>';
            if (this.els.checkAllPage) this.els.checkAllPage.disabled = true;
            return;
        }
        if (this.els.checkAllPage) this.els.checkAllPage.disabled = false;

        const html = employees.map(emp => {
            const empId = emp.id.toString();
            const isChecked = this.state.selectedEmps.has(empId);
            const isInDept = this.isEmployeeInSelectedDepts(empId);
            const deptName = emp.cong_tac ? emp.cong_tac.phong_ban : 'N/A';
            
            const rowClass = isInDept 
                ? 'bg-slate-50 opacity-60 cursor-not-allowed' 
                : 'hover:bg-slate-50 cursor-pointer';
            
            const checkboxDisabled = isInDept ? 'disabled' : '';
            const checkboxClass = isInDept 
                ? 'emp-checkbox w-3.5 h-3.5 text-slate-300 rounded border-slate-200 cursor-not-allowed' 
                : 'emp-checkbox w-3.5 h-3.5 text-green-600 rounded border-slate-300 focus:ring-green-500 cursor-pointer';

            return `
                <tr class="${rowClass} border-b border-slate-50 transition-colors group" 
                    ${!isInDept ? 'onclick="this.querySelector(\'.emp-checkbox\').click()"' : ''}>
                    <td class="text-center py-2 px-2 w-10">
                        <input type="checkbox" 
                            class="${checkboxClass}"
                            data-id="${emp.id}" 
                            data-name="${emp.hovaten}" 
                            data-dept="${deptName}"
                            data-code="${emp.manhanvien || ''}"
                            ${isChecked && !isInDept ? 'checked' : ''}
                            ${checkboxDisabled}
                            onclick="event.stopPropagation()"
                        >
                    </td>
                    <td class="py-2 px-2">
                        <div class="flex items-center">
                            <span class="employee-name text-xs font-bold ${isInDept ? 'text-slate-400' : 'text-slate-700 group-hover:text-green-700'}">
                                ${emp.hovaten}
                            </span>
                        </div>
                        <div class="text-[10px] text-slate-500 truncate max-w-[150px]" title="${deptName}">${deptName}</div>
                    </td>
                </tr>
            `;
        }).join('');
        
        this.els.empTbody.innerHTML = html;
        this.updateCheckAllStatus();
    }

    renderSelectedList() {
        const container = this.els.selectedContainer;
        if (!container) return;

        // Lấy danh sách phòng ban cha (không hiển thị con nếu cha đã được chọn)
        const consolidatedDepts = [];
        const traverseCheck = (nodes) => {
            nodes.forEach(node => {
                if (node.maphongban && this.state.selectedDepts.has(node.id.toString())) {
                    consolidatedDepts.push({ id: node.id.toString(), name: node.tenphongban });
                    return; // Không traverse con nữa
                }
                if (node.children) traverseCheck(node.children);
                if (node.departments) traverseCheck(node.departments);
            });
        };
        traverseCheck(this.state.treeData);

        const total = consolidatedDepts.length + this.state.selectedEmps.size;
        this.els.countLabel.textContent = total;
        this.els.btnClear.classList.toggle('hidden', total === 0);

        if (total === 0) {
            container.innerHTML = '<div class="text-center text-slate-400 text-xs mt-10 italic">Chưa chọn đối tượng nào</div>';
            return;
        }

        let html = '';
        
        // Render Phòng ban
        consolidatedDepts.forEach(d => {
            html += `
                <div class="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg shadow-sm group hover:border-green-300 transition-all">
                    <div class="flex items-center gap-3 overflow-hidden">
                        <span class="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[10px] font-bold shrink-0 border border-green-200">BP</span>
                        <span class="text-xs font-medium text-slate-700 truncate" title="${d.name}">${d.name}</span>
                    </div>
                    <button type="button" class="remove-btn text-slate-300 hover:text-red-500 transition-colors p-1" data-type="dept" data-id="${d.id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>`;
        });
        
        // Render Nhân viên
        this.state.selectedEmps.forEach((v, id) => {
            const initials = this.getInitials(v.name);
            html += `
                <div class="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg shadow-sm group hover:border-blue-300 transition-all">
                    <div class="flex items-center gap-3 overflow-hidden">
                        <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-bold shrink-0 border border-blue-200">${initials}</span>
                        <div class="flex flex-col min-w-0">
                            <span class="text-xs font-medium text-slate-700 truncate" title="${v.name}">${v.name}</span>
                            <span class="text-[9px] text-slate-400 truncate">${v.dept}</span>
                        </div>
                    </div>
                    <button type="button" class="remove-btn text-slate-300 hover:text-red-500 transition-colors p-1" data-type="emp" data-id="${id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>`;
        });
        
        container.innerHTML = html;
    }

    updateCheckAllStatus() {
        if (! this.els.checkAllPage || !this.els.empTbody) return;
        
        // Chỉ tính các checkbox không bị disabled
        const checkboxes = Array.from(this.els.empTbody.querySelectorAll('.emp-checkbox:not(:disabled)'));
        
        if (checkboxes.length === 0) { 
            this.els.checkAllPage.checked = false; 
            this.els.checkAllPage.indeterminate = false;
            return; 
        }
        
        const all = checkboxes.every(cb => cb.checked);
        const some = checkboxes.some(cb => cb.checked);
        this.els.checkAllPage.checked = all;
        this.els.checkAllPage.indeterminate = some && !all;
    }

    syncEmpCheckboxes() {
        if (!this.els.empTbody) return;
        this.els.empTbody.querySelectorAll('.emp-checkbox').forEach(cb => {
            const empId = cb.dataset.id;
            const isInDept = this.isEmployeeInSelectedDepts(empId);
            const row = cb.closest('tr');
            const nameEl = row?.querySelector('.employee-name');

            cb.disabled = isInDept;
            if (isInDept) {
                cb.checked = false;
                cb.classList.add('text-slate-300', 'cursor-not-allowed');
                cb.classList.remove('text-green-600');
                if (row) {
                    row.classList.add('bg-slate-50', 'opacity-60', 'cursor-not-allowed');
                    row.classList.remove('hover:bg-slate-50', 'cursor-pointer');
                    row.removeAttribute('onclick');
                }
                if (nameEl) {
                    nameEl.classList.add('text-slate-400');
                    nameEl.classList.remove('text-slate-700', 'group-hover:text-green-700');
                }
            } else {
                cb.checked = this.state.selectedEmps.has(empId);
                cb.classList.remove('text-slate-300', 'cursor-not-allowed');
                cb.classList.add('text-green-600');
                if (row) {
                    row.classList.remove('bg-slate-50', 'opacity-60', 'cursor-not-allowed');
                    row.classList.add('hover:bg-slate-50', 'cursor-pointer');
                    row.setAttribute('onclick', "this.querySelector('.emp-checkbox').click()");
                }
                if (nameEl) {
                    nameEl.classList.remove('text-slate-400');
                    nameEl.classList.add('text-slate-700', 'group-hover:text-green-700');
                }
            }
        });
        this.updateCheckAllStatus();
    }

    changePage(delta) {
        const newPage = parseInt(this.state.pagination.page) + delta;
        if (newPage >= 1 && newPage <= this.state.pagination.total_pages) {
            this.state.pagination.page = newPage;
            this.fetchEmployees();
        }
    }

    updatePaginationUI() {
        const p = this.state.pagination;
        if (this.els.pageCurrent) this.els.pageCurrent.textContent = p.page;
        if (this.els.pageTotal) this.els.pageTotal.textContent = p.total_pages;
        if (this.els.totalInfo) this.els.totalInfo.textContent = `Tổng:  ${p.total}`;
        
        const setBtn = (btn, disabled) => {
            if (! btn) return;
            btn.disabled = disabled;
            btn.classList.toggle('opacity-50', disabled);
            btn.classList.toggle('cursor-not-allowed', disabled);
        };
        setBtn(this.els.btnPrev, ! p.has_prev);
        setBtn(this.els.btnNext, !p.has_next);
    }

    // Xử lý confirm với conflict detection
    async handleConfirm() {
        
        const btn = this.els.submitBtn;
        const oldText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-1"></i> Đang xử lý...';

        try {
            const payload = {
                dept_ids: Array.from(this.state.selectedDepts),
                emp_ids: Array.from(this.state.selectedEmps.keys()),
                exclude_schedule_id: this.config.scheduleId
            };
            
            const res = await AppUtils.API.post(this.config.apiUrls.checkConflict, payload);
            
            if (res.success) {
                // Không có conflict -> Finalize
                this.finalize();
            } else if (res.data && res.data.conflicts && res.data.conflicts.length > 0) {
                // Có conflict -> Hiển thị modal cảnh báo
                this.showConflictWarning(res.data.conflicts);
            } else {
                // Lỗi khác hoặc không có conflict data
                // Vẫn cho phép finalize (API trả success=false nhưng không có conflicts)
                this.finalize();
            }
        } catch (e) { 
            console.error('Check conflict error:', e);
            // Nếu API lỗi, vẫn cho phép tiếp tục (fallback)
            this.finalize();
        } finally { 
            btn.disabled = false; 
            btn.innerHTML = oldText; 
        }
    }

    // Hiển thị modal cảnh báo conflict
    showConflictWarning(conflicts) {
        // Build message
        let listHtml = '';
        conflicts.slice(0, 10).forEach(c => {
            listHtml += `<li class="py-1"><strong>${c.emp_name}</strong> <span class="text-slate-500">đang ở</span> <strong class="text-orange-600">${c.current_schedule_name}</strong></li>`;
        });
        
        if (conflicts.length > 10) {
            listHtml += `<li class="py-1 text-slate-500 italic">...và ${conflicts.length - 10} nhân viên khác</li>`;
        }

        const message = conflicts.length === 1
            ? `<p class="text-sm text-slate-600 mb-3">Nhân viên <strong>${conflicts[0].emp_name}</strong> đang được khai báo ở nhóm lịch làm việc <strong class="text-orange-600">${conflicts[0].current_schedule_name}</strong>.</p>
               <p class="text-sm text-slate-600">Bạn có muốn thêm mới nhân viên sang nhóm lịch làm việc mới này hay không?</p>`
            : `<p class="text-sm text-slate-600 mb-2">Các nhân viên sau đang thuộc lịch làm việc khác:</p>
               <ul class="list-disc pl-5 text-xs max-h-40 overflow-y-auto bg-slate-50 rounded p-2 mb-3">${listHtml}</ul>
               <p class="text-sm text-slate-600">Bạn có muốn chuyển các nhân viên này sang nhóm lịch làm việc mới không?</p>`;

        this.showCustomWarningModal({
            title: 'Cảnh báo',
            message: message,
            confirmText: 'Đồng ý',
            onConfirm: () => this.finalize()
        });
    }

    // Custom warning modal
    showCustomWarningModal(options) {
        const { title, message, confirmText, onConfirm } = options;

        // Remove existing
        document.getElementById('emp-selector-warning-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'emp-selector-warning-modal';
        modal.className = 'fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-95 opacity-0" id="warning-modal-content">
                <div class="p-6">
                    <!-- Header -->
                    <div class="flex items-start gap-4 mb-4">
                        <div class="shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                            <svg class="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                            </svg>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-lg font-semibold text-slate-900">${title}</h3>
                        </div>
                    </div>
                    
                    <!-- Body -->
                    <div class="mb-6">
                        ${message}
                    </div>
                    
                    <!-- Actions -->
                    <div class="flex justify-end">
                        <button type="button" id="warning-confirm-btn" class="px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover: transition-colors shadow-sm">
                            ${confirmText}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const modalContent = modal.querySelector('#warning-modal-content');
        const confirmBtn = modal.querySelector('#warning-confirm-btn');

        // Animate in
        requestAnimationFrame(() => {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        });

        const closeModal = () => {
            modalContent.classList.add('scale-95', 'opacity-0');
            modalContent.classList.remove('scale-100', 'opacity-100');
            setTimeout(() => modal.remove(), 200);
        };

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        confirmBtn.addEventListener('click', () => {
            closeModal();
            onConfirm();
        });
    }

    finalize() {
        // Lấy danh sách phòng ban hiển thị (consolidated)
        const displayDepts = [];
        const traverseDisplay = (nodes) => {
            nodes.forEach(node => {
                if (node.maphongban && this.state.selectedDepts.has(node.id.toString())) {
                    displayDepts.push({ id: node.id.toString(), name: node.tenphongban });
                    return;
                }
                if (node.children) traverseDisplay(node.children);
                if (node.departments) traverseDisplay(node.departments);
            });
        };
        traverseDisplay(this.state.treeData);

        // Build danh sách nhân viên với đầy đủ thông tin
        const emps = [];
        const empIds = [];
        this.state.selectedEmps.forEach((v, id) => {
            emps.push({
                id: id,
                name: v.name,
                dept: v.dept,
                code: v.code
            });
            empIds.push(id);
        });

        // Gọi callback với dữ liệu đầy đủ
        this.config.onConfirm({
            depts: displayDepts,
            deptIds: Array.from(this.state.selectedDepts),
            emps: emps,
            empIds: empIds
        });
        
        AppUtils.Modal.close(this.modal);
    }
}

// Export global
window.EmployeeSelectorController = EmployeeSelectorController;