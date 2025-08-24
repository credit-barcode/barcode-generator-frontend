// 檔案路徑: /api/admin/index.js

import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js'; // 匯入我們共用的管理員驗證函式

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  try {
    // 步驟 1: 所有進入此端點的請求，都必須先通過管理員身份驗證
    const { user, error: authError } = await verifyAdmin(request.headers);
    if (authError) {
      return response.status(authError.status).json({ message: authError.message });
    }

    // --- 只有通過驗證的管理員才能執行以下的程式碼 ---
    
    // 步驟 2: 建立一個「路由器 (Router)」，根據請求的 HTTP 方法來決定執行哪個邏輯
    if (request.method === 'GET') {
      // 如果是 GET 請求，就執行「獲取所有使用者列表」的邏輯
      const { data: users, error: fetchError } = await supabase
        .from('users')
        .select('id, account, email, login_count, last_login, current_quota, reset_quota, register_date, is_verified, is_admin, permission')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      return response.status(200).json(users);

    } else if (request.method === 'POST') {
      // 如果是 POST 請求，就執行「更新使用者資料」的邏輯
      const usersDataToUpdate = request.body;
      if (!Array.isArray(usersDataToUpdate) || usersDataToUpdate.length === 0) {
        return response.status(400).json({ message: '未提供有效的更新資料。' });
      }

      const { data, error: updateError } = await supabase
        .from('users')
        .upsert(usersDataToUpdate, { onConflict: 'id' }); // 使用 upsert 來批次更新
      
      if (updateError) throw updateError;
      return response.status(200).json({ success: true, message: '使用者資料儲存成功！' });
    
    } else {
      // 如果是其他方法 (例如 PUT, DELETE)，則回報不支援此方法
      response.setHeader('Allow', ['GET', 'POST']);
      return response.status(405).json({ message: `Method ${request.method} Not Allowed` });
    }

  } catch (error) {
    console.error('管理員 API 錯誤:', error);
    return response.status(500).json({ message: "管理員 API 發生錯誤：" + error.message });
  }
}