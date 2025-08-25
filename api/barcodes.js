// 檔案路徑: /api/barcodes.js

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// 初始化 Supabase 和 JWT_SECRET
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
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


// --- 各個功能的獨立處理函式 ---

async function handleGenerateBarcodes(data) {
  const { firstBarcode, secondBarcode, paymentDue, barcodeType, qrCount, incrementAmount, paymentAmount, requestKey } = data;
  
  if (!firstBarcode || !secondBarcode || !paymentDue || !barcodeType || !qrCount || !requestKey) {
    throw new Error("缺少必要的條碼或請求參數。");
  }
  
  const initialAmount = parseInt(paymentAmount, 10);

  // 【核心新增】檢查繳費金額是否小於等於 0
  if (initialAmount <= 0) {
    throw new Error("本期帳單金額為 0 元，無需繳費，感謝您的使用。");
  }

  let allData = [];
  let currentDate = rocStringToDate_(paymentDue);
  const convertedFirst = convertLettersToNumbers_(firstBarcode);
  const convertedSecond = convertLettersToNumbers_(secondBarcode);
  let currentCycleAmount = initialAmount;

  for (let i = 0; i < qrCount; i++) {
    const paddedAmount = String(currentCycleAmount).padStart(9, "0");
    const rocString = dateToRocString_(currentDate);
    let datePart = (barcodeType === "YYMM") ? rocString.substring(0, 4) : rocString.substring(2, 6);

    const oddSum = calculateSum_(convertedFirst, true) + calculateSum_(convertedSecond, true) + calculateSum_(datePart + paddedAmount, true);
    const evenSum = calculateSum_(convertedFirst, false) + calculateSum_(convertedSecond, false) + calculateSum_(datePart + paddedAmount, false);
    const oddChecksum = getChecksumChar_(oddSum);
    const evenChecksum = getChecksumChar_(evenSum, true);
    const thirdBarcode = datePart + oddChecksum + evenChecksum + paddedAmount;
    
    allData.push({ serial: i + 1, barcodes: [firstBarcode, secondBarcode, thirdBarcode] });
    currentCycleAmount += (incrementAmount || 0);

    if (barcodeType === "YYMM") {
      currentDate.setMonth(currentDate.getMonth() + 1);
    } else {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  return { barcodes: allData, requestKey: requestKey };
}

async function handleDeductQuota(data, userId) {
  const { countToDeduct, requestKey } = data;
  if (!countToDeduct || countToDeduct <= 0) throw new Error('無效的扣除數量。');
  if (!requestKey) throw new Error('缺少請求 ID (requestKey)。');

  const { data: userData, error: fetchError } = await supabase.from('users').select('current_quota, last_request_id').eq('id', userId).single();
  if (fetchError || !userData) throw new Error('找不到使用者資料。');

  if (userData.last_request_id === requestKey) {
    console.log(`偵測到重複的扣款請求 (Key: ${requestKey})，已略過。`);
    return { success: true, newQuota: userData.current_quota };
  }

  const currentQuota = userData.current_quota;
  if (currentQuota < countToDeduct) throw new Error(`額度不足！剩餘 ${currentQuota} 張，需要 ${countToDeduct} 張。`);

  const newQuota = currentQuota - countToDeduct;
  const { error: updateError } = await supabase.from('users').update({ current_quota: newQuota, last_request_id: requestKey }).eq('id', userId);
  if (updateError) throw updateError;
  
  return { success: true, newQuota: newQuota };
}


// --- 主處理函式 (路由器) ---
export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // 步驟 1: 所有請求都先驗證 JWT Token
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) {
      return response.status(401).json({ message: '未提供授權 Token。' });
    }
    const decodedUser = jwt.verify(token, JWT_SECRET);

    // 步驟 2: 解析請求的 action 和資料
    const { action, ...data } = request.body;

    // 步驟 3: 根據 action 進行路由
    let result;
    switch (action) {
      case 'generate':
        result = await handleGenerateBarcodes(data);
        break;
      
      case 'deduct':
        // 將解密出的使用者 ID 傳遞給處理函式
        result = await handleDeductQuota(data, decodedUser.userId);
        break;
        
      default:
        return response.status(400).json({ message: '無效的操作 (action)。' });
    }
    return response.status(200).json(result);

  } catch (error) {
    console.error(`條碼 API 錯誤 (action: ${request.body.action}):`, error);
    
    // 【核心修正】讓後端能回傳 400 狀態碼給前端
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return response.status(403).json({ message: '無效或過期的 Token。' });
    }
    // 如果是我們自訂的 0 元錯誤，回傳 400 Bad Request
    if (error.message.includes("本期帳單金額為 0 元")) {
        return response.status(400).json({ message: error.message });
    }
    
    return response.status(500).json({ message: error.message });
  }
}