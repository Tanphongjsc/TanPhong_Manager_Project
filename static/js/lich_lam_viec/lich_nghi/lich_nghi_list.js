/**
 * lich_nghi_list.js
 * Controller cho trang danh sách Lịch Nghỉ.
 * Sử dụng TableManager + AppUtils theo pattern của lich_lam_viec.js
 */
document.addEventListener('DOMContentLoaded', () => {
    AppUtils.init();

    const API_LIST_URL = '/hrm/lich-lam-viec/api/lich-nghi/list/';
    const API_DELETE_BASE = '/hrm/lich-lam-viec/api/lich-nghi/';
    const UPDATE_URL_BASE = '/hrm/lich-lam-viec/thiet-ke-nghi/lich-nghi/';

    // ── Init TableManager theo đúng API ──
    const tableManager = new TableManager({
        tableBody: document.getElementById('table-body-lich-nghi'),
        paginationContainer: document.querySelector('.pagination-container'),
        searchInput: document.getElementById('search-lich-nghi'),
        filtersForm: document.getElementById('filter-lich-nghi'),

        enableBulkActions: true,
        selectAllCheckbox: document.getElementById('select-all-lich-nghi'),
        bulkActionsContainer: document.getElementById('bulk-actions-lich-nghi'),
        onBulkDelete: (ids) => _bulkDelete(ids),

        apiEndpoint: API_LIST_URL,
        onRenderRow: (item) => _renderRow(item),
    });

    // ── Render row: trả về HTMLElement (tr) ──
    function _renderRow(item) {
        const id = item.id;
        const updateUrl = `${UPDATE_URL_BASE}${id}/update/`;

        const isChecked = item.TrangThai === 'active' ? 'checked' : '';
        const trangThaiHtml = `
            <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" class="sr-only peer toggle-status" data-id="${id}" ${isChecked}>
                <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
        `;

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors border-b border-slate-100';
        tr.dataset.id = id;
        tr.innerHTML = `
            <td class="px-4 py-2 w-10">
                <input type="checkbox" value="${id}" class="row-checkbox w-4 h-4 text-blue-600 border-slate-300 rounded cursor-pointer">
            </td>
            <td class="px-4 py-2">
                <a href="${updateUrl}" class="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors">
                    ${_esc(item.TenLichNghi || '—')}
                </a>
            </td>
            <td class="px-4 py-2 text-sm text-slate-600 font-mono">${_esc(item.MaLichNghi || '—')}</td>
            <td class="px-4 py-2 text-center">${trangThaiHtml}</td>
            <td class="px-4 py-2">
                <div class="flex items-center justify-end gap-1">
                    <a href="${updateUrl}"
                       class="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                       title="Sửa lịch nghỉ">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/>
                        </svg>
                    </a>
                    <button type="button"
                            class="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors btn-delete-row"
                            data-id="${id}"
                            data-name="${_escAttr(item.TenLichNghi || '')}"
                            title="Xóa lịch nghỉ">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
                        </svg>
                    </button>
                </div>
            </td>
        `;
        return tr;
    }

    // ── Toggle status ──
    document.addEventListener('change', async (e) => {
        if (e.target.matches('.toggle-status')) {
            const toggle = e.target;
            const id = toggle.dataset.id;
            const isChecked = toggle.checked;
            toggle.disabled = true;
            try {
                const res = await AppUtils.API.post(`/hrm/lich-lam-viec/api/lich-nghi/${id}/toggle-status/`, {
                    trangthai: isChecked ? 'active' : 'inactive'
                });
                if (res.success) {
                    AppUtils.Notify.success('Cập nhật trạng thái thành công.');
                } else {
                    toggle.checked = !isChecked;
                    AppUtils.Notify.error(res.message || 'Không thể cập nhật trạng thái.');
                }
            } catch (err) {
                toggle.checked = !isChecked;
                AppUtils.Notify.error('Có lỗi xảy ra khi cập nhật trạng thái.');
            } finally {
                toggle.disabled = false;
            }
        }
    });

    // ── Single delete ──
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-delete-row');
        if (!btn) return;

        const id = btn.dataset.id;
        const name = btn.dataset.name || 'lịch nghỉ này';

        AppUtils.Modal.showConfirm({
            title: 'Xác nhận xóa',
            message: `Bạn có chắc muốn xóa lịch nghỉ "<strong>${_esc(name)}</strong>"?<br><span class="text-slate-500 text-xs">Hành động này không thể hoàn tác.</span>`,
            confirmText: 'Xóa',
            type: 'danger',
            onConfirm: async () => {
                try {
                    const res = await AppUtils.API.delete(`${API_DELETE_BASE}${id}/delete/`);
                    if (res.success) {
                        AppUtils.Notify.success('Xóa lịch nghỉ thành công.');
                        tableManager.fetchData();
                    } else {
                        AppUtils.Notify.error(res.message || 'Không thể xóa lịch nghỉ.');
                    }
                } catch {
                    AppUtils.Notify.error('Có lỗi xảy ra khi xóa.');
                }
            }
        });
    });

    // ── Bulk delete ──
    async function _bulkDelete(ids) {
        try {
            const res = await AppUtils.API.delete(`${API_DELETE_BASE}bulk-delete/`, { ids });
            if (res.success) {
                AppUtils.Notify.success(`Đã xóa ${ids.length} lịch nghỉ.`);
                tableManager.fetchData();
            } else {
                AppUtils.Notify.error(res.message || 'Không thể xóa.');
            }
        } catch {
            AppUtils.Notify.error('Có lỗi xảy ra khi xóa hàng loạt.');
        }
    }

    // ── Escape helpers ──
    function _esc(str) {
        return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }
    function _escAttr(str) {
        return _esc(str);
    }
});
