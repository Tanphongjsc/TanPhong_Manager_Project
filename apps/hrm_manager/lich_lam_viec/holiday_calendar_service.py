"""Application service for holiday-calendar CRUD and validation."""

import math
import re
from datetime import date

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.hrm_manager.__core__.models import Lichlamviec, Lichnghi, LichnghiChitiet


class HolidayCalendarError(ValueError):
    """Business validation error safe to return to the client."""


class HolidayCalendarService:
    CALENDAR_TYPE = "LICH_AP_DUNG"
    TEMPLATE_TYPE = "BAN_MAU"
    DAY_TYPES = {"NGHI_LE", "NGAY_NGHI"}
    SOURCES = {"THU_CONG", "HANG_LOAT", "BAN_MAU"}
    STATUSES = {"active", "inactive"}
    CODE_PATTERN = re.compile(r"^[A-Z0-9_-]+$")

    @staticmethod
    def _as_bool(value):
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    @staticmethod
    def _as_date(value, field_name="Ngày"):
        if isinstance(value, date):
            return value
        try:
            return date.fromisoformat(str(value or ""))
        except (TypeError, ValueError) as exc:
            raise HolidayCalendarError(f"{field_name} không đúng định dạng YYYY-MM-DD.") from exc

    @classmethod
    def _validate_master(cls, payload, instance=None):
        name = str(payload.get("TenLichNghi") or "").strip()
        code = str(payload.get("MaLichNghi") or "").strip().upper()
        status = str(payload.get("TrangThai") or "active").strip()
        try:
            year = int(payload.get("Nam"))
        except (TypeError, ValueError) as exc:
            raise HolidayCalendarError("Năm lịch nghỉ không hợp lệ.") from exc

        if not name or len(name) > 200:
            raise HolidayCalendarError("Tên lịch nghỉ là bắt buộc và không vượt quá 200 ký tự.")
        if not code or len(code) > 50 or not cls.CODE_PATTERN.fullmatch(code):
            raise HolidayCalendarError("Mã lịch nghỉ chỉ gồm chữ in hoa, số, dấu gạch ngang hoặc gạch dưới.")
        if year < 1900 or year > 2100:
            raise HolidayCalendarError("Năm lịch nghỉ phải nằm trong khoảng 1900–2100.")
        if status not in cls.STATUSES:
            raise HolidayCalendarError("Trạng thái lịch nghỉ không hợp lệ.")

        duplicate = Lichnghi.objects.filter(malichnghi__iexact=code)
        if instance is not None:
            duplicate = duplicate.exclude(pk=instance.pk)
            if code != (instance.malichnghi or "").upper():
                raise HolidayCalendarError("Không được thay đổi mã lịch nghỉ sau khi tạo.")
            if year != instance.nam:
                raise HolidayCalendarError("Không được thay đổi năm của lịch nghỉ sau khi tạo.")
        if duplicate.exists():
            raise HolidayCalendarError("Mã lịch nghỉ đã tồn tại.")

        return {
            "name": name,
            "code": code,
            "year": year,
            "status": status,
            "note": str(payload.get("GhiChu") or "").strip(),
        }

    @classmethod
    def _validate_details(cls, payload, year, existing_by_id=None):
        raw_details = payload.get("ChiTiet")
        if not isinstance(raw_details, list) or not raw_details:
            raise HolidayCalendarError("Lịch nghỉ phải có ít nhất một ngày nghỉ.")

        existing_by_id = existing_by_id or {}
        today = timezone.localdate()
        seen_dates = set()
        seen_ids = set()
        normalized = []

        for index, raw in enumerate(raw_details, start=1):
            if not isinstance(raw, dict):
                raise HolidayCalendarError(f"Chi tiết dòng {index} không hợp lệ.")

            day_id = raw.get("id") or raw.get("Id")
            try:
                day_id = int(day_id) if day_id else None
            except (TypeError, ValueError) as exc:
                raise HolidayCalendarError(f"ID chi tiết dòng {index} không hợp lệ.") from exc
            if day_id and day_id not in existing_by_id:
                raise HolidayCalendarError("Chi tiết ngày nghỉ không thuộc lịch đang cập nhật.")
            if day_id and day_id in seen_ids:
                raise HolidayCalendarError("Một chi tiết ngày nghỉ đang xuất hiện nhiều lần.")
            if day_id:
                seen_ids.add(day_id)

            holiday_date = cls._as_date(raw.get("Ngay"), f"Ngày ở dòng {index}")
            if holiday_date.year != year:
                raise HolidayCalendarError(f"Ngày {holiday_date:%d/%m/%Y} không thuộc năm {year}.")
            if holiday_date in seen_dates:
                raise HolidayCalendarError(f"Ngày {holiday_date:%d/%m/%Y} bị trùng.")
            seen_dates.add(holiday_date)

            name = str(raw.get("TenNgayNghi") or "").strip()
            day_type = str(raw.get("LoaiLichNghi") or "").strip()
            paid = cls._as_bool(raw.get("ApDungTinhLuong"))
            source = str(raw.get("NguonGoc") or "THU_CONG").strip()
            if source == "TEMPLATE":
                source = "BAN_MAU"
            try:
                coefficient = float(raw.get("HeSoLamViec") if paid else 0)
            except (TypeError, ValueError) as exc:
                raise HolidayCalendarError(f"Hệ số công dòng {index} không hợp lệ.") from exc

            if not name or len(name) > 200:
                raise HolidayCalendarError(f"Tên ngày nghỉ dòng {index} là bắt buộc và không vượt quá 200 ký tự.")
            if day_type not in cls.DAY_TYPES:
                raise HolidayCalendarError(f"Loại ngày nghỉ dòng {index} không hợp lệ.")
            if source not in cls.SOURCES:
                raise HolidayCalendarError(f"Nguồn gốc dòng {index} không hợp lệ.")
            if coefficient < 0 or coefficient > 10:
                raise HolidayCalendarError(f"Hệ số công dòng {index} phải từ 0 đến 10.")

            old = existing_by_id.get(day_id)
            if old and old.loailichnghi != day_type:
                raise HolidayCalendarError("Không được thay đổi loại của ngày nghỉ đã tồn tại.")
            if holiday_date < today:
                old_source = old.nguongoc if old else None
                if old_source == "TEMPLATE":
                    old_source = "BAN_MAU"
                unchanged = old and all((
                    old.ngay == holiday_date,
                    (old.tenngaynghi or "") == name,
                    old.loailichnghi == day_type,
                    bool(old.apdungtinhluong) == paid,
                    float(old.hesolamviec or 0) == coefficient,
                    (old_source or "THU_CONG") == source,
                ))
                if not unchanged:
                    raise HolidayCalendarError(f"Không được thêm hoặc sửa ngày quá khứ {holiday_date:%d/%m/%Y}.")

            normalized.append({
                "id": day_id,
                "date": holiday_date,
                "name": name,
                "type": day_type,
                "paid": paid,
                "coefficient": coefficient,
                "source": source,
            })

        return normalized

    @staticmethod
    def _serialize_day(item):
        return {
            "id": item.pk,
            "Ngay": item.ngay.isoformat() if item.ngay else None,
            "TenNgayNghi": item.tenngaynghi,
            "LoaiLichNghi": item.loailichnghi,
            "ApDungTinhLuong": bool(item.apdungtinhluong),
            "HeSoLamViec": item.hesolamviec,
            "NguonGoc": item.nguongoc,
        }

    @classmethod
    def serialize_calendar(cls, item, include_details=False):
        result = {
            "id": item.pk,
            "MaLichNghi": item.malichnghi,
            "TenLichNghi": item.tenlichnghi,
            "Nam": item.nam,
            "LoaiNghi": item.loainghi,
            "TrangThai": item.trangthai or "inactive",
            "GhiChu": item.ghichu or "",
            "UpdatedAt": item.updated_at.isoformat() if item.updated_at else None,
        }
        if include_details:
            details = LichnghiChitiet.objects.filter(lichnghi_id=item.pk).order_by("ngay", "id")
            result["ChiTiet"] = [cls._serialize_day(day) for day in details]
        return result

    @classmethod
    def list(cls, *, search="", status="", page=1, page_size=20):
        queryset = Lichnghi.objects.exclude(loainghi=cls.TEMPLATE_TYPE)
        if search:
            queryset = queryset.filter(Q(tenlichnghi__icontains=search) | Q(malichnghi__icontains=search))
        if status:
            if status not in cls.STATUSES:
                raise HolidayCalendarError("Bộ lọc trạng thái không hợp lệ.")
            queryset = queryset.filter(trangthai=status)
        queryset = queryset.order_by("tenlichnghi", "malichnghi", "id")

        total = queryset.count()
        total_pages = max(1, math.ceil(total / page_size))
        page = min(max(1, page), total_pages)
        offset = (page - 1) * page_size
        items = [cls.serialize_calendar(item) for item in queryset[offset:offset + page_size]]
        return items, {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1,
        }

    @classmethod
    @transaction.atomic
    def create(cls, payload):
        master = cls._validate_master(payload)
        details = cls._validate_details(payload, master["year"])
        now = timezone.now()
        item = Lichnghi.objects.create(
            malichnghi=master["code"],
            tenlichnghi=master["name"],
            loainghi=cls.CALENDAR_TYPE,
            trangthai=master["status"],
            nam=master["year"],
            ghichu=master["note"],
            created_at=now,
            updated_at=now,
        )
        LichnghiChitiet.objects.bulk_create([
            LichnghiChitiet(
                lichnghi_id=item.pk,
                ngay=detail["date"],
                tenngaynghi=detail["name"],
                loailichnghi=detail["type"],
                apdungtinhluong=detail["paid"],
                hesolamviec=detail["coefficient"],
                nguongoc=detail["source"],
                created_at=now,
                updated_at=now,
            )
            for detail in details
        ])
        return item

    @classmethod
    @transaction.atomic
    def update(cls, pk, payload):
        try:
            item = Lichnghi.objects.select_for_update().exclude(loainghi=cls.TEMPLATE_TYPE).get(pk=pk)
        except Lichnghi.DoesNotExist as exc:
            raise HolidayCalendarError("Không tìm thấy lịch nghỉ.") from exc

        expected = payload.get("ExpectedUpdatedAt")
        current_version = item.updated_at.isoformat() if item.updated_at else None
        if expected and current_version and expected != current_version:
            raise HolidayCalendarError("Lịch nghỉ đã được người khác cập nhật. Vui lòng tải lại trang.")

        master = cls._validate_master(payload, instance=item)
        existing = {day.pk: day for day in LichnghiChitiet.objects.select_for_update().filter(lichnghi_id=pk)}
        details = cls._validate_details(payload, master["year"], existing)
        today = timezone.localdate()

        deleted_ids = set()
        for raw_id in payload.get("DeletedIds") or []:
            try:
                deleted_ids.add(int(raw_id))
            except (TypeError, ValueError) as exc:
                raise HolidayCalendarError("Danh sách ngày xóa không hợp lệ.") from exc
        if not deleted_ids.issubset(existing):
            raise HolidayCalendarError("Có ngày cần xóa không thuộc lịch hiện tại.")
        submitted_ids = {detail["id"] for detail in details if detail["id"]}
        if submitted_ids & deleted_ids:
            raise HolidayCalendarError("Một ngày nghỉ không thể đồng thời được cập nhật và xóa.")
        if any(existing[day_id].ngay and existing[day_id].ngay < today for day_id in deleted_ids):
            raise HolidayCalendarError("Không được xóa ngày nghỉ trong quá khứ.")
        retained_dates = {
            day.ngay
            for day_id, day in existing.items()
            if day_id not in submitted_ids and day_id not in deleted_ids and day.ngay
        }
        new_dates = {detail["date"] for detail in details if not detail["id"]}
        if retained_dates & new_dates:
            raise HolidayCalendarError("Ngày nghỉ mới bị trùng với dữ liệu hiện có.")

        now = timezone.now()
        item.tenlichnghi = master["name"]
        item.trangthai = master["status"]
        item.ghichu = master["note"]
        item.loainghi = cls.CALENDAR_TYPE
        item.updated_at = now
        item.save(update_fields=["tenlichnghi", "trangthai", "ghichu", "loainghi", "updated_at"])

        if deleted_ids:
            LichnghiChitiet.objects.filter(lichnghi_id=pk, pk__in=deleted_ids).delete()

        for detail in details:
            if detail["id"]:
                day = existing[detail["id"]]
                day.ngay = detail["date"]
                day.tenngaynghi = detail["name"]
                day.loailichnghi = detail["type"]
                day.apdungtinhluong = detail["paid"]
                day.hesolamviec = detail["coefficient"]
                day.nguongoc = detail["source"]
                day.updated_at = now
                day.save()
            else:
                LichnghiChitiet.objects.create(
                    lichnghi_id=pk,
                    ngay=detail["date"],
                    tenngaynghi=detail["name"],
                    loailichnghi=detail["type"],
                    apdungtinhluong=detail["paid"],
                    hesolamviec=detail["coefficient"],
                    nguongoc=detail["source"],
                    created_at=now,
                    updated_at=now,
                )
        return item

    @classmethod
    @transaction.atomic
    def delete(cls, pk):
        try:
            item = Lichnghi.objects.select_for_update().exclude(loainghi=cls.TEMPLATE_TYPE).get(pk=pk)
        except Lichnghi.DoesNotExist as exc:
            raise HolidayCalendarError("Không tìm thấy lịch nghỉ.") from exc
        if Lichlamviec.objects.filter(lichnghi_id=pk).exists():
            raise HolidayCalendarError("Không thể xóa lịch nghỉ đang được lịch làm việc sử dụng.")
        LichnghiChitiet.objects.filter(lichnghi_id=pk).delete()
        item.delete()

    @classmethod
    @transaction.atomic
    def bulk_delete(cls, ids):
        if not isinstance(ids, list):
            raise HolidayCalendarError("Danh sách lịch nghỉ cần xóa không hợp lệ.")
        normalized = {int(pk) for pk in ids}
        if not normalized:
            raise HolidayCalendarError("Vui lòng chọn ít nhất một lịch nghỉ.")
        if Lichlamviec.objects.filter(lichnghi_id__in=normalized).exists():
            raise HolidayCalendarError("Có lịch nghỉ đang được lịch làm việc sử dụng nên không thể xóa.")
        existing_ids = set(
            Lichnghi.objects.filter(pk__in=normalized)
            .exclude(loainghi=cls.TEMPLATE_TYPE)
            .values_list("pk", flat=True)
        )
        if existing_ids != normalized:
            raise HolidayCalendarError("Có lịch nghỉ không tồn tại hoặc đã bị xóa.")
        LichnghiChitiet.objects.filter(lichnghi_id__in=normalized).delete()
        Lichnghi.objects.filter(pk__in=normalized).delete()
        return len(normalized)

    @classmethod
    def templates(cls, year):
        details = LichnghiChitiet.objects.filter(
            lichnghi__loainghi=cls.TEMPLATE_TYPE,
            lichnghi__nam=year,
            lichnghi__trangthai="active",
            ngay__year=year,
            ngay__gte=timezone.localdate(),
        ).order_by("ngay", "id")
        return [cls._serialize_day(item) for item in details]

    @classmethod
    @transaction.atomic
    def set_status(cls, pk, status):
        if status not in cls.STATUSES:
            raise HolidayCalendarError("Trạng thái không hợp lệ.")
        updated = (
            Lichnghi.objects.filter(pk=pk)
            .exclude(loainghi=cls.TEMPLATE_TYPE)
            .update(trangthai=status, updated_at=timezone.now())
        )
        if not updated:
            raise HolidayCalendarError("Không tìm thấy lịch nghỉ.")
