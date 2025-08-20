// 檔案路徑: /api/login.js

// 從 Supabase、jsonwebtoken 和 bcryptjs 函式庫中匯入必要的工具
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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
    // 步驟 1: 從前端請求的 body 中獲取使用者提交的登入資料
    const { account, password } = request.body;

    // 步驟 2: 驗證輸入資料的完整性
    if (!account || !password) {
      return response.status(400).json({ message: '帳號和密碼不能為空。' });
    }

    // 步驟 3: 從 'users' 資料表中，根據帳號尋找對應的使用者資料
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*') // 獲取所有欄位資料，以便後續使用
      .eq('account', account) // 條件是 account 欄位等於傳入的 account
      .single(); // .single() 確保只回傳一筆或零筆

    // 步驟 4: 處理查詢結果
    // 如果查詢出錯，或者根本找不到這個帳號的使用者
    if (userError || !userData) {
      // 為了安全，不提示「找不到帳號」，而是回傳一個通用的錯誤訊息
      return response.status(401).json({ message: '帳號或密碼錯誤。' });
    }

    // 步驟 5: 【核心安全升級】使用 bcrypt.compare 進行密碼比對
    // 這個函式會安全地比較使用者輸入的【原始密碼】(password) 
    // 和資料庫中儲存的【雜湊密碼】(userData.password)。
    // 它會自動處理加密和比對過程，回傳 true 或 false。
    const isPasswordMatch = await bcrypt.compare(password, userData.password);

    // 如果密碼比對失敗
    if (!isPasswordMatch) {
      return response.status(401).json({ message: '帳號或密碼錯誤。' });
    }

    // 步驟 6: 檢查使用者的信箱是否已驗證
    if (userData.is_verified !== true) {
      // 如果 is_verified 欄位不是 true，就回傳 403 Forbidden 錯誤
      return response.status(403).json({ 
        success: false,
        reason: 'unverified', 
        message: '此帳號尚未完成信箱驗證。' 
      });
    }
    
    // --- 只有密碼正確且信箱已驗證的使用者才能繼續執行以下步驟 ---

    // 步驟 7: 登入成功，更新「最後登入時間」和「登入次數」
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        last_login: new Date().toISOString(), // 更新為現在的時間
        login_count: (userData.login_count || 0) + 1 
      })
      .eq('id', userData.id);

    if (updateError) {
      // 如果更新失敗，這不是一個阻斷性錯誤。我們在後台記錄它，但仍然讓使用者繼續登入。
      console.error('更新登入資訊失敗:', updateError);
    }
    
    // 步驟 8: 準備要回傳給前端的使用者個人資料
    // 為了安全，我們絕不能將整個 userData (包含密碼雜湊) 回傳
    // 只挑選必要且安全的資訊回傳
    const userProfile = {
        account: userData.account,
        email: userData.email,
        current_quota: userData.current_quota,
        register_date: userData.register_date,
        last_modified: userData.last_modified
    };
    
    // 步驟 9: 產生 JWT Token 作為使用者的登入憑證
    // 我們將使用者的 id 和 account 作為 Token 的內容 (payload)
    // 並設定 Token 的有效期限為 1 小時 (expiresIn: '1h')
    const token = jwt.sign(
      { userId: userData.id, account: userData.account }, 
      JWT_SECRET, 
      { expiresIn: '1h' }
    );
    
    // 步驟 10: 回傳最終的成功結果，包含使用者資料和 Token
    return response.status(200).json({ success: true, profile: userProfile, token: token });

  } catch (error) {
    // 統一的錯誤處理區塊
    console.error('登入 API 錯誤:', error);
    return response.status(500).json({ message: error.message });
  }
}