// 檔案路徑: /api/login.js

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken'; // 匯入 jsonwebtoken 函式庫

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = process.env.JWT_SECRET; // 讀取我們設定的 JWT 密鑰

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

    if (userError || !userData || userData.password !== password) {
      return response.status(401).json({ message: '帳號或密碼錯誤。' });
    }

    // ... (更新登入資訊的程式碼保持不變) ...
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
    
    // ▼▼▼ 【核心新增】產生 JWT Token ▼▼▼
    // 我們將使用者的 id 和 account 作為 Token 的 payload (內容)
    // 設定 Token 的有效期限為 1 小時 (expiresIn: '1h')
    const token = jwt.sign(
      { userId: userData.id, account: userData.account }, 
      JWT_SECRET, 
      { expiresIn: '1h' }
    );
    // ▲▲▲ 【核心新增】 ▲▲▲

    // 在回傳的資料中，附上這個 token
    return response.status(200).json({ success: true, profile: userProfile, token: token });

  } catch (error) {
    console.error('登入 API 錯誤:', error);
    return response.status(500).json({ message: error.message });
  }
}