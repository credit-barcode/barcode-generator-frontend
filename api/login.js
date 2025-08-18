// 檔案路徑: /api/login.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { account, password } = request.body;

    // 1. 驗證輸入
    if (!account || !password) {
      return response.status(400).json({ message: '帳號和密碼不能為空。' });
    }

    // 2. 從資料庫中尋找使用者
    // 我們同時在 'users' 和 'admins' (如果未來有) 表中尋找
    // 這裡我們先專注於 'users' 表
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*') // 獲取所有欄位資料
      .eq('account', account) // 條件是 account 欄位等於傳入的 account
      .single(); // .single() 確保只回傳一筆或零筆

    // 3. 處理查詢結果
    if (userError || !userData) {
      // 如果找不到使用者或查詢出錯，都回傳通用錯誤訊息以策安全
      return response.status(401).json({ message: '帳號或密碼錯誤。' });
    }

    // 4. 比對密碼
    // TODO: 密碼安全升級
    // 未來這裡應該要比對雜湊後的密碼 (bcrypt.compare)
    // 目前我們先直接比對明文密碼
    const isPasswordMatch = (userData.password === password);

    if (!isPasswordMatch) {
      return response.status(401).json({ message: '帳號或密碼錯誤。' });
    }

    // 5. TODO: 處理信箱尚未驗證的情況
    // if (!userData.is_verified) {
    //   return response.status(403).json({ reason: 'unverified', message: '此帳號尚未完成信箱驗證。' });
    // }

    // 6. 登入成功，更新「最後登入時間」和「登入次數」
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        last_login: new Date().toISOString(), // 更新為現在的時間
        login_count: (userData.login_count || 0) + 1 
      })
      .eq('id', userData.id);

    if (updateError) {
      // 如果更新失敗，仍在後台記錄錯誤，但讓使用者繼續登入
      console.error('更新登入資訊失敗:', updateError);
    }
    
    // 7. 準備回傳給前端的使用者資料
    // 為了安全，我們絕不能將整個 userData (包含密碼) 回傳
    // 只挑選必要且安全的資訊回傳
    const userProfile = {
        account: userData.account,
        email: userData.email,
        current_quota: userData.current_quota,
        // ... 其他您希望前端知道的、安全的資訊
    };
    
    // TODO: 產生 JWT Token
    // 未來這裡會產生一個有時效性的 JWT Token 回傳給前端

    return response.status(200).json({ success: true, profile: userProfile });

  } catch (error) {
    console.error('登入 API 錯誤:', error);
    return response.status(500).json({ message: error.message });
  }
}