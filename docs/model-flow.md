# Luồng hoạt động của các mô hình dự đoán

Tài liệu này mô tả cách huấn luyện và dự báo của bốn model trong ứng dụng. Mỗi model artifact được huấn luyện trên một chuỗi sản phẩm/khu vực riêng; dự báo luôn dùng đúng chuỗi người dùng đã chọn.

## 1. Mục tiêu và dữ liệu

Nguồn dữ liệu là `backend/src/ai/assets/vietfood_agroinfo_cleaned_final.csv`.

- Chỉ dùng dòng `time_granularity=month`, có `product`, `location` và `standardized_price` hợp lệ; sản phẩm `Lúa mì` bị loại khỏi danh sách dự báo giá lúa/gạo.
- Gộp các dòng cùng tháng bằng trung bình, riêng trong từng cặp `(product, location)`.
- Giữ tháng không có quan sát là thiếu. Không nội suy và không tự tạo điểm giá.
- Chỉ huấn luyện cặp có ít nhất 36 mẫu hoàn chỉnh sau khi tính các lag. Số cặp khả dụng tùy theo CSV và được ghi trong `assets/series_models/index.json`.

## 2. Huấn luyện và kỳ hạn

Chạy từ thư mục `backend`:

```powershell
python src/ai/train_models.py
```

Script tạo lag theo tháng lịch (`lag_1`, `lag_2`, `lag_3`, `lag_12`) riêng cho từng cặp và bỏ mẫu nếu giá mục tiêu hoặc một lag cần thiết bị thiếu.

Trước khi công bố index model:

1. Chia dữ liệu theo thứ tự thời gian 80/20 để tính RMSE/MAE trên phần giữ lại.
2. Sau đánh giá, fit lại cùng bốn model trên toàn bộ mẫu thực có đủ lag của cặp đó.
3. Lưu artifacts và scaler riêng vào `backend/src/ai/assets/series_models/<artifact_key>`. Index `index.json` chỉ được thay sau khi artifacts của cặp hoàn tất; các artifacts cũ không bị ghi đè giữa lúc đang huấn luyện.

Ứng dụng cho phép kỳ hạn 1, 3 và 6 tháng khi dữ liệu/model hỗ trợ. Với ANN, LSTM và XGBoost, mỗi bước dự báo trước được dùng làm lag cho bước tiếp theo; chỉ dùng giá thực có trong chuỗi hoặc kết quả của chính request đó. SARIMAX dự báo trực tiếp nhiều bước từ artifact của đúng cặp đã chọn.

## 3. SARIMAX

Artifact: `backend/src/ai/assets/series_models/<artifact_key>/sarimax_model.pkl`.

- Target là chuỗi standardized price hàng tháng của đúng sản phẩm/khu vực đã chọn.
- Cấu hình: `order=(1,1,1)`, `seasonal_order=(1,1,1,12)`, không bật ràng buộc stationarity/invertibility.
- Dự báo dùng các tháng sau tháng quan sát gần nhất trong chuỗi đã fit, giữ nguyên các tháng thiếu.

## 4. XGBoost

Artifact: `backend/src/ai/assets/series_models/<artifact_key>/xgboost_model.json`.

- Feature theo đúng thứ tự: `lag_1`, `lag_2`, `lag_3`, `lag_12`.
- Huấn luyện với `n_estimators=100`, `learning_rate=0.05`, `max_depth=5`, `random_state=42`.
- Không scale feature và không scale giá mục tiêu.

## 5. ANN

Artifact: `backend/src/ai/assets/series_models/<artifact_key>/ann_model.keras`.

- Kiến trúc: Dense(64, ReLU), Dropout(0.2), Dense(32, ReLU), Dense(1).
- Dùng Adam, loss MSE, 150 epochs, batch size 16.
- `StandardScaler` riêng cho từng cặp chỉ áp dụng cho bốn feature đầu vào.
- Mean và scale được lưu cùng artifact trong `model_contracts.json`; backend áp dụng đúng contract trước mỗi lần inference.

## 6. LSTM

Artifact: `backend/src/ai/assets/series_models/<artifact_key>/lstm_model.keras`.

- Cùng bốn feature và scaler riêng của cặp như ANN.
- Mỗi mẫu có hình dạng `(1, 4)`: một bước thời gian với bốn feature.
- Kiến trúc: LSTM(50, ReLU, trả chuỗi), Dropout(0.1), LSTM(20, ReLU), Dense(1).
- Dùng Adam, loss MSE, 150 epochs, batch size 16. Giá mục tiêu không được scale.

## 7. Luồng trên website và giới hạn diễn giải

1. Form tải trạng thái model và danh sách cặp đã có artifact từ FastAPI.
2. Người dùng chọn sản phẩm, khu vực, một trong bốn model và kỳ hạn mà cặp/model đó hỗ trợ.
3. FastAPI lấy lag hoặc lịch sử từ đúng chuỗi CSV và dự báo các tháng tiếp theo sau tháng mới nhất có dữ liệu. Kết quả kèm tối đa sáu tháng lịch sử thật của cặp; tháng trống được để rỗng.
4. Express lưu model, sản phẩm, khu vực, kỳ hạn, kết quả, đơn vị và lịch sử vào MongoDB; trang chi tiết/lịch sử đọc lại các thông tin đó.

RMSE/MAE trên holdout là chỉ số kiểm tra lịch sử, không đảm bảo sai số của dự báo tương lai. Thời gian dự báo bắt đầu sau tháng mới nhất có dữ liệu trong CSV; nếu CSV cũ, dự báo cũng không tự dịch theo ngày hiện tại.
