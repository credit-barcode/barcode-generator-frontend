// 檔案路徑: /api/generateBarcodes.js

// --- 核心演算法輔助函式 (從 Code.gs 完整移植) ---

function rocStringToDate_(rocDateStr) {
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
  // 注意：根據舊邏輯，這裡似乎只需要 YYMMDD 中的 YYMM 或 MMDD
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
    const params = request.body;
    
    // TODO: 驗證登入狀態 (JWT Token)
    // 在正式版中，我們需要先驗證使用者是否已登入，才能允許他們產生條碼。
    // if (!validateToken(params.token)) {
    //   return response.status(401).json({ message: "授權無效，請重新登入。" });
    // }

    const { firstBarcode, secondBarcode, paymentDue, barcodeType, qrCount, incrementAmount } = params;
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
      let datePart;
      const rocString = dateToRocString_(currentDate); // YYMMDD

      if (barcodeType === "YYMM") {
        datePart = rocString.substring(0, 4); // YYMM
      } else {
        datePart = rocString.substring(2, 6); // MMDD
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

      if (barcodeType === "YYMM") {
        currentDate.setMonth(currentDate.getMonth() + 1);
      } else {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    
    // 成功，回傳包含所有條碼資料的陣列
    return response.status(200).json(allData);

  } catch (error) {
    console.error('產生條碼 API 錯誤:', error);
    return response.status(500).json({ message: "條碼計算失敗: " + error.message });
  }
}