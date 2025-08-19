// 檔案路徑: /api/deductQuota.js
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // 1. 驗證使用者 JWT Token
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) {
      return response.status(401).json({ message: '未提供授權 Token。' });
    }
    const decodedUser = jwt.verify(token, JWT_SECRET);
    const userId = decodedUser.userId;

    // 2. 獲取要扣除的數量
    const { countToDeduct } = request.body;
    if (!countToDeduct || countToDeduct <= 0) {
      return response.status(400).json({ message: '無效的扣除數量。' });
    }
    
    // 3. 從資料庫獲取使用者當前額度
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('current_quota')
      .eq('id', userId)
      .single();
    
    if (fetchError || !userData) {
      return response.status(404).json({ message: '找不到使用者資料。' });
    }

    // 4. 檢查額度是否足夠
    const currentQuota = userData.current_quota;
    if (currentQuota < countToDeduct) {
      return response.status(400).json({ message: `額度不足！剩餘 ${currentQuota} 張，需要 ${countToDeduct} 張。` });
    }

    // 5. 計算新額度並更新資料庫
    const newQuota = currentQuota - countToDeduct;
    const { error: updateError } = await supabase
      .from('users')
      .update({ current_quota: newQuota })
      .eq('id', userId);

    if (updateError) throw updateError;

    // 6. 回傳成功訊息和最新的額度
    return response.status(200).json({ success: true, newQuota: newQuota });

  } catch (error) {
    console.error('扣除額度 API 錯誤:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return response.status(403).json({ message: '無效或過期的 Token。' });
    }
    return response.status(500).json({ message: error.message });
  }
}