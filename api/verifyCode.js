// 檔案路徑: /api/verifyCode.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { account, code } = request.body;

    if (!account || !code) {
      return response.status(400).json({ message: '缺少帳號或驗證碼。' });
    }

    // 1. 從資料庫中找到對應帳號的使用者資料
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('verify_code, verify_expires, is_verified')
      .eq('account', account)
      .single();

    if (fetchError || !userData) {
      return response.status(404).json({ message: '找不到該帳號的註冊資料。' });
    }
    
    // 2. 檢查是否已經驗證過
    if (userData.is_verified) {
      return response.status(200).json({ success: true, message: '此帳號已經驗證過了。' });
    }

    // 3. 檢查驗證碼是否正確
    if (userData.verify_code !== code) {
      return response.status(400).json({ message: '驗證碼錯誤。' });
    }
    
    // 4. 檢查驗證碼是否已過期
    if (new Date() > new Date(userData.verify_expires)) {
      return response.status(400).json({ message: '驗證碼已過期，請重新註冊以獲取新碼。' });
    }

    // 5. 驗證成功！更新資料庫
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        is_verified: true,      // 將驗證狀態設為 true
        current_quota: 20,      // 給予初始額度
        verify_code: null,      // 清除已使用過的驗證碼
        verify_expires: null    // 清除已使用過的過期時間
      })
      .eq('account', account);

    if (updateError) {
      throw updateError;
    }
    
    // 6. 回傳成功訊息
    return response.status(200).json({ success: true });

  } catch (error) {
    console.error('驗證碼 API 錯誤:', error);
    return response.status(500).json({ message: error.message });
  }
}