from __future__ import annotations

from dataclasses import dataclass


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@dataclass(frozen=True)
class RoutePermissionRule:
    prefix: str
    feature_key: str


# Longest prefix wins.
ROUTE_PERMISSION_RULES: tuple[RoutePermissionRule, ...] = (
    RoutePermissionRule(prefix="/hrm/to-chuc-nhan-su/", feature_key="to_chuc_nhan_su"),
    RoutePermissionRule(prefix="/hrm/quan-ly-luong/", feature_key="quan_ly_luong"),
    RoutePermissionRule(prefix="/hrm/hop-dong-lao-dong/", feature_key="hop_dong_lao_dong"),
    RoutePermissionRule(prefix="/hrm/lich-lam-viec/", feature_key="lich_lam_viec"),
    RoutePermissionRule(prefix="/hrm/lam-them-gio/", feature_key="lam_them_gio"),
    RoutePermissionRule(prefix="/hrm/cham-cong/", feature_key="cham_cong"),
    RoutePermissionRule(prefix="/hrm/don-bao/", feature_key="don_bao"),
    RoutePermissionRule(prefix="/hrm/nghi-phep/", feature_key="nghi_phep"),
    RoutePermissionRule(prefix="/hrm/core/", feature_key="hrm_core"),
    RoutePermissionRule(prefix="/dichvudiennuoc/", feature_key="dich_vu_dien_nuoc"),
    RoutePermissionRule(prefix="/dashboard/", feature_key="dashboard"),
)


EXEMPT_PATH_PREFIXES: tuple[str, ...] = (
    "/accounts/",
    "/admin/",
    "/health/",
    "/static/",
    "/media/",
)


FEATURE_KEYS: tuple[str, ...] = (
    "dashboard",
    "dich_vu_dien_nuoc",
    "hrm_core",
    "to_chuc_nhan_su",
    "cham_cong",
    "lich_lam_viec",
    "lam_them_gio",
    "don_bao",
    "hop_dong_lao_dong",
    "quan_ly_luong",
    "nghi_phep",
)


ACL_MENU_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "can_view_dashboard": ("access_control.view_dashboard", "dashboard.view_dashboard"),
    "can_view_dich_vu_dien_nuoc": ("access_control.view_dich_vu_dien_nuoc",),
    "can_view_to_chuc_nhan_su": ("access_control.view_to_chuc_nhan_su",),
    "can_view_cham_cong": ("access_control.view_cham_cong",),
    "can_view_lich_lam_viec": ("access_control.view_lich_lam_viec",),
    "can_view_lam_them_gio": ("access_control.view_lam_them_gio",),
    "can_view_don_bao": ("access_control.view_don_bao",),
    "can_view_quan_ly_luong": ("access_control.view_quan_ly_luong",),
}


LANDING_ROUTE_PERMISSIONS: tuple[tuple[str, str], ...] = (
    ("access_control.view_dashboard", "dashboard:dashboard"),
    ("dashboard.view_dashboard", "dashboard:dashboard"),
    ("access_control.view_cham_cong", "hrm:cham_cong:bang_cham_cong"),
    ("access_control.view_lich_lam_viec", "hrm:lich_lam_viec:thiet_ke_ca"),
    ("access_control.view_to_chuc_nhan_su", "hrm:to_chuc_nhan_su:cay_nhan_su_index"),
    ("access_control.view_dich_vu_dien_nuoc", "dich_vu_dien_nuoc:danhsachthongbao"),
    ("access_control.view_quan_ly_luong", "hrm:quan_ly_luong:phan_tu_luong"),
    ("access_control.view_hop_dong_lao_dong", "hrm:hop_dong_lao_dong:quan_ly_hop_dong_index"),
    ("access_control.view_don_bao", "hrm:cham_cong:don_bao"),
)
