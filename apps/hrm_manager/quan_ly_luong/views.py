from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils.timezone import now
from django.db.models import F
from django.db import transaction

from apps.hrm_manager.__core__.models import Phantuluong, Nhomphantuluong, Thietlapsolieucodinh

from json import loads
from collections import defaultdict

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
        'tabs': [
            {'label': 'Danh sách phần tử lương', 'url': '#tab-elements', 'url_name': 'tab_elements'},
            {'label': 'Quản lý thông tin lương', 'url': '#tab-info', 'url_name': 'tab_info'},
        ]
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

    group_params = request.GET.get('is_group', False)
    print(group_params)
    
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

        # Nhóm phần tử nếu có tham số group_params
        data = defaultdict(list)
        if group_params:
            for item in list(page_obj):
                if item['nhomphantu'] not in data:
                    data[item['nhomphantu']] = {
                        'nhomphantu': item['nhomphantu'],
                        'nhomphantu_ten': item['nhomphantu_ten'],
                        'elements': []
                    }
                data[item['nhomphantu']]['elements'].append(item)
        else:
            data = list(page_obj)

        return json_success(
            'Lấy danh sách phần tử thành công',
            data=data,
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
        
# ------------------------------- SETUP GIÁ TRỊ MẶC ĐỊNH PHẦN TỬ LƯƠNG ------------------------------

# @login_required
@require_http_methods(["GET", "POST"])
@transaction.atomic
def api_phan_tu_luong_setup_params(request):
    """API thiết lập các giá trị mặc định cho phần tử lương"""

    if request.method == 'GET':
        # Lấy danh sách nhóm phần tử lương
        phantu_luong_setup_qs = Thietlapsolieucodinh.objects.select_related('phantuluong', 'nhanvien').filter(trangthai='active').values()
        phantu_luong_id = phantu_luong_setup_qs.values_list('phantuluong_id', flat=True).distinct().order_by('phantuluong__nhomphantu__id', 'phantuluong__id')
    
        # Chuẩn hóa dữ liệu trả về
        data_nhanvien_phantuluong = defaultdict(dict)
        for item in phantu_luong_setup_qs:
            if item.get("nhanvien_id") not in data_nhanvien_phantuluong:
                data_nhanvien_phantuluong[item.get("nhanvien_id")] = {}
            data_nhanvien_phantuluong[item.get("nhanvien_id")][item.get("phantuluong_id")] = item.get("giatrimacdinh")

        return json_success(
            'Lấy danh sách nhóm phần tử lương thành công',
            data={
                'phan_tu_luong': list(phantu_luong_id),
                'set_up_phan_tu_luong': data_nhanvien_phantuluong,
            }
        )

    elif request.method == 'POST':
        # Xử lý dữ liệu đầu vào an toàn
        try:
            raw_data = loads(request.body)
            employees_data = raw_data.get('employees', {})
            
            if not employees_data:
                return json_error('Dữ liệu không hợp lệ: Rỗng', status=400)
            employees_id = list(employees_data.keys())

        except:
            return json_error('Dữ liệu không hợp lệ: Sai định dạng JSON', status=400)

        # Chuẩn bị dữ liệu: {(nhanvien_id, phantuluong_id): value}
        input_mapping = {}
        try:
            for emp_id, salary_elements in employees_data.items():
                for salary_id, value in salary_elements.items():
                    input_mapping[(int(emp_id), int(salary_id))] = value
        except (ValueError, TypeError):
            return json_error('Dữ liệu ID hoặc giá trị không hợp lệ', status=400)

        # Các list chứa object để bulk operations
        to_create = []
        to_update = []
        
        # Lấy dữ liệu cũ đang active
        current_qs = Thietlapsolieucodinh.objects.select_related('nhanvien', 'phantuluong').filter(trangthai='active', nhanvien_id__in=employees_id)
        today = now().date()

        # Duyệt qua các bản ghi đang có trong DB
        for item in current_qs:
            key = (item.nhanvien_id, item.phantuluong_id)
            
            # CASE A: Bản ghi này CÓ trong dữ liệu gửi lên
            if key in input_mapping:
                print("IN: ", key, item.giatrimacdinh, input_mapping[key])
                new_value = input_mapping[key]
                
                # Nếu giá trị thay đổi -> Inactive cũ, Tạo mới
                if int(item.giatrimacdinh) != int(new_value):
                    print("YES")
                    # Đánh dấu bản ghi cũ là inactive
                    item.trangthai = 'inactive'
                    item.updated_at = today
                    to_update.append(item)
                    
                    # Tạo bản ghi mới
                    to_create.append(Thietlapsolieucodinh(
                        nhanvien_id=item.nhanvien_id,
                        phantuluong_id=item.phantuluong_id,
                        giatrimacdinh=new_value,
                        trangthai='active',
                        created_at=today
                    ))
                
                # Dữ liệu này đã xử lý xong, xóa khỏi mapping để không lặp lại ở bước tạo mới
                del input_mapping[key]
            
            # CASE B: Bản ghi này KHÔNG CÓ trong dữ liệu gửi lên
            else:
                print("OUT: ", key, item.giatrimacdinh)
                item.trangthai = 'inactive'
                item.updated_at = today
                to_update.append(item)

        # Xử lý các dữ liệu còn lại trong input_mapping (Là các bản ghi hoàn toàn mới)
        for (emp_id, salary_id), value in input_mapping.items():
            to_create.append(Thietlapsolieucodinh(
                nhanvien_id=emp_id,
                phantuluong_id=salary_id,
                giatrimacdinh=value,
                trangthai='active',
                created_at=today
            ))

        # Thực thi lưu vào Database
        if to_update:
            Thietlapsolieucodinh.objects.bulk_update(to_update, ['trangthai', 'updated_at'])
        
        if to_create:
            Thietlapsolieucodinh.objects.bulk_create(to_create)

        return json_success('Lưu thiết lập số liệu cố định phần tử lương thành công')
