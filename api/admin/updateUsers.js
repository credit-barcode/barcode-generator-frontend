// 檔案路徑: /api/admin/updateUsers.js

import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js'; // 再次使用我們共用的管理員驗證函式

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  // 這個 API 只接受 POST 請求來更新資料
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // 步驟 1: 【安全防護】驗證請求者是否為管理員
    const { user, error: authError } = await verifyAdmin(request.headers);
    if (authError) {
      return response.status(authError.status).json({ message: authError.message });
    }

    // --- 只有管理員才能執行以下的程式碼 ---
    
    // 步驟 2: 從前端獲取要更新的使用者資料陣列
    const usersDataToUpdate = request.body;
    
    if (!Array.isArray(usersDataToUpdate) || usersDataToUpdate.length === 0) {
      return response.status(400).json({ message: '未提供有效的更新資料。' });
    }

    // 步驟 3: 使用 Supabase 的 .upsert() 方法來批次更新資料
    // .upsert() 是一個很強大的功能，如果資料存在就更新，不存在就新增。
    // 在這裡，我們用它來根據 'id' 欄位，一次性更新多筆使用者資料。
    const { data, error: updateError } = await supabase
      .from('users')
      .upsert(usersDataToUpdate, { onConflict: 'id' }); // 指定 'id' 作為判斷衝突的欄位

    if (updateError) {
      throw updateError;
    }
    
    // 步驟 4: 成功，回傳成功訊息
    return response.status(200).json({ success: true, message: '使用者資料儲存成功！' });

  } catch (error) {
    console.error('更新使用者資料 API 錯誤:', error);
    return response.status(500).json({ message: "儲存失敗：" + error.message });
  }
}