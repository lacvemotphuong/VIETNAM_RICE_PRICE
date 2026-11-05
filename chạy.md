# Chạy dự án bằng một lần bấm

## Cách nhanh nhất

1. Cài Node.js 18.11 trở lên, Python 3.10 (khuyến nghị) và MongoDB local hoặc chuẩn bị MongoDB Atlas.
2. Mở MongoDB. Nếu dùng Atlas, điền connection string vào `backend\.env` ở dòng `MONGODB_URI`.
3. Mở thư mục dự án trong File Explorer và bấm đúp file `start.bat`.
4. Lần chạy đầu có thể tự cài các thư viện Python/npm còn thiếu, nên cần kết nối Internet và có thể mất vài phút.
5. Khi các cửa sổ dịch vụ đã mở, truy cập `http://localhost:5173`.

`start.bat` sẽ mở FastAPI, Express và React/Vite trong ba cửa sổ PowerShell riêng. Để dừng dịch vụ, đóng từng cửa sổ đó.

## Cấu hình

- Backend đọc cấu hình từ `backend\.env`. Nếu file chưa tồn tại, `start.bat` tạo cấu hình MongoDB local và một JWT secret ngẫu nhiên; script không ghi đè file đã có.
- Nếu dùng MongoDB Atlas, cập nhật `MONGODB_URI` trong `backend\.env`. Không chia sẻ hoặc commit file này.
- Nếu muốn cho phép dự đoán, tạo `backend\.env.ai` với `PRICE_UNIT=<đơn vị đúng lúc train mô hình>`. Không đặt đơn vị theo phỏng đoán; nếu thiếu cấu hình này, FastAPI vẫn chạy nhưng từ chối dự đoán để tránh gắn nhãn giá sai.
- Các artifact mô hình nằm trong `backend\src\ai\assets\`; script không thay đổi các file này.
- ANN/LSTM vẫn cần metadata huấn luyện đúng trong `backend\src\ai\model_contracts.json` để dự đoán. Không tự điền giá trị mẫu vào file này.

## Kiểm tra sau khi khởi chạy

Mở PowerShell mới và chạy:

```powershell
curl.exe http://127.0.0.1:5000/api/health
curl.exe http://127.0.0.1:8000/health
curl.exe http://127.0.0.1:8000/models
```

Backend cần kết nối được MongoDB. API giá sẽ trả danh sách rỗng cho đến khi collection `riceprices` có dữ liệu thực. Trạng thái model có thể báo chưa sẵn sàng nếu artifact hoặc metadata cần thiết chưa tương thích/được cấu hình.

## Chạy thủ công

Nếu muốn khởi chạy riêng từng dịch vụ, mở ba terminal:

**FastAPI**

```powershell
cd D:\MH\VIETNAM_RICE_PRICE\backend
..\.venv\Scripts\Activate.ps1
if (Test-Path .\.env.ai) { Get-Content .\.env.ai | ForEach-Object { if ($_ -match '^\s*PRICE_UNIT\s*=(.*)$') { $env:PRICE_UNIT = $Matches[1].Trim() } } }
python -m uvicorn src.ai.main:app --reload --host 127.0.0.1 --port 8000
```

**Express**

```powershell
cd D:\MH\VIETNAM_RICE_PRICE\backend
npm run dev
```

**React/Vite**

```powershell
cd D:\MH\VIETNAM_RICE_PRICE\frontend
npm run dev
```
