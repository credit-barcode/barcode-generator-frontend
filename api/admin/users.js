// 檔案路徑: /api/admin/users.js

import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js'; // 匯入我們共用的管理員驗證函式

// 初始化 Supabase 連線
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 這是 Vercel Serverless Function 的標準寫法
export default async function handler(request, response) {
  try {
    // 步驟 1: 所有進入此端點的請求，都必須先通過管理員身份驗證
    // verifyAdmin 會檢查 JWT Token 並確認 token payload 中的 role 是否為 'admin'
    const { user, error: authError } = await verifyAdmin(request.headers);
    if (authError) {
      // 如果驗證失敗，回傳對應的錯誤狀態碼和訊息
      return response.status(authError.status).json({ message: authError.message });
    }

    // --- 只有通過驗證的管理員才能執行以下的程式碼 ---
    
    // 步驟 2: 建立一個「路由器 (Router)」，根據請求的 HTTP 方法來決定執行哪個邏輯
    if (request.method === 'GET') {
      // 如果是 GET 請求，就執行「獲取所有使用者列表」的邏輯
      
      // 從 Supabase 的 'users' 資料表中查詢所有使用者資料
      // 我們只挑選需要在管理後台顯示的欄位，避免傳輸過多敏感資訊 (例如密碼)
      const { data: users, error: fetchError } = await supabase
        .from('users')
        .select('id, account, permission, current_quota, reset_quota, register_date')
        .order('created_at', { ascending: false }); // 按建立時間倒序排列，讓最新的使用者顯示在最上面

      if (fetchError) {
        // 如果資料庫查詢出錯，拋出錯誤，讓外層的 catch 捕捉
        throw fetchError;
      }
      // 成功，回傳狀態碼 200 和使用者列表的 JSON 資料
      return response.status(200).json(users);

    } else if (request.method === 'POST') {
      // 如果是 POST 請求，就執行「更新使用者資料」的邏輯
      
      // 從請求主體 (body) 中獲取前端傳來、要更新的使用者資料陣列
      const usersDataToUpdate = request.body;
      
      // 進行基本的資料驗證
      if (!Array.isArray(usersDataToUpdate)) {
        return response.status(400).json({ message: '未提供有效的更新資料（格式應為陣列）。' });
      }

      // 如果陣列是空的，雖然技術上沒錯，但可以視為無效請求
      if (usersDataToUpdate.length === 0) {
        return response.status(400).json({ message: '更新列表不可為空。'});
      }

      // 為每一筆要更新的資料建立一個獨立的 update Promise
      const updatePromises = usersDataToUpdate.map(user => {
        // 從前端傳來的每一筆 user 資料中，只取出我們要讓管理員修改的欄位
        const { id, permission, current_quota, reset_quota } = user;
        
        // 確保 id 存在，這是更新的依據
        if (!id) {
          throw new Error('更新資料中包含缺少使用者 ID 的項目。');
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
          // 如果有任何一個 Supabase 操作出錯，就將錯誤拋出來
          throw result.error;
        }
      });
      
      // 所有更新都成功，回傳成功訊息
      return response.status(200).json({ success: true, message: '使用者資料儲存成功！' });
    
    } else {
      // 如果是其他方法 (例如 PUT, DELETE)，則回報不支援此方法
      response.setHeader('Allow', ['GET', 'POST']);
      return response.status(405).json({ message: `不支援此請求方法：${request.method}` });
    }

  } catch (error) {
    // 步驟 3: 統一處理所有可能發生的錯誤（包括權限驗證、資料庫查詢/更新等）
    console.error('管理員使用者 API 錯誤:', error);
    return response.status(500).json({ message: `管理員 API 發生錯誤：${error.message}` });
  }
}
