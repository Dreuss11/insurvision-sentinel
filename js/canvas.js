/**
 * InsurVision Auto - Interactive Canvas Component
 * Quản lý vẽ hình ảnh xe, hiển thị các bounding box neon, phát hiện sự kiện hover/click
 * và cho phép vẽ thêm khung hư hại thủ công.
 */

class DamageCanvas {
    constructor(canvasElement, containerElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext("2d");
        this.container = containerElement;
        
        // Trạng thái hiển thị
        this.img = null;
        this.damages = [];
        this.selectedId = null;
        this.hoveredId = null;
        
        // Chế độ vẽ thủ công
        this.isDrawMode = false;
        this.isDrawing = false;
        this.drawStart = { x: 0, y: 0 };
        this.drawEnd = { x: 0, y: 0 };
        
        // Các hàm callback gọi ngược ra ngoài App
        this.onSelectCallback = null;
        this.onDrawCompleteCallback = null;
        
        this.initEvents();
    }
    
    // Đăng ký các sự kiện chuột trên Canvas
    initEvents() {
        // Sự kiện thay đổi kích thước cửa sổ để tự điều chỉnh canvas
        window.addEventListener("resize", () => this.resize());
        
        this.canvas.addEventListener("mousemove", (e) => this.handleMouseMove(e));
        this.canvas.addEventListener("mousedown", (e) => this.handleMouseDown(e));
        this.canvas.addEventListener("mouseup", (e) => this.handleMouseUp(e));
        this.canvas.addEventListener("mouseleave", () => {
            this.hoveredId = null;
            if (this.isDrawing) {
                this.isDrawing = false;
                this.render();
            } else {
                this.render();
            }
        });
    }
    
    // Tải ảnh xe vào Canvas
    loadImage(src, damages = [], selectedId = null) {
        this.img = new Image();
        this.img.src = src;
        this.damages = damages;
        this.selectedId = selectedId;
        this.hoveredId = null;
        this.isDrawing = false;
        
        this.img.onload = () => {
            this.resize();
            this.render();
        };
    }
    
    // Cập nhật danh sách hư hại hiện thời
    setDamages(damages, selectedId = null) {
        this.damages = damages;
        this.selectedId = selectedId;
        this.render();
    }
    
    // Chọn lỗi để nổi bật
    setSelectedId(selectedId) {
        this.selectedId = selectedId;
        this.render();
    }
    
    // Bật/tắt chế độ vẽ thủ công
    setDrawMode(enabled) {
        this.isDrawMode = enabled;
        if (enabled) {
            this.canvas.style.cursor = "crosshair";
        } else {
            this.canvas.style.cursor = "default";
        }
    }
    
    // Đăng ký Callback khi Click chọn lỗi
    onSelect(callback) {
        this.onSelectCallback = callback;
    }
    
    // Đăng ký Callback khi Vẽ xong một lỗi mới
    onDrawComplete(callback) {
        this.onDrawCompleteCallback = callback;
    }
    
    // Điều chỉnh kích thước canvas khớp với container và tỷ lệ ảnh
    resize() {
        if (!this.img) return;
        
        // Lấy chiều rộng vùng chứa
        const containerWidth = this.container.clientWidth;
        
        // Điều chỉnh canvas theo chiều rộng container và giữ tỷ lệ ảnh
        const aspectRatio = this.img.naturalHeight / this.img.naturalWidth;
        const targetHeight = containerWidth * aspectRatio;
        
        // Cập nhật kích thước vật lý của Canvas
        this.canvas.width = containerWidth;
        this.canvas.height = targetHeight;
        
        // Cập nhật kích thước hiển thị CSS
        this.canvas.style.width = `${containerWidth}px`;
        this.canvas.style.height = `${targetHeight}px`;
    }
    
    // Đổi tọa độ chuột sang tọa độ tương đối (0.0 -> 1.0)
    getRelativeCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        // Lấy tọa độ chuột trên canvas thực tế
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        
        return {
            x: canvasX / this.canvas.width,
            y: canvasY / this.canvas.height
        };
    }
    
    // Xử lý khi chuột di chuyển trên canvas
    handleMouseMove(e) {
        if (!this.img) return;
        
        const coords = this.getRelativeCoords(e);
        
        if (this.isDrawing) {
            this.drawEnd = coords;
            this.render();
            return;
        }
        
        // Nếu ở chế độ vẽ thủ công, đổi cursor thành chữ thập
        if (this.isDrawMode) {
            this.canvas.style.cursor = "crosshair";
            return;
        }
        
        // Tìm kiếm xem chuột có đang nằm trong bounding box nào không (từ trên xuống dưới)
        let foundId = null;
        // Quét ngược từ cuối lên đầu để bắt cái được vẽ sau cùng (nằm đè lên trước)
        for (let i = this.damages.length - 1; i >= 0; i--) {
            const dmg = this.damages[i];
            const box = dmg.box;
            if (coords.x >= box.x && coords.x <= box.x + box.w &&
                coords.y >= box.y && coords.y <= box.y + box.h) {
                foundId = dmg.id;
                break;
            }
        }
        
        if (foundId !== this.hoveredId) {
            this.hoveredId = foundId;
            this.canvas.style.cursor = foundId ? "pointer" : "default";
            this.render();
        }
    }
    
    // Xử lý click chuột xuống
    handleMouseDown(e) {
        if (!this.img || e.button !== 0) return; // Chỉ tính chuột trái
        
        const coords = this.getRelativeCoords(e);
        
        if (this.isDrawMode) {
            this.isDrawing = true;
            this.drawStart = coords;
            this.drawEnd = coords;
            this.render();
        }
    }
    
    // Xử lý khi thả chuột ra
    handleMouseUp(e) {
        if (!this.img || e.button !== 0) return;
        
        const coords = this.getRelativeCoords(e);
        
        if (this.isDrawing) {
            this.isDrawing = false;
            
            // Tính toán kích thước của hộp vẽ
            const x = Math.min(this.drawStart.x, coords.x);
            const y = Math.min(this.drawStart.y, coords.y);
            const w = Math.abs(this.drawStart.x - coords.x);
            const h = Math.abs(this.drawStart.y - coords.y);
            
            // Chỉ chấp nhận nếu hộp có kích thước tối thiểu (tránh click nhầm)
            if (w > 0.015 && h > 0.015) {
                const newBox = { x, y, w, h };
                if (this.onDrawCompleteCallback) {
                    this.onDrawCompleteCallback(newBox);
                }
            } else {
                this.render();
            }
        } else if (!this.isDrawMode) {
            // Chế độ click chọn lỗi
            if (this.hoveredId) {
                this.selectedId = this.hoveredId;
                if (this.onSelectCallback) {
                    this.onSelectCallback(this.selectedId);
                }
                this.render();
            } else {
                // Click ra ngoài thì bỏ chọn
                this.selectedId = null;
                if (this.onSelectCallback) {
                    this.onSelectCallback(null);
                }
                this.render();
            }
        }
    }
    
    // Render toàn bộ nội dung lên Canvas
    render() {
        if (!this.img) return;
        
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        // 1. Vẽ ảnh xe gốc lên canvas
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.drawImage(this.img, 0, 0, w, h);
        
        // 2. Vẽ một lớp phủ tối mờ cực kỳ sang trọng để làm nổi bật khung neon
        this.ctx.fillStyle = "rgba(10, 15, 30, 0.25)";
        this.ctx.fillRect(0, 0, w, h);
        
        // 3. Vẽ các bounding boxes
        this.damages.forEach(dmg => {
            const box = dmg.box;
            const bx = box.x * w;
            const by = box.y * h;
            const bw = box.w * w;
            const bh = box.h * h;
            
            const isSelected = dmg.id === this.selectedId;
            const isHovered = dmg.id === this.hoveredId;
            
            // Lấy màu sắc dựa trên mức độ nghiêm trọng
            let color = "#ef4444"; // Mặc định Đỏ (High)
            if (dmg.severity === "Medium") color = "#f59e0b"; // Cam (Medium)
            if (dmg.severity === "Low") color = "#10b981"; // Xanh lá (Low)
            
            // A. Vẽ hiệu ứng phủ màu bên trong (semi-transparent fill)
            let fillAlpha = 0.12;
            if (isSelected) fillAlpha = 0.28;
            else if (isHovered) fillAlpha = 0.22;
            
            this.ctx.fillStyle = this.hexToRgba(color, fillAlpha);
            this.ctx.fillRect(bx, by, bw, bh);
            
            // B. Vẽ hiệu ứng Neon Glow cho viền (vẽ 3 lớp nét viền mờ chồng lên nhau)
            if (isSelected || isHovered) {
                // Tạo hào quang phát sáng dày hơn cho đối tượng được chọn/di chuột qua
                this.ctx.shadowColor = color;
                this.ctx.shadowBlur = isSelected ? 15 : 8;
                this.ctx.strokeStyle = this.hexToRgba(color, 0.4);
                this.ctx.lineWidth = 5;
                this.ctx.strokeRect(bx, by, bw, bh);
                
                this.ctx.strokeStyle = this.hexToRgba(color, 0.7);
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(bx, by, bw, bh);
            } else {
                // Hào quang nhẹ cho các lỗi bình thường
                this.ctx.shadowBlur = 3;
                this.ctx.shadowColor = color;
                this.ctx.strokeStyle = this.hexToRgba(color, 0.5);
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(bx, by, bw, bh);
            }
            
            // Nét vẽ trung tâm sáng nhất (không đổ bóng shadow)
            this.ctx.shadowBlur = 0;
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeRect(bx, by, bw, bh);
            
            // C. Vẽ góc bo trang trí công nghệ tương lai (Futuristic Corners)
            this.drawCornerDeco(bx, by, bw, bh, color, isSelected ? 10 : 6);
            
            // D. Hiển thị nhãn tên bộ phận nhỏ phía trên khung
            this.drawLabel(bx, by, bw, bh, dmg, color, isSelected);
        });
        
        // 4. Vẽ hộp khi người dùng đang tự vẽ bằng chuột
        if (this.isDrawing) {
            const bx = Math.min(this.drawStart.x, this.drawEnd.x) * w;
            const by = Math.min(this.drawStart.y, this.drawEnd.y) * h;
            const bw = Math.abs(this.drawStart.x - this.drawEnd.x) * w;
            const bh = Math.abs(this.drawStart.y - this.drawEnd.y) * h;
            
            const drawColor = "#a855f7"; // Tím neon cho vẽ tay
            
            this.ctx.setLineDash([6, 4]); // Nét đứt
            this.ctx.strokeStyle = drawColor;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(bx, by, bw, bh);
            this.ctx.setLineDash([]); // Reset nét đứt
            
            this.ctx.fillStyle = "rgba(168, 85, 247, 0.15)";
            this.ctx.fillRect(bx, by, bw, bh);
            
            // Nhãn "Đang vẽ..."
            this.ctx.fillStyle = drawColor;
            this.ctx.font = "bold 11px Outfit, Inter, Arial";
            this.ctx.fillText("ĐANG PHÂN VÙNG...", bx + 5, by - 6);
        }
    }
    
    // Vẽ nhãn đính kèm trên bounding box
    drawLabel(bx, by, bw, bh, dmg, color, isSelected) {
        const text = `${dmg.partName} (${dmg.confidence}%)`;
        this.ctx.font = isSelected ? "bold 11px Outfit, Inter, Arial" : "500 10px Outfit, Inter, Arial";
        
        const paddingX = 6;
        const paddingY = 4;
        const textWidth = this.ctx.measureText(text).width;
        const labelHeight = 16;
        
        // Vẽ nền của nhãn (Nền tối khớp màu viền)
        this.ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;
        
        // Vẽ nhãn ở góc trên cùng bên trái của box (hoặc dịch xuống nếu bị khuất góc trên)
        const lx = bx;
        const ly = by - labelHeight >= 0 ? by - labelHeight : by + 1;
        
        this.ctx.fillRect(lx, ly, textWidth + paddingX * 2, labelHeight);
        this.ctx.strokeRect(lx, ly, textWidth + paddingX * 2, labelHeight);
        
        // Vẽ chữ nhãn màu tương ứng mức độ hỏng
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillText(text, lx + paddingX, ly + 11);
    }
    
    // Vẽ góc trang trí kiểu viễn tưởng/công nghệ
    drawCornerDeco(x, y, w, h, color, len) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3;
        
        // Góc trên trái
        this.ctx.beginPath();
        this.ctx.moveTo(x + len, y);
        this.ctx.lineTo(x, y);
        this.ctx.lineTo(x, y + len);
        this.ctx.stroke();
        
        // Góc trên phải
        this.ctx.beginPath();
        this.ctx.moveTo(x + w - len, y);
        this.ctx.lineTo(x + w, y);
        this.ctx.lineTo(x + w, y + len);
        this.ctx.stroke();
        
        // Góc dưới trái
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + h - len);
        this.ctx.lineTo(x, y + h);
        this.ctx.lineTo(x + len, y + h);
        this.ctx.stroke();
        
        // Góc dưới phải
        this.ctx.beginPath();
        this.ctx.moveTo(x + w - len, y + h);
        this.ctx.lineTo(x + w, y + h);
        this.ctx.lineTo(x + w, y + h - len);
        this.ctx.stroke();
    }
    
    // Helper đổi màu Hex sang Rgba
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}
