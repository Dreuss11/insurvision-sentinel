/**
 * InsurVision Auto - Data Layer & Simulation Database
 * Chứa thông tin về bảng giá, dữ liệu mẫu của xe và các chức năng giả lập AI
 */

// Bảng giá linh kiện và nhân công cơ bản (Đơn vị: VNĐ)
const PART_PRICING = {
    "Bumper": {
        name: "Cản trước/sau",
        basePartCost: 3500000,
        baseLaborCost: 1200000,
        repairTime: "4 giờ",
        replacementTime: "1 ngày"
    },
    "Windshield": {
        name: "Kính chắn gió",
        basePartCost: 8000000,
        baseLaborCost: 1500000,
        repairTime: "3 giờ",
        replacementTime: "6 giờ"
    },
    "Door": {
        name: "Cửa hông xe",
        basePartCost: 5500000,
        baseLaborCost: 2000000,
        repairTime: "6 giờ",
        replacementTime: "1.5 ngày"
    },
    "Headlamp": {
        name: "Cụm đèn pha",
        basePartCost: 12000000,
        baseLaborCost: 800000,
        repairTime: "1 giờ",
        replacementTime: "2 giờ"
    },
    "Fender": {
        name: "Chắn bùn / Ốp hông",
        basePartCost: 2800000,
        baseLaborCost: 1000000,
        repairTime: "3 giờ",
        replacementTime: "1 ngày"
    },
    "Mirror": {
        name: "Gương chiếu hậu",
        basePartCost: 4500000,
        baseLaborCost: 500000,
        repairTime: "1 giờ",
        replacementTime: "1.5 giờ"
    },
    "Hood": {
        name: "Nắp Ca-pô",
        basePartCost: 7500000,
        baseLaborCost: 2500000,
        repairTime: "8 giờ",
        replacementTime: "2 ngày"
    }
};

// Hệ số nhân theo mức độ nghiêm trọng
const SEVERITY_MULTIPLIERS = {
    "Low": { text: "Nhẹ", factor: 0.3, label: "Low", color: "#10b981" },
    "Medium": { text: "Trung bình", factor: 1.0, label: "Medium", color: "#f59e0b" },
    "High": { text: "Nặng", factor: 2.8, label: "High", color: "#ef4444" }
};

// 3 trường hợp xe bị hỏng mẫu chạy thử nghiệm
const SAMPLE_CASES = [
    {
        id: "case_bumper",
        imagePath: "assets/bumper_dent.png",
        title: "Va chạm phía trước (Frontal Dent & Scratch)",
        vehicleInfo: {
            brand: "Toyota",
            model: "Camry 2.5Q",
            year: "2024",
            plate: "30F-999.88",
            vin: "MRH51BZ30J120485",
            color: "Xám Metallic"
        },
        damages: [
            {
                id: "dmg_1",
                partKey: "Bumper",
                partName: "Cản trước",
                severity: "Medium", // Low, Medium, High
                action: "Repair", // Repair, Replace
                confidence: 94.5,
                // Tọa độ tương đối (0.0 -> 1.0) trên ảnh để vẽ bounding box
                box: { x: 0.32, y: 0.52, w: 0.42, h: 0.34 }
            },
            {
                id: "dmg_2",
                partKey: "Headlamp",
                partName: "Đèn pha phải",
                severity: "Low",
                action: "Repair",
                confidence: 88.2,
                box: { x: 0.18, y: 0.42, w: 0.16, h: 0.14 }
            }
        ]
    },
    {
        id: "case_windshield",
        imagePath: "assets/cracked_windshield.png",
        title: "Nứt vỡ kính chắn gió (Spiderweb Windshield Crack)",
        vehicleInfo: {
            brand: "Mazda",
            model: "CX-5 Premium",
            year: "2023",
            plate: "51K-888.66",
            vin: "JM7KF2DY5N092471",
            color: "Trắng Ngọc Trai"
        },
        damages: [
            {
                id: "dmg_3",
                partKey: "Windshield",
                partName: "Kính chắn gió trước",
                severity: "High",
                action: "Replace",
                confidence: 98.1,
                box: { x: 0.28, y: 0.28, w: 0.48, h: 0.45 }
            }
        ]
    },
    {
        id: "case_side",
        imagePath: "assets/side_scratch.png",
        title: "Trầy xước & Móp hông cửa xe (Side Door Scratches)",
        vehicleInfo: {
            brand: "Honda",
            model: "Civic RS",
            year: "2023",
            plate: "43A-777.99",
            vin: "1HGFC2F85J019842",
            color: "Đỏ Lịch Lãm"
        },
        damages: [
            {
                id: "dmg_4",
                partKey: "Door",
                partName: "Cửa trước bên tài",
                severity: "High",
                action: "Replace",
                confidence: 91.4,
                box: { x: 0.24, y: 0.32, w: 0.45, h: 0.48 }
            },
            {
                id: "dmg_5",
                partKey: "Fender",
                partName: "Chắn bùn trước",
                severity: "Medium",
                action: "Repair",
                confidence: 86.9,
                box: { x: 0.08, y: 0.45, w: 0.18, h: 0.32 }
            }
        ]
    }
];

// Dữ liệu OCR ngẫu nhiên để tự động điền khi người dùng chụp ảnh/tải lên xe ngẫu nhiên
const MOCK_OCR_POOL = [
    { brand: "Hyundai", model: "Tucson", year: "2022", plate: "30H-123.45", vin: "KMH834FJD920193", color: "Đen" },
    { brand: "Kia", model: "Seltos", year: "2023", plate: "51L-987.65", vin: "KNA523HDS830491", color: "Đỏ" },
    { brand: "Ford", model: "Ranger Wildtrak", year: "2024", plate: "29H-555.22", vin: "MNA928DJC840192", color: "Cam" },
    { brand: "Mercedes-Benz", model: "C200 Avantgarde", year: "2023", plate: "30K-888.88", vin: "WDD2050421F38491", color: "Trắng" }
];

// Tạo danh sách lỗi ngẫu nhiên khi người dùng tải lên hình ảnh xe của riêng họ
function generateRandomDamages() {
    const damages = [];
    const parts = ["Bumper", "Door", "Fender", "Mirror", "Hood"];
    const severities = ["Low", "Medium", "High"];
    const actions = ["Repair", "Replace"];
    
    // Chọn ngẫu nhiên từ 1 đến 3 lỗi
    const numDamages = Math.floor(Math.random() * 3) + 1;
    
    // Tạo vùng bounding box không chồng chéo quá nhiều
    const regions = [
        { x: 0.15, y: 0.35, w: 0.25, h: 0.25 },
        { x: 0.45, y: 0.4, w: 0.3, h: 0.3 },
        { x: 0.2, y: 0.65, w: 0.4, h: 0.25 }
    ];

    for (let i = 0; i < numDamages && i < regions.length; i++) {
        const partKey = parts[Math.floor(Math.random() * parts.length)];
        const severity = severities[Math.floor(Math.random() * severities.length)];
        const action = severity === "High" ? "Replace" : actions[Math.floor(Math.random() * actions.length)];
        
        damages.push({
            id: `dmg_rand_${Date.now()}_${i}`,
            partKey: partKey,
            partName: PART_PRICING[partKey].name,
            severity: severity,
            action: action,
            confidence: parseFloat((80 + Math.random() * 18).toFixed(1)),
            box: regions[i]
        });
    }
    
    return damages;
}

// Tính toán chi phí cho một vết thương cụ thể
function calculateDamageCost(damage, partsPricing = PART_PRICING, useOEM = false) {
    const pricing = partsPricing[damage.partKey];
    if (!pricing) return { partCost: 0, laborCost: 0, total: 0 };

    const severityFactor = SEVERITY_MULTIPLIERS[damage.severity].factor;
    const isReplacement = damage.action === "Replace";

    let partCost = 0;
    let laborCost = 0;

    if (isReplacement) {
        // Thay mới: Giá linh kiện 100% + Nhân công thay thế
        partCost = pricing.basePartCost;
        laborCost = pricing.baseLaborCost;
    } else {
        // Sửa chữa: Giá linh kiện phụ trợ (sơn, hàn, phụ gia) tỷ lệ theo mức độ nghiêm trọng
        partCost = pricing.basePartCost * 0.15 * severityFactor;
        // Nhân công tỷ lệ theo mức độ nghiêm trọng
        laborCost = pricing.baseLaborCost * severityFactor;
    }

    // Nếu chọn phụ tùng chính hãng OEM, tăng 25% giá phụ tùng
    if (useOEM) {
        partCost *= 1.25;
    }

    partCost = Math.round(partCost / 1000) * 1000;
    laborCost = Math.round(laborCost / 1000) * 1000;

    return {
        partCost: partCost,
        laborCost: laborCost,
        total: partCost + laborCost,
        timeNeeded: isReplacement ? pricing.replacementTime : pricing.repairTime
    };
}

// Khởi tạo Claims History (Dữ liệu Lịch sử Hồ sơ) trong localStorage nếu chưa có
function getClaimsHistory() {
    const stored = localStorage.getItem("insurvision_claims");
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error("Lỗi đọc dữ liệu từ localStorage, khởi tạo lại mẫu.", e);
        }
    }
    
    // Dữ liệu mẫu ban đầu
    const initialClaims = [
        {
            id: "CLM-2026-001",
            date: "2026-05-10T14:32:00Z",
            plate: "30F-999.88",
            vehicle: "Toyota Camry 2.5Q",
            damageCount: 2,
            totalEstimate: 8740000,
            status: "Approved", // Approved, In_Review, Rejected, Paid
            deductible: 1000000,
            insuranceCovered: 7740000
        },
        {
            id: "CLM-2026-002",
            date: "2026-05-18T09:15:00Z",
            plate: "51K-888.66",
            vehicle: "Mazda CX-5 Premium",
            damageCount: 1,
            totalEstimate: 9500000,
            status: "Paid",
            deductible: 1000000,
            insuranceCovered: 8500000
        }
    ];
    
    localStorage.setItem("insurvision_claims", JSON.stringify(initialClaims));
    return initialClaims;
}

function saveClaimToHistory(claim) {
    const history = getClaimsHistory();
    history.unshift(claim); // Thêm lên đầu danh sách
    localStorage.setItem("insurvision_claims", JSON.stringify(history));
}
