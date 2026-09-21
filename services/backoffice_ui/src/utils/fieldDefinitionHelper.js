/**
 * Field Definition & Dictionary Inference Helper
 * Provides automatic contextual descriptions and data type detection
 * for database columns and API response fields (KPK, Dukcapil, BPN, Korlantas, Finance domains).
 */

const KNOWN_FIELD_DICTIONARY = {
  // Identitas & Kependudukan (Dukcapil)
  'nik': 'Nomor Induk Kependudukan (NIK) resmi 16 digit',
  'no_ktp': 'Nomor KTP / NIK resmi 16 digit',
  'nama_lgkp': 'Nama lengkap individu / subjek kependudukan',
  'nama_lengkap': 'Nama lengkap subjek',
  'nama': 'Nama subjek / entitas',
  'full_name': 'Nama lengkap subjek',
  'name': 'Nama subjek / entitas',
  'tempat_lahir': 'Tempat lahir subjek',
  'tmpt_lhr': 'Tempat lahir subjek',
  'tmp_lahir': 'Tempat lahir subjek',
  'pob': 'Tempat lahir (Place of Birth)',
  'tgl_lahir': 'Tanggal lahir subjek (Format YYYY-MM-DD)',
  'tanggal_lahir': 'Tanggal lahir subjek (Format YYYY-MM-DD)',
  'tgl_lhr': 'Tanggal lahir subjek (Format YYYY-MM-DD)',
  'dob': 'Tanggal lahir subjek (Date of Birth)',
  'jenis_kelamin': 'Jenis kelamin (L=Laki-laki, P=Perempuan)',
  'jk': 'Jenis kelamin (L=Laki-laki, P=Perempuan)',
  'gender': 'Jenis kelamin subjek',
  'sex': 'Jenis kelamin subjek',
  'agama': 'Agama atau kepercayaan yang dianut',
  'religion': 'Agama atau keyakinan subjek',
  'status_perkawinan': 'Status perkawinan (1=Belum Kawin, 2=Kawin, 3=Cerai Hidup, 4=Cerai Mati)',
  'status_kawin': 'Status perkawinan subjek',
  'stat_kawin': 'Status perkawinan subjek',
  'marital_status': 'Status perkawinan subjek',
  'pekerjaan': 'Jenis profesi atau mata pencaharian resmi',
  'jenis_pekerjaan': 'Jenis profesi atau mata pencaharian',
  'pekerjaan_nama': 'Nama profesi / pekerjaan',
  'occupation': 'Profesi atau pekerjaan',
  'pendidikan': 'Jenjang pendidikan terakhir yang ditempuh',
  'pendidikan_akhir': 'Jenjang pendidikan terakhir',
  'education': 'Tingkat pendidikan terakhir',
  'gol_darah': 'Golongan darah subjek (A, B, AB, O)',
  'golongan_darah': 'Golongan darah subjek (A, B, AB, O)',
  'blood_type': 'Golongan darah subjek',
  'nama_ibu': 'Nama lengkap ibu kandung subjek',
  'nama_lgkp_ibu': 'Nama lengkap ibu kandung subjek',
  'ibu_kandung': 'Nama lengkap ibu kandung subjek',
  'nama_ayah': 'Nama lengkap ayah kandung subjek',
  'nama_lgkp_ayah': 'Nama lengkap ayah kandung subjek',
  'ayah_kandung': 'Nama lengkap ayah kandung subjek',
  'no_kk': 'Nomor Kartu Keluarga (KK) resmi 16 digit',
  'nomor_kk': 'Nomor Kartu Keluarga (KK) resmi 16 digit',
  'kartu_keluarga': 'Nomor Kartu Keluarga (KK)',
  'hub_keluarga': 'Status hubungan dalam susunan keluarga',
  'status_hub_keluarga': 'Status hubungan dalam susunan keluarga (Kepala Keluarga, Istri, Anak)',
  'kewarganegaraan': 'Kewarganegaraan subjek (WNI / WNA)',
  'nationality': 'Kewarganegaraan subjek',

  // Alamat & Wilayah
  'alamat': 'Alamat tempat tinggal / domisili lengkap',
  'alamat_lengkap': 'Alamat tempat tinggal / domisili lengkap',
  'alamat_domisili': 'Alamat domisili tempat tinggal',
  'address': 'Alamat domisili atau kantor',
  'no_rt': 'Nomor Rukun Tetangga (RT)',
  'rt': 'Nomor Rukun Tetangga (RT)',
  'no_rw': 'Nomor Rukun Warga (RW)',
  'rw': 'Nomor Rukun Warga (RW)',
  'kelurahan': 'Nama kelurahan / desa wilayah',
  'nama_kelurahan': 'Nama kelurahan / desa wilayah',
  'kel_nama': 'Nama kelurahan / desa wilayah',
  'kel': 'Nama kelurahan / desa',
  'desa': 'Nama desa wilayah administrasi',
  'kecamatan': 'Nama kecamatan wilayah',
  'nama_kecamatan': 'Nama kecamatan wilayah',
  'kec_nama': 'Nama kecamatan wilayah',
  'kec': 'Nama kecamatan wilayah',
  'kabupaten': 'Nama kabupaten / kota administrasi',
  'nama_kabupaten': 'Nama kabupaten / kota administrasi',
  'kab': 'Nama kabupaten administrasi',
  'kota': 'Nama kota administrasi wilayah',
  'kab_kota': 'Nama kabupaten atau kota administrasi',
  'provinsi': 'Nama provinsi wilayah administrasi',
  'nama_provinsi': 'Nama provinsi wilayah administrasi',
  'propinsi': 'Nama provinsi wilayah administrasi',
  'prov_nama': 'Nama provinsi wilayah administrasi',
  'kode_pos': 'Kode pos wilayah pengiriman 5 digit',
  'kodepos': 'Kode pos wilayah pengiriman 5 digit',
  'postal_code': 'Kode pos wilayah',
  'zip': 'Kode pos wilayah',
  'dusun': 'Nama dusun / kampung',
  'latitude': 'Titik koordinat lintang geografis (Latitude)',
  'lat': 'Titik koordinat lintang geografis (Latitude)',
  'longitude': 'Titik koordinat bujur geografis (Longitude)',
  'lng': 'Titik koordinat bujur geografis (Longitude)',
  'long': 'Titik koordinat bujur geografis (Longitude)',

  // Kontak
  'email': 'Alamat email resmi / kontak surat elektronik',
  'email_address': 'Alamat email resmi kontak',
  'surel': 'Alamat surat elektronik resmi',
  'no_hp': 'Nomor telepon seluler / WhatsApp aktif',
  'nohp': 'Nomor telepon seluler / WhatsApp aktif',
  'phone': 'Nomor telepon kontak',
  'telepon': 'Nomor telepon kontak resmi',
  'no_telp': 'Nomor telepon kontak resmi',
  'handphone': 'Nomor telepon seluler aktif',
  'mobile': 'Nomor telepon seluler aktif',
  'fax': 'Nomor faksimili kantor',
  'no_fax': 'Nomor faksimili kantor',
  'website': 'Alamat situs web resmi (URL)',
  'url': 'Tautan alamat web / URL',

  // Pertanahan & Properti (BPN / Agraria)
  'no_hak': 'Nomor hak kepemilikan tanah pada sertifikat BPN',
  'nomor_hak': 'Nomor hak kepemilikan tanah pada sertifikat BPN',
  'no_sertifikat': 'Nomor sertifikat kepemilikan tanah BPN',
  'nomor_sertifikat': 'Nomor sertifikat kepemilikan tanah BPN',
  'nib': 'Nomor Identifikasi Bidang (NIB) pertanahan BPN',
  'nomor_identifikasi_bidang': 'Nomor Identifikasi Bidang (NIB) pertanahan BPN',
  'jenis_hak': 'Jenis hak atas tanah (1=Hak Milik/SHM, 2=HGB, 3=Hak Pakai)',
  'tipe_hak': 'Jenis hak atas tanah (SHM, HGB, Hak Pakai)',
  'luas_tanah': 'Luas bidang tanah dalam meter persegi (m²)',
  'luas_bumi': 'Luas bumi / tanah dalam meter persegi (m²)',
  'luas': 'Luas ukuran dalam meter persegi (m²)',
  'luas_bangunan': 'Luas fisik bangunan properti dalam meter persegi (m²)',
  'letak_tanah': 'Letak atau lokasi fisik bidang tanah objek',
  'lokasi_tanah': 'Lokasi bidang tanah objek',
  'pemilik': 'Nama pemegang hak atau pemilik terdaftar',
  'nama_pemilik': 'Nama pemegang hak atau pemilik terdaftar',
  'pemegang_hak': 'Nama pemilik atau pemegang hak terdaftar sertifikat',
  'njop': 'Nilai Jual Objek Pajak (NJOP) properti',
  'nilai_njop': 'Nilai Jual Objek Pajak (NJOP) properti',
  'tgl_terbit': 'Tanggal resmi penerbitan buku tanah / sertifikat',
  'tgl_sertifikat': 'Tanggal resmi sertifikat diterbitkan',

  // Kendaraan Bermotor (Korlantas / Samsat)
  'nopol': 'Nomor registrasi polisi kendaraan bermotor',
  'no_polisi': 'Nomor polisi kendaraan bermotor',
  'plat_nomor': 'Nomor plat registrasi polisi kendaraan bermotor',
  'nomor_plat': 'Nomor plat registrasi polisi kendaraan bermotor',
  'license_plate': 'Nomor registrasi plat kendaraan bermotor',
  'no_rangka': 'Nomor rangka kendaraan bermotor (VIN)',
  'vin': 'Nomor rangka kendaraan bermotor (Vehicle Identification Number)',
  'chassis_no': 'Nomor rangka kendaraan bermotor',
  'no_mesin': 'Nomor mesin kendaraan bermotor',
  'engine_no': 'Nomor mesin kendaraan bermotor',
  'no_bpkb': 'Nomor Buku Pemilik Kendaraan Bermotor (BPKB)',
  'nomor_bpkb': 'Nomor Buku Pemilik Kendaraan Bermotor (BPKB)',
  'merk': 'Merek pabrikan kendaraan bermotor',
  'merek': 'Merek pabrikan kendaraan bermotor',
  'brand': 'Merek pabrikan kendaraan',
  'tipe': 'Tipe atau model kendaraan bermotor',
  'model': 'Model seri kendaraan bermotor',
  'tahun_pembuatan': 'Tahun pembuatan / perakitan kendaraan',
  'tahun_rakit': 'Tahun perakitan kendaraan bermotor',
  'tahun': 'Tahun perolehan / pembuatan',
  'year': 'Tahun rekaman data',
  'warna': 'Warna fisik kendaraan sesuai STNK',
  'warna_kendaraan': 'Warna fisik kendaraan bermotor',
  'color': 'Warna fisik kendaraan',
  'isi_silinder': 'Kapasitas silinder mesin kendaraan (CC)',
  'cc': 'Kapasitas silinder mesin kendaraan (CC)',
  'bahan_bakar': 'Jenis bahan bakar kendaraan (Bensin, Solar, Listrik)',
  'fuel': 'Jenis bahan bakar kendaraan',

  // Keuangan, Perbankan & Pajak
  'npwp': 'Nomor Pokok Wajib Pajak (NPWP)',
  'nomor_npwp': 'Nomor Pokok Wajib Pajak (NPWP)',
  'npwp16': 'Nomor Pokok Wajib Pajak format baru 16 digit',
  'no_rekening': 'Nomor rekening perbankan nasabah',
  'norek': 'Nomor rekening perbankan nasabah',
  'nomor_rekening': 'Nomor rekening perbankan nasabah',
  'account_no': 'Nomor rekening perbankan nasabah',
  'account_number': 'Nomor rekening perbankan nasabah',
  'nama_bank': 'Nama institusi perbankan resmi',
  'bank': 'Nama institusi perbankan',
  'bank_name': 'Nama institusi perbankan resmi',
  'cabang': 'Kantor cabang bank penerbit rekening',
  'nama_cabang': 'Nama kantor cabang perbankan',
  'branch': 'Kantor cabang perbankan',
  'saldo': 'Nominal saldo dana aktif pada rekening',
  'balance': 'Nominal saldo dana aktif',
  'current_balance': 'Nominal saldo dana aktif terkini',
  'nominal': 'Nilai nominal uang / jumlah transaksi finansial',
  'amount': 'Nilai nominal uang / jumlah transaksi finansial',
  'nilai': 'Nilai besaran angka atau nominal transaksi',
  'total': 'Total keseluruhan akumulasi nilai',
  'harga': 'Besaran harga atau nilai transaksi',
  'price': 'Besaran harga transaksi',
  'kredit': 'Nominal mutasi kredit (dana masuk)',
  'credit': 'Nominal mutasi kredit (dana masuk)',
  'debet': 'Nominal mutasi debit (dana keluar)',
  'debit': 'Nominal mutasi debit (dana keluar)',
  'mata_uang': 'Mata uang transaksi (IDR, USD, EUR)',
  'currency': 'Mata uang transaksi finansial',
  'gaji': 'Besaran gaji pokok / pendapatan bulanan',
  'salary': 'Besaran gaji / pendapatan',
  'penghasilan': 'Besaran total pendapatan / penghasilan',
  'income': 'Besaran total penghasilan',
  'tunjangan': 'Besaran tunjangan resmi',

  // Korporasi & Pengadaan (SIKAP / LKPP / AHU)
  'nama_perusahaan': 'Nama resmi perusahaan atau badan hukum',
  'nama_pt': 'Nama badan hukum Perseroan Terbatas (PT)',
  'nama_cv': 'Nama badan usaha CV',
  'company_name': 'Nama resmi perusahaan / badan hukum',
  'bentuk_usaha': 'Bentuk badan usaha (PT, CV, Koperasi, Firma)',
  'badan_usaha': 'Bentuk badan usaha (PT, CV, Koperasi, dll)',
  'kbli': 'Kode Klasifikasi Baku Lapangan Usaha Indonesia (KBLI)',
  'status_kbli': 'Status izin KBLI bidang usaha',
  'bidang_usaha': 'Uraian sektor bidang usaha perusahaan',
  'modal_dasar': 'Nominal modal dasar pendirian perusahaan',
  'modal_disetor': 'Nominal modal disetor resmi perusahaan',
  'direktur': 'Nama direktur atau pimpinan utama perusahaan',
  'pengurus': 'Daftar pengurus organ manajemen perusahaan',
  'komisaris': 'Nama dewan komisaris pengawas perusahaan',
  'pemegang_saham': 'Daftar pemilik atau pemegang saham perusahaan',
  'saham': 'Daftar kepemilikan saham perusahaan',

  // Sistem, Autentikasi & Metadata
  'id': 'Identifier unik rekaman data (Primary Key ID)',
  'uuid': 'Pengenal unik universal rekaman data (UUID)',
  'guid': 'Pengenal unik global rekaman data (GUID)',
  'username': 'Nama akun pengguna untuk autentikasi sistem',
  'user_name': 'Nama akun pengguna untuk autentikasi',
  'password': 'Kata sandi akun terenkripsi (keamanan)',
  'hashed_password': 'Hash kata sandi akun terenkripsi',
  'role': 'Peran atau hak akses otorisasi pengguna sistem',
  'role_name': 'Nama peran / hak akses otorisasi pengguna',
  'role_id': 'ID referensi peran otorisasi pengguna',
  'is_active': 'Status keaktifan rekaman (1=Aktif, 0=Tidak Aktif)',
  'aktif': 'Status keaktifan rekaman (1=Aktif, 0=Tidak Aktif)',
  'active': 'Status keaktifan rekaman (1=Aktif, 0=Tidak Aktif)',
  'enabled': 'Status ketersediaan / keaktifan (1=Aktif, 0=Nonaktif)',
  'is_deleted': 'Penanda status penghapusan data (soft delete)',
  'deleted': 'Penanda status penghapusan data (soft delete)',
  'status': 'Kode atau keterangan status operasional rekaman',
  'kd_status': 'Kode status kondisi rekaman data',
  'status_code': 'Kode status operasional',
  'state': 'Kondisi status rekaman data',
  'created_at': 'Waktu rekaman data pertama kali dibuat di sistem',
  'tgl_buat': 'Tanggal rekaman data dibuat di sistem',
  'tgl_dibuat': 'Tanggal rekaman data dibuat di sistem',
  'insert_time': 'Waktu pencatatan data ke sistem',
  'updated_at': 'Waktu rekaman data terakhir kali diperbarui',
  'tgl_ubah': 'Tanggal perubahan rekaman data terakhir',
  'tgl_diubah': 'Tanggal perubahan rekaman data terakhir',
  'update_time': 'Waktu pembaruan rekaman data terakhir',
  'modified_at': 'Waktu rekaman data terakhir dimodifikasi',
  'created_by': 'ID atau nama pengguna pembuat rekaman data',
  'creator': 'Pengguna yang membuat rekaman data',
  'updated_by': 'ID atau nama pengguna pembaru rekaman data',
  'modifier': 'Pengguna yang memperbarui rekaman data',
  'user_id': 'ID referensi pengguna sistem yang bersangkutan',
  'keterangan': 'Keterangan atau uraian catatan penjelasan tambahan',
  'deskripsi': 'Uraian deskripsi atau penjelasan data',
  'description': 'Uraian deskripsi atau penjelasan data',
  'notes': 'Catatan atau memo tambahan rekaman data',
  'catatan': 'Catatan atau keterangan tambahan',
  'remark': 'Keterangan atau catatan tambahan',
  'foto': 'Berkas foto, avatar citra, atau data gambar base64',
  'photo': 'Berkas foto atau gambar profil subjek',
  'image': 'Berkas gambar atau foto visual',
  'avatar': 'Gambar foto profil atau avatar pengguna',
  'gambar': 'Data gambar visual atau citra dokumen'
};

/**
 * Normalizes a field key name into a friendly title
 * e.g. "nama_lengkap_ibu" -> "Nama Lengkap Ibu"
 */
export function toReadableTitle(name) {
  if (!name) return '';
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .map(word => {
      const lower = word.toLowerCase();
      // Expand standard Indonesian technical abbreviations
      const abbrevs = {
        'nik': 'NIK',
        'ktp': 'KTP',
        'kk': 'KK',
        'npwp': 'NPWP',
        'bpkb': 'BPKB',
        'stnk': 'STNK',
        'sim': 'SIM',
        'nib': 'NIB',
        'shm': 'SHM',
        'hgb': 'HGB',
        'pt': 'PT',
        'cv': 'CV',
        'kbli': 'KBLI',
        'rt': 'RT',
        'rw': 'RW',
        'id': 'ID',
        'cd': 'Kode',
        'kd': 'Kode',
        'tgl': 'Tanggal',
        'no': 'Nomor',
        'jml': 'Jumlah',
        'jk': 'Jenis Kelamin',
        'thn': 'Tahun',
        'bln': 'Bulan',
        'hr': 'Hari'
      };
      if (abbrevs[lower]) return abbrevs[lower];
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Infers an appropriate Indonesian definition / description for a given field
 * to help AI understand its semantic meaning accurately.
 *
 * @param {string} fieldName - The raw key / column name (e.g. 'kd_status', 'nik')
 * @param {string} inferredType - Inferred data type ('string', 'integer', 'number', 'date', 'boolean', 'array', 'object')
 * @param {*} sampleValue - Sample value from database / API test result
 * @returns {string} Suggested initial definition for AI
 */
export function inferFieldDescription(fieldName, inferredType = 'string', sampleValue = null) {
  if (!fieldName || typeof fieldName !== 'string') return '';

  const cleanKey = fieldName.toLowerCase().trim();

  // 1. Direct dictionary lookup
  if (KNOWN_FIELD_DICTIONARY[cleanKey]) {
    return KNOWN_FIELD_DICTIONARY[cleanKey];
  }

  // 2. Normalized key check (without surrounding prefixes/suffixes)
  const strippedKey = cleanKey.replace(/^tbl_|^col_|^fld_|_col$|_val$/, '');
  if (KNOWN_FIELD_DICTIONARY[strippedKey]) {
    return KNOWN_FIELD_DICTIONARY[strippedKey];
  }

  const title = toReadableTitle(cleanKey);

  // 3. Rule-based pattern matching (Prefixes, Suffixes & Keywords)
  if (cleanKey.startsWith('kd_') || cleanKey.startsWith('kode_') || cleanKey.startsWith('code_')) {
    return `Kode identifikasi klasifikasi ${title}`;
  }
  if (cleanKey.startsWith('no_') || cleanKey.startsWith('nomor_') || cleanKey.endsWith('_no')) {
    return `Nomor referensi resmi ${title}`;
  }
  if (cleanKey.startsWith('tgl_') || cleanKey.startsWith('tanggal_') || cleanKey.endsWith('_tgl') || cleanKey.endsWith('_date') || inferredType === 'date') {
    return `Tanggal dan waktu pelaksanaan ${title} (Format tanggal/waktu)`;
  }
  if (cleanKey.startsWith('jml_') || cleanKey.startsWith('jumlah_') || cleanKey.endsWith('_qty') || cleanKey.endsWith('_count')) {
    return `Jumlah akumulasi kuantitas ${title}`;
  }
  if (cleanKey.startsWith('is_') || cleanKey.startsWith('has_') || cleanKey.startsWith('fl_') || inferredType === 'boolean') {
    return `Indikator penanda status boolean (1=Ya/Aktif, 0=Tidak) untuk ${title}`;
  }
  if (cleanKey.endsWith('_id') || cleanKey.startsWith('id_')) {
    return `Kode pengenal unik / relasi ID untuk ${title}`;
  }
  if (cleanKey.endsWith('_cd') || cleanKey.endsWith('_code')) {
    return `Kode klasifikasi status ${title}`;
  }
  if (cleanKey.includes('status')) {
    return `Kondisi atau status operasional ${title}`;
  }
  if (cleanKey.includes('total') || cleanKey.includes('subtotal')) {
    return `Total akumulasi perhitungan ${title}`;
  }
  if (cleanKey.includes('nilai') || cleanKey.includes('nominal') || cleanKey.includes('tarif') || cleanKey.includes('biaya')) {
    return `Besaran nilai nominal finansial / biaya ${title}`;
  }
  if (cleanKey.includes('nama')) {
    return `Nama lengkap / sebutan resmi ${title}`;
  }
  if (cleanKey.includes('alamat') || cleanKey.includes('lokasi')) {
    return `Alamat atau lokasi tempat ${title}`;
  }

  // 4. Heuristic Fallback by Inferred Data Type
  if (inferredType === 'integer' || inferredType === 'number') {
    return `Nilai angka numerik / perhitungan ${title}`;
  }
  if (inferredType === 'boolean') {
    return `Status kebenaran nilai boolean (true/false) untuk ${title}`;
  }
  if (inferredType === 'date') {
    return `Informasi tanggal / waktu ${title}`;
  }
  if (inferredType === 'array' || inferredType === 'object') {
    return `Daftar rincian data terstruktur ${title}`;
  }

  // 5. Default generic informative description
  return `Data informasi ${title}`;
}

/**
 * Infers an accurate data type from sample value and field name
 */
export function inferFieldDataType(key, val) {
  if (typeof val === 'number') {
    return Number.isInteger(val) ? 'integer' : 'number';
  }
  if (typeof val === 'boolean') {
    return 'boolean';
  }
  if (Array.isArray(val)) {
    return 'array';
  }
  if (typeof val === 'object' && val !== null) {
    return 'object';
  }

  const strVal = String(val || '').trim();
  const lowerKey = String(key || '').toLowerCase();

  // Check if string matches ISO date / datetime format
  if (
    /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(strVal) ||
    lowerKey.includes('created_at') || lowerKey.includes('updated_at') || lowerKey.startsWith('tgl_') || lowerKey.startsWith('tanggal_')
  ) {
    if (strVal && !isNaN(Date.parse(strVal))) {
      return 'date';
    }
  }

  return 'string';
}

/**
 * Infers an appropriate parameter description for AI tool calling
 * e.g. "nik" -> "Filter pencarian spesifik berdasarkan NIK (Nomor Induk Kependudukan 16 digit)"
 *      "nama" -> "Filter pencarian nama lengkap atau sebagian nama individu"
 */
export function inferParameterDescription(fieldName, inferredType = 'string', sampleValue = null) {
  if (!fieldName || typeof fieldName !== 'string') return '';
  const cleanKey = fieldName.toLowerCase().trim();
  const title = toReadableTitle(cleanKey);

  // Common identity & key filters
  if (cleanKey === 'nik' || cleanKey === 'no_ktp') {
    return 'Filter pencarian spesifik berdasarkan NIK (Nomor Induk Kependudukan 16 digit)';
  }
  if (cleanKey === 'no_kk' || cleanKey === 'nomor_kk') {
    return 'Filter pencarian berdasarkan Nomor Kartu Keluarga (KK 16 digit)';
  }
  if (cleanKey.includes('nama') || cleanKey.includes('name')) {
    return `Filter pencarian ${title} (bisa sebagian nama atau nama lengkap)`;
  }
  if (cleanKey === 'npwp' || cleanKey === 'nomor_npwp') {
    return 'Filter pencarian berdasarkan NPWP resmi';
  }
  if (cleanKey === 'nopol' || cleanKey === 'no_polisi' || cleanKey === 'plat_nomor') {
    return 'Filter pencarian berdasarkan nomor polisi kendaraan bermotor (contoh: B 1234 ABC)';
  }
  if (cleanKey === 'no_rangka' || cleanKey === 'vin') {
    return 'Filter pencarian nomor rangka kendaraan bermotor (VIN)';
  }
  if (cleanKey === 'no_mesin') {
    return 'Filter pencarian nomor mesin kendaraan bermotor';
  }
  if (cleanKey === 'no_rekening' || cleanKey === 'norek') {
    return 'Filter pencarian berdasarkan nomor rekening perbankan nasabah';
  }
  if (cleanKey === 'no_hp' || cleanKey === 'phone' || cleanKey === 'telepon' || cleanKey === 'nohp') {
    return 'Filter pencarian berdasarkan nomor telepon seluler / kontak';
  }
  if (cleanKey === 'email' || cleanKey === 'surel') {
    return 'Filter pencarian berdasarkan alamat surel / email resmi';
  }
  if (cleanKey.startsWith('tgl_') || cleanKey.startsWith('tanggal_') || inferredType === 'date') {
    return `Filter pencarian berdasarkan ${title} (format YYYY-MM-DD)`;
  }
  if (cleanKey.includes('alamat') || cleanKey.includes('kota') || cleanKey.includes('kecamatan') || cleanKey.includes('provinsi')) {
    return `Filter pencarian wilayah/lokasi ${title}`;
  }
  if (cleanKey.includes('status')) {
    return `Filter kondisi atau kode status operasional ${title}`;
  }
  if (cleanKey === 'id' || cleanKey.endsWith('_id') || cleanKey.startsWith('id_')) {
    return `Filter pengenal unik ID untuk ${title}`;
  }
  if (inferredType === 'integer' || inferredType === 'number') {
    return `Filter nilai angka / numerik ${title}`;
  }
  if (inferredType === 'boolean') {
    return `Filter status penanda boolean (1/0 atau true/false) untuk ${title}`;
  }

  // Fallback
  return `Filter pencarian data berdasarkan ${title}`;
}

/**
 * Automatically generates a WHERE query or MongoDB filter from a list of parameters
 *
 * @param {string} dbType - 'mysql' | 'postgres' | 'mssql' | 'oracle' | 'mongodb' | 'sqlite'
 * @param {string} currentQuery - Existing query text in editor (used to extract table name/columns)
 * @param {Array} parameters - List of parameter objects [{ name, type, ... }]
 * @param {Object} options - { matchMode: 'smart' | 'exact', optionalFilter: boolean, tableName: string }
 * @returns {string} Generated SQL query or MongoDB JSON string
 */
export function generateWhereClause(dbType = 'mysql', currentQuery = '', parameters = [], options = {}) {
  const validParams = (parameters || []).filter(p => p && p.name && p.name.trim() !== '');
  const lowerDb = (dbType || 'mysql').toLowerCase();
  const isMongo = lowerDb === 'mongodb';
  const matchMode = options.matchMode || 'smart'; // 'smart' | 'exact'
  const optionalFilter = Boolean(options.optionalFilter);

  if (isMongo) {
    if (validParams.length === 0) {
      return '{\n  \n}';
    }
    const orConditions = validParams.map(p => {
      const pName = p.name.trim();
      const pType = (p.type || 'string').toLowerCase();
      const isText = (pType === 'string' || !pType) && matchMode !== 'exact';
      const cleanKey = pName.toLowerCase();
      const isExactField = ['id', 'nik', 'no_ktp', 'no_kk', 'status', 'kd_status', 'npwp', 'role', '_id'].includes(cleanKey);

      if (isText && !isExactField) {
        return { [pName]: { "$regex": `:${pName}`, "$options": "i" } };
      } else {
        return { [pName]: `:${pName}` };
      }
    });
    if (orConditions.length === 1) {
      return JSON.stringify(orConditions[0], null, 2);
    }
    return JSON.stringify({ "$or": orConditions }, null, 2);
  }

  // SQL Databases
  let tableName = 'users';
  let selectFields = '*';

  // Try extracting table name from currentQuery
  if (currentQuery && typeof currentQuery === 'string') {
    const fromMatch = currentQuery.match(/\bFROM\s+([`"']?[\w.]+[`"']?)/i);
    if (fromMatch && fromMatch[1]) {
      tableName = fromMatch[1].trim();
    }
    const selectMatch = currentQuery.match(/^\s*SELECT\s+(DISTINCT\s+)?(.*?)\s+FROM\b/i);
    if (selectMatch && selectMatch[2] && !selectMatch[2].includes('*')) {
      selectFields = selectMatch[2].trim();
    }
  }

  if (options.tableName) {
    tableName = options.tableName;
  }

  if (validParams.length === 0) {
    if (lowerDb === 'mssql') return `SELECT TOP 50 ${selectFields} FROM ${tableName}`;
    if (lowerDb === 'oracle') return `SELECT ${selectFields} FROM ${tableName} WHERE ROWNUM <= 50`;
    return `SELECT ${selectFields} FROM ${tableName} LIMIT 50`;
  }

  const conditions = validParams.map(p => {
    const pName = p.name.trim();
    const pType = (p.type || 'string').toLowerCase();
    const cleanKey = pName.toLowerCase();
    const isExactField = ['id', 'nik', 'no_ktp', 'no_kk', 'status', 'kd_status', 'npwp', 'role', 'jenis_kelamin', 'jk', 'is_active', 'aktif'].includes(cleanKey) ||
      cleanKey.startsWith('id_') || cleanKey.endsWith('_id') || cleanKey.startsWith('kd_') || cleanKey.startsWith('kode_');
    const isTextSearch = (pType === 'string' || !pType) && matchMode !== 'exact' && !isExactField;

    let baseCond = '';
    if (isTextSearch) {
      if (lowerDb === 'oracle') {
        baseCond = `${pName} LIKE '%' || :${pName} || '%'`;
      } else if (lowerDb === 'mssql') {
        baseCond = `${pName} LIKE '%' + :${pName} + '%'`;
      } else {
        baseCond = `${pName} LIKE CONCAT('%', :${pName}, '%')`;
      }
    } else {
      baseCond = `${pName} = :${pName}`;
    }

    if (optionalFilter) {
      return `(:${pName} IS NULL OR :${pName} = '' OR ${baseCond})`;
    }
    return baseCond;
  });

  const whereBody = conditions.join('\n  OR ');

  if (lowerDb === 'mssql') {
    return `SELECT TOP 50 ${selectFields} FROM ${tableName}\nWHERE ${whereBody}`;
  } else if (lowerDb === 'oracle') {
    return `SELECT ${selectFields} FROM ${tableName}\nWHERE ${whereBody}\n  AND ROWNUM <= 50`;
  } else {
    return `SELECT ${selectFields} FROM ${tableName}\nWHERE ${whereBody}\nLIMIT 50`;
  }
}
