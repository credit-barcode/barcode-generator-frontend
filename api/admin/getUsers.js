// 檔案路徑: /api/admin/getUsers.js

import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js'; // 匯入我們剛剛建立的管理員驗證函式

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  // 我們只允許 GET 請求，因為這個 API 只用來獲取資料
  if (request.method !== 'GET') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // 步驟 1: 【安全防護】呼叫 verifyAdmin 進行權限驗證
    const { user, error: authError } = await verifyAdmin(request.headers);
    if (authError) {
      return response.status(authError.status).json({ message: authError.message });
    }

    // --- 只有管理員才能執行以下的程式碼 ---

    // 步驟 2: 從 Supabase 查詢所有使用者資料
    // 我們只挑選需要在管理後台顯示的欄位，避免傳輸過多敏感資訊
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, account, email, login_count, last_login, current_quota, reset_quota, register_date, is_verified, is_admin')
      .order('created_at', { ascending: false }); // 按建立時間倒序排列

    if (fetchError) {
      throw fetchError;
    }

    // 步驟 3: 成功，回傳使用者列表
    return response.status(200).json(users);

  } catch (error) {
    console.error('獲取使用者列表 API 錯誤:', error);
    return response.status(500).json({ message: error.message });
  }
}