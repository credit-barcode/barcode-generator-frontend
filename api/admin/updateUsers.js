// 檔案路徑: /api/admin/updateUsers.js (最終修正版)

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

    const { data, error: updateError } = await supabase
      .from('users')
      // Supabase 的 .upsert() 會自動匹配物件中的 key 與資料表的欄位名稱
      // 因為我們的前端 saveUsersByAdmin 已經修正為傳送 'permission'，所以這裡無需修改
      .upsert(usersDataToUpdate, { onConflict: 'id' });

    if (updateError) {
      throw updateError;
    }
    
    return response.status(200).json({ success: true, message: '使用者資料儲存成功！' });

  } catch (error) {
    console.error('更新使用者資料 API 錯誤:', error);
    return response.status(500).json({ message: "儲存失敗：" + error.message });
  }
}