/**
 * File: dmht_hopdong.js
 * Quản lý Danh mục Hợp đồng
 */

const HopDongManager = {
    currentItemId: null,
    
    API_URLS: {
        detail: (id) => `/hrm/to-chuc-nhan-su/api/hop-dong/${id}/detail/`,
        delete: (id) => `/hrm/to-chuc-nhan-su/api/hop-dong/${id}/delete/`,
    },
    
    init: function() {
        this.initSearchFilter();
        this.initLoaiFilter();
        this.initViewButtons();
        this.initDeleteButtons();
        this.initModalButtons();
    },
    
    initViewButtons: function() {
        document.querySelectorAll('.view-btn, .view-link').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const itemId = this.getAttribute('data-id');
                HopDongManager.viewDetail(itemId);
            });
        });
    },
    
    initDeleteButtons: function() {
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const itemId = this.getAttribute('data-id');
                HopDongManager.deleteItem(itemId);
            });
        });
    },
    
    initModalButtons: function() {
        const closeBtn = document.getElementById('close-modal-btn');
        const closeFooterBtn = document.getElementById('close-modal-footer-btn');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }
        
        if (closeFooterBtn) {
            closeFooterBtn.addEventListener('click', () => this.closeModal());
        }
        
        // Close on overlay click
        const modal = document.getElementById('detail-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal();
                }
            });
        }
    },
    
    viewDetail: function(itemId) {
        this.currentItemId = itemId;
        
        fetch(this.API_URLS.detail(itemId))
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(data => {
                this.showDetailModal(data);
            })
            .catch(error => {
                console.error('Error loading item data:', error);
                this.showNotification('Có lỗi xảy ra khi tải dữ liệu', 'error');
            });
    },
    
    showDetailModal: function(data) {
        const content = document.getElementById('detail-content');
        
        content.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-slate-500 mb-1">Tên hợp đồng</label>
                    <p class="text-base text-slate-900">${data.tenhopdong || '-'}</p>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-slate-500 mb-1">Mã hợp đồng</label>
                    <p class="text-base text-slate-900">${data.mahopdong || '-'}</p>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-slate-500 mb-1">Loại hợp đồng</label>
                    <p class="text-base text-slate-900">${data.loaihopdong || '-'}</p>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-slate-500 mb-1">File hợp đồng</label>
                    <p class="text-base text-slate-900">${data.filehopdong || '-'}</p>
                </div>
                
                <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-slate-500 mb-1">Ghi chú</label>
                    <p class="text-base text-slate-900">${data.ghichu || '-'}</p>
                </div>
            </div>
            
            ${data.filehopdong ? `
            <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex items-center">
                    <svg class="w-5 h-5 text-blue-600 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                    <span class="text-sm text-blue-900">File hợp đồng đã được đính kèm</span>
                </div>
            </div>
            ` : ''}
            
            <div class="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div class="flex items-start">
                    <svg class="w-5 h-5 text-yellow-600 mr-2 mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <div class="flex-1">
                        <p class="text-sm font-medium text-yellow-900">Lưu ý</p>
                        <p class="text-sm text-yellow-700 mt-1">Chức năng chỉnh sửa hợp đồng đang trong quá trình xây dựng.</p>
                    </div>
                </div>
            </div>
        `;
        
        const modal = document.getElementById('detail-modal');
        modal.classList.remove('hidden');
    },
    
    closeModal: function() {
        const modal = document.getElementById('detail-modal');
        modal.classList.add('hidden');
    },
    
    deleteItem: function(itemId) {
        if (!confirm('Bạn có chắc chắn muốn xóa hợp đồng này?')) return;
        
        fetch(this.API_URLS.delete(itemId), {
            method: 'POST',
            headers: {
                'X-CSRFToken': this.getCsrfToken()
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showNotification(data.message || 'Xóa thành công!', 'success');
                setTimeout(() => location.reload(), 1000);
            } else {
                this.showNotification(data.message || 'Có lỗi xảy ra. Vui lòng thử lại.', 'error');
            }
        })
        .catch(error => {
            console.error('Error deleting item:', error);
            this.showNotification('Có lỗi xảy ra. Vui lòng thử lại.', 'error');
        });
    },
    
    initSearchFilter: function() {
        const searchInput = document.getElementById('search-input');
        if (!searchInput) return;
        
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('tbody tr:not(.empty-row)');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
    },
    
    initLoaiFilter: function() {
        const loaiFilter = document.getElementById('loai-filter');
        if (!loaiFilter) return;
        
        loaiFilter.addEventListener('change', function(e) {
            const filterValue = e.target.value;
            const rows = document.querySelectorAll('tbody tr:not(.empty-row)');
            
            rows.forEach(row => {
                if (!filterValue) {
                    row.style.display = '';
                } else {
                    const loaiCell = row.cells[3]; // Cột loại hợp đồng
                    const loaiText = loaiCell ? loaiCell.textContent.trim() : '';
                    row.style.display = loaiText.includes(filterValue) ? '' : 'none';
                }
            });
        });
    },
    
    getCsrfToken: function() {
        const tokenElement = document.querySelector('[name=csrfmiddlewaretoken]');
        return tokenElement ? tokenElement.value : '';
    },
    
    showNotification: function(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full`;
        
        const colors = {
            success: 'bg-green-500 text-white',
            error: 'bg-red-500 text-white',
            info: 'bg-blue-500 text-white',
            warning: 'bg-yellow-500 text-white'
        };
        
        notification.className += ` ${colors[type] || colors.info}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 10);
        
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
};

document.addEventListener('DOMContentLoaded', function() {
    HopDongManager.init();
});