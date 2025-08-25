// 檔案路徑: /api/admin/serials.js

import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js'; // 繼續使用我們共用的管理員驗證函式

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  try {
    // 步驟 1: 驗證管理員權限
    const { user, error: authError } = await verifyAdmin(request.headers);
    if (authError) {
      return response.status(authError.status).json({ message: authError.message });
    }

    // --- 只有管理員才能執行以下的程式碼 ---
    
    // 步驟 2: 根據請求方法進行路由
    if (request.method === 'GET') {
      // 處理「獲取所有註冊碼」的請求
      const { data, error } = await supabase
        .from('serials')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return response.status(200).json(data);

    } else if (request.method === 'POST') {
      // 處理「更新/儲存所有註冊碼」的請求
      const serialsDataToUpdate = request.body;
      if (!Array.isArray(serialsDataToUpdate)) {
        return response.status(400).json({ message: '未提供有效的更新資料。' });
      }

      // 為了安全地處理新增和刪除，我們先刪除所有舊的，再全部重新插入
      // 注意：這是一個簡化的策略，適用於註冊碼數量不多的情況
      
      // 1. 刪除所有現有的註冊碼
      const { error: deleteError } = await supabase
        .from('serials')
        .delete()
        .neq('id', 0); // 刪除所有 id 不等於 0 的記錄

      if (deleteError) throw deleteError;

      // 2. 插入前端傳來的所有新的註冊碼資料
      // 我們需要過濾掉 id, created_at 這些由資料庫自動產生的欄位
      const cleanSerialsData = serialsDataToUpdate.map(({ serial_code, total_limit, used_count }) => ({
        serial_code,
        total_limit,
        used_count
      }));
      
      if (cleanSerialsData.length > 0) {
        const { error: insertError } = await supabase
          .from('serials')
          .insert(cleanSerialsData);
        if (insertError) throw insertError;
      }
      
      return response.status(200).json({ success: true, message: '註冊碼儲存成功！' });
    
    } else {
      return response.status(405).json({ message: 'Method Not Allowed' });
    }

  } catch (error) {
    console.error('註冊碼管理 API 錯誤:', error);
    return response.status(500).json({ message: "註冊碼管理 API 發生錯誤：" + error.message });
  }
}