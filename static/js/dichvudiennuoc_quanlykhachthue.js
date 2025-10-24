$(document).ready(function() {
    // --- KHAI BÁO BIẾN & DỮ LIỆU ---
    const tenantModal = document.getElementById('tenant-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const tenantForm = document.getElementById('tenant-form');
    const modalTitle = document.getElementById('modal-title');
    const serviceItemsContainer = document.getElementById('service-items-container');
    const $tenantTableBody = $('#tenant-table tbody');

    let serviceListData = [];

    // --- CÁC HÀM TIỆN ÍCH CHO VIỆC FORMAT SỐ ---
    /**
     * Định dạng một số thành chuỗi có dấu phẩy và giữ lại phần thập phân.
     * @param {number | string} num - Số cần định dạng.
     * @returns {string} - Chuỗi đã được định dạng.
     */
    function formatNumber(num) {
        if (num === null || num === undefined || num === '') return '';
        const stringNum = String(num).replace(/,/g, '');
        if (isNaN(Number(stringNum))) return '';

        const parts = stringNum.split('.');
        const integerPart = parts[0];
        const decimalPart = parts.length > 1 ? '.' + parts[1] : '';
        const formattedIntegerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        
        return formattedIntegerPart + decimalPart;
    }

    /**
     * Loại bỏ dấu phẩy khỏi chuỗi số để lấy lại số thuần túy.
     * @param {string} formattedString - Chuỗi số có dấu phẩy.
     * @returns {string} - Chuỗi số thuần túy.
     */
    function parseNumber(formattedString) {
        if (typeof formattedString !== 'string') return '';
        return formattedString.replace(/,/g, '');
    }

    // --- 🆕 CẢI THIỆN HÀM LẤY CSRF TOKEN ---
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // 🆕 HÀM LẤY TOKEN TỪ NHIỀU NGUỒN
    function getCSRFToken() {
        // Thử lấy từ input hidden trong form
        let token = $('input[name=csrfmiddlewaretoken]').val();
        
        // Nếu không có, thử lấy từ cookie
        if (!token) {
            token = getCookie('csrftoken');
        }
        
        // Nếu vẫn không có, thử lấy từ meta tag
        if (!token) {
            token = $('meta[name="csrf-token"]').attr('content');
        }
        
        return token;
    }

    const csrftoken = getCSRFToken();
    console.log('🔑 CSRF Token loaded:', csrftoken ? 'Success ✅' : 'Failed ❌');

    // --- LOGIC API (Giữ nguyên) ---
    async function api_fetchAllServices() {
        try {
            const response = await fetch('/dichvudiennuoc/api/get-all-services/');
            serviceListData = await response.json();
            console.log('✅ Services loaded:', serviceListData.length);
        } catch(e) { 
            console.error("❌ Lỗi tải danh sách dịch vụ:", e); 
        }
    }

    async function api_saveHopDong(hopdongData) {
        const currentToken = getCSRFToken();
        
        if (!currentToken) {
            alert('⚠️ Không tìm thấy CSRF token. Vui lòng refresh trang.');
            console.error('❌ CSRF token not found!');
            return;
        }

        try {
            const response = await fetch('/dichvudiennuoc/api/quanlykhachthue/update-or-create/', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'X-CSRFToken': currentToken 
                },
                credentials: 'same-origin',  // 🆕 Bắt buộc gửi cookie
                body: JSON.stringify(hopdongData)
            });

            if (response.status === 403) {
                alert('⚠️ CSRF verification failed. Vui lòng refresh trang và thử lại.');
                console.error('❌ CSRF verification failed');
                return;
            }

            const result = await response.json();
            if (result.success) {
                alert(result.message);
                window.location.reload();
            } else {
                alert('Lỗi: ' + result.message);
            }
        } catch (error) {
            alert('Đã xảy ra lỗi khi kết nối tới server.');
            console.error('❌ Error saving contract:', error);
        }
    }

    async function api_deleteHopDong(id_hopdong) {
        const currentToken = getCSRFToken();
        
        if (!currentToken) {
            alert('⚠️ Không tìm thấy CSRF token. Vui lòng refresh trang.');
            return;
        }

        try {
            const response = await fetch(`/dichvudiennuoc/api/quanlykhachthue/delete/${id_hopdong}/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': currentToken },
                credentials: 'same-origin'
            });

            if (response.status === 403) {
                alert('⚠️ CSRF verification failed. Vui lòng refresh trang và thử lại.');
                return;
            }

            const result = await response.json();
            if (result.success) {
                alert(result.message);
                $(`.delete-btn[data-id_hopdong="${id_hopdong}"]`).closest('.tenant-row').remove();
            } else {
                alert('Lỗi: ' + result.message);
            }
        } catch (error) {
            alert('Đã xảy ra lỗi khi kết nối tới server.');
            console.error('❌ Error deleting contract:', error);
        }
    }

    // --- LOGIC GIAO DIỆN (Giữ nguyên) ---
    const filterTable = () => {
        const searchText = $('#search-input').val().toLowerCase();
        const statusFilter = $('#status-filter').val();
        $tenantTableBody.find('.tenant-row').each(function() {
            const $row = $(this);
            const textMatch = $row.text().toLowerCase().includes(searchText);
            const statusMatch = statusFilter === 'all' || $row.find('[data-status]').data('status').toString() === statusFilter;
            $row.toggle(textMatch && statusMatch);
        });
    };
    const openModal = () => { $(tenantModal).removeClass('hidden'); $(modalBackdrop).removeClass('hidden'); };
    const closeModal = () => { $(tenantModal).addClass('hidden'); $(modalBackdrop).addClass('hidden'); };
    const resetForm = () => {
        tenantForm.reset();
        $('#id_hopdong').val('');
        $('.service-select').each(function() { $(this).select2('destroy'); });
        serviceItemsContainer.querySelectorAll('.service-item').forEach(item => item.remove());
    };

    // --- LOGIC BẢNG DỊCH VỤ (Khôi phục datalist) ---
    function addServiceItem(serviceData = null) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'service-item grid grid-cols-12 gap-2 items-center';
        if (serviceData && serviceData.id_hopdongdichvu) {
            itemDiv.dataset.id_hopdongdichvu = serviceData.id_hopdongdichvu;
        }

        // KHÔI PHỤC: Thêm `list="units-list"` vào ô Đơn vị tính
        itemDiv.innerHTML = `
            <div class="col-span-12 md:col-span-4"><select class="service-select form-input text-sm"></select></div>
            <div class="col-span-12 md:col-span-2"><input type="text" placeholder="Đơn vị" list="units-list" class="unit-input form-input text-sm"></div>
            <div class="col-span-12 md:col-span-2"><input type="text" placeholder="Đơn giá" class="price-input form-input text-sm text-right" inputmode="decimal"></div>
            <div class="col-span-12 md:col-span-3"><input type="text" placeholder="Chú thích" class="note-input form-input text-sm"></div>
            <div class="col-span-12 md:col-span-1 text-right"><button type="button" class="remove-service-item-btn w-8 h-8 flex items-center justify-center text-red-500 rounded-full hover:bg-gray-100"><i class="fas fa-trash"></i></button></div>
        `;
        serviceItemsContainer.appendChild(itemDiv);

        const $select = $(itemDiv).find('.service-select');
        $select.append(new Option('', ''));
        serviceListData.forEach(service => $select.append(new Option(service.tendichvu, service.id_dichvu)));
        $select.select2({ placeholder: 'Chọn dịch vụ', width: '100%' });

        if (serviceData && serviceData.id_dichvu) {
            $select.val(serviceData.id_dichvu).trigger('change');
            $(itemDiv).find('.unit-input').val(serviceData.donvitinh);
            $(itemDiv).find('.price-input').val(formatNumber(serviceData.dongia));
            $(itemDiv).find('.note-input').val(serviceData.chuthich || '');
        }

        $select.on('select2:select', function(e) {
            const selectedServiceId = $(this).val();
            const service = serviceListData.find(s => s.id == selectedServiceId);
            if (service) {
                const $row = $(this).closest('.service-item');
                $row.find('.unit-input').val(service.unit || '');
                $row.find('.price-input').val(formatNumber(service.price || ''));
            }
        });
    }

    // --- GÁN SỰ KIỆN (Giữ nguyên) ---
    $('#search-input, #status-filter').on('keyup change', filterTable);
    $('#add-tenant-btn').on('click', () => { resetForm(); modalTitle.textContent = 'Thêm Hợp đồng mới'; addServiceItem(); openModal(); });
    $('body').on('click', '.edit-btn', function() {
        resetForm();
        modalTitle.textContent = 'Chỉnh sửa Hợp đồng';
        const data = this.dataset;

        $('#id_hopdong').val(data.id_hopdong);
        $('#tencongty').val(data.tencongty);
        $('#sohd').val(data.sohd);
        $('#kythanhtoan').val(data.kythanhtoan);
        $('#chuthich').val(data.chuthich);
        $('#ngaytaohopdong').val(data.ngaytaohopdong);
        $('#tiencoc').val(formatNumber(data.tiencoc)); // Định dạng số
        $('#ngayketthuc').val(data.ngayketthuc);
        $('#trangthai').val(data.trangthai);
        $('#ngaybatdautinhtien').val(data.ngaybatdautinhtien);

        const services = JSON.parse(data.services || '[]');
        if (services.length > 0) {
            services.forEach(service => addServiceItem(service));
        } else {
            addServiceItem();
        }
        openModal();
    });

    $('body').on('click', '.delete-btn', function() {
        if (confirm('Bạn có chắc chắn muốn xóa hợp đồng này?')) {
            api_deleteHopDong($(this).data('id_hopdong'));
        }
    });

    $('#tenant-form').on('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const hopdongData = Object.fromEntries(formData.entries());
        
        // Xóa csrfmiddlewaretoken khỏi data (đã gửi trong header)
        delete hopdongData.csrfmiddlewaretoken;
        
        // Khử định dạng số trước khi gửi
        hopdongData.tiencoc = parseNumber(hopdongData.tiencoc);
        
        const services = [];
        $('.service-item').each(function() {
            const $row = $(this);
            const id_dichvu = $row.find('.service-select').val();
            if (id_dichvu) {
                services.push({
                    id_hopdongdichvu: $row.data('id_hopdongdichvu') || null,
                    id_dichvu: id_dichvu,
                    donvitinh: $row.find('.unit-input').val(),
                    dongia: parseNumber($row.find('.price-input').val()),
                    chuthich: $row.find('.note-input').val()
                });
            }
        });
        hopdongData.dichvu_list = services;
        
        console.log('📤 Sending data:', hopdongData);
        api_saveHopDong(hopdongData);
    });
    
    // Tự động định dạng số khi người dùng nhập liệu
    $('body').on('input', '#tiencoc, .price-input', function(e) {
        const input = e.target;
        const originalValue = input.value;
        const cursorPosition = input.selectionStart;

        let rawValue = originalValue.replace(/[^0-9.]/g, '');
        const parts = rawValue.split('.');
        if (parts.length > 2) {
            rawValue = parts[0] + '.' + parts.slice(1).join('');
        }
        
        const formattedValue = formatNumber(rawValue);
        
        if (originalValue !== formattedValue) {
            input.value = formattedValue;
            const diff = formattedValue.length - originalValue.length;
            const newCursorPosition = cursorPosition + diff;
            input.setSelectionRange(newCursorPosition, newCursorPosition);
        }
    });

    $(serviceItemsContainer).on('click', '.remove-service-item-btn', function() { 
        $(this).closest('.service-item').remove(); 
    });

    $('#add-service-item-btn').on('click', () => addServiceItem());
    $('#close-modal-btn, #cancel-modal-btn, #modal-backdrop').on('click', closeModal);

    // --- KHỞI CHẠY ---
    api_fetchAllServices();
});