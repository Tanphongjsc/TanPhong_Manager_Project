/**
 * OrgTreeComponent — Reusable Organization Tree Component
 * 
 * Renders a hierarchical tree of companies and departments.
 * Supports three variants: 'sidebar', 'inline', 'dropdown'.
 * All DOM queries are scoped to the component root element,
 * allowing multiple instances on the same page without ID conflicts.
 *
 * Usage:
 *   const tree = new OrgTreeComponent({
 *       componentId: 'employee-org-tree',
 *       apiUrl: '/api/v1/phong-ban/tree/',
 *       variant: 'sidebar',
 *       showActions: true,
 *       selectableMode: 'all',
 *       onSelect: ({ id, name, isCompany, item, params }) => { ... },
 *       actions: { onAddCompany, onAddSub, onEditCompany, ... }
 *   });
 *   tree.init();
 */
class OrgTreeComponent {
    /**
     * @param {Object} config
     * @param {string}   config.componentId      - Matches data-component-id on the root element
     * @param {string}   [config.apiUrl]          - API endpoint for tree data
     * @param {string}   [config.variant]         - 'sidebar' | 'inline' | 'dropdown'
     * @param {boolean}  [config.showActions]     - Show CRUD action buttons on nodes
     * @param {boolean}  [config.showAll]         - Show "View all" button
     * @param {boolean}  [config.showAddCompany]  - Show "Add company" button in header
     * @param {string}   [config.selectableMode]  - 'all' | 'company' | 'department'
     * @param {Function} [config.onSelect]        - Callback when a node is selected
     * @param {Function} [config.onViewAll]       - Callback when "View All" is clicked
     * @param {Object}   [config.actions]         - CRUD action callbacks
     * @param {Function} [config.actions.onAddCompany]
     * @param {Function} [config.actions.onAddSub]
     * @param {Function} [config.actions.onEditCompany]
     * @param {Function} [config.actions.onDeleteCompany]
     * @param {Function} [config.actions.onEditDept]
     * @param {Function} [config.actions.onDeleteDept]
     */
    constructor(config = {}) {
        this.config = {
            componentId: config.componentId || 'org-tree',
            apiUrl: config.apiUrl || '/hrm/to-chuc-nhan-su/api/v1/phong-ban/tree/',
            variant: config.variant || 'sidebar',
            showActions: config.showActions !== undefined ? config.showActions : true,
            showAll: config.showAll !== undefined ? config.showAll : false,
            showAddCompany: config.showAddCompany !== undefined ? config.showAddCompany : true,
            selectableMode: config.selectableMode || 'all', // 'all', 'company', 'department'
            onSelect: config.onSelect || null,
            onViewAll: config.onViewAll || null,
            actions: config.actions || {}
        };

        // Find root element
        this.root = document.querySelector(`[data-component-id="${this.config.componentId}"]`);
        if (!this.root) {
            console.warn(`OrgTreeComponent: root element [data-component-id="${this.config.componentId}"] not found.`);
            return;
        }

        // Cache scoped elements
        this.els = {
            treeRoot: this.root.querySelector('[data-org-tree-root]'),
            template: this.root.querySelector('[data-org-tree-node-template]'),
            viewAll: this.root.querySelector('[data-org-tree-view-all]'),
            search: this.root.querySelector('[data-org-tree-search]'),
            addCompanyBtn: this.root.querySelector('[data-org-tree-add-company]'),
            closeBtn: this.root.querySelector('[data-org-tree-close]'),
            // Dropdown-specific elements
            dropdownBtn: this.root.querySelector('[data-org-tree-dropdown-btn]'),
            dropdownPanel: this.root.querySelector('[data-org-tree-dropdown-panel]'),
            dropdownSelectedText: this.root.querySelector('[data-org-tree-selected-text]'),
            dropdownIcon: this.root.querySelector('[data-org-tree-dropdown-icon]'),
            hiddenInput: this.root.querySelector('[data-org-tree-hidden-input]')
        };

        this.eventManager = AppUtils.EventManager.create();
        this.isDropdownOpen = false;
        this.selectedNodeId = null;
        this.treeData = [];
    }

    // --- Lifecycle ---

    init() {
        if (!this.root) return;
        this.fetchTree();
        this._initEvents();
    }

    destroy() {
        if (this.eventManager) {
            this.eventManager.removeAll();
        }
        if (this.els.treeRoot) {
            this.els.treeRoot.innerHTML = '';
        }
    }

    // --- Public API ---

    async fetchTree() {
        return this.refresh();
    }

    async refresh() {
        if (!this.els.treeRoot) return;
        this.els.treeRoot.innerHTML = '<div class="text-center py-4 text-slate-400 text-xs"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';
        try {
            const res = await AppUtils.API.get(this.config.apiUrl);
            this.treeData = res.data || [];
            this._renderTree(this.treeData);
        } catch (e) {
            this.els.treeRoot.innerHTML = '<div class="text-center py-4 text-red-400 text-xs">Lỗi tải dữ liệu</div>';
            AppUtils.Notify.error('Không thể tải cây tổ chức');
        }
    }

    togglePanel(show) {
        if (this.config.variant === 'dropdown') {
            this._toggleDropdown(show);
        } else if (this.config.variant === 'sidebar') {
            this._toggleSidebar(show);
        }
        // 'inline' variant is always visible, no toggle needed
    }

    selectNode(nodeEl, id, name, isCompany, item) {
        const mode = this.config.selectableMode;
        // If mode restricts selection, ignore un-selectable nodes
        if (mode === 'company' && !isCompany) return;
        if (mode === 'department' && isCompany) return;

        // Update visual state within this component only
        this.root.querySelectorAll('.org-tree-item').forEach(i => {
            i.classList.remove('bg-blue-50', 'text-blue-700', 'font-medium');
        });
        if (this.els.viewAll) {
            this.els.viewAll.classList.remove('bg-blue-50', 'text-blue-700', 'font-medium');
        }

        if (nodeEl) {
            nodeEl.classList.add('bg-blue-50', 'text-blue-700', 'font-medium');
        }

        this.selectedNodeId = id;

        // Build params for caller
        const params = isCompany
            ? { congty_id: id, phongban_id: null }
            : { phongban_id: id, congty_id: null };

        // Dropdown: update display text and hidden input
        if (this.config.variant === 'dropdown') {
            if (this.els.dropdownSelectedText) {
                this.els.dropdownSelectedText.textContent = name || '-- Chọn --';
                this.els.dropdownSelectedText.className = id
                    ? 'text-slate-900 text-sm truncate'
                    : 'text-slate-500 text-sm truncate';
            }
            if (this.els.hiddenInput) {
                this.els.hiddenInput.value = id || '';
            }
            this._toggleDropdown(false);
        }

        // Sidebar: auto-close on mobile
        if (this.config.variant === 'sidebar') {
            this._toggleSidebar(false);
        }

        // Fire callback
        if (this.config.onSelect) {
            this.config.onSelect({ id, name, isCompany, item, params });
        }
    }

    // --- Internal Rendering ---

    _renderTree(data) {
        this.els.treeRoot.innerHTML = '';
        if (!data.length) {
            this.els.treeRoot.innerHTML = '<div class="text-center py-4 text-slate-400 text-xs">Chưa có dữ liệu</div>';
            return;
        }

        this._buildNodes(data, this.els.treeRoot);
    }

    _buildNodes(items, container) {
        items.forEach(item => {
            const clone = this.els.template.content.cloneNode(true);
            const li = clone.querySelector('li');
            const div = clone.querySelector('.org-tree-item');
            const childrenUl = clone.querySelector('.org-tree-children');

            const isCompany = item.type === 'company' || (!item.phongbancha_id && item.tencongty_vi);
            const name = isCompany ? item.tencongty_vi : item.tenphongban;
            const companyId = isCompany ? item.id : (item.congty_id || item.company_id || item.congty?.id);

            div.dataset.id = item.id;
            div.dataset.companyId = companyId || '';

            clone.querySelector('.org-tree-name').textContent = name;
            clone.querySelector('.org-tree-icon').className =
                `org-tree-icon fas ${isCompany ? 'fa-building text-blue-600' : 'fa-folder text-yellow-500'}`;

            // Actions visibility
            const actionsDiv = div.querySelector('.org-tree-actions');
            if (actionsDiv) {
                if (!this.config.showActions) {
                    actionsDiv.remove();
                } else if (window.innerWidth < 1024) {
                    // Mobile: always show actions
                    actionsDiv.classList.replace('hidden', 'flex');
                    actionsDiv.classList.add('lg:hidden', 'lg:group-hover:flex');
                }
            }

            // Selection mode visual hints for non-selectable nodes
            const mode = this.config.selectableMode;
            if ((mode === 'department' && isCompany) || (mode === 'company' && !isCompany)) {
                div.classList.add('opacity-60', 'cursor-default');
                div.classList.remove('cursor-pointer');
            }

            // Children
            const children = item.children || item.departments;
            if (children?.length) {
                const toggle = clone.querySelector('.org-tree-toggle');
                toggle.classList.remove('invisible');
                toggle.onclick = (e) => {
                    e.stopPropagation();
                    childrenUl.classList.toggle('hidden');
                    const isExpanded = !childrenUl.classList.contains('hidden');
                    toggle.classList.toggle('is-open', isExpanded);
                };
                // Auto-expand for dropdown variant
                if (this.config.variant === 'dropdown') {
                    childrenUl.classList.remove('hidden');
                    toggle.classList.add('is-open');
                }
                this._buildNodes(children, childrenUl);
            }

            // Node click — selection
            div.onclick = (e) => {
                if (e.target.closest('button.org-tree-action-btn')) return;
                this.selectNode(div, item.id, name, isCompany, item);
            };

            // CRUD Buttons (only if actions are shown)
            if (this.config.showActions) {
                const bind = (sel, fn) => {
                    const b = div.querySelector(sel);
                    if (b) b.onclick = (e) => { e.stopPropagation(); fn(); };
                };

                if (isCompany) {
                    bind('.org-tree-btn-add-sub', () =>
                        this.config.actions.onAddSub?.(item.id, true, name, companyId));
                    bind('.org-tree-btn-edit', () =>
                        this.config.actions.onEditCompany?.(item.id));
                    bind('.org-tree-btn-delete', () =>
                        this.config.actions.onDeleteCompany?.(item.id, name));
                } else {
                    bind('.org-tree-btn-add-sub', () =>
                        this.config.actions.onAddSub?.(item.id, false, name, companyId));
                    bind('.org-tree-btn-edit', () =>
                        this.config.actions.onEditDept?.(item.id));
                    bind('.org-tree-btn-delete', () =>
                        this.config.actions.onDeleteDept?.(item.id, name));
                }
            }

            container.appendChild(li);
        });
    }

    // --- Internal Events ---

    _initEvents() {
        // "View All" button
        if (this.els.viewAll && this.config.showAll) {
            this.eventManager.add(this.els.viewAll, 'click', () => {
                this.selectNode(this.els.viewAll, null, 'Tất cả nhân viên', false, null);
                if (this.config.onViewAll) {
                    this.config.onViewAll();
                }
            });
        }

        // Search
        if (this.els.search) {
            this.eventManager.add(this.els.search, 'input',
                AppUtils.Helper.debounce((e) => {
                    const val = AppUtils.Helper.removeAccents(e.target.value.toLowerCase());
                    this.els.treeRoot.querySelectorAll('.org-tree-item').forEach(item => {
                        const li = item.closest('li');
                        const text = AppUtils.Helper.removeAccents(item.textContent.toLowerCase());
                        const match = text.includes(val);
                        li.style.display = match ? 'block' : 'none';
                        if (match && val) {
                            let p = li.parentElement.closest('li');
                            while (p) {
                                p.style.display = 'block';
                                p.querySelector('.org-tree-children')?.classList.remove('hidden');
                                p = p.parentElement.closest('li');
                            }
                        }
                    });
                    if (!val) {
                        this.els.treeRoot.querySelectorAll('li').forEach(li => li.style.display = 'block');
                    }
                }, 300)
            );
        }

        // Add Company button
        if (this.els.addCompanyBtn && this.config.actions.onAddCompany) {
            this.eventManager.add(this.els.addCompanyBtn, 'click', () => {
                this.config.actions.onAddCompany();
            });
        }

        // Close button (sidebar mobile)
        if (this.els.closeBtn) {
            this.eventManager.add(this.els.closeBtn, 'click', () => {
                this._toggleSidebar(false);
            });
        }

        // Dropdown toggle + outside click
        if (this.config.variant === 'dropdown') {
            if (this.els.dropdownBtn) {
                this.eventManager.add(this.els.dropdownBtn, 'click', (e) => {
                    e.stopPropagation();
                    this._toggleDropdown(!this.isDropdownOpen);
                    if (this.isDropdownOpen && this.els.search) {
                        setTimeout(() => this.els.search.focus(), 100);
                    }
                });
            }

            this.eventManager.add(document, 'click', (e) => {
                if (this.isDropdownOpen && !this.root.contains(e.target)) {
                    this._toggleDropdown(false);
                }
            });
        }
    }

    // --- Sidebar helpers ---

    _toggleSidebar(show) {
        // Find overlay - it sits outside the component root but tied by data attribute
        const overlayId = this.root.dataset.overlayId;
        const overlay = overlayId ? document.getElementById(overlayId) : null;

        this.root.classList.toggle('open', show);
        if (overlay) overlay.classList.toggle('hidden', !show);
    }

    // --- Dropdown helpers ---

    _toggleDropdown(show) {
        this.isDropdownOpen = show;
        if (this.els.dropdownPanel) {
            this.els.dropdownPanel.classList.toggle('hidden', !show);
        }
        if (this.els.dropdownIcon) {
            this.els.dropdownIcon.classList.toggle('rotate-180', show);
        }
    }
}

// Expose globally
window.OrgTreeComponent = OrgTreeComponent;
