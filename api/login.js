// 檔案路徑: /api/login.js (安全強化版)

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
    const { account, password } = request.body;

    if (!account || !password) {
      return response.status(400).json({ message: '帳號和密碼不能為空。' });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('account', account)
      .single();

    if (userError || !userData) {
      return response.status(401).json({ message: '帳號或密碼錯誤。' });
    }

    const isPasswordMatch = (userData.password === password);

    if (!isPasswordMatch) {
      return response.status(401).json({ message: '帳號或密碼錯誤。' });
    }

// ▼▼▼ 【核心修正】啟用信箱驗證檢查 ▼▼▼
    if (userData.is_verified !== true) {
      // 如果 is_verified 欄位不是 true，就回傳 403 Forbidden 錯誤
      // reason: 'unverified' 這個欄位是為了讓前端可以做特殊處理
      return response.status(403).json({ 
        success: false, 
        reason: 'unverified', 
        message: '此帳號尚未完成信箱驗證。' 
      });
    }
    // ▲▲▲ 【核心修正】 ▲▲▲

    // --- 只有驗證通過的使用者才能繼續執行以下步驟 ---

    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        last_login: new Date().toISOString(),
        login_count: (userData.login_count || 0) + 1 
      })
      .eq('id', userData.id);

    if (updateError) {
      console.error('更新登入資訊失敗:', updateError);
    }
    
    const userProfile = {
        account: userData.account,
        email: userData.email,
        current_quota: userData.current_quota,
    };
    
    const token = jwt.sign(
      { userId: userData.id, account: userData.account }, 
      JWT_SECRET, 
      { expiresIn: '1h' }
    );
    
    return response.status(200).json({ success: true, profile: userProfile, token: token });

  } catch (error) {
    console.error('登入 API 錯誤:', error);
    return response.status(500).json({ message: error.message });
  }
}