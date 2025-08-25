// 檔案路徑: /api/admin/users.js
// 處理所有 /api/admin/users 的請求
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  const { user, error } = await verifyAdmin(request.headers);
  if (error) return response.status(error.status).json({ message: error.message });

  if (request.method === 'GET') {
    const { data, error: fetchError } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    if (fetchError) return response.status(500).json({ message: fetchError.message });
    return response.status(200).json(data);
  } else if (request.method === 'POST') {
    const users = request.body;

    // 檢查是否為陣列
    if (!Array.isArray(users)) {
      return response.status(400).json({ message: '請求資料必須為陣列。' });
    }

    const errors = [];

    for (const user of users) {
      const { id, ...updateFields } = user;

      if (!id) {
        errors.push({ id, message: '缺少 id' });
        continue;
      }

      const { error: updateError } = await supabase.from('users').update(updateFields).eq('id', id);
      if (updateError) {
        errors.push({ id, message: updateError.message });
      }
    }

    if (errors.length > 0) {
      return response.status(400).json({ message: '部分更新失敗', errors });
    }

    return response.status(200).json({ success: true });
  } else {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }
}
