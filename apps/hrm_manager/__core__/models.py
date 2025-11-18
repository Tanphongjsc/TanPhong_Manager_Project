from django.db import models

class Bangchamcong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    thoigianchamcongvao = models.TimeField(db_column='ThoiGianChamCongVao', blank=True, null=True)  # Field name made lowercase.
    thoigianchamcongra = models.TimeField(db_column='ThoiGianChamCongRa', blank=True, null=True)  # Field name made lowercase.
    thoigianlamviec = models.FloatField(db_column='ThoiGianLamViec', blank=True, null=True)  # Field name made lowercase.
    ngaylamviec = models.DateField(db_column='NgayLamViec', blank=True, null=True)  # Field name made lowercase.
    thoigianlamthem = models.FloatField(db_column='ThoiGianLamThem', blank=True, null=True)  # Field name made lowercase.
    cotinhlamthem = models.BooleanField(db_column='CoTinhLamThem', blank=True, null=True)  # Field name made lowercase.
    coantrua = models.BooleanField(db_column='CoAnTrua', blank=True, null=True)  # Field name made lowercase.
    thoigiandimuon = models.IntegerField(db_column='ThoiGianDiMuon', blank=True, null=True)  # Field name made lowercase.
    thoigianvesom = models.IntegerField(db_column='ThoiGianVeSom', blank=True, null=True)  # Field name made lowercase.
    thoigiandisom = models.IntegerField(db_column='ThoiGianDiSom', blank=True, null=True)  # Field name made lowercase.
    thoigianvemuon = models.IntegerField(db_column='ThoiGianVeMuon', blank=True, null=True)  # Field name made lowercase.
    loaichamcong = models.CharField(db_column='LoaiChamCong', blank=True, null=True)  # Field name made lowercase.
    tencongviec = models.CharField(db_column='TenCongViec', blank=True, null=True)  # Field name made lowercase.
    cophaingaynghi = models.BooleanField(db_column='CoPhaiNgayNghi', blank=True, null=True)  # Field name made lowercase.
    thamsotinhluong = models.TextField(db_column='ThamSoTinhLuong', blank=True, null=True)  # Field name made lowercase. This field type is a guess.
    thanhtien = models.FloatField(db_column='ThanhTien', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    congviec = models.ForeignKey('Congviec', models.DO_NOTHING, blank=True, null=True)
    nhanvien = models.ForeignKey('Nhanvien', models.DO_NOTHING, blank=True, null=True)
    lichlamviec = models.ForeignKey('Lichlamviec', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."BangChamCong"'


class Bangluong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    mabangluong = models.CharField(db_column='MaBangLuong', blank=True, null=True)  # Field name made lowercase.
    tenbangluong = models.CharField(db_column='TenBangLuong', blank=True, null=True)  # Field name made lowercase.
    tongsoluongnhanvien = models.IntegerField(db_column='TongSoLuongNhanVien', blank=True, null=True)  # Field name made lowercase.
    tongtienluong = models.FloatField(db_column='TongTienLuong', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    ngaytao = models.DateField(db_column='NgayTao', blank=True, null=True)  # Field name made lowercase.
    nguoitao = models.CharField(db_column='NguoiTao', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    kyluong = models.ForeignKey('Kyluong', models.DO_NOTHING, blank=True, null=True)
    chedoluong = models.ForeignKey('Chedoluong', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."BangLuong"'
        db_table_comment = 'Đây là bảng chứa các bảng lương theo các kỳ lương tương ứng, ví dụ kỳ lương tháng 9 thì có các bảng lương của phòng hành chính, phòng kỹ thuật v.v.'


class CtlichlamviecLichtrinh(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    calamviectungngay = models.CharField(db_column='CaLamViecTungNgay', blank=True, null=True)  # Field name made lowercase.
    calamviec = models.ForeignKey('Calamviec', models.DO_NOTHING, blank=True, null=True)
    lichlamviec_lichtrinh = models.ForeignKey('LichlamviecLichtrinh', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."CTLichLamViec_LichTrinh"'
        db_table_comment = 'Chi tiết từng ngày của kịch bản làm việc - lịch trình, setup các ngày trong chu kỳ'


class Ctphieuluong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    maphantuluong = models.CharField(db_column='MaPhanTuLuong', blank=True, null=True)  # Field name made lowercase.
    tenphantuluong = models.CharField(db_column='TenPhanTuLuong', blank=True, null=True)  # Field name made lowercase.
    loaiphantu = models.CharField(db_column='LoaiPhanTu', blank=True, null=True)  # Field name made lowercase.
    nguondulieu = models.TextField(db_column='NguonDuLieu', blank=True, null=True)  # Field name made lowercase.
    bieuthuctinhtoan = models.CharField(db_column='BieuThucTinhToan', blank=True, null=True)  # Field name made lowercase.
    giatridauvao = models.TextField(db_column='GiaTriDauVao', blank=True, null=True)  # Field name made lowercase. This field type is a guess.
    giatritinhduoc = models.FloatField(db_column='GiaTriTinhDuoc', blank=True, null=True)  # Field name made lowercase.
    thutuhienthi = models.SmallIntegerField(db_column='ThuTuHienThi', blank=True, null=True)  # Field name made lowercase.
    phieuluong = models.ForeignKey('Phieuluong', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."CTPhieuLuong"'
        db_table_comment = 'Chi tiết các cột phần tử lương của một phiếu lương và giá trị của từng phần tử'


class Calamviec(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    macalamviec = models.CharField(db_column='MaCaLamViec', blank=True, null=True)  # Field name made lowercase.
    tencalamviec = models.CharField(db_column='TenCaLamViec', blank=True, null=True)  # Field name made lowercase.
    loaichamcong = models.CharField(db_column='LoaiChamCong', blank=True, null=True)  # Field name made lowercase.
    sokhunggiotrongca = models.SmallIntegerField(db_column='SoKhungGioTrongCa', blank=True, null=True)  # Field name made lowercase.
    solanchamcongtrongngay = models.SmallIntegerField(db_column='SoLanChamCongTrongNgay', blank=True, null=True)  # Field name made lowercase.
    conghitrua = models.BooleanField(db_column='CoNghiTrua', blank=True, null=True)  # Field name made lowercase.
    congcuacalamviec = models.SmallIntegerField(db_column='CongCuaCaLamViec', blank=True, null=True)  # Field name made lowercase.
    cocancheckout = models.BooleanField(db_column='CoCanCheckout', blank=True, null=True)  # Field name made lowercase.
    tongthoigianlamvieccuaca = models.FloatField(db_column='TongThoiGianLamViecCuaCa', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."CaLamViec"'
        db_table_comment = 'Định nghĩa các ca làm việc'


class Chedoluong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    machedo = models.CharField(db_column='MaCheDo', blank=True, null=True)  # Field name made lowercase.
    tenchedo = models.CharField(db_column='TenCheDo', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    ngayapdung = models.DateField(db_column='NgayApDung', blank=True, null=True)  # Field name made lowercase.
    ngayhethan = models.DateField(db_column='NgayHetHan', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."CheDoLuong"'
        db_table_comment = 'Bảng này sẽ lưu lại các chế độ lương khác nhau, một chế độ lương sẽ gồm các cách tính lương và phần tử lương khác nhau'


class Chucvu(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    machucvu = models.CharField(db_column='MaChucVu', blank=True, null=True)  # Field name made lowercase.
    tenvitricongviec = models.CharField(db_column='TenViTriCongViec', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."ChucVu"'
        db_table_comment = 'Bảng chứa danh sách các chức vụ của công ty'


class Congty(models.Model):
    id = models.BigAutoField(primary_key=True)
    macongty = models.CharField(db_column='MaCongTy', blank=True, null=True)  # Field name made lowercase.
    tencongty_vi = models.CharField(db_column='TenCongTy_Vi', blank=True, null=True)  # Field name made lowercase.
    masothue = models.CharField(db_column='MaSoThue', blank=True, null=True)  # Field name made lowercase.
    diachi_vi = models.TextField(db_column='DiaChi_Vi', blank=True, null=True)  # Field name made lowercase.
    tencongty_en = models.CharField(db_column='TenCongTy_En', blank=True, null=True)  # Field name made lowercase.
    diachi_en = models.TextField(db_column='DiaChi_En', blank=True, null=True)  # Field name made lowercase.
    tenviettat = models.CharField(db_column='TenVietTat', blank=True, null=True)  # Field name made lowercase.
    fax = models.CharField(db_column='Fax', blank=True, null=True)  # Field name made lowercase.
    sodienthoai = models.CharField(db_column='SoDienThoai', blank=True, null=True)  # Field name made lowercase.
    nguoidaidien = models.CharField(db_column='NguoiDaiDien', blank=True, null=True)  # Field name made lowercase.
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."CongTy"'


class Congviec(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    macongviec = models.CharField(db_column='MaCongViec', blank=True, null=True)  # Field name made lowercase.
    tencongviec = models.CharField(db_column='TenCongViec', blank=True, null=True)  # Field name made lowercase.
    loaicongviec = models.CharField(db_column='LoaiCongViec', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    bieuthuctinhtoan = models.CharField(db_column='BieuThucTinhToan', blank=True, null=True)  # Field name made lowercase.
    trangthaicongthuc = models.CharField(db_column='TrangThaiCongThuc', blank=True, null=True)  # Field name made lowercase.
    trangthaicv = models.CharField(db_column='TrangThaiCV', blank=True, null=True)  # Field name made lowercase.
    danhsachthamso = models.TextField(db_column='DanhSachThamSo', blank=True, null=True)  # Field name made lowercase. This field type is a guess.

    class Meta:
        managed = False
        db_table = '"hrm"."CongViec"'
        db_table_comment = 'Bảng này chứa danh sách các công việc xuất hiện trong công ty, bao gồm các công việc khoán'


class Donbao(models.Model):
    id = models.BigAutoField(primary_key=True)
    tendonbao = models.CharField(db_column='TenDonBao', blank=True, null=True)  # Field name made lowercase.
    madonbao = models.CharField(db_column='MaDonBao', blank=True, null=True)  # Field name made lowercase.
    buocduyethientai = models.ForeignKey('DonbaoBuocquytrinhduyet', models.DO_NOTHING, db_column='BuocDuyetHienTai', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    lydo = models.TextField(db_column='LyDo', blank=True, null=True)  # Field name made lowercase.
    loaidonbao = models.ForeignKey('DonbaoLoaidonbao', models.DO_NOTHING, blank=True, null=True)
    nhanvien = models.ForeignKey('Nhanvien', models.DO_NOTHING, blank=True, null=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    dulieuchitiettungloaidon = models.TextField(db_column='DuLieuChiTietTungLoaiDon', blank=True, null=True)  # Field name made lowercase. This field type is a guess.

    class Meta:
        managed = False
        db_table = '"hrm"."DonBao"'
        db_table_comment = 'Thiết lập các đơn báo cho nhân viên. Trường BuocDuyetHienTai FK với Bảng THỨ TỰ DUYỆT'


class DonbaoBuocchuyenquytrinh(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    nutbatdau = models.ForeignKey('DonbaoBuocquytrinhduyet', models.DO_NOTHING, db_column='NutBatDau', blank=True, null=True)  # Field name made lowercase.
    nutketiep = models.ForeignKey('DonbaoBuocquytrinhduyet', models.DO_NOTHING, db_column='NutKeTiep', related_name='donbaobuocchuyenquytrinh_nutketiep_set', blank=True, null=True)  # Field name made lowercase.
    luongduyet = models.ForeignKey('DonbaoLuongduyet', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."DonBao_BuocChuyenQuyTrinh"'
        db_table_comment = 'Nút bắt đầu, Nút kế tiếp FK với bảng THỨ TỰ DUYỆT'


class DonbaoBuocquytrinhduyet(models.Model):
    id = models.BigAutoField(primary_key=True)
    loainut = models.CharField(db_column='LoaiNut', blank=True, null=True)  # Field name made lowercase.
    tennut = models.CharField(db_column='TenNut', blank=True, null=True)  # Field name made lowercase.
    vaitronguoiduyet = models.CharField(db_column='VaiTroNguoiDuyet', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    nhanvien = models.ForeignKey('Nhanvien', models.DO_NOTHING, blank=True, null=True)
    luongduyet = models.ForeignKey('DonbaoLuongduyet', models.DO_NOTHING, blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    thoigianxulytoida = models.FloatField(db_column='ThoiGianXuLyToiDa', blank=True, null=True)  # Field name made lowercase.
    hanhdongkhiquahan = models.CharField(db_column='HanhDongKhiQuaHan', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."DonBao_BuocQuyTrinhDuyet"'


class DonbaoDieukiencuabuocduyet(models.Model):
    id = models.BigAutoField(primary_key=True)
    cacbuocduyet = models.ForeignKey(DonbaoBuocchuyenquytrinh, models.DO_NOTHING, blank=True, null=True)
    nguondulieu = models.CharField(db_column='NguonDuLieu', blank=True, null=True)  # Field name made lowercase.
    truongdulieucankiemtra = models.CharField(db_column='TruongDuLieuCanKiemTra', blank=True, null=True)  # Field name made lowercase.
    toantusosanh = models.CharField(db_column='ToanTuSoSanh', blank=True, null=True)  # Field name made lowercase.
    giatrisosanh = models.CharField(db_column='GiaTriSoSanh', blank=True, null=True)  # Field name made lowercase.
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."DonBao_DieuKienCuaBuocDuyet"'
        db_table_comment = 'Trường NguonDuLieu Cố định 2 giá trị: - Thông tin người tạo đơn báo - Thông tin chi tiết đơn báo.'


class DonbaoLoaidonbao(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    tenloaidonbao = models.CharField(db_column='TenLoaiDonBao', blank=True, null=True)  # Field name made lowercase.
    maloaidonbao = models.CharField(db_column='MaLoaiDonBao', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    luongduyet = models.ForeignKey('DonbaoLuongduyet', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."DonBao_LoaiDonBao"'


class DonbaoLoaidonbaoTruongdulieu(models.Model):
    id = models.BigAutoField(primary_key=True)
    tentruong = models.CharField(db_column='TenTruong', blank=True, null=True)  # Field name made lowercase.
    matruong = models.CharField(db_column='MaTruong', blank=True, null=True)  # Field name made lowercase.
    kieudulieu = models.CharField(db_column='KieuDuLieu', blank=True, null=True)  # Field name made lowercase.
    cobatbuoc = models.BooleanField(db_column='CoBatBuoc', blank=True, null=True)  # Field name made lowercase.
    cauhinh = models.TextField(db_column='CauHinh', blank=True, null=True)  # Field name made lowercase. This field type is a guess.
    mota = models.TextField(db_column='MoTa', blank=True, null=True)  # Field name made lowercase.
    thutuhienthi = models.IntegerField(db_column='ThuTuHienThi', blank=True, null=True)  # Field name made lowercase.
    thamchieubang = models.CharField(db_column='ThamChieuBang', blank=True, null=True)  # Field name made lowercase.
    loaidonbao = models.ForeignKey(DonbaoLoaidonbao, models.DO_NOTHING, blank=True, null=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."DonBao_LoaiDonBao_TruongDuLieu"'


class DonbaoLuongduyet(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    tenluongduyet = models.CharField(db_column='TenLuongDuyet', blank=True, null=True)  # Field name made lowercase.
    maluongduyet = models.CharField(db_column='MaLuongDuyet', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."DonBao_LuongDuyet"'


class DonbaoNhatkypheduyet(models.Model):
    id = models.BigAutoField(primary_key=True)
    tenthututhuchien = models.CharField(db_column='TenThuTuThucHien', blank=True, null=True)  # Field name made lowercase.
    loaihanhdongduyet = models.CharField(db_column='LoaiHanhDongDuyet', blank=True, null=True)  # Field name made lowercase.
    nguoiduyet = models.ForeignKey('Nhanvien', models.DO_NOTHING, blank=True, null=True)
    trangthaicuadontruochanhdong = models.CharField(db_column='TrangThaiCuaDonTruocHanhDong', blank=True, null=True)  # Field name made lowercase.
    trangthaicuadonsauhanhdong = models.CharField(db_column='TrangThaiCuaDonSauHanhDong', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    thoidiemthuchien = models.DateTimeField(db_column='ThoiDiemThucHien', blank=True, null=True)  # Field name made lowercase.
    donbao = models.ForeignKey(Donbao, models.DO_NOTHING, blank=True, null=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."DonBao_NhatKyPheDuyet"'


class Hopdong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    mahopdong = models.CharField(db_column='MaHopDong', blank=True, null=True)  # Field name made lowercase.
    tenhopdong = models.CharField(db_column='TenHopDong', blank=True, null=True)  # Field name made lowercase.
    loaihopdong = models.CharField(db_column='LoaiHopDong', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."HopDong"'
        db_table_comment = 'Bảng chứa danh sách các hợp đồng của công ty'


class Khunggiolamviec(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    thoigianbatdau = models.TimeField(db_column='ThoiGianBatDau', blank=True, null=True)  # Field name made lowercase.
    thoigianketthuc = models.TimeField(db_column='ThoiGianKetThuc', blank=True, null=True)  # Field name made lowercase.
    congcuakhunggio = models.SmallIntegerField(db_column='CongCuaKhungGio', blank=True, null=True)  # Field name made lowercase.
    thoigianchophepdenmuon = models.FloatField(db_column='ThoiGianChoPhepDenMuon', blank=True, null=True)  # Field name made lowercase.
    thoigiandimuonkhongtinhchamcong = models.FloatField(db_column='ThoiGianDiMuonKhongTinhChamCong', blank=True, null=True)  # Field name made lowercase.
    thoigianchophepchamcongsomnhat = models.TimeField(db_column='ThoiGianChoPhepChamCongSomNhat', blank=True, null=True)  # Field name made lowercase.
    thoigianchophepvesomnhat = models.FloatField(db_column='ThoiGianChoPhepVeSomNhat', blank=True, null=True)  # Field name made lowercase.
    thoigianvesomkhongtinhchamcong = models.FloatField(db_column='ThoiGianVeSomKhongTinhChamCong', blank=True, null=True)  # Field name made lowercase.
    thoigianchophepvemuonnhat = models.TimeField(db_column='ThoiGianChoPhepVeMuonNhat', blank=True, null=True)  # Field name made lowercase.
    yeucauchamcong = models.BooleanField(db_column='YeuCauChamCong', blank=True, null=True)  # Field name made lowercase.
    thoigianlamviectoithieu = models.FloatField(db_column='ThoiGianLamViecToiThieu', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    calamviec = models.ForeignKey(Calamviec, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."KhungGioLamViec"'
        db_table_comment = 'Setup các khung giờ làm việc cho ca làm việc'


class Khunggionghitrua(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    giobatdau = models.TimeField(db_column='GioBatDau', blank=True, null=True)  # Field name made lowercase.
    gioketthuc = models.TimeField(db_column='GioKetThuc', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    calamviec = models.ForeignKey(Calamviec, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."KhungGioNghiTrua"'
        db_table_comment = 'Giờ nghỉ không tính là giờ làm việc'


class Kyluong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    thang = models.SmallIntegerField(db_column='Thang', blank=True, null=True)  # Field name made lowercase.
    ngaybatdau = models.DateField(db_column='NgayBatDau', blank=True, null=True)  # Field name made lowercase.
    ngayketthuc = models.DateField(db_column='NgayKetThuc', blank=True, null=True)  # Field name made lowercase.
    ngaychotluong = models.DateField(db_column='NgayChotLuong', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."KyLuong"'


class LamthemNhanvien(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    nhanvien = models.ForeignKey('Nhanvien', models.DO_NOTHING, blank=True, null=True)
    thietkelamthem = models.ForeignKey('Thietkelamthem', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."LamThem_NhanVien"'
        db_table_comment = 'Bảng này để kết nối bảng làm thêm với nhân viên để xác định các đối tượng được áp dụng'


class Lichlamviec(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    malichlamviec = models.CharField(db_column='MaLichLamViec', blank=True, null=True)  # Field name made lowercase.
    tenlichlamviec = models.CharField(db_column='TenLichLamViec', blank=True, null=True)  # Field name made lowercase.
    loaikichbanlamviec = models.CharField(db_column='LoaiKichBanLamViec', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    lichnghi = models.ForeignKey('Lichnghi', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."LichLamViec"'
        db_table_comment = 'Setup các lịch làm việc cho từng nhân viên, phòng ban'


class Lichlamviecthucte(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    ngaylamviec = models.DateField(db_column='NgayLamViec', blank=True, null=True)  # Field name made lowercase.
    cophaingaynghi = models.BooleanField(db_column='CoPhaiNgayNghi', blank=True, null=True)  # Field name made lowercase.
    chophepghide = models.BooleanField(db_column='ChoPhepGhiDe', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    calamviec = models.ForeignKey(Calamviec, models.DO_NOTHING, blank=True, null=True)
    nhanvien = models.ForeignKey('Nhanvien', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."LichLamViecThucTe"'
        db_table_comment = 'Lịch làm việc của từng người sau khi chạy logic'


class LichlamviecCodinh(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    ngaytrongtuan = models.IntegerField(db_column='NgayTrongTuan', blank=True, null=True)  # Field name made lowercase.
    caidatca = models.CharField(db_column='CaiDatCa', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    calamviec = models.ForeignKey(Calamviec, models.DO_NOTHING, blank=True, null=True)
    lichlamviec = models.ForeignKey(Lichlamviec, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."LichLamViec_CoDinh"'
        db_table_comment = 'Setup kịch bản lịch làm việc - cố định'


class LichlamviecLichtrinh(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    tenchuky = models.CharField(db_column='TenChuKy', blank=True, null=True)  # Field name made lowercase.
    machuky = models.CharField(db_column='MaChuKy', blank=True, null=True)  # Field name made lowercase.
    songaylap = models.IntegerField(db_column='SoNgayLap', blank=True, null=True)  # Field name made lowercase.
    ngaybatdauchuky = models.DateField(db_column='NgayBatDauChuKy', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    lichlamviec = models.ForeignKey(Lichlamviec, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."LichLamViec_LichTrinh"'
        db_table_comment = 'Setup kịch bản lịch làm việc - lịch trình'


class LichlamviecNhanvien(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    ngayapdung = models.DateTimeField(db_column='NgayApDung', blank=True, null=True)  # Field name made lowercase.
    ngayketthuc = models.DateTimeField(db_column='NgayKetThuc', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    lichlamviec = models.ForeignKey(Lichlamviec, models.DO_NOTHING, blank=True, null=True)
    nhanvien = models.ForeignKey('Nhanvien', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."LichLamViec_NhanVien"'
        db_table_comment = 'Đối tượng áp dụng lịch làm việc - nhân viên'


class LichlamviecPhongban(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    ngayapdung = models.DateTimeField(db_column='NgayApDung', blank=True, null=True)  # Field name made lowercase.
    ngayketthuc = models.DateTimeField(db_column='NgayKetThuc', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    lichlamviec = models.ForeignKey(Lichlamviec, models.DO_NOTHING, blank=True, null=True)
    phongban = models.ForeignKey('Phongban', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."LichLamViec_PhongBan"'
        db_table_comment = 'Đối tượng áp dụng lịch làm việc - Phòng ban'


class Lichnghi(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    malichnghi = models.CharField(db_column='MaLichNghi', blank=True, null=True)  # Field name made lowercase.
    tenlichnghi = models.CharField(db_column='TenLichNghi', blank=True, null=True)  # Field name made lowercase.
    loailichnghi = models.CharField(db_column='LoaiLichNghi', blank=True, null=True)  # Field name made lowercase.
    ngay = models.DateField(db_column='Ngay', blank=True, null=True)  # Field name made lowercase.
    loainghi = models.CharField(db_column='LoaiNghi', blank=True, null=True)  # Field name made lowercase.
    hesolamviec = models.FloatField(db_column='HeSoLamViec', blank=True, null=True)  # Field name made lowercase.
    apdungtinhluong = models.BooleanField(db_column='ApDungTinhLuong', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."LichNghi"'
        db_table_comment = 'Setup các mẫu lịch nghỉ (theo từng năm)'


class Lichsucongtac(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    batdau = models.DateField(db_column='BatDau', blank=True, null=True)  # Field name made lowercase.
    ketthuc = models.DateField(db_column='KetThuc', blank=True, null=True)  # Field name made lowercase.
    noicongtac = models.CharField(db_column='NoiCongTac', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    nhanvien = models.ForeignKey('Nhanvien', models.DO_NOTHING, blank=True, null=True)
    phongban = models.ForeignKey('Phongban', models.DO_NOTHING, blank=True, null=True)
    chucvu = models.ForeignKey(Chucvu, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."LichSuCongTac"'
        db_table_comment = 'Bảng này lưu lại thời gian làm việc công tác của các nhân viên trong công ty, và để chuyển từ phòng ban này sang phòng ban khác'


class Lichsuhopdong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    sohopdong = models.CharField(db_column='SoHopDong', blank=True, null=True)  # Field name made lowercase.
    filehopdong = models.CharField(db_column='FileHopDong', blank=True, null=True)  # Field name made lowercase.
    ngayhethan = models.DateField(db_column='NgayHetHan', blank=True, null=True)  # Field name made lowercase.
    ngaybatdau = models.DateField(db_column='NgayBatDau', blank=True, null=True)  # Field name made lowercase.
    ngaykyhopdong = models.DateField(db_column='NgayKyHopDong', blank=True, null=True)  # Field name made lowercase.
    luongcoban = models.FloatField(db_column='LuongCoBan', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    hopdong = models.ForeignKey(Hopdong, models.DO_NOTHING, blank=True, null=True)
    nhanvien = models.ForeignKey('Nhanvien', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."LichSuHopDong"'
        db_table_comment = 'Bảng này sẽ lưu lại lịch sử ký hợp đồng của nhân viên trong công ty. Và để từ thử việc -> chính thức sẽ ký 2 hợp đồng khác nhau'

class Loainhanvien(models.Model):
    id = models.BigAutoField(primary_key=True)
    maloainv = models.CharField(db_column='MaLoaiNV', blank=True, null=True)  # Field name made lowercase.
    tenloainv = models.CharField(db_column='TenLoaiNV', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'LoaiNhanVien'
        db_table_comment = 'Danh muc Loai Nhan vien'


class LoaingayapdungLamthem(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    loaingayapdung = models.CharField(db_column='LoaiNgayApDung', blank=True, null=True)  # Field name made lowercase.
    chopheplamthemgio = models.BooleanField(db_column='ChoPhepLamThemGio', blank=True, null=True)  # Field name made lowercase.
    cachthuctinh = models.CharField(db_column='CachThucTinh', blank=True, null=True)  # Field name made lowercase.
    nguongkhongtinhot = models.FloatField(db_column='NguongKhongTinhOT', blank=True, null=True)  # Field name made lowercase.
    khongtinhneuduoiphut = models.FloatField(db_column='KhongTinhNeuDuoiPhut', blank=True, null=True)  # Field name made lowercase.
    apdungnghigiuaca = models.BooleanField(db_column='ApDungNghiGiuaCa', blank=True, null=True)  # Field name made lowercase.
    batdaunghigiuaca = models.TimeField(db_column='BatDauNghiGiuaCa', blank=True, null=True)  # Field name made lowercase.
    ketthucnghigiuaca = models.TimeField(db_column='KetThucNghiGiuaCa', blank=True, null=True)  # Field name made lowercase.
    coquydoiluongthem = models.BooleanField(db_column='CoQuyDoiLuongThem', blank=True, null=True)  # Field name made lowercase.
    phantramluonglamthem = models.FloatField(db_column='PhanTramLuongLamThem', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    thietkelamthem = models.ForeignKey('Thietkelamthem', models.DO_NOTHING, blank=True, null=True)
    apdungcheckincheckout = models.BooleanField(db_column='ApDungCheckinCheckout', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."LoaiNgayApDung_LamThem"'
        db_table_comment = 'Bảng này để lưu lại cấu hình các loại ngày được áp dụng (Ngày làm việc, Ngày nghỉ, Ngày lễ) làm thêm cho một bản thiết kế làm thêm.'



class Nganhang(models.Model):
    id = models.BigAutoField(primary_key=True)
    manganhang = models.CharField(db_column='MaNganHang', blank=True, null=True)  # Field name made lowercase.
    tennganhang = models.CharField(db_column='TenNganHang', blank=True, null=True)  # Field name made lowercase.
    tenviettat = models.CharField(db_column='TenVietTat', blank=True, null=True)  # Field name made lowercase.
    diachichinhanh = models.CharField(db_column='DiaChiChiNhanh', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'NganHang'
        db_table_comment = 'Danh muc Ngan hang'



class Nhanvien(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    manhanvien = models.CharField(db_column='MaNhanVien', blank=True, null=True)  # Field name made lowercase.
    hovaten = models.CharField(db_column='HoVaTen', blank=True, null=True)  # Field name made lowercase.
    email = models.CharField(db_column='Email', blank=True, null=True)  # Field name made lowercase.
    sodienthoai = models.CharField(db_column='SoDienThoai', blank=True, null=True)  # Field name made lowercase.
    diachi = models.TextField(db_column='DiaChi', blank=True, null=True)  # Field name made lowercase.
    gioitinh = models.CharField(db_column='GioiTinh', blank=True, null=True)  # Field name made lowercase.
    ngaysinh = models.DateField(db_column='NgaySinh', blank=True, null=True)  # Field name made lowercase.
    socccd = models.CharField(db_column='SoCCCD', blank=True, null=True)  # Field name made lowercase.
    ngayvaolam = models.DateField(db_column='NgayVaoLam', blank=True, null=True)  # Field name made lowercase.
    loainv = models.ForeignKey(Loainhanvien, models.DO_NOTHING, blank=True, null=True)
    trangthainv = models.CharField(db_column='TrangThaiNV', blank=True, null=True)  # Field name made lowercase.
    nganhang = models.ForeignKey(Nganhang, models.DO_NOTHING, blank=True, null=True)
    sotknganhang = models.CharField(db_column='SoTKNganHang', blank=True, null=True)  # Field name made lowercase.
    tentknganhang = models.CharField(db_column='TenTKNganHang', blank=True, null=True)  # Field name made lowercase.
    masothue = models.CharField(db_column='MaSoThue', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    user_id = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."NhanVien"'
        db_table_comment = 'Bảng chứa danh sách nhân viên của các phòng ban trong một công ty'


class NhanvienChedoluong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    chedoluong = models.ForeignKey(Chedoluong, models.DO_NOTHING, blank=True, null=True)
    nhanvien = models.ForeignKey(Nhanvien, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."NhanVien_CheDoLuong"'
        db_table_comment = 'Đây là bảng cấu hình đối tượng áp dụng chế độ lương cho cá nhân nhân viên nào'


class Nhomphantuluong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    tennhom = models.CharField(db_column='TenNhom', blank=True, null=True)  # Field name made lowercase.
    manhom = models.CharField(db_column='MaNhom', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."NhomPhanTuLuong"'
        db_table_comment = 'Bảng tổng hợp các nhóm phần tử lương'


class Phantuluong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    tenphantu = models.CharField(db_column='TenPhanTu', blank=True, null=True)  # Field name made lowercase.
    maphantu = models.CharField(db_column='MaPhanTu', blank=True, null=True)  # Field name made lowercase.
    loaiphantu = models.CharField(db_column='LoaiPhanTu', blank=True, null=True)  # Field name made lowercase.
    mota = models.TextField(db_column='MoTa', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    nhomphantu = models.ForeignKey(Nhomphantuluong, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."PhanTuLuong"'


class Phieuluong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    tenphieuluong = models.CharField(db_column='TenPhieuLuong', blank=True, null=True)  # Field name made lowercase.
    maphieuluong = models.CharField(db_column='MaPhieuLuong', blank=True, null=True)  # Field name made lowercase.
    ngayphathanh = models.DateField(db_column='NgayPhatHanh', blank=True, null=True)  # Field name made lowercase.
    tennhanvien = models.CharField(db_column='TenNhanVien', blank=True, null=True)  # Field name made lowercase.
    tenphongban = models.CharField(db_column='TenPhongBan', blank=True, null=True)  # Field name made lowercase.
    tenchucvu = models.CharField(db_column='TenChucVu', blank=True, null=True)  # Field name made lowercase.
    tongthunhap = models.FloatField(db_column='TongThuNhap', blank=True, null=True)  # Field name made lowercase.
    tongkhautru = models.FloatField(db_column='TongKhauTru', blank=True, null=True)  # Field name made lowercase.
    tongthunhapchiuthue = models.FloatField(db_column='TongThuNhapChiuThue', blank=True, null=True)  # Field name made lowercase.
    tongtiendongbaohiem = models.FloatField(db_column='TongTienDongBaoHiem', blank=True, null=True)  # Field name made lowercase.
    sotienthuetncn = models.FloatField(db_column='SoTienThueTNCN', blank=True, null=True)  # Field name made lowercase.
    ngaychamcong = models.TextField(db_column='NgayChamCong', blank=True, null=True)  # Field name made lowercase. This field type is a guess.
    luongthuclinh = models.FloatField(db_column='LuongThucLinh', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    nhanvien = models.ForeignKey(Nhanvien, models.DO_NOTHING, blank=True, null=True)
    bangluong = models.ForeignKey(Bangluong, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."PhieuLuong"'


class Phongban(models.Model):
    id = models.BigAutoField(primary_key=True)
    maphongban = models.CharField(db_column='MaPhongBan', blank=True, null=True)  # Field name made lowercase.
    tenphongban = models.CharField(db_column='TenPhongBan', blank=True, null=True)  # Field name made lowercase.
    level = models.IntegerField(db_column='Level', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    congty = models.ForeignKey(Congty, models.DO_NOTHING, blank=True, null=True)
    phongbancha_id = models.BigIntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."PhongBan"'
        db_table_comment = 'Bảng chứa các phòng ban con trong một công ty'


class PhongbanChedoluong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    chedoluong = models.ForeignKey(Chedoluong, models.DO_NOTHING, blank=True, null=True)
    phongban = models.ForeignKey(Phongban, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."PhongBan_CheDoLuong"'
        db_table_comment = 'Bảng này sẽ cấu hình liên kết xem với chế độ lương nào áp dụng cho đối tượng phòng ban nào'


class Quynghi(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    maquynghi = models.CharField(db_column='MaQuyNghi', blank=True, null=True)  # Field name made lowercase.
    tenquynghi = models.CharField(db_column='TenQuyNghi', blank=True, null=True)  # Field name made lowercase.
    tinhcongchongaynghi = models.BooleanField(db_column='TinhCongChoNgayNghi', blank=True, null=True)  # Field name made lowercase.
    loaingaynghiapdung = models.CharField(db_column='LoaiNgayNghiApDung', blank=True, null=True)  # Field name made lowercase.
    ngayphathanhquynghi = models.DateField(db_column='NgayPhatHanhQuyNghi', blank=True, null=True)  # Field name made lowercase.
    donvingayphathanh = models.CharField(db_column='DonViNgayPhatHanh', blank=True, null=True)  # Field name made lowercase.
    gioihannvtheothamnien = models.BooleanField(db_column='GioiHanNVTheoThamNien', blank=True, null=True)  # Field name made lowercase.
    thoigiangioihantheothamnien = models.FloatField(db_column='ThoiGianGioiHanTheoThamNien', blank=True, null=True)  # Field name made lowercase.
    gioihanngaynghi = models.BooleanField(db_column='GioiHanNgayNghi', blank=True, null=True)  # Field name made lowercase.
    donviquynghi = models.CharField(db_column='DonViQuyNghi', blank=True, null=True)  # Field name made lowercase.
    phanbongaynghitylethuanthamnien = models.BooleanField(db_column='PhanBoNgayNghiTyLeThuanThamNien', blank=True, null=True)  # Field name made lowercase.
    kyapdung = models.CharField(db_column='KyApDung', blank=True, null=True)  # Field name made lowercase.
    loaiquydinhngaynghi = models.CharField(db_column='LoaiQuyDinhNgayNghi', blank=True, null=True)  # Field name made lowercase.
    congdonngaynghiquanam = models.BooleanField(db_column='CongDonNgayNghiQuaNam', blank=True, null=True)  # Field name made lowercase.
    songaytoidacongdonquanamsau = models.FloatField(db_column='SoNgayToiDaCongDonQuaNamSau', blank=True, null=True)  # Field name made lowercase.
    thoigianapdunsodu = models.FloatField(db_column='ThoiGianApDungSoDu', blank=True, null=True)  # Field name made lowercase.
    quydoingaynghithanhtien = models.BooleanField(db_column='QuyDoiNgayNghiThanhTien', blank=True, null=True)  # Field name made lowercase.
    songaytoidaduocquydoi = models.FloatField(db_column='SoNgayToiDaDuocQuyDoi', blank=True, null=True)  # Field name made lowercase.
    loaiquydoingaynghi = models.CharField(db_column='LoaiQuyDoiNgayNghi', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."QuyNghi"'
        db_table_comment = 'Quy nghỉ là nơi thiết lập số lượng ngày nghỉ cho nhân viên, thiết lập ai được sử dụng loại ngày nghỉ nào, sử dụng trong bao lâu'


class QuynghiNhanvien(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    nhanvien = models.ForeignKey(Nhanvien, models.DO_NOTHING, blank=True, null=True)
    quynghi = models.ForeignKey(Quynghi, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."QuyNghi_NhanVien"'
        db_table_comment = 'Đối tượng áp dụng quy nghỉ _ Nhân viên'


class QuynghiTheothamnien(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    namthamnien = models.FloatField(db_column='NamThamNien', blank=True, null=True)  # Field name made lowercase.
    songaynghiduoccap = models.FloatField(db_column='SoNgayNghiDuocCap', blank=True, null=True)  # Field name made lowercase.
    sonamthamnientinhtien = models.FloatField(db_column='SoNamThamNienTinhTien', blank=True, null=True)  # Field name made lowercase.
    songaynghituongungcongthem = models.FloatField(db_column='SoNgayNghiTuongUngCongThem', blank=True, null=True)  # Field name made lowercase.
    quynghi = models.ForeignKey(Quynghi, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."QuyNghi_TheoThamNien"'
        db_table_comment = 'Xử lý các trường hợp khi chọn quy định tách lẻ'


class Quytacchedoluong(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    tenquytac = models.CharField(db_column='TenQuyTac', blank=True, null=True)  # Field name made lowercase.
    maquytac = models.CharField(db_column='MaQuyTac', blank=True, null=True)  # Field name made lowercase.
    bieuthuctinhtoan = models.CharField(db_column='BieuThucTinhToan', blank=True, null=True)  # Field name made lowercase.
    mota = models.TextField(db_column='MoTa', blank=True, null=True)  # Field name made lowercase.
    nguondulieu = models.CharField(db_column='NguonDuLieu', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    chedoluong = models.ForeignKey(Chedoluong, models.DO_NOTHING, blank=True, null=True)
    phantuluong = models.ForeignKey(Phantuluong, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."QuyTacCheDoLuong"'
        db_table_comment = 'Bảng này sẽ chứa logic kết nối giữa bảng Chế độ lương & các phần tử lương, đồng thời setup công thức tính cho các phần tử lương'


class Sodungaynghiphep(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    songayduoccap = models.FloatField(db_column='SoNgayDuocCap', blank=True, null=True)  # Field name made lowercase.
    songaydasudung = models.FloatField(db_column='SoNgayDaSuDung', blank=True, null=True)  # Field name made lowercase.
    songayduocchuyentunamtruoc = models.FloatField(db_column='SoNgayDuocChuyenTuNamTruoc', blank=True, null=True)  # Field name made lowercase.
    songaydieuchinh = models.FloatField(db_column='SoNgayDieuChinh', blank=True, null=True)  # Field name made lowercase.
    namapdung = models.FloatField(db_column='NamApDung', blank=True, null=True)  # Field name made lowercase.
    thoigiantinhtoancuoicung = models.FloatField(db_column='ThoiGianTinhToanCuoiCung', blank=True, null=True)  # Field name made lowercase.
    quynghi = models.ForeignKey(Quynghi, models.DO_NOTHING, blank=True, null=True)
    nhanvien = models.ForeignKey(Nhanvien, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"hrm"."SoDuNgayNghiPhep"'
        db_table_comment = 'Ghi lại lịch sử sử dụng ngày nghỉ của nhân viên, và số dư còn lại'


class Thietkelamthem(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    cogioihanthoigian = models.BooleanField(db_column='CoGioiHanThoiGian', blank=True, null=True)  # Field name made lowercase.
    gioihangiongay = models.IntegerField(db_column='GioiHanGioNgay', blank=True, null=True)  # Field name made lowercase.
    gioihangiotuan = models.IntegerField(db_column='GioiHanGioTuan', blank=True, null=True)  # Field name made lowercase.
    gioihangiothang = models.IntegerField(db_column='GioiHanGioThang', blank=True, null=True)  # Field name made lowercase.
    gioihangionam = models.IntegerField(db_column='GioiHanGioNam', blank=True, null=True)  # Field name made lowercase.
    cogioihanngay = models.BooleanField(db_column='CoGioiHanNgay', blank=True, null=True)  # Field name made lowercase.
    cogioihantuan = models.BooleanField(db_column='CoGioiHanTuan', blank=True, null=True)  # Field name made lowercase.
    cogioihanthang = models.BooleanField(db_column='CoGioiHanThang', blank=True, null=True)  # Field name made lowercase.
    cogioihannam = models.BooleanField(db_column='CoGioiHanNam', blank=True, null=True)  # Field name made lowercase.
    trangthai = models.CharField(db_column='TrangThai', blank=True, null=True)  # Field name made lowercase.
    updated_at = models.DateTimeField(blank=True, null=True)
    mathietke = models.CharField(db_column='MaThietKe', blank=True, null=True)  # Field name made lowercase.
    tenthietke = models.CharField(db_column='TenThietKe', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."ThietKeLamThem"'
        db_table_comment = 'Bảng này để lưu lại các bản thiết kế làm thêm.'


class Thietlapsolieucodinh(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)
    nhanvien = models.ForeignKey(Nhanvien, models.DO_NOTHING, blank=True, null=True)
    phantuluong = models.ForeignKey(Phantuluong, models.DO_NOTHING, blank=True, null=True)
    giatrimacdinh = models.FloatField(db_column='GiaTriMacDinh', blank=True, null=True)  # Field name made lowercase.
    ghichu = models.TextField(db_column='GhiChu', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = '"hrm"."ThietLapSoLieuCoDinh"'
        db_table_comment = 'Thiết lập số liệu cố định cho những tham số tính lương cho từng nhân viên khác nhau'
