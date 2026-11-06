# Chạy dự án bằng một lần bấm

## Cách nhanh nhất

1. Cài Node.js 18.11 trở lên, Python 3.10 (khuyến nghị) và MongoDB local hoặc chuẩn bị MongoDB Atlas.
2. Khởi động MongoDB. Nếu dùng Atlas, cấu hình connection string trong `backend\.env` tại `MONGODB_URI`.
3. Mở thư mục dự án trong File Explorer và bấm đúp `start.bat`.
4. Lần chạy đầu có thể cài các thư viện Python/npm còn thiếu; cần kết nối Internet và có thể mất vài phút.
5. Khi ba cửa sổ dịch vụ đã mở, truy cập `http://localhost:5173`.

`start.bat` mở FastAPI, Express và React/Vite trong ba cửa sổ PowerShell riêng. Script đợi FastAPI trả lời `/health` trước khi mở Express để tránh request sớm khi cổng 8000 chưa sẵn sàng. Đóng các cửa sổ dịch vụ để dừng chúng.

## Cấu hình

- Express đọc `backend\.env`. Nếu chưa có, `start.bat` tạo cấu hình MongoDB local và JWT secret ngẫu nhiên; không ghi đè file đã tồn tại.
- Nếu dùng MongoDB Atlas, cập nhật `MONGODB_URI` trong `backend\.env`. Không chia sẻ hoặc commit file này.
- FastAPI cần `PRICE_UNIT` trong `backend\.env.ai`. Đặt đúng đơn vị của model đã train và cột `unit` trong CSV. Thiếu biến này thì model vẫn có thể nạp, nhưng dự đoán bị từ chối.
- Dự báo ngoại suy đệ quy từ quan sát thực cuối cùng tới ngày hiện tại theo giờ Việt Nam (UTC+7), sau đó trả dự báo 1, 2 hoặc 3 ngày tiếp theo. Express chờ inference tối đa 180 giây mặc định; có thể tăng bằng `FASTAPI_PREDICTION_TIMEOUT_MS` trong `backend\.env`.
- Hai artifacts được đọc từ `backend\src\ai\assets`: runtime ưu tiên `random_forest.pkl`/`xgboost.pkl`, rồi dùng tên hiện có `random_forest_eval_fixed.pkl`/`xgboost_eval_fixed.pkl` nếu tên ưu tiên không có. Không train lại, đổi tên hoặc ghi đè artifacts.
- Môi trường Python cài `scikit-learn==1.6.1` theo `backend\requirements.txt` để đọc pickle tương thích. Contract feature và category được kiểm tra trực tiếp từ từng artifact; FastAPI không đọc file `model_contracts.json`.
- Dữ liệu inference đọc trực tiếp từ `backend\src\ai\assets\JASMINE_ALL_2008_2026.csv`; file phải có các cột `date`, `location`, `product_name`, `price_type`, `unit`, `price_vnd` và `source`. Không cần nhập CSV vào MongoDB. Ngày mốc được lấy động theo ngày hiện tại tại Việt Nam; nếu lịch sử chuỗi đã chọn cũ hơn, model ngoại suy tuần tự qua các ngày tới ngày mốc rồi dự báo các ngày tiếp theo. Giá ngoại suy chỉ tồn tại trong request, không ghi vào CSV hoặc MongoDB.
- MongoDB collection `riceprices` vẫn là nguồn dữ liệu cho trang giá; dự báo từ CSV không tạo hay cập nhật bản ghi trong collection này. Tài khoản và lịch sử dự đoán vẫn lưu trong MongoDB.

## Kiểm tra sau khi khởi chạy

Mở PowerShell mới và chạy:

```powershell
curl.exe http://127.0.0.1:5000/api/health
curl.exe http://127.0.0.1:8000/health
curl.exe http://127.0.0.1:8000/models
```

Express cần kết nối được MongoDB để lưu tài khoản và lịch sử dự đoán. FastAPI báo `ok` khi cả Random Forest, XGBoost và `PRICE_UNIT` sẵn sàng; nếu thiếu model hoặc cấu hình, xem `reason` trong `/models`. `/api/predictions/options` yêu cầu đăng nhập và liệt kê các cặp tương thích đọc từ CSV. Một cặp có thể bị từ chối khi dự báo nếu CSV có ngày trùng hoặc không đủ lịch sử/không khớp category model.

## Khắc phục lỗi Vite `proxy error` / `ECONNRESET`

Vite chuyển request `/api/*` đến Express tại `http://127.0.0.1:5000` (hoặc `VITE_BACKEND_URL`). `ECONNRESET` nghĩa là kết nối tới backend bị đóng trước khi Vite nhận được phản hồi; đây không phải thông báo mật khẩu sai. Kiểm tra theo thứ tự:

1. Trong PowerShell mới, gọi Express trực tiếp và qua Vite:

   ```powershell
   curl.exe -i http://127.0.0.1:5000/api/health
   curl.exe -i http://127.0.0.1:5173/api/health
   ```

   Cả hai cần trả HTTP 200 và `{"status":"ok","database":true}`. Nếu cổng 5000 không phản hồi, xem cửa sổ Express để tìm lỗi khởi động/kết nối MongoDB; kiểm tra `MONGODB_URI` và đảm bảo MongoDB hoạt động. Chỉ khởi động lại Express sau khi xử lý lỗi đó.

2. Nếu cổng 5000 hoạt động nhưng cổng 5173 lỗi, kiểm tra `VITE_BACKEND_URL` trong terminal đã khởi chạy Vite. Mặc định proxy dùng `http://127.0.0.1:5000`. Sau khi đổi biến môi trường hoặc `frontend\vite.config.js`, khởi động lại Vite.

3. Nếu cả hai health check đều thành công nhưng login vẫn lỗi, kiểm tra HTTP status của request login trong Network tab và nội dung phản hồi Express. `401` là thông tin đăng nhập không hợp lệ; đó không phải lỗi proxy. Không gửi token, mật khẩu hay nội dung `.env` khi chia sẻ log.

Trong lần kiểm tra hiện tại, Express trực tiếp và qua Vite đều trả 200 cho `/api/health`, đồng thời `POST /api/auth/login` qua cả hai đường đều trả 401 với thông tin đăng nhập giả. Do đó proxy và route đang hoạt động; log `ECONNRESET` nêu trên có thể là kết nối gián đoạn nhất thời (ví dụ Express khởi động lại hoặc đóng kết nối). Nếu tái diễn, đối chiếu thời điểm log với cửa sổ Express và kết quả hai health check.

## Khắc phục lỗi ML `ECONNREFUSED 127.0.0.1:8000`

Lỗi này nghĩa là Express không kết nối được FastAPI; kiểm tra cửa sổ FastAPI và `http://127.0.0.1:8000/health`. Nếu health không phản hồi, khởi động lại FastAPI bằng lệnh ở phần Chạy thủ công, chờ `/health` phản hồi rồi tải lại trang. Express trả `503` khi dịch vụ ML chưa thể kết nối; đây không phải lỗi React hay lỗi lưu lịch sử.

## Chạy thủ công

Mở ba terminal:

**FastAPI**

```powershell
cd D:\MH\VIETNAM_RICE_PRICE\backend
.\.venv\Scripts\Activate.ps1
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

## Luồng dự báo

1. Đăng nhập và mở trang dự đoán.
2. Chọn model (`random_forest` hoặc `xgboost`), sản phẩm, khu vực và kỳ hạn 1, 2 hoặc 3 ngày.
3. Express gửi lựa chọn đến FastAPI; FastAPI tìm lịch sử phù hợp trực tiếp trong CSV.
4. FastAPI kiểm tra contract model, khu vực, dữ liệu lịch sử và đơn vị; dùng ngày hiện tại tại Việt Nam làm mốc. Nếu chuỗi giá thực mới nhất cũ hơn, FastAPI ngoại suy đệ quy từng ngày tới mốc này rồi dự báo các ngày tiếp theo. Ngày giá thực mới nhất trong CSV có thể khác theo từng chuỗi.
5. Express lưu response vào lịch sử dự đoán. Không có giá dự báo nào được ghi vào collection `riceprices`.

Xem [README](./README.md) và [chi tiết luồng model](./docs/model-flow.md) để biết đầy đủ contract và điều kiện dữ liệu.
