from django.db import models

# Create your models here.
class CtThanhtoanDichvu(models.Model):
    id = models.BigAutoField(db_column='ID', primary_key=True)  # Field name made lowercase.
    id_dichvu = models.ForeignKey('Dichvu', models.DO_NOTHING, db_column='Id_DichVu', blank=True, null=True)  # Field name made lowercase.
    tientruocthue = models.FloatField(db_column='TienTruocThue', blank=True, null=True)  # Field name made lowercase.
    thue = models.FloatField(db_column='Thue', blank=True, null=True)  # Field name made lowercase.
    tiensauthue = models.FloatField(db_column='TienSauThue', blank=True, null=True)  # Field name made lowercase.
    donvitinh = models.CharField(db_column='DonViTinh', blank=True, null=True)  # Field name made lowercase.
    chisocu = models.FloatField(db_column='ChiSoCu', blank=True, null=True)  # Field name made lowercase.
    chisomoi = models.FloatField(db_column='ChiSoMoi', blank=True, null=True)  # Field name made lowercase.
    heso = models.IntegerField(db_column='HeSo', blank=True, null=True)  # Field name made lowercase.
    dongia = models.FloatField(db_column='DonGia', blank=True, null=True)  # Field name made lowercase.
    sosudung = models.FloatField(db_column='SoSuDung', blank=True, null=True)  # Field name made lowercase.
    loaithue = models.BigIntegerField(db_column='LoaiThue', blank=True, null=True)  # Field name made lowercase.
    id_thanhtoan_dichvu = models.ForeignKey('ThanhtoanDichvu', models.DO_NOTHING, db_column='ID_ThanhToan_DichVu', blank=True, null=True)  # Field name made lowercase.
    tendichvu = models.CharField(db_column='TenDichVu', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"public"."CT_ThanhToan_DichVu"'


class Dichvu(models.Model):
    id_dichvu = models.BigAutoField(db_column='Id_DichVu', primary_key=True)  # Field name made lowercase.
    id_loaidichvu = models.ForeignKey('Loaidichvu', models.DO_NOTHING, db_column='Id_LoaiDichVu', blank=True, null=True)  # Field name made lowercase.
    tendichvu = models.CharField(db_column='TenDichVu', blank=True, null=True)  # Field name made lowercase.
    chuthich = models.CharField(db_column='ChuThich', blank=True, null=True)  # Field name made lowercase.
    ngayghi = models.DateField(db_column='NgayGhi', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"public"."DichVu"'


class Hopdong(models.Model):
    id_hopdong = models.BigAutoField(db_column='Id_HopDong', primary_key=True)  # Field name made lowercase.
    tencongty = models.CharField(db_column='TenCongTy', blank=True, null=True)  # Field name made lowercase.
    sohd = models.CharField(db_column='SoHD', blank=True, null=True)  # Field name made lowercase.
    kythanhtoan = models.BigIntegerField(db_column='KyThanhToan', blank=True, null=True)  # Field name made lowercase.
    chuthich = models.CharField(db_column='ChuThich', blank=True, null=True)  # Field name made lowercase.
    ngaytaohopdong = models.DateField(db_column='NgayTaoHopDong', blank=True, null=True)  # Field name made lowercase.
    tiencoc = models.FloatField(db_column='TienCoc', blank=True, null=True)  # Field name made lowercase.
    ngayketthuc = models.DateField(db_column='NgayKetThuc', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.SmallIntegerField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    ngaybatdautinhtien = models.DateField(db_column='NgayBatDauTinhTien', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"public"."HopDong"'


class HopdongDichvu(models.Model):
    id_hopdongdichvu = models.BigAutoField(db_column='Id_HopDongDichVu', primary_key=True)  # Field name made lowercase.
    id_hopdong = models.ForeignKey(Hopdong, models.DO_NOTHING, db_column='Id_HopDong', blank=True, null=True)  # Field name made lowercase.
    id_dichvu = models.ForeignKey(Dichvu, models.DO_NOTHING, db_column='Id_DichVu', blank=True, null=True)  # Field name made lowercase.
    dongia = models.FloatField(db_column='DonGia', blank=True, null=True)  # Field name made lowercase.
    chuthich = models.CharField(db_column='ChuThich', blank=True, null=True)  # Field name made lowercase.
    donvitinh = models.CharField(db_column='DonViTinh', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"public"."HopDong_DichVu"'


class HopdongNhaxuong(models.Model):
    id = models.BigAutoField(primary_key=True)
    dientich = models.FloatField(db_column='DienTich', blank=True, null=True)  # Field name made lowercase.
    dongia = models.FloatField(db_column='DonGia', blank=True, null=True)  # Field name made lowercase.
    ngaybatdau = models.DateField(db_column='NgayBatDau', blank=True, null=True)  # Field name made lowercase.
    ngayketthuc = models.DateField(db_column='NgayKetThuc', blank=True, null=True)  # Field name made lowercase.
    id_hopdong = models.ForeignKey(Hopdong, models.DO_NOTHING, db_column='Id_HopDong', blank=True, null=True)  # Field name made lowercase.
    id_dichvu = models.ForeignKey(Dichvu, models.DO_NOTHING, db_column='Id_DichVu', blank=True, null=True)  # Field name made lowercase.
    loaithanhtoan = models.CharField(db_column='LoaiThanhToan', blank=True, null=True)  # Field name made lowercase.
    chuthich = models.CharField(db_column='ChuThich', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False


class Loaidichvu(models.Model):
    id_loaidichvu = models.BigAutoField(db_column='Id_LoaiDichVu', primary_key=True)  # Field name made lowercase.
    tenloaidichvu = models.CharField(db_column='TenLoaiDichVu')  # Field name made lowercase.
    chuthich = models.CharField(db_column='ChuThich', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"public"."LoaiDichVu"'


class Loaitaisan(models.Model):
    id_loaitaisan = models.BigAutoField(db_column='Id_LoaiTaiSan', primary_key=True)  # Field name made lowercase.
    tenloaitaisan = models.CharField(db_column='TenLoaiTaiSan')  # Field name made lowercase.
    chuthich = models.CharField(db_column='ChuThich', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"public"."LoaiTaiSan"'


class Taisan(models.Model):
    id_taisan = models.BigAutoField(db_column='Id_TaiSan', primary_key=True)  # Field name made lowercase.
    id_loaitaisan = models.ForeignKey(Loaitaisan, models.DO_NOTHING, db_column='Id_LoaiTaiSan')  # Field name made lowercase.
    tentaisan = models.CharField(db_column='TenTaiSan', blank=True, null=True)  # Field name made lowercase.
    ngayghitang = models.DateField(db_column='NgayGhiTang', blank=True, null=True)  # Field name made lowercase.
    thoigiansudung = models.CharField(db_column='ThoiGianSuDung', blank=True, null=True)  # Field name made lowercase.
    nguyengia = models.FloatField(db_column='NguyenGia', blank=True, null=True)  # Field name made lowercase.
    chuthich = models.CharField(db_column='ChuThich', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"public"."TaiSan"'


class ThanhtoanDichvu(models.Model):
    id = models.BigAutoField(primary_key=True)
    thoigiantao = models.DateTimeField(db_column='ThoigianTao', blank=True, null=True)  # Field name made lowercase.
    sotbdv = models.CharField(db_column='SoTBDV', blank=True, null=True)  # Field name made lowercase.
    id_hopdong = models.ForeignKey(Hopdong, models.DO_NOTHING, db_column='Id_HopDong', blank=True, null=True)  # Field name made lowercase.
    giamtru = models.FloatField(db_column='GiamTru', blank=True, null=True)  # Field name made lowercase.
    tongtientruocthue = models.FloatField(db_column='TongTienTruocThue', blank=True, null=True)  # Field name made lowercase.
    tongtiensauthue = models.FloatField(db_column='TongTienSauThue', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"public"."ThanhToan_DichVu"'


class ThanhtoanNhaxuong(models.Model):
    id = models.BigAutoField(primary_key=True)
    ngaytao = models.DateTimeField(db_column='NgayTao')  # Field name made lowercase.
    id_hopdong = models.ForeignKey(Hopdong, models.DO_NOTHING, db_column='id_hopdong', blank=True, null=True)
    tongtien = models.FloatField(db_column='TongTien', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"public"."ThanhToan_NhaXuong"'