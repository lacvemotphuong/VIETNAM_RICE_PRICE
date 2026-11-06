# Luồng dự báo Random Forest và XGBoost

## 1. Nạp artifacts và contract

FastAPI (`backend/src/ai/main.py`) nạp artifacts lúc khởi động bằng `joblib.load`. Với từng model, runtime tìm theo thứ tự:

1. `backend/src/ai/assets/random_forest.pkl` hoặc `backend/src/ai/assets/xgboost.pkl`
2. Nếu tên trên không có, lần lượt dùng `random_forest_eval_fixed.pkl` hoặc `xgboost_eval_fixed.pkl`

Artifacts hiện có là pipeline scikit-learn đã fit. Runtime không train, đổi tên, ghi đè hay tạo artifacts. Môi trường khai báo `scikit-learn==1.6.1` để tương thích pickle. Lỗi nạp/contract được ghi log và xuất trong trạng thái model; một model nạp lỗi không được dùng dự báo.

Contract phải có đúng thứ tự 11 feature:

| Thứ tự | Feature | Giá trị lúc inference |
|---|---|---|
| 1 | `year` | Năm của ngày đang dự báo |
| 2 | `month` | Tháng của ngày đang dự báo |
| 3 | `quarter` | Quý lịch (1–4) |
| 4 | `day_of_week` | Thứ trong tuần, Monday = 0 |
| 5 | `day_of_year` | Ngày thứ bao nhiêu trong năm |
| 6 | `lag_1` | Giá gần nhất trong chuỗi inference |
| 7 | `lag_7` | Giá cách 7 quan sát trong chuỗi inference |
| 8 | `rolling_mean_7` | Trung bình 7 giá gần nhất |
| 9 | `location` | Khu vực người dùng chọn |
| 10 | `source` | Nguồn chung của 7 quan sát mới nhất |
| 11 | `price_type` | Category duy nhất đọc từ encoder đã fit trong artifact |

Khi nạp, code kiểm tra tên/thứ tự feature, pipeline tiền xử lý và các category đã fit của `location`, `source`, `price_type`. Danh sách model có sẵn từ `/models` phản ánh trạng thái nạp artifact và contract; model được nạp không có nghĩa mọi cặp sản phẩm/khu vực trong CSV đều dùng được.

## 2. Chọn chuỗi giá

FastAPI đọc chỉ-đọc `backend/src/ai/assets/JASMINE_ALL_2008_2026.csv`; không lấy lịch sử inference từ MongoDB và không nhập/ghi lại CSV. Bắt buộc có các cột `date`, `location`, `product_name`, `price_type`, `unit`, `price_vnd` và `source`. Ngày được đọc theo định dạng `YYYY-MM-DD`; giá dự báo lấy từ `price_vnd`.

`GET /options` lọc CSV theo `PRICE_UNIT` cùng các location/source/price_type mà artifact đã fit. Mỗi cặp sản phẩm/khu vực có ít nhất 7 quan sát không trùng ngày đến ngày hiện tại tại Việt Nam được trả về với các model tương thích. `forecast_anchor_date` là ngày hiện tại động; `latest_csv_date` là ngày lớn nhất trong CSV và `series_latest_date` là ngày quan sát cuối cùng tương thích của chuỗi được chọn. Options trả `horizons_days` và `horizons_days_by_model` (1, 2, 3). Việc collection MongoDB `riceprices` trống không ngăn dự báo từ CSV; collection này vẫn được dùng riêng cho trang giá hiện tại.

Khi dự báo, FastAPI lọc toàn bộ CSV theo đúng `product_name`, `location`, `PRICE_UNIT` và category của model được chọn. Request bị từ chối nếu:

- Không có lịch sử phù hợp hoặc ít hơn 7 quan sát.
- Có nhiều quan sát phù hợp cùng một ngày.
- Có đơn vị không khớp `PRICE_UNIT`, giá rỗng hoặc không hữu hạn trong CSV.
- Khu vực, nguồn hoặc loại giá không nằm trong contract artifact.

Không có nội suy, tạo giá thay thế, hoặc ghi dữ liệu giá. `product_name` dùng để chọn chuỗi và ghi nhãn kết quả; feature model dùng `location`, `source` và `price_type`, không dùng tên sản phẩm.

## 3. Tính dự báo

Người dùng chọn `random_forest` hoặc `xgboost` và kỳ hạn 1, 2 hoặc 3 ngày. Request gửi `horizon_days`; `PRICE_UNIT` phải được cấu hình; endpoint `/health` chỉ báo `ok` khi cả hai model sẵn sàng và đơn vị đã cấu hình.

Ngày mốc `d` được lấy động theo giờ Việt Nam (UTC+7) tại thời điểm request, không phụ thuộc khu vực hay sản phẩm. Chuỗi giá thực được lọc theo sản phẩm, khu vực, đơn vị và categories mà model đã fit; các quan sát sau ngày mốc không được dùng. `series_latest_date` cho biết ngày có giá thực cuối cùng của chuỗi đó, còn `latest_csv_date` cho biết ngày cuối cùng có mặt trong toàn CSV.

Do dữ liệu tương thích có thể cũ hơn ngày hiện tại, FastAPI chạy pipeline theo từng ngày từ ngày sau `series_latest_date` tới `d`. Mỗi dự đoán trung gian trong khoảng này được thêm vào trạng thái trong bộ nhớ của request và dùng làm lag cho bước sau; các ngày thiếu không được nội suy hoặc ghi vào CSV/MongoDB. Sau khi trạng thái được ngoại suy tới `d`, API dự báo các ngày `d + 1` đến `d + horizon_days`. Ví dụ ngày mốc 07/11/2026, kỳ hạn 3 ngày trả 08/11, 09/11 và 10/11/2026. Response trả các ngày này trong `input.forecast_dates`, số ngày trong `input.horizon_days`, ngày mốc trong `input.forecast_anchor_date`, và ngày quan sát cuối cùng trong `input.series_latest_date`.

Vì lag phụ thuộc dự đoán trước đó, khoảng đệm dài cần nhiều lần gọi model tuần tự. Random Forest được đặt `n_jobs=1` khi nạp để giảm chi phí khởi tạo tác vụ song song ở mỗi lần dự đoán; đây chỉ là cấu hình thực thi, không thay model hoặc kết quả thuật toán. Express chờ inference tối đa 180 giây mặc định; có thể cấu hình qua `FASTAPI_PREDICTION_TIMEOUT_MS`. Các giá trung gian chỉ phục vụ inference của request, không ghi vào MongoDB.

Các lag được tính theo 7 bản ghi liên tiếp trong chuỗi quan sát rồi dự báo, không phải 7 ngày lịch. Vì vậy không có bước nội suy hay bổ sung giá cho ngày thiếu. `day_of_week` theo quy ước Python (Monday = 0).

## 4. Response và lưu kết quả

FastAPI trả `model`, `predictions`, `unit`, `input`, `actual_history` và `generated_at`. `actual_history` gồm sáu tháng lịch tính đến tháng của quan sát mới nhất; giá trong tháng là giá của bản ghi cuối cùng trong tháng, tháng không có bản ghi nhận `null`.

Express chỉ lưu kết quả sau khi inference thành công vào collection lịch sử dự đoán. Các trường lưu gồm model, input, predictions, actualHistory, unit, generatedAt. Schema vẫn chấp nhận `ann`, `lstm`, `sarimax` để đọc các lịch sử cũ; API tạo dự đoán mới chỉ chấp nhận `random_forest` và `xgboost`.

Frontend hiển thị giá đầu tiên và ngày dự báo chính xác từ response. Với dự báo ngày, biểu đồ chỉ vẽ các ngày tương lai; giao diện nêu riêng ngày giá thực tương thích cuối cùng và làm rõ khoảng đến ngày mốc là ngoại suy, tránh ghép các tháng dữ liệu cũ với ngày dự báo hiện tại trên cùng trục. Lịch sử dự đoán cũ có `horizon_months`/`forecast_months` vẫn được hiển thị theo tháng; dữ liệu giá và các bản ghi cũ không bị chuyển đổi.

## 5. Endpoints

- FastAPI `GET /health`, `GET /models`: trạng thái nạp model và cấu hình đơn vị.
- FastAPI `GET /options`: đọc CSV và trả models, features, unit, `horizons_days`, cùng các cặp sản phẩm/khu vực tương thích.
- Express `GET /api/predictions/models`, `GET /api/predictions/options`: cần xác thực; options chuyển tiếp metadata và các lựa chọn từ FastAPI.
- Express `POST /api/predictions`: cần xác thực; gọi FastAPI để đọc CSV và dự báo, sau đó lưu kết quả vào lịch sử dự đoán.
- Express `GET /api/predictions` và `GET /api/predictions/:id`: đọc lịch sử dự đoán đã lưu.
