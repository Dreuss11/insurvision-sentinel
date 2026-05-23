/**
 * InsurVision Auto - Application Controller
 * Quản lý trạng thái ứng dụng, luồng tương tác, chụp ảnh giả lập, và tính toán động.
 */

document.addEventListener("DOMContentLoaded", () => {
    const app = new InsurVisionApp();
});

class InsurVisionApp {
    constructor() {
        this.state = {
            currentTab: "scanner",
            currentCase: null,
            currentImageSrc: "",
            currentVehicleInfo: { brand: "", model: "", year: "", plate: "", vin: "", color: "" },
            detectedDamages: [],
            selectedDamageId: null,
            useOEM: false,
            deductible: 1000000,
            isScanning: false,
            isCameraActive: false,
            claimsHistory: []
        };
        
        this.canvas = null;
        this.videoStream = null;
        
        this.init();
    }
    
    // Khởi chạy ứng dụng
    init() {
        // 1. Khởi tạo đối tượng Canvas tương tác
        const canvasEl = document.getElementById("damage-canvas");
        const containerEl = document.querySelector(".canvas-wrapper");
        this.canvas = new DamageCanvas(canvasEl, containerEl);
        
        // Đăng ký sự kiện Canvas
        this.canvas.onSelect((id) => this.handleDamageSelect(id));
        this.canvas.onDrawComplete((box) => this.handleManualDraw(box));
        
        // 2. Load lịch sử hồ sơ
        this.state.claimsHistory = getClaimsHistory();
        
        // 3. Đăng ký các sự kiện DOM
        this.bindEvents();
        
        // 4. Kiểm tra trạng thái AI Backend lần đầu và thiết lập định kỳ
        this.checkBackendStatus();
        setInterval(() => this.checkBackendStatus(), 10000);
        
        // 5. Mặc định load ca mẫu đầu tiên để người dùng có trải nghiệm ngay lập tức!
        this.loadSampleCase("case_bumper");
    }
    
    // Gắn kết tất cả sự kiện tương tác DOM
    bindEvents() {
        // A. Thanh điều hướng Sidebar Tabs
        document.getElementById("nav-scanner").addEventListener("click", () => this.switchTab("scanner"));
        document.getElementById("nav-history").addEventListener("click", () => this.switchTab("history"));
        
        // B. Chọn các ca mẫu (Sample Cards)
        document.querySelectorAll(".sample-card").forEach(card => {
            card.addEventListener("click", () => {
                const caseId = card.getAttribute("data-case-id");
                this.loadSampleCase(caseId);
            });
        });
        
        // C. Kéo & thả file hình ảnh tự do
        const dropZone = document.getElementById("drop-zone");
        const fileInput = document.getElementById("file-input");
        
        dropZone.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => this.handleFileSelect(e));
        
        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.classList.add("active");
        });
        
        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove("active");
        });
        
        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("active");
            if (e.dataTransfer.files.length > 0) {
                this.processUploadedFile(e.dataTransfer.files[0]);
            }
        });
        
        // D. Kích hoạt camera mô phỏng
        document.getElementById("camera-trigger").addEventListener("click", () => this.startCameraSim());
        document.getElementById("btn-capture").addEventListener("click", () => this.captureCameraPhoto());
        document.getElementById("btn-cancel-camera").addEventListener("click", () => this.stopCameraSim());
        
        // E. Nút công cụ Vẽ thủ công
        const btnDraw = document.getElementById("btn-draw-tool");
        btnDraw.addEventListener("click", () => {
            const isDrawing = !this.canvas.isDrawMode;
            this.canvas.setDrawMode(isDrawing);
            btnDraw.classList.toggle("active", isDrawing);
            
            const statusEl = document.getElementById("canvas-status-text");
            if (isDrawing) {
                statusEl.innerHTML = "CHẾ ĐỘ: <span>Kéo chuột vẽ vùng bị lỗi</span>";
            } else {
                statusEl.innerHTML = "CHẾ ĐỘ: <span>Click chọn vùng bị lỗi</span>";
            }
        });
        
        // F. Cập nhật chi phí tự động
        document.getElementById("oem-parts-chk").addEventListener("change", (e) => {
            this.state.useOEM = e.target.checked;
            this.recalculateCosts();
        });
        
        const deductibleInput = document.getElementById("deductible-input");
        deductibleInput.addEventListener("input", (e) => {
            let val = parseInt(e.target.value.replace(/[^0-9]/g, "")) || 0;
            this.state.deductible = val;
            
            // Format hiển thị số tiền Việt Nam khi gõ
            e.target.value = val.toLocaleString("vi-VN");
            this.recalculateCosts();
        });
        
        // G. Nút Gửi yêu cầu Bồi thường
        document.getElementById("btn-submit").addEventListener("click", () => this.submitClaimForm());
        document.getElementById("btn-modal-close").addEventListener("click", () => this.closeSuccessModal());
    }
    
    // Chuyển đổi giữa các Trang (Tab router)
    switchTab(tabName) {
        if (this.state.currentTab === tabName) return;
        
        this.state.currentTab = tabName;
        
        // Cập nhật trạng thái active của Menu Sidebar
        document.querySelectorAll(".menu-item").forEach(item => {
            item.classList.remove("active");
        });
        document.getElementById(`nav-${tabName}`).parentElement.classList.add("active");
        
        // Cập nhật hiển thị Trang nội dung chính
        document.querySelectorAll(".page-tab").forEach(tab => {
            tab.classList.remove("active");
        });
        document.getElementById(`tab-${tabName}`).classList.add("active");
        
        // Nếu chuyển sang Lịch sử, re-render danh sách
        if (tabName === "history") {
            this.stopCameraSim();
            this.renderClaimsHistory();
        }
    }
    
    // Tải ca mẫu có sẵn
    loadSampleCase(caseId) {
        const caseData = SAMPLE_CASES.find(c => c.id === caseId);
        if (!caseData) return;
        
        this.stopCameraSim();
        this.state.currentCase = caseId;
        this.state.currentImageSrc = caseData.imagePath;
        this.state.currentVehicleInfo = { ...caseData.vehicleInfo };
        this.state.detectedDamages = JSON.parse(JSON.stringify(caseData.damages)); // Deep copy
        
        // Cập nhật Form hiển thị xe (không chỉnh sửa được đối với xe mẫu)
        this.updateVehicleForm(true);
        
        // Chạy quy trình quét AI thật với dữ liệu dự phòng
        this.runAIScanner(caseData.imagePath, this.state.detectedDamages, caseData.vehicleInfo);
    }
    
    // Tải file tự kéo thả hoặc chọn từ máy tính
    handleFileSelect(e) {
        if (e.target.files.length > 0) {
            this.processUploadedFile(e.target.files[0]);
        }
    }
    
    processUploadedFile(file) {
        if (!file.type.match("image.*")) {
            alert("Vui lòng tải lên file định dạng hình ảnh!");
            return;
        }
        
        this.stopCameraSim();
        const reader = new FileReader();
        reader.onload = (e) => {
            this.loadCustomUploadedImage(e.target.result);
        };
        reader.readAsDataURL(file);
    }
    
    // Khởi động luồng tải ảnh tự do
    loadCustomUploadedImage(imageSrc) {
        this.state.currentCase = "custom";
        this.state.currentImageSrc = imageSrc;
        
        // Sinh trước thông tin xe ngẫu nhiên và lỗi ngẫu nhiên để làm phương án dự phòng (fallback)
        const randomOcr = MOCK_OCR_POOL[Math.floor(Math.random() * MOCK_OCR_POOL.length)];
        const randomDamages = generateRandomDamages();
        
        // Chạy quy trình quét AI (kèm dữ liệu dự phòng)
        this.runAIScanner(imageSrc, randomDamages, randomOcr);
    }
    
    // Cập nhật Biểu mẫu hiển thị thông tin xe
    updateVehicleForm(isDisabled = true) {
        const info = this.state.currentVehicleInfo;
        
        const inputs = {
            "v-brand": info.brand,
            "v-model": info.model,
            "v-year": info.year,
            "v-plate": info.plate,
            "v-vin": info.vin,
            "v-color": info.color
        };
        
        for (const [id, val] of Object.entries(inputs)) {
            const inputEl = document.getElementById(id);
            inputEl.value = val;
            inputEl.disabled = isDisabled;
        }
        
        // Ẩn badge OCR cho ảnh mẫu
        if (isDisabled) {
            document.querySelectorAll(".ocr-badge").forEach(badge => {
                badge.style.display = "none";
            });
        }
    }
    
    // GIẢ LẬP CAMERA MÔ PHỎNG VÀ CHỤP ẢNH TẠI HIỆN TRƯỜNG
    async startCameraSim() {
        this.state.isCameraActive = true;
        
        // Ẩn uploader, hiện khung camera
        document.getElementById("upload-interface").style.display = "none";
        const camContainer = document.getElementById("camera-sim-interface");
        camContainer.style.display = "block";
        
        const videoEl = document.getElementById("camera-video");
        
        // Cố gắng truy cập camera thực tế của người dùng
        try {
            this.videoStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", aspectRatio: 1.5 },
                audio: false
            });
            videoEl.srcObject = this.videoStream;
            videoEl.play();
        } catch (err) {
            console.warn("Không mở được camera thực tế. Kích hoạt giả lập camera trực tuyến chất lượng cao.", err);
            // Fallback: Sử dụng ảnh cản trước bị hỏng làm nguồn camera giả lập sinh động
            videoEl.style.display = "none";
            
            const fallbackEl = document.getElementById("camera-fallback-img");
            fallbackEl.src = "assets/bumper_dent.png";
            fallbackEl.style.display = "block";
        }
    }
    
    // Chụp hình từ Camera
    captureCameraPhoto() {
        const videoEl = document.getElementById("camera-video");
        let capturedSrc = "";
        
        if (this.videoStream) {
            // Chụp từ luồng video thực tế bằng cách vẽ lên canvas ảo
            const canvasTmp = document.createElement("canvas");
            canvasTmp.width = videoEl.videoWidth || 640;
            canvasTmp.height = videoEl.videoHeight || 480;
            
            const ctxTmp = canvasTmp.getContext("2d");
            ctxTmp.drawImage(videoEl, 0, 0, canvasTmp.width, canvasTmp.height);
            capturedSrc = canvasTmp.toDataURL("image/png");
        } else {
            // Lấy ảnh mẫu cản xe làm kết quả chụp nếu là camera giả lập
            capturedSrc = "assets/bumper_dent.png";
        }
        
        this.stopCameraSim();
        this.loadCustomUploadedImage(capturedSrc);
    }
    
    stopCameraSim() {
        this.state.isCameraActive = false;
        
        // Tắt luồng stream camera thực tế
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
        }
        
        document.getElementById("camera-sim-interface").style.display = "none";
        document.getElementById("upload-interface").style.display = "block";
        
        const videoEl = document.getElementById("camera-video");
        videoEl.srcObject = null;
        videoEl.style.display = "block";
        
        document.getElementById("camera-fallback-img").style.display = "none";
    }
    
    // Helper: Chuyển đổi đường dẫn ảnh hoặc DataURL thành Blob nhị phân
    async getImageBlob(imageSrc) {
        if (imageSrc.startsWith("data:")) {
            return this.dataURLtoBlob(imageSrc);
        } else {
            const response = await fetch(imageSrc);
            return await response.blob();
        }
    }
    
    // Helper: Chuyển đổi base64 DataURL thành Blob
    dataURLtoBlob(dataurl) {
        let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], {type:mime});
    }

    // HIỆU ỨNG AI QUÉT QUÉT ẢNH (AI SCANNER FLOW)
    async runAIScanner(imgSrc, fallbackDamages, fallbackVehicleInfo = null) {
        this.state.isScanning = true;
        this.state.selectedDamageId = null;
        
        // Tắt công cụ vẽ thủ công khi đang quét
        this.canvas.setDrawMode(false);
        document.getElementById("btn-draw-tool").classList.remove("active");
        
        // Hiện hiệu ứng quét CSS
        const canvasWrap = document.querySelector(".canvas-wrapper");
        canvasWrap.classList.add("scanning");
        
        // Reset canvas trống và chỉ nạp ảnh nền trước, chưa hiện bounding box
        this.canvas.loadImage(imgSrc, [], null);
        
        // Vô hiệu hóa nút gửi trong lúc quét
        document.getElementById("btn-submit").disabled = true;
        this.renderDamageList([]); // Danh sách trống
        this.clearPricingUI();
        
        // Reset thanh tiến trình
        const fillBar = document.querySelector(".scan-progress-bar-fill");
        fillBar.style.width = "0%";
        void fillBar.offsetWidth; // Trigger reflow
        fillBar.style.width = "100%";
        
        const startTime = Date.now();
        const minScanDuration = 2500; // Đảm bảo thời gian quét mượt mà tối thiểu 2.5s
        
        let finalDamages = fallbackDamages;
        let finalVehicleInfo = fallbackVehicleInfo || { ...this.state.currentVehicleInfo };
        let isRealAI = false;
        let responseData = null;
        
        const statusEl = document.getElementById("canvas-status-text");
        statusEl.innerHTML = "CHẾ ĐỘ: <span style='color: var(--primary); font-weight: 600;'>AI đang quét phân tích thiệt hại (YOLOv8)...</span>";
        
        try {
            console.log("Đang chuyển đổi nguồn ảnh thành Blob...");
            const blob = await this.getImageBlob(imgSrc);
            
            console.log("Đang gọi máy chủ AI thực tế http://localhost:8000/detect...");
            const formData = new FormData();
            formData.append("file", blob, "claim_image.png");
            
            // Tự động hủy yêu cầu nếu server AI đơ quá 8 giây
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
            const response = await fetch("http://localhost:8000/detect", {
                method: "POST",
                body: formData,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                console.log("Đã nhận phản hồi thành công từ AI Backend!", data);
                
                responseData = data;
                finalDamages = data.damages;
                finalVehicleInfo = data.vehicleInfo;
                isRealAI = true;
            } else {
                throw new Error(`AI Server trả về mã lỗi: ${response.status}`);
            }
        } catch (err) {
            console.warn("Không kết nối được tới AI Backend. Chuyển sang mô phỏng dự phòng cục bộ.", err);
            // Giữ nguyên các giá trị dự phòng
        }
        
        const elapsedTime = Date.now() - startTime;
        const remainingDelay = Math.max(0, minScanDuration - elapsedTime);
        
        setTimeout(() => {
            this.state.isScanning = false;
            canvasWrap.classList.remove("scanning");
            
            // Cập nhật trạng thái ứng dụng
            this.state.detectedDamages = finalDamages;
            this.state.currentVehicleInfo = finalVehicleInfo;
            
            // Nạp bounding boxes neon lên canvas
            this.canvas.setDamages(finalDamages, null);
            
            // Bật lại các công cụ tương tác và cập nhật trạng thái chế độ
            if (isRealAI) {
                statusEl.innerHTML = "CHẾ ĐỘ: <span style='color: var(--secondary);'>Click chọn vùng bị lỗi (AI Thực Tế)</span>";
            } else {
                statusEl.innerHTML = "CHẾ ĐỘ: <span>Click chọn vùng bị lỗi (Mô phỏng dự phòng)</span>";
            }
            
            document.getElementById("btn-submit").disabled = false;
            
            // Cập nhật biểu mẫu thông tin xe
            this.updateVehicleForm(this.state.currentCase !== "custom");
            
            // Cập nhật badge OCR hiển thị
            if (this.state.currentCase === "custom") {
                document.querySelectorAll(".ocr-badge").forEach(badge => {
                    badge.style.display = "flex";
                    if (isRealAI) {
                        badge.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:14px;height:14px;margin-right:4px;">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Tự động điền (AI Real-time)
                        `;
                        badge.style.background = "rgba(16, 185, 129, 0.15)";
                        badge.style.borderColor = "var(--secondary)";
                        badge.style.color = "var(--secondary)";
                    } else {
                        badge.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:14px;height:14px;margin-right:4px;">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Tự động điền (Mô phỏng)
                        `;
                        badge.style.background = "rgba(245, 158, 11, 0.15)";
                        badge.style.borderColor = "var(--warning)";
                        badge.style.color = "var(--warning)";
                    }
                });
            } else {
                document.querySelectorAll(".ocr-badge").forEach(badge => {
                    badge.style.display = "none";
                });
            }
            
            // Cập nhật AI Metrics Panel
            const totalElapsedTime = Date.now() - startTime;
            if (isRealAI && responseData) {
                const latency = responseData.inferenceTime ? Math.round(responseData.inferenceTime * 1000) : Math.round(totalElapsedTime);
                this.updateAIMetrics(Math.max(50, latency), "YOLOv8m (Fine-tuned)", "NVIDIA GPU (CUDA)", true);
            } else {
                const latency = Math.round(150 + Math.random() * 120);
                this.updateAIMetrics(latency, "Simulation Engine (Fallback)", "Local CPU (Simulation)", false);
            }
            
            // Re-render danh sách hư hại và tính lại tiền bồi thường
            this.renderDamageList(finalDamages);
            this.recalculateCosts();
        }, remainingDelay);
    }
    
    // TƯƠNG TÁC LỰA CHỌN LỖI (DAMAGE SELECTION)
    handleDamageSelect(damageId) {
        this.state.selectedDamageId = damageId;
        
        // Nổi bật dòng tương ứng trong Danh sách bên cạnh
        document.querySelectorAll(".damage-item").forEach(item => {
            item.classList.remove("active");
            if (item.getAttribute("data-dmg-id") === damageId) {
                item.classList.add("active");
                item.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        });
        
        // Cập nhật trên Canvas
        this.canvas.setSelectedId(damageId);
    }
    
    // VẼ KHU VỰC HƯ HẠI THỦ CÔNG (MANUAL ANNOTATION)
    handleManualDraw(box) {
        // Tên các linh kiện ngẫu nhiên khi vẽ thủ công để tạo sự chân thực
        const manualParts = [
            { key: "Fender", name: "Ốp hông / Chắn bùn" },
            { key: "Door", name: "Cánh cửa hông" },
            { key: "Mirror", name: "Gương chiếu hậu" },
            { key: "Headlamp", name: "Cụm đèn pha" },
            { key: "Bumper", name: "Cản xe" }
        ];
        
        const part = manualParts[Math.floor(Math.random() * manualParts.length)];
        
        const newDmg = {
            id: `dmg_manual_${Date.now()}`,
            partKey: part.key,
            partName: part.name,
            severity: "Medium",
            action: "Repair",
            confidence: 99.0, // Vẽ tay độ tin cậy tuyệt đối
            box: box
        };
        
        this.state.detectedDamages.push(newDmg);
        this.canvas.setDamages(this.state.detectedDamages, newDmg.id);
        
        this.renderDamageList(this.state.detectedDamages);
        this.handleDamageSelect(newDmg.id);
        this.recalculateCosts();
    }
    
    // Thay đổi Hành động (Sửa / Thay thế)
    toggleDamageAction(damageId, action) {
        const dmg = this.state.detectedDamages.find(d => d.id === damageId);
        if (dmg) {
            dmg.action = action;
            this.recalculateCosts();
        }
    }
    
    // Xóa một lỗi khỏi danh sách
    deleteDamage(damageId) {
        this.state.detectedDamages = this.state.detectedDamages.filter(d => d.id !== damageId);
        
        if (this.state.selectedDamageId === damageId) {
            this.state.selectedDamageId = null;
        }
        
        this.canvas.setDamages(this.state.detectedDamages, this.state.selectedDamageId);
        this.renderDamageList(this.state.detectedDamages);
        this.recalculateCosts();
    }
    
    // RENDER DANH SÁCH LỖI PHÁT HIỆN ĐƯỢC
    renderDamageList(damages) {
        const listContainer = document.getElementById("damage-list");
        listContainer.innerHTML = "";
        
        if (damages.length === 0) {
            listContainer.innerHTML = `<div class="empty-damage-state">Chưa phát hiện hư hại nào. Hãy chọn ca mẫu hoặc tải lên ảnh mới.</div>`;
            return;
        }
        
        damages.forEach(dmg => {
            const item = document.createElement("div");
            item.className = "damage-item";
            item.setAttribute("data-dmg-id", dmg.id);
            if (dmg.id === this.state.selectedDamageId) {
                item.classList.add("active");
            }
            
            const sevClass = dmg.severity.toLowerCase();
            const confidencePercent = Math.round(dmg.confidence);
            
            item.innerHTML = `
                <div class="dmg-item-left">
                    <div class="dmg-badge ${sevClass}"></div>
                    <div class="dmg-details">
                        <span class="dmg-part">${dmg.partName}</span>
                        <span class="dmg-meta">Mức độ: <span style="color:var(--sev-${sevClass})">${SEVERITY_MULTIPLIERS[dmg.severity].text}</span> | AI: <span>${confidencePercent}%</span></span>
                    </div>
                </div>
                <div class="dmg-item-right">
                    <div class="dmg-action-selector">
                        <button class="btn-action-toggle ${dmg.action === 'Repair' ? 'active' : ''}" data-action="Repair">Sửa</button>
                        <button class="btn-action-toggle ${dmg.action === 'Replace' ? 'active' : ''}" data-action="Replace">Thay</button>
                    </div>
                    <button class="btn-delete-dmg" title="Xóa lỗi này">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            `;
            
            // Thêm các trình lắng nghe sự kiện
            item.addEventListener("click", (e) => {
                // Tránh bắt sự kiện click khi click vào các nút bên trong dòng
                if (!e.target.closest(".dmg-action-selector") && !e.target.closest(".btn-delete-dmg")) {
                    this.handleDamageSelect(dmg.id);
                }
            });
            
            const btnRepair = item.querySelector('[data-action="Repair"]');
            const btnReplace = item.querySelector('[data-action="Replace"]');
            
            btnRepair.addEventListener("click", () => {
                btnRepair.classList.add("active");
                btnReplace.classList.remove("active");
                this.toggleDamageAction(dmg.id, "Repair");
            });
            
            btnReplace.addEventListener("click", () => {
                btnReplace.classList.add("active");
                btnRepair.classList.remove("active");
                this.toggleDamageAction(dmg.id, "Replace");
            });
            
            item.querySelector(".btn-delete-dmg").addEventListener("click", (e) => {
                e.stopPropagation();
                this.deleteDamage(dmg.id);
            });
            
            listContainer.appendChild(item);
        });
    }
    
    // TÍNH TOÁN VÀ CẬP NHẬT CHI PHÍ (COST CALCULATION)
    recalculateCosts() {
        let totalPart = 0;
        let totalLabor = 0;
        let grandTotal = 0;
        
        this.state.detectedDamages.forEach(dmg => {
            const cost = calculateDamageCost(dmg, PART_PRICING, this.state.useOEM);
            totalPart += cost.partCost;
            totalLabor += cost.laborCost;
            grandTotal += cost.total;
        });
        
        const deductible = this.state.deductible;
        const covered = Math.max(0, grandTotal - deductible);
        
        // Cập nhật giao diện tiền tệ VNĐ
        document.getElementById("cost-parts").innerText = totalPart.toLocaleString("vi-VN") + " ₫";
        document.getElementById("cost-labor").innerText = totalLabor.toLocaleString("vi-VN") + " ₫";
        document.getElementById("cost-subtotal").innerText = grandTotal.toLocaleString("vi-VN") + " ₫";
        document.getElementById("cost-covered").innerText = covered.toLocaleString("vi-VN") + " ₫";
        
        // Tắt bật hiển thị tổng chi phí sửa đổi
        const submitBtn = document.getElementById("btn-submit");
        if (this.state.detectedDamages.length > 0) {
            submitBtn.innerText = `GỬI HỒ SƠ YÊU CẦU (${grandTotal.toLocaleString("vi-VN")} ₫)`;
            submitBtn.disabled = false;
        } else {
            submitBtn.innerText = "GỬI HỒ SƠ YÊU CẦU";
            submitBtn.disabled = true;
        }
    }
    
    clearPricingUI() {
        document.getElementById("cost-parts").innerText = "0 ₫";
        document.getElementById("cost-labor").innerText = "0 ₫";
        document.getElementById("cost-subtotal").innerText = "0 ₫";
        document.getElementById("cost-covered").innerText = "0 ₫";
    }
    
    // GỬI HỒ SƠ LÊN HỆ THỐNG
    submitClaimForm() {
        if (this.state.detectedDamages.length === 0) return;
        
        // Nếu là ảnh tự tải lên, đọc giá trị xe từ Form người dùng tự nhập để lưu trữ chuẩn xác
        if (this.state.currentCase === "custom") {
            this.state.currentVehicleInfo = {
                brand: document.getElementById("v-brand").value.trim(),
                model: document.getElementById("v-model").value.trim(),
                year: document.getElementById("v-year").value.trim(),
                plate: document.getElementById("v-plate").value.trim(),
                vin: document.getElementById("v-vin").value.trim(),
                color: document.getElementById("v-color").value.trim()
            };
        }
        
        const info = this.state.currentVehicleInfo;
        let totalPart = 0;
        let totalLabor = 0;
        let grandTotal = 0;
        
        this.state.detectedDamages.forEach(dmg => {
            const cost = calculateDamageCost(dmg, PART_PRICING, this.state.useOEM);
            grandTotal += cost.total;
        });
        
        const deductible = this.state.deductible;
        const covered = Math.max(0, grandTotal - deductible);
        
        const newClaimId = `CLM-2026-${Math.floor(100 + Math.random() * 900)}`;
        
        const newClaim = {
            id: newClaimId,
            date: new Date().toISOString(),
            plate: info.plate || "Không có",
            vehicle: `${info.brand} ${info.model}`,
            damageCount: this.state.detectedDamages.length,
            damageParts: this.state.detectedDamages.map(d => d.partKey),
            totalEstimate: grandTotal,
            status: "In_Review", // Mặc định Đang xử lý
            deductible: deductible,
            insuranceCovered: covered
        };
        
        // Lưu vào localStorage
        saveClaimToHistory(newClaim);
        
        // Hiển thị Popup thành công với mã tra cứu hồ sơ bồi thường
        document.getElementById("success-claim-id").innerText = newClaimId;
        document.getElementById("success-modal").classList.add("active");
    }
    
    closeSuccessModal() {
        document.getElementById("success-modal").classList.remove("active");
        
        // Tải lại lịch sử hồ sơ
        this.state.claimsHistory = getClaimsHistory();
        
        // Chuyển hướng sang Tab lịch sử để người dùng thấy hồ sơ của mình vừa xuất hiện
        this.switchTab("history");
        
        // Reset Dashboard về trạng thái ban đầu của ca mẫu 1
        this.loadSampleCase("case_bumper");
    }
    
    // HIỂN THỊ TRANG LỊCH SỬ HỒ SƠ & BIỂU ĐỒ PHÂN TÍCH (CLAIMS HISTORY & STATS)
    renderClaimsHistory() {
        const claims = this.state.claimsHistory;
        
        // A. Tính toán dữ liệu Thẻ Thống kê
        const totalClaims = claims.length;
        
        let sumTotal = 0;
        let approvedCount = 0;
        
        claims.forEach(c => {
            sumTotal += c.totalEstimate;
            if (c.status === "Approved" || c.status === "Paid") {
                approvedCount++;
            }
        });
        
        const avgClaimVal = totalClaims > 0 ? Math.round(sumTotal / totalClaims) : 0;
        
        // Đưa dữ liệu lên UI
        document.getElementById("stat-total-claims").innerText = totalClaims;
        document.getElementById("stat-total-value").innerText = sumTotal.toLocaleString("vi-VN") + " ₫";
        document.getElementById("stat-approved-rate").innerText = totalClaims > 0 ? Math.round((approvedCount / totalClaims) * 100) + "%" : "0%";
        
        // B. Vẽ Danh sách dòng của Bảng
        const tbody = document.getElementById("claims-table-body");
        tbody.innerHTML = "";
        
        if (claims.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dark);font-style:italic;">Chưa có hồ sơ bồi thường nào được gửi lên hệ thống.</td></tr>`;
            this.renderAnalyticsCharts();
            return;
        }
        
        claims.forEach(c => {
            const tr = document.createElement("tr");
            
            // Format Ngày tháng
            const d = new Date(c.date);
            const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            
            // Nhãn trạng thái
            let statusText = "Đang xử lý";
            let statusClass = "in_review";
            if (c.status === "Approved") { statusText = "Đã duyệt"; statusClass = "approved"; }
            if (c.status === "Paid") { statusText = "Đã chi trả"; statusClass = "paid"; }
            
            tr.innerHTML = `
                <td class="claim-id">${c.id}</td>
                <td>${dateStr}</td>
                <td style="font-weight: 500;">${c.vehicle} <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Biển: ${c.plate}</div></td>
                <td style="text-align: center;">${c.damageCount}</td>
                <td style="font-weight: 600;color:var(--primary);text-align: right;">${c.totalEstimate.toLocaleString("vi-VN")} ₫</td>
                <td><span class="claim-status-badge ${statusClass}">${statusText}</span></td>
            `;
            
            tbody.appendChild(tr);
        });
        
        // Vẽ biểu đồ phân tích SVG v2.0
        this.renderAnalyticsCharts();
    }

    // Vẽ biểu đồ phân tích SVG và cơ cấu tổn thất (v2.0 New)
    renderAnalyticsCharts() {
        const claims = this.state.claimsHistory;
        
        // 1. Phân tích Damage Distribution (Donut Chart)
        const PART_COLORS = {
            "Bumper": "#00f2fe",
            "Windshield": "#3b82f6",
            "Door": "#a855f7",
            "Headlamp": "#ec4899",
            "Fender": "#10b981",
            "Mirror": "#f59e0b",
            "Hood": "#e11d48"
        };

        const partCounts = {};
        let totalDamagesCount = 0;

        claims.forEach(c => {
            let parts = c.damageParts;
            // Fallback cho dữ liệu ban đầu chưa có mảng damageParts
            if (!parts || parts.length === 0) {
                if (c.id === "CLM-2026-001") parts = ["Bumper", "Headlamp"];
                else if (c.id === "CLM-2026-002") parts = ["Windshield"];
                else parts = [];
            }
            
            parts.forEach(part => {
                partCounts[part] = (partCounts[part] || 0) + 1;
                totalDamagesCount++;
            });
        });

        const slicesContainer = document.getElementById("donut-chart-slices");
        const legendContainer = document.getElementById("donut-chart-legend");
        const totalCountEl = document.getElementById("donut-total-count");

        if (slicesContainer && legendContainer && totalCountEl) {
            let slicesHTML = "";
            let legendHTML = "";

            if (totalDamagesCount === 0) {
                // Biểu đồ rỗng
                slicesHTML = `<circle cx="80" cy="80" r="60" fill="transparent" stroke="rgba(255,255,255,0.05)" stroke-width="14"></circle>`;
                legendHTML = `<div style="color: var(--text-dark); text-align: center; font-size: 11px; width: 100%; margin-top: 10px;">Chưa có dữ liệu tổn thất</div>`;
                totalCountEl.textContent = "0";
            } else {
                totalCountEl.textContent = totalDamagesCount;
                
                // Sắp xếp các linh kiện hư hại có lỗi xuất hiện để hiển thị
                const activeParts = Object.keys(PART_COLORS).filter(part => (partCounts[part] || 0) > 0);
                
                let accumulatedOffset = 0;
                // Chu vi của vòng tròn có r = 60 là 2 * PI * 60 = 376.99 (lấy tròn 377)
                const C = 377;

                activeParts.forEach(part => {
                    const count = partCounts[part];
                    const pct = Math.round((count / totalDamagesCount) * 100);
                    const color = PART_COLORS[part];
                    const partName = PART_PRICING[part]?.name || part;

                    const sliceSize = (count / totalDamagesCount) * C;
                    const strokeDashArray = `${sliceSize.toFixed(2)} ${C}`;
                    const strokeDashOffset = -accumulatedOffset;

                    slicesHTML += `
                        <circle class="donut-slice" cx="80" cy="80" r="60" fill="transparent" 
                                stroke="${color}" stroke-width="14" 
                                style="stroke-dasharray: ${strokeDashArray}; stroke-dashoffset: ${strokeDashOffset.toFixed(2)}; color: ${color};"
                                data-part="${part}">
                            <title>${partName}: ${count} lỗi (${pct}%)</title>
                        </circle>
                    `;

                    legendHTML += `
                        <div class="legend-item" data-part="${part}">
                            <div class="legend-label-group">
                                <span class="legend-dot" style="background-color: ${color}; color: ${color};"></span>
                                <span class="legend-name">${partName}</span>
                            </div>
                            <div class="legend-value-group">
                                <span class="legend-val">${count}</span>
                                <span class="legend-pct">${pct}%</span>
                            </div>
                        </div>
                    `;

                    accumulatedOffset += sliceSize;
                });
            }

            slicesContainer.innerHTML = slicesHTML;
            legendContainer.innerHTML = legendHTML;
        }

        // 2. Phân tích Claims Status (Bar Chart)
        let inReviewCount = 0;
        let approvedCount = 0;
        let paidCount = 0;

        claims.forEach(c => {
            const status = c.status ? c.status.toLowerCase() : "";
            if (status === "in_review" || status === "in-review") {
                inReviewCount++;
            } else if (status === "approved") {
                approvedCount++;
            } else if (status === "paid") {
                paidCount++;
            }
        });

        // Chiều cao tối đa của cột là 110px (Y từ 130 xuống 20)
        const maxBarHeight = 110;
        const maxStatusCount = Math.max(inReviewCount, approvedCount, paidCount, 1);

        const heightInReview = (inReviewCount / maxStatusCount) * maxBarHeight;
        const heightApproved = (approvedCount / maxStatusCount) * maxBarHeight;
        const heightPaid = (paidCount / maxStatusCount) * maxBarHeight;

        const updateBar = (rectId, lblId, count, height) => {
            const rectEl = document.getElementById(rectId);
            const lblEl = document.getElementById(lblId);
            if (rectEl && lblEl) {
                const y = 130 - height;
                rectEl.setAttribute("height", height);
                rectEl.setAttribute("y", y);
                
                lblEl.textContent = count;
                lblEl.setAttribute("y", y - 5);
                lblEl.style.opacity = count > 0 ? 1 : 0;
            }
        };

        // Kích hoạt animation cột dâng lên mượt mà bằng cách bọc trong setTimeout nhỏ
        setTimeout(() => {
            updateBar("bar-in-review", "lbl-in-review", inReviewCount, heightInReview);
            updateBar("bar-approved", "lbl-approved", approvedCount, heightApproved);
            updateBar("bar-paid", "lbl-paid", paidCount, heightPaid);
        }, 50);
    }

    // Ping định kỳ trạng thái của máy chủ AI FastAPI (v2.0 New)
    async checkBackendStatus() {
        try {
            const response = await fetch("http://localhost:8000/", {
                method: "GET",
                // Thiết lập AbortController timeout 2 giây để tránh chờ đợi lâu
                signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : null
            });
            if (response.ok || response.status === 404 || response.status === 405) {
                if (!this.state.isScanning) {
                    this.updateAIMetrics(null, "YOLOv8m (Fine-tuned)", "NVIDIA GPU (CUDA)", true);
                }
            } else {
                throw new Error("Mất kết nối máy chủ AI");
            }
        } catch (err) {
            if (!this.state.isScanning) {
                this.updateAIMetrics(null, "Simulation Engine (Fallback)", "Local CPU (Simulation)", false);
            }
        }
    }

    // Cập nhật các chỉ số hiệu năng trên AI Metrics Panel (v2.0 New)
    updateAIMetrics(latencyMs, modelName, deviceType, isOnline) {
        const statusDot = document.getElementById("metric-api-status-dot");
        const statusText = document.getElementById("metric-api-status-text");
        const modelNameEl = document.getElementById("metric-model-name");
        const deviceEl = document.getElementById("metric-device");
        const latencyEl = document.getElementById("metric-latency");

        if (statusDot && statusText) {
            statusDot.className = "status-pulse-dot";
            if (isOnline) {
                statusDot.classList.add("online");
                statusText.textContent = "AI ONLINE (SSL)";
            } else {
                statusDot.classList.add("simulating");
                statusText.textContent = "OFFLINE (LOCAL SCAN)";
            }
        }

        if (modelNameEl) {
            modelNameEl.textContent = modelName;
        }

        if (deviceEl) {
            deviceEl.textContent = deviceType;
        }

        if (latencyEl) {
            if (latencyMs !== null && latencyMs !== undefined) {
                latencyEl.textContent = `${latencyMs} ms`;
            } else {
                latencyEl.textContent = isOnline ? "Sẵn sàng" : "Mô phỏng";
            }
        }
    }
}
