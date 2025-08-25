// 檔案路徑: /api/admin/serials.js

import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js'; // 匯入我們共用的管理員驗證函式

// 初始化 Supabase 連線
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 這是 Vercel Serverless Function 的標準寫法
export default async function handler(request, response) {
  try {
    // 步驟 1: 所有進入此端點的請求，都必須先通過管理員身份驗證
    const { user, error: authError } = await verifyAdmin(request.headers);
    if (authError) {
      // 如果驗證失敗，回傳對應的錯誤狀態碼和訊息
      return response.status(authError.status).json({ message: authError.message });
    }

    // --- 只有通過驗證的管理員才能執行以下的程式碼 ---
    
    // 步驟 2: 建立一個「路由器 (Router)」，根據請求的 HTTP 方法來決定執行哪個邏輯
    if (request.method === 'GET') {
      // 如果是 GET 請求，就執行「獲取所有註冊碼列表」的邏輯
      
      const { data, error } = await supabase
        .from('serials')
        .select('*') // 獲取所有欄位
        .order('created_at', { ascending: false }); // 按建立時間倒序排列

      if (error) {
        // 如果資料庫查詢出錯，拋出錯誤
        throw error;
      }
      // 成功，回傳狀態碼 200 和註冊碼列表的 JSON 資料
      return response.status(200).json(data);

    } else if (request.method === 'POST') {
      // 如果是 POST 請求，就執行「更新/儲存所有註冊碼」的邏輯
      
      const serialsData = request.body;
      
      // 進行基本的資料驗證
      if (!Array.isArray(serialsData)) {
        return response.status(400).json({ message: '未提供有效的更新資料（格式應為陣列）。' });
      }

      // 為了安全地同步前端的列表狀態（包括新增、修改、刪除），
      // 我們採用一個簡潔有效的策略：「先全部刪除，再全部重新插入」。
      // 注意：這個策略適用於註冊碼數量不多的情況。如果未來註冊碼數量極大，需要改用更精細的 upsert 策略。
      
      // 1. 刪除 'serials' 表中所有現有的註冊碼
      const { error: deleteError } = await supabase
        .from('serials')
        .delete()
        .neq('id', 0); // 這裡是一個小技巧，刪除所有 id 不等於 0 的記錄，等同於清空表格

      if (deleteError) {
        throw deleteError;
      }

      // 2. 如果前端傳來的列表不是空的，就將所有新的註冊碼資料全部插入
      if (serialsData.length > 0) {
        // 在插入前，先清理一次資料，確保只包含資料庫需要的欄位
        const cleanData = serialsData.map(({ serial_code, total_limit, used_count }) => ({
          serial_code,
          total_limit,
          used_count
        }));

        const { error: insertError } = await supabase
          .from('serials')
          .insert(cleanData);

        if (insertError) {
          // 如果插入過程中發生錯誤（例如，有重複的 serial_code 且您設定了唯一性約束），就拋出錯誤
          throw insertError;
        }
      }
      
      // 所有操作成功，回傳成功訊息
      return response.status(200).json({ success: true, message: '註冊碼儲存成功！' });
    
    } else {
      // 如果是其他方法 (例如 PUT, DELETE)，則回報不支援此方法
      response.setHeader('Allow', ['GET', 'POST']);
      return response.status(405).json({ message: `不支援此請求方法：${request.method}` });
    }

  } catch (error) {
    // 步驟 3: 統一處理所有可能發生的錯誤
    console.error('註冊碼管理 API 錯誤:', error);
    return response.status(500).json({ message: `註冊碼管理 API 發生錯誤：${error.message}` });
  }
}