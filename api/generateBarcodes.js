// 檔案路徑: /api/generateBarcodes.js

import jwt from 'jsonwebtoken';

// 讀取我們在 Vercel 中設定好的 JWT 安全密鑰
const JWT_SECRET = process.env.JWT_SECRET;

// --- 核心演算法輔助函式 (完整版) ---

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
    // 步驟 1: 驗證 JWT Token，確保只有登入的使用者可以存取
    const authHeader = request.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
      return response.status(401).json({ message: '未提供授權 Token。' });
    }

    const decodedUser = jwt.verify(token, JWT_SECRET);
    request.user = decodedUser;

    // 步驟 2: 從請求主體中獲取所有參數，包括 requestKey
    const params = request.body;
    const { 
      firstBarcode, 
      secondBarcode, 
      paymentDue, 
      barcodeType, 
      qrCount, 
      incrementAmount, 
      paymentAmount,
      requestKey // 接收前端產生的請求 ID
    } = params;
    
    // 步驟 3: 基本的參數驗證
    if (!firstBarcode || !secondBarcode || !paymentDue || !barcodeType || !qrCount || !requestKey) {
      return response.status(400).json({ message: "缺少必要的條碼或請求參數。" });
    }

    const initialAmount = parseInt(paymentAmount, 10);
    if (initialAmount < 5) {
      return response.status(400).json({ message: "繳費金額最低只能設定 5 元。" });
    }
    
    // 步驟 4: 執行核心的條碼演算法
    let allData = [];
    let currentDate = rocStringToDate_(paymentDue);
    const convertedFirst = convertLettersToNumbers_(firstBarcode);
    const convertedSecond = convertLettersToNumbers_(secondBarcode);
    let currentCycleAmount = initialAmount;

    for (let i = 0; i < qrCount; i++) {
      const paddedAmount = String(currentCycleAmount).padStart(9, "0");
      const rocString = dateToRocString_(currentDate);
      let datePart;

      if (barcodeType === "YYMM") {
        datePart = rocString.substring(0, 4);
      } else {
        datePart = rocString.substring(2, 6);
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

      currentCycleAmount += (incrementAmount || 0); // 確保 incrementAmount 存在

      if (barcodeType === "YYMM") {
        currentDate.setMonth(currentDate.getMonth() + 1);
      } else {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    
    // 步驟 5: 成功，回傳一個包含條碼資料陣列和請求 ID 的物件
    return response.status(200).json({
      barcodes: allData,
      requestKey: requestKey 
    });

  } catch (error) {
    // 步驟 6: 統一的錯誤處理
    console.error('產生條碼 API 錯誤:', error);

    if (error.name === 'JsonWebTokenError') {
      return response.status(403).json({ message: '無效的 Token。' });
    }
    if (error.name === 'TokenExpiredError') {
      return response.status(403).json({ message: 'Token 已過期，請重新登入。' });
    }

    return response.status(500).json({ message: "條碼計算失敗: " + error.message });
  }
}