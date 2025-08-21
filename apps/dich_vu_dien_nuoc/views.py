from django.shortcuts import render, get_object_or_404
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.csrf import csrf_exempt

from django.forms.models import model_to_dict
from django.http import JsonResponse, HttpResponse
from django.utils import timezone

from django.db import transaction
from django.db.models import Sum, Q, F, Case, When, FloatField, Min
from django.db.models.functions import Coalesce
from .models import *

from json import loads, dumps
from io import BytesIO

import openpyxl
from openpyxl.utils import get_column_letter


# Create your views here.
def view_danh_sach_thong_bao (request):
    return render(request, "dich_vu_dien_nuoc/danh_sach_thong_bao.html")

# ------------------------------------ VIEW BÁO CÁO DOANH THU ------------------------------------

def get_filtered_revenue_data(start_date=None, end_date=None, customer_id=None, service_id=None):
    """Hàm logic trung tâm để lấy tất cả dữ liệu báo cáo từ database"""

    # 1. Xây dựng bộ lọc cơ sở
    filters = Q()
    if start_date and end_date:
        filters = Q(id_thanhtoan_dichvu__thoigiantao__date__range=[start_date, end_date])
    if customer_id and customer_id != 'all':
        filters &= Q(id_thanhtoan_dichvu__id_hopdong_id=customer_id)
    if service_id and service_id != 'all':
        filters &= Q(id_dichvu_id=service_id)

    # Lấy queryset cơ sở đã lọc
    ct_thanhtoan_qs = CtThanhtoanDichvu.objects.filter(filters).select_related(
        'id_thanhtoan_dichvu__id_hopdong', 'id_dichvu'
    )
    
    # 2. Lấy dữ liệu cho Thẻ tóm tắt (Summary Cards)
    # Lấy ID các thông báo thanh toán duy nhất từ kết quả đã lọc
    thanhtoan_ids = ct_thanhtoan_qs.values_list('id_thanhtoan_dichvu_id', flat=True).distinct()
    thanhtoan_qs = ThanhtoanDichvu.objects.filter(id__in=thanhtoan_ids)
    
    summary_agg_thanhtoan_qs = thanhtoan_qs.aggregate(
        total_revenue=Coalesce(Sum('tongtiensauthue') - Sum(F('giamtru')/100 * F('tongtientruocthue')), 0.0)
    )

    summary_agg_ct_thanhtoan_qs = ct_thanhtoan_qs.aggregate(
        total_revenue_dien=Coalesce(Sum('tiensauthue', filter=Q(id_dichvu__id_loaidichvu_id=19)), 0.0),
        total_revenue_nuoc=Coalesce(Sum('tiensauthue', filter=Q(id_dichvu__id_loaidichvu_id=20)), 0.0),
    )
    

    summary = {
        "total_revenue": summary_agg_thanhtoan_qs['total_revenue'],
        "total_revenue_dien": summary_agg_ct_thanhtoan_qs['total_revenue_dien'],
        "total_revenue_nuoc": summary_agg_ct_thanhtoan_qs['total_revenue_nuoc']
    }

    # 3. Lấy dữ liệu Bảng thông báo
    thong_bao = list(thanhtoan_qs.order_by('-thoigiantao').values(
        'sotbdv', 'tongtiensauthue', 'thoigiantao',
        tencongty=F('id_hopdong__tencongty'),
        giam_tru = F('giamtru')/100 * F('tongtientruocthue'),
        tongtienthanhtoan = F('tongtiensauthue') - F('giamtru')/100 * F('tongtientruocthue')
    ))

    # 4. Lấy dữ liệu Bảng chi tiết dịch vụ
    chi_tiet_dich_vu_raw = list(ct_thanhtoan_qs
        .values('id_thanhtoan_dichvu__id_hopdong__tencongty', 'id_dichvu__tendichvu', 'id_dichvu_id')
        .annotate(
             donvitinh=Min('donvitinh'),
            tongtiensauthue=Sum('tiensauthue'),
            tongsosudung=Sum('sosudung')
        ).order_by('id_thanhtoan_dichvu__id_hopdong__tencongty')
    )
    
    # Gom nhóm lại cho frontend
    chi_tiet_dich_vu = {}
    for item in chi_tiet_dich_vu_raw:
        ten_cong_ty = item['id_thanhtoan_dichvu__id_hopdong__tencongty']
        if ten_cong_ty not in chi_tiet_dich_vu:
            chi_tiet_dich_vu[ten_cong_ty] = {
                'tencongty': ten_cong_ty,
                'dich_vu': {}
            }
        chi_tiet_dich_vu[ten_cong_ty]['dich_vu'][item['id_dichvu_id']] = item
    
    # 5. Lấy dữ liệu Bảng tổng hợp Điện - Nước (ID loại dịch vụ 19: Điện, 20: Nước)
    dien_nuoc_qs = ct_thanhtoan_qs.filter(id_dichvu__id_loaidichvu_id__in=[19, 20])
    tong_hop_dien_nuoc = list(dien_nuoc_qs
        .values(tencongty=F('id_thanhtoan_dichvu__id_hopdong__tencongty'))
        .annotate(
            tong_tien_dien=Sum(Case(When(id_dichvu__id_loaidichvu_id=19, then=F('tiensauthue')), default=0.0, output_field=FloatField())),
            so_dien=Sum(Case(When(id_dichvu__id_loaidichvu_id=19, then=F('sosudung')), default=0.0, output_field=FloatField())),
            tong_tien_nuoc=Sum(Case(When(id_dichvu__id_loaidichvu_id=20, then=F('tiensauthue')), default=0.0, output_field=FloatField())),
            so_nuoc=Sum(Case(When(id_dichvu__id_loaidichvu_id=20, then=F('sosudung')), default=0.0, output_field=FloatField())),
        ).order_by('tencongty')
    )

    return {
        "summary": summary,
        "data": {
            "thong_bao": thong_bao,
            "chi_tiet_dich_vu": list(chi_tiet_dich_vu.values()),
            "tong_hop_dien_nuoc": tong_hop_dien_nuoc,
        }
    }

def view_bao_cao_doanh_thu(request):
    """Hiển thị báo cáo doanh thu lần đầu."""
    
    # Lấy dữ liệu ban đầu
    initial_data = get_filtered_revenue_data()

    # Chuẩn bị dữ liệu danh sách dịch vụ và tính tổng
    danh_sach_dich_vu = {}
    for congty in initial_data['data']['chi_tiet_dich_vu']:
        for value_dv in congty.get("dich_vu", {}).values():

            # Nếu dịch vụ chưa có trong danh sách, khởi tạo nó
            if value_dv['id_dichvu_id'] not in danh_sach_dich_vu:
                danh_sach_dich_vu[value_dv['id_dichvu_id']] = {
                    "id_dichvu": value_dv['id_dichvu_id'],
                    "tendichvu": value_dv['id_dichvu__tendichvu'],
                    "total_amount": 0, 
                    "total_usage": 0,
                    "unit": value_dv['donvitinh']
                }
            
            # Cập nhật tổng tiền và tổng số lượng sử dụng
            danh_sach_dich_vu[value_dv['id_dichvu_id']]['total_amount'] += value_dv['tongtiensauthue']
            danh_sach_dich_vu[value_dv['id_dichvu_id']]['total_usage'] += value_dv['tongsosudung']

    context = {
        "danh_sach_khach_thue": Hopdong.objects.all().order_by("tencongty"),
        "danh_sach_dich_vu": sorted(danh_sach_dich_vu.values(), key=lambda x: x['tendichvu']),
        
        "tong_doanh_thu": initial_data['summary']['total_revenue'],
        "tong_doanh_thu_dien": initial_data['summary'].get('total_revenue_dien', None),
        "tong_doanh_thu_nuoc": initial_data['summary'].get('total_revenue_nuoc', None),
        
        "thong_bao_data": initial_data['data']['thong_bao'],
        "tong_hop_chi_tiet_dich_vu": initial_data['data']['chi_tiet_dich_vu'],
        "tong_hop_chi_tiet_dich_vu_dien_nuoc": initial_data['data']['tong_hop_dien_nuoc'],

        # TÍNH TOÁN CÁC GIÁ TRỊ TỔNG CỘNG
        'total_tiengomthue': sum(item.get('tongtiensauthue', 0) for item in initial_data['data']['thong_bao']),
        'total_giamtru': sum(item.get('giam_tru', 0) for item in initial_data['data']['thong_bao']),
        'total_tongtientt': sum(item.get('tongtienthanhtoan', 0) for item in initial_data['data']['thong_bao']),
        'total_tongtiendien': sum(float(c.get('tong_tien_dien', 0)) for c in initial_data['data']['tong_hop_dien_nuoc']),
        'total_sodiensudung': sum(float(c.get('so_dien', 0)) for c in initial_data['data']['tong_hop_dien_nuoc']),
        'total_tongtiennuoc': sum(float(c.get('tong_tien_nuoc', 0)) for c in initial_data['data']['tong_hop_dien_nuoc']),
        'total_sonuocsudung': sum(float(c.get('so_nuoc', 0)) for c in initial_data['data']['tong_hop_dien_nuoc']),
    }

    return render(request, "dich_vu_dien_nuoc/bao_cao_doanh_thu.html", context)


def api_bao_cao_doanh_thu_filter(request):
    """API để lọc báo cáo doanh thu."""
    start_date = request.GET.get('start_date')
    end_date = request.GET.get('end_date')
    customer_id = request.GET.get('customer')
    service_id = request.GET.get('service')
    
    data = get_filtered_revenue_data(start_date, end_date, customer_id, service_id)
    data['success'] = True # Thêm trường success cho JS
    
    return JsonResponse(data)


def api_bao_cao_doanh_thu_export(request):
    """
    API để xuất báo cáo doanh thu ra file Excel với 3 sheet.
    """
    # 1. Lấy dữ liệu đã được tối ưu
    start_date = request.GET.get('start_date')
    end_date = request.GET.get('end_date')
    customer_id = request.GET.get('customer')
    service_id = request.GET.get('service')
    
    # Tái sử dụng hàm logic chung để lấy toàn bộ dữ liệu cần thiết
    report_data = get_filtered_revenue_data(start_date, end_date, customer_id, service_id)
    data = report_data['data']

    # 2. Tạo Workbook và các Sheet trong bộ nhớ
    workbook = openpyxl.Workbook()
    
    # --- Sheet 1: Danh sách Thông báo ---
    sheet1 = workbook.active
    sheet1.title = "Danh sách Thông báo"
    headers1 = ["Mã TB", "Khách thuê", "Tiền trước thuế", "Tổng tiền sau thuế", "Ngày tạo"]
    sheet1.append(headers1)
    
    for item in data['thong_bao']:
        row = [
            item['sotbdv'],
            item['tencongty'],
            item['tongtientruocthue'],
            item['tongtiensauthue'],
            item['thoigiantao'].strftime('%d/%m/%Y %H:%M') if item.get('thoigiantao') else ''
        ]
        sheet1.append(row)
        
    # --- Sheet 2: Chi tiết Dịch vụ ---
    sheet2 = workbook.create_sheet(title="Chi tiết Dịch vụ")
    
    # Lấy danh sách dịch vụ để làm header động
    all_services = {
        s['id_dichvu_id']: s['id_dichvu__tendichvu'] 
        for company in data['chi_tiet_dich_vu'] 
        for s in company['dich_vu'].values()
    }
    sorted_service_ids = sorted(all_services.keys())
    
    headers2 = ["Công ty"] + [all_services[sid] for sid in sorted_service_ids]
    sheet2.append(headers2)
    
    for company in data['chi_tiet_dich_vu']:
        row = [company['tencongty']]
        for service_id in sorted_service_ids:
            service_data = company['dich_vu'].get(service_id)
            # Ghi cả thành tiền và số lượng sử dụng
            cell_value = service_data['tongtiensauthue'] if service_data else ""
            row.append(cell_value)
        sheet2.append(row)

    # --- Sheet 3: Tổng hợp Điện - Nước ---
    sheet3 = workbook.create_sheet(title="Tổng hợp Điện - Nước")
    headers3 = ["Công ty", "Tổng tiền điện", "Số điện sử dụng (kWh)", "Tổng tiền nước", "Số nước sử dụng (m³)"]
    sheet3.append(headers3)
    
    for item in data['tong_hop_dien_nuoc']:
        row = [
            item['tencongty'],
            item['tong_tien_dien'],
            item['so_dien'],
            item['tong_tien_nuoc'],
            item['so_nuoc'],
        ]
        sheet3.append(row)

    # 3. Tối ưu độ rộng cột cho tất cả sheet
    for sheet in workbook.worksheets:
        for col in sheet.columns:
            max_length = 0
            column = get_column_letter(col[0].column)
            for cell in col:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = (max_length + 2)
            sheet.column_dimensions[column].width = adjusted_width

    # 4. Lưu file vào buffer và trả về response
    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    
    response = HttpResponse(
        buffer,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    filename = f"BaoCaoDoanhThu_{timezone.now().strftime('%Y%m%d')}.xlsx"
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    
    return response


# ------------------------------------ VIEW QUẢN LÝ DỊCH VỤ ------------------------------------

def view_quan_ly_loai_dich_vu (request):
    """Hiển thị danh sách loại dịch vụ"""

    loai_dich_vu_list = Loaidichvu.objects.all().order_by("id_loaidichvu")

    dich_vu_list = Dichvu.objects.all().order_by("id_dichvu").select_related("id_loaidichvu")

    context = {
        "danh_sach_dich_vu": dich_vu_list,
        "danh_sach_loai_dich_vu": loai_dich_vu_list
    }

    return render(request, "dich_vu_dien_nuoc/quan_ly_loai_dich_vu.html", context)

@require_POST
@transaction.atomic
def api_dich_vu_update_or_create(request):
    """Cập nhật hoặc tạo mới dịch vụ"""    
    try:
        data = loads(request.body)
        pk = data.get('id_dichvu', None)

        # Biến lưu lại dữ liệu được cập nhật hoặc tạo mới để response lại cho giao diện
        dich_vu_instance = None
    
        if pk:
            # Cập nhật dịch vụ
            dich_vu_instance = get_object_or_404(Dichvu, id_dichvu=pk)
            
            dich_vu_instance.id_loaidichvu_id = data.get("id_loaidichvu", None)
            dich_vu_instance.tendichvu = data.get("tendichvu", None)
            dich_vu_instance.chuthich = data.get("chuthich", None)
            dich_vu_instance.ngayghi = timezone.now()
            
            # Lưu lại các thay đổi
            dich_vu_instance.save()
        
        else:
            # Tạo mới dịch vụ
            data.pop("id_dichvu", None)

            dich_vu_instance = Dichvu.objects.create(
                id_loaidichvu_id=data.get("id_loaidichvu", None),
                tendichvu=data.get("tendichvu", None),
                chuthich=data.get("chuthich", None),
                ngayghi=timezone.now()
            )
        
        return JsonResponse({'success': True, 'message': 'Lưu loại dịch vụ thành công!', 'data': model_to_dict(dich_vu_instance)})
    
    except Exception as e:
        return JsonResponse({'success': False, 'message': f"Dữ liệu thêm mới chưa đúng - {str(e)}"}, status=400)
    

@require_POST
@transaction.atomic
def api_loai_dich_vu_update_or_create(request):
    """Cập nhật hoặc tạo mới Loại dịch vụ"""    
    try:
        data = loads(request.body)
        pk = data.get('id_loaidichvu', None)

        # Biến lưu lại dữ liệu được cập nhật hoặc tạo mới để response lại cho giao diện
        loai_dich_vu_instance = None

        if pk:
            # Cập nhật dịch vụ
            loai_dich_vu_instance = get_object_or_404(Loaidichvu, id_loaidichvu=pk)
            
            data.pop("id_dichvu", None) # Xóa id_dichvu khỏi data để tránh lỗi khi cập nhật
            for key, value in data.items():
                setattr(loai_dich_vu_instance, key, value)
            
            # Lưu lại các thay đổi
            loai_dich_vu_instance.save()
        
        else:
            # Tạo mới dịch vụ
            data.pop("id_loaidichvu", None)

            loai_dich_vu_instance = Loaidichvu.objects.create(
                tenloaidichvu=data.get("tenloaidichvu", None),
                chuthich=data.get("chuthich", None),
            )
        
        return JsonResponse({'success': True, 'message': 'Lưu loại dịch vụ thành công!', 'data': model_to_dict(loai_dich_vu_instance)})
    
    except Exception as e:
        return JsonResponse({'success': False, 'message': f"Dữ liệu thêm mới chưa đúng - {str(e)}"}, status=400)



def api_dich_vu_delete(request, pk):
    """Xóa dịch vụ"""        
    try: 
        dichvu = get_object_or_404(Dichvu, id_dichvu = pk)
        dichvu.delete()
        return JsonResponse({'success': True, 'message': 'Xóa dịch vụ thành công!'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=400)


def api_loai_dich_vu_delete(request, pk):
    """Xóa loại dịch vụ"""
    try: 
        loaidichvu = get_object_or_404(Loaidichvu, id_loaidichvu = pk)
        loaidichvu.delete()
        return JsonResponse({'success': True, 'message': 'Xóa dịch vụ thành công!'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=400)


# ------------------------------------ VIEW QUẢN LÝ KHÁCH THUÊ ------------------------------------

def view_quan_ly_khach_thue (request):
    """Hiển thị danh sách hợp đồng thuê và các dịch vụ liên quan"""
    hopdong_list = Hopdong.objects.prefetch_related("hopdongdichvu_set__id_dichvu").order_by("-ngaytaohopdong")

    response_data = []
    for hopdong in hopdong_list:
        dichvu_list = [
            {
                "id_hopdongdichvu": dv.id_hopdongdichvu,
                "id_dichvu": dv.id_dichvu_id,
                "tendichvu": dv.id_dichvu.tendichvu,
                "donvitinh": dv.donvitinh,
                "dongia": dv.dongia,
                "chuthich": dv.chuthich
            }
            for dv in hopdong.hopdongdichvu_set.all()
        ]

        response_data.append({
            "id_hopdong": hopdong.id_hopdong,
            "tencongty": hopdong.tencongty,
            "kythanhtoan": hopdong.kythanhtoan,
            "sohd": hopdong.sohd,
            "chuthich": hopdong.chuthich,
            "ngaytaohopdong": hopdong.ngaytaohopdong,
            "tiencoc": hopdong.tiencoc,
            "ngayketthuc": hopdong.ngayketthuc if hopdong.ngayketthuc else "",
            "ngaybatdautinhtien": hopdong.ngaybatdautinhtien if hopdong.ngaybatdautinhtien else "",
            "trangthai": hopdong.trangthai,
            "dichvu_list": dumps(dichvu_list)
        })
    
    context = {
        "danh_sach_hop_dong": response_data
    }

    return render(request, "dich_vu_dien_nuoc/quan_ly_khach_thue.html", context)

@transaction.atomic
@require_POST
def api_quan_ly_khach_thue_update_or_create(request):
    try:
        data = loads(request.body)
        dichvu_list = data.pop('dichvu_list', [])
        hopdong_id = data.get('id_hopdong')

        # Chuyển đổi các trường ngày tháng và rỗng
        for field in ['ngaytaohopdong', 'ngayketthuc', 'ngaybatdautinhtien']:
            if data.get(field) == '':
                data[field] = None

        # Format dữ liệu số
        data['tiencoc'] = float(data.get('tiencoc', 0)) if data.get('tiencoc') else None
        
        # Logic cập nhật hoặc tạo mới Hợp đồng
        if hopdong_id:
            hopdong_instance = get_object_or_404(Hopdong, id_hopdong=hopdong_id)
            # Bỏ id_hopdong khỏi data trước khi cập nhật
            data.pop('id_hopdong', None)

            # Cập nhật các trường hợp có trong payload
            for key, value in data.items():
                setattr(hopdong_instance, key, value)
            hopdong_instance.save()
        else:
            data.pop('id_hopdong', None)
            hopdong_instance = Hopdong.objects.create(**data)

        # Lấy ra những dịch vụ gửi lên từ payload
        submitted_dichvu_ids = {item.get('id_hopdongdichvu') for item in dichvu_list if item.get('id_hopdongdichvu')}
        
        # Xóa những dịch vụ không có trong payload gửi lên
        HopdongDichvu.objects.filter(id_hopdong=hopdong_instance).exclude(id_hopdongdichvu__in=submitted_dichvu_ids).delete()

        # Cập nhật hoặc tạo mới dịch vụ
        for service_data in dichvu_list:
            if not service_data.get('id_dichvu'):
                continue

            hopdong_dichvu_id = service_data.get('id_hopdongdichvu')
            
            defaults = {
                'id_dichvu_id': service_data['id_dichvu'],
                'donvitinh': service_data.get('donvitinh'),
                'dongia': service_data.get('dongia', 0) if service_data.get("dongia") else None,
                'chuthich': service_data.get('chuthich')
            }

            if hopdong_dichvu_id:
                # Cập nhật
                HopdongDichvu.objects.filter(id_hopdongdichvu=hopdong_dichvu_id).update(**defaults)
            else:
                # Tạo mới
                HopdongDichvu.objects.create(
                    id_hopdong=hopdong_instance,
                    **defaults
                )
        
        return JsonResponse({'success': True, 'message': 'Lưu hợp đồng thành công!'})

    except Exception as e:
        return JsonResponse({'success': False, 'message': f"Dữ liệu thêm mới chưa đúng - {str(e)}"}, status=400)

@transaction.atomic
@require_POST
def api_quan_ly_khach_thue_delete(request, pk):
    try:
        hopdong = get_object_or_404(Hopdong, id_hopdong=pk)
        hopdong.delete()
        return JsonResponse({'success': True, 'message': 'Xóa hợp đồng thành công!'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=400)

def api_get_all_services (request):
    dich_vu = Dichvu.objects.all().values("id_dichvu", "tendichvu")
    return JsonResponse(list(dich_vu), safe=False)