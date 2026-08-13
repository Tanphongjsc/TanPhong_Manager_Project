/**
 * OrganizationTreeComponent
 *
 * Component hien thi cay Cong ty -> Phong ban. Component chi quan ly UI cua
 * cay (render, expand/collapse, single/multiple selection display). Moi logic
 * nghiep vu nhu cascade phong ban, loc nhan vien, conflict... do consumer xu ly.
 */
(function initOrganizationTree(global) {
    'use strict';

    const DEFAULT_TREE_URL = '/hrm/to-chuc-nhan-su/api/v1/phong-ban/tree/';
    const VALID_SELECTION_MODES = new Set(['multiple', 'single', 'navigation', 'none']);
    let instanceCounter = 0;

    const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

    const escapeHtml = (value) => String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

    const normalizeIds = (ids) => new Set(
        Array.from(ids || [])
            .filter((id) => id !== null && id !== undefined && String(id) !== '')
            .map((id) => String(id))
    );

    const normalizeSearchText = (value) => String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();

    class OrganizationTreeDataSource {
        static pendingRequests = new Map();

        /**
         * Chi gop cac request dang chay cung URL; khong cache response da hoan
         * thanh de tranh cay bi cu sau thao tac CRUD o noi khac.
         */
        static async load(url = DEFAULT_TREE_URL, options = {}) {
            if (!global.AppUtils?.API?.get) {
                throw new Error('AppUtils.API.get is required to load organization tree data');
            }

            const requestUrl = url || DEFAULT_TREE_URL;
            const shouldDedupe = options.dedupe !== false && !options.signal;
            const params = options.params || {};
            const paramsKey = Object.entries(params)
                .filter(([, value]) => value !== null && value !== undefined)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
                .join('&');
            const requestKey = paramsKey ? `${requestUrl}?${paramsKey}` : requestUrl;
            if (shouldDedupe && this.pendingRequests.has(requestKey)) {
                return this.pendingRequests.get(requestKey);
            }

            const request = global.AppUtils.API.get(
                requestUrl,
                params,
                options.signal ? { signal: options.signal } : {}
            ).then((response) => {
                if (!response || response.success === false) {
                    throw new Error(response?.message || 'Khong tai duoc cay co cau to chuc');
                }
                if (!Array.isArray(response.data)) {
                    throw new Error('Du lieu cay co cau to chuc khong hop le');
                }
                return response.data;
            });

            if (shouldDedupe) {
                this.pendingRequests.set(requestKey, request);
                request.finally(() => {
                    if (this.pendingRequests.get(requestKey) === request) {
                        this.pendingRequests.delete(requestKey);
                    }
                }).catch(() => {});
            }

            return request;
        }
    }

    class OrganizationTreeComponent {
        constructor(config = {}) {
            const container = this.resolveContainer(config.container);
            if (!container) {
                throw new Error('OrganizationTreeComponent requires a valid container');
            }

            this.instanceId = `organization-tree-${++instanceCounter}`;
            this.container = container;
            this.options = {
                selectionMode: VALID_SELECTION_MODES.has(config.selectionMode)
                    ? config.selectionMode
                    : 'single',
                companySelectable: config.companySelectable === true,
                showAllOption: config.showAllOption === true,
                allOptionLabel: config.allOptionLabel || 'Tat ca bo phan',
                allOptionIconClass: config.allOptionIconClass || 'fas fa-list-ul',
                defaultExpandCompanies: config.defaultExpandCompanies === true,
                showBranchLines: config.showBranchLines === true,
                indentSize: Number.isFinite(Number(config.indentSize)) ? Number(config.indentSize) : 12,
                baseIndent: Number.isFinite(Number(config.baseIndent)) ? Number(config.baseIndent) : 4,
                maxDepth: Number.isFinite(Number(config.maxDepth)) ? Number(config.maxDepth) : 50,
                maxNodes: Number.isFinite(Number(config.maxNodes)) ? Number(config.maxNodes) : 10000,
                loadingMessage: config.loadingMessage || 'Dang tai du lieu...',
                emptyMessage: config.emptyMessage || 'Chua co du lieu',
                noResultsMessage: config.noResultsMessage || 'Khong tim thay bo phan phu hop',
                errorMessage: config.errorMessage || 'Khong tai duoc du lieu bo phan',
                onSelect: typeof config.onSelect === 'function' ? config.onSelect : () => {},
                onError: typeof config.onError === 'function' ? config.onError : () => {},
                renderActions: typeof config.renderActions === 'function' ? config.renderActions : null
            };

            this.rawData = [];
            this.nodes = [];
            this.nodeByPath = new Map();
            this.expandedPaths = new Set();
            this.selectedIds = normalizeIds(config.selectedIds);
            this.selectedNodeKey = config.selectedNodeKey || '';
            this.searchTerm = '';
            this.searchVisiblePaths = null;
            this.loadVersion = 0;
            this.destroyed = false;

            this.handleClick = this.handleClick.bind(this);
            this.handleChange = this.handleChange.bind(this);
            this.container.addEventListener('click', this.handleClick);
            this.container.addEventListener('change', this.handleChange);
        }

        resolveContainer(container) {
            if (typeof container === 'string') {
                return global.document?.querySelector(container) || null;
            }
            return container && container.nodeType === 1 ? container : null;
        }

        static escapeHtml(value) {
            return escapeHtml(value);
        }

        static normalize(data, options = {}) {
            const maxDepth = Number.isFinite(Number(options.maxDepth)) ? Number(options.maxDepth) : 50;
            const maxNodes = Number.isFinite(Number(options.maxNodes)) ? Number(options.maxNodes) : 10000;
            const nodeByPath = new Map();
            let nodeCount = 0;

            const walk = (items, depth = 0, parentPath = '', ancestors = new Set()) => {
                if (!Array.isArray(items) || depth > maxDepth || nodeCount >= maxNodes) {
                    return [];
                }

                const result = [];
                for (let index = 0; index < items.length && nodeCount < maxNodes; index += 1) {
                    const raw = items[index];
                    if (!raw || typeof raw !== 'object' || ancestors.has(raw)) {
                        continue;
                    }

                    const isDepartment = hasOwn(raw, 'maphongban')
                        || hasOwn(raw, 'tenphongban')
                        || hasOwn(raw, 'phongbancha_id');
                    const type = isDepartment ? 'department' : 'company';
                    const id = raw.id === null || raw.id === undefined ? '' : String(raw.id);
                    const name = isDepartment
                        ? String(raw.tenphongban || '')
                        : String(raw.tencongty_vi || raw.tencongty || 'Cong ty');
                    const path = parentPath ? `${parentPath}.${index}` : String(index);
                    const rawChildren = isDepartment
                        ? (raw.children || raw.departments || [])
                        : (raw.departments || raw.children || []);
                    const nextAncestors = new Set(ancestors);
                    nextAncestors.add(raw);

                    nodeCount += 1;
                    const node = {
                        id,
                        type,
                        name,
                        path,
                        key: `${type}:${id}`,
                        raw,
                        selectable: id !== '',
                        children: walk(rawChildren, depth + 1, path, nextAncestors)
                    };
                    nodeByPath.set(path, node);
                    result.push(node);
                }
                return result;
            };

            return {
                nodes: walk(Array.isArray(data) ? data : []),
                nodeByPath,
                truncated: nodeCount >= maxNodes
            };
        }

        async load(url = DEFAULT_TREE_URL, options = {}) {
            const version = ++this.loadVersion;
            this.renderLoading();

            try {
                const data = await OrganizationTreeDataSource.load(url, options);
                if (this.destroyed || version !== this.loadVersion) {
                    return data;
                }
                this.setData(data, { preserveExpanded: false });
                return data;
            } catch (error) {
                if (!this.destroyed && version === this.loadVersion) {
                    this.renderError(error);
                    this.options.onError(error);
                }
                throw error;
            }
        }

        setData(data, { preserveExpanded = true } = {}) {
            const normalized = OrganizationTreeComponent.normalize(data, this.options);
            this.rawData = Array.isArray(data) ? data : [];
            this.nodes = normalized.nodes;
            this.nodeByPath = normalized.nodeByPath;

            if (!preserveExpanded) {
                this.expandedPaths.clear();
            } else {
                this.expandedPaths = new Set(
                    Array.from(this.expandedPaths).filter((path) => this.nodeByPath.has(path))
                );
            }

            if (this.options.defaultExpandCompanies && (!preserveExpanded || this.expandedPaths.size === 0)) {
                this.nodes.forEach((node) => {
                    if (node.type === 'company' && node.children.length > 0) {
                        this.expandedPaths.add(node.path);
                    }
                });
            }

            if (normalized.truncated) {
                console.warn(`Organization tree was limited to ${this.options.maxNodes} nodes`);
            }
            this.render();
        }

        getData() {
            return this.rawData;
        }

        setSelectedIds(ids, { render = true } = {}) {
            this.selectedIds = normalizeIds(ids);
            if (render) this.render();
        }

        getSelectedIds() {
            return Array.from(this.selectedIds);
        }

        setSearch(term, { render = true } = {}) {
            this.searchTerm = normalizeSearchText(term);
            this.searchVisiblePaths = this.buildSearchVisiblePaths();
            if (render) this.render();
        }

        clearSearch({ render = true } = {}) {
            this.searchTerm = '';
            this.searchVisiblePaths = null;
            if (render) this.render();
        }

        buildSearchVisiblePaths() {
            if (!this.searchTerm) return null;
            const visiblePaths = new Set();

            const addSubtree = (node) => {
                visiblePaths.add(node.path);
                node.children.forEach(addSubtree);
            };

            const visit = (node) => {
                const selfMatches = normalizeSearchText(node.name).includes(this.searchTerm);
                let childMatches = false;
                node.children.forEach((child) => {
                    if (visit(child)) childMatches = true;
                });

                if (selfMatches) {
                    addSubtree(node);
                } else if (childMatches) {
                    visiblePaths.add(node.path);
                }
                return selfMatches || childMatches;
            };

            this.nodes.forEach(visit);
            return visiblePaths;
        }

        setSelectedNode(type, id, { render = true } = {}) {
            this.selectedNodeKey = id === null || id === undefined || String(id) === ''
                ? ''
                : `${type}:${String(id)}`;
            if (render) this.render();
        }

        renderLoading() {
            this.container.innerHTML = `
                <div class="text-center py-4 text-xs text-slate-400" data-organization-tree-state="loading">
                    <i class="fas fa-spinner fa-spin mr-1"></i>${escapeHtml(this.options.loadingMessage)}
                </div>
            `;
        }

        renderError(error) {
            this.container.innerHTML = `
                <div class="text-xs text-red-500 p-2" data-organization-tree-state="error" title="${escapeHtml(error?.message || '')}">
                    ${escapeHtml(this.options.errorMessage)}
                </div>
            `;
        }

        render() {
            if (this.destroyed) return;

            if (this.searchTerm) {
                this.searchVisiblePaths = this.buildSearchVisiblePaths();
            }
            let html = '<div class="organization-tree space-y-0.5" role="tree">';
            if (this.options.showAllOption) {
                html += this.renderAllOption();
            }

            if (this.nodes.length === 0) {
                html += `<div class="text-center py-4 text-xs text-slate-400" data-organization-tree-state="empty">${escapeHtml(this.options.emptyMessage)}</div>`;
            } else if (this.searchVisiblePaths && this.searchVisiblePaths.size === 0) {
                html += `<div class="text-center py-4 text-xs text-slate-400" data-organization-tree-state="no-results">${escapeHtml(this.options.noResultsMessage)}</div>`;
            } else {
                html += this.renderNodes(this.nodes, 0);
            }
            html += '</div>';
            this.container.innerHTML = html;
        }

        renderAllOption() {
            const isSelected = this.selectedIds.size === 0;
            const selectedClass = isSelected
                ? 'bg-blue-100 text-blue-700 font-semibold'
                : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700';
            return `
                <div class="organization-tree-select flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-xs ${selectedClass}"
                     data-tree-all="true" role="treeitem" aria-selected="${isSelected}">
                    <i class="${escapeHtml(this.options.allOptionIconClass)} text-[10px]"></i>
                    <span>${escapeHtml(this.options.allOptionLabel)}</span>
                </div>
                <div class="border-b border-slate-100 my-1"></div>
            `;
        }

        renderNodes(nodes, level) {
            return nodes
                .filter((node) => !this.searchVisiblePaths || this.searchVisiblePaths.has(node.path))
                .map((node) => this.renderNode(node, level))
                .join('');
        }

        renderNode(node, level) {
            const hasChildren = node.children.length > 0;
            const hasVisibleChild = this.searchVisiblePaths
                && node.children.some((child) => this.searchVisiblePaths.has(child.path));
            const isExpanded = this.expandedPaths.has(node.path) || Boolean(hasVisibleChild);
            const indent = this.options.baseIndent + (level * this.options.indentSize);
            const toggle = hasChildren
                ? `<button type="button" class="organization-tree-toggle w-5 h-5 shrink-0 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                           data-tree-path="${escapeHtml(node.path)}" aria-label="${isExpanded ? 'Thu gon' : 'Mo rong'}" aria-expanded="${isExpanded}">
                       <i class="fas ${isExpanded ? 'fa-caret-down' : 'fa-caret-right'} text-[10px]"></i>
                   </button>`
                : '<span class="w-5 h-5 shrink-0"></span>';

            const row = node.type === 'company'
                ? this.renderCompanyRow(node, toggle, indent, isExpanded)
                : this.renderDepartmentRow(node, toggle, indent);
            const branchClass = this.options.showBranchLines ? 'ml-1 border-l border-slate-100' : '';
            const children = hasChildren
                ? `<div class="${isExpanded ? '' : 'hidden'} ${branchClass}" role="group">${this.renderNodes(node.children, level + 1)}</div>`
                : '';

            return `<div data-tree-node-path="${escapeHtml(node.path)}">${row}${children}</div>`;
        }

        renderCompanyRow(node, toggle, indent, isExpanded) {
            const isNavigation = this.options.selectionMode === 'navigation' && this.options.companySelectable;
            const isSelected = isNavigation && this.selectedNodeKey === node.key;
            const rowClass = isNavigation
                ? `organization-tree-select cursor-pointer rounded ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-50 text-slate-500'}`
                : 'text-slate-400';
            const actions = this.options.renderActions
                ? String(this.options.renderActions(node.raw, node) || '')
                : '';

            return `
                <div class="flex items-center gap-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${rowClass}"
                     style="padding-left:${indent}px" ${isNavigation ? `data-tree-select-path="${escapeHtml(node.path)}"` : ''}
                     role="treeitem" aria-expanded="${node.children.length ? isExpanded : 'false'}">
                    ${toggle}
                    <i class="fas fa-building text-slate-300 mr-1 text-xs"></i>
                    <span class="truncate flex-1">${escapeHtml(node.name)}</span>
                    ${actions}
                </div>
            `;
        }

        renderDepartmentRow(node, toggle, indent) {
            const isSelected = this.selectedIds.has(node.id)
                || (this.options.selectionMode === 'navigation' && this.selectedNodeKey === node.key);
            const actions = this.options.renderActions
                ? String(this.options.renderActions(node.raw, node) || '')
                : '';

            if (this.options.selectionMode === 'multiple') {
                return `
                    <div class="organization-tree-row flex items-center py-1 hover:bg-slate-50 rounded cursor-pointer"
                         style="padding-left:${indent}px" role="treeitem">
                        ${toggle}
                        <label class="flex items-center select-none flex-1 min-w-0 cursor-pointer">
                            <input type="checkbox" class="organization-tree-checkbox w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer mr-2"
                                   data-tree-path="${escapeHtml(node.path)}" ${isSelected ? 'checked' : ''}>
                            <span class="text-sm font-medium text-slate-700 truncate">${escapeHtml(node.name)}</span>
                        </label>
                        ${actions}
                    </div>
                `;
            }

            const isSelectable = this.options.selectionMode === 'single'
                || this.options.selectionMode === 'navigation';
            const selectedClass = isSelected
                ? 'bg-blue-100 text-blue-700 font-semibold'
                : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700';
            return `
                <div class="${isSelectable ? 'organization-tree-select cursor-pointer' : ''} flex items-center gap-1 py-1.5 rounded ${selectedClass}"
                     style="padding-left:${indent}px" ${isSelectable ? `data-tree-select-path="${escapeHtml(node.path)}"` : ''}
                     role="treeitem" aria-selected="${isSelected}">
                    ${toggle}
                    <span class="truncate text-xs flex-1">${escapeHtml(node.name)}</span>
                    ${isSelected ? '<i class="fas fa-check ml-auto mr-2 text-[10px]"></i>' : ''}
                    ${actions}
                </div>
            `;
        }

        handleClick(event) {
            const customAction = event.target.closest?.('[data-organization-tree-action]');
            if (customAction && this.container.contains(customAction)) {
                return;
            }

            const toggle = event.target.closest?.('.organization-tree-toggle');
            if (toggle && this.container.contains(toggle)) {
                event.preventDefault();
                event.stopPropagation();
                const path = toggle.dataset.treePath;
                if (!this.nodeByPath.has(path)) return;
                if (this.expandedPaths.has(path)) {
                    this.expandedPaths.delete(path);
                } else {
                    this.expandedPaths.add(path);
                }
                this.render();
                return;
            }

            const allOption = event.target.closest?.('[data-tree-all="true"]');
            if (allOption && this.container.contains(allOption)) {
                event.preventDefault();
                event.stopPropagation();
                this.selectedIds.clear();
                this.selectedNodeKey = '';
                this.render();
                this.options.onSelect({ id: '', name: this.options.allOptionLabel, type: 'all', selected: true, raw: null });
                return;
            }

            const selectRow = event.target.closest?.('[data-tree-select-path]');
            if (!selectRow || !this.container.contains(selectRow)) return;
            event.preventDefault();
            event.stopPropagation();

            const node = this.nodeByPath.get(selectRow.dataset.treeSelectPath);
            if (!node || !node.selectable) return;
            if (this.options.selectionMode === 'single') {
                this.selectedIds = new Set([node.id]);
            } else if (this.options.selectionMode === 'navigation') {
                this.selectedNodeKey = node.key;
            }
            this.render();
            this.emitSelect(node, true, event);
        }

        handleChange(event) {
            const checkbox = event.target.closest?.('.organization-tree-checkbox');
            if (!checkbox || !this.container.contains(checkbox)) return;

            event.stopPropagation();
            const node = this.nodeByPath.get(checkbox.dataset.treePath);
            if (!node || node.type !== 'department' || !node.selectable) return;
            this.emitSelect(node, checkbox.checked, event);
        }

        emitSelect(node, selected, event) {
            this.options.onSelect({
                id: node.id,
                name: node.name,
                type: node.type,
                selected: Boolean(selected),
                raw: node.raw,
                node,
                originalEvent: event
            });
        }

        destroy({ clear = false } = {}) {
            if (this.destroyed) return;
            this.destroyed = true;
            this.loadVersion += 1;
            this.container.removeEventListener('click', this.handleClick);
            this.container.removeEventListener('change', this.handleChange);
            if (clear) this.container.innerHTML = '';
            this.nodeByPath.clear();
        }
    }

    global.OrganizationTreeDataSource = OrganizationTreeDataSource;
    global.OrganizationTreeComponent = OrganizationTreeComponent;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { OrganizationTreeDataSource, OrganizationTreeComponent };
    }
})(typeof window !== 'undefined' ? window : globalThis);
