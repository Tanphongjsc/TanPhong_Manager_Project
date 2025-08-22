from django.shortcuts import render, get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse, HttpResponse
from datetime import datetime,timedelta
from django.db.models import Q, Max
from .models import *
import json
from num2words import num2words

# Create your views here.

def view_bao_cao_doanh_thu (request):
    return render(request, "dich_vu_dien_nuoc/bao_cao_doanh_thu.html")

def view_danh_sach_thong_bao (request):
    return render(request, "dich_vu_dien_nuoc/danh_sach_thong_bao.html")

def api_danh_sach_thong_bao(request):
    """API để lấy danh sách thông báo dịch vụ"""
    try:
        # Lấy tham số filter từ request
        month = request.GET.get('month', '')
        year = request.GET.get('year', '')
        company = request.GET.get('company', '')
        page = int(request.GET.get('page', 1))
        per_page = int(request.GET.get('per_page', 10))
        
        # Query cơ bản - join với bảng HopDong để lấy tên công ty và chú thích
        queryset = ThanhtoanDichvu.objects.select_related('id_hopdong').all()
        
        # Áp dụng filters
        if month:
            queryset = queryset.filter(thoigiantao__month=int(month))
            
        if year:
            queryset = queryset.filter(thoigiantao__year=int(year))
            
        if company:
            # Tìm theo tên công ty trong bảng HopDong
            queryset = queryset.filter(
                id_hopdong__tencongty__icontains=company
            )
        
        # Sắp xếp theo thời gian tạo từ mới đến cũ
        queryset = queryset.order_by('-thoigiantao')
        
        # Tính tổng số bản ghi
        total_count = queryset.count()
        
        # Phân trang
        start_index = (page - 1) * per_page
        end_index = start_index + per_page
        paginated_queryset = queryset[start_index:end_index]
        
        # Chuẩn bị data trả về
        notifications = []
        for index, item in enumerate(paginated_queryset, start=start_index + 1):
            # Lấy thông tin từ hợp đồng liên kết
            hop_dong = item.id_hopdong
            
            notifications.append({
                'id': item.id,
                'stt': index,
                # Số TBDV từ bảng ThanhToan_DichVu
                'sotbdv': item.sotbdv if item.sotbdv else f'TBDV-{item.id:06d}',
                
                # Tên công ty từ bảng HopDong thông qua id_hopdong
                'tencongty': hop_dong.tencongty if hop_dong and hop_dong.tencongty else 'Chưa có tên công ty',
                
                # Chú thích từ bảng HopDong thông qua id_hopdong
                'chuthich': hop_dong.chuthich if hop_dong and hop_dong.chuthich else '',
                
                # Ngày tạo từ ThoigianTao trong bảng ThanhToan_DichVu
                'ngaytao': item.thoigiantao.strftime('%Y-%m-%d') if item.thoigiantao else '',
                'ngaytao_display': item.thoigiantao.strftime('%d/%m/%Y') if item.thoigiantao else '',
                
                # Tổng tiền trước thuế và sau thuế từ bảng ThanhToan_DichVu
                'tongtientruocthue': float(item.tongtientruocthue) if item.tongtientruocthue else 0,
                'tongtiensauthue': float(item.tongtiensauthue) if item.tongtiensauthue else 0,
                
                # Thông tin bổ sung
                'thoigiantao': item.thoigiantao.isoformat() if item.thoigiantao else None,
                'id_hopdong': hop_dong.id_hopdong if hop_dong else None,
                'sohd': hop_dong.sohd if hop_dong and hop_dong.sohd else '',
            })
        
        return JsonResponse({
            'success': True,
            'data': notifications,
            'pagination': {
                'current_page': page,
                'per_page': per_page,
                'total_count': total_count,
                'total_pages': max(1, (total_count + per_page - 1) // per_page)
            }
        })
        
    except Exception as e:
        import traceback
        print(f"API Error: {str(e)}")
        print(traceback.format_exc())
        return JsonResponse({
            'success': False,
            'error': str(e),
            'data': [],
            'pagination': {'current_page': 1, 'per_page': 10, 'total_count': 0, 'total_pages': 1}
        }, status=500)

def api_danh_sach_cong_ty(request):
    """API để lấy danh sách công ty cho dropdown filter"""
    try:
        companies = Hopdong.objects.values_list('tencongty', flat=True).distinct().order_by('tencongty')
        companies_list = [company for company in companies if company]  # Loại bỏ giá trị None
        
        return JsonResponse({
            'success': True,
            'companies': companies_list
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

def api_xoa_thong_bao(request, notification_id):
    """API để xóa thông báo"""
    if request.method == 'DELETE':
        try:
            notification = ThanhtoanDichvu.objects.get(id=notification_id)
            notification.delete()
            
            return JsonResponse({
                'success': True,
                'message': 'Xóa thông báo thành công'
            })
            
        except ThanhtoanDichvu.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Không tìm thấy thông báo'
            }, status=404)
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': str(e)
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Method not allowed'
    }, status=405)

def api_danh_sach_cong_ty_chua_tao(request):
    try:
        # SỬA: Bỏ tham số day, chỉ lọc theo month và year
        month = int(request.GET.get('month', 0))
        year = int(request.GET.get('year', 0))
        
        if not month or not year:
            return JsonResponse({
                'success': False,
                'error': 'Thiếu tham số month hoặc year'
            }, status=400)
        
        # Lấy tất cả công ty
        all_companies = list(Hopdong.objects.values_list('tencongty', flat=True).distinct().order_by('tencongty'))
        all_companies = [company for company in all_companies if company and company.strip()]
        
        # SỬA: Tìm các công ty đã tạo thông báo cho THÁNG cụ thể (bỏ filter theo day)
        created_companies = list(ThanhtoanDichvu.objects.filter(
            thoigiantao__year=year,
            thoigiantao__month=month,
            id_hopdong__tencongty__isnull=False
        ).values_list('id_hopdong__tencongty', flat=True).distinct())
        
        created_companies = [company for company in created_companies if company and company.strip()]
        
        # Lọc ra các công ty CHƯA tạo thông báo cho tháng này
        available_companies = [company for company in all_companies 
                             if company not in created_companies]
        
        return JsonResponse({
            'success': True,
            'companies': available_companies,
            'debug': {
                'period': f'{month}/{year}',
                'all_companies_count': len(all_companies),
                'created_companies': created_companies,
                'available_count': len(available_companies)
            }
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

def api_lay_dich_vu_ky_truoc(request):
    """API để lấy dịch vụ từ kỳ thanh toán trước của công ty"""
    try:
        company = request.GET.get('company', '')
        year = int(request.GET.get('year', 0))
        month = int(request.GET.get('month', 0))
        
        if not company or not year or not month:
            return JsonResponse({
                'success': False,
                'error': 'Thiếu tham số bắt buộc'
            }, status=400)
        
        # Tính kỳ thanh toán trước
        if month == 1:
            prev_year = year - 1
            prev_month = 12
        else:
            prev_year = year
            prev_month = month - 1
        
        # Tìm thông báo của kỳ trước
        prev_notification = ThanhtoanDichvu.objects.filter(
            id_hopdong__tencongty=company,
            thoigiantao__year=prev_year,
            thoigiantao__month=prev_month
        ).first()
        
        services = []
        previous_discount = 0

        if prev_notification:
            # THÊM: Lấy phần trăm giảm trừ từ kỳ trước
            previous_discount = float(prev_notification.giamtru) if prev_notification.giamtru else 0
            
            # Lấy chi tiết dịch vụ từ kỳ trước
            prev_services = CtThanhtoanDichvu.objects.filter(
                id_thanhtoan_dichvu=prev_notification
            ).select_related('id_dichvu')
            
            for service in prev_services:
                # Chỉ số mới của kỳ trước = chỉ số cũ của kỳ hiện tại
                old_reading = service.chisomoi if service.chisomoi is not None else None
                
                services.append({
                    'service_id': service.id_dichvu.id_dichvu if service.id_dichvu else None,
                    'name': service.tendichvu or (service.id_dichvu.tendichvu if service.id_dichvu else ''),
                    'unit': service.donvitinh or '',
                    'old_reading': old_reading,
                    'new_reading': '',  # Để trống cho user nhập
                    'factor': service.heso or 1,
                    'unit_price': service.dongia or 0,
                    'usage': service.sosudung or 0 if old_reading is None else '',  # Nếu không có chỉ số thì copy số sử dụng
                    'tax_rate': service.loaithue or 8
                })
        
        return JsonResponse({
            'success': True,
            'services': services,
            'previous_discount': previous_discount  # THÊM: Trả về phần trăm giảm trừ từ kỳ trước
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

def api_danh_sach_tat_ca_dich_vu(request):
    """API để lấy tất cả dịch vụ cho dropdown"""
    try:
        services = Dichvu.objects.all().order_by('tendichvu')
        
        services_list = []
        for service in services:
            services_list.append({
                'id': service.id_dichvu,
                'name': service.tendichvu or f'Dịch vụ {service.id_dichvu}'
            })
        
        return JsonResponse({
            'success': True,
            'services': services_list
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
def api_tao_moi_thong_bao(request):
    """API để tạo mới thông báo dịch vụ"""
    if request.method != 'POST':
        return JsonResponse({
            'success': False,
            'error': 'Method not allowed'
        }, status=405)
    
    try:
        data = json.loads(request.body)
        
        company = data.get('company', '').strip()
        period = data.get('period', {})
        sotbdv = data.get('sotbdv', '').strip()
        discount = float(data.get('discount', 0))
        services_data = data.get('services', [])
        
        # Validation
        if not company:
            return JsonResponse({
                'success': False,
                'error': 'Tên công ty không được để trống'
            }, status=400)
        
        # SỬA: Kiểm tra period format mới
        if not period or not period.get('full_date'):
            return JsonResponse({
                'success': False,
                'error': 'Kỳ thanh toán không hợp lệ'
            }, status=400)
        
        if not sotbdv:
            return JsonResponse({
                'success': False,
                'error': 'Số TBDV không được để trống'
            }, status=400)
        
        if not services_data:
            return JsonResponse({
                'success': False,
                'error': 'Phải có ít nhất một dịch vụ'
            }, status=400)
        
        # SỬA: Parse full_date thay vì year/month riêng lẻ
        try:
            thoigian_tao = datetime.strptime(period['full_date'], '%Y-%m-%d')
        except ValueError:
            return JsonResponse({
                'success': False,
                'error': 'Định dạng ngày không hợp lệ'
            }, status=400)
        
        # SỬA: Kiểm tra trùng lặp theo ngày/tháng/năm
        existing = ThanhtoanDichvu.objects.filter(
            id_hopdong__tencongty=company,
            thoigiantao__year=thoigian_tao.year,
            thoigiantao__month=thoigian_tao.month
        ).exists()
        
        if existing:
            return JsonResponse({
                'success': False,
                'error': f'Công ty {company} đã có thông báo cho ngày {thoigian_tao.strftime("%d/%m/%Y")}'
            }, status=400)
        
        # Lấy hợp đồng của công ty
        hop_dong = Hopdong.objects.filter(tencongty=company).first()
        if not hop_dong:
            return JsonResponse({
                'success': False,
                'error': f'Không tìm thấy hợp đồng cho công ty {company}'
            }, status=400)
        
        # Kiểm tra số TBDV đã tồn tại chưa
        existing_sotbdv = ThanhtoanDichvu.objects.filter(sotbdv=sotbdv).exists()
        if existing_sotbdv:
            return JsonResponse({
                'success': False,
                'error': f'Số TBDV {sotbdv} đã tồn tại'
            }, status=400)
        
        # Tính tổng tiền
        total_before_tax = 0
        total_after_tax = 0
        
        for service_data in services_data:
            usage = float(service_data.get('usage', 0))
            unit_price = float(service_data.get('unit_price', 0))
            tax_rate = float(service_data.get('tax_rate', 8))
            
            before_tax = usage * unit_price
            after_tax = before_tax * (1 + tax_rate / 100)
            
            total_before_tax += before_tax
            total_after_tax += after_tax
        
        # Áp dụng giảm trừ
        discount_amount = total_before_tax * (discount / 100) if discount > 0 else 0
        final_amount = total_after_tax - discount_amount
        
        # Tạo thông báo chính
        thong_bao = ThanhtoanDichvu.objects.create(
            thoigiantao=thoigian_tao,  # SỬA: Dùng ngày được chọn thay vì datetime.now()
            sotbdv=sotbdv,
            id_hopdong=hop_dong,
            giamtru=discount,
            tongtientruocthue=total_before_tax,
            tongtiensauthue=total_after_tax,
        )
        
        # Tạo chi tiết dịch vụ (code không thay đổi)
        for service_data in services_data:
            service_id = service_data.get('service_id')
            if not service_id:
                continue
            
            try:
                dich_vu = Dichvu.objects.get(id_dichvu=service_id)
            except Dichvu.DoesNotExist:
                continue
            
            usage = float(service_data.get('usage', 0))
            unit_price = float(service_data.get('unit_price', 0))
            tax_rate = float(service_data.get('tax_rate', 8))
            
            tien_truoc_thue = usage * unit_price
            thue = tien_truoc_thue * tax_rate / 100
            tien_sau_thue = tien_truoc_thue + thue
            
            CtThanhtoanDichvu.objects.create(
                id_dichvu=dich_vu,
                tientruocthue=tien_truoc_thue,
                thue=thue,
                tiensauthue=tien_sau_thue,
                donvitinh=service_data.get('unit', ''),
                chisocu=service_data.get('old_reading') if service_data.get('old_reading') else None,
                chisomoi=service_data.get('new_reading') if service_data.get('new_reading') else None,
                heso=int(service_data.get('factor', 1)),
                dongia=unit_price,
                sosudung=usage,
                loaithue=tax_rate,
                id_thanhtoan_dichvu=thong_bao,
                tendichvu=dich_vu.tendichvu
            )
        
        return JsonResponse({
            'success': True,
            'message': 'Tạo thông báo thành công',
            'notification_id': thong_bao.id
        })
        
    except Exception as e:
        import traceback
        print(f"API Error: {str(e)}")
        print(traceback.format_exc())
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)
    
def api_chi_tiet_thong_bao(request, notification_id):
    """API để lấy chi tiết thông báo cho chỉnh sửa"""
    try:
        thong_bao = get_object_or_404(ThanhtoanDichvu.objects.select_related('id_hopdong'), id=notification_id)
        
        # Lấy chi tiết dịch vụ
        chi_tiet_services = CtThanhtoanDichvu.objects.filter(
            id_thanhtoan_dichvu=thong_bao
        ).select_related('id_dichvu').order_by('id')
        
        services_list = []
        for ct in chi_tiet_services:
            services_list.append({
                'original_id': ct.id,  # ID gốc để update
                'service_id': ct.id_dichvu.id_dichvu if ct.id_dichvu else None,
                'name': ct.tendichvu or (ct.id_dichvu.tendichvu if ct.id_dichvu else ''),
                'unit': ct.donvitinh or '',
                'old_reading': ct.chisocu if ct.chisocu is not None else '',
                'new_reading': ct.chisomoi if ct.chisomoi is not None else '',
                'factor': ct.heso or 1,
                'unit_price': float(ct.dongia) if ct.dongia else 0,
                'usage': float(ct.sosudung) if ct.sosudung else 0,
                'tax_rate': float(ct.loaithue) if ct.loaithue else 8
            })
        
        # Format period
        period_str = f"{thong_bao.thoigiantao.year}-{thong_bao.thoigiantao.month:02d}" if thong_bao.thoigiantao else ""
        
        notification_data = {
            'id': thong_bao.id,
            'company': thong_bao.id_hopdong.tencongty if thong_bao.id_hopdong else '',
            'period': period_str,
            'sotbdv': thong_bao.sotbdv or '',
            'discount': float(thong_bao.giamtru) if thong_bao.giamtru else 0,
            'services': services_list,
            'total_before_tax': float(thong_bao.tongtientruocthue) if thong_bao.tongtientruocthue else 0,
            'total_after_tax': float(thong_bao.tongtiensauthue) if thong_bao.tongtiensauthue else 0
        }
        
        return JsonResponse({
            'success': True,
            'notification': notification_data
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
def api_cap_nhat_thong_bao(request, notification_id):
    """API để cập nhật thông báo"""
    if request.method != 'PUT':
        return JsonResponse({
            'success': False,
            'error': 'Method not allowed'
        }, status=405)
    
    try:
        data = json.loads(request.body)
        
        thong_bao = get_object_or_404(ThanhtoanDichvu, id=notification_id)
        
        discount = float(data.get('discount', 0))
        services_data = data.get('services', [])
        
        if not services_data:
            return JsonResponse({
                'success': False,
                'error': 'Phải có ít nhất một dịch vụ'
            }, status=400)
        
        # Tính tổng tiền
        total_before_tax = 0
        total_after_tax = 0
        
        for service_data in services_data:
            usage = float(service_data.get('usage', 0))
            unit_price = float(service_data.get('unit_price', 0))
            tax_rate = float(service_data.get('tax_rate', 8))
            
            before_tax = usage * unit_price
            after_tax = before_tax * (1 + tax_rate / 100)
            
            total_before_tax += before_tax
            total_after_tax += after_tax
        
        # Áp dụng giảm trừ
        discount_amount = total_before_tax * (discount / 100) if discount > 0 else 0
        final_amount = total_after_tax - discount_amount
        
        # Cập nhật thông báo chính
        thong_bao.giamtru = discount
        thong_bao.tongtientruocthue = total_before_tax
        thong_bao.tongtiensauthue = total_after_tax
        thong_bao.save()
        
        # Xóa chi tiết dịch vụ cũ
        CtThanhtoanDichvu.objects.filter(id_thanhtoan_dichvu=thong_bao).delete()
        
        # Tạo lại chi tiết dịch vụ
        for service_data in services_data:
            service_id = service_data.get('service_id')
            if not service_id:
                continue
            
            try:
                dich_vu = Dichvu.objects.get(id_dichvu=service_id)
            except Dichvu.DoesNotExist:
                continue
            
            usage = float(service_data.get('usage', 0))
            unit_price = float(service_data.get('unit_price', 0))
            tax_rate = float(service_data.get('tax_rate', 8))
            
            tien_truoc_thue = usage * unit_price
            thue = tien_truoc_thue * tax_rate / 100
            tien_sau_thue = tien_truoc_thue + thue
            
            CtThanhtoanDichvu.objects.create(
                id_dichvu=dich_vu,
                tientruocthue=tien_truoc_thue,
                thue=thue,
                tiensauthue=tien_sau_thue,
                donvitinh=service_data.get('unit', ''),
                chisocu=service_data.get('old_reading') if service_data.get('old_reading') else None,
                chisomoi=service_data.get('new_reading') if service_data.get('new_reading') else None,
                heso=int(service_data.get('factor', 1)),
                dongia=unit_price,
                sosudung=usage,
                loaithue=tax_rate,
                id_thanhtoan_dichvu=thong_bao,
                tendichvu=dich_vu.tendichvu
            )
        
        return JsonResponse({
            'success': True,
            'message': 'Cập nhật thông báo thành công'
        })
        
    except Exception as e:
        import traceback
        print(f"API Error: {str(e)}")
        print(traceback.format_exc())
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

def api_in_thong_bao(request, notification_id):
    """API để tạo HTML in cho thông báo"""
    try:
        thong_bao = get_object_or_404(ThanhtoanDichvu.objects.select_related('id_hopdong'), id=notification_id)
        
        # Lấy chi tiết dịch vụ
        chi_tiet_services = CtThanhtoanDichvu.objects.filter(
            id_thanhtoan_dichvu=thong_bao
        ).select_related('id_dichvu').order_by('id')
        
        # Tính toán thời gian
        created_date = thong_bao.thoigiantao
        day = created_date.day
        month = created_date.month
        year = created_date.year
        
        # Tính tháng thanh toán (tháng tiếp theo)
        payment_month = month + 1 if month < 12 else 1
        payment_year = year if month < 12 else year + 1
        
        # Tạo các dòng dịch vụ
        services_rows = ""
        total_before_tax_calc = 0
        total_tax_calc = 0
        total_after_tax_calc = 0
        
        for index, service in enumerate(chi_tiet_services, 1):
            old_reading = service.chisocu if service.chisocu is not None else ''
            new_reading = service.chisomoi if service.chisomoi is not None else ''
            
            before_tax = float(service.tientruocthue or 0)
            tax = float(service.thue or 0)
            after_tax = float(service.tiensauthue or 0)
            
            total_before_tax_calc += before_tax
            total_tax_calc += tax
            total_after_tax_calc += after_tax
            
            service_name = service.tendichvu
            if not service_name and service.id_dichvu:
                service_name = service.id_dichvu.tendichvu
            if not service_name:
                service_name = f'Dịch vụ {service.id}'
            
            services_rows += f'''
                    <tr>
                        <td>{index}</td>
                        <td class="left">{service_name}</td>
                        <td>{service.donvitinh or ''}</td>
                        <td class="right">{format_number_vn(old_reading) if old_reading != '' else ''}</td>
                        <td class="right">{format_number_vn(new_reading) if new_reading != '' else ''}</td>
                        <td class="right">{format_number_vn(service.heso) if service.heso else "1"}</td>
                        <td class="right">{format_number_vn(service.dongia) if service.dongia else "0"}</td>
                        <td class="right">{format_number_vn(service.sosudung) if service.sosudung else "0"}</td>
                        <td class="right">{format_number_vn(before_tax)}</td>
                        <td class="right">{format_number_vn(tax)}</td>
                        <td class="right">{format_number_vn(after_tax)}</td>
                    </tr>'''
        
        # Tính toán giảm trừ và tiền cuối cùng
        discount_amount = 0
        if thong_bao.giamtru and thong_bao.giamtru > 0:
            discount_amount = total_before_tax_calc * (thong_bao.giamtru / 100)
        
        final_amount = total_after_tax_calc - discount_amount
        
        # Chuyển đổi tiền thành chữ
        amount_in_words = num2words(int(final_amount), lang='vi').capitalize() + " đồng"
        
        # Đọc template HTML
        from django.template.loader import render_to_string
        
        context = {
            'day': day,
            'month': month,
            'year': year,
            'period_month': created_date.month,
            'period_year': created_date.year,
            'payment_month': payment_month,
            'payment_year': payment_year,
            'company_name': thong_bao.id_hopdong.tencongty if thong_bao.id_hopdong else '',
            'services_rows': services_rows,
            'total_before_tax': format_number_vn(total_before_tax_calc),
            'tax_amount': format_number_vn(total_tax_calc),
            'total_after_tax': format_number_vn(total_after_tax_calc),
            'discount_amount': format_number_vn(discount_amount) if discount_amount > 0 else "0",
            'final_amount': format_number_vn(final_amount),
            'amount_in_words': amount_in_words
        }
        
        html_content = render_to_string('dich_vu_dien_nuoc/notification_print_template.html', context)
        
        return HttpResponse(html_content, content_type='text/html; charset=utf-8')
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

def api_in_nhieu_thong_bao(request):
    """API để tạo nhiều file in"""
    try:
        ids_str = request.GET.get('ids', '')
        if not ids_str:
            return JsonResponse({
                'success': False,
                'error': 'Không có ID thông báo'
            }, status=400)
        
        ids = [int(id.strip()) for id in ids_str.split(',') if id.strip().isdigit()]
        if not ids:
            return JsonResponse({
                'success': False,
                'error': 'ID không hợp lệ'
            }, status=400)
        
        # Tạo URL cho từng thông báo
        print_urls = []
        for notification_id in ids:
            url = f'/dichvudiennuoc/api/in-thong-bao/{notification_id}/'
            print_urls.append(url)
        
        return JsonResponse({
            'success': True,
            'print_urls': print_urls,
            'count': len(print_urls)
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

def format_number_vn(number):
    """Format số theo chuẩn: phẩy cho hàng nghìn, chấm cho thập phân"""
    if number is None or number == 0:
        return "0"
    
    # Làm tròn đến 1 chữ số thập phân
    number = round(float(number), 1)
    
    # Tách phần nguyên và phần thập phân
    integer_part = int(number)
    decimal_part = number - integer_part
    
    # Format phần nguyên với dấu phẩy cho hàng nghìn (giữ nguyên dấu phẩy mặc định)
    formatted_integer = f"{integer_part:,}"
    
    # Nếu có phần thập phân và != 0
    if decimal_part > 0:
        decimal_str = f"{decimal_part:.1f}"[2:]  # Lấy phần sau dấu chấm
        return f"{formatted_integer}.{decimal_str}"  # Dùng chấm cho thập phân
    else:
        return formatted_integer
    
def view_quan_ly_loai_dich_vu (request):
    return render(request, "dich_vu_dien_nuoc/quan_ly_loai_dich_vu.html")

def view_quan_ly_khach_thue (request):
    return render(request, "dich_vu_dien_nuoc/quan_ly_khach_thue.html")



