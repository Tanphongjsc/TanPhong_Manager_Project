from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils.timezone import now
from django.db.models import F

from apps.hrm_manager.__core__.models import Phantuluong, Nhomphantuluong

from json import loads

from apps.hrm_manager.utils.view_helpers import (
    get_list_context,
    json_response,
    json_error,
    json_success,
    validate_required_fields,
    validate_unique_field,
    get_field_value,
    safe_delete,
    handle_exceptions,
    paginate_queryset,
    get_request_data,
    search_queryset, filter_by_field, filter_by_status
)

# Create your views here.

# ============================================================================
# VIEW URLS - TRANG CHÍNH
# ============================================================================

# ------------------------------- PHẦN TỬ LƯƠNG ------------------------------
@login_required
def view_phan_tu_luong(request):
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý lương', 'url': '#'},
            {'title': 'Phần tử lương', 'url': None},
        ],
    }

    return render(request, 'hrm_manager/quan_ly_luong/phan_tu_luong.html', context)



# ============================================================================
# API URLS
# ============================================================================

# ------------------------------- PHẦN TỬ LƯƠNG ------------------------------
# @login_required
@require_http_methods(["GET", "POST"])
def api_phan_tu_luong_list(request):
    """API lấy danh sách phần tử lương"""
    
    if request.method == 'GET':
        # Lấy danh sách phần tử lương
        phan_tu_luong_qs = (
            Phantuluong.objects.select_related('nhomphantu')
            .values('id', 'tenphantu', 'maphantu', 'loaiphantu', 'nhomphantu', 'mota', 'trangthai')
            .annotate(nhomphantu_ten=F('nhomphantu__tennhom'))
            .order_by('id')
        )

        phan_tu_luong_qs = search_queryset(request, phan_tu_luong_qs, ('maphantu', 'tenphantu'))
        phan_tu_luong_qs = filter_by_field(request, phan_tu_luong_qs, 'loaiphantu', 'type')
        phan_tu_luong_qs = filter_by_field(request, phan_tu_luong_qs, 'nhomphantu', 'group')
        page_obj, paginator = paginate_queryset(request, phan_tu_luong_qs, default_page_size=int(request.GET.get('page_size', 10)))

        return json_success(
            'Lấy danh sách phần tử thành công',
            data=list(page_obj),
            pagination={
                'page': page_obj.number,
                'page_size': paginator.per_page,
                'total': paginator.count,
                'total_pages': paginator.num_pages,
                'has_next': page_obj.has_next(),
                'has_prev': page_obj.has_previous()
            }
        )

    elif request.method == 'POST':
        # Xử lý tạo mới phần tử lương
        try:
            data = loads(request.body)
        except :
            return json_error('Dữ liệu không hợp lệ', status=400)

        phantu_luong_obj = Phantuluong.objects.create(
            tenphantu = data.get('tenphantu', '').strip().title(),
            maphantu = data.get('maphantu', '').strip(),
            loaiphantu = data.get('loaiphantu').strip(),
            nhomphantu_id = data.get('nhomphantu'),
            mota = data.get('mota', '').strip(),
            trangthai = "active",
            created_at = now().date(),
        )

        return json_success(
            'Lưu phần tử lương thành công',
            data={
                'id': phantu_luong_obj.id,
                'tenphantu': phantu_luong_obj.tenphantu,
                'maphantu': phantu_luong_obj.maphantu,
                'loaiphantu': phantu_luong_obj.loaiphantu,
                'nhomphantu': phantu_luong_obj.nhomphantu_id,
                'mota': phantu_luong_obj.mota,
                'trangthai': phantu_luong_obj.trangthai,
            }
        )


@login_required
@require_http_methods(["GET", "PUT", "DELETE"])
def api_phan_tu_luong_detail(request, pk):
    """API lấy chi tiết phần tử lương"""

    try:
        phan_tu_luong = Phantuluong.objects.get(id=pk)
    except Phantuluong.DoesNotExist:
        return json_error('Không tìm thấy phần tử lương',status=404)

    if request.method == 'GET':
        # Lấy chi tiết phần tử lương
        return json_response(
            message='Lấy chi tiết phần tử lương thành công',
            data = {
                'id': phan_tu_luong.id,
                'tenphantu': phan_tu_luong.tenphantu,
                'maphantu': phan_tu_luong.maphantu,
                'loaiphantu': phan_tu_luong.loaiphantu,
                'nhomphantu': phan_tu_luong.nhomphantu_id,
                'mota': phan_tu_luong.mota,
                'trangthai': phan_tu_luong.trangthai,
            }
        )

    elif request.method == 'PUT':
        # Cập nhật phần tử lương
        try:
            data = loads(request.body)

            phan_tu_luong.tenphantu = data.get('tenphantu', phan_tu_luong.tenphantu).strip().title()
            phan_tu_luong.maphantu = data.get('maphantu', phan_tu_luong.maphantu).strip()
            phan_tu_luong.loaiphantu = data.get('loaiphantu', phan_tu_luong.loaiphantu).strip()
            phan_tu_luong.nhomphantu_id = data.get('nhomphantu', phan_tu_luong.nhomphantu_id)
            phan_tu_luong.mota = data.get('mota', phan_tu_luong.mota).strip()
            phan_tu_luong.trangthai = data.get('trangthai', phan_tu_luong.trangthai).strip().lower()
            phan_tu_luong.updated_at = now().date()

            phan_tu_luong.save()

            return json_response(
                message='Cập nhật phần tử lương thành công',
                data={
                    'id': phan_tu_luong.id,
                    'tenphantu': phan_tu_luong.tenphantu,
                    'maphantu': phan_tu_luong.maphantu,
                    'loaiphantu': phan_tu_luong.loaiphantu,
                    'nhomphantu': phan_tu_luong.nhomphantu_id,
                    'mota': phan_tu_luong.mota,
                    'trangthai': phan_tu_luong.trangthai,
                }
            )

        except :
            return json_error('Dữ liệu không hợp lệ hoặc lỗi trong quá trình cập nhật', status=400)

    elif request.method == 'DELETE':
        # Xóa phần tử lương
        try:        
            phan_tu_luong.delete()
            return json_response(message='Xóa phần tử lương thành công')
        except :
            return json_error('Lỗi trong quá trình xóa phần tử lương', status=400)


@login_required
@require_http_methods(["POST"])
def api_phan_tu_luong_toggle_status(request, id):
    """API bật/tắt trạng thái phần tử lương"""
    try:
        phan_tu_luong = Phantuluong.objects.get(id=id)
    except:
        return json_error('Không tìm thấy phần tử lương', status=404)

    # Chuyển đổi trạng thái
    if phan_tu_luong.trangthai == 'active':
        phan_tu_luong.trangthai = 'inactive'
    else:
        phan_tu_luong.trangthai = 'active'
    
    phan_tu_luong.updated_at = now().date()
    phan_tu_luong.save()

    return json_response(
        message='Chuyển đổi trạng thái phần tử lương thành công',
        data={
            'id': phan_tu_luong.id,
            'trangthai': phan_tu_luong.trangthai,
        }
    )

# ------------------------------- NHÓM PHẦN TỬ LƯƠNG ------------------------------
# @login_required
@require_http_methods(["GET", "POST"])
def api_nhom_phan_tu_luong_list(request):
    """API lấy danh sách nhom phần tử lương"""
    
    if request.method == 'GET':
        # Lấy danh sách nhom phần tử lương

        nhom_phan_tu_luong_qs = Nhomphantuluong.objects.all().values().order_by('id')
        nhom_phan_tu_luong_qs = search_queryset(request, nhom_phan_tu_luong_qs, ('manhom', 'tennhom'))

        page_obj, paginator = paginate_queryset(request, nhom_phan_tu_luong_qs, default_page_size=int(request.GET.get('page_size', 10)))

        return json_success(
            'Lấy danh sách nhóm phần tử thành công',
            data=list(page_obj),
            pagination={
                'page': page_obj.number,
                'page_size': paginator.per_page,
                'total': paginator.count,
                'total_pages': paginator.num_pages,
                'has_next': page_obj.has_next(),
                'has_prev': page_obj.has_previous()
            }
        )

    elif request.method == 'POST':
        # Xử lý tạo mới Nhóm phần tử lương
        try:
            data = loads(request.body)
        except :
            return json_error('Dữ liệu không hợp lệ', status=400)

        nhom_phan_tu_luong_obj = Nhomphantuluong.objects.create(
            manhom = data.get('manhom', '').strip(),
            tennhom = data.get('tennhom', '').strip().title(),
            created_at = now().date(),
        )

        return json_success(
            'Lưu nhóm phần tử lương thành công',
            data={
                'tennhom': nhom_phan_tu_luong_obj.tennhom,
                'manhom': nhom_phan_tu_luong_obj.manhom,
            }
        )


@login_required
@require_http_methods(["GET", "PUT", "DELETE"])
def api_nhom_phan_tu_luong_detail(request, pk):
    """API lấy chi tiết phần tử lương"""

    try:
        nhom_phan_tu_luong = Nhomphantuluong.objects.get(id=pk)
    except Nhomphantuluong.DoesNotExist:
        return json_error('Không tìm thấy nhóm phần tử lương',status=404)

    if request.method == 'GET':
        # Lấy chi tiết phần tử lương
        return json_response(
            message='Lấy chi tiết phần tử lương thành công',
            data = {
                'id': nhom_phan_tu_luong.id,
                'tennhom': nhom_phan_tu_luong.tennhom,
                'manhom': nhom_phan_tu_luong.manhom,
            }
        )

    elif request.method == 'PUT':
        # Cập nhật phần tử lương
        try:
            data = loads(request.body)

            nhom_phan_tu_luong.tennhom = data.get('tennhom', nhom_phan_tu_luong.tennhom).strip().title()
            nhom_phan_tu_luong.manhom = data.get('manhom', nhom_phan_tu_luong.manhom).strip()
            nhom_phan_tu_luong.updated_at = now().date()

            nhom_phan_tu_luong.save()

            return json_response(
                message='Cập nhật nhóm phần tử lương thành công',
                data={
                    'id': nhom_phan_tu_luong.id,
                    'tennhom': nhom_phan_tu_luong.tennhom,
                    'manhom': nhom_phan_tu_luong.manhom,
                }
            )

        except :
            return json_error('Dữ liệu không hợp lệ hoặc lỗi trong quá trình cập nhật', status=400)

    elif request.method == 'DELETE':
        # Xóa phần tử lương
        try:        
            nhom_phan_tu_luong.delete()
            return json_response(message='Xóa nhóm phần tử lương thành công')
        except :
            return json_error('Lỗi trong quá trình xóa nhóm phần tử lương', status=400)
        
