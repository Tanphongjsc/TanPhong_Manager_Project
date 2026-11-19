"""Danh sách phần mềm hiển thị trên trang chủ, lọc theo quyền người dùng."""
from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from django.urls import reverse
from django.urls.exceptions import NoReverseMatch

from apps.portal.permissions import GATEWAY_PERMISSIONS
from config.authz.constants import LANDING_ROUTE_PERMISSIONS

DICH_VU_PERMISSION = 'access_control.view_dich_vu_dien_nuoc'


@dataclass(frozen=True)
class PortalApp:
    key: str
    name: str
    description: str
    url: str
    icon: str
    accent: str


def hrm_landing_url(user) -> str | None:
    """URL đầu tiên của phân hệ Nhân sự – Tiền lương mà user được vào.

    Giống config.authz.get_first_allowed_url nhưng bỏ Dịch vụ nhà xưởng,
    vì Dịch vụ nhà xưởng giờ là một ô riêng trên trang chủ.
    """
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return reverse('dashboard:dashboard')
    for perm_code, route_name in LANDING_ROUTE_PERMISSIONS:
        if perm_code == DICH_VU_PERMISSION or not user.has_perm(perm_code):
            continue
        try:
            return reverse(route_name)
        except NoReverseMatch:
            continue
    return None


def get_portal_apps(user) -> list[PortalApp]:
    if not user or not user.is_authenticated:
        return []

    is_super = user.is_superuser
    apps: list[PortalApp] = []

    hrm_url = hrm_landing_url(user)
    if hrm_url:
        apps.append(PortalApp(
            key='hrm',
            name='Nhân sự – Tiền lương',
            description='Tổ chức nhân sự, chấm công, lịch làm việc, bảng lương',
            url=hrm_url,
            icon='fa-users-gear',
            accent='blue',
        ))

    if is_super or user.has_perm(DICH_VU_PERMISSION):
        apps.append(PortalApp(
            key='dich_vu',
            name='Dịch vụ nhà xưởng',
            description='Thông báo điện nước, khách thuê, loại dịch vụ, doanh thu',
            url=reverse('dich_vu_dien_nuoc:danhsachthongbao'),
            icon='fa-building-circle-check',
            accent='amber',
        ))

    if is_super or user.has_perm(GATEWAY_PERMISSIONS['co']):
        apps.append(PortalApp(
            key='co',
            name='Quản lý CO',
            description='Đơn hàng, WO, định mức, bảng kê, hồ sơ CO',
            url=settings.PORTAL_CO_URL,
            icon='fa-file-contract',
            accent='emerald',
        ))

    if is_super or user.has_perm(GATEWAY_PERMISSIONS['tinh-gia']):
        apps.append(PortalApp(
            key='tinh_gia',
            name='Tính giá thành',
            description='BOM, công thức, lần tính giá thành, kịch bản giá bán',
            url=settings.PORTAL_TINHGIA_URL,
            icon='fa-calculator',
            accent='violet',
        ))

    return apps
