from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from huggingface_hub import hf_hub_download
import uvicorn
from PIL import Image
import io
import time
import os
import logging

# Thiết lập log để dễ theo dõi quá trình chạy
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("InsurVisionBackend")

app = FastAPI(
    title="InsurVision Auto AI Engine",
    description="Máy chủ Phân tích & Nhận diện Thiệt hại Xe hơi bằng YOLOv8",
    version="1.0.0"
)

# Cấu hình CORS để cho phép Frontend gọi API từ bất kỳ nguồn nào
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Nạp mô hình AI YOLOv8
MODEL_REPO = "CharbelMsalem/yolov8m-finetuned-datamatics-damage"
MODEL_FILENAME = "best.pt"
model = None

@app.on_event("startup")
def load_model():
    global model
    logger.info("Bắt đầu khởi động máy chủ AI...")
    
    # Thử tải mô hình chuyên dụng từ Hugging Face
    try:
        logger.info(f"Đang tải trọng số mô hình từ Hugging Face Repo: {MODEL_REPO}...")
        model_path = hf_hub_download(repo_id=MODEL_REPO, filename=MODEL_FILENAME)
        logger.info(f"Đã tải thành công file mô hình về: {model_path}")
        model = YOLO(model_path)
        logger.info("Đã nạp thành công mô hình YOLOv8 Car Damage chuyên dụng vào RAM!")
    except Exception as e:
        logger.error(f"Lỗi khi tải mô hình chuyên dụng: {e}")
        logger.warning("Đang tự động chuyển hướng sử dụng mô hình cơ bản yolov8n.pt làm dự phòng...")
        try:
            model = YOLO("yolov8n.pt")
            logger.info("Đã nạp thành công mô hình yolov8n.pt làm dự phòng!")
        except Exception as fallback_err:
            logger.critical(f"Không thể nạp bất kỳ mô hình nào! Lỗi: {fallback_err}")

@app.post("/detect")
async def detect_damage(file: UploadFile = File(...)):
    global model
    if model is None:
        raise HTTPException(status_code=503, detail="Mô hình AI chưa được nạp thành công trên Server.")
        
    start_time = time.time()
    logger.info(f"Nhận yêu cầu xử lý ảnh mới: {file.filename}")
    
    try:
        # Đọc dữ liệu ảnh
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        # Chuyển đổi sang hệ màu RGB (nếu là ảnh RGBA dạng png)
        if image.mode != "RGB":
            image = image.convert("RGB")
            
        img_w, img_h = image.size
        logger.info(f"Kích thước ảnh đầu vào: {img_w}x{img_h}")
        
        # Chạy suy luận nhận diện vết thương qua mô hình YOLOv8
        results = model.predict(source=image, conf=0.25) # Chỉ lấy các phát hiện có độ tin cậy từ 25% trở lên
        
        result = results[0]
        names = result.names
        damages = []
        
        logger.info(f"AI đã phát hiện được {len(result.boxes)} khu vực nghi ngờ lỗi.")
        
        # Duyệt qua các Bounding Box nhận diện được
        for i, box in enumerate(result.boxes):
            # Lấy tọa độ tuyệt đối pixel: [xmin, ymin, xmax, ymax]
            coords = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            class_name = names[cls_id]
            
            # Chuẩn hóa tọa độ tương đối (0.0 -> 1.0) cho Canvas Frontend
            x = round(coords[0] / img_w, 4)
            y = round(coords[1] / img_h, 4)
            w = round((coords[2] - coords[0]) / img_w, 4)
            h = round((coords[3] - coords[1]) / img_h, 4)
            
            # Khởi tạo giá trị mặc định cho từng loại lỗi nhận diện được từ YOLO
            part_key = "Door"
            part_name = "Thân xe"
            severity = "Medium"
            action = "Repair"
            
            # Ánh xạ nhãn lớp của YOLO sang cấu trúc nghiệp vụ Bảo hiểm
            # Các lớp của CharbelMsalem: crack, dent, glass_shatter, lamp_broken, scratch, tire_flat
            if class_name == "glass_shatter" or "glass" in class_name:
                part_key = "Windshield"
                part_name = "Kính chắn gió"
                severity = "High"
                action = "Replace"
            elif class_name == "lamp_broken" or "lamp" in class_name or "light" in class_name:
                part_key = "Headlamp"
                part_name = "Cụm đèn pha"
                severity = "Medium"
                action = "Replace"
            elif class_name == "dent":
                part_key = "Bumper"
                part_name = "Cản xe (Móp méo)"
                severity = "Medium"
                action = "Repair"
            elif class_name == "scratch":
                part_key = "Door"
                part_name = "Cánh cửa (Trầy xước)"
                severity = "Low"
                action = "Repair"
            elif class_name == "crack":
                part_key = "Fender"
                part_name = "Ốp hông / Chắn bùn"
                severity = "Medium"
                action = "Repair"
            elif class_name == "tire_flat" or "tire" in class_name:
                part_key = "Fender"
                part_name = "Bánh xe / Chắn bùn"
                severity = "High"
                action = "Replace"
            else:
                # Nếu là mô hình cơ bản yolov8n, thử lấy nhãn mặc định COCO (ví dụ 'car')
                part_key = "Door"
                part_name = f"Vùng hư hại ({class_name})"
                severity = "Medium"
                action = "Repair"
                
            damages.append({
                "id": f"dmg_ai_{i}_{int(time.time())}",
                "partKey": part_key,
                "partName": part_name,
                "severity": severity,
                "action": action,
                "confidence": round(conf * 100, 1),
                "box": {"x": x, "y": y, "w": w, "h": h}
            })
            
        elapsed_time = round(time.time() - start_time, 2)
        logger.info(f"Hoàn thành xử lý ảnh trong: {elapsed_time}s")
        
        # Danh mục thông tin xe mô phỏng trả kèm OCR
        mock_brands = ["Toyota", "Mazda", "Honda", "Hyundai", "Kia", "Mercedes-Benz"]
        mock_colors = ["Trắng Ngọc Trai", "Đen Kim Cương", "Xám Bạc", "Đỏ Lịch Lãm", "Xanh Dương"]
        
        ocr_result = {
            "brand": mock_brands[hash(file.filename) % len(mock_brands)],
            "model": "Premium Edition",
            "year": "2023",
            "plate": f"30K-{100 + hash(file.filename) % 900}.{10 + hash(file.filename) % 90}",
            "vin": f"MRH51BZ30J{100000 + hash(file.filename) % 900000}",
            "color": mock_colors[hash(file.filename) % len(mock_colors)]
        }
        
        return {
            "damages": damages,
            "vehicleInfo": ocr_result,
            "inferenceTime": elapsed_time
        }
        
    except Exception as err:
        logger.error(f"Lỗi nghiêm trọng khi chạy suy luận AI: {err}")
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ phân tích ảnh: {str(err)}")

if __name__ == "__main__":
    # Khởi chạy server trên cổng 8000
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
