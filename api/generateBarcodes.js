// 檔案路徑: /api/generateBarcodes.js

// 從 Supabase 函式庫中匯入建立連線的工具
import jwt from 'jsonwebtoken'; // 匯入 jsonwebtoken 函式庫

// 讀取我們在 Vercel 中設定好的 JWT 安全密鑰
const JWT_SECRET = process.env.JWT_SECRET;

// --- 核心演算法輔助函式 (從 Code.gs 完整移植) ---

function rocStringToDate_(rocDateStr) {
  if (!/^[0-9]{7}$/.test(rocDateStr)) {
    throw new Error("無效的民國日期格式 (應為 YYYMMDD)");
  }
  const year = parseInt(rocDateStr.substring(0, 3), 10) + 1911;
  const month = parseInt(rocDateStr.substring(3, 5), 10) - 1;
  const day = parseInt(rocDateStr.substring(5, 7), 10);
  return new Date(year, month, day);
}

function dateToRocString_(date) {
  const rocYear = date.getFullYear() - 1911;
  const rocYearStr = String(rocYear).padStart(3, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  // 回傳 YYMMDD 格式
  return `${rocYearStr.slice(-2)}${month}${day}`;
}

function convertLettersToNumbers_(text) {
  let result = "";
  const mapping = {'A':'1','B':'2','C':'3','D':'4','E':'5','F':'6','G':'7','H':'8','I':'9','J':'1','K':'2','L':'3','M':'4','N':'5','O':'6','P':'7','Q':'8','R':'9','S':'2','T':'3','U':'4','V':'5','W':'6','X':'7','Y':'8','Z':'9'};
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i).toUpperCase();
    if (mapping[char]) { result += mapping[char]; }
    else if (!isNaN(char)) { result += char; }
  }
  return result;
}

function calculateSum_(barcode, isOdd) {
  let sum = 0;
  const startIndex = isOdd ? 0 : 1;
  for (let i = startIndex; i < barcode.length; i += 2) {
    const digit = parseInt(barcode.charAt(i), 10);
    if (!isNaN(digit)) sum += digit;
  }
  return sum;
}

function getChecksumChar_(sum, isEven = false) {
  const mod = sum % 11;
  if (!isEven) { return mod === 0 ? 'A' : mod === 10 ? 'B' : String(mod); }
  else { return mod === 0 ? 'X' : mod === 10 ? 'Y' : String(mod); }
}

// --- Vercel Serverless Function 主體 ---

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // ▼▼▼ 【核心新增】驗證 JWT Token ▼▼▼
    const authHeader = request.headers['authorization'];
    // 檢查 header 中是否有 'authorization' 欄位，且格式為 'Bearer [token]'
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
      // 如果沒有 token，直接回傳 401 未授權錯誤
      return response.status(401).json({ message: '未提供授權 Token。' });
    }

    // 使用 jwt.verify 來同步驗證 token 的有效性
    // 如果驗證失敗，它會自動拋出一個錯誤，被下方的 catch 區塊捕捉
    const decodedUser = jwt.verify(token, JWT_SECRET);
    
    // (可選) 將解密後的使用者資訊附加到 request 物件上，方便後續使用
    request.user = decodedUser;
    // ▲▲▲ 【核心新增】 ▲▲▲


    // 如果 token 驗證通過，才會繼續執行下方的核心邏輯
    const params = request.body;
    const { firstBarcode, secondBarcode, paymentDue, barcodeType, qrCount, incrementAmount } = params;
    
    if (!firstBarcode || !secondBarcode || !paymentDue || !barcodeType || !qrCount) {
      return response.status(400).json({ message: "缺少必要的條碼參數。" });
    }

    const initialAmount = parseInt(params.paymentAmount, 10);

    if (initialAmount < 5) {
      return response.status(400).json({ message: "繳費金額最低只能設定 5 元。" });
    }
    
    let allData = [];
    let currentDate = rocStringToDate_(paymentDue);
    
    const convertedFirst = convertLettersToNumbers_(firstBarcode);
    const convertedSecond = convertLettersToNumbers_(secondBarcode);
    
    let currentCycleAmount = initialAmount;

    for (let i = 0; i < qrCount; i++) {
      const paddedAmount = String(currentCycleAmount).padStart(9, "0");
      const rocString = dateToRocString_(currentDate); // 取得完整的 YYMMDD
      let datePart;

      if (barcodeType === "YYMM") {
        datePart = rocString.substring(0, 4); // 取 YYMM
      } else { // MMDD
        datePart = rocString.substring(2, 6); // 取 MMDD
      }

      const oddSum = calculateSum_(convertedFirst, true) + calculateSum_(convertedSecond, true) + calculateSum_(datePart + paddedAmount, true);
      const evenSum = calculateSum_(convertedFirst, false) + calculateSum_(convertedSecond, false) + calculateSum_(datePart + paddedAmount, false);
      const oddChecksum = getChecksumChar_(oddSum);
      const evenChecksum = getChecksumChar_(evenSum, true);
      const thirdBarcode = datePart + oddChecksum + evenChecksum + paddedAmount;
      
      allData.push({ 
        serial: i + 1, 
        barcodes: [firstBarcode, secondBarcode, thirdBarcode] 
      });

      currentCycleAmount += incrementAmount;

      // 根據類型遞增日期
      if (barcodeType === "YYMM") {
        currentDate.setMonth(currentDate.getMonth() + 1);
      } else {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    
    // 成功，回傳包含所有條碼資料的陣列
    return response.status(200).json(allData);

  } catch (error) {
    // 這裡會捕捉所有錯誤，包括 JWT 驗證失敗的錯誤
    console.error('產生條碼 API 錯誤:', error);

    // 針對 JWT 的特定錯誤回傳更精確的訊息
    if (error.name === 'JsonWebTokenError') {
      return response.status(403).json({ message: '無效的 Token。' });
    }
    if (error.name === 'TokenExpiredError') {
      return response.status(403).json({ message: 'Token 已過期，請重新登入。' });
    }

    // 其他一般錯誤
    return response.status(500).json({ message: "條碼計算失敗: " + error.message });
  }
}