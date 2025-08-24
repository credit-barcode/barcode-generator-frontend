// 檔案路徑: /api/admin/index.js

import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js'; // 匯入我們共用的管理員驗證函式

// 初始化 Supabase 連線
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 這是 Vercel Serverless Function 的標準寫法
export default async function handler(request, response) {
  try {
    // 步驟 1: 所有進入此端點的請求，都必須先通過管理員身份驗證
    // verifyAdmin 會檢查 JWT Token 並確認 role 是否為 'admin'
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

      if (fetchError) {
          throw fetchError;
      }
      return response.status(200).json(users);

    } else if (request.method === 'POST') {
      // 如果是 POST 請求，就執行「更新使用者資料」的邏輯
      const usersDataToUpdate = request.body;
      
      if (!Array.isArray(usersDataToUpdate) || usersDataToUpdate.length === 0) {
        return response.status(400).json({ message: '未提供有效的更新資料。' });
      }

      // ▼▼▼ 【核心安全修正】使用 Promise.all 搭配 .update() 進行精確更新 ▼▼▼
      // 我們不再使用 .upsert()，因為它可能會意外地將未提供的欄位設為 NULL。
      // 我們為每一筆要更新的資料建立一個獨立的 update Promise。
      const updatePromises = usersDataToUpdate.map(user => {
        // 從前端傳來的每一筆 user 資料中，只取出我們要讓管理員修改的欄位
        const { id, permission, current_quota, reset_quota } = user;
        
        // 確保 id 存在，這是更新的依據
        if (!id) {
          // 在批次操作中，如果有一筆資料格式錯誤，最好是全部都不要執行
          throw new Error('更新資料中缺少使用者 ID。');
        }
        
        // 呼叫 .update() 方法，只精確地更新指定的這三個欄位
        // 這樣就不會動到 account, password 等其他必填欄位
        return supabase
          .from('users')
          .update({
            permission: permission,
            current_quota: current_quota,
            reset_quota: reset_quota
          })
          .eq('id', id); // 根據 id 找到要更新的特定使用者
      });

      // 等待所有的更新 Promise 都執行完成
      const results = await Promise.all(updatePromises);
      
      // 檢查是否有任何一個更新操作在過程中失敗
      results.forEach(result => {
        if (result.error) {
          // 如果有任何一個 Supabase 操作出錯，就將錯誤拋出來，讓外層的 catch 捕捉
          throw result.error;
        }
      });
      // ▲▲▲ 【核心安全修正】 ▲▲▲
      
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