// 檔案路徑: /api/admin/updateUsers.js
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    const { error: authError } = await verifyAdmin(request.headers);
    if (authError) return response.status(authError.status).json({ message: authError.message });
    
    const usersDataToUpdate = request.body;
    if (!Array.isArray(usersDataToUpdate)) {
      return response.status(400).json({ message: '未提供有效的更新資料。' });
    }

    const updatePromises = usersDataToUpdate.map(user => {
      const { id, permission, current_quota, reset_quota } = user;
      if (!id) throw new Error('更新資料中缺少使用者 ID。');
      return supabase
        .from('users')
        .update({ permission, current_quota, reset_quota })
        .eq('id', id);
    });
    
    const results = await Promise.all(updatePromises);
    results.forEach(result => { if (result.error) throw result.error; });
    
    return response.status(200).json({ success: true, message: '使用者資料儲存成功！' });
  } catch (error) {
    return response.status(500).json({ message: "儲存失敗: " + error.message });
  }
}