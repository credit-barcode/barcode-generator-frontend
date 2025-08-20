// 檔案路徑: /api/admin/updateUsers.js (修正版)

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

    // ▼▼▼ 【核心修正】這裡不需要修改，因為前端會傳來正確的 key ▼▼▼
    // Supabase 的 .upsert() 會自動根據傳入的物件 key (例如 'permission') 去更新對應的欄位
    const { data, error: updateError } = await supabase
      .from('users')
      .upsert(usersDataToUpdate, { onConflict: 'id' });
    // ▲▲▲ 【核心修正】 ▲▲▲

    if (updateError) {
      throw updateError;
    }
    
    return response.status(200).json({ success: true, message: '使用者資料儲存成功！' });

  } catch (error) {
    console.error('更新使用者資料 API 錯誤:', error);
    return response.status(500).json({ message: "儲存失敗：" + error.message });
  }
}