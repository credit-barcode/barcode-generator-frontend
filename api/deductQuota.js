// 檔案路徑: /api/deductQuota.js

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// 讀取 Vercel 環境變數並初始化服務
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const JWT_SECRET = process.env.JWT_SECRET;

// 這是 Vercel Serverless Function 的標準寫法
export default async function handler(request, response) {
  // 步驟 0: 檢查請求方法，只允許 POST
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // 步驟 1: 驗證使用者 JWT Token，確保只有登入的使用者可以操作
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) {
        return response.status(401).json({ message: '未提供授權 Token。' });
    }
    const decodedUser = jwt.verify(token, JWT_SECRET);
    const userId = decodedUser.userId; // 從解密的 Token 中獲取使用者 ID

    // 步驟 2: 從請求主體中獲取要扣除的數量和請求 ID
    const { countToDeduct, requestKey } = request.body;
    
    // 步驟 3: 驗證參數的有效性
    if (!countToDeduct || countToDeduct <= 0) {
        return response.status(400).json({ message: '無效的扣除數量。' });
    }
    if (!requestKey) {
        return response.status(400).json({ message: '缺少請求 ID (requestKey)。' });
    }
    
    // 步驟 4: 從資料庫獲取使用者當前額度和最後一次的請求 ID
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('current_quota, last_request_id')
      .eq('id', userId)
      .single();
    
    if (fetchError || !userData) {
      return response.status(404).json({ message: '找不到使用者資料。' });
    }

    // 步驟 5: 【核心安全邏輯】檢查請求的唯一性，防止重複扣款
    if (userData.last_request_id === requestKey) {
      // 如果這次傳來的 requestKey 和資料庫裡儲存的最後一個 key 相同，
      // 代表這是對同一次產生的條碼的重複下載請求。
      console.log(`偵測到重複的扣款請求 (Key: ${requestKey})，已略過實際扣款。`);
      
      // 我們直接回傳成功，並附上使用者當前的額度，但【不執行】任何資料庫更新操作。
      return response.status(200).json({ success: true, newQuota: userData.current_quota });
    }

    // 步驟 6: 檢查額度是否足夠
    const currentQuota = userData.current_quota;
    if (currentQuota < countToDeduct) {
      return response.status(400).json({ message: `額度不足！剩餘 ${currentQuota} 張，需要 ${countToDeduct} 張。` });
    }

    // 步驟 7: 計算新額度並更新資料庫
    const newQuota = currentQuota - countToDeduct;
    
    // 【核心安全邏輯】在更新額度的同時，將這次新的 requestKey 寫入資料庫
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        current_quota: newQuota,
        last_request_id: requestKey // 將這次成功的請求 ID 記錄下來
      })
      .eq('id', userId);

    if (updateError) {
        throw updateError;
    }

    // 步驟 8: 回傳成功訊息和最新的額度
    return response.status(200).json({ success: true, newQuota: newQuota });

  } catch (error) {
    // 步驟 9: 統一的錯誤處理
    console.error('扣除額度 API 錯誤:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return response.status(403).json({ message: '無效或過期的 Token。' });
    }
    return response.status(500).json({ message: error.message });
  }
}