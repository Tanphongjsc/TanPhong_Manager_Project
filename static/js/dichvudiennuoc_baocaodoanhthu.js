// static/js/dichvudiennuoc_baocaodoanhthu.js

$(document).ready(function() {
    // --- UTILITY FUNCTIONS ---
    // ✅ SỬA: Dùng locale 'de-DE' (Đức) vì có format giống Việt Nam: 1.234.567,89
    function formatCurrency(num) {
        if (!num) return '0 đ';
        const rounded = parseFloat(num).toFixed(2);
        return new Intl.NumberFormat('de-DE').format(rounded) + ' đ';
    }
    
    function formatNumber(num, decimals = 2) {
        if (!num) return '0';
        return new Intl.NumberFormat('de-DE', {
            minimumFractionDigits: decimals, 
            maximumFractionDigits: decimals 
        }).format(parseFloat(num));
    }

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
    const csrftoken = getCookie('csrftoken');

    // --- API FUNCTIONS ---
    async function api_fetchRevenueData(filters = {}) {
        try {
            $('.bg-white').addClass('loading');
            const queryParams = new URLSearchParams(filters).toString();
            const response = await fetch(`/dichvudiennuoc/api/baocaodoanhthu/filter/?${queryParams}`);
            const result = await response.json();
            
            if (result.success) {
                updateSummaryCards(result.summary);
                updateTables(result.data);
            } else {
                alert('Lỗi: ' + result.message);
            }
        } catch (error) {
            console.error('API Error:', error);
            alert('Lỗi kết nối server.');
        } finally {
            $('.bg-white').removeClass('loading');
        }
    }

    async function api_exportExcel(filters = {}) {
        try {
            const queryParams = new URLSearchParams(filters).toString();
            const response = await fetch(`/dichvudiennuoc/api/baocaodoanhthu/export/?${queryParams}`);
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `BaoCaoDoanhThu_${new Date().toISOString().split('T')[0]}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                alert('Lỗi xuất Excel');
            }
        } catch (error) {
            console.error('Export Error:', error);
            alert('Lỗi xuất file');
        }
    }

    // --- UI UPDATE FUNCTIONS ---
    function updateSummaryCards(summary) {
        $('#total-revenue').text(formatCurrency(summary.total_revenue));
        $('#total-revenue_dien').text(formatCurrency(summary.total_revenue_dien));
        $('#total-revenue_nuoc').text(formatCurrency(summary.total_revenue_nuoc));
    }

    function updateTables(data) {
        updateNotificationTable(data.thong_bao);
        updateServiceDetailTable(data.chi_tiet_dich_vu);
        updateUtilitySummaryTable(data.tong_hop_dien_nuoc);
        updateAllTableFooters(data);
    }

    // ✅ CẬP NHẬT: Hàm updateNotificationTable
    function updateNotificationTable(data) {
        const tbody = $('#notification-table-body');
        if (!data || data.length === 0) {
            tbody.html('<tr><td colspan="6" class="py-4 px-6 text-center text-gray-500">Không có dữ liệu.</td></tr>');
            return;
        }

        const rowsHtml = data.map(item => {
            let paymentDate = '<span class="text-gray-400">-</span>';
            if (item.thoigiantao) {
                const date = new Date(item.thoigiantao);
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                paymentDate = `${month}/${year}`;
            }
            return `
                <tr class="border-b hover:bg-gray-100">
                    <td class="py-3 px-6 text-left font-mono">${item.sotbdv}</td>
                    <td class="py-3 px-6 text-left">${item.tencongty}</td>
                    <td class="py-3 px-6 text-right">${formatCurrency(item.tongtiensauthue)}</td>
                    <td class="py-3 px-6 text-right">${formatCurrency(item.giam_tru)}</td>
                    <td class="py-3 px-6 text-right font-bold">${formatCurrency(item.tongtienthanhtoan)}</td>
                    <td class="py-3 px-6 text-center">${paymentDate}</td>
                </tr>
            `;
        }).join('');
        tbody.html(rowsHtml);
    }


    function updateServiceDetailTable(data) {
        const table = $('#service-detail-table-body').closest('table');
        const tbody = $('#service-detail-table-body');
        const thead_th_count = table.find('thead th').length;

        if (!data || data.length === 0) {
            tbody.html(`<tr><td colspan="${thead_th_count}" class="py-4 px-6 text-center text-gray-500">Không có dữ liệu.</td></tr>`);
            return;
        }
        
        const serviceIds = table.find('thead th[data-service-id]').map(function() {
            return $(this).data('service-id');
        }).get();

        const rowsHtml = data.map(company => {
            let rowTotal = 0;
            const companyCells = serviceIds.map(serviceId => {
                const service = company.dich_vu[serviceId];
                if (service) {
                    rowTotal += parseFloat(service.tongtiensauthue) || 0;
                    return `
                        <td class="py-3 px-6 text-center">
                            ${formatCurrency(service.tongtiensauthue)}
                            <br><small class="text-gray-500">(${formatNumber(service.tongsosudung)} ${service.donvitinh})</small>
                        </td>
                    `;
                }
                return '<td class="py-3 px-6 text-center">-</td>';
            }).join('');

            return `
                <tr class="border-b hover:bg-gray-100 group">
                    <td class="py-3 px-6 text-left font-medium sticky left-0 bg-white group-hover:bg-gray-100 z-10 border-r company-name-cell">${company.tencongty}</td>
                    ${companyCells}
                    <td class="py-3 px-6 text-center font-bold company-total">${formatCurrency(rowTotal)}</td>
                </tr>
            `;
        }).join('');
        tbody.html(rowsHtml);
    }

    function updateUtilitySummaryTable(data) {
        const tbody = $('#utility-summary-table-body');
        if (!data || data.length === 0) {
            tbody.html('<tr><td colspan="5" class="py-4 px-6 text-center text-gray-500">Không có dữ liệu.</td></tr>');
            return;
        }

        const rowsHtml = data.map(company => `
            <tr class="border-b hover:bg-gray-100">
                <td class="py-3 px-6 text-left font-medium sticky left-0 bg-white group-hover:bg-gray-100 z-10 border-r company-name-cell">${company.tencongty}</td>
                <td class="py-3 px-6 text-right">${formatCurrency(company.tong_tien_dien)}</td>
                <td class="py-3 px-6 text-center">${formatNumber(company.so_dien)} kWh</td>
                <td class="py-3 px-6 text-right">${formatCurrency(company.tong_tien_nuoc)}</td>
                <td class="py-3 px-6 text-center">${formatNumber(company.so_nuoc)} m³</td>
            </tr>
        `).join('');
        tbody.html(rowsHtml);
    }
    
    function updateAllTableFooters(data) {
        // 1. Notification Table
        const notificationTotals = data.thong_bao.reduce((acc, item) => {
            acc.gomThue += parseFloat(item.tongtiensauthue) || 0;
            acc.giamTru += parseFloat(item.giam_tru) || 0;
            acc.thanhToan += parseFloat(item.tongtienthanhtoan) || 0;
            return acc;
        }, { gomThue: 0, giamTru: 0, thanhToan: 0 });
        $('#total-tiengomthue').text(formatCurrency(notificationTotals.gomThue));
        $('#total-giamtru').text(formatCurrency(notificationTotals.giamTru));
        $('#total-tongtientt').text(formatCurrency(notificationTotals.thanhToan));

        // 2. Utility Summary Table
        const utilityTotals = data.tong_hop_dien_nuoc.reduce((acc, company) => {
            acc.tienDien += parseFloat(company.tong_tien_dien) || 0;
            acc.soDien += parseFloat(company.so_dien) || 0;
            acc.tienNuoc += parseFloat(company.tong_tien_nuoc) || 0;
            acc.soNuoc += parseFloat(company.so_nuoc) || 0;
            return acc;
        }, { tienDien: 0, soDien: 0, tienNuoc: 0, soNuoc: 0 });
        $('#total-tongtiendien').text(formatCurrency(utilityTotals.tienDien));
        $('#total-sodiensudung').text(`${formatNumber(utilityTotals.soDien)} kWh`);
        $('#total-tongtiennuoc').text(formatCurrency(utilityTotals.tienNuoc));
        $('#total-sonuocsudung').text(`${formatNumber(utilityTotals.soNuoc)} m³`);
        
        // 3. Service Detail Table
        const serviceTotals = {};
        const usageTotals = {};
        const unitMap = {};
        const serviceIds = $('#service-detail-table-body').closest('table').find('thead th[data-service-id]').map(function() {
            return $(this).data('service-id');
        }).get();

        serviceIds.forEach(id => {
            serviceTotals[id] = 0;
            usageTotals[id] = 0;
        });

        data.chi_tiet_dich_vu.forEach(company => {
            for (const serviceId in company.dich_vu) {
                if (serviceTotals.hasOwnProperty(serviceId)) {
                    const service = company.dich_vu[serviceId];
                    serviceTotals[serviceId] += parseFloat(service.tongtiensauthue) || 0;
                    usageTotals[serviceId] += parseFloat(service.tongsosudung) || 0;
                    if (!unitMap[serviceId]) {
                        unitMap[serviceId] = service.donvitinh;
                    }
                }
            }
        });

        for (const serviceId in serviceTotals) {
            const totalAmount = formatCurrency(serviceTotals[serviceId]);
            const totalUsage = formatNumber(usageTotals[serviceId]);
            const unit = unitMap[serviceId] || '';
            const htmlContent = `${totalAmount}<br><small class="text-gray-500">(${totalUsage} ${unit})</small>`;
            $(`#total-service-${serviceId}`).html(htmlContent);
        }

        // Tỉnh tổng dòng foooters
        let grandTotal = 0;
        for (const serviceId in serviceTotals) {
            grandTotal += serviceTotals[serviceId];
            const totalAmount = formatCurrency(serviceTotals[serviceId]);
            const totalUsage = formatNumber(usageTotals[serviceId]);
            const unit = unitMap[serviceId] || '';
            const htmlContent = `${totalAmount}<br><small class="text-gray-500">(${totalUsage} ${unit})</small>`;
            $(`#total-service-${serviceId}`).html(htmlContent);
        }
        $('#grand-total-all').text(formatCurrency(grandTotal));
    }

    function getCurrentFilters() {
        return {
            start_date: $('#start-date').val(),
            end_date: $('#end-date').val(),
            customer: $('#customer-filter').val(),
            service: $('#service-filter').val()
        };
    }

    // --- EVENT HANDLERS ---
    $('#filter-btn').on('click', function() {
        const filters = getCurrentFilters();
        api_fetchRevenueData(filters);
    });

    $('#export-report-btn').on('click', function() {
        const filters = getCurrentFilters();
        api_exportExcel(filters);
    });

    // --- INITIALIZATION ---
    try {
        const initialThongBaoData = document.getElementById('initial-thong-bao-data');
        const initialChiTietDVData = document.getElementById('initial-chi-tiet-dich-vu-data');
        const initialDienNuocData = document.getElementById('initial-dien-nuoc-data');

        if(initialThongBaoData && initialChiTietDVData && initialDienNuocData) {
            const initialData = {
                thong_bao: JSON.parse(initialThongBaoData.textContent),
                chi_tiet_dich_vu: JSON.parse(initialChiTietDVData.textContent),
                tong_hop_dien_nuoc: JSON.parse(initialDienNuocData.textContent)
            };
            updateAllTableFooters(initialData);
        }
    } catch (e) {
        console.error("Could not parse initial data:", e);
    }
    console.log('Revenue Report initialized');
});