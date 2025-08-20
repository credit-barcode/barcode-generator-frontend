// 檔案路徑: /api/admin/updateUsers.js (最終安全版)

import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    const { user, error: authError } = await verifyAdmin(request.headers);
    if (authError) {
      return response.status(authError.status).json({ message: authError.message });
    }
    
    const usersDataToUpdate = request.body;
    if (!Array.isArray(usersDataToUpdate) || usersDataToUpdate.length === 0) {
      return response.status(400).json({ message: '未提供有效的更新資料。' });
    }

    // ▼▼▼ 【核心修正】使用 Promise.all 搭配 .update() 進行精確更新 ▼▼▼
    // 我們不再使用 .upsert()，而是為每一筆要更新的資料建立一個獨立的 update Promise
    const updatePromises = usersDataToUpdate.map(user => {
      // 從前端傳來的資料中，只取出我們要讓管理員修改的欄位
      const { id, permission, current_quota, reset_quota } = user;
      
      // 確保 id 存在
      if (!id) {
        throw new Error('更新資料中缺少使用者 ID。');
      }
      
      // 呼叫 .update() 方法，只更新指定的欄位
      return supabase
        .from('users')
        .update({
          permission: permission,
          current_quota: current_quota,
          reset_quota: reset_quota
        })
        .eq('id', id); // 根據 id 找到要更新的特定使用者
    });

    // 等待所有的更新 Promise 都完成
    const results = await Promise.all(updatePromises);
    
    // 檢查是否有任何一個更新操作失敗
    results.forEach(result => {
      if (result.error) {
        throw result.error; // 如果有錯，就拋出來
      }
    });
    // ▲▲▲ 【核心修正】 ▲▲▲
    
    return response.status(200).json({ success: true, message: '使用者資料儲存成功！' });

  } catch (error) {
    console.error('更新使用者資料 API 錯誤:', error);
    return response.status(500).json({ message: "儲存失敗：" + error.message });
  }
}