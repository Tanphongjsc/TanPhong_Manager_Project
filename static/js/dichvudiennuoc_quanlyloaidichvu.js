$(document).ready(function() {
    const csrftoken = $('[name=csrfmiddlewaretoken]').val() || getCookie('csrftoken');

    // ======================================================
    // HÀM TIỆN ÍCH
    // ======================================================

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

    function filterTable(searchInput, tableRows) {
        const searchText = $(searchInput).val().toLowerCase();
        $(tableRows).each(function() {
            const textMatch = $(this).text().toLowerCase().includes(searchText);
            $(this).toggle(textMatch);
        });
    }

    function openModal(modal) {
        $('#modal-backdrop, ' + modal).removeClass('hidden');
    }

    function closeModal() {
        $('.modal, #modal-backdrop').addClass('hidden');
    }

    // <<< HÀM MỚI: Dùng để cập nhật dropdown trong modal Dịch vụ
    /**
     * Cập nhật hoặc thêm mới một <option> trong dropdown chọn Loại dịch vụ.
     * @param {object} serviceType - Dữ liệu của loại dịch vụ (gồm id_loaidichvu, tenloaidichvu).
     * @param {boolean} isCreating - True nếu là thêm mới, false nếu là cập nhật.
     */
    function updateServiceTypeDropdown(serviceType, isCreating) {
        const dropdown = $('#id_loaidichvu');
        if (isCreating) {
            // Nếu thêm mới, tạo một <option> mới và nối vào cuối dropdown
            const newOption = `<option value="${serviceType.id_loaidichvu}">${serviceType.tenloaidichvu}</option>`;
            dropdown.append(newOption);
        } else {
            // Nếu cập nhật, tìm <option> đã có và sửa lại text của nó
            dropdown.find(`option[value="${serviceType.id_loaidichvu}"]`).text(serviceType.tenloaidichvu);
        }
    }

    async function saveData(url, data) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            alert('Lỗi kết nối server');
            console.error(error);
            return null;
        }
    }

    async function deleteData(url, row) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'X-CSRFToken': csrftoken }
            });
            const result = await response.json();
            if (result.success) {
                alert(result.message);
                row.fadeOut(400, function() {
                    $(this).remove();
                });
            } else {
                alert('Lỗi: ' + result.message);
            }
        } catch (error) {
            alert('Lỗi kết nối server');
            console.error(error);
        }
    }
    
    // ======================================================
    // XỬ LÝ SỰ KIỆN
    // ======================================================

    $('#service-search-input').on('keyup', function() { filterTable(this, '.service-row'); });
    $('#service-type-search-input').on('keyup', function() { filterTable(this, '.service-type-row'); });

    $('#add-service-btn').on('click', function() {
        $('#service-form')[0].reset();
        $('#id_dichvu').val('');
        $('#service-modal-title').text('Thêm Dịch vụ mới');
        openModal('#service-modal');
    });

    $('#add-service-type-btn').on('click', function() {
        $('#service-type-form')[0].reset();
        $('#id_loaidichvu_edit').val('');
        $('#service-type-modal-title').text('Thêm Loại dịch vụ mới');
        openModal('#service-type-modal');
    });

    $(document).on('click', '.edit-service-btn', function() {
        const data = $(this).data();
        $('#id_dichvu').val(data.id_dichvu);
        $('#tendichvu').val(data.tendichvu);
        $('#id_loaidichvu').val(data.id_loaidichvu);
        $('#chuthich_dichvu').val(data.chuthich);
        $('#service-modal-title').text('Chỉnh sửa Dịch vụ');
        openModal('#service-modal');
    });

    $(document).on('click', '.edit-service-type-btn', function() {
        const data = $(this).data();
        $('#id_loaidichvu_edit').val(data.id_loaidichvu);
        $('#tenloaidichvu').val(data.tenloaidichvu);
        $('#chuthich_loaidichvu').val(data.chuthich);
        $('#service-type-modal-title').text('Chỉnh sửa Loại dịch vụ');
        openModal('#service-type-modal');
    });

    $(document).on('click', '.delete-service-btn', function() {
        if (confirm('Bạn có chắc chắn muốn xóa dịch vụ này?')) {
            const id = $(this).data('id_dichvu');
            const row = $(this).closest('.service-row');
            deleteData(`/dichvudiennuoc/api/dichvu/delete/${id}/`, row);
        }
    });

    $(document).on('click', '.delete-service-type-btn', function() {
        if (confirm('Bạn có chắc chắn muốn xóa loại dịch vụ này?')) {
            const id = $(this).data('id_loaidichvu');
            const row = $(this).closest('.service-type-row');
            deleteData(`/dichvudiennuoc/api/loaidichvu/delete/${id}/`, row);
        }
    });

    $('#service-form').on('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const data = Object.fromEntries(formData.entries());
        const isCreating = !data.id_dichvu;

        if (isCreating) {
            delete data.id_dichvu;
        }

        const result = await saveData('/dichvudiennuoc/api/dichvu/update-or-create/', data);

        if (result && result.success) {
            alert(result.message);
            const service = result.data;
            const serviceTypeName = $('#id_loaidichvu option:selected').text();

            if (isCreating) {
                const newRow = `
                    <tr class="service-row border-b border-gray-200 hover:bg-gray-100">
                        <td class="py-3 px-6 text-left font-medium">${service.tendichvu}</td>
                        <td class="py-3 px-6 text-left">${serviceTypeName}</td>
                        <td class="py-3 px-6 text-left text-gray-500 italic">${service.chuthich}</td>
                        <td class="py-3 px-6 text-center">
                            <div class="flex item-center justify-center space-x-2">
                                <button class="edit-service-btn w-8 h-8 flex items-center justify-center text-yellow-500 hover:text-yellow-700 rounded-full hover:bg-yellow-100"
                                        data-id_dichvu="${service.id_dichvu}"
                                        data-tendichvu="${service.tendichvu}"
                                        data-id_loaidichvu="${service.id_loaidichvu}"
                                        data-chuthich="${service.chuthich}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="delete-service-btn w-8 h-8 flex items-center justify-center text-red-500 hover:text-red-700 rounded-full hover:bg-red-100"
                                        data-id_dichvu="${service.id_dichvu}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
                $('#service-table tbody').prepend(newRow);
            } else {
                const row = $(`.edit-service-btn[data-id_dichvu="${service.id_dichvu}"]`).closest('.service-row');
                if (row.length) {
                    row.find('td:eq(0)').text(service.tendichvu);
                    row.find('td:eq(1)').text(serviceTypeName);
                    row.find('td:eq(2)').text(service.chuthich);
                    
                    const editBtn = row.find('.edit-service-btn');
                    editBtn.data('tendichvu', service.tendichvu);
                    editBtn.data('id_loaidichvu', service.id_loaidichvu);
                    editBtn.data('chuthich', service.chuthich);
                }
            }
            closeModal();
        } else if (result) {
            alert('Lỗi: ' + result.message);
        }
    });

    $('#service-type-form').on('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const data = Object.fromEntries(formData.entries());
        const isCreating = !data.id_loaidichvu;

        if (isCreating) {
            delete data.id_loaidichvu;
        }

        const result = await saveData('/dichvudiennuoc/api/loaidichvu/update-or-create/', data);

        if (result && result.success) {
            alert(result.message);
            const serviceType = result.data;

            if (isCreating) {
                const newRow = `
                    <tr class="service-type-row border-b border-gray-200 hover:bg-gray-100">
                        <td class="py-3 px-6 text-left font-medium">${serviceType.tenloaidichvu}</td>
                        <td class="py-3 px-6 text-left text-gray-500 italic">${serviceType.chuthich}</td>
                        <td class="py-3 px-6 text-center">
                            <div class="flex item-center justify-center space-x-2">
                                <button class="edit-service-type-btn w-8 h-8 flex items-center justify-center text-yellow-500 hover:text-yellow-700 rounded-full hover:bg-yellow-100"
                                        data-id_loaidichvu="${serviceType.id_loaidichvu}"
                                        data-tenloaidichvu="${serviceType.tenloaidichvu}"
                                        data-chuthich="${serviceType.chuthich}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="delete-service-type-btn w-8 h-8 flex items-center justify-center text-red-500 hover:text-red-700 rounded-full hover:bg-red-100"
                                        data-id_loaidichvu="${serviceType.id_loaidichvu}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
                $('#service-type-table tbody').prepend(newRow);
            } else {
                const row = $(`.edit-service-type-btn[data-id_loaidichvu="${serviceType.id_loaidichvu}"]`).closest('.service-type-row');
                if (row.length) {
                    row.find('td:eq(0)').text(serviceType.tenloaidichvu);
                    row.find('td:eq(1)').text(serviceType.chuthich);

                    const editBtn = row.find('.edit-service-type-btn');
                    editBtn.data('tenloaidichvu', serviceType.tenloaidichvu);
                    editBtn.data('chuthich', serviceType.chuthich);
                }
            }
            
            // <<< GỌI HÀM MỚI TẠI ĐÂY
            // Sau khi cập nhật bảng, đồng bộ luôn cả dropdown
            updateServiceTypeDropdown(serviceType, isCreating);

            closeModal();
        } else if (result) {
            alert('Lỗi: ' + result.message);
        }
    });

    $('#close-service-modal-btn, #cancel-service-modal-btn, #close-service-type-modal-btn, #cancel-service-type-modal-btn, #modal-backdrop').on('click', closeModal);
});